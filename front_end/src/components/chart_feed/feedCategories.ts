export type FeedOption = {
  id: string
  label: string
  tableName: string
}

export type FeedCategory = {
  id: string
  title: string
  options: FeedOption[]
}

export const CORN_ACREAGE_PRODUCTION_TABLE_NAME =
  'Table 1--Corn, sorghum, barley, and oats: Planted acreage, harvested acreage, production, yield, and price received by farmers'

export const CORN_SORGHUM_PRICES_FEED_ID = 'corn-sorghum-prices'
export const CORN_CASH_PRICES_FEED_ID = 'corn-cash-prices'
export const CORN_SORGHUM_PRICES_TABLE_NAME =
  'Table 9--Corn and sorghum: Prices received by farmers, United States'

export const HAY_PRICES_TABLE_NAME =
  'Table 11--Hay: Prices received by farmers, United States, dollars per ton'

export const FEED_PRICE_RATIOS_TABLE_NAME =
  'Table 15--Feed-price ratios for livestock, poultry, and milk'

export const FEED_CATEGORIES: FeedCategory[] = [
  {
    id: 'corn-grains',
    title: '🌽 Corn & Feed Grains',
    options: [
      {
        id: 'corn-acreage-production',
        label: 'Corn, sorghum, barley & oats: Acreage, production, yield, prices',
        tableName: CORN_ACREAGE_PRODUCTION_TABLE_NAME,
      },
      {
        id: 'foreign-coarse-grains',
        label: 'Foreign coarse grains: Supply & disappearance',
        tableName: 'Table 2--Foreign coarse grains: Supply and disappearance',
      },
      {
        id: 'feed-grains-supply',
        label: 'Feed grains: Supply & disappearance (million metric tons)',
        tableName:
          'Table 3--Feed grains (corn, sorghum, barley, and oats): Supply and disappearance, million metric tons',
      },
      {
        id: 'corn-supply-disappearance',
        label: 'Corn: Supply & disappearance (million bushels)',
        tableName: 'Table 4--Corn: Supply and disappearance, million bushels',
      },
      {
        id: CORN_SORGHUM_PRICES_FEED_ID,
        label: 'Corn & sorghum: Prices received by farmers (U.S.)',
        tableName: CORN_SORGHUM_PRICES_TABLE_NAME,
      },
      {
        id: CORN_CASH_PRICES_FEED_ID,
        label: 'Corn: Cash prices at principal markets ($/bu)',
        tableName: 'Table 12--Corn: Cash prices at principal markets, dollars per bushel',
      },
      {
        id: 'corn-food-industrial',
        label: 'Corn: Food, seed & industrial use (million bushels)',
        tableName: 'Table 31--Corn: Food, seed, and industrial use, million bushels',
      },
    ],
  },
  {
    id: 'hay',
    title: '🌾 Hay',
    options: [
      {
        id: 'hay-production',
        label: 'Hay: Production, acreage, yield & stocks',
        tableName: 'Table 8--Hay: Production, harvested acreage, yield, and stocks',
      },
      {
        id: 'hay-prices',
        label: 'Hay: Prices received by farmers ($/ton)',
        tableName: HAY_PRICES_TABLE_NAME,
      },
    ],
  },
  {
    id: 'ratios-indexes',
    title: '📊 Ratios & Indexes',
    options: [
      {
        id: 'feed-price-ratios',
        label: 'Feed-price ratios (livestock, poultry, milk)',
        tableName: FEED_PRICE_RATIOS_TABLE_NAME,
      },
    ],
  },
  {
    id: 'byproducts',
    title: '🏭 Byproducts & Processed Feeds',
    options: [
      {
        id: 'byproduct-feeds-prices',
        label: 'Byproduct feeds: Wholesale price ($/ton)',
        tableName:
          'Table 16--Byproduct feeds: Wholesale price, bulk, specified markets, dollars per ton',
      },
      {
        id: 'processed-corn-products',
        label: 'Processed corn products: Market prices',
        tableName: 'Table 17--Processed corn products: Quoted market prices',
      },
      {
        id: 'processed-feeds-quantities',
        label: 'Processed feeds: Quantities fed (1,000 metric tons)',
        tableName:
          'Table 29--Processed feeds: Quantities fed and feed per grain-consuming animal unit, 1,000 metric tons',
      },
    ],
  },
  {
    id: 'trade-transport',
    title: '🌍 Trade & Transport',
    options: [
      {
        id: 'corn-sorghum-exports',
        label: 'Corn & sorghum exports (U.S.)',
        tableName: 'Table 18--U.S. corn and sorghum exports',
      },
      {
        id: 'rail-rates-grain',
        label: 'Rail rates & grain shipments',
        tableName: 'Table 28--Rail rates and grain shipments',
      },
    ],
  },
]

export const FEED_REPORT_DEFAULT = FEED_CATEGORIES[0]?.options[0]?.id ?? ''

export function feedLabelFromId(id: string): string {
  for (const category of FEED_CATEGORIES) {
    const match = category.options.find((opt) => opt.id === id)
    if (match) return match.label
  }
  return 'Select report'
}

export function feedTableNameFromId(id: string): string | null {
  for (const category of FEED_CATEGORIES) {
    const match = category.options.find((opt) => opt.id === id)
    if (match) return match.tableName
  }
  return null
}
