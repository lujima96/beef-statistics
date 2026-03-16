#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Optional


# Paths when this file lives under beef_stats/scripts/loader/
OUTER_BEEF_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ENV = OUTER_BEEF_DIR / ".env"
STATE_DIR = OUTER_BEEF_DIR / ".loader_state"


class LoaderError(RuntimeError):
    """Exception raised when the weekly retail loader cannot complete."""

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


DATE_PREFIX_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})__")


def extract_date_from_filename(name: str) -> Optional[date]:
    m = DATE_PREFIX_RE.match(name)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y-%m-%d").date()
    except ValueError:
        return None


def _state_path(key: str) -> Path:
    return STATE_DIR / f"{key}.date"


def read_last_date(key: str) -> Optional[date]:
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


def _links_map() -> Dict[str, str]:
    """Return map of basename (e.g., AMS_3228.PDF) -> source URL from links file."""
    path = PROJECT_ROOT / "beef_stats/links/weekly_retail_prices.txt"
    mp: Dict[str, str] = {}
    if not path.exists():
        return mp
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "," not in line:
            continue
        _, url = line.rsplit(",", 1)
        url = url.strip()
        if not url:
            continue
        base = Path(url).name
        if base and base not in mp:
            mp[base] = url
    return mp


def _sql_str(v: Optional[str]) -> str:
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def build_sql_insert(*, report_date: date, report_code: str | None, source_url: str | None,
                     filename: str, file_size: int, content_type: str,
                     sha256_hex: str, pdf_b64: str) -> str:
    d_lit = repr(report_date.isoformat())  # 'YYYY-MM-DD'
    code_lit = _sql_str(report_code)
    url_lit = _sql_str(source_url)
    fn_lit = _sql_str(filename)
    ct_lit = _sql_str(content_type)
    sha_lit = _sql_str(sha256_hex)
    return f"""
SET search_path TO beef_data, public;
BEGIN;
INSERT INTO beef_data.weekly_retail_price_pdfs
  (report_date, report_code, source_url, filename, file_size, content_type, sha256, pdf_bytes)
VALUES
  ({d_lit}::date,
   {code_lit},
   {url_lit},
   {fn_lit},
   {file_size},
   {ct_lit},
   {sha_lit},
   decode($${pdf_b64}$$,'base64')
  )
ON CONFLICT ON CONSTRAINT uq_weekly_retail_pdf DO NOTHING;
COMMIT;
"""


def run() -> None:
    # Load env defaults for connection
    if DEFAULT_ENV.exists():
        for k, v in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(k, v)

    host = os.getenv("PGHOST", "localhost")
    port = int(os.getenv("PGPORT") or os.getenv("PG_HOST_PORT") or "5432")
    db = os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE") or "beef_data"
    user = os.getenv("POSTGRES_USER") or os.getenv("PGUSER") or "postgres"
    password = os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or ""
    if password:
        os.environ["PGPASSWORD"] = password

    if shutil.which("psql") is None:
        raise LoaderError("psql not found on PATH. Install postgresql-client.", exit_code=127)

    # Resolve PDF directory
    try:
        sys.path.append(str(OUTER_BEEF_DIR))
        from scripts.config import BEEF_STATS_DIR  # type: ignore

        pdf_base = BEEF_STATS_DIR
    except Exception:
        pdf_base = OUTER_BEEF_DIR / "beef_stats"

    in_dir = pdf_base / "pdfs" / "weekly_retail_prices"
    if not in_dir.exists():
        raise LoaderError(f"Input directory not found: {in_dir}")

    files = sorted(p for p in in_dir.glob("*.pdf"))
    files += sorted(p for p in in_dir.glob("*.PDF"))
    if not files:
        print(f"No PDF files in {in_dir}")
        return

    # Filter by last processed date
    last_date = read_last_date("weekly_retail")
    if last_date:
        print(f"Resuming weekly retail PDFs from > {last_date}")
        files = [p for p in files if (extract_date_from_filename(p.name) or date.min) > last_date]
    else:
        print("No previous weekly retail state; full load")

    url_by_base = _links_map()
    base_args = psql_base_args(host, port, user, db)
    max_date: Optional[date] = last_date

    for path in files:
        d = extract_date_from_filename(path.name)
        if d is None:
            print(f"Skipping {path.name}: missing YYYY-MM-DD prefix")
            continue
        if (max_date is None) or (d > max_date):
            max_date = d

        data = path.read_bytes()
        sha256_hex = hashlib.sha256(data).hexdigest()
        b64 = base64.b64encode(data).decode("ascii")
        base = path.name.split("__", 1)[-1]
        report_code_match = re.match(r"([A-Za-z]+_\d+)", base)
        report_code = report_code_match.group(1).upper() if report_code_match else None
        source_url = url_by_base.get(base)
        sql = build_sql_insert(
            report_date=d,
            report_code=report_code,
            source_url=source_url,
            filename=path.name,
            file_size=len(data),
            content_type="application/pdf",
            sha256_hex=sha256_hex,
            pdf_b64=b64,
        )
        print(f"Loading {path.name} → database …")
        try:
            subprocess.run(base_args, input=sql.encode("utf-8"), check=True)
        except subprocess.CalledProcessError as exc:
            raise LoaderError(f"psql failed with exit code {exc.returncode}", exit_code=exc.returncode) from exc

    if max_date is not None:
        write_last_date("weekly_retail", max_date)
    print("Weekly retail PDF load completed.")


def main() -> int:
    try:
        run()
    except LoaderError as exc:
        print(str(exc), file=sys.stderr)
        return exc.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
