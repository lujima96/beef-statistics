"""Configuration constants for the weekly boxed beef downloader."""
from __future__ import annotations

from pathlib import Path

try:
    from scripts.config import ROOT_DIR, BEEF_STATS_DIR  # type: ignore
except Exception:  # pragma: no cover - fallback for direct execution
    ROOT_DIR = Path(__file__).resolve().parents[2]
    BEEF_STATS_DIR = ROOT_DIR / "beef_stats"

STATE_DIR = ROOT_DIR / ".loader_state"

BASE_URL = (
    "https://mymarketnews.ams.usda.gov/filerepo/reports"
    "?field_slug_id_value=2461"
    "&name="
    "&field_slug_title_value="
    "&field_published_date_value="
    "&field_report_date_end_value="
    "&field_api_market_types_target_id=All"
    "&order="
    "&sort="
)
MYMARKETNEWS_HOST = "mymarketnews.ams.usda.gov"
OUT_DIR = BEEF_STATS_DIR / "pdfs" / "weekly_boxed_beef"
LINKS_FILE = ROOT_DIR / "links" / "weekly_boxed_beef.txt"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)

__all__ = [
    "BASE_URL",
    "MYMARKETNEWS_HOST",
    "OUT_DIR",
    "LINKS_FILE",
    "USER_AGENT",
    "STATE_DIR",
]
