"""Manage loader state for supply/demand indices."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from .paths import STATE_DIR, STATE_FILE


def read_last_date() -> Optional[date]:
    """Return the most recently processed report date."""
    if not STATE_FILE.exists():
        return None
    try:
        txt = STATE_FILE.read_text().strip()
        if not txt:
            return None
        return datetime.strptime(txt, "%Y-%m-%d").date()
    except Exception:  # pragma: no cover - defensive safety
        return None


def write_last_date(dt: date) -> None:
    """Persist the most recently processed report date."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(dt.strftime("%Y-%m-%d"))
