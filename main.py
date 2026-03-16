"""Compatibility wrapper for the beef statistics pipeline runner."""

from __future__ import annotations

from pipeline.runner import main as _runner_main


def main(argv: list[str] | None = None) -> int:
    """Delegate execution to :mod:`pipeline.runner`."""

    return _runner_main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
