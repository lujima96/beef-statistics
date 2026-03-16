import React, { useEffect } from 'react'
import { SeriesPayload, Point, Range } from './ChartRangeTypes'
import { toIso, fillMissing, alignSeries } from './ChartRangeUtils'
import { PRIMAL_MAP, DAYS_BY_RANGE } from './ChartRangeConstants'
import { getApiBase } from '../../utils/apiBase'

export function useDropdownClose(gradeRef: React.RefObject<HTMLDivElement>, primalRef: React.RefObject<HTMLDivElement>, setGradeOpen: (b: boolean) => void, setPrimalOpen: (b: boolean) => void) {
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (gradeRef.current && !gradeRef.current.contains(target)) setGradeOpen(false)
      if (primalRef.current && !primalRef.current.contains(target)) setPrimalOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [gradeRef, primalRef, setGradeOpen, setPrimalOpen])
}

export function useChartDataFetch(
  grade: 'choice' | 'select',
  primal: string,
  range: Range,
  setData: (p: SeriesPayload | null) => void,
  setLoading: (b: boolean) => void,
  setError: (s: string | null) => void
) {
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
        const params = new URLSearchParams({
          primal: PRIMAL_MAP[primal],
          grade,
          start_date: toIso(start),
          end_date: toIso(end),
        })
        const res = await fetch(`${API_BASE}/api/boxed-primals/timeseries?${params}`, {
          signal: abort.signal,
        })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const body = await res.json()
        const toSeries = (arr: any[]): Point[] =>
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
  }, [grade, primal, range, setData, setLoading, setError])
}

export function useYAutoFit(
  alignedAm: { date: string; value: number | null }[],
  alignedPm: { date: string; value: number | null }[],
  showAm: boolean,
  showPm: boolean,
  setYMin: (n: number) => void,
  setYMax: (n: number) => void,
  setZoomLevel: (n: number) => void,
  setBaseY: (o: { min: number; max: number } | null) => void,
  setView: (v: { scale: number; tx: number }) => void
) {
  useEffect(() => {
    const vals: number[] = []
    if (showAm) alignedAm.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    if (showPm) alignedPm.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    if (vals.length === 0) { setYMin(0); setYMax(1); return }
    let min = Math.min(...vals)
    let max = Math.max(...vals)
    if (min === max) { min -= 0.5; max += 0.5 }
    const span = Math.max(1e-6, max - min)
    const pad = Math.max(0.1 * span, 0.25)
    const fitMin = min - pad
    const fitMax = max + pad
    setYMin(fitMin)
    setYMax(fitMax)
    setZoomLevel(0)
    setBaseY({ min: fitMin, max: fitMax })
    setView({ scale: 1, tx: 0 })
  }, [alignedAm, alignedPm, showAm, showPm, setYMin, setYMax, setZoomLevel, setBaseY, setView])
}

export function usePlotSize(plotRef: React.RefObject<HTMLDivElement>, setPlotSize: (s: { w: number; h: number }) => void) {
  useEffect(() => {
    function measure() {
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

export function useTickAdaptation(
  innerH: number,
  tickCount: number,
  setTickCount: (n: number) => void
) {
  useEffect(() => {
    if (innerH <= 0) return
    const MIN_SPACING = 44 // px between labels
    const MIN = 6
    const MAX = 11
    const target = Math.max(MIN, Math.min(MAX, Math.round(innerH / MIN_SPACING)))
    if (target !== tickCount) setTickCount(target)
  }, [innerH, tickCount, setTickCount])
}

export function useAlignedData(data: SeriesPayload | null, domainDates: string[]) {
  return React.useMemo(() => {
    if (!data) return { am: [], pm: [] as { date: string; value: number | null }[] }
    // Prepare raw non-zero series and date index for prev/next lookups across full window
    const prepRaw = (arr: Point[]) => arr.filter(p => Number.isFinite(p.value) && p.value !== 0).slice().sort((a,b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const amRaw = prepRaw(data.am)
    const pmRaw = prepRaw(data.pm)
    const amDates = amRaw.map(p => p.date)
    const pmDates = pmRaw.map(p => p.date)
    const rawMap = (raw: Point[]) => new Map(raw.map(p => [p.date, p.value]))
    const amMap = rawMap(amRaw)
    const pmMap = rawMap(pmRaw)

    const amAligned = alignSeries(data.am, domainDates)
    const pmAligned = alignSeries(data.pm, domainDates)
    return {
      am: fillMissing(amAligned, amRaw, amDates, amMap),
      pm: fillMissing(pmAligned, pmRaw, pmDates, pmMap),
    }
  }, [data, domainDates])
}
