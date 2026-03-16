"""Configuration and directory handling for the Boxed Beef AM retriever."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

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
    "ensure_dirs",
]

_THIS_FILE = Path(__file__).resolve()

# Make sure ``scripts`` is importable when running this module as a script.
sys.path.insert(0, str(_THIS_FILE.parents[2]))

try:  # pragma: no cover - defensive fallback for standalone runs
    from scripts.config import LINKS_DIR, RAW_DIR  # type: ignore
except Exception:  # pragma: no cover - keep behaviour identical to original script
    ROOT_DIR = _THIS_FILE.parents[2]
    LINKS_DIR = ROOT_DIR / "links"
    RAW_DIR = ROOT_DIR / "beef_stats" / "raw"


LINKS_PATH = LINKS_DIR / "boxed_beef_am.txt"
OUT_DIR = RAW_DIR / "raw_boxed_am"
FAIL_DIR = OUT_DIR.parent / "raw_boxed_am_failed"
LOG_FILE = OUT_DIR.parent / "fetch_boxed_am_failures.log"

REQUEST_PAUSE_SEC: float = 0.05
TIMEOUT: tuple[int, int] = (10, 30)
MAX_RETRIES: int = 3
BACKOFF_BASE_SEC: float = 1.0
SAVE_RAW_PDF_ALONG: bool = False
SKIP_IF_TXT_EXISTS: bool = True

# The original script muted pdfminer logging globally; keep that behaviour here.
logging.getLogger("pdfminer").setLevel(logging.ERROR)


def ensure_dirs() -> None:
    """Create all directories required for output, failures and logging."""

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    FAIL_DIR.mkdir(parents=True, exist_ok=True)
    LOG_FILE.touch(exist_ok=True)
