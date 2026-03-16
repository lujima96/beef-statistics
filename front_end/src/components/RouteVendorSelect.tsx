import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropdownPosition } from '../hooks/useDropdownPosition'

type VendorOption = {
  id: number
  label: string
  address?: string | null
  locationName?: string | null
}

type RouteVendorSelectProps = {
  id: string
  value: number | null
  options: VendorOption[]
  status: 'idle' | 'loading' | 'success' | 'error'
  onSelect: (vendorId: number | null) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  selectedLabel?: string
}

export default function RouteVendorSelect({
  id,
  value,
  options,
  status,
  onSelect,
  placeholder = 'Select vendor',
  disabled = false,
  ariaLabel,
  selectedLabel,
}: RouteVendorSelectProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const selectedOption = useMemo(
    () => (value != null ? options.find((option) => option.id === value) ?? null : null),
    [options, value],
  )
  const resolvedLabel = selectedOption?.label ?? selectedLabel?.trim() ?? ''

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) {
      return options
    }
    return options.filter((option) => option.label.toLowerCase().includes(term))
  }, [options, search])

  const menuStyle = useDropdownPosition(triggerRef, menuRef, open, {
    align: 'start',
    fallbackWidth: 260,
  })

  const displayLabel = useMemo(() => {
    if (selectedOption) {
      return selectedOption.label
    }
    if (resolvedLabel) {
      return resolvedLabel
    }
    if (status === 'loading') {
      return 'Loading vendors...'
    }
    if (status === 'error') {
      return 'Vendors unavailable'
    }
    if (status === 'success' && options.length === 0) {
      return 'No vendors available'
    }
    return placeholder
  }, [options.length, placeholder, resolvedLabel, selectedOption, status])

  const toggleOpen = useCallback(() => {
    if (disabled) {
      return
    }
    setOpen((prev) => !prev)
  }, [disabled])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const handleSelect = useCallback(
    (vendorId: number) => {
      onSelect(vendorId)
      close()
    },
    [close, onSelect],
  )

  const handleClear = useCallback(() => {
    onSelect(null)
    close()
  }, [close, onSelect])

  useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (
        (triggerRef.current && triggerRef.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target))
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

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }
    const firstOption = menuRef.current?.querySelector<HTMLButtonElement>('button.vendor-select-option')
    if (firstOption) {
      window.setTimeout(() => firstOption.focus(), 0)
    }
    const timeoutId = window.setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [open])

  const triggerClasses = ['vendor-select-trigger']
  if (open) {
    triggerClasses.push('is-open')
  }
  if (!selectedOption && !resolvedLabel) {
    triggerClasses.push('is-placeholder')
  }
  if (disabled) {
    triggerClasses.push('is-disabled')
  }

  return (
    <div className="vendor-select">
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={triggerClasses.join(' ')}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        <span className="vendor-select-label">{displayLabel}</span>
        <span className="vendor-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          id={`${id}-menu`}
          ref={menuRef}
          className="vendor-select-menu"
          role="listbox"
          style={menuStyle}
          aria-labelledby={id}
        >
          {status === 'loading' && <p className="vendor-select-placeholder">Loading vendors...</p>}
          {status === 'error' && (
            <p className="vendor-select-placeholder">Unable to load vendors. Please try again later.</p>
          )}
          {status === 'success' && options.length === 0 && (
            <p className="vendor-select-placeholder">No vendors available.</p>
          )}
          {status === 'success' && options.length > 0 && (
            <>
              <div className="vendor-select-search">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search vendors..."
                  aria-label="Search vendors"
                />
              </div>
              {filteredOptions.length > 0 ? (
                <ul className="vendor-select-options">
                  {filteredOptions.map((option) => {
                    const isSelected = option.id === value
                    const classes = ['vendor-select-option']
                    if (isSelected) {
                      classes.push('is-selected')
                    }
                    return (
                      <li key={option.id}>
                        <button
                          type="button"
                          className={classes.join(' ')}
                          onClick={() => handleSelect(option.id)}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="vendor-select-option-label">{option.label}</span>
                          {option.address ? (
                            <span className="vendor-select-option-sub">{option.address}</span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="vendor-select-placeholder">
                  {options.length === 0 ? 'No vendors available.' : `No matches for "${search}".`}
                </p>
              )}
            </>
          )}
          <div className="vendor-select-footer">
            <button
              type="button"
              className="vendor-select-clear"
              onClick={handleClear}
              disabled={!selectedOption}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
