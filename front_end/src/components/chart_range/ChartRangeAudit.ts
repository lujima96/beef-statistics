import React, { useEffect } from 'react'
import { SeriesPayload } from './ChartRangeTypes'
import { linearTicks, formatCurrency, xFor, yFor, sX, pathFor, xLabelFmt, getXLabelIndices, niceTicks } from './ChartRangeUtils'

export function useAudit(
  data: SeriesPayload | null,
  domainDates: string[],
  alignedAm: { date: string; value: number | null }[],
  alignedPm: { date: string; value: number | null }[],
  yMin: number,
  yMax: number,
  range: string,
  showAm: boolean,
  showPm: boolean,
  plotSizeW: number,
  padLeft: number,
  padRight: number,
  padTop: number,
  padBottom: number,
  tickCount: number,
  viewScale: number,
  viewTx: number
) {
  useEffect(() => {
    const DEV = (import.meta as any).env?.DEV ?? true
    if (!DEV) return
    if (!data) return
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
    const rawZeros = {
      am: data.am.filter(p => p.value === 0).length,
      pm: data.pm.filter(p => p.value === 0).length,
    }
    const alignedNulls = {
      am: alignedAm.filter(p => p.value == null).length,
      pm: alignedPm.filter(p => p.value == null).length,
    }
    const vals: number[] = []
    if (showAm) alignedAm.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    if (showPm) alignedPm.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    const ymin = vals.length ? Math.min(...vals) : null
    const ymax = vals.length ? Math.max(...vals) : null
    const outOfDomain = vals.filter(v => v < yMin || v > yMax).length
    const n = domainDates.length
    const sampleIdx = Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1].filter(i => i >= 0)))
    const innerW = Math.max(0, plotSizeW - padLeft - padRight)
    const xMap = sampleIdx.map(i => ({ i, d: domainDates[i], x: Math.round(sX(xFor(i, domainDates, innerW, padLeft), viewScale, viewTx)) }))
    const majors = linearTicks(yMin, yMax, tickCount)
    const innerH = Math.max(0, plotSizeW - padTop - padBottom)
    const yOf = (v: number) => Math.round(yFor(v, yMin, yMax, innerH, padTop))
    const yCheck = {
      y_4_20: yOf(4.20), y_4_11: yOf(4.11), y_4_00: yOf(4.00), y_3_80: yOf(3.80)
    }
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[ChartRange audit] ${range} domain/y check`)
    // eslint-disable-next-line no-console
    console.log({
      range,
      domainCount: domainDates.length,
      start: domainDates[0],
      end: domainDates[domainDates.length - 1],
      duplicateNeighbors: dupeCount,
      gapDaysTotal,
      amCount: data.am.length,
      pmCount: data.pm.length,
      alignedAm: alignedAm.length,
      alignedPm: alignedPm.length,
      invalidDomainDates: invalidDomain,
      alignedNulls,
      rawZeros,
      yDomain: { yMin, yMax },
      dataYExtents: { ymin, ymax },
      valuesOutsideYDomain: outOfDomain,
      xSample: xMap,
      majorTicks: majors,
      yCheck,
    })
    // eslint-disable-next-line no-console
    console.groupEnd()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, domainDates, alignedAm, alignedPm, yMin, yMax, range, showAm, showPm, plotSizeW, padLeft, padRight, padTop, padBottom, tickCount, viewScale, viewTx])
}
