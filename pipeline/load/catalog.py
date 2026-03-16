"""Pipeline wrapper for catalog loader."""


def run() -> None:
    from scripts.loader import catalog_loader

    catalog_loader.run()
