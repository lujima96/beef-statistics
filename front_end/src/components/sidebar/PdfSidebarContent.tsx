import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { PdfModeProps } from './types'
import {
  isDeliveryHash,
  readReturnHash,
  setOriginMode,
  writeReturnHash,
} from '../../utils/deliveryNav'
import { clearReceiptReturn, hasReceiptReturn, readReceiptReturn, writeReceiptReturn } from '../../utils/receiptNav'
import { clearInvoiceReturn, hasInvoiceReturn, readInvoiceReturn, writeInvoiceReturn } from '../../utils/invoiceNav'

type PdfSidebarContentProps = PdfModeProps & {
  viewerPickerOpen: boolean
  setViewerPickerOpen: Dispatch<SetStateAction<boolean>>
  reportPickerOpen: boolean
  setReportPickerOpen: Dispatch<SetStateAction<boolean>>
  datePickerOpen: boolean
  setDatePickerOpen: Dispatch<SetStateAction<boolean>>
}

const VIEWER_OPTIONS = [
  { key: 'graphs', label: 'Graphs' },
  { key: 'pdfs', label: 'PDFs' },
] as const

const REPORT_OPTIONS = [
  { key: 'boxed', label: 'Weekly Boxed Beef' },
  { key: 'retail', label: 'Weekly Retail Prices' },
] as const

const DEFAULT_RETURN_HASH = '#subprimals'
const RECEIPT_HASH = '#receipt'
const INVOICE_HASH = '#invoice'

function normalizeHash(hash: string): string {
  return (hash || '').replace(/^#/, '').toLowerCase()
}

function isReceiptHashValue(normalized: string): boolean {
  return normalized === 'receipt' || normalized === 'receipt-input'
}

function isInvoiceHashValue(normalized: string): boolean {
  return normalized === 'invoice'
}

export function PdfSidebarContent(props: PdfSidebarContentProps) {
  const {
    setSidebarOpen,
    viewerPickerOpen,
    setViewerPickerOpen,
    reportPickerOpen,
    setReportPickerOpen,
    datePickerOpen,
    setDatePickerOpen,
    onBackToGraphs,
    reportType,
    setReportType,
    reports,
    selectedId,
    setSelectedId,
  } = props
  const initialHash = typeof window !== 'undefined' ? window.location.hash : DEFAULT_RETURN_HASH
  const [currentHash, setCurrentHash] = useState<string>(() => initialHash || DEFAULT_RETURN_HASH)
  const isDeliveryActive = isDeliveryHash(currentHash)
  const normalizedCurrent = normalizeHash(currentHash || DEFAULT_RETURN_HASH)
  const isReceiptRoute = isReceiptHashValue(normalizedCurrent)
  const isInvoiceRoute = isInvoiceHashValue(normalizedCurrent)
  const canReturnFromReceipt = isReceiptRoute && hasReceiptReturn('pdf')
  const canReturnFromInvoice = isInvoiceRoute && hasInvoiceReturn('pdf')
  const invoiceReturnHash = canReturnFromInvoice ? readInvoiceReturn('pdf', DEFAULT_RETURN_HASH) : null
  const invoiceBackTarget = invoiceReturnHash ?? DEFAULT_RETURN_HASH
  const showInvoiceBack = isInvoiceRoute
  const lastHashRef = useRef<string>(normalizeHash(initialHash || DEFAULT_RETURN_HASH))

  const maybeCloseSidebar = () => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(max-width: 900px)').matches) {
        setSidebarOpen(false)
      }
    }
  }

  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash || DEFAULT_RETURN_HASH
      setCurrentHash(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const normalizedCurrent = normalizeHash(currentHash || DEFAULT_RETURN_HASH)
    if (isReceiptHashValue(lastHashRef.current) && !isReceiptHashValue(normalizedCurrent)) {
      clearReceiptReturn('pdf')
    }
    if (isInvoiceHashValue(lastHashRef.current) && !isInvoiceHashValue(normalizedCurrent)) {
      clearInvoiceReturn('pdf')
    }
    lastHashRef.current = normalizedCurrent
  }, [currentHash])

  useEffect(() => {
    if (!isDeliveryActive) {
      const target = currentHash || DEFAULT_RETURN_HASH
      writeReturnHash('pdf', target)
    }
  }, [isDeliveryActive, currentHash])

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
          <span className="pdf-date-text">PDFs</span>
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
                aria-selected={opt.key === 'pdfs'}
                className={`pdf-date-item ${opt.key === 'pdfs' ? 'is-active' : ''}`}
                onClick={() => {
                  setViewerPickerOpen(false)
                  const current = currentHash || DEFAULT_RETURN_HASH
                  if (!isDeliveryActive) writeReturnHash('pdf', current)
                  if (opt.key === 'graphs') {
                    window.location.hash = '#subprimals'
                    onBackToGraphs()
                    maybeCloseSidebar()
                  }
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
          <span className="pdf-date-text">{reportType === 'boxed' ? 'Weekly Boxed Beef' : 'Weekly Retail Prices'}</span>
          <span className="caret" aria-hidden>
            ▾
          </span>
        </button>
        {reportPickerOpen && (
          <div role="listbox" className="pdf-date-menu left">
            {REPORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                role="option"
                aria-selected={reportType === opt.key}
                className={`pdf-date-item ${reportType === opt.key ? 'is-active' : ''}`}
                onClick={() => {
                  setReportPickerOpen(false)
                  if (reportType !== opt.key) setReportType(opt.key)
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
            Report Date
          </span>
          <span className="text-layer text-fill" aria-hidden>
            Report Date
          </span>
        </div>
        <button
          type="button"
          className="pdf-date-btn wide"
          onClick={() => setDatePickerOpen(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={datePickerOpen}
        >
          <span className="pdf-date-text">
            {(() => {
              const cur = reports.find(r => r.id === selectedId)
              return cur ? `${cur.date}` : 'Select Date'
            })()}
          </span>
          <span className="caret" aria-hidden>
            ▾
          </span>
        </button>
        {datePickerOpen && (
          <div role="listbox" className="pdf-date-menu left">
            {reports.map(r => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={selectedId === r.id}
                className={`pdf-date-item ${selectedId === r.id ? 'is-active' : ''}`}
                onClick={() => {
                  setDatePickerOpen(false)
                  if (selectedId !== r.id) setSelectedId(r.id)
                }}
              >
                {r.date}
              </button>
            ))}
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
              setViewerPickerOpen(false)
              setReportPickerOpen(false)
              setDatePickerOpen(false)
              const target = readReturnHash('pdf', DEFAULT_RETURN_HASH)
              window.location.hash = target
              onBackToGraphs()
              maybeCloseSidebar()
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
              setDatePickerOpen(false)
              const target = currentHash || DEFAULT_RETURN_HASH
              writeReturnHash('pdf', target)
              setOriginMode('pdf')
              window.location.hash = '#delivery'
              onBackToGraphs()
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
            className="pdf-date-btn wide receipt-input-link is-active"
            onClick={() => {
              setViewerPickerOpen(false)
              setReportPickerOpen(false)
              setDatePickerOpen(false)
              const target = readReceiptReturn('pdf', DEFAULT_RETURN_HASH)
              window.location.hash = target
              onBackToGraphs()
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
              setDatePickerOpen(false)
              writeReceiptReturn('graphs', currentHash || DEFAULT_RETURN_HASH)
              writeReceiptReturn('pdf', currentHash || DEFAULT_RETURN_HASH)
              window.location.hash = RECEIPT_HASH
              onBackToGraphs()
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
              setDatePickerOpen(false)
              const target = invoiceBackTarget
              window.location.hash = target
              onBackToGraphs()
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
              setDatePickerOpen(false)
              writeInvoiceReturn('graphs', currentHash || DEFAULT_RETURN_HASH)
              writeInvoiceReturn('pdf', currentHash || DEFAULT_RETURN_HASH)
              window.location.hash = INVOICE_HASH
              onBackToGraphs()
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
