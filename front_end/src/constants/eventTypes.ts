export const EVENT_TYPES = [
  'Drought',
  'Excessive Heat',
  'Extreme Cold',
  'Winter Storm',
  'Flood',
  'Hurricane',
  'Ice Storm',
  'Blizzard',
  'Heavy Rain',
  'Flash Flood',
  'Wildfire',
  'High Wind',
  'Tornado',
  'Dust Storm',
  'Thunderstorm Wind',
  'Hail',
  'Lake-Effect Snow',
  'Frost/Freeze',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const MAX_EVENT_SELECTIONS = 5

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  'Drought': '#E69F00',
  'Excessive Heat': '#D55E00',
  'Extreme Cold': '#56B4E9',
  'Winter Storm': '#0072B2',
  'Flood': '#009E73',
  'Hurricane': '#F0E442',
  'Ice Storm': '#00CED1',
  'Blizzard': '#999999',
  'Heavy Rain': '#1E90FF',
  'Flash Flood': '#228B22',
  'Wildfire': '#CC0000',
  'High Wind': '#8B008B',
  'Tornado': '#6A5ACD',
  'Dust Storm': '#CD853F',
  'Thunderstorm Wind': '#9370DB',
  'Hail': '#40E0D0',
  'Lake-Effect Snow': '#B0E0E6',
  'Frost/Freeze': '#ADD8E6',
}

export const EVENT_TYPE_API_NAMES: Record<EventType, string> = {
  'Drought': 'Drought',
  'Excessive Heat': 'Excessive Heat',
  'Extreme Cold': 'Extreme Cold/Wind Chill',
  'Winter Storm': 'Winter Storm',
  'Flood': 'Flood',
  'Hurricane': 'Hurricane (Typhoon)',
  'Ice Storm': 'Ice Storm',
  'Blizzard': 'Blizzard',
  'Heavy Rain': 'Heavy Rain',
  'Flash Flood': 'Flash Flood',
  'Wildfire': 'Wildfire',
  'High Wind': 'High Wind',
  'Tornado': 'Tornado',
  'Dust Storm': 'Dust Storm',
  'Thunderstorm Wind': 'Thunderstorm Wind',
  'Hail': 'Hail',
  'Lake-Effect Snow': 'Lake-Effect Snow',
  'Frost/Freeze': 'Frost/Freeze',
}

const API_EVENT_TYPE_TO_DISPLAY_BASE: Record<string, EventType> = Object.entries(EVENT_TYPE_API_NAMES).reduce(
  (acc, [display, api]) => {
    acc[api] = display as EventType
    return acc
  },
  {} as Record<string, EventType>,
)

API_EVENT_TYPE_TO_DISPLAY_BASE['Lake Effect Snow'] = 'Lake-Effect Snow'

export const API_EVENT_TYPE_TO_DISPLAY: Record<string, EventType> = Object.freeze(API_EVENT_TYPE_TO_DISPLAY_BASE)

const WEATHER_EVENT_RANGE_ALIASES = new Set([
  '1Y',
  '1YR',
  '1YEAR',
  '3Y',
  '3YR',
  '3YEAR',
])

export function isWeatherEventRange(range: string) {
  const normalized = range.replace(/\s+/g, '').toUpperCase()
  return WEATHER_EVENT_RANGE_ALIASES.has(normalized)
}
