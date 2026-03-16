"""Run text retriever tasks."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "text retrievers" / "all_text_retriever.py"

_module: ModuleType | None = None


def _load_module() -> ModuleType:
    global _module
    if _module is None:
        spec = importlib.util.spec_from_file_location(
            "pipeline.fetch.all_text_retriever", SCRIPT_PATH
        )
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load module from {SCRIPT_PATH}")
        module = importlib.util.module_from_spec(spec)
        sys.modules.setdefault(spec.name, module)
        spec.loader.exec_module(module)
        _module = module
    return _module


def run() -> None:
    module = _load_module()
    if not hasattr(module, "run"):
        raise AttributeError("all_text_retriever module missing run()")
    module.run()
