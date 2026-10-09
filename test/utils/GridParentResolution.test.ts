import { describe, expect, it } from 'vitest';
import { overlaps, parentIdsOf, type PlacementGrid } from '../../src/leaflet/grid/GridModel';
import { buildChildLocationDefaults } from '../../src/utils/MapChildNavigation';

const grid = (): PlacementGrid => ({
    version: 1, size: 10, width: 100, height: 100, presets: {}, agreements: [],
    areas: [
        { locationId: 'loc-region', cells: ['0,0', '1,0', '2,0'] },
        { locationId: 'loc-other', cells: ['5,5'] },
    ],
} as unknown as PlacementGrid);

describe('grid parent references', () => {
    it('control: a child that stores its parent id is not in conflict with the parent area', () => {
        const parents = parentIdsOf([
            { id: 'loc-region', name: 'Region' },
            { id: 'loc-city', name: 'City', parentLocationId: 'loc-region' },
        ]);
        expect(overlaps(grid(), 'loc-city', ['0,0', '1,0'], parents)).toEqual([]);
    });

    it('a child that stores its parent name (child-location defaults) is not in conflict with the parent area', () => {
        const defaults = buildChildLocationDefaults({ name: 'Region' });
        const parents = parentIdsOf([
            { id: 'loc-region', name: 'Region' },
            { id: 'loc-city', name: 'City', parentLocationId: defaults.parentLocationId },
        ]);
        expect(parents['loc-city']).toBe('loc-region');
        expect(overlaps(grid(), 'loc-city', ['0,0', '1,0'], parents)).toEqual([]);
    });

    it('an unrelated location still conflicts when it overlaps a stored area', () => {
        const parents = parentIdsOf([
            { id: 'loc-region', name: 'Region' },
            { id: 'loc-town', name: 'Town', parentLocationId: 'Elsewhere' },
        ]);
        expect(overlaps(grid(), 'loc-town', ['0,0'], parents)).toEqual([{ id: 'loc-region', cells: ['0,0'] }]);
    });
});
