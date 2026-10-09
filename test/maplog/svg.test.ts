import { describe, it, expect } from 'vitest';
import { MAPLOG_MARKS, getMaplogMark } from '../../src/leaflet/maplog/catalogue';
import { maplogSvg, maplogSvgInner } from '../../src/leaflet/maplog/svg';

describe('Maplog SVG marks', () => {
    it('draws every mark as a 32 unit SVG with currentColor and no bad numbers', () => {
        for (const mark of MAPLOG_MARKS) {
            const svg = maplogSvg(mark.id);
            expect(svg.startsWith('<svg')).toBe(true);
            expect(svg).toContain('viewBox="0 0 32 32"');
            expect(svg).toContain('stroke="currentColor"');
            expect(svg).toContain(`data-mark="${mark.id}"`);
            expect(svg).not.toMatch(/NaN|undefined|Infinity/);
            expect(svg.length).toBeGreaterThan(60);
        }
    });

    it('gives every mark its own drawing', () => {
        const bodies = new Map<string, string>();
        for (const mark of MAPLOG_MARKS) {
            const body = maplogSvgInner(mark.id);
            expect(body.length).toBeGreaterThan(0);
            const other = bodies.get(body);
            if (other) throw new Error(`${mark.id} draws the same as ${other}`);
            bodies.set(body, mark.id);
        }
        expect(bodies.size).toBe(MAPLOG_MARKS.length);
    });

    it('draws a locked door differently from a plain door, and a trapped locked door differently again', () => {
        const door = maplogSvg('door');
        const locked = maplogSvg('door', { attributes: ['locked'] });
        const lockedTrapped = maplogSvg('door', { attributes: ['locked', 'trapped'] });
        expect(locked).not.toBe(door);
        expect(lockedTrapped).not.toBe(locked);
        expect(maplogSvg('door', { attributes: ['trapped'] })).not.toBe(maplogSvg('door', { attributes: ['barred'] }));
    });

    it('ignores attributes a mark does not accept', () => {
        expect(maplogSvg('wall', { attributes: ['locked', 'trapped'] })).toBe(maplogSvg('wall'));
        expect(maplogSvg('stairs-up', { attributes: ['secret'] })).toBe(maplogSvg('stairs-up'));
    });

    it('draws the secret and covered letters on the mark', () => {
        expect(maplogSvg('trapdoor', { attributes: ['secret'] })).toContain('>S<');
        expect(maplogSvg('pit', { attributes: ['covered'] })).toContain('>C<');
        expect(maplogSvg('door', { attributes: ['illusory'] })).toContain('>?<');
    });

    it('draws the dashed variant differently, as dashed strokes', () => {
        for (const mark of MAPLOG_MARKS) {
            const solid = maplogSvg(mark.id);
            const dashed = maplogSvg(mark.id, { dashed: true });
            expect(dashed).not.toBe(solid);
            expect(dashed).toContain('<g stroke-dasharray="3 2.4">');
            expect(solid).not.toContain('<g stroke-dasharray');
        }
    });

    it('rotates rotatable marks and leaves fixed marks alone', () => {
        expect(maplogSvg('door', { rotation: 90 })).toContain('rotate(90 16 16)');
        expect(maplogSvg('door', { rotation: 450 })).toBe(maplogSvg('door', { rotation: 90 }));
        expect(maplogSvg('door', { rotation: -90 })).toContain('rotate(270 16 16)');
        expect(maplogSvg('wall', { rotation: 90 })).toBe(maplogSvg('wall'));
    });

    it('draws slopes with one, two or three chevrons', () => {
        const chevrons = (grade: number) => (maplogSvg('slope', { grade }).match(/<polyline/g) ?? []).length;
        expect([chevrons(1), chevrons(2), chevrons(3)]).toEqual([1, 2, 3]);
        expect(maplogSvg('slope')).toBe(maplogSvg('slope', { grade: 3 }));
        expect(maplogSvg('slope', { grade: 1 })).not.toBe(maplogSvg('slope', { grade: 2 }));
    });

    it('draws settlements with one, two or three rings', () => {
        const rings = (id: string) => (maplogSvg(id).match(/<circle/g) ?? []).length;
        expect([rings('village'), rings('town'), rings('city')]).toEqual([1, 2, 3]);
    });

    it('accepts a plain colour and rejects anything that is not a colour', () => {
        expect(maplogSvg('wall', { color: '#8a2be2' })).toContain('color="#8a2be2"');
        expect(() => maplogSvg('wall', { color: 'red" onload="x' })).toThrow('Invalid Maplog colour');
    });

    it('sets the rendered size and escapes nothing it should not', () => {
        expect(maplogSvg('trap', { size: 24 })).toContain('width="24" height="24"');
        expect(maplogSvg('trap')).toContain('width="32" height="32"');
    });

    it('throws for an unknown mark and returns nothing for an empty inner drawing', () => {
        expect(() => maplogSvg('no-such-mark')).toThrow('Unknown Maplog mark');
        expect(maplogSvgInner('no-such-mark')).toBe('');
        expect(getMaplogMark('no-such-mark')).toBeUndefined();
    });
});
