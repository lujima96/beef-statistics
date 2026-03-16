#!/usr/bin/env python3
from __future__ import annotations

import csv
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import psycopg

SCHEMA_DDL = "CREATE SCHEMA IF NOT EXISTS beef_data;"
TABLE_DDL = """
CREATE TABLE IF NOT EXISTS diesel_weekly_prices (
    price_date DATE PRIMARY KEY REFERENCES beef_data.report_dates(report_date) ON UPDATE CASCADE,
    diesel_dollars_per_gallon NUMERIC(10,4) NOT NULL,
    source_file TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""
INDEX_DDL = """
CREATE INDEX IF NOT EXISTS idx_diesel_weekly_price_date
  ON diesel_weekly_prices (price_date);
"""

OUTER_BEEF_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ENV = OUTER_BEEF_DIR / ".env"
STATE_DIR = OUTER_BEEF_DIR / ".loader_state"
CSV_PATH = OUTER_BEEF_DIR / "csv" / "energy" / "ulds_weekly_retail_prices.csv"
STATE_FILE = STATE_DIR / "diesel_weekly_prices.date"


class LoaderError(RuntimeError):
    """Exception raised when the diesel loader cannot complete."""

    def __init__(self, message: str, exit_code: int = 1) -> None:
        super().__init__(message)
        self.exit_code = exit_code


def load_env(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def read_last_date() -> date | None:
    if not STATE_FILE.exists():
        return None
    try:
        text = STATE_FILE.read_text().strip()
    except OSError:
        return None
    if not text:
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None


def write_last_date(day: date) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(day.strftime("%Y-%m-%d"))


def _parse_row(row: Dict[str, str]) -> Tuple[date, float]:
    date_str = (row.get("date") or "").strip()
    if not date_str:
        raise ValueError("missing date")
    try:
        parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"invalid date: {date_str}") from exc

    price_raw = (row.get("diesel_dollars_per_gallon") or "").strip()
    if not price_raw:
        raise ValueError("missing diesel price")
    try:
        price = float(price_raw)
    except ValueError as exc:
        raise ValueError(f"invalid diesel price: {price_raw}") from exc
    return parsed_date, price


def read_csv_rows() -> List[Tuple[date, float]]:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Diesel CSV not found: {CSV_PATH}")
    with CSV_PATH.open(newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        rows: List[Tuple[date, float]] = []
        for row in reader:
            try:
                parsed = _parse_row(row)
            except ValueError as exc:
                print(f"Skipping row due to parse error: {exc}", file=sys.stderr)
                continue
            rows.append(parsed)
    return rows


def ensure_schema_and_table(cur) -> None:
    cur.execute(SCHEMA_DDL)
    cur.execute("SET search_path TO beef_data, public")
    cur.execute(TABLE_DDL)
    cur.execute(INDEX_DDL)


def ensure_report_dates(cur, dates: Iterable[date]) -> None:
    unique_dates = sorted({d for d in dates})
    if not unique_dates:
        return
    cur.execute(
        """
        INSERT INTO beef_data.report_dates (report_date)
        SELECT d
        FROM unnest(%s::date[]) AS t(d)
        ON CONFLICT (report_date) DO NOTHING
        """,
        (unique_dates,),
    )


def current_loaded_range(cur) -> tuple[date | None, date | None]:
    cur.execute("SELECT MIN(price_date), MAX(price_date) FROM diesel_weekly_prices")
    row = cur.fetchone()
    if not row:
        return None, None
    return row[0], row[1]


def run() -> None:
    if DEFAULT_ENV.exists():
        for key, value in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(key, value)

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
        raise LoaderError(f"Unable to read diesel CSV: {exc}") from exc

    if not rows:
        print("No diesel price rows found; nothing to load.")
        return

    earliest_csv_date = min(r[0] for r in rows)
    latest_csv_date = max(r[0] for r in rows)
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"

    try:
        with psycopg.connect(dsn, autocommit=False) as conn:
            with conn.cursor() as cur:
                ensure_schema_and_table(cur)
                db_first_dt, db_last_dt = current_loaded_range(cur)
                if db_last_dt is None:
                    state_last_dt = read_last_date()
                    if state_last_dt is not None:
                        print(
                            "Diesel state file exists but the database table is empty; reloading full history."
                        )
                elif db_first_dt != earliest_csv_date:
                    print(
                        "Diesel table history is incomplete; reloading full history to match the CSV source."
                    )
                    cur.execute("TRUNCATE TABLE diesel_weekly_prices")
                else:
                    rows = [r for r in rows if r[0] > db_last_dt]
                    if not rows:
                        print("Diesel price data already up to date.")
                        return
                ensure_report_dates(cur, (row[0] for row in rows))
                insert_sql = (
                    """
                    INSERT INTO diesel_weekly_prices (
                        price_date,
                        diesel_dollars_per_gallon,
                        source_file
                    ) VALUES (%s, %s, %s)
                    ON CONFLICT (price_date) DO UPDATE
                    SET diesel_dollars_per_gallon = EXCLUDED.diesel_dollars_per_gallon,
                        source_file = EXCLUDED.source_file,
                        ingested_at = now()
                    """
                )
                params = [
                    (price_date, price, CSV_PATH.name)
                    for (price_date, price) in rows
                ]
                cur.executemany(insert_sql, params)
            conn.commit()
    except psycopg.Error as exc:
        raise LoaderError(f"Database error: {exc}", exit_code=2) from exc

    latest = latest_csv_date if db_last_dt is None or db_first_dt != earliest_csv_date else max(r[0] for r in rows)
    write_last_date(latest)
    print(f"Loaded {len(rows)} diesel price rows through {latest.isoformat()}.")


def main() -> int:
    try:
        run()
    except LoaderError as exc:
        print(str(exc), file=sys.stderr)
        return exc.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
