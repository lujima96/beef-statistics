"""Database access helpers for the supply/demand loader."""
from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple


def get_date_range(cur, start_after: Optional[date]) -> Tuple[Optional[date], Optional[date]]:
    cur.execute("SELECT MIN(report_date), MAX(report_date) FROM beef_data.index_reports_json")
    min_date, max_date = cur.fetchone()
    if not max_date:
        return None, None
    start_date = min_date if start_after is None else start_after + timedelta(days=1)
    if start_date and max_date and start_date > max_date:
        return None, None
    return start_date, max_date


def fetch_feature_rows(cur, start_date: date, end_date: date) -> List[Dict[str, Any]]:
    sql = """
    WITH cutout AS (
      SELECT report_date,
             (payload #>> '{daily_estimated_cutout_values,choice_cutout}')::numeric AS choice_cutout,
             (payload #>> '{daily_estimated_cutout_values,select_cutout}')::numeric AS select_cutout,
             (payload #>> '{daily_estimated_cutout_values,choice_select_spread}')::numeric AS spread
      FROM beef_data.catalog_reports_json
      WHERE report_code = 'LM_XB403'
    ),
    trims AS (
      SELECT report_date,
             (payload #>> '{current_volume,national,loads}')::numeric AS national_loads,
             (jsonb_path_query_first(payload, '$.sections.markets[*].lines[*] ? (@.lean_label == "Fresh 50%%" && @.category == "Chemical Lean")') ->> 'weighted_average')::numeric AS fresh50_price,
             (jsonb_path_query_first(payload, '$.sections.markets[*].lines[*] ? (@.lean_label == "Fresh 50%%" && @.category == "Chemical Lean")') ->> 'pounds')::numeric AS fresh50_pounds
      FROM beef_data.trimmings_am_reports_json
    ),
    idx AS (
      SELECT report_date,
             (payload #>> '{sections,national_daily_direct_cattle,live_steer,head}')::numeric AS live_steer_head,
             (payload #>> '{sections,national_daily_direct_cattle,live_steer,price}')::numeric AS live_steer_price
      FROM beef_data.index_reports_json
    )
    SELECT d.report_date, c.choice_cutout, c.select_cutout, c.spread,
           t.national_loads, t.fresh50_price,
           i.live_steer_head, i.live_steer_price
    FROM beef_data.report_dates d
    LEFT JOIN cutout c USING (report_date)
    LEFT JOIN trims t USING (report_date)
    LEFT JOIN idx i USING (report_date)
    WHERE d.report_date BETWEEN %s AND %s
    ORDER BY d.report_date
    """
    cur.execute(sql, (start_date, end_date))
    cols = [desc.name for desc in cur.description]
    rows: List[Dict[str, Any]] = []
    for rec in cur.fetchall():
        row = dict(zip(cols, rec))
        rows.append(row)
    return rows


def upsert_rows(cur, data: List[Dict[str, Any]]) -> None:
    if not data:
        return
    sql = """
    INSERT INTO beef_data.supply_demand_indices
      (report_date, demand_index, supply_index, demand_components, supply_components, coverage)
    VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s)
    ON CONFLICT (report_date) DO UPDATE
    SET demand_index = EXCLUDED.demand_index,
        supply_index = EXCLUDED.supply_index,
        demand_components = EXCLUDED.demand_components,
        supply_components = EXCLUDED.supply_components,
        coverage = EXCLUDED.coverage,
        ingested_at = now();
    """
    params = []
    for row in data:
        params.append(
            (
                row["report_date"],
                row["demand_index"],
                row["supply_index"],
                json.dumps(row["demand_components"]),
                json.dumps(row["supply_components"]),
                row["coverage"],
            )
        )
    cur.executemany(sql, params)
