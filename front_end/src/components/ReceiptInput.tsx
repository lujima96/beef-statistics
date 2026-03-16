import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './Sidebar'
import PdfViewer from './PdfViewer'
import { useIsDesktop, useResponsiveSidebarOpen } from '../hooks/useResponsiveSidebarOpen'
import { useDropdownPosition } from '../hooks/useDropdownPosition'
import { buildApiUrl } from '../utils/apiBase'
import DatePickerField from './DatePickerField'
import RouteVendorSelect from './RouteVendorSelect'
import TimeSelectField from './TimeSelectField'

type ReceiptFormState = {
  date: string
  time: string
  fuelType: string
  stationName: string
  address: string
  costPerGallon: string
  gallons: string
  comments: string
}

type MaintenanceFormState = {
  date: string
  mileage: string
  make: string
  serviceLocation: string
  address: string
  labor: string
  parts: string
  misc: string
  shopFee: string
  tax: string
  comments: string
}

type MaintenanceHistoryEntry = {
  maintenance_id: number
  report_date: string
  mileage: number | null
  make: string | null
  service_location: string | null
  address: string | null
  labor: number | null
  parts: number | null
  misc: number | null
  shop_fee: number | null
  tax: number | null
  total: number | null
  comments: string | null
  created_at: string | null
}

type RouteStopType = 'route' | 'fuel'

type RouteStop = {
  id: number
  type: RouteStopType
  fromVendorId: number | null
  from: string
  toVendorId: number | null
  to: string
  startMiles: string
  endMiles: string
  startTime: string
  endTime: string
  odometer: string
  fuelCost: string
}

type RouteVendorOption = {
  id: number
  label: string
  locationName: string
  address: string
}

type RouteStopEditableField = 'startMiles' | 'endMiles' | 'odometer' | 'fuelCost'

type ReceiptHistoryEntry = {
  receipt_id: number | null
  report_date: string
  receipt_time: string | null
  fuel_type: string
  gallons: number | null
  price_per_gallon: number | null
  address: string | null
  gas_station_name: string
  ingested_at: string | null
  comments: string | null
}

const FUEL_TYPE_OPTIONS = [
  { value: 'gasoline', label: 'Gasoline' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'other', label: 'Other' },
] as const

const getFuelLabel = (value: string) => {
  const match = FUEL_TYPE_OPTIONS.find((option) => option.value === value)
  return match ? match.label : 'Select fuel type'
}

const INITIAL_FORM: ReceiptFormState = {
  date: '',
  time: '',
  fuelType: 'gasoline',
  stationName: '',
  address: '',
  costPerGallon: '',
  gallons: '',
  comments: '',
}

const INITIAL_MAINTENANCE_FORM: MaintenanceFormState = {
  date: '',
  mileage: '',
  make: '',
  serviceLocation: '',
  address: '',
  labor: '',
  parts: '',
  misc: '',
  shopFee: '',
  tax: '',
  comments: '',
}

export default function ReceiptInput() {
  const [formState, setFormState] = useState<ReceiptFormState>(INITIAL_FORM)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebarOpen()
  const [fuelMenuOpen, setFuelMenuOpen] = useState(false)
  const fuelDropdownRef = useRef<HTMLDivElement | null>(null)
  const fuelTriggerRef = useRef<HTMLButtonElement | null>(null)
  const fuelOptionRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [historyDate, setHistoryDate] = useState<string>('')
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const historyDropdownRef = useRef<HTMLDivElement | null>(null)
  const historySearchInputRef = useRef<HTMLInputElement | null>(null)
  const [historyEntries, setHistoryEntries] = useState<ReceiptHistoryEntry[]>([])
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyOptions, setHistoryOptions] = useState<string[]>([])
  const [historyOptionsStatus, setHistoryOptionsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [historyOptionsError, setHistoryOptionsError] = useState<string | null>(null)
  const [historyEditMode, setHistoryEditMode] = useState(false)
  const [editingReceiptId, setEditingReceiptId] = useState<number | null>(null)
  const [maintenanceFormState, setMaintenanceFormState] = useState<MaintenanceFormState>(INITIAL_MAINTENANCE_FORM)
  const [maintenanceStatusMessage, setMaintenanceStatusMessage] = useState<string | null>(null)
  const [maintenanceHistory, setMaintenanceHistory] = useState<Record<string, MaintenanceHistoryEntry[]>>({})
  const [maintenanceHistoryStatus, setMaintenanceHistoryStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [maintenanceHistoryError, setMaintenanceHistoryError] = useState<string | null>(null)
  const [maintenanceHistoryDate, setMaintenanceHistoryDate] = useState<string>('')
  const [maintenanceHistoryMenuOpen, setMaintenanceHistoryMenuOpen] = useState(false)
  const [maintenanceHistorySearch, setMaintenanceHistorySearch] = useState('')
  const [maintenanceHistoryOptions, setMaintenanceHistoryOptions] = useState<string[]>([])
  const [maintenanceHistoryOptionsStatus, setMaintenanceHistoryOptionsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [maintenanceHistoryOptionsError, setMaintenanceHistoryOptionsError] = useState<string | null>(null)
  const maintenanceHistoryDropdownRef = useRef<HTMLDivElement | null>(null)
  const maintenanceHistorySearchInputRef = useRef<HTMLInputElement | null>(null)
  const [maintenanceHistoryEditMode, setMaintenanceHistoryEditMode] = useState(false)
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<number | null>(null)
  const [editingMaintenanceOriginalDate, setEditingMaintenanceOriginalDate] = useState<string | null>(null)
  const [routeLogsDate, setRouteLogsDate] = useState<string>('')
  const [routeLogsDriver, setRouteLogsDriver] = useState<string>('')
  const [routeLogsTruck, setRouteLogsTruck] = useState<string>('')
  const [routeLogsViewDate, setRouteLogsViewDate] = useState<string>('')
  const [routeLogsMenuOpen, setRouteLogsMenuOpen] = useState(false)
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null)
  const historyMenuRef = useRef<HTMLDivElement | null>(null)
  const maintenanceHistoryTriggerRef = useRef<HTMLButtonElement | null>(null)
  const maintenanceHistoryMenuRef = useRef<HTMLDivElement | null>(null)
  const routeLogsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const routeLogsMenuRef = useRef<HTMLDivElement | null>(null)
  const historyMenuStyle = useDropdownPosition(historyTriggerRef, historyMenuRef, historyMenuOpen, {
    align: 'end',
    fallbackWidth: 260,
  })
  const maintenanceMenuStyle = useDropdownPosition(
    maintenanceHistoryTriggerRef,
    maintenanceHistoryMenuRef,
    maintenanceHistoryMenuOpen,
    {
      align: 'end',
      fallbackWidth: 260,
    },
  )
  const routeLogsMenuStyle = useDropdownPosition(routeLogsTriggerRef, routeLogsMenuRef, routeLogsMenuOpen, {
    align: 'start',
    fallbackWidth: 240,
  })
  const [routeLogsSearch, setRouteLogsSearch] = useState('')
  const routeLogsDropdownRef = useRef<HTMLDivElement | null>(null)
  const routeLogsSearchInputRef = useRef<HTMLInputElement | null>(null)
  const [routeLogsOptions, setRouteLogsOptions] = useState<string[]>([])
  const [routeLogsOptionsStatus, setRouteLogsOptionsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [routeLogsOptionsError, setRouteLogsOptionsError] = useState<string | null>(null)
  const [routeLogsStatusMessage, setRouteLogsStatusMessage] = useState<string | null>(null)
  const [routeLogsSaving, setRouteLogsSaving] = useState(false)
  const [routeLogsDeleting, setRouteLogsDeleting] = useState(false)
  const [routeLogsLoadingDate, setRouteLogsLoadingDate] = useState<string | null>(null)
  const filteredRouteLogsOptions = useMemo(() => {
    const term = routeLogsSearch.trim().toLowerCase()
    if (!term) {
      return routeLogsOptions
    }
    return routeLogsOptions.filter((option) => option.toLowerCase().includes(term))
  }, [routeLogsOptions, routeLogsSearch])
  const [routeStops, setRouteStops] = useState<RouteStop[]>([])
  const routeStopIdRef = useRef(0)
  const clearRouteLogForm = useCallback(() => {
    routeStopIdRef.current = 0
    setRouteStops([])
    setRouteLogsDate('')
    setRouteLogsDriver('')
    setRouteLogsTruck('')
    setRouteLogsViewDate('')
  }, [])
  const [routeVendors, setRouteVendors] = useState<RouteVendorOption[]>([])
  const [routeVendorsStatus, setRouteVendorsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [routeVendorsError, setRouteVendorsError] = useState<string | null>(null)
  const refreshHistoryDates = useCallback(async () => {
    setHistoryOptionsStatus('loading')
    setHistoryOptionsError(null)

    try {
      const response = await fetch(buildApiUrl('/api/receipt-dates'))

      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`
        try {
          const body = await response.json()
          if (typeof body?.detail === 'string' && body.detail) {
            errorMessage = body.detail
          } else if (typeof body?.message === 'string' && body.message) {
            errorMessage = body.message
          }
        } catch {
          // ignore body parsing errors
        }
        throw new Error(errorMessage)
      }

      const body = await response.json()
      const datesRaw = Array.isArray(body?.dates) ? (body.dates as unknown[]) : []

      const normalized = datesRaw
        .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => value.length > 0)

      normalized.sort((a, b) => a.localeCompare(b))

      setHistoryOptions(normalized)
      setHistoryOptionsStatus('success')
    } catch (error) {
      console.error('Failed to load receipt dates', error)
      setHistoryOptionsStatus('error')
      setHistoryOptionsError(error instanceof Error ? error.message : 'Failed to load available dates.')
    }
  }, [])

  const refreshMaintenanceDates = useCallback(async () => {
    setMaintenanceHistoryOptionsStatus('loading')
    setMaintenanceHistoryOptionsError(null)

    try {
      const response = await fetch(buildApiUrl('/api/maintenance-dates'))
      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`
        try {
          const body = await response.json()
          errorMessage = body?.detail || body?.message || errorMessage
        } catch {
          // ignore
        }
        throw new Error(errorMessage)
      }

      const body = await response.json()
      const datesRaw = Array.isArray(body?.dates) ? (body.dates as unknown[]) : []

      const normalized = datesRaw
        .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => value.length > 0)

      normalized.sort((a, b) => a.localeCompare(b))

      setMaintenanceHistoryOptions(normalized)
      setMaintenanceHistoryOptionsStatus('success')
    } catch (error) {
      console.error('Failed to load maintenance dates', error)
      setMaintenanceHistoryOptionsStatus('error')
      setMaintenanceHistoryOptionsError(error instanceof Error ? error.message : 'Failed to load maintenance dates.')
    }
  }, [])

  const fetchRouteLogDates = useCallback(async (): Promise<string[]> => {
    const response = await fetch(buildApiUrl('/api/route-logs/dates'))
    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`
      try {
        const body = await response.json()
        if (typeof body?.detail === 'string' && body.detail) {
          errorMessage = body.detail
        } else if (typeof body?.message === 'string' && body.message) {
          errorMessage = body.message
        }
      } catch {
        // ignore body parsing errors
      }
      throw new Error(errorMessage)
    }
    const body = await response.json()
    const datesRaw = Array.isArray(body?.dates) ? (body.dates as unknown[]) : []
    const normalized = datesRaw
      .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value): value is string => value.length > 0)

    normalized.sort((a, b) => b.localeCompare(a))
    return normalized
  }, [])

  const refreshRouteLogDates = useCallback(async () => {
    try {
      const dates = await fetchRouteLogDates()
      setRouteLogsOptions(dates)
      setRouteLogsOptionsStatus('success')
      setRouteLogsOptionsError(null)
      return dates
    } catch (error) {
      console.error('Failed to load route log dates', error)
      setRouteLogsOptionsStatus('error')
      setRouteLogsOptionsError(error instanceof Error ? error.message : 'Failed to load route log dates.')
      throw error
    }
  }, [fetchRouteLogDates])

  useEffect(() => {
    let cancelled = false
    setRouteLogsOptionsStatus('loading')
    setRouteLogsOptionsError(null)
    fetchRouteLogDates()
      .then((dates) => {
        if (cancelled) {
          return
        }
        setRouteLogsOptions(dates)
        setRouteLogsOptionsStatus('success')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        console.error('Failed to load route log dates', error)
        setRouteLogsOptionsStatus('error')
        setRouteLogsOptionsError(error instanceof Error ? error.message : 'Failed to load route log dates.')
      })
    return () => {
      cancelled = true
    }
  }, [fetchRouteLogDates])

  useEffect(() => {
    refreshHistoryDates()
  }, [refreshHistoryDates])

  useEffect(() => {
    refreshMaintenanceDates()
  }, [refreshMaintenanceDates])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    const loadVendors = async () => {
      setRouteVendorsStatus('loading')
      setRouteVendorsError(null)
      try {
        const response = await fetch(buildApiUrl('/delivery-estimator/state'), {
          signal: controller.signal,
        })
        if (response.status === 404) {
          if (!cancelled) {
            setRouteVendors([])
            setRouteVendorsStatus('success')
            setRouteVendorsError(null)
          }
          return
        }
        if (!response.ok) {
          let message = `Request failed with status ${response.status}`
          try {
            const body = await response.json()
            if (typeof body?.detail === 'string' && body.detail) {
              message = body.detail
            } else if (typeof body?.message === 'string' && body.message) {
              message = body.message
            }
          } catch {
            // ignore parse error and use default
          }
          throw new Error(message)
        }
        const data = await response.json()
        const vendorsRaw = Array.isArray(data?.vendors) ? (data.vendors as unknown[]) : []
        const optionMap = new Map<number, RouteVendorOption>()
        vendorsRaw.forEach((item) => {
          const record = (item ?? {}) as Record<string, unknown>
          const rawId = record.id
          let id: number | null = null
          if (typeof rawId === 'number' && Number.isFinite(rawId)) {
            id = rawId
          } else if (typeof rawId === 'string') {
            const parsed = Number(rawId)
            if (Number.isFinite(parsed)) {
              id = parsed
            }
          }
          if (id == null) {
            return
          }
          const locationName =
            typeof record.locationName === 'string' ? record.locationName.trim() : ''
          const address = typeof record.address === 'string' ? record.address.trim() : ''
          const labelParts: string[] = []
          if (locationName) {
            labelParts.push(locationName)
          }
          if (address) {
            labelParts.push(address)
          }
          const label = labelParts.length > 0 ? labelParts.join(' – ') : `Vendor ${id}`
          optionMap.set(id, {
            id,
            label,
            locationName,
            address,
          })
        })
        const options = Array.from(optionMap.values()).sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
        )
        if (!cancelled) {
          setRouteVendors(options)
          setRouteVendorsStatus('success')
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) {
          return
        }
        console.error('Failed to load route vendors', error)
        setRouteVendors([])
        setRouteVendorsStatus('error')
        setRouteVendorsError(error instanceof Error ? error.message : 'Unable to load vendors.')
        setRouteStops((prev) =>
          prev.map((stop) =>
            stop.fromVendorId == null ? stop : { ...stop, fromVendorId: null, from: '' },
          ),
        )
      }
    }

    loadVendors()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (routeVendors.length === 0) {
      return
    }

    const vendorsById = new Map(routeVendors.map((vendor) => [vendor.id, vendor]))
    const vendorsByLabel = new Map(
      routeVendors.map((vendor) => [vendor.label.trim().toLowerCase(), vendor]),
    )

    const matchVendorByLabel = (label: string) => {
      const key = label.trim().toLowerCase()
      if (!key) {
        return null
      }
      return vendorsByLabel.get(key) ?? null
    }

    setRouteStops((prev) =>
      prev.map((stop) => {
        if (stop.type !== 'route') {
          return stop
        }

        let next = stop
        const applyChanges = (changes: Partial<RouteStop>) => {
          next = next === stop ? { ...stop, ...changes } : { ...next, ...changes }
        }

        if (stop.fromVendorId != null) {
          const vendor = vendorsById.get(stop.fromVendorId)
          if (!vendor) {
            applyChanges({ fromVendorId: null, from: '' })
          } else if (stop.from !== vendor.label) {
            applyChanges({ from: vendor.label })
          }
        } else if (stop.from.trim()) {
          const vendor = matchVendorByLabel(stop.from)
          if (vendor) {
            applyChanges({ fromVendorId: vendor.id, from: vendor.label })
          }
        }

        if (stop.toVendorId != null) {
          const vendor = vendorsById.get(stop.toVendorId)
          if (!vendor) {
            applyChanges({ toVendorId: null, to: '' })
          } else if (stop.to !== vendor.label) {
            applyChanges({ to: vendor.label })
          }
        } else if (stop.to.trim()) {
          const vendor = matchVendorByLabel(stop.to)
          if (vendor) {
            applyChanges({ toVendorId: vendor.id, to: vendor.label })
          }
        }

        return next
      }),
    )
  }, [routeVendors])

  useEffect(() => {
    if (!routeLogsMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (routeLogsDropdownRef.current && target && !routeLogsDropdownRef.current.contains(target)) {
        setRouteLogsMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRouteLogsMenuOpen(false)
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
  }, [routeLogsMenuOpen])

  useEffect(() => {
    if (!routeLogsMenuOpen) {
      setRouteLogsSearch('')
      return
    }
    const timeoutId = window.setTimeout(() => {
      routeLogsSearchInputRef.current?.focus()
      routeLogsSearchInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [routeLogsMenuOpen])

  useEffect(() => {
    if (!fuelMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (fuelDropdownRef.current && target && !fuelDropdownRef.current.contains(target)) {
        setFuelMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFuelMenuOpen(false)
        window.setTimeout(() => fuelTriggerRef.current?.focus(), 0)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    const focusTimeout = window.setTimeout(() => {
      const selected = fuelOptionRefs.current[formState.fuelType]
      if (selected) {
        selected.focus()
        return
      }
      const fallback = FUEL_TYPE_OPTIONS[0]
      fuelOptionRefs.current[fallback.value]?.focus()
    }, 0)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(focusTimeout)
    }
  }, [fuelMenuOpen, formState.fuelType])

  const handleFieldChange = (field: keyof ReceiptFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { value } = event.target
      setFormState((prev) => ({
        ...prev,
        [field]: value,
      }))
    }

  const handleMaintenanceFieldChange = (field: keyof MaintenanceFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { value } = event.target
      setMaintenanceFormState((prev) => ({
        ...prev,
        [field]: value,
      }))
    }

  const parseNumericInput = (value: string): number | null => {
    if (typeof value !== 'string') {
      return null
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const formatServerNumber = (value: unknown): string => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) {
        return ''
      }
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? String(parsed) : ''
    }
    return ''
  }

  const formatServerTime = (value: unknown): string => {
    if (typeof value !== 'string') {
      return ''
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return ''
    }
    const match = trimmed.match(/^(\d{2}):(\d{2})/)
    if (match) {
      return `${match[1]}:${match[2]}`
    }
    return ''
  }

  const hydrateRouteLogStops = useCallback((routeLog: Record<string, unknown> | null | undefined) => {
    routeStopIdRef.current = 0
    const nextStops: RouteStop[] = []

    const stopsRaw = Array.isArray(routeLog?.route_stops)
      ? (routeLog?.route_stops as unknown[])
      : []

    stopsRaw.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return
      }
      routeStopIdRef.current += 1
      const record = entry as Record<string, unknown>
      nextStops.push({
        id: routeStopIdRef.current,
        type: 'route',
        fromVendorId: null,
        from: typeof record.from_location === 'string' ? record.from_location : '',
        toVendorId: null,
        to: typeof record.to_location === 'string' ? record.to_location : '',
        startMiles: formatServerNumber(record.start_miles),
        endMiles: formatServerNumber(record.end_miles),
        startTime: formatServerTime(record.start_time),
        endTime: formatServerTime(record.end_time),
        odometer: formatServerNumber(record.odometer),
        fuelCost: formatServerNumber(record.cost),
      })
    })

    const fuelRecord = routeLog?.fuel_stop
    if (fuelRecord && typeof fuelRecord === 'object') {
      routeStopIdRef.current += 1
      const record = fuelRecord as Record<string, unknown>
      nextStops.push({
        id: routeStopIdRef.current,
        type: 'fuel',
        fromVendorId: null,
        from: '',
        toVendorId: null,
        to: '',
        startMiles: '',
        endMiles: '',
        startTime: formatServerTime(record.start_time),
        endTime: formatServerTime(record.end_time),
        odometer: formatServerNumber(record.odometer),
        fuelCost: formatServerNumber(record.cost),
      })
    }

    setRouteStops(nextStops)
  }, [])

  const handleAddRouteStop = () => {
    const nextId = routeStopIdRef.current + 1
    routeStopIdRef.current = nextId
    setRouteStops((prev) => {
      const previousRouteStop = [...prev].reverse().find((stop) => stop.type === 'route')
      const initialStartMiles = previousRouteStop?.endMiles ?? ''
      const initialEndMiles = initialStartMiles
      const initialFromVendorId = previousRouteStop?.toVendorId ?? null
      let initialFrom = previousRouteStop?.to ?? ''
      if (initialFromVendorId != null) {
        const vendor = routeVendors.find((option) => option.id === initialFromVendorId)
        if (vendor) {
          initialFrom = vendor.label
        }
      }
      return [
        ...prev,
        {
          id: nextId,
          type: 'route',
          fromVendorId: initialFromVendorId,
          from: initialFrom,
          toVendorId: null,
          to: '',
          startMiles: initialStartMiles,
          endMiles: initialEndMiles,
          startTime: '',
          endTime: '',
          odometer: '',
          fuelCost: '',
        },
      ]
    })
  }

  const handleRemoveRouteStop = (id: number) => {
    setRouteStops((prev) => prev.filter((stop) => stop.id !== id))
  }

  const handleAddFuelStop = () => {
    const hasFuelStop = routeStops.some((stop) => stop.type === 'fuel')
    if (hasFuelStop) {
      setRouteLogsStatusMessage('Only one fuel stop can be added per route log.')
      return
    }
    const nextId = routeStopIdRef.current + 1
    routeStopIdRef.current = nextId
    setRouteStops((prev) => [
      ...prev,
      {
        id: nextId,
        type: 'fuel',
        fromVendorId: null,
        from: '',
        toVendorId: null,
        to: '',
        startMiles: '',
        endMiles: '',
        startTime: '',
        endTime: '',
        odometer: '',
        fuelCost: '',
      },
    ])
  }

  const handleRouteStopFieldChange =
    (id: number, field: RouteStopEditableField) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target
      setRouteStops((prev) => {
        const index = prev.findIndex((stop) => stop.id === id)
        if (index === -1) {
          return prev
        }
        const currentStop = prev[index]
        const nextStops = [...prev]

        let updatedStop: RouteStop
        if (field === 'startMiles') {
          const shouldSyncEnd = currentStop.endMiles === '' || currentStop.endMiles === currentStop.startMiles
          updatedStop = {
            ...currentStop,
            startMiles: value,
            endMiles: shouldSyncEnd ? value : currentStop.endMiles,
          }
        } else {
          updatedStop = {
            ...currentStop,
            [field]: value,
          }
        }

        nextStops[index] = updatedStop

        if (field === 'endMiles' && currentStop.type === 'route') {
          const oldEndMiles = currentStop.endMiles
          const newEndMiles = value
          if (oldEndMiles !== newEndMiles) {
            const nextRouteIndex = nextStops.findIndex(
              (stop, candidateIndex) => candidateIndex > index && stop.type === 'route',
            )
            if (nextRouteIndex !== -1) {
              const nextRouteStop = nextStops[nextRouteIndex]
              if (nextRouteStop.startMiles === '' || nextRouteStop.startMiles === oldEndMiles) {
                const shouldSyncEnd =
                  nextRouteStop.endMiles === '' || nextRouteStop.endMiles === nextRouteStop.startMiles
                nextStops[nextRouteIndex] = {
                  ...nextRouteStop,
                  startMiles: newEndMiles,
                  endMiles: shouldSyncEnd ? newEndMiles : nextRouteStop.endMiles,
                }
              }
            }
          }
        }

        return nextStops
      })
    }

  const handleRouteStopTimeChange = (id: number, field: 'startTime' | 'endTime') =>
    (nextValue: string) => {
      setRouteStops((prev) =>
        prev.map((stop) => {
          if (stop.id !== id) {
            return stop
          }
          if (field === 'startTime') {
            const shouldSync = stop.endTime === '' || stop.endTime === stop.startTime
            return {
              ...stop,
              startTime: nextValue,
              endTime: shouldSync ? nextValue : stop.endTime,
            }
          }
          return {
            ...stop,
            endTime: nextValue,
          }
        }),
      )
    }

  const handleRouteStopVendorSelect = useCallback(
    (id: number, vendorId: number | null) => {
      if (vendorId == null) {
        setRouteStops((prev) =>
          prev.map((stop) => (stop.id === id ? { ...stop, fromVendorId: null, from: '' } : stop)),
        )
        return
      }
      const vendor = routeVendors.find((option) => option.id === vendorId) ?? null
      setRouteStops((prev) =>
        prev.map((stop) =>
          stop.id === id
            ? {
                ...stop,
                fromVendorId: vendor ? vendor.id : null,
                from: vendor ? vendor.label : '',
              }
            : stop,
        ),
      )
    },
    [routeVendors],
  )

  const handleRouteStopDestinationSelect = useCallback(
    (id: number, vendorId: number | null) => {
      if (vendorId == null) {
        setRouteStops((prev) =>
          prev.map((stop) => (stop.id === id ? { ...stop, toVendorId: null, to: '' } : stop)),
        )
        return
      }
      const vendor = routeVendors.find((option) => option.id === vendorId) ?? null
      setRouteStops((prev) =>
        prev.map((stop) =>
          stop.id === id
            ? {
                ...stop,
                toVendorId: vendor ? vendor.id : null,
                to: vendor ? vendor.label : '',
              }
            : stop,
        ),
      )
    },
    [routeVendors],
  )

  const loadRouteLogByDate = useCallback(
    async (selectedDate: string) => {
      if (!selectedDate) {
        return
      }
      setRouteLogsLoadingDate(selectedDate)
      setRouteLogsStatusMessage(`Loading route log for ${selectedDate}...`)
      try {
        const response = await fetch(buildApiUrl(`/api/route-logs/${selectedDate}`))
        if (!response.ok) {
          let message = `Request failed with status ${response.status}`
          try {
            const body = await response.json()
            if (typeof body?.detail === 'string' && body.detail) {
              message = body.detail
            } else if (typeof body?.message === 'string' && body.message) {
              message = body.message
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(message)
        }
        const body = await response.json()
        const routeLogRaw = (body?.route_log ?? null) as Record<string, unknown> | null
        if (!routeLogRaw) {
          throw new Error('Route log not found.')
        }
        hydrateRouteLogStops(routeLogRaw)
        const reportDate =
          typeof routeLogRaw.report_date === 'string' && routeLogRaw.report_date.trim()
            ? routeLogRaw.report_date
            : selectedDate
        const driverName =
          typeof routeLogRaw.driver_name === 'string' ? routeLogRaw.driver_name : ''
        const truckValue = typeof routeLogRaw.truck === 'string' ? routeLogRaw.truck : ''
        setRouteLogsDate(reportDate)
        setRouteLogsDriver(driverName)
        setRouteLogsTruck(truckValue)
        setRouteLogsStatusMessage(`Loaded route log for ${reportDate}.`)
      } catch (error) {
        console.error('Failed to load route log', error)
        setRouteLogsStatusMessage(
          error instanceof Error ? `Failed to load route log: ${error.message}` : 'Failed to load route log.',
        )
      } finally {
        setRouteLogsLoadingDate((prev) => (prev === selectedDate ? null : prev))
      }
    },
    [hydrateRouteLogStops],
  )

  const handleFuelMenuToggle = () => {
    setFuelMenuOpen((prev) => !prev)
  }

  const handleFuelTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setFuelMenuOpen(true)
    }
  }

  const handleFuelOptionSelect = useCallback((value: string) => {
    setFormState((prev) => ({
      ...prev,
      fuelType: value,
    }))
    setFuelMenuOpen(false)
    window.setTimeout(() => fuelTriggerRef.current?.focus(), 0)
  }, [])

  const handleFuelOptionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const nextIndex = (index + 1) % FUEL_TYPE_OPTIONS.length
        const nextOption = FUEL_TYPE_OPTIONS[nextIndex]
        fuelOptionRefs.current[nextOption.value]?.focus()
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const prevIndex = (index - 1 + FUEL_TYPE_OPTIONS.length) % FUEL_TYPE_OPTIONS.length
        const prevOption = FUEL_TYPE_OPTIONS[prevIndex]
        fuelOptionRefs.current[prevOption.value]?.focus()
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        const firstOption = FUEL_TYPE_OPTIONS[0]
        fuelOptionRefs.current[firstOption.value]?.focus()
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        const lastOption = FUEL_TYPE_OPTIONS[FUEL_TYPE_OPTIONS.length - 1]
        fuelOptionRefs.current[lastOption.value]?.focus()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setFuelMenuOpen(false)
        window.setTimeout(() => fuelTriggerRef.current?.focus(), 0)
        return
      }

      if (event.key === 'Tab') {
        setFuelMenuOpen(false)
      }
    },
    []
  )

  const handleSaveRouteLog = async () => {
    if (routeLogsSaving) {
      return
    }
    const reportDate = routeLogsDate.trim()
    if (!reportDate) {
      setRouteLogsStatusMessage('Please select a route log date before saving.')
      return
    }

    type RouteStopPayload = {
      from_location: string | null
      to_location: string | null
      start_miles: number | null
      end_miles: number | null
      start_time: string | null
      end_time: string | null
      odometer: number | null
      cost: number | null
    }

    const routeStopPayloads = routeStops
      .filter((stop) => stop.type === 'route')
      .map((stop) => {
        const payload: RouteStopPayload = {
          from_location: stop.from.trim() || null,
          to_location: stop.to.trim() || null,
          start_miles: parseNumericInput(stop.startMiles),
          end_miles: parseNumericInput(stop.endMiles),
          start_time: stop.startTime.trim() || null,
          end_time: stop.endTime.trim() || null,
          odometer: parseNumericInput(stop.odometer),
          cost: parseNumericInput(stop.fuelCost),
        }
        const hasValues = Object.values(payload).some((value) => value !== null)
        return hasValues ? payload : null
      })
      .filter((payload): payload is RouteStopPayload => payload !== null)

    if (routeStopPayloads.length === 0) {
      setRouteLogsStatusMessage('Add at least one route stop before saving.')
      return
    }

    const fuelStops = routeStops.filter((stop) => stop.type === 'fuel')
    if (fuelStops.length > 1) {
      setRouteLogsStatusMessage('Only one fuel stop can be saved per route log.')
      return
    }

    let fuelPayload: Record<string, unknown> | null = null
    if (fuelStops.length === 1) {
      const [fuelStop] = fuelStops
      const payload = {
        start_time: fuelStop.startTime.trim() || null,
        end_time: fuelStop.endTime.trim() || null,
        odometer: parseNumericInput(fuelStop.odometer),
        cost: parseNumericInput(fuelStop.fuelCost),
      }
      const hasValues = Object.values(payload).some((value) => value !== null)
      fuelPayload = hasValues ? payload : null
    }

    const driverName = routeLogsDriver.trim()
    const truckValue = routeLogsTruck.trim()

    setRouteLogsSaving(true)
    setRouteLogsStatusMessage('Saving route log...')
    try {
      const response = await fetch(buildApiUrl('/api/route-logs'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report_date: reportDate,
          driver_name: driverName || null,
          truck: truckValue || null,
          route_stops: routeStopPayloads,
          fuel_stop: fuelPayload,
        }),
      })
      if (!response.ok) {
        let message = `Request failed with status ${response.status}`
        try {
          const body = await response.json()
          if (typeof body?.detail === 'string' && body.detail) {
            message = body.detail
          } else if (typeof body?.message === 'string' && body.message) {
            message = body.message
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message)
      }
      setRouteLogsStatusMessage('Route log saved successfully.')
      setRouteLogsViewDate(reportDate)
      try {
        await refreshRouteLogDates()
      } catch (refreshError) {
        console.error('Failed to refresh route log dates after save', refreshError)
      }
    } catch (error) {
      console.error('Failed to save route log', error)
      setRouteLogsStatusMessage(
        error instanceof Error ? `Failed to save route log: ${error.message}` : 'Failed to save route log.',
      )
    } finally {
      setRouteLogsSaving(false)
    }
  }

  const handleClearRouteLog = useCallback(() => {
    if (routeLogsSaving || routeLogsDeleting) {
      return
    }
    clearRouteLogForm()
    setRouteLogsStatusMessage('Route log form cleared.')
  }, [clearRouteLogForm, routeLogsDeleting, routeLogsSaving])

  const handleDeleteRouteLog = async () => {
    if (routeLogsDeleting) {
      return
    }
    const reportDate = routeLogsDate.trim()
    if (!reportDate) {
      setRouteLogsStatusMessage('Select a route log date before deleting.')
      return
    }
    const confirmed = window.confirm(
      `Delete the route log for ${reportDate}? This action cannot be undone.`,
    )
    if (!confirmed) {
      return
    }
    setRouteLogsDeleting(true)
    setRouteLogsStatusMessage(`Deleting route log for ${reportDate}...`)
    try {
      const response = await fetch(buildApiUrl(`/api/route-logs/${reportDate}`), {
        method: 'DELETE',
      })
      if (!response.ok) {
        let message = `Request failed with status ${response.status}`
        try {
          const body = await response.json()
          if (typeof body?.detail === 'string' && body.detail) {
            message = body.detail
          } else if (typeof body?.message === 'string' && body.message) {
            message = body.message
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message)
      }
      setRouteLogsStatusMessage(`Deleted route log for ${reportDate}.`)
      clearRouteLogForm()
      try {
        await refreshRouteLogDates()
      } catch (refreshError) {
        console.error('Failed to refresh route log dates after delete', refreshError)
      }
    } catch (error) {
      console.error('Failed to delete route log', error)
      setRouteLogsStatusMessage(
        error instanceof Error ? `Failed to delete route log: ${error.message}` : 'Failed to delete route log.',
      )
    } finally {
      setRouteLogsDeleting(false)
    }
  }

  const derivedTotal = useMemo(() => {
    const cost = parseFloat(formState.costPerGallon.replace(/[^0-9.]/g, ''))
    const gallons = parseFloat(formState.gallons.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(cost) || !Number.isFinite(gallons)) {
      return ''
    }
    const total = cost * gallons
    if (!Number.isFinite(total)) {
      return ''
    }
    return total.toFixed(2)
  }, [formState.costPerGallon, formState.gallons])

  const fuelTypeLabel = useMemo(() => getFuelLabel(formState.fuelType), [formState.fuelType])

  const maintenanceDerivedTotal = useMemo(() => {
    const labor = parseFloat(maintenanceFormState.labor.replace(/[^0-9.]/g, ''))
    const parts = parseFloat(maintenanceFormState.parts.replace(/[^0-9.]/g, ''))
    const misc = parseFloat(maintenanceFormState.misc.replace(/[^0-9.]/g, ''))
    const shopFee = parseFloat(maintenanceFormState.shopFee.replace(/[^0-9.]/g, ''))
    const tax = parseFloat(maintenanceFormState.tax.replace(/[^0-9.]/g, ''))

    const values = [labor, parts, misc, shopFee, tax].filter((candidate) => Number.isFinite(candidate))
    if (values.length === 0) {
      return ''
    }

    const total = values.reduce((sum, value) => sum + value, 0)
    return Number.isFinite(total) ? total.toFixed(2) : ''
  }, [maintenanceFormState.labor, maintenanceFormState.parts, maintenanceFormState.misc, maintenanceFormState.shopFee, maintenanceFormState.tax])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const cost = parseFloat(formState.costPerGallon.replace(/[^0-9.]/g, ''))
    const gallons = parseFloat(formState.gallons.replace(/[^0-9.]/g, ''))
    const stationName = formState.stationName.trim()
    const commentsValue = formState.comments.trim()
    if (!formState.date) {
      setStatusMessage('Please enter the purchase date before submitting.')
      return
    }

    if (!stationName) {
      setStatusMessage("Please enter the gas station's name before submitting.")
      return
    }

    if (!Number.isFinite(cost) || !Number.isFinite(gallons)) {
      setStatusMessage('Enter valid numbers for cost per gallon and gallons before submitting.')
      return
    }

    const totalAmount = cost * gallons
    if (!Number.isFinite(totalAmount)) {
      setStatusMessage('Unable to calculate the total amount for this receipt.')
      return
    }

    const address = formState.address.trim()

    const payload = {
      report_date: formState.date,
      receipt_time: formState.time || null,
      fuel_type: formState.fuelType,
      gas_station_name: stationName,
      address: address.length > 0 ? address : null,
      gallons: Number(gallons.toFixed(3)),
      price_per_gallon: Number(cost.toFixed(4)),
      comments: commentsValue.length > 0 ? commentsValue : null,
    }

    const isEditingExistingReceipt = editingReceiptId !== null
    const editingId = editingReceiptId
    const targetEndpoint = isEditingExistingReceipt
      ? buildApiUrl(`/api/receipts/${editingId}`)
      : buildApiUrl('/api/receipts')
    const method = isEditingExistingReceipt ? 'PUT' : 'POST'

    setStatusMessage(isEditingExistingReceipt ? 'Updating receipt…' : 'Submitting receipt...')

    try {
      const response = await fetch(targetEndpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = ''
        try {
          const body = await response.json()
          detail = body?.detail || body?.message || ''
        } catch {
          // ignore body parsing errors
        }
        const failureMessage = isEditingExistingReceipt ? 'Failed to update receipt.' : 'Failed to submit receipt.'
        setStatusMessage(detail ? `${failureMessage.replace('.', '')}: ${detail}` : failureMessage)
        return
      }

      const nextReportDate = payload.report_date

      setFormState(INITIAL_FORM)
      setStatusMessage(isEditingExistingReceipt ? 'Receipt updated successfully.' : 'Receipt submitted successfully.')
      if (isEditingExistingReceipt && editingId !== null) {
        if (historyDate !== nextReportDate) {
          setHistoryEntries([])
          setHistoryDate(nextReportDate)
        } else {
          setHistoryEntries((prev) =>
            prev.map((entry) =>
              entry.receipt_id === editingId
                ? {
                    ...entry,
                    report_date: nextReportDate,
                    receipt_time: payload.receipt_time,
                    fuel_type: payload.fuel_type,
                    gallons: payload.gallons,
                    price_per_gallon: payload.price_per_gallon,
                    address: payload.address,
                    gas_station_name: payload.gas_station_name,
                    comments: payload.comments ?? null,
                  }
                : entry,
            ),
          )
        }
        setEditingReceiptId(null)
        setHistoryMenuOpen(false)
        setHistorySearch('')
      }

      refreshHistoryDates().catch((error) => {
        console.error('Failed to refresh receipt dates', error)
      })
    } catch (error) {
      console.error('Failed to submit receipt', error)
      setStatusMessage(isEditingExistingReceipt ? 'Failed to update receipt. Please try again.' : 'Failed to submit receipt. Please try again.')
    }
  }

  const handleReset = () => {
    setFormState(INITIAL_FORM)
    setStatusMessage(null)
    setEditingReceiptId(null)
    setHistoryEditMode(false)
  }

  const handleMaintenanceReset = () => {
    setMaintenanceFormState(INITIAL_MAINTENANCE_FORM)
    setMaintenanceStatusMessage(null)
    setEditingMaintenanceId(null)
    setEditingMaintenanceOriginalDate(null)
    setMaintenanceHistoryEditMode(false)
  }

  const handleMaintenanceSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const reportDate = maintenanceFormState.date.trim()
    if (!reportDate) {
      setMaintenanceStatusMessage('Please enter the maintenance date before submitting.')
      return
    }

    const mileageValue = maintenanceFormState.mileage.trim()
    const makeValue = maintenanceFormState.make.trim()
    const serviceLocationValue = maintenanceFormState.serviceLocation.trim()
    const addressValue = maintenanceFormState.address.trim()
    const laborParsed = parseFloat(maintenanceFormState.labor.replace(/[^0-9.]/g, ''))
    const partsParsed = parseFloat(maintenanceFormState.parts.replace(/[^0-9.]/g, ''))
    const miscParsed = parseFloat(maintenanceFormState.misc.replace(/[^0-9.]/g, ''))
    const shopFeeParsed = parseFloat(maintenanceFormState.shopFee.replace(/[^0-9.]/g, ''))
    const taxParsed = parseFloat(maintenanceFormState.tax.replace(/[^0-9.]/g, ''))
    const totalParsed = maintenanceDerivedTotal ? parseFloat(maintenanceDerivedTotal) : NaN
    const mileageParsed = parseFloat(mileageValue)

    const payload = {
      report_date: reportDate,
      mileage: Number.isFinite(mileageParsed) ? Number(mileageParsed.toFixed(1)) : null,
      make: makeValue || null,
      service_location: serviceLocationValue || null,
      address: addressValue || null,
      labor: Number.isFinite(laborParsed) ? Number(laborParsed.toFixed(2)) : null,
      parts: Number.isFinite(partsParsed) ? Number(partsParsed.toFixed(2)) : null,
      misc: Number.isFinite(miscParsed) ? Number(miscParsed.toFixed(2)) : null,
      shop_fee: Number.isFinite(shopFeeParsed) ? Number(shopFeeParsed.toFixed(2)) : null,
      tax: Number.isFinite(taxParsed) ? Number(taxParsed.toFixed(2)) : null,
      total: Number.isFinite(totalParsed) ? Number(totalParsed.toFixed(2)) : null,
      comments: maintenanceFormState.comments.trim() || null,
    }

    const isEditingMaintenance = editingMaintenanceId !== null && editingMaintenanceId >= 0
    const editingId = editingMaintenanceId
    const targetEndpoint = isEditingMaintenance ? buildApiUrl(`/api/maintenance/${editingId}`) : buildApiUrl('/api/maintenance')
    const method = isEditingMaintenance ? 'PUT' : 'POST'

    setMaintenanceStatusMessage(isEditingMaintenance ? 'Updating maintenance entry...' : 'Submitting maintenance entry...')

    try {
      const response = await fetch(targetEndpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = ''
        try {
          const body = await response.json()
          detail = body?.detail || body?.message || ''
        } catch {
          // ignore parsing errors
        }
        const baseFailure = isEditingMaintenance ? 'Failed to update maintenance entry.' : 'Failed to submit maintenance entry.'
        setMaintenanceStatusMessage(detail ? `${baseFailure.replace('.', '')}: ${detail}` : baseFailure)
        return
      }

      const nextReportDate = payload.report_date
      const previousReportDate = editingMaintenanceOriginalDate

      setMaintenanceFormState(INITIAL_MAINTENANCE_FORM)
      setMaintenanceStatusMessage(
        isEditingMaintenance ? 'Maintenance entry updated successfully.' : 'Maintenance entry submitted successfully.',
      )
      if (nextReportDate) {
        setMaintenanceHistoryOptions((previous) => {
          if (previous.includes(nextReportDate)) {
            return previous
          }
          const next = [...previous, nextReportDate]
          next.sort((a, b) => a.localeCompare(b))
          return next
        })
        setMaintenanceHistoryDate(nextReportDate)
      }

      if (isEditingMaintenance) {
        setEditingMaintenanceId(null)
        setEditingMaintenanceOriginalDate(null)
        setMaintenanceHistoryMenuOpen(false)
        setMaintenanceHistorySearch('')
        setMaintenanceHistoryEditMode(true)
      }

      if (nextReportDate) {
        await fetchMaintenanceHistory(nextReportDate, { force: true })
        if (isEditingMaintenance && previousReportDate && previousReportDate !== nextReportDate) {
          await fetchMaintenanceHistory(previousReportDate, { force: true })
        }
      }

      refreshMaintenanceDates().catch((error) => {
        console.error('Failed to refresh maintenance dates', error)
      })
    } catch (error) {
      console.error('Failed to submit maintenance entry', error)
      setMaintenanceStatusMessage(
        isEditingMaintenance ? 'Failed to update maintenance entry. Please try again.' : 'Failed to submit maintenance entry. Please try again.',
      )
    }
  }

  const handleHistoryMenuToggle = () => {
    setHistoryMenuOpen((prev) => !prev)
  }

  const handleHistorySelect = (value: string) => {
    setHistoryDate(value)
    setHistoryMenuOpen(false)
    setHistorySearch('')
    setEditingReceiptId(null)
  }

  const handleHistorySearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setHistorySearch(event.target.value)
  }

  const handleHistoryDatesRetry = useCallback(() => {
    refreshHistoryDates().catch((error) => {
      console.error('Failed to reload receipt dates', error)
    })
  }, [refreshHistoryDates])

  const toggleHistoryEditMode = () => {
    setHistoryMenuOpen(false)
    if (historyEditMode) {
      setHistoryEditMode(false)
      setEditingReceiptId(null)
      return
    }
    setHistoryEditMode(true)
  }

  const handleStartEditingEntry = (entry: ReceiptHistoryEntry) => {
    if (entry.receipt_id == null) {
      setStatusMessage('This receipt cannot be edited because it was imported from the legacy system.')
      return
    }

    setHistoryEditMode(true)
    setEditingReceiptId(entry.receipt_id)
    setHistoryDate(entry.report_date)
    setHistoryMenuOpen(false)
    setHistorySearch('')

    setFormState({
      date: entry.report_date || '',
      time: normalizeTimeInput(entry.receipt_time),
      fuelType: entry.fuel_type || 'gasoline',
      stationName: entry.gas_station_name || '',
      address: entry.address ?? '',
      costPerGallon: toEditableString(entry.price_per_gallon),
      gallons: toEditableString(entry.gallons),
      comments: entry.comments ?? '',
    })

    setStatusMessage(
      `Editing receipt for ${entry.gas_station_name || 'Unknown station'} on ${
        entry.report_date || 'unknown date'
      }. Adjust the form and save your changes.`,
    )
  }

  const filteredHistoryOptions = useMemo(() => {
    const normalizedSearch = historySearch.trim().toLowerCase()
    if (!normalizedSearch) {
      return historyOptions
    }
    return historyOptions.filter((option) => option.toLowerCase().includes(normalizedSearch))
  }, [historyOptions, historySearch])

  const fetchMaintenanceHistory = useCallback(
    async (dateValue: string, { force = false }: { force?: boolean } = {}) => {
      if (!dateValue) {
        setMaintenanceHistoryStatus('idle')
        setMaintenanceHistoryError(null)
        return
      }

      if (!force && maintenanceHistory[dateValue]) {
        setMaintenanceHistoryStatus('success')
        setMaintenanceHistoryError(null)
        return
      }

      setMaintenanceHistoryStatus('loading')
      setMaintenanceHistoryError(null)

      try {
        const response = await fetch(buildApiUrl(`/api/maintenance/${dateValue}`))
        if (!response.ok) {
          let detail = `Request failed with status ${response.status}`
          try {
            const body = await response.json()
            detail = body?.detail || body?.message || detail
          } catch {
            // ignore parsing errors
          }
          throw new Error(detail)
        }

        const body = await response.json()
        const entriesRaw = Array.isArray(body?.entries) ? (body.entries as unknown[]) : []
        const normalized: MaintenanceHistoryEntry[] = entriesRaw.map((rawEntry: unknown, index: number) => {
          const record = (rawEntry ?? {}) as Record<string, unknown>
          return {
            maintenance_id:
              typeof record.maintenance_id === 'number' && Number.isFinite(record.maintenance_id)
                ? record.maintenance_id
                : index * -1 - 1,
            report_date: typeof record.report_date === 'string' ? record.report_date : dateValue,
            mileage: typeof record.mileage === 'number' ? record.mileage : null,
            make: typeof record.make === 'string' ? record.make : null,
            service_location: typeof record.service_location === 'string' ? record.service_location : null,
            address: typeof record.address === 'string' ? record.address : null,
            labor: typeof record.labor === 'number' ? record.labor : null,
            parts: typeof record.parts === 'number' ? record.parts : null,
            misc: typeof record.misc === 'number' ? record.misc : null,
            shop_fee: typeof record.shop_fee === 'number' ? record.shop_fee : null,
            tax: typeof record.tax === 'number' ? record.tax : null,
            total: typeof record.total === 'number' ? record.total : null,
            comments: typeof record.comments === 'string' ? record.comments : null,
            created_at: typeof record.created_at === 'string' ? record.created_at : null,
          }
        })

        setMaintenanceHistory((prev) => ({
          ...prev,
          [dateValue]: normalized,
        }))
        setMaintenanceHistoryStatus('success')
        setMaintenanceHistoryError(null)
      } catch (error) {
        console.error('Failed to load maintenance history', error)
        setMaintenanceHistoryStatus('error')
        setMaintenanceHistoryError(error instanceof Error ? error.message : 'Failed to load maintenance history.')
      }
    },
    [maintenanceHistory],
  )

  const handleMaintenanceHistoryToggle = () => {
    setMaintenanceHistoryMenuOpen((prev) => !prev)
  }

  const handleMaintenanceHistorySelect = (value: string) => {
    setMaintenanceHistoryDate(value)
    setMaintenanceHistoryMenuOpen(false)
    setMaintenanceHistorySearch('')
    setEditingMaintenanceId(null)
    setEditingMaintenanceOriginalDate(null)
  }

  const handleMaintenanceHistorySearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setMaintenanceHistorySearch(event.target.value)
  }

  const handleMaintenanceDatesRetry = useCallback(() => {
    refreshMaintenanceDates().catch((error) => {
      console.error('Failed to reload maintenance dates', error)
    })
  }, [refreshMaintenanceDates])

  const toggleMaintenanceHistoryEditMode = () => {
    setMaintenanceHistoryMenuOpen(false)
    if (maintenanceHistoryEditMode) {
      setMaintenanceHistoryEditMode(false)
      setEditingMaintenanceId(null)
      setEditingMaintenanceOriginalDate(null)
      return
    }
    setMaintenanceHistoryEditMode(true)
  }

  const handleStartEditingMaintenanceEntry = (entry: MaintenanceHistoryEntry) => {
    if (typeof entry.maintenance_id !== 'number' || entry.maintenance_id < 0) {
      setMaintenanceStatusMessage('This maintenance entry cannot be edited because it was imported from the legacy system.')
      return
    }

    setMaintenanceHistoryEditMode(true)
    setEditingMaintenanceId(entry.maintenance_id)
    setEditingMaintenanceOriginalDate(entry.report_date || null)
    setMaintenanceHistoryDate(entry.report_date || '')
    setMaintenanceHistoryMenuOpen(false)
    setMaintenanceHistorySearch('')

    setMaintenanceFormState({
      date: entry.report_date || '',
      mileage: formatNumberForInput(entry.mileage, 1),
      make: entry.make ?? '',
      serviceLocation: entry.service_location ?? '',
      address: entry.address ?? '',
      labor: formatNumberForInput(entry.labor, 2),
      parts: formatNumberForInput(entry.parts, 2),
      misc: formatNumberForInput(entry.misc, 2),
      shopFee: formatNumberForInput(entry.shop_fee, 2),
      tax: formatNumberForInput(entry.tax, 2),
      comments: entry.comments ?? '',
    })

    setMaintenanceStatusMessage(
      `Editing maintenance entry for ${entry.service_location || 'this vehicle'} on ${
        entry.report_date || 'unknown date'
      }. Adjust the form and choose Save Changes.`,
    )
  }

  const filteredMaintenanceOptions = useMemo(() => {
    const normalizedSearch = maintenanceHistorySearch.trim().toLowerCase()
    if (!normalizedSearch) {
      return maintenanceHistoryOptions
    }
    return maintenanceHistoryOptions.filter((option) => option.toLowerCase().includes(normalizedSearch))
  }, [maintenanceHistoryOptions, maintenanceHistorySearch])

  const formatHistoryDateLabel = useCallback((value: string): string => {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (isoMatch) {
      const [, yearStr, monthStr, dayStr] = isoMatch
      const year = Number(yearStr)
      const month = Number(monthStr)
      const day = Number(dayStr)
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        const localDate = new Date(year, month - 1, day)
        return new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(localDate)
      }
    }

    try {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        return new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(parsed)
      }
    } catch {
      // ignore parsing errors
    }
    return value
  }, [])

  useEffect(() => {
    if (!historyDate) {
      setHistoryEntries([])
      setHistoryStatus('idle')
      setHistoryError(null)
      setEditingReceiptId(null)
      return
    }

    const controller = new AbortController()
    const parseNumber = (candidate: unknown): number | null => {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate
      }
      if (typeof candidate === 'string') {
        const parsed = Number(candidate)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }

    const parseString = (candidate: unknown): string | null => {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate
      }
      return null
    }

    const fetchHistory = async () => {
      setHistoryStatus('loading')
      setHistoryError(null)

      try {
        const response = await fetch(buildApiUrl(`/api/receipts/${historyDate}`), {
          signal: controller.signal,
        })

        if (!response.ok) {
          let errorMessage = `Request failed with status ${response.status}`
          try {
            const responseBody = await response.json()
            if (typeof responseBody?.detail === 'string' && responseBody.detail) {
              errorMessage = responseBody.detail
            } else if (typeof responseBody?.message === 'string' && responseBody.message) {
              errorMessage = responseBody.message
            }
          } catch {
            // ignore body parsing errors
          }
          throw new Error(errorMessage)
        }

        const body = await response.json()
        const receipts = Array.isArray(body?.receipts) ? body.receipts : []

        const normalized: ReceiptHistoryEntry[] = receipts.map((item: unknown) => {
          const record = (item ?? {}) as Record<string, unknown>
          const report_date = parseString(record.report_date) ?? historyDate
          return {
            receipt_id: typeof record.receipt_id === 'number' ? record.receipt_id : null,
            report_date,
            receipt_time: parseString(record.receipt_time),
            fuel_type: parseString(record.fuel_type) ?? 'fuel',
            gallons: parseNumber(record.gallons),
            price_per_gallon: parseNumber(record.price_per_gallon),
            address: parseString(record.address),
            gas_station_name: parseString(record.gas_station_name) ?? 'Unknown station',
            comments: parseString(record.comments),
            ingested_at: parseString(record.ingested_at),
          }
        })

        setHistoryEntries(normalized)
        setHistoryStatus('success')
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        console.error('Failed to load past receipts', error)
        setHistoryEntries([])
        setHistoryStatus('error')
        setHistoryError(error instanceof Error ? error.message : 'Failed to load past receipts.')
      }
    }

    fetchHistory()
    return () => controller.abort()
  }, [historyDate])

  useEffect(() => {
    if (!maintenanceHistoryDate) {
      setMaintenanceHistoryStatus('idle')
      setMaintenanceHistoryError(null)
      return
    }

    fetchMaintenanceHistory(maintenanceHistoryDate).catch((error) => {
      console.error('Failed to fetch maintenance history', error)
    })
  }, [maintenanceHistoryDate, fetchMaintenanceHistory])

  useEffect(() => {
    if (!historyMenuOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (historyDropdownRef.current && target && !historyDropdownRef.current.contains(target)) {
        setHistoryMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHistoryMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [historyMenuOpen])

  useEffect(() => {
    if (!historyMenuOpen) {
      setHistorySearch('')
    }
  }, [historyMenuOpen])

  useEffect(() => {
    if (!historyMenuOpen) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      historySearchInputRef.current?.focus()
      historySearchInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [historyMenuOpen])

  useEffect(() => {
    if (!maintenanceHistoryMenuOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (maintenanceHistoryDropdownRef.current && target && !maintenanceHistoryDropdownRef.current.contains(target)) {
        setMaintenanceHistoryMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMaintenanceHistoryMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [maintenanceHistoryMenuOpen])

  useEffect(() => {
    if (!maintenanceHistoryMenuOpen) {
      setMaintenanceHistorySearch('')
    }
  }, [maintenanceHistoryMenuOpen])

  useEffect(() => {
    if (!maintenanceHistoryMenuOpen) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      maintenanceHistorySearchInputRef.current?.focus()
      maintenanceHistorySearchInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [maintenanceHistoryMenuOpen])

  useEffect(() => {
    if (!maintenanceHistoryDate) {
      return
    }
    if (!maintenanceHistoryOptions.includes(maintenanceHistoryDate)) {
      setMaintenanceHistoryDate('')
      setMaintenanceHistorySearch('')
    }
  }, [maintenanceHistoryDate, maintenanceHistoryOptions])

  useEffect(() => {
    const nextDate = maintenanceFormState.date
    if (!nextDate || nextDate === maintenanceHistoryDate) {
      return
    }
    if (!maintenanceHistoryOptions.includes(nextDate)) {
      return
    }
    setMaintenanceHistoryDate(nextDate)
  }, [maintenanceFormState.date, maintenanceHistoryDate, maintenanceHistoryOptions])

  useEffect(() => {
    if (!maintenanceHistoryEditMode) {
      setEditingMaintenanceId(null)
      setEditingMaintenanceOriginalDate(null)
    }
  }, [maintenanceHistoryEditMode])

  useEffect(() => {
    if (!maintenanceHistoryDate) {
      setEditingMaintenanceId(null)
      setEditingMaintenanceOriginalDate(null)
    }
  }, [maintenanceHistoryDate])

  useEffect(() => {
    if (!historyEditMode) {
      setEditingReceiptId(null)
    }
  }, [historyEditMode])

  useEffect(() => {
    if (!historyDate) {
      return
    }
    if (!historyOptions.includes(historyDate)) {
      setHistoryDate('')
      setHistorySearch('')
    }
  }, [historyDate, historyOptions])

  const normalizeTimeInput = (value: string | null): string => {
    if (!value) {
      return ''
    }
    if (value.length >= 5) {
      return value.slice(0, 5)
    }
    return value
  }

  const formatNumberForInput = (value: number | null, fractionDigits: number): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return ''
    }
    const formatted = value.toFixed(fractionDigits)
    const trimmed = formatted.replace(/\.?0+$/, '')
    return trimmed.length > 0 ? trimmed : '0'
  }

  const toEditableString = (value: number | null): string => {
    return formatNumberForInput(value, 3)
  }

  const formatTime = (value: string | null): string => {
    if (!value) {
      return '—'
    }
    if (value.length >= 5) {
      return value.slice(0, 5)
    }
    return value
  }

  const formatGallons = (value: number | null): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '—'
    }
    if (value === 0) {
      return '0'
    }
    const precision = value >= 100 ? 1 : 3
    return value.toFixed(precision).replace(/\.?0+$/, '')
  }

  const formatPrice = (value: number | null): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '—'
    }
    return `$${value.toFixed(3)}`
  }

  const formatTotal = (gallons: number | null, pricePerGallon: number | null): string => {
    if (typeof gallons === 'number' && Number.isFinite(gallons) && typeof pricePerGallon === 'number' && Number.isFinite(pricePerGallon)) {
      const total = gallons * pricePerGallon
      return `$${total.toFixed(2)}`
    }
    return '—'
  }

  if (!isDesktop && pdfOpen) {
    return <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
  }

  return (
    <div className={`pdf-layout chart-with-sidebar receipt-layout ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
      <Sidebar mode="graphs" sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onOpenViewer={() => setPdfOpen(true)} />
      <main className="pdf-content receipt-content">
        <div className="receipt-input-page">
          <h1 className="receipt-page-title">Receipt Input</h1>

          <section className="chart-card receipt-input-card" aria-label="Data Entry Form">
            {editingReceiptId !== null && (
              <div className="receipt-editing-banner" role="status" aria-live="polite">
                Editing existing receipt. Update the fields and choose Save Changes.
              </div>
            )}
            <form className="receipt-form" onSubmit={handleSubmit} onReset={handleReset}>
              <div className="receipt-form-row">
                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="receipt-date">
                    Date
                  </label>
                  <DatePickerField
                    id="receipt-date"
                    name="receipt-date"
                    value={formState.date}
                    onChange={(nextDate) =>
                      setFormState((previous) => ({
                        ...previous,
                        date: nextDate,
                      }))
                    }
                    placeholder="Select date"
                    ariaLabel="Select receipt date"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="receipt-time">
                    Time
                  </label>
                  <TimeSelectField
                    id="receipt-time"
                    name="receipt-time"
                    value={formState.time}
                    onChange={(nextTime) =>
                      setFormState((previous) => ({
                        ...previous,
                        time: nextTime,
                      }))
                    }
                    placeholder="Select time"
                    ariaLabel="Select receipt time"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="receipt-fuel-type">
                    Fuel Type
                  </label>
                  <div className={`receipt-select${fuelMenuOpen ? ' is-open' : ''}`} ref={fuelDropdownRef}>
                    <button
                      type="button"
                      id="receipt-fuel-type"
                      className="receipt-select-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={fuelMenuOpen}
                      aria-controls="receipt-fuel-type-menu"
                      onClick={handleFuelMenuToggle}
                      onKeyDown={handleFuelTriggerKeyDown}
                      ref={fuelTriggerRef}
                    >
                      <span className="receipt-select-label">{fuelTypeLabel}</span>
                      <span className="receipt-select-caret" aria-hidden="true">
                        ▾
                      </span>
                    </button>
                    <input type="hidden" name="receipt-fuel-type" value={formState.fuelType} />
                    {fuelMenuOpen && (
                      <ul
                        className="receipt-select-menu"
                        role="listbox"
                        id="receipt-fuel-type-menu"
                        aria-labelledby="receipt-fuel-type"
                      >
                        {FUEL_TYPE_OPTIONS.map((option, optionIndex) => (
                          <li key={option.value}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={formState.fuelType === option.value}
                              className={`receipt-select-option${
                                formState.fuelType === option.value ? ' is-selected' : ''
                              }`}
                              onClick={() => handleFuelOptionSelect(option.value)}
                              onKeyDown={(event) => handleFuelOptionKeyDown(event, optionIndex)}
                              ref={(element) => {
                                fuelOptionRefs.current[option.value] = element
                              }}
                            >
                              {option.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="receipt-station-name">
                    Gas Station Name
                  </label>
                  <input
                    id="receipt-station-name"
                    name="receipt-station-name"
                    type="text"
                    value={formState.stationName}
                    onChange={handleFieldChange('stationName')}
                    placeholder="Shell, Pilot, Love's, etc."
                    autoComplete="organization"
                  />
                </div>
              </div>

              <div className="receipt-form-row">
                <div className="receipt-input-field receipt-input-field--wide">
                  <label className="receipt-input-label" htmlFor="receipt-address">
                    Address
                  </label>
                  <input
                    id="receipt-address"
                    name="receipt-address"
                    type="text"
                    value={formState.address}
                    onChange={handleFieldChange('address')}
                    placeholder="123 Main St, City, ST"
                    autoComplete="street-address"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="receipt-cost-per-gallon">
                    Cost / Gal
                  </label>
                  <input
                    id="receipt-cost-per-gallon"
                    name="receipt-cost-per-gallon"
                    type="number"
                    min="0"
                    step="0.001"
                    value={formState.costPerGallon}
                    onChange={handleFieldChange('costPerGallon')}
                    placeholder="3.259"
                    inputMode="decimal"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="receipt-gallons">
                    Gallons
                  </label>
                  <input
                    id="receipt-gallons"
                    name="receipt-gallons"
                    type="number"
                    min="0"
                    step="0.001"
                    value={formState.gallons}
                    onChange={handleFieldChange('gallons')}
                    placeholder="120"
                    inputMode="decimal"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="receipt-total">
                    Total
                  </label>
                  <input
                    id="receipt-total"
                    name="receipt-total"
                    type="text"
                    value={derivedTotal || 'AUTO'}
                    readOnly
                    aria-label="Total cost calculated from cost per gallon and gallons"
                  />
                </div>
              </div>

              <div className="receipt-form-row">
                <div className="receipt-input-field receipt-input-field--wide">
                  <label className="receipt-input-label" htmlFor="receipt-comments">
                    Comments (Optional)
                  </label>
                  <textarea
                    id="receipt-comments"
                    name="receipt-comments"
                    value={formState.comments}
                    onChange={handleFieldChange('comments')}
                    placeholder="Any notes about this purchase..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="receipt-bottom-row">
                <section className="receipt-history" aria-label="Past entries">
                  <header className="receipt-panel-header">
                    <h2>Past Entries</h2>
                    <div
                      className={`receipt-history-selector${historyMenuOpen ? ' is-open' : ''}`}
                      ref={historyDropdownRef}
                    >
                      <button
                        type="button"
                        className="receipt-panel-action receipt-history-toggle"
                        onClick={handleHistoryMenuToggle}
                        aria-haspopup="listbox"
                        aria-expanded={historyMenuOpen}
                        ref={historyTriggerRef}
                      >
                        <span>{historyDate ? formatHistoryDateLabel(historyDate) : 'Select Date'}</span>
                        <span className="receipt-history-toggle-icon" aria-hidden="true">
                          ▾
                        </span>
                      </button>
                      {historyMenuOpen && (
                        <div
                          ref={historyMenuRef}
                          className="receipt-history-menu"
                          role="presentation"
                          style={historyMenuStyle}
                        >
                          <div className="receipt-history-search">
                            <input
                              ref={historySearchInputRef}
                              type="text"
                              value={historySearch}
                              onChange={handleHistorySearchChange}
                              placeholder="Search dates..."
                              aria-label="Search receipt dates"
                            />
                          </div>
                          <div className="receipt-history-options">
                            {(historyOptionsStatus === 'loading' || historyOptionsStatus === 'idle') && (
                              <p className="receipt-history-menu-placeholder">Loading dates...</p>
                            )}
                            {historyOptionsStatus === 'error' && (
                              <div className="receipt-history-menu-error">
                                <p>
                                  Failed to load dates
                                  {historyOptionsError ? `: ${historyOptionsError}` : '.'}
                                </p>
                                <button type="button" onClick={handleHistoryDatesRetry}>
                                  Retry
                                </button>
                              </div>
                            )}
                            {filteredHistoryOptions.length > 0 && (
                              <ul
                                className="receipt-history-options-list"
                                role="listbox"
                                aria-label="Available receipt dates"
                              >
                                {filteredHistoryOptions.map((option) => {
                                  const isActive = option === historyDate
                                  return (
                                    <li key={option}>
                                      <button
                                        type="button"
                                        className={`receipt-history-option${isActive ? ' is-active' : ''}`}
                                        onClick={() => handleHistorySelect(option)}
                                        role="option"
                                        aria-selected={isActive}
                                      >
                                        <span className="receipt-history-option-label">{option}</span>
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                            {historyOptionsStatus === 'success' && filteredHistoryOptions.length === 0 && (
                              <p className="receipt-history-menu-placeholder">
                                {historyOptions.length === 0
                                  ? 'No receipt dates available yet.'
                                  : `No dates matching "${historySearch}".`}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </header>
                  {!historyDate && historyOptionsStatus !== 'error' && (
                    <p className="receipt-panel-placeholder">Select a date to view past entries you&apos;ve submitted.</p>
                  )}
                  {!historyDate && historyOptionsStatus === 'error' && (
                    <div className="receipt-history-error">
                      <p className="receipt-panel-placeholder">
                        Unable to load available dates{historyOptionsError ? `: ${historyOptionsError}` : '.'}
                      </p>
                      <button type="button" className="receipt-history-retry" onClick={handleHistoryDatesRetry}>
                        Retry loading dates
                      </button>
                    </div>
                  )}
                  {historyDate && historyStatus === 'loading' && (
                    <p className="receipt-panel-placeholder">Loading entries for {historyDate}...</p>
                  )}
                  {historyDate && historyStatus === 'error' && (
                    <p className="receipt-panel-placeholder">
                      Failed to load entries{historyError ? `: ${historyError}` : '. Please try again.'}
                    </p>
                  )}
                  {historyDate && historyStatus === 'success' && historyEntries.length === 0 && (
                    <p className="receipt-panel-placeholder">No entries found for {historyDate}.</p>
                  )}
                  {historyDate && historyStatus === 'success' && historyEntries.length > 0 && (
                    <ul className="receipt-history-list">
                      {historyEntries.map((entry, index) => {
                        const key =
                          entry.receipt_id !== null
                            ? `receipt-${entry.receipt_id}`
                            : `receipt-${entry.gas_station_name}-${entry.receipt_time ?? 'none'}-${entry.ingested_at ?? index}`
                        const entryClasses = ['receipt-history-entry']
                        if (historyEditMode) {
                          entryClasses.push('is-editable')
                        }
                        if (editingReceiptId !== null && entry.receipt_id === editingReceiptId) {
                          entryClasses.push('is-active')
                        }
                        return (
                          <li key={key} className={entryClasses.join(' ')}>
                            <div className="receipt-history-entry-header">
                              <div>
                                <p className="receipt-history-entry-station">{entry.gas_station_name}</p>
                                <p className="receipt-history-entry-meta">
                                  {formatTime(entry.receipt_time)} · {entry.fuel_type}
                                </p>
                              </div>
                              <div className="receipt-history-entry-total">
                                <span>{formatPrice(entry.price_per_gallon)}</span>
                                <span>per gal</span>
                              </div>
                            </div>
                            <dl className="receipt-history-entry-grid">
                              <div>
                                <dt>Gallons</dt>
                                <dd>{formatGallons(entry.gallons)}</dd>
                              </div>
                              <div>
                                <dt>Total</dt>
                                <dd>{formatTotal(entry.gallons, entry.price_per_gallon)}</dd>
                              </div>
                            </dl>
                            {entry.address && <p className="receipt-history-entry-address">{entry.address}</p>}
                            {entry.comments && <p className="receipt-history-entry-comments">“{entry.comments}”</p>}
                            {historyEditMode &&
                              (entry.receipt_id !== null ? (
                                <button
                                  type="button"
                                  className="receipt-history-entry-edit"
                                  onClick={() => handleStartEditingEntry(entry)}
                                >
                                  Edit Entry
                                </button>
                              ) : (
                                <p className="receipt-history-entry-note">Legacy entries cannot be edited.</p>
                              ))}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <div className="receipt-history-footer">
                    {historyEditMode && <span className="receipt-history-edit-indicator">Edit mode enabled</span>}
                    <button
                      type="button"
                      className={`receipt-history-cog${historyEditMode ? ' is-active' : ''}`}
                      onClick={toggleHistoryEditMode}
                      aria-pressed={historyEditMode}
                      aria-label={historyEditMode ? 'Disable editing for past entries' : 'Enable editing for past entries'}
                    >
                      ⚙
                    </button>
                  </div>
                </section>

                <section className="receipt-preview" aria-label="Receipt preview">
                  <header className="receipt-panel-header">
                    <h2>Preview</h2>
                  </header>
                  <dl className="receipt-preview-grid">
                    <div>
                      <dt>Date</dt>
                      <dd>{formState.date || '—'}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{formState.time || '—'}</dd>
                    </div>
                    <div>
                      <dt>Fuel</dt>
                      <dd>{formState.fuelType || '—'}</dd>
                    </div>
                    <div>
                      <dt>Station</dt>
                      <dd>{formState.stationName || '—'}</dd>
                    </div>
                    <div>
                      <dt>Gallons</dt>
                      <dd>{formState.gallons || '—'}</dd>
                    </div>
                    <div>
                      <dt>Cost / Gal</dt>
                      <dd>{formState.costPerGallon || '—'}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>{derivedTotal || 'AUTO'}</dd>
                    </div>
                    <div>
                      <dt>Address</dt>
                      <dd>{formState.address || '—'}</dd>
                    </div>
                    <div>
                      <dt>Comments</dt>
                      <dd>{formState.comments || '—'}</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <div className="receipt-submit-row">
                <button type="reset" className="receipt-input-reset">
                  {editingReceiptId !== null ? 'Cancel' : 'Clear'}
                </button>
                <button type="submit" className="receipt-input-submit">
                  {editingReceiptId !== null ? 'Save Changes' : 'Submit'}
                </button>
              </div>
            </form>

            {statusMessage && (
              <p className="receipt-input-status" role="status" aria-live="polite">
                {statusMessage}
              </p>
            )}
          </section>
        </div>

        <h2 className="maintenance-section-title">Maintenance Entry</h2>

        <div className="receipt-input-page maintenance-input-page">
          <section className="chart-card receipt-input-card maintenance-input-card" aria-label="Maintenance Entry Form">
            {editingMaintenanceId !== null && (
              <div className="receipt-editing-banner" role="status" aria-live="polite">
                Editing existing maintenance entry. Update the fields and choose Save Changes.
              </div>
            )}
            <form className="receipt-form" onSubmit={handleMaintenanceSubmit} onReset={handleMaintenanceReset}>
              <div className="receipt-form-row">
                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-date">
                    Date
                  </label>
                  <DatePickerField
                    id="maintenance-date"
                    name="maintenance-date"
                    value={maintenanceFormState.date}
                    onChange={(nextDate) =>
                      setMaintenanceFormState((previous) => ({
                        ...previous,
                        date: nextDate,
                      }))
                    }
                    placeholder="Select date"
                    ariaLabel="Select maintenance date"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-mileage">
                    Mileage
                  </label>
                  <input
                    id="maintenance-mileage"
                    name="maintenance-mileage"
                    type="number"
                    min="0"
                    step="1"
                    value={maintenanceFormState.mileage}
                    onChange={handleMaintenanceFieldChange('mileage')}
                    placeholder="125000"
                    inputMode="numeric"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-make">
                    Make / Year
                  </label>
                  <input
                    id="maintenance-make"
                    name="maintenance-make"
                    type="text"
                    value={maintenanceFormState.make}
                    onChange={handleMaintenanceFieldChange('make')}
                    placeholder="Freightliner, Peterbilt, etc."
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-service-location">
                    Service Location
                  </label>
                  <input
                    id="maintenance-service-location"
                    name="maintenance-service-location"
                    type="text"
                    value={maintenanceFormState.serviceLocation}
                    onChange={handleMaintenanceFieldChange('serviceLocation')}
                    placeholder="Fleet Pride, Shop Name, etc."
                    autoComplete="organization"
                  />
                </div>
              </div>

              <div className="receipt-form-row">
                <div className="receipt-input-field receipt-input-field--wide">
                  <label className="receipt-input-label" htmlFor="maintenance-address">
                    Address
                  </label>
                  <input
                    id="maintenance-address"
                    name="maintenance-address"
                    type="text"
                    value={maintenanceFormState.address}
                    onChange={handleMaintenanceFieldChange('address')}
                    placeholder="123 Main St, City, ST"
                    autoComplete="street-address"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-labor">
                    Labor
                  </label>
                  <input
                    id="maintenance-labor"
                    name="maintenance-labor"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintenanceFormState.labor}
                    onChange={handleMaintenanceFieldChange('labor')}
                    placeholder="250.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-parts">
                    Parts / Other
                  </label>
                  <input
                    id="maintenance-parts"
                    name="maintenance-parts"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintenanceFormState.parts}
                    onChange={handleMaintenanceFieldChange('parts')}
                    placeholder="125.50"
                    inputMode="decimal"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-misc">
                    Misc
                  </label>
                  <input
                    id="maintenance-misc"
                    name="maintenance-misc"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintenanceFormState.misc}
                    onChange={handleMaintenanceFieldChange('misc')}
                    placeholder="45.00"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="receipt-form-row">
                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-shop-fee">
                    Shop Fee
                  </label>
                  <input
                    id="maintenance-shop-fee"
                    name="maintenance-shop-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintenanceFormState.shopFee}
                    onChange={handleMaintenanceFieldChange('shopFee')}
                    placeholder="25.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-tax">
                    Tax
                  </label>
                  <input
                    id="maintenance-tax"
                    name="maintenance-tax"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintenanceFormState.tax}
                    onChange={handleMaintenanceFieldChange('tax')}
                    placeholder="12.34"
                    inputMode="decimal"
                  />
                </div>

                <div className="receipt-input-field">
                  <label className="receipt-input-label" htmlFor="maintenance-total">
                    Total
                  </label>
                  <input
                    id="maintenance-total"
                    name="maintenance-total"
                    type="text"
                    value={maintenanceDerivedTotal || 'AUTO'}
                    readOnly
                    aria-label="Total cost calculated from labor, parts, misc, shop fee, and tax"
                  />
                </div>
              </div>

              <div className="receipt-form-row">
                <div className="receipt-input-field receipt-input-field--wide">
                  <label className="receipt-input-label" htmlFor="maintenance-comments">
                    Comments (Optional)
                  </label>
                  <textarea
                    id="maintenance-comments"
                    name="maintenance-comments"
                    value={maintenanceFormState.comments}
                    onChange={handleMaintenanceFieldChange('comments')}
                    placeholder="Any notes about this maintenance entry..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="receipt-bottom-row maintenance-bottom-row">
                <section className="receipt-history" aria-label="Maintenance entries">
                  <header className="receipt-panel-header">
                    <h2>Past Entries</h2>
                    <div
                      className={`receipt-history-selector${maintenanceHistoryMenuOpen ? ' is-open' : ''}`}
                      ref={maintenanceHistoryDropdownRef}
                    >
                      <button
                        type="button"
                        className="receipt-panel-action receipt-history-toggle"
                        onClick={handleMaintenanceHistoryToggle}
                        aria-haspopup="listbox"
                        aria-expanded={maintenanceHistoryMenuOpen}
                        ref={maintenanceHistoryTriggerRef}
                      >
                        <span>{maintenanceHistoryDate ? formatHistoryDateLabel(maintenanceHistoryDate) : 'Select Date'}</span>
                        <span className="receipt-history-toggle-icon" aria-hidden="true">
                          ▾
                        </span>
                      </button>
                      {maintenanceHistoryMenuOpen && (
                        <div
                          ref={maintenanceHistoryMenuRef}
                          className="receipt-history-menu"
                          role="presentation"
                          style={maintenanceMenuStyle}
                        >
                          <div className="receipt-history-search">
                            <input
                              ref={maintenanceHistorySearchInputRef}
                              type="text"
                              value={maintenanceHistorySearch}
                              onChange={handleMaintenanceHistorySearchChange}
                              placeholder="Search dates..."
                              aria-label="Search maintenance dates"
                            />
                          </div>
                          <div className="receipt-history-options">
                            {(maintenanceHistoryOptionsStatus === 'loading' || maintenanceHistoryOptionsStatus === 'idle') && (
                              <p className="receipt-history-menu-placeholder">Loading dates...</p>
                            )}
                            {maintenanceHistoryOptionsStatus === 'error' && (
                              <div className="receipt-history-menu-error">
                                <p>
                                  Failed to load dates
                                  {maintenanceHistoryOptionsError ? `: ${maintenanceHistoryOptionsError}` : '.'}
                                </p>
                                <button type="button" onClick={handleMaintenanceDatesRetry}>
                                  Retry
                                </button>
                              </div>
                            )}
                            {filteredMaintenanceOptions.length > 0 && (
                              <ul
                                className="receipt-history-options-list"
                                role="listbox"
                                aria-label="Available maintenance dates"
                              >
                                {filteredMaintenanceOptions.map((option) => {
                                  const isActive = option === maintenanceHistoryDate
                                  return (
                                    <li key={option}>
                                      <button
                                        type="button"
                                        className={`receipt-history-option${isActive ? ' is-active' : ''}`}
                                        onClick={() => handleMaintenanceHistorySelect(option)}
                                        role="option"
                                        aria-selected={isActive}
                                      >
                                        <span className="receipt-history-option-label">{option}</span>
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                            {maintenanceHistoryOptionsStatus === 'success' && filteredMaintenanceOptions.length === 0 && (
                              <p className="receipt-history-menu-placeholder">
                                {maintenanceHistoryOptions.length === 0
                                  ? 'No maintenance dates available yet.'
                                  : `No dates matching "${maintenanceHistorySearch}".`}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </header>
                  {!maintenanceHistoryDate && maintenanceHistoryOptionsStatus !== 'error' && (
                    <p className="receipt-panel-placeholder">Select a date to view maintenance history.</p>
                  )}
                  {!maintenanceHistoryDate && maintenanceHistoryOptionsStatus === 'error' && (
                    <div className="receipt-history-error">
                      <p className="receipt-panel-placeholder">
                        Unable to load available dates{maintenanceHistoryOptionsError ? `: ${maintenanceHistoryOptionsError}` : '.'}
                      </p>
                      <button type="button" className="receipt-history-retry" onClick={handleMaintenanceDatesRetry}>
                        Retry loading dates
                      </button>
                    </div>
                  )}
                  {maintenanceHistoryDate && maintenanceHistoryStatus === 'loading' && (
                    <p className="receipt-panel-placeholder">Loading maintenance entries for {maintenanceHistoryDate}...</p>
                  )}
                  {maintenanceHistoryDate && maintenanceHistoryStatus === 'error' && (
                    <p className="receipt-panel-placeholder">
                      Failed to load maintenance entries
                      {maintenanceHistoryError ? `: ${maintenanceHistoryError}` : '. Please try again.'}
                    </p>
                  )}
                  {maintenanceHistoryDate &&
                    maintenanceHistoryStatus === 'success' &&
                    (maintenanceHistory[maintenanceHistoryDate]?.length ?? 0) === 0 && (
                      <p className="receipt-panel-placeholder">No maintenance entries found for {maintenanceHistoryDate}.</p>
                    )}
                  {maintenanceHistoryDate &&
                    maintenanceHistoryStatus === 'success' &&
                    (maintenanceHistory[maintenanceHistoryDate]?.length ?? 0) > 0 && (
                      <ul className="receipt-history-list">
                        {maintenanceHistory[maintenanceHistoryDate]!.map((entry) => {
                          const entryKey = entry.maintenance_id
                          const entryClasses = ['receipt-history-entry']
                          if (maintenanceHistoryEditMode) {
                            entryClasses.push('is-editable')
                          }
                          if (editingMaintenanceId !== null && entry.maintenance_id === editingMaintenanceId) {
                            entryClasses.push('is-active')
                          }
                          const isEditable = typeof entry.maintenance_id === 'number' && entry.maintenance_id >= 0
                          return (
                            <li key={entryKey} className={entryClasses.join(' ')}>
                              <div className="receipt-history-entry-header">
                                <div>
                                  <p className="receipt-history-entry-station">{entry.service_location || '—'}</p>
                                  <p className="receipt-history-entry-meta">
                                    {entry.make || 'Unknown make'}
                                    {entry.mileage !== null ? ` · ${entry.mileage.toLocaleString()} mi` : ''}
                                  </p>
                                </div>
                                <div className="receipt-history-entry-total">
                                  <span>{entry.total !== null ? `$${entry.total.toFixed(2)}` : '—'}</span>
                                  <span>Total</span>
                                </div>
                              </div>
                              <dl className="receipt-history-entry-grid">
                                <div>
                                  <dt>Labor</dt>
                                  <dd>{entry.labor !== null ? `$${entry.labor.toFixed(2)}` : '—'}</dd>
                                </div>
                                <div>
                                  <dt>Parts / Other</dt>
                                  <dd>{entry.parts !== null ? `$${entry.parts.toFixed(2)}` : '—'}</dd>
                                </div>
                                <div>
                                  <dt>Misc</dt>
                                  <dd>{entry.misc !== null ? `$${entry.misc.toFixed(2)}` : '—'}</dd>
                                </div>
                                <div>
                                  <dt>Shop Fee</dt>
                                  <dd>{entry.shop_fee !== null ? `$${entry.shop_fee.toFixed(2)}` : '—'}</dd>
                                </div>
                                <div>
                                  <dt>Tax</dt>
                                  <dd>{entry.tax !== null ? `$${entry.tax.toFixed(2)}` : '—'}</dd>
                                </div>
                              </dl>
                              {entry.address && <p className="receipt-history-entry-address">{entry.address}</p>}
                              {entry.comments && <p className="receipt-history-entry-comments">“{entry.comments}”</p>}
                              {maintenanceHistoryEditMode &&
                                (isEditable ? (
                                  <button
                                    type="button"
                                    className="receipt-history-entry-edit"
                                    onClick={() => handleStartEditingMaintenanceEntry(entry)}
                                  >
                                    Edit Entry
                                  </button>
                                ) : (
                                  <p className="receipt-history-entry-note">Legacy entries cannot be edited.</p>
                                ))}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  <div className="receipt-history-footer">
                    {maintenanceHistoryEditMode && (
                      <span className="receipt-history-edit-indicator">Edit mode enabled</span>
                    )}
                    <button
                      type="button"
                      className={`receipt-history-cog${maintenanceHistoryEditMode ? ' is-active' : ''}`}
                      onClick={toggleMaintenanceHistoryEditMode}
                      aria-pressed={maintenanceHistoryEditMode}
                      aria-label={
                        maintenanceHistoryEditMode
                          ? 'Disable editing for maintenance entries'
                          : 'Enable editing for maintenance entries'
                      }
                    >
                      ⚙
                    </button>
                  </div>
                </section>

                <section className="receipt-preview" aria-label="Maintenance preview">
                  <header className="receipt-panel-header">
                    <h2>Preview</h2>
                  </header>
                  <dl className="receipt-preview-grid">
                    <div>
                      <dt>Date</dt>
                      <dd>{maintenanceFormState.date || '—'}</dd>
                    </div>
                    <div>
                      <dt>Mileage</dt>
                      <dd>{maintenanceFormState.mileage || '—'}</dd>
                    </div>
                    <div>
                      <dt>Make / Year</dt>
                      <dd>{maintenanceFormState.make || '—'}</dd>
                    </div>
                    <div>
                      <dt>Service Location</dt>
                      <dd>{maintenanceFormState.serviceLocation || '—'}</dd>
                    </div>
                    <div>
                      <dt>Parts / Other</dt>
                      <dd>{maintenanceFormState.parts || '—'}</dd>
                    </div>
                    <div>
                      <dt>Misc</dt>
                      <dd>{maintenanceFormState.misc || '—'}</dd>
                    </div>
                    <div>
                      <dt>Shop Fee</dt>
                      <dd>{maintenanceFormState.shopFee || '—'}</dd>
                    </div>
                    <div>
                      <dt>Tax</dt>
                      <dd>{maintenanceFormState.tax || '—'}</dd>
                    </div>
                    <div>
                      <dt>Labor</dt>
                      <dd>{maintenanceFormState.labor || '—'}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>{maintenanceDerivedTotal || 'AUTO'}</dd>
                    </div>
                    <div>
                      <dt>Address</dt>
                      <dd>{maintenanceFormState.address || '—'}</dd>
                    </div>
                    <div>
                      <dt>Comments</dt>
                      <dd>{maintenanceFormState.comments || '—'}</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <div className="receipt-submit-row">
                <button type="reset" className="receipt-input-reset">
                  {editingMaintenanceId !== null ? 'Cancel' : 'Clear'}
                </button>
                <button type="submit" className="receipt-input-submit">
                  {editingMaintenanceId !== null ? 'Save Changes' : 'Submit'}
                </button>
              </div>
            </form>

            {maintenanceStatusMessage && (
              <p className="receipt-input-status" role="status" aria-live="polite">
                {maintenanceStatusMessage}
              </p>
            )}
          </section>
        </div>

        <div className="route-logs-section">
          <h2 className="route-logs-label">Route Logs</h2>
          <div className="route-logs-container">
            <div className="route-logs-layout">
              <div className="route-logs-sidebar">
                <div className="route-logs-fields">
                  <div className="receipt-input-field route-logs-date-field">
                    <label className="receipt-input-label" htmlFor="route-logs-date">
                      Date
                    </label>
                    <DatePickerField
                      id="route-logs-date"
                      name="route-logs-date"
                      value={routeLogsDate}
                      onChange={setRouteLogsDate}
                      placeholder="Select date"
                      ariaLabel="Select route log date"
                    />
                  </div>
                  <div className="receipt-input-field route-logs-driver-field">
                    <label className="receipt-input-label" htmlFor="route-logs-driver">
                      Driver Name
                    </label>
                    <input
                      id="route-logs-driver"
                      name="route-logs-driver"
                      type="text"
                      placeholder="Enter driver name"
                      value={routeLogsDriver}
                      onChange={(event) => setRouteLogsDriver(event.target.value)}
                    />
                  </div>
                  <div className="receipt-input-field route-logs-truck-field">
                    <label className="receipt-input-label" htmlFor="route-logs-truck">
                      Truck
                    </label>
                    <input
                      id="route-logs-truck"
                      name="route-logs-truck"
                      type="text"
                      placeholder="Enter year and model"
                      value={routeLogsTruck}
                      onChange={(event) => setRouteLogsTruck(event.target.value)}
                    />
                  </div>
                </div>
                <div className="route-logs-view-selector" ref={routeLogsDropdownRef}>
                  <label className="receipt-input-label" htmlFor="route-logs-view-select">
                    View Logs
                  </label>
                  <button
                    type="button"
                    id="route-logs-view-select"
                    className={`receipt-panel-action receipt-history-toggle route-logs-view-toggle${routeLogsMenuOpen ? ' is-open' : ''}`}
                    onClick={() => setRouteLogsMenuOpen((prev) => !prev)}
                    aria-haspopup="listbox"
                    aria-expanded={routeLogsMenuOpen}
                    ref={routeLogsTriggerRef}
                  >
                    <span>
                      {routeLogsOptionsStatus === 'loading'
                        ? 'Loading dates...'
                        : routeLogsOptionsStatus === 'error'
                        ? 'Dates unavailable'
                        : routeLogsViewDate || 'Select date'}
                    </span>
                    <span className="receipt-history-toggle-icon" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {routeLogsMenuOpen && (
                    <div
                      ref={routeLogsMenuRef}
                      className="receipt-history-menu route-logs-view-menu"
                      role="presentation"
                      style={routeLogsMenuStyle}
                    >
                      <div className="receipt-history-search">
                        <input
                          ref={routeLogsSearchInputRef}
                          type="text"
                          value={routeLogsSearch}
                          onChange={(event) => setRouteLogsSearch(event.target.value)}
                          placeholder="Search dates..."
                          aria-label="Search route log dates"
                          disabled={routeLogsOptionsStatus !== 'success'}
                        />
                      </div>
                      <div className="receipt-history-options">
                        {(routeLogsOptionsStatus === 'idle' || routeLogsOptionsStatus === 'loading') && (
                          <p className="receipt-history-menu-placeholder">Loading dates...</p>
                        )}
                        {routeLogsOptionsStatus === 'error' && (
                          <p className="receipt-history-menu-placeholder">
                            {routeLogsOptionsError
                              ? `Failed to load route log dates: ${routeLogsOptionsError}`
                              : 'Failed to load route log dates.'}
                          </p>
                        )}
                        {routeLogsOptionsStatus === 'success' && filteredRouteLogsOptions.length > 0 && (
                          <ul className="receipt-history-options-list" role="listbox" aria-label="Available route log dates">
                            {filteredRouteLogsOptions.map((option) => {
                              const isActive = option === routeLogsViewDate
                              return (
                                <li key={option}>
                                  <button
                                    type="button"
                                    className={`receipt-history-option${isActive ? ' is-active' : ''}`}
                                    onClick={() => {
                                      setRouteLogsViewDate(option)
                                      setRouteLogsMenuOpen(false)
                                      loadRouteLogByDate(option)
                                    }}
                                    role="option"
                                    aria-selected={isActive}
                                    disabled={routeLogsLoadingDate === option}
                                  >
                                    <span className="receipt-history-option-label">{option}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        {routeLogsOptionsStatus === 'success' && filteredRouteLogsOptions.length === 0 && (
                          <p className="receipt-history-menu-placeholder">
                            {routeLogsOptions.length === 0
                              ? 'No logs available yet.'
                              : `No dates matching "${routeLogsSearch}".`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {routeLogsOptionsStatus === 'error' && routeLogsOptionsError && (
                  <p className="route-logs-error">
                    Failed to load route log dates: {routeLogsOptionsError}
                  </p>
                )}
                <div className="route-logs-actions">
                  <button type="button" className="route-logs-button" onClick={handleAddRouteStop}>
                    Add Stop
                  </button>
                  <button type="button" className="route-logs-button" onClick={handleAddFuelStop}>
                    Add Fuel Stop
                  </button>
                  <button
                    type="button"
                    className="route-logs-button"
                    onClick={handleClearRouteLog}
                    disabled={routeLogsSaving || routeLogsDeleting}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="route-logs-button"
                    onClick={handleSaveRouteLog}
                    disabled={routeLogsSaving || routeLogsDeleting}
                  >
                    {routeLogsSaving ? 'Saving...' : 'Save to DB'}
                  </button>
                  <button
                    type="button"
                    className="route-logs-button route-logs-button--danger"
                    onClick={handleDeleteRouteLog}
                    disabled={routeLogsDeleting || routeLogsSaving}
                  >
                    {routeLogsDeleting ? 'Deleting...' : 'Delete from DB'}
                  </button>
                </div>
                {routeLogsStatusMessage && (
                  <p className="receipt-input-status" role="status" aria-live="polite">
                    {routeLogsStatusMessage}
                  </p>
                )}
              </div>
              <div className="route-logs-stops">
                {routeVendorsStatus === 'error' && (
                  <p className="route-logs-error">
                    Failed to load vendors{routeVendorsError ? `: ${routeVendorsError}` : '.'}
                  </p>
                )}
                {routeStops.length === 0 ? (
                  <p className="route-logs-placeholder">
                    {routeVendorsStatus === 'loading'
                      ? 'Loading vendors...'
                      : 'Add a stop to begin tracking the route.'}
                  </p>
                ) : (
                  routeStops.map((stop) => {
                    const isFuelStop = stop.type === 'fuel'
                    const rowClasses = ['route-logs-stop-row']
                    if (isFuelStop) {
                      rowClasses.push('route-logs-stop-row--fuel')
                    }
                    return (
                      <div key={stop.id} className={rowClasses.join(' ')}>
                        {isFuelStop ? (
                          <>
                            <div className="route-logs-stop-field route-logs-stop-field--fuel-start">
                              <span className="route-logs-fuel-icon" aria-hidden="true" title="Fuel stop">⛽</span>
                              <label className="route-logs-stop-label" htmlFor={`route-stop-start-time-${stop.id}`}>
                                Start Time
                              </label>
                              <TimeSelectField
                                id={`route-stop-start-time-${stop.id}`}
                                value={stop.startTime}
                                onChange={handleRouteStopTimeChange(stop.id, 'startTime')}
                                placeholder="Select time"
                                ariaLabel="Select fuel stop start time"
                              />
                            </div>
                            <div className="route-logs-stop-field">
                              <label className="route-logs-stop-label" htmlFor={`route-stop-end-time-${stop.id}`}>
                                End Time
                              </label>
                              <TimeSelectField
                                id={`route-stop-end-time-${stop.id}`}
                                value={stop.endTime}
                                onChange={handleRouteStopTimeChange(stop.id, 'endTime')}
                                placeholder="Select time"
                                ariaLabel="Select fuel stop end time"
                              />
                            </div>
                            <div className="route-logs-stop-field">
                              <label className="route-logs-stop-label" htmlFor={`route-stop-odometer-${stop.id}`}>
                                Odometer
                              </label>
                              <input
                                id={`route-stop-odometer-${stop.id}`}
                                type="number"
                                inputMode="decimal"
                                value={stop.odometer}
                                onChange={handleRouteStopFieldChange(stop.id, 'odometer')}
                                placeholder="123456"
                              />
                            </div>
                            <div className="route-logs-stop-field">
                              <label className="route-logs-stop-label" htmlFor={`route-stop-cost-${stop.id}`}>
                                Cost
                              </label>
                              <input
                                id={`route-stop-cost-${stop.id}`}
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={stop.fuelCost}
                                onChange={handleRouteStopFieldChange(stop.id, 'fuelCost')}
                                placeholder="0.00"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="route-logs-stop-field route-logs-stop-field--route-start">
                              <span className="route-logs-route-icon" aria-hidden="true" title="Route stop">🚚</span>
                              <label className="route-logs-stop-label" htmlFor={`route-stop-from-${stop.id}`}>
                                From
                              </label>
                              <RouteVendorSelect
                                id={`route-stop-from-${stop.id}`}
                                value={stop.fromVendorId}
                                selectedLabel={stop.from}
                                options={routeVendors}
                                status={routeVendorsStatus}
                                onSelect={(vendorId) => handleRouteStopVendorSelect(stop.id, vendorId)}
                                placeholder={
                                  routeVendorsStatus === 'loading'
                                    ? 'Loading vendors...'
                                    : routeVendorsStatus === 'error'
                                    ? 'Vendors unavailable'
                                    : 'Select vendor'
                                }
                                ariaLabel="Select origin vendor"
                                disabled={routeVendorsStatus === 'loading' || routeVendorsStatus === 'idle'}
                              />
                            </div>
                            <div className="route-logs-stop-field">
                              <label className="route-logs-stop-label" htmlFor={`route-stop-to-${stop.id}`}>
                                To
                              </label>
                              <RouteVendorSelect
                                id={`route-stop-to-${stop.id}`}
                                value={stop.toVendorId}
                                selectedLabel={stop.to}
                                options={routeVendors}
                                status={routeVendorsStatus}
                                onSelect={(vendorId) => handleRouteStopDestinationSelect(stop.id, vendorId)}
                                placeholder={
                                  routeVendorsStatus === 'loading'
                                    ? 'Loading vendors...'
                                    : routeVendorsStatus === 'error'
                                    ? 'Vendors unavailable'
                                    : 'Select vendor'
                                }
                                ariaLabel="Select destination vendor"
                                disabled={routeVendorsStatus === 'loading' || routeVendorsStatus === 'idle'}
                              />
                            </div>
                            <div className="route-logs-stop-field">
                              <label className="route-logs-stop-label" htmlFor={`route-stop-start-miles-${stop.id}`}>
                                Start Miles
                              </label>
                              <input
                                id={`route-stop-start-miles-${stop.id}`}
                                type="number"
                                inputMode="decimal"
                                value={stop.startMiles}
                                onChange={handleRouteStopFieldChange(stop.id, 'startMiles')}
                              />
                            </div>
                            <div className="route-logs-stop-field">
                              <label className="route-logs-stop-label" htmlFor={`route-stop-end-miles-${stop.id}`}>
                                End Miles
                              </label>
                              <input
                                id={`route-stop-end-miles-${stop.id}`}
                                type="number"
                                inputMode="decimal"
                                value={stop.endMiles}
                                onChange={handleRouteStopFieldChange(stop.id, 'endMiles')}
                              />
                            </div>
                            <div className="route-logs-stop-field">
                              <label className="route-logs-stop-label" htmlFor={`route-stop-start-time-${stop.id}`}>
                                Start Time
                              </label>
                              <TimeSelectField
                                id={`route-stop-start-time-${stop.id}`}
                                value={stop.startTime}
                                onChange={handleRouteStopTimeChange(stop.id, 'startTime')}
                                placeholder="Select time"
                                ariaLabel="Select start time"
                              />
                            </div>
                            <div className="route-logs-stop-field">
                              <label className="route-logs-stop-label" htmlFor={`route-stop-end-time-${stop.id}`}>
                                End Time
                              </label>
                              <TimeSelectField
                                id={`route-stop-end-time-${stop.id}`}
                                value={stop.endTime}
                                onChange={handleRouteStopTimeChange(stop.id, 'endTime')}
                                placeholder="Select time"
                                ariaLabel="Select end time"
                              />
                            </div>
                          </>
                        )}
                        <button
                          type="button"
                          className="route-logs-stop-remove"
                          onClick={() => handleRemoveRouteStop(stop.id)}
                          aria-label={isFuelStop ? 'Remove fuel stop' : 'Remove stop'}
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
        <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
      </main>
    </div>
  )
}
