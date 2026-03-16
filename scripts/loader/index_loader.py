#!/usr/bin/env python3
from __future__ import annotations

import base64
import os
import shutil
import subprocess
import sys
from pathlib import Path
import json
from datetime import datetime, date
import re
from typing import Dict

import psycopg


# Paths when this file lives under beef_stats/scripts/loader/
OUTER_BEEF_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ENV = OUTER_BEEF_DIR / ".env"
STATE_DIR = OUTER_BEEF_DIR / ".loader_state"


class LoaderError(RuntimeError):
    """Exception raised when a loader cannot complete successfully."""

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


def psql_base_args(host: str, port: int, user: str, db: str) -> list[str]:
    return [
        "psql",
        "-w",
        "-h",
        host,
        "-p",
        str(port),
        "-U",
        user,
        "-d",
        db,
        "-v",
        "ON_ERROR_STOP=1",
    ]


DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")


def extract_date_from_name(name: str) -> date | None:
    m = DATE_RE.search(name)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y-%m-%d").date()
    except ValueError:
        return None


def _state_path(key: str) -> Path:
    return STATE_DIR / f"{key}.date"


def read_last_date(key: str) -> date | None:
    try:
        p = _state_path(key)
        if not p.exists():
            return None
        s = p.read_text().strip()
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


def write_last_date(key: str, d: date) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _state_path(key).write_text(d.strftime("%Y-%m-%d"))


def build_sql_from_json(json_text: str, *, source_file: str) -> str:
    """Insert-if-new into index_reports_json with the processed index JSON payload.

    Unique constraint `uq_index_json` ensures one row per (report_id, report_date).
    If a matching row already exists, skip it (no update).
    """
    b64 = base64.b64encode(json_text.encode("utf-8")).decode("ascii")
    return f"""
SET search_path TO beef_data, public;
BEGIN;
WITH doc AS (
  SELECT convert_from(decode($${b64}$$,'base64'),'UTF8')::jsonb AS j
)
INSERT INTO beef_data.index_reports_json (source_file, payload)
SELECT {source_file!r}, j FROM doc
ON CONFLICT ON CONSTRAINT uq_index_json DO NOTHING;
COMMIT;
"""


def has_live_cattle_minimal(s: str) -> bool:
    try:
        obj = json.loads(s)
    except Exception:
        return False
    try:
        sec = obj.get("sections", {})
        ndc = sec.get("national_daily_direct_cattle", {})
        return "live_steer" in ndc and "live_heifer" in ndc
    except Exception:
        return False


def current_loaded_range(dsn: str) -> tuple[date | None, date | None, int]:
    with psycopg.connect(dsn, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT MIN(report_date), MAX(report_date), COUNT(*)
                FROM beef_data.index_reports_json
                """
            )
            row = cur.fetchone()
    if not row:
        return None, None, 0
    return row[0], row[1], int(row[2] or 0)


def run() -> None:
    # Load env defaults for connection
    if DEFAULT_ENV.exists():
        for k, v in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(k, v)

    # Prefer project .env (POSTGRES_*) over shell PG* variables
    host = os.getenv("PGHOST", "localhost")
    port = int(os.getenv("PGPORT") or os.getenv("PG_HOST_PORT") or "5432")
    db = os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE") or "beef_data"
    user = os.getenv("POSTGRES_USER") or os.getenv("PGUSER") or "postgres"
    password = os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or ""

    if password:
        os.environ["PGPASSWORD"] = password

    if shutil.which("psql") is None:
        raise LoaderError("psql not found on PATH. Install postgresql-client.", exit_code=127)

    # Resolve processed dir
    try:
        sys.path.append(str(OUTER_BEEF_DIR))
        from scripts.config import PROCESSED_DIR  # type: ignore

        processed_base = PROCESSED_DIR
    except Exception:
        processed_base = OUTER_BEEF_DIR / "beef_stats/processed"

    in_dir = processed_base / "processed_index"
    if not in_dir.exists():
        raise LoaderError(f"Input directory not found: {in_dir}")

    files = sorted(in_dir.glob("*.json"))
    if not files:
        print(f"No JSON files in {in_dir}")
        return

    base_args = psql_base_args(host, port, user, db)
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"
    earliest_file_date = extract_date_from_name(files[0].name)
    latest_file_date = extract_date_from_name(files[-1].name)
    db_first_date: date | None = None
    db_last_date: date | None = None
    db_count = 0
    try:
        db_first_date, db_last_date, db_count = current_loaded_range(dsn)
    except psycopg.Error:
        db_first_date, db_last_date, db_count = None, None, 0

    needs_full_reload = (
        db_last_date is None
        or db_first_date != earliest_file_date
        or db_last_date != latest_file_date
        or db_count != len(files)
    )

    if needs_full_reload:
        print("Index table history is incomplete; reloading full history from processed files.")
        reset_sql = (
            "SET search_path TO beef_data, public;\n"
            "TRUNCATE TABLE beef_data.index_reports_json;\n"
        )
        subprocess.run(base_args, input=reset_sql.encode("utf-8"), check=True)
    else:
        print(f"Index history already spans {db_first_date} through {db_last_date}; checking for updates only.")
        files = [p for p in files if (extract_date_from_name(p.name) or date.min) > db_last_date]
        if not files:
            print("Index data already up to date.")
            return

    for path in files:
        text = path.read_text(encoding="utf-8")
        if not has_live_cattle_minimal(text):
            print(f"Skipping {path.name}: payload missing live cattle minimal section")
            continue
        sql = build_sql_from_json(text, source_file=path.name)
        print(f"Loading {path.name} → database …")
        try:
            subprocess.run(base_args, input=sql.encode("utf-8"), check=True)
        except subprocess.CalledProcessError as exc:
            raise LoaderError(f"psql failed with exit code {exc.returncode}", exit_code=exc.returncode) from exc
        d = extract_date_from_name(path.name)
        if d is not None:
            write_last_date("index", d)
    print("Index report load completed.")


def main() -> int:
    try:
        run()
    except LoaderError as exc:
        print(str(exc), file=sys.stderr)
        return exc.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
