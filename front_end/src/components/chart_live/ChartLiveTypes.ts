import type { EventType } from '../../constants/eventTypes'

export type Range = '1W' | '1M' | '3M' | '1Y' | '3Y'
export type Point = { date: string; value: number }

type PriceHover = {
  series: 'steer' | 'heifer' | 'temperature' | 'diesel'
  index: number
  value: number
  date: string
}

type WeatherHover = {
  series: 'weather'
  monthStart: string
  x: number
  width: number
  top: number
  bottom: number
  breakdown: Array<{ eventType: EventType; count: number }>
  mouseX: number
  mouseY: number
}

export type Hover = PriceHover | WeatherHover | null
export type View = { scale: number; tx: number }
