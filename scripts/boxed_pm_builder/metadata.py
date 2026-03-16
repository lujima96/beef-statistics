"""Helpers for extracting metadata from boxed PM reports."""

from __future__ import annotations

import re
from datetime import datetime

MONTHS_REGEX = (
    "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"
    "Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
)


def extract_report_id(text: str) -> str | None:
    match = re.search(r"(LM_XB\d{3}|AMS_\d+)", text)
    if match:
        return match.group(1)
    return None


def extract_report_date(text: str) -> str | None:
    match = re.search(rf"({MONTHS_REGEX})\s+\d{{1,2}},\s+\d{{4}}", text)
    if not match:
        return None

    raw_date = match.group(0)
    for fmt in ("%B %d, %Y", "%b %d, %Y"):
        try:
            dt = datetime.strptime(raw_date, fmt)
        except ValueError:
            continue
        else:
            return dt.strftime("%Y-%m-%d")
    return None


def extract_location(text: str) -> str | None:
    match = re.search(r"Source:.*?,\s*([A-Za-z .]+,\s*[A-Z]{2})", text)
    if not match:
        match = re.search(r"([A-Za-z .]+,\s*[A-Z]{2})\s*\|", text)
    if match:
        return match.group(1).strip()
    return None


def extract_source(text: str) -> str | None:
    match = re.search(r"Source:\s*([^\n]+)", text)
    if not match:
        return None

    source_text = match.group(1)
    source_text = re.sub(r"Page.*", "", source_text)
    source_text = re.sub(r",\s*[A-Za-z .]+,\s*[A-Z]{2}.*", "", source_text)
    return source_text.strip() or None
