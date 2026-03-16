"""Pipeline wrapper for boxed PM builder."""


def run() -> None:
    from scripts.boxed_pm_builder import run as build_boxed_pm

    build_boxed_pm()
