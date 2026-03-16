import React, { useCallback, useMemo, useRef, useState } from 'react'
import { dayNames, ranges, ZOOM_STEP } from './constants'
import { Range, SeriesPayload, Hover } from './Chart1WTypes'
import { alignSeries, pathFor, xFor, yFor, yFromClient, zoomY, autoFitY as autoFitYUtil } from './Chart1WUtils'
import { YAxis } from './YAxis'
import { useDropdownClose, useChartDataFetch, useAutofitY, usePlotSize, useAudit } from './Chart1WHooks'
import { ChartControls } from './ChartControls'
import { ChartPlot } from './ChartPlot'
import { ChartRanges } from './ChartRanges'

const PRIMALS = ['Rib', 'Chuck', 'Round', 'Loin', 'Brisket', 'Short Plate', 'Flank'] as const
const PAD = { top: 8, right: 56, bottom: 26, left: 56 } as const

type Primal = typeof PRIMALS[number]

type SeriesSet = SeriesPayload

export default function Chart1W() {
  const [range, setRange] = useState<Range>('1W')
  const [grade, setGrade] = useState<'choice' | 'select' | 'both'>('both')
  const [gradeOpen, setGradeOpen] = useState(false)
  const gradeRef = useRef<HTMLDivElement | null>(null)
  const [primal, setPrimal] = useState<Primal>('Rib')
  const [primalOpen, setPrimalOpen] = useState(false)
  const primalRef = useRef<HTMLDivElement | null>(null)
  const [showAm, setShowAm] = useState(true)
  const [showPm, setShowPm] = useState(true)
  const plotRef = useRef<HTMLDivElement | null>(null)

  const [dataChoice, setDataChoice] = useState<SeriesPayload | null>(null)
  const [dataSelect, setDataSelect] = useState<SeriesPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [plotSize, setPlotSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [yMin, setYMin] = useState<number>(0)
  const [yMax, setYMax] = useState<number>(1000)
  const [tickCount, setTickCount] = useState<number>(11)
  const [zoomLevel, setZoomLevel] = useState<number>(0)
  const [baseY, setBaseY] = useState<{ min: number; max: number } | null>(null)
  const [hover, setHover] = useState<Hover>(null)

  useDropdownClose(gradeRef, primalRef, setGradeOpen, setPrimalOpen)
  useChartDataFetch(primal, setDataChoice, setDataSelect, setLoading, setError)
  usePlotSize(plotRef, setPlotSize)

  const domainDates = useMemo(() => {
    const dates = new Set<string>()
    const add = (series: SeriesPayload | null) => {
      if (!series) return
      series.am.forEach((point) => dates.add(point.date))
      series.pm.forEach((point) => dates.add(point.date))
    }
    add(dataChoice)
    add(dataSelect)
    const sorted = Array.from(dates).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    return sorted.slice(Math.max(0, sorted.length - 7))
  }, [dataChoice, dataSelect])

  const alignedChoice = useMemo<SeriesSet>(() => {
    if (!dataChoice) return { am: [], pm: [] }
    return { am: alignSeries(dataChoice.am, domainDates), pm: alignSeries(dataChoice.pm, domainDates) }
  }, [dataChoice, domainDates])

  const alignedSelect = useMemo<SeriesSet>(() => {
    if (!dataSelect) return { am: [], pm: [] }
    return { am: alignSeries(dataSelect.am, domainDates), pm: alignSeries(dataSelect.pm, domainDates) }
  }, [dataSelect, domainDates])

  const autoFitYHandler = useCallback(() => {
    autoFitYUtil(grade, showAm, showPm, alignedChoice, alignedSelect, setYMin, setYMax, setBaseY, setTickCount, setZoomLevel)
  }, [grade, showAm, showPm, alignedChoice, alignedSelect])

  useAutofitY(grade, showAm, showPm, alignedChoice, alignedSelect, setYMin, setYMax, setBaseY, setTickCount, setZoomLevel)

  const pad = PAD
  const innerW = Math.max(0, plotSize.w - pad.left - pad.right)
  const innerH = Math.max(0, plotSize.h - pad.top - pad.bottom)

  const getXFor = useCallback((index: number) => xFor(index, domainDates, innerW, pad.left), [domainDates, innerW, pad.left])
  const getYFor = useCallback((value: number) => yFor(value, yMin, yMax, innerH, pad.top), [yMin, yMax, innerH, pad.top])
  const getPathFor = useCallback((points: SeriesSet['am']) => pathFor(points, getXFor, getYFor), [getXFor, getYFor])
  const getYFromClient = useCallback(
    (clientY: number) => yFromClient(clientY, plotRef, yMin, yMax, innerH, pad.top),
    [plotRef, yMin, yMax, innerH, pad.top],
  )
  const zoomYHandler = useCallback(
    (anchorValue: number, factor: number) => zoomY(anchorValue, factor, yMin, yMax, setYMin, setYMax),
    [yMin, yMax],
  )

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const dir = event.deltaY < 0 ? 1 : -1
        setTickCount((count) => Math.max(5, Math.min(21, count + dir * 2)))
        return
      }
      const step = event.deltaY < 0 ? 1 : -1
      const nextLevel = Math.max(-2, Math.min(2, zoomLevel + step))
      if (nextLevel === zoomLevel) return
      if (nextLevel === 0 && baseY) {
        setYMin(baseY.min)
        setYMax(baseY.max)
        setZoomLevel(0)
        return
      }
      const anchor = getYFromClient(event.clientY)
      const factor = step > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      zoomYHandler(anchor, factor)
      setZoomLevel(nextLevel)
    },
    [zoomLevel, baseY, getYFromClient, zoomYHandler],
  )

  const xLabels = useMemo(
    () =>
      domainDates.map((date) => {
        const dt = new Date(`${date}T00:00:00`)
        const month = dt.getMonth() + 1
        const dayOfMonth = dt.getDate()
        const dayName = dayNames[dt.getDay()]
        return `${dayName} ${month}/${dayOfMonth}`
      }),
    [domainDates],
  )

  useAudit(domainDates, dataChoice, dataSelect, alignedChoice, alignedSelect, yMin, yMax, getXFor)

  return (
    <section className="chart-card" aria-label="Chart Placeholder">
      <div className="chart-controls-panel">
        <ChartControls
          grade={grade}
          gradeOpen={gradeOpen}
          onGradeToggle={() => setGradeOpen((open) => !open)}
          onGradeSelect={(value) => {
            setGrade(value)
            setGradeOpen(false)
          }}
          gradeRef={gradeRef}
          primals={PRIMALS}
          primal={primal}
          primalOpen={primalOpen}
          onPrimalToggle={() => setPrimalOpen((open) => !open)}
          onPrimalSelect={(value) => {
            setPrimal(value as Primal)
            setPrimalOpen(false)
          }}
          primalRef={primalRef}
          showAm={showAm}
          onShowAmChange={(checked) => setShowAm(checked)}
          showPm={showPm}
          onShowPmChange={(checked) => setShowPm(checked)}
        />
      </div>

      <div className="chart-main">
        <YAxis leftPad={pad.left} topPad={pad.top} bottomPad={pad.bottom} yMin={yMin} yMax={yMax} tickCount={tickCount} />

        <ChartPlot
          pad={pad}
          plotSize={plotSize}
          plotRef={plotRef}
          grade={grade}
          showAm={showAm}
          showPm={showPm}
          alignedChoice={alignedChoice}
          alignedSelect={alignedSelect}
          yMin={yMin}
          yMax={yMax}
          getXFor={getXFor}
          getYFor={getYFor}
          getPathFor={getPathFor}
          hover={hover}
          setHover={setHover}
          xLabels={xLabels}
          loading={loading}
          error={error}
          onWheel={handleWheel}
          onDoubleClick={autoFitYHandler}
        />
      </div>

      <ChartRanges ranges={ranges} range={range} onSelect={(value) => setRange(value)} />
    </section>
  )
}
