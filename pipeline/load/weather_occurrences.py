"""Pipeline wrapper for weather occurrence loader."""


def run() -> None:
    from scripts.loader import weather_occurrences_loader

    weather_occurrences_loader.run()
