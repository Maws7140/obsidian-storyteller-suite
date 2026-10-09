import { describe, it, expect } from 'vitest';
import { offsetPolyline, polylineLength, slantBreaks, spacedPoints, tickMarks, wavePolyline, type Pixel } from '../../src/leaflet/maplog/geometry';

const H: Pixel[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

describe('Maplog pixel geometry', () => {
    it('measures polyline length', () => {
        expect(polylineLength(H)).toBe(100);
        expect(polylineLength([{ x: 0, y: 0 }])).toBe(0);
    });

    it('offsets a line running right by its normal: positive is down the screen, negative is up', () => {
        const down = offsetPolyline(H, 3);
        expect(down.map(p => p.y)).toEqual([3, 3]);
        const up = offsetPolyline(H, -3);
        expect(up.map(p => p.y)).toEqual([-3, -3]);
        expect(down.map(p => p.x)).toEqual([0, 100]);
    });

    it('keeps an offset line parallel at a bend', () => {
        const bent: Pixel[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
        const out = offsetPolyline(bent, 4);
        // The corner moves diagonally so both legs stay 4 pixels from the centre line.
        expect(out[1].x).toBeCloseTo(50 - 4, 5);
        expect(out[1].y).toBeCloseTo(4, 5);
    });

    it('waves within the amplitude and runs the full length', () => {
        const wave = wavePolyline(H, 2, 10);
        const maxOffset = Math.max(...wave.map(p => Math.abs(p.y)));
        expect(maxOffset).toBeLessThanOrEqual(2 + 1e-9);
        expect(maxOffset).toBeGreaterThan(1.5);
        expect(wave[wave.length - 1].x).toBeGreaterThanOrEqual(99.5);
    });

    it('places lower-side ticks below a horizontal ledge', () => {
        const ticks = tickMarks(H, 10, 5, 'lower');
        expect(ticks.length).toBe(11);
        for (const [from, to] of ticks) {
            expect(from.y).toBeCloseTo(0, 5);
            expect(to.y).toBeCloseTo(5, 5);
        }
    });

    it('places crossing ticks on both sides of a trail', () => {
        const ticks = tickMarks(H, 20, 6, 'both');
        expect(ticks.length).toBe(6);
        for (const [from, to] of ticks) {
            expect(from.y).toBeCloseTo(-3, 5);
            expect(to.y).toBeCloseTo(3, 5);
        }
    });

    it('draws no ticks for a degenerate line', () => {
        expect(tickMarks([{ x: 1, y: 1 }], 5, 5, 'lower')).toEqual([]);
        expect(tickMarks([{ x: 1, y: 1 }, { x: 1, y: 1 }], 5, 5, 'both')).toEqual([]);
    });

    it('gives two slanted breaks at each end of a line', () => {
        const breaks = slantBreaks(H, 10);
        expect(breaks.length).toBe(4);
        const leftEnd = breaks.filter(([a, b]) => Math.min(a.x, b.x) < 50);
        expect(leftEnd.length).toBe(2);
    });

    it('spaces points along a line from its start', () => {
        const pts = spacedPoints(H, 25);
        expect(pts.map(p => p.x)).toEqual([0, 25, 50, 75, 100]);
        expect(spacedPoints(H, 0)).toHaveLength(1);
    });
});
