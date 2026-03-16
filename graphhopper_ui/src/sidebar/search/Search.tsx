import { useEffect, useState } from 'react'
import Dispatcher from '@/stores/Dispatcher'
import styles from '@/sidebar/search/Search.module.css'
import { QueryPoint } from '@/stores/QueryStore'
import {
    AddPoint,
    ClearRoute,
    InvalidatePoint,
    MovePoint,
    RemovePoint,
    SetBBox,
    SetPoint,
    StopSyncCurrentLocation,
} from '@/actions/Actions'
import RemoveIcon from './minus-circle-solid.svg'
import AddIcon from './plus-circle-solid.svg'
import TargetIcon from './send.svg'
import PlainButton from '@/PlainButton'
import { Map } from 'ol'

import AddressInput, { type VendorOption } from '@/sidebar/search/AddressInput'
import { MarkerComponent } from '@/map/Marker'
import { tr } from '@/translation/Translation'
import SettingsBox from '@/sidebar/SettingsBox'
import { RoutingProfile } from '@/api/graphhopper'
import { getBBoxFromCoord } from '@/utils'
import config from 'config'

export default function Search({ points, profile, map }: { points: QueryPoint[]; profile: RoutingProfile; map: Map }) {
    const [showSettings, setShowSettings] = useState(false)
    const [showTargetIcons, setShowTargetIcons] = useState(true)
    const [moveStartIndex, onMoveStartSelect] = useState(-1)
    const [dropPreviewIndex, onDropPreviewSelect] = useState(-1)
    const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([])
    const [vendorError, setVendorError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()

        async function loadVendors() {
            const base = typeof config.beefApiBase === 'string' ? config.beefApiBase.replace(/\/$/, '') : ''
            if (!base) {
                if (!cancelled) {
                    setVendorError('Configure BEEF_STATS_API_BASE to load delivery vendor shortcuts.')
                }
                return
            }
            try {
                const response = await fetch(`${base}/delivery-estimator/state`, { signal: controller.signal })
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const payload = await response.json()
                const rawVendors: any[] = Array.isArray(payload?.vendors) ? payload.vendors : []
                const mapped: VendorOption[] = rawVendors
                    .map(vendor => ({
                        id: vendor?.id ?? 0,
                        name: typeof vendor?.locationName === 'string' ? vendor.locationName : `Vendor ${vendor?.id ?? ''}`,
                        address: typeof vendor?.address === 'string' ? vendor.address : '',
                        latitude:
                            typeof vendor?.latitude === 'number'
                                ? vendor.latitude
                                : vendor?.latitude
                                ? Number(vendor.latitude)
                                : NaN,
                        longitude:
                            typeof vendor?.longitude === 'number'
                                ? vendor.longitude
                                : vendor?.longitude
                                ? Number(vendor.longitude)
                                : NaN,
                    }))
                    .filter(
                        vendor =>
                            typeof vendor.latitude === 'number' &&
                            typeof vendor.longitude === 'number' &&
                            !Number.isNaN(vendor.latitude) &&
                            !Number.isNaN(vendor.longitude),
                    )
                    .sort((a, b) => a.name.localeCompare(b.name))
                if (!cancelled) {
                    setVendorOptions(mapped)
                    setVendorError(null)
                }
            } catch (error) {
                if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
                    console.warn('Failed to load delivery vendors', error)
                    const friendlyMessage =
                        error instanceof TypeError
                            ? 'Unable to reach the Beef Stats API. Delivery vendor shortcuts will be unavailable.'
                            : `Failed to load delivery vendors (${error instanceof Error ? error.message : 'Unknown error'}).`
                    setVendorError(friendlyMessage)
                }
            }
        }

        loadVendors()

        return () => {
            cancelled = true
            controller.abort()
        }
    }, [])

    return (
        <div className={styles.searchBoxParent}>
            {vendorError && (
                <p className={styles.statusMessage} role="status" aria-live="polite">
                    {vendorError}
                </p>
            )}
            <div className={styles.searchBox}>
                {points.map((point, index) => (
                    <SearchBox
                        key={point.id}
                        index={index}
                        points={points}
                        deletable={points.length > 2}
                        onChange={() => {
                            Dispatcher.dispatch(new ClearRoute())
                            Dispatcher.dispatch(new InvalidatePoint(point))
                            Dispatcher.dispatch(new StopSyncCurrentLocation())
                        }}
                        showTargetIcons={showTargetIcons}
                        moveStartIndex={moveStartIndex}
                        onMoveStartSelect={(index, showTarget) => {
                            onMoveStartSelect(index)
                            setShowTargetIcons(showTarget)
                        }}
                        dropPreviewIndex={dropPreviewIndex}
                        onDropPreviewSelect={onDropPreviewSelect}
                        map={map}
                        vendorOptions={vendorOptions}
                    />
                ))}
            </div>
            <div className={styles.lastSearchLine}>
                <PlainButton
                    style={
                        showTargetIcons && moveStartIndex >= 0 && moveStartIndex + 1 < points.length
                            ? { paddingTop: '2rem' }
                            : {}
                    }
                    onClick={() => Dispatcher.dispatch(new AddPoint(points.length, { lat: 0, lng: 0 }, false, true))}
                    className={styles.addSearchBox}
                >
                    <AddIcon />
                    <div>{tr('add_to_route')}</div>
                </PlainButton>
                <PlainButton className={styles.settingsButton} onClick={() => setShowSettings(!showSettings)}>
                    {showSettings ? tr('settings_close') : tr('settings')}
                </PlainButton>
            </div>
            {showSettings && <SettingsBox profile={profile} />}
        </div>
    )
}

const SearchBox = ({
    index,
    points,
    onChange,
    deletable,
    moveStartIndex,
    showTargetIcons,
    onMoveStartSelect,
    dropPreviewIndex,
    onDropPreviewSelect,
    map,
    vendorOptions,
}: {
    index: number
    points: QueryPoint[]
    deletable: boolean
    onChange: (value: string) => void
    moveStartIndex: number
    showTargetIcons: boolean
    onMoveStartSelect: (index: number, showTargetIcon: boolean) => void
    dropPreviewIndex: number
    onDropPreviewSelect: (index: number) => void
    map: Map
    vendorOptions: VendorOption[]
}) => {
    const point = points[index]

    function onClickOrDrop() {
        onDropPreviewSelect(-1)
        const newIndex = moveStartIndex < index ? index + 1 : index
        Dispatcher.dispatch(new MovePoint(points[moveStartIndex], newIndex))
        onMoveStartSelect(index, false) // temporarily hide target icons
        setTimeout(() => {
            onMoveStartSelect(-1, true)
        }, 1000)
    }

    return (
        <>
            {(moveStartIndex < 0 || moveStartIndex == index) && (
                <div
                    title={tr('drag_to_reorder')}
                    className={styles.markerContainer}
                    draggable
                    onDragStart={() => {
                        // do not set to dropPreview to -1 if we start dragging when already selected
                        if (moveStartIndex != index) {
                            onMoveStartSelect(index, true)
                            onDropPreviewSelect(-1)
                        }
                    }}
                    onDragEnd={() => {
                        onMoveStartSelect(-1, true)
                        onDropPreviewSelect(-1)
                    }}
                    onClick={() => {
                        if (moveStartIndex == index) {
                            onMoveStartSelect(-1, true)
                            onDropPreviewSelect(-1)
                        } else onMoveStartSelect(index, true)
                    }}
                >
                    <MarkerComponent
                        number={index > 0 && index + 1 < points.length ? '' + index : undefined}
                        cursor="ns-resize"
                        color={moveStartIndex >= 0 ? 'gray' : point.color}
                    />
                </div>
            )}
            {moveStartIndex >= 0 && moveStartIndex != index && (
                <PlainButton
                    title={tr('click to move selected input here')}
                    className={[
                        showTargetIcons ? '' : styles.hide,
                        styles.markerTarget,
                        dropPreviewIndex >= 0 && dropPreviewIndex == index ? styles.dropPreview : '',
                    ].join(' ')}
                    style={moveStartIndex > index ? { marginTop: '-2.4rem' } : { marginBottom: '-2.4rem' }}
                    onDragOver={e => {
                        e.preventDefault() // without this, the onDrop hook isn't called
                        onDropPreviewSelect(index)
                    }}
                    onDragLeave={() => onDropPreviewSelect(-1)}
                    onDrop={onClickOrDrop}
                    onClick={onClickOrDrop}
                >
                    <TargetIcon />
                </PlainButton>
            )}

            <div className={styles.searchBoxInput}>
                <AddressInput
                    map={map}
                    moveStartIndex={moveStartIndex}
                    dropPreviewIndex={dropPreviewIndex}
                    index={index}
                    point={point}
                    points={points}
                    onCancel={() => console.log('cancel')}
                    onAddressSelected={(queryText, coordinate) => {
                        const initCount = points.filter(p => p.isInitialized).length
                        if (coordinate && initCount != points.length)
                            Dispatcher.dispatch(new SetBBox(getBBoxFromCoord(coordinate)))

                        Dispatcher.dispatch(
                            new SetPoint(
                                {
                                    ...point,
                                    isInitialized: !!coordinate,
                                    queryText: queryText,
                                    coordinate: coordinate ? coordinate : point.coordinate,
                                },
                                initCount > 0,
                            ),
                        )
                    }}
                    clearDragDrop={() => {
                        onMoveStartSelect(-1, true)
                        onDropPreviewSelect(-1)
                    }}
                    onChange={onChange}
                    vendorOptions={vendorOptions}
                />
            </div>
            {deletable && (
                <PlainButton
                    title={tr('delete_from_route')}
                    onClick={() => {
                        Dispatcher.dispatch(new RemovePoint(point))
                        onMoveStartSelect(-1, true)
                    }}
                    className={styles.removeSearchBox}
                >
                    <RemoveIcon />
                </PlainButton>
            )}
        </>
    )
}
