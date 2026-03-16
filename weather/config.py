"""Configuration values and connection helpers for NOAA weather ingestion."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, TypedDict

API_TOKEN = "FXaGRRuyuLgsBXYEYMMxQqJjBNSYfKql"
BASE_URL = "https://www.ncei.noaa.gov/cdo-web/api/v2"
HEADERS = {"token": API_TOKEN}

BEEF_STATS_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ENV = BEEF_STATS_DIR / ".env"
CSV_PATH = BEEF_STATS_DIR / "national_daily_average_temp.csv"
STATE_DIR = BEEF_STATS_DIR / ".loader_state"
STATE_FILE = STATE_DIR / "national_daily_average_temperature.last"


class TemperatureStats(TypedDict):
    """Container for the derived national temperature metrics."""

    average_temperature: float
    states_reporting: int | None
    station_observations: int | None


def load_env(path: Path) -> Dict[str, str]:
    """Load simple KEY=VALUE pairs from an environment file."""

    env: Dict[str, str] = {}
    if not path.exists():
        return env

    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def connection_config() -> Dict[str, str]:
    """Assemble PostgreSQL connection values from the environment."""

    if DEFAULT_ENV.exists():
        for key, value in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(key, value)

    port = os.getenv("PGPORT") or os.getenv("PG_HOST_PORT") or "5432"

    return {
        "host": os.getenv("PGHOST", "localhost"),
        "port": str(port),
        "db": os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE") or "beef_data",
        "user": os.getenv("POSTGRES_USER") or os.getenv("PGUSER") or "postgres",
        "password": os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or "",
    }


def build_dsn(cfg: Dict[str, str]) -> str:
    """Create a PostgreSQL DSN string from connection parameters."""

    password = cfg.get("password") or ""
    if password:
        os.environ.setdefault("PGPASSWORD", password)
    return f"postgresql://{cfg['user']}:{password}@{cfg['host']}:{cfg['port']}/{cfg['db']}"
