"""Entry point for external weather and energy file refreshes."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

from .pipeline import main as temperature_main
from .storm_events import run as sync_storm_events

ROOT_DIR = Path(__file__).resolve().parents[1]
DIESEL_SCRIPT_PATH = ROOT_DIR / "scripts" / "energy" / "fetch_ulds_prices.py"

_diesel_module: ModuleType | None = None


def _load_diesel_module() -> ModuleType:
    global _diesel_module
    if _diesel_module is None:
        spec = importlib.util.spec_from_file_location(
            "weather.fetch_ulds_prices",
            DIESEL_SCRIPT_PATH,
        )
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load module from {DIESEL_SCRIPT_PATH}")
        module = importlib.util.module_from_spec(spec)
        sys.modules.setdefault(spec.name, module)
        spec.loader.exec_module(module)
        _diesel_module = module
    return _diesel_module


def run() -> None:
    """Refresh weather temperatures, storm events, and diesel CSVs."""

    print("Running temperature refresh...")
    temperature_main()

    print("Running storm events refresh...")
    sync_storm_events()

    print("Running diesel refresh...")
    diesel_module = _load_diesel_module()
    if not hasattr(diesel_module, "main"):
        raise AttributeError("fetch_ulds_prices module missing main()")
    diesel_module.main()


def main() -> int:
    run()
    return 0


__all__ = ["run", "main"]


if __name__ == "__main__":
    raise SystemExit(main())
