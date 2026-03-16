"""Entrypoint logic for running the supply/demand loader."""
from __future__ import annotations

import sys
from datetime import date
from typing import Any, Dict, Optional

import psycopg

from .computations import compute_indices
from .config import apply_default_env, build_dsn, load_weights
from .database import fetch_feature_rows, get_date_range, upsert_rows
from .state import read_last_date, write_last_date


def _process(cur, last_loaded: Optional[date], weights: Dict[str, Any]) -> Optional[date]:
    range_start, range_end = get_date_range(cur, last_loaded)
    if not range_start or not range_end:
        print("No new dates to process.")
        return None

    rows = fetch_feature_rows(cur, range_start, range_end)
    indices = compute_indices(rows, weights)
    to_insert = [row for row in indices if row["demand_index"] is not None or row["supply_index"] is not None]
    if not to_insert:
        print("No indices computed for requested range.")
        return None

    upsert_rows(cur, to_insert)
    return max(row["report_date"] for row in to_insert)


def main() -> None:
    apply_default_env()
    dsn = build_dsn()
    weights = load_weights()
    last_loaded = read_last_date()
    last_processed: Optional[date] = None

    try:
        with psycopg.connect(dsn, autocommit=False) as conn:
            with conn.cursor() as cur:
                last_processed = _process(cur, last_loaded, weights)
                if last_processed is None:
                    conn.rollback()
                    return
            conn.commit()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover - runtime failure reporting
        print(f"Loader failed: {exc}", file=sys.stderr)
        sys.exit(1)

    if last_processed is None:
        return

    write_last_date(last_processed)
    print(f"Loaded supply/demand indices through {last_processed}")
