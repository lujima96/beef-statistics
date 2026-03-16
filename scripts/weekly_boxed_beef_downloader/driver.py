"""Browser automation helpers."""
from __future__ import annotations

import time
from typing import Optional
from urllib.parse import parse_qs, urlparse

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

from .config import USER_AGENT


def build_driver() -> webdriver.Chrome:
    """Return a configured headless Chrome driver."""
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


def fetch_page_source(driver: webdriver.Chrome, url: str) -> str:
    """Navigate to ``url`` and return the rendered HTML."""
    driver.get(url)
    try:
        WebDriverWait(driver, 12).until(
            lambda current: current.find_elements(By.CSS_SELECTOR, "table tbody tr")
        )
    except Exception:
        time.sleep(1.0)
    return driver.page_source


def extract_max_pages(driver: webdriver.Chrome) -> Optional[int]:
    """Return the number of available pages, if pagination is visible."""
    max_page = 1
    found = False
    for anchor in driver.find_elements(By.CSS_SELECTOR, "nav.pager a[href]"):
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


__all__ = ["build_driver", "extract_max_pages", "fetch_page_source"]
