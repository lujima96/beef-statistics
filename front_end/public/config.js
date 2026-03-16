const config = {
    routingApi: location.origin + '/',
    geocodingApi: '',
    defaultTiles: 'OpenStreetMap',
    keys: {
        graphhopper: "",
        maptiler: "missing_api_key",
        omniscale: "missing_api_key",
        thunderforest: "missing_api_key",
        kurviger: "missing_api_key"
    },
    routingGraphLayerAllowed: true,
    request: {
        details: [
            'road_class',
            'road_environment',
            'max_speed',
            'average_speed',
        ],
        snapPreventions: ['ferry'],
    },
    beefStatsApi: {
        host: 'http://192.168.99.71:8000'
    },
};

if (typeof window !== 'undefined') {
    window.config = config;
    if (!window.__beefStatsVendorScriptInjected) {
        window.__beefStatsVendorScriptInjected = true;
        try {
            var script = document.createElement('script');
            script.defer = true;
            script.src = 'vendor-shortcuts.js';
            script.type = 'text/javascript';
            document.head.appendChild(script);
        } catch (error) {
            console.warn('Unable to initialize Beef Stats vendor shortcuts', error);
        }
    }
}
