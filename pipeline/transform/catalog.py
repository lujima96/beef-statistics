"""Pipeline wrapper for catalog processing."""


def run() -> None:
    from scripts.catalog_builder import main_catalog

    main_catalog.run()
