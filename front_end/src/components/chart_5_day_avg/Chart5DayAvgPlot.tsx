import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  clamp,
  clampTranslate,
  formatCurrency,
  formatTemperature,
  getXLabelIndices,
  linearTicks,
  path,
  sX,
  xFor,
  xLabelFmt,
  yFor,
} from './Chart5DayAvgUtils'
import {
  usePlotSize,
  useTickDensity,
  useYDomainAndTicks,
} from './Chart5DayAvgHooks'
import type { Hover, View } from './Chart5DayAvgTypes'
import { EVENT_TYPE_COLORS, type EventType } from '../../constants/eventTypes'
import { buildWeatherSegments, type WeatherBar, type WeatherSegment } from '../../utils/weatherSegments'
import type { WeatherMonthlyTotals } from '../../hooks/useWeatherOccurrences'

type Chart5DayAvgPlotProps = {
  sidebarOpen: boolean
  domainDates: string[]
  alignedSteer: { date: string; value: number | null }[]
  alignedHeifer: { date: string; value: number | null }[]
  alignedTemperature: { date: string; value: number | null }[]
  alignedDiesel: { date: string; value: number | null }[]
  showSteer: boolean
  showHeifer: boolean
  showTemperature: boolean
  showDiesel: boolean
  hasDieselSeries: boolean
  hasTemperatureSeries: boolean
  weatherMonthly: WeatherMonthlyTotals[]
  maxEventCount: number
  loading: boolean
  error: string | null
  dieselLoading: boolean
  dieselError: string | null
  temperatureLoading: boolean
  temperatureError: string | null
  eventFetchEnabled: boolean
  weatherLoading: boolean
  weatherError: string | null
  selectedEventTypes: EventType[]
}

const PAD = { top: 8, right: 56, bottom: 26, left: 56 }

const Chart5DayAvgPlot: React.FC<Chart5DayAvgPlotProps> = ({
  sidebarOpen,
  domainDates,
  alignedSteer,
  alignedHeifer,
  alignedTemperature,
  alignedDiesel,
  showSteer,
  showHeifer,
  showTemperature,
  showDiesel,
  hasDieselSeries,
  hasTemperatureSeries,
  weatherMonthly,
  maxEventCount,
  loading,
  error,
  dieselLoading,
  dieselError,
  temperatureLoading,
  temperatureError,
  eventFetchEnabled,
  weatherLoading,
  weatherError,
  selectedEventTypes,
}) => {
  const plotRef = useRef<HTMLDivElement | null>(null)
  const [plotSize, setPlotSize] = useState({ w: 0, h: 0 })

  usePlotSize(plotRef, setPlotSize)

  useEffect(() => {
    const el = plotRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setPlotSize({ w: rect.width, h: rect.height })
    }
    measure()
    const timer = setTimeout(measure, 240)
    return () => clearTimeout(timer)
  }, [sidebarOpen])

  const innerW = Math.max(0, plotSize.w - PAD.left - PAD.right)
  const innerH = Math.max(0, plotSize.h - PAD.top - PAD.bottom)

  const [yMin, setYMin] = useState(0)
  const [yMax, setYMax] = useState(1)
  const [tickCount, setTickCount] = useState(11)

  useYDomainAndTicks(showSteer, showHeifer, alignedSteer, alignedHeifer, setYMin, setYMax)
  useTickDensity(innerH, tickCount, setTickCount)

  const [view, setView] = useState<View>({ scale: 1, tx: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; tx: number } | null>(null)

  const getXFor = useCallback((i: number) => xFor(i, domainDates, innerW, PAD.left), [domainDates, innerW])
  const getSX = useCallback((x: number) => sX(x, view), [view])
  const getYFor = useCallback((v: number) => yFor(v, yMin, yMax, innerH, PAD.top), [yMin, yMax, innerH])
  const getTempYFor = useCallback(
    (value: number, scale: { min: number; max: number }) => {
      const { min, max } = scale
      const clamped = Math.min(Math.max(value, min), max)
      const t = (clamped - min) / Math.max(1e-6, max - min)
      return PAD.top + (1 - t) * innerH
    },
    [innerH]
  )
  const getClampTranslate = useCallback(
    (tx: number, scale: number) => clampTranslate(tx, scale, plotSize.w, PAD.left, PAD.right),
    [plotSize.w]
  )
  const getPath = useCallback(
    (points: Array<{ value: number | null }>) => path(points, getSX, getXFor, getYFor),
    [getSX, getXFor, getYFor]
  )
  const xLabelIndices = useMemo(() => getXLabelIndices(domainDates), [domainDates])

  const temperatureScale = useMemo(() => {
    const values: number[] = []
    alignedTemperature.forEach((p) => {
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
    const padV = Math.max(1, 0.05 * span)
    return { min: min - padV, max: max + padV }
  }, [alignedTemperature])

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

  const getTempY = useCallback((value: number) => getTempYFor(value, temperatureScale), [getTempYFor, temperatureScale])
  const getDieselY = useCallback((value: number) => getTempYFor(value, dieselScale), [getTempYFor, dieselScale])

  const baselineY = PAD.top + innerH

  const weatherGeometry = useMemo(() => {
    if (!eventFetchEnabled) return { segments: [] as WeatherSegment[], bars: [] as WeatherBar[] }
    return buildWeatherSegments({
      monthlyTotals: weatherMonthly,
      selectedEventTypes,
      domainDates,
      padLeft: PAD.left,
      innerWidth: innerW,
      innerHeight: innerH,
      baselineY,
      maxEventCount,
    })
  }, [eventFetchEnabled, weatherMonthly, selectedEventTypes, domainDates, innerW, innerH, baselineY, maxEventCount])

  const weatherSegments = weatherGeometry.segments
  const weatherBars = weatherGeometry.bars
  const hasWeatherSegments = weatherBars.length > 0

  const dieselAreaPath = useMemo(() => {
    if (!showDiesel) return ''
    const segments: string[] = []
    let current: Array<{ x: number; y: number }> = []
    const flush = () => {
      if (!current.length) return
      const first = current[0]
      const last = current[current.length - 1]
      segments.push(`M ${first.x} ${baselineY}`)
      segments.push(`L ${first.x} ${first.y}`)
      for (let i = 1; i < current.length; i++) segments.push(`L ${current[i].x} ${current[i].y}`)
      segments.push(`L ${last.x} ${baselineY}`)
      segments.push('Z')
      current = []
    }
    for (let i = 0; i < alignedDiesel.length; i++) {
      const p = alignedDiesel[i]
      if (p.value == null) {
        flush()
        continue
      }
      const x = getSX(getXFor(i))
      const y = getDieselY(p.value)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      current.push({ x, y })
    }
    flush()
    return segments.join(' ')
  }, [alignedDiesel, showDiesel, baselineY, getSX, getXFor, getDieselY])

  const temperatureAreaPath = useMemo(() => {
    if (!showTemperature) return ''
    const segments: string[] = []
    let current: Array<{ x: number; y: number }> = []
    const flush = () => {
      if (!current.length) return
      const first = current[0]
      const last = current[current.length - 1]
      segments.push(`M ${first.x} ${baselineY}`)
      segments.push(`L ${first.x} ${first.y}`)
      for (let i = 1; i < current.length; i++) segments.push(`L ${current[i].x} ${current[i].y}`)
      segments.push(`L ${last.x} ${baselineY}`)
      segments.push('Z')
      current = []
    }
    for (let i = 0; i < alignedTemperature.length; i++) {
      const p = alignedTemperature[i]
      if (p.value == null) {
        flush()
        continue
      }
      const x = getSX(getXFor(i))
      const y = getTempY(p.value)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      current.push({ x, y })
    }
    flush()
    return segments.join(' ')
  }, [alignedTemperature, showTemperature, baselineY, getSX, getXFor, getTempY])

  const [hover, setHover] = useState<Hover>(null)

  useEffect(() => {
    if (!showTemperature) {
      setHover((prev) => (prev && prev.series === 'temperature' ? null : prev))
    }
  }, [showTemperature])

  useEffect(() => {
    if (!showDiesel) {
      setHover((prev) => (prev && prev.series === 'diesel' ? null : prev))
    }
  }, [showDiesel])

  useEffect(() => {
    if (!eventFetchEnabled) {
      setHover((prev) => (prev?.series === 'weather' ? null : prev))
    }
  }, [eventFetchEnabled])

  useEffect(() => {
    setHover((prev) => (prev?.series === 'weather' ? null : prev))
  }, [selectedEventTypes])

  useEffect(() => {
    if (!hasWeatherSegments) {
      setHover((prev) => (prev?.series === 'weather' ? null : prev))
    }
  }, [hasWeatherSegments])

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault()
      const rect = plotRef.current?.getBoundingClientRect()
      if (!rect) return
      const px = e.clientX - rect.left
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const newScale = clamp(view.scale * factor, 1, 8)
      const worldX = (px - view.tx) / view.scale
      const newTx = px - worldX * newScale
      const clamped = getClampTranslate(newTx, newScale)
      setView({ scale: newScale, tx: clamped.tx })
    },
    [getClampTranslate, view]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      if (view.scale <= 1) return
      setIsPanning(true)
      panStart.current = { x: e.clientX, tx: view.tx }
    },
    [view]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isPanning) e.preventDefault()
      if (!isPanning || !panStart.current) return
      const dx = e.clientX - panStart.current.x
      const next = getClampTranslate(panStart.current.tx + dx, view.scale)
      setView({ scale: view.scale, tx: next.tx })
    },
    [getClampTranslate, isPanning, view]
  )

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsPanning(false)
    panStart.current = null
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHover(null)
    setIsPanning(false)
    panStart.current = null
  }, [])

  return (
    <div
      className="chart-plot"
      ref={plotRef}
      role="img"
      aria-label="5-Day Average Price chart area"
      style={{ cursor: isPanning ? 'grabbing' : view.scale > 1 ? 'grab' : 'default' }}
      onWheel={handleWheel}
      onDoubleClick={() => setView({ scale: 1, tx: 0 })}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {plotSize.w > 0 && plotSize.h > 0 && (
        <svg className="chart-svg" viewBox={`0 0 ${plotSize.w} ${plotSize.h}`} width={plotSize.w} height={plotSize.h}>
          {(() => {
            const majors = linearTicks(yMin, yMax, tickCount)
            const lines: JSX.Element[] = []
            const step = majors.length >= 2 ? majors[1] - majors[0] : 0
            for (let i = 0; i < majors.length; i++) {
              const y = getYFor(majors[i])
              lines.push(
                <line
                  key={`maj-${i}`}
                  x1={PAD.left}
                  x2={plotSize.w - PAD.right}
                  y1={y}
                  y2={y}
                  className="grid-major"
                />
              )
              if (step > 0 && i < majors.length - 1) {
                for (let k = 1; k < 10; k++) {
                  const v = majors[i] + (k * step) / 10
                  if (v <= yMax && v >= yMin) {
                    const yy = getYFor(v)
                    lines.push(
                      <line
                        key={`min-${i}-${k}`}
                        x1={PAD.left}
                        x2={plotSize.w - PAD.right}
                        y1={yy}
                        y2={yy}
                        className="grid-minor"
                      />
                    )
                  }
                }
              }
            }
            return <g aria-hidden>{lines}</g>
          })()}

          {(() => {
            const majors = linearTicks(yMin, yMax, tickCount)
            return (
              <g aria-hidden>
                {majors.map((v, i) => (
                  <text
                    key={`yl-${i}`}
                    x={PAD.left - 8}
                    y={getYFor(v)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="y-tick"
                  >
                    {formatCurrency(v)}
                  </text>
                ))}
              </g>
            )
          })()}

          {showDiesel && hasDieselSeries && dieselAreaPath && (
            <g className="diesel-layer" aria-label="Diesel series">
              <path d={dieselAreaPath} fill="rgba(32, 122, 72, 0.18)" stroke="none" style={{ pointerEvents: 'none' }} />
              <path
                d={path(alignedDiesel, getSX, getXFor, getDieselY)}
                stroke="#1f7a3a"
                strokeWidth={2}
                fill="none"
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )}

          {showTemperature && hasTemperatureSeries && temperatureAreaPath && (
            <g className="temperature-layer" aria-label="Temperature series">
              <path d={temperatureAreaPath} fill="rgba(255, 160, 0, 0.24)" stroke="none" style={{ pointerEvents: 'none' }} />
              <path
                d={path(alignedTemperature, getSX, getXFor, getTempY)}
                stroke="rgba(255, 140, 0, 0.9)"
                strokeWidth={2}
                fill="none"
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )}

          {hasWeatherSegments && (
            <g className="weather-layer" aria-label="Weather events">
              {weatherSegments.map((segment) => {
                const color = EVENT_TYPE_COLORS[segment.eventType] || '#555555'
                const screenX = getSX(segment.x)
                const screenWidth = Math.max(2, view.scale * segment.width)
                const drawHeight = Math.max(1.5, segment.height)
                const drawY = segment.y - (drawHeight - segment.height)
                return (
                  <rect
                    key={segment.key}
                    x={screenX}
                    y={drawY}
                    width={screenWidth}
                    height={drawHeight}
                    fill={color}
                    fillOpacity={0.7}
                    stroke={color}
                    strokeOpacity={0.9}
                    strokeWidth={0.75}
                    rx={1.5}
                    style={{ pointerEvents: 'none' }}
                  />
                )
              })}
            </g>
          )}

          {hasWeatherSegments && (
            <g className="weather-hitpoints" aria-hidden>
              {weatherBars.map((bar) => {
                const screenX = getSX(bar.x)
                const screenWidth = Math.max(4, view.scale * bar.width)
                const barHeight = Math.max(6, bar.bottom - bar.top)
                const yTop = bar.bottom - barHeight
                return (
                  <rect
                    key={`weather-bar-${bar.monthStart}`}
                    x={screenX}
                    y={yTop}
                    width={screenWidth}
                    height={barHeight}
                    fill="rgba(0,0,0,0)"
                    onMouseEnter={(event) => {
                      const rect = plotRef.current?.getBoundingClientRect()
                      const mouseX = rect ? event.clientX - rect.left : getSX(bar.x + bar.width / 2)
                      const mouseY = rect ? event.clientY - rect.top : Math.max(PAD.top, bar.top)
                      setHover({
                        series: 'weather',
                        monthStart: bar.monthStart,
                        x: bar.x,
                        width: bar.width,
                        top: bar.top,
                        bottom: bar.bottom,
                        breakdown: bar.breakdown,
                        mouseX,
                        mouseY,
                      })
                    }}
                    onMouseMove={(event) => {
                      const rect = plotRef.current?.getBoundingClientRect()
                      const mouseX = rect ? event.clientX - rect.left : getSX(bar.x + bar.width / 2)
                      const mouseY = rect ? event.clientY - rect.top : Math.max(PAD.top, bar.top)
                      setHover({
                        series: 'weather',
                        monthStart: bar.monthStart,
                        x: bar.x,
                        width: bar.width,
                        top: bar.top,
                        bottom: bar.bottom,
                        breakdown: bar.breakdown,
                        mouseX,
                        mouseY,
                      })
                    }}
                    onMouseLeave={() => setHover((prev) => (prev?.series === 'weather' ? null : prev))}
                  />
                )
              })}
            </g>
          )}

          <g aria-label="series">
            {showSteer && (
              <>
                <path d={getPath(alignedSteer)} stroke="#000" strokeWidth={2} fill="none" />
                {alignedSteer.map((p, i) =>
                  p.value != null ? (
                    <circle
                      key={`s-${i}`}
                      cx={getSX(getXFor(i))}
                      cy={getYFor(p.value as number)}
                      r={3.5}
                      fill="#000"
                      onMouseEnter={() =>
                        setHover({ series: 'steer', index: i, value: p.value as number, date: domainDates[i] })
                      }
                      onMouseMove={() =>
                        setHover({ series: 'steer', index: i, value: p.value as number, date: domainDates[i] })
                      }
                    />
                  ) : null
                )}
              </>
            )}

            {showHeifer && (
              <>
                <path d={getPath(alignedHeifer)} stroke="#d62728" strokeWidth={2} fill="none" />
                {alignedHeifer.map((p, i) =>
                  p.value != null ? (
                    <circle
                      key={`h-${i}`}
                      cx={getSX(getXFor(i))}
                      cy={getYFor(p.value as number)}
                      r={3.5}
                      fill="#d62728"
                      onMouseEnter={() =>
                        setHover({ series: 'heifer', index: i, value: p.value as number, date: domainDates[i] })
                      }
                      onMouseMove={() =>
                        setHover({ series: 'heifer', index: i, value: p.value as number, date: domainDates[i] })
                      }
                    />
                  ) : null
                )}
              </>
            )}
          </g>

          {showDiesel && hasDieselSeries && (
            <g className="diesel-hitpoints">
              {alignedDiesel.map((p, i) =>
                p.value != null ? (
                  <circle
                    key={`diesel-${i}`}
                    cx={getSX(getXFor(i))}
                    cy={getDieselY(p.value as number)}
                    r={10}
                    fill="rgba(32, 122, 72, 0.001)"
                    stroke="rgba(32, 122, 72, 0.001)"
                    onMouseEnter={() =>
                      setHover({ series: 'diesel', index: i, value: p.value as number, date: domainDates[i] })
                    }
                    onMouseMove={() =>
                      setHover({ series: 'diesel', index: i, value: p.value as number, date: domainDates[i] })
                    }
                    onMouseLeave={() => setHover((prev) => (prev && prev.series === 'diesel' ? null : prev))}
                  />
                ) : null
              )}
            </g>
          )}

          {showTemperature && hasTemperatureSeries && (
            <g className="temperature-hitpoints">
              {alignedTemperature.map((p, i) =>
                p.value != null ? (
                  <circle
                    key={`temp-${i}`}
                    cx={getSX(getXFor(i))}
                    cy={getTempY(p.value as number)}
                    r={10}
                    fill="rgba(255, 160, 0, 0.001)"
                    stroke="rgba(255, 160, 0, 0.001)"
                    onMouseEnter={() =>
                      setHover({ series: 'temperature', index: i, value: p.value as number, date: domainDates[i] })
                    }
                    onMouseMove={() =>
                      setHover({ series: 'temperature', index: i, value: p.value as number, date: domainDates[i] })
                    }
                    onMouseLeave={() => setHover((prev) => (prev && prev.series === 'temperature' ? null : prev))}
                  />
                ) : null
              )}
            </g>
          )}

          {domainDates.map((d, i) =>
            xLabelIndices.has(i) ? (
              <text key={i} x={getXFor(i)} y={plotSize.h - 8} textAnchor="middle" className="x-tick">
                {xLabelFmt(d)}
              </text>
            ) : null
          )}

          {hover && hover.series !== 'weather' && (
            <g className="crosshair" aria-hidden>
              {(() => {
                const hoverX = getSX(getXFor(hover.index))
                const hoverY =
                  hover.series === 'temperature'
                    ? getTempY(hover.value)
                    : hover.series === 'diesel'
                      ? getDieselY(hover.value)
                      : getYFor(hover.value)
                const strokeColor =
                  hover.series === 'heifer'
                    ? '#d62728'
                    : hover.series === 'temperature'
                      ? 'rgba(255, 140, 0, 0.9)'
                      : hover.series === 'diesel'
                        ? '#1f7a3a'
                        : '#000'
                return (
                  <>
                    <line
                      x1={PAD.left}
                      x2={plotSize.w - PAD.right}
                      y1={hoverY}
                      y2={hoverY}
                      stroke={strokeColor}
                      strokeWidth={1}
                      opacity={0.85}
                      style={{ pointerEvents: 'none' }}
                    />
                    <line
                      x1={hoverX}
                      x2={hoverX}
                      y1={PAD.top}
                      y2={plotSize.h - PAD.bottom}
                      stroke={strokeColor}
                      strokeWidth={1}
                      opacity={0.85}
                      style={{ pointerEvents: 'none' }}
                    />
                    <circle
                      cx={hoverX}
                      cy={hoverY}
                      r={hover.series === 'temperature' || hover.series === 'diesel' ? 4 : 3.5}
                      fill={strokeColor}
                      opacity={0.9}
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
                )
              })()}
            </g>
          )}
        </svg>
      )}

      {hover && (
        <div
          className="chart-tooltip"
          style={{
            left: `${
              hover.series === 'weather'
                ? hover.mouseX
                : getSX(getXFor(hover.index))
            }px`,
            top: `${
              hover.series === 'weather'
                ? Math.max(0, hover.mouseY - 16)
                : hover.series === 'temperature'
                  ? getTempY(hover.value)
                  : hover.series === 'diesel'
                    ? getDieselY(hover.value)
                    : getYFor(hover.value)
            }px`,
          }}
        >
          <div className="chart-tooltip-content">
            {hover.series === 'weather' ? (
              <>
                <div className="chart-tooltip-line">
                  <strong>{xLabelFmt(hover.monthStart)}</strong>
                </div>
                {hover.breakdown
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map(({ eventType, count }) => (
                    <div key={eventType} className="chart-tooltip-line">
                      {eventType}: {count.toLocaleString()}
                    </div>
                  ))}
                <div className="chart-tooltip-value">
                  Total: {hover.breakdown.reduce((sum, item) => sum + item.count, 0).toLocaleString()}
                </div>
              </>
            ) : (
              <>
                <div className="chart-tooltip-line">{xLabelFmt(hover.date)}</div>
                <div className="chart-tooltip-line">
                  {hover.series === 'steer'
                    ? 'Steer'
                    : hover.series === 'heifer'
                      ? 'Heifer'
                      : hover.series === 'diesel'
                        ? 'Diesel'
                        : 'Temperature'}
                </div>
                <div className="chart-tooltip-value">
                  {hover.series === 'temperature'
                    ? formatTemperature(hover.value)
                    : hover.series === 'diesel'
                      ? `${formatCurrency(hover.value)} / gal`
                      : formatCurrency(hover.value)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {loading && <div className="chart-loading">Loading…</div>}
      {error && <div className="chart-error">{error}</div>}
      {showDiesel && dieselLoading && <div className="chart-loading">Loading diesel…</div>}
      {showDiesel && dieselError && <div className="chart-error">{dieselError}</div>}
      {showTemperature && temperatureLoading && <div className="chart-loading">Loading temperature…</div>}
      {showTemperature && temperatureError && <div className="chart-error">{temperatureError}</div>}
      {eventFetchEnabled && weatherLoading && <div className="chart-loading">Loading weather events…</div>}
      {eventFetchEnabled && weatherError && <div className="chart-error">{weatherError}</div>}
      {eventFetchEnabled && !weatherLoading && !weatherError && !hasWeatherSegments && (
        <div className="chart-empty">No weather events for selected filters.</div>
      )}
    </div>
  )
}

export default Chart5DayAvgPlot
