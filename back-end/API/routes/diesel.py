from __future__ import annotations

import csv
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

import routes
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from config import config
from db import fetch_diesel_series, latest_diesel_price_date

router = APIRouter()
ROOT_DIR = Path(__file__).resolve().parents[3]
DIESEL_CSV_PATH = ROOT_DIR / "csv" / "energy" / "ulds_weekly_retail_prices.csv"

WINDOW_DAY_COUNTS: Dict[str, int] = {
    "last_week": 7,
    "last_month": 30,
    "last_3_months": 90,
    "last_year": 365,
    "last_3_years": 365 * 3,
}

def _resolve_window(raw: str) -> str:
    key = (raw or "").strip().lower()
    aliases = {
        "1w": "last_week",
        "1m": "last_month",
        "3m": "last_3_months",
        "1y": "last_year",
        "3y": "last_3_years",
    }
    resolved = aliases.get(key, key)
    if resolved not in WINDOW_DAY_COUNTS:
        raise HTTPException(status_code=400, detail=f"Unsupported window: {raw}")
    return resolved


@lru_cache(maxsize=8)
def _load_local_diesel_rows(path_str: str, mtime_ns: int) -> tuple[tuple[str, float], ...]:
    rows: list[tuple[str, float]] = []
    path = Path(path_str)
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            day = (row.get("date") or "").strip()
            value = (row.get("diesel_dollars_per_gallon") or "").strip()
            if not day or not value:
                continue
            try:
                rows.append((date.fromisoformat(day).isoformat(), float(value)))
            except ValueError:
                continue
    rows.sort(key=lambda item: item[0])
    return tuple(rows)


def _fetch_local_diesel_series(*, start_date: Optional[date], end_date: date) -> list[dict[str, float | str]]:
    if not DIESEL_CSV_PATH.exists():
        return []
    rows = _load_local_diesel_rows(str(DIESEL_CSV_PATH), DIESEL_CSV_PATH.stat().st_mtime_ns)
    out: list[dict[str, float | str]] = []
    for day_text, value in rows:
        day = date.fromisoformat(day_text)
        if day > end_date:
            continue
        if start_date is not None and day < start_date:
            continue
        out.append({"date": day_text, "diesel_dollars_per_gallon": value})
    return out


def _latest_local_diesel_date() -> Optional[date]:
    if not DIESEL_CSV_PATH.exists():
        return None
    rows = _load_local_diesel_rows(str(DIESEL_CSV_PATH), DIESEL_CSV_PATH.stat().st_mtime_ns)
    if not rows:
        return None
    return date.fromisoformat(rows[-1][0])


@router.get("/api/energy/diesel")
def get_diesel_prices(
    window: str = Query("1w"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
) -> JSONResponse:
    """Return weekly U.S. ULSD retail prices for a requested window."""

    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")

    resolved_window = _resolve_window(window)
    days = WINDOW_DAY_COUNTS[resolved_window]
    start_bound: Optional[date] = None
    dsn = routes.pg_dsn_from_env(config)
    end_bound: Optional[date] = None

    try:
        with routes.psycopg.connect(dsn) as conn:
            latest = latest_diesel_price_date(conn)
            if latest is None:
                latest = _latest_local_diesel_date()
                if latest is None:
                    raise HTTPException(status_code=404, detail="No diesel price data available.")

            end_bound = min(end_date, latest) if end_date else latest

            if start_date is not None:
                start_bound = start_date
            else:
                days = max(days, 1)
                start_bound = end_bound - timedelta(days=days - 1)

            if start_bound > end_bound:
                raise HTTPException(status_code=404, detail="No diesel price data available for requested window.")

            series = fetch_diesel_series(conn, start_date=start_bound, end_date=end_bound)
            if not series:
                series = _fetch_local_diesel_series(start_date=start_bound, end_date=end_bound)
    except routes.psycopg.errors.UndefinedTable:
        latest = _latest_local_diesel_date()
        if latest is None:
            raise HTTPException(status_code=404, detail="No diesel price data available.")

        end_bound = min(end_date, latest) if end_date else latest

        if start_date is not None:
            start_bound = start_date
        else:
            days = max(days, 1)
            start_bound = end_bound - timedelta(days=days - 1)

        if start_bound > end_bound:
            raise HTTPException(status_code=404, detail="No diesel price data available for requested window.")

        series = _fetch_local_diesel_series(start_date=start_bound, end_date=end_bound)
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}")

    if not series:
        raise HTTPException(status_code=404, detail="No diesel price data available for requested window.")

    if start_bound is None:
        raise HTTPException(status_code=500, detail="Failed to determine start date for diesel data.")

    actual_start = series[0]["date"]
    start_bound_iso = start_bound.isoformat()
    payload: Dict[str, Any] = {
        "window": window,
        "resolved_window": resolved_window,
        "start_date": actual_start,
        "end_date": end_bound.isoformat(),
        "requested_start_date": start_bound_iso,
        "requested_end_date": end_bound.isoformat(),
        "count": len(series),
        "data": series,
    }
    return JSONResponse(payload)
