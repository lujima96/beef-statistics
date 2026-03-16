"""Pipeline wrapper for trimmings PM builder."""


def run() -> None:
    from scripts.trimmings_pm_builder import trimmings_pm_builder

    trimmings_pm_builder.run()
