"""Backward-compatible entrypoint for boxed AM builder."""

from __future__ import annotations

import sys
from pathlib import Path

if __package__ is None or __package__ == "":  # pragma: no cover - script execution
    sys.path.append(str(Path(__file__).resolve().parents[2]))
    from scripts.boxed_am_builder.runner import run
else:  # pragma: no cover - package import
    from .runner import run


def main() -> None:
    """Run the boxed AM builder pipeline."""

    run()


if __name__ == "__main__":  # pragma: no cover - CLI execution
    main()
