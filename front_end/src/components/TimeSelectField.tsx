import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropdownPosition } from '../hooks/useDropdownPosition'

type TimeSelectFieldProps = {
  id: string
  name?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  allowClear?: boolean
}

type Period = 'AM' | 'PM'

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1)

const MINUTES = Array.from({ length: 60 }, (_, index) => index)

type TimeParts = {
  hour: number
  minute: number
  period: Period
}

const parseTimeValue = (value: string): TimeParts | null => {
  const trimmed = value.trim()
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return null
  }
  const [hourStr, minuteStr] = trimmed.split(':')
  const hour24 = Number(hourStr)
  const minute = Number(minuteStr)
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) {
    return null
  }
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) {
    return null
  }
  let period: Period = hour24 >= 12 ? 'PM' : 'AM'
  let hour12 = hour24 % 12
  if (hour12 === 0) {
    hour12 = 12
  }
  return {
    hour: hour12,
    minute,
    period,
  }
}

const formatTimeParts = ({ hour, minute, period }: TimeParts): string => {
  let hour24 = hour % 12
  if (period === 'PM') {
    hour24 += 12
  }
  if (period === 'AM' && hour24 === 12) {
    hour24 = 0
  }
  const hourStr = String(hour24).padStart(2, '0')
  const minuteStr = String(minute).padStart(2, '0')
  return `${hourStr}:${minuteStr}`
}

const formatDisplay = (parts: TimeParts | null, placeholder: string): string => {
  if (!parts) {
    return placeholder
  }
  const { hour, minute, period } = parts
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`
}

const defaultParts: TimeParts = {
  hour: 12,
  minute: 0,
  period: 'AM',
}

export default function TimeSelectField({
  id,
  name,
  value,
  onChange,
  placeholder = 'Select time',
  ariaLabel,
  allowClear = true,
}: TimeSelectFieldProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [tempParts, setTempParts] = useState<TimeParts>(
    () => parseTimeValue(value) ?? defaultParts,
  )

  const resolvedParts = useMemo(() => parseTimeValue(value), [value])
  const displayLabel = formatDisplay(resolvedParts, placeholder)

  useEffect(() => {
    if (open) {
      setTempParts(resolvedParts ?? defaultParts)
    }
  }, [open, resolvedParts])

  const menuStyle = useDropdownPosition(triggerRef, menuRef, open, {
    align: 'start',
    fallbackWidth: 280,
    matchTriggerWidth: false,
  })

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const applyParts = useCallback(
    (next: TimeParts) => {
      setTempParts(next)
      onChange(formatTimeParts(next))
    },
    [onChange],
  )

  const handleHourSelect = useCallback(
    (hour: number) => {
      applyParts({
        ...tempParts,
        hour,
      })
    },
    [applyParts, tempParts],
  )

  const handleMinuteSelect = useCallback(
    (minute: number) => {
      applyParts({
        ...tempParts,
        minute,
      })
    },
    [applyParts, tempParts],
  )

  const handlePeriodSelect = useCallback(
    (period: Period) => {
      applyParts({
        ...tempParts,
        period,
      })
    },
    [applyParts, tempParts],
  )

  const handleClear = useCallback(() => {
    onChange('')
    setTempParts(defaultParts)
    close()
  }, [close, onChange])

  useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return
      }
      close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [close, open])

  const triggerClasses = ['time-select-trigger']
  if (!resolvedParts) {
    triggerClasses.push('is-placeholder')
  }
  if (open) {
    triggerClasses.push('is-open')
  }

  return (
    <div className="time-select">
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={triggerClasses.join(' ')}
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={ariaLabel}
      >
        <span className="time-select-label">{displayLabel}</span>
        <span className="time-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open && (
        <div
          ref={menuRef}
          className="time-select-menu"
          id={`${id}-menu`}
          role="dialog"
          aria-modal="false"
          style={menuStyle}
        >
          <div className="time-select-columns">
            <div className="time-select-column" aria-label="Select hour" role="listbox">
              <p className="time-select-column-label">Hour</p>
              <ul>
                {HOURS.map((hour) => {
                  const isActive = tempParts.hour === hour
                  return (
                    <li key={hour}>
                      <button
                        type="button"
                        className={`time-select-option${isActive ? ' is-active' : ''}`}
                        onClick={() => handleHourSelect(hour)}
                        role="option"
                        aria-selected={isActive}
                      >
                        {String(hour).padStart(2, '0')}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="time-select-column" aria-label="Select minutes" role="listbox">
              <p className="time-select-column-label">Minute</p>
              <ul>
                {MINUTES.map((minute) => {
                  const isActive = tempParts.minute === minute
                  return (
                    <li key={minute}>
                      <button
                        type="button"
                        className={`time-select-option${isActive ? ' is-active' : ''}`}
                        onClick={() => handleMinuteSelect(minute)}
                        role="option"
                        aria-selected={isActive}
                      >
                        {String(minute).padStart(2, '0')}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="time-select-column time-select-column--period" aria-label="Select period">
              <p className="time-select-column-label">Period</p>
              <div className="time-select-period-options">
                {(['AM', 'PM'] as Period[]).map((period) => {
                  const isActive = tempParts.period === period
                  return (
                    <button
                      key={period}
                      type="button"
                      className={`time-select-option time-select-period${isActive ? ' is-active' : ''}`}
                      onClick={() => handlePeriodSelect(period)}
                      aria-pressed={isActive}
                    >
                      {period}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          {allowClear && (
            <div className="time-select-footer">
              <button
                type="button"
                className="time-select-clear"
                onClick={handleClear}
                disabled={!value}
              >
                Clear time
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
