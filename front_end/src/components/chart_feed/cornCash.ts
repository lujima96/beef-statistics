import type { AttributeOption } from './attributes'
import { CORN_CASH_PRICES_GEOGRAPHY_OPTIONS } from './attributes'
import { CORN_CASH_WHITE_CORN_COMMODITY_ID } from './commodities'

const CORN_CASH_PRICES_GEOGRAPHY_COLOR_MAP: Record<string, string> = {
  'west-tennessee-tn': '#f97316',
  'toledo-oh': '#2563eb',
  'st-louis-mo': '#16a34a',
  'southwest-iowa-ia': '#7c3aed',
  'minneapolis-mn': '#0ea5e9',
  'gulf-coast-ports-la': '#f59e0b',
  'kansas-city-mo': '#dc2626',
  'chicago-il': '#0f172a',
  'central-illinois-il': '#14b8a6',
}

const CORN_CASH_PRICES_GEOGRAPHY_COLOR_BY_API = new Map(
  CORN_CASH_PRICES_GEOGRAPHY_OPTIONS.map((option) => [
    option.apiValue.trim().toLowerCase(),
    CORN_CASH_PRICES_GEOGRAPHY_COLOR_MAP[option.id] ?? '#6b7280',
  ]),
)

const CORN_CASH_WHITE_ONLY_GEOGRAPHY_OPTIONS = CORN_CASH_PRICES_GEOGRAPHY_OPTIONS.filter(
  (option) => option.id === 'kansas-city-mo',
)

export function resolveCornCashGeographyOptions(commodityIds: string[]): AttributeOption[] {
  const firstCommodityId = commodityIds[0]
  if (firstCommodityId === CORN_CASH_WHITE_CORN_COMMODITY_ID) {
    return CORN_CASH_WHITE_ONLY_GEOGRAPHY_OPTIONS
  }
  return CORN_CASH_PRICES_GEOGRAPHY_OPTIONS
}

export function cornCashGeographyColorFromId(id: string): string {
  return CORN_CASH_PRICES_GEOGRAPHY_COLOR_MAP[id] ?? '#6b7280'
}

export function cornCashGeographyColorFromApiValue(value: string): string {
  const normalized = value.trim().toLowerCase()
  return CORN_CASH_PRICES_GEOGRAPHY_COLOR_BY_API.get(normalized) ?? '#6b7280'
}
