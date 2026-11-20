import { describe, expect, it } from 'vitest';
import { constrainImageViewport } from '../../src/leaflet/utils/ImageViewport';

function fixture(width = 1000, height = 500, x = 800, y = 600, scale = 1) {
    const state = { min: -10, max: 4, bounds: null as unknown };
    const bounds = { isValid: () => true, getNorthWest: () => ({ x: 0, y: height }), getSouthEast: () => ({ x: width, y: 0 }) };
    const map = {
        getZoom: () => undefined,
        options: {}, getSize: () => ({ x, y }),
        project: (p: any) => ({ x: p.x * scale, y: p.y * scale }),
        getScaleZoom: (s: number) => Math.log2(s),
        setMaxBounds: (b: unknown) => { state.bounds = b; },
        getMaxZoom: () => state.max, setMaxZoom: (z: number) => { state.max = z; },
        setMinZoom: (z: number) => { state.min = z; }
    };
    return { map, bounds, state, run: () => constrainImageViewport(map as any, bounds as any) };
}

describe('image viewport constraints', () => {
    it.each([[1000, 500, 800, 600], [500, 1000, 800, 600], [1000, 1000, 800, 600]])
    ('covers viewer without stretching %s x %s', (w, h, x, y) => {
        const f = fixture(w, h, x, y); const z = f.run()!;
        expect(w * 2 ** z).toBeGreaterThanOrEqual(x - 1e-8);
        expect(h * 2 ** z).toBeGreaterThanOrEqual(y - 1e-8);
        expect(f.state.bounds).toBe(f.bounds);
        expect(f.map.options).toEqual({ maxBoundsViscosity: 1 });
    });
    it('uses projected units for a native-pixel tiled pyramid', () => {
        expect(fixture(1039, 699, 800, 600, 1 / 8).run()).toBeCloseTo(Math.log2(600 / 699 * 8));
    });
    it('does not retain stale minimum zoom after shrinking', () => {
        const f = fixture(); f.run(); f.map.getSize = () => ({ x: 200, y: 100 });
        expect(f.run()).toBeCloseTo(Math.log2(0.2));
    });
    it('permits small images to cover large viewers beyond native zoom', () => {
        const f = fixture(10, 10, 2000, 2000); const z = f.run();
        expect(f.state.max).toBe(z); expect(f.state.min).toBe(z);
    });
    it('defers hidden containers', () => {
        const f = fixture(1000, 500, 0, 0); expect(f.run()).toBeNull(); expect(f.state.min).toBe(-10);
    });
    it('rejects empty image dimensions', () => { expect(fixture(0, 0).run()).toBeNull(); });
});

// Integration contracts: these regressions are invisible to bounds-only mocks.
import { readFileSync } from 'node:fs';
describe('map interaction ownership', () => {
    const renderer = readFileSync('src/leaflet/renderer.ts', 'utf8');
    const view = readFileSync('src/views/MapView.ts', 'utf8');
    it('matches generated pyramid scaling instead of tile-size scaling', () => {
        expect(renderer).toContain('Math.pow(2, tileInfo.maxZoom)');
        expect(renderer).toContain('1 / nativeScale, 0, -1 / nativeScale');
    });
    it('does not rewind camera using delayed micro-zoom', () => {
        expect(renderer).not.toContain('currentZoom + 0.0001');
    });
    it('has only native wheel zoom, without a competing setView debounce', () => {
        expect(view).not.toContain('wheelDelta');
        expect(view).not.toContain('wheelTimeout');
    });
});
