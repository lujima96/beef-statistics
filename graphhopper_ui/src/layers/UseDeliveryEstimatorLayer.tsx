import { useEffect } from 'react'
import { Map } from 'ol'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import { fromLonLat } from 'ol/proj'
import { Stroke, Style } from 'ol/style'
import config from 'config'

const LAYER_KEY = 'delivery-estimator-layer'
const COLORS = ['rgba(239,68,68,0.75)', 'rgba(37,99,235,0.75)', 'rgba(34,197,94,0.75)', 'rgba(249,115,22,0.75)']

type MultiRouteRunLeg = {
    route: {
        geometry: { latitude: number; longitude: number }[]
    }
}

type MultiRouteRunResult = {
    routeId: number
    legs: MultiRouteRunLeg[]
}

function removeLayer(map: Map) {
    map.getLayers()
        .getArray()
        .filter(layer => layer.get(LAYER_KEY))
        .forEach(layer => map.removeLayer(layer))
}

export default function useDeliveryEstimatorLayer(map: Map, routeId: number | null, version: string | null) {
    useEffect(() => {
        removeLayer(map)
        if (!routeId || !version || !config.beefApiBase) {
            return
        }

        const controller = new AbortController()
        const url = new URL(`${config.beefApiBase}/delivery-estimator/run/latest`)
        url.searchParams.set('routeId', String(routeId))
        if (version) {
            url.searchParams.set('v', version)
        }

        const fetchData = async () => {
            try {
                const response = await fetch(url.toString(), { signal: controller.signal })
                if (!response.ok) {
                    removeLayer(map)
                    return
                }
                const payload = (await response.json()) as MultiRouteRunResult | null
                removeLayer(map)
                if (!payload || !Array.isArray(payload.legs) || payload.legs.length === 0) {
                    return
                }

                const source = new VectorSource()
                payload.legs.forEach((leg, index) => {
                    const coordinates =
                        leg.route?.geometry?.map((point) => [point.longitude, point.latitude]) ?? []
                    if (coordinates.length < 2) return
                    const feature = new Feature(
                        new LineString(coordinates.map(([lon, lat]) => fromLonLat([lon, lat]))),
                    )
                    feature.set('color', COLORS[index % COLORS.length])
                    source.addFeature(feature)
                })

                if (source.getFeatures().length === 0) {
                    return
                }

                const layer = new VectorLayer({
                    source,
                    style: feature =>
                        new Style({
                            stroke: new Stroke({
                                color: feature.get('color') ?? COLORS[0],
                                width: 8,
                                lineCap: 'round',
                                lineJoin: 'round',
                            }),
                        }),
                })
                layer.set(LAYER_KEY, true)
                layer.setZIndex(6)
                map.addLayer(layer)

                const extent = source.getExtent()
                if (extent && extent.every(Number.isFinite)) {
                    map.getView().fit(extent, { padding: [24, 24, 24, 24], maxZoom: 13, duration: 300 })
                }
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.warn('Failed to load delivery estimator map overlay', error)
                }
                removeLayer(map)
            }
        }

        void fetchData()

        return () => {
            controller.abort()
            removeLayer(map)
        }
    }, [map, routeId, version])
}
