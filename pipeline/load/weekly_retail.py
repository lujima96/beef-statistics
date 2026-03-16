"""Pipeline wrapper for weekly retail PDF loader."""


def run() -> None:
    from scripts.loader import weekly_retail_loader

    weekly_retail_loader.run()
