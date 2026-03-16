import { useCallback, useState } from 'react'

import { MAX_EVENT_SELECTIONS, type EventType } from '../../constants/eventTypes'

export function useEventTypeSelection(initial: EventType[]) {
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>(initial)

  const toggleEventType = useCallback((type: EventType) => {
    setSelectedEventTypes((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type)
      if (prev.length >= MAX_EVENT_SELECTIONS) return prev
      return [...prev, type]
    })
  }, [])

  return { selectedEventTypes, toggleEventType }
}
