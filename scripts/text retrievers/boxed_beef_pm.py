#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch USDA 'Boxed Beef PM' reports (PDF or TXT) and write normalized text.

- Reads (date, url) pairs from: LINKS_DIR / "boxed_beef_pm.txt"
- Writes text files to: RAW_DIR / "raw_boxed_pm" as: YYYY-MM-DD_<basename>.txt

Uses central scripts.config when available; otherwise falls back to computing
paths relative to this file's location.
"""

from __future__ import annotations

import atexit
import base64
import logging
import re
import time
import shutil
import subprocess
from io import BytesIO
from pathlib import Path
from typing import Optional, Tuple, List, Dict
from datetime import datetime
import sys
from urllib.parse import urlparse

import requests
from tqdm import tqdm
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager

# ───────────────────────── Config import / fallback ──────────────────────────
_THIS = Path(__file__).resolve()
# This file lives at: <...>/beef_stats/scripts/text retrievers/boxed_beef_pm.py
# Add "<...>/beef_stats" to sys.path so "scripts.config" can import.
sys.path.insert(0, str(_THIS.parents[2]))

try:
    from scripts.config import LINKS_DIR, RAW_DIR  # type: ignore
except Exception:
    # Fallback root is "<...>/beef_stats"
    ROOT_DIR = _THIS.parents[2]
    LINKS_DIR = ROOT_DIR / "links"
    RAW_DIR   = ROOT_DIR / "beef_stats" / "raw"

# Optional PyMuPDF (best-quality extractor)
try:
    import fitz  # type: ignore
    HAS_FITZ: bool = True
except Exception:
    HAS_FITZ = False

# pdfminer (fallback)
from pdfminer.high_level import extract_text as pdfminer_extract_text
from pdfminer.layout import LAParams

# -------------------- CONFIG -------------------------------------------------
LINKS_PATH = LINKS_DIR / "boxed_beef_pm.txt"
OUT_DIR    = RAW_DIR / "raw_boxed_pm"
FAIL_DIR   = OUT_DIR.parent / "raw_boxed_pm_failed"
LOG_FILE   = OUT_DIR.parent / "fetch_boxed_pm_failures.log"

REQUEST_PAUSE_SEC: float = 0.05
TIMEOUT: tuple[int, int] = (10, 30)
MAX_RETRIES: int = 3
BACKOFF_BASE_SEC: float = 1.0
SAVE_RAW_PDF_ALONG: bool = False
SKIP_IF_TXT_EXISTS: bool = True
# -----------------------------------------------------------------------------

logging.getLogger("pdfminer").setLevel(logging.ERROR)
MYMARKETNEWS_HOST = "mymarketnews.ams.usda.gov"
MYMARKETNEWS_PM_LISTING_URL = f"https://{MYMARKETNEWS_HOST}/filerepo/reports?field_slug_id_value=2453"
_browser: webdriver.Chrome | None = None

# -------------------- helpers: parsing lines/dates ---------------------------
def parse_line(line: str) -> Optional[Tuple[str, str]]:
    s = line.strip()
    if not s or s.startswith("#") or "," not in s:
        return None
    date_part, url = s.rsplit(",", 1)
    date_str = date_part.strip()
    url = url.strip().rstrip(". ")
    if not url:
        return None
    return date_str, url


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
    for ext in (".PDF", ".pdf", ".TXT", ".txt"):
        if name.endswith(ext):
            name = name[: -len(ext)]
            break
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "report"


# -------------------- HTTP fetch with retries -------------------------------
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
    driver.get(MYMARKETNEWS_PM_LISTING_URL)
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
    raise RuntimeError("fetch_response failed without an exception recorded")


def sniff_is_pdf(resp: requests.Response, sample: bytes) -> bool:
    ct = (resp.headers.get("Content-Type") or "").lower()
    return ("pdf" in ct) or sample.startswith(b"%PDF")


# -------------------- PDF -> text (hardened) --------------------------------
def _normalize_text(s: str) -> str:
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("\u00A0", " ")
    s = s.replace("\u2013", "-").replace("\u2014", "-")
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    return s


def pdf_bytes_to_text(pdf_bytes: bytes) -> str:
    if HAS_FITZ:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")  # type: ignore[attr-defined]
            parts: List[str] = []
            for idx in range(doc.page_count):
                page = doc.load_page(idx)
                blocks: List[List[object]] = page.get_text("blocks")  # type: ignore[assignment]
                blocks.sort(key=lambda b: (round(float(b[1]), 1), round(float(b[0]), 1)))
                if idx > 0:
                    parts.append(f"\n\n=== PAGE {idx + 1} ===\n\n")
                for b in blocks:
                    text_field = b[4]
                    txt = (str(text_field) if text_field else "").strip()
                    if txt:
                        parts.append(txt + "\n")
            return _normalize_text("".join(parts))
        except Exception:
            pass

    if shutil.which("pdftotext"):
        try:
            proc = subprocess.run(
                ["pdftotext", "-layout", "-", "-"],
                input=pdf_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
            )
            txt = proc.stdout.decode("utf-8", errors="ignore")
            txt = txt.replace("\f", "\n\n=== PAGE BREAK ===\n\n")
            return _normalize_text(txt)
        except Exception:
            pass

    try:
        laparams = LAParams(all_texts=True, boxes_flow=None, word_margin=0.1,
                            char_margin=2.0, line_margin=0.2)
        txt2 = pdfminer_extract_text(BytesIO(pdf_bytes), laparams=laparams) or ""
        return _normalize_text(txt2)
    except Exception:
        txt3 = pdfminer_extract_text(BytesIO(pdf_bytes)) or ""
        return _normalize_text(txt3)


# -------------------- FS + logging ------------------------------------------
def ensure_dirs() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    FAIL_DIR.mkdir(parents=True, exist_ok=True)
    LOG_FILE.touch(exist_ok=True)


def log_failure(msg: str) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(msg.rstrip() + "\n")


# -------------------- main ---------------------------------------------------
def main() -> None:
    if not LINKS_PATH.exists():
        raise SystemExit(f"Input list not found: {LINKS_PATH}")
    ensure_dirs()

    items: List[Tuple[Optional[datetime], str, str]] = []
    for ln in LINKS_PATH.read_text(encoding="utf-8").splitlines():
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
        for dt, date_str, url in tqdm(items, desc="Processing Boxed Beef PM reports", unit="file"):
            ymd = dt.strftime("%Y-%m-%d") if dt else "unknown-date"
            base = f"{ymd}_{basename_from_url(url)}"
            out_txt = OUT_DIR / f"{base}.txt"
            raw_pdf = OUT_DIR / f"{base}.pdf"

            try:
                resp = fetch_response(url)
                content = resp.content if resp.content else b"".join(resp.iter_content(32768))
                if not content:
                    raise ValueError("Empty response body")

                if sniff_is_pdf(resp, content[:8]):
                    try:
                        text = pdf_bytes_to_text(content)
                        if SAVE_RAW_PDF_ALONG:
                            raw_pdf.write_bytes(content)
                    except Exception as e:
                        stats["errors"] += 1
                        (FAIL_DIR / f"{base}.pdf").write_bytes(content)
                        log_failure(f"PDF-TO-TEXT-FAIL\t{date_str}\t{url}\t{e}")
                        print(f"\n[ERROR] Text extraction failed {date_str} {url}\n        {e}")
                        continue
                else:
                    enc = resp.encoding or "utf-8"
                    try:
                        text = content.decode(enc, errors="replace")
                    except Exception:
                        text = content.decode("utf-8", errors="replace")

            except Exception as e:
                stats["errors"] += 1
                (FAIL_DIR / f"{base}.bin").write_bytes(b"")
                log_failure(f"FETCH-FAIL\t{date_str}\t{url}\t{e}")
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
