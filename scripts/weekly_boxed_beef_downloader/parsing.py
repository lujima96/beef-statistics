"""HTML parsing utilities."""
from __future__ import annotations

import datetime as dt
from typing import List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .config import BASE_URL

AnchorResult = Tuple[Optional[dt.date], str]


def is_download_asset(href: str) -> bool:
    """Return ``True`` when *href* points at a report asset."""
    if not isinstance(href, str) or not href:
        return False
    path = (urlparse(href).path or "").lower()
    return path.endswith(".pdf") or path.endswith(".txt")


def _parse_report_date(text: str) -> Optional[dt.date]:
    value = text.strip()
    for fmt in ("%Y-%m-%d", "%m-%d-%Y"):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def parse_links(html: str) -> List[AnchorResult]:
    """Extract report document links and associated dates from *html*."""
    soup = BeautifulSoup(html, "html.parser")
    results: List[AnchorResult] = []
    for row in soup.select("table tbody tr"):
        date_cell = row.select_one("td.views-field-field-report-date")
        link = row.select_one("td.views-field-field-document a[href]")
        if date_cell is None or link is None:
            continue
        raw_href = link.get("href")
        if not isinstance(raw_href, str) or not is_download_asset(raw_href):
            continue
        report_date = _parse_report_date(date_cell.get_text(" ", strip=True))
        if report_date is None:
            continue
        href = urljoin(BASE_URL, raw_href)
        results.append((report_date, href))
    seen: Set[AnchorResult] = set()
    unique: List[AnchorResult] = []
    for item in results:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


__all__ = ["AnchorResult", "is_download_asset", "parse_links"]
