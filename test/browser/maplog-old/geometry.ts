/**
 * Stroke geometry for Maplog lines, in screen pixels. The map layer projects
 * latitude and longitude to container points, calls these helpers, and unprojects
 * the result, so ticks, waves and double lines keep the same size on screen at
 * every zoom.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */

export interface Pixel {
    x: number;
    y: number;
}

export type PixelSegment = [Pixel, Pixel];

function sub(a: Pixel, b: Pixel): Pixel {
    return { x: a.x - b.x, y: a.y - b.y };
}

function length(v: Pixel): number {
    return Math.hypot(v.x, v.y);
}

/** Unit normal on the left of the direction a to b (screen y points down). */
function leftNormal(a: Pixel, b: Pixel): Pixel {
    const d = sub(b, a);
    const len = length(d);
    if (len === 0) return { x: 0, y: 0 };
    return { x: -d.y / len, y: d.x / len };
}

/** Normal on the lower side of the segment: the side with the larger y, or the left side of a vertical line. */
function lowerNormal(a: Pixel, b: Pixel): Pixel {
    const n = leftNormal(a, b);
    if (n.y < -1e-9 || (Math.abs(n.y) <= 1e-9 && n.x > 0)) return { x: -n.x, y: -n.y };
    return n;
}

export function polylineLength(points: readonly Pixel[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += length(sub(points[i], points[i - 1]));
    return total;
}

/** Point and segment normal at distance s along the polyline (clamped to its ends). */
function sampleAt(points: readonly Pixel[], s: number): { point: Pixel; normal: Pixel } {
    let remaining = Math.max(0, s);
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const seg = length(sub(b, a));
        if (remaining <= seg || i === points.length - 1) {
            const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
            return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, normal: leftNormal(a, b) };
        }
        remaining -= seg;
    }
    return { point: points[0], normal: { x: 0, y: 0 } };
}

/**
 * The polyline pushed sideways by `distance` pixels (positive is the left side).
 * Interior corners use the averaged normal, so a double line stays parallel at bends.
 */
export function offsetPolyline(points: readonly Pixel[], distance: number): Pixel[] {
    if (points.length < 2) return points.map(p => ({ ...p }));
    return points.map((p, i) => {
        let normal: Pixel;
        if (i === 0) normal = leftNormal(points[0], points[1]);
        else if (i === points.length - 1) normal = leftNormal(points[i - 1], points[i]);
        else {
            const n1 = leftNormal(points[i - 1], points[i]);
            const n2 = leftNormal(points[i], points[i + 1]);
            const sum = { x: n1.x + n2.x, y: n1.y + n2.y };
            const len = length(sum);
            if (len < 1e-9) normal = n1;
            else {
                const avg = { x: sum.x / len, y: sum.y / len };
                const scale = 1 / Math.max(0.5, avg.x * n1.x + avg.y * n1.y);
                normal = { x: avg.x * scale, y: avg.y * scale };
            }
        }
        return { x: p.x + normal.x * distance, y: p.y + normal.y * distance };
    });
}

/**
 * A sine wave that follows the polyline: `amplitude` pixels either side, one
 * cycle every `period` pixels. Used for rivers and streams.
 */
export function wavePolyline(points: readonly Pixel[], amplitude: number, period: number, phase = 0): Pixel[] {
    const total = polylineLength(points);
    if (points.length < 2 || total === 0) return points.map(p => ({ ...p }));
    const step = Math.max(0.5, period / 8);
    const out: Pixel[] = [];
    for (let s = 0; s <= total + 1e-9; s += step) {
        const { point, normal } = sampleAt(points, s);
        const offset = amplitude * Math.sin(phase + (2 * Math.PI * s) / period);
        out.push({ x: point.x + normal.x * offset, y: point.y + normal.y * offset });
    }
    return out;
}

/**
 * Short strokes at `spacing` pixels along the polyline. `side` picks the lower
 * side (ledges and cliffs), a fixed normal, or both sides for crossing ticks (trails).
 */
export function tickMarks(points: readonly Pixel[], spacing: number, tickLength: number, side: 'lower' | 'both' | 'left' | 'right'): PixelSegment[] {
    const total = polylineLength(points);
    if (points.length < 2 || total === 0 || spacing <= 0) return [];
    const ticks: PixelSegment[] = [];
    for (let s = 0; s <= total + 1e-9; s += spacing) {
        const { point, normal } = sampleAt(points, s);
        const n = side === 'lower' ? lowerNormal(...segmentAt(points, s)) : normal;
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

/** The segment that contains distance s, for the lower-side normal. */
function segmentAt(points: readonly Pixel[], s: number): [Pixel, Pixel] {
    let remaining = Math.max(0, s);
    for (let i = 1; i < points.length; i++) {
        const seg = length(sub(points[i], points[i - 1]));
        if (remaining <= seg || i === points.length - 1) return [points[i - 1], points[i]];
        remaining -= seg;
    }
    return [points[0], points[1]];
}

/**
 * Two slanted strokes across each end of the line: the break marking a passage
 * that leaves the drawn map (maplog.md Section 4).
 */
export function slantBreaks(points: readonly Pixel[], size: number): PixelSegment[] {
    if (points.length < 2) return [];
    const ends: Array<[Pixel, Pixel]> = [
        [points[0], points[1]],
        [points[points.length - 1], points[points.length - 2]],
    ];
    const breaks: PixelSegment[] = [];
    for (const [end, toward] of ends) {
        const d = sub(toward, end);
        const len = length(d);
        if (len === 0) continue;
        const dir = { x: d.x / len, y: d.y / len };
        const normal = { x: -dir.y, y: dir.x };
        for (const shift of [-0.25, 0.25]) {
            const centre = { x: end.x + dir.x * size * shift, y: end.y + dir.y * size * shift };
            breaks.push([
                { x: centre.x + normal.x * size / 2 - dir.x * size / 3, y: centre.y + normal.y * size / 2 - dir.y * size / 3 },
                { x: centre.x - normal.x * size / 2 + dir.x * size / 3, y: centre.y - normal.y * size / 2 + dir.y * size / 3 },
            ]);
        }
    }
    return breaks;
}

/** Points every `spacing` pixels along the polyline, starting at its first vertex. */
export function spacedPoints(points: readonly Pixel[], spacing: number): Pixel[] {
    const total = polylineLength(points);
    if (points.length < 2 || total === 0 || spacing <= 0) return points.length ? [{ ...points[0] }] : [];
    const out: Pixel[] = [];
    for (let s = 0; s <= total + 1e-9; s += spacing) out.push(sampleAt(points, s).point);
    return out;
}
