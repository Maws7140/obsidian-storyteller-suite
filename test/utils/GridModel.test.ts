import { describe, it, expect } from 'vitest';
import { PlacementGrid, cellAt, cellCenter, stamp, outline, related, overlaps, commitArea } from '../../src/leaflet/grid/GridModel';
const grid = (): PlacementGrid => ({ version: 1, size: 10, width: 25, height: 25, presets: {}, areas: [], agreements: [] });
describe('logical map grid', () => {
    it('clips edge cells and never wraps beyond image', () => { const g = grid(); expect(cellAt(g, 25, 1)).toBeNull(); expect(cellAt(g, -1, 1)).toBeNull(); expect(cellCenter(g, '2,2')).toEqual([22.5, 22.5]); expect(stamp(g, '0,0', 1)).toHaveLength(4); });
    it('radius 1 is nine cells, independent of zoom', () => expect(stamp(grid(), '1,1', 1)).toHaveLength(9));
    it('selects freehand cells by center', () => expect(outline(grid(), [[0, 0], [20, 0], [20, 20], [0, 20]])).toEqual(['0,0', '1,0', '0,1', '1,1']));
    it('recognizes explicit ancestry and terminates on cycles', () => { expect(related('room', 'world', { room: 'town', town: 'world' })).toBe(true); expect(related('a', 'c', { a: 'b', b: 'a' })).toBe(false); });
    it('blocks unresolved same-level overlaps without modifying original', () => { const g = grid(); g.areas = [{ locationId: 'a', cells: ['0,0'] }]; expect(() => commitArea(g, { locationId: 'b', cells: ['0,0'] }, {}, {})).toThrow(); expect(g.areas).toHaveLength(1); });
    it.each(['shared', 'disputed'] as const)('stores explicit %s participants', kind => { const g = grid(); g.areas = [{ locationId: 'a', cells: ['0,0'] }]; const next = commitArea(g, { locationId: 'b', cells: ['0,0'] }, {}, { a: kind }); expect(next.areas).toHaveLength(2); expect(next.agreements[0]).toEqual({ a: 'b', b: 'a', cells: ['0,0'], kind }); });
    it('allows parent containment without dispute', () => { const g = grid(); g.areas = [{ locationId: 'country', cells: ['0,0'] }]; expect(overlaps(g, 'town', ['0,0'], { town: 'country' })).toEqual([]); });
    it('resolves three owners independently and cleans stale agreements', () => { const g = grid(); g.areas = [{ locationId: 'a', cells: ['0,0', '1,0'] }, { locationId: 'b', cells: ['0,0'] }]; g.agreements = [{ a: 'a', b: 'b', cells: ['0,0'], kind: 'shared' }]; const n = commitArea(g, { locationId: 'c', cells: ['0,0'] }, {}, { a: 'transfer', b: 'disputed' }); expect(n.areas[0].cells).toEqual(['1,0']); expect(n.agreements).toEqual([{ a: 'c', b: 'b', cells: ['0,0'], kind: 'disputed' }]); });
    it('exclusion wins over other choices on the same cell', () => { const g = grid(); g.areas = [{ locationId: 'a', cells: ['0,0'] }, { locationId: 'b', cells: ['0,0'] }]; const n = commitArea(g, { locationId: 'c', cells: ['0,0'] }, {}, { a: 'exclude', b: 'transfer' }); expect(n.areas[1].cells).toEqual(['0,0']); expect(n.areas[2].cells).toEqual([]); });
    it('keeps disconnected cells and valid custom label anchor', () => { const n = commitArea(grid(), { locationId: 'a', cells: ['0,0', '2,2'], labelCell: '2,2' }, {}, {}); expect(n.areas[0].labelCell).toBe('2,2'); });
    it('clears agreements when an area is removed', () => { const g = grid(); g.areas = [{ locationId: 'a', cells: ['0,0'] }, { locationId: 'b', cells: ['0,0'] }]; g.agreements = [{ a: 'a', b: 'b', cells: ['0,0'], kind: 'disputed' }]; expect(commitArea(g, { locationId: 'a', cells: [] }, {}, {}).agreements).toEqual([]); });
});
import { resizeGrid, validateGrid } from '../../src/leaflet/grid/GridModel';
describe('grid resolution and validation', () => {
    it('expands areas and shared cells consistently when refining', () => { const g = grid(); g.areas = [{ locationId: 'a', cells: ['0,0'] }, { locationId: 'b', cells: ['0,0'] }]; g.agreements = [{ a: 'a', b: 'b', cells: ['0,0'], kind: 'disputed' }]; const n = resizeGrid(g, 5); expect(n.areas[0].cells).toHaveLength(4); expect(n.agreements[0].cells).toEqual(n.areas[0].cells); expect(g.size).toBe(10); });
    it('rejects corrupt cells instead of rendering indefinitely', () => { const g = grid(); g.areas = [{ locationId: 'a', cells: ['-1,0'] }]; expect(() => validateGrid(g)).toThrow(); });
    it('rejects excessive density', () => expect(() => resizeGrid({ ...grid(), width: 100000, height: 100000 }, 4)).toThrow());
});
