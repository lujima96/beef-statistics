"""Download helpers."""
from __future__ import annotations

import atexit
import base64
import datetime as dt
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager

from .config import BASE_URL, MYMARKETNEWS_HOST, USER_AGENT

_browser: webdriver.Chrome | None = None


def build_dest_name(report_date: Optional[dt.date], href: str) -> str:
    """Return a deterministic filename for *href* using ``report_date`` when available."""
    parsed = urlparse(href)
    base = Path(parsed.path).name or "file.pdf"
    if report_date is not None:
        return f"{report_date.isoformat()}__{base}"
    parts = [segment for segment in Path(parsed.path).parts if segment and segment != "/"]
    if len(parts) >= 3:
        unique = "_".join(parts[-3:-1])
        return f"{unique}_{base}"
    return base


def _build_browser() -> webdriver.Chrome:
    opts = webdriver.ChromeOptions()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument(f"--user-agent={USER_AGENT}")
    driver = webdriver.Chrome(
        service=ChromeService(ChromeDriverManager().install()),
        options=opts,
    )
    driver.set_page_load_timeout(30)
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


def _browser_download_bytes(url: str) -> bytes:
    driver = _get_browser()
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


def download_file(url: str, destination: Path) -> None:
    """Download ``url`` to ``destination`` ensuring the payload is a PDF."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    host = (urlparse(url).hostname or "").lower()
    if host == MYMARKETNEWS_HOST:
        destination.write_bytes(_browser_download_bytes(url))
        return

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    }
    with requests.get(url, headers=headers, timeout=60, stream=True) as response:
        response.raise_for_status()
        content_type = (response.headers.get("Content-Type") or "").lower()
        chunks = response.iter_content(chunk_size=8192)
        first_chunk = next(chunks)
        if not first_chunk:
            raise RuntimeError("Empty response")
        if ("pdf" not in content_type) and (not first_chunk.startswith(b"%PDF")):
            raise RuntimeError(f"Not a PDF (Content-Type: {content_type})")
        with open(destination, "wb") as handle:
            handle.write(first_chunk)
            for chunk in chunks:
                if chunk:
                    handle.write(chunk)


__all__ = ["build_dest_name", "download_file"]
