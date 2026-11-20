/**
 * Pure edits to an InkDoc for the Map Ink select tool. Every function returns a new
 * document and never mutates its input.
 *
 * Positions are latlng ([lat, lng], as Leaflet uses). Callers convert pixel gestures
 * first. Rotation and resizing are linear in latlng, which is exact for CRS.Simple and
 * close for Mercator maps over small areas.
 *
 * Only selectable items change. An item that is locked or hidden, or sits on a locked
 * or hidden layer, is left alone by every edit here. setLocked is the one exception.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type { InkArea, InkBox, InkDoc, InkItem, InkLayerDef, InkPath, InkPoint, InkStyle, InkTextStyle } from './model';

/** A box in latlng. Min is south-west, max is north-east. */
export interface LatLngBox {
	minLat: number;
	minLng: number;
	maxLat: number;
	maxLng: number;
}

/** A latlng offset. */
export interface LatLngOffset {
	dLat: number;
	dLng: number;
}

export type ReorderOp = 'forward' | 'backward' | 'front' | 'back';

/** A copied style. It pastes onto items of the same family. */
export type StyleClip =
	| { family: 'shape'; style: InkStyle }
	| { family: 'text'; style: InkTextStyle }
	| { family: 'stamp'; color: string; opacity: number };

export interface DuplicateResult {
	doc: InkDoc;
	newIds: string[];
}

const MIN_SIZE = 1;
const MAX_SIZE = 2000;
const EPS = 1e-12;

type PointFn = (p: InkPoint) => InkPoint;

// ---- selectability -----------------------------------------------------------

/** The ids (from `ids`) of items that may be edited on the map, in paint order. */
function allowedSet(doc: InkDoc, ids: Iterable<string>): Set<string> {
	const want = new Set(ids);
	const layers = new Map<string, InkLayerDef>();
	for (const layer of doc.layers) layers.set(layer.id, layer);
	const out = new Set<string>();
	for (const item of doc.items) {
		if (!want.has(item.id) || item.locked || item.hidden) continue;
		const layer = layers.get(item.layer);
		if (layer && (layer.locked || layer.visible === false)) continue;
		out.add(item.id);
	}
	return out;
}

/** True when the item may be selected and edited on the map. */
export function selectable(doc: InkDoc, id: string): boolean {
	return allowedSet(doc, [id]).has(id);
}

/** The ids from `ids` that are selectable, in paint order, without duplicates. */
export function selectableIds(doc: InkDoc, ids: Iterable<string>): string[] {
	const allowed = allowedSet(doc, ids);
	return doc.items.filter(item => allowed.has(item.id)).map(item => item.id);
}

// ---- helpers -------------------------------------------------------------------

function mapItems(doc: InkDoc, fn: (item: InkItem) => InkItem): InkDoc {
	return { ...doc, items: doc.items.map(fn) };
}

/** Apply a point function to every point the item owns (anchor, path points, box corners). */
function mapGeometry(item: InkItem, f: PointFn): InkItem {
	switch (item.kind) {
		case 'stamp':
		case 'text':
			return { ...item, at: f(item.at) };
		case 'path':
		case 'freehand':
		case 'area':
			return { ...item, points: item.points.map(p => f(p)) };
		case 'rect':
		case 'ellipse':
			return { ...item, a: f(item.a), b: f(item.b) };
	}
}

function clampSize(n: number): number {
	return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

function normAngle(n: number): number {
	const r = ((n % 360) + 360) % 360;
	return r >= 360 ? 0 : r;
}

function normBox(b: LatLngBox): LatLngBox {
	return {
		minLat: Math.min(b.minLat, b.maxLat),
		maxLat: Math.max(b.minLat, b.maxLat),
		minLng: Math.min(b.minLng, b.maxLng),
		maxLng: Math.max(b.minLng, b.maxLng),
	};
}

function freshId(kind: string, used: Set<string>): string {
	for (let n = 1; ; n++) {
		const id = `${kind}-${n}`;
		if (!used.has(id)) return id;
	}
}

function isIndex(index: number, length: number): boolean {
	return Number.isInteger(index) && index >= 0 && index < length;
}

// ---- move, resize, rotate ------------------------------------------------------

/** Shift the selected items by a latlng offset. */
export function moveItems(doc: InkDoc, ids: Iterable<string>, dLat: number, dLng: number): InkDoc {
	const ok = allowedSet(doc, ids);
	if (ok.size === 0 || (dLat === 0 && dLng === 0)) return doc;
	return mapItems(doc, item => (ok.has(item.id) ? mapGeometry(item, p => [p[0] + dLat, p[1] + dLng]) : item));
}

/**
 * The box the selection becomes. Without keepRatio, `toBox` is used as given. With it,
 * the axis that changed more sets the scale, and the box keeps the side that did not
 * move as its anchor (or the centre when both sides moved).
 */
export function fitBox(fromBox: LatLngBox, toBox: LatLngBox, keepRatio: boolean): LatLngBox {
	const from = normBox(fromBox);
	const to = normBox(toBox);
	if (!keepRatio) return to;
	const w0 = from.maxLng - from.minLng;
	const h0 = from.maxLat - from.minLat;
	const w1 = to.maxLng - to.minLng;
	const h1 = to.maxLat - to.minLat;
	const sx = w0 > EPS ? w1 / w0 : 1;
	const sy = h0 > EPS ? h1 / h0 : 1;
	const s = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
	const [minLng, maxLng] = anchorSpan(from.minLng, from.maxLng, to.minLng, to.maxLng, w0 * s);
	const [minLat, maxLat] = anchorSpan(from.minLat, from.maxLat, to.minLat, to.maxLat, h0 * s);
	return { minLat, minLng, maxLat, maxLng };
}

function anchorSpan(fromMin: number, fromMax: number, toMin: number, toMax: number, size: number): [number, number] {
	if (toMin === fromMin) return [fromMin, fromMin + size];
	if (toMax === fromMax) return [fromMax - size, fromMax];
	const c = (fromMin + fromMax) / 2;
	return [c - size / 2, c + size / 2];
}

/**
 * Map the selection from one latlng box onto another. Points move linearly, stamp and
 * text sizes scale by the geometric mean of the two axis scales, and rectangle and
 * ellipse corners move with the box. Sizes stay within 1 to 2000.
 */
export function resizeItems(doc: InkDoc, ids: Iterable<string>, fromBox: LatLngBox, toBox: LatLngBox, keepRatio: boolean): InkDoc {
	const ok = allowedSet(doc, ids);
	if (ok.size === 0) return doc;
	const from = normBox(fromBox);
	const to = fitBox(from, toBox, keepRatio);
	const w0 = from.maxLng - from.minLng;
	const h0 = from.maxLat - from.minLat;
	const sLng = w0 > EPS ? (to.maxLng - to.minLng) / w0 : 1;
	const sLat = h0 > EPS ? (to.maxLat - to.minLat) / h0 : 1;
	const uniform = Math.sqrt(sLng * sLat);
	const map: PointFn = p => [
		to.minLat + (p[0] - from.minLat) * sLat,
		to.minLng + (p[1] - from.minLng) * sLng,
	];
	return mapItems(doc, item => {
		if (!ok.has(item.id)) return item;
		switch (item.kind) {
			case 'stamp':
				return { ...item, at: map(item.at), size: clampSize(item.size * uniform) };
			case 'text':
				return { ...item, at: map(item.at), style: { ...item.style, size: clampSize(item.style.size * uniform) } };
			default:
				return mapGeometry(item, map);
		}
	});
}

/**
 * Rotate the selection by `degrees` (positive is clockwise on screen) about a latlng
 * centre. Stamps, text, rectangles and ellipses get a rotation field, and their anchor
 * or centre moves with the group. Paths, areas and freehand strokes have their points
 * rotated.
 */
export function rotateItems(doc: InkDoc, ids: Iterable<string>, centre: InkPoint, degrees: number): InkDoc {
	const ok = allowedSet(doc, ids);
	if (ok.size === 0 || !degrees || !Number.isFinite(degrees)) return doc;
	const rad = (degrees * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	// Screen y is -lat, so a clockwise turn on screen is this turn in latlng.
	const rot: PointFn = p => {
		const dLat = p[0] - centre[0];
		const dLng = p[1] - centre[1];
		return [centre[0] + dLat * cos - dLng * sin, centre[1] + dLng * cos + dLat * sin];
	};
	return mapItems(doc, item => {
		if (!ok.has(item.id)) return item;
		switch (item.kind) {
			case 'stamp':
				return { ...item, at: rot(item.at), rotation: normAngle(item.rotation + degrees) };
			case 'text':
				return { ...item, at: rot(item.at), rotation: normAngle(item.rotation + degrees) };
			case 'rect':
			case 'ellipse': {
				const c: InkPoint = [(item.a[0] + item.b[0]) / 2, (item.a[1] + item.b[1]) / 2];
				const c2 = rot(c);
				const dLat = c2[0] - c[0];
				const dLng = c2[1] - c[1];
				const a: InkPoint = [item.a[0] + dLat, item.a[1] + dLng];
				const b: InkPoint = [item.b[0] + dLat, item.b[1] + dLng];
				return { ...item, a, b, rotation: normAngle(item.rotation + degrees) };
			}
			default:
				return mapGeometry(item, rot);
		}
	});
}

// ---- vertices ------------------------------------------------------------------

/** Edit the points of a path, freehand stroke or area. `edit` returns null to leave the doc alone. */
function editPoints(
	doc: InkDoc,
	id: string,
	edit: (points: InkPoint[], item: InkPath | InkArea) => InkPoint[] | null,
): InkDoc {
	if (!selectable(doc, id)) return doc;
	const item = doc.items.find(i => i.id === id);
	if (!item || (item.kind !== 'path' && item.kind !== 'freehand' && item.kind !== 'area')) return doc;
	const next = edit(item.points.slice(), item);
	if (!next) return doc;
	return mapItems(doc, i => (i.id === id ? { ...item, points: next } : i));
}

/** Set vertex `index` of a path, freehand stroke or area to a latlng. */
export function moveVertex(doc: InkDoc, id: string, index: number, latlng: InkPoint): InkDoc {
	return editPoints(doc, id, points => {
		if (!isIndex(index, points.length)) return null;
		points[index] = [latlng[0], latlng[1]];
		return points;
	});
}

/** Insert a vertex after `afterIndex` (-1 inserts at the start). */
export function insertVertex(doc: InkDoc, id: string, afterIndex: number, latlng: InkPoint): InkDoc {
	return editPoints(doc, id, points => {
		const at = Math.min(points.length, Math.max(0, afterIndex + 1));
		points.splice(at, 0, [latlng[0], latlng[1]]);
		return points;
	});
}

/** Remove vertex `index`. A path keeps at least 2 points and an area at least 3. */
export function deleteVertex(doc: InkDoc, id: string, index: number): InkDoc {
	return editPoints(doc, id, (points, item) => {
		const min = item.kind === 'area' ? 3 : 2;
		if (points.length <= min || !isIndex(index, points.length)) return null;
		points.splice(index, 1);
		return points;
	});
}

// ---- copies --------------------------------------------------------------------

/**
 * Copies of the given items, offset in latlng, appended to the top of the document.
 * Copies keep their layer and get new ids. Locked and hidden flags are cleared.
 */
export function pasteItems(doc: InkDoc, items: readonly InkItem[], offset: LatLngOffset, layerId?: string): DuplicateResult {
	if (items.length === 0) return { doc, newIds: [] };
	const used = new Set(doc.items.map(i => i.id));
	const layers = new Set(doc.layers.map(l => l.id));
	const fallback = doc.layers.length > 0 ? doc.layers[0].id : 'terrain';
	const copies: InkItem[] = [];
	const newIds: string[] = [];
	for (const src of items) {
		const id = freshId(src.kind, used);
		used.add(id);
		newIds.push(id);
		const layer = layerId && layers.has(layerId) ? layerId : layers.has(src.layer) ? src.layer : fallback;
		const shifted = mapGeometry(src, p => [p[0] + offset.dLat, p[1] + offset.dLng]);
		const copy: InkItem = { ...shifted, id, layer };
		delete copy.locked;
		delete copy.hidden;
		copies.push(copy);
	}
	return { doc: { ...doc, items: doc.items.concat(copies) }, newIds };
}

/** Copies of the selectable items among `ids`, offset in latlng. See pasteItems. */
export function duplicateItems(doc: InkDoc, ids: Iterable<string>, offset: LatLngOffset): DuplicateResult {
	const ok = allowedSet(doc, ids);
	return pasteItems(doc, doc.items.filter(item => ok.has(item.id)), offset);
}

// ---- z-order ---------------------------------------------------------------------

function reorderSeq(seq: InkItem[], isSel: (item: InkItem) => boolean, op: ReorderOp): InkItem[] {
	const out = seq.slice();
	const swap = (i: number, j: number): void => {
		const t = out[i];
		out[i] = out[j];
		out[j] = t;
	};
	switch (op) {
		case 'front':
			return [...seq.filter(x => !isSel(x)), ...seq.filter(x => isSel(x))];
		case 'back':
			return [...seq.filter(x => isSel(x)), ...seq.filter(x => !isSel(x))];
		case 'forward':
			for (let i = out.length - 2; i >= 0; i--) {
				if (isSel(out[i]) && !isSel(out[i + 1])) swap(i, i + 1);
			}
			return out;
		case 'backward':
			for (let i = 1; i < out.length; i++) {
				if (!isSel(out[i - 1]) && isSel(out[i])) swap(i - 1, i);
			}
			return out;
	}
	return out;
}

/**
 * Change paint order inside each layer. 'forward' and 'backward' move each selected item
 * past one neighbour in its layer. 'front' and 'back' move the selection to the top or
 * bottom of its layer. Items keep their relative order within the selection.
 */
export function reorder(doc: InkDoc, ids: Iterable<string>, op: ReorderOp): InkDoc {
	const ok = allowedSet(doc, ids);
	if (ok.size === 0) return doc;
	const items = doc.items.slice();
	const slotsByLayer = new Map<string, number[]>();
	items.forEach((item, i) => {
		const list = slotsByLayer.get(item.layer);
		if (list) list.push(i);
		else slotsByLayer.set(item.layer, [i]);
	});
	const isSel = (item: InkItem): boolean => ok.has(item.id);
	slotsByLayer.forEach(slots => {
		const next = reorderSeq(slots.map(i => items[i]), isSel, op);
		slots.forEach((slot, k) => {
			items[slot] = next[k];
		});
	});
	return { ...doc, items };
}

// ---- delete, lock, style ---------------------------------------------------------

/** Remove the given items. Any id is removed, selectable or not. */
export function deleteItems(doc: InkDoc, ids: Iterable<string>): InkDoc {
	const gone = new Set(ids);
	const items = doc.items.filter(item => !gone.has(item.id));
	return items.length === doc.items.length ? doc : { ...doc, items };
}

/**
 * Lock or unlock the given items. Works on any item, including ones that are already
 * locked, because it is how a locked item gets unlocked.
 */
export function setLocked(doc: InkDoc, ids: Iterable<string>, locked: boolean): InkDoc {
	const want = new Set(ids);
	return mapItems(doc, item => {
		if (!want.has(item.id)) return item;
		const next: InkItem = { ...item };
		if (locked) next.locked = true;
		else delete next.locked;
		return next;
	});
}

function hasShapeStyle(item: InkItem): item is InkPath | InkArea | InkBox {
	return item.kind === 'path' || item.kind === 'freehand' || item.kind === 'area' || item.kind === 'rect' || item.kind === 'ellipse';
}

/** The style of an item, as a clip that pastes onto items of the same family. Undefined for an unknown kind. */
export function copyStyle(item: InkItem): StyleClip | undefined {
	switch (item.kind) {
		case 'stamp':
			return { family: 'stamp', color: item.color, opacity: item.opacity };
		case 'text':
			return { family: 'text', style: { ...item.style } };
		case 'path':
		case 'freehand':
		case 'area':
		case 'rect':
		case 'ellipse':
			return { family: 'shape', style: { ...item.style } };
	}
	return undefined;
}

/** Paste a copied style onto the selectable items among `ids` that are in the same family. */
export function pasteStyle(doc: InkDoc, ids: Iterable<string>, clip: StyleClip): InkDoc {
	const ok = allowedSet(doc, ids);
	return mapItems(doc, item => {
		if (!ok.has(item.id)) return item;
		if (clip.family === 'stamp') {
			return item.kind === 'stamp' ? { ...item, color: clip.color, opacity: clip.opacity } : item;
		}
		if (clip.family === 'text') {
			return item.kind === 'text' ? { ...item, style: { ...clip.style } } : item;
		}
		return hasShapeStyle(item) ? { ...item, style: { ...clip.style } } : item;
	});
}
