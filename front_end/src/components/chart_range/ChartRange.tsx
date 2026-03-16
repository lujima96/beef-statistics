import React, { useMemo, useRef, useState } from 'react'
import { Range, SeriesPayload } from './ChartRangeTypes'
import { DAYS_BY_RANGE } from './ChartRangeConstants'
import {
  useChartDataFetch,
  useYAutoFit,
  usePlotSize,
  useTickAdaptation,
  useAlignedData,
} from './ChartRangeHooks'
import { useAudit } from './ChartRangeAudit'
import { useDieselSeries } from '../../hooks/useDieselSeries'
import { alignDieselSeries } from '../../utils/fillDieselGaps'
import ChartControls from './ChartControls'
import ChartLegend from './ChartLegend'
import ChartRangeSelector from './ChartRangeSelector'
import ChartPlot from './ChartPlot'
import { ReportType } from '../ReportTypeSelector'

export default function ChartRange(props: { initialRange: Range; showRangeSelector?: boolean }) {
  const [range, setRange] = useState<Range>(props.initialRange)
  const showRangeSelector = props.showRangeSelector ?? true
  const [grade, setGrade] = useState<'choice' | 'select'>('choice')
  const [reportType, setReportType] = useState<ReportType>('Sub Primals')
  const [primal, setPrimal] = useState<
    'Rib' | 'Chuck' | 'Round' | 'Loin' | 'Brisket' | 'Short Plate' | 'Flank'
  >('Rib')
  const [showAm, setShowAm] = useState(true)
  const [showPm, setShowPm] = useState(true)
  const [showDiesel, setShowDiesel] = useState(false)
  const plotRef = useRef<HTMLDivElement | null>(null)

  const [data, setData] = useState<SeriesPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useChartDataFetch(grade, primal, range, setData, setLoading, setError)

  const domainDates = useMemo(() => {
    if (!data) return [] as string[]
    const dates = new Set<string>()
    for (const p of data.am) dates.add(p.date)
    for (const p of data.pm) dates.add(p.date)
    const sorted = Array.from(dates).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const n = DAYS_BY_RANGE[range]
    return sorted.slice(Math.max(0, sorted.length - n))
  }, [data, range])

  const aligned = useAlignedData(data, domainDates)

  const {
    data: dieselSeries,
    loading: dieselLoading,
    error: dieselError,
  } = useDieselSeries(range, showDiesel, domainDates)

  const alignedDiesel = useMemo(
    () => alignDieselSeries(domainDates, dieselSeries ?? []),
    [dieselSeries, domainDates]
  )

  const dieselScale = useMemo(() => {
    const values: number[] = []
    alignedDiesel.forEach((p) => {
      if (p.value != null) values.push(p.value as number)
    })
    if (!values.length) return { min: 0, max: 1 }
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      min -= 0.5
      max += 0.5
    }
    const span = Math.max(1e-6, max - min)
    const padV = Math.max(0.05 * span, 0.05)
    return { min: min - padV, max: max + padV }
  }, [alignedDiesel])

  const [plotSize, setPlotSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [yMin, setYMin] = useState<number>(0)
  const [yMax, setYMax] = useState<number>(1000)
  const [tickCount, setTickCount] = useState<number>(11)
  const [, setZoomLevel] = useState<number>(0)
  const [, setBaseY] = useState<{ min: number; max: number } | null>(null)
  const [view, setView] = useState<{ scale: number; tx: number }>({ scale: 1, tx: 0 })

  usePlotSize(plotRef, setPlotSize)
  useYAutoFit(aligned.am, aligned.pm, showAm, showPm, setYMin, setYMax, setZoomLevel, setBaseY, setView)

  const pad = { top: 8, right: 56, bottom: 26, left: 56 }
  const innerH = Math.max(0, plotSize.h - pad.top - pad.bottom)
  useTickAdaptation(innerH, tickCount, setTickCount)
  const innerW = Math.max(0, plotSize.w - pad.left - pad.right)

  const hasDieselSeries = useMemo(
    () => alignedDiesel.some((p) => p.value != null),
    [alignedDiesel]
  )

  useAudit(
    data,
    domainDates,
    aligned.am,
    aligned.pm,
    yMin,
    yMax,
    range,
    showAm,
    showPm,
    plotSize.w,
    pad.left,
    pad.right,
    pad.top,
    pad.bottom,
    tickCount,
    view.scale,
    view.tx
  )

  const handleReportTypeChange = (next: ReportType) => {
    setReportType(next)
    if (next === 'Sub Primals') window.location.hash = '#subprimals'
    else if (next === 'Cattle Price') window.location.hash = '#live'
    else if (next === '5 Day AVG') window.location.hash = '#5day'
    else window.location.hash = '#subprimals'
  }

  return (
    <section className="chart-card" aria-label="Chart">
      <div className="chart-controls-panel">
        <ChartControls
          grade={grade}
          onGradeChange={setGrade}
          primal={primal}
          onPrimalChange={setPrimal}
          reportType={reportType}
          onReportTypeChange={handleReportTypeChange}
          showAm={showAm}
          onShowAmChange={setShowAm}
          showPm={showPm}
          onShowPmChange={setShowPm}
          showDiesel={showDiesel}
          onShowDieselChange={setShowDiesel}
        />

        <ChartLegend hasDieselSeries={hasDieselSeries} />
      </div>

      <ChartPlot
        plotRef={plotRef}
        plotSize={plotSize}
        pad={pad}
        innerW={innerW}
        innerH={innerH}
        domainDates={domainDates}
        yMin={yMin}
        yMax={yMax}
        tickCount={tickCount}
        showAm={showAm}
        showPm={showPm}
        showDiesel={showDiesel}
        alignedAm={aligned.am}
        alignedPm={aligned.pm}
        alignedDiesel={alignedDiesel}
        dieselScale={dieselScale}
        hasDieselSeries={hasDieselSeries}
        view={view}
        setView={setView}
        loading={loading}
        error={error}
        dieselLoading={dieselLoading}
        dieselError={dieselError}
      />

      {showRangeSelector && (
        <ChartRangeSelector currentRange={range} onSelect={setRange} />
      )}
    </section>
  )
}
