import React from 'react'
import { Hover } from './Chart1WTypes'
import { formatCurrency, formatDateLabel } from './Chart1WUtils'

type SeriesPoint = { date: string; value: number | null }

type SeriesSet = { am: SeriesPoint[]; pm: SeriesPoint[] }

interface ChartPlotProps {
  pad: { top: number; right: number; bottom: number; left: number }
  plotSize: { w: number; h: number }
  plotRef: React.RefObject<HTMLDivElement>
  grade: 'choice' | 'select' | 'both'
  showAm: boolean
  showPm: boolean
  alignedChoice: SeriesSet
  alignedSelect: SeriesSet
  yMin: number
  yMax: number
  getXFor: (i: number) => number
  getYFor: (value: number) => number
  getPathFor: (points: SeriesPoint[]) => string
  hover: Hover
  setHover: React.Dispatch<React.SetStateAction<Hover>>
  xLabels: string[]
  loading: boolean
  error: string | null
  onWheel: React.WheelEventHandler<HTMLDivElement>
  onDoubleClick: () => void
}

export function ChartPlot({
  pad,
  plotSize,
  plotRef,
  grade,
  showAm,
  showPm,
  alignedChoice,
  alignedSelect,
  yMin,
  yMax,
  getXFor,
  getYFor,
  getPathFor,
  hover,
  setHover,
  xLabels,
  loading,
  error,
  onWheel,
  onDoubleClick,
}: ChartPlotProps) {
  const renderSeries = (
    series: SeriesPoint[],
    color: string,
    gradeKey: 'choice' | 'select',
    seriesKey: 'am' | 'pm',
    isSelect: boolean,
  ) => {
    if (series.length === 0) return null
    const path = getPathFor(series)
    const dash = isSelect ? '6 4' : undefined
    return (
      <>
        <path d={path} stroke={color} strokeWidth="2" strokeDasharray={dash} fill="none" />
        {series.map((point, index) => {
          if (point.value == null) return null
          const value = point.value as number
          const min = Math.min(yMin, yMax)
          const max = Math.max(yMin, yMax)
          if (value < min || value > max) return null
          const isSelectGrade = gradeKey === 'select'
          const fill = isSelectGrade ? '#ffffff' : color
          const stroke = isSelectGrade ? color : undefined
          const strokeWidth = isSelectGrade ? 2 : undefined
          const key = `${seriesKey}-${gradeKey}-${index}`
          return (
            <circle
              key={key}
              cx={getXFor(index)}
              cy={getYFor(value)}
              r={4}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHover({ grade: gradeKey, series: seriesKey, index, value, date: point.date })}
              onMouseMove={() => setHover({ grade: gradeKey, series: seriesKey, index, value, date: point.date })}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
      </>
    )
  }

  const renderSeriesGroup = (
    shouldRender: boolean,
    choiceSeries: SeriesPoint[],
    selectSeries: SeriesPoint[],
    color: string,
    seriesKey: 'am' | 'pm',
  ) => {
    if (!shouldRender) return null
    return (
      <g>
        {(grade === 'choice' || grade === 'both') && renderSeries(choiceSeries, color, 'choice', seriesKey, false)}
        {(grade === 'select' || grade === 'both') && renderSeries(selectSeries, color, 'select', seriesKey, true)}
      </g>
    )
  }

  return (
    <div
      className="chart-plot"
      ref={plotRef}
      role="img"
      aria-label="Price chart area"
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onMouseLeave={() => setHover(null)}
    >
      {plotSize.w > 0 && plotSize.h > 0 && (
        <svg className="chart-svg" viewBox={`0 0 ${plotSize.w} ${plotSize.h}`} width={plotSize.w} height={plotSize.h}>
          {xLabels.map((label, index) => (
            <text key={index} x={getXFor(index)} y={plotSize.h - 8} textAnchor="middle" className="x-tick">
              {label}
            </text>
          ))}
          {renderSeriesGroup(showAm, alignedChoice.am, alignedSelect.am, '#1f77b4', 'am')}
          {renderSeriesGroup(showPm, alignedChoice.pm, alignedSelect.pm, '#d62728', 'pm')}
          {hover && (
            <g className="crosshair" aria-hidden>
              <line
                x1={pad.left}
                x2={plotSize.w - pad.right}
                y1={getYFor(hover.value)}
                y2={getYFor(hover.value)}
                stroke="#000"
                strokeWidth={1}
                opacity={0.85}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={getXFor(hover.index)}
                x2={getXFor(hover.index)}
                y1={pad.top}
                y2={plotSize.h - pad.bottom}
                stroke="#000"
                strokeWidth={1}
                opacity={0.85}
                style={{ pointerEvents: 'none' }}
              />
              <circle
                cx={getXFor(hover.index)}
                cy={getYFor(hover.value)}
                r={3.5}
                fill="#000"
                opacity={0.9}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )}
        </svg>
      )}
      {hover && (
        <div className="chart-tooltip" style={{ left: `${getXFor(hover.index)}px`, top: `${getYFor(hover.value)}px` }}>
          <div className="chart-tooltip-content">
            <div className="chart-tooltip-line">
              <strong>{hover.grade === 'choice' ? 'Choice' : 'Select'}</strong> • {hover.series.toUpperCase()}
            </div>
            <div className="chart-tooltip-line">{formatDateLabel(hover.date)}</div>
            <div className="chart-tooltip-value">{formatCurrency(hover.value)}</div>
          </div>
        </div>
      )}
      {loading && <div className="chart-loading">Loading…</div>}
      {error && <div className="chart-error">{error}</div>}
    </div>
  )
}
