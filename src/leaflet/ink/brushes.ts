/**
 * Barrier brushes for Map Ink: patterned lines for cliffs, walls, roads, rivers and
 * other edges. A brush replaces an item's dash style. Pieces are computed in
 * reference pixels, like dash geometry, so they scale with the map.
 *
 * Sizes are relative to the stroke width (u = width * brushScale), with small
 * minimums so a thin line still shows its marks. One-sided brushes draw on the
 * lower side of an open line (or the outside of a closed shape); brushFlip moves
 * the marks to the other side. Closed shapes wrap around with no end breaks.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type { InkStyle } from './model';
import type { Point, Segment } from './geometry';
import { getSymbol } from './symbols';

export type BrushCategory = 'natural' | 'manmade' | 'edges';

export interface InkBrush {
	id: string;
	name: string;
	category: BrushCategory;
	keywords: string[];
	oneSided: boolean;
	defaultStyle: Partial<InkStyle>;
	description: string;
}

export type BrushPiece =
	| { kind: 'stroke'; points: Point[]; closed?: boolean; width: number; dash?: string; cap?: 'round' | 'butt' | 'square'; opacity?: number }
	| { kind: 'segments'; segments: Segment[]; width: number; cap?: 'round' | 'butt' }
	| { kind: 'dots'; points: Point[]; radius: number; filled: boolean }
	| { kind: 'symbols'; symbol: string; at: { p: Point; angle: number }[]; size: number }
	| { kind: 'polygons'; polygons: Point[][]; filled: boolean; width: number };

export interface BrushOptions {
	/** Stroke width in reference pixels. */
	width: number;
	/** True for area outlines: the pattern runs around the loop with no end breaks. */
	closed: boolean;
	/** Moves the marks of one-sided brushes to the other side. */
	flip?: boolean;
	/** Spacing and tick size multiplier, 0.5 to 3. Default 1. */
	scale?: number;
}

export interface BrushPreviewOptions {
	width?: number;
	height?: number;
	color?: string;
}

export interface BrushMarkupOptions {
	color: string;
	/** Multiplies every piece's opacity. Default 1. */
	opacity?: number;
	/** Strokes keep their on-screen width (non-scaling-stroke). */
	vector?: boolean;
	/** Paper halo behind symbol pieces. Empty or undefined draws no halo. */
	halo?: string;
	lookupSymbol?: (id: string) => { body: string } | undefined;
}

const CATEGORY_NAMES: Record<BrushCategory, string> = {
	natural: 'Natural',
	manmade: 'Man-made',
	edges: 'Edges',
};

function brush(
	id: string,
	name: string,
	category: BrushCategory,
	keywords: string[],
	description: string,
	look: { stroke: string; width: number; oneSided?: boolean },
): InkBrush {
	return {
		id,
		name,
		category,
		keywords,
		oneSided: look.oneSided === true,
		description,
		defaultStyle: { brush: id, stroke: look.stroke, strokeWidth: look.width },
	};
}

/** Every brush, in the order the picker shows them. */
export const BRUSHES: readonly InkBrush[] = [
	brush('cliff', 'Cliff', 'natural', ['cliff', 'drop', 'escarpment', 'edge', 'heights'],
		'Heavy line with long ticks on the drop side.', { stroke: '#5c4a3a', width: 2, oneSided: true }),
	brush('ledge', 'Ledge', 'natural', ['ledge', 'step', 'shelf', 'terrace'],
		'Thin line with short ticks on the lower side.', { stroke: '#5c4a3a', width: 1.5, oneSided: true }),
	brush('ridge', 'Ridge', 'natural', ['ridge', 'spine', 'hills', 'hachure', 'mountain'],
		'A spine with short ticks alternating on both sides.', { stroke: '#6b5a4a', width: 1.5 }),
	brush('chasm', 'Chasm', 'natural', ['chasm', 'gorge', 'rift', 'crevasse', 'ravine'],
		'Two cliffs facing each other across a gap.', { stroke: '#3b2e24', width: 1.5 }),
	brush('rocky-shore', 'Rocky shore', 'natural', ['shore', 'coast', 'rocks', 'beach', 'reef'],
		'A line with small rock blobs on one side.', { stroke: '#6b6258', width: 1.5, oneSided: true }),
	brush('river', 'River', 'natural', ['river', 'waterway', 'flow'],
		'Two wavy lines that run together.', { stroke: '#3b6fa8', width: 3 }),
	brush('stream', 'Stream', 'natural', ['stream', 'creek', 'brook', 'rivulet'],
		'One wavy line.', { stroke: '#5f8fc4', width: 1.6 }),
	brush('rapids', 'Rapids', 'natural', ['rapids', 'falls', 'white water', 'torrent', 'chute'],
		'A wavy line with chevrons pointing downstream.', { stroke: '#2e7d9c', width: 1.5 }),
	brush('treeline', 'Treeline', 'natural', ['treeline', 'trees', 'forest edge', 'woods', 'grove'],
		'A line of small trees on one side.', { stroke: '#2e5e3a', width: 1.5, oneSided: true }),
	brush('marsh-edge', 'Marsh edge', 'natural', ['marsh', 'swamp', 'reeds', 'bog', 'fen'],
		'A line with reed tufts on one side.', { stroke: '#4f6b3a', width: 1.5, oneSided: true }),

	brush('wall', 'Wall', 'manmade', ['wall', 'rampart', 'barrier'],
		'A thick solid line.', { stroke: '#2b2b2b', width: 4 }),
	brush('stone-wall', 'Stone wall', 'manmade', ['stone wall', 'masonry', 'blocks', 'bricks'],
		'A line of outlined blocks.', { stroke: '#5f5a52', width: 3 }),
	brush('castle-wall', 'Castle wall', 'manmade', ['castle', 'battlements', 'crenellations', 'fort', 'merlons'],
		'A wall with square merlons on one side.', { stroke: '#4a4540', width: 3, oneSided: true }),
	brush('palisade', 'Palisade', 'manmade', ['palisade', 'stakes', 'stockade', 'pales'],
		'A line with pointed stakes on one side.', { stroke: '#6b4f2e', width: 2.5, oneSided: true }),
	brush('fence', 'Fence', 'manmade', ['fence', 'posts', 'paddock', 'pasture'],
		'A thin line with square posts along it.', { stroke: '#7a5c3a', width: 1.5 }),
	brush('bars', 'Bars', 'manmade', ['bars', 'portcullis', 'gate', 'grate', 'row of dots'],
		'A row of thick dots.', { stroke: '#2b2b2b', width: 4 }),
	brush('ditch', 'Ditch', 'manmade', ['ditch', 'moat', 'trench', 'dyke'],
		'Two thin lines with ticks between them.', { stroke: '#5c4a3a', width: 1.5 }),
	brush('road', 'Road', 'manmade', ['road', 'highway', 'way', 'path', 'street'],
		'Two lines close together.', { stroke: '#7a5c3a', width: 3 }),
	brush('track', 'Track', 'manmade', ['track', 'dirt road', 'cart track'],
		'One solid line.', { stroke: '#8b6b4a', width: 2 }),
	brush('trail', 'Trail', 'manmade', ['trail', 'footpath', 'path'],
		'A thin line with ticks across it.', { stroke: '#6b5a3e', width: 1.2 }),
	brush('railway', 'Railway', 'manmade', ['railway', 'railroad', 'rail', 'tracks'],
		'Two rails with ties across.', { stroke: '#3a3a3a', width: 2 }),
	brush('border', 'Border', 'manmade', ['border', 'frontier', 'boundary'],
		'A thin line with small dots along it.', { stroke: '#8e2c2c', width: 2 }),
	brush('province-line', 'Province line', 'manmade', ['province', 'county', 'district', 'dash dot'],
		'A dash and dot line.', { stroke: '#5f6368', width: 1.5 }),

	brush('offmap', 'Off-map edge', 'edges', ['off map', 'edge of the world', 'slanted breaks', 'map edge'],
		'A thick line ending in slanted breaks.', { stroke: '#2b2b2b', width: 4 }),
	brush('unexplored', 'Unexplored', 'edges', ['unexplored', 'unknown', 'fading', 'mist', 'uncharted'],
		'A line that fades into dashes and dots.', { stroke: '#5f6368', width: 2 }),
];

const BY_ID = new Map<string, InkBrush>(BRUSHES.map(b => [b.id, b]));

/** A brush by id, or undefined for an unknown id. */
export function getBrush(id: string): InkBrush | undefined {
	return BY_ID.get(id);
}

/** The brushes grouped by category, in picker order. */
export function brushesByCategory(): { category: BrushCategory; name: string; brushes: InkBrush[] }[] {
	const order: BrushCategory[] = ['natural', 'manmade', 'edges'];
	return order.map(category => ({
		category,
		name: CATEGORY_NAMES[category],
		brushes: BRUSHES.filter(b => b.category === category),
	}));
}

// ---- geometry -----------------------------------------------------------------

/** Internal drawing context for one call to brushPieces. */
interface Ctx {
	pts: Point[];
	closed: boolean;
	/** Stroke width. */
	w: number;
	/** Width times brush scale: the unit every size is measured in. */
	u: number;
	flip: boolean;
	/** Sign of the left normal that points outside a closed shape. */
	outSign: number;
	total: number;
	segs: Seg[];
}

interface Seg {
	a: Point;
	b: Point;
	len: number;
	t: Point;
	n: Point;
	start: number;
}

interface Frame {
	p: Point;
	t: Point;
	n: Point;
	s: number;
}

function cleanPoints(input: readonly Point[]): Point[] {
	const out: Point[] = [];
	for (const p of input) {
		if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
		const last = out[out.length - 1];
		if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
		out.push({ x: p.x, y: p.y });
	}
	return out;
}

function buildSegs(pts: Point[], closed: boolean): { segs: Seg[]; total: number } {
	const segs: Seg[] = [];
	let total = 0;
	const n = pts.length;
	const count = closed ? n : n - 1;
	for (let i = 0; i < count; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % n];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		if (len <= 1e-9) continue;
		const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
		segs.push({ a, b, len, t, n: { x: -t.y, y: t.x }, start: total });
		total += len;
	}
	return { segs, total };
}

/** Shoelace area sign: -1 when the left normal of a closed shape points inward. */
function outwardSign(pts: Point[]): number {
	let twiceArea = 0;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		twiceArea += a.x * b.y - b.x * a.y;
	}
	return twiceArea > 0 ? -1 : 1;
}

/** The frame (point, tangent, left normal) at arc length s. */
function frameAt(segs: Seg[], s: number): Frame {
	let lo = 0;
	let hi = segs.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (segs[mid].start <= s) lo = mid;
		else hi = mid - 1;
	}
	const g = segs[lo];
	const t = Math.min(1, Math.max(0, (s - g.start) / g.len));
	return {
		p: { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t },
		t: g.t,
		n: g.n,
		s,
	};
}

/**
 * Arc lengths for marks every `spacing`. Open lines start at 0 and end at the last
 * mark that fits. Closed loops get whole spacing that wraps evenly; `even` makes the
 * count even, for alternating marks.
 */
function spaced(total: number, closed: boolean, spacing: number, even = false): { at: number[]; step: number } {
	if (!(total > 0) || !(spacing > 0)) return { at: [], step: 0 };
	if (closed) {
		let count = Math.max(3, Math.round(total / spacing));
		if (even) count = 2 * Math.max(2, Math.round(count / 2));
		const step = total / count;
		return { at: Array.from({ length: count }, (_, i) => i * step), step };
	}
	const count = Math.floor(total / spacing + 1e-9);
	const at: number[] = [];
	for (let i = 0; i <= count; i++) at.push(Math.min(total, i * spacing));
	return { at, step: spacing };
}

function framesEvery(c: Ctx, spacing: number, even = false): Frame[] {
	return spaced(c.total, c.closed, spacing, even).at.map(s => frameAt(c.segs, s));
}

/** Pairs of frames bounding each stretch of `spacing` length. */
function spans(c: Ctx, spacing: number, even = false): Array<[Frame, Frame]> {
	const { at, step } = spaced(c.total, c.closed, spacing, even);
	const out: Array<[Frame, Frame]> = [];
	for (const s0 of at) {
		if (!c.closed && s0 >= c.total - 1e-9) continue;
		const raw = s0 + step;
		const s1 = c.closed ? raw % c.total : Math.min(c.total, raw);
		out.push([frameAt(c.segs, s0), frameAt(c.segs, s1)]);
	}
	return out;
}

/** Which side of the line a one-sided mark goes on: +1 for the left normal, -1 for the right. */
function sideSign(f: Frame, c: Ctx): number {
	const base = c.closed
		? c.outSign
		: (f.n.y < -1e-9 || (Math.abs(f.n.y) <= 1e-9 && f.n.x > 0) ? -1 : 1);
	return c.flip ? -base : base;
}

function move(p: Point, v: Point, d: number): Point {
	return { x: p.x + v.x * d, y: p.y + v.y * d };
}

function leftNormal(a: Point, b: Point): Point {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const l = Math.hypot(dx, dy);
	if (l === 0) return { x: 0, y: 0 };
	return { x: -dy / l, y: dx / l };
}

/** The line pushed sideways by d (positive is the left normal). Corners use averaged normals; closed lines wrap. */
function offsetPts(c: Ctx, d: number): Point[] {
	const pts = c.pts;
	const n = pts.length;
	return pts.map((p, i) => {
		const hasPrev = c.closed || i > 0;
		const hasNext = c.closed || i < n - 1;
		const prev = pts[(i - 1 + n) % n];
		const next = pts[(i + 1) % n];
		let normal: Point;
		if (!hasPrev) normal = leftNormal(p, next);
		else if (!hasNext) normal = leftNormal(prev, p);
		else {
			const n1 = leftNormal(prev, p);
			const n2 = leftNormal(p, next);
			const sum = { x: n1.x + n2.x, y: n1.y + n2.y };
			const l = Math.hypot(sum.x, sum.y);
			if (l < 1e-9) normal = n1;
			else {
				const avg = { x: sum.x / l, y: sum.y / l };
				const scale = 1 / Math.max(0.5, avg.x * n1.x + avg.y * n1.y);
				normal = { x: avg.x * scale, y: avg.y * scale };
			}
		}
		return { x: p.x + normal.x * d, y: p.y + normal.y * d };
	});
}

/** A sine wave riding along the line, `offset` pixels to the left. Closed loops use whole cycles. */
function wavePts(c: Ctx, offset: number, amp: number, period: number, phase = 0): Point[] {
	const total = c.total;
	const per = c.closed ? total / Math.max(1, Math.round(total / period)) : period;
	const step = Math.max(0.5, per / 8);
	const count = c.closed ? Math.max(8, Math.ceil(total / step)) : Math.floor(total / step) + 1;
	const stepS = c.closed ? total / count : step;
	const out: Point[] = [];
	for (let i = 0; i < count; i++) {
		const s = i * stepS;
		const f = frameAt(c.segs, s);
		const off = offset + amp * Math.sin(phase + (2 * Math.PI * s) / per);
		out.push({ x: f.p.x + f.n.x * off, y: f.p.y + f.n.y * off });
	}
	return out;
}

function angleOf(t: Point): number {
	let deg = (Math.atan2(t.y, t.x) * 180) / Math.PI;
	while (deg > 90) deg -= 180;
	while (deg <= -90) deg += 180;
	return deg;
}

/** Round to 2 decimals, so dash strings and attributes stay short and stable. */
function n2(v: number): number {
	return Math.round(v * 100) / 100 + 0;
}

function seg(a: Point, b: Point): Segment {
	return [a, b];
}

function strokeOf(c: Ctx, width: number, cap: 'round' | 'butt' = 'round', pts: Point[] = c.pts): BrushPiece {
	return c.closed
		? { kind: 'stroke', points: pts, closed: true, width, cap }
		: { kind: 'stroke', points: pts, width, cap };
}

function segmentsOf(segments: Segment[], width: number, cap: 'round' | 'butt' = 'round'): BrushPiece {
	return { kind: 'segments', segments, width, cap };
}

function polygonsOf(polygons: Point[][], filled: boolean, width = 0): BrushPiece {
	return { kind: 'polygons', polygons, filled, width };
}

/** Symbol marks on the side of the line, turned to follow it. */
function edgeSymbols(c: Ctx, symbol: string, size: number, spacing: number): BrushPiece {
	const at = framesEvery(c, spacing).map(f => ({
		p: move(f.p, f.n, sideSign(f, c) * size * 0.45),
		angle: angleOf(f.t),
	}));
	return { kind: 'symbols', symbol, at, size };
}

const BLOB_FACTORS = [1, 0.78, 0.92, 0.7, 0.96, 0.8];

/** A small irregular rock, stretched along the shore. */
function blob(centre: Point, t: Point, n: Point, r: number, seed: number): Point[] {
	const scale = seed % 2 === 0 ? 1 : 0.9;
	return BLOB_FACTORS.map((k, j) => {
		const a = (2 * Math.PI * j) / BLOB_FACTORS.length;
		const rr = r * k * scale;
		const along = Math.cos(a) * rr * 1.25;
		const across = Math.sin(a) * rr * 0.9;
		return { x: centre.x + t.x * along + n.x * across, y: centre.y + t.y * along + n.y * across };
	});
}

/** Short cross strokes at the ends of an open line, as in the old Maplog off-map edge. */
function slantBreaks(c: Ctx, size: number): Segment[] {
	const pts = c.pts;
	const n = pts.length;
	const ends: Array<[Point, Point]> = [[pts[0], pts[1]], [pts[n - 1], pts[n - 2]]];
	const out: Segment[] = [];
	for (const [end, toward] of ends) {
		const dx = toward.x - end.x;
		const dy = toward.y - end.y;
		const len = Math.hypot(dx, dy);
		if (len === 0) continue;
		const dir = { x: dx / len, y: dy / len };
		const normal = { x: -dir.y, y: dir.x };
		for (const shift of [-0.25, 0.25]) {
			const centre = move(end, dir, size * shift);
			out.push(seg(
				{ x: centre.x + (normal.x * size) / 2 - (dir.x * size) / 3, y: centre.y + (normal.y * size) / 2 - (dir.y * size) / 3 },
				{ x: centre.x - (normal.x * size) / 2 + (dir.x * size) / 3, y: centre.y - (normal.y * size) / 2 + (dir.y * size) / 3 },
			));
		}
	}
	return out;
}

type Drawer = (c: Ctx) => BrushPiece[];

const DRAWERS = new Map<string, Drawer>([
	// Natural
	['cliff', c => {
		const len = Math.max(2.5, 4 * c.u);
		const ticks = framesEvery(c, Math.max(3, 4.5 * c.u)).map(f => seg(f.p, move(f.p, f.n, sideSign(f, c) * len)));
		return [strokeOf(c, c.w), segmentsOf(ticks, Math.max(0.6, c.u), 'butt')];
	}],
	['ledge', c => {
		const len = Math.max(2.2, (5 / 1.5) * c.u);
		const ticks = framesEvery(c, Math.max(3, (7 / 1.5) * c.u)).map(f => seg(f.p, move(f.p, f.n, sideSign(f, c) * len)));
		return [strokeOf(c, c.w), segmentsOf(ticks, Math.max(0.5, c.u), 'butt')];
	}],
	['ridge', c => {
		const len = Math.max(2.2, 2.6 * c.u);
		const ticks = framesEvery(c, Math.max(3, 3.4 * c.u)).map((f, i) => seg(f.p, move(f.p, f.n, i % 2 === 0 ? len : -len)));
		return [strokeOf(c, c.w), segmentsOf(ticks, Math.max(0.5, 0.8 * c.u), 'butt')];
	}],
	['chasm', c => {
		const g = Math.max(2.2, 1.6 * c.u);
		const reach = Math.max(1.5, 0.85 * g);
		const ticks: Segment[] = [];
		for (const f of framesEvery(c, Math.max(3, 4 * c.u))) {
			ticks.push(seg(move(f.p, f.n, g), move(f.p, f.n, g - reach)));
			ticks.push(seg(move(f.p, f.n, -g), move(f.p, f.n, -g + reach)));
		}
		return [
			strokeOf(c, c.w, 'round', offsetPts(c, g)),
			strokeOf(c, c.w, 'round', offsetPts(c, -g)),
			segmentsOf(ticks, Math.max(0.5, 0.8 * c.u), 'butt'),
		];
	}],
	['rocky-shore', c => {
		const r = Math.max(1.6, 2.2 * c.u);
		const polys = framesEvery(c, Math.max(5, 6 * c.u)).map((f, i) => {
			const centre = move(f.p, f.n, sideSign(f, c) * r * 0.7);
			return blob(centre, f.t, f.n, r, i);
		});
		return [strokeOf(c, c.w), polygonsOf(polys, true)];
	}],
	['river', c => {
		const o = Math.max(1.5, c.u);
		const lw = Math.max(0.7, (1.6 / 3) * c.u);
		const amp = Math.max(0.8, (1.8 / 3) * c.u);
		const per = Math.max(5, (10 / 3) * c.u);
		return [
			{ kind: 'stroke', points: wavePts(c, o, amp, per, 0), closed: c.closed || undefined, width: lw, cap: 'round' },
			{ kind: 'stroke', points: wavePts(c, -o, amp, per, Math.PI), closed: c.closed || undefined, width: lw, cap: 'round' },
		];
	}],
	['stream', c => [
		{ kind: 'stroke', points: wavePts(c, 0, Math.max(0.8, (2.2 / 1.6) * c.u), Math.max(5, (9 / 1.6) * c.u)), closed: c.closed || undefined, width: Math.max(0.7, c.u), cap: 'round' },
	]],
	['rapids', c => {
		const water: BrushPiece = {
			kind: 'stroke',
			points: wavePts(c, 0, Math.max(0.6, 0.6 * c.u), Math.max(4, 4 * c.u)),
			closed: c.closed || undefined,
			width: Math.max(0.7, 0.8 * c.u),
			cap: 'round',
		};
		const size = Math.max(2, 1.6 * c.u);
		const chevrons: Segment[] = [];
		for (const f of framesEvery(c, Math.max(6, 6.5 * c.u))) {
			const apex = move(f.p, f.t, size * 0.6);
			const back = move(f.p, f.t, -size * 0.6);
			chevrons.push(seg(move(back, f.n, size), apex), seg(apex, move(back, f.n, -size)));
		}
		return [water, segmentsOf(chevrons, Math.max(0.6, 0.7 * c.u))];
	}],
	['treeline', c => {
		const size = Math.max(8, 7 * c.u);
		return [strokeOf(c, c.w), edgeSymbols(c, 'tree', size, Math.max(3, size * 0.8))];
	}],
	['marsh-edge', c => {
		const size = Math.max(7, 6 * c.u);
		return [strokeOf(c, c.w), edgeSymbols(c, 'reeds', size, Math.max(3, size * 0.75))];
	}],

	// Man-made
	['wall', c => [strokeOf(c, c.w)]],
	['stone-wall', c => {
		const blocks = spans(c, Math.max(3, 2.6 * c.u)).map(([a, b]) => {
			const h = Math.max(1, 0.9 * c.u);
			return [move(a.p, a.n, -h), move(b.p, b.n, -h), move(b.p, b.n, h), move(a.p, a.n, h)];
		});
		return [polygonsOf(blocks, false, Math.max(0.5, 0.45 * c.u))];
	}],
	['castle-wall', c => {
		const merlon = Math.max(3, 2 * c.u);
		const height = Math.max(1.5, 1.1 * c.u);
		const polys = spans(c, merlon, true)
			.filter((_, i) => i % 2 === 0)
			.map(([a, b]) => {
				const side = sideSign(a, c);
				return [a.p, move(a.p, a.n, side * height), move(b.p, b.n, side * height), b.p];
			});
		return [strokeOf(c, c.w), polygonsOf(polys, true)];
	}],
	['palisade', c => {
		const height = Math.max(2.5, 3 * c.u);
		const half = Math.max(0.7, 0.55 * c.u);
		const stakes = framesEvery(c, Math.max(2.4, 2.2 * c.u)).map(f => {
			const tip = move(f.p, f.n, sideSign(f, c) * height);
			return [move(f.p, f.t, -half), tip, move(f.p, f.t, half)];
		});
		return [strokeOf(c, Math.max(0.8, 0.7 * c.u)), polygonsOf(stakes, true)];
	}],
	['fence', c => {
		const h = Math.max(1.3, 1.5 * c.u);
		const posts = framesEvery(c, Math.max(3.2, 3.6 * c.u)).map(f => [
			move(move(f.p, f.t, -h), f.n, -h),
			move(move(f.p, f.t, h), f.n, -h),
			move(move(f.p, f.t, h), f.n, h),
			move(move(f.p, f.t, -h), f.n, h),
		]);
		return [strokeOf(c, Math.max(0.6, 0.6 * c.u)), polygonsOf(posts, true)];
	}],
	['bars', c => [{
		kind: 'dots',
		points: framesEvery(c, Math.max(2.4, 1.5 * c.u)).map(f => f.p),
		radius: Math.max(0.8, 0.5 * c.u),
		filled: true,
	}]],
	['ditch', c => {
		const h = Math.max(1.2, c.u);
		const rail = Math.max(0.5, 0.35 * c.u);
		const joins = framesEvery(c, Math.max(2.2, 1.8 * c.u)).map(f => seg(move(f.p, f.n, -h), move(f.p, f.n, h)));
		return [
			strokeOf(c, rail, 'butt', offsetPts(c, h)),
			strokeOf(c, rail, 'butt', offsetPts(c, -h)),
			segmentsOf(joins, Math.max(0.4, 0.3 * c.u), 'butt'),
		];
	}],
	['road', c => {
		const o = Math.max(1, (2.5 / 3) * c.u);
		const lw = Math.max(0.5, (1.6 / 3) * c.u);
		return [strokeOf(c, lw, 'round', offsetPts(c, o)), strokeOf(c, lw, 'round', offsetPts(c, -o))];
	}],
	['track', c => [strokeOf(c, c.w)]],
	['trail', c => {
		const half = Math.max(1.4, (3.5 / 1.2) * c.u);
		const ticks = framesEvery(c, Math.max(3, (8 / 1.2) * c.u)).map(f => seg(move(f.p, f.n, -half), move(f.p, f.n, half)));
		return [strokeOf(c, c.w), segmentsOf(ticks, Math.max(0.5, c.u), 'butt')];
	}],
	['railway', c => {
		const g = Math.max(3, 2.2 * c.u);
		const rail = Math.max(0.5, 0.45 * c.u);
		const half = g * 0.95;
		const ties = framesEvery(c, Math.max(4, 1.2 * g)).map(f => seg(move(f.p, f.n, -half), move(f.p, f.n, half)));
		return [
			strokeOf(c, rail, 'butt', offsetPts(c, g / 2)),
			strokeOf(c, rail, 'butt', offsetPts(c, -g / 2)),
			segmentsOf(ties, Math.max(0.7, 0.7 * c.u), 'butt'),
		];
	}],
	['border', c => [
		strokeOf(c, Math.max(0.5, 0.5 * c.u)),
		{ kind: 'dots', points: framesEvery(c, Math.max(3, 4.5 * c.u)).map(f => f.p), radius: Math.max(0.8, 0.9 * c.u), filled: true },
	]],
	['province-line', c => {
		const dash = Math.max(2, 4 * c.u);
		const gap = Math.max(1.2, 2 * c.u);
		return [{
			kind: 'stroke',
			points: c.pts,
			closed: c.closed || undefined,
			width: c.w,
			cap: 'round',
			dash: `${n2(dash)} ${n2(gap)} 0 ${n2(gap)}`,
		}];
	}],

	// Edges
	['offmap', c => {
		const pieces: BrushPiece[] = [strokeOf(c, c.w)];
		if (!c.closed) pieces.push(segmentsOf(slantBreaks(c, Math.max(4, 2.5 * c.u)), Math.max(0.5, 0.5 * c.u), 'butt'));
		return pieces;
	}],
	['unexplored', c => {
		// Four stretches, each one more faded: solid dashes, then longer gaps, then dots.
		const looks: Array<{ dash: number; gap: number; opacity: number }> = [
			{ dash: 4, gap: 2.5, opacity: 1 },
			{ dash: 2.5, gap: 3, opacity: 0.75 },
			{ dash: 0, gap: 3, opacity: 0.5 },
			{ dash: 0, gap: 5, opacity: 0.25 },
		];
		const step = Math.max(0.75, c.total / 2000, 0.5 * c.u);
		return looks.map((look, i) => {
			const s0 = (c.total * i) / looks.length;
			const s1 = (c.total * (i + 1)) / looks.length;
			const pts: Point[] = [];
			for (let s = s0; s < s1; s += step) pts.push(frameAt(c.segs, s).p);
			pts.push(frameAt(c.segs, s1).p);
			return {
				kind: 'stroke' as const,
				points: pts,
				width: c.w,
				cap: 'round' as const,
				dash: `${n2(look.dash * c.u)} ${n2(Math.max(0.5, look.gap * c.u))}`,
				opacity: look.opacity,
			};
		});
	}],
]);

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
	const n = typeof v === 'number' ? v : Number.NaN;
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/**
 * The pieces that draw brush `id` along `points`, in the same space as the points.
 * Unknown brushes and fewer than two distinct points give no pieces.
 */
export function brushPieces(id: string, points: readonly Point[], o: BrushOptions): BrushPiece[] {
	const draw = DRAWERS.get(id);
	if (!draw) return [];
	let pts = cleanPoints(points);
	let closed = o.closed === true && pts.length >= 3;
	if (closed && pts.length > 3) {
		const first = pts[0];
		const last = pts[pts.length - 1];
		if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) pts = pts.slice(0, -1);
	}
	if (pts.length < 2) return [];
	closed = closed && pts.length >= 3;
	const w = clampNum(o.width, 0.1, 500, 2);
	const scale = clampNum(o.scale, 0.5, 3, 1);
	const { segs, total } = buildSegs(pts, closed);
	if (!(total > 0) || segs.length === 0) return [];
	const ctx: Ctx = {
		pts,
		closed,
		w,
		u: w * scale,
		flip: o.flip === true,
		outSign: closed ? outwardSign(pts) : 1,
		total,
		segs,
	};
	return draw(ctx);
}

// ---- rendering ----------------------------------------------------------------

function fmt(n: number): string {
	if (!Number.isFinite(n)) return '0';
	return String(n2(n));
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function polyD(points: readonly Point[]): string {
	return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join('');
}

/** SVG markup for one brush piece. Colours are the stroke colour; symbols use currentColor through `color`. */
export function brushPieceMarkup(piece: BrushPiece, o: BrushMarkupOptions): string {
	const color = escapeAttr(o.color);
	const op = o.opacity === undefined ? 1 : Math.min(1, Math.max(0, o.opacity));
	const vec = o.vector ? ' vector-effect="non-scaling-stroke"' : '';
	switch (piece.kind) {
		case 'stroke': {
			if (piece.points.length < 2) return '';
			const d = polyD(piece.points) + (piece.closed ? 'Z' : '');
			const dash = piece.dash ? ` stroke-dasharray="${escapeAttr(piece.dash)}"` : '';
			const pOp = op * (piece.opacity === undefined ? 1 : piece.opacity);
			return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${fmt(pOp)}"`
				+ ` stroke-width="${fmt(piece.width)}" stroke-linecap="${piece.cap ?? 'round'}" stroke-linejoin="round"${dash}${vec}/>`;
		}
		case 'segments': {
			if (piece.segments.length === 0) return '';
			const d = piece.segments.map(([a, b]) => `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`).join('');
			return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${fmt(op)}"`
				+ ` stroke-width="${fmt(piece.width)}" stroke-linecap="${piece.cap ?? 'round'}" stroke-linejoin="round"${vec}/>`;
		}
		case 'dots': {
			if (piece.points.length === 0) return '';
			const circles = piece.points.map(p => {
				if (piece.filled) return `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(piece.radius)}"/>`;
				const sw = Math.max(0.5, piece.radius * 0.35);
				return `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(Math.max(0.1, piece.radius - sw / 2))}"/>`;
			}).join('');
			if (piece.filled) return `<g fill="${color}" fill-opacity="${fmt(op)}" stroke="none">${circles}</g>`;
			const sw = Math.max(0.5, piece.radius * 0.35);
			return `<g fill="none" stroke="${color}" stroke-opacity="${fmt(op)}" stroke-width="${fmt(sw)}">${circles}</g>`;
		}
		case 'polygons': {
			const outline = piece.width > 0;
			return piece.polygons
				.filter(poly => poly.length >= 3)
				.map(poly => `<path d="${polyD(poly)}Z" fill="${piece.filled ? color : 'none'}" fill-opacity="${fmt(op)}"`
					+ (outline
						? ` stroke="${color}" stroke-opacity="${fmt(op)}" stroke-width="${fmt(piece.width)}" stroke-linejoin="round"`
						: ' stroke="none"')
					+ '/>')
				.join('');
		}
		case 'symbols': {
			const lookup = o.lookupSymbol ?? getSymbol;
			const symbol = lookup(piece.symbol);
			if (!symbol || piece.at.length === 0) return '';
			const k = piece.size / 24;
			// Thin symbols get a heavier stroke when small, so they stay visible at map scale.
			const sw = 1.75 * Math.max(1, 14 / Math.max(1, piece.size));
			const halo = o.halo ? escapeAttr(o.halo) : '';
			const body = symbol.body;
			const haloMarkup = halo
				? `<g fill="none" stroke="currentColor" stroke-width="${fmt(sw + 3)}" stroke-linecap="round" stroke-linejoin="round" color="${halo}">${body}</g>`
				: '';
			const inner = `${haloMarkup}<g fill="none" stroke="currentColor" stroke-width="${fmt(sw)}" stroke-linecap="round" stroke-linejoin="round" color="${color}">${body}</g>`;
			const marks = piece.at.map(a => `<g transform="translate(${fmt(a.p.x)} ${fmt(a.p.y)}) rotate(${fmt(a.angle)}) scale(${fmt(k)}) translate(-12 -12)">${inner}</g>`).join('');
			return op < 1 ? `<g opacity="${fmt(op)}">${marks}</g>` : marks;
		}
		default:
			return '';
	}
}

/**
 * A small standalone SVG of the brush along a gentle wave, for pickers and
 * thumbnails. Colour defaults to currentColor. Unknown ids give an empty string.
 */
export function brushPreviewSvg(id: string, o: BrushPreviewOptions = {}): string {
	if (!getBrush(id)) return '';
	const width = clampNum(o.width, 8, 2000, 120);
	const height = clampNum(o.height, 8, 2000, 28);
	const color = o.color ?? 'currentColor';
	const pts: Point[] = [];
	for (let x = 8; x <= width - 8 + 1e-9; x += 4) {
		pts.push({ x, y: height / 2 + Math.sin(x / (width / 6)) * height * 0.18 });
	}
	const body = brushPieces(id, pts, { width: 2.4, closed: false })
		.map(piece => brushPieceMarkup(piece, { color }))
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}" class="ink-brush-preview">${body}</svg>`;
}
