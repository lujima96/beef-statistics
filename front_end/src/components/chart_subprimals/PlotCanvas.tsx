import React, { useMemo } from 'react'

import { EVENT_TYPE_COLORS, type EventType } from '../../constants/eventTypes'
import { formatCurrency } from './format'
import { linearTicks } from './math'
import type { AlignedSeries } from './types'
import type { DieselResult, TemperatureResult } from './useChartSubprimalsData'
import type { WeatherBar, WeatherSegment } from '../../utils/weatherSegments'

export type PriceHover = {
  series: 'am' | 'pm' | 'temperature' | 'diesel'
  index: number
  value: number
  date: string
}

export type WeatherHover = {
  series: 'weather'
  monthStart: string
  x: number
  width: number
  top: number
  bottom: number
  breakdown: Array<{ eventType: EventType; count: number }>
  mouseX: number
  mouseY: number
}

export type PlotHover = PriceHover | WeatherHover

type PlotCanvasProps = {
  plotSize: { w: number; h: number }
  pad: { top: number; right: number; bottom: number; left: number }
  view: { scale: number; tx: number }
  domainDates: string[]
  aligned: AlignedSeries
  showAm: boolean
  showPm: boolean
  showTemperature: boolean
  showDiesel: boolean
  temperature: TemperatureResult
  diesel: DieselResult
  yMin: number
  yMax: number
  tickCount: number
  baselineY: number
  xFor: (index: number) => number
  yFor: (value: number) => number
  dieselYFor: (value: number) => number
  tempYFor: (value: number) => number
  sX: (value: number) => number
  sY: (value: number) => number
  weatherSegments: WeatherSegment[]
  weatherBars: WeatherBar[]
  hover: PlotHover | null
  onHoverChange: (hover: PlotHover | null) => void
}

function computeAreaPath(
  points: Array<{ value: number | null }>,
  baselineY: number,
  xFor: (index: number) => number,
  sX: (value: number) => number,
  yFn: (value: number) => number
): string {
  const segments: string[] = []
  let current: Array<{ x: number; y: number }> = []
  const flush = () => {
    if (!current.length) return
    const first = current[0]
    const last = current[current.length - 1]
    segments.push(`M ${first.x} ${baselineY}`)
    segments.push(`L ${first.x} ${first.y}`)
    for (let i = 1; i < current.length; i += 1) segments.push(`L ${current[i].x} ${current[i].y}`)
    segments.push(`L ${last.x} ${baselineY}`)
    segments.push('Z')
    current = []
  }
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    if (p.value == null) {
      flush()
      continue
    }
    const x = sX(xFor(i))
    const y = yFn(p.value)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    current.push({ x, y })
  }
  flush()
  return segments.join(' ')
}

export default function PlotCanvas({
  plotSize,
  pad,
  view,
  domainDates,
  aligned,
  showAm,
  showPm,
  showTemperature,
  showDiesel,
  temperature,
  diesel,
  yMin,
  yMax,
  tickCount,
  baselineY,
  xFor,
  yFor,
  dieselYFor,
  tempYFor,
  sX,
  sY,
  weatherSegments,
  weatherBars,
  hover,
  onHoverChange,
}: PlotCanvasProps) {
  const xLabelIndices = useMemo(() => {
    const n = domainDates.length
    if (n === 0) return new Set<number>()
    if (n <= 7) return new Set(Array.from({ length: n }, (_, i) => i))
    const idx: number[] = []
    const segments = 6
    for (let i = 0; i <= segments; i += 1) {
      const x = Math.round((i * (n - 1)) / segments)
      if (idx.length === 0 || idx[idx.length - 1] !== x) idx.push(x)
    }
    return new Set(idx)
  }, [domainDates])

  const pathFor = (
    points: Array<{ date: string; value: number | null }>,
    yFn: (value: number) => number = yFor
  ) => {
    const coords: Array<{ x: number; y: number }> = []
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i]
      if (p.value == null) continue
      const x = sX(xFor(i))
      const y = yFn(p.value)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      coords.push({ x, y })
    }
    if (!coords.length) return ''
    const cmds: string[] = [`M ${coords[0].x} ${coords[0].y}`]
    for (let k = 1; k < coords.length; k += 1) cmds.push(`L ${coords[k].x} ${coords[k].y}`)
    return cmds.join(' ')
  }

  const dieselAreaPath = useMemo(
    () => (showDiesel ? computeAreaPath(diesel.aligned, baselineY, xFor, sX, dieselYFor) : ''),
    [diesel.aligned, showDiesel, baselineY, dieselYFor, sX, xFor]
  )

  const temperatureAreaPath = useMemo(
    () => (showTemperature ? computeAreaPath(temperature.aligned, baselineY, xFor, sX, tempYFor) : ''),
    [temperature.aligned, showTemperature, baselineY, tempYFor, sX, xFor]
  )

  const yTicks = useMemo(() => linearTicks(yMin, yMax, tickCount), [yMin, yMax, tickCount])

  const xLabelFmt = (isoDate: string) => {
    const dt = new Date(`${isoDate}T00:00:00`)
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    const yyyy = dt.getFullYear()
    return `${mm}/${dd}/${yyyy}`
  }

  return (
    <svg className="chart-svg" viewBox={`0 0 ${plotSize.w} ${plotSize.h}`} width={plotSize.w} height={plotSize.h}>
      {(() => {
        const lines: JSX.Element[] = []
        const step = yTicks.length >= 2 ? yTicks[1] - yTicks[0] : 0
        for (let i = 0; i < yTicks.length; i += 1) {
          const y = yFor(yTicks[i])
          lines.push(
            <line
              key={`maj-${i}`}
              x1={pad.left}
              x2={plotSize.w - pad.right}
              y1={y}
              y2={y}
              className="grid-major"
            />
          )
          if (step > 0 && i < yTicks.length - 1) {
            for (let k = 1; k < 10; k += 1) {
              const v = yTicks[i] + (k * step) / 10
              if (v <= yMax && v >= yMin) {
                const yy = yFor(v)
                lines.push(
                  <line
                    key={`min-${i}-${k}`}
                    x1={pad.left}
                    x2={plotSize.w - pad.right}
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
      <g aria-hidden>
        {yTicks.map((v, i) => (
          <text
            key={`yl-${i}`}
            x={pad.left - 8}
            y={yFor(v)}
            textAnchor="end"
            dominantBaseline="middle"
            className="y-tick"
          >
            {formatCurrency(v)}
          </text>
        ))}
      </g>

      {showDiesel && diesel.hasSeries && dieselAreaPath && (
        <g className="diesel-layer" aria-label="Diesel series">
          <path d={dieselAreaPath} fill="rgba(32, 122, 72, 0.18)" stroke="none" style={{ pointerEvents: 'none' }} />
          <path d={pathFor(diesel.aligned, dieselYFor)} stroke="#1f7a3a" strokeWidth="2" fill="none" style={{ pointerEvents: 'none' }} />
        </g>
      )}

      {showTemperature && temperature.hasSeries && temperatureAreaPath && (
        <g className="temperature-layer" aria-label="Temperature series">
          <path d={temperatureAreaPath} fill="rgba(255, 160, 0, 0.24)" stroke="none" style={{ pointerEvents: 'none' }} />
          <path d={pathFor(temperature.aligned, tempYFor)} stroke="rgba(255, 140, 0, 0.9)" strokeWidth="2" fill="none" style={{ pointerEvents: 'none' }} />
        </g>
      )}

      {weatherSegments.length > 0 && (
        <g className="weather-layer" aria-label="Weather events">
          {weatherSegments.map((segment) => {
            const color = EVENT_TYPE_COLORS[segment.eventType] || '#555555'
            const screenX = sX(segment.x)
            const screenWidth = Math.max(2, view.scale * segment.width)
            const height = Math.max(1.5, segment.height)
            const drawY = segment.y - (height - segment.height)
            return (
              <rect
                key={segment.key}
                x={screenX}
                y={drawY}
                width={screenWidth}
                height={height}
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

      {weatherBars.length > 0 && (
        <g className="weather-hitpoints" aria-hidden>
          {weatherBars.map((bar) => {
            const screenX = sX(bar.x)
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
                  const rect =
                    event.currentTarget.ownerSVGElement?.getBoundingClientRect() ||
                    event.currentTarget.getBoundingClientRect()
                  const mouseX = rect ? event.clientX - rect.left : sX(bar.x + bar.width / 2)
                  const mouseY = rect ? event.clientY - rect.top : Math.max(pad.top, bar.top)
                  onHoverChange({
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
                  const rect =
                    event.currentTarget.ownerSVGElement?.getBoundingClientRect() ||
                    event.currentTarget.getBoundingClientRect()
                  const mouseX = rect ? event.clientX - rect.left : sX(bar.x + bar.width / 2)
                  const mouseY = rect ? event.clientY - rect.top : Math.max(pad.top, bar.top)
                  onHoverChange({
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
                onMouseLeave={() => onHoverChange(null)}
              />
            )
          })}
        </g>
      )}

      {domainDates.map((date, index) => (
        xLabelIndices.has(index) ? (
          <text key={index} x={xFor(index)} y={plotSize.h - 8} textAnchor="middle" className="x-tick">
            {xLabelFmt(date)}
          </text>
        ) : null
      ))}

      {[
        { key: 'am' as const, color: '#000000', data: aligned.am, show: showAm },
        { key: 'pm' as const, color: '#d62728', data: aligned.pm, show: showPm },
      ].map(({ key, color, data, show }) => (
        show && data.length > 0 ? (
          <g key={key}>
            <path d={pathFor(data)} stroke={color} strokeWidth="2" fill="none" />
            {data.map((p, i) => (p.value != null ? (
              <circle
                key={`${key}-${i}`}
                cx={sX(xFor(i))}
                cy={yFor(p.value as number)}
                r={4}
                fill={color}
                onMouseEnter={() => onHoverChange({ series: key, index: i, value: p.value as number, date: p.date })}
                onMouseMove={() => onHoverChange({ series: key, index: i, value: p.value as number, date: p.date })}
                onMouseLeave={() => onHoverChange(null)}
              />
            ) : null))}
          </g>
        ) : null
      ))}

      {[
        {
          key: 'diesel' as const,
          show: showDiesel && diesel.hasSeries,
          data: diesel.aligned,
          yFn: dieselYFor,
          fill: 'rgba(32, 122, 72, 0.001)',
        },
        {
          key: 'temperature' as const,
          show: showTemperature && temperature.hasSeries,
          data: temperature.aligned,
          yFn: tempYFor,
          fill: 'rgba(255, 160, 0, 0.001)',
        },
      ].map(({ key, show, data, yFn, fill }) => (
        show ? (
          <g key={key} className={`${key}-hitpoints`}>
            {data.map((p, i) => (p.value != null ? (
              <circle
                key={`${key}-${i}`}
                cx={sX(xFor(i))}
                cy={yFn(p.value as number)}
                r={10}
                fill={fill}
                stroke={fill}
                onMouseEnter={() => onHoverChange({ series: key, index: i, value: p.value as number, date: p.date })}
                onMouseMove={() => onHoverChange({ series: key, index: i, value: p.value as number, date: p.date })}
                onMouseLeave={() => onHoverChange(null)}
              />
            ) : null))}
          </g>
        ) : null
      ))}

      {hover && hover.series !== 'weather' && (() => {
        const hoverX = sX(xFor(hover.index))
        const hoverY =
          hover.series === 'temperature'
            ? tempYFor(hover.value)
            : hover.series === 'diesel'
              ? dieselYFor(hover.value)
              : yFor(hover.value)
        const strokeColor =
          hover.series === 'pm'
            ? '#d62728'
            : hover.series === 'temperature'
              ? 'rgba(255, 140, 0, 0.9)'
              : hover.series === 'diesel'
                ? '#1f7a3a'
                : '#000'
        return (
          <g className="crosshair" aria-hidden>
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
          </g>
        )
      })()}
    </svg>
  )
}
