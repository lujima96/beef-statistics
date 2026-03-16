import React from 'react'

interface ChartLegendProps {
  hasDieselSeries: boolean
}

export default function ChartLegend({ hasDieselSeries }: ChartLegendProps) {
  return (
    <div className="chart-legend" aria-label="Legend">
      <div className="legend-title">Legend</div>
      <div className="legend-row">
        <div className="legend-item">
          <span className="legend-line am" aria-hidden></span>
          <span className="legend-text">AM</span>
        </div>
        <div className="legend-item">
          <span className="legend-line pm" aria-hidden></span>
          <span className="legend-text">PM</span>
        </div>
        <div className="legend-item" aria-disabled={!hasDieselSeries}>
          <span className="legend-line diesel" aria-hidden></span>
          <span className="legend-text">Diesel</span>
        </div>
      </div>
    </div>
  )
}
