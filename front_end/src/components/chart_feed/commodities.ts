import { CORN_CASH_PRICES_FEED_ID } from './feedCategories'

export type CommodityOption = { id: string; label: string; apiValue: string; color: string }

const BASE_COMMODITY_OPTIONS: CommodityOption[] = [
  { id: 'corn', label: 'Corn', apiValue: 'Corn', color: '#f4d35e' },
  { id: 'sorghum', label: 'Sorghum', apiValue: 'Sorghum', color: '#f29f05' },
  { id: 'barley', label: 'Barley', apiValue: 'Barley', color: '#c5b29f' },
  { id: 'oats', label: 'Oats', apiValue: 'Oats', color: '#9aa5b1' },
]

export const CORN_CASH_WHITE_CORN_COMMODITY_ID = 'white-corn'
export const CORN_CASH_YELLOW_CORN_COMMODITY_ID = 'yellow-corn'

const BYPRODUCT_FEED_COMMODITY_OPTIONS: CommodityOption[] = [
  {
    id: 'alfalfa-meal-17',
    label: 'Alfalfa meal, dehydrated, 17 percent protein',
    apiValue: 'Alfalfa meal, dehydrated, 17 percent protein',
    color: '#15803d',
  },
  {
    id: 'corn-gluten-feed-21',
    label: 'Corn gluten feed, 21 percent protein',
    apiValue: 'Corn gluten feed, 21 percent protein',
    color: '#f97316',
  },
  {
    id: 'corn-gluten-meal-60',
    label: 'Corn gluten meal, 60 percent protein',
    apiValue: 'Corn gluten meal, 60 percent protein',
    color: '#c084fc',
  },
  {
    id: 'cottonseed-meal-41-solvent',
    label: 'Cottonseed meal, 41 percent solvent',
    apiValue: 'Cottonseed meal, 41 percent solvent',
    color: '#92400e',
  },
  {
    id: 'distillers-dried-grains',
    label: 'Distillers dried grains',
    apiValue: 'Distillers dried grains',
    color: '#dc2626',
  },
  {
    id: 'feather-meal-high-protein',
    label: 'Feather meal, high protein',
    apiValue: 'Feather meal, high protein',
    color: '#0ea5e9',
  },
  {
    id: 'hominy-feed',
    label: 'Hominy feed',
    apiValue: 'Hominy feed',
    color: '#6366f1',
  },
  {
    id: 'meat-bone-meal',
    label: 'Meat and bone meal',
    apiValue: 'Meat and bone meal',
    color: '#7f1d1d',
  },
  {
    id: 'rice-bran',
    label: 'Rice bran',
    apiValue: 'Rice bran',
    color: '#d97706',
  },
  {
    id: 'soybean-meal-high',
    label: 'Soybean meal, high protein',
    apiValue: 'Soybean meal, high protein',
    color: '#22c55e',
  },
  {
    id: 'wheat-bran',
    label: 'Wheat bran',
    apiValue: 'Wheat bran',
    color: '#facc15',
  },
  {
    id: 'wheat-middlings',
    label: 'Wheat middlings',
    apiValue: 'Wheat middlings',
    color: '#9ca3af',
  },
]

const PROCESSED_CORN_COMMODITY_OPTIONS: CommodityOption[] = [
  {
    id: 'corn-starch',
    label: 'Corn starch',
    apiValue: 'Corn starch',
    color: '#fde68a',
  },
  {
    id: 'corn-meal-yellow',
    label: 'Corn meal, yellow',
    apiValue: 'Corn meal, yellow',
    color: '#f59e0b',
  },
  {
    id: 'corn-syrup',
    label: 'Corn syrup',
    apiValue: 'Corn syrup',
    color: '#38bdf8',
  },
  {
    id: 'dextrose',
    label: 'Dextrose',
    apiValue: 'Dextrose',
    color: '#a855f7',
  },
  {
    id: 'hfcs-42',
    label: 'High-fructose corn syrup (42 percent)',
    apiValue: 'High-fructose corn syrup (42 percent)',
    color: '#ec4899',
  },
]

const PROCESSED_FEED_COMMODITY_OPTIONS: CommodityOption[] = [
  { id: 'fishmeal-solubles', label: 'Fishmeal and solubles', apiValue: 'Fishmeal and solubles', color: '#0ea5e9' },
  { id: 'meal-bone-tankage', label: 'Meal and bone meal tankage', apiValue: 'Meal and bone meal tankage', color: '#7f1d1d' },
  { id: 'milk-products', label: 'Milk products', apiValue: 'Milk products', color: '#f9a8d4' },
  { id: 'total-animal-protein-feeds', label: 'Total animal-protein feeds', apiValue: 'Total animal-protein feeds', color: '#f97316' },
  { id: 'corn-gluten-feed-meal', label: 'Corn gluten feed and meal', apiValue: 'Corn gluten feed and meal', color: '#fbbf24' },
  { id: 'total-grain-protein-feeds', label: 'Total grain-protein feeds', apiValue: 'Total grain-protein feeds', color: '#a855f7' },
  { id: 'cottonseed-meal', label: 'Cottonseed meal', apiValue: 'Cottonseed meal', color: '#92400e' },
  { id: 'linseed-meal', label: 'Linseed meal', apiValue: 'Linseed meal', color: '#ca8a04' },
  { id: 'peanut-meal', label: 'Peanut meal', apiValue: 'Peanut meal', color: '#fb7185' },
  { id: 'rapeseed-canola-meal', label: 'Rapeseed (canola) meal', apiValue: 'Rapeseed (canola) meal', color: '#4ade80' },
  { id: 'soybean-meal', label: 'Soybean meal', apiValue: 'Soybean meal', color: '#22c55e' },
  { id: 'sunflower-meal', label: 'Sunflower meal', apiValue: 'Sunflower meal', color: '#facc15' },
  { id: 'total-oilseed-meals', label: 'Total oilseed meals', apiValue: 'Total oilseed meals', color: '#10b981' },
  { id: 'fats-oils', label: 'Fats and oils', apiValue: 'Fats and oils', color: '#fb923c' },
  { id: 'misc-byproduct-feeds', label: 'Miscellaneous byproduct feeds', apiValue: 'Miscellaneous byproduct feeds', color: '#60a5fa' },
  { id: 'rice-millfeeds', label: 'Rice millfeeds', apiValue: 'Rice millfeeds', color: '#94a3b8' },
  { id: 'total-other-byproduct-feeds', label: 'Total other byproduct feeds', apiValue: 'Total other byproduct feeds', color: '#c084fc' },
  { id: 'wheat-millfeeds', label: 'Wheat millfeeds', apiValue: 'Wheat millfeeds', color: '#fcd34d' },
  { id: 'energy-feeds', label: 'Energy feeds', apiValue: 'Energy feeds', color: '#0f766e' },
  { id: 'all-feeds', label: 'All feeds', apiValue: 'All feeds', color: '#2563eb' },
  { id: 'total-energy-feeds', label: 'Total energy feeds', apiValue: 'Total energy feeds', color: '#1f2937' },
  { id: 'wheat', label: 'Wheat', apiValue: 'Wheat', color: '#f59e0b' },
]

const CORN_SORGHUM_EXPORT_COMMODITY_OPTIONS: CommodityOption[] = [
  { id: 'corn-export', label: 'Corn', apiValue: 'Corn', color: '#ca8a04' },
  { id: 'sorghum-export', label: 'Sorghum', apiValue: 'Sorghum', color: '#a16207' },
  {
    id: 'corn-corn-products-equivalent',
    label: 'Corn and corn products, grain equivalent',
    apiValue: 'Corn and corn products, grain equivalent',
    color: '#2563eb',
  },
]

const FEED_SPECIFIC_COMMODITY_OPTIONS: Record<string, CommodityOption[]> = {
  [CORN_CASH_PRICES_FEED_ID]: [
    {
      id: CORN_CASH_YELLOW_CORN_COMMODITY_ID,
      label: 'Yellow corn',
      apiValue: 'Corn, No. 2 yellow',
      color: '#fbbf24',
    },
    {
      id: CORN_CASH_WHITE_CORN_COMMODITY_ID,
      label: 'White corn',
      apiValue: 'Corn, No. 2 white',
      color: '#fde68a',
    },
  ],
  'hay-production': [
    { id: 'hay-alfalfa', label: 'Alfalfa', apiValue: 'Hay, alfalfa', color: '#15803d' },
    { id: 'hay-other', label: 'Other', apiValue: 'Hay, other', color: '#a16207' },
    { id: 'hay-all', label: 'All hay', apiValue: 'Hay, all', color: '#064e3b' },
  ],
  'byproduct-feeds-prices': BYPRODUCT_FEED_COMMODITY_OPTIONS,
  'processed-corn-products': PROCESSED_CORN_COMMODITY_OPTIONS,
  'processed-feeds-quantities': PROCESSED_FEED_COMMODITY_OPTIONS,
  'corn-sorghum-exports': CORN_SORGHUM_EXPORT_COMMODITY_OPTIONS,
}

const COMMODITY_OPTIONS: CommodityOption[] = [
  ...BASE_COMMODITY_OPTIONS,
  ...Object.values(FEED_SPECIFIC_COMMODITY_OPTIONS).flat(),
]

export const ALL_COMMODITY_IDS = BASE_COMMODITY_OPTIONS.map((opt) => opt.id)

export function commodityLabelFromId(id: string): string {
  return COMMODITY_OPTIONS.find((opt) => opt.id === id)?.label ?? id
}

export function commodityApiValueFromId(id: string): string | null {
  return COMMODITY_OPTIONS.find((opt) => opt.id === id)?.apiValue ?? null
}

export function commodityColorFromId(id: string): string {
  return COMMODITY_OPTIONS.find((opt) => opt.id === id)?.color ?? '#6b7280'
}

export function commodityIdFromApiValue(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  const found = COMMODITY_OPTIONS.find(
    (opt) => opt.apiValue.toLowerCase() === normalized,
  )
  return found?.id ?? null
}

export function resolveCommodityOptions(allowedIds: Set<string>): CommodityOption[] {
  return COMMODITY_OPTIONS.filter((option) => allowedIds.has(option.id))
}

export function resolveFeedSpecificCommodityOptions(feedId: string): CommodityOption[] {
  return FEED_SPECIFIC_COMMODITY_OPTIONS[feedId] ?? []
}
