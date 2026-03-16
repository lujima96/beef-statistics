"""State helpers for weekly retail price downloads."""
from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Iterable, List, Optional, Set
from urllib.parse import urlparse

from weekly_retail_prices_config import LINKS_FILE, STATE_DIR


def scan_links_file(path: Path) -> Set[str]:
    """Return the set of URLs that have already been recorded in *path*."""
    if not path.exists():
        return set()
    urls: Set[str] = set()
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "," in line:
            _, url_part = line.rsplit(",", 1)
            urls.add(url_part.strip())
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


def format_date(date: dt.date) -> str:
    return date.strftime("%b %d, %Y").replace(" 0", " ")


def build_filename(date: dt.date, url: str) -> str:
    basename = Path(urlparse(url).path).name or "file.pdf"
    return f"{date.isoformat()}__{basename}"


def state_path(key: str) -> Path:
    return STATE_DIR / f"{key}.date"


def read_last_date(key: str) -> Optional[dt.date]:
    path = state_path(key)
    if not path.exists():
        return None
    try:
        content = path.read_text().strip()
        return dt.datetime.strptime(content, "%Y-%m-%d").date()
    except Exception:
        return None


def write_last_date(key: str, date: dt.date) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state_path(key).write_text(date.strftime("%Y-%m-%d"))


def prepend_links(new_lines: Iterable[str], *, path: Path = LINKS_FILE) -> None:
    existing_text = path.read_text(encoding="utf-8") if path.exists() else ""
    combined: List[str] = list(new_lines)
    if existing_text:
        combined.append(existing_text)
    path.write_text("\n".join(combined) + "\n", encoding="utf-8")
