import React from 'react'

import type { Range } from './types'

type Props = {
  ranges: Range[]
  selectedRange: Range
  onSelect: (range: Range) => void
}

export default function RangeSelector({ ranges, selectedRange, onSelect }: Props) {
  return (
    <div className="chart-ranges" role="group" aria-label="Range Selector">
      {ranges.map((label) => (
        <button
          key={label}
          type="button"
          className={`range-btn ${selectedRange === label ? 'is-active' : ''}`}
          aria-pressed={selectedRange === label}
          onClick={() => onSelect(label)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
