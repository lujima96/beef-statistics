import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Dispatcher from '@/stores/Dispatcher'
import { ClearPoints, ClearRoute, SetQueryPoints } from '@/actions/Actions'
import { QueryPoint, QueryPointType } from '@/stores/QueryStore'
import PlainButton from '@/PlainButton'
import styles from './RouteSelector.module.css'
import config from 'config'

type RouteStop = {
    id: number | null
    label: string
    latitude: number
    longitude: number
    isDepot: boolean
    sequence: number
}

type RouteOption = {
    id: number
    name: string
    stops: RouteStop[]
}

export default function RouteSelector() {
    const [routes, setRoutes] = useState<RouteOption[]>([])
    const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null)
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const abortRef = useRef<AbortController | null>(null)

    const apiBase = useMemo(() => {
        if (typeof config.beefApiBase === 'string' && config.beefApiBase.length > 0) {
            return config.beefApiBase.replace(/\/$/, '')
        }
        return ''
    }, [])

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => {
            document.removeEventListener('mousedown', handleClick)
        }
    }, [])

    const loadRoutes = useCallback(async () => {
        if (!apiBase) {
            setErrorMessage('Configure BEEF_STATS_API_BASE to preview saved delivery routes.')
            setRoutes([])
            setSelectedRouteId(null)
            return
        }
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        setLoading(true)
        try {
            const response = await fetch(`${apiBase}/delivery-estimator/routes`, {
                signal: controller.signal,
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const payload = (await response.json()) as unknown
            if (!Array.isArray(payload)) return
            const parsed: RouteOption[] = payload
                .map(item => {
                    if (typeof item !== 'object' || item === null) return null
                    const id = Number((item as any).id)
                    if (!Number.isFinite(id) || id <= 0) return null
                    const name = typeof (item as any).name === 'string' ? (item as any).name : `Route ${id}`
                    const rawStops = Array.isArray((item as any).stops) ? ((item as any).stops as any[]) : []
                    const stops: RouteStop[] = rawStops
                        .map((stop, index) => {
                            if (typeof stop !== 'object' || stop === null) return null
                            const latitude = Number((stop as any).latitude)
                            const longitude = Number((stop as any).longitude)
                            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
                            return {
                                id:
                                    (stop as any).id === null || (stop as any).id === undefined
                                        ? null
                                        : Number((stop as any).id),
                                label:
                                    typeof (stop as any).label === 'string' ? (stop as any).label : `Stop ${index + 1}`,
                                latitude,
                                longitude,
                                isDepot: Boolean((stop as any).isDepot),
                                sequence: Number.isFinite(Number((stop as any).sequence))
                                    ? Number((stop as any).sequence)
                                    : index,
                            }
                        })
                        .filter((stop): stop is RouteStop => stop !== null)
                        .sort((a, b) => a.sequence - b.sequence)
                    if (stops.length < 2) return null
                    return { id, name, stops }
                })
                .filter((route): route is RouteOption => route !== null)
                .sort((a, b) => a.name.localeCompare(b.name))
            setRoutes(parsed)
            setErrorMessage(null)
            if (parsed.length === 0) {
                setSelectedRouteId(null)
            } else if (selectedRouteId !== null && !parsed.some(route => route.id === selectedRouteId)) {
                setSelectedRouteId(null)
            }
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                console.warn('Failed to load delivery routes', error)
                const friendlyMessage =
                    error instanceof TypeError
                        ? 'Unable to reach the Beef Stats API. Check that the backend on port 8000 is running.'
                        : `Unable to load delivery routes (${error instanceof Error ? error.message : 'Unknown error'}).`
                setErrorMessage(friendlyMessage)
            }
        } finally {
            setLoading(false)
        }
    }, [apiBase, selectedRouteId])

    useEffect(() => {
        void loadRoutes()
        return () => {
            abortRef.current?.abort()
        }
    }, [loadRoutes])

    const selectedRoute = routes.find(route => route.id === selectedRouteId)
    const label = errorMessage
        ? 'Routes unavailable'
        : selectedRoute
        ? selectedRoute.name
        : loading
        ? 'Loading routes…'
        : routes.length > 0
        ? 'View Route'
        : 'No routes available'

    function handleSelect(option: RouteOption) {
        setSelectedRouteId(option.id)
        setOpen(false)
        if (option.stops.length < 2) return
        const queryPoints: QueryPoint[] = option.stops.map((stop, index) => ({
            coordinate: { lat: stop.latitude, lng: stop.longitude },
            queryText: stop.label,
            isInitialized: true,
            color: '',
            id: index,
            type: QueryPointType.Via,
        }))
        Dispatcher.dispatch(new ClearRoute())
        Dispatcher.dispatch(new ClearPoints())
        Dispatcher.dispatch(new SetQueryPoints(queryPoints))
    }

    return (
        <div ref={containerRef} className={styles.container}>
            <PlainButton
                className={styles.trigger}
                onClick={() => {
                    if (routes.length === 0 && !loading) {
                        void loadRoutes()
                    }
                    setOpen(current => {
                        const next = !current
                        if (next) {
                            void loadRoutes()
                        }
                        return next
                    })
                }}
                disabled={loading && routes.length === 0}
            >
                <span className={styles.triggerLabel}>{label}</span>
                <span aria-hidden className={styles.caret}>
                    ▾
                </span>
            </PlainButton>
            {errorMessage && (
                <p className={styles.statusMessage} role="status" aria-live="polite">
                    {errorMessage}
                </p>
            )}
            {open && routes.length > 0 && (
                <div className={styles.menu} role="listbox" aria-label="Select a delivery route to preview on map">
                    {routes.map(option => (
                        <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={option.id === selectedRouteId}
                            className={`${styles.menuOption}${
                                option.id === selectedRouteId ? ' ' + styles.menuOptionActive : ''
                            }`}
                            onClick={() => handleSelect(option)}
                        >
                            {option.name}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={styles.refreshOption}
                        onClick={() => {
                            void loadRoutes()
                        }}
                    >
                        Refresh routes
                    </button>
                </div>
            )}
        </div>
    )
}
