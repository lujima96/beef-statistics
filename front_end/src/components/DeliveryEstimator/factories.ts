import type { MaintenanceLogEntry, TripLogEntry, TruckCostRow } from './types'

export function createTruckCostRow(id: number): TruckCostRow {
  return {
    id,
    make: '',
    year: '',
    mpg: null,
   capacity: null,
   mpgInput: '',
   capacityInput: '',
    fuelCostPerMile: null,
    fuelCostPerMileInput: '',
    fuelCostMode: 'auto',
    maintenanceCostPerMile: null,
    maintenanceCostPerMileInput: '',
    maintenanceCostMode: 'auto',
    totalCostPerMile: null,
    totalCostPerMileInput: '',
    totalCostMode: 'auto',
  }
}

export function createDefaultTripLogs(): TripLogEntry[] {
  return []
}

export function createDefaultMaintenanceLogs(): MaintenanceLogEntry[] {
  return []
}
