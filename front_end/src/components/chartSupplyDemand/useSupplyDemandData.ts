import { useEffect, useMemo, useState } from 'react'
import { DAYS_BY_RANGE, EqRow, HeadsRow, Payload, Range } from './types'
import { toIso } from './utils'

function toEquivalentRows(arr: unknown): EqRow[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map((row) => ({
      date: String((row as any)?.date ?? ''),
      supply: (row as any)?.supply != null ? Number((row as any).supply) : null,
      demand: (row as any)?.demand != null ? Number((row as any).demand) : null,
    }))
    .filter((row) => row.date)
}

function toHeadRows(arr: unknown): HeadsRow[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map((row) => ({
      date: String((row as any)?.date ?? ''),
      supply: Number((row as any)?.supply ?? 0),
      demand: Number((row as any)?.demand ?? 0),
    }))
    .filter((row) => row.date)
}

export function useSupplyDemandData(range: Range) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const abort = new AbortController()

    async function run() {
      setLoading(true)
      setError(null)
      try {
        const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000'
        const end = new Date()
        const targetDays = DAYS_BY_RANGE[range]
        const fetchBackDays = Math.max(60, targetDays + 30)
        const start = new Date(end)
        start.setDate(end.getDate() - fetchBackDays)
        const params = new URLSearchParams({ start_date: toIso(start), end_date: toIso(end) })
        const res = await fetch(`${API_BASE}/api/index/supply-demand/timeseries?${params}`, {
          signal: abort.signal,
        })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const body = await res.json()
        setData({
          equivalent: {
            choice: toEquivalentRows(body?.equivalent?.choice),
            select: toEquivalentRows(body?.equivalent?.select),
          },
          heads: toHeadRows(body?.heads),
        })
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        setError(err?.message || 'Failed to load supply/demand data')
      } finally {
        setLoading(false)
      }
    }

    run()
    return () => abort.abort()
  }, [range])

  const domainDates = useMemo(() => {
    const dates = new Set<string>()
    if (data) {
      data.equivalent.choice.forEach((row) => dates.add(row.date))
      data.equivalent.select.forEach((row) => dates.add(row.date))
      data.heads.forEach((row) => dates.add(row.date))
    }
    const sorted = Array.from(dates).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const limit = DAYS_BY_RANGE[range]
    return sorted.slice(Math.max(0, sorted.length - limit))
  }, [data, range])

  const alignEquivalent = useMemo(
    () =>
      (rows: EqRow[]) => {
        const supply = new Map(rows.map((row) => [row.date, row.supply]))
        const demand = new Map(rows.map((row) => [row.date, row.demand]))
        return domainDates.map((date) => ({
          date,
          supply: supply.get(date) ?? null,
          demand: demand.get(date) ?? null,
        }))
      },
    [domainDates],
  )

  const alignHeads = useMemo(
    () =>
      (rows: HeadsRow[]) => {
        const supply = new Map(rows.map((row) => [row.date, row.supply]))
        const demand = new Map(rows.map((row) => [row.date, row.demand]))
        return domainDates.map((date) => ({
          date,
          supply: supply.get(date) ?? 0,
          demand: demand.get(date) ?? 0,
        }))
      },
    [domainDates],
  )

  return { data, loading, error, domainDates, alignEquivalent, alignHeads }
}
