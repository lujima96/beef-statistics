import React from 'react'
import { createPortal } from 'react-dom'
import { EVENT_TYPES, MAX_EVENT_SELECTIONS, type EventType } from '../../constants/eventTypes'

export type ChartLiveControlsProps = {
  showTemperature: boolean
  onToggleTemperature: (value: boolean) => void
  showDiesel: boolean
  onToggleDiesel: (value: boolean) => void
  showSteer: boolean
  onToggleSteer: (value: boolean) => void
  showHeifer: boolean
  onToggleHeifer: (value: boolean) => void
  weatherEventsEnabled: boolean
  eventOpen: boolean
  onToggleEventOpen: () => void
  selectedEventTypes: EventType[]
  onToggleEventType: (type: EventType) => void
  eventButtonLabel: string
  eventRef: React.RefObject<HTMLDivElement>
  showWeatherTooltip: boolean
  weatherTooltipPos: { left: number; top: number }
  weatherEventsTooltip: string
  showWeatherEventsTooltip: () => void
  hideWeatherEventsTooltip: () => void
}

export default function ChartLiveControls({
  showTemperature,
  onToggleTemperature,
  showDiesel,
  onToggleDiesel,
  showSteer,
  onToggleSteer,
  showHeifer,
  onToggleHeifer,
  weatherEventsEnabled,
  eventOpen,
  onToggleEventOpen,
  selectedEventTypes,
  onToggleEventType,
  eventButtonLabel,
  eventRef,
  showWeatherTooltip,
  weatherTooltipPos,
  weatherEventsTooltip,
  showWeatherEventsTooltip,
  hideWeatherEventsTooltip,
}: ChartLiveControlsProps) {
  return (
    <>
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

      <div className="chart-controls-center">
        <div className="control-group check-group">
          <div className="control-label">Steer</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showSteer}
              onChange={(e) => onToggleSteer(e.target.checked)}
            />
          </label>
        </div>
        <div className="control-group check-group">
          <div className="control-label">Heifer</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showHeifer}
              onChange={(e) => onToggleHeifer(e.target.checked)}
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
              onToggleEventOpen()
            }}
            onFocus={showWeatherEventsTooltip}
            onBlur={hideWeatherEventsTooltip}
          >
            {eventButtonLabel}
            <span className="caret" aria-hidden>
              ▾
            </span>
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
                style={{
                  left: `${weatherTooltipPos.left}px`,
                  top: `${weatherTooltipPos.top}px`,
                  transform: 'translateX(-50%)',
                }}
              >
                {weatherEventsTooltip}
              </div>,
              document.body,
            )}
        </div>
      </div>
    </>
  )
}
