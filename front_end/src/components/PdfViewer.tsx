import React, { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar'
import { useResponsiveSidebarOpen } from '../hooks/useResponsiveSidebarOpen'

export default function PdfViewer(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reports, setReports] = useState<Array<{ id: number | string; date: string }>>([])
  const [selectedId, setSelectedId] = useState<number | string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebarOpen()
  const [reportPickerOpen, setReportPickerOpen] = useState(false)
  const [reportType, setReportType] = useState<'boxed'|'retail'>(() => 'boxed')

  useEffect(() => {
    let revoked = false
    let currentUrl: string | null = null
    async function loadListAndMaybePdf() {
      setLoading(true)
      setError(null)
      try {
        const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000'
        let listUrl: string
        if (reportType === 'boxed') listUrl = `${API_BASE}/api/weekly-boxed-beef/reports?limit=1000`
        else listUrl = `${API_BASE}/api/weekly-retail/reports?limit=1000`
        const resList = await fetch(listUrl)
        if (!resList.ok) throw new Error(`List ${resList.status}`)
        const body = await resList.json()
        const list = Array.isArray(body?.reports) ? body.reports as any[] : []
        const mapped = list.map((r: any) => (
          reportType === 'boxed'
            ? { id: Number(r?.id), date: String(r?.report_date ?? '') }
            : { id: Number(r?.id), date: String(r?.report_date ?? '') }
        ))
        if (!revoked) setReports(mapped)
        const id = (selectedId != null) ? selectedId : (mapped[0]?.id ?? null)
        if (id == null) throw new Error('No reports found')
        if (!revoked) setSelectedId(id)
        const fileUrl = reportType === 'boxed'
          ? `${API_BASE}/api/weekly-boxed-beef/file?id=${encodeURIComponent(String(id))}`
          : `${API_BASE}/api/weekly-retail/file?id=${encodeURIComponent(String(id))}`
        const resFile = await fetch(fileUrl)
        if (!resFile.ok) throw new Error(`File ${resFile.status}`)
        const blob = await resFile.blob()
        currentUrl = URL.createObjectURL(blob)
        if (!revoked) setBlobUrl(currentUrl)
      } catch (e: any) {
        if (!revoked) setError(e?.message || 'Failed to load PDF')
      } finally {
        if (!revoked) setLoading(false)
      }
    }
    if (open) loadListAndMaybePdf()
    return () => {
      revoked = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      setBlobUrl(null)
      setLoading(false)
      setError(null)
    }
  }, [open, reportType])

  // Close picker on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current && !wrapRef.current.contains(t)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // No custom zoom handling; rely on browser's built-in PDF viewer controls

  if (!open) return null

  return (
    <div className="pdf-dock" role="region" aria-label="PDF Viewer Dock">
      <div className="pdf-dock-body">
        <div className={`pdf-layout ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
          <Sidebar
            mode="pdf"
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            onBackToGraphs={onClose}
            reportType={reportType}
            setReportType={(t) => {
              setSelectedId(null)
              setReports([])
              setReportType(t)
            }}
            reports={reports}
            selectedId={selectedId}
            setSelectedId={async (id) => {
              if (selectedId === id) return
              setSelectedId(id)
              setLoading(true)
              setError(null)
              try {
                const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000'
                const fileUrl = reportType === 'boxed'
                  ? `${API_BASE}/api/weekly-boxed-beef/file?id=${encodeURIComponent(String(id))}`
                  : `${API_BASE}/api/weekly-retail/file?id=${encodeURIComponent(String(id))}`
                const resFile = await fetch(fileUrl)
                if (!resFile.ok) throw new Error(`File ${resFile.status}`)
                const blob = await resFile.blob()
                const url = URL.createObjectURL(blob)
                if (blobUrl) URL.revokeObjectURL(blobUrl)
                setBlobUrl(url)
              } catch (e: any) {
                setError(e?.message || 'Failed to load PDF')
              } finally {
                setLoading(false)
              }
            }}
          />
          <main className="pdf-content">
            {loading && <div className="pdf-loading">Loading…</div>}
            {error && <div className="pdf-error">{error}</div>}
            {!loading && !error && blobUrl && (
              <div className="pdf-inner">
                <object data={blobUrl} type="application/pdf" className="pdf-frame" aria-label="PDF document">
                  <iframe title="PDF" src={blobUrl} className="pdf-frame" />
                </object>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
