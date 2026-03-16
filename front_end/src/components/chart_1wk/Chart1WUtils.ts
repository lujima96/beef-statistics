import { Point, SeriesPayload } from './Chart1WTypes'
import { dayNames, MIN_SPAN, ZOOM_STEP, PRIMAL_MAP } from './constants'

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
  const mm = dt.getMonth() + 1
  const dd = dt.getDate()
  const day = dayNames[dt.getDay()]
  return `${day} ${mm}/${dd}`
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
  // Ensure first and last are within range
  while (values.length > count) values.pop()
  if (values.length < count) {
    // Try to pad with additional ticks if too few
    const needed = count - values.length
    for (let i = 1; i <= needed; i++) values.push(values[values.length - 1] + step)
  }
  return values.slice(0, count)
}

export function alignSeries(series: Point[], domain: string[]) {
  const byDate = new Map(series.map((p) => [p.date, p.value]))
  return domain.map((d) => {
    const raw = byDate.get(d)
    const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    return { date: d, value: val as number | null }
  })
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

export function yFromClient(clientY: number, plotRef: React.RefObject<HTMLDivElement>, yMin: number, yMax: number, innerH: number, padTop: number) {
  const rect = plotRef.current?.getBoundingClientRect()
  if (!rect) return (yMin + yMax) / 2
  const y = clientY - rect.top
  const min = Math.min(yMin, yMax)
  const max = Math.max(yMin, yMax)
  const t = 1 - (y - padTop) / Math.max(1, innerH)
  return min + t * (max - min)
}

export function zoomY(anchorValue: number, factor: number, yMin: number, yMax: number, setYMin: (n: number) => void, setYMax: (n: number) => void) {
  // factor < 1 zooms in, > 1 zooms out
  const min = Math.min(yMin, yMax)
  const max = Math.max(yMin, yMax)
  const span = Math.max(MIN_SPAN, max - min)
  const a = isFinite(anchorValue) ? anchorValue : (min + max) / 2
  const newMin = a - (a - min) * factor
  const newMax = a + (max - a) * factor
  if (!Number.isFinite(newMin) || !Number.isFinite(newMax)) return
  if (newMax - newMin < MIN_SPAN) return
  setYMin(newMin)
  setYMax(newMax)
}

export function autoFitY(
  grade: 'choice' | 'select' | 'both',
  showAm: boolean,
  showPm: boolean,
  alignedChoice: SeriesPayload,
  alignedSelect: SeriesPayload,
  setYMin: (n: number) => void,
  setYMax: (n: number) => void,
  setBaseY: (o: { min: number; max: number } | null) => void,
  setTickCount: (n: number) => void,
  setZoomLevel: (n: number) => void
) {
  const vals: number[] = []
  const includeChoice = grade === 'choice' || grade === 'both'
  const includeSelect = grade === 'select' || grade === 'both'
  if (includeChoice) {
    if (showAm) alignedChoice.am.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    if (showPm) alignedChoice.pm.forEach(p => { if (p.value != null) vals.push(p.value as number) })
  }
  if (includeSelect) {
    if (showAm) alignedSelect.am.forEach(p => { if (p.value != null) vals.push(p.value as number) })
    if (showPm) alignedSelect.pm.forEach(p => { if (p.value != null) vals.push(p.value as number) })
  }
  if (vals.length === 0) { setYMin(0); setYMax(1); return }
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) { min -= 0.5; max += 0.5 }
  // Add padding appropriate for $/lb scale
  const span = Math.max(1e-6, max - min)
  const pad = Math.max(0.1 * span, 0.25)
  const fitMin = min - pad
  const fitMax = max + pad
  setYMin(fitMin)
  setYMax(fitMax)
  setBaseY({ min: fitMin, max: fitMax })
  // Reset tick density
  setTickCount(11)
  // Reset zoom level to baseline
  setZoomLevel(0)
}
