import { describe, it, expect } from 'vitest';
import { stringifyYaml, parseYaml } from 'obsidian';
import { buildFrontmatter } from '../../src/yaml/EntitySections';
import { mapToBlockParams } from '../../src/leaflet/utils/MapBlockParams';
import type { StoryMap } from '../../src/types';
import {
    emptyMaplogData,
    hasMaplogData,
    maplogFrontmatter,
    nextMaplogId,
    normalizeMaplogData,
    removeMaplogItem,
    updateMaplogLine,
    updateMaplogMark,
    type MaplogData,
} from '../../src/leaflet/maplog/model';

const SAMPLE: MaplogData = {
    marks: [
        { id: 'door-1', mark: 'door', latlng: [40.5, 12.25], attributes: ['locked', 'trapped'], rotation: 90 },
        { id: 'slope-1', mark: 'slope', latlng: [3, 4], grade: 2, dashed: true },
        { id: 'stairs-1', mark: 'stairs-down', latlng: [10, 10], label: 'Descent', level: 'L1', destination: 'L2, 8', rotation: 180 },
        { id: 'id-1', mark: 'place-id', latlng: [20, 30], placeId: 'R3', locationId: 'Chapel' },
    ],
    lines: [
        { id: 'wall-1', mark: 'wall', points: [[0, 0], [0, 10], [5, 10]], attributes: ['illusory'], dashed: true },
    ],
    areas: [
        { id: 'forest-1', mark: 'forest', points: [[0, 0], [0, 5], [5, 5]], label: 'Greenwood' },
    ],
};

describe('normalizeMaplogData', () => {
    it('returns empty data for a note with no Maplog keys', () => {
        expect(normalizeMaplogData({})).toEqual(emptyMaplogData());
        expect(normalizeMaplogData(undefined)).toEqual(emptyMaplogData());
        expect(hasMaplogData(normalizeMaplogData({}))).toBe(false);
    });

    it('keeps valid records unchanged, so a saved map loads as it was drawn', () => {
        expect(normalizeMaplogData({ maplogMarks: SAMPLE.marks, maplogLines: SAMPLE.lines, maplogAreas: SAMPLE.areas })).toEqual(SAMPLE);
    });

    it('drops marks of the wrong kind or with unknown ids', () => {
        const out = normalizeMaplogData({
            maplogMarks: [
                { id: 'a', mark: 'wall', latlng: [1, 1] },          // a line, not a point
                { id: 'b', mark: 'mystery', latlng: [1, 1] },       // not in the catalogue
                { id: 'c', mark: 'door', latlng: [1, 'x'] },        // bad number
                { id: 'd', mark: 'door', latlng: [1, 2] },          // good
                'not an object',
            ],
            maplogLines: [{ id: 'e', mark: 'door', points: [[0, 0], [1, 1]] }], // a door is not a line
            maplogAreas: [{ id: 'f', mark: 'forest', points: [[0, 0], [1, 1]] }], // an area needs three points
        });
        expect(out.marks.map(m => m.id)).toEqual(['d']);
        expect(out.lines).toEqual([]);
        expect(out.areas).toEqual([]);
    });

    it('drops attributes a mark does not accept and keeps numeric strings', () => {
        const [mark] = normalizeMaplogData({
            maplogMarks: [{ id: 'w', mark: 'stairs-up', latlng: ['5', '6'], attributes: ['locked'] }],
        }).marks;
        expect(mark.latlng).toEqual([5, 6]);
        expect(mark.attributes).toBeUndefined();
    });

    it('normalises rotation into 0 to 360 and only keeps it on rotatable marks', () => {
        const out = normalizeMaplogData({
            maplogMarks: [
                { id: 'a', mark: 'door', latlng: [0, 0], rotation: -90 },
                { id: 'b', mark: 'door', latlng: [0, 0], rotation: 720 },
                { id: 'c', mark: 'trap', latlng: [0, 0], rotation: 45 },
            ],
        });
        expect(out.marks.map(m => m.rotation)).toEqual([270, undefined, undefined]);
    });

    it('gives slopes a grade within their count rule', () => {
        const out = normalizeMaplogData({
            maplogMarks: [
                { id: 'a', mark: 'slope', latlng: [0, 0] },
                { id: 'b', mark: 'slope', latlng: [0, 0], grade: 7 },
                { id: 'c', mark: 'slope', latlng: [0, 0], grade: 1 },
            ],
        });
        expect(out.marks.map(m => m.grade)).toEqual([3, 3, 1]);
    });

    it('trims text, drops empty text and caps overlong text', () => {
        const [mark] = normalizeMaplogData({
            maplogMarks: [{ id: 'x', mark: 'text', latlng: [0, 0], label: '   Orc   Warren  ', level: '   ', destination: 'L3, 1' }],
        }).marks;
        expect(mark.label).toBe('Orc Warren');
        expect(mark.level).toBeUndefined();
        expect(mark.destination).toBe('L3, 1');
        const [long] = normalizeMaplogData({ maplogMarks: [{ id: 'y', mark: 'text', latlng: [0, 0], label: 'x'.repeat(500) }] }).marks;
        expect(long.label?.length).toBe(200);
    });

    it('gives missing and duplicate ids unique values', () => {
        const out = normalizeMaplogData({
            maplogMarks: [
                { mark: 'column', latlng: [0, 0] },
                { id: 'same', mark: 'column', latlng: [0, 0] },
                { id: 'same', mark: 'column', latlng: [0, 0] },
            ],
        });
        const ids = out.marks.map(m => m.id);
        expect(new Set(ids).size).toBe(3);
        expect(ids[1]).toBe('same');
    });

    it('is idempotent', () => {
        const once = normalizeMaplogData({ maplogMarks: [{ mark: 'door', latlng: ['1', 2], rotation: 450, attributes: ['barred', 'bogus'] }] });
        expect(normalizeMaplogData({ maplogMarks: once.marks, maplogLines: once.lines, maplogAreas: once.areas })).toEqual(once);
    });

    it('rejects lines with a single point and areas with two', () => {
        const out = normalizeMaplogData({
            maplogLines: [{ id: 'l', mark: 'road', points: [[0, 0]] }],
            maplogAreas: [{ id: 'a', mark: 'water', points: [[0, 0], [1, 1]] }],
        });
        expect(out.lines).toEqual([]);
        expect(out.areas).toEqual([]);
    });
});

describe('Maplog frontmatter round trip', () => {
    it('writes no Maplog keys for empty data', () => {
        const patch = maplogFrontmatter(emptyMaplogData());
        expect(patch).toEqual({ maplogMarks: undefined, maplogLines: undefined, maplogAreas: undefined });
    });

    it('survives the map frontmatter builder and a YAML write and read', () => {
        const map = { id: 'm1', name: 'Orc Warren', scale: 'building', type: 'image' } as StoryMap;
        const built = buildFrontmatter('map', { ...map, ...maplogFrontmatter(SAMPLE) } as unknown as Record<string, unknown>);
        const yaml = stringifyYaml(built);
        const loaded = parseYaml(yaml) as Record<string, unknown>;
        expect(normalizeMaplogData(loaded)).toEqual(SAMPLE);
        expect(loaded.name).toBe('Orc Warren');
    });

    it('removes the keys when the data is emptied', () => {
        const built = buildFrontmatter('map', { id: 'm1', name: 'Empty', ...maplogFrontmatter(emptyMaplogData()) } as unknown as Record<string, unknown>);
        expect(built).not.toHaveProperty('maplogMarks');
        expect(built).not.toHaveProperty('maplogLines');
        expect(built).not.toHaveProperty('maplogAreas');
    });

    it('reaches the renderer through mapToBlockParams, normalised', () => {
        const stored = { id: 'm1', name: 'Keep', markers: [], maplogMarks: [{ id: 'd', mark: 'door', latlng: ['2', 3] }, { mark: 'nope', latlng: [1, 1] }] } as unknown as StoryMap;
        const params = mapToBlockParams(stored);
        expect(params.maplog?.marks).toEqual([{ id: 'd', mark: 'door', latlng: [2, 3] }]);
        expect(params.maplog?.lines).toEqual([]);
    });
});

describe('Maplog item edits', () => {
    it('finds the next free id for a prefix', () => {
        expect(nextMaplogId('door', [])).toBe('door-1');
        expect(nextMaplogId('door', ['door-1', 'door-3'])).toBe('door-2');
        expect(nextMaplogId('wall', ['door-1'])).toBe('wall-1');
    });

    it('removes, updates and leaves unknown references alone', () => {
        const removed = removeMaplogItem(SAMPLE, { type: 'mark', id: 'door-1' });
        expect(removed.marks.map(m => m.id)).not.toContain('door-1');
        expect(removeMaplogItem(SAMPLE, { type: 'area', id: 'missing' })).toEqual(SAMPLE);

        const dashed = updateMaplogMark(SAMPLE, 'door-1', m => ({ ...m, dashed: true }));
        expect(dashed.marks[0].dashed).toBe(true);
        expect(SAMPLE.marks[0].dashed).toBeUndefined();

        const relabelled = updateMaplogLine(SAMPLE, 'wall-1', l => ({ ...l, dashed: false }));
        expect(relabelled.lines[0].dashed).toBe(false);
    });
});
