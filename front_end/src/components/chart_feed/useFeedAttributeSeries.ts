import { useEffect, useMemo, useState } from 'react'

import { getApiBase } from '../../utils/apiBase'
import type { FeedApiPoint } from './useFeedTimeseries'

export type FeedAttributeSeriesMap = Record<string, FeedApiPoint[]>

export type UseFeedAttributeSeriesArgs = {
  tableName: string | null
  attributes: string[]
  geography?: string | null
  frequency?: string | null
  commodities?: string[] | null
  startDate?: string | null
  endDate?: string | null
  limit?: number
  enabled: boolean
}

export type UseFeedAttributeSeriesResult = {
  data: FeedAttributeSeriesMap | null
  resolvedAttributes: string[]
  loading: boolean
  error: string | null
}

export default function useFeedAttributeSeries(
  args: UseFeedAttributeSeriesArgs,
): UseFeedAttributeSeriesResult {
  const {
    tableName,
    attributes,
    geography,
    frequency,
    commodities,
    startDate,
    endDate,
    limit,
    enabled,
  } = args

  const [data, setData] = useState<FeedAttributeSeriesMap | null>(null)
  const [resolvedAttributes, setResolvedAttributes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const attributeKey = useMemo(() => {
    if (!attributes || attributes.length === 0) return ''
    return JSON.stringify(attributes)
  }, [attributes])

  const commodityKey = useMemo(() => {
    if (!commodities || commodities.length === 0) return ''
    return JSON.stringify([...commodities].sort())
  }, [commodities])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setError(null)
      setData(null)
      setResolvedAttributes([])
      return
    }

    if (!tableName || !attributes || attributes.length === 0) {
      setLoading(false)
      setData(null)
      setResolvedAttributes([])
      setError('Missing table or attribute selection.')
      return
    }

    const controller = new AbortController()

    const params = new URLSearchParams()
    params.set('table_name', tableName)
    attributes.forEach((attribute) => {
      if (attribute) params.append('attributes', attribute)
    })
    if (geography) params.set('geography', geography)
    if (frequency) params.set('frequency', frequency)
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)
    if (typeof limit === 'number' && Number.isFinite(limit)) {
      params.set('limit', String(Math.max(1, Math.floor(limit))))
    }
    if (commodities) {
      commodities.forEach((commodity) => {
        if (commodity) params.append('commodities', commodity)
      })
    }

    setLoading(true)
    setError(null)

    fetch(`${getApiBase()}/api/feed/attributes/timeseries?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(text || `Feed attribute API error (${res.status})`)
        }
        return res.json()
      })
      .then((body) => {
        const nextSeries: FeedAttributeSeriesMap | null =
          body && typeof body.series === 'object' ? body.series : null
        setData(nextSeries)
        const nextResolved: string[] = Array.isArray(body?.resolved_attributes)
          ? body.resolved_attributes
          : Array.isArray(body?.attributes)
          ? body.attributes
          : []
        setResolvedAttributes(nextResolved)
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError') return
        setError(err?.message || 'Failed to load feed attribute data')
        setData(null)
        setResolvedAttributes([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [tableName, attributeKey, geography, frequency, startDate, endDate, limit, enabled, commodityKey])

  return { data, resolvedAttributes, loading, error }
}
