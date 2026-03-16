import type { Point, SeriesPayload, AlignedPoint, AlignedSeries, Range } from './types'
import { DAYS_BY_RANGE } from './constants'

function parseIsoDate(value: string): Date | null {
  if (!value) return null
  const dt = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(dt.getTime()) ? dt : null
}

export function niceTicks(min: number, max: number, count: number): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0]
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  const step0 = span / Math.max(1, count - 1)
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const err = step0 / mag
  let step: number
  if (err >= 7.5) step = 10 * mag
  else if (err >= 3.5) step = 5 * mag
  else if (err >= 1.5) step = 2 * mag
  else step = mag
  const start = Math.floor(min / step) * step
  const values: number[] = []
  for (let v = start; v <= max + 0.5 * step; v += step) values.push(v)
  while (values.length > count) values.pop()
  if (values.length < count) {
    const needed = count - values.length
    for (let i = 1; i <= needed; i++) values.push(values[values.length - 1] + step)
  }
  return values.slice(0, count)
}

// Evenly spaced ticks spanning exactly [min, max] with fixed count.
export function linearTicks(min: number, max: number, count: number): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0]
  if (count <= 1) return [min]
  if (min === max) { min -= 1; max += 1 }
  const step = (max - min) / (count - 1)
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(min + i * step)
  return out
}

export function buildDomainDates(data: SeriesPayload | null, range: Range): string[] {
  if (!data) return []
  const dates = new Set<string>()
  for (const p of data.am) dates.add(p.date)
  for (const p of data.pm) dates.add(p.date)
  const sorted = Array.from(dates).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  if (sorted.length === 0) return []

  const latest = parseIsoDate(sorted[sorted.length - 1])
  if (!latest) return sorted

  const cutoff = new Date(latest)
  cutoff.setUTCDate(cutoff.getUTCDate() - (DAYS_BY_RANGE[range] - 1))

  return sorted.filter((value) => {
    const dt = parseIsoDate(value)
    return dt != null && dt >= cutoff
  })
}

export function alignSeries(series: Point[], domain: string[]): AlignedPoint[] {
  const byDate = new Map(series.map((p) => [p.date, p.value]))
  return domain.map((d) => {
    const raw = byDate.get(d)
    const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    return { date: d, value: val as number | null }
  })
}

export function computeAligned(data: SeriesPayload | null, domainDates: string[]): AlignedSeries {
  if (!data) return { am: [], pm: [] as AlignedPoint[] }
  const prepRaw = (arr: Point[]) =>
    arr
      .filter(p => Number.isFinite(p.value) && p.value !== 0)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const amRaw = prepRaw(data.am)
  const pmRaw = prepRaw(data.pm)
  const rawDates = (raw: Point[]) => raw.map(p => p.date)
  const amDates = rawDates(amRaw)
  const pmDates = rawDates(pmRaw)
  const amMap = new Map(amRaw.map(p => [p.date, p.value]))
  const pmMap = new Map(pmRaw.map(p => [p.date, p.value]))
  const lowerBound = (arr: string[], target: string) => {
    let lo = 0, hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid] < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  function prevDay(dateStr: string): string {
    const dt = new Date(dateStr + 'T00:00:00')
    dt.setDate(dt.getDate() - 1)
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  function interpolateZeros(points: AlignedPoint[], raw: Point[], rawDateIdx: string[], rawMapInst: Map<string, number>): AlignedPoint[] {
    const out = points.map(p => ({ ...p }))
    const validIdx: number[] = []
    for (let i = 0; i < out.length; i++) {
      const v = out[i].value
      if (v != null && Number.isFinite(v) && v !== 0) validIdx.push(i)
    }
    for (let i = 0; i < out.length; i++) {
      const v = out[i].value
      if (v == null || v === 0) {
        let a: number | null = null
        let b: number | null = null
        // domain-neighbor non-zeros for speed
        let lo = 0, hi = validIdx.length - 1, firstGE = validIdx.length
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (validIdx[mid] >= i) { firstGE = mid; hi = mid - 1 } else { lo = mid + 1 }
        }
        if (firstGE - 1 >= 0) a = out[validIdx[firstGE - 1]].value as number
        if (firstGE < validIdx.length) b = out[validIdx[firstGE]].value as number
        // leading zero fallback to previous day in raw
        if (i === 0) {
          const prev = prevDay(out[i].date)
          const pv = rawMapInst.get(prev)
          if (pv != null && pv !== 0 && Number.isFinite(pv)) a = pv
        }
        if ((a == null || b == null)) {
          const d = out[i].date
          const idx = lowerBound(rawDateIdx, d)
          if (idx - 1 >= 0) a = raw[idx - 1]?.value ?? a
          if (idx < raw.length) b = raw[idx]?.value ?? b
        }
        if (a != null && b != null) out[i].value = (a + b) / 2
        else if (a != null) out[i].value = a
        else if (b != null) out[i].value = b
      }
    }
    return out
  }
  const amAligned = alignSeries(data.am, domainDates)
  const pmAligned = alignSeries(data.pm, domainDates)
  return {
    am: interpolateZeros(amAligned, amRaw, amDates, amMap),
    pm: interpolateZeros(pmAligned, pmRaw, pmDates, pmMap),
  }
}
