import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { GraphsSidebarContent } from './GraphsSidebarContent'
import { PdfSidebarContent } from './PdfSidebarContent'
import type { SidebarProps } from './types'

export default function Sidebar(props: SidebarProps) {
  const { sidebarOpen, setSidebarOpen } = props
  const rootRef = useRef<HTMLDivElement | null>(null)
  const contentId = useId()

  const [viewerPickerOpen, setViewerPickerOpen] = useState(false)
  const [reportPickerOpen, setReportPickerOpen] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const closeAllPickers = useCallback(() => {
    setViewerPickerOpen(false)
    setReportPickerOpen(false)
    setDatePickerOpen(false)
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current && !rootRef.current.contains(t)) {
        closeAllPickers()
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [closeAllPickers])

  return (
    <aside className={`pdf-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
      <button
        type="button"
        className="pdf-sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        title={sidebarOpen ? 'Collapse' : 'Expand'}
        aria-expanded={sidebarOpen}
        aria-controls={contentId}
      >
        {sidebarOpen ? '⟨' : '⟩'}
      </button>
      <div className="pdf-sidebar-inner" ref={rootRef} id={contentId}>
        <div className="pdf-sidebar-brand">
          <span className="text-layer text-outline" aria-hidden>
            Viewer
          </span>
          <span className="text-layer text-fill" aria-hidden>
            Viewer
          </span>
        </div>

        {props.mode === 'graphs' ? (
          <GraphsSidebarContent
            {...props}
            viewerPickerOpen={viewerPickerOpen}
            setViewerPickerOpen={setViewerPickerOpen}
            reportPickerOpen={reportPickerOpen}
            setReportPickerOpen={setReportPickerOpen}
          />
        ) : (
          <PdfSidebarContent
            {...props}
            viewerPickerOpen={viewerPickerOpen}
            setViewerPickerOpen={setViewerPickerOpen}
            reportPickerOpen={reportPickerOpen}
            setReportPickerOpen={setReportPickerOpen}
            datePickerOpen={datePickerOpen}
            setDatePickerOpen={setDatePickerOpen}
          />
        )}
      </div>
    </aside>
  )
}
