import React from 'react'
import { EVENT_TYPE_COLORS, type EventType } from '../../constants/eventTypes'

type Chart5DayAvgLegendProps = {
  hasDieselSeries: boolean
  hasTemperatureSeries: boolean
  weatherEventsEnabled: boolean
  selectedEventTypes: EventType[]
}

const Chart5DayAvgLegend: React.FC<Chart5DayAvgLegendProps> = ({
  hasDieselSeries,
  hasTemperatureSeries,
  weatherEventsEnabled,
  selectedEventTypes,
}) => (
  <div className="chart-legend" aria-label="Legend">
    <div className="legend-title">Legend</div>
    <div className="legend-row">
      <div className="legend-item">
        <span className="legend-line am" aria-hidden></span>
        <span className="legend-text">Steer</span>
      </div>
      <div className="legend-item">
        <span className="legend-line pm" aria-hidden></span>
        <span className="legend-text">Heifer</span>
      </div>
      <div className="legend-item" aria-disabled={!hasDieselSeries}>
        <span className="legend-line diesel" aria-hidden></span>
        <span className="legend-text">Diesel</span>
      </div>
      <div className="legend-item" aria-disabled={!hasTemperatureSeries}>
        <span className="legend-line temperature" aria-hidden></span>
        <span className="legend-text">Temperature</span>
      </div>
    </div>
    {weatherEventsEnabled && selectedEventTypes.length > 0 && (
      <div className="legend-row weather-legend">
        {selectedEventTypes.map((type) => (
          <div key={type} className="legend-item weather-item">
            <span
              className="legend-swatch"
              aria-hidden
              style={{ backgroundColor: EVENT_TYPE_COLORS[type] || '#555555' }}
            ></span>
            <span className="legend-text">{type}</span>
          </div>
        ))}
      </div>
    )}
  </div>
)

export default Chart5DayAvgLegend
