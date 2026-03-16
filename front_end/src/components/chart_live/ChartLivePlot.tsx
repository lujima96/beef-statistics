import React, { useEffect, useMemo, useRef, useState } from 'react'
import { EVENT_TYPE_COLORS, type EventType } from '../../constants/eventTypes'
import { type WeatherBar, type WeatherSegment } from '../../utils/weatherSegments'
import ChartLiveTooltip from './ChartLiveTooltip'
import {
  clamp,
  clampTranslate,
  formatCurrency,
  getXLabelIndices,
  linearTicks,
  path,
  sX,
  xFor,
  xLabelFmt,
  yFor,
} from './ChartLiveUtils'
import { type Hover, type View } from './ChartLiveTypes'

type ChartLivePlotProps = {
  pad: { top: number; right: number; bottom: number; left: number }
  plotRef: React.RefObject<HTMLDivElement>
  plotSize: { w: number; h: number }
  innerW: number
  innerH: number
  baselineY: number
  domainDates: string[]
  aligned: { steer: Array<{ value: number | null }>; heifer: Array<{ value: number | null }> }
  alignedTemperature: Array<{ value: number | null }>
  alignedDiesel: Array<{ value: number | null }>
  showSteer: boolean
  showHeifer: boolean
  showTemperature: boolean
  showDiesel: boolean
  yMin: number
  yMax: number
  hasTemperatureSeries: boolean
  hasDieselSeries: boolean
  weatherSegments: WeatherSegment[]
  weatherBars: WeatherBar[]
  hasWeatherSegments: boolean
  selectedEventTypes: EventType[]
  eventFetchEnabled: boolean
  loading: boolean
  error: string | null
  dieselLoading: boolean
  dieselError: string | null
  temperatureLoading: boolean
  temperatureError: string | null
  weatherLoading: boolean
  weatherError: string | null
}

export default function ChartLivePlot({
  pad,
  plotRef,
  plotSize,
  innerW,
  innerH,
  baselineY,
  domainDates,
  aligned,
  alignedTemperature,
  alignedDiesel,
  showSteer,
  showHeifer,
  showTemperature,
  showDiesel,
  yMin,
  yMax,
  hasTemperatureSeries,
  hasDieselSeries,
  weatherSegments,
  weatherBars,
  hasWeatherSegments,
  selectedEventTypes,
  eventFetchEnabled,
  loading,
  error,
  dieselLoading,
  dieselError,
  temperatureLoading,
  temperatureError,
  weatherLoading,
  weatherError,
}: ChartLivePlotProps) {
  const [view, setView] = useState<View>({ scale: 1, tx: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; tx: number } | null>(null)
  const [hover, setHover] = useState<Hover>(null)
  const tickCount = 11

  const getXFor = useMemo(
    () => (index: number) => xFor(index, domainDates, innerW, pad.left),
    [domainDates, innerW, pad.left],
  )
  const getSX = useMemo(() => (xCoord: number) => sX(xCoord, view), [view])
  const getYFor = useMemo(
    () => (value: number) => yFor(value, yMin, yMax, innerH, pad.top),
    [yMin, yMax, innerH, pad.top],
  )

  const temperatureScale = useMemo(() => {
    const values: number[] = []
    alignedTemperature.forEach((p) => {
      if (p.value != null) values.push(p.value as number)
    })
    if (!values.length) return { min: 0, max: 1 }
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) { min -= 0.5; max += 0.5 }
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
    if (min === max) { min -= 0.5; max += 0.5 }
    const span = Math.max(1e-6, max - min)
    const padV = Math.max(0.05 * span, 0.05)
    return { min: min - padV, max: max + padV }
  }, [alignedDiesel])

  const getTempYFor = useMemo(() => {
    return (value: number) => {
      const { min, max } = temperatureScale
      const clamped = Math.min(Math.max(value, min), max)
      const t = (clamped - min) / Math.max(1e-6, max - min)
      return pad.top + (1 - t) * innerH
    }
  }, [temperatureScale, innerH, pad.top])

  const getDieselYFor = useMemo(() => {
    return (value: number) => {
      const { min, max } = dieselScale
      const clamped = Math.min(Math.max(value, min), max)
      const t = (clamped - min) / Math.max(1e-6, max - min)
      return pad.top + (1 - t) * innerH
    }
  }, [dieselScale, innerH, pad.top])

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
      const point = alignedDiesel[i]
      if (point.value == null) {
        flush()
        continue
      }
      const xCoord = getSX(getXFor(i))
      const yCoord = getDieselYFor(point.value)
      if (!Number.isFinite(xCoord) || !Number.isFinite(yCoord)) continue
      current.push({ x: xCoord, y: yCoord })
    }
    flush()
    return segments.join(' ')
  }, [alignedDiesel, showDiesel, baselineY, getXFor, getSX, getDieselYFor])

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
      const point = alignedTemperature[i]
      if (point.value == null) {
        flush()
        continue
      }
      const xCoord = getSX(getXFor(i))
      const yCoord = getTempYFor(point.value)
      if (!Number.isFinite(xCoord) || !Number.isFinite(yCoord)) continue
      current.push({ x: xCoord, y: yCoord })
    }
    flush()
    return segments.join(' ')
  }, [alignedTemperature, showTemperature, baselineY, getXFor, getSX, getTempYFor])

  const getClampTranslate = (tx: number, scale: number) => clampTranslate(tx, scale, plotSize.w, pad.left, pad.right)
  const xLabelIndices = useMemo(() => getXLabelIndices(domainDates), [domainDates])

  useEffect(() => {
    setHover((prev) => (showTemperature ? prev : prev?.series === 'temperature' ? null : prev))
  }, [showTemperature])

  useEffect(() => {
    setHover((prev) => (showDiesel ? prev : prev?.series === 'diesel' ? null : prev))
  }, [showDiesel])

  useEffect(() => {
    setHover((prev) => (eventFetchEnabled ? prev : prev?.series === 'weather' ? null : prev))
  }, [eventFetchEnabled])

  useEffect(() => {
    setHover((prev) => (prev?.series === 'weather' ? null : prev))
  }, [selectedEventTypes])

  useEffect(() => {
    setHover((prev) => (hasWeatherSegments ? prev : prev?.series === 'weather' ? null : prev))
  }, [hasWeatherSegments])

  return (
    <div
      className="chart-plot"
      ref={plotRef}
      role="img"
      aria-label="Cattle Price chart area"
      style={{ cursor: isPanning ? 'grabbing' : view.scale > 1 ? 'grab' : 'default' }}
      onWheel={(e) => {
        e.preventDefault()
        const rect = plotRef.current?.getBoundingClientRect()
        if (!rect) return
        const px = e.clientX - rect.left
        const factor = e.deltaY < 0 ? 1.1 : 0.9
        const newScale = clamp(view.scale * factor, 1, 8)
        const worldX = (px - view.tx) / view.scale
        let newTx = px - worldX * newScale
        const clamped = getClampTranslate(newTx, newScale)
        setView({ scale: newScale, tx: clamped.tx })
      }}
      onDoubleClick={() => {
        setView({ scale: 1, tx: 0 })
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        if (view.scale <= 1) return
        setIsPanning(true)
        panStart.current = { x: e.clientX, tx: view.tx }
      }}
      onMouseMove={(e) => {
        if (isPanning) e.preventDefault()
        if (!isPanning || !panStart.current) return
        const dx = e.clientX - panStart.current.x
        const next = getClampTranslate(panStart.current.tx + dx, view.scale)
        setView({ scale: view.scale, tx: next.tx })
      }}
      onMouseUp={(e) => {
        e.preventDefault()
        setIsPanning(false)
        panStart.current = null
      }}
      onMouseLeave={() => {
        setHover(null)
        setIsPanning(false)
        panStart.current = null
      }}
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
                <line key={`maj-${i}`} x1={pad.left} x2={plotSize.w - pad.right} y1={y} y2={y} className="grid-major" />,
              )
              if (step > 0 && i < majors.length - 1) {
                for (let k = 1; k < 10; k++) {
                  const value = majors[i] + (k * step) / 10
                  if (value <= yMax && value >= yMin) {
                    const yy = getYFor(value)
                    lines.push(
                      <line key={`min-${i}-${k}`} x1={pad.left} x2={plotSize.w - pad.right} y1={yy} y2={yy} className="grid-minor" />,
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
                    x={pad.left - 8}
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
                d={path(alignedDiesel, getSX, getXFor, getDieselYFor)}
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
                d={path(alignedTemperature, getSX, getXFor, getTempYFor)}
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
                      const mouseY = rect ? event.clientY - rect.top : Math.max(pad.top, bar.top)
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
                      const mouseY = rect ? event.clientY - rect.top : Math.max(pad.top, bar.top)
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
                    onMouseLeave={() =>
                      setHover((prev) => (prev && prev.series === 'weather' ? null : prev))
                    }
                  />
                )
              })}
            </g>
          )}

          <g aria-label="series">
            {showSteer && (
              <>
                <path d={path(aligned.steer, getSX, getXFor, getYFor)} stroke="#000" strokeWidth={2} fill="none" />
                {aligned.steer.map((point, index) =>
                  point.value != null ? (
                    <circle
                      key={`s-${index}`}
                      cx={getSX(getXFor(index))}
                      cy={getYFor(point.value as number)}
                      r={3.5}
                      fill="#000"
                      onMouseEnter={() =>
                        setHover({
                          series: 'steer',
                          index,
                          value: point.value as number,
                          date: domainDates[index],
                        })
                      }
                      onMouseMove={() =>
                        setHover({
                          series: 'steer',
                          index,
                          value: point.value as number,
                          date: domainDates[index],
                        })
                      }
                    />
                  ) : null,
                )}
              </>
            )}

            {showHeifer && (
              <>
                <path d={path(aligned.heifer, getSX, getXFor, getYFor)} stroke="#d62728" strokeWidth={2} fill="none" />
                {aligned.heifer.map((point, index) =>
                  point.value != null ? (
                    <circle
                      key={`h-${index}`}
                      cx={getSX(getXFor(index))}
                      cy={getYFor(point.value as number)}
                      r={3.5}
                      fill="#d62728"
                      onMouseEnter={() =>
                        setHover({
                          series: 'heifer',
                          index,
                          value: point.value as number,
                          date: domainDates[index],
                        })
                      }
                      onMouseMove={() =>
                        setHover({
                          series: 'heifer',
                          index,
                          value: point.value as number,
                          date: domainDates[index],
                        })
                      }
                    />
                  ) : null,
                )}
              </>
            )}
          </g>

          {showDiesel && hasDieselSeries && (
            <g className="diesel-hitpoints">
              {alignedDiesel.map((point, index) =>
                point.value != null ? (
                  <circle
                    key={`diesel-${index}`}
                    cx={getSX(getXFor(index))}
                    cy={getDieselYFor(point.value as number)}
                    r={10}
                    fill="rgba(32, 122, 72, 0.001)"
                    stroke="rgba(32, 122, 72, 0.001)"
                    onMouseEnter={() =>
                      setHover({
                        series: 'diesel',
                        index,
                        value: point.value as number,
                        date: domainDates[index],
                      })
                    }
                    onMouseMove={() =>
                      setHover({
                        series: 'diesel',
                        index,
                        value: point.value as number,
                        date: domainDates[index],
                      })
                    }
                    onMouseLeave={() =>
                      setHover((prev) => (prev && prev.series === 'diesel' ? null : prev))
                    }
                  />
                ) : null,
              )}
            </g>
          )}

          {showTemperature && hasTemperatureSeries && (
            <g className="temperature-hitpoints">
              {alignedTemperature.map((point, index) =>
                point.value != null ? (
                  <circle
                    key={`temp-${index}`}
                    cx={getSX(getXFor(index))}
                    cy={getTempYFor(point.value as number)}
                    r={10}
                    fill="rgba(255, 160, 0, 0.001)"
                    stroke="rgba(255, 160, 0, 0.001)"
                    onMouseEnter={() =>
                      setHover({
                        series: 'temperature',
                        index,
                        value: point.value as number,
                        date: domainDates[index],
                      })
                    }
                    onMouseMove={() =>
                      setHover({
                        series: 'temperature',
                        index,
                        value: point.value as number,
                        date: domainDates[index],
                      })
                    }
                    onMouseLeave={() =>
                      setHover((prev) => (prev && prev.series === 'temperature' ? null : prev))
                    }
                  />
                ) : null,
              )}
            </g>
          )}

          {domainDates.map((date, index) =>
            xLabelIndices.has(index) ? (
              <text key={`xt-${index}`} x={getSX(getXFor(index))} y={plotSize.h - 8} textAnchor="middle" className="x-tick">
                {xLabelFmt(date)}
              </text>
            ) : null,
          )}

          {hover && hover.series !== 'weather' && (
            <g className="crosshair" aria-hidden>
              {(() => {
                const hoverX = getSX(getXFor(hover.index))
                const hoverY =
                  hover.series === 'temperature'
                    ? getTempYFor(hover.value)
                    : hover.series === 'diesel'
                      ? getDieselYFor(hover.value)
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
                      x1={pad.left}
                      x2={plotSize.w - pad.right}
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
                      y1={pad.top}
                      y2={plotSize.h - pad.bottom}
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

      <ChartLiveTooltip
        hover={hover}
        pad={pad}
        getXFor={getXFor}
        getSX={getSX}
        getYFor={getYFor}
        getTempYFor={getTempYFor}
        getDieselYFor={getDieselYFor}
      />

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
