"""Configuration and shared constants for weekly retail prices retrieval."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

try:
    from scripts.config import ROOT_DIR, BEEF_STATS_DIR
except Exception:  # pragma: no cover - fallback for standalone execution
    ROOT_DIR = Path(__file__).resolve().parents[2]
    BEEF_STATS_DIR = ROOT_DIR / "beef_stats"

STATE_DIR = ROOT_DIR / ".loader_state"
BASE_URL = (
    "https://mymarketnews.ams.usda.gov/filerepo/reports"
    "?field_slug_id_value=3228"
    "&name="
    "&field_slug_title_value="
    "&field_published_date_value="
    "&field_report_date_end_value="
    "&field_api_market_types_target_id=All"
    "&order="
    "&sort="
)
MYMARKETNEWS_HOST = "mymarketnews.ams.usda.gov"
OUT_DIR = BEEF_STATS_DIR / "pdfs" / "weekly_retail_prices"
LINKS_FILE = ROOT_DIR / "links" / "weekly_retail_prices.txt"


def is_pdf_asset(href: str) -> bool:
    """Return True if *href* appears to reference a PDF asset."""
    path = urlparse(href).path.lower()
    return path.endswith(".pdf")
