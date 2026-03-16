export function ensureDollarPrefix(value: string): string {
  if (!value) return ''
  return value.startsWith('$') ? value : `$${value}`
}

export function sanitizeCoordinateInput(value: string): string {
  return value.replace(/[^0-9+-.]/g, '')
}

export function sanitizeIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

export function sanitizeDecimalInput(value: string): string {
  return value.replace(/[^0-9+-.]/g, '')
}
