#!/usr/bin/env python3
"""Start the USDA Beef Data Scraper microservice.

Can be invoked from any working directory:
    python /path/to/beef-statistics-main/start.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Resolve the project root from the location of this file, not CWD.
# This ensures all module imports and data paths work regardless of
# where the caller invokes this script from.
PROJECT_ROOT = Path(__file__).resolve().parent

# Make the project root the first entry on sys.path so that
# `service`, `pipeline`, and `scripts` are always importable.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Change CWD so uvicorn's string-based import ("service:app") finds service.py.
os.chdir(PROJECT_ROOT)


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


if __name__ == "__main__":
    load_env(PROJECT_ROOT / ".env")

    import uvicorn

    host = os.getenv("SERVICE_HOST", "0.0.0.0")
    port = int(os.getenv("SERVICE_PORT", "8000"))
    reload = os.getenv("SERVICE_RELOAD", "false").lower() == "true"

    print(f"Starting USDA Beef Data Scraper on http://{host}:{port}")
    print(f"Docs: http://{host}:{port}/docs")

    uvicorn.run("service:app", host=host, port=port, reload=reload)
