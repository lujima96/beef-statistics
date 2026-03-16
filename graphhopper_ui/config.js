/**
 * Webpack will replace this file with config-local.js if it exists
 */
const env =
    (typeof process !== 'undefined' && process && process.env) ||
    (typeof globalThis !== 'undefined' && globalThis && globalThis.__GRAPHOPPER_UI_ENV__) ||
    {}

const stripTrailingSlash = value =>
    typeof value === 'string' && value.endsWith('/') ? value.slice(0, value.length - 1) : value

const resolveBaseUrl = (envKey, fallbackPort) => {
    const envValue = env[envKey]
    if (envValue && typeof envValue === 'string') {
        return envValue.trim()
    }
    if (typeof window !== 'undefined' && window.location) {
        const { protocol, hostname } = window.location
        if (hostname) {
            const port = fallbackPort || window.location.port
            const targetPort = env[`${envKey}_PORT`] || fallbackPort
            const finalPort = targetPort || port
            if (finalPort) {
                return `${protocol}//${hostname}:${finalPort}/`
            }
            return `${protocol}//${hostname}/`
        }
    }
    return ''
}

const defaultRoutingApi =
    resolveBaseUrl('GRAPHHOPPER_UI_ROUTING_API', '8989') || 'https://graphhopper.com/api/1/'
const defaultGeocodingApi =
    resolveBaseUrl('GRAPHHOPPER_UI_GEOCODING_API', '8989') || 'https://graphhopper.com/api/1/'

const defaultBeefApiBase =
    stripTrailingSlash(resolveBaseUrl('BEEF_STATS_API_BASE', '8000')) || 'http://127.0.0.1:8000'

const defaultRequestDetails =
    defaultRoutingApi.includes('graphhopper.com') || defaultRoutingApi.includes('graphhopper.com/api/1')
        ? [
              'road_class',
              'road_environment',
              'road_access',
              'surface',
              'max_speed',
              'average_speed',
              'toll',
              'track_type',
              'country',
          ]
        : []

const config = {
    // the url of the GraphHopper routing backend, either use graphhopper.com or point it to your own GH instance
    routingApi: defaultRoutingApi,
    // the url of the geocoding backend, either use graphhopper.com or point it to another geocoding service. use an empty string to disable the address search
    geocodingApi: defaultGeocodingApi,
    // the tile layer used by default, see MapOptionsStore.ts for all options
    defaultTiles: 'OpenStreetMap',
    // various api keys used for the GH backend and the different tile providers
    keys: {
        graphhopper: 'efc33bcc-a9e6-450b-9221-c52c5bf57de3',
        maptiler: 'missing_api_key',
        omniscale: 'missing_api_key',
        thunderforest: 'missing_api_key',
        kurviger: 'missing_api_key',
        tracestrack: 'missing_api_key',
    },
    // if true there will be an option to enable the GraphHopper routing graph and the urban density visualization in the layers menu
    routingGraphLayerAllowed: false,
    // parameters used for the routing request generation
    request: {
        details: defaultRequestDetails,
    },

    // Use 'profiles' to define which profiles are visible and how. Useful if the /info endpoint contains too many or too "ugly" profile
    // names or in the wrong order. The key of each profile will be used as name and the given fields will overwrite the fields of the
    // default routing request. The following example is tuned towards the GraphHopper Directions API. If you have an own server you might want to adapt it.
    //
    // profiles: {
    //    car:{}, small_truck:{}, truck:{}, scooter:{},
    //    foot:{ details: ['foot_network', 'access_conditional', 'foot_conditional', 'hike_rating'] }, hike:{ details: ['foot_network', 'access_conditional', 'foot_conditional', 'hike_rating' ] },
    //    bike:{ details: ['get_off_bike', 'bike_network', 'access_conditional', 'bike_conditional', 'mtb_rating' ] }, mtb:{ details: ['get_off_bike', 'bike_network', 'access_conditional', 'bike_conditional', 'mtb_rating'] }, racingbike:{ details: ['get_off_bike', 'bike_network', 'access_conditional', 'bike_conditional', 'mtb_rating'] },
    // }
    //
    // E.g. the 'bike' entry will add a "bike" profile for which we send a request with the specified 'details' parameter. You can even change the profile itself when you specify
    // bike: { profile: 'raw_bike', ... }

    // You can 'collapse' or group certain profiles to reduce the number of profiles in the panel. Instead they're listed in the settings but still a profile icon is shown.
    // Note: the name of the group must be the default option for this group.
    profile_group_mapping: {},
    // base URL for Beef Stats API used to fetch delivery estimator data
    beefApiBase: defaultBeefApiBase,
    profiles: {
        car: {
            // disable contraction hierarchies so custom model preferences take effect
            'ch.disable': true,
            custom_model: {
                distance_influence: 120,
                priority: [
                    { if: 'road_class == MOTORWAY', multiply_by: '1.5' },
                    { if: 'road_class_link == true', multiply_by: '1.3' },
                    { if: 'road_class == TRUNK', multiply_by: '1.15' },
                    { if: 'road_class == PRIMARY', multiply_by: '0.85' },
                    { if: 'road_class == SECONDARY', multiply_by: '0.55' },
                    { if: 'road_class == TERTIARY', multiply_by: '0.4' },
                    { if: 'road_class == RESIDENTIAL || road_class == SERVICE', multiply_by: '0.3' },
                ],
                speed: [
                    { if: 'road_class != MOTORWAY && road_class != TRUNK', limit_to: '60' },
                ],
            },
        },
    },
    // profile_group_mapping: {
    //  car: {
    //    options: [
    //      { profile: 'car' },
    //      { profile: 'car_avoid_motorway' },
    //      { profile: 'car_avoid_ferry' },
    //      { profile: 'car_avoid_toll' }
    //    ]
    //  },
    //  bike: {
    //    options: [
    //      { profile: 'bike' },
    //      { profile: 'mtb' },
    //      { profile: 'racingbike' },
    //      { profile: 'ecargobike' }
    //    ]
    //  }
    // }
}

if (typeof window !== 'undefined') {
    window.config = config
}

// this is needed for jest (with our current setup at least)
if (typeof module !== 'undefined' && module && module.exports) module.exports = config
