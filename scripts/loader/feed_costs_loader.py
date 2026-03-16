#!/usr/bin/env python3
from __future__ import annotations

import csv
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, Iterable

import psycopg


OUTER_BEEF_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ENV = OUTER_BEEF_DIR / ".env"
STATE_DIR = OUTER_BEEF_DIR / ".loader_state"
ALL_YEARS_SOURCES = (
    OUTER_BEEF_DIR / "CSVs" / "feed-grains-yearbook-all-years.csv",
    OUTER_BEEF_DIR / "CSVs" / "feed-grains-yearbook-all-years_normalized.csv",
    OUTER_BEEF_DIR / "feed-grains-yearbook-all-years.csv",
    OUTER_BEEF_DIR / "feed-grains-yearbook-all-years_normalized.csv",
)
HISTORICAL_SOURCE = OUTER_BEEF_DIR / "CSVs" / "feed-grains-yearbook-historical_normalized.csv"
RECENT_SOURCE = OUTER_BEEF_DIR / "CSVs" / "feed-grains-yearbook-recent_normalized.csv"


FEED_COSTS_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS beef_data.feed_costs (
    id BIGSERIAL PRIMARY KEY,
    report_date DATE NOT NULL REFERENCES beef_data.report_dates(report_date) ON DELETE CASCADE,
    table_group TEXT,
    table_name TEXT NOT NULL,
    commodity_group TEXT,
    commodity TEXT NOT NULL,
    attribute TEXT NOT NULL,
    geography TEXT NOT NULL,
    unit TEXT NOT NULL,
    value NUMERIC,
    frequency TEXT NOT NULL,
    raw_year INTEGER NOT NULL,
    raw_timeperiod TEXT NOT NULL DEFAULT '',
    source_file TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_feed_costs_row UNIQUE (
        report_date,
        table_name,
        commodity,
        attribute,
        geography,
        unit,
        frequency,
        raw_year,
        raw_timeperiod
    )
);
"""

FEED_COSTS_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS feed_costs_lookup_idx
  ON beef_data.feed_costs (table_name, attribute, geography, frequency, report_date);
"""


class LoaderError(RuntimeError):
    def __init__(self, message: str, exit_code: int = 1) -> None:
        super().__init__(message)
        self.exit_code = exit_code


@dataclass(frozen=True)
class FeedRow:
    report_date: date
    table_group: str | None
    table_name: str
    commodity_group: str | None
    commodity: str
    attribute: str
    geography: str
    unit: str
    value: float | None
    frequency: str
    raw_year: int
    raw_timeperiod: str
    source_file: str

    @property
    def natural_key(self) -> tuple[object, ...]:
        return (
            self.report_date,
            self.table_name,
            self.commodity,
            self.attribute,
            self.geography,
            self.unit,
            self.frequency,
            self.raw_year,
            self.raw_timeperiod,
        )


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


def write_last_date(key: str, value: date) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    (STATE_DIR / f"{key}.date").write_text(value.isoformat())


def ensure_report_dates(cur, dates: Iterable[date]) -> None:
    cur.executemany(
        """
        INSERT INTO beef_data.report_dates (report_date)
        VALUES (%s)
        ON CONFLICT (report_date) DO NOTHING
        """,
        [(value,) for value in dates],
    )


def parse_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def parse_required_text(row: dict[str, str], key: str) -> str:
    value = row.get(key)
    if value is None:
        raise ValueError(f"missing {key}")
    text = value.strip()
    if not text:
        raise ValueError(f"blank {key}")
    return text


def parse_row(row: dict[str, str], source_file: str) -> FeedRow:
    report_date = datetime.strptime(parse_required_text(row, "report_date"), "%Y-%m-%d").date()
    raw_year = int(parse_required_text(row, "year"))
    amount_raw = row.get("amount", "")
    value = float(amount_raw) if amount_raw not in ("", None) else None

    return FeedRow(
        report_date=report_date,
        table_group=parse_optional_text(row.get("table_group")),
        table_name=parse_required_text(row, "table_name"),
        commodity_group=parse_optional_text(row.get("commodity_group")),
        commodity=parse_required_text(row, "commodity"),
        attribute=parse_required_text(row, "attribute"),
        geography=parse_required_text(row, "geography"),
        unit=parse_required_text(row, "unit"),
        value=value,
        frequency=parse_required_text(row, "frequency"),
        raw_year=raw_year,
        raw_timeperiod=(row.get("timeperiod") or "").strip(),
        source_file=source_file,
    )


def resolve_source_files() -> tuple[tuple[Path, ...], bool]:
    for candidate in ALL_YEARS_SOURCES:
        if candidate.exists():
            return (candidate,), True

    available = tuple(path for path in (HISTORICAL_SOURCE, RECENT_SOURCE) if path.exists())
    if not available:
        raise LoaderError(
            "No feed source files found. Expected one of: "
            f"{', '.join(str(path) for path in ALL_YEARS_SOURCES)}, {HISTORICAL_SOURCE}, {RECENT_SOURCE}"
        )

    has_full_history = HISTORICAL_SOURCE.exists() and RECENT_SOURCE.exists()
    return available, has_full_history


def read_source_rows(source_files: tuple[Path, ...]) -> list[FeedRow]:
    merged: dict[tuple[object, ...], FeedRow] = {}
    for source_path in source_files:
        with source_path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                try:
                    parsed = parse_row(row, source_path.name)
                except Exception as exc:  # noqa: BLE001
                    raise LoaderError(f"Failed parsing {source_path.name}: {exc}") from exc
                # Later sources override earlier ones for overlapping years.
                merged[parsed.natural_key] = parsed
    rows = sorted(merged.values(), key=lambda item: (item.report_date, item.table_name, item.commodity, item.attribute))
    if not rows:
        raise LoaderError("No feed rows were parsed from the source CSVs.")
    return rows


def current_loaded_range(cur) -> tuple[date | None, date | None, int]:
    cur.execute(
        """
        SELECT MIN(report_date), MAX(report_date), COUNT(*)
        FROM beef_data.feed_costs
        """
    )
    row = cur.fetchone()
    if not row:
        return None, None, 0
    return row[0], row[1], int(row[2] or 0)


def ensure_table(cur) -> None:
    cur.execute(FEED_COSTS_TABLE_DDL)
    cur.execute(FEED_COSTS_INDEX_DDL)


def run() -> None:
    if DEFAULT_ENV.exists():
        for key, value in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(key, value)

    host = os.getenv("PGHOST", "localhost")
    port = int(os.getenv("PGPORT") or os.getenv("PG_HOST_PORT") or "5432")
    db = os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE") or "beef_data"
    user = os.getenv("POSTGRES_USER") or os.getenv("PGUSER") or "postgres"
    password = os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or ""

    source_files, has_full_history_source = resolve_source_files()
    rows = read_source_rows(source_files)
    earliest_source_date = rows[0].report_date
    latest_source_date = rows[-1].report_date
    source_row_count = len(rows)

    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"

    try:
        with psycopg.connect(dsn, autocommit=False) as conn:
            with conn.cursor() as cur:
                cur.execute("SET search_path TO beef_data, public")
                ensure_table(cur)
                db_first_date, db_last_date, db_count = current_loaded_range(cur)

                needs_full_reload = has_full_history_source and (
                    db_last_date is None
                    or db_first_date != earliest_source_date
                    or db_last_date != latest_source_date
                    or db_count != source_row_count
                )

                if needs_full_reload:
                    print("Feed table history is incomplete; reloading full history from normalized CSV snapshots.")
                    cur.execute("TRUNCATE TABLE beef_data.feed_costs RESTART IDENTITY")
                    rows_to_load = rows
                elif not has_full_history_source:
                    print(
                        "Feed loader is using partial source snapshots; upserting available rows without deleting older history."
                    )
                    rows_to_load = rows
                else:
                    rows_to_load = [row for row in rows if row.report_date > db_last_date]
                    if not rows_to_load:
                        print("Feed data already up to date.")
                        return

                ensure_report_dates(cur, (row.report_date for row in rows_to_load))
                cur.executemany(
                    """
                    INSERT INTO beef_data.feed_costs (
                        report_date,
                        table_group,
                        table_name,
                        commodity_group,
                        commodity,
                        attribute,
                        geography,
                        unit,
                        value,
                        frequency,
                        raw_year,
                        raw_timeperiod,
                        source_file
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT ON CONSTRAINT uq_feed_costs_row DO UPDATE
                    SET table_group = EXCLUDED.table_group,
                        commodity_group = EXCLUDED.commodity_group,
                        value = EXCLUDED.value,
                        source_file = EXCLUDED.source_file,
                        updated_at = now()
                    """,
                    [
                        (
                            row.report_date,
                            row.table_group,
                            row.table_name,
                            row.commodity_group,
                            row.commodity,
                            row.attribute,
                            row.geography,
                            row.unit,
                            row.value,
                            row.frequency,
                            row.raw_year,
                            row.raw_timeperiod,
                            row.source_file,
                        )
                        for row in rows_to_load
                    ],
                )
            conn.commit()
    except psycopg.Error as exc:
        raise LoaderError(f"Database error: {exc}", exit_code=2) from exc

    write_last_date("feed_costs", latest_source_date)
    print(f"Feed load completed through {latest_source_date.isoformat()}.")


def main() -> int:
    try:
        run()
    except LoaderError as exc:
        print(str(exc), file=sys.stderr)
        return exc.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
