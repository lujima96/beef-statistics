import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PdfViewer from '../PdfViewer'
import Sidebar from '../Sidebar'
import Chart5DayAvgControls from './Chart5DayAvgControls'
import Chart5DayAvgLegend from './Chart5DayAvgLegend'
import Chart5DayAvgPlot from './Chart5DayAvgPlot'
import Chart5DayAvgRanges from './Chart5DayAvgRanges'
import type { Point, Range } from './Chart5DayAvgTypes'
import { align, despike, interpolateInterior } from './Chart5DayAvgUtils'
import { useChartDataFetch } from './Chart5DayAvgHooks'
import { useTemperatureSeries } from '../../hooks/useTemperatureSeries'
import { alignTemperatureSeries } from '../../utils/fillTemperatureGaps'
import { useDieselSeries } from '../../hooks/useDieselSeries'
import { alignDieselSeries } from '../../utils/fillDieselGaps'
import { useIsDesktop, useResponsiveSidebarOpen } from '../../hooks/useResponsiveSidebarOpen'
import {
  EVENT_TYPES,
  MAX_EVENT_SELECTIONS,
  isWeatherEventRange,
  type EventType,
} from '../../constants/eventTypes'
import { useWeatherOccurrences } from '../../hooks/useWeatherOccurrences'
import { DAYS_BY_RANGE } from './Chart5DayAvgUtils'

export default function Chart5DayAvg() {
  const [range, setRange] = useState<Range>('1M')
  const [pdfOpen, setPdfOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pdf_open') === '1'
    } catch {
      return false
    }
  })
  const isDesktop = useIsDesktop()
  useEffect(() => {
    try {
      localStorage.setItem('pdf_open', pdfOpen ? '1' : '0')
    } catch {
      // ignore persistence errors
    }
  }, [pdfOpen])

  const eventRef = useRef<HTMLDivElement | null>(null)
  const [showWeatherTooltip, setShowWeatherTooltip] = useState(false)
  const [weatherTooltipPos, setWeatherTooltipPos] = useState({ left: 0, top: 0 })

  const [steer, setSteer] = useState<Point[] | null>(null)
  const [heifer, setHeifer] = useState<Point[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showSteer, setShowSteer] = useState(true)
  const [showHeifer, setShowHeifer] = useState(true)
  const [showTemperature, setShowTemperature] = useState(false)
  const [showDiesel, setShowDiesel] = useState(false)

  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>([EVENT_TYPES[0]])
  const [eventOpen, setEventOpen] = useState(false)
  const weatherEventsEnabled = isWeatherEventRange(range)
  const eventFetchEnabled = weatherEventsEnabled && selectedEventTypes.length > 0
  const weatherEventsTooltip = 'Weather events are only available for the 1Y and 3Y views.'

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
    const clampedCenter = minCenter > maxCenter ? center : Math.min(Math.max(center, minCenter), maxCenter)
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

  useChartDataFetch(range, setSteer, setHeifer, setLoading, setError)

  const domainDates = useMemo(() => {
    const s = new Set<string>()
    ;(steer ?? []).forEach((p) => s.add(p.date))
    ;(heifer ?? []).forEach((p) => s.add(p.date))
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
    const st0 = steer ? align(steer, domainDates) : []
    const hf0 = heifer ? align(heifer, domainDates) : []
    const toPerLb = (arr: { date: string; value: number | null }[]) =>
      arr.map((p) => ({ ...p, value: p.value == null ? null : (p.value as number) / 100 }))
    const clean = (arr: { date: string; value: number | null }[]) =>
      arr.map((p) => ({ ...p, value: p.value != null && p.value > 0 && p.value <= 5 ? p.value : null }))
    const st1 = toPerLb(st0)
    const hf1 = toPerLb(hf0)
    const st2 = despike(clean(st1))
    const hf2 = despike(clean(hf1))
    return { steer: interpolateInterior(st2), heifer: interpolateInterior(hf2) }
  }, [steer, heifer, domainDates])

  const alignedTemperature = useMemo(
    () => alignTemperatureSeries(domainDates, temperatureSeries ?? []),
    [temperatureSeries, domainDates]
  )

  const alignedDiesel = useMemo(
    () => alignDieselSeries(domainDates, dieselSeries ?? []),
    [dieselSeries, domainDates]
  )

  const hasDieselSeries = useMemo(
    () => alignedDiesel.some((p) => p.value != null),
    [alignedDiesel]
  )

  const hasTemperatureSeries = useMemo(
    () => alignedTemperature.some((p) => p.value != null),
    [alignedTemperature]
  )

  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebarOpen()

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
        <section className="chart-card" aria-label="5 Day AVG">
          <div className="chart-controls-panel">
            <Chart5DayAvgControls
              showTemperature={showTemperature}
              onToggleTemperature={setShowTemperature}
              showDiesel={showDiesel}
              onToggleDiesel={setShowDiesel}
              showSteer={showSteer}
              onToggleSteer={setShowSteer}
              showHeifer={showHeifer}
              onToggleHeifer={setShowHeifer}
              weatherEventsEnabled={weatherEventsEnabled}
              eventRef={eventRef}
              eventOpen={eventOpen}
              onToggleEventDropdown={() => setEventOpen((v) => !v)}
              eventButtonLabel={eventButtonLabel}
              selectedEventTypes={selectedEventTypes}
              onToggleEventType={toggleEventType}
              showWeatherTooltip={showWeatherTooltip}
              weatherTooltipPos={weatherTooltipPos}
              weatherEventsTooltip={weatherEventsTooltip}
              onShowWeatherTooltip={showWeatherEventsTooltip}
              onHideWeatherTooltip={hideWeatherEventsTooltip}
            />

            <Chart5DayAvgLegend
              hasDieselSeries={hasDieselSeries}
              hasTemperatureSeries={hasTemperatureSeries}
              weatherEventsEnabled={weatherEventsEnabled}
              selectedEventTypes={selectedEventTypes}
            />
          </div>

          <Chart5DayAvgPlot
            sidebarOpen={sidebarOpen}
            domainDates={domainDates}
            alignedSteer={aligned.steer}
            alignedHeifer={aligned.heifer}
            alignedTemperature={alignedTemperature}
            alignedDiesel={alignedDiesel}
            showSteer={showSteer}
            showHeifer={showHeifer}
            showTemperature={showTemperature}
            showDiesel={showDiesel}
            hasDieselSeries={hasDieselSeries}
            hasTemperatureSeries={hasTemperatureSeries}
            weatherMonthly={weatherMonthly ?? []}
            maxEventCount={maxEventCount}
            loading={loading}
            error={error}
            dieselLoading={dieselLoading}
            dieselError={dieselError}
            temperatureLoading={temperatureLoading}
            temperatureError={temperatureError}
            eventFetchEnabled={eventFetchEnabled}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
            selectedEventTypes={selectedEventTypes}
          />

          <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />

          <Chart5DayAvgRanges range={range} onSelectRange={setRange} />
        </section>
      </main>
    </div>
  )
}
