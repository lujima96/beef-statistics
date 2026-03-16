from __future__ import annotations

from datetime import date
from typing import List, Optional

import routes
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from config import config
from db import (
    IndexSeries,
    SupplyDemandEqRow,
    SupplyDemandHeadRow,
    fetch_index_timeseries,
    fetch_supply_demand_timeseries,
    load_index_timeseries_from_processed,
    load_supply_demand_from_processed,
)

router = APIRouter()


@router.get("/api/index/timeseries")
def get_index_timeseries(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    report_id: Optional[str] = None,
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    choice: List[IndexSeries] = []
    select_: List[IndexSeries] = []
    try:
        with routes.psycopg.connect(dsn) as conn:
            choice, select_ = fetch_index_timeseries(
                conn,
                start_date=start_date,
                end_date=end_date,
                report_id=report_id,
            )
    except routes.psycopg.OperationalError as e:
        routes.logger.warning("DB unavailable for index timeseries: %s", e)
    if not choice and not select_:
        fallback_choice, fallback_select = load_index_timeseries_from_processed(
            start_date=start_date, end_date=end_date
        )
        choice, select_ = fallback_choice, fallback_select
    if not choice and not select_:
        raise HTTPException(status_code=503, detail="Index series data unavailable")
    return JSONResponse({"series": {"choice": choice, "select": select_}})


@router.get("/api/index/supply-demand/timeseries")
def get_supply_demand_timeseries(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    report_id: Optional[str] = None,
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    choice: List[SupplyDemandEqRow] = []
    select_: List[SupplyDemandEqRow] = []
    heads: List[SupplyDemandHeadRow] = []
    try:
        with routes.psycopg.connect(dsn) as conn:
            choice, select_, heads = fetch_supply_demand_timeseries(
                conn,
                start_date=start_date,
                end_date=end_date,
                report_id=report_id,
            )
    except routes.psycopg.OperationalError:
        pass

    if not choice and not select_ and not heads:
        c2, s2, h2 = load_supply_demand_from_processed(
            start_date=start_date, end_date=end_date
        )
        choice, select_, heads = c2, s2, h2

    return JSONResponse({"equivalent": {"choice": choice, "select": select_}, "heads": heads})
