"""Pipeline wrapper for boxed PM loader."""


def run() -> None:
    from scripts.loader import boxed_pm_loader

    boxed_pm_loader.run()
