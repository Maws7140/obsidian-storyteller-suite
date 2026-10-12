/**
 * Map Ink SVG markup. Turns items into SVG strings in reference-pixel space, so
 * the layer only has to set one transform on the root group to zoom.
 *
 * The caller supplies a projector from latlng to reference pixels. Nothing here
 * reads the DOM, the map or the clock, so every function is testable in plain Node.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { getSymbol } from './symbols';
import { isValidColor } from './model';
import type { DashStyle, FillPattern, InkArea, InkBox, InkDoc, InkItem, InkPath, InkPoint, InkStamp, InkStyle, InkText, InkTextStyle } from './model';
import { bounds, offsetPolyline, polylinePath, railwaySegments, rotatePoint, smoothPath, tickSegments, wavePath } from './geometry';
import type { Bounds, Point } from './geometry';
import { brushPieceMarkup, brushPieces, getBrush } from './brushes';

export type Projector = (p: InkPoint) => Point;

export interface InkSvgOptions {
	/** Latlng to reference pixels. */
	project: Projector;
	/** Read-only items get no hit areas unless they link to a location. */
	readOnly?: boolean;
	/** Prefix for <defs> ids. Must be unique per SVG root on the page. */
	idPrefix?: string;
	/** Halo colour behind stamps. Defaults to the map paper colour. Empty string draws no halo. */
	stampHalo?: string;
	/** Symbol lookup. Defaults to the library in symbols.ts. */
	lookupSymbol?: (id: string) => { body: string; name?: string } | undefined;
	/** Multiplier on brush width and detail, from brushDetailFor. Defaults to 1. */
	brushDetail?: number;
}

/**
 * How much of the map's zoom brushes follow. Their path always follows the map, but their
 * width, ticks, waves and dots grow only 2^BRUSH_ZOOM_FOLLOW times per zoom step on screen,
 * so lines stay fine-inked up close (like the old hand-drawn notation) and still read when
 * zoomed out. 0 would keep brush detail at screen size, 1 would scale it fully with the map.
 */
export const BRUSH_ZOOM_FOLLOW = 0.4;

/** Brush width multiplier for a map scale s (2^(zoom - refZoom)). 1 at the reference zoom. */
export function brushDetailFor(s: number): number {
	if (!Number.isFinite(s) || s <= 0) return 1;
	return Math.round(Math.pow(s, BRUSH_ZOOM_FOLLOW - 1) * 1000) / 1000;
}

export interface InkSceneItem {
	id: string;
	layer: string;
	svg: string;
}

export interface InkScene {
	/** Markup for the shared <defs>: patterns and arrowhead markers. */
	defs: string;
	/** Visible items in paint order: layers in doc order, items within a layer in doc order. */
	items: InkSceneItem[];
}

/** An item's box before any zoom: the unrotated rectangle, its rotation and its centre. */
export interface ItemBox {
	rect: Bounds;
	rotation: number;
	centre: Point;
}

export interface SelectionOptions {
	project: Projector;
	/** Current zoom scale, 2^(zoom - refZoom). Handles are sized as 1 / scale reference pixels. */
	scale: number;
}

const PAPER = '#f4ecd8';
const INK = '#2b2b2b';
const HIT_WIDTH = 12;
const SYMBOL_STROKE = 1.75;
const HALO_GRID = 1.5;
const TEXT_LINE = 1.2;
const TEXT_EM = 0.58;
const ELLIPSE_POINTS = 48;
const DASHES: readonly string[] = ['solid', 'dashed', 'dotted', 'double', 'wavy', 'ticked', 'railway'];
const ROTATABLE: readonly string[] = ['stamp', 'text', 'rect', 'ellipse'];
const PLACEHOLDER_BODY = '<circle cx="12" cy="12" r="8" stroke-dasharray="2 2"/>';

const FONT_STACKS: Record<InkTextStyle['font'], string> = {
	serif: 'var(--font-text-theme, Georgia), "Iowan Old Style", "Palatino Linotype", serif',
	sans: 'var(--font-interface-theme, system-ui), "Segoe UI", Helvetica, Arial, sans-serif',
	hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
	mono: 'var(--font-monospace-theme, ui-monospace), "SFMono-Regular", Menlo, Consolas, monospace',
};

/** Escape text for element content and attribute values. */
export function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** A number for SVG attributes: 2 decimals at most, never NaN or exponent form. */
export function fmt(n: number): string {
	if (!Number.isFinite(n)) return '0';
	const rounded = Math.round(n * 100) / 100;
	return String(rounded + 0);
}

/** Build the whole scene: defs plus one markup string per visible item. */
export function buildScene(doc: InkDoc, opts: InkSvgOptions): InkScene {
	const ctx = makeCtx(opts, undefined);
	const layerIndex = new Map<string, number>();
	const layerVisible = new Map<string, boolean>();
	doc.layers.forEach((layer, i) => {
		layerIndex.set(layer.id, i);
		layerVisible.set(layer.id, layer.visible !== false);
	});
	const ordered = doc.items
		.map((item, order) => ({
			item,
			order,
			index: layerIndex.has(item.layer) ? (layerIndex.get(item.layer) as number) : -1,
		}))
		.filter(entry => !entry.item.hidden && (!layerVisible.has(entry.item.layer) || layerVisible.get(entry.item.layer) === true))
		.sort((a, b) => a.index - b.index || a.order - b.order);

	const items: InkSceneItem[] = [];
	for (const entry of ordered) {
		const svg = dispatch(entry.item, ctx);
		if (svg) items.push({ id: entry.item.id, layer: entry.item.layer, svg });
	}
	return { defs: [...ctx.defs.values()].join(''), items };
}

/**
 * The markup for one item, ignoring its hidden flag and layer. Pattern and marker
 * definitions are added to `defs` when given. Returns '' for items that have nothing to draw.
 */
export function buildItem(item: InkItem, opts: InkSvgOptions, defs?: Map<string, string>): string {
	return dispatch(item, makeCtx(opts, defs));
}

/** The item's box in reference pixels, before rotation is applied. Null when the item has no points. */
export function itemBox(item: InkItem, project: Projector, pxToRef = 1): ItemBox | null {
	switch (item.kind) {
		case 'stamp': {
			const at = project(item.at);
			const half = refSize(num(item.size, 24, 0.5, 2000), item.scaleWithMap, pxToRef) / 2;
			return {
				rect: { minX: at.x - half, minY: at.y - half, maxX: at.x + half, maxY: at.y + half },
				rotation: num(item.rotation, 0, -36000, 36000),
				centre: at,
			};
		}
		case 'text': {
			const at = project(item.at);
			const st = readText(item.style);
			const size = refSize(st.size, item.scaleWithMap, pxToRef);
			const m = textMetrics(String(item.text ?? ''), size, st.letterSpacing, st.align);
			return {
				rect: { minX: at.x + m.x0, minY: at.y + m.y0, maxX: at.x + m.x0 + m.width, maxY: at.y + m.y0 + m.height },
				rotation: num(item.rotation, 0, -36000, 36000),
				centre: at,
			};
		}
		case 'path':
		case 'freehand':
		case 'area': {
			const pts = item.points.map(p => project(p));
			const b = bounds(pts);
			if (!b) return null;
			return { rect: b, rotation: 0, centre: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } };
		}
		case 'rect':
		case 'ellipse': {
			const pa = project(item.a);
			const pb = project(item.b);
			const b = bounds([pa, pb]);
			if (!b) return null;
			return {
				rect: b,
				rotation: num(item.rotation, 0, -36000, 36000),
				centre: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
			};
		}
		default:
			return null;
	}
}

/** Axis-aligned bounds of the item in reference pixels, rotation included. */
export function itemBounds(item: InkItem, project: Projector, pxToRef = 1): Bounds | null {
	const box = itemBox(item, project, pxToRef);
	if (!box) return null;
	if (!box.rotation) return box.rect;
	const r = box.rect;
	const corners = [
		{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY },
		{ x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY },
	].map(p => rotatePoint(p, box.centre, box.rotation));
	return bounds(corners);
}

/**
 * Selection overlay markup: a box with eight resize handles, a rotate handle when
 * one rotatable item is selected, and vertex handles plus midpoint ghosts when one
 * path or area is selected. Handles keep a constant screen size at any scale.
 */
export function buildSelection(items: readonly InkItem[], opts: SelectionOptions): string {
	if (items.length === 0) return '';
	const k = 1 / (opts.scale > 0 ? opts.scale : 1);
	const project = opts.project;
	const single = items.length === 1 ? items[0] : undefined;

	let rect: Bounds | null = null;
	let rotation = 0;
	let centre: Point = { x: 0, y: 0 };
	if (single) {
		const box = itemBox(single, project, k);
		if (!box) return '';
		rect = box.rect;
		rotation = box.rotation;
		centre = box.centre;
	} else {
		for (const item of items) {
			const b = itemBounds(item, project, k);
			if (!b) continue;
			rect = rect ? unionBounds(rect, b) : b;
		}
		if (!rect) return '';
		centre = { x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2 };
	}

	const { minX, minY, maxX, maxY } = rect;
	const cx = centre.x;
	const cy = centre.y;
	const hs = 4 * k;
	const sw = fmt(k);
	const rotatable = single !== undefined && ROTATABLE.indexOf(single.kind) >= 0;

	let inner = `<rect class="ink-sel-box" data-ink-handle="move" x="${fmt(minX)}" y="${fmt(minY)}"`
		+ ` width="${fmt(maxX - minX)}" height="${fmt(maxY - minY)}" fill="transparent" stroke-width="${sw}"`
		+ ` stroke-dasharray="${fmt(4 * k)} ${fmt(3 * k)}" style="pointer-events:all"/>`;

	const handles: Array<[string, number, number]> = [
		['nw', minX, minY], ['n', cx, minY], ['ne', maxX, minY], ['e', maxX, cy],
		['se', maxX, maxY], ['s', cx, maxY], ['sw', minX, maxY], ['w', minX, cy],
	];
	for (const [name, x, y] of handles) {
		inner += `<rect class="ink-handle" data-ink-handle="${name}" x="${fmt(x - hs)}" y="${fmt(y - hs)}"`
			+ ` width="${fmt(8 * k)}" height="${fmt(8 * k)}" stroke-width="${sw}" style="pointer-events:all"/>`;
	}
	if (rotatable) {
		const ry = minY - 20 * k;
		inner += `<path class="ink-sel-line" d="M${fmt(cx)} ${fmt(minY)}V${fmt(ry)}" fill="none" stroke-width="${sw}"/>`;
		inner += `<circle class="ink-handle-rot" data-ink-handle="rotate" cx="${fmt(cx)}" cy="${fmt(ry)}"`
			+ ` r="${fmt(5 * k)}" stroke-width="${sw}" style="pointer-events:all"/>`;
	}
	const rot = rotation ? ` transform="rotate(${fmt(rotation)} ${fmt(cx)} ${fmt(cy)})"` : '';
	let out = `<g class="ink-sel"${rot}>${inner}</g>`;

	if (single && (single.kind === 'path' || single.kind === 'freehand' || single.kind === 'area')) {
		const pts = single.points.map(p => project(p));
		const closed = single.kind === 'area';
		const n = pts.length;
		for (let i = 0; i < n; i++) {
			out += `<circle class="ink-vertex" data-ink-vertex="${i}" cx="${fmt(pts[i].x)}" cy="${fmt(pts[i].y)}"`
				+ ` r="${fmt(4 * k)}" stroke-width="${sw}" style="pointer-events:all"/>`;
		}
		const segments = closed ? n : n - 1;
		for (let i = 0; i < segments; i++) {
			const a = pts[i];
			const b = pts[(i + 1) % n];
			out += `<circle class="ink-mid" data-ink-mid="${i + 1}" cx="${fmt((a.x + b.x) / 2)}" cy="${fmt((a.y + b.y) / 2)}"`
				+ ` r="${fmt(3 * k)}" stroke-width="${sw}" style="pointer-events:all"/>`;
		}
	}
	return out;
}

// ---- context and dispatch ----------------------------------------------------

interface Ctx {
	project: Projector;
	readOnly: boolean;
	prefix: string;
	stampHalo: string;
	lookupSymbol: (id: string) => { body: string; name?: string } | undefined;
	defs: Map<string, string>;
	brushDetail: number;
}

function makeCtx(opts: InkSvgOptions, defs: Map<string, string> | undefined): Ctx {
	const prefix = (opts.idPrefix ?? 'ink-').replace(/[^A-Za-z0-9_-]/g, '');
	return {
		project: opts.project,
		readOnly: opts.readOnly === true,
		prefix,
		stampHalo: opts.stampHalo === undefined ? PAPER : (opts.stampHalo === '' ? '' : colour(opts.stampHalo, PAPER)),
		lookupSymbol: opts.lookupSymbol ?? getSymbol,
		defs: defs ?? new Map<string, string>(),
		brushDetail: typeof opts.brushDetail === 'number' && Number.isFinite(opts.brushDetail) && opts.brushDetail > 0 ? opts.brushDetail : 1,
	};
}

function dispatch(item: InkItem, ctx: Ctx): string {
	switch (item.kind) {
		case 'stamp': return stampSvg(item, ctx);
		case 'text': return textSvg(item, ctx);
		case 'path':
		case 'freehand': return pathSvg(item, ctx);
		case 'area': return areaSvg(item, ctx);
		case 'rect':
		case 'ellipse': return boxSvg(item, ctx);
		default: return '';
	}
}

function openItem(item: InkItem, ctx: Ctx, cls: string, extra: string): string {
	const pe = ctx.readOnly && !item.locationId ? 'none' : 'visiblePainted';
	return `<g class="ink-item ${cls}" data-ink-id="${escapeXml(String(item.id))}"`
		+ ` data-ink-kind="${escapeXml(String(item.kind))}" data-ink-layer="${escapeXml(String(item.layer))}"`
		+ ` style="pointer-events:${pe}"${extra}>`;
}

function wantsHits(item: InkItem, ctx: Ctx): boolean {
	return !ctx.readOnly || !!item.locationId;
}

// ---- stamps ------------------------------------------------------------------

function stampSvg(item: InkStamp, ctx: Ctx): string {
	const at = ctx.project(item.at);
	const size = num(item.size, 24, 0.5, 2000);
	const k = size / 24;
	const rot = num(item.rotation, 0, -36000, 36000);
	const opacity = num(item.opacity, 1, 0, 1);
	const color = colour(item.color, INK);
	const symbol = ctx.lookupSymbol(String(item.symbol));
	const body = symbol ? symbol.body : PLACEHOLDER_BODY;
	const anchor = `${fmt(at.x)} ${fmt(at.y)}`;
	const counter = item.scaleWithMap === false
		? ` transform="translate(${anchor}) scale(1)" data-ink-counter="1" data-ink-at="${anchor}"`
		: ` transform="translate(${anchor})"`;
	const title = symbol && symbol.name ? symbol.name : 'Stamp';

	let inner = `<g transform="rotate(${fmt(rot)}) scale(${fmt(k)}) translate(-12 -12)"`
		+ (opacity < 1 ? ` opacity="${fmt(opacity)}"` : '') + '>';
	if (ctx.stampHalo) {
		inner += `<g fill="none" stroke="currentColor" stroke-width="${fmt(SYMBOL_STROKE + 2 * HALO_GRID)}"`
			+ ` stroke-linecap="round" stroke-linejoin="round" color="${escapeXml(ctx.stampHalo)}">${body}</g>`;
	}
	inner += `<g fill="none" stroke="currentColor" stroke-width="${fmt(SYMBOL_STROKE)}"`
		+ ` stroke-linecap="round" stroke-linejoin="round" color="${escapeXml(color)}">${body}</g>`;
	if (wantsHits(item, ctx)) {
		inner += '<rect class="ink-hit" x="0" y="0" width="24" height="24" fill="transparent" style="pointer-events:all"/>';
	}
	inner += '</g>';
	const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : (item.name || title);
	return openItem(item, ctx, 'ink-stamp', counter)
		+ `<title>${escapeXml(String(label))}</title>` + inner + '</g>';
}

// ---- text --------------------------------------------------------------------

function textSvg(item: InkText, ctx: Ctx): string {
	const at = ctx.project(item.at);
	const st = readText(item.style);
	const lines = String(item.text ?? '').split(/\r?\n/);
	const rot = num(item.rotation, 0, -36000, 36000);
	const anchor = `${fmt(at.x)} ${fmt(at.y)}`;
	const counter = item.scaleWithMap === false
		? ` transform="translate(${anchor}) scale(1)" data-ink-counter="1" data-ink-at="${anchor}"`
		: ` transform="translate(${anchor})"`;
	const m = textMetrics(lines.join('\n'), st.size, st.letterSpacing, st.align);

	const attrs = [
		`x="0" y="0"`,
		`style="font-family: ${escapeXml(FONT_STACKS[st.font])}"`,
		`font-size="${fmt(st.size)}"`,
		st.bold ? 'font-weight="700"' : '',
		st.italic ? 'font-style="italic"' : '',
		st.letterSpacing ? `letter-spacing="${fmt(st.letterSpacing * st.size)}"` : '',
		`text-anchor="${st.align}"`,
		`fill="${escapeXml(st.color)}"`,
		st.halo
			? `stroke="${escapeXml(st.halo)}" stroke-width="${fmt(st.haloWidth * 2)}" stroke-linejoin="round"`
			: 'stroke="none"',
		'paint-order="stroke"',
	].filter(a => a !== '').join(' ');
	const tspans = lines
		.map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : fmt(st.size * TEXT_LINE)}">${escapeXml(line)}</tspan>`)
		.join('');

	const rotOpen = rot ? `<g transform="rotate(${fmt(rot)})">` : '<g>';
	let inner = rotOpen + `<text ${attrs}>${tspans}</text>`;
	if (wantsHits(item, ctx) && lines.join('') !== '') {
		inner += `<rect class="ink-hit" x="${fmt(m.x0)}" y="${fmt(m.y0)}" width="${fmt(m.width)}" height="${fmt(m.height)}"`
			+ ' fill="transparent" style="pointer-events:all"/>';
	}
	inner += '</g>';
	return openItem(item, ctx, 'ink-text', counter) + inner + '</g>';
}

/** Box of a text block relative to its anchor, in pixels at the given size. */
function textMetrics(text: string, size: number, letterSpacing: number, align: InkTextStyle['align']): { x0: number; y0: number; width: number; height: number } {
	const lines = text.split(/\r?\n/);
	let longest = 1;
	for (const line of lines) longest = Math.max(longest, line.length);
	const width = longest * size * TEXT_EM + letterSpacing * size * longest;
	const height = (lines.length - 1) * size * TEXT_LINE + size;
	const x0 = align === 'end' ? -width : align === 'middle' ? -width / 2 : 0;
	return { x0, y0: -size * 0.8, width, height };
}

// ---- paths and areas ---------------------------------------------------------

function pathSvg(item: InkPath, ctx: Ctx): string {
	const pts = item.points.map(p => ctx.project(p));
	if (pts.length < 2) return '';
	const st = readStroke(item.style, item.scaleWithMap === false);
	const d = shapeD(pts, false, st.smooth);
	const arrows = arrowAttrs(item.style, ctx, st.color, st.opacity);
	let out = openItem(item, ctx, 'ink-path', '') + strokeMarkup(pts, false, st, arrows, ctx);
	if (wantsHits(item, ctx)) out += hitPath(d);
	return out + '</g>';
}

function areaSvg(item: InkArea, ctx: Ctx): string {
	const pts = item.points.map(p => ctx.project(p));
	if (pts.length < 2) return '';
	const st = readStroke(item.style, item.scaleWithMap === false);
	return closedShape(item, ctx, 'ink-area', pts, st);
}

function boxSvg(item: InkBox, ctx: Ctx): string {
	const pa = ctx.project(item.a);
	const pb = ctx.project(item.b);
	const b = bounds([pa, pb]);
	if (!b) return '';
	const centre = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
	const rot = num(item.rotation, 0, -36000, 36000);
	const ellipse = item.kind === 'ellipse';
	let pts: Point[];
	if (ellipse) {
		const rx = (b.maxX - b.minX) / 2;
		const ry = (b.maxY - b.minY) / 2;
		pts = [];
		for (let i = 0; i < ELLIPSE_POINTS; i++) {
			const t = (2 * Math.PI * i) / ELLIPSE_POINTS;
			pts.push({ x: centre.x + rx * Math.cos(t), y: centre.y + ry * Math.sin(t) });
		}
	} else {
		pts = [
			{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
			{ x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
		];
	}
	if (rot) pts = pts.map(p => rotatePoint(p, centre, rot));
	const st = readStroke(item.style, item.scaleWithMap === false);
	return closedShape(item, ctx, 'ink-box', pts, { ...st, smooth: ellipse || st.smooth });
}

/** A filled, outlined closed shape with an optional hit outline. */
function closedShape(item: InkItem, ctx: Ctx, cls: string, pts: Point[], st: StrokeOpts): string {
	const d = shapeD(pts, true, st.smooth);
	let out = openItem(item, ctx, cls, '');
	const style = (item as InkArea | InkBox).style;
	out += fillMarkup(ctx, style, d);
	out += strokeMarkup(pts, true, st, '', ctx);
	if (wantsHits(item, ctx)) out += hitPath(d);
	return out + '</g>';
}

function fillMarkup(ctx: Ctx, style: Partial<InkStyle> | undefined, d: string): string {
	const s: Partial<InkStyle> = style ?? {};
	const pattern = typeof s.fillPattern === 'string' ? s.fillPattern : 'none';
	if (pattern === 'none') return '';
	const fill = colour(s.fill, '#c9a66b');
	const fillOpacity = num(s.fillOpacity, 0, 0, 1);
	let out = `<path class="ink-fill" d="${d}" fill="${escapeXml(fill)}" fill-opacity="${fmt(fillOpacity)}" stroke="none"/>`;
	const patternColour = colour(s.patternColor ?? s.stroke, INK);
	const id = patternRef(ctx, pattern as FillPattern, patternColour);
	if (id) out += `<path class="ink-pattern" d="${d}" fill="url(#${id})" stroke="none"/>`;
	return out;
}

interface StrokeOpts {
	color: string;
	width: number;
	opacity: number;
	dash: DashStyle;
	smooth: boolean;
	vector: boolean;
	/** A known brush id replaces the dash style. */
	brush?: string;
	brushFlip: boolean;
	brushScale: number;
}

function readStroke(style: Partial<InkStyle> | undefined, vector: boolean): StrokeOpts {
	const s: Partial<InkStyle> = style ?? {};
	const dash = typeof s.dash === 'string' && DASHES.indexOf(s.dash) >= 0 ? s.dash : 'solid';
	return {
		color: colour(s.stroke, INK),
		width: num(s.strokeWidth, 2, 0.1, 500),
		opacity: num(s.strokeOpacity, 1, 0, 1),
		dash,
		smooth: s.smooth === true,
		vector,
		brush: typeof s.brush === 'string' && getBrush(s.brush) ? s.brush : undefined,
		brushFlip: s.brushFlip === true,
		brushScale: num(s.brushScale, 1, 0.5, 3),
	};
}

/**
 * The stroke for a line. Dash styles build their geometry here in reference pixels,
 * so offsets and waves scale with the map. Strokes use non-scaling width when the item
 * keeps its screen size.
 */
function strokeMarkup(pts: Point[], closed: boolean, st: StrokeOpts, arrows: string, ctx: Ctx): string {
	let out = st.brush ? brushMarkup(pts, closed, st, ctx) : dashMarkup(pts, closed, st);
	if (arrows && !closed && pts.length >= 2) {
		// Invisible carrier: markers scale with stroke-width, so the width stays even though nothing is stroked.
		const d = shapeD(pts, false, st.smooth);
		out += `<path d="${d}" fill="none" stroke="none" stroke-width="${fmt(st.width)}"${arrows}/>`;
	}
	return out;
}

/** A brush's pieces in the item's stroke colour, opacity and width. */
function brushMarkup(pts: Point[], closed: boolean, st: StrokeOpts, ctx: Ctx): string {
	const line = st.smooth && pts.length >= (closed ? 3 : 2) ? sampleSmooth(pts, closed) : pts;
	// Keep-size items already draw at screen size; map-scaled items take the zoom damping.
	const width = st.vector ? st.width : st.width * ctx.brushDetail;
	const pieces = brushPieces(String(st.brush), line, { width, closed, flip: st.brushFlip, scale: st.brushScale });
	if (pieces.length === 0) return '';
	const body = pieces
		.map(piece => brushPieceMarkup(piece, {
			color: st.color,
			opacity: st.opacity,
			vector: st.vector,
			halo: ctx.stampHalo,
			lookupSymbol: ctx.lookupSymbol,
		}))
		.join('');
	return `<g class="ink-brush" data-brush="${escapeXml(String(st.brush))}">${body}</g>`;
}

/** Dense points along the Catmull-Rom curve through pts, so brushes follow smoothed lines. */
function sampleSmooth(pts: Point[], closed: boolean): Point[] {
	const n = pts.length;
	const at = (i: number): Point => (closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))]);
	const segments = closed ? n : n - 1;
	const out: Point[] = [];
	for (let i = 0; i < segments; i++) {
		const p0 = at(i - 1);
		const p1 = at(i);
		const p2 = at(i + 1);
		const p3 = at(i + 2);
		const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
		const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
		for (let k = 0; k < 8; k++) {
			const t = k / 8;
			const u = 1 - t;
			out.push({
				x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
				y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
			});
		}
	}
	if (!closed) out.push({ ...pts[n - 1] });
	return out;
}

/** The dash style of a line. Used when no brush is set. */
function dashMarkup(pts: Point[], closed: boolean, st: StrokeOpts): string {
	const w = st.width;
	const base = `fill="none" stroke="${escapeXml(st.color)}" stroke-opacity="${fmt(st.opacity)}"`
		+ ' stroke-linecap="round" stroke-linejoin="round"'
		+ (st.vector ? ' vector-effect="non-scaling-stroke"' : '');
	const line = (d: string, width: number, extra = ''): string =>
		d ? `<path class="ink-stroke" d="${d}" ${base} stroke-width="${fmt(width)}"${extra}/>` : '';
	const d = shapeD(pts, closed, st.smooth);
	const geo = closed ? [...pts, pts[0]] : pts;
	let out = '';
	switch (st.dash) {
		case 'dashed':
			out = line(d, w, ` stroke-dasharray="${fmt(Math.max(4, w * 4))} ${fmt(Math.max(3, w * 2.5))}"`);
			break;
		case 'dotted':
			out = line(d, w, ` stroke-dasharray="0 ${fmt(Math.max(3, w * 2.4))}"`);
			break;
		case 'double': {
			const offset = w * 0.9;
			const t = Math.max(0.6, w * 0.45);
			out = line(polylinePath(offsetPolyline(geo, offset)), t) + line(polylinePath(offsetPolyline(geo, -offset)), t);
			break;
		}
		case 'wavy':
			out = line(wavePath(geo, Math.max(1.5, w * 1.2), Math.max(8, w * 5)), w);
			break;
		case 'ticked': {
			const ticks = tickPath(tickSegments(geo, Math.max(5, w * 3.5), Math.max(3, w * 2.5), 'lower'));
			out = line(polylinePath(geo), w) + line(ticks, Math.max(0.75, w * 0.7));
			break;
		}
		case 'railway': {
			const gauge = Math.max(3, w * 2.2);
			const rails = line(polylinePath(offsetPolyline(geo, gauge / 2)), Math.max(0.8, w * 0.45))
				+ line(polylinePath(offsetPolyline(geo, -gauge / 2)), Math.max(0.8, w * 0.45));
			const ties = line(tickPath(railwaySegments(geo, Math.max(5, gauge * 1.2), gauge * 1.9)), Math.max(1, w * 0.7));
			out = rails + ties;
			break;
		}
		default:
			out = line(d, w);
	}
	return out;
}

function tickPath(segments: Array<[Point, Point]>): string {
	return segments
		.map(([a, b]) => `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`)
		.join('');
}

function shapeD(pts: Point[], closed: boolean, smooth: boolean): string {
	if (smooth && pts.length >= (closed ? 3 : 2)) return smoothPath(pts, closed);
	const d = polylinePath(pts);
	return closed ? `${d} Z` : d;
}

function hitPath(d: string): string {
	return `<path class="ink-hit" d="${d}" fill="none" stroke="transparent" stroke-width="${HIT_WIDTH}"`
		+ ' vector-effect="non-scaling-stroke" style="pointer-events:stroke"/>';
}

// ---- defs: patterns and arrowheads ---------------------------------------------

function patternRef(ctx: Ctx, pattern: FillPattern, color: string): string | undefined {
	let body: string;
	if (pattern === 'hatch') {
		body = `<pattern width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
			+ `<path d="M0 0H8" fill="none" stroke="${escapeXml(color)}" stroke-width="1.2"/></pattern>`;
	} else if (pattern === 'crosshatch') {
		body = `<pattern width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
			+ `<path d="M0 0H8M0 0V8" fill="none" stroke="${escapeXml(color)}" stroke-width="1.1"/></pattern>`;
	} else if (pattern === 'dots') {
		body = `<pattern width="8" height="8" patternUnits="userSpaceOnUse">`
			+ `<circle cx="4" cy="4" r="1.2" fill="${escapeXml(color)}"/></pattern>`;
	} else if (typeof pattern === 'string' && pattern.indexOf('symbol:') === 0) {
		const symbol = ctx.lookupSymbol(pattern.slice('symbol:'.length));
		if (!symbol) return undefined;
		body = `<pattern width="18" height="18" patternUnits="userSpaceOnUse">`
			+ `<g transform="translate(3 3) scale(0.5)" color="${escapeXml(color)}" fill="none" stroke="currentColor"`
			+ ` stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${symbol.body}</g></pattern>`;
	} else {
		return undefined;
	}
	const id = `${ctx.prefix}pat-${hash(`${pattern}|${color}`)}`;
	if (!ctx.defs.has(id)) ctx.defs.set(id, body.replace('<pattern ', `<pattern id="${id}" `));
	return id;
}

function arrowAttrs(style: Partial<InkStyle> | undefined, ctx: Ctx, color: string, opacity: number): string {
	const s: Partial<InkStyle> = style ?? {};
	if (!s.arrowStart && !s.arrowEnd) return '';
	const id = `${ctx.prefix}arw-${hash(`${color}|${opacity}`)}`;
	if (!ctx.defs.has(id)) {
		ctx.defs.set(id, `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="3.5" markerHeight="3.5"`
			+ ' orient="auto-start-reverse" markerUnits="strokeWidth">'
			+ `<path d="M0 0L10 5L0 10z" fill="${escapeXml(color)}" fill-opacity="${fmt(opacity)}"/></marker>`);
	}
	let attrs = '';
	if (s.arrowStart) attrs += ` marker-start="url(#${id})"`;
	if (s.arrowEnd) attrs += ` marker-end="url(#${id})"`;
	return attrs;
}

// ---- values -------------------------------------------------------------------

function readText(style: Partial<InkTextStyle> | undefined): {
	font: InkTextStyle['font'];
	size: number;
	color: string;
	halo: string;
	haloWidth: number;
	bold: boolean;
	italic: boolean;
	letterSpacing: number;
	align: InkTextStyle['align'];
} {
	const s: Partial<InkTextStyle> = style ?? {};
	const font = typeof s.font === 'string' && Object.prototype.hasOwnProperty.call(FONT_STACKS, s.font) ? s.font : 'serif';
	const align = s.align === 'start' || s.align === 'end' ? s.align : 'middle';
	const halo = typeof s.halo === 'string' && s.halo !== '' ? colour(s.halo, '') : '';
	return {
		font,
		size: num(s.size, 24, 1, 2000),
		color: colour(s.color, '#2b1d12'),
		halo,
		haloWidth: num(s.haloWidth, 3, 0, 100),
		bold: s.bold === true,
		italic: s.italic === true,
		letterSpacing: num(s.letterSpacing, 0, -1, 5),
		align,
	};
}

function refSize(size: number, scaleWithMap: boolean, pxToRef: number): number {
	return scaleWithMap === false ? size * pxToRef : size;
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
	return {
		minX: Math.min(a.minX, b.minX),
		minY: Math.min(a.minY, b.minY),
		maxX: Math.max(a.maxX, b.maxX),
		maxY: Math.max(a.maxY, b.maxY),
	};
}

function num(v: unknown, fallback: number, min: number, max: number): number {
	const n = typeof v === 'number' ? v : NaN;
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/** A colour that is safe to write into markup, or the fallback. */
function colour(v: unknown, fallback: string): string {
	if (typeof v !== 'string') return fallback;
	const s = v.trim();
	if (s === 'transparent' || isValidColor(s)) return s;
	return fallback;
}

/** FNV-1a, short and stable. Used for ids of shared defs. */
function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}
