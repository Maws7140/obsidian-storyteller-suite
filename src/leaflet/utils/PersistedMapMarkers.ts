import type { MapMarker } from '../../types';
import type { MarkerDefinition } from '../types';

/** Preserve explicit pins without routing structured data through legacy string parsing. */
export function persistedMapMarkers(markers: MapMarker[]): MarkerDefinition[] {
    return markers.filter(marker => marker.visible !== false &&
        Number.isFinite(marker.lat) && Number.isFinite(marker.lng)).map(marker => ({
        id: marker.id,
        type: marker.markerType === 'location' ? 'location' : marker.markerType === 'event' ? 'event' : 'default',
        loc: [marker.lat, marker.lng],
        link: marker.locationName ? `[[${marker.locationName}]]` : marker.eventName ? `[[${marker.eventName}]]` : undefined,
        description: marker.description || marker.label,
        icon: marker.icon,
        iconColor: marker.color,
        minZoom: marker.minZoom,
        maxZoom: marker.maxZoom,
    }));
}
