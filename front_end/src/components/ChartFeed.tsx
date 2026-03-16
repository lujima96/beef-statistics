import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Sidebar from './Sidebar'
import PdfViewer from './PdfViewer'
import { usePersistedBoolean } from './chart_subprimals/usePersistedBoolean'
import { useIsDesktop, useResponsiveSidebarOpen } from '../hooks/useResponsiveSidebarOpen'
import type { Range } from './chart_range/ChartRangeTypes'
import ChartFeedControls, {
  ALL_COMMODITY_IDS,
  ATTRIBUTE_DEFAULT,
  attributeApiValueFromId,
  attributeLabelFromId,
  CORN_ACREAGE_PRODUCTION_TABLE_NAME,
  CORN_SORGHUM_PRICES_ATTRIBUTE,
  CORN_SORGHUM_PRICES_FEED_ID,
  CORN_SORGHUM_PRICES_TABLE_NAME,
  FEED_PRICE_RATIOS_ATTRIBUTE,
  FEED_PRICE_RATIOS_TABLE_NAME,
  CORN_CASH_PRICES_FEED_ID,
  commodityApiValueFromId,
  commodityColorFromId,
  commodityIdFromApiValue,
  commodityLabelFromId,
  attributeFrequencyFromId,
  attributeGeographyFromId,
  attributeTimeperiodFromId,
  feedAttributeColorFromApiValue,
  feedAttributeColorFromId,
  FEED_REPORT_DEFAULT,
  feedTableNameFromId,
  resolveAttributeConfig,
  cornCashGeographyColorFromApiValue,
  cornCashGeographyColorFromId,
  CORN_CASH_WHITE_CORN_COMMODITY_ID,
  CORN_CASH_YELLOW_CORN_COMMODITY_ID,
  resolveCornCashGeographyOptions,
} from './chart_feed/ChartFeedControls'
import type { FeedApiPoint, FeedSeriesMap } from './chart_feed/useFeedTimeseries'
import useFeedTimeseries from './chart_feed/useFeedTimeseries'
import useFeedAttributeSeries from './chart_feed/useFeedAttributeSeries'
import useFeedCostsTimeseries from './chart_feed/useFeedCostsTimeseries'
import useHaySummary, {
  HayOverviewResponse,
  HAY_SUMMARY_DEFAULT_START_YEAR,
} from './chart_feed/useHaySummary'

const DEFAULT_RANGE: Range = '1W'
const CORN_CLUSTER_START_YEAR = 2018
const CORN_CLUSTER_END_YEAR = 2025
const CORN_CLUSTER_START_DATE = `${CORN_CLUSTER_START_YEAR}-01-01`
const CORN_CLUSTER_END_DATE = `${CORN_CLUSTER_END_YEAR}-12-31`
const CORN_CLUSTER_ATTRIBUTE_IDS = new Set([
  'area-planted',
  'area-harvested',
  'production',
  'yield',
  'price-received',
])
const FEED_PRICE_RATIOS_DEFAULT_START_DATE = '2018-01-01'
const CORN_CLUSTER_FIXED_UNITS = new Map<string, string>([
  ['area-planted', 'Million acres'],
  ['area-harvested', 'Million acres'],
])
const CORN_CLUSTER_ATTRIBUTE_SCALING = new Map<string, number>([
  ['area-planted', 0.82],
  ['area-harvested', 0.82],
  ['production', 0.82],
])

const BYPRODUCT_DEFAULT_COMMODITY_COUNT = 4
const BYPRODUCT_TIMELINE_START = '2018-01-01'
const BYPRODUCT_TIMELINE_END = '2025-12-31'
const PROCESSED_FEED_MAX_COMMODITY_COUNT = 4
const PROCESSED_FEED_TIMELINE_START = '2018-01-01'
const PROCESSED_FEED_ATTRIBUTE_RESIDUAL = 'processed-feed-feed-residual'
const PROCESSED_FEED_ATTRIBUTE_GCAU = 'processed-feed-feed-gcau'
const CORN_SORGHUM_EXPORTS_TIMELINE_START = '2018-01-01'
const PROCESSED_FEED_RESIDUAL_COMMODITY_IDS = [
  'fishmeal-solubles',
  'meal-bone-tankage',
  'milk-products',
  'total-animal-protein-feeds',
  'barley',
  'corn',
  'oats',
  'sorghum',
  'total-energy-feeds',
  'wheat',
  'corn-gluten-feed-meal',
  'total-grain-protein-feeds',
  'cottonseed-meal',
  'linseed-meal',
  'peanut-meal',
  'rapeseed-canola-meal',
  'soybean-meal',
  'sunflower-meal',
  'total-oilseed-meals',
  'fats-oils',
  'misc-byproduct-feeds',
  'rice-millfeeds',
  'total-other-byproduct-feeds',
  'wheat-millfeeds',
]
const PROCESSED_FEED_GCAU_COMMODITY_IDS = ['all-feeds', 'energy-feeds']
const PROCESSED_FEED_COMMODITY_IDS = [
  ...PROCESSED_FEED_RESIDUAL_COMMODITY_IDS,
  ...PROCESSED_FEED_GCAU_COMMODITY_IDS,
]
const PROCESSED_FEED_ATTRIBUTE_TO_COMMODITIES: Record<string, string[]> = {
  [PROCESSED_FEED_ATTRIBUTE_RESIDUAL]: PROCESSED_FEED_RESIDUAL_COMMODITY_IDS,
  [PROCESSED_FEED_ATTRIBUTE_GCAU]: PROCESSED_FEED_GCAU_COMMODITY_IDS,
}
const PROCESSED_FEED_ATTRIBUTES_BY_COMMODITY: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {}
  PROCESSED_FEED_RESIDUAL_COMMODITY_IDS.forEach((id) => {
    map[id] = [PROCESSED_FEED_ATTRIBUTE_RESIDUAL]
  })
  PROCESSED_FEED_GCAU_COMMODITY_IDS.forEach((id) => {
    map[id] = [PROCESSED_FEED_ATTRIBUTE_GCAU]
  })
  return map
})()
const CORN_SORGHUM_EXPORT_COMMODITY_IDS = [
  'corn-export',
  'sorghum-export',
  'corn-corn-products-equivalent',
]
const PROCESSED_CORN_DEFAULT_COMMODITY_COUNT = 3
const PROCESSED_CORN_TIMELINE_START = '2018-01-01'
const BYPRODUCT_COMMODITIES_BY_GEOGRAPHY: Record<string, string[]> = {
  'Kansas City, MO': ['alfalfa-meal-17', 'wheat-bran', 'wheat-middlings'],
  'Midwest': ['corn-gluten-feed-21', 'corn-gluten-meal-60'],
  'Memphis, TN': ['cottonseed-meal-41-solvent'],
  'Central Illinois, IL': ['distillers-dried-grains', 'soybean-meal-high'],
  'Arkansas Points, AR': ['feather-meal-high-protein'],
  'Illinois Points, IL': ['hominy-feed'],
  'Central United States': ['meat-bone-meal'],
  'Arkansas': ['rice-bran'],
}

const PROCESSED_CORN_COMMODITIES_BY_GEOGRAPHY: Record<string, string[]> = {
  Midwest: ['corn-starch', 'corn-syrup', 'dextrose', 'hfcs-42'],
  'Chicago, IL': ['corn-meal-yellow'],
  'New York, NY': ['corn-meal-yellow'],
}

const FEED_COMMODITY_OVERRIDES: Record<string, string[]> = {
  [CORN_SORGHUM_PRICES_FEED_ID]: ['corn', 'sorghum'],
  [CORN_CASH_PRICES_FEED_ID]: [
    CORN_CASH_YELLOW_CORN_COMMODITY_ID,
    CORN_CASH_WHITE_CORN_COMMODITY_ID,
  ],
  'hay-production': ['hay-alfalfa', 'hay-other', 'hay-all'],
  'hay-prices': ['hay-alfalfa', 'hay-other', 'hay-all'],
  'byproduct-feeds-prices': [
    'alfalfa-meal-17',
    'corn-gluten-feed-21',
    'corn-gluten-meal-60',
    'cottonseed-meal-41-solvent',
    'distillers-dried-grains',
    'feather-meal-high-protein',
    'hominy-feed',
    'meat-bone-meal',
    'rice-bran',
    'soybean-meal-high',
    'wheat-bran',
    'wheat-middlings',
  ],
  'processed-corn-products': [
    'corn-starch',
    'corn-meal-yellow',
    'corn-syrup',
    'dextrose',
    'hfcs-42',
  ],
  'processed-feeds-quantities': [...PROCESSED_FEED_COMMODITY_IDS],
  'corn-sorghum-exports': [...CORN_SORGHUM_EXPORT_COMMODITY_IDS],
}

const FOREIGN_COARSE_GRAINS_DEFAULT_GEOGRAPHY = 'Foreign'
const FOREIGN_COARSE_GRAINS_DEFAULT_FREQUENCY = 'Annual'
const FOREIGN_COARSE_GRAINS_DEFAULT_COMMODITY = 'Coarse grains'
const FEED_GRAINS_SUPPLY_DEFAULT_GEOGRAPHY = 'United States'
const FEED_GRAINS_SUPPLY_DEFAULT_FREQUENCY = 'Annual'
const FEED_GRAINS_SUPPLY_DEFAULT_COMMODITY = 'Feedgrains'

type MultiAttributeDefaults = {
  geography: string | null
  frequency: string | null
  commodities: string[] | null
  attribute?: string | null
  startDate?: string | null
  endDate?: string | null
  mode?: 'attribute' | 'commodity'
}

const MULTI_ATTRIBUTE_FEED_DEFAULTS: Record<string, MultiAttributeDefaults> = {
  'foreign-coarse-grains': {
    geography: FOREIGN_COARSE_GRAINS_DEFAULT_GEOGRAPHY,
    frequency: FOREIGN_COARSE_GRAINS_DEFAULT_FREQUENCY,
    commodities: [FOREIGN_COARSE_GRAINS_DEFAULT_COMMODITY],
  },
  'feed-grains-supply': {
    geography: FEED_GRAINS_SUPPLY_DEFAULT_GEOGRAPHY,
    frequency: FEED_GRAINS_SUPPLY_DEFAULT_FREQUENCY,
    commodities: [FEED_GRAINS_SUPPLY_DEFAULT_COMMODITY],
  },
  'corn-supply-disappearance': {
    geography: 'United States',
    frequency: 'Annual',
    commodities: ['Corn'],
  },
  'corn-food-industrial': {
    geography: 'United States',
    frequency: 'Quarterly',
    commodities: ['Corn'],
  },
  'feed-price-ratios': {
    geography: 'United States',
    frequency: 'Monthly',
    commodities: null,
    attribute: FEED_PRICE_RATIOS_ATTRIBUTE,
    startDate: FEED_PRICE_RATIOS_DEFAULT_START_DATE,
    mode: 'commodity',
  },
}

type FeedClusterDatum = {
  year: number
  bars: Array<{ commodityId: string; value: number | null; unit: string | null }>
}

type MultiAttributeMeta = {
  id: string
  apiValue: string
  label: string
  color: string
  dash?: string
}

type MultiAttributeLinePoint = {
  date: Date
  isoDate: string
  value: number
  unit: string | null
  year: number | null
  label: string
  granularity: 'date' | 'year'
}

type PositionedMultiAttributePoint = {
  x: number
  y: number
  attribute: MultiAttributeMeta
  point: MultiAttributeLinePoint
}

type MultiAttributeChartProps = {
  attributes: MultiAttributeMeta[]
  series: FeedSeriesMap | null
  resolvedAttributes: string[]
  loading: boolean
  error: string | null
  getColorFromApiValue: (value: string) => string
  stacked?: boolean
  variant?: 'standalone' | 'embedded'
  ariaLabel?: string
}

type FeedClusterChartProps = {
  clusters: FeedClusterDatum[]
  commodityOrder: string[]
  loading: boolean
  error: string | null
  getColor: (id: string) => string
  getLabel: (id: string) => string
  unitLabel: string | null
  attributeLabel: string
  attributeId: string
  variant?: 'standalone' | 'embedded'
  ariaLabel?: string
  stacked?: boolean
}

export default function ChartFeed() {
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebarOpen()
  const [pdfOpen, setPdfOpen] = usePersistedBoolean('pdf_open', false)
  const isDesktop = useIsDesktop()
  const [feedReportId, setFeedReportId] = useState<string>(FEED_REPORT_DEFAULT)
  const [attributeIds, setAttributeIds] = useState<string[]>(
    ATTRIBUTE_DEFAULT ? [ATTRIBUTE_DEFAULT] : [],
  )
  const [commodityIds, setCommodityIds] = useState<string[]>(ALL_COMMODITY_IDS)

  const tableName = feedTableNameFromId(feedReportId)
  const attributeConfig = useMemo(() => resolveAttributeConfig(feedReportId), [feedReportId])

  const allowedCommodityIds = useMemo(() => {
    const override = FEED_COMMODITY_OVERRIDES[feedReportId]
    return override ? [...override] : [...ALL_COMMODITY_IDS]
  }, [feedReportId])

  const showHayOverview = feedReportId === 'hay-production'
  const isHayPricesFeed = feedReportId === 'hay-prices'
  const isByproductFeed = feedReportId === 'byproduct-feeds-prices'
  const isProcessedCornFeed = feedReportId === 'processed-corn-products'
  const isProcessedFeedsFeed = feedReportId === 'processed-feeds-quantities'
  const isCornSorghumExportsFeed = feedReportId === 'corn-sorghum-exports'

  const isCornCashPricesFeed = feedReportId === CORN_CASH_PRICES_FEED_ID
  const resolvedAttributeOptions = useMemo(() => {
    if (isCornCashPricesFeed) {
      return resolveCornCashGeographyOptions(commodityIds)
    }
    if (isProcessedFeedsFeed) {
      const allowedIds = new Set<string>()
      if (commodityIds.length === 0) {
        attributeConfig.options.forEach((option) => allowedIds.add(option.id))
      } else {
        commodityIds.forEach((id) => {
          const attrs = PROCESSED_FEED_ATTRIBUTES_BY_COMMODITY[id]
          if (attrs) attrs.forEach((attrId) => allowedIds.add(attrId))
        })
        if (allowedIds.size === 0) {
          attributeConfig.options.forEach((option) => allowedIds.add(option.id))
        }
      }
      const filtered = attributeConfig.options.filter((option) => allowedIds.has(option.id))
      return filtered.length > 0 ? filtered : attributeConfig.options
    }
    return attributeConfig.options
  }, [attributeConfig.options, commodityIds, isCornCashPricesFeed, isProcessedFeedsFeed])

  const resolvedAttributeDefaultSelection = useMemo(() => {
    if (!isCornCashPricesFeed) return attributeConfig.defaultSelection
    const defaults = attributeConfig.defaultSelection.filter((id) =>
      resolvedAttributeOptions.some((option) => option.id === id),
    )
    if (defaults.length > 0) return defaults
    const fallback = resolvedAttributeOptions[0]?.id
    return fallback ? [fallback] : []
  }, [attributeConfig.defaultSelection, isCornCashPricesFeed, resolvedAttributeOptions])

  useEffect(() => {
    setAttributeIds((prev) => {
      const optionIds = new Set(resolvedAttributeOptions.map((opt) => opt.id))
      const prevSet = new Set(prev.filter((id) => optionIds.has(id)))
      const ordered = resolvedAttributeOptions
        .map((opt) => (prevSet.has(opt.id) ? opt.id : null))
        .filter((id): id is string => Boolean(id))

      let next: string[]
      if (attributeConfig.multi) {
        next = ordered.length > 0 ? ordered : [...resolvedAttributeDefaultSelection]
      } else {
        const first = ordered[0] ?? resolvedAttributeDefaultSelection[0]
        next = first ? [first] : []
      }

      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev
      }
      return next
    })
  }, [attributeConfig.multi, resolvedAttributeDefaultSelection, resolvedAttributeOptions])

  const primaryAttributeId = attributeIds[0] ?? ''
  const isCornSorghumPricesFeed = feedReportId === CORN_SORGHUM_PRICES_FEED_ID
  const attributeValue = isHayPricesFeed
    ? CORN_SORGHUM_PRICES_ATTRIBUTE
    :
        attributeApiValueFromId(primaryAttributeId, feedReportId) ??
        (isCornSorghumPricesFeed ? CORN_SORGHUM_PRICES_ATTRIBUTE : null)
  const attributeFrequency = attributeFrequencyFromId(primaryAttributeId, feedReportId)
  const attributeTimeperiod = attributeTimeperiodFromId(primaryAttributeId, feedReportId)
  const attributeLabel = attributeLabelFromId(primaryAttributeId, feedReportId)
  const attributeGeography = attributeGeographyFromId(primaryAttributeId, feedReportId)

  const byproductAvailableCommodityIds = useMemo(() => {
    if (!isByproductFeed) return null
    if (!attributeGeography) return []
    const allowed = BYPRODUCT_COMMODITIES_BY_GEOGRAPHY[attributeGeography]
    return allowed ? [...allowed] : []
  }, [isByproductFeed, attributeGeography])

  const processedFeedAvailableCommodityIds = useMemo(() => {
    if (!isProcessedFeedsFeed) return null
    const attrId = primaryAttributeId || attributeConfig.defaultSelection[0]
    const allowed = attrId ? PROCESSED_FEED_ATTRIBUTE_TO_COMMODITIES[attrId] : null
    return allowed ? [...allowed] : []
  }, [attributeConfig.defaultSelection, isProcessedFeedsFeed, primaryAttributeId])

  const processedCornAvailableCommodityIds = useMemo(() => {
    if (!isProcessedCornFeed) return null
    if (!attributeGeography) return []
    const allowed = PROCESSED_CORN_COMMODITIES_BY_GEOGRAPHY[attributeGeography]
    return allowed ? [...allowed] : []
  }, [isProcessedCornFeed, attributeGeography])

  const multiAttributeDefaults = MULTI_ATTRIBUTE_FEED_DEFAULTS[feedReportId] ?? null
  const multiAttributeMode: 'attribute' | 'commodity' =
    multiAttributeDefaults?.mode ?? 'attribute'
  const multiAttributeStartDate = multiAttributeDefaults?.startDate ?? undefined
  const multiAttributeEndDate = multiAttributeDefaults?.endDate ?? undefined
  const multiAttributeAttributeFilter = multiAttributeDefaults?.attribute ?? null
  const isMultiAttribute = Boolean(multiAttributeDefaults)

  const selectedAttributeValues = useMemo(() => {
    return attributeIds
      .map((id) => attributeApiValueFromId(id, feedReportId))
      .filter((value): value is string => Boolean(value))
  }, [attributeIds, feedReportId])

  const multiAttributeMeta = useMemo(() => {
    if (!isMultiAttribute) return [] as MultiAttributeMeta[]
    return attributeIds
      .map((id): MultiAttributeMeta | null => {
        const apiValue = attributeApiValueFromId(id, feedReportId)
        if (!apiValue) return null
        return {
          id,
          apiValue,
          label: attributeLabelFromId(id, feedReportId),
          color: feedAttributeColorFromId(feedReportId, id),
        }
      })
      .filter((value): value is MultiAttributeMeta => Boolean(value))
  }, [attributeIds, feedReportId, isMultiAttribute])

  const multiAttributeColorFromApiValue = useCallback(
    (value: string) => feedAttributeColorFromApiValue(feedReportId, value),
    [feedReportId],
  )

  const commodityApiValues = useMemo(() => {
    if (!commodityIds.length) return []
    return commodityIds
      .map((id) => commodityApiValueFromId(id))
      .filter((value): value is string => Boolean(value))
  }, [commodityIds])

  const cornCashCommodityValue = useMemo(() => {
    if (!isCornCashPricesFeed) return null
    const first = commodityIds[0]
    if (!first) return null
    return commodityApiValueFromId(first)
  }, [commodityIds, isCornCashPricesFeed])

  const isCornAcreageProductionTable = tableName === CORN_ACREAGE_PRODUCTION_TABLE_NAME
  const showCornCluster =
    isCornAcreageProductionTable && CORN_CLUSTER_ATTRIBUTE_IDS.has(primaryAttributeId)
  const showProcessedFeedCluster = isProcessedFeedsFeed
  const shouldShowCluster = showCornCluster || showProcessedFeedCluster

  const clusterGeography = showCornCluster ? 'United States' : undefined
  const clusterFrequency = showCornCluster ? 'Annual' : attributeFrequency ?? undefined
  const clusterStartDate = showCornCluster
    ? CORN_CLUSTER_START_DATE
    : showProcessedFeedCluster
    ? PROCESSED_FEED_TIMELINE_START
    : undefined
  const clusterEndDate = showCornCluster ? CORN_CLUSTER_END_DATE : undefined

  const {
    data: clusterSeries,
    loading: clusterLoading,
    error: clusterError,
  } = useFeedTimeseries({
    tableName: tableName,
    attribute: attributeValue,
    geography: clusterGeography,
    frequency: clusterFrequency ?? undefined,
    timeperiod: attributeTimeperiod ?? null,
    commodities: commodityApiValues,
    startDate: clusterStartDate,
    endDate: clusterEndDate,
    enabled:
      shouldShowCluster && Boolean(tableName) && Boolean(attributeValue) && commodityApiValues.length > 0,
    limit: 10000,
  })

  const { clusters, unitLabel } = useMemo(() => {
    if (!clusterSeries || !commodityIds.length) {
      return { clusters: [] as FeedClusterDatum[], unitLabel: null as string | null }
    }

    const seriesById: Record<string, FeedApiPoint[]> = {}
    for (const [commodityName, points] of Object.entries(clusterSeries)) {
      const commodityId = commodityIdFromApiValue(commodityName)
      if (commodityId) {
        seriesById[commodityId] = points
      }
    }

    const yearSet = new Set<number>()
    Object.values(seriesById).forEach((points) => {
      points.forEach((point) => {
        const pointYear =
          typeof point.year === 'number' ? point.year : new Date(point.date).getFullYear()
        if (!Number.isNaN(pointYear)) {
          yearSet.add(pointYear)
        }
      })
    })

    const years = Array.from(yearSet).sort((a, b) => a - b)
    if (years.length === 0) {
      return { clusters: [] as FeedClusterDatum[], unitLabel: null as string | null }
    }

    const clusters: FeedClusterDatum[] = years.map((year) => ({
      year,
      bars: commodityIds.map((id) => {
        const series = seriesById[id] ?? []
        const match = series.find((point) => {
          const pointYear =
            typeof point.year === 'number' ? point.year : new Date(point.date).getFullYear()
          if (Number.isNaN(pointYear)) return false
          return pointYear === year
        })
        return {
          commodityId: id,
          value: match?.amount ?? null,
          unit: match?.unit ?? null,
        }
      }),
    }))

    const unitCandidate = (() => {
      for (const points of Object.values(seriesById)) {
        const match = points.find((point) => point.unit)
        if (match?.unit) return match.unit
      }
      return null
    })()

    const resolvedUnit =
      (showCornCluster ? CORN_CLUSTER_FIXED_UNITS.get(primaryAttributeId) : undefined) ??
      unitCandidate

    return { clusters, unitLabel: resolvedUnit }
  }, [
    clusterSeries,
    commodityIds,
    primaryAttributeId,
    showCornCluster,
  ])

  const {
    data: commodityTimeseries,
    loading: commodityTimeseriesLoading,
    error: commodityTimeseriesError,
  } = useFeedTimeseries({
    tableName: tableName,
    attribute: attributeValue ?? null,
    geography: 'United States',
    frequency: attributeFrequency ?? null,
    timeperiod: attributeTimeperiod ?? null,
    commodities: commodityApiValues,
    enabled:
      isCornSorghumPricesFeed &&
      Boolean(tableName) &&
      Boolean(attributeValue) &&
      commodityApiValues.length > 0,
    limit: 10000,
  })

  const {
    data: byproductSeries,
    loading: byproductLoading,
    error: byproductError,
  } = useFeedTimeseries({
    tableName,
    attribute: attributeValue,
    geography: attributeGeography ?? undefined,
    frequency: attributeFrequency ?? undefined,
    timeperiod: attributeTimeperiod ?? undefined,
    commodities: commodityApiValues,
    startDate: BYPRODUCT_TIMELINE_START,
    endDate: BYPRODUCT_TIMELINE_END,
    enabled:
      isByproductFeed &&
      Boolean(tableName) &&
      Boolean(attributeValue) &&
      Boolean(attributeGeography) &&
      commodityApiValues.length > 0,
    limit: 10000,
  })

  const {
    data: processedCornSeries,
    loading: processedCornLoading,
    error: processedCornError,
  } = useFeedTimeseries({
    tableName,
    attribute: attributeValue,
    geography: attributeGeography ?? undefined,
    frequency: attributeFrequency ?? undefined,
    timeperiod: attributeTimeperiod ?? undefined,
    commodities: commodityApiValues,
    startDate: PROCESSED_CORN_TIMELINE_START,
    enabled:
      isProcessedCornFeed &&
      Boolean(tableName) &&
      Boolean(attributeValue) &&
      Boolean(attributeGeography) &&
      commodityApiValues.length > 0,
    limit: 10000,
  })

  const {
    data: cornSorghumExportsSeries,
    loading: cornSorghumExportsLoading,
    error: cornSorghumExportsError,
  } = useFeedTimeseries({
    tableName,
    attribute: attributeValue,
    geography: 'United States',
    frequency: attributeFrequency ?? undefined,
    timeperiod: attributeTimeperiod ?? undefined,
    commodities: commodityApiValues,
    startDate: CORN_SORGHUM_EXPORTS_TIMELINE_START,
    enabled:
      isCornSorghumExportsFeed &&
      Boolean(tableName) &&
      Boolean(attributeValue) &&
      commodityApiValues.length > 0,
    limit: 10000,
  })

  const commodityTimeseriesAttributes = useMemo(() => {
    if (!isCornSorghumPricesFeed) return [] as MultiAttributeMeta[]
    return commodityIds
      .map((id): MultiAttributeMeta | null => {
        const apiValue = commodityApiValueFromId(id)
        if (!apiValue) return null
        return {
          id,
          apiValue,
          label: commodityLabelFromId(id),
          color: commodityColorFromId(id),
        }
      })
      .filter((value): value is MultiAttributeMeta => Boolean(value))
  }, [commodityIds, isCornSorghumPricesFeed])

  const commodityTimeseriesResolved = useMemo(() => {
    if (!isCornSorghumPricesFeed) return [] as string[]
    return commodityApiValues
  }, [isCornSorghumPricesFeed, commodityApiValues])

  const byproductCommodityAttributes = useMemo(() => {
    if (!isByproductFeed) return [] as MultiAttributeMeta[]
    return commodityIds
      .map((id): MultiAttributeMeta | null => {
        const apiValue = commodityApiValueFromId(id)
        if (!apiValue) return null
        return {
          id,
          apiValue,
          label: commodityLabelFromId(id),
          color: commodityColorFromId(id),
        }
      })
      .filter((value): value is MultiAttributeMeta => Boolean(value))
  }, [commodityIds, isByproductFeed])

  const byproductResolvedCommodities = useMemo(() => {
    if (!isByproductFeed) return [] as string[]
    if (!byproductSeries) return [] as string[]
    return Object.keys(byproductSeries)
  }, [isByproductFeed, byproductSeries])

  const processedCornCommodityAttributes = useMemo(() => {
    if (!isProcessedCornFeed) return [] as MultiAttributeMeta[]
    return commodityIds
      .map((id): MultiAttributeMeta | null => {
        const apiValue = commodityApiValueFromId(id)
        if (!apiValue) return null
        return {
          id,
          apiValue,
          label: commodityLabelFromId(id),
          color: commodityColorFromId(id),
        }
      })
      .filter((value): value is MultiAttributeMeta => Boolean(value))
  }, [commodityIds, isProcessedCornFeed])

  const processedCornResolvedCommodities = useMemo(() => {
    if (!isProcessedCornFeed) return [] as string[]
    if (!processedCornSeries) return [] as string[]
    return Object.keys(processedCornSeries)
  }, [isProcessedCornFeed, processedCornSeries])

  const commodityColorFromApiValue = useCallback((value: string) => {
    const id = commodityIdFromApiValue(value)
    if (!id) return '#6b7280'
    return commodityColorFromId(id)
  }, [])

  const cornSorghumExportsCommodityAttributes = useMemo(() => {
    if (!isCornSorghumExportsFeed) return [] as MultiAttributeMeta[]
    return commodityIds
      .map((id): MultiAttributeMeta | null => {
        const apiValue = commodityApiValueFromId(id)
        if (!apiValue) return null
        return {
          id,
          apiValue,
          label: commodityLabelFromId(id),
          color: commodityColorFromId(id),
        }
      })
      .filter((value): value is MultiAttributeMeta => Boolean(value))
  }, [commodityIds, isCornSorghumExportsFeed])

  const cornSorghumExportsResolvedCommodities = useMemo(() => {
    if (!isCornSorghumExportsFeed) return [] as string[]
    if (!cornSorghumExportsSeries) return [] as string[]
    return Object.keys(cornSorghumExportsSeries)
  }, [cornSorghumExportsSeries, isCornSorghumExportsFeed])

  const cornCashAttributes = useMemo(() => {
    if (!isCornCashPricesFeed) return [] as MultiAttributeMeta[]
    return attributeIds
      .map((id): MultiAttributeMeta | null => {
        const apiValue = attributeApiValueFromId(id, feedReportId)
        if (!apiValue) return null
        return {
          id,
          apiValue,
          label: attributeLabelFromId(id, feedReportId),
          color: cornCashGeographyColorFromId(id),
        }
      })
      .filter((value): value is MultiAttributeMeta => Boolean(value))
  }, [attributeIds, feedReportId, isCornCashPricesFeed])

  const multiAttributeCommodities = useMemo(() => {
    if (!multiAttributeDefaults?.commodities) return undefined
    const filtered = multiAttributeDefaults.commodities.filter(
      (value): value is string => Boolean(value),
    )
    return filtered.length > 0 ? filtered : undefined
  }, [multiAttributeDefaults])

  const {
    data: multiSeries,
    resolvedAttributes: multiResolvedAttributes,
    loading: multiLoading,
    error: multiError,
  } = useFeedAttributeSeries({
    tableName,
    attributes: selectedAttributeValues,
    geography: multiAttributeDefaults?.geography ?? undefined,
    frequency: multiAttributeDefaults?.frequency ?? undefined,
    commodities: multiAttributeCommodities,
    startDate: multiAttributeStartDate,
    endDate: multiAttributeEndDate,
    limit: 10000,
    enabled:
      isMultiAttribute &&
      multiAttributeMode === 'attribute' &&
      Boolean(tableName) &&
      selectedAttributeValues.length > 0,
  })

  const {
    data: multiCommoditySeries,
    loading: multiCommodityLoading,
    error: multiCommodityError,
  } = useFeedTimeseries({
    tableName,
    attribute: multiAttributeAttributeFilter ?? null,
    geography: multiAttributeDefaults?.geography ?? undefined,
    frequency: multiAttributeDefaults?.frequency ?? undefined,
    timeperiod: undefined,
    commodities:
      multiAttributeMode === 'commodity' ? selectedAttributeValues : undefined,
    startDate: multiAttributeStartDate,
    endDate: multiAttributeEndDate,
    limit: 10000,
    enabled:
      isMultiAttribute &&
      multiAttributeMode === 'commodity' &&
      Boolean(tableName) &&
      Boolean(multiAttributeAttributeFilter) &&
      selectedAttributeValues.length > 0,
  })

  const multiCommodityResolved = useMemo(() => {
    if (multiAttributeMode !== 'commodity') return [] as string[]
    if (!multiCommoditySeries) return [] as string[]
    return Object.keys(multiCommoditySeries)
  }, [multiAttributeMode, multiCommoditySeries])

  const effectiveMultiSeries =
    multiAttributeMode === 'commodity' ? multiCommoditySeries : multiSeries
  const effectiveMultiResolved =
    multiAttributeMode === 'commodity' ? multiCommodityResolved : multiResolvedAttributes
  const effectiveMultiLoading =
    multiAttributeMode === 'commodity' ? multiCommodityLoading : multiLoading
  const effectiveMultiError =
    multiAttributeMode === 'commodity' ? multiCommodityError : multiError

  const {
    data: cornCashSeries,
    resolvedGeographies: cornCashResolvedGeographies,
    loading: cornCashLoading,
    error: cornCashError,
  } = useFeedCostsTimeseries({
    tableName,
    geographies: selectedAttributeValues,
    commodity: cornCashCommodityValue,
    frequency: 'Monthly',
    limit: 5000,
    enabled:
      isCornCashPricesFeed &&
      Boolean(tableName) &&
      selectedAttributeValues.length > 0 &&
      Boolean(cornCashCommodityValue),
  })

  const hayPriceCommodityFilter =
    commodityApiValues.length > 0 ? commodityApiValues : undefined

  const {
    data: hayPriceSeries,
    loading: hayPriceLoading,
    error: hayPriceError,
  } = useFeedTimeseries({
    tableName,
    attribute: attributeValue,
    geography: 'United States',
    frequency: 'Monthly',
    timeperiod: undefined,
    commodities: hayPriceCommodityFilter,
    startDate: undefined,
    endDate: undefined,
    limit: 10000,
    enabled: isHayPricesFeed && Boolean(tableName) && Boolean(attributeValue),
  })

  const {
    data: haySummary,
    loading: hayLoading,
    error: hayError,
  } = useHaySummary({
    enabled: showHayOverview,
  })

  const hayAvailableCommodityIds = useMemo(() => {
    if (!showHayOverview) return null
    return resolveHayAvailableCommodityIds(haySummary, primaryAttributeId)
  }, [showHayOverview, haySummary, primaryAttributeId])

  const cornSorghumAvailableCommodityIds = useMemo(() => {
    if (!isCornSorghumPricesFeed) return null
    return extractCommodityIdsFromSeries(commodityTimeseries)
  }, [isCornSorghumPricesFeed, commodityTimeseries])

  const clusterAvailableCommodityIds = useMemo(() => {
    if (!shouldShowCluster) return null
    return extractCommodityIdsFromSeries(clusterSeries)
  }, [shouldShowCluster, clusterSeries])

  const resolvedCommodityOptionIds = useMemo(() => {
    const candidates = [
      byproductAvailableCommodityIds,
      processedFeedAvailableCommodityIds,
      processedCornAvailableCommodityIds,
      hayAvailableCommodityIds,
      cornSorghumAvailableCommodityIds,
      clusterAvailableCommodityIds,
    ]
    for (const candidate of candidates) {
      if (candidate && candidate.length > 0) {
        const allowedSet = new Set(candidate)
        const ordered = allowedCommodityIds.filter((id) => allowedSet.has(id))
        if (ordered.length > 0) {
          return ordered
        }
      }
    }
    return allowedCommodityIds
  }, [
    allowedCommodityIds,
    byproductAvailableCommodityIds,
    processedFeedAvailableCommodityIds,
    processedCornAvailableCommodityIds,
    hayAvailableCommodityIds,
    cornSorghumAvailableCommodityIds,
    clusterAvailableCommodityIds,
  ])

  const haySelectedCommodityIds = useMemo(() => {
    if (!isHayPricesFeed) return null
    const allowedSet = new Set(resolvedCommodityOptionIds)
    const selected = attributeIds.filter((id) => allowedSet.has(id))
    if (selected.length > 0) return selected
    return [...resolvedCommodityOptionIds]
  }, [isHayPricesFeed, attributeIds, resolvedCommodityOptionIds])

  useEffect(() => {
    if (isHayPricesFeed) {
      const next = haySelectedCommodityIds ?? []
      setCommodityIds((prev) => {
        if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
          return prev
        }
        return next
      })
      return
    }

    setCommodityIds((prev) => {
      const allowedSet = new Set(resolvedCommodityOptionIds)
      const filtered = prev.filter((id) => allowedSet.has(id))

      let next: string[]
      if (isCornCashPricesFeed) {
        const first = filtered[0] ?? resolvedCommodityOptionIds[0] ?? allowedCommodityIds[0]
        next = first ? [first] : []
      } else if (isByproductFeed) {
        next = filtered
      } else if (isProcessedFeedsFeed) {
        next = filtered.slice(0, PROCESSED_FEED_MAX_COMMODITY_COUNT)
      } else if (isProcessedCornFeed) {
        next = filtered
      } else if (filtered.length > 0) {
        next = filtered
      } else if (resolvedCommodityOptionIds.length > 0) {
        next = [...resolvedCommodityOptionIds]
      } else if (allowedCommodityIds.length > 0) {
        next = [...allowedCommodityIds]
      } else {
        next = prev
      }

      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev
      }
      return next
    })
  }, [
    resolvedCommodityOptionIds,
    allowedCommodityIds,
    isCornCashPricesFeed,
    isByproductFeed,
    isProcessedFeedsFeed,
    isProcessedCornFeed,
    isHayPricesFeed,
    attributeIds,
    haySelectedCommodityIds,
  ])

  const hayPriceAttributes = useMemo(() => {
    if (!isHayPricesFeed) return [] as MultiAttributeMeta[]
    const sourceIds =
      haySelectedCommodityIds && haySelectedCommodityIds.length > 0
        ? haySelectedCommodityIds
        : resolvedCommodityOptionIds
    return sourceIds
      .map((id): MultiAttributeMeta | null => {
        const apiValue = commodityApiValueFromId(id)
        if (!apiValue) return null
        return {
          id,
          apiValue,
          label: commodityLabelFromId(id),
          color: commodityColorFromId(id),
        }
      })
      .filter((value): value is MultiAttributeMeta => Boolean(value))
  }, [haySelectedCommodityIds, resolvedCommodityOptionIds, isHayPricesFeed])

  const hayPriceResolvedCommodities = useMemo(() => {
    if (!isHayPricesFeed) return [] as string[]
    if (!hayPriceSeries) return [] as string[]
    return Object.keys(hayPriceSeries)
  }, [isHayPricesFeed, hayPriceSeries])

  const showCornSorghumTimeseries = isCornSorghumPricesFeed
  const showHayPriceTimeseries = isHayPricesFeed
  const showCornCashTimeseries = isCornCashPricesFeed
  const showByproductTimeseries = isByproductFeed
  const showProcessedCornTimeseries = isProcessedCornFeed
  const showCornSorghumExportsTimeseries = isCornSorghumExportsFeed
  const showInstructions =
    !showHayOverview &&
    !shouldShowCluster &&
    !isMultiAttribute &&
    !showCornSorghumTimeseries &&
    !showHayPriceTimeseries &&
    !showCornCashTimeseries &&
    !showByproductTimeseries &&
    !showProcessedCornTimeseries &&
    !showCornSorghumExportsTimeseries
  const requiresCommoditySelection =
    showHayOverview ||
    shouldShowCluster ||
    showCornSorghumTimeseries ||
    showCornCashTimeseries ||
    showByproductTimeseries ||
    showProcessedCornTimeseries ||
    showCornSorghumExportsTimeseries
  const showCommodityPrompt = requiresCommoditySelection && commodityIds.length === 0
  const showCornCashGeographyPrompt =
    showCornCashTimeseries && selectedAttributeValues.length === 0
  const showByproductLocationPrompt = showByproductTimeseries && !attributeGeography
  const showProcessedCornLocationPrompt =
    showProcessedCornTimeseries && !attributeGeography
  const isStackedMultiAttributeFeed = feedReportId === 'corn-food-industrial'

  if (!isDesktop && pdfOpen) {
    return <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
  }

  return (
    <div className={`pdf-layout chart-with-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
      <Sidebar
        mode="graphs"
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onOpenViewer={() => setPdfOpen(true)}
      />
      <main className="pdf-content">
        <section className="chart-card chart-card-feed" aria-label="Feed Chart">
          <div className="chart-controls-panel">
            <ChartFeedControls
              selectedId={feedReportId}
              onSelect={setFeedReportId}
              attributeIds={attributeIds}
              onSelectAttributes={(next) => setAttributeIds(next)}
              commodityIds={commodityIds}
              onToggleCommodity={(id, nextSelected) => {
                setCommodityIds((prev) => {
                  const exists = prev.includes(id)
                  if (isCornCashPricesFeed) {
                    if (nextSelected) return [id]
                    if (exists) return []
                    return prev
                  }
                  if (isProcessedFeedsFeed && nextSelected && !exists) {
                    if (prev.length >= PROCESSED_FEED_MAX_COMMODITY_COUNT) {
                      return prev
                    }
                  }
                  if (nextSelected && !exists) return [...prev, id]
                  if (!nextSelected && exists) return prev.filter((item) => item !== id)
                  return prev
                })
              }}
              commodityOptionIds={resolvedCommodityOptionIds}
            />
          </div>

          {isMultiAttribute ? (
            <MultiAttributeFeedChart
              attributes={multiAttributeMeta}
              series={effectiveMultiSeries}
              resolvedAttributes={effectiveMultiResolved}
              loading={effectiveMultiLoading}
              error={effectiveMultiError}
              getColorFromApiValue={multiAttributeColorFromApiValue}
              stacked={isStackedMultiAttributeFeed}
            />
          ) : showHayOverview ? (
            <HayStackedChart
              summary={haySummary}
              loading={hayLoading}
              error={hayError}
              attributeId={primaryAttributeId}
              commodityIds={commodityIds}
            />
          ) : shouldShowCluster ? (
            showCommodityPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart commodity prompt">
                <div className="chart-empty">Select at least one commodity to display.</div>
              </div>
            ) : (
              <FeedClusterChart
                clusters={clusters}
                commodityOrder={commodityIds}
                loading={clusterLoading}
                error={clusterError}
                getColor={commodityColorFromId}
                getLabel={commodityLabelFromId}
                unitLabel={unitLabel}
                attributeLabel={attributeLabel}
                attributeId={primaryAttributeId}
              />
            )
          ) : showCornSorghumTimeseries ? (
            showCommodityPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart commodity prompt">
                <div className="chart-empty">Select at least one commodity to display.</div>
              </div>
            ) : (
              <MultiAttributeFeedChart
                attributes={commodityTimeseriesAttributes}
                series={commodityTimeseries}
                resolvedAttributes={commodityTimeseriesResolved}
                loading={commodityTimeseriesLoading}
                error={commodityTimeseriesError}
                getColorFromApiValue={commodityColorFromApiValue}
              />
            )
          ) : showHayPriceTimeseries ? (
            <MultiAttributeFeedChart
              attributes={hayPriceAttributes}
              series={hayPriceSeries}
              resolvedAttributes={hayPriceResolvedCommodities}
              loading={hayPriceLoading}
              error={hayPriceError}
              getColorFromApiValue={commodityColorFromApiValue}
              ariaLabel="Hay price history"
            />
          ) : showCornCashTimeseries ? (
            showCommodityPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart commodity prompt">
                <div className="chart-empty">Select at least one commodity to display.</div>
              </div>
            ) : showCornCashGeographyPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart geography prompt">
                <div className="chart-empty">Select at least one geography to display.</div>
              </div>
            ) : (
              <MultiAttributeFeedChart
                attributes={cornCashAttributes}
                series={cornCashSeries}
                resolvedAttributes={cornCashResolvedGeographies}
                loading={cornCashLoading}
                error={cornCashError}
                getColorFromApiValue={cornCashGeographyColorFromApiValue}
              />
            )
          ) : showByproductTimeseries ? (
            showCommodityPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart commodity prompt">
                <div className="chart-empty">Select at least one commodity to display.</div>
              </div>
            ) : showByproductLocationPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart location prompt">
                <div className="chart-empty">Select a location to display.</div>
              </div>
            ) : (
              <MultiAttributeFeedChart
                attributes={byproductCommodityAttributes}
                series={byproductSeries}
                resolvedAttributes={byproductResolvedCommodities}
                loading={byproductLoading}
                error={byproductError}
                getColorFromApiValue={commodityColorFromApiValue}
                ariaLabel="Byproduct feed price history"
              />
            )
          ) : showProcessedCornTimeseries ? (
            showCommodityPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart commodity prompt">
                <div className="chart-empty">Select at least one commodity to display.</div>
              </div>
            ) : showProcessedCornLocationPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart location prompt">
                <div className="chart-empty">Select a location to display.</div>
              </div>
            ) : (
              <MultiAttributeFeedChart
                attributes={processedCornCommodityAttributes}
                series={processedCornSeries}
                resolvedAttributes={processedCornResolvedCommodities}
                loading={processedCornLoading}
                error={processedCornError}
                getColorFromApiValue={commodityColorFromApiValue}
                ariaLabel="Processed corn product prices"
              />
            )
          ) : showCornSorghumExportsTimeseries ? (
            showCommodityPrompt ? (
              <div className="chart-plot feed-plot" role="img" aria-label="Feed chart commodity prompt">
                <div className="chart-empty">Select at least one commodity to display.</div>
              </div>
            ) : (
              <MultiAttributeFeedChart
                attributes={cornSorghumExportsCommodityAttributes}
                series={cornSorghumExportsSeries}
                resolvedAttributes={cornSorghumExportsResolvedCommodities}
                loading={cornSorghumExportsLoading}
                error={cornSorghumExportsError}
                getColorFromApiValue={commodityColorFromApiValue}
                ariaLabel="Corn and sorghum exports"
              />
            )
          ) : showInstructions ? (
            <div className="chart-plot feed-plot" role="img" aria-label="Feed chart instructions">
              <div className="chart-empty">
                Select “Corn, sorghum, barley & oats: Acreage, production, yield, prices” and the “Area planted”,
                “Area harvested”, “Production”, “Yield”, or “Price received” attribute to view clustered bars.
              </div>
            </div>
          ) : (
            <div className="chart-plot feed-plot" role="img" aria-label="Feed chart instructions">
              <div className="chart-empty">
                Select “Corn, sorghum, barley & oats: Acreage, production, yield, prices” and the “Area planted”,
                “Area harvested”, “Production”, “Yield”, or “Price received” attribute to view clustered bars.
              </div>
            </div>
          )}

          <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
        </section>
      </main>
    </div>
  )
}

const HAY_COMMODITY_ORDER = ['hay-alfalfa', 'hay-other', 'hay-all']
const HAY_SUPPLY_KEY = 'Supply per roughage-consuming animal unit (RCAU)'
const HAY_DISAPPEARANCE_KEY = 'Disappearance per roughage-consuming animal unit (RCAU)'
const HAY_CHART_START_YEAR = HAY_SUMMARY_DEFAULT_START_YEAR

type HayStackedChartProps = {
  summary: HayOverviewResponse | null
  loading: boolean
  error: string | null
  attributeId: string
  commodityIds: string[]
}

function yearFromFeedPoint(point: FeedApiPoint): number | null {
  if (typeof point.year === 'number' && Number.isFinite(point.year)) {
    return point.year
  }
  const rawDate = String(point.date ?? point.report_date ?? '').trim()
  if (!rawDate) return null
  const parsed = new Date(rawDate)
  const year = parsed.getUTCFullYear()
  return Number.isNaN(year) ? null : year
}

function HayStackedChart({
  summary,
  loading,
  error,
  attributeId,
  commodityIds,
}: HayStackedChartProps) {
  const attributeLabel = attributeId
    ? attributeLabelFromId(attributeId, 'hay-production')
    : 'Select attribute'

  const { clusters, unitLabel, legendOrder } = useMemo(() => {
    const order = commodityIds.length
      ? Array.from(new Set(commodityIds))
      : [...HAY_COMMODITY_ORDER]

    if (!summary || !attributeId) {
      return { clusters: [] as FeedClusterDatum[], unitLabel: null as string | null, legendOrder: order }
    }

    const normalizedId = attributeId.trim().toLowerCase()

    if (normalizedId === 'hay-production') {
      return {
        clusters: buildHayCommodityClusters(
          summary.production.series,
          summary.production.unit ?? null,
          order,
        ),
        unitLabel: summary.production.unit ?? null,
        legendOrder: order,
      }
    }

    if (normalizedId === 'hay-area-harvested') {
      return {
        clusters: buildHayCommodityClusters(
          summary.area_harvested.series,
          summary.area_harvested.unit ?? null,
          order,
        ),
        unitLabel: summary.area_harvested.unit ?? null,
        legendOrder: order,
      }
    }

    if (normalizedId === 'hay-yield') {
      return {
        clusters: buildHayCommodityClusters(
          summary.yield_per_acre.series,
          summary.yield_per_acre.unit ?? null,
          order,
        ),
        unitLabel: summary.yield_per_acre.unit ?? null,
        legendOrder: order,
      }
    }

    if (normalizedId === 'hay-stocks-may') {
      return {
        clusters: buildHayCommodityClusters(
          summary.stocks.may.series,
          summary.stocks.may.unit ?? null,
          order,
        ),
        unitLabel: summary.stocks.may.unit ?? null,
        legendOrder: order,
      }
    }

    if (normalizedId === 'hay-stocks-dec') {
      return {
        clusters: buildHayCommodityClusters(
          summary.stocks.dec.series,
          summary.stocks.dec.unit ?? null,
          order,
        ),
        unitLabel: summary.stocks.dec.unit ?? null,
        legendOrder: order,
      }
    }

    if (normalizedId === 'hay-supply-rcau') {
      const points = extractHayRcaSeries(summary.rcau.series, HAY_SUPPLY_KEY)
      return {
        clusters: buildHaySingleSeriesClusters(points, summary.rcau.unit ?? null, order),
        unitLabel: summary.rcau.unit ?? null,
        legendOrder: order,
      }
    }

    if (normalizedId === 'hay-disappearance-rcau') {
      const points = extractHayRcaSeries(summary.rcau.series, HAY_DISAPPEARANCE_KEY)
      return {
        clusters: buildHaySingleSeriesClusters(points, summary.rcau.unit ?? null, order),
        unitLabel: summary.rcau.unit ?? null,
        legendOrder: order,
      }
    }

    return { clusters: [] as FeedClusterDatum[], unitLabel: null as string | null, legendOrder: order }
  }, [summary, attributeId, commodityIds])

  const hayCommodityColor = useCallback((id: string) => commodityColorFromId(id), [])
  const hayCommodityLabel = useCallback((id: string) => commodityLabelFromId(id), [])

  return (
    <FeedClusterChart
      clusters={clusters}
      commodityOrder={legendOrder}
      loading={loading}
      error={error}
      getColor={hayCommodityColor}
      getLabel={hayCommodityLabel}
      unitLabel={unitLabel}
      attributeLabel={attributeLabel}
      attributeId={attributeId || 'hay-production'}
    />
  )
}

function buildHayCommodityClusters(
  series: FeedSeriesMap | undefined,
  defaultUnit: string | null,
  selectedOrder: string[],
): FeedClusterDatum[] {
  const perYear = new Map<
    number,
    Map<string, { value: number; unit: string | null }>
  >()

  for (const [commodityName, points] of Object.entries(series ?? {})) {
    const commodityId = commodityIdFromApiValue(commodityName)
    if (!commodityId) continue
    points.forEach((point) => {
      const year = yearFromFeedPoint(point)
      const amount = Number(point.amount)
      if (!Number.isFinite(amount) || year === null || year < HAY_CHART_START_YEAR) return
      const entry = perYear.get(year) ?? new Map()
      entry.set(commodityId, {
        value: amount,
        unit: point.unit ?? defaultUnit,
      })
      perYear.set(year, entry)
    })
  }

  const years = Array.from(perYear.keys())
    .filter((year) => year >= HAY_CHART_START_YEAR)
    .sort((a, b) => a - b)
  if (years.length === 0) return []

  return years.map((year) => {
    const entries = perYear.get(year)
    return {
      year,
      bars: selectedOrder.map((commodityId) => {
        const match = entries?.get(commodityId)
        return {
          commodityId,
          value: match?.value ?? null,
          unit: match?.unit ?? defaultUnit,
        }
      }),
    }
  })
}

function buildHaySingleSeriesClusters(
  points: FeedApiPoint[] | undefined,
  defaultUnit: string | null,
  selectedOrder: string[],
): FeedClusterDatum[] {
  const values = new Map<number, { value: number; unit: string | null }>()
  for (const point of points ?? []) {
    const year = yearFromFeedPoint(point)
    const amount = Number(point.amount)
    if (!Number.isFinite(amount) || year === null || year < HAY_CHART_START_YEAR) continue
    values.set(year, {
      value: amount,
      unit: point.unit ?? defaultUnit,
    })
  }

  const years = Array.from(values.keys())
    .filter((year) => year >= HAY_CHART_START_YEAR)
    .sort((a, b) => a - b)
  if (years.length === 0) return []

  return years.map((year) => {
    const entry = values.get(year)
    return {
      year,
      bars: selectedOrder.map((commodityId) => {
        if (commodityId !== 'hay-all') {
          return {
            commodityId,
            value: null,
            unit: defaultUnit,
          }
        }
        return {
          commodityId,
          value: entry?.value ?? null,
          unit: entry?.unit ?? defaultUnit,
        }
      }),
    }
  })
}

function extractHayRcaSeries(
  series: FeedSeriesMap | undefined,
  target: string,
): FeedApiPoint[] | undefined {
  if (!series) return undefined
  const normalizedTarget = target.trim().toLowerCase()
  for (const [key, points] of Object.entries(series)) {
    if (key.trim().toLowerCase() === normalizedTarget) {
      return points
    }
  }
  return undefined
}

function extractCommodityIdsFromSeries(
  series: FeedSeriesMap | null | undefined,
): string[] {
  if (!series) return []
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const [commodityName, points] of Object.entries(series)) {
    if (!Array.isArray(points) || points.length === 0) continue
    const commodityId = commodityIdFromApiValue(commodityName)
    if (!commodityId || seen.has(commodityId)) continue
    const hasFiniteValue = points.some((point) => {
      const amount = Number(point.amount)
      return Number.isFinite(amount)
    })
    if (!hasFiniteValue) continue
    seen.add(commodityId)
    ordered.push(commodityId)
  }
  return ordered
}

function resolveHayAvailableCommodityIds(
  summary: HayOverviewResponse | null,
  attributeId: string,
): string[] | null {
  if (!summary || !attributeId) return null
  const normalizedId = attributeId.trim().toLowerCase()
  if (!normalizedId) return null

  if (normalizedId === 'hay-production') {
    return extractCommodityIdsFromSeries(summary.production?.series)
  }
  if (normalizedId === 'hay-area-harvested') {
    return extractCommodityIdsFromSeries(summary.area_harvested?.series)
  }
  if (normalizedId === 'hay-yield') {
    return extractCommodityIdsFromSeries(summary.yield_per_acre?.series)
  }
  if (normalizedId === 'hay-stocks-may') {
    return extractCommodityIdsFromSeries(summary.stocks?.may?.series)
  }
  if (normalizedId === 'hay-stocks-dec') {
    return extractCommodityIdsFromSeries(summary.stocks?.dec?.series)
  }
  if (normalizedId === 'hay-supply-rcau') {
    const points = extractHayRcaSeries(summary.rcau?.series, HAY_SUPPLY_KEY)
    return points && points.length > 0 ? ['hay-all'] : []
  }
  if (normalizedId === 'hay-disappearance-rcau') {
    const points = extractHayRcaSeries(
      summary.rcau?.series,
      HAY_DISAPPEARANCE_KEY,
    )
    return points && points.length > 0 ? ['hay-all'] : []
  }
  return null
}

function MultiAttributeFeedChart(props: MultiAttributeChartProps) {
  const {
    attributes,
    series,
    resolvedAttributes,
    loading,
    error,
    getColorFromApiValue,
    stacked = false,
    variant = 'standalone',
    ariaLabel,
  } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [hover, setHover] = useState<
    | {
        x: number
        y: number
        lines: string[]
        value: string
        attributeKey: string
        align: 'left' | 'right'
      }
    | null
  >(null)

  const fallbackSize = { width: 960, height: 540 }
  const margin = { top: 56, right: 32, bottom: 48, left: 72 }
  const marginRight = margin.right

  type RenderedLine = {
    attribute: MultiAttributeMeta
    color: string
    path: string
    areaPath: string
    points: PositionedMultiAttributePoint[]
    dash?: string
  }

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
  }, [attributes.length, resolvedAttributes.length])

  const normalizedSeriesEntries = useMemo(() => {
    if (!series) return []
    return Object.entries(series).map((entry) => entry as [string, FeedApiPoint[]])
  }, [series])

  const lines = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      year: 'numeric',
    })
    return attributes.map((attribute) => {
      const key = attribute.apiValue.trim().toLowerCase()
      const entry = normalizedSeriesEntries.find(
        ([attrKey]) => attrKey.trim().toLowerCase() === key,
      )
      const rawPoints: FeedApiPoint[] = entry ? entry[1] : []
      const pointMap = new Map<string, MultiAttributeLinePoint>()
      rawPoints.forEach((raw) => {
        const amount = Number(raw?.amount)
        if (!Number.isFinite(amount)) return
        const rawYear = Number(raw?.year)
        const hasYear = Number.isFinite(rawYear)
        const isoCandidate = String(raw?.date ?? raw?.report_date ?? '').trim()

        const parseIsoDate = (value: string): Date | null => {
          if (!value) return null
          const parsed = new Date(value)
          if (!Number.isNaN(parsed.getTime())) {
            return parsed
          }
          return null
        }

        let resolvedDate: Date | null = parseIsoDate(isoCandidate)
        let granularity: 'date' | 'year' = 'date'
        let isoKey: string | null = null
        let displayLabel: string | null = null

        if (resolvedDate) {
          isoKey = resolvedDate.toISOString()
          displayLabel = monthFormatter.format(resolvedDate)
        }

        if (!resolvedDate && hasYear) {
          resolvedDate = new Date(Date.UTC(rawYear, 0, 1))
          isoKey = String(rawYear)
          displayLabel = String(rawYear)
          granularity = 'year'
        }

        if (!resolvedDate || !isoKey || !displayLabel) return

        pointMap.set(isoKey, {
          date: resolvedDate,
          isoDate: isoKey,
          value: amount,
          unit: raw?.unit ?? null,
          year: resolvedDate.getUTCFullYear(),
          label: displayLabel,
          granularity,
        })
      })
      const points = Array.from(pointMap.values())
      points.sort((a, b) => a.date.getTime() - b.date.getTime())
      return {
        attribute,
        color:
          attribute.color || getColorFromApiValue(attribute.apiValue),
        points,
        dash: attribute.dash,
      }
    })
  }, [attributes, normalizedSeriesEntries, getColorFromApiValue])

  const sortedTimes = useMemo(() => {
    const times = new Set<number>()
    lines.forEach((line) => {
      line.points.forEach((point) => {
        times.add(point.date.getTime())
      })
    })
    return Array.from(times).sort((a, b) => a - b)
  }, [lines])

  const unitLabel = useMemo(() => {
    for (const line of lines) {
      const match = line.points.find((point) => point.unit)
      if (match?.unit) return match.unit
    }
    return null
  }, [lines])

  const hasData = lines.some((line) => line.points.length > 0)

  const width = size.width > 0 ? size.width : fallbackSize.width
  const height = size.height > 0 ? size.height : fallbackSize.height
  const innerWidth = Math.max(0, width - margin.left - margin.right)
  const innerHeight = Math.max(0, height - margin.top - margin.bottom)

  const allPoints = useMemo(() => {
    const entries: Array<{ attribute: MultiAttributeMeta; point: MultiAttributeLinePoint }> = []
    lines.forEach((line) => {
      line.points.forEach((point) => entries.push({ attribute: line.attribute, point }))
    })
    return entries
  }, [lines])

  const stackedTotals = useMemo(() => {
    if (!stacked || sortedTimes.length === 0) return null
    const totals = sortedTimes.map(() => 0)
    lines.forEach((line) => {
      const valueMap = new Map<number, number>()
      line.points.forEach((point) => {
        valueMap.set(point.date.getTime(), point.value)
      })
      sortedTimes.forEach((time, index) => {
        totals[index] += valueMap.get(time) ?? 0
      })
    })
    return totals
  }, [lines, sortedTimes, stacked])

  const timeDomain = useMemo(() => {
    if (!allPoints.length) return null
    const years = allPoints
      .map((entry) => entry.point.year)
      .filter((value): value is number => Number.isFinite(value))
    const yearGranularityOnly = allPoints.every(
      (entry) => entry.point.granularity === 'year',
    )
    if (yearGranularityOnly && years.length === allPoints.length && years.length > 0) {
      const minYear = Math.min(...years)
      const maxYear = Math.max(...years)
      return {
        min: Date.UTC(minYear, 0, 1),
        max: Date.UTC(maxYear, 0, 1),
      }
    }
    const values = allPoints.map((entry) => entry.point.date.getTime())
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    return { min, max }
  }, [allPoints])

  const valueDomain = useMemo(() => {
    if (!allPoints.length) return null
    if (stacked) {
      if (!stackedTotals || stackedTotals.length === 0) return null
      const maxTotal = Math.max(...stackedTotals)
      if (!Number.isFinite(maxTotal)) return null
      if (maxTotal <= 0) {
        return { min: 0, max: 1 }
      }
      const pad = maxTotal * 0.08
      return { min: 0, max: maxTotal + pad }
    }
    const values = allPoints.map((entry) => entry.point.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.1)
      return { min: min - pad, max: max + pad }
    }
    const span = max - min
    const pad = span * 0.08
    return { min: Math.max(0, min - pad), max: max + pad }
  }, [allPoints, stacked, stackedTotals])

  const { renderedLines, positionedPoints } = useMemo(() => {
    if (!timeDomain || !valueDomain || innerWidth <= 0 || innerHeight <= 0) {
      return {
        renderedLines: lines.map((line) => ({
          attribute: line.attribute,
          color: line.color,
          path: '',
          areaPath: '',
          points: [] as PositionedMultiAttributePoint[],
          dash: line.attribute.dash,
        })),
        positionedPoints: [] as PositionedMultiAttributePoint[],
      }
    }
    const timeSpan = Math.max(1, timeDomain.max - timeDomain.min)
    const valueSpan = Math.max(1e-6, valueDomain.max - valueDomain.min)
    const marginLeft = margin.left
    const marginTop = margin.top

    if (stacked) {
      const timeValues = sortedTimes
      const runningTotals = timeValues.map(() => 0)
      const rendered: RenderedLine[] = lines.map((line) => {
        const pointMap = new Map<number, MultiAttributeLinePoint>()
        line.points.forEach((pt) => {
          pointMap.set(pt.date.getTime(), pt)
        })
        const positioned: PositionedMultiAttributePoint[] = []
        const topSegments: string[] = []
        const topPoints: Array<{ x: number; y: number }> = []
        const basePoints: Array<{ x: number; y: number }> = []
        timeValues.forEach((time, index) => {
          const baselineValue = runningTotals[index]
          const point = pointMap.get(time)
          const value = point?.value ?? 0
          const topValue = baselineValue + value
          const x = marginLeft + ((time - timeDomain.min) / timeSpan) * innerWidth
          const yTop =
            marginTop + innerHeight - ((topValue - valueDomain.min) / valueSpan) * innerHeight
          const yBase =
            marginTop +
            innerHeight -
            ((baselineValue - valueDomain.min) / valueSpan) * innerHeight
          runningTotals[index] = topValue
          if (!Number.isFinite(x) || !Number.isFinite(yTop) || !Number.isFinite(yBase)) {
            return
          }
          topSegments.push(`${topSegments.length === 0 ? 'M' : 'L'}${x} ${yTop}`)
          topPoints.push({ x, y: yTop })
          basePoints.push({ x, y: yBase })
          if (point) {
            positioned.push({ x, y: yTop, attribute: line.attribute, point })
          }
        })
        const areaPath = (() => {
          if (topPoints.length === 0) return ''
          const segments: string[] = []
          topPoints.forEach((pt, idx) => {
            segments.push(`${idx === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`)
          })
          for (let i = basePoints.length - 1; i >= 0; i -= 1) {
            const base = basePoints[i]
            segments.push(`L${base.x} ${base.y}`)
          }
          segments.push('Z')
          return segments.join(' ')
        })()
        return {
          attribute: line.attribute,
          color: line.color,
          path: topSegments.join(' '),
          areaPath,
          points: positioned,
        }
      })
      const flattened = rendered.flatMap((entry) => entry.points)
      return { renderedLines: rendered, positionedPoints: flattened }
    }

    const rendered: RenderedLine[] = lines.map((line) => {
      const segments: string[] = []
      const positioned: PositionedMultiAttributePoint[] = []
      line.points.forEach((pt, index) => {
        const time = pt.date.getTime()
        const value = pt.value
        const x = marginLeft + ((time - timeDomain.min) / timeSpan) * innerWidth
        const y =
          marginTop + innerHeight - ((value - valueDomain.min) / valueSpan) * innerHeight
        if (!Number.isFinite(x) || !Number.isFinite(y)) return
        segments.push(`${index === 0 ? 'M' : 'L'}${x} ${y}`)
        positioned.push({ x, y, attribute: line.attribute, point: pt })
      })
      return {
        attribute: line.attribute,
        color: line.color,
        path: segments.join(' '),
        areaPath: '',
        points: positioned,
      }
    })
    const flattened = rendered.flatMap((entry) => entry.points)
    return { renderedLines: rendered, positionedPoints: flattened }
  }, [
    lines,
    timeDomain,
    valueDomain,
    innerWidth,
    innerHeight,
    margin.left,
    margin.top,
    stacked,
    sortedTimes,
  ])

  const xTicks = useMemo(() => {
    if (!timeDomain) return []
    const yearValues = Array.from(
      new Set(
        allPoints
          .map((entry) => entry.point.year)
          .filter((value): value is number => Number.isFinite(value)),
      ),
    ).sort((a, b) => a - b)
    if (yearValues.length > 0) {
      const maxTicks = Math.max(2, Math.min(10, Math.round(innerWidth / 90)))
      if (yearValues.length <= maxTicks) {
        return yearValues.map((year) => Date.UTC(year, 0, 1))
      }
      const step = Math.ceil(yearValues.length / maxTicks)
      const selected: number[] = []
      yearValues.forEach((year, index) => {
        if (index % step === 0 || index === yearValues.length - 1) {
          selected.push(year)
        }
      })
      return selected.map((year) => Date.UTC(year, 0, 1))
    }
    const { min, max } = timeDomain
    if (!Number.isFinite(min) || !Number.isFinite(max)) return []
    if (min === max) return [min]
    const segments = Math.max(2, Math.min(6, Math.round(innerWidth / 140)))
    const ticks: number[] = []
    for (let i = 0; i <= segments; i += 1) {
      ticks.push(min + ((max - min) * i) / segments)
    }
    return ticks
  }, [timeDomain, allPoints, innerWidth])

  const yTicks = useMemo(() => {
    if (!valueDomain) return []
    const { min, max } = valueDomain
    if (!Number.isFinite(min) || !Number.isFinite(max)) return []
    if (min === max) return [min]
    const segments = 6
    const ticks: number[] = []
    for (let i = 0; i <= segments; i += 1) {
      ticks.push(min + ((max - min) * i) / segments)
    }
    return ticks
  }, [valueDomain])

  const showHoverForPoint = useCallback(
    (point: PositionedMultiAttributePoint | null) => {
      if (!point) {
        setHover(null)
        return
      }
      const formattedDate = point.point.label
      const formattedValue = point.point.value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
      const unitText = point.point.unit ?? unitLabel
      const tooltipWidthEstimate = 220
      const align: 'left' | 'right' =
        point.x + tooltipWidthEstimate > width - marginRight ? 'left' : 'right'

      setHover({
        x: point.x,
        y: point.y,
        lines: [formattedDate, point.attribute.label],
        value: unitText ? `${formattedValue} ${unitText}` : formattedValue,
        attributeKey: point.attribute.apiValue,
        align,
      })
    },
    [unitLabel, width, marginRight],
  )

  const handlePointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || positionedPoints.length === 0) return
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    let nearest: PositionedMultiAttributePoint | null = null
    let nearestDist = Number.POSITIVE_INFINITY
    positionedPoints.forEach((pt) => {
      const dx = pt.x - pointerX
      const dy = pt.y - pointerY
      const dist = dx * dx + dy * dy
      if (dist < nearestDist) {
        nearest = pt
        nearestDist = dist
      }
    })
    showHoverForPoint(nearest)
  }

  const handlePointerLeave = () => showHoverForPoint(null)

  const containerClass =
    variant === 'embedded' ? 'hay-chart-plot' : 'chart-plot feed-plot'
  const containerStyle =
    variant === 'embedded'
      ? { minHeight: 0, height: '100%' }
      : { minHeight: 360 }
  const resolvedAriaLabel = ariaLabel ?? 'Feed attribute comparison chart'

  return (
    <div
      className={containerClass}
      ref={containerRef}
      role="img"
      aria-label={resolvedAriaLabel}
      style={containerStyle}
    >
      <svg width={width} height={height} role="presentation" aria-hidden>
        <rect
          x={margin.left}
          y={margin.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerLeave}
        />
        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={height - margin.bottom}
          y2={height - margin.bottom}
          className="feed-axis-line"
        />
        {yTicks.map((tick) => {
          const y = (() => {
            if (!valueDomain || innerHeight <= 0) return margin.top + innerHeight
            const span = Math.max(1e-6, valueDomain.max - valueDomain.min)
            return (
              margin.top +
              innerHeight -
              ((tick - valueDomain.min) / span) * innerHeight
            )
          })()
          return (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                className="feed-grid"
              />
              <text
                x={margin.left - 10}
                y={y + 4}
                className="feed-axis-value"
                textAnchor="end"
              >
                {tick.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </text>
            </g>
          )
        })}
        {unitLabel && (
          <text x={margin.left} y={margin.top - 24} className="feed-unit-label">
            Unit: {unitLabel}
          </text>
        )}
        {stacked &&
          renderedLines.map((line) =>
            line.areaPath ? (
              <path
                key={`${line.attribute.apiValue}-area`}
                d={line.areaPath}
                fill={line.color}
                fillOpacity={0.6}
                stroke="none"
                pointerEvents="none"
              />
            ) : null,
          )}
        {renderedLines.map((line) => (
          <path
            key={line.attribute.apiValue}
            d={line.path}
            fill="none"
            stroke={line.color}
            strokeWidth={hover?.attributeKey === line.attribute.apiValue ? 3 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={line.dash ?? undefined}
            opacity={line.points.length ? 1 : 0.3}
            pointerEvents="none"
          />
        ))}
        {renderedLines.map((line) =>
          line.points.map((pt) => (
            <circle
              key={`${line.attribute.apiValue}-${pt.point.isoDate}`}
              cx={pt.x}
              cy={pt.y}
              r={hover?.attributeKey === line.attribute.apiValue ? 5 : 4}
              fill={line.color}
              stroke="#ffffff"
              strokeWidth={1.5}
              onPointerEnter={() => showHoverForPoint(pt)}
              onPointerMove={() => showHoverForPoint(pt)}
              onPointerLeave={() => showHoverForPoint(null)}
            />
          )),
        )}
        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={margin.top}
              y2={height - margin.bottom}
              className="feed-hover-line"
            />
          </>
        )}
        {xTicks.map((tick) => {
          if (!timeDomain) return null
          const span = Math.max(1, timeDomain.max - timeDomain.min)
          const x = margin.left + ((tick - timeDomain.min) / span) * innerWidth
          const date = new Date(tick)
          const label = Number.isNaN(date.getFullYear())
            ? ''
            : String(date.getFullYear())
          return (
            <text
              key={tick}
              x={x}
              y={height - margin.bottom + 28}
              textAnchor="middle"
              className="feed-axis-year"
            >
              {label}
            </text>
          )
        })}
        {hover && (
          <circle
            cx={hover.x}
            cy={hover.y}
            r={6}
            className="feed-hover-dot"
          />
        )}
      </svg>
      <div className="feed-chart-legend" aria-label="Attribute legend">
        {attributes.map((attribute) => (
          <span key={attribute.apiValue} className="feed-legend-item">
            <span
              className="feed-legend-swatch"
              style={{ backgroundColor: attribute.color }}
            />
            {attribute.label}
          </span>
        ))}
      </div>
      {loading && <div className="chart-loading">Loading…</div>}
      {error && !loading && <div className="chart-error">{error}</div>}
      {!loading && !error && !hasData && (
        <div className="chart-empty">No data available for the selected attributes.</div>
      )}
      {hover && (
        <div
          className={`chart-tooltip${hover.align === 'left' ? ' chart-tooltip-left' : ''}`}
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="chart-tooltip-content">
            {hover.lines.map((line, index) => (
              <div key={index} className="chart-tooltip-line">
                {line}
              </div>
            ))}
            <div className="chart-tooltip-value">{hover.value}</div>
          </div>
        </div>
      )}
    </div>
  )
}
function FeedClusterChart(props: FeedClusterChartProps) {
  const {
    clusters,
    commodityOrder,
    loading,
    error,
    getColor,
    getLabel,
    unitLabel,
    attributeLabel,
    attributeId,
    variant = 'standalone',
    ariaLabel,
    stacked = false,
  } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [hover, setHover] = useState<
    | {
        x: number
        y: number
        lines: string[]
        value: string
        align: 'left' | 'right'
      }
    | null
  >(null)
  const fallbackSize = { width: 960, height: 540 }

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
  }, [clusters, commodityOrder])

  const hasData = clusters.some((cluster) =>
    cluster.bars.some((bar) => bar.value !== null && typeof bar.value === 'number')
  )

  const margin = { top: 56, right: 32, bottom: 48, left: 72 }
  const marginRight = margin.right
  const width = size.width > 0 ? size.width : fallbackSize.width
  const height = size.height > 0 ? size.height : fallbackSize.height
  const innerWidth = Math.max(0, width - margin.left - margin.right)
  const innerHeight = Math.max(0, height - margin.top - margin.bottom)
  const baseline = margin.top + innerHeight

  const maxValue = useMemo(() => {
    if (stacked) {
      let max = 0
      clusters.forEach((cluster) => {
        let total = 0
        cluster.bars.forEach((bar) => {
          if (typeof bar.value === 'number') total += bar.value
        })
        if (total > max) max = total
      })
      return max
    }
    let max = 0
    clusters.forEach((cluster) => {
      cluster.bars.forEach((bar) => {
        if (typeof bar.value === 'number' && bar.value > max) max = bar.value
      })
    })
    return max
  }, [clusters, stacked])

  const scaleExponent = CORN_CLUSTER_ATTRIBUTE_SCALING.get(attributeId) ?? 1
  const applyValueScale = useCallback(
    (value: number) => {
      if (value <= 0) return 0
      if (scaleExponent === 1) return value
      return Math.pow(value, scaleExponent)
    },
    [scaleExponent],
  )

  const maxValueWithHeadroom = maxValue > 0 ? maxValue * 1.08 : maxValue
  const scaledMaxValue = applyValueScale(maxValueWithHeadroom)

  const yScale = (value: number) => {
    if (scaledMaxValue <= 0 || innerHeight <= 0) return baseline
    return baseline - (applyValueScale(value) / scaledMaxValue) * innerHeight
  }

  const clusterSpacing = clusters.length > 0 ? innerWidth / clusters.length : innerWidth
  const clusterWidth = Math.min(96, clusterSpacing * 0.72)
  const barCount = stacked ? 1 : commodityOrder.length
  const barGap = !stacked && commodityOrder.length > 1 ? Math.min(12, clusterWidth * 0.12) : 0
  const barWidth = barCount
    ? Math.max(10, (clusterWidth - barGap * (barCount - 1)) / barCount)
    : clusterWidth

  const ticks = useMemo(() => {
    if (maxValue <= 0) return [0]
    const desired = 4
    const step = maxValue / desired
    const out: number[] = []
    for (let i = 0; i <= desired; i += 1) {
      out.push(Number((step * i).toFixed(2)))
    }
    return out
  }, [maxValue])

  const updateHover = useCallback(
    (
      event: React.PointerEvent<SVGRectElement>,
      payload: { commodityId: string; year: number; value: number; unit: string | null },
    ) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const formattedValue = payload.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      const unitText = payload.unit ?? unitLabel
      const descriptor = (() => {
        if (!unitText) return attributeLabel
        const normalizedAttribute = attributeLabel.toLowerCase()
        const normalizedUnit = unitText.toLowerCase()
        return normalizedAttribute.includes(normalizedUnit)
          ? attributeLabel
          : `${attributeLabel} (${unitText})`
      })()
      const tooltipWidthEstimate = 220
      const tooltipBoundary = rect.width - marginRight
      const align: 'left' | 'right' =
        pointerX + tooltipWidthEstimate > tooltipBoundary ? 'left' : 'right'
      setHover({
        x: pointerX,
        y: pointerY,
        lines: [`${payload.year} • ${getLabel(payload.commodityId)} • ${descriptor}`],
        value: unitText ? `${formattedValue} ${unitText}` : formattedValue,
        align,
      })
    },
    [attributeLabel, getLabel, marginRight, unitLabel],
  )

  const containerClass =
    variant === 'embedded' ? 'hay-chart-plot' : 'chart-plot feed-plot'
  const containerStyle =
    variant === 'embedded'
      ? { minHeight: 0, height: '100%' }
      : { minHeight: 360 }
  const resolvedAriaLabel =
    ariaLabel ?? `Feed ${attributeLabel.toLowerCase()} chart`

  return (
    <div
      className={containerClass}
      ref={containerRef}
      role="img"
      aria-label={resolvedAriaLabel}
      style={containerStyle}
    >
      {loading && <div className="chart-loading">Loading…</div>}
      {error && !loading && <div className="chart-error">{error}</div>}
      {!loading && !error && (!hasData || innerWidth <= 0 || innerHeight <= 0) && (
        <div className="chart-empty">No data for the selected filters.</div>
      )}
      {!loading && !error && hasData && innerWidth > 0 && innerHeight > 0 && (
        <>
      {hover && (
        <div
          className={`chart-tooltip${hover.align === 'left' ? ' chart-tooltip-left' : ''}`}
          style={{ left: hover.x, top: hover.y }}
        >
          {hover.lines.map((line, index) => (
            <div key={index} className="chart-tooltip-line">
              {line}
            </div>
          ))}
          <div className="chart-tooltip-value">{hover.value}</div>
        </div>
      )}
          <div className="feed-chart-legend" aria-label="Commodity legend">
            {commodityOrder.map((id) => (
              <span key={id} className="feed-legend-item">
                <span className="feed-legend-swatch" style={{ backgroundColor: getColor(id) }} />
                {getLabel(id)}
              </span>
            ))}
          </div>
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${width} ${height}`}
            role="presentation"
            onPointerLeave={() => setHover(null)}
          >
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={baseline}
              y2={baseline}
              className="feed-axis-line"
            />
            {ticks.map((tick) => {
              const y = yScale(tick)
              return (
                <g key={tick}>
                  <line
                    x1={margin.left}
                    x2={width - margin.right}
                    y1={y}
                    y2={y}
                    className="feed-grid"
                  />
                  <text
                    x={margin.left - 10}
                    y={y + 4}
                    className="feed-axis-value"
                    textAnchor="end"
                  >
                    {tick.toLocaleString()}
                  </text>
                </g>
              )
            })}
            {unitLabel && (
              <text
                x={margin.left}
                y={margin.top - 24}
                className="feed-unit-label"
              >
                Unit: {unitLabel}
              </text>
            )}
            {clusters.map((cluster, clusterIndex) => {
              const clusterCenter = margin.left + clusterSpacing * clusterIndex + clusterSpacing / 2
              const totalWidth = stacked
                ? barWidth
                : barWidth * commodityOrder.length + barGap * (commodityOrder.length - 1)
              const clusterStart = clusterCenter - totalWidth / 2
              let stackedRunningTotal = 0
              return (
                <g key={cluster.year}>
                  {cluster.bars.map((bar, barIndex) => {
                    const color = getColor(bar.commodityId)
                    const value = typeof bar.value === 'number' ? bar.value : null
                    if (value === null) {
                      return (
                        <g key={`${cluster.year}-${bar.commodityId}`}>
                          <title>
                            {`${getLabel(bar.commodityId)} ${cluster.year}: No data`}
                          </title>
                        </g>
                      )
                    }

                    if (stacked) {
                      const startValue = stackedRunningTotal
                      stackedRunningTotal += value
                      const top = yScale(stackedRunningTotal)
                      const bottom = yScale(startValue)
                      const height = Math.max(bottom - top, 1)
                      const x = clusterStart
                      const y = top
                      return (
                        <g key={`${cluster.year}-${bar.commodityId}`}>
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={height}
                            rx={Math.min(8, barWidth / 3)}
                            fill={color}
                            onPointerEnter={(event) =>
                              updateHover(event, {
                                commodityId: bar.commodityId,
                                year: cluster.year,
                                value,
                                unit: bar.unit,
                              })
                            }
                            onPointerMove={(event) =>
                              updateHover(event, {
                                commodityId: bar.commodityId,
                                year: cluster.year,
                                value,
                                unit: bar.unit,
                              })
                            }
                            onPointerLeave={() => setHover(null)}
                            onPointerCancel={() => setHover(null)}
                          >
                            <title>
                              {`${getLabel(bar.commodityId)} ${cluster.year}: ${value.toLocaleString()}${
                                unitLabel ? ` ${unitLabel}` : ''
                              }`}
                            </title>
                          </rect>
                        </g>
                      )
                    }

                    const x = clusterStart + barIndex * (barWidth + barGap)
                    const top = yScale(value)
                    const height = Math.max(baseline - top, 1)
                    return (
                      <g key={`${cluster.year}-${bar.commodityId}`}>
                        <rect
                          x={x}
                          y={top}
                          width={barWidth}
                          height={height}
                          rx={Math.min(8, barWidth / 3)}
                          fill={color}
                          onPointerEnter={(event) =>
                            updateHover(event, {
                              commodityId: bar.commodityId,
                              year: cluster.year,
                              value,
                              unit: bar.unit,
                            })
                          }
                          onPointerMove={(event) =>
                            updateHover(event, {
                              commodityId: bar.commodityId,
                              year: cluster.year,
                              value,
                              unit: bar.unit,
                            })
                          }
                          onPointerLeave={() => setHover(null)}
                          onPointerCancel={() => setHover(null)}
                        >
                          <title>
                            {`${getLabel(bar.commodityId)} ${cluster.year}: ${value.toLocaleString()}${
                              unitLabel ? ` ${unitLabel}` : ''
                            }`}
                          </title>
                        </rect>
                        <text
                          x={x + barWidth / 2}
                          y={top - 6}
                          textAnchor="middle"
                          className="feed-bar-label"
                          pointerEvents="none"
                        >
                          {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </text>
                      </g>
                    )
                  })}
                  <text
                    x={clusterCenter}
                    y={baseline + 24}
                    textAnchor="middle"
                    className="feed-axis-year"
                  >
                    {cluster.year}
                  </text>
                </g>
              )
            })}
          </svg>
        </>
      )}
    </div>
  )
}
