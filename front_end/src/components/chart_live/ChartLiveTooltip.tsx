import React from 'react'
import { formatCurrency, formatTemperature, xLabelFmt } from './ChartLiveUtils'
import { type Hover } from './ChartLiveTypes'

type ChartLiveTooltipProps = {
  hover: Hover
  pad: { top: number; bottom: number; left: number; right: number }
  getXFor: (index: number) => number
  getSX: (x: number) => number
  getYFor: (value: number) => number
  getTempYFor: (value: number) => number
  getDieselYFor: (value: number) => number
}

export default function ChartLiveTooltip({
  hover,
  pad,
  getXFor,
  getSX,
  getYFor,
  getTempYFor,
  getDieselYFor,
}: ChartLiveTooltipProps) {
  if (!hover) return null

  const isWeather = hover.series === 'weather'
  const left = isWeather ? hover.mouseX : getSX(getXFor(hover.index))
  const top = isWeather
    ? Math.max(0, hover.mouseY - 16)
    : hover.series === 'temperature'
      ? getTempYFor(hover.value)
      : hover.series === 'diesel'
        ? getDieselYFor(hover.value)
        : getYFor(hover.value)

  return (
    <div className="chart-tooltip" style={{ left: `${left}px`, top: `${top}px` }}>
      <div className="chart-tooltip-content">
        {isWeather ? (
          <>
            <div className="chart-tooltip-line">
              <strong>{xLabelFmt(hover.monthStart)}</strong>
            </div>
            {hover.breakdown
              .slice()
              .sort((a, b) => b.count - a.count)
              .map(({ eventType, count }) => (
                <div key={eventType} className="chart-tooltip-line">
                  {eventType}: {count.toLocaleString()}
                </div>
              ))}
            <div className="chart-tooltip-value">
              Total: {hover.breakdown.reduce((sum, item) => sum + item.count, 0).toLocaleString()}
            </div>
          </>
        ) : (
          <>
            <div className="chart-tooltip-line">{xLabelFmt(hover.date)}</div>
            <div className="chart-tooltip-line">
              {hover.series === 'steer'
                ? 'Steer'
                : hover.series === 'heifer'
                  ? 'Heifer'
                  : hover.series === 'diesel'
                    ? 'Diesel'
                    : 'Temperature'}
            </div>
            <div className="chart-tooltip-value">
              {hover.series === 'temperature'
                ? formatTemperature(hover.value)
                : hover.series === 'diesel'
                  ? `${formatCurrency(hover.value)} / gal`
                  : formatCurrency(hover.value)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
