import { describe, expect, it } from 'vitest';
import {
	BRUSHES,
	brushPieceMarkup,
	brushPieces,
	brushPreviewSvg,
	brushesByCategory,
	getBrush,
} from '../../src/leaflet/ink/brushes';
import type { BrushPiece } from '../../src/leaflet/ink/brushes';
import type { Point } from '../../src/leaflet/ink/geometry';
import { pointInPolygon } from '../../src/leaflet/ink/geometry';
import { isValidColor, normalizeInk } from '../../src/leaflet/ink/model';

const LINE: Point[] = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
const SQUARE: Point[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
const ALL = BRUSHES.map(b => b.id);

function segmentsOf(pieces: BrushPiece[]): Array<[Point, Point]> {
	return pieces.flatMap(p => (p.kind === 'segments' ? p.segments : []));
}

function polygonsOf(pieces: BrushPiece[]): Point[][] {
	return pieces.flatMap(p => (p.kind === 'polygons' ? p.polygons : []));
}

function dotsOf(pieces: BrushPiece[]): Point[] {
	return pieces.flatMap(p => (p.kind === 'dots' ? p.points : []));
}

function count(pieces: BrushPiece[]): number {
	return segmentsOf(pieces).length + polygonsOf(pieces).length + dotsOf(pieces).length
		+ pieces.reduce((n, p) => n + (p.kind === 'symbols' ? p.at.length : 0), 0);
}

describe('brush catalogue', () => {
	it('lists 25 brushes with unique, valid ids and the three categories', () => {
		expect(BRUSHES.length).toBe(25);
		expect(new Set(ALL).size).toBe(ALL.length);
		for (const b of BRUSHES) {
			expect(b.id).toMatch(/^[a-z0-9-]{1,40}$/);
			expect(b.name.trim().length).toBeGreaterThan(0);
			expect(b.description.trim().length).toBeGreaterThan(0);
			expect(b.defaultStyle.brush).toBe(b.id);
			expect(isValidColor(b.defaultStyle.stroke)).toBe(true);
		}
		expect(new Set(BRUSHES.map(b => b.category))).toEqual(new Set(['natural', 'manmade', 'edges']));
	});

	it('names the brushes the migration and the plan rely on', () => {
		const expected = ['cliff', 'ledge', 'ridge', 'chasm', 'rocky-shore', 'river', 'stream', 'rapids', 'treeline', 'marsh-edge',
			'wall', 'stone-wall', 'castle-wall', 'palisade', 'fence', 'bars', 'ditch', 'road', 'track', 'trail', 'railway', 'border', 'province-line',
			'offmap', 'unexplored'];
		expect([...ALL].sort()).toEqual([...expected].sort());
	});

	it('looks brushes up by id and returns undefined for unknown ids', () => {
		expect(getBrush('cliff')?.name).toBe('Cliff');
		expect(getBrush('nope')).toBeUndefined();
		expect(getBrush('__proto__')).toBeUndefined();
	});

	it('groups every brush once, in picker order', () => {
		const groups = brushesByCategory();
		expect(groups.map(g => g.category)).toEqual(['natural', 'manmade', 'edges']);
		expect(groups.flatMap(g => g.brushes.map(b => b.id)).sort()).toEqual([...ALL].sort());
		for (const g of groups) for (const b of g.brushes) expect(b.category).toBe(g.category);
	});

	it('marks the one-sided brushes', () => {
		const oneSided = BRUSHES.filter(b => b.oneSided).map(b => b.id).sort();
		expect(oneSided).toEqual(['castle-wall', 'cliff', 'ledge', 'marsh-edge', 'palisade', 'rocky-shore', 'treeline'].sort());
	});
});

describe('brushPieces: every brush', () => {
	it('returns pieces for a two-point line, flipped or not', () => {
		for (const id of ALL) {
			expect(brushPieces(id, LINE, { width: 2, closed: false }).length, id).toBeGreaterThan(0);
			expect(brushPieces(id, LINE, { width: 2, closed: false, flip: true }).length, id).toBeGreaterThan(0);
		}
	});

	it('returns nothing for fewer than two points, or unknown ids', () => {
		for (const id of ALL) {
			expect(brushPieces(id, [], { width: 2, closed: false }), id).toEqual([]);
			expect(brushPieces(id, [{ x: 5, y: 5 }], { width: 2, closed: false }), id).toEqual([]);
			expect(brushPieces(id, [{ x: 5, y: 5 }, { x: 5, y: 5 }], { width: 2, closed: false }), id).toEqual([]);
		}
		expect(brushPieces('nope', LINE, { width: 2, closed: false })).toEqual([]);
	});

	it('draws closed shapes and open lines without throwing, and never writes non-finite numbers', () => {
		for (const id of ALL) {
			for (const closed of [false, true]) {
				for (const width of [0.1, 1, 4, 40]) {
					for (const scale of [0.5, 1, 3]) {
						const pieces = brushPieces(id, SQUARE, { width, closed, scale, flip: true });
						const svg = pieces.map(p => brushPieceMarkup(p, { color: '#123456' })).join('');
						expect(svg, `${id} ${closed} ${width} ${scale}`).not.toMatch(/NaN|Infinity|undefined/);
					}
				}
			}
		}
	});

	it('clamps width and scale instead of blowing up', () => {
		const small = brushPieces('cliff', LINE, { width: Number.NaN, closed: false });
		expect(small.length).toBeGreaterThan(0);
		const huge = brushPieces('cliff', LINE, { width: 1e9, closed: false, scale: 1e9 });
		expect(huge.length).toBeGreaterThan(0);
	});

	it('drops duplicate and non-finite points', () => {
		const messy = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: Number.NaN, y: 3 }, { x: 400, y: 0 }];
		expect(brushPieces('cliff', messy, { width: 2, closed: false })).toEqual(brushPieces('cliff', LINE, { width: 2, closed: false }));
	});
});

describe('piece counts scale', () => {
	it('gives twice as many ticks on a line twice as long', () => {
		const short = count(brushPieces('cliff', LINE, { width: 2, closed: false }));
		const long = count(brushPieces('cliff', [{ x: 0, y: 0 }, { x: 800, y: 0 }], { width: 2, closed: false }));
		expect(long).toBeGreaterThan(short * 1.8);
		expect(long).toBeLessThan(short * 2.2);
	});

	it('gives fewer marks when the width is larger, and fewer again at a larger brush scale', () => {
		const thin = count(brushPieces('cliff', LINE, { width: 2, closed: false }));
		const thick = count(brushPieces('cliff', LINE, { width: 8, closed: false }));
		expect(thick).toBeLessThan(thin * 0.6);
		const big = count(brushPieces('cliff', LINE, { width: 2, closed: false, scale: 2 }));
		expect(big).toBeLessThan(thin * 0.7);
	});

	it('keeps tick sizes proportional to the width', () => {
		const lengthOf = (pieces: BrushPiece[]): number => {
			const s = segmentsOf(pieces)[0];
			return Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
		};
		const a = lengthOf(brushPieces('cliff', LINE, { width: 4, closed: false }));
		const b = lengthOf(brushPieces('cliff', LINE, { width: 8, closed: false }));
		expect(b / a).toBeGreaterThan(1.8);
		expect(b / a).toBeLessThan(2.2);
	});

	it('draws stone walls as blocks and castle walls with merlons on one side', () => {
		expect(polygonsOf(brushPieces('stone-wall', LINE, { width: 3, closed: false })).length).toBeGreaterThan(5);
		expect(polygonsOf(brushPieces('castle-wall', LINE, { width: 3, closed: false })).length).toBeGreaterThan(5);
	});
});

describe('flip mirrors the marks of one-sided brushes', () => {
	/** Average sign of the offset of tick ends from their line, as y on a horizontal line. */
	function tickSide(pieces: BrushPiece[]): number {
		const segs = segmentsOf(pieces);
		return segs.reduce((n, [a, b]) => n + Math.sign(b.y - a.y), 0);
	}

	it('puts cliff ticks on the lower side, and on the upper side when flipped', () => {
		const normal = tickSide(brushPieces('cliff', LINE, { width: 2, closed: false }));
		const flipped = tickSide(brushPieces('cliff', LINE, { width: 2, closed: false, flip: true }));
		expect(normal).toBeGreaterThan(0);
		expect(flipped).toBeLessThan(0);
		expect(flipped).toBe(-normal);
	});

	it('mirrors ledge ticks and treeline and marsh symbols too', () => {
		expect(tickSide(brushPieces('ledge', LINE, { width: 1, closed: false, flip: true }))).toBeLessThan(0);
		const trees = (flip: boolean): number => brushPieces('treeline', LINE, { width: 2, closed: false, flip })
			.flatMap(p => (p.kind === 'symbols' ? p.at : []))
			.reduce((n, a) => n + Math.sign(a.p.y), 0);
		expect(trees(false)).toBeGreaterThan(0);
		expect(trees(true)).toBeLessThan(0);
		const reeds = brushPieces('marsh-edge', LINE, { width: 2, closed: false, flip: true })
			.flatMap(p => (p.kind === 'symbols' ? p.at : []));
		expect(reeds.every(a => a.p.y < 0)).toBe(true);
	});

	it('mirrors rocky shore blobs and castle merlons', () => {
		const blobsY = (flip: boolean): number[] => polygonsOf(brushPieces('rocky-shore', LINE, { width: 2, closed: false, flip }))
			.map(poly => poly.reduce((s, p) => s + p.y, 0) / poly.length);
		expect(blobsY(false).every(y => y > 0)).toBe(true);
		expect(blobsY(true).every(y => y < 0)).toBe(true);
		const merlonsY = (flip: boolean): number[] => polygonsOf(brushPieces('castle-wall', LINE, { width: 3, closed: false, flip }))
			.map(poly => poly.reduce((s, p) => s + p.y, 0) / poly.length);
		expect(merlonsY(false).every(y => y > 0)).toBe(true);
		expect(merlonsY(true).every(y => y < 0)).toBe(true);
	});

	it('does not move the marks of two-sided brushes', () => {
		for (const id of ['ridge', 'trail', 'railway', 'river', 'chasm', 'bars']) {
			expect(brushPieces(id, LINE, { width: 2, closed: false, flip: true }), id)
				.toEqual(brushPieces(id, LINE, { width: 2, closed: false, flip: false }));
		}
	});
});

describe('closed and open shapes', () => {
	it('puts no end breaks on closed shapes and draws them on open lines', () => {
		const openPieces = brushPieces('offmap', LINE, { width: 4, closed: false });
		expect(segmentsOf(openPieces).length).toBe(4);
		const closedPieces = brushPieces('offmap', SQUARE, { width: 4, closed: true });
		expect(segmentsOf(closedPieces)).toEqual([]);
		expect(closedPieces.length).toBe(1);
		expect(closedPieces[0]).toMatchObject({ kind: 'stroke', closed: true });
	});

	it('marks closed strokes as loops so the pattern continues around them', () => {
		for (const id of ['wall', 'river', 'stream', 'road', 'cliff']) {
			const pieces = brushPieces(id, SQUARE, { width: 2, closed: true });
			const strokes = pieces.filter(p => p.kind === 'stroke');
			expect(strokes.length, id).toBeGreaterThan(0);
			for (const s of strokes) expect(s.kind === 'stroke' && s.closed, id).toBe(true);
		}
	});

	it('puts cliff ticks outside a closed shape by default and inside when flipped', () => {
		const centre: Point = { x: 100, y: 100 };
		const outside = (flip: boolean): boolean[] => segmentsOf(brushPieces('cliff', SQUARE, { width: 2, closed: true, flip }))
			.map(([, b]) => !pointInPolygon(b, SQUARE) && Math.hypot(b.x - centre.x, b.y - centre.y) > 0);
		expect(outside(false).every(Boolean)).toBe(true);
		expect(outside(true).some(Boolean)).toBe(false);
	});

	it('spreads closed-loop marks evenly, with no gap at the start', () => {
		const pieces = brushPieces('trail', SQUARE, { width: 2, closed: true });
		const mids = segmentsOf(pieces).map(([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
		const gaps: number[] = [];
		for (let i = 0; i < mids.length; i++) {
			const j = (i + 1) % mids.length;
			gaps.push(Math.hypot(mids[j].x - mids[i].x, mids[j].y - mids[i].y));
		}
		const max = Math.max(...gaps);
		const min = Math.min(...gaps);
		expect(max / min).toBeLessThan(1.6);
	});
});

describe('specific brushes', () => {
	it('draws bars as dots only and border as a line with dots', () => {
		expect(brushPieces('bars', LINE, { width: 4, closed: false }).map(p => p.kind)).toEqual(['dots']);
		expect(brushPieces('border', LINE, { width: 2, closed: false }).map(p => p.kind)).toEqual(['stroke', 'dots']);
	});

	it('draws roads as two lines and rivers as two wavy lines', () => {
		const road = brushPieces('road', LINE, { width: 3, closed: false });
		expect(road.filter(p => p.kind === 'stroke').length).toBe(2);
		const river = brushPieces('river', LINE, { width: 3, closed: false });
		expect(river.filter(p => p.kind === 'stroke').length).toBe(2);
	});

	it('draws railway rails and ties, and ditch rails with ticks between', () => {
		const rail = brushPieces('railway', LINE, { width: 2, closed: false });
		expect(rail.filter(p => p.kind === 'stroke').length).toBe(2);
		expect(segmentsOf(rail).length).toBeGreaterThan(3);
		expect(brushPieces('ditch', LINE, { width: 1.5, closed: false }).filter(p => p.kind === 'stroke').length).toBe(2);
	});

	it('draws the province line as a dash and dot string', () => {
		const pieces = brushPieces('province-line', LINE, { width: 1.5, closed: false });
		const dashed = pieces.find(p => p.kind === 'stroke' && p.dash);
		expect(dashed).toMatchObject({ kind: 'stroke' });
		if (dashed && dashed.kind === 'stroke') expect(dashed.dash?.split(' ')).toHaveLength(4);
	});

	it('fades the unexplored line over four stretches', () => {
		const pieces = brushPieces('unexplored', LINE, { width: 2, closed: false });
		const opacities = pieces.map(p => (p.kind === 'stroke' ? p.opacity : undefined));
		expect(opacities).toEqual([1, 0.75, 0.5, 0.25]);
	});

	it('draws symbol pieces with tree, reeds and rock symbol ids and along the path', () => {
		const trees = brushPieces('treeline', LINE, { width: 2, closed: false }).find(p => p.kind === 'symbols');
		expect(trees).toMatchObject({ kind: 'symbols', symbol: 'tree' });
		if (trees && trees.kind === 'symbols') {
			expect(trees.at.every(a => Math.abs(a.angle) < 1e-6)).toBe(true);
		}
		const reeds = brushPieces('marsh-edge', LINE, { width: 2, closed: false }).find(p => p.kind === 'symbols');
		expect(reeds).toMatchObject({ kind: 'symbols', symbol: 'reeds' });
	});

	it('gives rapids chevrons alongside a wavy line', () => {
		const pieces = brushPieces('rapids', LINE, { width: 2, closed: false });
		expect(pieces.map(p => p.kind)).toEqual(['stroke', 'segments']);
	});
});

describe('brush markup and previews', () => {
	it('renders stroke pieces with the colour, dash and vector rules', () => {
		const svg = brushPieceMarkup({ kind: 'stroke', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], width: 2, dash: '0 4', cap: 'butt', opacity: 0.5 }, {
			color: '#abcdef', opacity: 0.8, vector: true,
		});
		expect(svg).toContain('stroke="#abcdef"');
		expect(svg).toContain('stroke-opacity="0.4"');
		expect(svg).toContain('stroke-dasharray="0 4"');
		expect(svg).toContain('stroke-linecap="butt"');
		expect(svg).toContain('vector-effect="non-scaling-stroke"');
	});

	it('escapes colours written into markup', () => {
		const svg = brushPieceMarkup({ kind: 'dots', points: [{ x: 1, y: 1 }], radius: 1, filled: true }, { color: 'red" onload="x' });
		expect(svg).not.toContain('onload="x"');
		expect(svg).toContain('&quot;');
	});

	it('draws symbols with the stroke colour and a halo when asked', () => {
		const piece: BrushPiece = { kind: 'symbols', symbol: 'tree', at: [{ p: { x: 5, y: 5 }, angle: 0 }], size: 12 };
		const plain = brushPieceMarkup(piece, { color: '#2e5e3a' });
		expect(plain).toContain('color="#2e5e3a"');
		expect(plain).not.toContain('paper');
		const haloed = brushPieceMarkup(piece, { color: '#2e5e3a', halo: '#f4ecd8' });
		expect(haloed).toContain('color="#f4ecd8"');
		expect(brushPieceMarkup(piece, { color: '#2e5e3a', lookupSymbol: () => undefined })).toBe('');
	});

	it('makes a preview svg for each known brush and nothing for an unknown one', () => {
		for (const id of ALL) {
			const svg = brushPreviewSvg(id, { width: 120, height: 28 });
			expect(svg, id).toMatch(/^<svg /);
			expect(svg, id).toContain('viewBox="0 0 120 28"');
			expect(svg, id).not.toMatch(/NaN|undefined/);
		}
		expect(brushPreviewSvg('nope')).toBe('');
	});

	it('keeps brush markup valid through normalizeInk style fields', () => {
		const doc = normalizeInk({
			items: [{ id: 'p', kind: 'path', points: [[0, 0], [1, 1]], style: { brush: 'cliff', brushFlip: true, brushScale: 1.5 } }],
		});
		expect(doc.items[0]).toMatchObject({ style: { brush: 'cliff', brushFlip: true, brushScale: 1.5 } });
	});
});
