import { useEffect, useMemo, useRef, useState } from 'react'
import { getApiBase } from '../utils/apiBase'

export type DieselRange = '1W' | '1M' | '3M' | '1Y' | '3Y'

type DieselWindow = 'last_week' | 'last_month' | 'last_3_months' | 'last_year' | 'last_3_years'

type DieselPoint = { date: string; value: number }

const WINDOW_BY_RANGE: Record<DieselRange, DieselWindow> = {
  '1W': 'last_week',
  '1M': 'last_month',
  '3M': 'last_3_months',
  '1Y': 'last_year',
  '3Y': 'last_3_years',
}

const FALLBACK_WINDOW: Partial<Record<DieselRange, DieselWindow>> = {
  '1W': 'last_month',
  '1M': 'last_3_months',
  '3M': 'last_year',
  '1Y': 'last_3_years',
}

export function useDieselSeries(range: DieselRange, enabled: boolean, domainDates?: string[]) {
  const cacheRef = useRef(new Map<string, DieselPoint[]>())
  const [data, setData] = useState<DieselPoint[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [startDate, endDate] = useMemo((): [string | null, string | null] => {
    if (!domainDates || domainDates.length === 0) return [null, null]
    const sorted = domainDates.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    return [sorted[0], sorted[sorted.length - 1]]
  }, [domainDates])

  const cacheKey = useMemo(() => `${range}|${startDate ?? ''}|${endDate ?? ''}`, [range, startDate, endDate])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setError(null)
      return
    }

    if (domainDates && domainDates.length === 0) {
      setLoading(false)
      setError(null)
      return
    }

    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setData(cached)
      setLoading(false)
      setError(null)
      return
    }

    const abort = new AbortController()

    const parsePoints = (arr: any[]): DieselPoint[] =>
      (Array.isArray(arr) ? arr : [])
        .map((item: any): DieselPoint => ({
          date: String(item?.date ?? ''),
          value: Number(item?.diesel_dollars_per_gallon ?? item?.value ?? NaN),
        }))
        .filter((p: DieselPoint) => Boolean(p.date) && Number.isFinite(p.value))
        .sort((a: DieselPoint, b: DieselPoint) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    const fetchSeries = async (
      windowParam: DieselWindow,
      bounds: { start?: string | null; end?: string | null },
    ): Promise<DieselPoint[] | null> => {
      const params = new URLSearchParams({ window: windowParam })
      if (bounds.start) params.set('start_date', bounds.start)
      if (bounds.end) params.set('end_date', bounds.end)
        const res = await fetch(`${getApiBase()}/api/energy/diesel?${params.toString()}`, { signal: abort.signal })
      if (res.status === 404) return []
      if (!res.ok) throw new Error(`Diesel API ${res.status}`)
      const body = await res.json()
      return parsePoints(body?.data)
    }

    const subtractDays = (iso: string, days: number): string | null => {
      const dt = new Date(`${iso}T00:00:00Z`)
      if (!Number.isFinite(dt.getTime())) return null
      dt.setUTCDate(dt.getUTCDate() - days)
      return dt.toISOString().slice(0, 10)
    }

    const widenStartDate = (): string | null => {
      if (!endDate) return null
      const MIN_LOOKBACK = range === '1W' ? 21 : 30
      return subtractDays(endDate, MIN_LOOKBACK)
    }

    async function run() {
      setLoading(true)
      setError(null)
      try {
        const windowParam = WINDOW_BY_RANGE[range]
        const primaryBounds = startDate && endDate ? { start: startDate, end: endDate } : {}
        let points = await fetchSeries(windowParam, primaryBounds)

        if (points && points.length === 0) {
          const widenedStart = widenStartDate()
          if (widenedStart) {
            points = await fetchSeries(windowParam, { start: widenedStart, end: endDate })
          }
        }

        if (points && points.length === 0) {
          const fallbackWindow = FALLBACK_WINDOW[range]
          if (fallbackWindow) {
            points = await fetchSeries(fallbackWindow, {})
          }
        }

        if (!points) {
          return
        }

        if (points.length > 0) {
          cacheRef.current.set(cacheKey, points)
        }
        setData(points)
        if (points.length === 0) {
          setError('No diesel price data available for the selected window.')
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setError(e?.message || 'Failed to load diesel data')
        cacheRef.current.delete(cacheKey)
        setData([])
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => abort.abort()
  }, [range, enabled, domainDates, startDate, endDate, cacheKey])

  const latest = useMemo(() => {
    if (!enabled) return cacheRef.current.get(cacheKey) ?? data
    return data
  }, [data, enabled, cacheKey])

  return { data: latest ?? null, loading, error }
}
