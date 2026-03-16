const STORAGE_KEY_PREFIX = 'invoice_return_hash_'
const INVOICE_HASHES = new Set(['invoice'])

type InvoiceMode = 'graphs' | 'pdf'

function normalize(hash: string): string {
  return (hash || '').replace(/^#/, '').toLowerCase()
}

function ensureHash(hash: string): string {
  if (!hash) return '#'
  return hash.startsWith('#') ? hash : `#${hash}`
}

function storageKey(mode: InvoiceMode): string {
  return `${STORAGE_KEY_PREFIX}${mode}`
}

export function writeInvoiceReturn(mode: InvoiceMode, hash: string) {
  try {
    const target = ensureHash(hash)
    if (INVOICE_HASHES.has(normalize(target))) return
    sessionStorage.setItem(storageKey(mode), target)
  } catch {}
}

export function readInvoiceReturn(mode: InvoiceMode, fallback: string): string {
  try {
    const stored = sessionStorage.getItem(storageKey(mode))
    if (!stored) return ensureHash(fallback)
    if (INVOICE_HASHES.has(normalize(stored))) return ensureHash(fallback)
    return ensureHash(stored)
  } catch {
    return ensureHash(fallback)
  }
}

export function clearInvoiceReturn(mode: InvoiceMode) {
  try {
    sessionStorage.removeItem(storageKey(mode))
  } catch {}
}

export function hasInvoiceReturn(mode: InvoiceMode): boolean {
  try {
    return sessionStorage.getItem(storageKey(mode)) != null
  } catch {
    return false
  }
}
