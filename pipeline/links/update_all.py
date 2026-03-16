"""Wrappers for link updating tasks."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "link updaters" / "update_all.py"


_def_module: ModuleType | None = None


def _load_module() -> ModuleType:
    global _def_module
    if _def_module is None:
        spec = importlib.util.spec_from_file_location(
            "pipeline.link_updaters.update_all", SCRIPT_PATH
        )
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load module from {SCRIPT_PATH}")
        module = importlib.util.module_from_spec(spec)
        sys.modules.setdefault(spec.name, module)
        spec.loader.exec_module(module)
        _def_module = module
    return _def_module


def run() -> None:
    """Execute the legacy update_all script in-process."""
    module = _load_module()
    if not hasattr(module, "run"):
        raise AttributeError("update_all module does not define run()")
    module.run()
