"""Pipeline wrapper for boxed AM loader."""


def run() -> None:
    from scripts.loader import boxed_am_loader

    boxed_am_loader.run()
