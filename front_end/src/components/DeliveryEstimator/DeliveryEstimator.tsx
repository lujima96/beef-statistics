import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Sidebar from '../Sidebar'
import PdfViewer from '../PdfViewer'
import { useIsDesktop, useResponsiveSidebarOpen } from '../../hooks/useResponsiveSidebarOpen'
import { buildApiUrl, buildGraphhopperUiUrl } from '../../utils/apiBase'
import {
  DeliveryEstimatorPersistedState,
  MaintenanceLogEntry,
  OptimizationCostBreakdown,
  OptimizationDiagnostics,
  OptimizationFormState,
  OptimizationLeg,
  OptimizationLegSequenceEntry,
  OptimizationResult,
  OptimizationStopTiming,
  OptimizationTurnInstruction,
  MultiRouteLegResult,
  MultiRouteRunResult,
  TripLogEntry,
  Truck,
  TruckCostRow,
  RoutePlan,
  Vendor,
  Worker,
  WorkerFormValues,
} from './types'
import {
  AUTO_SAVE_DEBOUNCE_MS,
  DEFAULT_END,
  DEFAULT_START,
  DELIVERY_ESTIMATOR_SCHEMA_VERSION,
  MAX_COST_TRUCKS,
  MAX_WORKERS_PER_TRUCK,
  TIME_OPTIONS,
} from './constants'
import {
  createDefaultMaintenanceLogs,
  createDefaultTripLogs,
  createTruckCostRow,
} from './factories'
import {
  ensureDollarPrefix,
  sanitizeCoordinateInput,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from './sanitizers'
import {
  formatCoordinatePair,
  formatServiceMinutesDisplay,
  formatCurrency,
  formatDurationSeconds,
  formatDistanceMeters,
  formatWageDisplay,
  formatWorkerName,
  normalizeWage,
} from './formatting'
import { parseCoordinate, parseDecimal, parseInteger } from './parsers'
import { getLabel, toMinutes, formatDateInput, ensureValidTime } from './time'
import { isLikelyStreetAddress, isVendorFormComplete, isWorkerFormComplete } from './validation'

const GRAPHHOPPER_ROUTE_PARAM = 'deliveryRouteId'
const SHOW_ROUTE_OPTIMIZATION = false
const PREVIEW_ROUTE_KEY = 'route'

const createPreviewLegKey = (index: number) => `leg:${index}`
const parsePreviewLegKey = (key: string): number | null => {
  if (!key.startsWith('leg:')) return null
  const parsed = Number(key.slice(4))
  return Number.isFinite(parsed) ? parsed : null
}

const VENDOR_ADDRESS_ERROR_MESSAGE = 'Enter a street number and name (e.g., "123 Main St").'
const OPTIMIZATION_TRUCK_SELECTION_ERROR = 'Select at least one truck before optimizing routes.'

const DEFAULT_DEPOT = {
  locationName: 'Manna',
  address: '1600 Gregory St, North Little Rock, AR 72114',
  windowStart: '08:00',
  windowEnd: '17:00',
  stopTime: '30',
  serviceMinutes: 30,
  latitude: 34.765763,
  longitude: -92.250713,
}

const DEPOT_NAME_LOWER = DEFAULT_DEPOT.locationName.toLowerCase()
const DEPOT_ADDRESS_LOWER = DEFAULT_DEPOT.address.toLowerCase()

const isDepotVendorRecord = (vendor: { locationName?: string | null; address?: string | null }) => {
  const name = (vendor.locationName ?? '').trim().toLowerCase()
  const address = (vendor.address ?? '').trim().toLowerCase()
  return name === DEPOT_NAME_LOWER || address === DEPOT_ADDRESS_LOWER
}

const computeVendorAddressError = (value: string): string | null => {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  return isLikelyStreetAddress(normalized) ? null : VENDOR_ADDRESS_ERROR_MESSAGE
}

type VendorEditDraft = {
  locationName: string
  address: string
  windowStart: string
  windowEnd: string
  serviceMinutes: string
  latitude: string
  longitude: string
  stopSequence: string
}

type EfficiencyMetrics = {
  totalCost: number | null
  costPerStop: number | null
  costPerMile: number | null
  totalSeconds: number | null
  distanceMiles: number | null
  travelSeconds: number | null
  serviceSeconds: number | null
  laborCost: number | null
  fuelCost: number | null
  maintenanceCost: number | null
  vehicleCost: number | null
  stopCount: number | null
}

type EfficiencyStopEntry = {
  key: string
  label: string
  indexLabel: string
  kind: 'start' | 'stop' | 'end'
}

type EfficiencyStopSummary = {
  items: EfficiencyStopEntry[]
  hasRoute: boolean
  hasVendors: boolean
}

type OptimizationLegSummary = {
  key: string
  truckLabel: string
  stopLabels: string[]
  stopCount: number
  distanceMeters: number
  travelSeconds: number
  serviceSeconds: number
  totalSeconds: number
  totalCost: number | null
}

type RouteRunResponse = {
  routeId: number
  truckId: number
  totalCost: number
  costPerStop: number | null
  costPerMile: number | null
  totalSeconds: number
  distanceMiles: number
  travelSeconds: number
  serviceSeconds: number
  laborCost: number
  fuelCost: number
  maintenanceCost: number
  vehicleCost: number
}

type CollapsibleSectionKey =
  | 'workers'
  | 'truckCosts'
  | 'assignments'
  | 'vendors'
  | 'routes'
  | 'efficiency'

type CollapsedState = Record<CollapsibleSectionKey, boolean>

const DEFAULT_COLLAPSED_STATE: CollapsedState = {
  workers: false,
  truckCosts: false,
  assignments: false,
  vendors: false,
  routes: false,
  efficiency: false,
}

const STOP_TYPES: ReadonlyArray<OptimizationLegSequenceEntry['stopType']> = ['depot', 'vendor', 'return']

const STOP_TYPE_SET = new Set(STOP_TYPES)

const OPTIMIZATION_STATUSES: ReadonlyArray<OptimizationDiagnostics['status']> = [
  'success',
  'no_solution',
  'timeout',
  'not_solved',
  'error',
]

const OPTIMIZATION_STATUS_SET = new Set(OPTIMIZATION_STATUSES)

const formatOptimizationStatusLabel = (status: OptimizationDiagnostics['status']): string =>
  status
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')

const LOCAL_STORAGE_KEY = 'delivery-estimator:state:v5'
const LOCAL_STORAGE_TIMESTAMP_KEY = `${LOCAL_STORAGE_KEY}:updatedAt`

const hasLocalStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const loadLocalState = (): Partial<DeliveryEstimatorPersistedState> | null => {
  if (!hasLocalStorage()) return null
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<DeliveryEstimatorPersistedState>
  } catch (error) {
    console.warn('Failed to read delivery estimator local backup', error)
    return null
  }
}

const saveLocalState = (state: DeliveryEstimatorPersistedState) => {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state))
    window.localStorage.setItem(LOCAL_STORAGE_TIMESTAMP_KEY, new Date().toISOString())
  } catch (error) {
    console.warn('Failed to persist delivery estimator local backup', error)
  }
}

const clearLocalState = () => {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY)
    window.localStorage.removeItem(LOCAL_STORAGE_TIMESTAMP_KEY)
  } catch (error) {
    console.warn('Failed to clear delivery estimator local backup', error)
  }
}

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

const coerceNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  return coerceNumber(value)
}

const coerceStopType = (value: unknown): OptimizationLegSequenceEntry['stopType'] => {
  if (typeof value === 'string' && STOP_TYPE_SET.has(value as OptimizationLegSequenceEntry['stopType'])) {
    return value as OptimizationLegSequenceEntry['stopType']
  }
  return 'vendor'
}

const normalizeSequenceEntry = (raw: unknown): OptimizationLegSequenceEntry | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const idValue = coerceNullableNumber(record.id)
  const label = typeof record.label === 'string' ? record.label : ''
  const stopType = coerceStopType(record.stopType)
  return {
    id: idValue !== null ? idValue : null,
    label,
    stopType,
  }
}

const normalizeInstruction = (raw: unknown): OptimizationTurnInstruction | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text : ''
  const distanceMeters = coerceNumber(record.distanceMeters) ?? 0
  const timeSeconds = coerceNumber(record.timeSeconds) ?? 0
  const sign = coerceNullableNumber(record.sign)
  return {
    text,
    distanceMeters,
    timeSeconds,
    sign: sign !== null ? sign : null,
  }
}

const normalizeStopTiming = (raw: unknown): OptimizationStopTiming | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const idValue = coerceNullableNumber(record.id)
  const label = typeof record.label === 'string' ? record.label : ''
  const stopType = coerceStopType(record.stopType)
  const sequence = coerceNumber(record.sequence) ?? 0
  const arrivalMinutes = coerceNumber(record.arrivalMinutes) ?? 0
  const departureMinutes = coerceNumber(record.departureMinutes) ?? arrivalMinutes
  const serviceMinutes = coerceNumber(record.serviceMinutes) ?? 0
  return {
    id: idValue !== null ? idValue : null,
    label,
    stopType,
    sequence: Math.max(0, Math.round(sequence)),
    arrivalMinutes,
    departureMinutes,
    serviceMinutes,
  }
}

const normalizeCosts = (raw: unknown): OptimizationCostBreakdown | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const laborHours = coerceNumber(record.laborHours) ?? 0
  const laborCost = coerceNullableNumber(record.laborCost)
  const fuelGallons = coerceNullableNumber(record.fuelGallons)
  const fuelCost = coerceNullableNumber(record.fuelCost)
  const totalCost = coerceNullableNumber(record.totalCost)
  return {
    laborHours,
    laborCost: laborCost !== null ? laborCost : null,
    fuelGallons: fuelGallons !== null ? fuelGallons : null,
    fuelCost: fuelCost !== null ? fuelCost : null,
    totalCost: totalCost !== null ? totalCost : null,
  }
}

const normalizeTruckCostRow = (raw: unknown, fallbackId: number): TruckCostRow => {
  const base = createTruckCostRow(fallbackId)
  if (!raw || typeof raw !== 'object') {
    return { ...base, id: fallbackId }
  }
  const record = raw as Record<string, unknown>
  const idCandidate = coerceNumber(record.id)
  const make = typeof record.make === 'string' ? record.make : base.make
  const year = typeof record.year === 'string' ? record.year : base.year
  const mpgInput = typeof record.mpgInput === 'string' ? record.mpgInput : base.mpgInput
  const capacityInput =
    typeof record.capacityInput === 'string' ? record.capacityInput : base.capacityInput
  const fuelInput =
    typeof record.fuelCostPerMileInput === 'string'
      ? record.fuelCostPerMileInput
      : base.fuelCostPerMileInput
  const maintenanceInput =
    typeof record.maintenanceCostPerMileInput === 'string'
      ? record.maintenanceCostPerMileInput
      : base.maintenanceCostPerMileInput
  const totalInput =
    typeof record.totalCostPerMileInput === 'string'
      ? record.totalCostPerMileInput
      : base.totalCostPerMileInput

  const row: TruckCostRow = {
    ...base,
    id:
      idCandidate !== null && Number.isFinite(idCandidate) && idCandidate > 0
        ? Math.trunc(idCandidate)
        : fallbackId,
    make,
    year,
    mpgInput,
    capacityInput,
    mpg: coerceNullableNumber(record.mpg) ?? parseDecimal(mpgInput),
    capacity: coerceNullableNumber(record.capacity) ?? parseInteger(capacityInput),
    fuelCostPerMileInput: fuelInput,
    fuelCostPerMile:
      coerceNullableNumber(record.fuelCostPerMile) ?? parseDecimal(fuelInput),
    fuelCostMode: record.fuelCostMode === 'manual' ? 'manual' : 'auto',
    maintenanceCostPerMileInput: maintenanceInput,
    maintenanceCostPerMile:
      coerceNullableNumber(record.maintenanceCostPerMile) ??
      parseDecimal(maintenanceInput),
    maintenanceCostMode: record.maintenanceCostMode === 'manual' ? 'manual' : 'auto',
    totalCostPerMileInput: totalInput,
    totalCostPerMile:
      coerceNullableNumber(record.totalCostPerMile) ?? parseDecimal(totalInput),
    totalCostMode: record.totalCostMode === 'manual' ? 'manual' : 'auto',
  }
  return row
}

const withRecomputedTotal = (row: TruckCostRow): TruckCostRow => {
  const fuel =
    typeof row.fuelCostPerMile === 'number' && Number.isFinite(row.fuelCostPerMile)
      ? row.fuelCostPerMile
      : null
  const maintenance =
    typeof row.maintenanceCostPerMile === 'number' &&
    Number.isFinite(row.maintenanceCostPerMile)
      ? row.maintenanceCostPerMile
      : null
  let total: number | null = null
  if (fuel !== null || maintenance !== null) {
    total = (fuel ?? 0) + (maintenance ?? 0)
  }
  const formatted = total !== null ? (Math.round(total * 100) / 100).toFixed(2) : ''
  return {
    ...row,
    totalCostPerMile: total,
    totalCostPerMileInput: formatted,
    totalCostMode: 'auto',
  }
}

const normalizeDiagnostics = (raw: unknown): OptimizationDiagnostics => {
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'error',
      statusDetail: null,
      unassignedStops: [],
      violatedConstraints: [],
    }
  }
  const record = raw as Record<string, unknown>
  const statusCandidate = typeof record.status === 'string' ? record.status : 'error'
  const status = OPTIMIZATION_STATUS_SET.has(statusCandidate as OptimizationDiagnostics['status'])
    ? (statusCandidate as OptimizationDiagnostics['status'])
    : 'error'
  const statusDetail = typeof record.statusDetail === 'string' ? record.statusDetail : null
  const unassignedRaw = Array.isArray(record.unassignedStops) ? record.unassignedStops : []
  const unassignedStops = unassignedRaw
    .map((item) => normalizeSequenceEntry(item))
    .filter((entry): entry is OptimizationLegSequenceEntry => Boolean(entry))
  const violatedConstraints = Array.isArray(record.violatedConstraints)
    ? record.violatedConstraints.filter((item): item is string => typeof item === 'string')
    : []
  return {
    status,
    statusDetail,
    unassignedStops,
    violatedConstraints,
  }
}

const normalizeOptimizationLeg = (raw: unknown): OptimizationLeg | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const truckIdValue = coerceNullableNumber(record.truckId)
  const sequenceRaw = Array.isArray(record.sequence) ? record.sequence : []
  const sequence = sequenceRaw
    .map((item) => normalizeSequenceEntry(item))
    .filter((entry): entry is OptimizationLegSequenceEntry => Boolean(entry))
  const instructionsRaw = Array.isArray(record.instructions) ? record.instructions : []
  const instructions = instructionsRaw
    .map((item) => normalizeInstruction(item))
    .filter((entry): entry is OptimizationTurnInstruction => Boolean(entry))
  const stopsRaw = Array.isArray(record.stops) ? record.stops : []
  const stops = stopsRaw
    .map((item) => normalizeStopTiming(item))
    .filter((entry): entry is OptimizationStopTiming => Boolean(entry))
  const distanceMeters = coerceNumber(record.distanceMeters) ?? 0
  const travelSeconds = coerceNumber(record.travelSeconds) ?? 0
  const serviceSeconds = coerceNumber(record.serviceSeconds) ?? 0
  const totalSeconds = coerceNumber(record.totalSeconds) ?? travelSeconds + serviceSeconds
  const costs = normalizeCosts(record.costs) ?? {
    laborHours: 0,
    laborCost: null,
    fuelGallons: null,
    fuelCost: null,
    totalCost: null,
  }
  return {
    truckId: truckIdValue !== null ? truckIdValue : null,
    sequence,
    distanceMeters,
    travelSeconds,
    serviceSeconds,
    totalSeconds,
    instructions,
    stops,
    costs,
  }
}

const normalizeOptimizationResult = (raw: unknown): OptimizationResult | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const legsRaw = Array.isArray(record.legs) ? record.legs : []
  const legs = legsRaw
    .map((item) => normalizeOptimizationLeg(item))
    .filter((entry): entry is OptimizationLeg => Boolean(entry))
  if (legs.length === 0) {
    return null
  }
  const fleetSize = coerceNumber(record.fleetSize) ?? legs.length
  const totalDistanceMeters = coerceNumber(record.totalDistanceMeters) ?? 0
  const totalTravelSeconds = coerceNumber(record.totalTravelSeconds) ?? 0
  const totalServiceSeconds = coerceNumber(record.totalServiceSeconds) ?? 0
  const totalCostValue = coerceNullableNumber(record.totalCost)
  const diagnostics = normalizeDiagnostics(record.diagnostics)
  return {
    fleetSize: Math.max(1, Math.round(fleetSize)),
    legs,
    totalDistanceMeters,
    totalTravelSeconds,
    totalServiceSeconds,
    totalCost: totalCostValue !== null ? totalCostValue : null,
    diagnostics,
  }
}
export default function DeliveryEstimator() {
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebarOpen()
  const [pdfOpen, setPdfOpen] = useState(false)
  const isDesktop = useIsDesktop()

  const [workerFirstName, setWorkerFirstName] = useState('')
  const [workerLastName, setWorkerLastName] = useState('')
  const [workerWage, setWorkerWage] = useState('')
  const [startTime, setStartTime] = useState<string>(() => DEFAULT_START)
  const [endTime, setEndTime] = useState<string>(() => DEFAULT_END)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null)
  const [startMenuOpen, setStartMenuOpen] = useState(false)
  const [endMenuOpen, setEndMenuOpen] = useState(false)
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [vendorLocation, setVendorLocation] = useState('')
  const [vendorAddress, setVendorAddress] = useState('')
  const [vendorWindowStart, setVendorWindowStart] = useState<string>(() => DEFAULT_START)
  const [vendorWindowEnd, setVendorWindowEnd] = useState<string>(() => DEFAULT_END)
  const [vendorServiceMinutes, setVendorServiceMinutes] = useState('')
  const [vendorLatitude, setVendorLatitude] = useState('')
  const [vendorLongitude, setVendorLongitude] = useState('')
  const [vendorStopSequence, setVendorStopSequence] = useState('')
  const [editingVendorId, setEditingVendorId] = useState<number | null>(null)
  const [editingVendorValues, setEditingVendorValues] = useState<VendorEditDraft | null>(null)
  const [editingVendorAddressError, setEditingVendorAddressError] = useState<string | null>(null)
  const [depotLatitude, setDepotLatitude] = useState('')
  const [depotLongitude, setDepotLongitude] = useState('')
  const [truckCountInput, setTruckCountInput] = useState('')
  const [vendorStartMenuOpen, setVendorStartMenuOpen] = useState(false)
  const [vendorEndMenuOpen, setVendorEndMenuOpen] = useState(false)
  const [vendorAddressError, setVendorAddressError] = useState<string | null>(null)
  const [truckCostRows, setTruckCostRows] = useState<TruckCostRow[]>(() => [
    withRecomputedTotal(createTruckCostRow(1)),
  ])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [tripLogsByTruck, setTripLogsByTruck] = useState<Record<number, TripLogEntry[]>>(() => ({}))
  const [maintenanceLogsByTruck, setMaintenanceLogsByTruck] = useState<Record<number, MaintenanceLogEntry[]>>(() => ({}))
  const [routes, setRoutes] = useState<RoutePlan[]>([])
  const [depotVendorId, setDepotVendorId] = useState<number | null>(null)
  const [selectedEfficiencyRouteId, setSelectedEfficiencyRouteId] = useState<number | null>(null)
  const [efficiencyRouteMenuOpen, setEfficiencyRouteMenuOpen] = useState(false)
  const [efficiencyTruckMenuOpen, setEfficiencyTruckMenuOpen] = useState(false)
  const [activeRouteDropdownId, setActiveRouteDropdownId] = useState<number | null>(null)
  const [efficiencyTruckIds, setEfficiencyTruckIds] = useState<number[]>([])
  const [optimizationTruckIds, setOptimizationTruckIds] = useState<number[]>([])
  const [efficiencyMetrics, setEfficiencyMetrics] = useState<EfficiencyMetrics>({
    totalCost: null,
    costPerStop: null,
    costPerMile: null,
    totalSeconds: null,
    distanceMiles: null,
    travelSeconds: null,
    serviceSeconds: null,
    laborCost: null,
    fuelCost: null,
    maintenanceCost: null,
    vehicleCost: null,
    stopCount: null,
  })
  const [efficiencyLoading, setEfficiencyLoading] = useState(false)
  const [efficiencyError, setEfficiencyError] = useState<string | null>(null)
  const [routeOptimizeLoadingId, setRouteOptimizeLoadingId] = useState<number | null>(null)
  const [routeOptimizeErrors, setRouteOptimizeErrors] = useState<Record<number, string>>({})
  const [metricValueMaxHeight, setMetricValueMaxHeight] = useState<number | null>(null)
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null)
  const [optimizationAssignmentsKey, setOptimizationAssignmentsKey] = useState<string | null>(
    null,
  )
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [multiRunResult, setMultiRunResult] = useState<MultiRouteRunResult | null>(null)
  const [selectedPreviewLegKey, setSelectedPreviewLegKey] = useState<string>(PREVIEW_ROUTE_KEY)
  const graphhopperBaseUrl = useMemo(() => buildGraphhopperUiUrl(''), [])
  const [graphhopperUiUrl, setGraphhopperUiUrl] = useState(graphhopperBaseUrl)
  const [collapsedSections, setCollapsedSections] = useState<CollapsedState>(() => ({
    ...DEFAULT_COLLAPSED_STATE,
  }))

  const vendorById = useMemo(() => {
    const map = new Map<number, Vendor>()
    vendors.forEach((vendor) => {
      map.set(vendor.id, vendor)
    })
    return map
  }, [vendors])

  const vendorNameById = useMemo(() => {
    const map = new Map<number, string>()
    vendors.forEach((vendor) => {
      const trimmedName = (vendor.locationName ?? '').trim()
      const trimmedAddress = (vendor.address ?? '').trim()
      const fallback = trimmedAddress || `Vendor ${vendor.id}`
      map.set(vendor.id, trimmedName || fallback)
    })
    return map
  }, [vendors])

  const toggleSection = useCallback((section: CollapsibleSectionKey) => {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }, [])

  const resolveDepotCoordinates = useCallback(() => {
    const parsedLatitude = parseCoordinate(depotLatitude, -90, 90)
    const parsedLongitude = parseCoordinate(depotLongitude, -180, 180)
    const depotVendor =
      depotVendorId !== null ? vendorById.get(depotVendorId) ?? null : null
    const vendorLatitude =
      typeof depotVendor?.latitude === 'number' && Number.isFinite(depotVendor.latitude)
        ? depotVendor.latitude
        : null
    const vendorLongitude =
      typeof depotVendor?.longitude === 'number' && Number.isFinite(depotVendor.longitude)
        ? depotVendor.longitude
        : null

    const latitude = parsedLatitude ?? vendorLatitude ?? DEFAULT_DEPOT.latitude
    const longitude = parsedLongitude ?? vendorLongitude ?? DEFAULT_DEPOT.longitude

    const usedDefaultFallback =
      (parsedLatitude === null && vendorLatitude === null) ||
      (parsedLongitude === null && vendorLongitude === null)

    return {
      latitude,
      longitude,
      usedDefaultFallback,
    }
  }, [depotLatitude, depotLongitude, depotVendorId, vendorById])

  const renderSectionToggle = (section: CollapsibleSectionKey, label: string) => {
    const collapsed = collapsedSections[section]
    const buttonLabel = collapsed ? `Expand ${label}` : `Collapse ${label}`
    return (
      <button
        type="button"
        className="delivery-section-toggle"
        onClick={() => toggleSection(section)}
        aria-expanded={!collapsed}
      >
        {buttonLabel}
      </button>
    )
  }

  const workersCollapsed = collapsedSections.workers
  const truckCostsCollapsed = collapsedSections.truckCosts
  const assignmentsCollapsed = collapsedSections.assignments
  const vendorsCollapsed = collapsedSections.vendors
  const routesCollapsed = collapsedSections.routes
  const efficiencyCollapsed = collapsedSections.efficiency

  const buildGraphhopperPreviewUrl = useCallback(
    (route: RoutePlan | null, leg: MultiRouteLegResult | null = null) => {
      if (!route) {
        return graphhopperBaseUrl
      }

      const params = new URLSearchParams()
      params.set(GRAPHHOPPER_ROUTE_PARAM, String(route.id))

      const sanitizePointLabel = (value: string | undefined | null) => {
        const cleaned = (value ?? '').trim()
        if (!cleaned) return ''
        return cleaned.replace(/_/g, ' ')
      }

      const appendPoint = (lat: unknown, lon: unknown, label?: string) => {
        if (typeof lat === 'number' && Number.isFinite(lat) && typeof lon === 'number' && Number.isFinite(lon)) {
          const coordinatePart = `${lat},${lon}`
          const labelPart = sanitizePointLabel(label)
          params.append('point', labelPart ? `${coordinatePart}_${labelPart}` : coordinatePart)
        }
      }

      const depotVendor =
        depotVendorId !== null ? vendorById.get(depotVendorId) ?? null : null
      const depotLabel =
        (depotVendorId !== null && vendorNameById.get(depotVendorId)) ||
        sanitizePointLabel(depotVendor?.locationName) ||
        sanitizePointLabel(depotVendor?.address) ||
        DEFAULT_DEPOT.locationName
      const depotLatitude =
        typeof depotVendor?.latitude === 'number' && Number.isFinite(depotVendor.latitude)
          ? depotVendor.latitude
          : DEFAULT_DEPOT.latitude
      const depotLongitude =
        typeof depotVendor?.longitude === 'number' && Number.isFinite(depotVendor.longitude)
          ? depotVendor.longitude
          : DEFAULT_DEPOT.longitude

      const addDepotStart = () => {
        appendPoint(depotLatitude, depotLongitude, depotLabel)
      }

      const addDepotReturn = () => {
        appendPoint(depotLatitude, depotLongitude, `${depotLabel} (Return)`)
      }

      const appendVendorStop = (vendorId: number, fallbackIndex?: number) => {
        const vendor = vendorById.get(vendorId)
        if (!vendor) return
        const label =
          vendorNameById.get(vendorId) ||
          sanitizePointLabel(vendor.locationName) ||
          sanitizePointLabel(vendor.address) ||
          (typeof fallbackIndex === 'number' ? `Stop ${fallbackIndex + 1}` : `Vendor ${vendorId}`)
        appendPoint(vendor.latitude, vendor.longitude, label)
      }

      const sequenceEntries = leg?.route?.sequence ?? []
      if (Array.isArray(sequenceEntries) && sequenceEntries.length > 0) {
        sequenceEntries.forEach((entry, index) => {
          switch (entry.stopType) {
            case 'depot':
              addDepotStart()
              break
            case 'return':
              addDepotReturn()
              break
            case 'vendor':
              if (typeof entry.id === 'number') {
                appendVendorStop(entry.id, index)
              }
              break
            default:
              break
          }
        })
      } else if (leg && Array.isArray(leg.stopIds) && leg.stopIds.length > 0) {
        addDepotStart()
        leg.stopIds.forEach((vendorId, index) => appendVendorStop(vendorId, index))
        addDepotReturn()
      } else if (route.stopIds.length > 0) {
        addDepotStart()
        route.stopIds.forEach((vendorId, index) => appendVendorStop(vendorId, index))
        addDepotReturn()
      } else {
        addDepotStart()
        addDepotReturn()
      }

      const query = params.toString()
      return query ? buildGraphhopperUiUrl(`?${query}`) : graphhopperBaseUrl
    },
    [depotVendorId, graphhopperBaseUrl, vendorById, vendorNameById],
  )

  const startRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const vendorStartRef = useRef<HTMLDivElement | null>(null)
  const vendorEndRef = useRef<HTMLDivElement | null>(null)
  const workerIdRef = useRef(0)
  const vendorIdRef = useRef(0)
  const truckCostIdRef = useRef(1)
  const routeIdRef = useRef(0)
  const truckCostRowsRef = useRef<TruckCostRow[]>([])
  const routeDropdownRefs = useRef(new Map<number, HTMLDivElement>())
  const efficiencyRouteMenuRef = useRef<HTMLDivElement | null>(null)
  const efficiencyTruckMenuRef = useRef<HTMLDivElement | null>(null)
  const totalCostMetricRef = useRef<HTMLDivElement | null>(null)
  const [stateLoaded, setStateLoaded] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<number | null>(null)
  const didHydrateRef = useRef(false)
  const restoredFromLocalRef = useRef(false)
  const pendingPersistRef = useRef<DeliveryEstimatorPersistedState | null>(null)
  const retryTimeoutRef = useRef<number | null>(null)

  const startLabel = useMemo(() => getLabel(startTime), [startTime])
  const endLabel = useMemo(() => getLabel(endTime), [endTime])
  const workerFormValues = useMemo<WorkerFormValues>(
    () => ({
      firstName: workerFirstName,
      lastName: workerLastName,
      wage: workerWage,
      start: startTime,
      end: endTime,
    }),
    [workerFirstName, workerLastName, workerWage, startTime, endTime],
  )
  const vendorFormValues = useMemo(
    () => ({
      locationName: vendorLocation,
      address: vendorAddress,
      windowStart: vendorWindowStart,
      windowEnd: vendorWindowEnd,
      serviceMinutes: vendorServiceMinutes,
      latitude: vendorLatitude,
      longitude: vendorLongitude,
      stopSequence: vendorStopSequence,
    }),
    [
      vendorLocation,
      vendorAddress,
      vendorWindowStart,
      vendorWindowEnd,
      vendorServiceMinutes,
      vendorLatitude,
      vendorLongitude,
      vendorStopSequence,
    ],
  )
  const canSubmitWorker = isWorkerFormComplete(workerFormValues)
  const isVendorAddressValid = vendorAddress.trim().length > 0 && vendorAddressError === null
  const canAddVendor = isVendorFormComplete(vendorFormValues) && isVendorAddressValid
  const canSaveVendorEdit = useMemo(() => {
    if (!editingVendorValues) return false
    const addressValid = editingVendorValues.address.trim().length > 0 && editingVendorAddressError === null
    if (!addressValid) return false
    return isVendorFormComplete({
      locationName: editingVendorValues.locationName,
      address: editingVendorValues.address,
      windowStart: editingVendorValues.windowStart,
      windowEnd: editingVendorValues.windowEnd,
      serviceMinutes: editingVendorValues.serviceMinutes,
    })
  }, [editingVendorValues, editingVendorAddressError])
  const parsedTruckCountDesired = useMemo(() => parseInteger(truckCountInput), [truckCountInput])
  const availableAssignmentSlots = useMemo(() => {
    const usedIds = new Set(trucks.map((truck) => truck.id))
    return truckCostRows.filter((row) => !usedIds.has(row.id))
  }, [truckCostRows, trucks])
  const canAddTruck =
    (parsedTruckCountDesired ?? truckCostRows.length) > trucks.length &&
    availableAssignmentSlots.length > 0
  const getTruckDisplayName = useCallback(
    (truckId: number, fallbackIndex: number) => {
      const row = truckCostRows.find((item) => item.id === truckId)
      if (row) {
        const year = (row.year ?? '').trim()
        const make = (row.make ?? '').trim()
        const parts: string[] = []
        if (year) parts.push(year)
        if (make) parts.push(make)
        const label = parts.join(' ').trim()
        if (label) {
          return label
        }
      }
      return `Truck ${fallbackIndex}`
    },
    [truckCostRows],
  )
  useEffect(() => {
    truckCostRowsRef.current = truckCostRows
  }, [truckCostRows])
  const canAddCostTruck = truckCostRows.length < MAX_COST_TRUCKS
  const vendorStartLabel = useMemo(() => getLabel(vendorWindowStart), [vendorWindowStart])
  const vendorEndLabel = useMemo(() => getLabel(vendorWindowEnd), [vendorWindowEnd])
  const trucksWithAssignments = useMemo(
    () =>
      trucks.map((truck, index) => {
        const assignedWorkers = truck.workerIds
          .map((workerId) => workers.find((worker) => worker.id === workerId))
          .filter((worker): worker is Worker => Boolean(worker))
        const displayName = getTruckDisplayName(truck.id, index + 1)
        return { truck, index, assignedWorkers, displayName }
      }),
    [trucks, workers, getTruckDisplayName],
  )
  const workerAssignments = useMemo(() => {
    const map = new Map<number, number>()
    trucks.forEach((truck) => {
      truck.workerIds.forEach((workerId) => {
        map.set(workerId, truck.id)
      })
    })
    return map
  }, [trucks])

  const vendorsSortedByLocation = useMemo(() => {
    const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? ''
    return [...vendors].sort((a, b) => {
      const nameA = normalize(a.locationName) || normalize(a.address)
      const nameB = normalize(b.locationName) || normalize(b.address)
      if (nameA && nameB) {
        if (nameA < nameB) return -1
        if (nameA > nameB) return 1
      } else if (nameA) {
        return -1
      } else if (nameB) {
        return 1
      }
      return a.id - b.id
    })
  }, [vendors])

  const routeSelectableVendors = useMemo(() => {
    if (depotVendorId === null) return vendorsSortedByLocation
    return vendorsSortedByLocation.filter((vendor) => vendor.id !== depotVendorId)
  }, [vendorsSortedByLocation, depotVendorId])

  const routeOptions = useMemo(
    () =>
      routes.map((route, index) => ({
        id: route.id,
        label: route.name.trim() || `Route ${index + 1}`,
      })),
    [routes],
  )

  const truckOptions = useMemo(
    () =>
      truckCostRows.map((row, index) => ({
        id: row.id,
        label: row.make.trim() || row.year.trim() || `Truck ${index + 1}`,
      })),
    [truckCostRows],
  )

  const truckLabelById = useMemo(() => {
    const map = new Map<number, string>()
    truckOptions.forEach((option, index) => {
      const trimmed = option.label.trim()
      map.set(option.id, trimmed || `Truck ${index + 1}`)
    })
    return map
  }, [truckOptions])

  const optimizationLegSummaries = useMemo<OptimizationLegSummary[]>(() => {
    if (!optimizationResult) return []
    return optimizationResult.legs.map((leg, index) => {
      const vendorStops = leg.stops.filter((stop) => stop.stopType === 'vendor')
      const truckLabel =
        leg.truckId != null
          ? truckLabelById.get(leg.truckId) ?? `Truck ${leg.truckId}`
          : `Truck ${index + 1}`
      return {
        key: `${leg.truckId ?? index}-${index}`,
        truckLabel,
        stopLabels: vendorStops.map((stop) => stop.label),
        stopCount: vendorStops.length,
        distanceMeters: leg.distanceMeters,
        travelSeconds: leg.travelSeconds,
        serviceSeconds: leg.serviceSeconds,
        totalSeconds: leg.totalSeconds,
        totalCost: leg.costs.totalCost,
      }
    })
  }, [optimizationResult, truckLabelById])

  useEffect(() => {
    let nextSelection: number[] = []
    setOptimizationTruckIds((current) => {
      if (truckOptions.length === 0) {
        nextSelection = []
        return []
      }
      const valid = current.filter((id) => truckOptions.some((option) => option.id === id))
      if (valid.length > 0 && valid.length === current.length && valid.every((id, index) => id === current[index])) {
        nextSelection = current
        return current
      }
      if (valid.length > 0) {
        nextSelection = valid
        return valid
      }
      const fallback = truckOptions.map((option) => option.id)
      nextSelection = fallback
      return fallback
    })
    if (nextSelection.length > 0) {
      setOptimizeError((message) =>
        message === OPTIMIZATION_TRUCK_SELECTION_ERROR ? null : message,
      )
    }
  }, [truckOptions])

  useEffect(() => {
    const match = vendors.find((vendor) => isDepotVendorRecord(vendor))
    if (match && match.id !== depotVendorId) {
      setDepotVendorId(match.id)
    }
  }, [vendors, depotVendorId])

  useEffect(() => {
    if (routeOptions.length === 0) {
      setSelectedEfficiencyRouteId(null)
      setEfficiencyRouteMenuOpen(false)
      return
    }
    if (!selectedEfficiencyRouteId || !routeOptions.some((option) => option.id === selectedEfficiencyRouteId)) {
      setSelectedEfficiencyRouteId(routeOptions[0].id)
    }
  }, [routeOptions, selectedEfficiencyRouteId])

  useEffect(() => {
    if (truckOptions.length === 0) {
      setEfficiencyTruckIds([])
      return
    }
    if (efficiencyTruckIds.length === 0) {
      setEfficiencyTruckIds(truckOptions.map((option) => option.id))
    } else {
      const validIds = efficiencyTruckIds.filter((id) => truckOptions.some((option) => option.id === id))
      if (validIds.length !== efficiencyTruckIds.length) {
        setEfficiencyTruckIds(validIds.length > 0 ? validIds : truckOptions.map((option) => option.id))
      }
    }
  }, [truckOptions, efficiencyTruckIds])

  useEffect(() => {
    if (!efficiencyRouteMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (efficiencyRouteMenuRef.current && !efficiencyRouteMenuRef.current.contains(event.target as Node)) {
        setEfficiencyRouteMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEfficiencyRouteMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [efficiencyRouteMenuOpen])

  useEffect(() => {
    if (!efficiencyTruckMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (efficiencyTruckMenuRef.current && !efficiencyTruckMenuRef.current.contains(event.target as Node)) {
        setEfficiencyTruckMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEfficiencyTruckMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [efficiencyTruckMenuOpen])

  const selectedEfficiencyRouteLabel = useMemo(() => {
    if (!routeOptions.length) return 'Select Route'
    const active = routeOptions.find((option) => option.id === selectedEfficiencyRouteId)
    return active ? active.label : 'Select Route'
  }, [routeOptions, selectedEfficiencyRouteId])

  const selectedEfficiencyTruckLabel = useMemo(() => {
    if (!truckOptions.length) return 'Select Trucks'
    if (efficiencyTruckIds.length === 0) return 'Select Trucks'
    if (efficiencyTruckIds.length === truckOptions.length) return 'All Trucks'
    return `${efficiencyTruckIds.length} Selected`
  }, [truckOptions, efficiencyTruckIds])

  const efficiencyStopSummary = useMemo<EfficiencyStopSummary>(() => {
    if (!selectedEfficiencyRouteId) {
      return { items: [], hasRoute: false, hasVendors: false }
    }
    const route = routes.find((item) => item.id === selectedEfficiencyRouteId)
    if (!route) {
      return { items: [], hasRoute: false, hasVendors: false }
    }
    const items: EfficiencyStopEntry[] = []
    const depotId = depotVendorId
    let depotLabel: string | null = null
    if (depotId !== null) {
      depotLabel = vendorNameById.get(depotId) ?? DEFAULT_DEPOT.locationName
      items.push({
        key: 'start',
        label: depotLabel,
        indexLabel: 'Start',
        kind: 'start',
      })
    }
    route.stopIds.forEach((vendorId, index) => {
      items.push({
        key: `${vendorId}-${index}`,
        label: vendorNameById.get(vendorId) ?? `Vendor ${vendorId}`,
        indexLabel: `${index + 1}`,
        kind: 'stop',
      })
    })
    if (depotLabel) {
      items.push({
        key: 'end',
        label: depotLabel,
        indexLabel: 'End',
        kind: 'end',
      })
    }
    return { items, hasRoute: true, hasVendors: route.stopIds.length > 0 }
  }, [selectedEfficiencyRouteId, routes, depotVendorId, vendorNameById])

  type PreviewOption = { value: string; label: string; ariaLabel: string }
  const previewOptions = useMemo<PreviewOption[]>(() => {
    const options: PreviewOption[] = [
      { value: PREVIEW_ROUTE_KEY, label: 'All', ariaLabel: 'Show all trucks on the map' },
    ]
    if (!multiRunResult || multiRunResult.legs.length === 0) {
      return options
    }
    multiRunResult.legs.forEach((leg, index) => {
      const truckId = leg.summary?.truckId ?? leg.route?.truckId ?? null
      const truckLabel =
        (typeof truckId === 'number' && truckLabelById.get(truckId)) ||
        (typeof truckId === 'number' ? `Truck ${truckId}` : `Truck ${index + 1}`)
      options.push({
        value: createPreviewLegKey(index),
        label: String(index + 1),
        ariaLabel: `Show ${truckLabel} route on the map`,
      })
    })
    return options
  }, [multiRunResult, truckLabelById])

  const showPreviewButtons = previewOptions.length > 1

  const handlePreviewSelect = useCallback(
    (value: string) => {
      setSelectedPreviewLegKey(current => (current === value ? current : value))
    },
    [],
  )

  const renderPreviewButtons = () => {
    if (!showPreviewButtons) return null
    return (
      <div
        className="delivery-efficiency-preview-buttons"
        role="group"
        aria-label="Select which truck route to preview on the map"
      >
        {previewOptions.map(option => {
          const isActive = selectedPreviewLegKey === option.value
          return (
            <button
              key={option.value}
              type="button"
              className={`delivery-efficiency-preview-btn${isActive ? ' is-active' : ''}`}
              onClick={() => handlePreviewSelect(option.value)}
              aria-pressed={isActive}
              aria-label={option.ariaLabel}
              title={option.ariaLabel}
              disabled={efficiencyLoading}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  const selectedPreviewLeg = useMemo<MultiRouteLegResult | null>(() => {
    if (!multiRunResult) return null
    const index = parsePreviewLegKey(selectedPreviewLegKey)
    if (index === null || index < 0 || index >= multiRunResult.legs.length) return null
    return multiRunResult.legs[index]
  }, [multiRunResult, selectedPreviewLegKey])

  const efficiencyStopMessage = efficiencyStopSummary.hasRoute
    ? efficiencyStopSummary.hasVendors
      ? null
      : 'Add stops to this route to see them listed here.'
    : routes.length === 0
    ? 'Add a route to begin planning stops.'
    : 'Select a route to see its stops.'

  type CostSegment = {
    key: 'labor' | 'fuel' | 'maintenance'
    label: string
    value: number
    color: string
    fraction: number
    start: number
    percentage: number
    formattedValue: string
  }

  type TimeSegment = {
    key: string
    label: string
    seconds: number
  }

  const buildCostSegments = (
    laborValue: number,
    fuelValue: number,
    maintenanceCandidate: number | null | undefined,
    vehicleTotal: number | null | undefined,
  ): CostSegment[] | null => {
    const labor = Number.isFinite(laborValue) ? Math.max(laborValue, 0) : 0
    const fuel = Number.isFinite(fuelValue) ? Math.max(fuelValue, 0) : 0
    const vehicle =
      vehicleTotal != null && Number.isFinite(vehicleTotal) ? Math.max(vehicleTotal, 0) : null
    let maintenance =
      maintenanceCandidate != null && Number.isFinite(maintenanceCandidate)
        ? Math.max(maintenanceCandidate, 0)
        : 0
    if (maintenance <= 0 && vehicle !== null) {
      maintenance = Math.max(vehicle - fuel, 0)
    }
    const segments = [
      { key: 'labor' as const, label: 'Labor', value: labor, color: '#fb923c' },
      { key: 'fuel' as const, label: 'Fuel', value: fuel, color: '#2563eb' },
      { key: 'maintenance' as const, label: 'Maintenance', value: maintenance, color: '#7c3aed' },
    ].filter(segment => segment.value > 0)
    const sum = segments.reduce((total, segment) => total + segment.value, 0)
    if (sum <= 0) {
      return null
    }
    let acc = 0
    return segments.map(segment => {
      const fraction = segment.value / sum
      const start = acc
      acc += fraction
      return {
        ...segment,
        fraction,
        start,
        percentage: Math.round(fraction * 100),
        formattedValue: formatCurrency(segment.value),
      }
    })
  }

  const renderCostBreakdown = (
    breakdown: CostSegment[] | null,
    displayValue: string,
    ariaLabel: string = 'Cost distribution',
  ) => {
    if (!breakdown) {
      return <span className="delivery-efficiency-metric-figure">{displayValue}</span>
    }
    const radius = 30
    const circumference = 2 * Math.PI * radius
    return (
      <>
        <ul className="delivery-efficiency-metric-legend">
          {breakdown.map(segment => (
            <li key={`${segment.key}-legend`} className={`delivery-efficiency-metric-legend-item ${segment.key}`}>
              <span className="swatch" />
              <span className="legend-text">{segment.label}</span>
              <span className="legend-value">{segment.formattedValue}</span>
              <span className="legend-percent">({segment.percentage}%)</span>
            </li>
          ))}
        </ul>
        <div className="delivery-efficiency-chart-wrapper" role="img" aria-label={ariaLabel}>
          <svg className="delivery-efficiency-metric-chart" viewBox="0 0 100 100">
            {breakdown.map(segment => {
              const dashArray = `${segment.fraction * circumference} ${circumference}`
              const dashOffset = -(segment.start * circumference)
              return (
                <circle
                  key={segment.key}
                  cx="50"
                  cy="50"
                  r={radius}
                  strokeWidth="16"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  stroke={segment.color}
                  strokeLinecap="butt"
                  fill="none"
                  transform="rotate(-90 50 50)"
                  className="delivery-efficiency-metric-chart-segment"
                >
                  <title>{`${segment.label}: ${segment.formattedValue} (${segment.percentage}%)`}</title>
                </circle>
              )
            })}
          </svg>
        </div>
        <span className="delivery-efficiency-metric-figure">{displayValue}</span>
      </>
    )
  }

  const isFiniteNumber = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value)

  const createTimeRows = (
    totalSeconds: number | null | undefined,
    travelSeconds: number | null | undefined,
    serviceSeconds: number | null | undefined,
  ): TimeSegment[] => {
    const travel = Math.max(travelSeconds ?? 0, 0)
    const service = Math.max(serviceSeconds ?? 0, 0)
    const inferredTotal = travel + service
    const totalCandidate = isFiniteNumber(totalSeconds) ? totalSeconds : inferredTotal
    const total = Math.max(totalCandidate, 0)
    const other = Math.max(total - travel - service, 0)
    const segments: TimeSegment[] = [
      { key: 'travel', label: 'Drive Time', seconds: travel },
      { key: 'service', label: 'Service Time', seconds: service },
    ]
    if (other > 0) {
      segments.push({ key: 'other', label: 'Other', seconds: other })
    }
    segments.push({ key: 'total', label: 'Total', seconds: total })
    return segments
  }

  const renderTimeBreakdownCard = (
    rows: TimeSegment[] | null,
    displayValue: string,
    ariaLabel: string,
  ) => {
    if (!rows || rows.length === 0) {
      return (
        <div className="delivery-efficiency-time-card" role="group" aria-label={ariaLabel}>
          <div className="delivery-efficiency-time-overview">
            <span className="delivery-efficiency-metric-figure">{displayValue}</span>
            <span className="delivery-efficiency-time-caption">Total Duration</span>
          </div>
        </div>
      )
    }
    const totalRow = rows.find(row => row.key === 'total')
    const totalDisplay = totalRow ? formatDurationSeconds(totalRow.seconds) : displayValue
    const detailRows = rows.filter(row => row.key !== 'total')
    return (
      <div className="delivery-efficiency-time-card" role="group" aria-label={ariaLabel}>
        <div className="delivery-efficiency-time-overview">
          <span className="delivery-efficiency-metric-figure">{totalDisplay}</span>
          <span className="delivery-efficiency-time-caption">Total Duration</span>
        </div>
        {detailRows.length > 0 ? (
          <div className="delivery-efficiency-time-table" role="table">
            {detailRows.map(row => (
              <div key={row.key} className="delivery-efficiency-time-row" role="row">
                <span role="cell" className="delivery-efficiency-time-label">
                  {row.label}
                </span>
                <span role="cell" className="delivery-efficiency-time-value">
                  {formatDurationSeconds(row.seconds)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const totalCostDisplay = efficiencyLoading ? 'Calculating…' : formatCurrency(efficiencyMetrics.totalCost)
  const costPerStopDisplay = efficiencyLoading ? 'Calculating…' : formatCurrency(efficiencyMetrics.costPerStop)
  const costPerMileDisplay = efficiencyLoading ? 'Calculating…' : formatCurrency(efficiencyMetrics.costPerMile)
  const estimatedTimeDisplay = efficiencyLoading ? 'Calculating…' : formatDurationSeconds(efficiencyMetrics.totalSeconds)
  const costBreakdown = (() => {
    if (efficiencyLoading) {
      return null
    }
    return buildCostSegments(
      efficiencyMetrics.laborCost ?? 0,
      efficiencyMetrics.fuelCost ?? 0,
      efficiencyMetrics.maintenanceCost,
      efficiencyMetrics.vehicleCost,
    )
  })()
  const perMileBreakdown = (() => {
    if (efficiencyLoading) {
      return null
    }
    const distance = efficiencyMetrics.distanceMiles
    if (!distance || distance <= 0) {
      return null
    }
    const maintenanceCandidate =
      efficiencyMetrics.maintenanceCost != null ? efficiencyMetrics.maintenanceCost / distance : null
    const vehiclePerMile =
      efficiencyMetrics.vehicleCost != null ? efficiencyMetrics.vehicleCost / distance : null
    return buildCostSegments(
      (efficiencyMetrics.laborCost ?? 0) / distance,
      (efficiencyMetrics.fuelCost ?? 0) / distance,
      maintenanceCandidate,
      vehiclePerMile,
    )
  })()
  const legCostBreakdowns = useMemo(() => {
    if (
      efficiencyLoading ||
      !multiRunResult ||
      multiRunResult.legs.length <= 1
    ) {
      return []
    }
    return multiRunResult.legs
      .map((leg, index) => {
        const summary = leg.summary
        if (!summary) return null
        const breakdown = buildCostSegments(
          summary.laborCost ?? 0,
          summary.fuelCost ?? 0,
          summary.maintenanceCost ?? 0,
          summary.vehicleCost ?? 0,
        )
        if (!breakdown) return null
        const truckId = summary.truckId ?? leg.route?.truckId ?? null
        const label =
          (typeof truckId === 'number' && truckLabelById.get(truckId)) ||
          (typeof truckId === 'number' ? `Truck ${truckId}` : `Truck ${index + 1}`)
        const value = formatCurrency(summary.totalCost ?? 0)
        return {
          key: createPreviewLegKey(index),
          label,
          breakdown,
          value,
        }
      })
      .filter((entry): entry is { key: string; label: string; breakdown: CostSegment[]; value: string } => entry !== null)
  }, [efficiencyLoading, multiRunResult, truckLabelById])
  const costPerStopBreakdown = useMemo(() => {
    if (efficiencyLoading) {
      return null
    }
    const stops = efficiencyMetrics.stopCount
    if (!stops || !Number.isFinite(stops) || stops <= 0) {
      return null
    }
    const denominator = stops
    return buildCostSegments(
      (efficiencyMetrics.laborCost ?? 0) / denominator,
      (efficiencyMetrics.fuelCost ?? 0) / denominator,
      efficiencyMetrics.maintenanceCost != null ? efficiencyMetrics.maintenanceCost / denominator : null,
      efficiencyMetrics.vehicleCost != null ? efficiencyMetrics.vehicleCost / denominator : null,
    )
  }, [
    efficiencyLoading,
    efficiencyMetrics.laborCost,
    efficiencyMetrics.fuelCost,
    efficiencyMetrics.maintenanceCost,
    efficiencyMetrics.vehicleCost,
    efficiencyMetrics.stopCount,
  ])
  const legCostPerStopBreakdowns = useMemo(() => {
    if (
      efficiencyLoading ||
      !multiRunResult ||
      multiRunResult.legs.length <= 1
    ) {
      return []
    }
    return multiRunResult.legs
      .map((leg, index) => {
        const summary = leg.summary
        if (!summary) return null
        const stops = summary.stopCount ?? leg.stopIds.length
        if (!stops || !Number.isFinite(stops) || stops <= 0) return null
        const breakdown = buildCostSegments(
          (summary.laborCost ?? 0) / stops,
          (summary.fuelCost ?? 0) / stops,
          summary.maintenanceCost != null ? summary.maintenanceCost / stops : null,
          summary.vehicleCost != null ? summary.vehicleCost / stops : null,
        )
        if (!breakdown) return null
        const truckId = summary.truckId ?? leg.route?.truckId ?? null
        const label =
          (typeof truckId === 'number' && truckLabelById.get(truckId)) ||
          (typeof truckId === 'number' ? `Truck ${truckId}` : `Truck ${index + 1}`)
        const perStopValue =
          summary.costPerStop !== null && Number.isFinite(summary.costPerStop)
            ? formatCurrency(summary.costPerStop)
            : formatCurrency(stops > 0 ? (summary.totalCost ?? 0) / stops : 0)
        return {
          key: createPreviewLegKey(index),
          label,
          breakdown,
          value: perStopValue,
        }
      })
      .filter((entry): entry is { key: string; label: string; breakdown: CostSegment[]; value: string } => entry !== null)
  }, [efficiencyLoading, multiRunResult, truckLabelById])
  const timeBreakdown = useMemo(() => {
    if (efficiencyLoading) {
      return null
    }
    if (
      !isFiniteNumber(efficiencyMetrics.totalSeconds) &&
      !isFiniteNumber(efficiencyMetrics.travelSeconds) &&
      !isFiniteNumber(efficiencyMetrics.serviceSeconds)
    ) {
      return null
    }
    return createTimeRows(
      efficiencyMetrics.totalSeconds,
      efficiencyMetrics.travelSeconds,
      efficiencyMetrics.serviceSeconds,
    )
  }, [
    efficiencyLoading,
    efficiencyMetrics.totalSeconds,
    efficiencyMetrics.travelSeconds,
    efficiencyMetrics.serviceSeconds,
  ])
  const hasStopDetails = efficiencyStopSummary.items.length > 0 || Boolean(efficiencyStopMessage)
  const showCostPerStopBreakdown = Boolean(costPerStopBreakdown) || legCostPerStopBreakdowns.length > 0
  const legCostPerMileBreakdowns = useMemo(() => {
    if (
      efficiencyLoading ||
      !multiRunResult ||
      multiRunResult.legs.length <= 1
    ) {
      return []
    }
    return multiRunResult.legs
      .map((leg, index) => {
        const summary = leg.summary
        if (!summary) return null
        const distance = summary.distanceMiles ?? 0
        if (!distance || !Number.isFinite(distance) || distance <= 0) return null
        const breakdown = buildCostSegments(
          (summary.laborCost ?? 0) / distance,
          (summary.fuelCost ?? 0) / distance,
          summary.maintenanceCost != null ? summary.maintenanceCost / distance : null,
          summary.vehicleCost != null ? summary.vehicleCost / distance : null,
        )
        if (!breakdown) return null
        const truckId = summary.truckId ?? leg.route?.truckId ?? null
        const label =
          (typeof truckId === 'number' && truckLabelById.get(truckId)) ||
          (typeof truckId === 'number' ? `Truck ${truckId}` : `Truck ${index + 1}`)
        const perMileValue =
          summary.costPerMile !== null && Number.isFinite(summary.costPerMile)
            ? formatCurrency(summary.costPerMile)
            : formatCurrency(distance > 0 ? (summary.totalCost ?? 0) / distance : 0)
        return {
          key: createPreviewLegKey(index),
          label,
          breakdown,
          value: perMileValue,
        }
      })
      .filter((entry): entry is { key: string; label: string; breakdown: CostSegment[]; value: string } => entry !== null)
  }, [efficiencyLoading, multiRunResult, truckLabelById])
  const showCostPerMileBreakdown = Boolean(perMileBreakdown) || legCostPerMileBreakdowns.length > 0
  const legTimeBreakdowns = useMemo(() => {
    if (
      efficiencyLoading ||
      !multiRunResult ||
      multiRunResult.legs.length <= 1
    ) {
      return []
    }
    return multiRunResult.legs
      .map((leg, index) => {
        const summary = leg.summary
        if (!summary) return null
        const rows = createTimeRows(summary.totalSeconds, summary.travelSeconds, summary.serviceSeconds)
        if (rows.length === 0) return null
        const truckId = summary.truckId ?? leg.route?.truckId ?? null
        const label =
          (typeof truckId === 'number' && truckLabelById.get(truckId)) ||
          (typeof truckId === 'number' ? `Truck ${truckId}` : `Truck ${index + 1}`)
        const totalRow = rows.find(row => row.key === 'total')
        const display = totalRow ? formatDurationSeconds(totalRow.seconds) : estimatedTimeDisplay
        return {
          key: createPreviewLegKey(index),
          label,
          rows,
          display,
        }
      })
      .filter(
        (entry): entry is { key: string; label: string; rows: TimeSegment[]; display: string } => entry !== null,
      )
  }, [efficiencyLoading, estimatedTimeDisplay, multiRunResult, truckLabelById])
  const timeCards = useMemo(
    () => [
      {
        key: 'total',
        label: 'Total Time',
        rows: timeBreakdown,
        display: estimatedTimeDisplay,
      },
      ...legTimeBreakdowns,
    ],
    [estimatedTimeDisplay, legTimeBreakdowns, timeBreakdown],
  )
  const showTimeBreakdown = timeCards.length > 0

  useEffect(() => {
    const element = totalCostMetricRef.current
    if (!element) {
      setMetricValueMaxHeight(null)
      return
    }

    let animationFrameId: number | null = null

    const measure = () => {
      const nextHeight = Math.round(element.getBoundingClientRect().height)
      setMetricValueMaxHeight(prev => (prev === nextHeight ? prev : nextHeight))
    }

    const scheduleMeasure = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      animationFrameId = requestAnimationFrame(measure)
    }

    measure()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        scheduleMeasure()
      })
      observer.observe(element)
      return () => {
        observer.disconnect()
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
        }
      }
    }

    window.addEventListener('resize', scheduleMeasure)
    return () => {
      window.removeEventListener('resize', scheduleMeasure)
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [costBreakdown, legCostBreakdowns, totalCostDisplay])
  const runDisabled =
    efficiencyLoading ||
    !selectedEfficiencyRouteId ||
    routeOptions.length === 0 ||
    truckOptions.length === 0 ||
    efficiencyTruckIds.length === 0

  const persistState = useCallback(
    async (state: DeliveryEstimatorPersistedState, isRetry = false) => {
      pendingPersistRef.current = state
      try {
        const response = await fetch(buildApiUrl('/delivery-estimator/state'), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(state),
        })
        if (!response.ok) {
          throw new Error(`Failed to save state (${response.status})`)
        }
        clearLocalState()
        pendingPersistRef.current = null
        if (retryTimeoutRef.current !== null && typeof window !== 'undefined') {
          window.clearTimeout(retryTimeoutRef.current)
          retryTimeoutRef.current = null
        }
        setSaveError(null)
      } catch (error) {
        console.error('Failed to auto-save delivery estimator state', error)
        saveLocalState(state)
        setSaveError('Auto-save failed. Keeping a local backup and will retry when the connection returns.')
        if (retryTimeoutRef.current === null && typeof window !== 'undefined') {
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null
            const pending = pendingPersistRef.current
            if (pending) {
              void persistState(pending, true)
            }
          }, 5000)
        }
      }
    },
    [],
  )

  const persistedState = useMemo<DeliveryEstimatorPersistedState>(
    () => ({
      schemaVersion: DELIVERY_ESTIMATOR_SCHEMA_VERSION,
      workers,
      workerForm: {
        firstName: workerFirstName,
        lastName: workerLastName,
        wage: workerWage,
        start: startTime,
        end: endTime,
      },
      trucks,
      truckCostRows,
      tripLogsByTruck,
      maintenanceLogsByTruck,
      routes,
      routesByTruck: routes.reduce<Record<number, number[]>>((acc, route) => {
        acc[route.id] = [...route.stopIds]
        return acc
      }, {}),
      vendors,
      vendorForm: {
        locationName: vendorLocation,
        address: vendorAddress,
        windowStart: vendorWindowStart,
        windowEnd: vendorWindowEnd,
        stopTime: vendorServiceMinutes,
        latitude: vendorLatitude,
        longitude: vendorLongitude,
        serviceMinutes: vendorServiceMinutes,
        sequence: vendorStopSequence,
      },
      optimizationForm: {
        depotLatitude,
        depotLongitude,
        truckCount: truckCountInput,
        truckIds: optimizationTruckIds,
      },
      optimizationResult,
      sidebarOpen,
      pdfOpen,
      multiRunResult,
    }),
    [
      depotLatitude,
      depotLongitude,
      truckCountInput,
      optimizationTruckIds,
      maintenanceLogsByTruck,
      optimizationResult,
      pdfOpen,
      sidebarOpen,
      startTime,
      endTime,
      workerFirstName,
      workerLastName,
      workerWage,
      workers,
      trucks,
      truckCostRows,
      tripLogsByTruck,
      routes,
      vendorAddress,
      vendorLocation,
      vendorServiceMinutes,
      vendorLatitude,
      vendorLongitude,
      vendorStopSequence,
      vendorWindowEnd,
      vendorWindowStart,
      vendors,
      multiRunResult,
    ],
  )

  useEffect(() => {
    if (!stateLoaded) return
    if (!didHydrateRef.current) {
      didHydrateRef.current = true
      if (restoredFromLocalRef.current) {
        restoredFromLocalRef.current = false
        const snapshot = persistedState
        pendingPersistRef.current = snapshot
        void persistState(snapshot)
      }
      return
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void persistState(persistedState).finally(() => {
        saveTimeoutRef.current = null
      })
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    }
  }, [persistedState, persistState, stateLoaded])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (activeRouteDropdownId === null) return

    const handleClick = (event: MouseEvent) => {
      const container = routeDropdownRefs.current.get(activeRouteDropdownId)
      if (container && !container.contains(event.target as Node)) {
        setActiveRouteDropdownId(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveRouteDropdownId(null)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeRouteDropdownId])

  useEffect(() => {
    if (activeRouteDropdownId === null) return
    if (routeSelectableVendors.length === 0) {
      setActiveRouteDropdownId(null)
    }
  }, [activeRouteDropdownId, routeSelectableVendors.length])

  const updateTruckCostRow = (rowId: number, updater: (row: TruckCostRow) => TruckCostRow) => {
    setTruckCostRows((current) => current.map((row) => (row.id === rowId ? updater(row) : row)))
  }

  const handleTruckMakeChange = (rowId: number, value: string) => {
    updateTruckCostRow(rowId, (row) => ({ ...row, make: value }))
  }

  const handleTruckYearChange = (rowId: number, value: string) => {
    const sanitized = sanitizeIntegerInput(value)
    updateTruckCostRow(rowId, (row) => ({ ...row, year: sanitized }))
  }

  const handleTruckMpgChange = (rowId: number, value: string) => {
    const sanitized = sanitizeDecimalInput(value)
    const numeric = parseDecimal(sanitized)
    updateTruckCostRow(rowId, (row) => ({ ...row, mpg: numeric, mpgInput: sanitized }))
  }

  const handleTruckCapacityChange = (rowId: number, value: string) => {
    const sanitized = sanitizeIntegerInput(value)
    const numeric = parseInteger(sanitized)
    updateTruckCostRow(rowId, (row) => ({ ...row, capacity: numeric, capacityInput: sanitized }))
  }

  const handleFuelCostPerMileChange = (rowId: number, value: string) => {
    const sanitized = sanitizeDecimalInput(value)
    const numeric = parseDecimal(sanitized)
    updateTruckCostRow(rowId, (row) =>
      withRecomputedTotal({
        ...row,
        fuelCostPerMileInput: sanitized,
        fuelCostPerMile: numeric,
        fuelCostMode: 'manual',
      }),
    )
  }

  const handleMaintenanceCostPerMileChange = (rowId: number, value: string) => {
    const sanitized = sanitizeDecimalInput(value)
    const numeric = parseDecimal(sanitized)
    updateTruckCostRow(rowId, (row) =>
      withRecomputedTotal({
        ...row,
        maintenanceCostPerMileInput: sanitized,
        maintenanceCostPerMile: numeric,
        maintenanceCostMode: 'manual',
      }),
    )
  }

  const activateFuelCostEdit = (rowId: number) => {
    updateTruckCostRow(rowId, (row) =>
      row.fuelCostMode === 'auto' ? withRecomputedTotal({ ...row, fuelCostMode: 'manual' }) : row,
    )
  }

  const maybeResetFuelCostAuto = (rowId: number) => {
    updateTruckCostRow(rowId, (row) => {
      if (row.fuelCostMode === 'manual') {
        const sanitized = row.fuelCostPerMileInput.trim()
        if (!sanitized) {
          return withRecomputedTotal({
            ...row,
            fuelCostMode: 'auto',
            fuelCostPerMile: null,
            fuelCostPerMileInput: '',
          })
        }
      }
      return withRecomputedTotal(row)
    })
  }

  const activateMaintenanceCostEdit = (rowId: number) => {
    updateTruckCostRow(rowId, (row) =>
      row.maintenanceCostMode === 'auto'
        ? withRecomputedTotal({ ...row, maintenanceCostMode: 'manual' })
        : row,
    )
  }

  const maybeResetMaintenanceAuto = (rowId: number) => {
    updateTruckCostRow(rowId, (row) => {
      if (row.maintenanceCostMode === 'manual') {
        const sanitized = row.maintenanceCostPerMileInput.trim()
        if (!sanitized) {
          return withRecomputedTotal({
            ...row,
            maintenanceCostMode: 'auto',
            maintenanceCostPerMile: null,
            maintenanceCostPerMileInput: '',
          })
        }
      }
      return withRecomputedTotal(row)
    })
  }

  const handleAddTruckCost = () => {
    if (!canAddCostTruck) return
    const nextId = truckCostIdRef.current + 1
    truckCostIdRef.current = nextId
    setTruckCostRows((current) => [
      ...current,
      withRecomputedTotal(createTruckCostRow(nextId)),
    ])
    setTripLogsByTruck((current) => ({
      ...current,
      [nextId]: createDefaultTripLogs(),
    }))
    setMaintenanceLogsByTruck((current) => ({
      ...current,
      [nextId]: createDefaultMaintenanceLogs(),
    }))
  }

  const handleRemoveTruckCost = (rowId: number) => {
    setTrucks((current) => current.filter((truck) => truck.id !== rowId))
    setTruckCostRows((current) => current.filter((row) => row.id !== rowId))
    setTripLogsByTruck((current) => {
      if (!(rowId in current)) return current
      const { [rowId]: _removed, ...rest } = current
      return rest
    })
    setMaintenanceLogsByTruck((current) => {
      if (!(rowId in current)) return current
      const { [rowId]: _removed, ...rest } = current
      return rest
    })
  }

  const handleVendorAddressChange = (value: string) => {
    setVendorAddress(value)
    setVendorAddressError(computeVendorAddressError(value))
  }

  const handleVendorLatitudeChange = (value: string) => {
    setVendorLatitude(sanitizeCoordinateInput(value))
  }

  const handleVendorLongitudeChange = (value: string) => {
    setVendorLongitude(sanitizeCoordinateInput(value))
  }

  const handleVendorStopSequenceChange = (value: string) => {
    setVendorStopSequence(sanitizeIntegerInput(value))
  }

  const buildVendorEditDraft = (vendor: Vendor): VendorEditDraft => ({
    locationName: vendor.locationName,
    address: vendor.address,
    windowStart: vendor.windowStart,
    windowEnd: vendor.windowEnd,
    serviceMinutes: sanitizeIntegerInput(
      vendor.stopTime || (vendor.serviceMinutes !== null ? String(vendor.serviceMinutes) : ''),
    ),
    latitude:
      typeof vendor.latitude === 'number' && Number.isFinite(vendor.latitude)
        ? sanitizeCoordinateInput(String(vendor.latitude))
        : '',
    longitude:
      typeof vendor.longitude === 'number' && Number.isFinite(vendor.longitude)
        ? sanitizeCoordinateInput(String(vendor.longitude))
        : '',
    stopSequence:
      typeof vendor.stopSequence === 'number' && Number.isFinite(vendor.stopSequence)
        ? sanitizeIntegerInput(String(vendor.stopSequence))
        : '',
  })

  const updateEditingVendorValue = <K extends keyof VendorEditDraft>(field: K, value: string) => {
    setEditingVendorValues((current) => {
      if (!current) return current
      return { ...current, [field]: value }
    })
  }

  const handleEditVendor = (vendor: Vendor) => {
    if (depotVendorId !== null && vendor.id === depotVendorId) {
      return
    }
    setEditingVendorId(vendor.id)
    setEditingVendorValues(buildVendorEditDraft(vendor))
    setEditingVendorAddressError(computeVendorAddressError(vendor.address))
  }

  const handleCancelVendorEdit = () => {
    setEditingVendorId(null)
    setEditingVendorValues(null)
    setEditingVendorAddressError(null)
  }

  const handleEditingVendorLocationChange = (value: string) => {
    updateEditingVendorValue('locationName', value)
  }

  const handleEditingVendorAddressChange = (value: string) => {
    updateEditingVendorValue('address', value)
    setEditingVendorAddressError(computeVendorAddressError(value))
  }

  const handleEditingVendorServiceMinutesChange = (value: string) => {
    updateEditingVendorValue('serviceMinutes', sanitizeIntegerInput(value))
  }

  const handleEditingVendorLatitudeChange = (value: string) => {
    updateEditingVendorValue('latitude', sanitizeCoordinateInput(value))
  }

  const handleEditingVendorLongitudeChange = (value: string) => {
    updateEditingVendorValue('longitude', sanitizeCoordinateInput(value))
  }

  const handleSelectEditingVendorStart = (value: string) => {
    setEditingVendorValues((current) => {
      if (!current) return current
      let nextEnd = current.windowEnd
      if (toMinutes(nextEnd) <= toMinutes(value)) {
        const currentIdx = TIME_OPTIONS.findIndex((opt) => opt.value === value)
        const next = TIME_OPTIONS[currentIdx + 1] || TIME_OPTIONS[currentIdx]
        if (next) {
          nextEnd = next.value
        }
      }
      return { ...current, windowStart: value, windowEnd: nextEnd }
    })
  }

  const handleSelectEditingVendorEnd = (value: string) => {
    setEditingVendorValues((current) => {
      if (!current) return current
      let nextStart = current.windowStart
      if (toMinutes(value) <= toMinutes(nextStart)) {
        const currentIdx = TIME_OPTIONS.findIndex((opt) => opt.value === value)
        const prev = TIME_OPTIONS[currentIdx - 1] || TIME_OPTIONS[currentIdx]
        if (prev) {
          nextStart = prev.value
        }
      }
      return { ...current, windowEnd: value, windowStart: nextStart }
    })
  }

  const handleSaveVendorEdit = () => {
    if (editingVendorId === null || !editingVendorValues) return
    if (editingVendorAddressError) return
    if (
      !isVendorFormComplete({
        locationName: editingVendorValues.locationName,
        address: editingVendorValues.address,
        windowStart: editingVendorValues.windowStart,
        windowEnd: editingVendorValues.windowEnd,
        serviceMinutes: editingVendorValues.serviceMinutes,
      })
    ) {
      return
    }

    const latitude = parseCoordinate(editingVendorValues.latitude, -90, 90)
    const longitude = parseCoordinate(editingVendorValues.longitude, -180, 180)
    const serviceMinutes = parseInteger(editingVendorValues.serviceMinutes)
    const stopSequence = parseInteger(editingVendorValues.stopSequence)

    setVendors((current) =>
      current.map((vendor) => {
        if (vendor.id !== editingVendorId) {
          return vendor
        }
        return {
          ...vendor,
          locationName: editingVendorValues.locationName.trim(),
          address: editingVendorValues.address.trim(),
          windowStart: editingVendorValues.windowStart,
          windowEnd: editingVendorValues.windowEnd,
          stopTime: editingVendorValues.serviceMinutes.trim(),
          serviceMinutes,
          latitude,
          longitude,
          stopSequence,
        }
      }),
    )
    handleCancelVendorEdit()
  }

  useEffect(() => {
    if (editingVendorId === null) return
    if (vendors.some((vendor) => vendor.id === editingVendorId)) {
      return
    }
    setEditingVendorId(null)
    setEditingVendorValues(null)
    setEditingVendorAddressError(null)
  }, [editingVendorId, vendors])

  const handleAddRoute = () => {
    if (!stateLoaded) return
    const nextId = routeIdRef.current + 1
    routeIdRef.current = nextId
    setRoutes((current) => [...current, { id: nextId, name: '', stopIds: [] }])
    setActiveRouteDropdownId(nextId)
    setSelectedEfficiencyRouteId(nextId)
    setEfficiencyRouteMenuOpen(false)
  }

  const handleRouteNameChange = (routeId: number, value: string) => {
    if (!stateLoaded) return
    setRoutes((current) =>
      current.map((route) => (route.id === routeId ? { ...route, name: value } : route)),
    )
  }

  const handleToggleRouteVendor = (routeId: number, vendorId: number) => {
    if (!stateLoaded) return
    setRoutes((current) =>
      current.map((route) => {
        if (route.id !== routeId) {
          return route
        }
        if (route.stopIds.includes(vendorId)) {
          return { ...route, stopIds: route.stopIds.filter((id) => id !== vendorId) }
        }
        return { ...route, stopIds: [...route.stopIds, vendorId] }
      }),
    )
  }

  const handleRemoveRouteStop = (routeId: number, index: number) => {
    if (!stateLoaded) return
    setRoutes((current) =>
      current.map((route) => {
        if (route.id !== routeId) return route
        return { ...route, stopIds: route.stopIds.filter((_, idx) => idx !== index) }
      }),
    )
  }

  const handleMoveRouteStop = (routeId: number, index: number, direction: number) => {
    if (!stateLoaded) return
    setRoutes((current) =>
      current.map((route) => {
        if (route.id !== routeId) return route
        const targetIndex = index + direction
        if (targetIndex < 0 || targetIndex >= route.stopIds.length) {
          return route
        }
        const nextStops = [...route.stopIds]
        const [moved] = nextStops.splice(index, 1)
        nextStops.splice(targetIndex, 0, moved)
        return { ...route, stopIds: nextStops }
      }),
    )
  }

  useEffect(() => {
    if (!multiRunResult || multiRunResult.legs.length === 0) {
      if (selectedPreviewLegKey !== PREVIEW_ROUTE_KEY) {
        setSelectedPreviewLegKey(PREVIEW_ROUTE_KEY)
      }
      return
    }
    if (selectedPreviewLegKey === PREVIEW_ROUTE_KEY) {
      return
    }
    const currentIndex = parsePreviewLegKey(selectedPreviewLegKey)
    if (currentIndex === null || currentIndex < 0 || currentIndex >= multiRunResult.legs.length) {
      setSelectedPreviewLegKey(createPreviewLegKey(0))
    }
  }, [multiRunResult, selectedPreviewLegKey])

  useEffect(() => {
    if (!stateLoaded) return
    const activeRoute = routes.find((route) => route.id === selectedEfficiencyRouteId) ?? null
    if (
      multiRunResult &&
      multiRunResult.routeId === selectedEfficiencyRouteId &&
      selectedPreviewLegKey !== PREVIEW_ROUTE_KEY &&
      selectedPreviewLeg
    ) {
      setGraphhopperUiUrl((current) => {
        const next = buildGraphhopperPreviewUrl(activeRoute, selectedPreviewLeg)
        return current === next ? current : next
      })
      return
    }

    if (activeRoute) {
      setGraphhopperUiUrl((current) => {
        const next = buildGraphhopperPreviewUrl(activeRoute)
        return current === next ? current : next
      })
      return
    }

    setGraphhopperUiUrl(graphhopperBaseUrl)
  }, [
    multiRunResult,
    selectedEfficiencyRouteId,
    selectedPreviewLegKey,
    selectedPreviewLeg,
    graphhopperBaseUrl,
    stateLoaded,
    routes,
    buildGraphhopperPreviewUrl,
  ])

  useEffect(() => {
    if (!multiRunResult) return
    if (selectedEfficiencyRouteId !== null && multiRunResult.routeId !== selectedEfficiencyRouteId) {
      setMultiRunResult(null)
      setSelectedPreviewLegKey(PREVIEW_ROUTE_KEY)
    }
  }, [multiRunResult, selectedEfficiencyRouteId])


  const handleRunEfficiency = useCallback(async () => {
    if (!selectedEfficiencyRouteId) {
      setEfficiencyError('Select a route before running the calculation.')
      return
    }
    const route = routes.find((item) => item.id === selectedEfficiencyRouteId)
    if (!route || route.stopIds.length === 0) {
      setEfficiencyError('Add one or more stops to the selected route before running the calculation.')
      return
    }

    const selectedTruckIds =
      efficiencyTruckIds.length > 0 ? efficiencyTruckIds : truckOptions.map((option) => option.id)
    if (selectedTruckIds.length === 0) {
      setEfficiencyError('Add at least one truck before running the calculation.')
      return
    }

    const baseStops = [...route.stopIds]
    if (baseStops.length === 0) {
      setEfficiencyError('Add one or more stops to the selected route before running the calculation.')
      return
    }

    const assignmentsKey = `${selectedEfficiencyRouteId}|${baseStops.join(',')}|${selectedTruckIds.join(',')}`
    const baseStopSet = new Set(baseStops)
    let assignments = selectedTruckIds.map(() => [] as number[])
    const usedStops = new Set<number>()

    setEfficiencyLoading(true)
    setEfficiencyError(null)
    setMultiRunResult(null)
    setEfficiencyMetrics({
      totalCost: null,
      costPerStop: null,
      costPerMile: null,
      totalSeconds: null,
      distanceMiles: null,
      travelSeconds: null,
      serviceSeconds: null,
      laborCost: null,
      fuelCost: null,
      maintenanceCost: null,
      vehicleCost: null,
      stopCount: null,
    })

    let solverLegs: OptimizationLeg[] | null = null
    let solverAssignmentsApplied = false
    let optimizationWarning: string | null = null

    const shouldReuseOptimization =
      optimizationResult &&
      optimizationResult.legs.length > 0 &&
      optimizationAssignmentsKey === assignmentsKey

    if (shouldReuseOptimization) {
      solverLegs = optimizationResult.legs
    } else {
      const {
        latitude: depotLat,
        longitude: depotLon,
        usedDefaultFallback,
      } = resolveDepotCoordinates()

      const vendorWaypoints = baseStops
        .map((stopId, index) => {
          const vendor = vendorById.get(stopId)
          if (
            !vendor ||
            typeof vendor.latitude !== 'number' ||
            !Number.isFinite(vendor.latitude) ||
            typeof vendor.longitude !== 'number' ||
            !Number.isFinite(vendor.longitude)
          ) {
            return null
          }
          const serviceMinutes =
            typeof vendor.serviceMinutes === 'number' && Number.isFinite(vendor.serviceMinutes)
              ? vendor.serviceMinutes
              : parseInteger(vendor.stopTime) ?? 0
          const sequenceValue =
            typeof vendor.stopSequence === 'number' && Number.isFinite(vendor.stopSequence)
              ? vendor.stopSequence
              : index
          return {
            id: vendor.id,
            locationName: vendor.locationName,
            coordinates: {
              latitude: vendor.latitude,
              longitude: vendor.longitude,
            },
            serviceMinutes: Math.max(0, Math.round(serviceMinutes)),
            sequence: sequenceValue,
          }
        })
        .filter(
          (
            entry,
          ): entry is {
            id: number
            locationName: string
            coordinates: { latitude: number; longitude: number }
            serviceMinutes: number
            sequence: number
          } => Boolean(entry),
        )

      if (vendorWaypoints.length === 0) {
        setOptimizationResult(null)
        setOptimizationAssignmentsKey(null)
        optimizationWarning =
          'Add vendor coordinates for the selected route to optimize assignments. Using fallback ordering.'
      } else {
        if (usedDefaultFallback && !optimizationWarning) {
          optimizationWarning =
            'Depot coordinates missing for the selected route. Using default depot location to optimize assignments.'
        }
        const baseDepot = {
          id: null,
          name: 'Primary Depot',
          coordinates: {
            latitude: depotLat,
            longitude: depotLon,
          },
        }
        const legsPayload = selectedTruckIds.map((truckId, index) => ({
          truckId,
          startDepot: baseDepot,
          vendors: index === 0 ? vendorWaypoints : [],
          returnToStart: true,
        }))
        const optimizePayload = {
          fleetSize: Math.max(1, legsPayload.length),
          legs: legsPayload,
          profile: 'car',
          optimizeAssignments: true,
        }

        try {
          const response = await fetch(buildApiUrl('/delivery-estimator/optimize'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(optimizePayload),
          })

          if (!response.ok) {
            let message = `Optimization failed (${response.status})`
            try {
              const errorPayload = (await response.json()) as { detail?: unknown }
              if (typeof errorPayload?.detail === 'string') {
                message = errorPayload.detail
              }
            } catch {
              // Ignore JSON parse errors and fall back to default message
            }
            throw new Error(message)
          }

          const resultPayload = await response.json()
          const normalizedResult = normalizeOptimizationResult(resultPayload)
          if (!normalizedResult) {
            throw new Error('Optimization did not return any route legs. Adjust inputs and try again.')
          }
          solverLegs = normalizedResult.legs
          setOptimizationResult(normalizedResult)
          setOptimizationAssignmentsKey(assignmentsKey)
        } catch (error) {
          console.error('Failed to optimize assignments for efficiency run', error)
          setOptimizationResult(null)
          setOptimizationAssignmentsKey(null)
          const baseMessage =
            error instanceof Error
              ? error.message
              : 'Unable to optimize assignments for the selected route.'
          optimizationWarning = `${baseMessage} Using fallback assignments.`
        }
      }
    }

    if (solverLegs && solverLegs.length > 0) {
      const legsByTruckId = new Map<number, OptimizationLeg>()
      solverLegs.forEach((leg) => {
        if (typeof leg.truckId === 'number' && Number.isFinite(leg.truckId) && !legsByTruckId.has(leg.truckId)) {
          legsByTruckId.set(leg.truckId, leg)
        }
      })

      selectedTruckIds.forEach((truckId, index) => {
        const leg = legsByTruckId.get(truckId) ?? solverLegs[index] ?? null
        if (!leg) return
        leg.sequence.forEach((entry) => {
          if (entry.stopType !== 'vendor') return
          if (typeof entry.id !== 'number') return
          const stopId = entry.id
          if (!baseStopSet.has(stopId)) return
          if (usedStops.has(stopId)) return
          assignments[index].push(stopId)
          usedStops.add(stopId)
        })
      })

      solverAssignmentsApplied = usedStops.size > 0
      if (!solverAssignmentsApplied) {
        setOptimizationResult(null)
        setOptimizationAssignmentsKey(null)
        if (!optimizationWarning) {
          optimizationWarning =
            'Optimization did not return vendor assignments for the selected route. Using fallback assignments.'
        }
      }
    }

    if (!solverAssignmentsApplied) {
      assignments = selectedTruckIds.map(() => [] as number[])
      usedStops.clear()
      if (assignments.length > 0) {
        const chunkSize = Math.ceil(baseStops.length / assignments.length)
        assignments.forEach((list, index) => {
          const start = index * chunkSize
          const end = start + chunkSize
          const chunk = baseStops.slice(start, end)
          chunk.forEach((stopId) => {
            list.push(stopId)
            usedStops.add(stopId)
          })
        })
      }

      if (assignments.length > 1) {
        assignments.forEach((list) => {
          if (list.length === 0) {
            const donor = assignments.find((candidate) => candidate.length > 1)
            if (donor) {
              list.push(donor.pop() as number)
            }
          }
        })
      }
    } else {
      const remainingStops = baseStops.filter((stopId) => !usedStops.has(stopId))
      if (remainingStops.length > 0 && assignments.length > 0) {
        const chunkSize = Math.ceil(remainingStops.length / assignments.length)
        assignments.forEach((list, index) => {
          const start = index * chunkSize
          const end = start + chunkSize
          const chunk = remainingStops.slice(start, end)
          chunk.forEach((stopId) => {
            list.push(stopId)
            usedStops.add(stopId)
          })
        })
      }
    }

    if (optimizationWarning) {
      setEfficiencyError(optimizationWarning)
    }

    if (assignments.length > 1 && assignments.some((list) => list.length === 0)) {
      const totalStopCount = assignments.reduce((total, list) => total + list.length, 0)
      if (totalStopCount >= assignments.length) {
        let targetIndex = assignments.findIndex((list) => list.length === 0)
        while (targetIndex !== -1) {
          let donorIndex = -1
          let donorSize = 0
          assignments.forEach((list, index) => {
            if (index === targetIndex) return
            if (list.length > donorSize) {
              donorSize = list.length
              donorIndex = index
            }
          })
          if (donorIndex === -1 || donorSize <= 1) {
            break
          }
          const movedStop = assignments[donorIndex].pop()
          if (typeof movedStop === 'number') {
            assignments[targetIndex].push(movedStop)
          } else {
            break
          }
          targetIndex = assignments.findIndex((list) => list.length === 0)
        }
      }
    }

    const trucksWithoutStops = assignments
      .map((list, index) => (list.length === 0 ? selectedTruckIds[index] : null))
      .filter((value): value is number => value !== null)

    const legsPayload = selectedTruckIds.flatMap((truckId, index) => {
      const stopIds = assignments[index] ?? []
      if (stopIds.length === 0) {
        return []
      }
      const truckAssignment = trucks.find((truck) => truck.id === truckId)
      return [
        {
          truckId,
          workerIds: truckAssignment?.workerIds ?? [],
          stopIds,
        },
      ]
    })

    if (trucksWithoutStops.length > 0) {
      setEfficiencyError((current) =>
        current ??
        (trucksWithoutStops.length === 1
          ? 'One selected truck did not receive any stops. Reduce the vehicle count or add more stops to this route.'
          : 'Some selected trucks did not receive any stops. Reduce the vehicle count or add more stops to this route.'),
      )
    }

    if (legsPayload.length === 0) {
      setEfficiencyError('Unable to derive leg assignments for the selected trucks.')
      setEfficiencyLoading(false)
      return
    }

    try {
      const response = await fetch(buildApiUrl('/delivery-estimator/run/multi'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          routeId: selectedEfficiencyRouteId,
          profile: 'car',
          legs: legsPayload,
        }),
      })

      if (!response.ok) {
        let message = `Route evaluation failed (${response.status})`
        try {
          const errorPayload = (await response.json()) as { detail?: unknown }
          if (typeof errorPayload?.detail === 'string') {
            message = errorPayload.detail
          }
        } catch {
          // ignore json parse errors
        }
        throw new Error(message)
      }

      const data = (await response.json()) as MultiRouteRunResult
      setEfficiencyMetrics({
        totalCost: Number.isFinite(data.totalCost) ? Number(data.totalCost) : null,
        costPerStop:
          data.costPerStop !== null && Number.isFinite(data.costPerStop) ? Number(data.costPerStop) : null,
        costPerMile:
          data.costPerMile !== null && Number.isFinite(data.costPerMile) ? Number(data.costPerMile) : null,
        totalSeconds: Number.isFinite(data.totalSeconds) ? Number(data.totalSeconds) : null,
        distanceMiles: Number.isFinite(data.totalDistanceMiles) ? Number(data.totalDistanceMiles) : null,
        travelSeconds: Number.isFinite(data.totalTravelSeconds) ? Number(data.totalTravelSeconds) : null,
        serviceSeconds: Number.isFinite(data.totalServiceSeconds) ? Number(data.totalServiceSeconds) : null,
        laborCost: Number.isFinite(data.laborCost) ? Number(data.laborCost) : null,
        fuelCost: Number.isFinite(data.fuelCost) ? Number(data.fuelCost) : null,
        maintenanceCost: Number.isFinite(data.maintenanceCost) ? Number(data.maintenanceCost) : null,
        vehicleCost: Number.isFinite(data.vehicleCost) ? Number(data.vehicleCost) : null,
        stopCount: Number.isFinite(data.stopCount) ? Number(data.stopCount) : null,
      })
      setMultiRunResult(data)
      const firstLeg = data.legs && data.legs.length > 0 ? data.legs[0] : null
      setSelectedPreviewLegKey(firstLeg ? createPreviewLegKey(0) : PREVIEW_ROUTE_KEY)
      setGraphhopperUiUrl(buildGraphhopperPreviewUrl(route, firstLeg ?? null))
    } catch (error) {
      console.error('Failed to evaluate route efficiency', error)
      setEfficiencyMetrics({
        totalCost: null,
        costPerStop: null,
        costPerMile: null,
        totalSeconds: null,
        distanceMiles: null,
        travelSeconds: null,
        serviceSeconds: null,
        laborCost: null,
        fuelCost: null,
        maintenanceCost: null,
        vehicleCost: null,
        stopCount: null,
      })
      setMultiRunResult(null)
      setSelectedPreviewLegKey(PREVIEW_ROUTE_KEY)
      setEfficiencyError(error instanceof Error ? error.message : 'Unable to calculate route efficiency right now.')
      setGraphhopperUiUrl(route ? buildGraphhopperPreviewUrl(route) : graphhopperBaseUrl)
    } finally {
      setEfficiencyLoading(false)
    }
  }, [
    buildGraphhopperPreviewUrl,
    efficiencyTruckIds,
    graphhopperBaseUrl,
    optimizationAssignmentsKey,
    optimizationResult,
    resolveDepotCoordinates,
    routes,
    selectedEfficiencyRouteId,
    setEfficiencyError,
    setEfficiencyLoading,
    setEfficiencyMetrics,
    setGraphhopperUiUrl,
    setMultiRunResult,
    setOptimizationAssignmentsKey,
    setOptimizationResult,
    setSelectedPreviewLegKey,
    trucks,
    truckOptions,
    vendorById,
  ])

  const handleResetEfficiency = () => {
    setEfficiencyMetrics({
      totalCost: null,
      costPerStop: null,
      costPerMile: null,
      totalSeconds: null,
      distanceMiles: null,
      travelSeconds: null,
      serviceSeconds: null,
      laborCost: null,
      fuelCost: null,
      maintenanceCost: null,
      vehicleCost: null,
      stopCount: null,
    })
    setEfficiencyError(null)
    setMultiRunResult(null)
    setSelectedPreviewLegKey(PREVIEW_ROUTE_KEY)
    const activeRoute = routes.find((route) => route.id === selectedEfficiencyRouteId) ?? null
    setGraphhopperUiUrl(activeRoute ? buildGraphhopperPreviewUrl(activeRoute) : graphhopperBaseUrl)
  }

  const handleClearRoute = (routeId: number) => {
    if (!stateLoaded) return
    setRoutes((current) =>
      current.map((route) => (route.id === routeId ? { ...route, stopIds: [] } : route)),
    )
    setActiveRouteDropdownId((current) => (current === routeId ? null : current))
  }


  const handleOptimizeRouteOrder = async (routeId: number) => {
    setRouteOptimizeErrors((current) => {
      const next = { ...current }
      delete next[routeId]
      return next
    })
    setRouteOptimizeLoadingId(routeId)
    try {
      try {
        await persistState(persistedState)
      } catch (error) {
        console.warn('Failed to persist delivery estimator state before optimizing route order', error)
      }
      const response = await fetch(buildApiUrl(`/delivery-estimator/routes/${routeId}/optimize`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        let message = `Route optimization failed (${response.status})`
        try {
          const errorPayload = (await response.json()) as { detail?: unknown }
          if (typeof errorPayload?.detail === 'string') {
            message = errorPayload.detail
          }
        } catch {
          // ignore json parse errors
        }
        throw new Error(message)
      }
      const optimized = (await response.json()) as RoutePlan
      setRoutes((current) => {
        const nextRoutes = current.map((route) =>
          route.id === optimized.id ? { ...route, stopIds: [...optimized.stopIds] } : route,
        )
        void persistState({
          ...persistedState,
          routes: nextRoutes,
        })
        return nextRoutes
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to optimize route right now.'
      setRouteOptimizeErrors((current) => ({ ...current, [routeId]: message }))
    } finally {
      setRouteOptimizeLoadingId(null)
    }
  }
  const handleRemoveRoute = (routeId: number) => {
    if (!stateLoaded) return
    setRoutes((current) => {
      const nextRoutes = current.filter((route) => route.id !== routeId)
      if (routeId === selectedEfficiencyRouteId) {
        setSelectedEfficiencyRouteId(nextRoutes[0]?.id ?? null)
      }
      return nextRoutes
    })
    setActiveRouteDropdownId((current) => (current === routeId ? null : current))
    setEfficiencyRouteMenuOpen(false)
  }

  const handleDepotLatitudeChange = (value: string) => {
    setDepotLatitude(sanitizeCoordinateInput(value))
    setOptimizeError(null)
  }

  const handleDepotLongitudeChange = (value: string) => {
    setDepotLongitude(sanitizeCoordinateInput(value))
    setOptimizeError(null)
  }

  const handleTruckCountChange = (value: string) => {
    setTruckCountInput(sanitizeIntegerInput(value))
    setOptimizeError(null)
  }

  const handleOptimizationTruckSelectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedIds = Array.from(event.target.selectedOptions)
      .map((option) => {
        const parsed = Number(option.value)
        return Number.isFinite(parsed) ? parsed : null
      })
      .filter((id): id is number => id !== null)
    setOptimizationTruckIds(selectedIds)
    setOptimizeError(null)
  }

  const handleOptimize = async () => {
    const { latitude, longitude } = resolveDepotCoordinates()

    const vendorsWithCoordinates = vendors.filter(
      (vendor) =>
        typeof vendor.latitude === 'number' &&
        Number.isFinite(vendor.latitude) &&
        typeof vendor.longitude === 'number' &&
        Number.isFinite(vendor.longitude),
    )
    if (vendorsWithCoordinates.length === 0) {
      setOptimizeError('Add at least one vendor with coordinates before optimizing routes.')
      return
    }

    const sortedVendors = [...vendorsWithCoordinates].sort((a, b) => {
      const aSequence = typeof a.stopSequence === 'number' && Number.isFinite(a.stopSequence) ? a.stopSequence : Number.MAX_SAFE_INTEGER
      const bSequence = typeof b.stopSequence === 'number' && Number.isFinite(b.stopSequence) ? b.stopSequence : Number.MAX_SAFE_INTEGER
      if (aSequence !== bSequence) return aSequence - bSequence
      return a.locationName.localeCompare(b.locationName)
    })

    const availableTruckIds = optimizationTruckIds.filter((id) =>
      truckOptions.some((option) => option.id === id),
    )
    if (availableTruckIds.length === 0) {
      setOptimizeError(OPTIMIZATION_TRUCK_SELECTION_ERROR)
      return
    }

    const parsedTruckCount = parseInteger(truckCountInput)
    const fallbackFleetSize = availableTruckIds.length || 1
    const requestedFleetSize = Math.max(
      1,
      Math.min(parsedTruckCount ?? fallbackFleetSize, availableTruckIds.length),
    )

    const vendorWaypoints = sortedVendors.map((vendor, vendorIndex) => {
      const serviceMinutes =
        typeof vendor.serviceMinutes === 'number' && Number.isFinite(vendor.serviceMinutes)
          ? vendor.serviceMinutes
          : parseInteger(vendor.stopTime) ?? 0
      const sequenceValue =
        typeof vendor.stopSequence === 'number' && Number.isFinite(vendor.stopSequence)
          ? vendor.stopSequence
          : vendorIndex
      return {
        id: vendor.id,
        locationName: vendor.locationName,
        coordinates: {
          latitude: vendor.latitude!,
          longitude: vendor.longitude!,
        },
        serviceMinutes: Math.max(0, Math.round(serviceMinutes)),
        sequence: sequenceValue,
      }
    })

    const selectedTruckIds = availableTruckIds.slice(0, requestedFleetSize)
    if (selectedTruckIds.length === 0) {
      setOptimizeError(OPTIMIZATION_TRUCK_SELECTION_ERROR)
      return
    }

    const baseDepot = {
      id: null,
      name: 'Primary Depot',
      coordinates: {
        latitude,
        longitude,
      },
    }

    const legsPayload = selectedTruckIds.map((truckId, index) => ({
      truckId,
      startDepot: baseDepot,
      vendors: index === 0 ? vendorWaypoints : [],
      returnToStart: true,
    }))

    const payload = {
      fleetSize: Math.max(1, legsPayload.length),
      legs: legsPayload,
      profile: 'car',
      optimizeAssignments: true,
    }

    setIsOptimizing(true)
    setOptimizeError(null)

    try {
      const response = await fetch(buildApiUrl('/delivery-estimator/optimize'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let message = `Optimization failed (${response.status})`
        try {
          const errorPayload = (await response.json()) as { detail?: unknown }
          if (typeof errorPayload?.detail === 'string') {
            message = errorPayload.detail
          }
        } catch {
          // Ignore JSON parse errors and fall back to default message
        }
        throw new Error(message)
      }

      const resultPayload = await response.json()
      const normalizedResult = normalizeOptimizationResult(resultPayload)
      if (!normalizedResult) {
        setOptimizationResult(null)
        setOptimizationAssignmentsKey(null)
        setOptimizeError('Optimization did not return any route legs. Adjust inputs and try again.')
        return
      }
      setOptimizationResult(normalizedResult)
      setOptimizationAssignmentsKey(null)
    } catch (error) {
      console.error('Failed to optimize delivery routes', error)
      setOptimizationResult(null)
      setOptimizationAssignmentsKey(null)
      setOptimizeError(error instanceof Error ? error.message : 'Optimization failed. Try again later.')
    } finally {
      setIsOptimizing(false)
    }
  }

  const applyPersistedState = useCallback((data: Partial<DeliveryEstimatorPersistedState>) => {
    const workersData = Array.isArray(data.workers) ? data.workers : []
    setWorkers(workersData)
    workerIdRef.current = workersData.reduce((max, worker) => Math.max(max, worker.id), 0)

    const workerForm = (data.workerForm ?? {}) as Partial<DeliveryEstimatorPersistedState['workerForm']>
    setWorkerFirstName(workerForm.firstName ?? '')
    setWorkerLastName(workerForm.lastName ?? '')
    setWorkerWage(workerForm.wage ?? '')
    setStartTime(ensureValidTime(workerForm.start, DEFAULT_START))
    setEndTime(ensureValidTime(workerForm.end, DEFAULT_END))

    const costRowsRaw = Array.isArray(data.truckCostRows) ? data.truckCostRows : undefined
    const costRows =
      costRowsRaw && costRowsRaw.length > 0
        ? costRowsRaw.map((row, index) =>
            withRecomputedTotal(normalizeTruckCostRow(row, index + 1)),
          )
        : [withRecomputedTotal(createTruckCostRow(1))]
    setTruckCostRows(costRows)
    truckCostIdRef.current = costRows.reduce((max, row) => Math.max(max, row.id), 0) || 1
    const getFallbackRouteName = (routeId: number, fallbackIndex: number) => {
      const row = costRows.find((item) => item.id === routeId)
      if (row) {
        const parts: string[] = []
        const year = (row.year ?? '').trim()
        const make = (row.make ?? '').trim()
        if (year) parts.push(year)
        if (make) parts.push(make)
        const label = parts.join(' ').trim()
        if (label) {
          return label
        }
      }
      return `Truck ${fallbackIndex}`
    }

    const costRowIds = new Set(costRows.map((row) => row.id))
    const trucksData = Array.isArray(data.trucks)
      ? data.trucks
          .filter((truck) => costRowIds.has(truck.id))
          .map((truck) => ({
            id: truck.id,
            workerIds: Array.isArray(truck.workerIds) ? truck.workerIds : [],
          }))
      : []
    setTrucks(trucksData)

    const tripLogsEntries = (data.tripLogsByTruck as Record<string, TripLogEntry[]>) ?? {}
    const nextTripLogs: Record<number, TripLogEntry[]> = {}
    Object.entries(tripLogsEntries).forEach(([rawId, entries]) => {
      const id = Number(rawId)
      if (!Number.isFinite(id) || !Array.isArray(entries)) return
      nextTripLogs[id] = entries.map((entry) => ({
        date: entry?.date ?? formatDateInput(new Date()),
        description: entry?.description ?? '',
        milesDriven: entry?.milesDriven ?? '',
        notes: entry?.notes ?? '',
      }))
    })
    setTripLogsByTruck(nextTripLogs)

    const maintenanceEntries = (data.maintenanceLogsByTruck as Record<string, MaintenanceLogEntry[]>) ?? {}
    const nextMaintenanceLogs: Record<number, MaintenanceLogEntry[]> = {}
    Object.entries(maintenanceEntries).forEach(([rawId, entries]) => {
      const id = Number(rawId)
      if (!Number.isFinite(id) || !Array.isArray(entries)) return
      nextMaintenanceLogs[id] = entries.map((entry) => ({
        date: entry?.date ?? formatDateInput(new Date()),
        shopService: entry?.shopService ?? '',
        description: entry?.description ?? '',
        cost: entry?.cost ?? '',
        notes: entry?.notes ?? '',
      }))
    })
    setMaintenanceLogsByTruck(nextMaintenanceLogs)

    const vendorsRaw = Array.isArray(data.vendors) ? (data.vendors as unknown[]) : []
    const normalizedVendors: Vendor[] = []
    vendorsRaw.forEach((item) => {
      if (!item || typeof item !== 'object') return
      const vendorRecord = item as Record<string, unknown>
      const id = Number(vendorRecord.id)
      if (!Number.isFinite(id)) return
      const windowStartValue =
        typeof vendorRecord.windowStart === 'string' ? vendorRecord.windowStart : undefined
      const windowEndValue =
        typeof vendorRecord.windowEnd === 'string' ? vendorRecord.windowEnd : undefined
      const stopTimeValue =
        typeof vendorRecord.stopTime === 'string' ? sanitizeIntegerInput(vendorRecord.stopTime) : ''
      const latitudeValue = parseCoordinate(
        typeof vendorRecord.latitude === 'number' || typeof vendorRecord.latitude === 'string'
          ? String(vendorRecord.latitude)
          : '',
        -90,
        90,
      )
      const longitudeValue = parseCoordinate(
        typeof vendorRecord.longitude === 'number' || typeof vendorRecord.longitude === 'string'
          ? String(vendorRecord.longitude)
          : '',
        -180,
        180,
      )
      const serviceMinutesValue =
        typeof vendorRecord.serviceMinutes === 'number'
          ? Number.isFinite(vendorRecord.serviceMinutes)
            ? vendorRecord.serviceMinutes
            : null
          : typeof vendorRecord.serviceMinutes === 'string'
          ? parseInteger(vendorRecord.serviceMinutes)
          : parseInteger(stopTimeValue)
      const sequenceValue =
        typeof vendorRecord.sequence === 'number'
          ? Number.isFinite(vendorRecord.sequence)
            ? vendorRecord.sequence
            : null
          : typeof vendorRecord.sequence === 'string'
          ? parseInteger(vendorRecord.sequence)
          : null

      normalizedVendors.push({
        id,
        locationName: typeof vendorRecord.locationName === 'string' ? vendorRecord.locationName : '',
        address: typeof vendorRecord.address === 'string' ? vendorRecord.address : '',
        windowStart: ensureValidTime(windowStartValue, DEFAULT_START),
        windowEnd: ensureValidTime(windowEndValue, DEFAULT_END),
        stopTime: stopTimeValue,
        latitude: latitudeValue,
        longitude: longitudeValue,
        serviceMinutes: serviceMinutesValue,
        stopSequence: sequenceValue,
      })
    })
    const maxVendorId = normalizedVendors.reduce((max, vendor) => Math.max(max, vendor.id), 0)
    let depotVendor = normalizedVendors.find((vendor) => isDepotVendorRecord(vendor))
    if (!depotVendor) {
      const newDepotId = maxVendorId + 1
      depotVendor = {
        id: newDepotId,
        locationName: DEFAULT_DEPOT.locationName,
        address: DEFAULT_DEPOT.address,
        windowStart: DEFAULT_DEPOT.windowStart,
        windowEnd: DEFAULT_DEPOT.windowEnd,
        stopTime: DEFAULT_DEPOT.stopTime,
        latitude: DEFAULT_DEPOT.latitude,
        longitude: DEFAULT_DEPOT.longitude,
        serviceMinutes: DEFAULT_DEPOT.serviceMinutes,
        stopSequence: null,
      }
      normalizedVendors.push(depotVendor)
    } else {
      depotVendor.locationName = depotVendor.locationName || DEFAULT_DEPOT.locationName
      depotVendor.address = depotVendor.address || DEFAULT_DEPOT.address
      depotVendor.windowStart = ensureValidTime(depotVendor.windowStart, DEFAULT_DEPOT.windowStart)
      depotVendor.windowEnd = ensureValidTime(depotVendor.windowEnd, DEFAULT_DEPOT.windowEnd)
      depotVendor.stopTime = sanitizeIntegerInput(depotVendor.stopTime || DEFAULT_DEPOT.stopTime)
      depotVendor.serviceMinutes =
        depotVendor.serviceMinutes != null ? depotVendor.serviceMinutes : DEFAULT_DEPOT.serviceMinutes
      depotVendor.latitude =
        typeof depotVendor.latitude === 'number' ? depotVendor.latitude : DEFAULT_DEPOT.latitude
      depotVendor.longitude =
        typeof depotVendor.longitude === 'number' ? depotVendor.longitude : DEFAULT_DEPOT.longitude
    }

    setDepotVendorId(depotVendor.id)
    setVendors(normalizedVendors)
    vendorIdRef.current = normalizedVendors.reduce((max, vendor) => Math.max(max, vendor.id), 0)

    const vendorIdSet = new Set(normalizedVendors.map((vendor) => vendor.id))
    const normalizedRoutes: RoutePlan[] = []
    if (Array.isArray(data.routes)) {
      data.routes.forEach((route, index) => {
        if (!route || typeof route !== 'object') return
        const routeRecord = route as Record<string, unknown>
        const idRaw = Number(routeRecord.id)
        const nameValue = typeof routeRecord.name === 'string' ? routeRecord.name : ''
        const stopIdsRaw = Array.isArray(routeRecord.stopIds) ? routeRecord.stopIds : []
        const stopIds = stopIdsRaw
          .map((value) => {
            const parsed = Number(value)
            return Number.isFinite(parsed) ? parsed : null
          })
          .filter((stopId): stopId is number => stopId !== null && vendorIdSet.has(stopId))
        const routeId = Number.isFinite(idRaw) ? idRaw : index + 1
        normalizedRoutes.push({
          id: routeId,
          name: nameValue.trim(),
          stopIds,
        })
      })
    }

    if (normalizedRoutes.length === 0) {
      const legacyRoutes = (data.routesByTruck as Record<string, unknown>) ?? {}
      Object.entries(legacyRoutes).forEach(([rawId, value], index) => {
        const routeId = Number(rawId)
        if (!Number.isFinite(routeId) || !Array.isArray(value)) {
          return
        }
        const stopIds = value
          .map((item) => {
            const parsed = Number(item)
            return Number.isFinite(parsed) ? parsed : null
          })
          .filter((stopId): stopId is number => stopId !== null && vendorIdSet.has(stopId))
        const fallbackName = getFallbackRouteName(routeId, index + 1)
        normalizedRoutes.push({
          id: routeId,
          name: fallbackName,
          stopIds,
        })
      })
    }

    normalizedRoutes.sort((a, b) => a.id - b.id)
    setRoutes(normalizedRoutes)
    routeIdRef.current = normalizedRoutes.reduce((max, route) => Math.max(max, route.id), 0)

    const vendorForm = (data.vendorForm ?? {}) as Partial<DeliveryEstimatorPersistedState['vendorForm']>
    setVendorLocation(typeof vendorForm.locationName === 'string' ? vendorForm.locationName : '')
    const addressValue = typeof vendorForm.address === 'string' ? vendorForm.address : ''
    setVendorAddress(addressValue)
    setVendorAddressError(computeVendorAddressError(addressValue))
    setVendorWindowStart(ensureValidTime(vendorForm.windowStart, DEFAULT_START))
    setVendorWindowEnd(ensureValidTime(vendorForm.windowEnd, DEFAULT_END))
    const stopTimeFormValue =
      typeof vendorForm.serviceMinutes === 'string' && vendorForm.serviceMinutes.trim()
        ? vendorForm.serviceMinutes
        : typeof vendorForm.stopTime === 'string'
        ? vendorForm.stopTime
        : ''
    setVendorServiceMinutes(sanitizeIntegerInput(stopTimeFormValue))
    const latitudeFormValue =
      typeof vendorForm.latitude === 'string'
        ? sanitizeCoordinateInput(vendorForm.latitude)
        : typeof vendorForm.latitude === 'number'
        ? sanitizeCoordinateInput(String(vendorForm.latitude))
        : ''
    const longitudeFormValue =
      typeof vendorForm.longitude === 'string'
        ? sanitizeCoordinateInput(vendorForm.longitude)
        : typeof vendorForm.longitude === 'number'
        ? sanitizeCoordinateInput(String(vendorForm.longitude))
        : ''
    setVendorLatitude(latitudeFormValue)
    setVendorLongitude(longitudeFormValue)
    const sequenceFormValue =
      typeof vendorForm.sequence === 'string'
        ? sanitizeIntegerInput(vendorForm.sequence)
        : typeof vendorForm.sequence === 'number'
        ? sanitizeIntegerInput(String(vendorForm.sequence))
        : ''
    setVendorStopSequence(sequenceFormValue)

    const optimizationForm = (data.optimizationForm ?? {}) as Partial<OptimizationFormState>
    const depotLatitudeFormValue =
      typeof optimizationForm.depotLatitude === 'string'
        ? sanitizeCoordinateInput(optimizationForm.depotLatitude)
        : typeof optimizationForm.depotLatitude === 'number'
        ? sanitizeCoordinateInput(String(optimizationForm.depotLatitude))
        : ''
    const depotLongitudeFormValue =
      typeof optimizationForm.depotLongitude === 'string'
        ? sanitizeCoordinateInput(optimizationForm.depotLongitude)
        : typeof optimizationForm.depotLongitude === 'number'
        ? sanitizeCoordinateInput(String(optimizationForm.depotLongitude))
        : ''
    const truckCountFormValue =
      typeof optimizationForm.truckCount === 'string'
        ? sanitizeIntegerInput(optimizationForm.truckCount)
        : typeof optimizationForm.truckCount === 'number'
        ? sanitizeIntegerInput(String(optimizationForm.truckCount))
        : ''
    const truckIdsFormValue = Array.isArray(optimizationForm.truckIds)
      ? optimizationForm.truckIds
          .map((value) => {
            const parsed = Number(value)
            return Number.isFinite(parsed) ? parsed : null
          })
          .filter((id): id is number => id !== null)
      : []
    setDepotLatitude(depotLatitudeFormValue)
    setDepotLongitude(depotLongitudeFormValue)
    setTruckCountInput(truckCountFormValue)
    setOptimizationTruckIds(truckIdsFormValue)

    const normalizedOptimizationResult = normalizeOptimizationResult(data.optimizationResult)
    setOptimizationResult(normalizedOptimizationResult)
    setOptimizationAssignmentsKey(null)
    setOptimizeError(null)
    setIsOptimizing(false)

    setSidebarOpen(typeof data.sidebarOpen === 'boolean' ? data.sidebarOpen : true)
    setPdfOpen(typeof data.pdfOpen === 'boolean' ? data.pdfOpen : false)
    const multiRunRaw = data.multiRunResult as MultiRouteRunResult | undefined
    if (multiRunRaw && Array.isArray(multiRunRaw.legs)) {
      setMultiRunResult(multiRunRaw)
      setSelectedPreviewLegKey(multiRunRaw.legs.length > 0 ? createPreviewLegKey(0) : PREVIEW_ROUTE_KEY)
      setEfficiencyMetrics({
        totalCost: Number.isFinite(multiRunRaw.totalCost) ? Number(multiRunRaw.totalCost) : null,
        costPerStop:
          multiRunRaw.costPerStop !== null && Number.isFinite(multiRunRaw.costPerStop)
            ? Number(multiRunRaw.costPerStop)
            : null,
        costPerMile:
          multiRunRaw.costPerMile !== null && Number.isFinite(multiRunRaw.costPerMile)
            ? Number(multiRunRaw.costPerMile)
            : null,
        totalSeconds: Number.isFinite(multiRunRaw.totalSeconds) ? Number(multiRunRaw.totalSeconds) : null,
        distanceMiles: Number.isFinite(multiRunRaw.totalDistanceMiles)
          ? Number(multiRunRaw.totalDistanceMiles)
          : null,
        travelSeconds: Number.isFinite(multiRunRaw.totalTravelSeconds)
          ? Number(multiRunRaw.totalTravelSeconds)
          : null,
        serviceSeconds: Number.isFinite(multiRunRaw.totalServiceSeconds)
          ? Number(multiRunRaw.totalServiceSeconds)
          : null,
        laborCost: Number.isFinite(multiRunRaw.laborCost) ? Number(multiRunRaw.laborCost) : null,
      fuelCost: Number.isFinite(multiRunRaw.fuelCost) ? Number(multiRunRaw.fuelCost) : null,
      maintenanceCost: Number.isFinite(multiRunRaw.maintenanceCost)
        ? Number(multiRunRaw.maintenanceCost)
        : null,
      vehicleCost: Number.isFinite(multiRunRaw.vehicleCost) ? Number(multiRunRaw.vehicleCost) : null,
      stopCount: Number.isFinite(multiRunRaw.stopCount) ? Number(multiRunRaw.stopCount) : null,
    })
    } else {
      setMultiRunResult(null)
      setSelectedPreviewLegKey(PREVIEW_ROUTE_KEY)
    }

    setEditingIndex(null)
    setEditingWorker(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadState() {
      try {
        const response = await fetch(buildApiUrl('/delivery-estimator/state'))
        if (response.status === 404) {
          const local = loadLocalState()
          if (!cancelled && local) {
            applyPersistedState(local)
            setSaveError('No saved state found on server. Restored last local draft.')
            restoredFromLocalRef.current = true
          }
          return
        }
        if (!response.ok) {
          throw new Error(`Failed to load delivery estimator state (${response.status})`)
        }
        const payload = (await response.json()) as Partial<DeliveryEstimatorPersistedState>
        if (!cancelled) {
          applyPersistedState(payload)
          clearLocalState()
          setSaveError(null)
          restoredFromLocalRef.current = false
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load delivery estimator state', error)
          const local = loadLocalState()
          if (local) {
            applyPersistedState(local)
            setSaveError('Working from your last local draft. Changes will sync when the connection resumes.')
            restoredFromLocalRef.current = true
          } else {
            setSaveError('Unable to load saved state. You may be starting fresh.')
          }
        }
      } finally {
        if (!cancelled) {
          didHydrateRef.current = false
          setStateLoaded(true)
        }
      }
    }

    void loadState()

    return () => {
      cancelled = true
    }
  }, [applyPersistedState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => {
      const pending = pendingPersistRef.current
      if (pending) {
        void persistState(pending, true)
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [persistState])
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (startRef.current && !startRef.current.contains(target)) setStartMenuOpen(false)
      if (endRef.current && !endRef.current.contains(target)) setEndMenuOpen(false)
      if (vendorStartRef.current && !vendorStartRef.current.contains(target)) setVendorStartMenuOpen(false)
      if (vendorEndRef.current && !vendorEndRef.current.contains(target)) setVendorEndMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(
    () => () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setStartMenuOpen(false)
        setEndMenuOpen(false)
        setVendorStartMenuOpen(false)
        setVendorEndMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSelectStart = (value: string) => {
    setStartTime(value)
    setStartMenuOpen(false)
    if (toMinutes(endTime) <= toMinutes(value)) {
      const currentIdx = TIME_OPTIONS.findIndex((opt) => opt.value === value)
      const next = TIME_OPTIONS[currentIdx + 1] || TIME_OPTIONS[currentIdx]
      if (next) setEndTime(next.value)
    }
  }

  const handleSelectEnd = (value: string) => {
    setEndTime(value)
    setEndMenuOpen(false)
    if (toMinutes(value) <= toMinutes(startTime)) {
      const currentIdx = TIME_OPTIONS.findIndex((opt) => opt.value === value)
      const prev = TIME_OPTIONS[currentIdx - 1] || TIME_OPTIONS[currentIdx]
      if (prev) setStartTime(prev.value)
    }
  }

  const handleSelectVendorStart = (value: string) => {
    setVendorWindowStart(value)
    setVendorStartMenuOpen(false)
    if (toMinutes(vendorWindowEnd) <= toMinutes(value)) {
      const currentIdx = TIME_OPTIONS.findIndex((opt) => opt.value === value)
      const next = TIME_OPTIONS[currentIdx + 1] || TIME_OPTIONS[currentIdx]
      if (next) setVendorWindowEnd(next.value)
    }
  }

  const handleSelectVendorEnd = (value: string) => {
    setVendorWindowEnd(value)
    setVendorEndMenuOpen(false)
    if (toMinutes(value) <= toMinutes(vendorWindowStart)) {
      const currentIdx = TIME_OPTIONS.findIndex((opt) => opt.value === value)
      const prev = TIME_OPTIONS[currentIdx - 1] || TIME_OPTIONS[currentIdx]
      if (prev) setVendorWindowStart(prev.value)
    }
  }

  const clearAddForm = () => {
    setWorkerFirstName('')
    setWorkerLastName('')
    setWorkerWage('')
  }

  const clearVendorForm = () => {
    setVendorLocation('')
    setVendorAddress('')
    setVendorAddressError(null)
    setVendorServiceMinutes('')
    setVendorLatitude('')
    setVendorLongitude('')
    setVendorStopSequence('')
  }

  const handleAddVendorEntry = () => {
    if (!canAddVendor) {
      if (vendorAddress.trim() && vendorAddressError) {
        return
      }
      return
    }

    const nextId = vendorIdRef.current + 1
    vendorIdRef.current = nextId

    const latitude = parseCoordinate(vendorLatitude, -90, 90)
    const longitude = parseCoordinate(vendorLongitude, -180, 180)
    const serviceMinutes = parseInteger(vendorServiceMinutes)
    const stopSequence = parseInteger(vendorStopSequence)

    const vendorDetails: Vendor = {
      id: nextId,
      locationName: vendorLocation.trim(),
      address: vendorAddress.trim(),
      windowStart: vendorWindowStart,
      windowEnd: vendorWindowEnd,
      stopTime: vendorServiceMinutes.trim(),
      latitude,
      longitude,
      serviceMinutes,
      stopSequence,
    }

    setVendors((previous) => [...previous, vendorDetails])
    clearVendorForm()
  }

  const handleRemoveVendor = (vendorId: number) => {
    if (depotVendorId !== null && vendorId === depotVendorId) {
      return
    }
    if (editingVendorId === vendorId) {
      setEditingVendorId(null)
      setEditingVendorValues(null)
      setEditingVendorAddressError(null)
    }
    setVendors((previous) => previous.filter((vendor) => vendor.id !== vendorId))
    setRoutes((current) =>
      current.map((route) => {
        if (!route.stopIds.includes(vendorId)) {
          return route
        }
        return { ...route, stopIds: route.stopIds.filter((value) => value !== vendorId) }
      }),
    )
  }

  const handleVendorServiceMinutesChange = (value: string) => {
    setVendorServiceMinutes(sanitizeIntegerInput(value))
  }

  const stopEditingWorker = () => {
    setEditingIndex(null)
    setEditingWorker(null)
  }

  const handleSubmitWorker = () => {
    if (!canSubmitWorker) return

    const nextId = workerIdRef.current + 1
    workerIdRef.current = nextId

    const workerDetails: Worker = {
      id: nextId,
      firstName: workerFirstName.trim(),
      lastName: workerLastName.trim(),
      wage: normalizeWage(workerWage),
      start: startTime,
      end: endTime,
    }

    setWorkers((previous) => [...previous, workerDetails])

    clearAddForm()
  }

  const handleDeleteWorker = (index: number) => {
    setWorkers((previous) => {
      const workerToRemove = previous[index]
      if (workerToRemove) {
        setTrucks((current) =>
          current.map((truck) =>
            truck.workerIds.includes(workerToRemove.id)
              ? { ...truck, workerIds: truck.workerIds.filter((id) => id !== workerToRemove.id) }
              : truck,
          ),
        )
      }
      return previous.filter((_, idx) => idx !== index)
    })

    if (editingIndex !== null) {
      if (index === editingIndex) {
        stopEditingWorker()
      } else if (index < editingIndex) {
        setEditingIndex((current) => (current !== null ? current - 1 : current))
      }
    }
  }

  const handleEditWorker = (index: number) => {
    const worker = workers[index]
    if (!worker) return

    setEditingIndex(index)
    setEditingWorker({ ...worker })
  }

  const handleSaveEdit = () => {
    if (editingIndex === null || !editingWorker) return
    if (!isWorkerFormComplete(editingWorker)) return

    setWorkers((previous) =>
      previous.map((worker, idx) =>
        idx === editingIndex
          ? {
              ...editingWorker,
              firstName: editingWorker.firstName.trim(),
              lastName: editingWorker.lastName.trim(),
              wage: normalizeWage(editingWorker.wage),
            }
          : worker,
      ),
    )

    stopEditingWorker()
  }

  const handleCancelEdit = () => {
    stopEditingWorker()
  }

  const updateEditingWorker = <K extends keyof Worker>(field: K, value: Worker[K]) => {
    setEditingWorker((current) => (current ? { ...current, [field]: value } : current))
  }

  const handleAddTruck = () => {
    setTrucks((previous) => {
      const usedIds = new Set(previous.map((truck) => truck.id))
      const nextRow = truckCostRows.find((row) => !usedIds.has(row.id))
      if (!nextRow) return previous
      return [...previous, { id: nextRow.id, workerIds: [] }]
    })
  }

  const handleRemoveTruck = (truckId: number) => {
    setTrucks((previous) => {
      const truckToRemove = previous.find((truck) => truck.id === truckId)
      const workerIdsToRemove = new Set(truckToRemove ? truckToRemove.workerIds : [])

      const remainingTrucks = previous.filter((truck) => truck.id !== truckId)

      if (workerIdsToRemove.size === 0) {
        return remainingTrucks
      }

      return remainingTrucks.map((truck) => ({
        ...truck,
        workerIds: truck.workerIds.filter((id) => !workerIdsToRemove.has(id)),
      }))
    })
  }

  const handleToggleTruckAssignment = (truck: Truck, workerId: number) => {
    setTrucks((current) => {
      const assignedTruck = current.find((item) => item.workerIds.includes(workerId))
      return current.map((item) => {
        if (item.id !== truck.id) {
          if (assignedTruck && assignedTruck.id === item.id && assignedTruck.id !== truck.id) {
            return {
              ...item,
              workerIds: item.workerIds.filter((id) => id !== workerId),
            }
          }
          return item
        }

        const isAssignedHere = item.workerIds.includes(workerId)
        if (isAssignedHere) {
          return { ...item, workerIds: item.workerIds.filter((id) => id !== workerId) }
        }

        if (assignedTruck && assignedTruck.id !== truck.id) {
          return item
        }

        if (item.workerIds.length >= MAX_WORKERS_PER_TRUCK) {
          return item
        }

        return { ...item, workerIds: [...item.workerIds, workerId] }
      })
    })
  }

  const handleSelectEditingStart = (value: string) => {
    setEditingWorker((current) => {
      if (!current) return current
      let nextEnd = current.end
      if (toMinutes(nextEnd) <= toMinutes(value)) {
        const currentIdx = TIME_OPTIONS.findIndex((opt) => opt.value === value)
        const next = TIME_OPTIONS[currentIdx + 1] || TIME_OPTIONS[currentIdx]
        if (next) nextEnd = next.value
      }
      return { ...current, start: value, end: nextEnd }
    })
  }

  const handleSelectEditingEnd = (value: string) => {
    setEditingWorker((current) => {
      if (!current) return current
      let nextStart = current.start
      if (toMinutes(value) <= toMinutes(nextStart)) {
        const currentIdx = TIME_OPTIONS.findIndex((opt) => opt.value === value)
        const prev = TIME_OPTIONS[currentIdx - 1] || TIME_OPTIONS[currentIdx]
        if (prev) nextStart = prev.value
      }
      return { ...current, start: nextStart, end: value }
    })
  }

  if (!isDesktop && pdfOpen) {
    return <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
  }

  return (
    <div className={`pdf-layout chart-with-sidebar delivery-layout ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
      <Sidebar mode="graphs" sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onOpenViewer={() => setPdfOpen(true)} />
      <main className="pdf-content delivery-content" aria-label="Delivery Estimator workspace">
        <div className="delivery-scroll" role="region" aria-label="Delivery estimator page">
          <header className="delivery-page-header delivery-page-header--centered">
            <h1 className="delivery-page-title">Delivery Estimator</h1>
          </header>

          {saveError ? (
            <div className="delivery-save-error" role="alert">
              {saveError}
            </div>
          ) : null}

          {SHOW_ROUTE_OPTIMIZATION ? (
            <section className="delivery-section delivery-optimization-section" aria-label="Route optimization">
            <header className="delivery-section-header delivery-section-header--centered">
              <h2 className="delivery-section-title">Route Optimization</h2>
            </header>
            <div className="delivery-form" aria-label="Vehicle routing inputs">
              <div className="delivery-form-grid">
                <div className="control-group delivery-field">
                  <label className="control-label" htmlFor="optimization-depot-latitude">
                    Depot Latitude
                  </label>
                  <input
                    id="optimization-depot-latitude"
                    type="text"
                    inputMode="decimal"
                    className="delivery-input"
                    value={depotLatitude}
                    onChange={(event) => handleDepotLatitudeChange(event.target.value)}
                    placeholder="34.7465"
                  />
                </div>
                <div className="control-group delivery-field">
                  <label className="control-label" htmlFor="optimization-depot-longitude">
                    Depot Longitude
                  </label>
                  <input
                    id="optimization-depot-longitude"
                    type="text"
                    inputMode="decimal"
                    className="delivery-input"
                    value={depotLongitude}
                    onChange={(event) => handleDepotLongitudeChange(event.target.value)}
                    placeholder="-92.2896"
                  />
                </div>
                <div className="control-group delivery-field">
                  <label className="control-label" htmlFor="optimization-truck-count">
                    Desired Fleet Size
                  </label>
                  <input
                    id="optimization-truck-count"
                    type="text"
                    inputMode="numeric"
                    className="delivery-input"
                    value={truckCountInput}
                    onChange={(event) => handleTruckCountChange(event.target.value)}
                    placeholder="3"
                  />
                </div>
              </div>
            </div>
            <div className="delivery-form" aria-label="Select trucks for optimization">
              <div className="delivery-form-grid">
                <div className="control-group delivery-field">
                  <label className="control-label" htmlFor="optimization-truck-select">
                    Trucks to Include
                  </label>
                  {truckOptions.length > 0 ? (
                    <select
                      id="optimization-truck-select"
                      multiple
                      className="delivery-input"
                      value={optimizationTruckIds.map(String)}
                      onChange={handleOptimizationTruckSelectionChange}
                      size={Math.min(6, Math.max(truckOptions.length, 3))}
                    >
                      {truckOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="delivery-empty">Add trucks to choose which ones to optimize.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="delivery-add" aria-label="Run optimization">
              <button
                type="button"
                className="delivery-add-btn"
                onClick={handleOptimize}
                disabled={
                  isOptimizing ||
                  !stateLoaded ||
                  optimizationTruckIds.length === 0 ||
                  truckOptions.length === 0
                }
              >
                {isOptimizing ? 'Optimizing…' : 'Optimize Routes'}
              </button>
            </div>
            {optimizeError ? (
              <p className="delivery-field-error" role="alert">
                {optimizeError}
              </p>
            ) : null}
            {optimizationResult ? (
              <div className="delivery-optimization-results" aria-live="polite">
                <h3 className="delivery-optimization-results-title">Optimization Results</h3>
                <div className="delivery-optimization-overview">
                  <div className="delivery-optimization-overview-item">
                    <span className="delivery-optimization-overview-label">Fleet Size</span>
                    <span className="delivery-optimization-overview-value">{optimizationResult.fleetSize}</span>
                  </div>
                  <div className="delivery-optimization-overview-item">
                    <span className="delivery-optimization-overview-label">Total Distance</span>
                    <span className="delivery-optimization-overview-value">
                      {formatDistanceMeters(optimizationResult.totalDistanceMeters)}
                    </span>
                  </div>
                  <div className="delivery-optimization-overview-item">
                    <span className="delivery-optimization-overview-label">Travel Time</span>
                    <span className="delivery-optimization-overview-value">
                      {formatDurationSeconds(optimizationResult.totalTravelSeconds)}
                    </span>
                  </div>
                  <div className="delivery-optimization-overview-item">
                    <span className="delivery-optimization-overview-label">Service Time</span>
                    <span className="delivery-optimization-overview-value">
                      {formatDurationSeconds(optimizationResult.totalServiceSeconds)}
                    </span>
                  </div>
                  <div className="delivery-optimization-overview-item">
                    <span className="delivery-optimization-overview-label">Total Cost</span>
                    <span className="delivery-optimization-overview-value">
                      {formatCurrency(optimizationResult.totalCost)}
                    </span>
                  </div>
                </div>
                <div className="delivery-optimization-body">
                  <div className="delivery-optimization-legs">
                    {optimizationLegSummaries.map((summary) => (
                      <article key={summary.key} className="delivery-optimization-leg-card">
                        <header className="delivery-optimization-leg-header">
                          <h4 className="delivery-optimization-leg-title">{summary.truckLabel}</h4>
                          <span className="delivery-optimization-leg-meta">
                            {summary.stopCount === 1 ? '1 stop' : `${summary.stopCount} stops`}
                          </span>
                        </header>
                        <dl className="delivery-optimization-leg-metrics">
                          <div>
                            <dt>Distance</dt>
                            <dd>{formatDistanceMeters(summary.distanceMeters)}</dd>
                          </div>
                          <div>
                            <dt>Travel Time</dt>
                            <dd>{formatDurationSeconds(summary.travelSeconds)}</dd>
                          </div>
                          <div>
                            <dt>Service Time</dt>
                            <dd>{formatDurationSeconds(summary.serviceSeconds)}</dd>
                          </div>
                          <div>
                            <dt>Total Time</dt>
                            <dd>{formatDurationSeconds(summary.totalSeconds)}</dd>
                          </div>
                          <div>
                            <dt>Total Cost</dt>
                            <dd>{formatCurrency(summary.totalCost)}</dd>
                          </div>
                        </dl>
                        <div className="delivery-optimization-leg-stops">
                          <h5>Vendor Stops</h5>
                          {summary.stopLabels.length > 0 ? (
                            <ol className="delivery-optimization-leg-stop-list">
                              {summary.stopLabels.map((label, index) => (
                                <li key={`${summary.key}-stop-${index}`}>{label}</li>
                              ))}
                            </ol>
                          ) : (
                            <p className="delivery-optimization-leg-empty">No vendors assigned.</p>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  <aside className="delivery-optimization-diagnostics" aria-label="Solver diagnostics">
                    <h4 className="delivery-optimization-diagnostics-title">Solver Diagnostics</h4>
                    <dl className="delivery-optimization-diagnostics-list">
                      <div>
                        <dt>Status</dt>
                        <dd>{formatOptimizationStatusLabel(optimizationResult.diagnostics.status)}</dd>
                      </div>
                      {optimizationResult.diagnostics.statusDetail ? (
                        <div>
                          <dt>Detail</dt>
                          <dd>{optimizationResult.diagnostics.statusDetail}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {optimizationResult.diagnostics.unassignedStops.length > 0 ? (
                      <div className="delivery-optimization-diagnostics-group">
                        <h5>Unassigned Stops</h5>
                        <ul>
                          {optimizationResult.diagnostics.unassignedStops.map((stop, index) => (
                            <li key={`${stop.id ?? 'unassigned'}-${index}`}>{stop.label}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {optimizationResult.diagnostics.violatedConstraints.length > 0 ? (
                      <div className="delivery-optimization-diagnostics-group">
                        <h5>Violated Constraints</h5>
                        <ul>
                          {optimizationResult.diagnostics.violatedConstraints.map((constraint, index) => (
                            <li key={`${constraint}-${index}`}>{constraint}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </aside>
                </div>
              </div>
            ) : null}
            </section>
          ) : null}

          <section
            className={`delivery-section delivery-workers-section${workersCollapsed ? ' is-collapsed' : ''}`}
            aria-label="Delivery estimator summary"
          >
            <header className="delivery-section-header delivery-section-header--centered">
              <h2 className="delivery-section-title">Worker List</h2>
            </header>
            {!workersCollapsed ? (
              <>
            <div className="delivery-form" aria-label="Worker schedule controls">
              <div className="delivery-form-grid">
              <div className="control-group delivery-field">
                <label className="control-label" htmlFor="worker-first-name">First Name</label>
                <input
                  id="worker-first-name"
                  type="text"
                  className="delivery-input"
                  value={workerFirstName}
                  onChange={(event) => setWorkerFirstName(event.target.value)}
                  placeholder="Enter first name"
                />
              </div>
              <div className="control-group delivery-field">
                <label className="control-label" htmlFor="worker-last-name">Last Name</label>
                <input
                  id="worker-last-name"
                  type="text"
                  className="delivery-input"
                  value={workerLastName}
                  onChange={(event) => setWorkerLastName(event.target.value)}
                  placeholder="Enter last name"
                />
              </div>
              <div className="control-group delivery-field">
                <label className="control-label" htmlFor="worker-wage">Wage</label>
                <input
                  id="worker-wage"
                  type="text"
                  inputMode="decimal"
                  className="delivery-input"
                  value={workerWage}
                  onChange={(event) => setWorkerWage(ensureDollarPrefix(event.target.value))}
                  placeholder="$0.00"
                />
              </div>
              <div className="control-group delivery-field" ref={startRef}>
                <div className="control-label">Start</div>
                <button
                  type="button"
                  className="dropdown-btn delivery-time-btn"
                  aria-haspopup="listbox"
                  aria-expanded={startMenuOpen}
                  onClick={() => setStartMenuOpen((v) => !v)}
                >
                  {startLabel}
                  <span className="caret" aria-hidden>▾</span>
                </button>
                {startMenuOpen && (
                  <div
                    className="dropdown-menu dropdown-scroll delivery-dropdown-menu"
                    role="listbox"
                    aria-label="Select start time"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={startTime === opt.value}
                        className={`dropdown-item ${startTime === opt.value ? 'is-active' : ''}`}
                        onClick={() => handleSelectStart(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="control-group delivery-field" ref={endRef}>
                <label className="control-label" htmlFor="delivery-end-trigger">End</label>
                <button
                  type="button"
                  id="delivery-end-trigger"
                  className="dropdown-btn delivery-time-btn"
                  aria-haspopup="listbox"
                  aria-controls="delivery-end-menu"
                  aria-expanded={endMenuOpen}
                  onClick={() => setEndMenuOpen((v) => !v)}
                >
                  <span className="dropdown-btn-label">{endLabel}</span>
                  <span className="caret" aria-hidden>▾</span>
                </button>
                {endMenuOpen && (
                  <div
                    id="delivery-end-menu"
                    className="dropdown-menu dropdown-scroll delivery-dropdown-menu"
                    role="listbox"
                    aria-labelledby="delivery-end-trigger"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={endTime === opt.value}
                        className={`dropdown-item ${endTime === opt.value ? 'is-active' : ''}`}
                        onClick={() => handleSelectEnd(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
                <div
                  className="delivery-add"
                  aria-label={
                    editingIndex !== null
                      ? 'Finish editing the selected worker before adding a new one'
                      : 'Add worker to schedule'
                  }
                >
                  <button
                    type="button"
                    className="delivery-add-btn"
                    onClick={handleSubmitWorker}
                    disabled={editingIndex !== null || !canSubmitWorker}
                  >
                    Add Worker
                  </button>
                </div>
              </div>
            </div>
            {workers.length > 0 && (
              <div className="delivery-workers" aria-live="polite">
                <div className="delivery-worker-grid">
                  {workers.map((worker, index) => (
                    <div className="delivery-worker-row" key={`${worker.id}-${worker.start}-${worker.end}-${index}`}>
                      {editingIndex === index && editingWorker ? (
                        <>
                          <div className="delivery-worker-cell">
                            <div className="delivery-worker-name-edit">
                              <input
                                type="text"
                                className="delivery-input"
                                value={editingWorker.firstName}
                                onChange={(event) => updateEditingWorker('firstName', event.target.value)}
                                aria-label="Edit worker first name"
                                placeholder="First name"
                              />
                              <input
                                type="text"
                                className="delivery-input"
                                value={editingWorker.lastName}
                                onChange={(event) => updateEditingWorker('lastName', event.target.value)}
                                aria-label="Edit worker last name"
                                placeholder="Last name"
                              />
                            </div>
                          </div>
                          <div className="delivery-worker-cell">
                            <input
                              type="text"
                              inputMode="decimal"
                              className="delivery-input"
                              value={editingWorker.wage}
                              onChange={(event) =>
                                updateEditingWorker('wage', ensureDollarPrefix(event.target.value))
                              }
                              aria-label="Edit worker wage"
                            />
                          </div>
                          <div className="delivery-worker-cell">
                            <select
                              className="delivery-input"
                              value={editingWorker.start}
                              onChange={(event) => handleSelectEditingStart(event.target.value)}
                              aria-label="Edit worker start time"
                            >
                              {TIME_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="delivery-worker-cell">
                            <select
                              className="delivery-input"
                              value={editingWorker.end}
                              onChange={(event) => handleSelectEditingEnd(event.target.value)}
                              aria-label="Edit worker end time"
                            >
                              {TIME_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="delivery-worker-actions">
                            <button
                              type="button"
                              className="delivery-action-btn delivery-action-edit"
                              onClick={handleSaveEdit}
                              disabled={!isWorkerFormComplete(editingWorker)}
                              aria-label={`Save changes for ${formatWorkerName(editingWorker)}`}
                            >
                              💾
                            </button>
                            <button
                              type="button"
                              className="delivery-action-btn delivery-action-delete"
                              onClick={handleCancelEdit}
                              aria-label="Cancel worker edit"
                            >
                              ↩
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="delivery-worker-cell">{formatWorkerName(worker)}</div>
                          <div className="delivery-worker-cell">{formatWageDisplay(worker.wage)}</div>
                          <div className="delivery-worker-cell">{getLabel(worker.start)}</div>
                          <div className="delivery-worker-cell">{getLabel(worker.end)}</div>
                          <div className="delivery-worker-actions">
                            <button
                              type="button"
                              className="delivery-action-btn delivery-action-edit"
                              onClick={() => handleEditWorker(index)}
                              aria-label={`Edit ${formatWorkerName(worker)} entry`}
                            >
                              ⚙️
                            </button>
                            <button
                              type="button"
                              className="delivery-action-btn delivery-action-delete"
                              onClick={() => handleDeleteWorker(index)}
                              aria-label={`Delete ${formatWorkerName(worker)} entry`}
                            >
                              ✖
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
              </>
            ) : null}
            {renderSectionToggle('workers', 'Worker List')}
          </section>

          <section
            className={`delivery-section delivery-truck-costs-section${truckCostsCollapsed ? ' is-collapsed' : ''}`}
            aria-label="Truck operating costs"
          >
            <header className="delivery-section-header delivery-section-header--centered">
              <h2 className="delivery-section-title">Truck Operating Costs</h2>
            </header>
            {!truckCostsCollapsed ? (
              <>
            <div className="delivery-truck-costs-panel">
              <div className="delivery-truck-costs-actions">
                <button
                  type="button"
                  className="delivery-add-btn delivery-trucks-add-btn"
                  onClick={handleAddTruckCost}
                  disabled={!canAddCostTruck}
                >
                  Add Truck
                </button>
              </div>
              <table className="delivery-truck-costs-table">
                <thead>
                  <tr>
                    <th scope="col">Truck</th>
                    <th scope="col">Make</th>
                    <th scope="col">Year</th>
                    <th scope="col">MPG</th>
                    <th scope="col">Fuel / Mile</th>
                    <th scope="col">Maint / Mile</th>
                    <th scope="col">Total / Mile</th>
                  </tr>
                </thead>
                <tbody>
                  {truckCostRows.map((row, index) => {
                    const fuelDisplay =
                      row.fuelCostPerMileInput ||
                      (row.fuelCostPerMile != null ? row.fuelCostPerMile.toString() : '')
                    const maintenanceDisplay =
                      row.maintenanceCostPerMileInput ||
                      (row.maintenanceCostPerMile != null ? row.maintenanceCostPerMile.toString() : '')
                    const totalDisplay =
                      row.totalCostPerMileInput ||
                      (row.totalCostPerMile != null ? row.totalCostPerMile.toString() : '')
                    return (
                      <tr key={row.id}>
                      <th scope="row">{index + 1}</th>
                      <td>
                        <input
                          type="text"
                          className="delivery-input delivery-truck-costs-input"
                          value={row.make}
                          onChange={(event) => handleTruckMakeChange(row.id, event.target.value)}
                          placeholder="Input"
                          aria-label={`Truck ${index + 1} make`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="delivery-input delivery-truck-costs-input"
                          value={row.year}
                          onChange={(event) => handleTruckYearChange(row.id, event.target.value)}
                          placeholder="Input"
                          aria-label={`Truck ${index + 1} year`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="delivery-input delivery-truck-costs-input"
                          value={row.mpgInput}
                          onChange={(event) => handleTruckMpgChange(row.id, event.target.value)}
                          placeholder="Input"
                          aria-label={`Truck ${index + 1} miles per gallon`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="delivery-input delivery-truck-costs-input"
                          value={fuelDisplay}
                          onFocus={() => activateFuelCostEdit(row.id)}
                          onBlur={() => maybeResetFuelCostAuto(row.id)}
                          onChange={(event) => handleFuelCostPerMileChange(row.id, event.target.value)}
                          placeholder={row.fuelCostMode === 'auto' ? 'Auto' : '0.00'}
                          aria-label={`Truck ${index + 1} fuel cost per mile${
                            row.fuelCostMode === 'auto' ? ' (auto)' : ''
                          }`}
                          readOnly={row.fuelCostMode === 'auto'}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="delivery-input delivery-truck-costs-input"
                          value={maintenanceDisplay}
                          onFocus={() => activateMaintenanceCostEdit(row.id)}
                          onBlur={() => maybeResetMaintenanceAuto(row.id)}
                          onChange={(event) =>
                            handleMaintenanceCostPerMileChange(row.id, event.target.value)
                          }
                          placeholder={row.maintenanceCostMode === 'auto' ? 'Auto' : '0.00'}
                          aria-label={`Truck ${index + 1} maintenance cost per mile${
                            row.maintenanceCostMode === 'auto' ? ' (auto)' : ''
                          }`}
                          readOnly={row.maintenanceCostMode === 'auto'}
                        />
                      </td>
                      <td>
                        <div className="delivery-truck-costs-total-actions">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="delivery-input delivery-truck-costs-input"
                            value={totalDisplay}
                            readOnly
                            placeholder="Auto"
                            aria-label={`Truck ${index + 1} total cost per mile (auto-calculated)`}
                          />
                          <button
                            type="button"
                            className="delivery-truck-costs-remove-btn"
                            onClick={() => handleRemoveTruckCost(row.id)}
                            aria-label={`Remove Truck ${index + 1} operating costs`}
                          >
                            ✖
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
              </>
            ) : null}
            {renderSectionToggle('truckCosts', 'Truck Operating Costs')}
          </section>

          <section
            className={`delivery-section delivery-trucks-section${assignmentsCollapsed ? ' is-collapsed' : ''}`}
            aria-label="Worker assignments"
          >
            <header className="delivery-section-header delivery-trucks-header delivery-section-header--centered">
              <h2 className="delivery-section-title">Worker Assignments</h2>
            </header>
            {!assignmentsCollapsed ? (
              <>
            <div className="delivery-trucks-content">
              <div className="delivery-trucks-toolbar">
                <button
                  type="button"
                  className="delivery-add-btn delivery-trucks-add-btn"
                  onClick={handleAddTruck}
                  disabled={!canAddTruck}
                >
                  Add Truck
                </button>
              </div>
              {trucksWithAssignments.length > 0 ? (
                <div className="delivery-truck-assignments" aria-label="Assign workers to trucks and review assignments">
                  {trucksWithAssignments.map(({ truck, index, assignedWorkers, displayName }) => {
                    const hasWorkers = workers.length > 0
                    const assignedCount = assignedWorkers.length
                    const atCapacity = assignedCount >= MAX_WORKERS_PER_TRUCK
                    const labelText = 'Select workers'

                    return (
                      <div key={truck.id} className="delivery-truck-assignment">
                        <div className="delivery-truck-item">
                          <div className="delivery-truck-header">
                            <span className="delivery-truck-name">{displayName}</span>
                            <span className="delivery-truck-status" aria-live="polite">
                              {labelText}
                            </span>
                          </div>
                          <div
                            className="delivery-truck-checkboxes"
                            role="group"
                            aria-label={`Assign workers to ${displayName}`}
                          >
                            {hasWorkers ? (
                              workers.map((worker) => {
                                const assignedTruckId = workerAssignments.get(worker.id)
                                const isAssignedHere = assignedTruckId === truck.id
                                const isAssignedElsewhere =
                                  assignedTruckId !== undefined && assignedTruckId !== truck.id
                                const canSelectMore = assignedCount < MAX_WORKERS_PER_TRUCK
                                const isDisabled = !isAssignedHere && (isAssignedElsewhere || !canSelectMore)
                                let statusText = ''
                                if (isAssignedHere) {
                                  statusText = 'Assigned'
                                } else if (isAssignedElsewhere) {
                                  const truckPosition =
                                    trucks.findIndex((item) => item.id === assignedTruckId) + 1
                                  statusText =
                                    truckPosition > 0
                                      ? `In ${getTruckDisplayName(assignedTruckId, truckPosition)}`
                                      : 'In use'
                                } else if (!canSelectMore) {
                                  statusText = 'Full'
                                }
                                const checkboxClasses = ['delivery-truck-checkbox']
                                if (isAssignedHere) checkboxClasses.push('is-assigned')
                                if (isDisabled) checkboxClasses.push('is-disabled')

                                return (
                                  <label key={worker.id} className={checkboxClasses.join(' ')}>
                                    <input
                                      type="checkbox"
                                      className="delivery-truck-checkbox-input"
                                      checked={isAssignedHere}
                                      onChange={() => handleToggleTruckAssignment(truck, worker.id)}
                                      disabled={isDisabled}
                                    />
                                    <span className="delivery-truck-checkbox-name">
                                      {formatWorkerName(worker)}
                                    </span>
                                    {statusText ? (
                                      <span className="delivery-truck-checkbox-status">{statusText}</span>
                                    ) : null}
                                  </label>
                                )
                              })
                            ) : (
                              <p className="delivery-truck-checkbox-empty">Add workers to begin assigning.</p>
                            )}
                            {atCapacity ? (
                              <p className="delivery-truck-checkbox-hint">Truck at capacity</p>
                            ) : null}
                          </div>
                        </div>
                        <article className="delivery-truck-card">
                          <header className="delivery-truck-card-header">
                            <span className="delivery-truck-card-title">{displayName}</span>
                            <button
                              type="button"
                              className="delivery-truck-card-remove"
                              onClick={() => handleRemoveTruck(truck.id)}
                              aria-label={`Remove ${displayName}`}
                            >
                              ✖
                            </button>
                          </header>
                          <div className="delivery-truck-card-body">
                            <div
                              className="delivery-truck-card-table"
                              role="group"
                              aria-label={`${displayName} assignments`}
                            >
                              <div className="delivery-truck-card-row delivery-truck-card-row--header">
                                <span>Worker</span>
                                <span>Wage</span>
                                <span>Shift</span>
                              </div>
                              {assignedWorkers.length > 0 ? (
                                assignedWorkers.map((worker) => (
                                  <div key={`table-${truck.id}-${worker.id}`} className="delivery-truck-card-row">
                                    <span>{formatWorkerName(worker)}</span>
                                    <span>{formatWageDisplay(worker.wage)}</span>
                                    <span>{`${getLabel(worker.start)} – ${getLabel(worker.end)}`}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="delivery-truck-card-row delivery-truck-card-row--empty">
                                  <span>No workers assigned</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="delivery-empty delivery-trucks-empty">Add trucks to begin assigning workers.</p>
              )}
            </div>
              </>
            ) : null}
            {renderSectionToggle('assignments', 'Worker Assignments')}
          </section>

          <section
            className={`delivery-section delivery-vendors-section${vendorsCollapsed ? ' is-collapsed' : ''}`}
            aria-label="Vendor master list"
          >
            <header className="delivery-section-header delivery-section-header--centered">
              <h2 className="delivery-section-title">Vendors</h2>
            </header>
            {!vendorsCollapsed ? (
              <>
            <div className="delivery-vendors-panel">
              <div className="delivery-vendors-form" aria-label="Add vendor">
                <div className="delivery-vendors-grid">
                  <div className="delivery-vendor-field delivery-vendor-field--button">
                    <button
                      type="button"
                      className="delivery-add-btn delivery-vendors-add-btn"
                      onClick={handleAddVendorEntry}
                      disabled={!canAddVendor}
                    >
                      Add Vendor
                    </button>
                  </div>
                  <div className="delivery-vendor-field">
                    <label className="control-label" htmlFor="vendor-location">
                      Location Name
                    </label>
                    <input
                      id="vendor-location"
                      type="text"
                      className="delivery-input"
                      value={vendorLocation}
                      onChange={(event) => setVendorLocation(event.target.value)}
                      placeholder="Enter location"
                    />
                  </div>
                  <div className="delivery-vendor-field">
                    <label className="control-label" htmlFor="vendor-address">
                      Address
                    </label>
                    <input
                      id="vendor-address"
                      type="text"
                      className="delivery-input"
                      value={vendorAddress}
                      onChange={(event) => handleVendorAddressChange(event.target.value)}
                      aria-invalid={Boolean(vendorAddressError)}
                      placeholder="Enter address"
                    />
                    {vendorAddressError ? (
                      <p className="delivery-field-error" role="alert">
                        {vendorAddressError}
                      </p>
                    ) : null}
                  </div>
                  <div className="delivery-vendor-field" ref={vendorStartRef}>
                    <label className="control-label" htmlFor="vendor-window-start">
                      Start of Delivery Window
                    </label>
                    <button
                      type="button"
                      id="vendor-window-start"
                      className="dropdown-btn delivery-time-btn delivery-vendor-time-btn"
                      aria-haspopup="listbox"
                      aria-expanded={vendorStartMenuOpen}
                      onClick={() => setVendorStartMenuOpen((open) => !open)}
                    >
                      {vendorStartLabel}
                      <span className="caret" aria-hidden>
                        ▾
                      </span>
                    </button>
                    {vendorStartMenuOpen && (
                      <div
                        className="dropdown-menu dropdown-scroll delivery-dropdown-menu delivery-vendor-time-menu"
                        role="listbox"
                        aria-label="Select start of delivery window"
                      >
                        {TIME_OPTIONS.map((opt) => (
                          <button
                            key={`vendor-start-${opt.value}`}
                            type="button"
                            role="option"
                            className={`dropdown-item ${vendorWindowStart === opt.value ? 'is-active' : ''}`}
                            aria-selected={vendorWindowStart === opt.value}
                            onClick={() => handleSelectVendorStart(opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="delivery-vendor-field" ref={vendorEndRef}>
                    <label className="control-label" htmlFor="vendor-window-end">
                      End of Delivery Window
                    </label>
                    <button
                      type="button"
                      id="vendor-window-end"
                      className="dropdown-btn delivery-time-btn delivery-vendor-time-btn"
                      aria-haspopup="listbox"
                      aria-expanded={vendorEndMenuOpen}
                      onClick={() => setVendorEndMenuOpen((open) => !open)}
                    >
                      {vendorEndLabel}
                      <span className="caret" aria-hidden>
                        ▾
                      </span>
                    </button>
                    {vendorEndMenuOpen && (
                      <div
                        className="dropdown-menu dropdown-scroll delivery-dropdown-menu delivery-vendor-time-menu"
                        role="listbox"
                        aria-label="Select end of delivery window"
                      >
                        {TIME_OPTIONS.map((opt) => (
                          <button
                            key={`vendor-end-${opt.value}`}
                            type="button"
                            role="option"
                            className={`dropdown-item ${vendorWindowEnd === opt.value ? 'is-active' : ''}`}
                            aria-selected={vendorWindowEnd === opt.value}
                            onClick={() => handleSelectVendorEnd(opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="delivery-vendor-routing" aria-label="Route metadata">
                <div className="delivery-vendor-routing-header">
                  <h3 className="delivery-vendor-routing-title">Route Metadata</h3>
                </div>
                <div className="delivery-vendor-routing-row">
                  <div className="delivery-vendor-field">
                    <label className="control-label" htmlFor="vendor-service-minutes">
                      Stop Time Estimate (min)
                    </label>
                    <div className="delivery-vendor-stop">
                      <input
                        id="vendor-service-minutes"
                        type="text"
                        inputMode="numeric"
                        className="delivery-input delivery-vendor-stop-input"
                        value={vendorServiceMinutes}
                        onChange={(event) => handleVendorServiceMinutesChange(event.target.value)}
                        placeholder="25"
                      />
                      <span className="delivery-vendor-stop-suffix">min</span>
                    </div>
                  </div>
                  <div className="delivery-vendor-field">
                    <label className="control-label" htmlFor="vendor-latitude">
                      Latitude
                    </label>
                    <input
                      id="vendor-latitude"
                      type="text"
                      inputMode="decimal"
                      className="delivery-input"
                      value={vendorLatitude}
                      onChange={(event) => handleVendorLatitudeChange(event.target.value)}
                      placeholder="40.7128"
                    />
                  </div>
                  <div className="delivery-vendor-field">
                    <label className="control-label" htmlFor="vendor-longitude">
                      Longitude
                    </label>
                    <input
                      id="vendor-longitude"
                      type="text"
                      inputMode="decimal"
                      className="delivery-input"
                      value={vendorLongitude}
                      onChange={(event) => handleVendorLongitudeChange(event.target.value)}
                      placeholder="-74.0060"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="delivery-vendors-table" aria-label="Vendor list">
              <div className="delivery-vendors-row delivery-vendors-row--header">
                <span>Location Name</span>
                <span>Address</span>
                <span>Delivery Window</span>
                <span>Service Minutes</span>
                <span>Route Metadata</span>
                <span aria-hidden />
              </div>
              {vendorsSortedByLocation.length > 0 ? (
                vendorsSortedByLocation.map((vendor) => {
                  const isDepotVendor = depotVendorId !== null && vendor.id === depotVendorId
                  const isEditing = editingVendorId === vendor.id && editingVendorValues
                  if (isEditing && editingVendorValues) {
                    return (
                      <div key={vendor.id} className="delivery-vendors-row">
                        <>
                        <div className="delivery-vendor-edit-field">
                          <input
                            id={`edit-vendor-location-${vendor.id}`}
                            type="text"
                            className="delivery-input"
                            value={editingVendorValues.locationName}
                            onChange={(event) => handleEditingVendorLocationChange(event.target.value)}
                            aria-label="Edit location name"
                            placeholder="Location name"
                          />
                        </div>
                        <div className="delivery-vendor-edit-field">
                          <input
                            id={`edit-vendor-address-${vendor.id}`}
                            type="text"
                            className="delivery-input"
                            value={editingVendorValues.address}
                            onChange={(event) => handleEditingVendorAddressChange(event.target.value)}
                            aria-label="Edit street address"
                            placeholder="123 Main St"
                          />
                          {editingVendorAddressError ? (
                            <p className="delivery-field-error" role="alert">
                              {editingVendorAddressError}
                            </p>
                          ) : null}
                        </div>
                        <div className="delivery-vendor-edit-field delivery-vendor-edit-time">
                          <label className="visually-hidden" htmlFor={`edit-vendor-start-${vendor.id}`}>
                            Edit start of delivery window
                          </label>
                          <select
                            id={`edit-vendor-start-${vendor.id}`}
                            className="delivery-input"
                            value={editingVendorValues.windowStart}
                            onChange={(event) => handleSelectEditingVendorStart(event.target.value)}
                            aria-label="Edit start of delivery window"
                          >
                            {TIME_OPTIONS.map((opt) => (
                              <option key={`edit-start-${vendor.id}-${opt.value}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <span className="delivery-vendor-edit-time-separator" aria-hidden>
                            –
                          </span>
                          <label className="visually-hidden" htmlFor={`edit-vendor-end-${vendor.id}`}>
                            Edit end of delivery window
                          </label>
                          <select
                            id={`edit-vendor-end-${vendor.id}`}
                            className="delivery-input"
                            value={editingVendorValues.windowEnd}
                            onChange={(event) => handleSelectEditingVendorEnd(event.target.value)}
                            aria-label="Edit end of delivery window"
                          >
                            {TIME_OPTIONS.map((opt) => (
                              <option key={`edit-end-${vendor.id}-${opt.value}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="delivery-vendor-edit-field">
                          <div className="delivery-vendor-stop">
                            <input
                              id={`edit-vendor-service-${vendor.id}`}
                              type="text"
                              inputMode="numeric"
                              className="delivery-input delivery-vendor-stop-input"
                              value={editingVendorValues.serviceMinutes}
                              onChange={(event) => handleEditingVendorServiceMinutesChange(event.target.value)}
                              aria-label="Edit service minutes"
                              placeholder="25"
                            />
                            <span className="delivery-vendor-stop-suffix">min</span>
                          </div>
                        </div>
                        <div className="delivery-vendor-edit-field">
                          <div className="delivery-vendor-edit-coordinates">
                            <input
                              id={`edit-vendor-lat-${vendor.id}`}
                              type="text"
                              inputMode="decimal"
                              className="delivery-input"
                              value={editingVendorValues.latitude}
                              onChange={(event) => handleEditingVendorLatitudeChange(event.target.value)}
                              aria-label="Edit latitude"
                              placeholder="40.7128"
                            />
                            <input
                              id={`edit-vendor-lon-${vendor.id}`}
                              type="text"
                              inputMode="decimal"
                              className="delivery-input"
                              value={editingVendorValues.longitude}
                              onChange={(event) => handleEditingVendorLongitudeChange(event.target.value)}
                              aria-label="Edit longitude"
                              placeholder="-74.0060"
                            />
                          </div>
                        </div>
                        <div className="delivery-vendor-actions">
                          <button
                            type="button"
                            className="delivery-action-btn delivery-action-edit"
                            onClick={handleSaveVendorEdit}
                            disabled={!canSaveVendorEdit}
                            aria-label={`Save changes for ${vendor.locationName || 'vendor'}`}
                          >
                            💾
                          </button>
                          <button
                            type="button"
                            className="delivery-action-btn delivery-action-delete"
                            onClick={handleCancelVendorEdit}
                            aria-label="Cancel vendor edit"
                          >
                            ↩
                          </button>
                        </div>
                        </>
                      </div>
                    )
                  }

                  return (
                    <div key={vendor.id} className="delivery-vendors-row">
                      <span>{vendor.locationName || '—'}</span>
                      <span>{vendor.address || '—'}</span>
                      <span>{`${getLabel(vendor.windowStart)} – ${getLabel(vendor.windowEnd)}`}</span>
                      <span>{formatServiceMinutesDisplay(vendor.serviceMinutes, vendor.stopTime)}</span>
                      <span>{formatCoordinatePair(vendor.latitude, vendor.longitude)}</span>
                      <div className="delivery-vendor-actions">
                        <button
                          type="button"
                          className="delivery-action-btn delivery-action-edit"
                          onClick={() => handleEditVendor(vendor)}
                          aria-label={`Edit ${vendor.locationName || 'vendor'} entry`}
                          disabled={isDepotVendor}
                        >
                          ⚙️
                        </button>
                        <button
                          type="button"
                          className="delivery-action-btn delivery-action-delete"
                          onClick={() => handleRemoveVendor(vendor.id)}
                          aria-label={`Remove ${vendor.locationName || 'vendor'}`}
                          disabled={isDepotVendor}
                        >
                          ✖
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="delivery-vendors-row delivery-vendors-row--empty">
                  <span>No vendors added yet.</span>
                </div>
              )}
            </div>
              </>
            ) : null}
            {renderSectionToggle('vendors', 'Vendors')}
          </section>

          <section
            className={`delivery-section delivery-routes-section${routesCollapsed ? ' is-collapsed' : ''}`}
            aria-label="Route planning"
          >
            <header className="delivery-section-header delivery-section-header--centered">
              <h2 className="delivery-section-title">Routes</h2>
            </header>
            {!routesCollapsed ? (
              <>
            <div className="delivery-routes-panel">
              <div className="delivery-routes-toolbar">
                <button
                  type="button"
                  className="delivery-add-btn delivery-routes-add-btn"
                  onClick={handleAddRoute}
                  disabled={!stateLoaded}
                >
                  Add Route
                </button>
              </div>
              {routes.length === 0 ? (
                <p className="delivery-empty delivery-routes-empty">Add routes to begin planning stops.</p>
              ) : (
                <div className="delivery-routes-grid" aria-label="Route assignments">
                  {routes.map((route, index) => {
                    const stops = route.stopIds
                    const hasVendorOptions = routeSelectableVendors.length > 0
                    const depotId = depotVendorId
                    const depotLabel =
                      depotId !== null ? vendorNameById.get(depotId) ?? DEFAULT_DEPOT.locationName : DEFAULT_DEPOT.locationName
                    const displayName = route.name.trim() || `Route ${index + 1}`
                    const dropdownOpen = activeRouteDropdownId === route.id
                    const controlsDisabled = !stateLoaded
                    const dropdownDisabled = controlsDisabled || !hasVendorOptions
                    const selectedCount = stops.length
                    const dropdownLabel = hasVendorOptions
                      ? selectedCount > 0
                        ? `${selectedCount} stop${selectedCount === 1 ? '' : 's'} selected`
                        : 'Select vendors'
                      : 'No vendors available'
                    return (
                      <article key={`route-${route.id}`} className="delivery-route-card">
                        <header className="delivery-route-card-header">
                          <input
                            type="text"
                            className="delivery-input delivery-route-name-input"
                            value={route.name}
                            onChange={(event) => handleRouteNameChange(route.id, event.target.value)}
                            placeholder={`Route ${index + 1}`}
                            aria-label={`Route ${index + 1} name`}
                            disabled={controlsDisabled}
                          />
                          <div className="delivery-route-header-actions">
                            <button
                              type="button"
                              className="delivery-route-optimize"
                              onClick={() => handleOptimizeRouteOrder(route.id)}
                              disabled={controlsDisabled || stops.length <= 1 || routeOptimizeLoadingId === route.id}
                              aria-label={`Optimize stop order for ${displayName}`}
                            >
                              {routeOptimizeLoadingId === route.id ? 'Optimizing…' : 'Optimize'}
                            </button>
                            <button
                              type="button"
                              className="delivery-route-clear"
                              onClick={() => handleClearRoute(route.id)}
                              disabled={controlsDisabled || stops.length === 0}
                              aria-label={`Clear stops for ${displayName}`}
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              className="delivery-route-remove-card"
                              onClick={() => handleRemoveRoute(route.id)}
                              disabled={controlsDisabled}
                              aria-label={`Remove ${displayName}`}
                            >
                              ✖
                            </button>
                          </div>
                        </header>
                        <div className="delivery-route-card-body">
                          <div
                            className="delivery-route-selector"
                            ref={(node) => {
                              if (node) {
                                routeDropdownRefs.current.set(route.id, node)
                              } else {
                                routeDropdownRefs.current.delete(route.id)
                              }
                            }}
                          >
                            <span className="delivery-route-select-label" id={`route-select-label-${route.id}`}>
                              Select Stops
                            </span>
                            <button
                              type="button"
                              className="dropdown-btn delivery-route-select-trigger"
                              aria-haspopup="listbox"
                              aria-expanded={dropdownOpen}
                              aria-controls={`route-select-menu-${route.id}`}
                              aria-labelledby={`route-select-label-${route.id}`}
                              onClick={() => {
                                if (dropdownDisabled) return
                                setActiveRouteDropdownId((current) =>
                                  current === route.id ? null : route.id,
                                )
                              }}
                              disabled={dropdownDisabled}
                            >
                              <span className="dropdown-btn-label">{dropdownLabel}</span>
                              <span className="caret" aria-hidden>▾</span>
                            </button>
                            {dropdownOpen && hasVendorOptions ? (
                              <div
                                id={`route-select-menu-${route.id}`}
                                className="dropdown-menu dropdown-scroll delivery-route-select-menu"
                                role="listbox"
                                aria-multiselectable="true"
                                aria-labelledby={`route-select-label-${route.id}`}
                              >
                                {routeSelectableVendors.map((vendor) => {
                                  const selected = stops.includes(vendor.id)
                                  const vendorLabel =
                                    vendor.locationName || vendor.address || `Vendor ${vendor.id}`
                                  return (
                                    <label
                                      key={vendor.id}
                                      className={`dropdown-item checkbox-option${selected ? ' is-active' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => handleToggleRouteVendor(route.id, vendor.id)}
                                      />
                                      <span>{vendorLabel}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                          <ol className="delivery-route-list" aria-label={`Stops planned for ${displayName}`}>
                            {depotId !== null && (
                              <li
                                key={`route-${route.id}-start`}
                                className="delivery-route-item delivery-route-item--depot"
                              >
                                <span className="delivery-route-item-index delivery-route-item-index--label">Start</span>
                                <span className="delivery-route-item-name">{depotLabel}</span>
                              </li>
                            )}
                            {stops.length > 0 ? (
                              stops.map((vendorId, stopIndex) => {
                                const label = vendorNameById.get(vendorId) ?? `Vendor ${vendorId}`
                                return (
                                  <li key={`${route.id}-${vendorId}-${stopIndex}`} className="delivery-route-item">
                                    <span className="delivery-route-item-index">{stopIndex + 1}</span>
                                    <span className="delivery-route-item-name">{label}</span>
                                    <div className="delivery-route-item-actions">
                                      <button
                                        type="button"
                                        className="delivery-route-move"
                                        onClick={() => handleMoveRouteStop(route.id, stopIndex, -1)}
                                        disabled={controlsDisabled || stopIndex === 0}
                                        aria-label={`Move ${label} up for ${displayName}`}
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        className="delivery-route-move"
                                        onClick={() => handleMoveRouteStop(route.id, stopIndex, 1)}
                                        disabled={controlsDisabled || stopIndex === stops.length - 1}
                                        aria-label={`Move ${label} down for ${displayName}`}
                                      >
                                        ↓
                                      </button>
                                      <button
                                        type="button"
                                        className="delivery-route-remove"
                                        onClick={() => handleRemoveRouteStop(route.id, stopIndex)}
                                        disabled={controlsDisabled}
                                        aria-label={`Remove ${label} from ${displayName}`}
                                      >
                                        ✖
                                      </button>
                                    </div>
                                  </li>
                                )
                              })
                            ) : (
                              <li className="delivery-route-item delivery-route-item--empty">
                                {vendors.length === 0
                                  ? 'Add vendors to start building a route.'
                                  : 'No stops selected yet.'}
                              </li>
                            )}
                            {depotId !== null && (
                              <li
                                key={`route-${route.id}-end`}
                                className="delivery-route-item delivery-route-item--depot"
                              >
                                <span className="delivery-route-item-index delivery-route-item-index--label">End</span>
                                <span className="delivery-route-item-name">{depotLabel}</span>
                              </li>
                            )}
                          </ol>
                          {routeOptimizeErrors[route.id] ? (
                            <p className="delivery-route-error" role="alert">{routeOptimizeErrors[route.id]}</p>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
              </>
            ) : null}
            {renderSectionToggle('routes', 'Routes')}
          </section>

          <section
            className={`delivery-section delivery-efficiency-section${efficiencyCollapsed ? ' is-collapsed' : ''}`}
            aria-label="Route efficiency"
          >
            <header className="delivery-section-header delivery-section-header--centered">
              <h2 className="delivery-section-title">Route Efficiency Panel</h2>
            </header>
            {!efficiencyCollapsed ? (
              <>
            <div className="delivery-efficiency-panel">
              <div className="delivery-efficiency-toolbar">
                <div className="delivery-efficiency-route" ref={efficiencyRouteMenuRef}>
                  <span className="delivery-efficiency-toolbar-label">Routes</span>
                  <label className="visually-hidden" htmlFor="efficiency-route-select-trigger">
                    Select route
                  </label>
                  <button
                    type="button"
                    id="efficiency-route-select-trigger"
                    className="dropdown-btn delivery-efficiency-route-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={efficiencyRouteMenuOpen}
                    onClick={() => {
                      if (!routeOptions.length) return
                      setEfficiencyRouteMenuOpen((open) => !open)
                    }}
                    disabled={routeOptions.length === 0}
                  >
                    <span className="dropdown-btn-label">{selectedEfficiencyRouteLabel}</span>
                    <span aria-hidden="true" className="delivery-efficiency-route-caret">
                      ▾
                    </span>
                  </button>
                  {efficiencyRouteMenuOpen && routeOptions.length > 0 ? (
                    <div
                      className="dropdown-menu dropdown-scroll delivery-efficiency-route-menu"
                      role="listbox"
                      aria-label="Select an existing route"
                    >
                      {routeOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          role="option"
                          aria-selected={option.id === selectedEfficiencyRouteId}
                          className={`dropdown-item${option.id === selectedEfficiencyRouteId ? ' is-active' : ''}`}
                          onClick={() => {
                            setSelectedEfficiencyRouteId(option.id)
                            setEfficiencyRouteMenuOpen(false)
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="delivery-efficiency-truck-pool" ref={efficiencyTruckMenuRef}>
                  <span className="delivery-efficiency-toolbar-label">Vehicles</span>
                  <button
                    type="button"
                    className="dropdown-btn delivery-efficiency-truck-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={efficiencyTruckMenuOpen}
                    onClick={() => {
                      if (!truckOptions.length) return
                      setEfficiencyTruckMenuOpen((open) => !open)
                    }}
                    disabled={truckOptions.length === 0}
                  >
                    <span className="dropdown-btn-label">{selectedEfficiencyTruckLabel}</span>
                    <span aria-hidden className="delivery-efficiency-route-caret">▾</span>
                  </button>
                  {efficiencyTruckMenuOpen && truckOptions.length > 0 ? (
                    <div
                      className="dropdown-menu dropdown-scroll delivery-efficiency-truck-menu"
                      role="listbox"
                      aria-multiselectable="true"
                      aria-label="Select trucks for efficiency analysis"
                    >
                      {truckOptions.map((option) => {
                        const checked = efficiencyTruckIds.includes(option.id)
                        return (
                          <label
                            key={option.id}
                            className={`dropdown-item checkbox-option${checked ? ' is-active' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setEfficiencyTruckIds((current) => {
                                  if (current.includes(option.id)) {
                                    return current.filter((id) => id !== option.id)
                                  }
                                  return [...current, option.id]
                                })
                              }}
                            />
                            <span>{option.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="delivery-efficiency-actions">
                  <button
                    type="button"
                    className="delivery-efficiency-action-btn"
                    onClick={handleRunEfficiency}
                    disabled={runDisabled}
                  >
                    {efficiencyLoading ? 'Running…' : 'Run'}
                  </button>
                  <button
                    type="button"
                    className="delivery-efficiency-action-btn"
                    onClick={handleResetEfficiency}
                    disabled={efficiencyLoading}
                  >
                    Reset
                  </button>
                </div>
                {efficiencyError ? (
                  <p className="delivery-efficiency-error" role="alert">{efficiencyError}</p>
                ) : null}
              </div>
              <div className="delivery-efficiency-summary">
                <div className="delivery-efficiency-metric">
                  <span className="delivery-efficiency-metric-label">Total Cost</span>
                  <div
                    className={`delivery-efficiency-metric-value${
                      costBreakdown || legCostBreakdowns.length > 0 ? ' has-breakdown' : ''
                    }`}
                    aria-live="polite"
                    ref={totalCostMetricRef}
                  >
                    <div className="delivery-efficiency-cost-stack">
                      <div className="delivery-efficiency-cost-card">
                        <h4 className="delivery-efficiency-cost-card-title">Total</h4>
                        {renderCostBreakdown(costBreakdown, totalCostDisplay, 'Total cost breakdown')}
                      </div>
                      {legCostBreakdowns.map(card => (
                        <div key={card.key} className="delivery-efficiency-cost-card">
                          <h4 className="delivery-efficiency-cost-card-title">{card.label}</h4>
                          {renderCostBreakdown(card.breakdown, card.value, `${card.label} cost breakdown`)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="delivery-efficiency-metric">
                  <span className="delivery-efficiency-metric-label">Cost / Stop</span>
                  <div
                    className={`delivery-efficiency-metric-value${
                      showCostPerStopBreakdown ? ' has-breakdown' : ''
                    }${hasStopDetails ? ' with-stop-summary' : ''}`}
                    aria-live="polite"
                    style={metricValueMaxHeight !== null ? { maxHeight: `${metricValueMaxHeight}px` } : undefined}
                  >
                    {showCostPerStopBreakdown ? (
                      <div className="delivery-efficiency-cost-stack">
                        <div className="delivery-efficiency-cost-card">
                          <h4 className="delivery-efficiency-cost-card-title">Per Stop Total</h4>
                          {renderCostBreakdown(
                            costPerStopBreakdown,
                            costPerStopDisplay,
                            'Cost per stop breakdown',
                          )}
                        </div>
                        {legCostPerStopBreakdowns.map(card => (
                          <div key={`per-stop-${card.key}`} className="delivery-efficiency-cost-card">
                            <h4 className="delivery-efficiency-cost-card-title">{card.label}</h4>
                            {renderCostBreakdown(
                              card.breakdown,
                              card.value,
                              `${card.label} cost per stop breakdown`,
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="delivery-efficiency-metric-figure">{costPerStopDisplay}</span>
                    )}
                    {hasStopDetails ? (
                      <div className="delivery-efficiency-stop-details">
                        {efficiencyStopSummary.items.length > 0 ? (
                          <div className="delivery-efficiency-stop-summary">
                            <span className="delivery-efficiency-stop-heading">Stops in this run</span>
                            <ol className="delivery-efficiency-stop-list">
                              {efficiencyStopSummary.items.map((stop) => (
                                <li
                                  key={stop.key}
                                  className={`delivery-efficiency-stop-item delivery-efficiency-stop-item--${stop.kind}`}
                                >
                                  <span
                                    className={`delivery-efficiency-stop-index delivery-efficiency-stop-index--${stop.kind}`}
                                  >
                                    {stop.indexLabel}
                                  </span>
                                  <span className="delivery-efficiency-stop-name">{stop.label}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                        {efficiencyStopMessage ? (
                          <p className="delivery-efficiency-stop-empty">{efficiencyStopMessage}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="delivery-efficiency-metric">
                  <span className="delivery-efficiency-metric-label">Cost / Mile</span>
                  <div
                    className={`delivery-efficiency-metric-value${
                      showCostPerMileBreakdown ? ' has-breakdown' : ''
                    }`}
                    aria-live="polite"
                  >
                    {showCostPerMileBreakdown ? (
                      <div className="delivery-efficiency-cost-stack">
                        <div className="delivery-efficiency-cost-card">
                          <h4 className="delivery-efficiency-cost-card-title">Per Mile Total</h4>
                          {renderCostBreakdown(
                            perMileBreakdown,
                            costPerMileDisplay,
                            'Cost per mile distribution',
                          )}
                        </div>
                        {legCostPerMileBreakdowns.map(card => (
                          <div key={`per-mile-${card.key}`} className="delivery-efficiency-cost-card">
                            <h4 className="delivery-efficiency-cost-card-title">{card.label}</h4>
                            {renderCostBreakdown(
                              card.breakdown,
                              card.value,
                              `${card.label} cost per mile breakdown`,
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      renderCostBreakdown(perMileBreakdown, costPerMileDisplay, 'Cost per mile distribution')
                    )}
                  </div>
                </div>
                <div className="delivery-efficiency-metric">
                  <span className="delivery-efficiency-metric-label">Estimated Time</span>
                  <div
                    className={`delivery-efficiency-metric-value${showTimeBreakdown ? ' has-breakdown' : ''}`}
                    aria-live="polite"
                  >
                    <div className="delivery-efficiency-cost-stack">
                      {timeCards.map(card => (
                        <div key={`time-${card.key}`} className="delivery-efficiency-cost-card">
                          <h4 className="delivery-efficiency-cost-card-title">{card.label}</h4>
                          {renderTimeBreakdownCard(card.rows, card.display, `${card.label} breakdown`)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
            </div>
            {renderPreviewButtons()}
            <div className="delivery-efficiency-map">
                <div className="delivery-efficiency-map-header">
                  <h3 className="delivery-efficiency-map-title">Map Preview</h3>
                </div>
                <div className="delivery-efficiency-map-canvas">
                  {graphhopperUiUrl ? (
                    <iframe
                      title="GraphHopper Route Planner"
                      src={graphhopperUiUrl}
                      className="delivery-map-iframe"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  ) : (
                    <div className="delivery-efficiency-map-placeholder">Map preview unavailable.</div>
                  )}
                </div>
              </div>
            </div>
              </>
            ) : null}
            {renderSectionToggle('efficiency', 'Route Efficiency Panel')}
          </section>
        </div>
        <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
      </main>
    </div>
  )
}
