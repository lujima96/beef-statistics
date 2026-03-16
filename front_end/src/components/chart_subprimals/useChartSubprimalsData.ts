import { useMemo } from 'react'

import { alignDieselSeries } from '../../utils/fillDieselGaps'
import { alignTemperatureSeries } from '../../utils/fillTemperatureGaps'
import { useDieselSeries } from '../../hooks/useDieselSeries'
import { useTemperatureSeries } from '../../hooks/useTemperatureSeries'
import { useWeatherOccurrences } from '../../hooks/useWeatherOccurrences'
import type { EventType } from '../../constants/eventTypes'

import { buildDomainDates, computeAligned } from './math'
import { useSubprimalOptions, useTimeseries } from './hooks'
import type { AlignedSeries, Range } from './types'

type NullablePoint = { date: string; value: number | null }

export type TemperatureResult = {
  aligned: NullablePoint[]
  loading: boolean
  error: string | null
  hasSeries: boolean
}

export type DieselResult = {
  aligned: NullablePoint[]
  loading: boolean
  error: string | null
  hasSeries: boolean
}

export type WeatherResult = {
  data: ReturnType<typeof useWeatherOccurrences>['data']
  loading: boolean
  error: string | null
  maxEventCount: number
}

interface UseChartSubprimalsDataArgs {
  grade: 'choice' | 'select'
  imps: string
  range: Range
  setImps: (code: string) => void
  selectedEventTypes: EventType[]
  eventFetchEnabled: boolean
  showTemperature: boolean
  showDiesel: boolean
}

interface UseChartSubprimalsDataResult {
  timeseries: ReturnType<typeof useTimeseries>
  options: { code: string; label: string }[]
  domainDates: string[]
  aligned: AlignedSeries
  temperature: TemperatureResult
  diesel: DieselResult
  weather: WeatherResult
}

export function useChartSubprimalsData({
  grade,
  imps,
  range,
  setImps,
  selectedEventTypes,
  eventFetchEnabled,
  showTemperature,
  showDiesel,
}: UseChartSubprimalsDataArgs): UseChartSubprimalsDataResult {
  const timeseries = useTimeseries(grade, imps, range)
  const { options } = useSubprimalOptions(imps, setImps)

  const domainDates = useMemo(() => buildDomainDates(timeseries.data, range), [timeseries.data, range])
  const aligned = useMemo(() => computeAligned(timeseries.data, domainDates), [timeseries.data, domainDates])

  const weatherResponse = useWeatherOccurrences(range, selectedEventTypes, eventFetchEnabled)

  const temperatureResponse = useTemperatureSeries(range, showTemperature, domainDates)
  const alignedTemperature = useMemo(
    () => alignTemperatureSeries(domainDates, temperatureResponse.data ?? []),
    [domainDates, temperatureResponse.data]
  )
  const hasTemperatureSeries = useMemo(
    () => alignedTemperature.some((point) => point.value != null),
    [alignedTemperature]
  )

  const dieselResponse = useDieselSeries(range, showDiesel, domainDates)
  const alignedDiesel = useMemo(
    () => alignDieselSeries(domainDates, dieselResponse.data ?? []),
    [domainDates, dieselResponse.data]
  )
  const hasDieselSeries = useMemo(
    () => alignedDiesel.some((point) => point.value != null),
    [alignedDiesel]
  )

  return {
    timeseries,
    options,
    domainDates,
    aligned,
    temperature: {
      aligned: alignedTemperature,
      loading: temperatureResponse.loading,
      error: temperatureResponse.error,
      hasSeries: hasTemperatureSeries,
    },
    diesel: {
      aligned: alignedDiesel,
      loading: dieselResponse.loading,
      error: dieselResponse.error,
      hasSeries: hasDieselSeries,
    },
    weather: {
      data: weatherResponse.data,
      loading: weatherResponse.loading,
      error: weatherResponse.error,
      maxEventCount: weatherResponse.maxEventCount,
    },
  }
}
