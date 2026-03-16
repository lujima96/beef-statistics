import { RefObject, useEffect, useState } from 'react'

export type ChartSize = { w: number; h: number }

export function useChartDimensions(ref: RefObject<HTMLDivElement | null>): ChartSize {
  const [size, setSize] = useState<ChartSize>({ w: 0, h: 0 })

  useEffect(() => {
    const measure = () => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [ref])

  return size
}
