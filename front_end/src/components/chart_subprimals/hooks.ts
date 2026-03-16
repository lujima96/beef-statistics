import { useEffect, useState } from 'react'
import type { Range, SeriesPayload } from './types'
import { DAYS_BY_RANGE, SUBPRIMALS, SUBPRIMAL_LABELS } from './constants'
import { toIso } from './format'
import { getApiBase, toApiParams } from './api'

export function useTimeseries(grade: 'choice' | 'select', imps: string, range: Range) {
  const [data, setData] = useState<SeriesPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const API_BASE = getApiBase()
        const end = new Date()
        const targetDays = DAYS_BY_RANGE[range]
        const fetchBackDays = Math.max(60, targetDays + 30)
        const start = new Date(end)
        start.setDate(end.getDate() - fetchBackDays)
        const { baseImps, hint, fatLimit } = toApiParams(imps)
        const params = new URLSearchParams({
          imps: baseImps,
          grade,
          start_date: toIso(start),
          end_date: toIso(end),
        })
        if (hint) params.set('label_hint', hint)
        if (fatLimit != null) params.set('fat_limit', String(fatLimit))
        const res = await fetch(`${API_BASE}/api/boxed-subprimals/timeseries?${params}`, { signal: abort.signal })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const body = await res.json()
        const toSeries = (arr: any[]) =>
          (Array.isArray(arr) ? arr : [])
            .map((p) => ({ date: String(p?.date ?? ''), value: Number(p?.value) / 100 }))
            .filter((p) => p.date && Number.isFinite(p.value))
        const series: SeriesPayload = { am: toSeries(body?.series?.am), pm: toSeries(body?.series?.pm) }
        setData(series)
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setError(e?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => abort.abort()
  }, [grade, imps, range])

  return { data, loading, error }
}

export function useSubprimalOptions(imps: string, setImps: (s: string)=>void) {
  const [options, setOptions] = useState<{ code: string; label: string }[]>([])
  useEffect(() => {
    const abort = new AbortController()
    async function run() {
      try {
        const API_BASE = getApiBase()
        const res = await fetch(`${API_BASE}/api/boxed-subprimals/options`, { signal: abort.signal })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const body = await res.json()
        const list = Array.isArray(body?.options) ? body.options : []
        const merged: { code: string; label: string }[] = []
        const seen = new Set<string>()
        for (const code of SUBPRIMALS) {
          if (!seen.has(code)) {
            merged.push({ code, label: SUBPRIMAL_LABELS[code] || code })
            seen.add(code)
          }
        }
        for (const it of list as any[]) {
          const code = String(it?.code ?? '')
          if (!code) continue
          if (!seen.has(code)) {
            merged.push({ code, label: String(it?.label ?? code) })
            seen.add(code)
          }
        }
        merged.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
        setOptions(merged)
        if (merged.length && !seen.has(imps)) setImps(merged[0].code)
      } catch (e) {
        const fallback = (SUBPRIMALS as unknown as string[]).map((c) => ({ code: c, label: SUBPRIMAL_LABELS[c] || c }))
        setOptions(fallback)
      }
    }
    run()
    return () => abort.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { options }
}

