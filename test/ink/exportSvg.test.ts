import { describe, expect, it } from 'vitest';
import { buildInkExportSvg } from '../../src/leaflet/ink/exportSvg';
import { defaultInkDoc, normalizeInk } from '../../src/leaflet/ink/model';
import type { InkItem } from '../../src/leaflet/ink/model';

// Reference pixels are the latlng with lat and lng swapped to x, y, as a flat test projection.
const project = (p: [number, number]) => ({ x: p[1], y: p[0] });

function docWith(...items: InkItem[]) {
	return normalizeInk({ ...defaultInkDoc(), items });
}

const area: InkItem = {
	id: 'lake', kind: 'area', layer: 'terrain', scaleWithMap: true,
	points: [[10, 10], [10, 60], [60, 60]],
	style: { stroke: '#1f5fa8', strokeWidth: 2, strokeOpacity: 1, dash: 'solid', fill: '#2a6fb0', fillOpacity: 0.6, fillPattern: 'solid' },
} as InkItem;

const keepSizeStamp: InkItem = {
	id: 'door', kind: 'stamp', layer: 'features', scaleWithMap: false,
	at: [30, 30], symbol: 'door', size: 20, rotation: 0, color: '#2b2b2b', opacity: 1,
} as InkItem;

const view = { width: 400, height: 300, originX: 25, originY: 40, scale: 3, viewScale: 2, project };

describe('buildInkExportSvg', () => {
	it('sizes the document to the export canvas', () => {
		const svg = buildInkExportSvg(docWith(area), view);
		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">')).toBe(true);
		expect(svg.endsWith('</svg>')).toBe(true);
	});

	it('places the reference origin and scales the drawing by the export scale', () => {
		const svg = buildInkExportSvg(docWith(area), view);
		expect(svg).toContain('<g transform="translate(25 40) scale(3)">');
	});

	it('includes each visible item', () => {
		const svg = buildInkExportSvg(docWith(area), view);
		expect(svg).toContain('data-ink-id="lake"');
	});

	it('counter-scales keep-size items by the inverse of the live view scale', () => {
		const svg = buildInkExportSvg(docWith(keepSizeStamp), view);
		expect(svg).toContain('data-ink-counter="1"');
		expect(svg).toContain('scale(0.5)" data-ink-counter="1"');
		expect(svg).not.toContain('scale(1)" data-ink-counter="1"');
	});

	it('leaves out hidden items and items on hidden layers', () => {
		const hiddenItem = { ...area, id: 'hidden-lake', hidden: true } as InkItem;
		const doc = docWith(area, hiddenItem);
		const svg = buildInkExportSvg(doc, view);
		expect(svg).toContain('data-ink-id="lake"');
		expect(svg).not.toContain('data-ink-id="hidden-lake"');

		const hiddenLayer = normalizeInk({
			...defaultInkDoc(),
			layers: defaultInkDoc().layers.map(l => (l.id === 'terrain' ? { ...l, visible: false } : l)),
			items: [area],
		});
		expect(buildInkExportSvg(hiddenLayer, view)).not.toContain('data-ink-id="lake"');
	});

	it('prefixes definition ids so they do not clash with the live map', () => {
		const svg = buildInkExportSvg(docWith(area), view);
		const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
		for (const id of ids) expect(id.startsWith('ink-export-')).toBe(true);
	});

	it('returns a document with no items for an empty drawing', () => {
		const svg = buildInkExportSvg(defaultInkDoc(), view);
		expect(svg).toContain('<g transform="translate(25 40) scale(3)"></g>');
	});
});
