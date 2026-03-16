"""Pipeline wrapper for trimmings PM loader."""


def run() -> None:
    from scripts.loader import trimmings_pm_loader

    trimmings_pm_loader.run()
