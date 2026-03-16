export const ranges = ['1W', '1M', '3M', '1Y', '3Y'] as const
export const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
export const ZOOM_STEP = 0.85 // symmetric step; zoom out uses reciprocal
export const MIN_SPAN = 1e-3

export const PRIMAL_MAP: Record<string, string> = {
  'Rib': 'primal_rib',
  'Chuck': 'primal_chuck',
  'Round': 'primal_round',
  'Loin': 'primal_loin',
  'Brisket': 'primal_brisket',
  'Short Plate': 'primal_short_plate',
  'Flank': 'primal_flank',
}
