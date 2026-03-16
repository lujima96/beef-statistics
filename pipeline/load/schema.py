"""Apply database schema using the legacy db_cli script."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_CLI = ROOT / "scripts" / "scripts" / "db_cli.py"


def run() -> None:
    if not DB_CLI.exists():
        raise FileNotFoundError(f"db_cli.py not found at {DB_CLI}")
    subprocess.run([sys.executable, str(DB_CLI), "all"], check=True)
