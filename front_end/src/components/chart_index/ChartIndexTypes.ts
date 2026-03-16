export type Range = '1W' | '1M' | '3M' | '1Y' | '3Y'
export type Point = { date: string; value: number }
export type Payload = { choice: Point[]; select: Point[] }
export type Hover = null | { index: number; value: number; date: string }
