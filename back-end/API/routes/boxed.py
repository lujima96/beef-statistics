from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional, Tuple

import routes
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from psycopg import sql as psql

from config import config
from db import (
    Grade,
    Primal,
    fetch_subprimal_series,
    load_subprimal_series_from_processed,
)

router = APIRouter()


@router.get("/api/boxed-primals/timeseries")
def get_boxed_primals_timeseries(
    primal: Primal,
    grade: Grade,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            am = routes.fetch_series(
                conn,
                table="boxed_am_reports_json",
                primal=primal,
                grade=grade,
                start_date=start_date,
                end_date=end_date,
            )
            pm = routes.fetch_series(
                conn,
                table="boxed_pm_reports_json",
                primal=primal,
                grade=grade,
                start_date=start_date,
                end_date=end_date,
            )
    except routes.psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {e}")
    return JSONResponse({"primal": primal, "grade": grade, "series": {"am": am, "pm": pm}})


@router.get("/api/boxed-primals/meta")
def get_boxed_primals_meta() -> Dict[str, List[str]]:
    return {
        "primals": [
            "primal_rib",
            "primal_chuck",
            "primal_round",
            "primal_loin",
            "primal_brisket",
            "primal_short_plate",
            "primal_flank",
        ],
        "grades": ["choice", "select"],
    }


@router.get("/api/boxed-subprimals/options")
def get_boxed_subprimal_options() -> Dict[str, List[Dict[str, str]]]:
    def expand_code(imps: str, label: str, fat_limit: Optional[str]) -> Tuple[str, str]:
        text = (label or "").lower()
        if imps == "112A":
            if "light" in text:
                return ("112A_L", label)
            if "heavy" in text:
                return ("112A_H", label)
        if imps == "168" and fat_limit and fat_limit.isdigit():
            return (f"168_{fat_limit}", label)
        if imps == "175" and "bnls" in text:
            return ("175_BNLS", label)
        return (imps, label)

    options: Dict[str, str] = {}
    dsn = routes.pg_dsn_from_env(config)
    try:
        with routes.psycopg.connect(dsn) as conn:
            for table in ("boxed_am_reports_json", "boxed_pm_reports_json"):
                q = psql.SQL(
                    """
                    SELECT DISTINCT elem->>'imps', elem->>'sub_primal', elem->>'fat_limit'
                    FROM {}.{} AS t,
                         LATERAL jsonb_array_elements(t.payload->'sub_primal_negotiated_cut_prices'->'choice') AS elem
                    WHERE (elem->>'imps') IS NOT NULL
                    UNION
                    SELECT DISTINCT elem->>'imps', elem->>'sub_primal', elem->>'fat_limit'
                    FROM {}.{} AS t,
                         LATERAL jsonb_array_elements(t.payload->'sub_primal_negotiated_cut_prices'->'select') AS elem
                    WHERE (elem->>'imps') IS NOT NULL
                    UNION
                    SELECT DISTINCT elem->>'imps', elem->>'sub_primal', elem->>'fat_limit'
                    FROM {}.{} AS t,
                         LATERAL jsonb_array_elements(t.payload->'sub_primal_negotiated_cut_prices'->'mixed') AS elem
                    WHERE (elem->>'imps') IS NOT NULL
                    """
                ).format(
                    psql.Identifier("beef_data"), psql.Identifier(table),
                    psql.Identifier("beef_data"), psql.Identifier(table),
                    psql.Identifier("beef_data"), psql.Identifier(table),
                )
                with conn.cursor() as cur:
                    cur.execute(q)
                    for imps, label, fat_limit in cur.fetchall():
                        code, lab = expand_code(imps or "", label or "", fat_limit)
                        if code:
                            options.setdefault(code, lab)
    except routes.psycopg.OperationalError:
        pass

    return {"options": [{"code": k, "label": v} for k, v in sorted(options.items())]}


@router.get("/api/boxed-subprimals/timeseries")
def get_boxed_subprimals_timeseries(
    imps: str,
    grade: Grade,
    label_hint: Optional[str] = None,
    fat_limit: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> JSONResponse:
    dsn = routes.pg_dsn_from_env(config)
    am: List[routes.Point] = []
    pm: List[routes.Point] = []
    try:
        with routes.psycopg.connect(dsn) as conn:
            am = fetch_subprimal_series(
                conn,
                table="boxed_am_reports_json",
                imps=imps,
                grade=grade,
                label_hint=label_hint,
                fat_limit=fat_limit,
                start_date=start_date,
                end_date=end_date,
            )
            pm = fetch_subprimal_series(
                conn,
                table="boxed_pm_reports_json",
                imps=imps,
                grade=grade,
                label_hint=label_hint,
                fat_limit=fat_limit,
                start_date=start_date,
                end_date=end_date,
            )
    except routes.psycopg.OperationalError:
        pass
    # Fallback to processed files when DB is unavailable or has no rows
    if not am and not pm:
        am, pm = load_subprimal_series_from_processed(
            imps=imps,
            grade=grade,
            label_hint=label_hint,
            fat_limit=fat_limit,
            start_date=start_date,
            end_date=end_date,
        )
    return JSONResponse({"imps": imps, "grade": grade, "series": {"am": am, "pm": pm}})
