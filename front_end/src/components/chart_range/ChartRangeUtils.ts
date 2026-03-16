import { Point, SeriesPayload, Range } from './ChartRangeTypes'
import { DAYS_BY_RANGE } from './ChartRangeConstants'

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

export function linearTicks(min: number, max: number, count: number): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0]
  if (count <= 1) return [min]
  if (min === max) { min -= 1; max += 1 }
  const step = (max - min) / (count - 1)
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(min + i * step)
  return out
}

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatCurrency(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

export function formatDateLabel(dateStr: string): string {
  const dt = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return dateStr
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

export function alignSeries(series: Point[], domain: string[]) {
  const byDate = new Map(series.map((p) => [p.date, p.value]))
  return domain.map((d) => {
    const raw = byDate.get(d)
    const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    return { date: d, value: val as number | null }
  })
}

export function prevDay(dateStr: string): string {
  const dt = new Date(dateStr + 'T00:00:00')
  dt.setDate(dt.getDate() - 1)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fillMissing(points: { date: string; value: number | null }[], raw: Point[], rawDates: string[], rawMapInst: Map<string, number>) {
  const out = points.map(p => ({ ...p }))
  // Precompute domain valid (non-zero) indices
  const validIdx: number[] = []
  for (let i = 0; i < out.length; i++) {
    const v = out[i].value
    if (v != null && Number.isFinite(v) && v !== 0) validIdx.push(i)
  }
  for (let i = 0; i < out.length; i++) {
    const cur = out[i]
    const isMissing = cur.value == null || cur.value === 0
    if (!isMissing) continue
    let a: number | null = null
    let b: number | null = null
    // Domain neighbors
    let lo = 0, hi = validIdx.length - 1, firstGE = validIdx.length
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (validIdx[mid] >= i) { firstGE = mid; hi = mid - 1 } else { lo = mid + 1 }
    }
    if (firstGE - 1 >= 0) a = out[validIdx[firstGE - 1]].value as number
    if (firstGE < validIdx.length) b = out[validIdx[firstGE]].value as number
    // Leading missing point: prefer exact previous calendar day
    if (i === 0) {
      const prev = prevDay(cur.date)
      const pv = rawMapInst.get(prev)
      if (pv != null && pv !== 0 && Number.isFinite(pv)) a = pv
    }
    // Fallback to raw prev/next across full window
    if (a == null || b == null) {
      const idx = lowerBound(rawDates, cur.date)
      if (a == null && idx - 1 >= 0) a = raw[idx - 1]?.value ?? null
      if (b == null && idx < raw.length) b = raw[idx]?.value ?? null
    }
    // Assign
    if (a != null && b != null) out[i].value = (a + b) / 2
    else if (a != null) out[i].value = a
    else if (b != null) out[i].value = b
    // else leave as null (no data at all)
  }
  return out
}

function lowerBound(arr: string[], target: string) {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export const clampTranslate = (tx: number, scale: number, plotSizeW: number, padLeft: number, padRight: number) => {
  const W = plotSizeW
  const left = padLeft
  const right = W - padRight
  const minTx = Math.min((1 - scale) * right, (1 - scale) * left)
  const maxTx = Math.max((1 - scale) * right, (1 - scale) * left)
  return { tx: clamp(tx, minTx, maxTx) }
}

export const xFor = (i: number, domainDates: string[], innerW: number, padLeft: number) => {
  const n = domainDates.length
  if (n <= 1) return padLeft + innerW / 2
  return padLeft + (i * innerW) / (n - 1)
}

export const yFor = (v: number, yMin: number, yMax: number, innerH: number, padTop: number) => {
  const min = Math.min(yMin, yMax)
  const max = Math.max(yMin, yMax)
  const vv = Math.min(Math.max(v, min), max)
  const t = (vv - min) / Math.max(1e-6, max - min)
  return padTop + (1 - t) * innerH
}

export const sX = (x: number, viewScale: number, viewTx: number) => viewTx + viewScale * x
export const sY = (y: number) => y

export function pathFor(points: { date: string; value: number | null }[], sX: (x: number) => number, xFor: (i: number) => number, yFor: (v: number) => number) {
  // Build continuous path by connecting across gaps (nulls)
  const coords: Array<{ x: number; y: number }> = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.value == null) continue
    const x = sX(xFor(i))
    const y = yFor(p.value)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    coords.push({ x, y })
  }
  if (coords.length === 0) return ''
  const cmds: string[] = [`M ${coords[0].x} ${coords[0].y}`]
  for (let k = 1; k < coords.length; k++) cmds.push(`L ${coords[k].x} ${coords[k].y}`)
  return cmds.join(' ')
}

export const xLabelFmt = (d: string) => {
  const dt = new Date(d + 'T00:00:00')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

export const getXLabelIndices = (domainDates: string[]) => {
  const n = domainDates.length
  if (n === 0) return new Set<number>()
  if (n <= 7) return new Set(Array.from({ length: n }, (_, i) => i))
  // Evenly pick 7 indices across 0..n-1 (inclusive)
  const idx: number[] = []
  const segments = 6 // 7 labels => 6 intervals
  for (let i = 0; i <= segments; i++) {
    const x = Math.round((i * (n - 1)) / segments)
    if (idx.length === 0 || idx[idx.length - 1] !== x) idx.push(x)
  }
  return new Set(idx)
}
