import { useEffect, useMemo, useRef, useState } from 'react'
import { getApiBase } from '../utils/apiBase'

export type TemperatureRange = '1W' | '1M' | '3M' | '1Y' | '3Y'

type TemperatureWindow = 'last_week' | 'last_month' | 'last_3_months' | 'last_year' | 'last_3_years'

type TemperaturePoint = { date: string; value: number }

const WINDOW_BY_RANGE: Record<TemperatureRange, TemperatureWindow> = {
  '1W': 'last_week',
  '1M': 'last_month',
  '3M': 'last_3_months',
  '1Y': 'last_year',
  '3Y': 'last_3_years',
}

export function useTemperatureSeries(range: TemperatureRange, enabled: boolean, domainDates?: string[]) {
  const cacheRef = useRef(new Map<string, TemperaturePoint[]>())
  const [data, setData] = useState<TemperaturePoint[] | null>(null)
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
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const windowParam = WINDOW_BY_RANGE[range]
        const params = new URLSearchParams({ window: windowParam })
        if (startDate) params.set('start_date', startDate)
        if (endDate) params.set('end_date', endDate)
        const base = getApiBase()
        const res = await fetch(`${base}/api/temperature/daily?${params.toString()}`, { signal: abort.signal })
        if (!res.ok) throw new Error(`Temperature API ${res.status}`)
        const body = await res.json()
        const arr = Array.isArray(body?.data) ? body.data : []
        const points = arr
          .map((item: any): TemperaturePoint => ({
            date: String(item?.date ?? ''),
            value: Number(item?.average_temperature_f ?? item?.average_temperature ?? NaN),
          }))
          .filter((p: TemperaturePoint) => Boolean(p.date) && Number.isFinite(p.value))
          .sort((a: TemperaturePoint, b: TemperaturePoint) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        cacheRef.current.set(cacheKey, points)
        setData(points)
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setError(e?.message || 'Failed to load temperature data')
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
