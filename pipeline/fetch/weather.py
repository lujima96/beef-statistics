"""Wrapper for weather data fetch task."""

from __future__ import annotations


def run() -> None:
    from weather.get_weather_data import run as weather_run

    weather_run()
