"""Directory helpers for boxed AM processing."""

from __future__ import annotations

from pathlib import Path

from scripts.config import PROCESSED_DIR, RAW_DIR

RAW_BOXED_AM_DIR: Path = RAW_DIR / "raw_boxed_am"
PROCESSED_BOXED_AM_DIR: Path = PROCESSED_DIR / "processed_boxed_am"
