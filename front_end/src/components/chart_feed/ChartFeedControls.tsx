import React, { useEffect, useMemo, useRef, useState } from 'react'

import {
  CORN_CASH_PRICES_FEED_ID,
  FEED_CATEGORIES,
  FEED_PRICE_RATIOS_TABLE_NAME,
  feedLabelFromId,
} from './feedCategories'
import { attributeLabelFromId, resolveAttributeConfig } from './attributes'
import { ALL_COMMODITY_IDS, commodityLabelFromId, resolveCommodityOptions } from './commodities'
import { resolveCornCashGeographyOptions } from './cornCash'

export {
  CORN_ACREAGE_PRODUCTION_TABLE_NAME,
  CORN_CASH_PRICES_FEED_ID,
  CORN_SORGHUM_PRICES_FEED_ID,
  CORN_SORGHUM_PRICES_TABLE_NAME,
  FEED_PRICE_RATIOS_TABLE_NAME,
  HAY_PRICES_TABLE_NAME,
  FEED_CATEGORIES,
  FEED_REPORT_DEFAULT,
  feedLabelFromId,
  feedTableNameFromId,
} from './feedCategories'
export {
  ATTRIBUTE_DEFAULT,
  attributeApiValueFromId,
  attributeFrequencyFromId,
  attributeLabelFromId,
  attributeGeographyFromId,
  attributeTimeperiodFromId,
  feedAttributeColorFromApiValue,
  feedAttributeColorFromId,
  foreignCoarseGrainColorFromApiValue,
  foreignCoarseGrainColorFromId,
  resolveAttributeConfig,
  CORN_SORGHUM_PRICES_ATTRIBUTE,
  FEED_PRICE_RATIOS_ATTRIBUTE,
  CORN_CASH_PRICES_GEOGRAPHY_OPTIONS,
} from './attributes'
export {
  ALL_COMMODITY_IDS,
  commodityApiValueFromId,
  commodityColorFromId,
  commodityIdFromApiValue,
  commodityLabelFromId,
  CORN_CASH_WHITE_CORN_COMMODITY_ID,
  CORN_CASH_YELLOW_CORN_COMMODITY_ID,
} from './commodities'
export {
  cornCashGeographyColorFromApiValue,
  cornCashGeographyColorFromId,
  resolveCornCashGeographyOptions,
} from './cornCash'

type Props = {
  selectedId: string
  onSelect: (id: string) => void
  attributeIds: string[]
  onSelectAttributes: (ids: string[]) => void
  commodityIds: string[]
  onToggleCommodity: (id: string, nextSelected: boolean) => void
  commodityOptionIds?: string[]
}

export default function ChartFeedControls({
  selectedId,
  onSelect,
  attributeIds,
  onSelectAttributes,
  commodityIds,
  onToggleCommodity,
  commodityOptionIds,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [attributeOpen, setAttributeOpen] = useState(false)
  const [commodityOpen, setCommodityOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target)) {
        setMenuOpen(false)
        setOpenCategory(null)
        setAttributeOpen(false)
        setCommodityOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const selectedLabel = useMemo(() => feedLabelFromId(selectedId), [selectedId])
  const attributeConfig = useMemo(() => resolveAttributeConfig(selectedId), [selectedId])
  const resolvedAttributeOptions = useMemo(() => {
    if (selectedId === CORN_CASH_PRICES_FEED_ID) {
      return resolveCornCashGeographyOptions(commodityIds)
    }
    return attributeConfig.options
  }, [attributeConfig.options, commodityIds, selectedId])

  const attributeLabel = useMemo(() => {
    if (attributeConfig.multi) {
      if (attributeIds.length === 0) return attributeConfig.emptyLabel
      if (attributeIds.length === 1) return attributeLabelFromId(attributeIds[0], selectedId)
      return `${attributeIds.length} selected`
    }
    if (!attributeIds.length) return attributeConfig.emptyLabel
    return attributeLabelFromId(attributeIds[0], selectedId)
  }, [attributeConfig.emptyLabel, attributeConfig.multi, attributeIds, selectedId])

  const availableCommodityOptions = useMemo(() => {
    const allowedIds = commodityOptionIds && commodityOptionIds.length > 0
      ? new Set(commodityOptionIds)
      : new Set(ALL_COMMODITY_IDS)
    return resolveCommodityOptions(allowedIds)
  }, [commodityOptionIds])

  const commodityLabel = useMemo(() => {
    if (!commodityIds.length) return 'Select commodities'
    const allowedIds = new Set(availableCommodityOptions.map((option) => option.id))
    const selected = commodityIds.filter((id) => allowedIds.has(id))
    if (selected.length === 0) return 'Select commodities'
    if (selected.length <= 2) {
      return selected.map((id) => commodityLabelFromId(id)).join(', ')
    }
    if (selected.length === availableCommodityOptions.length) return 'All selected'
    return `${selected.length} selected`
  }, [commodityIds, availableCommodityOptions])

  useEffect(() => {
    if (!attributeConfig.showCommoditySelector) {
      setCommodityOpen(false)
    }
  }, [attributeConfig.showCommoditySelector])

  return (
    <div className="chart-controls" ref={ref}>
      <div className="control-group feed-report-control">
        <div className="control-label">Feed Report</div>
        <button
          type="button"
          className="dropdown-btn dropdown-btn-feed"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((v) => !v)
            if (!menuOpen) setOpenCategory(null)
            setAttributeOpen(false)
            setCommodityOpen(false)
          }}
        >
          <span className="dropdown-btn-label">{selectedLabel}</span>
          <span className="caret" aria-hidden>▾</span>
        </button>
        {menuOpen && (
          <div className="dropdown-menu dropdown-nested" role="listbox" aria-label="Select feed report">
            {FEED_CATEGORIES.map((category) => {
              const isOpen = openCategory === category.id
              return (
                <div key={category.id} className="dropdown-nested-group">
                  <button
                    type="button"
                    className={`dropdown-item nested-toggle ${isOpen ? 'is-open' : ''}`}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setOpenCategory((current) => (current === category.id ? null : category.id))
                    }}
                  >
                    {category.title}
                  </button>
                  {isOpen && (
                    <div className="dropdown-nested-menu" role="listbox">
                      {category.options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          role="option"
                          aria-selected={selectedId === option.id}
                          className={`dropdown-item ${selectedId === option.id ? 'is-active' : ''}`}
                          onClick={() => {
                            onSelect(option.id)
                            setMenuOpen(false)
                            setOpenCategory(null)
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {attributeConfig.showAttributeSelector && (
        <div className="control-group attribute-control">
          <div className="control-label">{attributeConfig.controlLabel}</div>
          <button
            type="button"
            className="dropdown-btn dropdown-btn-attribute"
            aria-haspopup="listbox"
            aria-expanded={attributeOpen}
            onClick={() => {
              setAttributeOpen((v) => !v)
              setMenuOpen(false)
              setOpenCategory(null)
              setCommodityOpen(false)
            }}
          >
            <span className="dropdown-btn-label">{attributeLabel}</span>
            <span className="caret" aria-hidden>▾</span>
          </button>
          {attributeOpen && (
            <div
              className="dropdown-menu"
              role="listbox"
              aria-label="Select feed attribute"
              aria-multiselectable={attributeConfig.multi || undefined}
            >
              {resolvedAttributeOptions.map((option) => {
                const isSelected = attributeIds.includes(option.id)
                if (attributeConfig.multi) {
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`dropdown-item checkbox-option ${isSelected ? 'is-active' : ''}`}
                      onClick={() => {
                        const nextSelected = new Set(attributeIds)
                        if (isSelected) {
                          nextSelected.delete(option.id)
                        } else {
                          nextSelected.add(option.id)
                        }
                        const ordered = resolvedAttributeOptions
                          .map((opt) => (nextSelected.has(opt.id) ? opt.id : null))
                          .filter((id): id is string => Boolean(id))
                        onSelectAttributes(ordered)
                      }}
                    >
                      <input type="checkbox" checked={isSelected} readOnly />
                      <span>{option.label}</span>
                    </button>
                  )
                }

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={attributeIds[0] === option.id}
                    className={`dropdown-item ${attributeIds[0] === option.id ? 'is-active' : ''}`}
                    onClick={() => {
                      onSelectAttributes([option.id])
                      setAttributeOpen(false)
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {attributeConfig.showCommoditySelector && (
        <div className="control-group commodity-control">
          <div className="control-label">Commodity</div>
          <button
            type="button"
            className="dropdown-btn dropdown-btn-commodity"
            aria-haspopup="listbox"
            aria-expanded={commodityOpen}
            onClick={() => {
              setCommodityOpen((v) => !v)
              setMenuOpen(false)
              setOpenCategory(null)
              setAttributeOpen(false)
            }}
          >
            <span className="dropdown-btn-label">{commodityLabel}</span>
            <span className="caret" aria-hidden>▾</span>
          </button>
          {commodityOpen && (
            <div
              className="dropdown-menu dropdown-scroll"
              role="listbox"
              aria-label="Select commodities"
            >
              {availableCommodityOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={commodityIds.includes(option.id)}
                  className={`dropdown-item checkbox-option ${commodityIds.includes(option.id) ? 'is-active' : ''}`}
                  onClick={() => {
                    const isSelected = commodityIds.includes(option.id)
                    onToggleCommodity(option.id, !isSelected)
                  }}
                >
                  <input type="checkbox" checked={commodityIds.includes(option.id)} readOnly />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
