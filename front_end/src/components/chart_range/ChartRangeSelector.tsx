import React from 'react'
import { Range } from './ChartRangeTypes'
import { ranges } from './ChartRangeConstants'

interface ChartRangeSelectorProps {
  currentRange: Range
  onSelect: (range: Range) => void
}

export default function ChartRangeSelector({ currentRange, onSelect }: ChartRangeSelectorProps) {
  return (
    <div className="chart-ranges" role="group" aria-label="Range Selector">
      {ranges.map((label) => (
        <button
          key={label}
          type="button"
          className={`range-btn ${currentRange === label ? 'is-active' : ''}`}
          aria-pressed={currentRange === label}
          onClick={() => onSelect(label)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
