const DELIVERY_HASHES = new Set(['delivery', 'delivery-cost', 'delivery-cost-estimator'])
const STORAGE_KEY_PREFIX = 'delivery_return_hash_'
const ORIGIN_KEY = 'delivery_origin_mode'

export type DeliveryMode = 'graphs' | 'pdf'

function normalize(hash: string): string {
  return (hash || '').replace(/^#/, '').toLowerCase()
}

function ensureHash(hash: string): string {
  return hash.startsWith('#') ? hash : `#${hash}`
}

function storageKey(mode: DeliveryMode): string {
  return `${STORAGE_KEY_PREFIX}${mode}`
}

export function isDeliveryHash(hash: string): boolean {
  return DELIVERY_HASHES.has(normalize(hash))
}

export function writeReturnHash(mode: DeliveryMode, hash: string) {
  try {
    const target = ensureHash(hash)
    if (isDeliveryHash(target)) return
    sessionStorage.setItem(storageKey(mode), target)
  } catch {}
}

export function readReturnHash(mode: DeliveryMode, fallback: string): string {
  try {
    const stored = sessionStorage.getItem(storageKey(mode))
    if (!stored) return ensureHash(fallback)
    if (isDeliveryHash(stored)) return ensureHash(fallback)
    return ensureHash(stored)
  } catch {
    return ensureHash(fallback)
  }
}

export function setOriginMode(mode: DeliveryMode) {
  try {
    sessionStorage.setItem(ORIGIN_KEY, mode)
  } catch {}
}

export function readOriginMode(): DeliveryMode | null {
  try {
    const stored = sessionStorage.getItem(ORIGIN_KEY)
    if (stored === 'graphs' || stored === 'pdf') return stored
  } catch {}
  return null
}

export function clearOriginMode() {
  try {
    sessionStorage.removeItem(ORIGIN_KEY)
  } catch {}
}
