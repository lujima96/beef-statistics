#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fetch USDA 'Beef Carcass Equivalent Index' plain-text reports.

Reads URLs from a link list and saves normalized text into
raw_index/YYYY-MM-DD_<name>.txt.  Modeled after raw_catalog.py which
processes the PDF-based 'National Daily Cattle & Beef Summary' reports.
"""
from __future__ import annotations

import atexit
import base64
import logging
import time
import re
from pathlib import Path
from typing import Optional, Tuple, List, Dict
from datetime import datetime
from urllib.parse import urlparse

import requests
from tqdm import tqdm
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
# Determine project directories relative to this file
ROOT_DIR = Path(__file__).resolve().parents[2]
LINKS_DIR = ROOT_DIR / "links"
RAW_DIR = ROOT_DIR / "beef_stats" / "raw"

# -------------------- CONFIG -------------------------------------------------
INPUT_TXT = LINKS_DIR / "beef_carcass_equiv_index.txt"
OUT_DIR = RAW_DIR / "raw_index"
FAIL_DIR = OUT_DIR.parent / "raw_index_failed"
LOG_FILE = OUT_DIR.parent / "fetch_index_failures.log"

REQUEST_PAUSE_SEC: float = 0.05
TIMEOUT: tuple[int, int] = (10, 30)
MAX_RETRIES: int = 3
BACKOFF_BASE_SEC: float = 1.0
SKIP_IF_TXT_EXISTS: bool = True
# -----------------------------------------------------------------------------

logging.getLogger("pdfminer").setLevel(logging.ERROR)  # quiet libs that may log
MYMARKETNEWS_HOST = "mymarketnews.ams.usda.gov"
MYMARKETNEWS_INDEX_LISTING_URL = (
    f"https://{MYMARKETNEWS_HOST}/filerepo/reports?field_slug_id_value=&name=NW_LS410"
)
_browser: webdriver.Chrome | None = None

# -------------------- helpers ------------------------------------------------
def parse_line(line: str) -> Optional[Tuple[str, str]]:
    s = line.strip()
    if not s or s.startswith("#") or "," not in s:
        return None
    date_part, url = s.rsplit(",", 1)
    return date_part.strip(), url.strip().rstrip(". ")


def parse_date(date_str: str) -> datetime:
    fmts = ("%b %d, %Y", "%B %d, %Y", "%m/%d/%Y", "%Y-%m-%d")
    last_err: Optional[Exception] = None
    for fmt in fmts:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError as e:
            last_err = e
    raise ValueError(f"Unrecognized date format: {date_str!r} ({last_err})")


def basename_from_url(url: str) -> str:
    name = Path(url.split("?", 1)[0]).name
    for ext in (".TXT", ".txt"):
        if name.endswith(ext):
            name = name[: -len(ext)]
            break
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "report"


def fetch_text(url: str) -> str:
    def _build_browser() -> webdriver.Chrome:
        opts = webdriver.ChromeOptions()
        opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument(
            "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        )
        driver = webdriver.Chrome(
            service=ChromeService(ChromeDriverManager().install()),
            options=opts,
        )
        driver.set_page_load_timeout(TIMEOUT[1])
        return driver

    def _get_browser() -> webdriver.Chrome:
        global _browser
        if _browser is None:
            _browser = _build_browser()
        return _browser

    def _browser_fetch_text(target_url: str) -> str:
        driver = _get_browser()
        driver.get(MYMARKETNEWS_INDEX_LISTING_URL)
        payload = driver.execute_async_script(
            """
const url = arguments[0];
const done = arguments[arguments.length - 1];
fetch(url)
  .then(async (res) => {
    const text = await res.text();
    done({
      ok: res.ok,
      status: res.status,
      body: btoa(unescape(encodeURIComponent(text))),
    });
  })
  .catch((err) => done({ ok: false, error: String(err) }));
            """,
            target_url,
        )
        if not payload.get("ok"):
            raise RuntimeError(payload.get("error") or f"Browser fetch failed for {target_url}")
        return base64.b64decode(payload["body"]).decode("utf-8", errors="replace")

    host = (urlparse(url).hostname or "").lower()
    last_exc: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if host == MYMARKETNEWS_HOST:
                return _browser_fetch_text(url)
            resp = requests.get(
                url,
                headers={"User-Agent": "beef-stats-fetcher/1.0", "Accept": "text/plain, */*"},
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            last_exc = e
            if attempt < MAX_RETRIES:
                sleep_for = BACKOFF_BASE_SEC ** (attempt - 1)
                print(f"[WARN] {url} attempt {attempt} failed: {e}. Retrying in {sleep_for:.1f}s…")
                time.sleep(sleep_for)
            else:
                break
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("fetch_text failed without an exception recorded")


def ensure_dirs() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    FAIL_DIR.mkdir(parents=True, exist_ok=True)
    LOG_FILE.touch(exist_ok=True)


def log_failure(msg: str) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(msg.rstrip() + "\n")


def _close_browser() -> None:
    global _browser
    if _browser is None:
        return
    try:
        _browser.quit()
    except Exception:
        pass
    _browser = None


atexit.register(_close_browser)


# -------------------- main ---------------------------------------------------
def main() -> None:
    if not INPUT_TXT.exists():
        raise SystemExit(f"Input list not found: {INPUT_TXT}")
    ensure_dirs()

    items: List[Tuple[Optional[datetime], str, str]] = []
    for ln in INPUT_TXT.read_text(encoding="utf-8").splitlines():
        parsed = parse_line(ln)
        if not parsed:
            continue
        date_str, url = parsed
        try:
            dt: Optional[datetime] = parse_date(date_str)
        except Exception as e:
            print(f"[WARN] Bad date '{date_str}': {e} — labeling as 'unknown-date'")
            dt = None

        if SKIP_IF_TXT_EXISTS:
            ymd = dt.strftime("%Y-%m-%d") if dt else "unknown-date"
            base = f"{ymd}_{basename_from_url(url)}"
            out_txt = OUT_DIR / f"{base}.txt"
            if out_txt.exists():
                continue
        items.append((dt, date_str, url))

    if not items:
        print("[INFO] No valid lines found.")
        return

    items.sort(key=lambda x: x[0] or datetime.min)
    stats: Dict[str, int] = {"total": len(items), "ok": 0, "errors": 0, "skipped": 0}

    try:
        for dt, date_str, url in tqdm(items, desc="Processing reports", unit="file"):
            ymd = dt.strftime("%Y-%m-%d") if dt else "unknown-date"
            base = f"{ymd}_{basename_from_url(url)}"
            out_txt = OUT_DIR / f"{base}.txt"

            try:
                text = fetch_text(url)
            except Exception as e:
                stats["errors"] += 1
                log_failure(f"FETCH-FAIL\t{date_str}\t{url}\t{e}")
                (FAIL_DIR / f"{base}.bin").write_bytes(b"")
                print(f"\n[ERROR] Fetch failed {date_str} {url}\n        {e}")
                continue

            out_txt.write_text(text, encoding="utf-8")
            stats["ok"] += 1
            time.sleep(REQUEST_PAUSE_SEC)

    except KeyboardInterrupt:
        print("\n[INTERRUPTED] Stopping early (Ctrl+C).")

    finally:
        print(
            f"\n[DONE] total={stats['total']} ok={stats['ok']} "
            f"skipped={stats['skipped']} errors={stats['errors']}"
        )
        print(f"[OUT]  Text:   {OUT_DIR}")
        print(f"[OUT]  Failed: {FAIL_DIR}")
        print(f"[LOG]  {LOG_FILE}")


if __name__ == "__main__":
    main()
