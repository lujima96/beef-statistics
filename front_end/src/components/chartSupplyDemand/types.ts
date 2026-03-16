export type Range = '1W' | '1M' | '3M' | '1Y' | '3Y'

export const RANGES: Range[] = ['1W', '1M', '3M', '1Y', '3Y']

export const DAYS_BY_RANGE: Record<Range, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
  '3Y': 365 * 3,
}

export type EqRow = { date: string; supply: number | null; demand: number | null }

export type HeadsRow = { date: string; supply: number; demand: number }

export type Payload = {
  equivalent: { choice: EqRow[]; select: EqRow[] }
  heads: HeadsRow[]
}

export type HoverPoint = {
  series: 'supply' | 'demand'
  index: number
  value: number
  date: string
}
