"""Constants for feed route presets."""

from __future__ import annotations

from typing import Dict, List

CORN_ACREAGE_PRODUCTION_TABLE = (
    "Table 1--Corn, sorghum, barley, and oats: Planted acreage, harvested acreage, "
    "production, yield, and price received by farmers"
)

CORN_PRODUCTION_DEFAULT_ATTRIBUTE = "Production"
CORN_PRODUCTION_DEFAULT_GEOGRAPHY = "United States"
CORN_PRODUCTION_DEFAULT_FREQUENCY = "Annual"
CORN_PRODUCTION_DEFAULT_COMMODITIES: List[str] = [
    "Corn",
    "Sorghum",
    "Barley",
    "Oats",
]

CORN_SORGHUM_PRICES_TABLE = (
    "Table 9--Corn and sorghum: Prices received by farmers, United States"
)
CORN_SORGHUM_PRICES_DEFAULT_ATTRIBUTE = "Price received by farmers"
CORN_SORGHUM_PRICES_DEFAULT_GEOGRAPHY = "United States"
CORN_SORGHUM_PRICES_DEFAULT_FREQUENCY = "Monthly"
CORN_SORGHUM_PRICES_DEFAULT_COMMODITIES: List[str] = [
    "Corn",
    "Sorghum",
]

HAY_TABLE_NAME = "Table 8--Hay: Production, harvested acreage, yield, and stocks"
HAY_DEFAULT_GEOGRAPHY = "United States"
HAY_PRODUCTION_COMMODITIES: List[str] = [
    "Hay, alfalfa",
    "Hay, other",
    "Hay, all",
]
HAY_ALL_COMMODITY = "Hay, all"
HAY_STOCKS_TIMEPERIODS: Dict[str, str] = {
    "may": "First of May",
    "dec": "First of Dec",
}
HAY_SUPPLY_ATTRIBUTE = "Supply per roughage-consuming animal unit (RCAU)"
HAY_DISAPPEARANCE_ATTRIBUTE = "Disappearance per roughage-consuming animal unit (RCAU)"

HAY_PRICES_TABLE = (
    "Table 11--Hay: Prices received by farmers, United States, dollars per ton"
)
HAY_PRICES_DEFAULT_ATTRIBUTE = "Price received by farmers"
HAY_PRICES_DEFAULT_GEOGRAPHY = "United States"
HAY_PRICES_DEFAULT_FREQUENCY = "Monthly"

FEED_PRICE_RATIOS_TABLE = "Table 15--Feed-price ratios for livestock, poultry, and milk"
FEED_PRICE_RATIOS_ATTRIBUTE = "Ratio"
FEED_PRICE_RATIOS_DEFAULT_GEOGRAPHY = "United States"
FEED_PRICE_RATIOS_DEFAULT_FREQUENCY = "Monthly"

__all__ = [
    "CORN_ACREAGE_PRODUCTION_TABLE",
    "CORN_PRODUCTION_DEFAULT_ATTRIBUTE",
    "CORN_PRODUCTION_DEFAULT_GEOGRAPHY",
    "CORN_PRODUCTION_DEFAULT_FREQUENCY",
    "CORN_PRODUCTION_DEFAULT_COMMODITIES",
    "CORN_SORGHUM_PRICES_TABLE",
    "CORN_SORGHUM_PRICES_DEFAULT_ATTRIBUTE",
    "CORN_SORGHUM_PRICES_DEFAULT_GEOGRAPHY",
    "CORN_SORGHUM_PRICES_DEFAULT_FREQUENCY",
    "CORN_SORGHUM_PRICES_DEFAULT_COMMODITIES",
    "HAY_TABLE_NAME",
    "HAY_DEFAULT_GEOGRAPHY",
    "HAY_PRODUCTION_COMMODITIES",
    "HAY_ALL_COMMODITY",
    "HAY_STOCKS_TIMEPERIODS",
    "HAY_SUPPLY_ATTRIBUTE",
    "HAY_DISAPPEARANCE_ATTRIBUTE",
    "HAY_PRICES_TABLE",
    "HAY_PRICES_DEFAULT_ATTRIBUTE",
    "HAY_PRICES_DEFAULT_GEOGRAPHY",
    "HAY_PRICES_DEFAULT_FREQUENCY",
    "FEED_PRICE_RATIOS_TABLE",
    "FEED_PRICE_RATIOS_ATTRIBUTE",
    "FEED_PRICE_RATIOS_DEFAULT_GEOGRAPHY",
    "FEED_PRICE_RATIOS_DEFAULT_FREQUENCY",
]
