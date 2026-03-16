import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ReportType } from './ReportTypeSelector'
import { ChartControls, RangeSelector } from './chartSupplyDemand/ChartControls'
import { ChartPlot } from './chartSupplyDemand/ChartPlot'
import { useChartDimensions } from './chartSupplyDemand/useChartDimensions'
import { useSupplyDemandData } from './chartSupplyDemand/useSupplyDemandData'
import { HoverPoint, Range, RANGES } from './chartSupplyDemand/types'

export default function ChartSupplyDemand() {
  const pad = { top: 8, right: 56, bottom: 26, left: 56 }

  const plotRef = useRef<HTMLDivElement | null>(null)
  const plotSize = useChartDimensions(plotRef)

  const [range, setRange] = useState<Range>('3Y')
  const [grade, setGrade] = useState<'choice' | 'select'>('choice')
  const [gradeOpen, setGradeOpen] = useState(false)
  const gradeRef = useRef<HTMLDivElement | null>(null)
  const [reportType, setReportType] = useState<ReportType>('Sub Primals')
  const [showSupply, setShowSupply] = useState(true)
  const [showDemand, setShowDemand] = useState(true)

  const { data, loading, error, domainDates, alignEquivalent, alignHeads } = useSupplyDemandData(range)

  const eq = useMemo(
    () =>
      alignEquivalent(
        grade === 'choice' ? data?.equivalent.choice ?? [] : data?.equivalent.select ?? [],
      ),
    [alignEquivalent, data, grade],
  )

  const heads = useMemo(() => alignHeads(data?.heads ?? []), [alignHeads, data])

  const [yMin, setYMin] = useState<number>(0)
  const [yMax, setYMax] = useState<number>(1)
  const [tickCount, setTickCount] = useState<number>(11)

  const [hover, setHover] = useState<HoverPoint | null>(null)
  const [zoomLevel, setZoomLevel] = useState<number>(0)

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (gradeRef.current && !gradeRef.current.contains(target)) setGradeOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    const values: number[] = []
    if (showSupply) heads.forEach((row) => values.push(row.supply))
    if (showDemand) heads.forEach((row) => values.push(row.demand))
    if (values.length === 0) {
      setYMin(0)
      setYMax(1)
      return
    }
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      min -= 1
      max += 1
    }
    const span = Math.max(1e-6, max - min)
    const padY = Math.max(0.1 * span, 0.25)
    setYMin(Math.max(0, min - padY))
    setYMax(max + padY)
    setTickCount(11)
  }, [heads, showSupply, showDemand])

  const innerH = Math.max(0, plotSize.h - pad.top - pad.bottom)

  useEffect(() => {
    const MIN_SP = 44
    const MIN = 6
    const MAX = 11
    const target = Math.max(MIN, Math.min(MAX, Math.round(innerH / MIN_SP)))
    if (target !== tickCount) setTickCount(target)
  }, [innerH, tickCount])

  useEffect(() => {
    if (!showSupply && !showDemand) setHover(null)
  }, [showSupply, showDemand])

  const xLabelIndices = useMemo(() => {
    const n = domainDates.length
    if (n === 0) return new Set<number>()
    if (n <= 7) return new Set(Array.from({ length: n }, (_, index) => index))
    const idx: number[] = []
    const segments = 6
    for (let i = 0; i <= segments; i++) {
      const x = Math.round((i * (n - 1)) / segments)
      if (idx.length === 0 || idx[idx.length - 1] !== x) idx.push(x)
    }
    return new Set(idx)
  }, [domainDates])

  const yFromClient = (clientY: number) => {
    const rect = plotRef.current?.getBoundingClientRect()
    if (!rect) return (yMin + yMax) / 2
    const y = clientY - rect.top
    const min = Math.min(yMin, yMax)
    const max = Math.max(yMin, yMax)
    const t = 1 - (y - pad.top) / Math.max(1, innerH)
    return min + t * (max - min)
  }

  const zoomY = (anchor: number, factor: number) => {
    const min = Math.min(yMin, yMax)
    const max = Math.max(yMin, yMax)
    const span = Math.max(1e-6, max - min)
    const a = Number.isFinite(anchor) ? anchor : (min + max) / 2
    const newMin = a - (a - min) * factor
    const newMax = a + (max - a) * factor
    if (!Number.isFinite(newMin) || !Number.isFinite(newMax)) return
    if (newMax - newMin < 1e-6) return
    setYMin(Math.max(0, newMin))
    setYMax(newMax)
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const step = event.deltaY > 0 ? 1 : -1
    const nextLevel = Math.max(-2, Math.min(2, zoomLevel + step))
    if (nextLevel === zoomLevel) return
    const anchor = yFromClient(event.clientY)
    const ZOOM_STEP = 0.85
    const factor = step > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
    zoomY(anchor, factor)
    setZoomLevel(nextLevel)
  }

  return (
    <section className="chart-card" aria-label="Supply & Demand">
      <div className="chart-controls-panel">
        <ChartControls
          reportType={reportType}
          onReportTypeChange={(next) => {
            setReportType(next)
            if (next === 'Sub Primals') window.location.hash = '#subprimals'
            else if (next === 'Cattle Price') window.location.hash = '#live'
            else if (next === '5 Day AVG') window.location.hash = '#5day'
            else window.location.hash = '#subprimals'
          }}
          grade={grade}
          onGradeToggle={() => setGradeOpen((value) => !value)}
          onGradeChange={(nextGrade) => {
            setGrade(nextGrade)
            setGradeOpen(false)
          }}
          gradeOpen={gradeOpen}
          gradeRef={gradeRef}
          showSupply={showSupply}
          onToggleSupply={setShowSupply}
          showDemand={showDemand}
          onToggleDemand={setShowDemand}
        />
      </div>

      <ChartPlot
        pad={pad}
        plotRef={plotRef}
        plotSize={plotSize}
        domainDates={domainDates}
        heads={heads}
        eq={eq}
        showSupply={showSupply}
        showDemand={showDemand}
        yMin={yMin}
        yMax={yMax}
        tickCount={tickCount}
        hover={hover}
        onHoverChange={setHover}
        loading={loading}
        error={error}
        onWheel={handleWheel}
        xLabelIndices={xLabelIndices}
      />

      <RangeSelector ranges={RANGES} activeRange={range} onSelect={setRange} />
    </section>
  )
}
