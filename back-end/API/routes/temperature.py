from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, Literal, Optional

import routes
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from config import config
from db import fetch_temperature_series, latest_temperature_observation_date

router = APIRouter()

TemperatureWindow = Literal[
    "last_week",
    "last_month",
    "last_3_months",
    "last_year",
    "last_3_years",
]

WINDOW_DAY_COUNTS: Dict[TemperatureWindow, int] = {
    "last_week": 7,
    "last_month": 30,
    "last_3_months": 90,
    "last_year": 365,
    "last_3_years": 365 * 3,
}


@router.get("/api/temperature/daily")
def get_temperature_daily(
    window: TemperatureWindow = Query("last_week"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
) -> JSONResponse:
    """Return national daily average temperatures for a predefined window.

    ``start_date``/``end_date`` can be supplied to override the default window so
    the API returns exactly the span a chart needs.
    """

    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")

    days = WINDOW_DAY_COUNTS[window]
    dsn = routes.pg_dsn_from_env(config)

    try:
        with routes.psycopg.connect(dsn) as conn:
            latest = latest_temperature_observation_date(conn)
            if latest is None:
                raise HTTPException(status_code=404, detail="No temperature data available.")

            end_bound = min(end_date, latest) if end_date else latest

            if start_date is not None:
                start_bound = start_date
            else:
                days = max(days, 1)
                start_bound = end_bound - timedelta(days=days - 1)

            if start_bound > end_bound:
                raise HTTPException(status_code=404, detail="No temperature data available for requested window.")

            series = fetch_temperature_series(conn, start_date=start_bound, end_date=end_bound)
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")

    if not series:
        raise HTTPException(status_code=404, detail="No temperature data available for requested window.")

    actual_start = series[0]["date"]
    payload: Dict[str, Any] = {
        "window": window,
        "start_date": actual_start,
        "end_date": end_bound.isoformat(),
        "requested_start_date": start_bound.isoformat(),
        "requested_end_date": end_bound.isoformat(),
        "count": len(series),
        "data": series,
    }
    return JSONResponse(payload)
