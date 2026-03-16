"""Pipeline wrapper for weekly boxed beef PDF loader."""


def run() -> None:
    from scripts.loader import weekly_boxed_beef_loader

    weekly_boxed_beef_loader.run()
