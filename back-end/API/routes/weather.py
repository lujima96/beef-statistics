from __future__ import annotations

import csv
from collections import defaultdict
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import routes
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from config import config
from db import fetch_weather_occurrences

router = APIRouter()
ROOT_DIR = Path(__file__).resolve().parents[3]
WEATHER_RAW_DIR = ROOT_DIR / "weather" / "raw"

WINDOW_DELTAS: Dict[str, Dict[str, int]] = {
    "last_week": {"days": 7},
    "last_month": {"months": 1},
    "last_3_months": {"months": 3},
    "last_year": {"months": 12},
    "last_3_years": {"months": 36},
}

WINDOW_ALIASES: Dict[str, str] = {
    "1w": "last_week",
    "1m": "last_month",
    "3m": "last_3_months",
    "1y": "last_year",
    "3y": "last_3_years",
}


def _resolve_window(raw: str) -> str:
    key = (raw or "").strip().lower()
    resolved = WINDOW_ALIASES.get(key, key)
    if resolved not in WINDOW_DELTAS:
        raise HTTPException(status_code=400, detail=f"Unsupported window: {raw}")
    return resolved


def _subtract_months(dt: date, months: int) -> date:
    if months <= 0:
        return dt

    year = dt.year
    month = dt.month - months
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _parse_yearmonth(value: str | None) -> Optional[date]:
    text = (value or "").strip()
    if len(text) != 6 or not text.isdigit():
        return None
    year = int(text[:4])
    month = int(text[4:])
    if month < 1 or month > 12:
        return None
    return date(year, month, 1)


@lru_cache(maxsize=32)
def _load_local_weather_year(path_str: str, mtime_ns: int) -> tuple[tuple[tuple[str, str, int], ...], str | None]:
    counts: dict[tuple[str, str], int] = defaultdict(int)
    latest_month: Optional[date] = None
    path = Path(path_str)

    with path.open("r", encoding="utf-8", newline="", errors="replace") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            month_start = _parse_yearmonth(
                row.get("BEGIN_YEARMONTH") or row.get("begin_yearmonth")
            )
            event_type = (row.get("EVENT_TYPE") or row.get("event_type") or "").strip()
            if month_start is None or not event_type:
                continue
            month_key = month_start.isoformat()
            counts[(month_key, event_type)] += 1
            if latest_month is None or month_start > latest_month:
                latest_month = month_start

    serialized = tuple(
        sorted((month_key, event_type, count) for (month_key, event_type), count in counts.items())
    )
    latest_key = latest_month.isoformat() if latest_month is not None else None
    return serialized, latest_key


def _iter_local_weather_files() -> List[Path]:
    return sorted(WEATHER_RAW_DIR.glob("weather_events_*.csv"))


def _latest_local_weather_month() -> Optional[date]:
    latest: Optional[date] = None
    for path in _iter_local_weather_files():
        _, latest_key = _load_local_weather_year(str(path), path.stat().st_mtime_ns)
        if not latest_key:
            continue
        month = date.fromisoformat(latest_key)
        if latest is None or month > latest:
            latest = month
    return latest


def _fetch_local_weather_occurrences(
    *,
    event_types: Optional[List[str]],
    start_date: date,
    end_date: date,
) -> List[Dict[str, Any]]:
    allowed_types = {value.strip() for value in event_types or [] if value and value.strip()}
    start_year = start_date.year
    end_year = end_date.year
    counts: dict[tuple[str, str], int] = defaultdict(int)

    for path in _iter_local_weather_files():
        try:
            year = int(path.stem.rsplit("_", 1)[-1])
        except ValueError:
            continue
        if year < start_year or year > end_year:
            continue
        rows, _ = _load_local_weather_year(str(path), path.stat().st_mtime_ns)
        for month_key, event_type, count in rows:
            month_start = date.fromisoformat(month_key)
            if month_start < start_date or month_start > end_date:
                continue
            if allowed_types and event_type not in allowed_types:
                continue
            counts[(month_key, event_type)] += count

    return [
        {
            "month_start": month_key,
            "event_type": event_type,
            "event_count": count,
        }
        for month_key, event_type, count in sorted(
            ((month_key, event_type, count) for (month_key, event_type), count in counts.items()),
            key=lambda item: (item[0], item[1]),
        )
    ]


@router.get("/api/weather/events")
def get_weather_events(
    window: str = Query("3y"),
    event_types: Optional[List[str]] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
) -> JSONResponse:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")

    resolved_window = _resolve_window(window)
    normalized_event_types: Optional[List[str]] = None
    if event_types:
        normalized_event_types = [et.strip() for et in event_types if et and et.strip()]
        if not normalized_event_types:
            normalized_event_types = None

    dsn = routes.pg_dsn_from_env(config)
    latest_month: Optional[date] = None

    try:
        with routes.psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT MAX(month_start) FROM beef_data.number_of_occurrences_monthly"
                )
                row = cur.fetchone()
            latest_month = row[0] if row else None

            if latest_month is None:
                latest_month = _latest_local_weather_month()
                if latest_month is None:
                    raise HTTPException(status_code=404, detail="No weather event data available.")

            end_bound = min(end_date, latest_month) if end_date else latest_month

            if start_date is not None:
                start_bound = start_date
            else:
                delta_info = WINDOW_DELTAS[resolved_window]
                if "months" in delta_info:
                    months = max(delta_info["months"] - 1, 0)
                    start_bound = _subtract_months(end_bound, months)
                else:
                    days = max(delta_info.get("days", 1) - 1, 0)
                    start_bound = end_bound - timedelta(days=days)

            if start_bound > end_bound:
                raise HTTPException(
                    status_code=404, detail="No weather event data available for requested window."
                )

            rows = fetch_weather_occurrences(
                conn,
                event_types=normalized_event_types,
                start_date=start_bound,
                end_date=end_bound,
            )
            if not rows:
                rows = _fetch_local_weather_occurrences(
                    event_types=normalized_event_types,
                    start_date=start_bound,
                    end_date=end_bound,
                )
    except routes.psycopg.errors.UndefinedTable:
        latest_month = _latest_local_weather_month()
        if latest_month is None:
            raise HTTPException(status_code=404, detail="No weather event data available.")

        end_bound = min(end_date, latest_month) if end_date else latest_month

        if start_date is not None:
            start_bound = start_date
        else:
            delta_info = WINDOW_DELTAS[resolved_window]
            if "months" in delta_info:
                months = max(delta_info["months"] - 1, 0)
                start_bound = _subtract_months(end_bound, months)
            else:
                days = max(delta_info.get("days", 1) - 1, 0)
                start_bound = end_bound - timedelta(days=days)

        if start_bound > end_bound:
            raise HTTPException(
                status_code=404, detail="No weather event data available for requested window."
            )

        rows = _fetch_local_weather_occurrences(
            event_types=normalized_event_types,
            start_date=start_bound,
            end_date=end_bound,
        )
    except routes.psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}")

    if not rows:
        raise HTTPException(status_code=404, detail="No weather event data available for requested filters.")

    actual_start = rows[0]["month_start"]
    payload: Dict[str, Any] = {
        "window": window,
        "resolved_window": resolved_window,
        "start_date": actual_start,
        "end_date": rows[-1]["month_start"],
        "event_types": normalized_event_types,
        "count": len(rows),
        "data": rows,
    }
    return JSONResponse(payload)
