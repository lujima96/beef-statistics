import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  EVENT_TYPES,
  MAX_EVENT_SELECTIONS,
  type EventType,
} from '../../constants/eventTypes'

const WEATHER_TOOLTIP = 'Weather events are only available for the 1Y and 3Y views.'

type Option = { code: string; label: string }

type Props = {
  grade: 'choice' | 'select'
  onGradeChange: (grade: 'choice' | 'select') => void
  imps: string
  onImpsChange: (code: string) => void
  options: Option[]
  showTemperature: boolean
  onToggleTemperature: (next: boolean) => void
  showDiesel: boolean
  onToggleDiesel: (next: boolean) => void
  showAm: boolean
  onToggleAm: (next: boolean) => void
  showPm: boolean
  onTogglePm: (next: boolean) => void
  selectedEventTypes: EventType[]
  onToggleEventType: (type: EventType) => void
  weatherEventsEnabled: boolean
}

export default function ChartSubprimalsControls({
  grade,
  onGradeChange,
  imps,
  onImpsChange,
  options,
  showTemperature,
  onToggleTemperature,
  showDiesel,
  onToggleDiesel,
  showAm,
  onToggleAm,
  showPm,
  onTogglePm,
  selectedEventTypes,
  onToggleEventType,
  weatherEventsEnabled,
}: Props) {
  const gradeRef = useRef<HTMLDivElement | null>(null)
  const subRef = useRef<HTMLDivElement | null>(null)
  const eventRef = useRef<HTMLDivElement | null>(null)

  const [gradeOpen, setGradeOpen] = useState(false)
  const [subOpen, setSubOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)

  const [showWeatherTooltip, setShowWeatherTooltip] = useState(false)
  const [weatherTooltipPos, setWeatherTooltipPos] = useState({ left: 0, top: 0 })

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      const target = e.target as Node
      if (gradeRef.current && !gradeRef.current.contains(target)) setGradeOpen(false)
      if (subRef.current && !subRef.current.contains(target)) setSubOpen(false)
      if (eventRef.current && !eventRef.current.contains(target)) setEventOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  useEffect(() => {
    if (!weatherEventsEnabled) setEventOpen(false)
    if (weatherEventsEnabled) setShowWeatherTooltip(false)
  }, [weatherEventsEnabled])

  const eventButtonLabel = useMemo(() => {
    if (selectedEventTypes.length === 0) return 'Select Weather Events'
    if (selectedEventTypes.length === 1) return selectedEventTypes[0]
    return `${selectedEventTypes.length} Selected`
  }, [selectedEventTypes])

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

  return (
    <>
      <div className="chart-controls" ref={gradeRef}>
        <div className="control-group">
          <div className="control-label">Grade</div>
          <button
            type="button"
            className="dropdown-btn"
            aria-haspopup="listbox"
            aria-expanded={gradeOpen}
            onClick={() => setGradeOpen((v) => !v)}
          >
            {grade === 'choice' ? 'Choice' : 'Select'}
            <span className="caret" aria-hidden>▾</span>
          </button>
          {gradeOpen && (
            <div className="dropdown-menu" role="listbox" aria-label="Select grade">
              <button
                type="button"
                role="option"
                aria-selected={grade === 'choice'}
                className={`dropdown-item ${grade === 'choice' ? 'is-active' : ''}`}
                onClick={() => {
                  onGradeChange('choice')
                  setGradeOpen(false)
                }}
              >
                Choice
              </button>
              <button
                type="button"
                role="option"
                aria-selected={grade === 'select'}
                className={`dropdown-item ${grade === 'select' ? 'is-active' : ''}`}
                onClick={() => {
                  onGradeChange('select')
                  setGradeOpen(false)
                }}
              >
                Select
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="chart-controls-temp">
        <div className="control-group check-group temperature-toggle">
          <div className="control-label">Temperature</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showTemperature}
              onChange={(e) => onToggleTemperature(e.target.checked)}
            />
          </label>
        </div>
        <div className="control-group check-group diesel-toggle">
          <div className="control-label">Diesel</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showDiesel}
              onChange={(e) => onToggleDiesel(e.target.checked)}
            />
          </label>
        </div>
      </div>

      <div className="chart-controls-mid" ref={subRef}>
        <div className="control-group">
          <div className="control-label">Sub Primal</div>
          <button
            type="button"
            className="dropdown-btn wide"
            aria-haspopup="listbox"
            aria-expanded={subOpen}
            onClick={() => setSubOpen((v) => !v)}
          >
            {imps}
            <span className="caret" aria-hidden>▾</span>
          </button>
          {subOpen && (
            <div className="dropdown-menu dropdown-scroll" role="listbox" aria-label="Select sub primal">
              {options.map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={imps === code}
                  className={`dropdown-item ${imps === code ? 'is-active' : ''}`}
                  onClick={() => {
                    onImpsChange(code)
                    setSubOpen(false)
                  }}
                >
                  {code} — {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="chart-controls-center">
        <div className="control-group check-group">
          <div className="control-label">AM</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showAm}
              onChange={(e) => onToggleAm(e.target.checked)}
            />
          </label>
        </div>
        <div className="control-group check-group">
          <div className="control-label">PM</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showPm}
              onChange={(e) => onTogglePm(e.target.checked)}
            />
          </label>
        </div>
        <div
          className={`control-group event-type-control ${weatherEventsEnabled ? '' : 'is-disabled'}`.trim()}
          ref={eventRef}
          onMouseEnter={showWeatherEventsTooltip}
          onMouseLeave={hideWeatherEventsTooltip}
        >
          <div className="control-label">Weather Events</div>
          <button
            type="button"
            className={`dropdown-btn event-type ${weatherEventsEnabled ? '' : 'is-disabled'}`.trim()}
            aria-haspopup="listbox"
            aria-expanded={weatherEventsEnabled && eventOpen}
            aria-disabled={!weatherEventsEnabled}
            onClick={() => {
              if (!weatherEventsEnabled) return
              setEventOpen((v) => !v)
            }}
            onFocus={showWeatherEventsTooltip}
            onBlur={hideWeatherEventsTooltip}
          >
            {eventButtonLabel}
            <span className="caret" aria-hidden>▾</span>
          </button>
          {weatherEventsEnabled && eventOpen && (
            <div
              className="dropdown-menu dropdown-scroll"
              role="listbox"
              aria-label="Select weather events"
              aria-multiselectable="true"
            >
              {EVENT_TYPES.map((type) => {
                const selected = selectedEventTypes.includes(type)
                const disableOption = !selected && selectedEventTypes.length >= MAX_EVENT_SELECTIONS
                return (
                  <label
                    key={type}
                    className={`dropdown-item checkbox-option ${selected ? 'is-active' : ''} ${disableOption ? 'is-disabled' : ''}`.trim()}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disableOption}
                      onChange={() => onToggleEventType(type)}
                    />
                    <span>{type}</span>
                  </label>
                )
              })}
            </div>
          )}
          {!weatherEventsEnabled && showWeatherTooltip && typeof document !== 'undefined' &&
            createPortal(
              <div
                className="tooltip-bubble"
                role="tooltip"
                style={{ left: `${weatherTooltipPos.left}px`, top: `${weatherTooltipPos.top}px`, transform: 'translateX(-50%)' }}
              >
                {WEATHER_TOOLTIP}
              </div>,
              document.body
            )}
        </div>
      </div>
    </>
  )
}
