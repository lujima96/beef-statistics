import React from 'react'
import { ranges } from './Chart5DayAvgUtils'
import type { Range } from './Chart5DayAvgTypes'

type Chart5DayAvgRangesProps = {
  range: Range
  onSelectRange: (range: Range) => void
}

const Chart5DayAvgRanges: React.FC<Chart5DayAvgRangesProps> = ({ range, onSelectRange }) => (
  <div className="chart-ranges" role="group" aria-label="Range Selector">
    {ranges.map((label) => (
      <button
        key={label}
        type="button"
        className={`range-btn ${range === label ? 'is-active' : ''}`}
        aria-pressed={range === label}
        onClick={() => onSelectRange(label)}
      >
        {label}
      </button>
    ))}
  </div>
)

export default Chart5DayAvgRanges
