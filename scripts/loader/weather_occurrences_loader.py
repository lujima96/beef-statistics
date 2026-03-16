#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import os
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, Optional

import psycopg

SCHEMA_DDL = "CREATE SCHEMA IF NOT EXISTS beef_data;"
TABLE_DDL = """
CREATE TABLE IF NOT EXISTS number_of_occurrences_monthly (
    month_start DATE NOT NULL,
    event_type TEXT NOT NULL,
    event_count INTEGER NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (month_start, event_type)
);
"""
MONTH_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS idx_number_of_occurrences_monthly_month_start
  ON number_of_occurrences_monthly (month_start);
"""
EVENT_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS idx_number_of_occurrences_monthly_event_type
  ON number_of_occurrences_monthly (event_type);
"""

OUTER_BEEF_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ENV = OUTER_BEEF_DIR / ".env"
STATE_DIR = OUTER_BEEF_DIR / ".loader_state"
RAW_DIR = OUTER_BEEF_DIR / "weather" / "raw"
STATE_FILE = STATE_DIR / "weather_occurrences_sources.json"


class LoaderError(RuntimeError):
    """Exception raised when the weather occurrence loader cannot complete."""

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


def _iter_source_files() -> list[Path]:
    return sorted(RAW_DIR.glob("weather_events_*.csv"))


def _snapshot_sources(files: Iterable[Path]) -> dict[str, dict[str, int]]:
    snapshot: dict[str, dict[str, int]] = {}
    for path in files:
        stat = path.stat()
        snapshot[path.name] = {
            "size": stat.st_size,
            "mtime_ns": stat.st_mtime_ns,
        }
    return snapshot


def _read_snapshot() -> dict[str, dict[str, int]]:
    if not STATE_FILE.exists():
        return {}
    try:
        raw = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, int]] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not isinstance(value, dict):
            continue
        try:
            size = int(value.get("size"))  # type: ignore[arg-type]
            mtime_ns = int(value.get("mtime_ns"))  # type: ignore[arg-type]
        except (TypeError, ValueError, AttributeError):
            continue
        out[key] = {"size": size, "mtime_ns": mtime_ns}
    return out


def _write_snapshot(snapshot: dict[str, dict[str, int]]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(snapshot, indent=2, sort_keys=True), encoding="utf-8")


def _parse_yearmonth(value: str | None) -> Optional[date]:
    text = (value or "").strip()
    if len(text) != 6 or not text.isdigit():
        return None
    year = int(text[:4])
    month = int(text[4:])
    if month < 1 or month > 12:
        return None
    return date(year, month, 1)


def _aggregate_counts(files: Iterable[Path]) -> tuple[list[tuple[date, str, int]], Optional[date]]:
    counts: dict[tuple[date, str], int] = defaultdict(int)
    latest_month: Optional[date] = None

    for path in files:
        with path.open("r", encoding="utf-8", newline="", errors="replace") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                month_start = _parse_yearmonth(
                    row.get("BEGIN_YEARMONTH") or row.get("begin_yearmonth")
                )
                event_type = (row.get("EVENT_TYPE") or row.get("event_type") or "").strip()
                if month_start is None or not event_type:
                    continue
                counts[(month_start, event_type)] += 1
                if latest_month is None or month_start > latest_month:
                    latest_month = month_start

    rows = [
        (month_start, event_type, count)
        for (month_start, event_type), count in sorted(
            counts.items(),
            key=lambda item: (item[0][0], item[0][1]),
        )
    ]
    return rows, latest_month


def _ensure_table(cur: psycopg.Cursor[object]) -> None:
    cur.execute(SCHEMA_DDL)
    cur.execute("SET search_path TO beef_data, public")
    cur.execute(TABLE_DDL)
    cur.execute(MONTH_INDEX_DDL)
    cur.execute(EVENT_INDEX_DDL)


def _table_has_rows(cur: psycopg.Cursor[object]) -> bool:
    cur.execute("SELECT EXISTS (SELECT 1 FROM number_of_occurrences_monthly LIMIT 1)")
    row = cur.fetchone()
    return bool(row and row[0])


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

    files = _iter_source_files()
    if not files:
        raise LoaderError(f"No weather event CSV files found in {RAW_DIR}")

    current_snapshot = _snapshot_sources(files)
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"

    try:
        with psycopg.connect(dsn, autocommit=False) as conn:
            with conn.cursor() as cur:
                _ensure_table(cur)
                if current_snapshot == _read_snapshot() and _table_has_rows(cur):
                    print("Weather occurrence data already up to date.")
                    return
                rows, latest_month = _aggregate_counts(files)
                if not rows:
                    raise LoaderError(
                        "No monthly weather occurrence rows could be derived from the raw CSV files."
                    )
                cur.execute("TRUNCATE TABLE number_of_occurrences_monthly")
                cur.executemany(
                    """
                    INSERT INTO number_of_occurrences_monthly (
                        month_start,
                        event_type,
                        event_count
                    ) VALUES (%s, %s, %s)
                    """,
                    rows,
                )
            conn.commit()
    except psycopg.Error as exc:
        raise LoaderError(f"Database error: {exc}", exit_code=2) from exc

    _write_snapshot(current_snapshot)
    if latest_month is None:
        print(f"Loaded {len(rows)} monthly weather occurrence rows.")
    else:
        print(
            f"Loaded {len(rows)} monthly weather occurrence rows through {latest_month.isoformat()}."
        )


def main() -> int:
    try:
        run()
    except LoaderError as exc:
        print(str(exc), file=sys.stderr)
        return exc.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
