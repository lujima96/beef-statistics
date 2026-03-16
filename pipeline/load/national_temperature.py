"""Pipeline wrapper for national temperature loader."""


def run() -> None:
    from scripts.loader import national_temperature_loader

    national_temperature_loader.run()
