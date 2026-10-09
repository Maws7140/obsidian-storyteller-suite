/**
 * SVG generators for Maplog marks. Every mark is drawn on a 32 by 32 grid with
 * currentColor, so marks follow the text colour of the surrounding UI and stay
 * legible in greyscale. Shapes are drawn fresh from the notation's written
 * descriptions (Maplog by Roberto Bisceglie, CC BY-SA 4.0).
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import {
    acceptedMaplogAttributes,
    getMaplogMark,
    type MaplogAttributeId,
    type MaplogMarkDef,
} from './catalogue';

export interface MaplogSvgOptions {
    /** Attributes to draw on the base mark. Attributes the mark does not accept are ignored. */
    attributes?: readonly string[];
    /** Unconfirmed: strokes are dashed (rule 5). */
    dashed?: boolean;
    /** Clockwise rotation in degrees around the mark centre. */
    rotation?: number;
    /** Optional stroke colour, validated. Defaults to currentColor. */
    color?: string;
    /** Count grade for marks with one (slope chevrons). Defaults to the mark's default grade. */
    grade?: number;
    /** Rendered width and height in CSS pixels. Defaults to 32. */
    size?: number;
}

const GRID = 32;
const CENTRE = 16;
const WALL_Y = 16;
const LETTER_SIZE = 7;
const DASH = '3 2.4';

type Pt = readonly [number, number];

function n(value: number): string {
    return String(Math.round(value * 100) / 100);
}

function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function node(tag: string, attrs: Record<string, string | number>, inner?: string): string {
    const attrText = Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeAttr(String(value))}"`).join('');
    return inner === undefined ? `<${tag}${attrText}/>` : `<${tag}${attrText}>${inner}</${tag}>`;
}

const line = (x1: number, y1: number, x2: number, y2: number, attrs: Record<string, string | number> = {}): string =>
    node('line', { x1: n(x1), y1: n(y1), x2: n(x2), y2: n(y2), ...attrs });
const rect = (x: number, y: number, w: number, h: number, attrs: Record<string, string | number> = {}): string =>
    node('rect', { x: n(x), y: n(y), width: n(w), height: n(h), ...attrs });
const circle = (cx: number, cy: number, r: number, attrs: Record<string, string | number> = {}): string =>
    node('circle', { cx: n(cx), cy: n(cy), r: n(r), ...attrs });
const path = (d: string, attrs: Record<string, string | number> = {}): string => node('path', { d, ...attrs });
const poly = (points: readonly Pt[], closed: boolean, attrs: Record<string, string | number> = {}): string =>
    node(closed ? 'polygon' : 'polyline', { points: points.map(([x, y]) => `${n(x)},${n(y)}`).join(' '), ...attrs });
const FILL = { fill: 'currentColor' } as const;
const text = (value: string, x: number, y: number, size = LETTER_SIZE): string =>
    node('text', {
        x: n(x), y: n(y), 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'sans-serif', fill: 'currentColor', stroke: 'none',
    }, escapeAttr(value));

/** Points along a sine wave from x0 to x1 around height y. */
function wave(x0: number, x1: number, y: number, amplitude: number, period: number): Pt[] {
    const points: Pt[] = [];
    for (let x = x0; x <= x1 + 1e-9; x += 0.5) {
        points.push([x, y + amplitude * Math.sin(((x - x0) / period) * 2 * Math.PI)]);
    }
    return points;
}

function ringRadii(count: number): number[] {
    if (count <= 1) return [9];
    if (count === 2) return [10, 6];
    return [11, 7.5, 4];
}

/** Ten points of a five-pointed star centred on the grid centre. */
function star(): Pt[] {
    const points: Pt[] = [];
    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? 6 : 2.6;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push([CENTRE + radius * Math.cos(angle), CENTRE + radius * Math.sin(angle)]);
    }
    return points;
}

/** Opening base: wall stubs on either side of the gap, drawn along the wall at WALL_Y. */
function stubs(gapStart: number, gapEnd: number): string {
    return line(2, WALL_Y, gapStart, WALL_Y) + line(gapEnd, WALL_Y, 30, WALL_Y);
}

function openingBody(markId: string, attrs: readonly MaplogAttributeId[]): string {
    const locked = attrs.includes('locked');
    switch (markId) {
        case 'passage':
            return stubs(10, 22);
        case 'door':
            return stubs(10, 22) + rect(10, 12, 12, 8, locked ? FILL : {});
        case 'double':
            return stubs(8, 24) + rect(8, 12, 8, 8, locked ? FILL : {}) + rect(16, 12, 8, 8, locked ? FILL : {});
        case 'window':
            return stubs(10, 22) + line(10, WALL_Y, 22, WALL_Y) + line(10, 13, 10, 19) + line(22, 13, 22, 19);
        case 'collapsed':
            return stubs(10, 22) + poly([[10, 16], [12, 12], [14, 20], [16, 12], [18, 20], [20, 12], [22, 16]], false);
        default:
            return '';
    }
}

/** Line glyphs are drawn as a horizontal sample of the line's style. */
function lineBody(markId: string): string {
    switch (markId) {
        case 'wall':
            return line(2, WALL_Y, 30, WALL_Y, { 'stroke-width': 3.6 });
        case 'offmap':
            return line(2, WALL_Y, 30, WALL_Y, { 'stroke-width': 3 })
                + line(4, 11, 8, 21, { 'stroke-width': 1.4 }) + line(24, 11, 28, 21, { 'stroke-width': 1.4 });
        case 'bars': {
            // A wall broken by a row of dots: the dots stand in the gap.
            let dots = '';
            for (let x = 11; x <= 21; x += 3.5) dots += circle(x, WALL_Y, 1.2, FILL);
            return line(2, WALL_Y, 8, WALL_Y, { 'stroke-width': 3.6 }) + line(24, WALL_Y, 30, WALL_Y, { 'stroke-width': 3.6 }) + dots;
        }
        case 'ledge': {
            let ticks = '';
            for (let x = 4; x <= 28; x += 4) ticks += line(x, 12, x, 16);
            return line(2, 12, 30, 12, { 'stroke-width': 1.2 }) + ticks;
        }
        case 'cliff': {
            let ticks = '';
            for (let x = 3; x <= 29; x += 6) ticks += line(x, 12, x - 2, 18);
            return line(2, 12, 30, 12, { 'stroke-width': 1.4 }) + ticks;
        }
        case 'border': {
            let dots = '';
            for (let x = 4; x <= 28; x += 6) dots += circle(x, WALL_Y, 1.4, FILL);
            return line(2, WALL_Y, 30, WALL_Y, { 'stroke-width': 1 }) + dots;
        }
        case 'road':
            return line(2, 13, 30, 13, { 'stroke-width': 1.3 }) + line(2, 19, 30, 19, { 'stroke-width': 1.3 });
        case 'track':
            return line(2, WALL_Y, 30, WALL_Y, { 'stroke-width': 1.8 });
        case 'trail': {
            let ticks = '';
            for (let x = 5; x <= 27; x += 5) ticks += line(x, 12, x, 20);
            return line(2, WALL_Y, 30, WALL_Y, { 'stroke-width': 1 }) + ticks;
        }
        case 'river':
            return poly(wave(2, 30, 13, 1.6, 8), false) + poly(wave(2, 30, 19, 1.6, 8), false);
        case 'stream':
            return poly(wave(2, 30, WALL_Y, 1.8, 8), false);
        default:
            return '';
    }
}

/** Area glyphs. Also the repeated pattern used to fill terrain on a map. */
function areaBody(markId: string): string {
    switch (markId) {
        case 'water':
            return poly(wave(2, 30, 10, 1.5, 8), false) + poly(wave(2, 30, 16, 1.5, 8), false) + poly(wave(2, 30, 22, 1.5, 8), false);
        case 'plains':
            return [10, 22].map(x => line(x, 27, x - 3, 21) + line(x, 27, x, 20) + line(x, 27, x + 3, 21)).join('');
        case 'forest':
            return circle(10, 11, 5) + line(10, 16, 10, 25) + circle(22, 15, 5) + line(22, 20, 22, 28);
        case 'jungle':
            return path('M 16 29 Q 12 19 18 11') + line(18, 11, 6, 13) + line(18, 11, 29, 13) + line(18, 11, 17, 4);
        case 'hills':
            return path('M 3 25 Q 9 12 15 25') + path('M 14 27 Q 21 14 29 27');
        case 'mountains':
            return poly([[2, 27], [10, 11], [18, 27]], false) + poly([[12, 27], [21, 8], [30, 27]], false);
        case 'desert':
            return path('M 3 24 Q 10 17 16 24') + path('M 14 27 Q 22 19 30 26')
                + circle(8, 12, 1, FILL) + circle(24, 12, 1, FILL) + circle(18, 7, 1, FILL);
        case 'swamp':
            return line(3, 25, 9, 25) + line(16, 28, 23, 28)
                + line(7, 22, 7, 15) + line(9, 22, 10, 14) + line(24, 22, 24, 15) + line(26, 22, 27, 16);
        case 'ice': {
            let arms = '';
            for (const deg of [0, 60, 120]) {
                const rad = (deg * Math.PI) / 180;
                const dx = 12 * Math.cos(rad);
                const dy = 12 * Math.sin(rad);
                arms += line(CENTRE - dx, CENTRE - dy, CENTRE + dx, CENTRE + dy);
                for (const sign of [-1, 1]) {
                    const tx = CENTRE + dx * 0.6;
                    const ty = CENTRE + dy * 0.6;
                    const ta = rad + sign * (Math.PI / 4);
                    arms += line(tx, ty, tx + 3 * Math.cos(ta), ty + 3 * Math.sin(ta));
                    const sx = CENTRE - dx * 0.6;
                    const sy = CENTRE - dy * 0.6;
                    arms += line(sx, sy, sx - 3 * Math.cos(ta), sy - 3 * Math.sin(ta));
                }
            }
            return arms;
        }
        default:
            return '';
    }
}

/** Route crossings, relief, sites and settlements, and the write-ins. */
function pointBody(mark: MaplogMarkDef, grade: number): string {
    switch (mark.id) {
        case 'stairs-up': {
            let steps = '';
            for (let i = 0; i < 5; i++) steps += line(6, 9 + i * 3.5, 26, 9 + i * 3.5);
            return rect(6, 7, 20, 18) + steps;
        }
        case 'stairs-down': {
            let steps = '';
            for (let i = 0; i < 5; i++) steps += line(6, 9 + i * 3.5, 26 - i * 4, 9 + i * 3.5);
            return rect(6, 7, 20, 18) + steps;
        }
        case 'spiral': {
            let spokes = '';
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3;
                spokes += line(CENTRE + 3 * Math.cos(a), CENTRE + 3 * Math.sin(a), CENTRE + 11 * Math.cos(a), CENTRE + 11 * Math.sin(a));
            }
            const start = (200 * Math.PI) / 180;
            const end = (300 * Math.PI) / 180;
            const sx = CENTRE + 6 * Math.cos(start);
            const sy = CENTRE + 6 * Math.sin(start);
            const ex = CENTRE + 6 * Math.cos(end);
            const ey = CENTRE + 6 * Math.sin(end);
            const dirX = -Math.sin(end);
            const dirY = Math.cos(end);
            const headBack = [ex - dirX * 3.5, ey - dirY * 3.5];
            const perpX = -dirY;
            const perpY = dirX;
            const arrow = poly([
                [ex, ey],
                [headBack[0] + perpX * 2.2, headBack[1] + perpY * 2.2],
                [headBack[0] - perpX * 2.2, headBack[1] - perpY * 2.2],
            ], true, FILL);
            return circle(CENTRE, CENTRE, 11) + spokes
                + path(`M ${n(sx)} ${n(sy)} A 6 6 0 0 1 ${n(ex)} ${n(ey)}`) + arrow;
        }
        case 'slope': {
            let chevrons = '';
            for (let k = 0; k < grade; k++) {
                const y = CENTRE + (k - (grade - 1) / 2) * 7;
                chevrons += poly([[7, y - 3], [CENTRE, y + 3], [25, y - 3]], false, { 'stroke-width': 2 });
            }
            return chevrons;
        }
        case 'shaft':
            return circle(CENTRE, CENTRE, 10) + line(10, 10, 22, 22) + line(22, 10, 10, 22);
        case 'shaft-up':
            return circle(15, 17, 8) + line(10, 12, 20, 22) + line(20, 12, 10, 22) + text('U', 27, 6);
        case 'trap':
            return poly([[16, 4], [29, 28], [3, 28]], true) + line(16, 11, 16, 20, { 'stroke-width': 2.2 }) + circle(16, 24, 1.3, FILL);
        case 'pit':
            return rect(6, 6, 20, 20) + rect(12, 12, 8, 8, FILL);
        case 'trapdoor':
            return rect(6, 6, 20, 20);
        case 'column':
            return rect(11, 11, 10, 10, FILL);
        case 'statue':
            return circle(CENTRE, CENTRE, 10) + poly(star(), true);
        case 'well': {
            return circle(CENTRE, CENTRE, 10) + poly(wave(8, 24, CENTRE, 2, 4), false);
        }
        case 'altar':
            return rect(8, 14, 16, 12) + line(16, 6, 16, 14) + line(13, 10, 19, 10);
        case 'light': {
            let rays = '';
            for (let i = 0; i < 8; i++) {
                const a = (i * Math.PI) / 4;
                rays += line(CENTRE + 7 * Math.cos(a), CENTRE + 7 * Math.sin(a), CENTRE + 12 * Math.cos(a), CENTRE + 12 * Math.sin(a));
            }
            return circle(CENTRE, CENTRE, 4, FILL) + rays;
        }
        case 'peak':
            return poly([[3, 27], [16, 5], [29, 27]], true) + poly([[11.5, 13], [16, 5], [20.5, 13]], true, FILL);
        case 'pass':
            return path('M 14 6 Q 5 16 14 26') + path('M 18 6 Q 27 16 18 26');
        case 'bridge': {
            let crossing = '';
            for (const x of [12, 20]) {
                crossing += line(x, 9, x, 23) + line(x - 2.5, 9, x + 2.5, 9) + line(x - 2.5, 23, x + 2.5, 23);
            }
            return poly(wave(2, 30, WALL_Y, 1.2, 8), false) + crossing;
        }
        case 'ford':
            return poly(wave(2, 30, WALL_Y, 1.2, 8), false) + circle(8, WALL_Y, 2.4) + circle(16, WALL_Y, 2.4) + circle(24, WALL_Y, 2.4);
        case 'ferry':
            return poly(wave(2, 30, 26, 1.2, 8), false)
                + path('M 8 14 H 24 L 21 19 H 11 Z') + line(16, 14, 16, 6) + poly([[16, 7], [16, 13], [22, 13]], true);
        case 'entrance':
            return path('M 7 28 V 15 A 9 9 0 0 1 25 15 V 28') + rect(12, 18, 8, 10, FILL);
        case 'ruin':
            return poly([[4, 27], [4, 16], [9, 16], [9, 10], [14, 14], [18, 8], [22, 12], [27, 9], [27, 27]], false);
        case 'tomb':
            return path('M 9 28 V 14 A 7 7 0 0 1 23 14 V 28 Z') + line(16, 11, 16, 22) + line(12, 15, 20, 15);
        case 'stones':
            return rect(6, 13, 6, 15) + rect(20, 13, 6, 15) + rect(4, 8, 24, 5);
        case 'shrine':
            return poly([[5, 13], [16, 5], [27, 13]], true) + line(9, 13, 9, 27) + line(23, 13, 23, 27) + circle(16, 19, 1.8, FILL);
        case 'lair':
            return path('M 8 8 Q 6 16 10 25') + path('M 16 6 Q 14 16 18 27') + path('M 24 8 Q 22 16 26 25');
        case 'homestead':
            return poly([[7, 27], [7, 15], [16, 7], [25, 15], [25, 27]], true) + rect(13, 19, 6, 8);
        case 'hamlet':
            return circle(CENTRE, CENTRE, 4.5, FILL);
        case 'village':
        case 'town':
        case 'city': {
            const rings = mark.rings ?? 1;
            return ringRadii(rings).map(r => circle(CENTRE, CENTRE, r)).join('');
        }
        case 'castle': {
            return path('M 3 28 V 14 H 7 V 10 H 11 V 14 H 14 V 10 H 18 V 14 H 21 V 10 H 25 V 14 H 29 V 28 Z')
                + rect(13, 20, 6, 8, FILL);
        }
        case 'tower':
            return path('M 10 28 V 9 H 13 V 12 H 19 V 9 H 22 V 28 Z') + rect(14, 22, 4, 6, FILL);
        case 'inn':
            return poly([[6, 27], [6, 16], [15, 8], [24, 16], [24, 27]], true) + line(24, 11, 29, 11) + rect(26, 13, 4, 5);
        case 'place-id':
            return rect(3, 9, 26, 14, { rx: 3 });
        case 'text':
            return text('Aa', CENTRE, CENTRE + 1, 12);
        case 'north':
            return text('N', CENTRE, 6, 8) + poly([[16, 11], [21, 26], [16, 22], [11, 26]], true, FILL);
        default:
            return '';
    }
}

/** Overlay for one attribute, drawn beside the base mark on the side it applies to (rule 2). */
function attributeOverlay(attr: MaplogAttributeId, mark: MaplogMarkDef, letterIndex: number): string {
    const onWall = mark.kind === 'opening' || mark.kind === 'line';
    switch (attr) {
        case 'locked':
            return ''; // Drawn into the base shape: a solid rectangle.
        case 'barred':
            return line(13, 8, 13, 11) + line(19, 8, 19, 11);
        case 'trapped':
            return poly([[16, 28], [13, 23], [19, 23]], true);
        case 'oneway':
            return line(12, WALL_Y, 20, WALL_Y) + poly([[17, 13], [20, WALL_Y], [17, 19]], false);
        case 'port':
            return circle(27, 22, 1.4) + line(27, 23.5, 27, 30) + line(24, 26, 30, 26)
                + path('M 23 28 Q 23 31 27 31 Q 31 31 31 28');
        case 'temple':
            return poly([[23, 9], [27, 3], [31, 9]], true) + circle(27, 6, 0.9, FILL);
        case 'secret':
            return text('S', onWall ? 5 : 28, onWall ? 10 : 6 + letterIndex * 8);
        case 'illusory':
            return text('?', onWall ? 27 : 28, onWall ? 10 : 6 + letterIndex * 8);
        case 'covered':
            return text('C', 28, 6 + letterIndex * 8);
        case 'ceiling':
            return text('U', 28, 6 + letterIndex * 8);
        default:
            return '';
    }
}

function letterAttributes(attrs: readonly MaplogAttributeId[]): MaplogAttributeId[] {
    return attrs.filter(attr => attr === 'secret' || attr === 'illusory' || attr === 'covered' || attr === 'ceiling');
}

/** The mark's base shape plus its attribute overlays, before rotation and dashing. */
export function maplogSvgInner(markId: string, options: MaplogSvgOptions = {}): string {
    const mark = getMaplogMark(markId);
    if (!mark) return '';
    const attrs = acceptedMaplogAttributes(markId, options.attributes);
    const grade = mark.grades ? Math.min(mark.grades.max, Math.max(mark.grades.min, Math.round(options.grade ?? mark.grades.default))) : 0;

    let base: string;
    if (mark.kind === 'opening') base = openingBody(mark.id, attrs);
    else if (mark.kind === 'line') base = lineBody(mark.id);
    else if (mark.kind === 'area') base = areaBody(mark.id);
    else base = pointBody(mark, grade);

    // Letters stack in catalogue order on points, so two letters never overlap.
    const letters = letterAttributes(attrs);
    const overlays = attrs.map(attr => attributeOverlay(attr, mark, Math.max(0, letters.indexOf(attr)))).join('');
    return base + overlays;
}

/**
 * A complete SVG element for a mark. Dashed marks use dashed strokes, rotated marks
 * turn around the centre, and the colour defaults to currentColor.
 */
export function maplogSvg(markId: string, options: MaplogSvgOptions = {}): string {
    const mark = getMaplogMark(markId);
    if (!mark) throw new Error(`Unknown Maplog mark: ${markId}`);
    const size = options.size && options.size > 0 ? Math.round(options.size) : GRID;
    const rotation = mark.rotatable && options.rotation ? ((options.rotation % 360) + 360) % 360 : 0;
    const groupAttrs: Record<string, string | number> = {};
    if (rotation) groupAttrs.transform = `rotate(${n(rotation)} ${CENTRE} ${CENTRE})`;
    if (options.dashed) groupAttrs['stroke-dasharray'] = DASH;
    const rootAttrs: Record<string, string | number> = {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 0 ${GRID} ${GRID}`,
        width: size,
        height: size,
        class: 'maplog-svg',
        'data-mark': mark.id,
        role: 'img',
        'aria-label': mark.label,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.7,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    };
    if (options.color) {
        if (!/^[#a-zA-Z0-9(),.%\s-]+$/.test(options.color)) throw new Error('Invalid Maplog colour');
        rootAttrs.color = options.color;
    }
    return node('svg', rootAttrs, node('g', groupAttrs, maplogSvgInner(mark.id, options)));
}
