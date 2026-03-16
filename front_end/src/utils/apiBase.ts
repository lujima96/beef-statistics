const DEFAULT_API_URL = 'http://127.0.0.1:8000'
const DEFAULT_GRAPHOPPER_UI_URL = 'http://127.0.0.1:3000'

const stripTrailingSlash = (url: string) => url.replace(/\/$/, '')

export function getApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE
  if (typeof envBase === 'string' && envBase.trim()) {
    return stripTrailingSlash(envBase.trim())
  }

  if (typeof window !== 'undefined') {
    try {
      const { protocol, hostname } = window.location
      if (hostname) {
        const apiPort = protocol === 'https:' ? '8000' : '8000'
        return `${protocol}//${hostname}:${apiPort}`
      }
    } catch {
      // ignore and fall through to default
    }
  }

  return stripTrailingSlash(DEFAULT_API_URL)
}

export function buildApiUrl(path: string): string {
  const base = getApiBase()
  if (!path) return base
  return `${base}/${path.replace(/^\//, '')}`
}

export function getGraphhopperUiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_GRAPHOPPER_UI_URL
  if (typeof envBase === 'string' && envBase.trim()) {
    return stripTrailingSlash(envBase.trim())
  }

  if (typeof window !== 'undefined') {
    try {
      const { protocol, hostname } = window.location
      if (hostname) {
        const uiPort = protocol === 'https:' ? '3000' : '3000'
        return `${protocol}//${hostname}:${uiPort}`
      }
    } catch {
      // ignore and fall through to default
    }
  }

  return stripTrailingSlash(DEFAULT_GRAPHOPPER_UI_URL)
}

export function buildGraphhopperUiUrl(path: string): string {
  const base = getGraphhopperUiBase()
  if (!path) return base
  return `${base}/${path.replace(/^\//, '')}`
}
