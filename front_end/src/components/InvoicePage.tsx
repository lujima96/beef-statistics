import React, { useEffect, useRef, useState } from 'react'

import Sidebar from './Sidebar'
import PdfViewer from './PdfViewer'
import { useIsDesktop, useResponsiveSidebarOpen } from '../hooks/useResponsiveSidebarOpen'

export default function InvoicePage() {
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebarOpen()
  const [pdfOpen, setPdfOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const onFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setPdfError('Please choose a PDF file.')
      setPdfUrl(null)
      setPdfName(null)
      return
    }
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    const nextUrl = URL.createObjectURL(file)
    setPdfUrl(nextUrl)
    setPdfName(file.name)
    setPdfError(null)
  }

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  if (!isDesktop && pdfOpen) {
    return <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
  }

  return (
    <div className={`pdf-layout chart-with-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
      <Sidebar
        mode="graphs"
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onOpenViewer={() => setPdfOpen(true)}
      />
      <main className="pdf-content">
        <section className="chart-card invoice-card" aria-label="Invoices">
          <div className="invoice-card__header">
            <div className="invoice-card__title">Invoice Processing</div>
          </div>

          <div className="invoice-workbench">
            <div className="invoice-actions" aria-label="Invoice actions">
              <button type="button" className="invoice-action-btn" onClick={openFilePicker}>Select File</button>
              <button type="button" className="invoice-action-btn">Entries</button>
              <button type="button" className="invoice-action-btn">Analytics</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                aria-label="Select invoice PDF"
                onChange={onFileSelected}
              />
            </div>

            <div className="invoice-viewer-shell" aria-label="Embedded PDF viewer placeholder">
              {pdfUrl ? (
                <div className="invoice-viewer">
                  <object
                    data={pdfUrl}
                    type="application/pdf"
                    className="invoice-viewer-embed"
                  >
                    <p>Unable to display PDF. <a href={pdfUrl} download={pdfName ?? 'invoice.pdf'}>Download</a></p>
                  </object>
                </div>
              ) : (
                <div className="invoice-viewer-placeholder">
                  PDF viewer placeholder
                </div>
              )}
              {pdfError && <p className="invoice-viewer-error">{pdfError}</p>}
            </div>
          </div>
        </section>
      </main>
      <PdfViewer open={pdfOpen} onClose={() => setPdfOpen(false)} />
    </div>
  )
}
