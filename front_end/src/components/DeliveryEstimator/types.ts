export type TimeOption = { value: string; label: string }

export type Worker = {
  id: number
  firstName: string
  lastName: string
  wage: string
  start: string
  end: string
}

export type Truck = {
  id: number
  workerIds: number[]
}

export type RoutesByTruck = Record<number, number[]>

export type RoutePlan = {
  id: number
  name: string
  stopIds: number[]
}

export type TruckCostRow = {
  id: number
  make: string
  year: string
  mpg: number | null
  capacity: number | null
  mpgInput: string
  capacityInput: string
  fuelCostPerMile: number | null
  fuelCostPerMileInput: string
  fuelCostMode: 'auto' | 'manual'
  maintenanceCostPerMile: number | null
  maintenanceCostPerMileInput: string
  maintenanceCostMode: 'auto' | 'manual'
  totalCostPerMile: number | null
  totalCostPerMileInput: string
  totalCostMode: 'auto' | 'manual'
}

export type TripLogEntry = {
  date: string
  description: string
  milesDriven: string
  notes: string
}

export type TripLogField = 'description' | 'milesDriven' | 'notes'

export type MaintenanceLogEntry = {
  date: string
  shopService: string
  description: string
  cost: string
  notes: string
}

export type MaintenanceLogField = 'shopService' | 'description' | 'cost' | 'notes'

export type Vendor = {
  id: number
  locationName: string
  address: string
  windowStart: string
  windowEnd: string
  serviceMinutes: number | null
  latitude: number | null
  longitude: number | null
  stopSequence: number | null
  stopTime: string
}

export type WorkerFormValues = Pick<Worker, 'firstName' | 'lastName' | 'wage' | 'start' | 'end'>

export type OptimizationFormState = {
  depotLatitude: string
  depotLongitude: string
  truckCount: string
  truckIds: number[]
}

export type OptimizationLegSequenceEntry = {
  id: number | null
  label: string
  stopType: 'depot' | 'vendor' | 'return'
}

export type OptimizationTurnInstruction = {
  text: string
  distanceMeters: number
  timeSeconds: number
  sign: number | null
}

export type OptimizationStopTiming = {
  id: number | null
  label: string
  stopType: 'depot' | 'vendor' | 'return'
  sequence: number
  arrivalMinutes: number
  departureMinutes: number
  serviceMinutes: number
}

export type OptimizationCostBreakdown = {
  laborHours: number
  laborCost: number | null
  fuelGallons: number | null
  fuelCost: number | null
  totalCost: number | null
}

export type OptimizationLeg = {
  truckId: number | null
  sequence: OptimizationLegSequenceEntry[]
  distanceMeters: number
  travelSeconds: number
  serviceSeconds: number
  totalSeconds: number
  instructions: OptimizationTurnInstruction[]
  stops: OptimizationStopTiming[]
  costs: OptimizationCostBreakdown
}

export type OptimizationDiagnostics = {
  status: 'success' | 'no_solution' | 'timeout' | 'not_solved' | 'error'
  statusDetail: string | null
  unassignedStops: OptimizationLegSequenceEntry[]
  violatedConstraints: string[]
}

export type OptimizationResult = {
  fleetSize: number
  legs: OptimizationLeg[]
  totalDistanceMeters: number
  totalTravelSeconds: number
  totalServiceSeconds: number
  totalCost: number | null
  diagnostics: OptimizationDiagnostics
}

export type CoordinatePoint = {
  latitude: number
  longitude: number
}

export type MultiRouteLegRoute = {
  truckId: number | null
  sequence: OptimizationLegSequenceEntry[]
  distanceMeters: number
  travelSeconds: number
  serviceSeconds: number
  totalSeconds: number
  geometry: CoordinatePoint[]
  instructions: OptimizationTurnInstruction[]
  stops: OptimizationStopTiming[]
  costs: OptimizationCostBreakdown
}

export type MultiRouteLegSummary = {
  routeId: number
  truckId: number
  distanceMiles: number
  travelSeconds: number
  serviceSeconds: number
  totalSeconds: number
  totalCost: number
  laborCost: number
  fuelCost: number
  maintenanceCost: number
  vehicleCost: number
  costPerStop: number | null
  costPerMile: number | null
  stopCount: number
}

export type MultiRouteLegResult = {
  workerIds: number[]
  stopIds: number[]
  summary: MultiRouteLegSummary
  route: MultiRouteLegRoute
}

export type MultiRouteRunResult = {
  routeId: number
  profile: string
  legs: MultiRouteLegResult[]
  totalDistanceMiles: number
  totalTravelSeconds: number
  totalServiceSeconds: number
  totalSeconds: number
  totalCost: number
  laborCost: number
  fuelCost: number
  maintenanceCost: number
  vehicleCost: number
  costPerStop: number | null
  costPerMile: number | null
  stopCount: number
}

export type DeliveryEstimatorPersistedState = {
  schemaVersion: number
  workers: Worker[]
  workerForm: {
    firstName: string
    lastName: string
    wage: string
    start: string
    end: string
  }
  trucks: Truck[]
  truckCostRows: TruckCostRow[]
  tripLogsByTruck: Record<number, TripLogEntry[]>
  maintenanceLogsByTruck: Record<number, MaintenanceLogEntry[]>
  routes: RoutePlan[]
  routesByTruck?: RoutesByTruck
  vendors: Vendor[]
  vendorForm: {
    locationName: string
    address: string
    windowStart: string
    windowEnd: string
    stopTime: string
    latitude: string
    longitude: string
    serviceMinutes: string
    sequence: string
  }
  optimizationForm?: OptimizationFormState
  optimizationResult?: OptimizationResult | null
  sidebarOpen: boolean
  pdfOpen: boolean
  multiRunResult?: MultiRouteRunResult | null
}
