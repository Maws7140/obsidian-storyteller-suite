import type { StoryMap } from '../../types';
import type { BlockParameters } from '../types';

/**
 * Convert a StoryMap entity to the BlockParameters consumed by LeafletRenderer.
 * Shared by MapView and the Campaign board so both render the same map state.
 * Callers set `id` and `mapId` themselves, because those depend on the viewer.
 */
export function mapToBlockParams(map: StoryMap): BlockParameters {
    const params: BlockParameters = {
        type: map.type || 'image',
        id: map.id || map.name,
        persistedMarkers: map.markers ?? []
    };

    // Image-based map parameters
    if (map.type === 'image' || !map.type) {
        if (map.backgroundImagePath || map.image) {
            params.image = map.backgroundImagePath || map.image;
        }
        if (map.width) params.width = map.width;
        if (map.height) params.height = map.height;
    }

    // Real-world map parameters
    if (map.type === 'real') {
        // Set default coordinates if not provided (London, UK as a reasonable default)
        params.lat = map.lat !== undefined ? map.lat : 51.5074;
        params.long = map.long !== undefined ? map.long : -0.1278;
        if (map.tileServer) params.tileServer = map.tileServer;
        if (map.darkMode) params.darkMode = map.darkMode;
        // Set default zoom if not provided
        if (map.defaultZoom === undefined) params.defaultZoom = 10;
    }

    // Zoom parameters
    if (map.defaultZoom !== undefined) params.defaultZoom = map.defaultZoom;
    if (map.minZoom !== undefined) params.minZoom = map.minZoom;
    if (map.maxZoom !== undefined) params.maxZoom = map.maxZoom;

    // Grid
    if (map.gridEnabled) {
        // Grid parameters would go here if needed
    }

    // GeoJSON / GPX overlay layers (vault file paths or wikilinks)
    if (map.geojsonFiles?.length) params.geojson = [...map.geojsonFiles];
    if (map.gpxFiles?.length) params.gpx = [...map.gpxFiles];

    // Note: Markers are handled differently in the renderer
    // They're loaded from the map entity's markers array

    return params;
}
