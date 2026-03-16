export type Range = typeof import('./constants').ranges[number]
export type Point = { date: string; value: number | null }
export type SeriesPayload = { am: Point[]; pm: Point[] }
export type Hover = { grade: 'choice' | 'select'; series: 'am' | 'pm'; index: number; value: number; date: string } | null
