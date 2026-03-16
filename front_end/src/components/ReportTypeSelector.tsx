import React, { useEffect, useRef, useState } from 'react'

export type ReportType = 'Sub Primals' | 'Cattle Price' | '5 Day AVG'

export default function ReportTypeSelector(props: { value: ReportType; onChange: (v: ReportType) => void }) {
  const { value, onChange } = props
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const options: ReportType[] = ['Sub Primals', 'Cattle Price', '5 Day AVG']

  return (
    <div className="chart-controls" ref={ref}>
      <div className="control-group">
        <div className="control-label">Report Type</div>
        <button type="button" className="dropdown-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          {value}
          <span className="caret" aria-hidden>▾</span>
        </button>
        {open && (
          <div className="dropdown-menu" role="listbox" aria-label="Select report type">
            {options.map(opt => (
              <button key={opt} type="button" role="option" aria-selected={value === opt} className={`dropdown-item ${value === opt ? 'is-active' : ''}`} onClick={() => { onChange(opt); setOpen(false) }}>{opt}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
