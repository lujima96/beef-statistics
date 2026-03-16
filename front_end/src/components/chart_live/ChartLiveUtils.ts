import { Point, Range, View } from './ChartLiveTypes'

export const ranges: Range[] = ['1W', '1M', '3M', '1Y', '3Y']
export const DAYS_BY_RANGE: Record<Range, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '3Y': 365 * 3 }

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function align(series: Point[], domain: string[]) {
  const mp = new Map(series.map(p => [p.date, p.value]))
  return domain.map(d => ({
    date: d, value: ((): number | null => {
      const v = mp.get(d)
      return (typeof v === 'number' && Number.isFinite(v)) ? v : null
    })()
  }))
}

export function interpolate(points: { date: string; value: number | null }[]) {
  const out = points.map(p => ({ ...p }))
  let i = 0
  while (i < out.length) {
    if (out[i].value != null) { i++; continue }
    // start of a gap
    const start = i - 1 // may be -1 if leading gap
    let j = i
    while (j < out.length && out[j].value == null) j++
    const end = j // first non-null after gap or out.length
    const prevVal = start >= 0 ? (out[start].value as number) : null
    const nextVal = end < out.length ? (out[end].value as number) : null
    const gapLen = end - i
    for (let k = 0; k < gapLen; k++) {
      const idx = i + k
      if (prevVal != null && nextVal != null) {
        const t = (k + 1) / (gapLen + 1)
        out[idx].value = prevVal + t * (nextVal - prevVal)
      } else if (prevVal != null) {
        out[idx].value = prevVal
      } else if (nextVal != null) {
        out[idx].value = nextVal
      } else {
        out[idx].value = null
      }
    }
    i = end
  }
  return out
}

// Remove improbable spikes using local neighbors. If a value deviates too
// far from the average of the nearest non-null neighbors, mark it null so
// interpolation can fill the gap smoothly.
export function despike(points: { date: string; value: number | null }[]) {
  const out = points.map(p => ({ ...p }))
  const n = out.length
  const prevIdx = (i: number) => { for (let k=i-1;k>=0;k--) if (out[k].value!=null) return k; return -1 }
  const nextIdx = (i: number) => { for (let k=i+1;k<n;k++) if (out[k].value!=null) return k; return -1 }
  for (let i = 0; i < n; i++) {
    const v = out[i].value
    if (v == null) continue
    const pi = prevIdx(i)
    const ni = nextIdx(i)
    const havePrev = pi >= 0
    const haveNext = ni >= 0
    let expected: number | null = null
    if (havePrev && haveNext) expected = ((out[pi].value as number) + (out[ni].value as number)) / 2
    else if (havePrev) expected = out[pi].value as number
    else if (haveNext) expected = out[ni].value as number
    if (expected == null) continue
    const diff = Math.abs(v - expected)
    // Tighten thresholds so single-day bad points are removed across ranges
    const thresh = Math.max(0.20, 0.15 * Math.abs(expected))
    if (diff > thresh) out[i].value = null
  }
  return out
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
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) } catch { return `${n.toFixed(2)}` }
}

export function formatTemperature(n: number): string {
  if (!Number.isFinite(n)) return '--'
  return `${n.toFixed(1)}°F`
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

export const sX = (x: number, view: View) => view.tx + view.scale * x

export const yFor = (v: number, yMin: number, yMax: number, innerH: number, padTop: number) => {
  const min = Math.min(yMin, yMax)
  const max = Math.max(yMin, yMax)
  const vv = Math.min(Math.max(v, min), max)
  const t = (vv - min) / Math.max(1e-6, max - min)
  return padTop + (1 - t) * innerH
}

export function path(points: Array<{ value: number | null }>, sX: (x: number) => number, xFor: (i: number) => number, yFor: (v: number) => number) {
  const cmds: string[] = []
  for (let i = 0; i < points.length; i++) {
    const v = points[i].value
    if (v == null) continue
    const X = sX(xFor(i)), Y = yFor(v)
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue
    if (cmds.length === 0 || (i > 0 && points[i - 1].value == null)) cmds.push(`M ${X} ${Y}`)
    else cmds.push(`L ${X} ${Y}`)
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
