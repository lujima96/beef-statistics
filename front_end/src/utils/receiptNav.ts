const STORAGE_KEY_PREFIX = 'receipt_return_hash_'
const RECEIPT_HASHES = new Set(['receipt', 'receipt-input'])

type ReceiptMode = 'graphs' | 'pdf'

function normalize(hash: string): string {
  return (hash || '').replace(/^#/, '').toLowerCase()
}

function ensureHash(hash: string): string {
  if (!hash) return '#'
  return hash.startsWith('#') ? hash : `#${hash}`
}

function storageKey(mode: ReceiptMode): string {
  return `${STORAGE_KEY_PREFIX}${mode}`
}

export function writeReceiptReturn(mode: ReceiptMode, hash: string) {
  try {
    const target = ensureHash(hash)
    if (RECEIPT_HASHES.has(normalize(target))) return
    sessionStorage.setItem(storageKey(mode), target)
  } catch {}
}

export function readReceiptReturn(mode: ReceiptMode, fallback: string): string {
  try {
    const stored = sessionStorage.getItem(storageKey(mode))
    if (!stored) return ensureHash(fallback)
    if (RECEIPT_HASHES.has(normalize(stored))) return ensureHash(fallback)
    return ensureHash(stored)
  } catch {
    return ensureHash(fallback)
  }
}

export function clearReceiptReturn(mode: ReceiptMode) {
  try {
    sessionStorage.removeItem(storageKey(mode))
  } catch {}
}

export function hasReceiptReturn(mode: ReceiptMode): boolean {
  try {
    return sessionStorage.getItem(storageKey(mode)) != null
  } catch {
    return false
  }
}
