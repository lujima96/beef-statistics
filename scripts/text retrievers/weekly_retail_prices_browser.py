"""Browser utilities for the weekly retail prices retriever."""
from __future__ import annotations

import time
from typing import Optional
from urllib.parse import parse_qs, urlparse

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager


USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)


def get_driver():
    """Create and return a configured headless Chrome driver."""
    opts = webdriver.ChromeOptions()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument(f"--user-agent={USER_AGENT}")
    driver = webdriver.Chrome(
        service=ChromeService(ChromeDriverManager().install()),
        options=opts,
    )
    driver.set_page_load_timeout(20)
    return driver


def fetch_page_source(drv, url: str) -> str:
    """Fetch *url* with Selenium and return the rendered HTML source."""
    drv.get(url)
    try:
        WebDriverWait(drv, 12).until(
            lambda current: current.find_elements(By.CSS_SELECTOR, "table tbody tr")
        )
    except Exception:
        time.sleep(1.0)
    return drv.page_source


def extract_max_pages(drv) -> Optional[int]:
    """Return the number of available pages, if pagination is visible."""
    max_page = 1
    found = False
    for anchor in drv.find_elements(By.CSS_SELECTOR, "nav.pager a[href]"):
        href = anchor.get_attribute("href") or ""
        page_values = parse_qs(urlparse(href).query).get("page")
        if not page_values:
            continue
        try:
            zero_based_page = int(page_values[0])
        except ValueError:
            continue
        found = True
        max_page = max(max_page, zero_based_page + 1)
    return max_page if found else None
