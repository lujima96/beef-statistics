"""Configuration helpers for the supply/demand loader."""
from __future__ import annotations

import json
import os
from typing import Any, Dict

from .paths import DEFAULT_ENV, WEIGHTS_FILE


def load_env(path=DEFAULT_ENV) -> Dict[str, str]:
    """Load a simple KEY=VALUE env file."""
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


def apply_default_env() -> None:
    """Populate ``os.environ`` with values from the default env file."""
    if DEFAULT_ENV.exists():
        for key, value in load_env(DEFAULT_ENV).items():
            os.environ.setdefault(key, value)


def load_weights() -> Dict[str, Any]:
    """Read the weights configuration file."""
    try:
        return json.loads(WEIGHTS_FILE.read_text())
    except Exception as exc:  # pragma: no cover - fatal error handling
        raise SystemExit(f"Unable to read weights config: {exc}") from exc


def build_dsn() -> str:
    """Construct a PostgreSQL DSN from environment variables."""
    host = os.getenv("PGHOST", "127.0.0.1")
    port = int(os.getenv("PGPORT") or os.getenv("PG_HOST_PORT") or "5432")
    db = os.getenv("PGDATABASE") or os.getenv("POSTGRES_DB") or "beef_data"
    user = os.getenv("PGUSER") or os.getenv("POSTGRES_USER") or "postgres"
    password = os.getenv("PGPASSWORD") or os.getenv("POSTGRES_PASSWORD") or ""

    if password:
        os.environ.setdefault("PGPASSWORD", password)

    return f"postgresql://{user}:{password}@{host}:{port}/{db}"
