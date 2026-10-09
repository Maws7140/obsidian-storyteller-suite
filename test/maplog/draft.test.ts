import { describe, it, expect } from 'vitest';
import {
    MAPLOG_ROTATIONS,
    createMaplogArea,
    createMaplogLine,
    createMaplogMark,
    isPlacedMark,
    maplogToolError,
    type MaplogToolState,
} from '../../src/leaflet/maplog/draft';
import { emptyMaplogData, type MaplogData } from '../../src/leaflet/maplog/model';

const tool = (overrides: Partial<MaplogToolState> = {}): MaplogToolState => ({
    markId: 'door',
    attributes: [],
    dashed: false,
    rotation: 0,
    ...overrides,
});

const EMPTY: MaplogData = emptyMaplogData();

describe('Maplog placement rules', () => {
    it('places a door with its attributes, dash and rotation', () => {
        const record = createMaplogMark(tool({ attributes: ['locked', 'trapped', 'bogus'], dashed: true, rotation: 90 }), [4, 5], EMPTY);
        expect(record).toEqual({ id: 'door-1', mark: 'door', latlng: [4, 5], attributes: ['locked', 'trapped'], dashed: true, rotation: 90 });
    });

    it('drops rotation for marks that do not turn and attributes they do not take', () => {
        const record = createMaplogMark(tool({ markId: 'stairs-up', attributes: ['locked'], rotation: 45 }), [1, 1], EMPTY);
        expect(typeof record).toBe('object');
        expect(record).toEqual({ id: 'stairs-up-1', mark: 'stairs-up', latlng: [1, 1], rotation: 45 });
        const trap = createMaplogMark(tool({ markId: 'trap', rotation: 45 }), [1, 1], EMPTY);
        expect(trap).toEqual({ id: 'trap-1', mark: 'trap', latlng: [1, 1] });
    });

    it('stores the slope grade and clamps it', () => {
        expect(createMaplogMark(tool({ markId: 'slope', grade: 2 }), [0, 0], EMPTY)).toMatchObject({ grade: 2 });
        expect(createMaplogMark(tool({ markId: 'slope', grade: 9 }), [0, 0], EMPTY)).toMatchObject({ grade: 3 });
        expect(createMaplogMark(tool({ markId: 'slope' }), [0, 0], EMPTY)).toMatchObject({ grade: 3 });
    });

    it('keeps the write-ins: label, level, destination, place ID and linked location', () => {
        const record = createMaplogMark(tool({
            markId: 'stairs-down', level: ' L1 ', destination: 'L3, 1', placeId: 'R3', locationId: 'Chapel', label: '  Descent  ',
        }), [2, 2], EMPTY);
        expect(record).toMatchObject({ level: 'L1', destination: 'L3, 1', placeId: 'R3', locationId: 'Chapel', label: 'Descent' });
    });

    it('numbers new marks after the ones already on the map', () => {
        const existing: MaplogData = { ...EMPTY, marks: [{ id: 'door-1', mark: 'door', latlng: [0, 0] }] };
        expect(createMaplogMark(tool(), [1, 1], existing)).toMatchObject({ id: 'door-2' });
    });

    it('refuses a text or place-ID mark with nothing typed', () => {
        expect(maplogToolError(tool({ markId: 'text' }))).toBe('Type the text to place first.');
        expect(createMaplogMark(tool({ markId: 'text', label: '   ' }), [0, 0], EMPTY)).toBe('Type the text to place first.');
        expect(createMaplogMark(tool({ markId: 'place-id' }), [0, 0], EMPTY)).toBe('Type the place ID to place first.');
        expect(maplogToolError(tool({ markId: 'place-id', placeId: 'R1' }))).toBeUndefined();
    });

    it('refuses a line or area mark as a single point', () => {
        expect(createMaplogMark(tool({ markId: 'wall' }), [0, 0], EMPTY)).toBe('That mark is drawn as a line or an area.');
        expect(createMaplogMark(tool({ markId: 'water' }), [0, 0], EMPTY)).toBe('That mark is drawn as a line or an area.');
    });

    it('refuses an unknown mark', () => {
        expect(maplogToolError(tool({ markId: 'nope' }))).toBe('Choose a Maplog mark first.');
    });

    it('tells points and openings apart from lines and areas', () => {
        expect(isPlacedMark('door')).toBe(true);
        expect(isPlacedMark('pit')).toBe(true);
        expect(isPlacedMark('wall')).toBe(false);
        expect(isPlacedMark('forest')).toBe(false);
        expect(isPlacedMark('nope')).toBe(false);
    });
});

describe('Maplog line and area drawing', () => {
    it('draws a dashed road from its points', () => {
        const record = createMaplogLine(tool({ markId: 'road', dashed: true, label: 'King\'s Road' }), [[0, 0], [0, 10]], EMPTY);
        expect(record).toEqual({ id: 'road-1', mark: 'road', points: [[0, 0], [0, 10]], dashed: true, label: 'King\'s Road' });
    });

    it('needs two points for a line and three corners for an area', () => {
        expect(createMaplogLine(tool({ markId: 'wall' }), [[0, 0]], EMPTY)).toBe('A line needs at least two points.');
        expect(createMaplogArea(tool({ markId: 'forest' }), [[0, 0], [1, 1]], EMPTY)).toBe('An area needs at least three corners.');
    });

    it('keeps the kind of the mark: a line mark is not an area and the reverse', () => {
        expect(createMaplogLine(tool({ markId: 'forest' }), [[0, 0], [1, 1]], EMPTY)).toBe('That mark is not a line.');
        expect(createMaplogArea(tool({ markId: 'wall' }), [[0, 0], [1, 1], [2, 0]], EMPTY)).toBe('That mark is not an area.');
    });

    it('draws a forest area and numbers it', () => {
        const existing: MaplogData = { ...EMPTY, areas: [{ id: 'forest-1', mark: 'forest', points: [[0, 0], [1, 0], [1, 1]] }] };
        const record = createMaplogArea(tool({ markId: 'forest' }), [[0, 0], [1, 0], [1, 1]], existing);
        expect(record).toEqual({ id: 'forest-2', mark: 'forest', points: [[0, 0], [1, 0], [1, 1]] });
    });

    it('offers the eight rotation steps', () => {
        expect(MAPLOG_ROTATIONS).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    });
});
