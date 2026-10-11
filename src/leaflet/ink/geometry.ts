/**
 * Geometry helpers for Map Ink. Points are {x, y} in pixels: the layer projects
 * latlng to pixels at the reference zoom, so stroke patterns are computed once
 * per edit and scale with the map.
 *
 * Screen y points down. Positive rotation is clockwise on screen.
 * Pure TypeScript: no Obsidian or DOM imports.
 */

export interface Point {
	x: number;
	y: number;
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export type Segment = [Point, Point];

export type TickSide = 'lower' | 'both' | 'left' | 'right';

function sub(a: Point, b: Point): Point {
	return { x: a.x - b.x, y: a.y - b.y };
}

function len(v: Point): number {
	return Math.hypot(v.x, v.y);
}

function fmt(n: number): string {
	return String(Math.round(n * 100) / 100 + 0);
}

function pt(p: Point): string {
	return `${fmt(p.x)} ${fmt(p.y)}`;
}

/** Unit normal on the left of the direction a to b. */
function leftNormal(a: Point, b: Point): Point {
	const d = sub(b, a);
	const l = len(d);
	if (l === 0) return { x: 0, y: 0 };
	return { x: -d.y / l, y: d.x / l };
}

/** Normal on the lower side of a segment: the side with the larger y, or the left side of a vertical line. */
function lowerNormal(a: Point, b: Point): Point {
	const n = leftNormal(a, b);
	if (n.y < -1e-9 || (Math.abs(n.y) <= 1e-9 && n.x > 0)) return { x: -n.x, y: -n.y };
	return n;
}

/** Distance from p to the segment a-b (not the infinite line). */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const l2 = dx * dx + dy * dy;
	if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from p to the nearest point of an open polyline (or a single point). */
export function distanceToPolyline(p: Point, points: readonly Point[]): number {
	if (points.length === 0) return Infinity;
	if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y);
	let best = Infinity;
	for (let i = 1; i < points.length; i++) {
		best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]));
	}
	return best;
}

/** Total length of a polyline. */
export function polylineLength(points: readonly Point[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) total += len(sub(points[i], points[i - 1]));
	return total;
}

/** The segment that contains distance s along the polyline, clamped to its ends. */
function segmentAt(points: readonly Point[], s: number): { a: Point; b: Point; t: number } {
	let remaining = Math.max(0, s);
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const seg = len(sub(b, a));
		if (remaining <= seg || i === points.length - 1) {
			const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
			return { a, b, t };
		}
		remaining -= seg;
	}
	return { a: points[0], b: points[0], t: 0 };
}

function sampleAt(points: readonly Point[], s: number): { point: Point; a: Point; b: Point } {
	const { a, b, t } = segmentAt(points, s);
	return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, a, b };
}

/**
 * Ramer-Douglas-Peucker simplification. Keeps the first and last points and
 * every point farther than `tolerance` from the simplified line. Always returns new objects.
 */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
	const n = points.length;
	const copy = points.map(p => ({ x: p.x, y: p.y }));
	if (n <= 2 || !(tolerance > 0)) return copy;
	const keep: boolean[] = new Array<boolean>(n).fill(false);
	keep[0] = true;
	keep[n - 1] = true;
	const stack: Array<[number, number]> = [[0, n - 1]];
	while (stack.length > 0) {
		const [a, b] = stack.pop() as [number, number];
		let maxDistance = 0;
		let index = -1;
		for (let i = a + 1; i < b; i++) {
			const d = distanceToSegment(points[i], points[a], points[b]);
			if (d > maxDistance) {
				maxDistance = d;
				index = i;
			}
		}
		if (index >= 0 && maxDistance > tolerance) {
			keep[index] = true;
			stack.push([a, index], [index, b]);
		}
	}
	return copy.filter((_, i) => keep[i]);
}

/**
 * SVG path data through the points using Catmull-Rom splines, converted to cubic
 * Bezier segments. Closed paths wrap around and end with Z.
 */
export function smoothPath(points: readonly Point[], closed: boolean): string {
	const n = points.length;
	if (n === 0) return '';
	if (n === 1) return `M${pt(points[0])}`;
	const at = (i: number): Point => {
		if (closed) return points[((i % n) + n) % n];
		return points[Math.min(n - 1, Math.max(0, i))];
	};
	let d = `M${pt(points[0])}`;
	const segments = closed ? n : n - 1;
	for (let i = 0; i < segments; i++) {
		const p0 = at(i - 1);
		const p1 = at(i);
		const p2 = at(i + 1);
		const p3 = at(i + 2);
		const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
		const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
		d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
	}
	if (closed) d += ' Z';
	return d;
}

/** Straight-line SVG path data (M then L). */
export function polylinePath(points: readonly Point[]): string {
	if (points.length === 0) return '';
	return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${pt(p)}`).join(' ');
}

/**
 * The polyline pushed sideways by `distance` pixels (positive is the left side).
 * Corners use the averaged normal, so a double line stays parallel at bends.
 */
export function offsetPolyline(points: readonly Point[], distance: number): Point[] {
	if (points.length < 2) return points.map(p => ({ x: p.x, y: p.y }));
	return points.map((p, i) => {
		let normal: Point;
		if (i === 0) normal = leftNormal(points[0], points[1]);
		else if (i === points.length - 1) normal = leftNormal(points[i - 1], points[i]);
		else {
			const n1 = leftNormal(points[i - 1], points[i]);
			const n2 = leftNormal(points[i], points[i + 1]);
			const sum = { x: n1.x + n2.x, y: n1.y + n2.y };
			const l = len(sum);
			if (l < 1e-9) normal = n1;
			else {
				const avg = { x: sum.x / l, y: sum.y / l };
				const scale = 1 / Math.max(0.5, avg.x * n1.x + avg.y * n1.y);
				normal = { x: avg.x * scale, y: avg.y * scale };
			}
		}
		return { x: p.x + normal.x * distance, y: p.y + normal.y * distance };
	});
}

/**
 * Points of a sine wave that follows the polyline: `amplitude` pixels either side,
 * one cycle every `period` pixels. Used for rivers and streams.
 */
export function wavePoints(points: readonly Point[], amplitude: number, period: number, phase = 0): Point[] {
	const total = polylineLength(points);
	if (points.length < 2 || total === 0 || !(period > 0)) return points.map(p => ({ x: p.x, y: p.y }));
	const step = Math.max(0.5, period / 8);
	const out: Point[] = [];
	for (let s = 0; s <= total + 1e-9; s += step) {
		const { point, a, b } = sampleAt(points, s);
		const n = leftNormal(a, b);
		const offset = amplitude * Math.sin(phase + (2 * Math.PI * s) / period);
		out.push({ x: point.x + n.x * offset, y: point.y + n.y * offset });
	}
	return out;
}

/** SVG path data for a wave that follows the polyline. See wavePoints. */
export function wavePath(points: readonly Point[], amplitude: number, period: number, phase = 0): string {
	return polylinePath(wavePoints(points, amplitude, period, phase));
}

/**
 * Short strokes every `spacing` pixels along the polyline, starting at its first point.
 * `side` picks the lower side (ledges, cliffs), a fixed side, or both sides (trails, rail ties).
 */
export function tickSegments(points: readonly Point[], spacing: number, tickLength: number, side: TickSide): Segment[] {
	const total = polylineLength(points);
	if (points.length < 2 || total === 0 || !(spacing > 0)) return [];
	const ticks: Segment[] = [];
	for (let s = 0; s <= total + 1e-9; s += spacing) {
		const { point, a, b } = sampleAt(points, s);
		const n = side === 'lower' ? lowerNormal(a, b) : leftNormal(a, b);
		if (side === 'both') {
			const half = tickLength / 2;
			ticks.push([
				{ x: point.x - n.x * half, y: point.y - n.y * half },
				{ x: point.x + n.x * half, y: point.y + n.y * half },
			]);
		} else {
			const dir = side === 'right' ? -1 : 1;
			ticks.push([point, { x: point.x + n.x * tickLength * dir, y: point.y + n.y * tickLength * dir }]);
		}
	}
	return ticks;
}

/**
 * Railway ties: crossing strokes every `spacing` pixels. The rails themselves are
 * offsetPolyline(points, +gauge/2) and offsetPolyline(points, -gauge/2).
 */
export function railwaySegments(points: readonly Point[], spacing: number, tieLength: number): Segment[] {
	return tickSegments(points, spacing, tieLength, 'both');
}

/** Axis-aligned bounds of the points, or null when there are none. */
export function bounds(points: readonly Point[]): Bounds | null {
	if (points.length === 0) return null;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY };
}

/** True when p is within `tolerance` pixels of the open polyline. */
export function pointNearPolyline(p: Point, points: readonly Point[], tolerance: number): boolean {
	return distanceToPolyline(p, points) <= tolerance;
}

/** Even-odd ray casting. Points exactly on an edge may go either way. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
	const n = polygon.length;
	if (n < 3) return false;
	let inside = false;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const a = polygon[i];
		const b = polygon[j];
		if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

/** True when two rectangles overlap or touch. */
export function rectsIntersect(a: Bounds, b: Bounds): boolean {
	return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/**
 * The index of the vertex nearest to p, with its distance. Undefined when there are
 * no points or none lies within `maxDistance`.
 */
export function nearestVertex(p: Point, points: readonly Point[], maxDistance = Infinity): { index: number; distance: number } | undefined {
	let best: { index: number; distance: number } | undefined;
	for (let i = 0; i < points.length; i++) {
		const distance = Math.hypot(p.x - points[i].x, p.y - points[i].y);
		if (distance <= maxDistance && (!best || distance < best.distance)) best = { index: i, distance };
	}
	return best;
}

/** Rotate p around `centre` by `degrees` (clockwise on screen). */
export function rotatePoint(p: Point, centre: Point, degrees: number): Point {
	const rad = (degrees * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const dx = p.x - centre.x;
	const dy = p.y - centre.y;
	return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}
