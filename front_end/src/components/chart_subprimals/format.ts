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
    return `${n.toFixed(2)}`
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

export function formatTemperature(n: number): string {
  if (!Number.isFinite(n)) return '--'
  return `${n.toFixed(1)}°F`
}
