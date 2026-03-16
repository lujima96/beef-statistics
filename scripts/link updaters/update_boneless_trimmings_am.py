#!/usr/bin/env python3
"""Update the Boneless Trimmings AM link list from MyMarketNews."""

from __future__ import annotations

import datetime as dt
import sys
import time
from pathlib import Path
from typing import List, Optional, Set, Tuple
from urllib.parse import parse_qs, urljoin, urlparse

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

BASE_URL = (
    "https://mymarketnews.ams.usda.gov/filerepo/reports"
    "?field_slug_id_value=2450"
    "&name="
    "&field_slug_title_value="
    "&field_published_date_value="
    "&field_report_date_end_value="
    "&field_api_market_types_target_id=All"
    "&order="
    "&sort="
)
ROW_SELECTOR = "table tbody tr"
PAGE_TIMEOUT_SEC = 20
PAGE_SETTLE_SEC = 1.0
TARGET_SUFFIXES = (".txt", ".pdf")

_THIS_FILE = Path(__file__).resolve()
sys.path.insert(0, str(_THIS_FILE.parents[2]))

try:  # pragma: no cover
    from scripts.config import LINKS_DIR  # type: ignore
except Exception:  # pragma: no cover
    LINKS_DIR = _THIS_FILE.parents[2] / "links"

LINKS_FILE = LINKS_DIR / "boneless_trimmings_am.txt"


def _get_driver() -> webdriver.Chrome:
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
    driver.set_page_load_timeout(PAGE_TIMEOUT_SEC)
    return driver


def _build_page_url(page_index: int) -> str:
    if page_index <= 0:
        return BASE_URL
    return f"{BASE_URL}&page={page_index}"


def _is_target_asset(href: str) -> bool:
    path = urlparse(href).path.lower()
    return path.endswith(TARGET_SUFFIXES)


def _parse_report_date(raw: str) -> Optional[dt.date]:
    text = raw.strip()
    for fmt in ("%Y-%m-%d", "%m-%d-%Y"):
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _format_date(day: dt.date) -> str:
    return day.strftime("%b %d, %Y").replace(" 0", " ")


def _scan_existing(path: Path) -> Tuple[Optional[dt.date], Set[str]]:
    if not path.exists():
        return None, set()

    newest: Optional[dt.date] = None
    urls: Set[str] = set()
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "," not in line:
            continue
        _, url = line.rsplit(",", 1)
        url = url.strip()
        if not url:
            continue
        urls.add(url)
        if newest is not None:
            continue
        parts = line.split(",", 2)
        if len(parts) < 3:
            continue
        try:
            newest = dt.datetime.strptime(",".join(parts[:2]).strip(), "%b %d, %Y").date()
        except ValueError:
            newest = None
    return newest, urls


def _extract_max_pages(driver: webdriver.Chrome) -> Optional[int]:
    max_page = 1
    found = False
    for anchor in driver.find_elements(By.CSS_SELECTOR, "nav.pager a[href]"):
        href = anchor.get_attribute("href") or ""
        query = parse_qs(urlparse(href).query)
        page_values = query.get("page")
        if not page_values:
            continue
        try:
            zero_based_page = int(page_values[0])
        except ValueError:
            continue
        found = True
        max_page = max(max_page, zero_based_page + 1)
    return max_page if found else None


def _parse_current_page(driver: webdriver.Chrome) -> List[Tuple[dt.date, str]]:
    def _rows_loaded(current: webdriver.Chrome) -> bool:
        return bool(current.find_elements(By.CSS_SELECTOR, ROW_SELECTOR))

    try:
        WebDriverWait(driver, PAGE_TIMEOUT_SEC).until(_rows_loaded)
    except TimeoutException:
        return []
    time.sleep(PAGE_SETTLE_SEC)

    rows = driver.find_elements(By.CSS_SELECTOR, ROW_SELECTOR)
    parsed: List[Tuple[dt.date, str]] = []
    seen_on_page: Set[Tuple[dt.date, str]] = set()

    for row in rows:
        try:
            report_date_text = row.find_element(
                By.CSS_SELECTOR,
                "td.views-field-field-report-date",
            ).text
            report_date = _parse_report_date(report_date_text)
            if report_date is None:
                continue

            link_el = row.find_element(
                By.CSS_SELECTOR,
                "td.views-field-field-document a[href]",
            )
            href = urljoin(BASE_URL, link_el.get_attribute("href") or "")
            if not href or not _is_target_asset(href):
                continue
        except Exception:
            continue

        item = (report_date, href)
        if item in seen_on_page:
            continue
        seen_on_page.add(item)
        parsed.append(item)

    return parsed


def main() -> None:
    print(f"Using links file: {LINKS_FILE}")
    print(f"Exists: {LINKS_FILE.exists()}")

    latest_in_file, existing_urls = _scan_existing(LINKS_FILE)
    if latest_in_file is not None:
        print(f"Newest date already in file: {latest_in_file}")
    else:
        print("No existing file or no parsable date found; will fetch everything from most recent backward.")

    driver = _get_driver()
    collected: List[Tuple[dt.date, str]] = []
    seen_urls_session: Set[str] = set()
    max_pages: Optional[int] = None
    page_index = 0

    try:
        while True:
            if max_pages is not None and page_index >= max_pages:
                print(f"Reached last page ({max_pages}). Stopping.")
                break

            page_url = _build_page_url(page_index)
            print(f"Fetching page {page_index + 1} -> {page_url}")
            driver.get(page_url)

            if max_pages is None:
                max_pages = _extract_max_pages(driver)
                if max_pages is not None:
                    print(f"Detected pagination with {max_pages} pages total.")

            page_links = _parse_current_page(driver)
            if not page_links:
                print("No report rows found on this page; stopping.")
                break

            overlap_found = False
            newly_added = 0
            for report_date, href in page_links:
                if latest_in_file is not None and report_date <= latest_in_file:
                    overlap_found = True
                    continue
                if href in existing_urls:
                    overlap_found = True
                    continue
                if href in seen_urls_session:
                    continue
                collected.append((report_date, href))
                seen_urls_session.add(href)
                newly_added += 1

            if overlap_found:
                print("Hit overlap with existing file; stopping after collecting missing entries.")
                break

            if newly_added == 0 and page_index > 0:
                print("No new links on this page; stopping.")
                break

            page_index += 1
    finally:
        driver.quit()

    if not collected:
        print("No new links found.")
        return

    collected.sort(key=lambda item: item[0], reverse=True)
    new_lines = [f"{_format_date(day)},{href}" for day, href in collected]

    existing_lines: List[str] = []
    if LINKS_FILE.exists():
        existing_lines = LINKS_FILE.read_text(encoding="utf-8").splitlines()

    LINKS_FILE.write_text("\n".join(new_lines + existing_lines) + "\n", encoding="utf-8")
    print(f"Prepended {len(new_lines)} new link(s) to {LINKS_FILE}")


if __name__ == "__main__":
    main()
