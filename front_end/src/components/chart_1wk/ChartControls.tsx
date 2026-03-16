import React from 'react'

interface ChartControlsProps {
  grade: 'choice' | 'select' | 'both'
  gradeOpen: boolean
  onGradeToggle: () => void
  onGradeSelect: (grade: 'choice' | 'select' | 'both') => void
  gradeRef: React.RefObject<HTMLDivElement>
  primals: readonly string[]
  primal: string
  primalOpen: boolean
  onPrimalToggle: () => void
  onPrimalSelect: (primal: string) => void
  primalRef: React.RefObject<HTMLDivElement>
  showAm: boolean
  onShowAmChange: (checked: boolean) => void
  showPm: boolean
  onShowPmChange: (checked: boolean) => void
}

export function ChartControls({
  grade,
  gradeOpen,
  onGradeToggle,
  onGradeSelect,
  gradeRef,
  primals,
  primal,
  primalOpen,
  onPrimalToggle,
  onPrimalSelect,
  primalRef,
  showAm,
  onShowAmChange,
  showPm,
  onShowPmChange,
}: ChartControlsProps) {
  return (
    <>
      <div className="chart-controls" ref={gradeRef}>
        <div className="control-group">
          <div className="control-label">Grade</div>
          <button
            type="button"
            className="dropdown-btn"
            aria-haspopup="listbox"
            aria-expanded={gradeOpen}
            onClick={onGradeToggle}
          >
            {grade === 'both' ? 'Both' : grade === 'choice' ? 'Choice' : 'Select'}
            <span className="caret" aria-hidden>▾</span>
          </button>
          {gradeOpen && (
            <div className="dropdown-menu" role="listbox" aria-label="Select grade">
              {(['choice', 'select', 'both'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={grade === value}
                  className={`dropdown-item ${grade === value ? 'is-active' : ''}`}
                  onClick={() => onGradeSelect(value)}
                >
                  {value === 'both' ? 'Both' : value === 'choice' ? 'Choice' : 'Select'}
                </button>
              ))}
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
            onClick={onPrimalToggle}
          >
            {primal}
            <span className="caret" aria-hidden>▾</span>
          </button>
          {primalOpen && (
            <div className="dropdown-menu" role="listbox" aria-label="Select primal">
              {primals.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={primal === p}
                  className={`dropdown-item ${primal === p ? 'is-active' : ''}`}
                  onClick={() => onPrimalSelect(p)}
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
      </div>
    </>
  )
}
