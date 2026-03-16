import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReportTypeSelector, { ReportType } from '../ReportTypeSelector'
import {
  Range,
  Point,
  Payload,
  Hover
} from './ChartIndexTypes'
import {
  ranges,
  DAYS_BY_RANGE,
  toIso,
  alignSeries,
  linearTicks,
  formatCurrency,
  xFor,
  yFor,
  pathFor,
  xLabelFmt,
  getXLabelIndices
} from './ChartIndexUtils'
import {
  usePlotSize,
  useDropdownClose,
  useChartDataFetch,
  useYAutoFit,
  useTickAdaptation
} from './ChartIndexHooks'

export default function ChartIndex() {
  const plotRef = useRef<HTMLDivElement | null>(null)
  const [plotSize, setPlotSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [range, setRange] = useState<Range>('3Y')
  const [grade, setGrade] = useState<'choice' | 'select'>('choice')
  const [gradeOpen, setGradeOpen] = useState(false)
  const [color, setColor] = useState<'black' | 'red'>('black')
  const [colorOpen, setColorOpen] = useState(false)
  const gradeRef = useRef<HTMLDivElement | null>(null)
  const [reportType, setReportType] = useState<ReportType>('Sub Primals')
  const [reportOpen, setReportOpen] = useState(false)
  const reportRef = useRef<HTMLDivElement | null>(null)

  usePlotSize(plotRef, setPlotSize)
  useDropdownClose(gradeRef, reportRef, setGradeOpen, setReportOpen, setColorOpen)

  const pad = { top: 8, right: 56, bottom: 26, left: 56 }

  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover>(null)

  useChartDataFetch(range, setData, setLoading, setError)

  const activeSeries = useMemo(() => {
    if (!data) return [] as Point[]
    return grade === 'choice' ? data.choice : data.select
  }, [data, grade])

  const domainDates = useMemo(() => {
    const dates = new Set<string>()
    activeSeries.forEach(p => dates.add(p.date))
    const sorted = Array.from(dates).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const n = DAYS_BY_RANGE[range]
    return sorted.slice(Math.max(0, sorted.length - n))
  }, [activeSeries, range])

  const aligned = useMemo(() => alignSeries(activeSeries, domainDates), [activeSeries, domainDates])

  const [yMin, setYMin] = useState(0)
  const [yMax, setYMax] = useState(1)
  const [tickCount, setTickCount] = useState(9)

  useYAutoFit(aligned, setYMin, setYMax)
  useTickAdaptation(plotSize.h, pad.top, pad.bottom, tickCount, setTickCount)

  const innerW = Math.max(0, plotSize.w - pad.left - pad.right)
  const innerH = Math.max(0, plotSize.h - pad.top - pad.bottom)

  const getXFor = (i: number) => xFor(i, domainDates, innerW, pad.left)
  const getYFor = (v: number) => yFor(v, yMin, yMax, innerH, pad.top)
  const getPathFor = (points: { date: string; value: number | null }[]) => pathFor(points, getXFor, getYFor)
  const getXLabelIndicesMemo = useMemo(() => getXLabelIndices(domainDates), [domainDates])

  return (
    <section className="chart-card" aria-label="Index Chart">
      {/* Left: Report Type */}
      <ReportTypeSelector
        value={reportType}
        onChange={(next) => {
          setReportType(next)
          if (next === 'Sub Primals') window.location.hash = '#subprimals'
          else if (next === 'Cattle Price') window.location.hash = '#live'
          else window.location.hash = '#5day'
        }}
      />
      {/* Right: Grade + Color */}
      <div className="chart-controls-right" ref={gradeRef}>
        <div className="control-group">
          <div className="control-label">Grade</div>
          <button type="button" className="dropdown-btn" aria-haspopup="listbox" aria-expanded={gradeOpen} onClick={() => setGradeOpen(v => !v)}>
            {grade === 'choice' ? 'Choice' : 'Select'}
            <span className="caret" aria-hidden>▾</span>
          </button>
          {gradeOpen && (
            <div className="dropdown-menu" role="listbox" aria-label="Select grade">
              <button type="button" role="option" aria-selected={grade === 'choice'} className={`dropdown-item ${grade === 'choice' ? 'is-active' : ''}`} onClick={() => { setGrade('choice'); setGradeOpen(false) }}>Choice</button>
              <button type="button" role="option" aria-selected={grade === 'select'} className={`dropdown-item ${grade === 'select' ? 'is-active' : ''}`} onClick={() => { setGrade('select'); setGradeOpen(false) }}>Select</button>
            </div>
          )}
        </div>
        <div className="control-group">
          <div className="control-label">Color</div>
          <button type="button" className="dropdown-btn" aria-haspopup="listbox" aria-expanded={colorOpen} onClick={() => setColorOpen(v => !v)}>
            {color === 'red' ? 'Red' : 'Black'}
            <span className="caret" aria-hidden>▾</span>
          </button>
          {colorOpen && (
            <div className="dropdown-menu" role="listbox" aria-label="Select color">
              <button type="button" role="option" aria-selected={color === 'black'} className={`dropdown-item ${color === 'black' ? 'is-active' : ''}`} onClick={() => { setColor('black'); setColorOpen(false) }}>Black</button>
              <button type="button" role="option" aria-selected={color === 'red'} className={`dropdown-item ${color === 'red' ? 'is-active' : ''}`} onClick={() => { setColor('red'); setColorOpen(false) }}>Red</button>
            </div>
          )}
        </div>
      </div>

      <div
        className="chart-plot"
        ref={plotRef}
        role="img"
        aria-label="Index chart area"
        onMouseLeave={() => setHover(null)}
      >
        {plotSize.w > 0 && plotSize.h > 0 && (
          <svg className="chart-svg" viewBox={`0 0 ${plotSize.w} ${plotSize.h}`} width={plotSize.w} height={plotSize.h}>
            {/* Gridlines */}
            {(() => {
              const hasData = aligned.some(p => p.value != null)
              if (!hasData) return null
              const majors = linearTicks(yMin, yMax, tickCount)
              const lines: JSX.Element[] = []
              const step = majors.length >= 2 ? majors[1] - majors[0] : 0
              for (let i = 0; i < majors.length; i++) {
                const y = getYFor(majors[i])
                lines.push(<line key={`maj-${i}`} x1={pad.left} x2={plotSize.w - pad.right} y1={y} y2={y} className="grid-major" />)
                if (step > 0 && i < majors.length - 1) {
                  for (let k = 1; k < 10; k++) {
                    const v = majors[i] + (k * step) / 10
                    if (v <= yMax && v >= yMin) {
                      const yy = getYFor(v)
                      lines.push(<line key={`min-${i}-${k}`} x1={pad.left} x2={plotSize.w - pad.right} y1={yy} y2={yy} className="grid-minor" />)
                    }
                  }
                }
              }
              return <g aria-hidden>{lines}</g>
            })()}
            {/* Y labels */}
            {(() => {
              const hasData = aligned.some(p => p.value != null)
              if (!hasData) return null
              const majors = linearTicks(yMin, yMax, tickCount)
              return (
                <g aria-hidden>
                  {majors.map((v, i) => (
                    <text key={`yl-${i}`} x={pad.left - 8} y={getYFor(v)} textAnchor="end" dominantBaseline="middle" className="y-tick">{formatCurrency(v)}</text>
                  ))}
                </g>
              )
            })()}
            {/* X labels */}
            {domainDates.map((d, i) => (getXLabelIndicesMemo.has(i) ? (
              <text key={i} x={getXFor(i)} y={plotSize.h - 8} textAnchor="middle" className="x-tick">{xLabelFmt(d)}</text>
            ) : null))}
            {/* Series path and points */}
            {aligned.length > 0 && (
              <g>
                <path d={getPathFor(aligned)} stroke={color === 'red' ? '#d62728' : '#000000'} strokeWidth="2" fill="none" />
                {aligned.map((p, i) => (p.value != null && (
                  <circle
                    key={i}
                    cx={getXFor(i)}
                    cy={getYFor(p.value as number)}
                    r={4}
                    fill={color === 'red' ? '#d62728' : '#000000'}
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={() => setHover({ index: i, value: p.value as number, date: p.date })}
                    onMouseMove={() => setHover({ index: i, value: p.value as number, date: p.date })}
                    onMouseLeave={() => setHover(null)}
                  />
                )))}
              </g>
            )}

            {/* Crosshair at hovered point */}
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
                <circle cx={getXFor(hover.index)} cy={getYFor(hover.value)} r={3.5} fill="#000" opacity={0.9} style={{ pointerEvents: 'none' }} />
              </g>
            )}
          </svg>
        )}
        {hover && (
          <div className="chart-tooltip" style={{ left: `${getXFor(hover.index)}px`, top: `${getYFor(hover.value)}px` }}>
            <div className="chart-tooltip-content">
              <div className="chart-tooltip-line">{xLabelFmt(hover.date)}</div>
              <div className="chart-tooltip-value">{formatCurrency(hover.value)}</div>
            </div>
          </div>
        )}
        {loading && <div className="chart-loading">Loading…</div>}
        {error && <div className="chart-error">{error}</div>}
      </div>
      {/* Range selector */}
      <div className="chart-ranges" role="group" aria-label="Range Selector">
        {ranges.map((label) => (
          <button key={label} type="button" className={`range-btn ${range === label ? 'is-active' : ''}`} aria-pressed={range === label} onClick={() => setRange(label)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
