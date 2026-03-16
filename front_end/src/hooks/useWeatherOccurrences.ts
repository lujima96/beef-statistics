import { useEffect, useMemo, useState } from 'react'
import {
  API_EVENT_TYPE_TO_DISPLAY,
  EVENT_TYPE_API_NAMES,
  type EventType,
} from '../constants/eventTypes'
import { getApiBase } from '../utils/apiBase'

const API_BASE = (import.meta as any)?.env?.VITE_API_BASE || 'http://127.0.0.1:8000'

export type WeatherOccurrenceRow = {
  month_start: string
  event_type: EventType
  event_count: number
}

export type WeatherMonthlyTotals = {
  monthStart: string
  totals: Partial<Record<EventType, number>>
  totalCount: number
}

type FetchState = {
  data: WeatherMonthlyTotals[]
  loading: boolean
  error: string | null
  maxEventCount: number
}

function normalizeRange(range: string): '1y' | '3y' | null {
  const key = range.replace(/\s+/g, '').toLowerCase()
  if (key === '1y' || key === '1yr' || key === '1year') return '1y'
  if (key === '3y' || key === '3yr' || key === '3year') return '3y'
  return null
}

export function useWeatherOccurrences(range: string, eventTypes: EventType[], enabled: boolean): FetchState {
  const [rows, setRows] = useState<WeatherOccurrenceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maxEventCount, setMaxEventCount] = useState(0)

  useEffect(() => {
    const windowParam = normalizeRange(range)
    if (!enabled || !windowParam || eventTypes.length === 0) {
      setRows([])
      setLoading(false)
      setError(null)
      setMaxEventCount(0)
      return
    }

    const windowKey: '1y' | '3y' = windowParam

    const abort = new AbortController()
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ window: windowKey })
        const base = getApiBase()
        const res = await fetch(`${base}/api/weather/events?${params}`, { signal: abort.signal })
        if (res.status === 404) {
          setRows([])
          setMaxEventCount(0)
          return
        }
        if (!res.ok) throw new Error(`API ${res.status}`)
        const body = await res.json()
        const data = Array.isArray(body?.data) ? body.data : []
        const normalized: WeatherOccurrenceRow[] = []
        let localMax = 0
        for (const raw of data as any[]) {
          const monthStart = String(raw?.month_start ?? raw?.monthStart ?? '')
          const eventType = String(raw?.event_type ?? raw?.eventType ?? '')
          const displayType = API_EVENT_TYPE_TO_DISPLAY[eventType] ?? (eventType as EventType)
          const eventCount = Number(raw?.event_count ?? raw?.eventCount ?? 0)
          if (!monthStart || !displayType || !Number.isFinite(eventCount)) continue
          if (!Object.prototype.hasOwnProperty.call(EVENT_TYPE_API_NAMES, displayType)) continue
          normalized.push({ month_start: monthStart, event_type: displayType, event_count: eventCount })
          if (eventCount > localMax) localMax = eventCount
        }
        setRows(normalized)
        setMaxEventCount(localMax)
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        setError(err?.message || 'Failed to load weather events')
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => abort.abort()
  }, [enabled, range])

  const data = useMemo<WeatherMonthlyTotals[]>(() => {
    if (!rows.length) return []
    const allowed = new Set(eventTypes)
    const map = new Map<string, Map<EventType, number>>()
    for (const row of rows) {
      const type = row.event_type as EventType
      if (!allowed.has(type)) continue
      if (!map.has(row.month_start)) {
        map.set(row.month_start, new Map())
      }
      const monthMap = map.get(row.month_start)!
      monthMap.set(type, Math.max(0, Math.round(row.event_count)))
    }
    const out: WeatherMonthlyTotals[] = []
    const sortedMonths = Array.from(map.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    for (const month of sortedMonths) {
      const monthMap = map.get(month)!
      let total = 0
      const totals: Partial<Record<EventType, number>> = {}
      for (const type of eventTypes) {
        const count = monthMap.get(type)
        if (count != null) {
          totals[type] = count
          total += count
        }
      }
      out.push({ monthStart: month, totals, totalCount: total })
    }
    return out
  }, [rows, eventTypes])

  return { data, loading, error, maxEventCount }
}
