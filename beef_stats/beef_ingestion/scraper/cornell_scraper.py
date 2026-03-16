# scraper/cornell_scraper.py
import time
import threading
from dataclasses import dataclass
from typing import Iterable

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# Rate limiter to avoid hammering the site
_RATE_LIMIT_SECONDS = 2.0
_last_request_ts = 0.0
_rate_lock = threading.Lock()

def _respect_rate_limit():
    """Block until the minimum interval between requests has elapsed."""
    global _last_request_ts
    with _rate_lock:
        now = time.monotonic()
        elapsed = now - _last_request_ts
        if elapsed < _RATE_LIMIT_SECONDS:
            time.sleep(_RATE_LIMIT_SECONDS - elapsed)
            now = time.monotonic()
        _last_request_ts = now

def get_driver():
    opts = Options()
    opts.add_argument("--headless")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    return webdriver.Chrome(options=opts)

def _gather_pdf_links(driver, retry_count=3):
    """
    Return [(href, release_date)] for all PDFs on the current page.
    Retries if Selenium elements go stale due to DOM updates.
    """
    for attempt in range(retry_count):
        try:
            links = driver.find_elements(By.CSS_SELECTOR, "a.file_download")
            results = []
            for link in links:
                href = link.get_attribute("href")
                release_date = link.get_attribute("data-release-date")
                if href and href.lower().endswith(".pdf") and release_date:
                    results.append((href, release_date))
            return results
        except StaleElementReferenceException:
            if attempt == retry_count - 1:
                raise
            time.sleep(0.5)
    return []

@dataclass(slots=True)
class ScrapeResult:
    """Structured response from :func:`scrape_cornell`."""

    items: list[tuple[str, str]]
    pages_visited: int
    stopped_due_to_known: bool
    stop_url: str | None


def scrape_cornell(url: str, known_urls: Iterable[str] | None = None) -> ScrapeResult:
    """Scrape the Cornell site for downloadable files.

    Parameters
    ----------
    url:
        The starting URL to scrape from.
    known_urls:
        Optional collection of URLs that already exist in the database. When
        provided, pagination stops as soon as a known URL is encountered.
    """

    driver = get_driver()
    all_pdfs: list[tuple[str, str]] = []
    pages_visited = 0
    stopped_due_to_known = False
    stop_url: str | None = None
    known = set(known_urls or ())

    try:
        _respect_rate_limit()
        driver.get(url)

        while True:
            try:
                pdfs = _gather_pdf_links(driver)
            except StaleElementReferenceException:
                continue

            pages_visited += 1

            for href, release_date in pdfs:
                if href in known:
                    stopped_due_to_known = True
                    stop_url = href
                    break
                all_pdfs.append((href, release_date))

            if stopped_due_to_known:
                break

            try:
                next_button = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "a[rel='next']"))
                )
                previous_button = next_button
                _respect_rate_limit()
                next_button.click()
                WebDriverWait(driver, 10).until(EC.staleness_of(previous_button))
            except (NoSuchElementException, TimeoutException):
                break
    finally:
        driver.quit()

    return ScrapeResult(
        items=all_pdfs,
        pages_visited=pages_visited,
        stopped_due_to_known=stopped_due_to_known,
        stop_url=stop_url,
    )
