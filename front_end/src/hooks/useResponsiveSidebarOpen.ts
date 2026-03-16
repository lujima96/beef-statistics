import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'

export const DESKTOP_MEDIA_QUERY = '(min-width: 900px)'

function getIsDesktop() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }
  try {
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  } catch {
    return true
  }
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => getIsDesktop())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)

    const handleMatches = (matches: boolean) => {
      setIsDesktop(matches)
    }

    handleMatches(mediaQuery.matches)

    const listener = (event: MediaQueryListEvent) => {
      handleMatches(event.matches)
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }

    mediaQuery.addListener(listener)
    return () => mediaQuery.removeListener(listener)
  }, [])

  return isDesktop
}

export function useResponsiveSidebarOpen(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const manualOverrideRef = useRef(false)
  const [open, setOpenState] = useState<boolean>(() => getIsDesktop())

  const setOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      manualOverrideRef.current = true
      setOpenState(value)
    },
    [setOpenState],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)

    const handleMatches = (matches: boolean) => {
      if (matches) {
        manualOverrideRef.current = false
        setOpenState(true)
      } else if (!manualOverrideRef.current) {
        manualOverrideRef.current = false
        setOpenState(false)
      }
    }

    handleMatches(mediaQuery.matches)

    const listener = (event: MediaQueryListEvent) => {
      handleMatches(event.matches)
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }

    mediaQuery.addListener(listener)
    return () => mediaQuery.removeListener(listener)
  }, [setOpenState])

  return [open, setOpen]
}
