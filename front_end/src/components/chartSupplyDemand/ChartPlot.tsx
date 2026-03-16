import React, { useMemo } from 'react'
import { formatDateLabel, formatInt, formatMoney, linearTicks } from './utils'
import { HoverPoint } from './types'
import { ChartSize } from './useChartDimensions'

export type ChartPlotProps = {
  pad: { top: number; right: number; bottom: number; left: number }
  plotRef: React.MutableRefObject<HTMLDivElement | null>
  plotSize: ChartSize
  domainDates: string[]
  heads: Array<{ date: string; supply: number; demand: number }>
  eq: Array<{ date: string; supply: number | null; demand: number | null }>
  showSupply: boolean
  showDemand: boolean
  yMin: number
  yMax: number
  tickCount: number
  hover: HoverPoint | null
  onHoverChange: (next: HoverPoint | null) => void
  loading: boolean
  error: string | null
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void
  xLabelIndices: Set<number>
}

export function ChartPlot(props: ChartPlotProps) {
  const {
    pad,
    plotRef,
    plotSize,
    domainDates,
    heads,
    eq,
    showSupply,
    showDemand,
    yMin,
    yMax,
    tickCount,
    hover,
    onHoverChange,
    loading,
    error,
    onWheel,
    xLabelIndices,
  } = props

  const innerW = Math.max(0, plotSize.w - pad.left - pad.right)
  const innerH = Math.max(0, plotSize.h - pad.top - pad.bottom)

  const xFor = (index: number) => {
    const n = domainDates.length
    if (n <= 1) return pad.left + innerW / 2
    return pad.left + (index * innerW) / (n - 1)
  }

  const yFor = (value: number) => {
    const min = Math.min(yMin, yMax)
    const max = Math.max(yMin, yMax)
    const t = (Math.min(Math.max(value, min), max) - min) / Math.max(1e-6, max - min)
    return pad.top + (1 - t) * innerH
  }

  const supplyPath = useMemo(
    () => path(domainDates.map((_, index) => ({ v: heads[index]?.supply ?? null })), xFor, yFor),
    [domainDates, heads],
  )

  const demandPath = useMemo(
    () => path(domainDates.map((_, index) => ({ v: heads[index]?.demand ?? null })), xFor, yFor),
    [domainDates, heads],
  )

  return (
    <div
      className="chart-plot"
      ref={(node) => (plotRef.current = node)}
      role="img"
      aria-label="Supply & Demand plot"
      onWheel={onWheel}
      onMouseLeave={() => onHoverChange(null)}
    >
      {plotSize.w > 0 && plotSize.h > 0 && (
        <svg className="chart-svg" viewBox={`0 0 ${plotSize.w} ${plotSize.h}`} width={plotSize.w} height={plotSize.h}>
          {renderGrid({ pad, plotSize, yMin, yMax, tickCount, yFor })}
          {renderYLabels({ pad, plotSize, yMin, yMax, tickCount, yFor })}
          {domainDates.map((date, index) =>
            xLabelIndices.has(index) ? (
              <text key={date} x={xFor(index)} y={plotSize.h - 8} textAnchor="middle" className="x-tick">
                {formatDateLabel(date)}
              </text>
            ) : null,
          )}

          {(showSupply || showDemand) && heads.length > 0 && (
            <g>
              {showSupply && (
                <>
                  <path d={supplyPath} stroke="#000" strokeWidth={2} fill="none" />
                  {heads.map((row, index) => (
                    <circle
                      key={`s-${row.date}`}
                      cx={xFor(index)}
                      cy={yFor(row.supply)}
                      r={3.5}
                      fill="#000"
                      style={{ cursor: 'crosshair' }}
                      onMouseEnter={() => onHoverChange({ series: 'supply', index, value: row.supply, date: row.date })}
                      onMouseMove={() => onHoverChange({ series: 'supply', index, value: row.supply, date: row.date })}
                    />
                  ))}
                </>
              )}
              {showDemand && (
                <>
                  <path d={demandPath} stroke="#d62728" strokeWidth={2} fill="none" />
                  {heads.map((row, index) => (
                    <circle
                      key={`d-${row.date}`}
                      cx={xFor(index)}
                      cy={yFor(row.demand)}
                      r={3.5}
                      fill="#d62728"
                      style={{ cursor: 'crosshair' }}
                      onMouseEnter={() => onHoverChange({ series: 'demand', index, value: row.demand, date: row.date })}
                      onMouseMove={() => onHoverChange({ series: 'demand', index, value: row.demand, date: row.date })}
                    />
                  ))}
                </>
              )}
            </g>
          )}

          {hover && (
            <g className="crosshair" aria-hidden>
              <line
                x1={pad.left}
                x2={plotSize.w - pad.right}
                y1={yFor(hover.value)}
                y2={yFor(hover.value)}
                stroke="#000"
                strokeWidth={1}
                opacity={0.85}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={xFor(hover.index)}
                x2={xFor(hover.index)}
                y1={pad.top}
                y2={plotSize.h - pad.bottom}
                stroke="#000"
                strokeWidth={1}
                opacity={0.85}
                style={{ pointerEvents: 'none' }}
              />
              <circle
                cx={xFor(hover.index)}
                cy={yFor(hover.value)}
                r={3.5}
                fill="#000"
                opacity={0.9}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )}
        </svg>
      )}

      {hover && (() => {
        const index = hover.index
        const eqPrice = hover.series === 'supply' ? eq[index]?.supply ?? null : eq[index]?.demand ?? null
        const ty = yFor(hover.value)
        return (
          <div className="chart-tooltip" style={{ left: `${xFor(index)}px`, top: `${ty}px` }}>
            <div className="chart-tooltip-content">
              <div className="chart-tooltip-line">{formatDateLabel(hover.date)}</div>
              <div className="chart-tooltip-line">{hover.series === 'supply' ? 'Supply' : 'Demand'}</div>
              <div className="chart-tooltip-line">Price: {eqPrice != null ? formatMoney(eqPrice) : '—'}</div>
              <div className="chart-tooltip-line">Headcount: {formatInt(hover.value)}</div>
            </div>
          </div>
        )
      })()}

      {loading && <div className="chart-loading">Loading…</div>}
      {error && <div className="chart-error">{error}</div>}
    </div>
  )
}

function path(
  points: Array<{ v: number | null }>,
  xFor: (index: number) => number,
  yFor: (value: number) => number,
): string {
  const cmds: string[] = []
  for (let i = 0; i < points.length; i++) {
    const value = points[i].v
    if (value == null) continue
    const X = xFor(i)
    const Y = yFor(value)
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue
    if (cmds.length === 0 || (i > 0 && points[i - 1].v == null)) cmds.push(`M ${X} ${Y}`)
    else cmds.push(`L ${X} ${Y}`)
  }
  return cmds.join(' ')
}

function renderGrid(params: {
  pad: { top: number; right: number; bottom: number; left: number }
  plotSize: ChartSize
  yMin: number
  yMax: number
  tickCount: number
  yFor: (value: number) => number
}) {
  const { pad, plotSize, yMin, yMax, tickCount, yFor } = params
  const roundK = (value: number) => Math.round(value / 1000) * 1000
  const base = linearTicks(yMin, yMax, tickCount)
  const majors: number[] = []
  for (const value of base) {
    let rounded = roundK(value)
    if (rounded < yMin) rounded = yMin
    if (rounded > yMax) rounded = yMax
    if (majors.length === 0 || Math.abs(majors[majors.length - 1] - rounded) > 1e-6) majors.push(rounded)
  }
  return (
    <g aria-hidden>
      {majors.map((value, index) => (
        <line
          key={`y-${index}`}
          x1={pad.left}
          x2={plotSize.w - pad.right}
          y1={yFor(value)}
          y2={yFor(value)}
          className="grid-major"
        />
      ))}
    </g>
  )
}

function renderYLabels(params: {
  pad: { top: number; right: number; bottom: number; left: number }
  plotSize: ChartSize
  yMin: number
  yMax: number
  tickCount: number
  yFor: (value: number) => number
}) {
  const { pad, plotSize, yMin, yMax, tickCount, yFor } = params
  const roundK = (value: number) => Math.round(value / 1000) * 1000
  const base = linearTicks(yMin, yMax, tickCount)
  const majors: number[] = []
  for (const value of base) {
    let rounded = roundK(value)
    if (rounded < yMin) rounded = yMin
    if (rounded > yMax) rounded = yMax
    if (majors.length === 0 || Math.abs(majors[majors.length - 1] - rounded) > 1e-6) majors.push(rounded)
  }

  return (
    <g aria-hidden>
      {majors.map((value, index) => (
        <text
          key={`yl-${index}`}
          x={pad.left - 8}
          y={yFor(value)}
          textAnchor="end"
          dominantBaseline="middle"
          className="y-tick"
        >
          {formatInt(value)}
        </text>
      ))}
    </g>
  )
}
