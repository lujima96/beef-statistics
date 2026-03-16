import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { getApiBase } from './utils/apiBase'

const FALLBACK_API = 'http://127.0.0.1:8000'

if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const resolvedBase = getApiBase()
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith(FALLBACK_API)) {
      input = `${resolvedBase}${input.slice(FALLBACK_API.length)}`
    } else if (typeof Request !== 'undefined' && input instanceof Request && input.url.startsWith(FALLBACK_API)) {
      input = new Request(`${resolvedBase}${input.url.slice(FALLBACK_API.length)}`, input)
    }
    return originalFetch(input, init)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
