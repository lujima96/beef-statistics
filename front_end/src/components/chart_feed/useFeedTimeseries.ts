import { useEffect, useMemo, useState } from 'react'

import { getApiBase } from '../../utils/apiBase'
import {
  CORN_ACREAGE_PRODUCTION_TABLE_NAME,
  CORN_SORGHUM_PRICES_TABLE_NAME,
  CORN_SORGHUM_PRICES_ATTRIBUTE,
  FEED_PRICE_RATIOS_ATTRIBUTE,
  FEED_PRICE_RATIOS_TABLE_NAME,
  HAY_PRICES_TABLE_NAME,
} from './ChartFeedControls'

export type FeedApiPoint = {
  date: string
  report_date?: string | null
  amount: number
  unit?: string | null
  attribute?: string | null
  geography?: string | null
  frequency?: string | null
  timeperiod?: string | null
  table_group?: string | null
  table_name?: string | null
  commodity_group?: string | null
  year?: number | null
}

export type FeedSeriesMap = Record<string, FeedApiPoint[]>

export type UseFeedTimeseriesArgs = {
  tableName: string | null
  attribute: string | null
  geography?: string | null
  frequency?: string | null
  timeperiod?: string | null
  commodities?: string[] | null
  startDate?: string | null
  endDate?: string | null
  limit?: number
  enabled: boolean
}

export type UseFeedTimeseriesResult = {
  data: FeedSeriesMap | null
  loading: boolean
  error: string | null
}

export function useFeedTimeseries(args: UseFeedTimeseriesArgs): UseFeedTimeseriesResult {
  const {
    tableName,
    attribute,
    geography,
    frequency,
    timeperiod,
    commodities,
    startDate,
    endDate,
    limit,
    enabled,
  } = args

  const [data, setData] = useState<FeedSeriesMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commodityKey = useMemo(() => {
    if (!commodities || !commodities.length) return ''
    return JSON.stringify([...commodities].sort())
  }, [commodities])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setError(null)
      setData(null)
      return
    }

    if (!tableName || !attribute) {
      setLoading(false)
      setData(null)
      setError('Missing table or attribute selection.')
      return
    }

    const controller = new AbortController()

    const appendSharedParams = (
      target: URLSearchParams,
      commodityParam: 'commodities' | 'ratios' = 'commodities',
    ) => {
      if (geography) target.set('geography', geography)
      if (frequency) target.set('frequency', frequency)
      if (startDate) target.set('start_date', startDate)
      if (endDate) target.set('end_date', endDate)
      if (typeof limit === 'number' && Number.isFinite(limit)) {
        target.set('limit', String(Math.max(1, Math.floor(limit))))
      }
      if (commodities) {
        for (const commodity of commodities) {
          if (commodity) target.append(commodityParam, commodity)
        }
      }
    }

    const isCornProductionPreset =
      tableName === CORN_ACREAGE_PRODUCTION_TABLE_NAME && attribute === 'Production'
    const isCornSorghumPricePreset = tableName === CORN_SORGHUM_PRICES_TABLE_NAME
    const isHayPricePreset =
      tableName === HAY_PRICES_TABLE_NAME && attribute === CORN_SORGHUM_PRICES_ATTRIBUTE
    const isFeedPriceRatioPreset =
      tableName === FEED_PRICE_RATIOS_TABLE_NAME && attribute === FEED_PRICE_RATIOS_ATTRIBUTE

    let url: string
    if (isCornProductionPreset) {
      const params = new URLSearchParams()
      if (attribute) params.set('attribute', attribute)
      appendSharedParams(params)
      url = `${getApiBase()}/api/feed/corn/production?${params.toString()}`
    } else if (isCornSorghumPricePreset) {
      const params = new URLSearchParams()
      if (attribute) params.set('attribute', attribute)
      appendSharedParams(params)
      url = `${getApiBase()}/api/feed/corn-sorghum/prices?${params.toString()}`
    } else if (isHayPricePreset) {
      const params = new URLSearchParams()
      appendSharedParams(params)
      url = `${getApiBase()}/api/feed/hay/prices?${params.toString()}`
    } else if (isFeedPriceRatioPreset) {
      const params = new URLSearchParams()
      if (attribute) params.set('attribute', attribute)
      appendSharedParams(params, 'ratios')
      url = `${getApiBase()}/api/feed/feed-price-ratios?${params.toString()}`
    } else {
      const params = new URLSearchParams()
      params.set('table_name', tableName)
      params.set('attribute', attribute)
      if (timeperiod) params.set('timeperiod', timeperiod)
      appendSharedParams(params)
      url = `${getApiBase()}/api/feed/timeseries?${params.toString()}`
    }

    setLoading(true)
    setError(null)

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(text || `Feed API error (${res.status})`)
        }
        return res.json()
      })
      .then((body) => {
        setData((body && typeof body.series === 'object' && body.series) || {})
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError') return
        setError(err?.message || 'Failed to load feed data')
        setData(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [
    tableName,
    attribute,
    geography,
    frequency,
    timeperiod,
    startDate,
    endDate,
    limit,
    enabled,
    commodityKey,
  ])

  return { data, loading, error }
}

export default useFeedTimeseries
