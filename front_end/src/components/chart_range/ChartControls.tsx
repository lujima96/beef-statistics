import React, { useRef, useState } from 'react'
import ReportTypeSelector, { ReportType } from '../ReportTypeSelector'
import { useDropdownClose } from './ChartRangeHooks'

type Grade = 'choice' | 'select'
type Primal = 'Rib' | 'Chuck' | 'Round' | 'Loin' | 'Brisket' | 'Short Plate' | 'Flank'

interface ChartControlsProps {
  grade: Grade
  onGradeChange: (grade: Grade) => void
  primal: Primal
  onPrimalChange: (primal: Primal) => void
  reportType: ReportType
  onReportTypeChange: (reportType: ReportType) => void
  showAm: boolean
  onShowAmChange: (show: boolean) => void
  showPm: boolean
  onShowPmChange: (show: boolean) => void
  showDiesel: boolean
  onShowDieselChange: (show: boolean) => void
}

const PRIMALS: Primal[] = ['Rib', 'Chuck', 'Round', 'Loin', 'Brisket', 'Short Plate', 'Flank']

export default function ChartControls(props: ChartControlsProps) {
  const { grade, onGradeChange, primal, onPrimalChange, reportType, onReportTypeChange, showAm, onShowAmChange, showPm, onShowPmChange, showDiesel, onShowDieselChange } = props

  const [gradeOpen, setGradeOpen] = useState(false)
  const [primalOpen, setPrimalOpen] = useState(false)
  const gradeRef = useRef<HTMLDivElement | null>(null)
  const primalRef = useRef<HTMLDivElement | null>(null)

  useDropdownClose(gradeRef, primalRef, setGradeOpen, setPrimalOpen)

  return (
    <>
      <ReportTypeSelector
        value={reportType}
        onChange={(next) => {
          onReportTypeChange(next)
        }}
      />

      <div className="chart-controls-mid" ref={gradeRef}>
        <div className="control-group">
          <div className="control-label">Grade</div>
          <button
            type="button"
            className="dropdown-btn"
            aria-haspopup="listbox"
            aria-expanded={gradeOpen}
            onClick={() => setGradeOpen((v) => !v)}
          >
            {grade === 'choice' ? 'Choice' : 'Select'}
            <span className="caret" aria-hidden>
              ▾
            </span>
          </button>
          {gradeOpen && (
            <div className="dropdown-menu" role="listbox" aria-label="Select grade">
              <button
                type="button"
                role="option"
                aria-selected={grade === 'choice'}
                className={`dropdown-item ${grade === 'choice' ? 'is-active' : ''}`}
                onClick={() => {
                  onGradeChange('choice')
                  setGradeOpen(false)
                }}
              >
                Choice
              </button>
              <button
                type="button"
                role="option"
                aria-selected={grade === 'select'}
                className={`dropdown-item ${grade === 'select' ? 'is-active' : ''}`}
                onClick={() => {
                  onGradeChange('select')
                  setGradeOpen(false)
                }}
              >
                Select
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="chart-controls-right" ref={primalRef}>
        <div className="control-group">
          <div className="control-label">Primal</div>
          <button
            type="button"
            className="dropdown-btn wide"
            aria-haspopup="listbox"
            aria-expanded={primalOpen}
            onClick={() => setPrimalOpen((v) => !v)}
          >
            {primal}
            <span className="caret" aria-hidden>
              ▾
            </span>
          </button>
          {primalOpen && (
            <div className="dropdown-menu" role="listbox" aria-label="Select primal">
              {PRIMALS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={primal === p}
                  className={`dropdown-item ${primal === p ? 'is-active' : ''}`}
                  onClick={() => {
                    onPrimalChange(p)
                    setPrimalOpen(false)
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="chart-controls-center">
        <div className="control-group check-group">
          <div className="control-label">AM</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showAm}
              onChange={(e) => onShowAmChange(e.target.checked)}
            />
          </label>
        </div>
        <div className="control-group check-group">
          <div className="control-label">PM</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showPm}
              onChange={(e) => onShowPmChange(e.target.checked)}
            />
          </label>
        </div>
        <div className="control-group check-group diesel-toggle">
          <div className="control-label">Diesel</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showDiesel}
              onChange={(e) => onShowDieselChange(e.target.checked)}
            />
          </label>
        </div>
      </div>
    </>
  )
}
