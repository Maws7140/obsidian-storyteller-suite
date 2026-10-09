import { describe, it, expect } from 'vitest';
import { linePiecesFor } from '../../src/leaflet/maplog/MaplogLayer';
import { MAPLOG_MARKS } from '../../src/leaflet/maplog/catalogue';
import type { Pixel } from '../../src/leaflet/maplog/geometry';

const RUN: Pixel[] = [{ x: 0, y: 0 }, { x: 120, y: 0 }];

describe('Maplog line styles', () => {
    it('gives every line mark at least one stroke on the map', () => {
        for (const mark of MAPLOG_MARKS.filter(m => m.kind === 'line')) {
            expect(linePiecesFor(mark.id, RUN).length, mark.id).toBeGreaterThan(0);
        }
    });

    it('draws a road as two parallel strokes and a track as one', () => {
        const road = linePiecesFor('road', RUN).filter(p => p.kind === 'path');
        expect(road).toHaveLength(2);
        expect(road[0].points[0].y).toBeCloseTo(-road[1].points[0].y, 5);
        expect(linePiecesFor('track', RUN)).toHaveLength(1);
    });

    it('draws a river as two wavy strokes and a stream as one', () => {
        const river = linePiecesFor('river', RUN).filter(p => p.kind === 'path');
        expect(river).toHaveLength(2);
        expect(river[0].points.length).toBeGreaterThan(RUN.length * 2);
        expect(linePiecesFor('stream', RUN)[0].points.length).toBeGreaterThan(RUN.length * 2);
    });

    it('draws a bar wall as dots, a border with circles, and ledges with lower ticks', () => {
        expect(linePiecesFor('bars', RUN)[0].dashArray).toBeDefined();
        expect(linePiecesFor('border', RUN).some(p => p.kind === 'dots')).toBe(true);
        const ledge = linePiecesFor('ledge', RUN).filter(p => p.kind === 'path');
        expect(ledge.length).toBeGreaterThan(1);
        for (const tick of ledge.slice(1)) expect(tick.points[1].y).toBeGreaterThan(0);
    });

    it('returns nothing for a mark that is not a line', () => {
        expect(linePiecesFor('door', RUN)).toEqual([]);
    });
});
