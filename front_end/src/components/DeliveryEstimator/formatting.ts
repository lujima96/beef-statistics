import type { Worker } from './types'

export function normalizeWage(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withoutPrefix = trimmed.replace(/^\$+/, '')
  if (!withoutPrefix) return '$'

  const sanitized = withoutPrefix.replace(/[^0-9.]/g, '')
  if (!sanitized || !/[0-9]/.test(sanitized)) {
    return `$${withoutPrefix}`
  }

  const numericValue = Number(sanitized)
  if (Number.isFinite(numericValue)) {
    return `$${numericValue.toFixed(2)}`
  }

  return `$${withoutPrefix}`
}

export function formatWageDisplay(value: string): string {
  const normalized = normalizeWage(value)
  return normalized || '—'
}

export function formatWorkerName(worker: Pick<Worker, 'firstName' | 'lastName'>): string {
  const first = worker.firstName.trim()
  const last = worker.lastName.trim()
  if (!first && !last) return '—'
  return [first, last].filter(Boolean).join(' ')
}

export function formatServiceMinutesDisplay(serviceMinutes: number | null, fallback: string): string {
  if (typeof serviceMinutes === 'number' && Number.isFinite(serviceMinutes)) {
    return `${serviceMinutes} min`
  }
  const trimmed = fallback.trim()
  if (!trimmed) return '—'
  return /min$/i.test(trimmed) ? trimmed : `${trimmed} min`
}

export function formatCoordinateDisplay(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toFixed(6)
}

export function formatCoordinatePair(latitude: number | null, longitude: number | null): string {
  const latDisplay = formatCoordinateDisplay(latitude)
  const lonDisplay = formatCoordinateDisplay(longitude)
  if (latDisplay === '—' && lonDisplay === '—') {
    return '—'
  }
  if (latDisplay === '—') {
    return `Lon ${lonDisplay}`
  }
  if (lonDisplay === '—') {
    return `Lat ${latDisplay}`
  }
  return `${latDisplay}, ${lonDisplay}`
}

export function formatSequenceDisplay(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${value}`
}

export function formatClockMinutes(minutes: number | null): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return '—'
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const mins = Math.abs(rounded % 60)
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function formatDurationSeconds(seconds: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '—'
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (hours > 0) {
    parts.push(`${hours} hr${hours === 1 ? '' : 's'}`)
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} min`)
  }
  return parts.join(' ')
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return CURRENCY_FORMATTER.format(value)
}

export function formatDistanceMeters(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const miles = value * 0.000621371
  return `${miles.toFixed(1)} mi`
}
