import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PdfViewer from '../PdfViewer'
import Sidebar from '../Sidebar'
import { Range, Point } from './ChartLiveTypes'
import { ranges, DAYS_BY_RANGE, align, interpolate, despike } from './ChartLiveUtils'
import { usePlotSize, useChartDataFetch, useYScaling } from './ChartLiveHooks'
import { useTemperatureSeries } from '../../hooks/useTemperatureSeries'
import { alignTemperatureSeries } from '../../utils/fillTemperatureGaps'
import { useDieselSeries } from '../../hooks/useDieselSeries'
import { alignDieselSeries } from '../../utils/fillDieselGaps'
import { EVENT_TYPES, MAX_EVENT_SELECTIONS, isWeatherEventRange, type EventType } from '../../constants/eventTypes'
import { useWeatherOccurrences } from '../../hooks/useWeatherOccurrences'
import { buildWeatherSegments } from '../../utils/weatherSegments'
import ChartLiveControls from './ChartLiveControls'
import ChartLiveLegend from './ChartLiveLegend'
import ChartLivePlot from './ChartLivePlot'
import { useIsDesktop, useResponsiveSidebarOpen } from '../../hooks/useResponsiveSidebarOpen'

export default function ChartLive() {
  const [range, setRange] = useState<Range>('1Y')

  const plotRef = useRef<HTMLDivElement | null>(null)
  const eventRef = useRef<HTMLDivElement | null>(null)
  const [plotSize, setPlotSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const pad = { top: 8, right: 56, bottom: 26, left: 56 }

  const [steer, setSteer] = useState<Point[] | null>(null)
  const [heifer, setHeifer] = useState<Point[] | null>(null)
  const [showSteer, setShowSteer] = useState(true)
  const [showHeifer, setShowHeifer] = useState(true)
  const [showTemperature, setShowTemperature] = useState(false)
  const [showDiesel, setShowDiesel] = useState(false)
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>([EVENT_TYPES[0]])
  const [eventOpen, setEventOpen] = useState(false)
  const weatherEventsEnabled = isWeatherEventRange(range)
  const eventFetchEnabled = weatherEventsEnabled && selectedEventTypes.length > 0
  const weatherEventsTooltip = 'Weather events are only available for the 1Y and 3Y views.'
  const [showWeatherTooltip, setShowWeatherTooltip] = useState(false)
  const [weatherTooltipPos, setWeatherTooltipPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfOpen, setPdfOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('pdf_open') === '1' } catch { return false }
  })
  const isDesktop = useIsDesktop()

  useEffect(() => {
    try { localStorage.setItem('pdf_open', pdfOpen ? '1' : '0') } catch { }
  }, [pdfOpen])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (eventRef.current && !eventRef.current.contains(target)) setEventOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (!weatherEventsEnabled) setEventOpen(false)
    if (weatherEventsEnabled) setShowWeatherTooltip(false)
  }, [weatherEventsEnabled])

  const showWeatherEventsTooltip = useCallback(() => {
    if (weatherEventsEnabled || !eventRef.current) return
    const rect = eventRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width
    const margin = 8
    const available = Math.max(viewportWidth - margin * 2, 0)
    const halfTooltip = Math.min(140, available / 2)
    const center = rect.left + rect.width / 2
    const minCenter = margin + halfTooltip
    const maxCenter = viewportWidth - margin - halfTooltip
    const clampedCenter = minCenter > maxCenter
      ? center
      : Math.min(Math.max(center, minCenter), maxCenter)
    setWeatherTooltipPos({ left: clampedCenter, top: rect.bottom + 8 })
    setShowWeatherTooltip(true)
  }, [weatherEventsEnabled])

  const hideWeatherEventsTooltip = useCallback(() => {
    setShowWeatherTooltip(false)
  }, [])

  const toggleEventType = (type: EventType) => {
    setSelectedEventTypes((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type)
      if (prev.length >= MAX_EVENT_SELECTIONS) return prev
      return [...prev, type]
    })
  }

  const eventButtonLabel =
    selectedEventTypes.length === 0
      ? 'Select Weather Events'
      : selectedEventTypes.length === 1
        ? selectedEventTypes[0]
        : `${selectedEventTypes.length} Selected`

  usePlotSize(plotRef, setPlotSize)
  useChartDataFetch(range, setSteer, setHeifer, setLoading, setError)

  const domainDates = useMemo(() => {
    const s = new Set<string>()
    ;(steer ?? []).forEach(p => s.add(p.date))
    ;(heifer ?? []).forEach(p => s.add(p.date))
    const sorted = Array.from(s).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    if (sorted.length === 0) return []
    const latest = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`)
    if (!Number.isFinite(latest.getTime())) return sorted
    const cutoff = new Date(latest)
    cutoff.setUTCDate(cutoff.getUTCDate() - (DAYS_BY_RANGE[range] - 1))
    return sorted.filter((value) => {
      const dt = new Date(`${value}T00:00:00Z`)
      return Number.isFinite(dt.getTime()) && dt >= cutoff
    })
  }, [steer, heifer, range])

  const {
    data: weatherMonthly,
    loading: weatherLoading,
    error: weatherError,
    maxEventCount,
  } = useWeatherOccurrences(range, selectedEventTypes, eventFetchEnabled)

  const {
    data: temperatureSeries,
    loading: temperatureLoading,
    error: temperatureError,
  } = useTemperatureSeries(range, showTemperature, domainDates)

  const {
    data: dieselSeries,
    loading: dieselLoading,
    error: dieselError,
  } = useDieselSeries(range, showDiesel, domainDates)

  const aligned = useMemo(() => {
    const toPerLb = (arr: { date: string; value: number | null }[]) => arr.map(p => ({ ...p, value: p.value == null ? null : (p.value as number) / 100 }))
    const clean = (arr: { date: string; value: number | null }[]) => arr.map(p => ({ ...p, value: (p.value != null && p.value > 0 && p.value <= 5) ? p.value : null }))
    const s0 = steer ? align(steer, domainDates) : []
    const h0 = heifer ? align(heifer, domainDates) : []
    const s1 = clean(toPerLb(s0))
    const h1 = clean(toPerLb(h0))
    const s2 = despike(s1)
    const h2 = despike(h1)
    return { steer: interpolate(s2), heifer: interpolate(h2) }
  }, [steer, heifer, domainDates])

  const [yMin, setYMin] = useState(0)
  const [yMax, setYMax] = useState(1)

  useYScaling(showSteer, showHeifer, aligned.steer, aligned.heifer, setYMin, setYMax)

  const innerW = Math.max(0, plotSize.w - pad.left - pad.right)
  const innerH = Math.max(0, plotSize.h - pad.top - pad.bottom)
  const baselineY = pad.top + innerH

  const alignedTemperature = useMemo(
    () => alignTemperatureSeries(domainDates, temperatureSeries ?? []),
    [temperatureSeries, domainDates],
  )

  const alignedDiesel = useMemo(
    () => alignDieselSeries(domainDates, dieselSeries ?? []),
    [dieselSeries, domainDates],
  )

  const hasTemperatureSeries = useMemo(
    () => alignedTemperature.some((p) => p.value != null),
    [alignedTemperature],
  )

  const hasDieselSeries = useMemo(
    () => alignedDiesel.some((p) => p.value != null),
    [alignedDiesel],
  )

  const weatherGeometry = useMemo(() => {
    if (!eventFetchEnabled) {
      return { segments: [], bars: [] }
    }
    return buildWeatherSegments({
      monthlyTotals: weatherMonthly,
      selectedEventTypes,
      domainDates,
      padLeft: pad.left,
      innerWidth: innerW,
      innerHeight: innerH,
      baselineY,
      maxEventCount,
    })
  }, [
    baselineY,
    domainDates,
    eventFetchEnabled,
    innerH,
    innerW,
    maxEventCount,
    pad.left,
    selectedEventTypes,
    weatherMonthly,
  ])

  const weatherSegments = weatherGeometry.segments
  const weatherBars = weatherGeometry.bars
  const hasWeatherSegments = weatherBars.length > 0

  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebarOpen()

  useEffect(() => {
    const el = plotRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      setPlotSize({ w: r.width, h: r.height })
      const timer = setTimeout(() => {
        const r2 = el.getBoundingClientRect()
        setPlotSize({ w: r2.width, h: r2.height })
      }, 240)
      return () => clearTimeout(timer)
    }
  }, [sidebarOpen])

  if (!isDesktop && pdfOpen) {
    return <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
  }

  return (
    <div className={`pdf-layout chart-with-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
      <Sidebar
        mode="graphs"
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onOpenViewer={() => setPdfOpen(true)}
      />
      <main className="pdf-content">
        <section className="chart-card" aria-label="Cattle Price">
          <div className="chart-controls-panel">
            <ChartLiveControls
              showTemperature={showTemperature}
              onToggleTemperature={(value) => setShowTemperature(value)}
              showDiesel={showDiesel}
              onToggleDiesel={(value) => setShowDiesel(value)}
              showSteer={showSteer}
              onToggleSteer={(value) => setShowSteer(value)}
              showHeifer={showHeifer}
              onToggleHeifer={(value) => setShowHeifer(value)}
              weatherEventsEnabled={weatherEventsEnabled}
              eventOpen={eventOpen}
              onToggleEventOpen={() => setEventOpen((v) => !v)}
              selectedEventTypes={selectedEventTypes}
              onToggleEventType={toggleEventType}
              eventButtonLabel={eventButtonLabel}
              eventRef={eventRef}
              showWeatherTooltip={showWeatherTooltip}
              weatherTooltipPos={weatherTooltipPos}
              weatherEventsTooltip={weatherEventsTooltip}
              showWeatherEventsTooltip={showWeatherEventsTooltip}
              hideWeatherEventsTooltip={hideWeatherEventsTooltip}
            />

            <ChartLiveLegend
              hasDieselSeries={hasDieselSeries}
              hasTemperatureSeries={hasTemperatureSeries}
              weatherEventsEnabled={weatherEventsEnabled}
              selectedEventTypes={selectedEventTypes}
            />
          </div>

          <ChartLivePlot
            pad={pad}
            plotRef={plotRef}
            plotSize={plotSize}
            innerW={innerW}
            innerH={innerH}
            baselineY={baselineY}
            domainDates={domainDates}
            aligned={aligned}
            alignedTemperature={alignedTemperature}
            alignedDiesel={alignedDiesel}
            showSteer={showSteer}
            showHeifer={showHeifer}
            showTemperature={showTemperature}
            showDiesel={showDiesel}
            yMin={yMin}
            yMax={yMax}
            hasTemperatureSeries={hasTemperatureSeries}
            hasDieselSeries={hasDieselSeries}
            weatherSegments={weatherSegments}
            weatherBars={weatherBars}
            hasWeatherSegments={hasWeatherSegments}
            selectedEventTypes={selectedEventTypes}
            eventFetchEnabled={eventFetchEnabled}
            loading={loading}
            error={error}
            dieselLoading={dieselLoading}
            dieselError={dieselError}
            temperatureLoading={temperatureLoading}
            temperatureError={temperatureError}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
          />

          <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />

          <div className="chart-ranges" role="group" aria-label="Range Selector">
            {ranges.map((label) => (
              <button
                key={label}
                type="button"
                className={`range-btn ${range === label ? 'is-active' : ''}`}
                aria-pressed={range === label}
                onClick={() => setRange(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
