import { ReportType } from '../ReportTypeSelector'

export type Range = '1W' | '1M' | '3M' | '1Y' | '3Y'
export type Point = { date: string; value: number }
export type SeriesPayload = { am: Point[]; pm: Point[] }
export type Hover = {
  series: 'am' | 'pm' | 'diesel';
  index: number;
  value: number;
  date: string;
} | null
