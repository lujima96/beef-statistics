import React, { useState } from 'react'

import Sidebar from '../Sidebar'
import PdfViewer from '../PdfViewer'
import { EVENT_TYPES, isWeatherEventRange } from '../../constants/eventTypes'
import { useIsDesktop, useResponsiveSidebarOpen } from '../../hooks/useResponsiveSidebarOpen'

import Controls from './Controls'
import ChartSubprimalsPlot from './Plot'
import ChartLegend from './ChartLegend'
import RangeSelector from './RangeSelector'
import { useChartSubprimalsData } from './useChartSubprimalsData'
import { usePersistedBoolean } from './usePersistedBoolean'
import { useEventTypeSelection } from './useEventTypeSelection'
import { RANGES } from './constants'
import type { Range } from './types'

const DEFAULT_RANGE: Range = '1W'
const DEFAULT_GRADE: 'choice' | 'select' = 'choice'
const DEFAULT_IMPS = '109E'

export default function ChartSubprimals() {
  const ranges: Range[] = RANGES

  const [range, setRange] = useState<Range>(DEFAULT_RANGE)
  const [grade, setGrade] = useState<'choice' | 'select'>(DEFAULT_GRADE)
  const [imps, setImps] = useState<string>(DEFAULT_IMPS)
  const [showAm, setShowAm] = useState(true)
  const [showPm, setShowPm] = useState(true)
  const [showTemperature, setShowTemperature] = useState(false)
  const [showDiesel, setShowDiesel] = useState(false)
  const isDesktop = useIsDesktop()
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebarOpen()
  const [pdfOpen, setPdfOpen] = usePersistedBoolean('pdf_open', false)
  const { selectedEventTypes, toggleEventType } = useEventTypeSelection([EVENT_TYPES[0]])

  const weatherEventsEnabled = isWeatherEventRange(range)
  const eventFetchEnabled = weatherEventsEnabled && selectedEventTypes.length > 0

  const data = useChartSubprimalsData({
    grade,
    imps,
    range,
    setImps,
    selectedEventTypes,
    eventFetchEnabled,
    showTemperature,
    showDiesel,
  })

  if (!isDesktop && pdfOpen) {
    return <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
  }

  return (
    <div className={`pdf-layout chart-with-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
      <Sidebar mode="graphs" sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onOpenViewer={() => setPdfOpen(true)} />
      <main className="pdf-content">
        <section className="chart-card subprimals-card" aria-label="Subprimals Chart">
          <div className="chart-controls-panel">
            <Controls
              grade={grade}
              onGradeChange={setGrade}
              imps={imps}
              onImpsChange={setImps}
              options={data.options}
              showTemperature={showTemperature}
              onToggleTemperature={setShowTemperature}
              showDiesel={showDiesel}
              onToggleDiesel={setShowDiesel}
              showAm={showAm}
              onToggleAm={setShowAm}
              showPm={showPm}
              onTogglePm={setShowPm}
              selectedEventTypes={selectedEventTypes}
              onToggleEventType={toggleEventType}
              weatherEventsEnabled={weatherEventsEnabled}
            />

            <ChartLegend
              weatherEventsEnabled={weatherEventsEnabled}
              selectedEventTypes={selectedEventTypes}
              hasDieselSeries={data.diesel.hasSeries}
              hasTemperatureSeries={data.temperature.hasSeries}
            />
          </div>

          <ChartSubprimalsPlot
            domainDates={data.domainDates}
            aligned={data.aligned}
            showAm={showAm}
            showPm={showPm}
            showTemperature={showTemperature}
            showDiesel={showDiesel}
            temperature={data.temperature}
            diesel={data.diesel}
            weather={data.weather}
            eventFetchEnabled={eventFetchEnabled}
            selectedEventTypes={selectedEventTypes}
            sidebarOpen={sidebarOpen}
            range={range}
            loading={data.timeseries.loading}
            error={data.timeseries.error}
          />

          <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />

          <RangeSelector ranges={ranges} selectedRange={range} onSelect={(value) => setRange(value)} />
        </section>
      </main>
    </div>
  )
}
