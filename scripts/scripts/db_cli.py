#!/usr/bin/env python3
"""
Simple DB helper to run the project's SQL files via `psql`.

Reads defaults from `.env` (or `beef_stats/.env` in legacy layout) and allows overrides via CLI flags
or environment variables. Mirrors the behavior of `scripts/db_apply.sh`
and `scripts/db_health.sh` but in Python.

Examples:
  python scripts/db_cli.py apply
  python scripts/db_cli.py health
  python scripts/db_cli.py apply --host 127.0.0.1 --port 5432
"""
from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict

logging.basicConfig(level=logging.INFO, format="%(message)s")


SCRIPT_PATH = Path(__file__).resolve()


def _find_repo_root() -> Path:
    # Walk upward and pick the first directory that looks like the project root.
    for parent in SCRIPT_PATH.parents:
        if (parent / "scripts").is_dir() and (parent / "sql").is_dir():
            return parent
    return SCRIPT_PATH.parents[2]


ROOT = _find_repo_root()
ENV_CANDIDATES = [ROOT / ".env", ROOT / "beef_stats" / ".env"]
DEFAULT_ENV = next((path for path in ENV_CANDIDATES if path.exists()), ENV_CANDIDATES[0])
SQL_DIR_CANDIDATES = [ROOT / "sql", ROOT / "beef_stats" / "sql"]
SQL_DIR = next((path for path in SQL_DIR_CANDIDATES if path.exists()), SQL_DIR_CANDIDATES[0])


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


USE_DOCKER = False


def _local_psql_args(args: argparse.Namespace) -> list[str]:
    return [
        "psql",
        "-w",  # never prompt for password
        "-h",
        args.host,
        "-p",
        str(args.port),
        "-U",
        args.user,
        "-d",
        args.database,
        "-v",
        "ON_ERROR_STOP=1",
    ]


def _docker_psql_args(args: argparse.Namespace, container: str) -> list[str]:
    cmd = [
        "docker",
        "exec",
        "-i",
    ]
    if args.password:
        cmd += ["-e", f"PGPASSWORD={args.password}"]
    cmd += [
        container,
        "psql",
        "-w",
        "-U",
        args.user,
        "-d",
        args.database,
        "-v",
        "ON_ERROR_STOP=1",
    ]
    return cmd


def run_psql_file(args: argparse.Namespace, file: Path, *, container: str | None = None) -> None:
    if not USE_DOCKER:
        cmd = _local_psql_args(args) + ["-f", str(file)]
        subprocess.run(cmd, check=True)
    else:
        assert container is not None
        cmd = _docker_psql_args(args, container)
        # Pipe file contents to STDIN because the file path is not inside the container
        with open(file, "rb") as f:
            subprocess.run(cmd, check=True, stdin=f)


def ensure_psql(args: argparse.Namespace) -> tuple[bool, str | None]:
    global USE_DOCKER
    if shutil.which("psql") is not None:
        USE_DOCKER = False
        return False, None
    # Try docker fallback (container from docker-compose)
    container = os.getenv("PG_CONTAINER", "beef-postgres")
    if shutil.which("docker") is not None:
        probe = subprocess.run([
            "docker", "exec", container, "psql", "--version"
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if probe.returncode == 0:
            USE_DOCKER = True
            logging.error("psql not found locally; using docker exec in '%s'", container)
            return True, container
    logging.error("psql not found on PATH. Install postgresql-client or ensure Docker container access.")
    sys.exit(127)


def apply_sql(args: argparse.Namespace) -> None:
    use_docker, container = ensure_psql(args)
    order = [
        SQL_DIR / "00_schema.sql",
        SQL_DIR / "01_types.sql",
        SQL_DIR / "02_report_dates.sql",
        SQL_DIR / "05_json_landing.sql",
        SQL_DIR / "10_boxed_beef.sql",
        SQL_DIR / "20_trimmings.sql",
        SQL_DIR / "30_catalog.sql",
        SQL_DIR / "40_index_report.sql",
        SQL_DIR / "50_weekly_retail.sql",
        SQL_DIR / "51_weekly_boxed_beef.sql",
        SQL_DIR / "60_cow_sheet_exports.sql",
        SQL_DIR / "61_choice_sheet_exports.sql",
        SQL_DIR / "62_prime_sheet_exports.sql",
        SQL_DIR / "63_select_sheet_exports.sql",
        SQL_DIR / "64_enforce_report_date_fk.sql",
        SQL_DIR / "80_migrations.sql",
        SQL_DIR / "90_indexes.sql",
    ]
    for f in order:
        logging.info("Applying: %s", f.relative_to(ROOT))
        run_psql_file(args, f, container=container if use_docker else None)
    logging.info("All SQL applied to %s@%s:%s/%s", args.user, args.host, args.port, args.database)


def run_health(args: argparse.Namespace) -> None:
    use_docker, container = ensure_psql(args)
    health = SQL_DIR / "health_check.sql"
    logging.info("Running health check: %s", health.relative_to(ROOT))
    run_psql_file(args, health, container=container if use_docker else None)


def main() -> None:
    # Preload default .env so parser defaults see the values
    if DEFAULT_ENV.exists():
        for k, v in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(k, v)

    parser = argparse.ArgumentParser(description="DB tooling for beef_stats")
    # Shared connection flags
    def add_conn_flags(p: argparse.ArgumentParser) -> None:
        p.add_argument("--host", default=os.getenv("PGHOST", "localhost"))
        # PORT defaults: PGPORT env > PG_HOST_PORT from .env > 5432
        default_port = os.getenv("PGPORT") or os.getenv("PG_HOST_PORT") or "5432"
        p.add_argument("--port", type=int, default=int(default_port))
        # Prefer POSTGRES_* (from project .env) over PG* from shell
        p.add_argument("--database", default=os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE") or "beef_data")
        p.add_argument("--user", default=os.getenv("POSTGRES_USER") or os.getenv("PGUSER") or "postgres")
        p.add_argument("--password", default=os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or "")
        p.add_argument("--env-file", type=Path, default=Path(os.getenv("ENV_FILE") or DEFAULT_ENV))
    # Allow running with no subcommand by putting flags on the root parser too
    add_conn_flags(parser)

    sub = parser.add_subparsers(dest="command", required=False)
    p_apply = sub.add_parser("apply", help="Apply schema and migrations")
    add_conn_flags(p_apply)
    p_health = sub.add_parser("health", help="Run health_check.sql")
    add_conn_flags(p_health)
    p_all = sub.add_parser("all", help="Apply then run health check (default)")
    add_conn_flags(p_all)

    # If no args provided, default to "all"
    if len(sys.argv) == 1:
        sys.argv.append("all")

    args = parser.parse_args()

    # Load specified .env (override defaults loaded earlier)
    file_env = load_env(args.env_file)
    for k, v in file_env.items():
        os.environ[k] = v

    # Finalize password export for psql
    # Ensure PGPASSWORD is available; prefer explicit flag, then env, then .env POSTGRES_PASSWORD
    pgpassword = args.password or os.getenv("PGPASSWORD") or os.getenv("POSTGRES_PASSWORD") or ""
    if pgpassword:
        os.environ["PGPASSWORD"] = pgpassword
        args.password = pgpassword

    if args.command == "apply":
        apply_sql(args)
    elif args.command == "health":
        run_health(args)
    elif args.command == "all" or args.command is None:
        apply_sql(args)
        run_health(args)
    else:
        parser.error("Unknown command")


if __name__ == "__main__":
    main()
