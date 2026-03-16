#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Dict

import psycopg

SCHEMA_DDL = "CREATE SCHEMA IF NOT EXISTS beef_data;"
TABLE_DDL = """
CREATE TABLE IF NOT EXISTS beef_data.fuel_prices (
  id BIGSERIAL PRIMARY KEY,
  report_date DATE NOT NULL REFERENCES beef_data.report_dates(report_date),
  "time" TIME,
  fuel_type TEXT,
  gallons NUMERIC,
  price_per_gallon NUMERIC,
  address TEXT,
  gas_station_name TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""
INDEX_DDL = """
CREATE INDEX IF NOT EXISTS idx_fuel_prices_report_date ON beef_data.fuel_prices (report_date);
"""

OUTER_BEEF_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ENV = OUTER_BEEF_DIR / ".env"

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

def main() -> None:
    if DEFAULT_ENV.exists():
        for key, value in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(key, value)

    host = os.getenv("PGHOST", "127.0.0.1")
    port = int(os.getenv("PGPORT") or os.getenv("PG_HOST_PORT") or "5432")
    db = os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE") or "beef_data"
    user = os.getenv("POSTGRES_USER") or os.getenv("PGUSER") or "postgres"
    password = os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or ""

    if password:
        os.environ.setdefault("PGPASSWORD", password)

    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"

    try:
        with psycopg.connect(dsn, autocommit=False) as conn:
            with conn.cursor() as cur:
                cur.execute(SCHEMA_DDL)
                cur.execute("SET search_path TO beef_data, public")
                cur.execute(TABLE_DDL)
                cur.execute(INDEX_DDL)
            conn.commit()
        print("Successfully created the 'fuel_prices' table.")
    except psycopg.Error as exc:
        print(f"Database error: {exc}", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
