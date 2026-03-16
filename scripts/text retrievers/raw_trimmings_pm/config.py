"""Configuration and path helpers for the PM raw trimmings retriever."""

from __future__ import annotations

import logging
from pathlib import Path

try:  # Prefer shared config when available
    from scripts.config import LINKS_DIR, RAW_DIR  # type: ignore
except Exception:
    _THIS_FILE = Path(__file__).resolve()
    _ROOT_CANDIDATES = (_THIS_FILE.parents[i] for i in range(1, 6))

    _ROOT_DIR: Path | None = None
    for candidate in _ROOT_CANDIDATES:
        if (candidate / "links").exists():
            _ROOT_DIR = candidate
            break

    if _ROOT_DIR is None:
        raise RuntimeError("Unable to locate project root for raw trimmings retriever")

    LINKS_DIR = _ROOT_DIR / "links"
    RAW_DIR = _ROOT_DIR / "beef_stats" / "raw"

LINKS_PATH = LINKS_DIR / "boneless_trimmings_pm.txt"
OUT_DIR = RAW_DIR / "raw_trimmings_pm"
FAIL_DIR = OUT_DIR.parent / "raw_trimmings_pm_failed"
LOG_FILE = OUT_DIR.parent / "fetch_trimmings_pm_failures.log"

REQUEST_PAUSE_SEC: float = 0.05
TIMEOUT: tuple[int, int] = (10, 30)
MAX_RETRIES: int = 3
BACKOFF_BASE_SEC: float = 1.0
SAVE_RAW_PDF_ALONG: bool = False
SKIP_IF_TXT_EXISTS: bool = True

logging.getLogger("pdfminer").setLevel(logging.ERROR)

__all__ = [
    "BACKOFF_BASE_SEC",
    "FAIL_DIR",
    "LINKS_PATH",
    "LOG_FILE",
    "MAX_RETRIES",
    "OUT_DIR",
    "REQUEST_PAUSE_SEC",
    "SAVE_RAW_PDF_ALONG",
    "SKIP_IF_TXT_EXISTS",
    "TIMEOUT",
]
