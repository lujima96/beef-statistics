"""High level orchestration for the weekly boxed beef downloader."""
from __future__ import annotations

import datetime as dt
from typing import List, Optional, Set

from .config import BASE_URL, LINKS_FILE, OUT_DIR
from .downloader import build_dest_name, download_file
from .driver import build_driver, extract_max_pages, fetch_page_source
from .parsing import AnchorResult, parse_links
from .state import format_date, read_last_date, scan_latest_date, scan_links, write_last_date


def _collect_new_links(existing: Set[str]) -> List[AnchorResult]:
    driver = build_driver()
    session_seen: Set[str] = set()
    collected: List[AnchorResult] = []
    try:
        last_date_state = read_last_date("weekly_boxed_beef_dl")
        latest_in_file = scan_latest_date(LINKS_FILE)
        cutoff_date = latest_in_file or last_date_state
        if cutoff_date is not None:
            print(f"Newest date already in file/state: {cutoff_date}")
        else:
            print("No existing file/state date found; will fetch everything from most recent backward.")

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
            for report_date, href in links:
                if cutoff_date and report_date and report_date <= cutoff_date:
                    hit_overlap = True
                    continue
                if href in existing or href in session_seen:
                    hit_overlap = True
                    continue
                collected.append((report_date, href))
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


def _write_links(records: List[str]) -> None:
    LINKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    existing_text = LINKS_FILE.read_text(encoding="utf-8") if LINKS_FILE.exists() else ""
    LINKS_FILE.write_text(
        "\n".join(records + ([existing_text] if existing_text else [])) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    existing = scan_links(LINKS_FILE)
    print(f"Existing URLs recorded: {len(existing)}")

    collected = _collect_new_links(existing)
    if not collected:
        print("No new PDFs found.")
        return

    collected.sort(key=lambda item: (item[0] or dt.date.min), reverse=True)
    downloaded = 0
    max_date: Optional[dt.date] = None
    new_lines: List[str] = []

    for report_date, href in collected:
        destination = OUT_DIR / build_dest_name(report_date, href)
        if destination.exists():
            print(f"Already have file: {destination.name}")
        else:
            print(f"Downloading {href} -> {destination}")
            try:
                download_file(href, destination)
                downloaded += 1
            except Exception as exc:  # pragma: no cover - network failures
                print(f"!! Download failed: {href} ({exc})")
                continue
        line = f"{format_date(report_date)},{href}" if report_date else href
        new_lines.append(line)
        if report_date and ((max_date is None) or (report_date > max_date)):
            max_date = report_date

    _write_links(new_lines)
    print(f"Prepended {len(new_lines)} new record(s) to {LINKS_FILE}")
    if max_date is not None:
        write_last_date("weekly_boxed_beef_dl", max_date)
    print(f"Downloaded {downloaded} new PDF(s) to {OUT_DIR}")


__all__ = ["main"]
