import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'
import type { CSSProperties } from 'react'

type HorizontalAlign = 'start' | 'end'

type DropdownPositionOptions = {
  offset?: number
  align?: HorizontalAlign
  minViewportMargin?: number
  fallbackWidth?: number
  matchTriggerWidth?: boolean
}

const DEFAULT_MARGIN = 12
const DEFAULT_OFFSET = 10

export function useDropdownPosition<TElement extends HTMLElement>(
  triggerRef: RefObject<TElement>,
  menuRef: RefObject<HTMLElement>,
  open: boolean,
  options?: DropdownPositionOptions,
): CSSProperties | undefined {
  const {
    offset = DEFAULT_OFFSET,
    align = 'start',
    minViewportMargin = DEFAULT_MARGIN,
    fallbackWidth,
    matchTriggerWidth = true,
  } = options ?? {}
  const [style, setStyle] = useState<CSSProperties>()

  const updatePosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!open || !trigger || !menu) {
      return
    }

    const rect = trigger.getBoundingClientRect()
    const measuredWidth = menu.offsetWidth || fallbackWidth || rect.width || 0
    const measuredHeight = menu.offsetHeight || menu.scrollHeight || 0

    let left = align === 'end' ? rect.right - measuredWidth : rect.left
    let top = rect.bottom + offset

    const maxLeft = window.innerWidth - measuredWidth - minViewportMargin
    const minLeft = minViewportMargin

    if (measuredWidth > 0) {
      if (left < minLeft) {
        left = minLeft
      } else if (left > maxLeft) {
        left = Math.max(minLeft, maxLeft)
      }
    }

    const availableAbove = rect.top - offset - measuredHeight
    const maxTop = window.innerHeight - measuredHeight - minViewportMargin
    if (top > maxTop && availableAbove > minViewportMargin) {
      top = Math.max(minViewportMargin, availableAbove)
    } else if (measuredHeight > 0) {
      top = Math.min(top, Math.max(minViewportMargin, window.innerHeight - measuredHeight - minViewportMargin))
    }

    const constrainedWidth = matchTriggerWidth
      ? Math.max(rect.width, fallbackWidth ?? 0)
      : undefined

    setStyle({
      position: 'fixed',
      top,
      left,
      right: 'auto',
      bottom: 'auto',
      minWidth: constrainedWidth && constrainedWidth > 0 ? constrainedWidth : undefined,
      zIndex: 50,
    })
  }, [align, fallbackWidth, matchTriggerWidth, minViewportMargin, offset, open, triggerRef, menuRef])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined)
      return
    }
    if (typeof window === 'undefined') {
      return
    }

    updatePosition()
    const raf = window.requestAnimationFrame(updatePosition)
    const handleReposition = () => updatePosition()

    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    const menu = menuRef.current
    let resizeObserver: ResizeObserver | undefined
    if (menu && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updatePosition())
      resizeObserver.observe(menu)
    }

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
      resizeObserver?.disconnect()
    }
  }, [menuRef, open, updatePosition])

  return style
}
