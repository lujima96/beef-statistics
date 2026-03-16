import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Hover } from './ChartRangeTypes'
import {
  clamp,
  clampTranslate,
  formatCurrency,
  formatDateLabel,
  getXLabelIndices,
  linearTicks,
  pathFor,
  sX,
  sY,
  xFor,
  xLabelFmt,
  yFor,
} from './ChartRangeUtils'

interface SeriesPoint {
  date: string
  value: number | null
}

interface ChartPlotProps {
  plotRef: React.RefObject<HTMLDivElement>
  plotSize: { w: number; h: number }
  pad: { top: number; right: number; bottom: number; left: number }
  innerW: number
  innerH: number
  domainDates: string[]
  yMin: number
  yMax: number
  tickCount: number
  showAm: boolean
  showPm: boolean
  showDiesel: boolean
  alignedAm: SeriesPoint[]
  alignedPm: SeriesPoint[]
  alignedDiesel: SeriesPoint[]
  dieselScale: { min: number; max: number }
  hasDieselSeries: boolean
  view: { scale: number; tx: number }
  setView: React.Dispatch<React.SetStateAction<{ scale: number; tx: number }>>
  loading: boolean
  error: string | null
  dieselLoading: boolean
  dieselError: string | null
}

const getSXFactory = (viewScale: number, viewTx: number) => (x: number) => sX(x, viewScale, viewTx)

export default function ChartPlot(props: ChartPlotProps) {
  const {
    plotRef,
    plotSize,
    pad,
    innerW,
    innerH,
    domainDates,
    yMin,
    yMax,
    tickCount,
    showAm,
    showPm,
    showDiesel,
    alignedAm,
    alignedPm,
    alignedDiesel,
    dieselScale,
    hasDieselSeries,
    view,
    setView,
    loading,
    error,
    dieselLoading,
    dieselError,
  } = props

  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; tx: number } | null>(null)
  const [hover, setHover] = useState<Hover>(null)

  useEffect(() => {
    if (!showDiesel) {
      setHover((prev) => (prev && prev.series === 'diesel' ? null : prev))
    }
  }, [showDiesel])

  const dieselMin = dieselScale.min
  const dieselMax = dieselScale.max
  const dieselBaselineY = pad.top + innerH

  const getDieselYFor = (value: number) => {
    const clamped = Math.min(Math.max(value, dieselMin), dieselMax)
    const span = Math.max(1e-6, dieselMax - dieselMin)
    const t = (clamped - dieselMin) / span
    return pad.top + (1 - t) * innerH
  }

  const dieselAreaPath = useMemo(() => {
    if (!showDiesel) return ''
    const segments: string[] = []
    let current: Array<{ x: number; y: number }> = []
    const flush = () => {
      if (!current.length) return
      const first = current[0]
      const last = current[current.length - 1]
      segments.push(`M ${first.x} ${dieselBaselineY}`)
      segments.push(`L ${first.x} ${first.y}`)
      for (let i = 1; i < current.length; i++) segments.push(`L ${current[i].x} ${current[i].y}`)
      segments.push(`L ${last.x} ${dieselBaselineY}`)
      segments.push('Z')
      current = []
    }
    for (let i = 0; i < alignedDiesel.length; i++) {
      const p = alignedDiesel[i]
      if (p.value == null) {
        flush()
        continue
      }
      const rawX = xFor(i, domainDates, innerW, pad.left)
      const screenX = sX(rawX, view.scale, view.tx)
      const y = getDieselYFor(p.value)
      if (!Number.isFinite(screenX) || !Number.isFinite(y)) continue
      current.push({ x: screenX, y })
    }
    flush()
    return segments.join(' ')
  }, [alignedDiesel, showDiesel, dieselBaselineY, domainDates, innerW, pad.left, view.scale, view.tx, dieselMin, dieselMax, innerH, pad.top])

  const getXFor = (i: number) => xFor(i, domainDates, innerW, pad.left)
  const getYFor = (v: number) => yFor(v, yMin, yMax, innerH, pad.top)
  const getSX = getSXFactory(view.scale, view.tx)
  const getPathFor = (points: SeriesPoint[]) => pathFor(points, getSX, getXFor, getYFor)
  const getDieselPathFor = (points: SeriesPoint[]) => pathFor(points, getSX, getXFor, getDieselYFor)
  const getXLabelIndicesMemo = useMemo(() => getXLabelIndices(domainDates), [domainDates])

  return (
    <div
      className="chart-plot"
      ref={plotRef}
      role="img"
      aria-label="Price chart area"
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
        const clamped = clampTranslate(newTx, newScale, plotSize.w, pad.left, pad.right)
        newTx = clamped.tx
        setView({ scale: newScale, tx: newTx })
      }}
      onDoubleClick={() => {
        setView({ scale: 1, tx: 0 })
      }}
      onMouseLeave={() => {
        setHover(null)
        setIsPanning(false)
        panStart.current = null
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
        const candTx = panStart.current.tx + dx
        const clamped = clampTranslate(candTx, view.scale, plotSize.w, pad.left, pad.right)
        setView((v) => ({ ...v, tx: clamped.tx }))
      }}
      onMouseUp={(e) => {
        e.preventDefault()
        setIsPanning(false)
        panStart.current = null
      }}
    >
      {plotSize.w > 0 && plotSize.h > 0 && (
        <svg className="chart-svg" viewBox={`0 0 ${plotSize.w} ${plotSize.h}`} width={plotSize.w} height={plotSize.h}>
          {domainDates.map((d, i) => (getXLabelIndicesMemo.has(i) ? (
            <text key={i} x={getXFor(i)} y={plotSize.h - 8} textAnchor="middle" className="x-tick">
              {xLabelFmt(d)}
            </text>
          ) : null))}

          {(() => {
            const majors = linearTicks(yMin, yMax, tickCount)
            const lines: JSX.Element[] = []
            const step = majors.length >= 2 ? majors[1] - majors[0] : 0
            for (let i = 0; i < majors.length; i++) {
              const y = getYFor(majors[i])
              lines.push(
                <line key={`maj-${i}`} x1={pad.left} x2={plotSize.w - pad.right} y1={y} y2={y} className="grid-major" />
              )
              if (step > 0 && i < majors.length - 1) {
                for (let k = 1; k < 10; k++) {
                  const v = majors[i] + (k * step) / 10
                  if (v <= yMax && v >= yMin) {
                    const yy = getYFor(v)
                    lines.push(
                      <line key={`min-${i}-${k}`} x1={pad.left} x2={plotSize.w - pad.right} y1={yy} y2={yy} className="grid-minor" />
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
              <path d={getDieselPathFor(alignedDiesel)} stroke="#1f7a3a" strokeWidth="2" fill="none" style={{ pointerEvents: 'none' }} />
            </g>
          )}

          {showAm && alignedAm.length > 0 && (
            <g>
              <path d={getPathFor(alignedAm)} stroke="#000000" strokeWidth="2" fill="none" />
              {alignedAm.map((p, i) => {
                if (p.value == null) return null
                const v = p.value as number
                const min = Math.min(yMin, yMax)
                const max = Math.max(yMin, yMax)
                if (v < min || v > max) return null
                return (
                  <circle
                    key={i}
                    cx={getSX(getXFor(i))}
                    cy={getYFor(v)}
                    r={4}
                    fill="#000000"
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={() => setHover({ series: 'am', index: i, value: v, date: p.date })}
                    onMouseMove={() => setHover({ series: 'am', index: i, value: v, date: p.date })}
                    onMouseLeave={() => setHover(null)}
                  />
                )
              })}
            </g>
          )}

          {showPm && alignedPm.length > 0 && (
            <g>
              <path d={getPathFor(alignedPm)} stroke="#d62728" strokeWidth="2" fill="none" />
              {alignedPm.map((p, i) => {
                if (p.value == null) return null
                const v = p.value as number
                const min = Math.min(yMin, yMax)
                const max = Math.max(yMin, yMax)
                if (v < min || v > max) return null
                return (
                  <circle
                    key={i}
                    cx={getSX(getXFor(i))}
                    cy={getYFor(v)}
                    r={4}
                    fill="#d62728"
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={() => setHover({ series: 'pm', index: i, value: v, date: p.date })}
                    onMouseMove={() => setHover({ series: 'pm', index: i, value: v, date: p.date })}
                    onMouseLeave={() => setHover(null)}
                  />
                )
              })}
            </g>
          )}

          {showDiesel && hasDieselSeries && (
            <g className="diesel-hitpoints">
              {alignedDiesel.map((p, i) =>
                p.value != null ? (
                  <circle
                    key={`diesel-${i}`}
                    cx={getSX(getXFor(i))}
                    cy={getDieselYFor(p.value as number)}
                    r={10}
                    fill="rgba(32, 122, 72, 0.001)"
                    stroke="rgba(32, 122, 72, 0.001)"
                    onMouseEnter={() => setHover({ series: 'diesel', index: i, value: p.value as number, date: p.date })}
                    onMouseMove={() => setHover({ series: 'diesel', index: i, value: p.value as number, date: p.date })}
                    onMouseLeave={() => setHover((prev) => (prev && prev.series === 'diesel' ? null : prev))}
                  />
                ) : null
              )}
            </g>
          )}

          {hover && (
            <g className="crosshair" aria-hidden>
              <line
                x1={pad.left}
                x2={plotSize.w - pad.right}
                y1={hover.series === 'diesel' ? getDieselYFor(hover.value) : getYFor(hover.value)}
                y2={hover.series === 'diesel' ? getDieselYFor(hover.value) : getYFor(hover.value)}
                stroke={hover.series === 'pm' ? '#d62728' : hover.series === 'diesel' ? '#1f7a3a' : '#000'}
                strokeWidth={1}
                opacity={0.85}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={getSX(getXFor(hover.index))}
                x2={getSX(getXFor(hover.index))}
                y1={pad.top}
                y2={plotSize.h - pad.bottom}
                stroke={hover.series === 'pm' ? '#d62728' : hover.series === 'diesel' ? '#1f7a3a' : '#000'}
                strokeWidth={1}
                opacity={0.85}
                style={{ pointerEvents: 'none' }}
              />
              <circle
                cx={getSX(getXFor(hover.index))}
                cy={hover.series === 'diesel' ? getDieselYFor(hover.value) : getYFor(hover.value)}
                r={hover.series === 'diesel' ? 4 : 3.5}
                fill={hover.series === 'pm' ? '#d62728' : hover.series === 'diesel' ? '#1f7a3a' : '#000'}
                opacity={0.9}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )}
        </svg>
      )}

      {hover && (
        <div
          className="chart-tooltip"
          style={{
            left: `${getSX(getXFor(hover.index))}px`,
            top: `${sY(hover.series === 'diesel' ? getDieselYFor(hover.value) : getYFor(hover.value))}px`,
          }}
        >
          <div className="chart-tooltip-content">
            <div className="chart-tooltip-line">
              <strong>{hover.series === 'diesel' ? 'Diesel' : hover.series.toUpperCase()}</strong> • {formatDateLabel(hover.date)}
            </div>
            <div className="chart-tooltip-value">
              {hover.series === 'diesel' ? `${formatCurrency(hover.value)} / gal` : formatCurrency(hover.value)}
            </div>
          </div>
        </div>
      )}

      {loading && <div className="chart-loading">Loading…</div>}
      {error && <div className="chart-error">{error}</div>}
      {showDiesel && dieselLoading && <div className="chart-loading">Loading diesel…</div>}
      {showDiesel && dieselError && <div className="chart-error">{dieselError}</div>}
    </div>
  )
}
