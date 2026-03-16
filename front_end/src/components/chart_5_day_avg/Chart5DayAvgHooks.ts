import React, { useEffect } from 'react'
import { Point, Range } from './Chart5DayAvgTypes'
import { toIso, DAYS_BY_RANGE } from './Chart5DayAvgUtils'

export function usePlotSize(plotRef: React.RefObject<HTMLDivElement>, setPlotSize: (s: { w: number; h: number }) => void) {
  useEffect(() => {
    function measure() {
      const el = plotRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPlotSize({ w: r.width, h: r.height })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [plotRef, setPlotSize])
}

export function useChartDataFetch(
  range: Range,
  setSteer: (p: Point[] | null) => void,
  setHeifer: (p: Point[] | null) => void,
  setLoading: (b: boolean) => void,
  setError: (s: string | null) => void
) {
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
        const res = await fetch(`${API_BASE}/api/five-day-avg/timeseries?${params}`, { signal: abort.signal })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const body = await res.json()
        const toSeries = (arr: any[]): Point[] => (Array.isArray(arr) ? arr : [])
          .map(p => ({ date: String(p?.date ?? ''), value: Number(p?.value) }))
          .filter(p => p.date && Number.isFinite(p.value))
        setSteer(toSeries(body?.series?.steer))
        setHeifer(toSeries(body?.series?.heifer))
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setError(e?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => abort.abort()
  }, [range, setSteer, setHeifer, setLoading, setError])
}

export function useYDomainAndTicks(
  showSteer: boolean,
  showHeifer: boolean,
  alignedSteer: { date: string; value: number | null }[],
  alignedHeifer: { date: string; value: number | null }[],
  setYMin: (n: number) => void,
  setYMax: (n: number) => void
) {
  useEffect(() => {
    const vals: number[] = []
    if (showSteer) alignedSteer.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    if (showHeifer) alignedHeifer.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    if (vals.length === 0) { setYMin(0); setYMax(1); return }
    let min = Math.min(...vals)
    let max = Math.max(...vals)
    if (min === max) { min -= 0.5; max += 0.5 }
    const span = Math.max(1e-6, max - min)
    // Narrower padding to better resolve small variations on long ranges
    const padY = Math.max(0.05 * span, 0.1)
    setYMin(Math.max(0, min - padY))
    setYMax(max + padY)
  }, [alignedSteer, alignedHeifer, showSteer, showHeifer, setYMin, setYMax])
}

export function useTickDensity(
  innerH: number,
  tickCount: number,
  setTickCount: (n: number) => void
) {
  useEffect(() => {
    if (innerH <= 0) return
    const MIN_SP = 44, MIN = 6, MAX = 11
    const target = Math.max(MIN, Math.min(MAX, Math.round(innerH / MIN_SP)))
    if (target !== tickCount) setTickCount(target)
  }, [innerH, tickCount, setTickCount])
}
