import React, { useEffect } from 'react'
import { Payload, Point, Range } from './ChartIndexTypes'
import { toIso, DAYS_BY_RANGE } from './ChartIndexUtils'

export function usePlotSize(plotRef: React.RefObject<HTMLDivElement>, setPlotSize: (s: { w: number; h: number }) => void) {
  useEffect(() => {
    const measure = () => {
      const el = plotRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPlotSize({ w: rect.width, h: rect.height })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [plotRef, setPlotSize])
}

export function useDropdownClose(gradeRef: React.RefObject<HTMLDivElement>, reportRef: React.RefObject<HTMLDivElement>, setGradeOpen: (b: boolean) => void, setReportOpen: (b: boolean) => void, setColorOpen: (b: boolean) => void) {
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      const insideGrade = gradeRef.current && gradeRef.current.contains(target)
      const insideReport = reportRef.current && reportRef.current.contains(target)
      if (!insideGrade) setGradeOpen(false)
      if (!insideReport) setReportOpen(false)
      if (!insideGrade && !insideReport) setColorOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [gradeRef, reportRef, setGradeOpen, setReportOpen, setColorOpen])
}

export function useChartDataFetch(
  range: Range,
  setData: (p: Payload | null) => void,
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
        const res = await fetch(`${API_BASE}/api/index/timeseries?${params}`, { signal: abort.signal })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const body = await res.json()
        const toSeries = (arr: any[]): Point[] => (Array.isArray(arr) ? arr : [])
          .map(p => ({ date: String(p?.date ?? ''), value: Number(p?.value) }))
          .filter(p => p.date && Number.isFinite(p.value))
        setData({ choice: toSeries(body?.series?.choice), select: toSeries(body?.series?.select) })
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setError(e?.message || 'Failed to load index data')
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => abort.abort()
  }, [range, setData, setLoading, setError])
}

export function useYAutoFit(
  aligned: { date: string; value: number | null }[],
  setYMin: (n: number) => void,
  setYMax: (n: number) => void
) {
  useEffect(() => {
    const vals: number[] = []
    aligned.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    if (vals.length === 0) { setYMin(0); setYMax(1); return }
    let min = Math.min(...vals)
    let max = Math.max(...vals)
    if (min === max) { min -= 1; max += 1 }
    const span = Math.max(1e-6, max - min)
    const padY = Math.max(0.1 * span, 0.25)
    setYMin(min - padY)
    setYMax(max + padY)
  }, [aligned, setYMin, setYMax])
}

export function useTickAdaptation(
  plotSizeH: number,
  padTop: number,
  padBottom: number,
  tickCount: number,
  setTickCount: (n: number) => void
) {
  useEffect(() => {
    const innerH = Math.max(0, plotSizeH - padTop - padBottom)
    if (innerH <= 0) return
    const MIN_SP = 44, MIN = 6, MAX = 11
    const target = Math.max(MIN, Math.min(MAX, Math.round(innerH / MIN_SP)))
    if (target !== tickCount) setTickCount(target)
  }, [plotSizeH, padTop, padBottom, tickCount, setTickCount])
}
