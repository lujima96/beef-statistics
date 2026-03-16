"""High level orchestration for the PM raw trimmings retriever."""

from __future__ import annotations

import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from tqdm import tqdm

from .config import (
    FAIL_DIR,
    LINKS_PATH,
    LOG_FILE,
    OUT_DIR,
    REQUEST_PAUSE_SEC,
    SAVE_RAW_PDF_ALONG,
    SKIP_IF_TXT_EXISTS,
)
from .network import fetch_response, sniff_is_pdf
from .parsing import basename_from_url, parse_date, parse_line
from .pdf_text import pdf_bytes_to_text

__all__ = ["ensure_dirs", "log_failure", "main"]


def ensure_dirs() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    FAIL_DIR.mkdir(parents=True, exist_ok=True)
    LOG_FILE.touch(exist_ok=True)


def log_failure(msg: str) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(msg.rstrip() + "\n")


def _load_items() -> List[Tuple[Optional[datetime], str, str]]:
    items: List[Tuple[Optional[datetime], str, str]] = []
    for line in LINKS_PATH.read_text(encoding="utf-8").splitlines():
        parsed = parse_line(line)
        if not parsed:
            continue
        date_str, url = parsed
        try:
            dt: Optional[datetime] = parse_date(date_str)
        except Exception as exc:
            print(f"[WARN] Bad date '{date_str}': {exc} — labeling as 'unknown-date'")
            dt = None
        if SKIP_IF_TXT_EXISTS:
            ymd = dt.strftime("%Y-%m-%d") if dt else "unknown-date"
            base = f"{ymd}_{basename_from_url(url)}"
            out_txt = OUT_DIR / f"{base}.txt"
            if out_txt.exists():
                continue
        items.append((dt, date_str, url))
    return items


def main() -> None:
    if not LINKS_PATH.exists():
        raise SystemExit(f"Input list not found: {LINKS_PATH}")

    ensure_dirs()

    items = _load_items()
    if not items:
        print("[INFO] No valid lines found.")
        return

    items.sort(key=lambda item: item[0] or datetime.min)

    stats: Dict[str, int] = {"total": len(items), "ok": 0, "errors": 0, "skipped": 0}

    try:
        for dt, date_str, url in tqdm(items, desc="Processing PM reports", unit="file"):
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
                    except Exception as exc:
                        stats["errors"] += 1
                        (FAIL_DIR / f"{base}.pdf").write_bytes(content)
                        log_failure(f"PDF-TO-TEXT-FAIL\t{date_str}\t{url}\t{exc}")
                        print(
                            f"\n[ERROR] Text extraction failed {date_str} {url}\n        {exc}"
                        )
                        continue
                else:
                    encoding = resp.encoding or "utf-8"
                    try:
                        text = content.decode(encoding, errors="replace")
                    except Exception:
                        text = content.decode("utf-8", errors="replace")

            except Exception as exc:
                stats["errors"] += 1
                (FAIL_DIR / f"{base}.bin").write_bytes(b"")
                log_failure(f"FETCH-FAIL\t{date_str}\t{url}\t{exc}")
                print(f"\n[ERROR] Fetch failed {date_str} {url}\n        {exc}")
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
