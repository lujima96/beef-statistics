"""Database helpers for temperature ingestion."""

from __future__ import annotations

from datetime import date
from typing import Optional

TEMPERATURE_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS national_daily_average_temperature (
    observation_date       DATE PRIMARY KEY,
    average_temperature_f  NUMERIC NOT NULL,
    states_reporting       INTEGER,
    station_observations   INTEGER,
    source_file            TEXT,
    ingested_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

TEMPERATURE_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS national_daily_average_temperature_date_idx
  ON national_daily_average_temperature (observation_date);
"""


def ensure_temperature_table(cur) -> None:
    """Create the target table and index if they do not yet exist."""

    cur.execute("SET search_path TO beef_data, public")
    cur.execute(TEMPERATURE_TABLE_DDL)
    cur.execute(TEMPERATURE_INDEX_DDL)


def get_last_observation_date(cur) -> Optional[date]:
    """Fetch the latest observation date currently stored."""

    try:
        cur.execute("SELECT MAX(observation_date) FROM national_daily_average_temperature")
    except Exception:
        return None

    row = cur.fetchone()
    if not row:
        return None

    last = row[0]
    return date.fromisoformat(str(last)) if last is not None else None
