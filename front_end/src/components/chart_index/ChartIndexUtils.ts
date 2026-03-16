import { Point, Payload, Range } from './ChartIndexTypes'

export const ranges: Range[] = ['1W', '1M', '3M', '1Y', '3Y']
export const DAYS_BY_RANGE: Record<Range, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '3Y': 365 * 3 }

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function alignSeries(series: Point[], domain: string[]) {
  const mp = new Map(series.map(p => [p.date, p.value]))
  return domain.map(d => ({
    date: d, value: ((): number | null => {
      const v = mp.get(d)
      return (typeof v === 'number' && Number.isFinite(v)) ? v : null
    })()
  }))
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

export function formatCurrency(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

export function xFor(i: number, domainDates: string[], innerW: number, padLeft: number) {
  const n = domainDates.length
  if (n <= 1) return padLeft + innerW / 2
  return padLeft + (i * innerW) / (n - 1)
}

export function yFor(v: number, yMin: number, yMax: number, innerH: number, padTop: number) {
  const min = Math.min(yMin, yMax)
  const max = Math.max(yMin, yMax)
  const vv = Math.min(Math.max(v, min), max)
  const t = (vv - min) / Math.max(1e-6, max - min)
  return padTop + (1 - t) * innerH
}

export function pathFor(points: { date: string; value: number | null }[], xFor: (i: number) => number, yFor: (v: number) => number) {
  const cmds: string[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.value == null) continue
    const x = xFor(i)
    const y = yFor(p.value)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (cmds.length === 0 || (i > 0 && points[i - 1].value == null)) cmds.push(`M ${x} ${y}`)
    else cmds.push(`L ${x} ${y}`)
  }
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
  const idx: number[] = []
  const segments = 6
  for (let i = 0; i <= segments; i++) {
    const x = Math.round((i * (n - 1)) / segments)
    if (idx.length === 0 || idx[idx.length - 1] !== x) idx.push(x)
  }
  return new Set(idx)
}
