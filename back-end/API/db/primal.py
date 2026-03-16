from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import List, Literal, Optional, Tuple

import psycopg
from psycopg import sql as psql

from sql_helpers import build_date_range_clause, json_path

from .core import Grade, Point, Primal, _parse_date_str, _repo_root_from_here

logger = logging.getLogger(__name__)


def fetch_series(
    conn: psycopg.Connection,
    *,
    table: Literal["boxed_am_reports_json", "boxed_pm_reports_json"],
    primal: Primal,
    grade: Grade,
    start_date: Optional[date],
    end_date: Optional[date],
) -> List[Point]:
    """Fetch primal price series for a given table, primal, and grade."""

    where_sql_parts: List[psql.SQL] = [
        psql.SQL("payload ? 'composite_primal_values'"),
        psql.SQL("payload -> 'composite_primal_values' ? %s"),
        psql.SQL("(payload #>> %s) IS NOT NULL"),
    ]
    jp = json_path("composite_primal_values", primal, grade)
    params: List[object] = [primal, jp]
    date_clause, date_params = build_date_range_clause(start_date, end_date)
    if date_clause is not None:
        where_sql_parts.append(date_clause)
    params.extend(date_params)

    where_sql = psql.SQL(" AND ").join(where_sql_parts)
    query = psql.SQL(
        """
        SELECT report_date::text AS d,
               (payload #>> %s)::numeric AS v
        FROM {}.{}
        WHERE {}
        ORDER BY report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier(table), where_sql)

    params_for_query = [jp] + params
    with conn.cursor() as cur:
        cur.execute(query, params_for_query)
        rows = cur.fetchall()
    out: List[Point] = []
    for d, v in rows:
        if v is None:
            continue
        try:
            out.append({"date": d, "value": float(v)})
        except (ValueError, TypeError):
            continue
        except Exception:
            logger.exception(
                "Unexpected error parsing series row for %s with value %r", d, v
            )
            continue
    return out


def fetch_subprimal_series(
    conn: psycopg.Connection,
    *,
    table: Literal["boxed_am_reports_json", "boxed_pm_reports_json"],
    imps: str,
    grade: Grade,
    label_hint: Optional[str],
    fat_limit: Optional[int],
    start_date: Optional[date],
    end_date: Optional[date],
) -> List[Point]:
    """Fetch sub-primal series filtered by IMPS code and optional hints."""

    where_sql_parts: List[psql.SQL] = [
        psql.SQL("payload ? 'sub_primal_negotiated_cut_prices'")
    ]
    params: List[object] = []
    date_clause, date_params = build_date_range_clause(start_date, end_date)
    if date_clause is not None:
        where_sql_parts.append(date_clause)
    params.extend(date_params)

    where_sql = psql.SQL(" AND ").join(where_sql_parts)
    extra_filter_sql = psql.SQL("")
    params_for_query_tail: List[object] = []
    if label_hint:
        extra_filter_sql = psql.SQL(" AND (elem->>'sub_primal') ILIKE %s")
        params_for_query_tail.append(f"%{label_hint}%")
    if fat_limit is not None:
        extra_filter_sql += psql.SQL(" AND (elem->>'fat_limit') = %s")
        params_for_query_tail.append(str(fat_limit))

    query = psql.SQL(
        """
        SELECT t.report_date::text AS d,
               (elem->>'weighted_average')::numeric AS v
        FROM {}.{} AS t,
             LATERAL jsonb_array_elements(t.payload->'sub_primal_negotiated_cut_prices'->%s) AS elem
        WHERE {}
          AND (elem->>'imps') = %s
          AND (elem->>'weighted_average') IS NOT NULL
          {}
        ORDER BY t.report_date ASC
        """
    ).format(
        psql.Identifier("beef_data"),
        psql.Identifier(table),
        where_sql,
        extra_filter_sql,
    )

    params_for_query: List[object] = [grade] + params + [imps] + params_for_query_tail
    with conn.cursor() as cur:
        cur.execute(query, params_for_query)
        rows = cur.fetchall()
    out: List[Point] = []
    for d, v in rows:
        if v is None:
            continue
        try:
            out.append({"date": d, "value": float(v)})
        except (ValueError, TypeError):
            continue
        except Exception:
            logger.exception(
                "Unexpected error parsing subprimal row for %s with value %r", d, v
            )
            continue
    return out


def fetch_boxed_ground_beef_series(
    conn: psycopg.Connection,
    *,
    table: Literal["boxed_am_reports_json", "boxed_pm_reports_json"],
    percent: int,
    start_date: Optional[date],
    end_date: Optional[date],
) -> List[Point]:
    """Fetch ground beef weighted-average prices for a lean percent."""

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
        SELECT t.report_date::text AS d,
               (elem->>'weighted_average')::numeric AS v
        FROM {}.{} AS t,
             LATERAL jsonb_array_elements(t.payload->'ground_beef') AS elem
        WHERE {}
          AND (elem->>'percent')::int = %s
          AND (elem->>'weighted_average') IS NOT NULL
        ORDER BY t.report_date ASC
        """
    ).format(psql.Identifier("beef_data"), psql.Identifier(table), where_sql)

    out: List[Point] = []
    with conn.cursor() as cur:
        cur.execute(q, params + [percent])
        for d, v in cur.fetchall():
            if v is None:
                continue
            try:
                out.append({"date": d, "value": float(v)})
            except (ValueError, TypeError):
                pass
            except Exception:
                logger.exception(
                    "Unexpected error parsing ground beef row for %s with value %r",
                    d,
                    v,
                )
    return out


def _load_boxed_subprimal_series_from_dir(
    dir_path: Path,
    *,
    grade: Grade,
    imps: str,
    label_hint: Optional[str],
    fat_limit: Optional[int],
    start_date: Optional[date],
    end_date: Optional[date],
) -> List[Point]:
    """Internal helper to load subprimal series records from disk."""

    series: List[Point] = []
    if not dir_path.exists():
        return series
    hint = (label_hint or "").strip().lower()
    fat_str = str(fat_limit) if fat_limit is not None else None
    for p in dir_path.glob("*.json"):
        dt = _parse_date_str(p.stem)
        if dt is None:
            continue
        if start_date and dt < start_date:
            continue
        if end_date and dt > end_date:
            continue
        try:
            obj = json.loads(p.read_text())
        except Exception:
            continue
        try:
            arr = obj.get("sub_primal_negotiated_cut_prices", {}).get(grade, [])
            for it in arr:
                if str(it.get("imps") or "") != imps:
                    continue
                if hint:
                    label = str(it.get("sub_primal") or "").lower()
                    if hint not in label:
                        continue
                if fat_str is not None:
                    if str(it.get("fat_limit") or "") != fat_str:
                        continue
                v = it.get("weighted_average")
                if v is None:
                    continue
                try:
                    series.append({"date": dt.isoformat(), "value": float(v)})
                except (ValueError, TypeError):
                    pass
        except Exception:
            continue
    series.sort(key=lambda x: x["date"])  # type: ignore[index]
    return series


def load_subprimal_series_from_processed(
    *,
    imps: str,
    grade: Grade,
    label_hint: Optional[str],
    fat_limit: Optional[int],
    start_date: Optional[date],
    end_date: Optional[date],
) -> Tuple[List[Point], List[Point]]:
    """Fallback loader for boxed subprimal series from processed files."""

    base = _repo_root_from_here() / "beef_stats" / "processed"
    dir_am = base / "processed_boxed_am"
    dir_pm = base / "processed_boxed_pm"
    if not dir_am.exists() or not dir_pm.exists():
        return [], []
    am = _load_boxed_subprimal_series_from_dir(
        dir_am,
        grade=grade,
        imps=imps,
        label_hint=label_hint,
        fat_limit=fat_limit,
        start_date=start_date,
        end_date=end_date,
    )
    pm = _load_boxed_subprimal_series_from_dir(
        dir_pm,
        grade=grade,
        imps=imps,
        label_hint=label_hint,
        fat_limit=fat_limit,
        start_date=start_date,
        end_date=end_date,
    )
    return am, pm


__all__ = [
    "fetch_series",
    "fetch_subprimal_series",
    "fetch_boxed_ground_beef_series",
    "load_subprimal_series_from_processed",
]
