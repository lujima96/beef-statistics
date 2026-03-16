"""Parsing helpers for the PM raw trimmings retriever."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

__all__ = ["basename_from_url", "parse_date", "parse_line"]


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
    last_err: Exception | None = None
    for fmt in fmts:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError as exc:
            last_err = exc
    raise ValueError(f"Unrecognized date format: {date_str!r} ({last_err})")


def basename_from_url(url: str) -> str:
    name = Path(url.split("?", 1)[0]).name
    for ext in (".PDF", ".pdf", ".TXT", ".txt"):
        if name.endswith(ext):
            name = name[: -len(ext)]
            break
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "report"
