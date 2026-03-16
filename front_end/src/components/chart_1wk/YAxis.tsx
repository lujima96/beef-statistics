import React, { useMemo } from 'react'
import { niceTicks, formatCurrency } from './Chart1WUtils'

export function YAxis(props: { leftPad: number; topPad: number; bottomPad: number; yMin: number; yMax: number, tickCount?: number }) {
  const { yMin, yMax, tickCount, topPad, bottomPad } = props
  const ticks = useMemo(() => niceTicks(yMin, yMax, tickCount ?? 11), [yMin, yMax, tickCount])
  return (
    <div
      className="y-axis"
      aria-hidden="true"
      style={{ paddingTop: `${topPad}px`, paddingBottom: `${bottomPad}px` }}
    >
      {ticks.slice().reverse().map((v) => (
        <div key={v} className="y-axis-label">{formatCurrency(v)}</div>
      ))}
    </div>
  )
}
