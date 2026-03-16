import type { TimeOption } from './types'

export const MAX_WORKERS_PER_TRUCK = 3
export const MAX_COST_TRUCKS = 5
export const AUTO_SAVE_DEBOUNCE_MS = 800
export const DELIVERY_ESTIMATOR_SCHEMA_VERSION = 5

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const TIME_OPTIONS: TimeOption[] = (() => {
  const options: TimeOption[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      const value = `${String(hour).padStart(2, '0')}:${minute === 0 ? '00' : '30'}`
      const suffix = hour >= 12 ? 'PM' : 'AM'
      const hour12 = ((hour + 11) % 12) + 1
      const label = `${hour12}:${minute === 0 ? '00' : '30'} ${suffix}`
      options.push({ value, label })
    }
  }
  return options
})()

export const DEFAULT_START = '08:00'
export const DEFAULT_END = '17:00'
