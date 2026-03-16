import { CORN_CASH_PRICES_FEED_ID } from './feedCategories'

export const CORN_SORGHUM_PRICES_ATTRIBUTE = 'Price received by farmers'
export const FEED_PRICE_RATIOS_ATTRIBUTE = 'Ratio'

export type AttributeOption = {
  id: string
  label: string
  apiValue: string
  frequency?: string | null
  timeperiod?: string | null
  geography?: string | null
}

const DEFAULT_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  { id: 'area-planted', label: 'Area planted', apiValue: 'Area planted' },
  { id: 'area-harvested', label: 'Area harvested', apiValue: 'Area harvested' },
  { id: 'production', label: 'Production', apiValue: 'Production' },
  { id: 'yield', label: 'Yield', apiValue: 'Yield' },
  { id: 'price-received', label: 'Price received', apiValue: 'Price received by farmers' },
]

const HAY_PRODUCTION_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  { id: 'hay-production', label: 'Production (1,000 tons)', apiValue: 'Production', frequency: 'Annual' },
  {
    id: 'hay-area-harvested',
    label: 'Area harvested (1,000 acres)',
    apiValue: 'Area harvested',
    frequency: 'Annual',
  },
  {
    id: 'hay-yield',
    label: 'Yield per harvested acre (tons / acre)',
    apiValue: 'Yield per harvested acre',
    frequency: 'Annual',
  },
  {
    id: 'hay-stocks-may',
    label: 'Stocks on farms (May 1, 1,000 tons)',
    apiValue: 'Stocks on farms',
    frequency: 'Monthly',
    timeperiod: 'First of May',
  },
  {
    id: 'hay-stocks-dec',
    label: 'Stocks on farms (Dec 1, 1,000 tons)',
    apiValue: 'Stocks on farms',
    frequency: 'Monthly',
    timeperiod: 'First of Dec',
  },
  {
    id: 'hay-supply-rcau',
    label: 'Supply per RCAU (tons per RCAU)',
    apiValue: 'Supply per roughage-consuming animal unit (RCAU)',
    frequency: 'Annual',
  },
  {
    id: 'hay-disappearance-rcau',
    label: 'Disappearance per RCAU (tons per RCAU)',
    apiValue: 'Disappearance per roughage-consuming animal unit (RCAU)',
    frequency: 'Annual',
  },
]

const HAY_PRICE_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  { id: 'hay-alfalfa', label: 'Alfalfa', apiValue: 'Hay, alfalfa' },
  { id: 'hay-other', label: 'Other', apiValue: 'Hay, other' },
  { id: 'hay-all', label: 'All hay', apiValue: 'Hay, all' },
]

const FEED_PRICE_RATIO_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  {
    id: 'broiler-feed',
    label: 'Broiler-feed',
    apiValue: 'Broiler-feed (grower feed to live weight)',
  },
  {
    id: 'egg-feed',
    label: 'Egg-feed',
    apiValue: 'Egg-feed (laying feed to dozen eggs)',
  },
  {
    id: 'hog-feed',
    label: 'Hog-feed',
    apiValue: 'Hog-feed (corn to live weight)',
  },
  {
    id: 'milk-feed',
    label: 'Milk-feed',
    apiValue: 'Milk-feed (16 percent mixed dairy feed to whole milk)',
  },
  {
    id: 'steer-heifer-feed',
    label: 'Steer & heifer-feed',
    apiValue: 'Steer & heifer-feed (corn to live weight)',
  },
  {
    id: 'turkey-feed',
    label: 'Turkey-feed',
    apiValue: 'Turkey-feed (grower feed to live weight)',
  },
]

const CORN_SORGHUM_PRICE_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  {
    id: 'monthly',
    label: 'Monthly',
    apiValue: CORN_SORGHUM_PRICES_ATTRIBUTE,
    frequency: 'Monthly',
  },
  {
    id: 'annual',
    label: 'Annual (marketing year Sep–Aug)',
    apiValue: CORN_SORGHUM_PRICES_ATTRIBUTE,
    frequency: 'Annual',
  },
]

export const FOREIGN_COARSE_GRAIN_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  { id: 'beginning-stocks', label: 'Beginning stocks', apiValue: 'Beginning stocks' },
  { id: 'production', label: 'Production', apiValue: 'Production' },
  { id: 'imports', label: 'Imports', apiValue: 'Imports' },
  { id: 'total-supply', label: 'Total supply', apiValue: 'Total supply' },
  {
    id: 'food-seed-industrial',
    label: 'Food, seed, and industrial use',
    apiValue: 'Food, seed, and industrial use',
  },
  { id: 'feed-use', label: 'Feed use', apiValue: 'Feed use' },
  { id: 'total-domestic-use', label: 'Total domestic use', apiValue: 'Total domestic use' },
  { id: 'exports', label: 'Exports', apiValue: 'Exports' },
  { id: 'total-use', label: 'Total use', apiValue: 'Total use' },
  { id: 'ending-stocks', label: 'Ending stocks', apiValue: 'Ending stocks' },
]

export const FEED_GRAINS_SUPPLY_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  { id: 'beginning-stocks', label: 'Beginning stocks', apiValue: 'Beginning stocks' },
  { id: 'production', label: 'Production', apiValue: 'Production' },
  { id: 'imports', label: 'Imports', apiValue: 'Imports' },
  { id: 'total-supply', label: 'Total supply', apiValue: 'Total supply' },
  {
    id: 'food-seed-industrial',
    label: 'Food, seed, and industrial',
    apiValue: 'Food, seed, and industrial use',
  },
  { id: 'feed-use', label: 'Feed use', apiValue: 'Feed use' },
  { id: 'total-domestic-use', label: 'Total domestic use', apiValue: 'Total domestic use' },
  { id: 'exports', label: 'Exports', apiValue: 'Exports' },
  { id: 'total-use', label: 'Total use', apiValue: 'Total use' },
  { id: 'ending-stocks', label: 'Ending stocks', apiValue: 'Ending stocks' },
]

export const CORN_SUPPLY_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  { id: 'beginning-stocks', label: 'Beginning stocks', apiValue: 'Beginning stocks' },
  { id: 'imports', label: 'Imports', apiValue: 'Imports' },
  {
    id: 'feed-residual',
    label: 'Feed & residual',
    apiValue: 'Feed and residual use',
  },
  {
    id: 'food-alcohol-industrial',
    label: 'Food, alcohol & industrial',
    apiValue: 'Food, alcohol, and industrial use',
  },
  { id: 'exports', label: 'Exports', apiValue: 'Exports' },
  { id: 'total-use', label: 'Total use', apiValue: 'Total use' },
  { id: 'ending-stocks', label: 'Ending stocks', apiValue: 'Ending stocks' },
]

export const CORN_FOOD_INDUSTRIAL_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  {
    id: 'alcohol-fuel',
    label: 'Alcohol for fuel (ethanol)',
    apiValue: 'Alcohol for fuel use',
  },
  { id: 'hfcs', label: 'HFCS', apiValue: 'High-fructose corn syrup (HFCS) use' },
  {
    id: 'glucose-dextrose',
    label: 'Glucose & dextrose',
    apiValue: 'Glucose and dextrose use',
  },
  { id: 'starch', label: 'Starch', apiValue: 'Starch use' },
  {
    id: 'alcohol-beverages',
    label: 'Alcohol (beverages & mfg)',
    apiValue: 'Alcohol for beverages and manufacturing use',
  },
  {
    id: 'cereals-other',
    label: 'Cereals & other',
    apiValue: 'Cereals and other products use',
  },
  { id: 'seed', label: 'Seed', apiValue: 'Seed use' },
]

export const CORN_CASH_PRICES_GEOGRAPHY_OPTIONS: AttributeOption[] = [
  { id: 'west-tennessee-tn', label: 'West Tennessee, TN', apiValue: 'West Tennessee, TN' },
  { id: 'toledo-oh', label: 'Toledo, OH', apiValue: 'Toledo, OH' },
  { id: 'st-louis-mo', label: 'St. Louis, MO', apiValue: 'St. Louis, MO' },
  { id: 'southwest-iowa-ia', label: 'Southwest Iowa, IA', apiValue: 'Southwest Iowa, IA' },
  { id: 'minneapolis-mn', label: 'Minneapolis, MN', apiValue: 'Minneapolis, MN' },
  { id: 'gulf-coast-ports-la', label: 'Gulf Coast Ports, LA', apiValue: 'Gulf Coast Ports, LA' },
  { id: 'kansas-city-mo', label: 'Kansas City, MO', apiValue: 'Kansas City, MO' },
  { id: 'chicago-il', label: 'Chicago, IL', apiValue: 'Chicago, IL' },
  { id: 'central-illinois-il', label: 'Central Illinois, IL', apiValue: 'Central Illinois, IL' },
]

const BYPRODUCT_FEED_LOCATION_OPTIONS: AttributeOption[] = [
  {
    id: 'kansas-city-mo',
    label: 'Kansas City, MO',
    apiValue: 'Wholesale price',
    geography: 'Kansas City, MO',
    frequency: 'Monthly',
  },
  {
    id: 'midwest',
    label: 'Midwest',
    apiValue: 'Wholesale price',
    geography: 'Midwest',
    frequency: 'Monthly',
  },
  {
    id: 'memphis-tn',
    label: 'Memphis, TN',
    apiValue: 'Wholesale price',
    geography: 'Memphis, TN',
    frequency: 'Monthly',
  },
  {
    id: 'central-illinois-il',
    label: 'Central Illinois, IL',
    apiValue: 'Wholesale price',
    geography: 'Central Illinois, IL',
    frequency: 'Monthly',
  },
  {
    id: 'arkansas-points-ar',
    label: 'Arkansas Points, AR',
    apiValue: 'Wholesale price',
    geography: 'Arkansas Points, AR',
    frequency: 'Monthly',
  },
  {
    id: 'illinois-points-il',
    label: 'Illinois Points, IL',
    apiValue: 'Wholesale price',
    geography: 'Illinois Points, IL',
    frequency: 'Monthly',
  },
  {
    id: 'central-united-states',
    label: 'Central United States',
    apiValue: 'Wholesale price',
    geography: 'Central United States',
    frequency: 'Monthly',
  },
  {
    id: 'arkansas',
    label: 'Arkansas',
    apiValue: 'Wholesale price',
    geography: 'Arkansas',
    frequency: 'Monthly',
  },
]

const PROCESSED_CORN_LOCATION_OPTIONS: AttributeOption[] = [
  {
    id: 'midwest',
    label: 'Midwest',
    apiValue: 'Quoted market prices',
    geography: 'Midwest',
    frequency: 'Monthly',
  },
  {
    id: 'chicago-il',
    label: 'Chicago, IL',
    apiValue: 'Quoted market prices',
    geography: 'Chicago, IL',
    frequency: 'Monthly',
  },
  {
    id: 'new-york-ny',
    label: 'New York, NY',
    apiValue: 'Quoted market prices',
    geography: 'New York, NY',
    frequency: 'Monthly',
  },
]

const PROCESSED_FEED_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  {
    id: 'processed-feed-feed-residual',
    label: 'Feed and residual use',
    apiValue: 'Feed and residual use',
    frequency: 'Annual',
  },
  {
    id: 'processed-feed-feed-gcau',
    label: 'Feed per grain-consuming animal unit (GCAU)',
    apiValue: 'Feed per grain-consuming animal unit (GCAU)',
    frequency: 'Annual',
  },
]

const CORN_SORGHUM_EXPORT_ATTRIBUTE_OPTIONS: AttributeOption[] = [
  {
    id: 'corn-sorghum-exports',
    label: 'Exports',
    apiValue: 'Exports',
    frequency: 'Monthly',
  },
]

const FOREIGN_COARSE_GRAIN_ATTRIBUTE_COLOR_MAP: Record<string, string> = {
  'beginning-stocks': '#9ca3af',
  production: '#16a34a',
  imports: '#2563eb',
  'total-supply': '#0d9488',
  'food-seed-industrial': '#f97316',
  'feed-use': '#92400e',
  'total-domestic-use': '#dc2626',
  exports: '#7c3aed',
  'total-use': '#111827',
  'ending-stocks': '#4b5563',
}

const FOREIGN_COARSE_GRAIN_ATTRIBUTE_COLOR_BY_API = new Map(
  FOREIGN_COARSE_GRAIN_ATTRIBUTE_OPTIONS.map((option) => [
    option.apiValue.toLowerCase(),
    FOREIGN_COARSE_GRAIN_ATTRIBUTE_COLOR_MAP[option.id] ?? '#6b7280',
  ]),
)

const FEED_GRAINS_SUPPLY_ATTRIBUTE_COLOR_MAP: Record<string, string> = {
  ...FOREIGN_COARSE_GRAIN_ATTRIBUTE_COLOR_MAP,
}

const FEED_GRAINS_SUPPLY_ATTRIBUTE_COLOR_BY_API = new Map(
  FEED_GRAINS_SUPPLY_ATTRIBUTE_OPTIONS.map((option) => [
    option.apiValue.toLowerCase(),
    FEED_GRAINS_SUPPLY_ATTRIBUTE_COLOR_MAP[option.id] ?? '#6b7280',
  ]),
)

const CORN_SUPPLY_ATTRIBUTE_COLOR_MAP: Record<string, string> = {
  'beginning-stocks': '#9ca3af',
  imports: '#2563eb',
  'feed-residual': '#92400e',
  'food-alcohol-industrial': '#f97316',
  exports: '#7c3aed',
  'total-use': '#111827',
  'ending-stocks': '#4b5563',
}

const CORN_SUPPLY_ATTRIBUTE_COLOR_BY_API = new Map(
  CORN_SUPPLY_ATTRIBUTE_OPTIONS.map((option) => [
    option.apiValue.toLowerCase(),
    CORN_SUPPLY_ATTRIBUTE_COLOR_MAP[option.id] ?? '#6b7280',
  ]),
)

const CORN_FOOD_INDUSTRIAL_ATTRIBUTE_COLOR_MAP: Record<string, string> = {
  'alcohol-fuel': '#f97316',
  hfcs: '#2563eb',
  'glucose-dextrose': '#7c3aed',
  starch: '#16a34a',
  'alcohol-beverages': '#db2777',
  'cereals-other': '#0ea5e9',
  seed: '#f59e0b',
}

const CORN_FOOD_INDUSTRIAL_ATTRIBUTE_COLOR_BY_API = new Map(
  CORN_FOOD_INDUSTRIAL_ATTRIBUTE_OPTIONS.map((option) => [
    option.apiValue.toLowerCase(),
    CORN_FOOD_INDUSTRIAL_ATTRIBUTE_COLOR_MAP[option.id] ?? '#6b7280',
  ]),
)

const FEED_PRICE_RATIO_ATTRIBUTE_COLOR_MAP: Record<string, string> = {
  'broiler-feed': '#2563eb',
  'egg-feed': '#f97316',
  'hog-feed': '#16a34a',
  'milk-feed': '#a855f7',
  'steer-heifer-feed': '#dc2626',
  'turkey-feed': '#0ea5e9',
}

const FEED_PRICE_RATIO_ATTRIBUTE_COLOR_BY_API = new Map(
  FEED_PRICE_RATIO_ATTRIBUTE_OPTIONS.map((option) => [
    option.apiValue.toLowerCase(),
    FEED_PRICE_RATIO_ATTRIBUTE_COLOR_MAP[option.id] ?? '#6b7280',
  ]),
)

const FEED_ATTRIBUTE_COLOR_MAPS: Record<string, Record<string, string>> = {
  'foreign-coarse-grains': FOREIGN_COARSE_GRAIN_ATTRIBUTE_COLOR_MAP,
  'feed-grains-supply': FEED_GRAINS_SUPPLY_ATTRIBUTE_COLOR_MAP,
  'corn-supply-disappearance': CORN_SUPPLY_ATTRIBUTE_COLOR_MAP,
  'corn-food-industrial': CORN_FOOD_INDUSTRIAL_ATTRIBUTE_COLOR_MAP,
  'feed-price-ratios': FEED_PRICE_RATIO_ATTRIBUTE_COLOR_MAP,
}

const FEED_ATTRIBUTE_COLOR_BY_API_MAP: Record<string, Map<string, string>> = {
  'foreign-coarse-grains': FOREIGN_COARSE_GRAIN_ATTRIBUTE_COLOR_BY_API,
  'feed-grains-supply': FEED_GRAINS_SUPPLY_ATTRIBUTE_COLOR_BY_API,
  'corn-supply-disappearance': CORN_SUPPLY_ATTRIBUTE_COLOR_BY_API,
  'corn-food-industrial': CORN_FOOD_INDUSTRIAL_ATTRIBUTE_COLOR_BY_API,
  'feed-price-ratios': FEED_PRICE_RATIO_ATTRIBUTE_COLOR_BY_API,
}

export type AttributeConfig = {
  options: AttributeOption[]
  multi: boolean
  defaultSelection: string[]
  showCommoditySelector: boolean
  showAttributeSelector: boolean
  controlLabel: string
  emptyLabel: string
  valueType?: 'attribute' | 'commodity'
}

const ATTRIBUTE_CONFIGS: Record<string, AttributeConfig> = {
  default: {
    options: DEFAULT_ATTRIBUTE_OPTIONS,
    multi: false,
    defaultSelection: DEFAULT_ATTRIBUTE_OPTIONS[0] ? [DEFAULT_ATTRIBUTE_OPTIONS[0].id] : [],
    showCommoditySelector: false,
    showAttributeSelector: true,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attribute',
  },
  'feed-price-ratios': {
    options: FEED_PRICE_RATIO_ATTRIBUTE_OPTIONS,
    multi: true,
    defaultSelection: ['broiler-feed', 'hog-feed', 'milk-feed'],
    showCommoditySelector: false,
    showAttributeSelector: true,
    controlLabel: 'Ratio types',
    emptyLabel: 'Select feed ratios',
    valueType: 'commodity',
  },
  'corn-acreage-production': {
    options: DEFAULT_ATTRIBUTE_OPTIONS,
    multi: false,
    defaultSelection: DEFAULT_ATTRIBUTE_OPTIONS[0] ? [DEFAULT_ATTRIBUTE_OPTIONS[0].id] : [],
    showCommoditySelector: false,
    showAttributeSelector: true,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attribute',
  },
  'hay-production': {
    options: HAY_PRODUCTION_ATTRIBUTE_OPTIONS,
    multi: false,
    defaultSelection: HAY_PRODUCTION_ATTRIBUTE_OPTIONS[0] ? [HAY_PRODUCTION_ATTRIBUTE_OPTIONS[0].id] : [],
    showCommoditySelector: true,
    showAttributeSelector: true,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attribute',
  },
  'hay-prices': {
    options: HAY_PRICE_ATTRIBUTE_OPTIONS,
    multi: true,
    defaultSelection: HAY_PRICE_ATTRIBUTE_OPTIONS.map((option) => option.id),
    showCommoditySelector: false,
    showAttributeSelector: true,
    controlLabel: 'Hay type',
    emptyLabel: 'Select hay types',
  },
  'foreign-coarse-grains': {
    options: FOREIGN_COARSE_GRAIN_ATTRIBUTE_OPTIONS,
    multi: true,
    defaultSelection: ['production', 'imports', 'total-use', 'ending-stocks'],
    showCommoditySelector: false,
    showAttributeSelector: true,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attributes',
  },
  'feed-grains-supply': {
    options: FEED_GRAINS_SUPPLY_ATTRIBUTE_OPTIONS,
    multi: true,
    defaultSelection: ['production', 'imports', 'total-use', 'ending-stocks'],
    showCommoditySelector: false,
    showAttributeSelector: true,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attributes',
  },
  'corn-supply-disappearance': {
    options: CORN_SUPPLY_ATTRIBUTE_OPTIONS,
    multi: true,
    defaultSelection: ['beginning-stocks', 'feed-residual', 'exports', 'ending-stocks'],
    showCommoditySelector: false,
    showAttributeSelector: true,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attributes',
  },
  'corn-food-industrial': {
    options: CORN_FOOD_INDUSTRIAL_ATTRIBUTE_OPTIONS,
    multi: true,
    defaultSelection: ['alcohol-fuel', 'hfcs', 'starch'],
    showCommoditySelector: false,
    showAttributeSelector: true,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attributes',
  },
  'corn-sorghum-prices': {
    options: CORN_SORGHUM_PRICE_ATTRIBUTE_OPTIONS,
    multi: false,
    defaultSelection: ['monthly'],
    showCommoditySelector: true,
    showAttributeSelector: true,
    controlLabel: 'Frequency',
    emptyLabel: 'Select frequency',
  },
  [CORN_CASH_PRICES_FEED_ID]: {
    options: CORN_CASH_PRICES_GEOGRAPHY_OPTIONS,
    multi: true,
    defaultSelection: CORN_CASH_PRICES_GEOGRAPHY_OPTIONS[0]
      ? [CORN_CASH_PRICES_GEOGRAPHY_OPTIONS[0].id]
      : [],
    showCommoditySelector: true,
    showAttributeSelector: true,
    controlLabel: 'Geography',
    emptyLabel: 'Select geographies',
  },
  'byproduct-feeds-prices': {
    options: BYPRODUCT_FEED_LOCATION_OPTIONS,
    multi: false,
    defaultSelection: BYPRODUCT_FEED_LOCATION_OPTIONS[0]
      ? [BYPRODUCT_FEED_LOCATION_OPTIONS[0].id]
      : [],
    showCommoditySelector: true,
    showAttributeSelector: true,
    controlLabel: 'Location',
    emptyLabel: 'Select location',
  },
  'processed-corn-products': {
    options: PROCESSED_CORN_LOCATION_OPTIONS,
    multi: false,
    defaultSelection: PROCESSED_CORN_LOCATION_OPTIONS[0]
      ? [PROCESSED_CORN_LOCATION_OPTIONS[0].id]
      : [],
    showCommoditySelector: true,
    showAttributeSelector: true,
    controlLabel: 'Location',
    emptyLabel: 'Select location',
  },
  'processed-feeds-quantities': {
    options: PROCESSED_FEED_ATTRIBUTE_OPTIONS,
    multi: false,
    defaultSelection: PROCESSED_FEED_ATTRIBUTE_OPTIONS[0]
      ? [PROCESSED_FEED_ATTRIBUTE_OPTIONS[0].id]
      : [],
    showCommoditySelector: true,
    showAttributeSelector: true,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attribute',
  },
  'corn-sorghum-exports': {
    options: CORN_SORGHUM_EXPORT_ATTRIBUTE_OPTIONS,
    multi: false,
    defaultSelection: CORN_SORGHUM_EXPORT_ATTRIBUTE_OPTIONS[0]
      ? [CORN_SORGHUM_EXPORT_ATTRIBUTE_OPTIONS[0].id]
      : [],
    showCommoditySelector: true,
    showAttributeSelector: false,
    controlLabel: 'Attribute',
    emptyLabel: 'Select attribute',
  },
}

export const ATTRIBUTE_DEFAULT = ATTRIBUTE_CONFIGS.default.defaultSelection[0] ?? ''

export function resolveAttributeConfig(feedId: string): AttributeConfig {
  return ATTRIBUTE_CONFIGS[feedId] ?? ATTRIBUTE_CONFIGS.default
}

function resolveAttributeOption(feedId: string, id: string | undefined): AttributeOption | null {
  if (!id) return null
  const config = resolveAttributeConfig(feedId)
  return config.options.find((opt) => opt.id === id) ?? null
}

export function attributeLabelFromId(id: string, feedId = 'default'): string {
  const option = resolveAttributeOption(feedId, id)
  return option ? option.label : 'Select attribute'
}

export function attributeApiValueFromId(id: string, feedId = 'default'): string | null {
  const option = resolveAttributeOption(feedId, id)
  return option ? option.apiValue : null
}

export function attributeFrequencyFromId(
  id: string,
  feedId = 'default',
): string | null {
  const option = resolveAttributeOption(feedId, id)
  return option?.frequency ?? null
}

export function attributeTimeperiodFromId(
  id: string,
  feedId = 'default',
): string | null {
  const option = resolveAttributeOption(feedId, id)
  return option?.timeperiod ?? null
}

export function attributeGeographyFromId(
  id: string,
  feedId = 'default',
): string | null {
  const option = resolveAttributeOption(feedId, id)
  return option?.geography ?? null
}

export function feedAttributeColorFromId(feedId: string, id: string): string {
  const map = FEED_ATTRIBUTE_COLOR_MAPS[feedId]
  return map?.[id] ?? '#6b7280'
}

export function feedAttributeColorFromApiValue(feedId: string, value: string): string {
  const normalized = value.trim().toLowerCase()
  const map = FEED_ATTRIBUTE_COLOR_BY_API_MAP[feedId]
  return map?.get(normalized) ?? '#6b7280'
}

export function foreignCoarseGrainColorFromId(id: string): string {
  return feedAttributeColorFromId('foreign-coarse-grains', id)
}

export function foreignCoarseGrainColorFromApiValue(value: string): string {
  return feedAttributeColorFromApiValue('foreign-coarse-grains', value)
}
