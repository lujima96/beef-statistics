"""Pipeline wrapper for trimmings AM loader."""


def run() -> None:
    from scripts.loader import trimmings_am_loader

    trimmings_am_loader.run()
