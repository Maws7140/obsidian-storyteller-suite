// MapUtils - Helper functions for map operations and conversions
// Provides utilities for coordinate handling, marker management, and map hierarchy

import type { Map, MapMarker, MapLayer } from '../types';
import { LatLng, LatLngBounds } from 'leaflet';

// Generate unique ID for maps, markers, and layers
export function generateMapId(): string {
    return `map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateMarkerId(): string {
    return `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateLayerId(): string {
    return `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Convert pixel coordinates to Leaflet LatLng for image-based maps
// Uses a simple coordinate system where (0,0) is top-left
export function pixelToLatLng(x: number, y: number, imageWidth: number, imageHeight: number): LatLng {
    // Leaflet uses lat/lng, but for image overlays we map pixels directly
    // Y coordinate is inverted (0 at top in pixels, but we want consistent coords)
    const lat = -y;  // Negative Y for proper orientation
    const lng = x;
    return new LatLng(lat, lng);
}

// Convert Leaflet LatLng back to pixel coordinates
export function latLngToPixel(latlng: LatLng, imageWidth: number, imageHeight: number): { x: number; y: number } {
    return {
        x: latlng.lng,
        y: -latlng.lat  // Convert back from inverted coords
    };
}

// Calculate bounds for an image overlay
// Uses positive coordinates to properly fill the canvas
export function calculateImageBounds(imageWidth: number, imageHeight: number): LatLngBounds {
    // Use [0,0] as top-left corner, image dimensions as bottom-right
    // This ensures the image fills from origin and scales properly
    const southWest = new LatLng(0, 0);
    const northEast = new LatLng(imageHeight, imageWidth);
    return new LatLngBounds(southWest, northEast);
}

// Find all maps at a specific scale level
export function filterMapsByScale(maps: Map[], scale: Map['scale']): Map[] {
    return maps.filter(map => map.scale === scale);
}

// Build hierarchical tree structure from flat map array
export function buildMapHierarchy(maps: Map[]): Map[] {
    const mapById = new Map<string, Map>();
    const rootMaps: Map[] = [];

    // First pass: index all maps by ID
    maps.forEach(map => {
        if (map.id) {
            mapById.set(map.id, { ...map, childMapIds: [] });
        }
    });

    // Second pass: build parent-child relationships
    maps.forEach(map => {
        const mapCopy = mapById.get(map.id!);
        if (!mapCopy) return;

        if (map.parentMapId) {
            const parent = mapById.get(map.parentMapId);
            if (parent) {
                if (!parent.childMapIds) parent.childMapIds = [];
                if (!parent.childMapIds.includes(map.id!)) {
                    parent.childMapIds.push(map.id!);
                }
            }
        } else {
            rootMaps.push(mapCopy);
        }
    });

    return rootMaps;
}

// Get all ancestor maps (parent, grandparent, etc.)
export function getMapAncestors(mapId: string, allMaps: Map[]): Map[] {
    const ancestors: Map[] = [];
    const mapById = new Map<string, Map>();
    
    allMaps.forEach(m => {
        if (m.id) mapById.set(m.id, m);
    });

    let currentMap = mapById.get(mapId);
    while (currentMap?.parentMapId) {
        const parent = mapById.get(currentMap.parentMapId);
        if (!parent) break;
        ancestors.push(parent);
        currentMap = parent;
    }

    return ancestors;
}

// Get all descendant maps (children, grandchildren, etc.)
export function getMapDescendants(mapId: string, allMaps: Map[]): Map[] {
    const descendants: Map[] = [];
    const mapById = new Map<string, Map>();
    
    allMaps.forEach(m => {
        if (m.id) mapById.set(m.id, m);
    });

    const queue: string[] = [mapId];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const currentMap = mapById.get(currentId);
        if (!currentMap) continue;

        if (currentMap.childMapIds) {
            currentMap.childMapIds.forEach(childId => {
                const child = mapById.get(childId);
                if (child) {
                    descendants.push(child);
                    queue.push(childId);
                }
            });
        }
    }

    return descendants;
}

// Check if setting a parent would create a circular reference
export function wouldCreateCircularReference(mapId: string, proposedParentId: string, allMaps: Map[]): boolean {
    if (mapId === proposedParentId) return true;

    const descendants = getMapDescendants(mapId, allMaps);
    return descendants.some(d => d.id === proposedParentId);
}

// Get markers for a specific location across all maps
export function getMarkersForLocation(locationName: string, maps: Map[]): Array<{ map: Map; marker: MapMarker }> {
    const results: Array<{ map: Map; marker: MapMarker }> = [];

    maps.forEach(map => {
        map.markers.forEach(marker => {
            if (marker.locationName === locationName) {
                results.push({ map, marker });
            }
        });
    });

    return results;
}

// Filter markers by visibility and zoom level
export function getVisibleMarkers(markers: MapMarker[], currentZoom: number): MapMarker[] {
    return markers.filter(marker => {
        if (marker.visible === false) return false;
        if (marker.minZoom !== undefined && currentZoom < marker.minZoom) return false;
        if (marker.maxZoom !== undefined && currentZoom > marker.maxZoom) return false;
        return true;
    });
}

// Calculate center point from array of markers
export function calculateMarkersCenter(markers: MapMarker[]): [number, number] | null {
    if (markers.length === 0) return null;

    const sumLat = markers.reduce((sum, m) => sum + m.lat, 0);
    const sumLng = markers.reduce((sum, m) => sum + m.lng, 0);

    return [sumLat / markers.length, sumLng / markers.length];
}

// Get default marker icon based on location type
export function getDefaultMarkerIcon(locationType?: string): string {
    const iconMap: Record<string, string> = {
        'city': 'landmark',
        'town': 'home',
        'village': 'home',
        'castle': 'shield',
        'fortress': 'shield',
        'forest': 'tree',
        'mountain': 'trending-up',
        'river': 'waves',
        'ocean': 'waves',
        'tavern': 'beer',
        'inn': 'bed',
        'shop': 'shopping-bag',
        'temple': 'church',
        'dungeon': 'skull',
        'cave': 'circle',
    };

    if (locationType) {
        const normalizedType = locationType.toLowerCase();
        return iconMap[normalizedType] || 'map-pin';
    }

    return 'map-pin';
}

// Serialize map data for storage
export function serializeMapData(mapData: any): string {
    try {
        return JSON.stringify(mapData);
    } catch (error) {
        console.error('Error serializing map data:', error);
        return '{}';
    }
}

// Deserialize map data from storage
export function deserializeMapData(mapDataString: string): any {
    try {
        return JSON.parse(mapDataString);
    } catch (error) {
        console.error('Error deserializing map data:', error);
        return {};
    }
}

// Validate map bounds
export function validateMapBounds(bounds: [[number, number], [number, number]] | undefined): boolean {
    if (!bounds) return false;
    const [[south, west], [north, east]] = bounds;
    return south < north && west < east;
}

// Create default empty map
export function createDefaultMap(name: string, scale: Map['scale']): Map {
    return {
        name,
        scale,
        markers: [],
        layers: [{
            id: generateLayerId(),
            name: 'Base Layer',
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 0
        }],
        gridEnabled: false,
        gridSize: 50,
        defaultZoom: 0,
        center: [0, 0],
        created: new Date().toISOString(),
        modified: new Date().toISOString()
    };
}

// Export map as GeoJSON for interoperability
export function exportMapAsGeoJSON(map: Map): any {
    const features = map.markers.map(marker => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [marker.lng, marker.lat]
        },
        properties: {
            id: marker.id,
            name: marker.label || marker.locationName || 'Unnamed',
            locationName: marker.locationName,
            icon: marker.icon,
            color: marker.color,
            description: marker.description,
            scale: marker.scale,
            visible: marker.visible
        }
    }));

    return {
        type: 'FeatureCollection',
        features,
        properties: {
            mapName: map.name,
            mapId: map.id,
            scale: map.scale,
            center: map.center,
            defaultZoom: map.defaultZoom
        }
    };
}

