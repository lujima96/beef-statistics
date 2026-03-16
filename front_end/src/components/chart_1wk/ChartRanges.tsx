import React from 'react'
import { Range } from './Chart1WTypes'

interface ChartRangesProps {
  ranges: readonly Range[]
  range: Range
  onSelect: (range: Range) => void
}

export function ChartRanges({ ranges, range, onSelect }: ChartRangesProps) {
  return (
    <div className="chart-ranges" role="group" aria-label="Range Selector">
      {ranges.map((label) => (
        <button
          key={label}
          type="button"
          className={`range-btn ${range === label ? 'is-active' : ''}`}
          aria-pressed={range === label}
          onClick={() => onSelect(label)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
