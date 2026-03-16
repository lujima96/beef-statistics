import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { GraphsModeProps } from './types'
import {
  clearOriginMode,
  isDeliveryHash,
  readOriginMode,
  readReturnHash,
  setOriginMode,
  writeReturnHash,
} from '../../utils/deliveryNav'
import type { DeliveryMode } from '../../utils/deliveryNav'
import { clearReceiptReturn, hasReceiptReturn, readReceiptReturn, writeReceiptReturn } from '../../utils/receiptNav'
import { clearInvoiceReturn, hasInvoiceReturn, readInvoiceReturn, writeInvoiceReturn } from '../../utils/invoiceNav'

type GraphsSidebarContentProps = GraphsModeProps & {
  viewerPickerOpen: boolean
  setViewerPickerOpen: Dispatch<SetStateAction<boolean>>
  reportPickerOpen: boolean
  setReportPickerOpen: Dispatch<SetStateAction<boolean>>
}

const VIEWER_OPTIONS = [
  { key: 'graphs', label: 'Graphs' },
  { key: 'pdfs', label: 'PDFs' },
] as const

const REPORT_OPTIONS = [
  { key: '#subprimals', label: 'Sub Primals' },
  { key: '#feed', label: 'Feed' },
  { key: '#live', label: 'Cattle Price' },
  { key: '#5day', label: '5 Day AVG' },
] as const

const DEFAULT_GRAPH_HASH = '#subprimals'
const DEFAULT_PDF_HASH = '#subprimals'
const RECEIPT_HASH = '#receipt'
const INVOICE_HASH = '#invoice'

function normalizeHash(hash: string): string {
  return hash.replace(/^#/, '').toLowerCase()
}

function isReceiptHashValue(normalized: string): boolean {
  return normalized === 'receipt' || normalized === 'receipt-input'
}

function isInvoiceHashValue(normalized: string): boolean {
  return normalized === 'invoice'
}

function labelForHash(raw: string): string {
  const h = normalizeHash(raw)
  if (h === 'feed') return 'Feed'
  if (h === 'live') return 'Cattle Price'
  if (h === '5day' || h === 'avg5') return '5 Day AVG'
  if (isInvoiceHashValue(h)) return 'Invoices'
  if (isReceiptHashValue(h)) return 'Data Entry'
  return 'Sub Primals'
}

export function GraphsSidebarContent(props: GraphsSidebarContentProps) {
  const {
    setSidebarOpen,
    viewerPickerOpen,
    setViewerPickerOpen,
    reportPickerOpen,
    setReportPickerOpen,
    onOpenViewer,
  } = props
  const initialHash = typeof window !== 'undefined' ? window.location.hash : DEFAULT_GRAPH_HASH
  const [currentHash, setCurrentHash] = useState<string>(() => initialHash || DEFAULT_GRAPH_HASH)
  const [returnHash, setReturnHash] = useState<string>(() => readReturnHash('graphs', DEFAULT_GRAPH_HASH))
  const isDeliveryActive = isDeliveryHash(currentHash)
  const originMode = readOriginMode()
  const lastHashRef = useRef<string>(normalizeHash(initialHash || DEFAULT_GRAPH_HASH))

  const maybeCloseSidebar = () => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(max-width: 900px)').matches) {
        setSidebarOpen(false)
      }
    }
  }

  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash || DEFAULT_GRAPH_HASH
      setCurrentHash(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const normalizedCurrent = normalizeHash(currentHash || DEFAULT_GRAPH_HASH)
    if (isReceiptHashValue(lastHashRef.current) && !isReceiptHashValue(normalizedCurrent)) {
      clearReceiptReturn('graphs')
      clearReceiptReturn('pdf')
    }
    if (isInvoiceHashValue(lastHashRef.current) && !isInvoiceHashValue(normalizedCurrent)) {
      clearInvoiceReturn('graphs')
      clearInvoiceReturn('pdf')
    }
    lastHashRef.current = normalizedCurrent
  }, [currentHash])

  useEffect(() => {
    if (isDeliveryActive) {
      setReturnHash(readReturnHash('graphs', DEFAULT_GRAPH_HASH))
    } else {
      const target = currentHash || DEFAULT_GRAPH_HASH
      writeReturnHash('graphs', target)
      setReturnHash(readReturnHash('graphs', DEFAULT_GRAPH_HASH))
    }
  }, [isDeliveryActive, currentHash])

  const deliveryDisplayHash = originMode === 'pdf'
    ? readReturnHash('pdf', DEFAULT_PDF_HASH)
    : returnHash
  const activeHash = isDeliveryActive ? deliveryDisplayHash : (currentHash || DEFAULT_GRAPH_HASH)
  const normalizedActiveHash = normalizeHash(activeHash || DEFAULT_GRAPH_HASH)
  const isReceiptRoute = isReceiptHashValue(normalizedActiveHash)
  const isInvoiceRoute = isInvoiceHashValue(normalizedActiveHash)
  const canReturnFromReceipt = isReceiptRoute && hasReceiptReturn('graphs')
  const canReturnFromInvoice = isInvoiceRoute && hasInvoiceReturn('graphs')
  const receiptReturnHash = canReturnFromReceipt ? readReceiptReturn('graphs', DEFAULT_GRAPH_HASH) : null
  const invoiceReturnHash = canReturnFromInvoice ? readInvoiceReturn('graphs', DEFAULT_GRAPH_HASH) : null
  const invoiceBackTarget = invoiceReturnHash ?? DEFAULT_GRAPH_HASH
  const showInvoiceBack = isInvoiceRoute
  const invoiceDisplayHash = isInvoiceRoute && invoiceReturnHash ? invoiceReturnHash : null
  const displayHash = receiptReturnHash ?? invoiceDisplayHash ?? (activeHash || DEFAULT_GRAPH_HASH)
  const graphLabel = labelForHash(displayHash)
  const activeKey = normalizeHash(displayHash)

  const exitDelivery = (mode: DeliveryMode) => {
    setViewerPickerOpen(false)
    setReportPickerOpen(false)
    let target: string
    if (mode === 'pdf') target = readReturnHash('pdf', DEFAULT_PDF_HASH)
    else target = readReturnHash('graphs', DEFAULT_GRAPH_HASH)
    clearOriginMode()
    setReturnHash(readReturnHash('graphs', DEFAULT_GRAPH_HASH))
    window.location.hash = target
    maybeCloseSidebar()
    if (mode === 'pdf') {
      setTimeout(() => {
        onOpenViewer()
        maybeCloseSidebar()
      }, 0)
    }
  }

  return (
    <>
      <div className="pdf-sidebar-section">
        <button
          type="button"
          className="pdf-date-btn wide"
          onClick={() => setViewerPickerOpen(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={viewerPickerOpen}
        >
          <span className="pdf-date-text">
            {(() => {
              const h = (window.location.hash || '#subprimals').replace(/^#/, '').toLowerCase()
              return h === 'live' || h === '5day' || h === 'avg5' || h === 'subprimals' ? 'Graphs' : 'Graphs'
            })()}
          </span>
          <span className="caret" aria-hidden>
            ▾
          </span>
        </button>
        {viewerPickerOpen && (
          <div role="listbox" className="pdf-date-menu left">
            {VIEWER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                role="option"
                aria-selected={opt.key === 'graphs'}
                className={`pdf-date-item ${opt.key === 'graphs' ? 'is-active' : ''}`}
                onClick={() => {
                  if (isDeliveryActive) {
                    if (opt.key === 'graphs') exitDelivery('graphs')
                    else if (opt.key === 'pdfs') exitDelivery('pdf')
                    return
                  }
                  setViewerPickerOpen(false)
                  if (!isDeliveryActive) {
                    const current = currentHash || DEFAULT_GRAPH_HASH
                    writeReturnHash('graphs', current)
                    setReturnHash(readReturnHash('graphs', DEFAULT_GRAPH_HASH))
                  }
                  if (opt.key === 'pdfs') {
                    onOpenViewer()
                    maybeCloseSidebar()
                  }
                  // graphs is active here; no-op
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pdf-sidebar-section">
        <div className="pdf-date-title">
          <span className="text-layer text-outline" aria-hidden>
            Select Report
          </span>
          <span className="text-layer text-fill" aria-hidden>
            Select Report
          </span>
        </div>
        <button
          type="button"
          className="pdf-date-btn wide"
          onClick={() => setReportPickerOpen(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={reportPickerOpen}
        >
          <span className="pdf-date-text">{graphLabel}</span>
          <span className="caret" aria-hidden>
            ▾
          </span>
        </button>
        {reportPickerOpen && (
          <div role="listbox" className="pdf-date-menu left">
            {REPORT_OPTIONS.map(opt => {
              const isActive = normalizeHash(opt.key) === activeKey
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`pdf-date-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setReportPickerOpen(false)
                    const target = opt.key
                    if (!isActive) {
                      window.location.hash = target
                      maybeCloseSidebar()
                    }
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="pdf-sidebar-section">
        <div className="pdf-date-title">
          <span className="text-layer text-outline" aria-hidden>
            Delivery Estimator
          </span>
          <span className="text-layer text-fill" aria-hidden>
            Delivery Estimator
          </span>
        </div>
        {isDeliveryActive ? (
          <button
            type="button"
            className="pdf-date-btn wide is-active"
            onClick={() => {
              const origin = readOriginMode() || 'graphs'
              exitDelivery(origin)
            }}
          >
            <span className="pdf-date-text">Back</span>
            <span className="caret" aria-hidden>‹</span>
          </button>
        ) : (
          <button
            type="button"
            className="pdf-date-btn wide"
            onClick={() => {
              setViewerPickerOpen(false)
              setReportPickerOpen(false)
              const target = currentHash || DEFAULT_GRAPH_HASH
              writeReturnHash('graphs', target)
              setReturnHash(readReturnHash('graphs', DEFAULT_GRAPH_HASH))
              setOriginMode('graphs')
              window.location.hash = '#delivery'
              maybeCloseSidebar()
            }}
          >
            <span className="pdf-date-text">Go</span>
            <span className="caret" aria-hidden>›</span>
          </button>
        )}
      </div>

      <div className="pdf-sidebar-section">
        <div className="pdf-date-title">
          <span className="text-layer text-outline" aria-hidden>
            Data Entry
          </span>
          <span className="text-layer text-fill" aria-hidden>
            Data Entry
          </span>
        </div>
        {canReturnFromReceipt ? (
          <button
            type="button"
            className={`pdf-date-btn wide receipt-input-link is-active`}
            onClick={() => {
              setViewerPickerOpen(false)
              setReportPickerOpen(false)
              clearOriginMode()
              const target = receiptReturnHash ?? DEFAULT_GRAPH_HASH
              window.location.hash = target
              maybeCloseSidebar()
            }}
          >
            <span className="pdf-date-text">Back</span>
            <span className="caret" aria-hidden>‹</span>
          </button>
        ) : (
          <button
            type="button"
            className={`pdf-date-btn wide receipt-input-link ${isReceiptRoute ? 'is-active' : ''}`}
            onClick={() => {
              setViewerPickerOpen(false)
              setReportPickerOpen(false)
              clearOriginMode()
              writeReceiptReturn('graphs', activeHash || DEFAULT_GRAPH_HASH)
              writeReceiptReturn('pdf', activeHash || DEFAULT_GRAPH_HASH)
              window.location.hash = RECEIPT_HASH
              maybeCloseSidebar()
            }}
          >
            <span className="pdf-date-text">Go</span>
            <span className="caret" aria-hidden>›</span>
          </button>
        )}
      </div>

      <div className="pdf-sidebar-section">
        <div className="pdf-date-title">
          <span className="text-layer text-outline" aria-hidden>
            Invoices
          </span>
          <span className="text-layer text-fill" aria-hidden>
            Invoices
          </span>
        </div>
        {showInvoiceBack ? (
          <button
            type="button"
            className="pdf-date-btn wide is-active"
            onClick={() => {
              setViewerPickerOpen(false)
              setReportPickerOpen(false)
              clearOriginMode()
              const target = invoiceBackTarget
              window.location.hash = target
              maybeCloseSidebar()
            }}
          >
            <span className="pdf-date-text">Back</span>
            <span className="caret" aria-hidden>‹</span>
          </button>
        ) : (
          <button
            type="button"
            className={`pdf-date-btn wide ${isInvoiceRoute ? 'is-active' : ''}`}
            onClick={() => {
              setViewerPickerOpen(false)
              setReportPickerOpen(false)
              clearOriginMode()
              writeInvoiceReturn('graphs', activeHash || DEFAULT_GRAPH_HASH)
              writeInvoiceReturn('pdf', activeHash || DEFAULT_GRAPH_HASH)
              window.location.hash = INVOICE_HASH
              maybeCloseSidebar()
            }}
          >
            <span className="pdf-date-text">Go</span>
            <span className="caret" aria-hidden>›</span>
          </button>
        )}
      </div>
    </>
  )
}
