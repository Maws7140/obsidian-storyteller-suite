import { describe, it, expect } from 'vitest';
import { LocationService } from '../../src/services/LocationService';
import { getWhitelistKeys } from '../../src/yaml/EntitySections';
import type { PlacementGrid } from '../../src/leaflet/grid/GridModel';
const grid: PlacementGrid = { version: 1, size: 10, width: 100, height: 100, presets: {}, areas: [{ locationId: 'a', cells: ['1,1'] }, { locationId: 'b', cells: ['1,1'] }], agreements: [] };
describe('grid persistence and location integration', () => {
    it('preserves grid frontmatter as a supported map field', () => expect(getWhitelistKeys('map')).toContain('placementGrid'));
    it('returns all cell memberships even without legacy map pins', async () => { const plugin = { listLocations: async () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], listMaps: async () => [{ id: 'map', placementGrid: grid }] }; const svc = new LocationService(plugin as any); expect((await svc.findLocationsAtCoordinates('map', [15, 15], 1)).map(v => v.id)).toEqual(['a', 'b']); });
    it('does not leak areas to other maps', async () => { const plugin = { listLocations: async () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], listMaps: async () => [{ id: 'map', placementGrid: grid }] }; expect(await new LocationService(plugin as any).findLocationsAtCoordinates('other', [15, 15], 1)).toEqual([]); });
    it('ignores deleted location memberships rather than choosing unrelated pins', async () => { const plugin = { listLocations: async () => [], listMaps: async () => [{ id: 'map', placementGrid: grid }] }; expect(await new LocationService(plugin as any).findLocationsAtCoordinates('map', [15, 15], 1)).toEqual([]); });
});
