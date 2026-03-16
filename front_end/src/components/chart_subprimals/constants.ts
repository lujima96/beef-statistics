import type { Range } from './types'

export const RANGES: Range[] = ['1W', '1M', '3M', '1Y', '3Y']

export const DAYS_BY_RANGE: Record<Range, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
  '3Y': 365 * 3,
}

// Subprimal IMPS options (sample list based on reports)
export const SUBPRIMALS = [
  '109E','112A_L','112A_H','113C','114','114A','114D','114E','114F','116A','116B','916A','116G','120','120A','123A','130','160','161','167A','168_1','168_3','169','169A','171B','171C','174','175','175_BNLS','180','184','184B','185A','185B','185C','185D','189A','191A','193'
] as const

export const SUBPRIMAL_LABELS: Record<string, string> = {
  '109E': 'Rib, ribeye, lip-on, bn-in',
  '112A_L': 'Rib, ribeye, bnls, light',
  '112A_H': 'Rib, ribeye, bnls, heavy',
  '113C': 'Chuck, semi-bnls, neck/off',
  '114': 'Chuck, shoulder clod',
  '114A': 'Chuck, shoulder clod, trmd',
  '114D': 'Chuck, clod, top blade',
  '114E': 'Chuck, clod, arm roast',
  '114F': 'Chuck, clod tender',
  '116A': 'Chuck, roll, lxl, neck/off',
  '116B': 'Chuck, chuck tender',
  '916A': 'Chuck, roll, retail ready',
  '116G': 'Chuck, flap',
  '120': 'Brisket, deckle-off, bnls',
  '120A': 'Brisket, point/off, bnls',
  '123A': 'Short Plate, short rib',
  '130': 'Chuck, short rib',
  '160': 'Round, bone-in',
  '161': 'Round, boneless',
  '167A': 'Round, knuckle, peeled',
  '168_1': 'Round, top inside round (FL 1)',
  '168_3': 'Round, top inside round (FL 3)',
  '169': 'Round, top inside, denuded',
  '169A': 'Round, top inside, cap off',
  '171B': 'Round, outside round',
  '171C': 'Round, eye of round',
  '174': 'Loin, short loin, 0x1',
  '175': 'Loin, strip loin, 1x1',
  '175_BNLS': 'Loin, strip loin bnls. 1x1',
  '180': 'Loin, strip, bnls, 0x1',
  '184': 'Loin, top butt, bnls, heavy',
  '184B': 'Loin, top butt, CC',
  '185A': 'Loin, bottom sirloin, flap',
  '185B': 'Loin, ball-tip, bnls, heavy',
  '185C': 'Loin, sirloin, tri-tip',
  '185D': 'Loin, sirloin, tri-tip, pld',
  '189A': 'Loin, tndrloin, trmd, heavy',
  '191A': 'Loin, butt tender, trimmed',
  '193': 'Flank, flank steak',
}

