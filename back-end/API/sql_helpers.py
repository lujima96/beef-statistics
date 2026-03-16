from __future__ import annotations

from datetime import date
from typing import Optional, Tuple

from psycopg import sql as psql


def json_path(*parts: str) -> list[str]:
    """Return a list of strings for a PostgreSQL JSON path."""
    return list(parts)


def build_date_range_clause(
    start_date: Optional[date],
    end_date: Optional[date],
    *,
    column: str = "report_date",
) -> Tuple[Optional[psql.SQL], list[object]]:
    """Construct a WHERE clause fragment for an optional date range.

    Returns a tuple of (SQL fragment, parameters). The SQL fragment is None if
    no date bounds are provided.
    """
    parts: list[psql.SQL] = []
    params: list[object] = []
    if start_date is not None:
        parts.append(psql.SQL(f"{column} >= %s"))
        params.append(start_date)
    if end_date is not None:
        parts.append(psql.SQL(f"{column} <= %s"))
        params.append(end_date)
    if not parts:
        return None, []
    return psql.SQL(" AND ").join(parts), params
