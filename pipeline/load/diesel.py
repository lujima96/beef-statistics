"""Pipeline wrapper for diesel price loader."""


def run() -> None:
    from scripts.loader import diesel_price_loader

    diesel_price_loader.run()
