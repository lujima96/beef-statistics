from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional

import routes
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from config import config
from db import (
    MarketParam,
    PricePoint,
    fetch_boxed_ground_beef_series,
    fetch_trimmings_options,
    fetch_trimmings_series,
    load_trimmings_options_from_processed,
    load_trimmings_series_from_processed,
)

router = APIRouter()


@router.get("/api/trimmings/boxed-gb/timeseries")
def get_trimmings_boxed_gb_timeseries(
    percent: int = Query(50, ge=0, le=99),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    am: List[PricePoint] = []
    pm: List[PricePoint] = []
    try:
        with routes.psycopg.connect(dsn) as conn:
            am = fetch_boxed_ground_beef_series(
                conn,
                table="boxed_am_reports_json",
                percent=percent,
                start_date=start_date,
                end_date=end_date,
            )
            pm = fetch_boxed_ground_beef_series(
                conn,
                table="boxed_pm_reports_json",
                percent=percent,
                start_date=start_date,
                end_date=end_date,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    return JSONResponse({"series": {"am": am, "pm": pm}})


@router.get("/api/trimmings/timeseries")
def get_trimmings_timeseries(
    label: str = Query("Fresh 50%"),
    market: MarketParam = Query("any"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> JSONResponse:
    def merge_pref(national: List[PricePoint], central: List[PricePoint]) -> List[PricePoint]:
        out: Dict[str, float] = {}
        for p in central:
            out[p["date"]] = p["value"]
        for p in national:
            out[p["date"]] = p["value"]
        return [{"date": d, "value": out[d]} for d in sorted(out.keys())]

    dsn = routes.pg_dsn_from_env(config)
    am: List[PricePoint] = []
    pm: List[PricePoint] = []
    try:
        with routes.psycopg.connect(dsn) as conn:
            if market == "any":
                am_nat = fetch_trimmings_series(
                    conn,
                    table="trimmings_am_reports_json",
                    market="national",
                    label=label,
                    start_date=start_date,
                    end_date=end_date,
                )
                am_cen = fetch_trimmings_series(
                    conn,
                    table="trimmings_am_reports_json",
                    market="central",
                    label=label,
                    start_date=start_date,
                    end_date=end_date,
                )
                pm_nat = fetch_trimmings_series(
                    conn,
                    table="trimmings_pm_reports_json",
                    market="national",
                    label=label,
                    start_date=start_date,
                    end_date=end_date,
                )
                pm_cen = fetch_trimmings_series(
                    conn,
                    table="trimmings_pm_reports_json",
                    market="central",
                    label=label,
                    start_date=start_date,
                    end_date=end_date,
                )
                am = merge_pref(am_nat, am_cen)
                pm = merge_pref(pm_nat, pm_cen)
            else:
                am = fetch_trimmings_series(
                    conn,
                    table="trimmings_am_reports_json",
                    market=market,
                    label=label,
                    start_date=start_date,
                    end_date=end_date,
                )
                pm = fetch_trimmings_series(
                    conn,
                    table="trimmings_pm_reports_json",
                    market=market,
                    label=label,
                    start_date=start_date,
                    end_date=end_date,
                )
    except routes.psycopg.OperationalError:
        pass

    # Fallback to processed files if DB unavailable or returned no rows
    if not am and not pm:
        if market == "any":
            # Load both and merge preference: national overrides central
            am_nat2, pm_nat2 = load_trimmings_series_from_processed(
                market="any", label=label, start_date=start_date, end_date=end_date
            )
            # For central, call with explicit market
            am_cen2, pm_cen2 = load_trimmings_series_from_processed(
                market="central", label=label, start_date=start_date, end_date=end_date
            )
            am = merge_pref(am_nat2, am_cen2)
            pm = merge_pref(pm_nat2, pm_cen2)
        else:
            am2, pm2 = load_trimmings_series_from_processed(
                market=market, label=label, start_date=start_date, end_date=end_date
            )
            am, pm = am2, pm2

    return JSONResponse({"series": {"am": am, "pm": pm}})


@router.get("/api/trimmings/options")
def get_trimmings_options() -> Dict[str, List[str]]:
    dsn = routes.pg_dsn_from_env(config)
    options: List[str] = []
    try:
        with routes.psycopg.connect(dsn) as conn:
            options = fetch_trimmings_options(conn)
    except routes.psycopg.OperationalError:
        pass
    if not options:
        options = load_trimmings_options_from_processed()
    return {"options": options}
