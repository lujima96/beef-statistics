import type { EventType } from '../constants/eventTypes'
import type { WeatherMonthlyTotals } from '../hooks/useWeatherOccurrences'

export type WeatherSegment = {
  key: string
  monthStart: string
  eventType: EventType
  count: number
  totalCount: number
  x: number
  width: number
  y: number
  height: number
}

export type WeatherBar = {
  monthStart: string
  x: number
  width: number
  top: number
  bottom: number
  breakdown: Array<{ eventType: EventType; count: number }>
}

export type WeatherGeometry = {
  segments: WeatherSegment[]
  bars: WeatherBar[]
}

type BuildWeatherSegmentsOptions = {
  monthlyTotals: WeatherMonthlyTotals[]
  selectedEventTypes: EventType[]
  domainDates: string[]
  padLeft: number
  innerWidth: number
  innerHeight: number
  baselineY: number
  maxEventCount: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function buildWeatherSegments({
  monthlyTotals,
  selectedEventTypes,
  domainDates,
  padLeft,
  innerWidth,
  innerHeight,
  baselineY,
  maxEventCount,
}: BuildWeatherSegmentsOptions): WeatherGeometry {
  if (!monthlyTotals.length || !selectedEventTypes.length) {
    return { segments: [], bars: [] }
  }
  if (!domainDates.length || innerWidth <= 0 || innerHeight <= 0) {
    return { segments: [], bars: [] }
  }

  const parseMs = (iso: string) => Date.parse(`${iso}T00:00:00`)
  const domainMs = domainDates.map(parseMs)
  const n = domainMs.length
  if (!n) return { segments: [], bars: [] }

  if (!Number.isFinite(maxEventCount) || maxEventCount <= 0) {
    return { segments: [], bars: [] }
  }

  const areaHeight = Math.min(innerHeight * 0.35, Math.max(60, innerHeight * 0.25))
  if (!Number.isFinite(areaHeight) || areaHeight <= 0) {
    return { segments: [], bars: [] }
  }

  const valueScale = (areaHeight / maxEventCount) * 2

  const domainStartMs = domainMs[0]
  const domainEndMs = domainMs[n - 1]
  const domainSpan = Math.max(1, domainEndMs - domainStartMs)

  const minX = padLeft
  const maxX = padLeft + innerWidth
  const dayStep = n > 1 ? innerWidth / Math.max(1, n - 1) : innerWidth

  const computeXFromMs = (ms: number) => {
    const clamped = Math.min(Math.max(ms, domainStartMs), domainEndMs)
    return padLeft + ((clamped - domainStartMs) / domainSpan) * innerWidth
  }

  const monthInfos: Array<{ month: WeatherMonthlyTotals; startMs: number; endMs: number }> = []
  let firstIncluded = false

  for (const month of monthlyTotals) {
    const startMs = parseMs(month.monthStart)
    if (!Number.isFinite(startMs)) continue
    const next = new Date(startMs)
    next.setMonth(next.getMonth() + 1)
    let endMs = next.getTime()
    if (!Number.isFinite(endMs) || endMs <= startMs) endMs = startMs + 30 * MS_PER_DAY
    if (endMs <= domainStartMs || startMs >= domainEndMs + MS_PER_DAY) continue

    if (!firstIncluded) {
      if (startMs < domainStartMs) continue
      firstIncluded = true
    }

    monthInfos.push({ month, startMs, endMs })
  }

  if (!monthInfos.length) {
    return { segments: [], bars: [] }
  }

  monthInfos.sort((a, b) => a.startMs - b.startMs)

  const segments: WeatherSegment[] = []
  const bars: WeatherBar[] = []

  for (const { month, startMs, endMs } of monthInfos) {
    const clippedStart = Math.max(startMs, domainStartMs)
    const clippedEnd = Math.min(endMs, domainEndMs + MS_PER_DAY)
    if (!Number.isFinite(clippedStart) || !Number.isFinite(clippedEnd) || clippedEnd <= clippedStart) {
      continue
    }

    const leftX = computeXFromMs(clippedStart)
    const rightX = computeXFromMs(clippedEnd)
    if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX <= leftX) {
      continue
    }

    const measuredWidth = rightX - leftX
    const baseCenter = leftX + measuredWidth / 2

    let width = Math.max(12, measuredWidth)
    if (dayStep > 0) width = Math.max(width, dayStep * 2)
    width = Math.max(8, width / 2)
    width = Math.min(width, maxX - minX)

    let baseLeft = baseCenter - width / 2
    if (baseLeft < minX) baseLeft = minX
    if (baseLeft + width > maxX) baseLeft = Math.max(minX, maxX - width)

    let cumulativeHeight = 0
    const breakdown: Array<{ eventType: EventType; count: number }> = []

    for (const type of selectedEventTypes) {
      const count = month.totals[type] ?? 0
      if (!Number.isFinite(count) || count <= 0) continue
      const heightPx = count * valueScale
      if (!Number.isFinite(heightPx) || heightPx <= 0) continue
      const y = baselineY - (cumulativeHeight + heightPx)
      segments.push({
        key: `${month.monthStart}-${type}`,
        monthStart: month.monthStart,
        eventType: type,
        count,
        totalCount: month.totalCount,
        x: baseLeft,
        width,
        y,
        height: heightPx,
      })
      breakdown.push({ eventType: type, count })
      cumulativeHeight += heightPx
    }

    if (breakdown.length) {
      bars.push({
        monthStart: month.monthStart,
        x: baseLeft,
        width,
        top: baselineY - cumulativeHeight,
        bottom: baselineY,
        breakdown,
      })
    }
  }

  return { segments, bars }
}
