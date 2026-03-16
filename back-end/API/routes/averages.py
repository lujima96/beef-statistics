from __future__ import annotations

from datetime import date
from typing import List, Optional

import routes
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from config import config
from db import (
    PricePoint,
    fetch_cattle_price_timeseries,
    fetch_five_day_avg_timeseries,
    load_cattle_price_from_processed,
    load_five_day_avg_from_processed,
)

router = APIRouter()


@router.get("/api/five-day-avg/timeseries")
def get_five_day_avg_timeseries(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    steer: List[PricePoint] = []
    heifer: List[PricePoint] = []
    try:
        with routes.psycopg.connect(dsn) as conn:
            steer, heifer = fetch_five_day_avg_timeseries(
                conn, start_date=start_date, end_date=end_date
            )
    except routes.psycopg.OperationalError:
        pass
    if not steer and not heifer:
        s2, h2 = load_five_day_avg_from_processed(
            start_date=start_date, end_date=end_date
        )
        steer, heifer = s2, h2
    return JSONResponse({"series": {"steer": steer, "heifer": heifer}})


@router.get("/api/cattle-price/timeseries")
def get_cattle_price_timeseries(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    steer: List[PricePoint] = []
    heifer: List[PricePoint] = []
    try:
        with routes.psycopg.connect(dsn) as conn:
            steer, heifer = fetch_cattle_price_timeseries(
                conn, start_date=start_date, end_date=end_date
            )
    except routes.psycopg.OperationalError:
        pass
    if not steer and not heifer:
        s2, h2 = load_cattle_price_from_processed(
            start_date=start_date, end_date=end_date
        )
        steer, heifer = s2, h2
    return JSONResponse({"series": {"steer": steer, "heifer": heifer}})
