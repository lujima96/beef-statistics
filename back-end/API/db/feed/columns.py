"""Helpers for resolving feed table columns."""

from __future__ import annotations

from typing import Dict, Optional

import psycopg


def _fetch_column_map(
    conn: psycopg.Connection,
    schema: str,
    table: str,
) -> Dict[str, str]:
    query = """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
    """
    with conn.cursor() as cur:
        cur.execute(query, (schema, table))
        rows = cur.fetchall()
    if not rows:
        raise ValueError(f"Table {schema}.{table} was not found")
    return {name.lower(): name for (name,) in rows}


def _resolve_column(column_map: Dict[str, str], *candidates: str) -> Optional[str]:
    for candidate in candidates:
        actual = column_map.get(candidate.lower())
        if actual:
            return actual
    return None


def _require_column(column_map: Dict[str, str], *candidates: str) -> str:
    col = _resolve_column(column_map, *candidates)
    if not col:
        joined = ", ".join(candidates)
        raise ValueError(f"Required column not found; expected one of: {joined}")
    return col


__all__ = [
    "_fetch_column_map",
    "_resolve_column",
    "_require_column",
]
