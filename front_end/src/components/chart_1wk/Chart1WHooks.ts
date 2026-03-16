import React, { useEffect, useState } from 'react'
import { Point, SeriesPayload } from './Chart1WTypes'
import { toIso, alignSeries, autoFitY } from './Chart1WUtils'
import { PRIMAL_MAP } from './constants'
import { getApiBase } from '../../utils/apiBase'

export function useDropdownClose(gradeRef: React.RefObject<HTMLDivElement>, primalRef: React.RefObject<HTMLDivElement>, setGradeOpen: (b: boolean) => void, setPrimalOpen: (b: boolean) => void) {
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      const outsideGrade = gradeRef.current && !gradeRef.current.contains(target)
      const outsidePrimal = primalRef.current && !primalRef.current.contains(target)
      if (outsideGrade) setGradeOpen(false)
      if (outsidePrimal) setPrimalOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [gradeRef, primalRef, setGradeOpen, setPrimalOpen])
}

export function useChartDataFetch(primal: string, setDataChoice: (p: SeriesPayload | null) => void, setDataSelect: (p: SeriesPayload | null) => void, setLoading: (b: boolean) => void, setError: (s: string | null) => void) {
  useEffect(() => {
    const abort = new AbortController()
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const API_BASE = getApiBase()
        // Make a generous window, then we trim to last 7 dates with data
        const end = new Date()
        const start = new Date(end)
        start.setDate(end.getDate() - 60)
        const buildParams = (g: 'choice' | 'select') => new URLSearchParams({
          primal: PRIMAL_MAP[primal],
          grade: g,
          start_date: toIso(start),
          end_date: toIso(end),
        })
        const [resChoice, resSelect] = await Promise.all([
          fetch(`${API_BASE}/api/boxed-primals/timeseries?${buildParams('choice')}`, { signal: abort.signal }),
          fetch(`${API_BASE}/api/boxed-primals/timeseries?${buildParams('select')}`, { signal: abort.signal }),
        ])
        if (!resChoice.ok) throw new Error(`API choice ${resChoice.status}`)
        if (!resSelect.ok) throw new Error(`API select ${resSelect.status}`)
        const [bodyChoice, bodySelect] = await Promise.all([resChoice.json(), resSelect.json()])
        // Coerce values to numbers and drop invalids to avoid NaNs propagating
        const toSeries = (arr: any[]): Point[] =>
          (Array.isArray(arr) ? arr : [])
            .map((p) => ({ date: String(p?.date ?? ''), value: Number(p?.value) / 100 }))
            .filter((p) => p.date && Number.isFinite(p.value))

        const seriesChoice: SeriesPayload = { am: toSeries(bodyChoice?.series?.am), pm: toSeries(bodyChoice?.series?.pm) }
        const seriesSelect: SeriesPayload = { am: toSeries(bodySelect?.series?.am), pm: toSeries(bodySelect?.series?.pm) }
        setDataChoice(seriesChoice)
        setDataSelect(seriesSelect)
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setError(e?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => abort.abort()
  }, [primal, setDataChoice, setDataSelect, setLoading, setError])
}

export function useAutofitY(
  grade: 'choice' | 'select' | 'both',
  showAm: boolean,
  showPm: boolean,
  alignedChoice: SeriesPayload,
  alignedSelect: SeriesPayload,
  setYMin: (n: number) => void,
  setYMax: (n: number) => void,
  setBaseY: (o: { min: number; max: number } | null) => void,
  setTickCount: (n: number) => void,
  setZoomLevel: (n: number) => void
) {
  useEffect(() => {
    autoFitY(grade, showAm, showPm, alignedChoice, alignedSelect, setYMin, setYMax, setBaseY, setTickCount, setZoomLevel)
  }, [alignedChoice, alignedSelect, showAm, showPm, grade, setYMin, setYMax, setBaseY, setTickCount, setZoomLevel])
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

export function useAudit(domainDates: string[], dataChoice: SeriesPayload | null, dataSelect: SeriesPayload | null, alignedChoice: SeriesPayload, alignedSelect: SeriesPayload, yMin: number, yMax: number, xFor: (i: number) => number) {
  useEffect(() => {
    const DEV = (import.meta as any).env?.DEV ?? true
    if (!DEV) return
    if (!dataChoice && !dataSelect) return
    const parse = (d: string) => new Date(d + 'T00:00:00')
    const dupeCount = domainDates.filter((d, i) => i > 0 && d === domainDates[i - 1]).length
    const invalidDomain = domainDates.filter(d => Number.isNaN(parse(d).getTime())).length
    let gapDaysTotal = 0
    for (let i = 1; i < domainDates.length; i++) {
      const a = parse(domainDates[i - 1])
      const b = parse(domainDates[i])
      const ms = b.getTime() - a.getTime()
      if (Number.isFinite(ms)) gapDaysTotal += Math.max(0, Math.round(ms / 86400000) - 1)
    }
    const vals: number[] = []
    alignedChoice.am.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    alignedChoice.pm.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    alignedSelect.am.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    alignedSelect.pm.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    const ymin = vals.length ? Math.min(...vals) : null
    const ymax = vals.length ? Math.max(...vals) : null
    const outOfDomain = vals.filter(v => v < yMin || v > yMax).length
    const n = domainDates.length
    const sampleIdx = Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1].filter(i => i >= 0)))
    const xMap = sampleIdx.map(i => ({ i, d: domainDates[i], x: Math.round(xFor(i)) }))
    // eslint-disable-next-line no-console
    console.groupCollapsed('[Chart1W audit] domain/y check')
    // eslint-disable-next-line no-console
    console.log({
      domainCount: domainDates.length,
      start: domainDates[0],
      end: domainDates[domainDates.length - 1],
      duplicateNeighbors: dupeCount,
      gapDaysTotal,
      amCountChoice: dataChoice?.am.length ?? 0,
      pmCountChoice: dataChoice?.pm.length ?? 0,
      amCountSelect: dataSelect?.am.length ?? 0,
      pmCountSelect: dataSelect?.pm.length ?? 0,
      alignedAmChoice: alignedChoice.am.length,
      alignedPmChoice: alignedChoice.pm.length,
      alignedAmSelect: alignedSelect.am.length,
      alignedPmSelect: alignedSelect.pm.length,
      invalidDomainDates: invalidDomain,
      yDomain: { yMin, yMax },
      dataYExtents: { ymin, ymax },
      valuesOutsideYDomain: outOfDomain,
      xSample: xMap,
    })
    // eslint-disable-next-line no-console
    console.groupEnd()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainDates, dataChoice, dataSelect, alignedChoice, alignedSelect, yMin, yMax, xFor])
}
