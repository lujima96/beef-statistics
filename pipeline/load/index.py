"""Pipeline wrapper for index loader."""


def run() -> None:
    from scripts.loader import index_loader

    index_loader.run()
