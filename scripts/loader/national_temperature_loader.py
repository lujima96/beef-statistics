#!/usr/bin/env python3
from __future__ import annotations

import csv
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Tuple

import psycopg

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
    cur.execute(TEMPERATURE_TABLE_DDL)
    cur.execute(TEMPERATURE_INDEX_DDL)

# Paths when this file lives under beef_stats/scripts/loader/
OUTER_BEEF_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ENV = OUTER_BEEF_DIR / ".env"
STATE_DIR = OUTER_BEEF_DIR / ".loader_state"
CSV_PATH = OUTER_BEEF_DIR / "national_daily_average_temp.csv"


class LoaderError(RuntimeError):
    """Exception raised when the temperature loader cannot finish."""

    def __init__(self, message: str, exit_code: int = 1) -> None:
        super().__init__(message)
        self.exit_code = exit_code


def load_env(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def _state_path() -> Path:
    return STATE_DIR / "national_daily_average_temperature.date"


def read_last_date() -> datetime | None:
    try:
        p = _state_path()
        if not p.exists():
            return None
        s = p.read_text().strip()
        return datetime.strptime(s, "%Y-%m-%d")
    except Exception:
        return None


def write_last_date(dt: datetime) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _state_path().write_text(dt.strftime("%Y-%m-%d"))


def _parse_row(row: Dict[str, str]) -> Tuple[str, float, int | None, int | None]:
    date_str = row.get("date") or row.get("Date")
    if not date_str:
        raise ValueError("missing date")
    # Ensure YYYY-MM-DD format
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"invalid date: {date_str}") from exc

    temp_raw = row.get("average_temperature_f") or row.get("average_temperature")
    if temp_raw is None:
        raise ValueError("missing average temperature")
    try:
        temp = float(temp_raw)
    except ValueError as exc:
        raise ValueError(f"invalid temperature value: {temp_raw}") from exc

    states = row.get("states_reporting")
    stations = row.get("station_observations")
    states_val = int(states) if states not in (None, "") else None
    stations_val = int(stations) if stations not in (None, "") else None
    return date_str, temp, states_val, stations_val


def read_csv_rows() -> List[Tuple[str, float, int | None, int | None]]:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Temperature CSV not found: {CSV_PATH}")
    with CSV_PATH.open(newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        rows: List[Tuple[str, float, int | None, int | None]] = []
        for row in reader:
            try:
                parsed = _parse_row(row)
            except ValueError as exc:
                print(f"Skipping row due to parse error: {exc}", file=sys.stderr)
                continue
            rows.append(parsed)
    return rows


def current_loaded_range(cur) -> tuple[date | None, date | None, int]:
    cur.execute(
        """
        SELECT MIN(observation_date), MAX(observation_date), COUNT(*)
        FROM national_daily_average_temperature
        """
    )
    row = cur.fetchone()
    if not row:
        return None, None, 0
    return row[0], row[1], int(row[2] or 0)


def run() -> None:
    if DEFAULT_ENV.exists():
        for k, v in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(k, v)

    host = os.getenv("PGHOST", "localhost")
    port = int(os.getenv("PGPORT") or os.getenv("PG_HOST_PORT") or "5432")
    db = os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE") or "beef_data"
    user = os.getenv("POSTGRES_USER") or os.getenv("PGUSER") or "postgres"
    password = os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or ""

    if password:
        os.environ.setdefault("PGPASSWORD", password)

    try:
        rows = read_csv_rows()
    except Exception as exc:
        raise LoaderError(f"Unable to read CSV: {exc}") from exc

    if not rows:
        print("No temperature rows found; nothing to load.")
        return

    earliest_csv_dt = datetime.strptime(rows[0][0], "%Y-%m-%d").date()
    latest_csv_dt = datetime.strptime(rows[-1][0], "%Y-%m-%d").date()
    total_csv_rows = len(rows)

    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"

    try:
        with psycopg.connect(dsn, autocommit=False) as conn:
            with conn.cursor() as cur:
                cur.execute("SET search_path TO beef_data, public")
                ensure_temperature_table(cur)
                db_first_dt, db_last_dt, db_row_count = current_loaded_range(cur)

                if db_last_dt is None:
                    state_last_dt = read_last_date()
                    if state_last_dt is not None:
                        print(
                            "Temperature state file exists but the database table is empty; reloading full history."
                        )
                elif (
                    db_first_dt != earliest_csv_dt
                    or db_last_dt != latest_csv_dt
                    or db_row_count != total_csv_rows
                ):
                    print(
                        "Temperature table history is incomplete; reloading full history to match the CSV source."
                    )
                    cur.execute("TRUNCATE TABLE national_daily_average_temperature")
                else:
                    rows = [r for r in rows if datetime.strptime(r[0], "%Y-%m-%d").date() > db_last_dt]
                    if not rows:
                        print("Temperature data already up to date.")
                        return

                insert_sql = (
                    """
                    INSERT INTO national_daily_average_temperature (
                        observation_date,
                        average_temperature_f,
                        states_reporting,
                        station_observations,
                        source_file
                    ) VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (observation_date) DO UPDATE
                    SET average_temperature_f = EXCLUDED.average_temperature_f,
                        states_reporting = COALESCE(EXCLUDED.states_reporting, national_daily_average_temperature.states_reporting),
                        station_observations = COALESCE(EXCLUDED.station_observations, national_daily_average_temperature.station_observations),
                        source_file = EXCLUDED.source_file,
                        ingested_at = now()
                    """
                )
                params = [
                    (date_str, temp, states, stations, CSV_PATH.name)
                    for (date_str, temp, states, stations) in rows
                ]
                cur.executemany(insert_sql, params)
            conn.commit()
    except psycopg.Error as exc:
        raise LoaderError(f"Database error: {exc}", exit_code=2) from exc

    latest = latest_csv_dt if len(rows) == total_csv_rows else max(datetime.strptime(r[0], "%Y-%m-%d").date() for r in rows)
    write_last_date(latest)
    print(f"Loaded {len(rows)} temperature rows through {latest}.")


def main() -> int:
    try:
        run()
    except LoaderError as exc:
        print(str(exc), file=sys.stderr)
        return exc.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
