"""Main orchestration logic for fetching Boxed Beef AM reports."""

from __future__ import annotations

import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from tqdm import tqdm

from boxed_beef_am_config import (
    FAIL_DIR,
    LINKS_PATH,
    LOG_FILE,
    OUT_DIR,
    REQUEST_PAUSE_SEC,
    SAVE_RAW_PDF_ALONG,
    SKIP_IF_TXT_EXISTS,
    ensure_dirs,
)
from boxed_beef_am_fetch import fetch_response, sniff_is_pdf
from boxed_beef_am_parsing import basename_from_url, parse_date, parse_line
from boxed_beef_am_pdf import pdf_bytes_to_text

__all__ = ["log_failure", "main"]


def log_failure(message: str) -> None:
    """Append ``message`` to the shared failure log."""

    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(message.rstrip() + "\n")


def _iter_link_items() -> List[Tuple[Optional[datetime], str, str]]:
    if not LINKS_PATH.exists():
        raise SystemExit(f"Input list not found: {LINKS_PATH}")

    items: List[Tuple[Optional[datetime], str, str]] = []
    for line in LINKS_PATH.read_text(encoding="utf-8").splitlines():
        parsed = parse_line(line)
        if not parsed:
            continue
        date_str, url = parsed
        try:
            parsed_dt: Optional[datetime] = parse_date(date_str)
        except Exception as exc:
            print(
                f"[WARN] Bad date '{date_str}': {exc} — "
                "labeling as 'unknown-date'"
            )
            parsed_dt = None

        if SKIP_IF_TXT_EXISTS:
            ymd = parsed_dt.strftime("%Y-%m-%d") if parsed_dt else "unknown-date"
            base = f"{ymd}_{basename_from_url(url)}"
            out_txt = OUT_DIR / f"{base}.txt"
            if out_txt.exists():
                continue

        items.append((parsed_dt, date_str, url))

    if not items:
        print("[INFO] No valid lines found.")
        return []

    items.sort(key=lambda value: value[0] or datetime.min)
    return items


def _decode_text_response(resp):
    content = resp.content if resp.content else b"".join(resp.iter_content(32768))
    if not content:
        raise ValueError("Empty response body")

    is_pdf = sniff_is_pdf(resp, content[:8])
    resp._content = content  # cache for downstream consumers

    if is_pdf:
        text = pdf_bytes_to_text(content)
    else:
        encoding = resp.encoding or "utf-8"
        try:
            text = content.decode(encoding, errors="replace")
        except Exception:
            text = content.decode("utf-8", errors="replace")
    return text, content, is_pdf


def main() -> None:
    ensure_dirs()
    items = _iter_link_items()
    if not items:
        return

    stats: Dict[str, int] = {
        "total": len(items),
        "ok": 0,
        "errors": 0,
        "skipped": 0,
    }

    try:
        for dt, date_str, url in tqdm(
            items, desc="Processing Boxed Beef AM reports", unit="file"
        ):
            ymd = dt.strftime("%Y-%m-%d") if dt else "unknown-date"
            base = f"{ymd}_{basename_from_url(url)}"
            out_txt = OUT_DIR / f"{base}.txt"
            raw_pdf = OUT_DIR / f"{base}.pdf"

            try:
                response = fetch_response(url)
                try:
                    text, content, is_pdf = _decode_text_response(response)
                except Exception as exc:
                    if sniff_is_pdf(response, (response.content or b"")[:8]):
                        (FAIL_DIR / f"{base}.pdf").write_bytes(response.content)
                        log_failure(f"PDF-TO-TEXT-FAIL\t{date_str}\t{url}\t{exc}")
                        print(
                            f"\n[ERROR] Text extraction failed {date_str} {url}\n        {exc}"
                        )
                        stats["errors"] += 1
                        continue
                    raise

                if is_pdf and SAVE_RAW_PDF_ALONG:
                    raw_pdf.write_bytes(content)

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
