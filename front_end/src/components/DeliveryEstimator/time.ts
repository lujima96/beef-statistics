import { DEFAULT_END, DEFAULT_START, TIME_OPTIONS } from './constants'

export function ensureValidTime(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  return TIME_OPTIONS.some((opt) => opt.value === value) ? value : fallback
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toMinutes(value: string): number {
  const [hh, mm] = value.split(':')
  const hours = Number(hh)
  const minutes = Number(mm)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

export function getLabel(value: string): string {
  const match = TIME_OPTIONS.find((opt) => opt.value === value)
  return match ? match.label : value
}

export function ensureValidTimeWithDefault(value: string | undefined): string {
  return ensureValidTime(value, DEFAULT_START)
}

export function ensureValidEndTime(value: string | undefined): string {
  return ensureValidTime(value, DEFAULT_END)
}
