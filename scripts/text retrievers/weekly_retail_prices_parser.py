"""HTML parsing helpers for the weekly retail prices retriever."""
from __future__ import annotations

import datetime as dt
from typing import List, Optional, Tuple
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from weekly_retail_prices_config import BASE_URL, is_pdf_asset


def _parse_report_date(text: str) -> Optional[dt.date]:
    value = text.strip()
    for fmt in ("%Y-%m-%d", "%m-%d-%Y"):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def parse_links(html: str) -> List[Tuple[dt.date, str]]:
    """Return a list of ``(date, url)`` pairs extracted from ``html``."""
    soup = BeautifulSoup(html, "html.parser")
    collected: List[Tuple[dt.date, str]] = []

    for row in soup.select("table tbody tr"):
        date_cell = row.select_one("td.views-field-field-report-date")
        anchor = row.select_one("td.views-field-field-document a[href]")
        if date_cell is None or anchor is None:
            continue
        href = anchor.get("href")
        if not isinstance(href, str) or not is_pdf_asset(href):
            continue
        parsed = _parse_report_date(date_cell.get_text(" ", strip=True))
        if parsed is None:
            continue
        collected.append((parsed, urljoin(BASE_URL, href)))

    unique: List[Tuple[dt.date, str]] = []
    seen = set()
    for entry in collected:
        if entry not in seen:
            seen.add(entry)
            unique.append(entry)
    return unique
