"""Pipeline wrapper for feed costs loader."""


def run() -> None:
    from scripts.loader import feed_costs_loader

    feed_costs_loader.run()
