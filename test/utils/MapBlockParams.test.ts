import { describe, it, expect } from 'vitest';
import { mapToBlockParams } from '../../src/leaflet/utils/MapBlockParams';
import type { StoryMap } from '../../src/types';

function storyMap(overrides: Partial<StoryMap>): StoryMap {
    return { id: 'm1', name: 'World', ...overrides } as StoryMap;
}

describe('mapToBlockParams', () => {
    it('maps an image map with its background, size and persisted pins', () => {
        const markers = [{ id: 'pin', lat: 10, lng: 20 }];
        const params = mapToBlockParams(storyMap({
            type: 'image', backgroundImagePath: 'Maps/world.png', image: 'old.png',
            width: 1200, height: 800, markers: markers as StoryMap['markers'],
        }));
        expect(params).toMatchObject({ type: 'image', id: 'm1', image: 'Maps/world.png', width: 1200, height: 800 });
        expect(params.persistedMarkers).toBe(markers);
    });

    it('falls back to the legacy image field and defaults the map type to image', () => {
        const params = mapToBlockParams(storyMap({ type: undefined, image: 'Maps/legacy.png' }));
        expect(params.type).toBe('image');
        expect(params.image).toBe('Maps/legacy.png');
    });

    it('uses the map name as id when no id is stored and empty pins by default', () => {
        const params = mapToBlockParams({ name: 'Dungeon' } as StoryMap);
        expect(params.id).toBe('Dungeon');
        expect(params.persistedMarkers).toEqual([]);
        expect(params.image).toBeUndefined();
    });

    it('gives real-world maps London and zoom 10 when nothing is stored', () => {
        const params = mapToBlockParams(storyMap({ type: 'real', tileServer: 'https://tiles.example/{z}/{x}/{y}.png', darkMode: true }));
        expect(params).toMatchObject({ lat: 51.5074, long: -0.1278, defaultZoom: 10, tileServer: 'https://tiles.example/{z}/{x}/{y}.png', darkMode: true });
        expect(params.image).toBeUndefined();
    });

    it('keeps stored real-world coordinates and an explicit zoom', () => {
        const params = mapToBlockParams(storyMap({ type: 'real', lat: 0, long: 0, defaultZoom: 3 }));
        expect(params).toMatchObject({ lat: 0, long: 0, defaultZoom: 3 });
    });

    it('passes zoom limits through, including zero', () => {
        const params = mapToBlockParams(storyMap({ type: 'image', minZoom: 0, maxZoom: 5, defaultZoom: 0 }));
        expect(params).toMatchObject({ minZoom: 0, maxZoom: 5, defaultZoom: 0 });
    });

    it('copies GeoJSON and GPX overlay lists instead of sharing them', () => {
        const geojsonFiles = ['Maps/roads.geojson'];
        const gpxFiles = ['Maps/route.gpx'];
        const params = mapToBlockParams(storyMap({ type: 'image', geojsonFiles, gpxFiles }));
        expect(params.geojson).toEqual(['Maps/roads.geojson']);
        expect(params.gpx).toEqual(['Maps/route.gpx']);
        expect(params.geojson).not.toBe(geojsonFiles);
        expect(params.gpx).not.toBe(gpxFiles);
    });

    it('omits overlay keys when the lists are empty', () => {
        const params = mapToBlockParams(storyMap({ type: 'image', geojsonFiles: [], gpxFiles: [] }));
        expect(params).not.toHaveProperty('geojson');
        expect(params).not.toHaveProperty('gpx');
    });
});
