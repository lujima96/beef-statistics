"""State and bookkeeping helpers."""
from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Optional, Set

from .config import STATE_DIR


def scan_links(path: Path) -> Set[str]:
    """Return previously recorded download URLs."""
    if not path.exists():
        return set()
    urls: Set[str] = set()
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "," in line:
            _, url = line.rsplit(",", 1)
            urls.add(url.strip())
        elif line.strip().startswith("http"):
            urls.add(line.strip())
    return urls


def scan_latest_date(path: Path) -> Optional[dt.date]:
    """Return the newest parsable date in the links file."""
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "," not in line:
            continue
        date_part, _ = line.rsplit(",", 1)
        try:
            return dt.datetime.strptime(date_part.strip(), "%b %d, %Y").date()
        except ValueError:
            continue
    return None


def format_date(value: Optional[dt.date]) -> str:
    if value is None:
        return ""
    return value.strftime("%b %d, %Y").replace(" 0", " ")


def _state_path(key: str) -> Path:
    return STATE_DIR / f"{key}.date"


def read_last_date(key: str) -> Optional[dt.date]:
    try:
        path = _state_path(key)
        if not path.exists():
            return None
        content = path.read_text().strip()
        return dt.datetime.strptime(content, "%Y-%m-%d").date()
    except Exception:
        return None


def write_last_date(key: str, value: dt.date) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _state_path(key).write_text(value.strftime("%Y-%m-%d"))


__all__ = ["scan_latest_date", "scan_links", "format_date", "read_last_date", "write_last_date"]
