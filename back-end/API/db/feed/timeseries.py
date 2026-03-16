"""Feed data access helpers."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, Iterable, List, Optional, Sequence

import psycopg
from psycopg import sql as psql

from sql_helpers import build_date_range_clause

from ..core import FeedDataPoint
from .columns import _fetch_column_map, _require_column, _resolve_column


def _normalize_list(values: Optional[Iterable[str]]) -> Optional[List[str]]:
    if not values:
        return None
    normalized = [v.strip() for v in values if v and v.strip()]
    return normalized or None


def _normalize_attribute(value: Optional[object]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _gather_attribute_values(
    conn: psycopg.Connection,
    *,
    schema: str,
    table: str,
    table_name_column: str,
    attribute_column: str,
    table_name: str,
) -> List[str]:
    query = psql.SQL(
        """
        SELECT DISTINCT {attribute_col}
        FROM {schema}.{table}
        WHERE {table_name_col} = %s
    """
    ).format(
        attribute_col=psql.Identifier(attribute_column),
        schema=psql.Identifier(schema),
        table=psql.Identifier(table),
        table_name_col=psql.Identifier(table_name_column),
    )

    with conn.cursor() as cur:
        cur.execute(query, (table_name,))
        rows = cur.fetchall()

    values: List[str] = []
    for (value,) in rows:
        normalized = _normalize_attribute(value)
        if normalized:
            values.append(normalized)
    return values


def _match_attribute_values(
    candidates: Sequence[str],
    requested: str,
) -> List[str]:
    normalized_requested = requested.strip()
    if not normalized_requested:
        return []

    folded_requested = normalized_requested.casefold()
    normalized_candidates = [
        (value, value.casefold()) for value in candidates if value
    ]

    exact = [value for value, folded in normalized_candidates if folded == folded_requested]
    if exact:
        # Preserve order of appearance but remove duplicates
        return list(dict.fromkeys(exact))

    prefix = [
        value for value, folded in normalized_candidates if folded.startswith(folded_requested)
    ]
    if prefix:
        return list(dict.fromkeys(prefix))

    contains = [
        value for value, folded in normalized_candidates if folded_requested in folded
    ]
    if contains:
        return list(dict.fromkeys(contains))

    return []


def _resolve_attribute_filters(
    conn: psycopg.Connection,
    *,
    schema: str,
    table: str,
    table_name_column: str,
    attribute_column: str,
    table_name: str,
    requested_attribute: str,
) -> List[str]:
    candidates = _gather_attribute_values(
        conn,
        schema=schema,
        table=table,
        table_name_column=table_name_column,
        attribute_column=attribute_column,
        table_name=table_name,
    )
    if not candidates:
        return []
    return _match_attribute_values(candidates, requested_attribute)


def _resolve_multiple_attributes(
    conn: psycopg.Connection,
    *,
    schema: str,
    table: str,
    table_name_column: str,
    attribute_column: str,
    table_name: str,
    requested_attributes: Sequence[str],
) -> List[str]:
    """Resolve a sequence of requested attributes to concrete column values."""

    resolved: List[str] = []
    seen: set[str] = set()
    for attr in requested_attributes:
        if not attr:
            continue
        try:
            matches = _resolve_attribute_filters(
                conn,
                schema=schema,
                table=table,
                table_name_column=table_name_column,
                attribute_column=attribute_column,
                table_name=table_name,
                requested_attribute=attr,
            )
        except Exception:
            matches = None

        values = matches or [attr]
        for value in values:
            normalized = value.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            resolved.append(normalized)
    return resolved


def fetch_feed_timeseries(
    conn: psycopg.Connection,
    *,
    schema: str,
    source_table: str,
    table_name: str,
    attribute: Optional[str],
    geography: Optional[str],
    frequency: Optional[str],
    timeperiod: Optional[str],
    commodities: Optional[Iterable[str]],
    start_date: Optional[date],
    end_date: Optional[date],
    limit: int = 5000,
) -> Dict[str, List[FeedDataPoint]]:
    """Fetch normalized feed data ready for charting."""

    if not table_name:
        raise ValueError("table_name must be provided")

    column_map = _fetch_column_map(conn, schema, source_table)

    commodity_col = _require_column(column_map, "commodity")
    report_date_col = _require_column(column_map, "report_date")
    value_col = _require_column(column_map, "amount", "value")
    table_name_col = _require_column(column_map, "table_name")
    attribute_col = _require_column(column_map, "attribute")

    geography_col = _resolve_column(column_map, "geography")
    frequency_col = _resolve_column(column_map, "frequency")
    unit_col = _resolve_column(column_map, "unit")
    timeperiod_col = _resolve_column(column_map, "timeperiod", "raw_timeperiod")
    table_group_col = _resolve_column(column_map, "table_group")
    commodity_group_col = _resolve_column(column_map, "commodity_group")
    year_col = _resolve_column(column_map, "year", "raw_year")

    where_parts: List[psql.SQL] = [
        psql.SQL("{} = %s").format(psql.Identifier(table_name_col))
    ]
    params: List[object] = [table_name]

    resolved_attribute_values: Optional[List[str]] = None
    if attribute:
        try:
            resolved_attribute_values = _resolve_attribute_filters(
                conn,
                schema=schema,
                table=source_table,
                table_name_column=table_name_col,
                attribute_column=attribute_col,
                table_name=table_name,
                requested_attribute=attribute,
            )
        except Exception:
            resolved_attribute_values = None

        if resolved_attribute_values:
            if len(resolved_attribute_values) == 1:
                where_parts.append(
                    psql.SQL("{} = %s").format(psql.Identifier(attribute_col))
                )
                params.append(resolved_attribute_values[0])
            else:
                where_parts.append(
                    psql.SQL("{} = ANY(%s)").format(psql.Identifier(attribute_col))
                )
                params.append(resolved_attribute_values)
        else:
            where_parts.append(
                psql.SQL("{} = %s").format(psql.Identifier(attribute_col))
            )
            params.append(attribute)
    if geography and geography_col:
        where_parts.append(
            psql.SQL("{} = %s").format(psql.Identifier(geography_col))
        )
        params.append(geography)
    if frequency and frequency_col:
        where_parts.append(
            psql.SQL("{} = %s").format(psql.Identifier(frequency_col))
        )
        params.append(frequency)
    if timeperiod and timeperiod_col:
        where_parts.append(
            psql.SQL("{} = %s").format(psql.Identifier(timeperiod_col))
        )
        params.append(timeperiod)

    commodity_list = _normalize_list(commodities)
    if commodity_list:
        where_parts.append(
            psql.SQL("{} = ANY(%s)").format(psql.Identifier(commodity_col))
        )
        params.append(commodity_list)

    date_clause, date_params = build_date_range_clause(
        start_date, end_date, column=report_date_col
    )
    if date_clause is not None:
        where_parts.append(date_clause)
        params.extend(date_params)

    where_sql = psql.SQL(" AND ").join(where_parts) if where_parts else psql.SQL("TRUE")

    select_items: List[psql.SQL] = [
        psql.SQL("{} AS commodity").format(psql.Identifier(commodity_col)),
        psql.SQL("{}::text AS report_date").format(psql.Identifier(report_date_col)),
        psql.SQL("{}::numeric AS amount").format(psql.Identifier(value_col)),
        psql.SQL("{} AS unit").format(psql.Identifier(unit_col))
        if unit_col
        else psql.SQL("NULL::text AS unit"),
        psql.SQL("{} AS attribute").format(psql.Identifier(attribute_col)),
        psql.SQL("{} AS geography").format(psql.Identifier(geography_col))
        if geography_col
        else psql.SQL("NULL::text AS geography"),
        psql.SQL("{} AS frequency").format(psql.Identifier(frequency_col))
        if frequency_col
        else psql.SQL("NULL::text AS frequency"),
        psql.SQL("{} AS timeperiod").format(psql.Identifier(timeperiod_col))
        if timeperiod_col
        else psql.SQL("NULL::text AS timeperiod"),
        psql.SQL("{} AS table_group").format(psql.Identifier(table_group_col))
        if table_group_col
        else psql.SQL("NULL::text AS table_group"),
        psql.SQL("{} AS table_name").format(psql.Identifier(table_name_col)),
        psql.SQL("{} AS commodity_group").format(
            psql.Identifier(commodity_group_col)
        )
        if commodity_group_col
        else psql.SQL("NULL::text AS commodity_group"),
        psql.SQL("{}::int AS year").format(psql.Identifier(year_col))
        if year_col
        else psql.SQL("NULL::int AS year"),
    ]

    select_sql = psql.SQL(", ").join(select_items)

    query = psql.SQL(
        """
        SELECT
            {select_sql}
        FROM {schema}.{table}
        WHERE {where_clause}
        ORDER BY {order_commodity}, {order_report_date}
        LIMIT %s
        """
    ).format(
        select_sql=select_sql,
        schema=psql.Identifier(schema),
        table=psql.Identifier(source_table),
        where_clause=where_sql,
        order_commodity=psql.Identifier(commodity_col),
        order_report_date=psql.Identifier(report_date_col),
    )

    with conn.cursor() as cur:
        cur.execute(query, (*params, limit))
        rows = cur.fetchall()

    series: Dict[str, List[FeedDataPoint]] = defaultdict(list)
    for (
        commodity,
        report_date,
        amount,
        unit,
        attr,
        geo,
        freq,
        timeperiod,
        table_group,
        table_name_value,
        commodity_group,
        year,
    ) in rows:
        if amount is None:
            continue
        try:
            amount_value = float(amount)
        except (TypeError, ValueError):
            continue
        point: FeedDataPoint = {
            "date": report_date,
            "amount": amount_value,
            "unit": unit,
            "attribute": attr,
            "geography": geo,
            "frequency": freq,
            "timeperiod": timeperiod,
            "table_group": table_group,
            "table_name": table_name_value,
            "commodity_group": commodity_group,
            "year": int(year) if year is not None else None,
        }
        series[str(commodity)].append(point)

    for points in series.values():
        points.sort(key=lambda row: row["date"])  # type: ignore[index]

    return dict(series)


def fetch_feed_attribute_series(
    conn: psycopg.Connection,
    *,
    schema: str,
    source_table: str,
    table_name: str,
    attributes: Sequence[str],
    geography: Optional[str],
    frequency: Optional[str],
    commodities: Optional[Iterable[str]],
    start_date: Optional[date],
    end_date: Optional[date],
    limit: int = 5000,
) -> Dict[str, List[FeedDataPoint]]:
    """Fetch feed data grouped by attribute for multi-series charts."""

    if not table_name:
        raise ValueError("table_name must be provided")
    attribute_list = _normalize_list(attributes)
    if not attribute_list:
        raise ValueError("attributes must include at least one value")

    column_map = _fetch_column_map(conn, schema, source_table)

    commodity_col = _require_column(column_map, "commodity")
    report_date_col = _require_column(column_map, "report_date")
    value_col = _require_column(column_map, "amount", "value")
    table_name_col = _require_column(column_map, "table_name")
    attribute_col = _require_column(column_map, "attribute")

    geography_col = _resolve_column(column_map, "geography")
    frequency_col = _resolve_column(column_map, "frequency")
    unit_col = _resolve_column(column_map, "unit")
    timeperiod_col = _resolve_column(column_map, "timeperiod", "raw_timeperiod")
    table_group_col = _resolve_column(column_map, "table_group")
    commodity_group_col = _resolve_column(column_map, "commodity_group")
    year_col = _resolve_column(column_map, "year", "raw_year")

    resolved_attributes = _resolve_multiple_attributes(
        conn,
        schema=schema,
        table=source_table,
        table_name_column=table_name_col,
        attribute_column=attribute_col,
        table_name=table_name,
        requested_attributes=attribute_list,
    )
    if not resolved_attributes:
        raise ValueError("No matching attributes found for the requested values")

    where_parts: List[psql.SQL] = [
        psql.SQL("{} = %s").format(psql.Identifier(table_name_col))
    ]
    params: List[object] = [table_name]

    if resolved_attributes:
        where_parts.append(
            psql.SQL("{} = ANY(%s)").format(psql.Identifier(attribute_col))
        )
        params.append(resolved_attributes)

    if geography and geography_col:
        where_parts.append(
            psql.SQL("{} = %s").format(psql.Identifier(geography_col))
        )
        params.append(geography)
    if frequency and frequency_col:
        where_parts.append(
            psql.SQL("{} = %s").format(psql.Identifier(frequency_col))
        )
        params.append(frequency)

    commodity_list = _normalize_list(commodities)
    if commodity_list:
        where_parts.append(
            psql.SQL("{} = ANY(%s)").format(psql.Identifier(commodity_col))
        )
        params.append(commodity_list)

    date_clause, date_params = build_date_range_clause(
        start_date, end_date, column=report_date_col
    )
    if date_clause is not None:
        where_parts.append(date_clause)
        params.extend(date_params)

    where_sql = psql.SQL(" AND ").join(where_parts)

    select_items: List[psql.SQL] = [
        psql.SQL("{} AS commodity").format(psql.Identifier(commodity_col)),
        psql.SQL("{}::text AS report_date").format(psql.Identifier(report_date_col)),
        psql.SQL("{}::numeric AS amount").format(psql.Identifier(value_col)),
        psql.SQL("{} AS unit").format(psql.Identifier(unit_col))
        if unit_col
        else psql.SQL("NULL::text AS unit"),
        psql.SQL("{} AS attribute").format(psql.Identifier(attribute_col)),
        psql.SQL("{} AS geography").format(psql.Identifier(geography_col))
        if geography_col
        else psql.SQL("NULL::text AS geography"),
        psql.SQL("{} AS frequency").format(psql.Identifier(frequency_col))
        if frequency_col
        else psql.SQL("NULL::text AS frequency"),
        psql.SQL("{} AS timeperiod").format(psql.Identifier(timeperiod_col))
        if timeperiod_col
        else psql.SQL("NULL::text AS timeperiod"),
        psql.SQL("{} AS table_group").format(psql.Identifier(table_group_col))
        if table_group_col
        else psql.SQL("NULL::text AS table_group"),
        psql.SQL("{} AS table_name").format(psql.Identifier(table_name_col)),
        psql.SQL("{} AS commodity_group").format(
            psql.Identifier(commodity_group_col)
        )
        if commodity_group_col
        else psql.SQL("NULL::text AS commodity_group"),
        psql.SQL("{}::int AS year").format(psql.Identifier(year_col))
        if year_col
        else psql.SQL("NULL::int AS year"),
    ]

    select_sql = psql.SQL(", ").join(select_items)

    query = psql.SQL(
        """
        SELECT
            {select_sql}
        FROM {schema}.{table}
        WHERE {where_clause}
        ORDER BY {order_attribute}, {order_report_date}
        LIMIT %s
        """
    ).format(
        select_sql=select_sql,
        schema=psql.Identifier(schema),
        table=psql.Identifier(source_table),
        where_clause=where_sql,
        order_attribute=psql.Identifier(attribute_col),
        order_report_date=psql.Identifier(report_date_col),
    )

    with conn.cursor() as cur:
        cur.execute(query, (*params, limit))
        rows = cur.fetchall()

    series: Dict[str, List[FeedDataPoint]] = {attr: [] for attr in resolved_attributes}
    for (
        commodity,
        report_date,
        amount,
        unit,
        attr,
        geo,
        freq,
        timeperiod,
        table_group,
        table_name_value,
        commodity_group,
        year,
    ) in rows:
        if amount is None:
            continue
        try:
            amount_value = float(amount)
        except (TypeError, ValueError):
            continue
        key = str(attr)
        point: FeedDataPoint = {
            "date": report_date,
            "amount": amount_value,
            "unit": unit,
            "attribute": attr,
            "geography": geo,
            "frequency": freq,
            "timeperiod": timeperiod,
            "table_group": table_group,
            "table_name": table_name_value,
            "commodity_group": commodity_group,
            "year": int(year) if year is not None else None,
        }
        series.setdefault(key, []).append(point)

    for attr in series:
        series[attr].sort(key=lambda row: row["date"])  # type: ignore[index]

    ordered: Dict[str, List[FeedDataPoint]] = {}
    for attr in resolved_attributes:
        ordered[attr] = series.get(attr, [])

    return ordered


__all__ = ["fetch_feed_timeseries", "fetch_feed_attribute_series"]
