export type TemperaturePoint = { date: string; value: number }
export type NullableTemperaturePoint = { date: string; value: number | null }

type NormalizedPoint = { ts: number; value: number }
type DomainPoint = { raw: string; ts: number | null }

function normalizeDate(input: string | null | undefined): { ts: number; iso: string } | null {
  if (!input) return null
  const match = String(input).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  const iso = match[1]
  const ts = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(ts)) return null
  return { ts, iso }
}

function normalizeSeries(series: TemperaturePoint[]): NormalizedPoint[] {
  const map = new Map<number, number>()
  for (const item of series) {
    const normalized = normalizeDate(item?.date)
    const value = Number(item?.value)
    if (!normalized || !Number.isFinite(value)) continue
    map.set(normalized.ts, value)
  }
  return Array.from(map.entries())
    .map(([ts, value]) => ({ ts, value }))
    .sort((a, b) => a.ts - b.ts)
}

function normalizeDomain(domainDates: string[]): DomainPoint[] {
  return domainDates.map((raw) => {
    const normalized = normalizeDate(raw)
    return { raw, ts: normalized ? normalized.ts : null }
  })
}

/**
 * Build a temperature series that aligns 1:1 with the domain dates. Missing
 * dates are filled by averaging the nearest available readings on either side.
 * If only one neighbor exists (leading/trailing gaps), that value is reused.
 */
export function alignTemperatureSeries(domainDates: string[], series: TemperaturePoint[] | null | undefined): NullableTemperaturePoint[] {
  const normalizedSeries = normalizeSeries(series ?? [])
  const normalizedDomain = normalizeDomain(domainDates)

  if (!normalizedSeries.length) {
    return normalizedDomain.map(({ raw }) => ({ date: raw, value: null }))
  }

  let cursor = 0
  return normalizedDomain.map(({ raw, ts }) => {
    if (ts == null) return { date: raw, value: null }

    while (cursor < normalizedSeries.length && normalizedSeries[cursor].ts < ts) cursor++

    const exact = cursor < normalizedSeries.length && normalizedSeries[cursor].ts === ts
      ? normalizedSeries[cursor]
      : null

    if (exact) return { date: raw, value: exact.value }

    const next = cursor < normalizedSeries.length ? normalizedSeries[cursor] : null
    const prev = cursor > 0 ? normalizedSeries[cursor - 1] : null

    if (prev && next) {
      const span = next.ts - prev.ts
      if (span > 0) {
        const t = (ts - prev.ts) / span
        const clampedT = Math.min(Math.max(t, 0), 1)
        return { date: raw, value: prev.value + clampedT * (next.value - prev.value) }
      }
      return { date: raw, value: (prev.value + next.value) / 2 }
    }

    if (prev) return { date: raw, value: prev.value }
    if (next) return { date: raw, value: next.value }
    return { date: raw, value: null }
  })
}
