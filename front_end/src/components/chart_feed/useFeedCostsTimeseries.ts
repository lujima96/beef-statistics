import { useEffect, useMemo, useState } from 'react'

import { getApiBase } from '../../utils/apiBase'
import type { FeedApiPoint, FeedSeriesMap } from './useFeedTimeseries'

export type UseFeedCostsTimeseriesArgs = {
  tableName: string | null
  geographies: string[]
  commodity: string | null
  attribute?: string | null
  frequency?: string | null
  startDate?: string | null
  endDate?: string | null
  limit?: number
  enabled: boolean
}

export type UseFeedCostsTimeseriesResult = {
  data: FeedSeriesMap | null
  resolvedGeographies: string[]
  loading: boolean
  error: string | null
}

export default function useFeedCostsTimeseries(
  args: UseFeedCostsTimeseriesArgs,
): UseFeedCostsTimeseriesResult {
  const {
    tableName,
    geographies,
    commodity,
    attribute,
    frequency,
    startDate,
    endDate,
    limit,
    enabled,
  } = args

  const normalizedGeographies = useMemo(() => {
    if (!geographies || geographies.length === 0) return [] as string[]
    const seen = new Set<string>()
    const ordered: string[] = []
    geographies.forEach((geo) => {
      const trimmed = typeof geo === 'string' ? geo.trim() : ''
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      ordered.push(trimmed)
    })
    return ordered
  }, [geographies])

  const [data, setData] = useState<FeedSeriesMap | null>(null)
  const [resolvedGeographies, setResolvedGeographies] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const geographyKey = useMemo(() => JSON.stringify(normalizedGeographies), [normalizedGeographies])
  const commodityKey = useMemo(() => (commodity ? commodity.trim().toLowerCase() : ''), [commodity])
  const attributeKey = useMemo(() => (attribute ? attribute.trim().toLowerCase() : ''), [attribute])
  const frequencyKey = useMemo(() => (frequency ? frequency.trim().toLowerCase() : ''), [frequency])
  const rangeKey = useMemo(
    () => `${startDate ?? ''}|${endDate ?? ''}|${typeof limit === 'number' ? limit : ''}`,
    [startDate, endDate, limit],
  )

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setError(null)
      setData(null)
      setResolvedGeographies([])
      return
    }

    const normalizedTable = tableName?.trim() ?? ''
    if (!normalizedTable) {
      setLoading(false)
      setError('Missing table selection.')
      setData(null)
      setResolvedGeographies([])
      return
    }

    const normalizedCommodity = commodity?.trim() ?? ''
    if (!normalizedCommodity) {
      setLoading(false)
      setError('Select a commodity to display data.')
      setData(null)
      setResolvedGeographies([])
      return
    }

    if (normalizedGeographies.length === 0) {
      setLoading(false)
      setError(null)
      setData(null)
      setResolvedGeographies([])
      return
    }

    const controller = new AbortController()
    const { signal } = controller

    setLoading(true)
    setError(null)

    const base = getApiBase()

    Promise.all(
      normalizedGeographies.map(async (geography) => {
        const params = new URLSearchParams()
        params.set('table_name', normalizedTable)
        params.set('geography', geography)
        params.set('commodity', normalizedCommodity)
        if (attribute && attribute.trim()) params.set('attribute', attribute.trim())
        if (frequency && frequency.trim()) params.set('frequency', frequency.trim())
        if (startDate) params.set('start_date', startDate)
        if (endDate) params.set('end_date', endDate)
        if (typeof limit === 'number' && Number.isFinite(limit)) {
          params.set('limit', String(Math.max(1, Math.floor(limit))))
        }

        const url = `${base}/api/feed/costs/timeseries?${params.toString()}`
        const res = await fetch(url, { signal })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(text || `Feed costs API error (${res.status})`)
        }
        const body = await res.json()
        const series = (body && typeof body.series === 'object' && body.series) || {}
        const entry = Object.entries(series)[0]
        const points = Array.isArray(entry?.[1]) ? (entry[1] as FeedApiPoint[]) : []
        return { geography, points }
      }),
    )
      .then((results) => {
        const nextData: FeedSeriesMap = {}
        const nextResolved: string[] = []
        results.forEach(({ geography, points }) => {
          nextData[geography] = points
          nextResolved.push(geography)
        })
        setData(nextData)
        setResolvedGeographies(nextResolved)
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError') return
        setError(err?.message || 'Failed to load feed cost data')
        setData(null)
        setResolvedGeographies([])
      })
      .finally(() => {
        if (!signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [
    enabled,
    geographyKey,
    commodityKey,
    attributeKey,
    frequencyKey,
    rangeKey,
    tableName,
    normalizedGeographies,
    commodity,
    attribute,
    frequency,
    startDate,
    endDate,
    limit,
  ])

  return { data, resolvedGeographies, loading, error }
}
