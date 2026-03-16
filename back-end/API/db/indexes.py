from __future__ import annotations

import logging
from datetime import date
from typing import List, Optional, Tuple

import psycopg
from psycopg import sql as psql

from sql_helpers import build_date_range_clause, json_path

from .core import IndexSeries, PricePoint, SupplyDemandEqRow, SupplyDemandHeadRow

logger = logging.getLogger(__name__)


def fetch_index_timeseries(
    conn: psycopg.Connection,
    *,
    start_date: Optional[date],
    end_date: Optional[date],
    report_id: Optional[str] = None,
) -> Tuple[List[IndexSeries], List[IndexSeries]]:
    """Fetch Index report time series (choice/select values)."""

    where_sql_parts: List[psql.SQL] = []
    params: List[object] = []
    if report_id:
        where_sql_parts.append(psql.SQL("report_id = %s"))
        params.append(report_id)
    date_clause, date_params = build_date_range_clause(start_date, end_date)
    if date_clause is not None:
        where_sql_parts.append(date_clause)
    params.extend(date_params)
    where_sql = (
        psql.SQL(" AND ").join(where_sql_parts) if where_sql_parts else psql.SQL("TRUE")
    )

    query = psql.SQL(
        """
        SELECT report_date::text AS d,
               (payload #>> %s)::numeric AS choice_val,
               (payload #>> %s)::numeric AS select_val
        FROM {}.{}
        WHERE {}
        ORDER BY report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("index_reports_json"), where_sql)

    json_choice = json_path("sections", "beef_carcass_index", "choice", "value")
    json_select = json_path("sections", "beef_carcass_index", "select", "value")
    with conn.cursor() as cur:
        cur.execute(query, [json_choice, json_select] + params)
        rows = cur.fetchall()

    choice: List[IndexSeries] = []
    select_: List[IndexSeries] = []
    for d, cv, sv in rows:
        if cv is not None:
            try:
                choice.append({"date": d, "value": float(cv)})
            except (ValueError, TypeError):
                pass
            except Exception:
                logger.exception(
                    "Unexpected error parsing choice index for %s with value %r", d, cv
                )
        if sv is not None:
            try:
                select_.append({"date": d, "value": float(sv)})
            except (ValueError, TypeError):
                pass
            except Exception:
                logger.exception(
                    "Unexpected error parsing select index for %s with value %r", d, sv
                )
    return choice, select_


def fetch_supply_demand_timeseries(
    conn: psycopg.Connection,
    *,
    start_date: Optional[date],
    end_date: Optional[date],
    report_id: Optional[str] = None,
) -> Tuple[
    List[SupplyDemandEqRow],
    List[SupplyDemandEqRow],
    List[SupplyDemandHeadRow],
]:
    """Return supply/demand equivalent and head-count time series."""

    where_sql_parts: List[psql.SQL] = []
    params: List[object] = []
    if report_id:
        where_sql_parts.append(psql.SQL("report_id = %s"))
        params.append(report_id)
    date_clause, date_params = build_date_range_clause(start_date, end_date)
    if date_clause is not None:
        where_sql_parts.append(date_clause)
    params.extend(date_params)
    where_sql = (
        psql.SQL(" AND ").join(where_sql_parts) if where_sql_parts else psql.SQL("TRUE")
    )

    query = psql.SQL(
        """
        SELECT report_date::text AS d,
               (payload #>> %s)::numeric AS supply_choice_eq,
               (payload #>> %s)::numeric AS demand_choice_eq,
               (payload #>> %s)::numeric AS supply_select_eq,
               (payload #>> %s)::numeric AS demand_select_eq,
               (payload #>> %s)::integer AS supply_head,
               (payload #>> %s)::integer AS demand_head
        FROM {}.{}
        WHERE {}
        ORDER BY report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("index_reports_json"), where_sql)

    jc_supply_choice = json_path(
        "sections", "supply_demand", "supply", "equivalent", "choice"
    )
    jc_demand_choice = json_path(
        "sections", "supply_demand", "demand", "equivalent", "choice"
    )
    jc_supply_select = json_path(
        "sections", "supply_demand", "supply", "equivalent", "select"
    )
    jc_demand_select = json_path(
        "sections", "supply_demand", "demand", "equivalent", "select"
    )
    jc_supply_head = json_path("sections", "supply_demand", "supply", "head")
    jc_demand_head = json_path("sections", "supply_demand", "demand", "head")

    with conn.cursor() as cur:
        cur.execute(
            query,
            [
                jc_supply_choice,
                jc_demand_choice,
                jc_supply_select,
                jc_demand_select,
                jc_supply_head,
                jc_demand_head,
                *params,
            ],
        )
        rows = cur.fetchall()

    choice: List[SupplyDemandEqRow] = []
    select_: List[SupplyDemandEqRow] = []
    heads: List[SupplyDemandHeadRow] = []
    for d, sc_eq, dc_eq, ss_eq, ds_eq, s_head, d_head in rows:
        if sc_eq is not None or dc_eq is not None:
            try:
                choice.append(
                    {
                        "date": d,
                        "supply": float(sc_eq) if sc_eq is not None else None,  # type: ignore[arg-type]
                        "demand": float(dc_eq) if dc_eq is not None else None,  # type: ignore[arg-type]
                    }
                )
            except (ValueError, TypeError):
                pass
            except Exception:
                logger.exception(
                    "Unexpected error parsing supply/demand choice row for %s: %r %r",
                    d,
                    sc_eq,
                    dc_eq,
                )
        if ss_eq is not None or ds_eq is not None:
            try:
                select_.append(
                    {
                        "date": d,
                        "supply": float(ss_eq) if ss_eq is not None else None,  # type: ignore[arg-type]
                        "demand": float(ds_eq) if ds_eq is not None else None,  # type: ignore[arg-type]
                    }
                )
            except (ValueError, TypeError):
                pass
            except Exception:
                logger.exception(
                    "Unexpected error parsing supply/demand select row for %s: %r %r",
                    d,
                    ss_eq,
                    ds_eq,
                )
        try:
            heads.append(
                {
                    "date": d,
                    "supply": int(s_head) if s_head is not None else 0,
                    "demand": int(d_head) if d_head is not None else 0,
                }
            )
        except (ValueError, TypeError):
            pass
        except Exception:
            logger.exception(
                "Unexpected error parsing head counts for %s: %r %r",
                d,
                s_head,
                d_head,
            )

    return choice, select_, heads


def fetch_five_day_avg_timeseries(
    conn: psycopg.Connection,
    *,
    start_date: Optional[date],
    end_date: Optional[date],
) -> Tuple[List[PricePoint], List[PricePoint]]:
    """Fetch Live Steer/Heifer 5-day average prices."""

    where_sql_parts: List[psql.SQL] = []
    params: List[object] = []
    date_clause, date_params = build_date_range_clause(start_date, end_date)
    if date_clause is not None:
        where_sql_parts.append(date_clause)
    params.extend(date_params)
    where_sql = (
        psql.SQL(" AND ").join(where_sql_parts) if where_sql_parts else psql.SQL("TRUE")
    )

    query = psql.SQL(
        """
        SELECT t.report_date::text AS d,
               lower(elem->>'type') AS typ,
               (elem->>'avg_price')::numeric AS price
        FROM {}.{} AS t,
             LATERAL jsonb_array_elements(t.payload->'five_area_weekly_avg_cattle_price'->'categories') AS elem
        WHERE {}
          AND t.payload ? 'five_area_weekly_avg_cattle_price'
          AND (t.payload->'five_area_weekly_avg_cattle_price' ? 'categories')
          AND lower(elem->>'type') IN ('live steer','live steers','live heifer','live heifers')
        ORDER BY t.report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("catalog_reports_json"), where_sql)

    steer: List[PricePoint] = []
    heifer: List[PricePoint] = []
    with conn.cursor() as cur:
        cur.execute(query, params)
        for d, typ, price in cur.fetchall():
            if price is None:
                continue
            try:
                p = {"date": d, "value": float(price)}
            except (ValueError, TypeError):
                continue
            except Exception:
                logger.exception(
                    "Unexpected error parsing five-day avg row for %s with value %r",
                    d,
                    price,
                )
                continue
            if typ.startswith("live steer"):
                steer.append(p)
            elif typ.startswith("live heifer"):
                heifer.append(p)
    return steer, heifer


def fetch_cattle_price_timeseries(
    conn: psycopg.Connection,
    *,
    start_date: Optional[date],
    end_date: Optional[date],
) -> Tuple[List[PricePoint], List[PricePoint]]:
    """Fetch live cattle price (steer/heifer) from index reports."""

    where_sql_parts: List[psql.SQL] = []
    params: List[object] = []
    date_clause, date_params = build_date_range_clause(start_date, end_date)
    if date_clause is not None:
        where_sql_parts.append(date_clause)
    params.extend(date_params)
    where_sql = (
        psql.SQL(" AND ").join(where_sql_parts) if where_sql_parts else psql.SQL("TRUE")
    )

    q = psql.SQL(
        """
        SELECT report_date::text AS d,
               (payload #>> %s)::numeric AS steer,
               (payload #>> %s)::numeric AS heifer
        FROM {}.{}
        WHERE {}
        ORDER BY report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier("index_reports_json"), where_sql)

    jp_steer = json_path(
        "sections", "national_daily_direct_cattle", "live_steer", "price"
    )
    jp_heifer = json_path(
        "sections", "national_daily_direct_cattle", "live_heifer", "price"
    )
    with conn.cursor() as cur:
        cur.execute(q, [jp_steer, jp_heifer] + params)
        rows = cur.fetchall()

    steer: List[PricePoint] = []
    heifer: List[PricePoint] = []
    for d, sv, hv in rows:
        if sv is not None:
            try:
                steer.append({"date": d, "value": float(sv)})
            except (ValueError, TypeError):
                pass
            except Exception:
                logger.exception(
                    "Unexpected error parsing steer price for %s with value %r", d, sv
                )
        if hv is not None:
            try:
                heifer.append({"date": d, "value": float(hv)})
            except (ValueError, TypeError):
                pass
            except Exception:
                logger.exception(
                    "Unexpected error parsing heifer price for %s with value %r", d, hv
                )
    return steer, heifer


__all__ = [
    "fetch_index_timeseries",
    "fetch_supply_demand_timeseries",
    "fetch_five_day_avg_timeseries",
    "fetch_cattle_price_timeseries",
]
