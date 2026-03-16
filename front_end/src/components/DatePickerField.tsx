import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropdownPosition } from '../hooks/useDropdownPosition'

type DatePickerFieldProps = {
  id: string
  name?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  allowClear?: boolean
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const formatIsoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseIsoDate = (value: string): Date | null => {
  if (!value) return null
  const parts = value.split('-')
  if (parts.length !== 3) return null
  const [yearStr, monthStr, dayStr] = parts
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  const result = new Date(year, month - 1, day)
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) {
    return null
  }
  return result
}

const toMonthStart = (value: Date): Date => new Date(value.getFullYear(), value.getMonth(), 1)

const formatDisplayLabel = (value: Date): string =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value)

const formatMonthLabel = (value: Date): string =>
  new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(value)

const buildCalendar = (monthStart: Date): Date[] => {
  const firstDay = monthStart.getDay()
  const days: Date[] = []
  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - firstDay
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() + dayOffset)
    days.push(date)
  }
  return days
}

export default function DatePickerField({
  id,
  name,
  value,
  onChange,
  placeholder = 'Select date',
  ariaLabel,
  allowClear = true,
}: DatePickerFieldProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const todayIso = useMemo(() => formatIsoDate(new Date()), [])
  const parsedValue = useMemo(() => parseIsoDate(value), [value])
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    parsedValue ? toMonthStart(parsedValue) : toMonthStart(new Date()),
  )

  useEffect(() => {
    if (parsedValue) {
      setCurrentMonth(toMonthStart(parsedValue))
    }
  }, [parsedValue])

  const calendarDays = useMemo(() => buildCalendar(currentMonth), [currentMonth])

  const menuStyle = useDropdownPosition(triggerRef, menuRef, open, {
    align: 'start',
    fallbackWidth: 280,
    matchTriggerWidth: false,
  })

  const toggleOpen = useCallback(() => {
    setOpen((previous) => !previous)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      close()
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

  const handleSelect = useCallback(
    (nextDate: Date) => {
      onChange(formatIsoDate(nextDate))
      close()
    },
    [close, onChange],
  )

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))
  }, [])

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))
  }, [])

  const handleClear = useCallback(() => {
    onChange('')
    close()
  }, [close, onChange])

  const triggerLabel = parsedValue ? formatDisplayLabel(parsedValue) : placeholder
  const triggerClassNames = ['date-picker-trigger']
  if (open) {
    triggerClassNames.push('is-open')
  }
  if (!parsedValue) {
    triggerClassNames.push('is-placeholder')
  }

  return (
    <div className="date-picker">
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={triggerClassNames.join(' ')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        onClick={toggleOpen}
        aria-label={ariaLabel}
      >
        <span className="date-picker-trigger-label">{triggerLabel}</span>
        <span className="date-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open && (
        <div
          ref={menuRef}
          id={`${id}-calendar`}
          className="date-picker-popover"
          role="dialog"
          aria-modal="false"
          style={menuStyle}
        >
          <div className="date-picker-header">
            <button type="button" className="date-picker-nav" onClick={handlePrevMonth} aria-label="Previous month">
              ‹
            </button>
            <div className="date-picker-month">{formatMonthLabel(currentMonth)}</div>
            <button type="button" className="date-picker-nav" onClick={handleNextMonth} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="date-picker-grid">
            {WEEKDAY_LABELS.map((weekday) => (
              <div key={weekday} className="date-picker-weekday" aria-hidden="true">
                {weekday}
              </div>
            ))}
            {calendarDays.map((day) => {
              const iso = formatIsoDate(day)
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
              const isToday = iso === todayIso
              const isSelected = parsedValue ? iso === formatIsoDate(parsedValue) : false
              const buttonClassNames = ['date-picker-day']
              if (!isCurrentMonth) {
                buttonClassNames.push('is-outside')
              }
              if (isToday) {
                buttonClassNames.push('is-today')
              }
              if (isSelected) {
                buttonClassNames.push('is-selected')
              }
              return (
                <button
                  key={iso}
                  type="button"
                  className={buttonClassNames.join(' ')}
                  onClick={() => handleSelect(day)}
                  aria-pressed={isSelected}
                  aria-label={formatDisplayLabel(day)}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
          {allowClear && (
            <div className="date-picker-footer">
              <button type="button" className="date-picker-clear" onClick={handleClear}>
                Clear date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
