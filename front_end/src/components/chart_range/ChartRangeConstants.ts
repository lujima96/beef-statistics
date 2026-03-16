import { Range } from './ChartRangeTypes'

export const ranges: Range[] = ['1W', '1M', '3M', '1Y', '3Y']
export const DAYS_BY_RANGE: Record<Range, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '3Y': 365 * 3 }
export const PRIMAL_MAP: Record<string, string> = {
  'Rib': 'primal_rib',
  'Chuck': 'primal_chuck',
  'Round': 'primal_round',
  'Loin': 'primal_loin',
  'Brisket': 'primal_brisket',
  'Short Plate': 'primal_short_plate',
  'Flank': 'primal_flank',
}
