"""Core orchestration for downloading weekly retail prices PDFs."""
from __future__ import annotations

import atexit
import base64
import datetime as dt
from pathlib import Path
from typing import List, Optional, Sequence, Set, Tuple
from urllib.parse import urlparse

import requests

from weekly_retail_prices_browser import extract_max_pages, fetch_page_source, get_driver
from weekly_retail_prices_config import BASE_URL, LINKS_FILE, MYMARKETNEWS_HOST, OUT_DIR
from weekly_retail_prices_parser import parse_links
from weekly_retail_prices_state import (
    build_filename,
    format_date,
    prepend_links,
    read_last_date,
    scan_latest_date,
    scan_links_file,
    write_last_date,
)

STATE_KEY = "weekly_retail_dl"
_browser = None


def _download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    host = (urlparse(url).hostname or "").lower()
    if host == MYMARKETNEWS_HOST:
        destination.write_bytes(_browser_download(url))
        return

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    }
    with requests.get(url, headers=headers, timeout=60, stream=True) as response:
        response.raise_for_status()
        with open(destination, "wb") as handle:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    handle.write(chunk)


def _get_download_browser():
    global _browser
    if _browser is None:
        _browser = get_driver()
    return _browser


def _close_download_browser() -> None:
    global _browser
    if _browser is None:
        return
    try:
        _browser.quit()
    except Exception:
        pass
    _browser = None


atexit.register(_close_download_browser)


def _browser_download(url: str) -> bytes:
    driver = _get_download_browser()
    driver.get(BASE_URL)
    payload = driver.execute_async_script(
        """
const url = arguments[0];
const done = arguments[arguments.length - 1];
fetch(url)
  .then(async (res) => {
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    done({
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      body: btoa(binary),
    });
  })
  .catch((err) => done({ ok: false, error: String(err) }));
        """,
        url,
    )
    if not payload.get("ok"):
        raise RuntimeError(payload.get("error") or f"Browser fetch failed for {url}")
    data = base64.b64decode(payload["body"])
    content_type = (payload.get("contentType") or "").lower()
    if ("pdf" not in content_type) and (not data.startswith(b"%PDF")):
        raise RuntimeError(f"Not a PDF (Content-Type: {content_type or 'unknown'})")
    return data


def _collect_links(existing_urls: Set[str], cutoff_date: Optional[dt.date]) -> List[Tuple[dt.date, str]]:
    driver = get_driver()
    session_seen: Set[str] = set()
    collected: List[Tuple[dt.date, str]] = []

    try:
        max_pages: Optional[int] = None
        page = 0
        while True:
            if max_pages is not None and page >= max_pages:
                print(f"Reached last page ({max_pages}). Stopping.")
                break

            url = BASE_URL if page == 0 else f"{BASE_URL}&page={page}"
            print(f"Fetching page {page + 1}: {url}")
            html = fetch_page_source(driver, url)
            links = parse_links(html)
            print(f"  found {len(links)} pdf link(s)")
            if max_pages is None:
                max_pages = extract_max_pages(driver)
                if max_pages is not None:
                    print(f"  detected {max_pages} pages total")
            if not links:
                print("No report rows found on this page; stopping.")
                break

            newly_added = 0
            hit_overlap = False
            for date, href in links:
                if cutoff_date and date <= cutoff_date:
                    hit_overlap = True
                    continue
                if href in existing_urls or href in session_seen:
                    hit_overlap = True
                    continue
                collected.append((date, href))
                session_seen.add(href)
                newly_added += 1
            if hit_overlap:
                print("Hit overlap with existing — stopping after collecting missing ones.")
                break
            if newly_added == 0 and page > 0:
                print("No new links on this page; stopping.")
                break
            page += 1
    finally:
        driver.quit()

    return collected


def _log_summary(downloaded: int, new_lines: Sequence[str]) -> None:
    if new_lines:
        print(f"Prepended {len(new_lines)} new record(s) to {LINKS_FILE}")
    print(f"Downloaded {downloaded} new PDF(s) to {OUT_DIR}")


def run() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    LINKS_FILE.parent.mkdir(parents=True, exist_ok=True)

    existing_urls = scan_links_file(LINKS_FILE)
    print(f"Existing URLs in state: {len(existing_urls)}")
    last_date_state = read_last_date(STATE_KEY)
    latest_in_file = scan_latest_date(LINKS_FILE)
    cutoff_date = latest_in_file or last_date_state
    if cutoff_date is not None:
        print(f"Newest date already in file/state: {cutoff_date}")
    else:
        print("No existing file/state date found; will fetch everything from most recent backward.")

    collected = _collect_links(existing_urls, cutoff_date)
    if not collected:
        print("No new PDFs found.")
        return

    collected.sort(key=lambda entry: entry[0], reverse=True)

    downloaded = 0
    new_lines: List[str] = []
    max_date: Optional[dt.date] = cutoff_date

    for date, href in collected:
        filename = build_filename(date, href)
        destination = OUT_DIR / filename
        if destination.exists():
            print(f"Already have file: {destination.name}")
        else:
            print(f"Downloading {href} -> {destination}")
            try:
                _download(href, destination)
                downloaded += 1
            except Exception as exc:  # pragma: no cover - network errors
                print(f"!! Download failed: {href} ({exc})")
                continue
        new_lines.append(f"{format_date(date)},{href}")
        if (max_date is None) or (date > max_date):
            max_date = date

    if new_lines:
        prepend_links(new_lines)
        if max_date is not None:
            write_last_date(STATE_KEY, max_date)

    _log_summary(downloaded, new_lines)


def main() -> None:
    run()
