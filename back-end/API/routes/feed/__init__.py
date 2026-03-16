"""Feed route package."""

from __future__ import annotations

from db import fetch_feed_attribute_series, fetch_feed_timeseries

from .timeseries import router

__all__ = [
    "router",
    "fetch_feed_timeseries",
    "fetch_feed_attribute_series",
]
