import React, { useEffect, useMemo, useRef, useState } from 'react'

import { formatCurrency, formatDateLabel, formatTemperature } from './format'
import type { AlignedSeries, Range } from './types'
import type {
  DieselResult,
  TemperatureResult,
  WeatherResult,
} from './useChartSubprimalsData'
import PlotCanvas, { type PlotHover, type WeatherHover } from './PlotCanvas'
import { buildWeatherSegments } from '../../utils/weatherSegments'
import type { EventType } from '../../constants/eventTypes'

const PAD = { top: 8, right: 56, bottom: 26, left: 56 }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

type Props = {
  domainDates: string[]
  aligned: AlignedSeries
  showAm: boolean
  showPm: boolean
  showTemperature: boolean
  showDiesel: boolean
  temperature: TemperatureResult
  diesel: DieselResult
  weather: WeatherResult
  eventFetchEnabled: boolean
  selectedEventTypes: EventType[]
  sidebarOpen: boolean
  range: Range
  loading: boolean
  error: string | null
}

export default function ChartSubprimalsPlot({
  domainDates,
  aligned,
  showAm,
  showPm,
  showTemperature,
  showDiesel,
  temperature,
  diesel,
  weather,
  eventFetchEnabled,
  selectedEventTypes,
  sidebarOpen,
  range,
  loading,
  error,
}: Props) {
  const plotRef = useRef<HTMLDivElement | null>(null)
  const [plotSize, setPlotSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ scale: 1, tx: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; tx: number } | null>(null)
  const [hover, setHover] = useState<PlotHover | null>(null)

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
  }, [])

  useEffect(() => {
    const el = plotRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPlotSize({ w: rect.width, h: rect.height })
    const timer = window.setTimeout(() => {
      const r = el.getBoundingClientRect()
      setPlotSize({ w: r.width, h: r.height })
    }, 240)
    return () => window.clearTimeout(timer)
  }, [sidebarOpen])

  const innerW = Math.max(0, plotSize.w - PAD.left - PAD.right)
  const innerH = Math.max(0, plotSize.h - PAD.top - PAD.bottom)
  const baselineY = PAD.top + innerH

  const [tickCount, setTickCount] = useState(11)
  useEffect(() => {
    if (innerH <= 0) return
    const MIN_SPACING = 44
    const MIN = 6
    const MAX = 11
    const target = Math.max(MIN, Math.min(MAX, Math.round(innerH / MIN_SPACING)))
    if (target !== tickCount) setTickCount(target)
  }, [innerH, tickCount])

  const [yMin, setYMin] = useState(0)
  const [yMax, setYMax] = useState(1000)
  useEffect(() => {
    const values: number[] = []
    aligned.am.forEach((p) => { if (p.value != null) values.push(p.value as number) })
    aligned.pm.forEach((p) => { if (p.value != null) values.push(p.value as number) })
    if (values.length === 0) {
      setYMin(0)
      setYMax(1)
      return
    }
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) { min -= 0.5; max += 0.5 }
    const span = Math.max(1e-6, max - min)
    const padding = Math.max(0.1 * span, 0.25)
    setYMin(min - padding)
    setYMax(max + padding)
    setView({ scale: 1, tx: 0 })
  }, [aligned.am, aligned.pm, range])

  const xFor = (index: number) => {
    const n = domainDates.length
    if (n <= 1) return PAD.left + innerW / 2
    return PAD.left + (index * innerW) / (n - 1)
  }

  const yFor = (value: number) => {
    const min = Math.min(yMin, yMax)
    const max = Math.max(yMin, yMax)
    const clamped = Math.min(Math.max(value, min), max)
    const t = (clamped - min) / Math.max(1e-6, max - min)
    return PAD.top + (1 - t) * innerH
  }

  const sX = (x: number) => view.tx + view.scale * x
  const sY = (y: number) => y

  const clampTranslate = (tx: number, scale: number) => {
    const width = plotSize.w
    const left = PAD.left
    const right = width - PAD.right
    const minTx = Math.min((1 - scale) * right, (1 - scale) * left)
    const maxTx = Math.max((1 - scale) * right, (1 - scale) * left)
    return { tx: clamp(tx, minTx, maxTx) }
  }

  useEffect(() => {
    if (!showTemperature) {
      setHover((prev) => (prev?.series === 'temperature' ? null : prev))
    }
  }, [showTemperature])

  useEffect(() => {
    if (!showDiesel) {
      setHover((prev) => (prev?.series === 'diesel' ? null : prev))
    }
  }, [showDiesel])

  useEffect(() => {
    if (!eventFetchEnabled) {
      setHover((prev) => (prev?.series === 'weather' ? null : prev))
    }
  }, [eventFetchEnabled])

  const dieselScale = useMemo(() => {
    const values: number[] = []
    diesel.aligned.forEach((p) => { if (p.value != null) values.push(p.value as number) })
    if (!values.length) return { min: 0, max: 1 }
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) { min -= 0.5; max += 0.5 }
    const span = Math.max(1e-6, max - min)
    const padding = Math.max(0.05 * span, 0.05)
    return { min: min - padding, max: max + padding }
  }, [diesel.aligned])

  const dieselYFor = (value: number) => {
    const { min, max } = dieselScale
    const clampedValue = Math.min(Math.max(value, min), max)
    const t = (clampedValue - min) / Math.max(1e-6, max - min)
    return PAD.top + (1 - t) * innerH
  }

  const temperatureScale = useMemo(() => {
    const values: number[] = []
    temperature.aligned.forEach((p) => { if (p.value != null) values.push(p.value as number) })
    if (!values.length) return { min: 0, max: 1 }
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) { min -= 0.5; max += 0.5 }
    const span = Math.max(1e-6, max - min)
    const padding = Math.max(1, 0.05 * span)
    return { min: min - padding, max: max + padding }
  }, [temperature.aligned])

  const tempYFor = (value: number) => {
    const { min, max } = temperatureScale
    const clampedValue = Math.min(Math.max(value, min), max)
    const t = (clampedValue - min) / Math.max(1e-6, max - min)
    return PAD.top + (1 - t) * innerH
  }

  const weatherGeometry = useMemo(() => {
    if (!eventFetchEnabled) return { segments: [], bars: [] }
    return buildWeatherSegments({
      monthlyTotals: weather.data,
      selectedEventTypes,
      domainDates,
      padLeft: PAD.left,
      innerWidth: innerW,
      innerHeight: innerH,
      baselineY,
      maxEventCount: weather.maxEventCount,
    })
  }, [
    baselineY,
    domainDates,
    eventFetchEnabled,
    innerH,
    innerW,
    selectedEventTypes,
    weather.data,
    weather.maxEventCount,
  ])

  const hasWeatherSegments = weatherGeometry.bars.length > 0

  useEffect(() => {
    if (!hasWeatherSegments) {
      setHover((prev) => (prev?.series === 'weather' ? null : prev))
    }
  }, [hasWeatherSegments])

  useEffect(() => {
    setHover((prev) => (prev?.series === 'weather' ? null : prev))
  }, [selectedEventTypes])

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault()
    const rect = plotRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = event.clientX - rect.left
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    const newScale = clamp(view.scale * factor, 1, 8)
    const worldX = (px - view.tx) / view.scale
    let newTx = px - worldX * newScale
    const clampedTx = clampTranslate(newTx, newScale)
    setView({ scale: newScale, tx: clampedTx.tx })
  }

  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault()
    if (view.scale <= 1) return
    setIsPanning(true)
    panStart.current = { x: event.clientX, tx: view.tx }
  }

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!isPanning || !panStart.current) return
    event.preventDefault()
    const dx = event.clientX - panStart.current.x
    const next = clampTranslate(panStart.current.tx + dx, view.scale)
    setView({ scale: view.scale, tx: next.tx })
  }

  const handleMouseUp: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault()
    setIsPanning(false)
    panStart.current = null
  }

  const tooltipStyle = useMemo(() => {
    if (!hover) return null
    if (hover.series === 'weather') {
      const { mouseX, mouseY } = hover as WeatherHover
      return {
        left: `${mouseX}px`,
        top: `${Math.max(0, mouseY - 16)}px`,
      }
    }
    return {
      left: `${sX(xFor(hover.index))}px`,
      top: `${sY(
        hover.series === 'temperature'
          ? tempYFor(hover.value)
          : hover.series === 'diesel'
            ? dieselYFor(hover.value)
            : yFor(hover.value)
      )}px`,
    }
  }, [hover, dieselYFor, tempYFor, xFor, yFor, sX, sY])

  const tooltipContent = useMemo(() => {
    if (!hover) return null
    if (hover.series === 'weather') {
      const weatherHover = hover as WeatherHover
      const sorted = weatherHover.breakdown.slice().sort((a, b) => b.count - a.count)
      const total = sorted.reduce((sum, item) => sum + item.count, 0)
      return (
        <>
          <div className="chart-tooltip-line">
            <strong>{formatDateLabel(weatherHover.monthStart)}</strong>
          </div>
          {sorted.map(({ eventType, count }) => (
            <div key={eventType} className="chart-tooltip-line">
              {eventType}: {count.toLocaleString()}
            </div>
          ))}
          <div className="chart-tooltip-value">Total: {total.toLocaleString()}</div>
        </>
      )
    }
    return (
      <>
        <div className="chart-tooltip-line">
          <strong>
            {hover.series === 'temperature'
              ? 'Temperature'
              : hover.series === 'diesel'
                ? 'Diesel'
                : hover.series.toUpperCase()}
          </strong>{' '}
          • {formatDateLabel(hover.date)}
        </div>
        <div className="chart-tooltip-value">
          {hover.series === 'temperature'
            ? formatTemperature(hover.value)
            : hover.series === 'diesel'
              ? `${formatCurrency(hover.value)} / gal`
              : formatCurrency(hover.value)}
        </div>
      </>
    )
  }, [hover])

  const handleHoverChange = (next: PlotHover | null) => {
    if (next?.series === 'weather' && !eventFetchEnabled) {
      setHover(null)
      return
    }
    setHover(next)
  }

  return (
    <div
      className="chart-plot"
      ref={plotRef}
      role="img"
      aria-label="Price chart area"
      style={{ cursor: isPanning ? 'grabbing' : view.scale > 1 ? 'grab' : 'default' }}
      onWheel={handleWheel}
      onDoubleClick={() => setView({ scale: 1, tx: 0 })}
      onMouseLeave={() => { setHover(null); setIsPanning(false); panStart.current = null }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {plotSize.w > 0 && plotSize.h > 0 && (
        <PlotCanvas
          plotSize={plotSize}
          pad={PAD}
          view={view}
          domainDates={domainDates}
          aligned={aligned}
          showAm={showAm}
          showPm={showPm}
          showTemperature={showTemperature}
          showDiesel={showDiesel}
          temperature={temperature}
          diesel={diesel}
          yMin={yMin}
          yMax={yMax}
          tickCount={tickCount}
          baselineY={baselineY}
          xFor={xFor}
          yFor={yFor}
          dieselYFor={dieselYFor}
          tempYFor={tempYFor}
          sX={sX}
          sY={sY}
          weatherSegments={weatherGeometry.segments}
          weatherBars={weatherGeometry.bars}
          hover={hover}
          onHoverChange={handleHoverChange}
        />
      )}

      {hover && tooltipStyle && tooltipContent && (
        <div
          className="chart-tooltip"
          style={hover.series === 'weather'
            ? { ...tooltipStyle, transform: 'translateX(-50%)' }
            : tooltipStyle}
        >
          <div className="chart-tooltip-content">{tooltipContent}</div>
        </div>
      )}

      {loading && <div className="chart-loading">Loading…</div>}
      {error && <div className="chart-error">{error}</div>}
      {showDiesel && diesel.loading && <div className="chart-loading">Loading diesel…</div>}
      {showDiesel && diesel.error && <div className="chart-error">{diesel.error}</div>}
      {showTemperature && temperature.loading && <div className="chart-loading">Loading temperature…</div>}
      {showTemperature && temperature.error && <div className="chart-error">{temperature.error}</div>}
      {eventFetchEnabled && weather.loading && <div className="chart-loading">Loading weather events…</div>}
      {eventFetchEnabled && weather.error && <div className="chart-error">{weather.error}</div>}
      {eventFetchEnabled && !weather.loading && !weather.error && !hasWeatherSegments && (
        <div className="chart-empty">No weather events for selected filters.</div>
      )}
    </div>
  )
}
