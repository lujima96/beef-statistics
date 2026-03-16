import React from 'react'
import ReportTypeSelector, { ReportType } from '../ReportTypeSelector'
import { Range } from './types'

export type ChartControlsProps = {
  reportType: ReportType
  onReportTypeChange: (next: ReportType) => void
  grade: 'choice' | 'select'
  onGradeToggle: () => void
  onGradeChange: (grade: 'choice' | 'select') => void
  gradeOpen: boolean
  gradeRef: React.MutableRefObject<HTMLDivElement | null>
  showSupply: boolean
  onToggleSupply: (value: boolean) => void
  showDemand: boolean
  onToggleDemand: (value: boolean) => void
}

export function ChartControls(props: ChartControlsProps) {
  const {
    reportType,
    onReportTypeChange,
    grade,
    onGradeToggle,
    onGradeChange,
    gradeOpen,
    gradeRef,
    showSupply,
    onToggleSupply,
    showDemand,
    onToggleDemand,
  } = props

  return (
    <>
      <ReportTypeSelector value={reportType} onChange={onReportTypeChange} />

      <div className="chart-controls-mid" ref={(node) => (gradeRef.current = node)}>
        <div className="control-group">
          <div className="control-label">Grade</div>
          <button
            type="button"
            className="dropdown-btn"
            aria-haspopup="listbox"
            aria-expanded={gradeOpen}
            onClick={onGradeToggle}
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
                onClick={() => onGradeChange('choice')}
              >
                Choice
              </button>
              <button
                type="button"
                role="option"
                aria-selected={grade === 'select'}
                className={`dropdown-item ${grade === 'select' ? 'is-active' : ''}`}
                onClick={() => onGradeChange('select')}
              >
                Select
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="chart-controls-center">
        <div className="control-group check-group">
          <div className="control-label">Supply</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showSupply}
              onChange={(event) => onToggleSupply(event.target.checked)}
            />
          </label>
        </div>
        <div className="control-group check-group">
          <div className="control-label">Demand</div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="check-input"
              checked={showDemand}
              onChange={(event) => onToggleDemand(event.target.checked)}
            />
          </label>
        </div>
      </div>
    </>
  )
}

export function RangeSelector(props: {
  ranges: Range[]
  activeRange: Range
  onSelect: (range: Range) => void
}) {
  const { ranges, activeRange, onSelect } = props
  return (
    <div className="chart-ranges" role="group" aria-label="Range Selector">
      {ranges.map((label) => (
        <button
          key={label}
          type="button"
          className={`range-btn ${activeRange === label ? 'is-active' : ''}`}
          aria-pressed={activeRange === label}
          onClick={() => onSelect(label)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
