"""HTTP helpers for the PM raw trimmings retriever."""

from __future__ import annotations

import atexit
import base64
import time
from typing import Optional
from urllib.parse import urlparse

import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager

from .config import BACKOFF_BASE_SEC, MAX_RETRIES, TIMEOUT

__all__ = ["fetch_response", "sniff_is_pdf"]

MYMARKETNEWS_HOST = "mymarketnews.ams.usda.gov"
MYMARKETNEWS_TRIMMINGS_PM_LISTING_URL = (
    f"https://{MYMARKETNEWS_HOST}/filerepo/reports?field_slug_id_value=2451"
)
_browser: webdriver.Chrome | None = None


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


def _browser_fetch_response(url: str) -> requests.Response:
    driver = _get_browser()
    driver.get(MYMARKETNEWS_TRIMMINGS_PM_LISTING_URL)
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

    response = requests.Response()
    response.status_code = int(payload.get("status") or 200)
    response.url = url
    response.headers["Content-Type"] = payload.get("contentType") or "application/octet-stream"
    response._content = base64.b64decode(payload["body"])
    response.encoding = "utf-8"
    response.reason = "OK"
    return response


def fetch_response(url: str) -> requests.Response:
    last_exc: Optional[Exception] = None
    host = (urlparse(url).hostname or "").lower()
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if host == MYMARKETNEWS_HOST:
                return _browser_fetch_response(url)
            resp = requests.get(
                url,
                headers={"User-Agent": "beef-stats-fetcher/1.2", "Accept": "*/*"},
                timeout=TIMEOUT,
                stream=True,
            )
            resp.raise_for_status()
            return resp
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_RETRIES:
                sleep_for = BACKOFF_BASE_SEC ** (attempt - 1)
                print(
                    f"[WARN] {url} attempt {attempt} failed: {exc}. "
                    f"Retrying in {sleep_for:.1f}s…"
                )
                time.sleep(sleep_for)
            else:
                break
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("fetch_response failed without an exception recorded")


def sniff_is_pdf(resp: requests.Response, sample: bytes) -> bool:
    ct = (resp.headers.get("Content-Type") or "").lower()
    return ("pdf" in ct) or sample.startswith(b"%PDF")
