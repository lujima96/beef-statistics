import type { WorkerFormValues } from './types'
import { toMinutes } from './time'

export function isWorkerFormComplete(values: WorkerFormValues): boolean {
  const hasFirstName = values.firstName.trim().length > 0
  const hasLastName = values.lastName.trim().length > 0
  const hasWage = values.wage.trim().length > 0
  const hasStart = values.start.trim().length > 0
  const hasEnd = values.end.trim().length > 0

  if (!(hasFirstName && hasLastName && hasWage && hasStart && hasEnd)) {
    return false
  }

  return toMinutes(values.end) > toMinutes(values.start)
}

export function isVendorFormComplete(values: {
  locationName: string
  address: string
  windowStart: string
  windowEnd: string
  serviceMinutes: string
}): boolean {
  const hasLocation = values.locationName.trim().length > 0
  const hasAddress = values.address.trim().length > 0
  const hasService = values.serviceMinutes.trim().length > 0

  if (!(hasLocation && hasAddress && hasService)) return false

  return toMinutes(values.windowEnd) > toMinutes(values.windowStart)
}

export function isLikelyStreetAddress(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false

  const basePattern = /^(\d+\s+[A-Za-z0-9][A-Za-z0-9'.\s#-]*)(.*)$/
  const match = normalized.match(basePattern)
  if (!match) {
    return false
  }

  const remainder = match[2] ?? ''
  if (!remainder) {
    return true
  }

  const trailing = remainder.trim()
  if (!trailing.startsWith(',')) {
    return false
  }

  const segments = trailing
    .slice(1)
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  if (segments.length === 0) {
    return false
  }

  return segments.every((segment) => /^[A-Za-z0-9'.\s#-]+$/.test(segment))
}
