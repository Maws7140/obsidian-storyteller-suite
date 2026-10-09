import { describe, it, expect } from 'vitest';
import {
    MAPLOG_ATTRIBUTES,
    MAPLOG_CREDIT,
    MAPLOG_FAMILIES,
    MAPLOG_MARKS,
    acceptedMaplogAttributes,
    clampMaplogGrade,
    getMaplogMark,
    maplogAttributesFor,
    maplogMarksByFamily,
    searchMaplogMarks,
} from '../../src/leaflet/maplog/catalogue';

/** Every mark id the Maplog specification names (maplog.md Sections 4 to 9). */
const SPEC_MARK_IDS = [
    // Walls and boundaries
    'wall', 'offmap', 'bars', 'ledge',
    // Openings
    'passage', 'door', 'double', 'window', 'collapsed',
    // Level changes
    'stairs-up', 'stairs-down', 'spiral', 'slope', 'shaft', 'shaft-up',
    // Pits and traps
    'trap', 'pit', 'trapdoor',
    // Fixtures
    'column', 'statue', 'well', 'altar', 'light', 'water',
    // Terrain
    'plains', 'forest', 'jungle', 'hills', 'mountains', 'desert', 'swamp', 'ice',
    // Relief and borders
    'border', 'cliff', 'peak', 'pass',
    // Routes and crossings
    'road', 'track', 'trail', 'river', 'stream', 'bridge', 'ford', 'ferry',
    // Sites
    'entrance', 'ruin', 'tomb', 'stones', 'shrine', 'lair',
    // Settlements
    'homestead', 'hamlet', 'village', 'town', 'city', 'castle', 'tower', 'inn',
    // Furniture and write-ins
    'north', 'place-id', 'text',
];

const LOCKED_DOOR_ATTRS = ['locked', 'secret', 'barred', 'trapped', 'oneway', 'illusory'];

describe('Maplog catalogue', () => {
    it('credits the notation source', () => {
        expect(MAPLOG_CREDIT).toBe('Maplog by Roberto Bisceglie (CC BY-SA 4.0)');
    });

    it('has unique ids', () => {
        const ids = MAPLOG_MARKS.map(mark => mark.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('contains every mark the specification names', () => {
        const ids = new Set(MAPLOG_MARKS.map(mark => mark.id));
        const missing = SPEC_MARK_IDS.filter(id => !ids.has(id));
        expect(missing).toEqual([]);
    });

    it('lists only the four kinds and families that exist', () => {
        const families = new Set(MAPLOG_FAMILIES.map(f => f.id));
        for (const mark of MAPLOG_MARKS) {
            expect(['line', 'opening', 'point', 'area']).toContain(mark.kind);
            expect(families.has(mark.family)).toBe(true);
            expect(mark.label.length).toBeGreaterThan(0);
            expect(mark.label).not.toMatch(/—|–/);
        }
    });

    it('files each mark under the kind the notation gives it', () => {
        const kindOf = (id: string) => getMaplogMark(id)?.kind;
        expect(kindOf('wall')).toBe('line');
        expect(kindOf('road')).toBe('line');
        expect(kindOf('door')).toBe('opening');
        expect(kindOf('collapsed')).toBe('opening');
        expect(kindOf('stairs-down')).toBe('point');
        expect(kindOf('bridge')).toBe('point');
        expect(kindOf('water')).toBe('area');
        expect(kindOf('forest')).toBe('area');
    });

    it('only references defined attributes', () => {
        const attrIds = new Set(MAPLOG_ATTRIBUTES.map(a => a.id));
        for (const mark of MAPLOG_MARKS) {
            for (const attr of mark.attributes) expect(attrIds.has(attr)).toBe(true);
        }
    });

    it('gives doors the six door attributes and keeps them off stairs', () => {
        expect(maplogAttributesFor('door').map(a => a.id)).toEqual(LOCKED_DOOR_ATTRS);
        expect(maplogAttributesFor('double').map(a => a.id)).toEqual(LOCKED_DOOR_ATTRS);
        expect(maplogAttributesFor('stairs-up')).toEqual([]);
    });

    it('puts the covered pit and the ceiling and secret trapdoors on their base marks', () => {
        expect(acceptedMaplogAttributes('pit', ['covered', 'secret'])).toEqual(['covered']);
        expect(acceptedMaplogAttributes('trapdoor', ['ceiling', 'secret'])).toEqual(['secret', 'ceiling']);
    });

    it('gives settlements port and temple and grades size by rings', () => {
        expect(maplogAttributesFor('town').map(a => a.id)).toEqual(['port', 'temple']);
        expect(getMaplogMark('village')?.rings).toBe(1);
        expect(getMaplogMark('town')?.rings).toBe(2);
        expect(getMaplogMark('city')?.rings).toBe(3);
    });

    it('limits slope chevrons to one to three, defaulting to three', () => {
        expect(getMaplogMark('slope')?.grades).toEqual({ min: 1, max: 3, default: 3 });
        expect(clampMaplogGrade('slope', undefined)).toBe(3);
        expect(clampMaplogGrade('slope', 0)).toBe(1);
        expect(clampMaplogGrade('slope', 9)).toBe(3);
        expect(clampMaplogGrade('slope', 2.4)).toBe(2);
        expect(clampMaplogGrade('wall', 2)).toBeUndefined();
    });

    it('makes openings, stairs and crossings rotatable and walls not', () => {
        expect(getMaplogMark('door')?.rotatable).toBe(true);
        expect(getMaplogMark('stairs-down')?.rotatable).toBe(true);
        expect(getMaplogMark('bridge')?.rotatable).toBe(true);
        expect(getMaplogMark('wall')?.rotatable).toBe(false);
    });

    it('searches by label, id and description and ignores case', () => {
        expect(searchMaplogMarks('').length).toBe(MAPLOG_MARKS.length);
        expect(searchMaplogMarks('TRAPDOOR').map(m => m.id)).toContain('trapdoor');
        expect(searchMaplogMarks('ring').map(m => m.id)).toEqual(expect.arrayContaining(['village', 'town', 'city']));
        expect(searchMaplogMarks('nonexistent-word')).toEqual([]);
        // Every word must match, so a wrong second word empties the result.
        expect(searchMaplogMarks('door zebra')).toEqual([]);
    });

    it('groups marks by family in palette order and skips empty families', () => {
        const groups = maplogMarksByFamily();
        expect(groups.map(g => g.family.id)).toEqual(MAPLOG_FAMILIES.map(f => f.id));
        const total = groups.reduce((sum, group) => sum + group.marks.length, 0);
        expect(total).toBe(MAPLOG_MARKS.length);
        expect(maplogMarksByFamily([])).toEqual([]);
    });
});
