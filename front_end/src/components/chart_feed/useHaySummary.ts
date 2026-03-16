import { useEffect, useMemo, useState } from 'react'

import { getApiBase } from '../../utils/apiBase'
import type { FeedSeriesMap } from './useFeedTimeseries'

export const HAY_SUMMARY_DEFAULT_START_YEAR = 2018

export type HaySeriesGroup = {
  unit: string | null
  series: FeedSeriesMap
}

export type HayOverviewResponse = {
  table_name: string
  geography: string | null
  production: HaySeriesGroup
  area_harvested: HaySeriesGroup
  yield_per_acre: HaySeriesGroup
  stocks: {
    may: HaySeriesGroup
    dec: HaySeriesGroup
  }
  rcau: {
    unit: string | null
    series: FeedSeriesMap
  }
}

export type UseHaySummaryArgs = {
  enabled: boolean
}

export type UseHaySummaryResult = {
  data: HayOverviewResponse | null
  loading: boolean
  error: string | null
}

export function useHaySummary({ enabled }: UseHaySummaryArgs): UseHaySummaryResult {
  const [data, setData] = useState<HayOverviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const haySummaryQuery = useMemo(() => {
    const search = new URLSearchParams()
    search.set('start_year', String(HAY_SUMMARY_DEFAULT_START_YEAR))
    const currentYear = new Date().getFullYear()
    if (currentYear >= HAY_SUMMARY_DEFAULT_START_YEAR) {
      search.set('end_year', String(currentYear))
    }
    return search.toString()
  }, [])

  useEffect(() => {
    if (!enabled) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()

    setLoading(true)
    setError(null)

    fetch(`${getApiBase()}/api/feed/hay/overview?${haySummaryQuery}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(text || `Hay overview API error (${res.status})`)
        }
        return res.json()
      })
      .then((body) => {
        if (body && typeof body === 'object') {
          setData(body as HayOverviewResponse)
        } else {
          setData(null)
          setError('Malformed hay overview response')
        }
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError') return
        setError(err?.message || 'Failed to load hay overview data')
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
  }, [enabled, haySummaryQuery])

  return { data, loading, error }
}

export default useHaySummary
