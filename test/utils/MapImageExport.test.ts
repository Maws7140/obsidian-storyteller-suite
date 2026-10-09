import { describe, expect, it } from 'vitest';
import {
    buildMapExportFileName,
    imageMimeForPath,
    normalizeLabel,
    planImageExport,
    slugifyMapName,
    uniqueExportPath
} from '../../src/leaflet/utils/MapImageExport';

function base(overrides: Partial<Parameters<typeof planImageExport>[0]> = {}) {
    return {
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        imageNorthWest: { x: 100, y: 50 },
        imageSouthEast: { x: 500, y: 350 },
        markers: [],
        ...overrides
    };
}

describe('map image export plan', () => {
    it('sizes the canvas to the viewer at the requested scale', () => {
        const plan = planImageExport(base({ scale: 2 }))!;
        expect(plan.width).toBe(1600);
        expect(plan.height).toBe(1200);
        expect(plan.scale).toBe(2);
    });

    it('places the image rectangle from its projected corners, scaled', () => {
        const plan = planImageExport(base({ scale: 2 }))!;
        expect(plan.image).toEqual({ x: 200, y: 100, width: 800, height: 600 });
    });

    it('normalises reversed corners so the rectangle is always positive', () => {
        const plan = planImageExport(base({ imageNorthWest: { x: 500, y: 350 }, imageSouthEast: { x: 100, y: 50 } }))!;
        expect(plan.image).toEqual({ x: 100, y: 50, width: 400, height: 300 });
    });

    it('keeps marker positions in step with the image, at the same scale', () => {
        const plan = planImageExport(base({
            scale: 2,
            markers: [{ x: 300, y: 200, color: '#f00', label: 'Harbour' }]
        }))!;
        expect(plan.markers).toHaveLength(1);
        expect(plan.markers[0]).toMatchObject({ x: 600, y: 400, color: '#f00' });
        expect(plan.markers[0].radius).toBe(14);
    });

    it('drops markers that lie outside the viewer and keeps edge pins', () => {
        const plan = planImageExport(base({
            markers: [
                { x: -500, y: 10, color: '#000' },
                { x: 10, y: 700, color: '#000' },
                { x: 790, y: 300, color: '#000' },
                { x: -3, y: -3, color: '#000' }
            ]
        }))!;
        expect(plan.markers.map(m => [m.x, m.y])).toEqual([[790, 300], [-3, -3]]);
    });

    it('ignores markers with non-finite positions', () => {
        const plan = planImageExport(base({ markers: [{ x: NaN, y: 1, color: '#000' }] }))!;
        expect(plan.markers).toEqual([]);
    });

    it('places labels to the right, flipping left near the right edge', () => {
        const plan = planImageExport(base({
            markers: [
                { x: 100, y: 100, color: '#000', label: 'West' },
                { x: 700, y: 100, color: '#000', label: 'East' }
            ]
        }))!;
        expect(plan.markers[0].label).toEqual({ text: 'West', x: 111, y: 100, align: 'left' });
        expect(plan.markers[1].label).toEqual({ text: 'East', x: 689, y: 100, align: 'right' });
    });

    it('omits labels that are empty after trimming', () => {
        const plan = planImageExport(base({ markers: [{ x: 1, y: 1, color: '#000', label: '   ' }] }))!;
        expect(plan.markers[0].label).toBeNull();
    });

    it('returns null when the viewer or the image has no area', () => {
        expect(planImageExport(base({ viewWidth: 0 }))).toBeNull();
        expect(planImageExport(base({ scale: 0 }))).toBeNull();
        expect(planImageExport(base({ imageSouthEast: { x: 100, y: 350 } }))).toBeNull();
        expect(planImageExport(base({ viewHeight: NaN }))).toBeNull();
    });
});

describe('export labels and names', () => {
    it('collapses whitespace and truncates long labels', () => {
        expect(normalizeLabel('  The   Old\nHarbour ')).toBe('The Old Harbour');
        const long = normalizeLabel('x'.repeat(100));
        expect(long.length).toBe(40);
        expect(long.endsWith('…')).toBe(true);
    });

    it('slugifies map names for file names', () => {
        expect(slugifyMapName('  Café Ünïcode & Co. ')).toBe('cafe-unicode-co');
        expect(slugifyMapName('***')).toBe('map');
        expect(slugifyMapName(undefined)).toBe('map');
    });

    it('builds a dated png file name in local time', () => {
        const date = new Date(2026, 0, 5, 9, 7);
        expect(buildMapExportFileName('Westmarch', date)).toBe('map-westmarch-2026-01-05-0907.png');
    });

    it('appends a counter instead of overwriting an existing export', () => {
        const taken = new Set(['Exports/map.png', 'Exports/map-2.png']);
        const path = uniqueExportPath('Exports', 'map.png', p => taken.has(p));
        expect(path).toBe('Exports/map-3.png');
        expect(uniqueExportPath('Exports', 'map.png', () => false)).toBe('Exports/map.png');
    });

    it('maps supported base image extensions to MIME types', () => {
        expect(imageMimeForPath('Maps/world.PNG')).toBe('image/png');
        expect(imageMimeForPath('Maps/world.jpeg')).toBe('image/jpeg');
        expect(imageMimeForPath('Maps/world.svg')).toBe('image/svg+xml');
        expect(imageMimeForPath('Maps/world.pdf')).toBeNull();
    });
});
