/**
 * Contracts and shared helpers for Map Ink draw tools.
 *
 * Tools listen on the map container with pointer events. They never use the
 * Leaflet map events for drawing, so a tool can stop a gesture before Leaflet
 * sees it. While a draw tool is armed the map does not pan on drag, does not
 * zoom on double click, and does not pass clicks on to other listeners. Holding
 * Space pans the map with any tool.
 *
 * Pure TypeScript: no Obsidian imports. Plain DOM only.
 */
import type { InkHost } from '../host';
import type { InkLayer } from '../InkLayer';
import type { InkDoc, InkItem, InkPath, InkPoint, InkStyle } from '../model';
import type { InkStoreLike, InkToolId } from '../storeTypes';
import { bounds } from '../geometry';
import type { Point } from '../geometry';
import { buildItem, fmt } from '../svgBuild';

/** A tool snaps to an existing vertex within this many container pixels. */
export const SNAP_RADIUS = 10;
/** Drags shorter than this many container pixels draw nothing. */
export const TINY_DRAG = 4;
/** Freehand strokes are simplified with this tolerance, in container pixels. */
export const FREEHAND_TOLERANCE = 1.5;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The part of the Leaflet namespace the tools use. Pass the real `L`. */
export interface InkLeafletNamespace {
	DomEvent: { stop(e: Event): unknown };
	CRS: { Simple: unknown };
}

export interface InkLatLngLike {
	lat: number;
	lng: number;
}


/**
 * The part of InkStore the tools use. InkStore implements it. The select tool, the
 * keyboard handler and the draw tools all take this one shape.
 */
export interface InkToolStore extends InkStoreLike {
	/** Replace the selection. */
	select(ids: Iterable<string>): void;
	/** Add the id to the selection, or remove it when it is already selected. */
	toggleSelect(id: string): void;
	clearSelection(): void;
	/** Change the document. One undo step per coalesceKey run. Normalises and saves. */
	apply(change: (doc: InkDoc) => InkDoc, coalesceKey?: string): void;
	/** Write any pending save now. */
	flush(): Promise<void>;
	/** The layer id that new items go to. */
	activeLayer(): string;
	/** Add an item on the active layer and select it. Returns its id, or '' when the item is not valid. */
	addItem(item: Omit<InkItem, 'id' | 'layer'> & Partial<Pick<InkItem, 'id' | 'layer'>>): string;
}

/** The part of the Leaflet map the tools use. Pass the real map. */
export interface InkToolMap {
	options: { crs?: unknown };
	getZoom(): number;
	getMinZoom(): number;
	getZoomScale(toZoom: number, fromZoom: number): number;
	getContainer(): HTMLElement;
	project(latlng: InkPoint | InkLatLngLike, zoom?: number): Point;
	unproject(point: InkPoint | Point, zoom?: number): InkLatLngLike;
	latLngToContainerPoint(latlng: InkPoint | InkLatLngLike): Point;
	containerPointToLatLng(point: InkPoint | Point): InkLatLngLike;
	on(type: string, fn: (e: never) => void): unknown;
	off(type: string, fn: (e: never) => void): unknown;
	dragging: { enabled(): boolean; enable(): unknown; disable(): unknown };
	doubleClickZoom: { enabled(): boolean; enable(): unknown; disable(): unknown };
}

/**
 * The one context every Map Ink tool gets. InkEditor builds it. Tests can build a
 * smaller fake when they only drive the store.
 */
export interface InkToolContext {
	/** The Leaflet namespace, passed in so the core never imports Leaflet. */
	L: InkLeafletNamespace;
	map: InkToolMap;
	store: InkToolStore;
	layer: InkLayer;
	host: InkHost;
	/** An absolutely positioned HTML overlay over the map, the same size as the map. Tools add their own children and remove them. */
	previewPane: HTMLElement;
	/**
	 * The reference zoom the layer projects at. Must match the layer's own choice:
	 * pass the same refZoom given to createInkLayer, or leave it out to use the default
	 * (0 for CRS.Simple, else the map's min zoom).
	 */
	refZoom?: number;
	/** Called with the id of a text item the user double-clicked. */
	onEditText?: (id: string) => void;
}

export interface InkTool {
	id: InkToolId;
	activate(ctx: InkToolContext): void;
	deactivate(): void;
	/** Keyboard input while the tool is armed. Returns true when the key was used. */
	onKey?(e: KeyboardEvent): boolean;
	/** Finish the draft, for a touch Finish button. Only path and area have it. */
	finish?(): void;
	/** True while the tool holds an unfinished draft, so the Finish button can show. */
	hasDraft?(): boolean;
}

// ---- coordinates -----------------------------------------------------------

/** A client event position in container pixels. */
export function containerPointOf(ctx: InkToolContext, e: { clientX: number; clientY: number }): Point {
	const rect = ctx.map.getContainer().getBoundingClientRect();
	return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function toLatLng(ctx: InkToolContext, p: Point): InkPoint {
	const ll = ctx.map.containerPointToLatLng([p.x, p.y]);
	return [ll.lat, ll.lng];
}

export function toContainer(ctx: InkToolContext, ll: InkPoint | InkLatLngLike): Point {
	const p = ctx.map.latLngToContainerPoint(ll);
	return { x: p.x, y: p.y };
}

export function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The reference zoom the layer uses: 0 for CRS.Simple, otherwise the map's minimum zoom. Keep in step with InkLayer. */
export function refZoomOf(ctx: InkToolContext): number {
	if (typeof ctx.refZoom === 'number' && Number.isFinite(ctx.refZoom)) return ctx.refZoom;
	return ctx.map.options.crs === ctx.L.CRS.Simple ? 0 : ctx.map.getMinZoom();
}

// ---- which events belong to the map ----------------------------------------

const UI_SELECTOR = [
	'.leaflet-control-container',
	'.leaflet-control',
	'.ink-toolbar',
	'.ink-inspector',
	'.ink-ui',
	'.ink-text-editor',
	'button',
	'input',
	'select',
	'textarea',
	'[contenteditable="true"]',
	'[contenteditable=""]',
].join(', ');

/** True when the target is on the map itself, not on a control, an input or a text editor. */
export function isMapTarget(ctx: InkToolContext, target: EventTarget | null): boolean {
	const container = ctx.map.getContainer();
	const el = target as Element | null;
	if (!el || typeof el.closest !== 'function' || !container.contains(el)) return false;
	const hit = el.closest(UI_SELECTOR);
	return !(hit && container.contains(hit));
}

function isTypingTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	if (el.isContentEditable) return true;
	const tag = typeof el.tagName === 'string' ? el.tagName : '';
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

// ---- snapping ---------------------------------------------------------------

/** The vertices an item can be snapped to. */
function verticesOf(item: InkItem): InkPoint[] {
	switch (item.kind) {
		case 'stamp':
		case 'text': return [item.at];
		case 'rect':
		case 'ellipse': return [item.a, item.b];
		default: return item.points;
	}
}

/**
 * The point a tool places: the host's snap (the grid, when it has one), then the
 * nearest existing vertex within SNAP_RADIUS container pixels. Holding Alt skips
 * the vertex snap.
 */
export function snapLatLng(ctx: InkToolContext, p: Point, e: { altKey: boolean }): InkPoint {
	let ll = toLatLng(ctx, p);
	if (typeof ctx.host.snapPoint === 'function') {
		const snapped = ctx.host.snapPoint(ll);
		ll = [snapped[0], snapped[1]];
	}
	if (e.altKey) return ll;
	const here = toContainer(ctx, ll);
	let best: { d: number; at: InkPoint } | undefined;
	for (const item of ctx.store.doc.items) {
		for (const vertex of verticesOf(item)) {
			const d = distance(toContainer(ctx, vertex), here);
			if (d <= SNAP_RADIUS && (!best || d < best.d)) best = { d, at: vertex };
		}
	}
	return best ? [best.at[0], best.at[1]] : ll;
}

// ---- eyedropper -------------------------------------------------------------

const STYLED_TOOLS: readonly InkToolId[] = ['path', 'area', 'freehand', 'rect', 'ellipse'];

/** Copy an item's look into the current tool's style, as far as the tool can take it. */
export function copyStyleFromItem(ctx: InkToolContext, item: InkItem, tool: InkToolId): void {
	const store = ctx.store;
	if (item.kind === 'text') {
		if (tool === 'text') store.setCurrentTextStyle({ ...item.style });
		return;
	}
	if (item.kind === 'stamp') {
		if (tool === 'stamp') {
			store.setCurrentSymbol(item.symbol);
			store.setCurrentStyle({ stroke: item.color, strokeOpacity: item.opacity, strokeWidth: item.size });
		} else if (STYLED_TOOLS.includes(tool)) {
			store.setCurrentStyle({ stroke: item.color, strokeOpacity: item.opacity });
		}
		return;
	}
	if (tool === 'stamp') {
		store.setCurrentStyle({ stroke: item.style.stroke, strokeOpacity: item.style.strokeOpacity });
	} else if (STYLED_TOOLS.includes(tool)) {
		store.setCurrentStyle({ ...item.style });
	}
}

/**
 * Alt-click eyedropper. When Alt is held, copies the style of the item under the
 * pointer into the tool and returns true, so the caller draws nothing.
 */
export function eyedropAt(ctx: InkToolContext, e: { altKey: boolean; clientX: number; clientY: number }, tool: InkToolId): boolean {
	if (!e.altKey) return false;
	const id = ctx.layer.itemAt(e.clientX, e.clientY);
	const item = id === undefined ? undefined : ctx.store.doc.items.find(candidate => candidate.id === id);
	if (item) copyStyleFromItem(ctx, item, tool);
	return true;
}

// ---- preview ----------------------------------------------------------------

/**
 * Draws drafts in the preview overlay with buildItem, so a draft looks like the
 * item it will become. Items are laid out the way the layer lays them out: the
 * reference-pixel group is scaled by the current zoom, and keep-size items are
 * counter-scaled.
 */
export class Preview {
	private readonly svg: SVGSVGElement;
	private readonly root: SVGGElement;

	constructor(private readonly ctx: InkToolContext) {
		const doc = ctx.previewPane.ownerDocument;
		this.svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
		this.svg.setAttribute('class', 'ink-preview');
		this.svg.setAttribute('style', 'position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none;');
		this.root = doc.createElementNS(SVG_NS, 'g') as SVGGElement;
		this.svg.appendChild(this.root);
		ctx.previewPane.appendChild(this.svg);
	}

	/** Replace the drafts. `marks` are vertices drawn as small rings on top. */
	draw(items: readonly InkItem[], marks: readonly InkPoint[] = []): void {
		const { map } = this.ctx;
		const ref = refZoomOf(this.ctx);
		const scale = map.getZoomScale(map.getZoom(), ref);
		const origin = toContainer(this.ctx, map.unproject([0, 0], ref));
		this.root.setAttribute('transform', `translate(${fmt(origin.x)} ${fmt(origin.y)}) scale(${fmt(scale)})`);

		const project = (p: InkPoint): Point => {
			const q = map.project(p, ref);
			return { x: q.x, y: q.y };
		};
		const defs = new Map<string, string>();
		let markup = '';
		for (const item of items) markup += buildItem(item, { project, idPrefix: 'ink-preview-', readOnly: true }, defs);
		const ring = fmt(4 / scale);
		const stroke = fmt(1.5 / scale);
		for (const mark of marks) {
			const q = project(mark);
			markup += `<circle cx="${fmt(q.x)}" cy="${fmt(q.y)}" r="${ring}" fill="#ffffff" stroke="#3b82c4" stroke-width="${stroke}"/>`;
		}

		const doc = this.root.ownerDocument;
		const range = doc.createRange();
		range.selectNodeContents(this.root);
		const fragment = range.createContextualFragment(`<defs>${[...defs.values()].join('')}</defs>${markup}`);
		this.root.replaceChildren(fragment);

		const counters = this.root.querySelectorAll('[data-ink-counter]');
		for (let i = 0; i < counters.length; i++) {
			const el = counters[i];
			el.setAttribute('transform', `translate(${el.getAttribute('data-ink-at') ?? '0 0'}) scale(${fmt(1 / scale)})`);
		}
		const all = this.root.querySelectorAll('*');
		for (let i = 0; i < all.length; i++) all[i].setAttribute('pointer-events', 'none');
	}

	clear(): void {
		this.root.replaceChildren();
	}

	destroy(): void {
		this.svg.remove();
	}
}

// ---- drawing sessions ---------------------------------------------------------

export interface SurfaceHandlers {
	down?(e: PointerEvent, p: Point): void;
	move?(e: PointerEvent, p: Point): void;
	up?(e: PointerEvent, p: Point): void;
	cancel?(): void;
	dblclick?(e: MouseEvent, p: Point): void;
}

export interface DrawSession {
	readonly ctx: InkToolContext;
	readonly preview: Preview;
	/** True while Space is held, so the map pans and the tool ignores the pointer. */
	spaceHeld(): boolean;
	/** Remove all listeners and restore the map and the cursor. Flushes saves. */
	end(): void;
}

/**
 * Start a draw session: the map stops dragging and double-click zoom, the
 * container gets the cursor, pointer events go to `handlers`, and clicks on the
 * map are stopped so nothing else sees them. Holding Space hands the pointer back
 * to the map.
 */
export function startDrawSession(ctx: InkToolContext, cursor: string, handlers: SurfaceHandlers): DrawSession {
	const container = ctx.map.getContainer();
	const previousCursor = container.style.cursor;
	container.style.cursor = cursor;

	const map = ctx.map;
	const dragWas = map.dragging.enabled();
	const zoomWas = map.doubleClickZoom.enabled();
	map.dragging.disable();
	map.doubleClickZoom.disable();

	let space = false;
	const stopSpace = trackSpace(ctx, held => {
		space = held;
		if (held) map.dragging.enable();
		else map.dragging.disable();
	});

	const onDown = (e: PointerEvent): void => {
		if (space || e.button !== 0 || !isMapTarget(ctx, e.target)) return;
		ctx.L.DomEvent.stop(e);
		try {
			container.setPointerCapture(e.pointerId);
		} catch (err) {
			// Some synthetic events cannot be captured. The gesture still works without it.
		}
		handlers.down?.(e, containerPointOf(ctx, e));
	};
	const onMove = (e: PointerEvent): void => {
		if (space || !isMapTarget(ctx, e.target)) return;
		handlers.move?.(e, containerPointOf(ctx, e));
	};
	const onUp = (e: PointerEvent): void => {
		if (space || !isMapTarget(ctx, e.target)) return;
		handlers.up?.(e, containerPointOf(ctx, e));
	};
	const onCancel = (): void => {
		handlers.cancel?.();
	};
	const onDbl = (e: MouseEvent): void => {
		if (space || !isMapTarget(ctx, e.target)) return;
		ctx.L.DomEvent.stop(e);
		handlers.dblclick?.(e, containerPointOf(ctx, e));
	};
	const onClick = (e: MouseEvent): void => {
		if (space || !isMapTarget(ctx, e.target)) return;
		ctx.L.DomEvent.stop(e);
	};

	container.addEventListener('pointerdown', onDown, true);
	container.addEventListener('pointermove', onMove, true);
	container.addEventListener('pointerup', onUp, true);
	container.addEventListener('pointercancel', onCancel, true);
	container.addEventListener('dblclick', onDbl, true);
	container.addEventListener('click', onClick, true);

	const preview = new Preview(ctx);
	let ended = false;

	return {
		ctx,
		preview,
		spaceHeld: () => space,
		end(): void {
			if (ended) return;
			ended = true;
			container.removeEventListener('pointerdown', onDown, true);
			container.removeEventListener('pointermove', onMove, true);
			container.removeEventListener('pointerup', onUp, true);
			container.removeEventListener('pointercancel', onCancel, true);
			container.removeEventListener('dblclick', onDbl, true);
			container.removeEventListener('click', onClick, true);
			stopSpace();
			preview.destroy();
			map.dragging[dragWas ? 'enable' : 'disable']();
			map.doubleClickZoom[zoomWas ? 'enable' : 'disable']();
			container.style.cursor = previousCursor;
			void ctx.store.flush();
		},
	};
}

/**
 * Watch Space. Calls onChange(true) when it goes down and onChange(false) when it
 * comes up, or when the window loses focus. Ignored while typing in a field.
 * Returns a function that stops watching.
 */
export function trackSpace(ctx: InkToolContext, onChange: (held: boolean) => void): () => void {
	const doc = ctx.map.getContainer().ownerDocument;
	let held = false;
	const isSpace = (e: KeyboardEvent): boolean => e.code === 'Space' || e.key === ' ';
	const onDown = (e: KeyboardEvent): void => {
		if (!isSpace(e) || isTypingTarget(e.target)) return;
		const target = e.target as HTMLElement | null;
		if (!target || target.tagName !== 'BUTTON') e.preventDefault();
		if (!held) {
			held = true;
			onChange(true);
		}
	};
	const onUp = (e: KeyboardEvent): void => {
		if (!isSpace(e) || !held) return;
		held = false;
		onChange(false);
	};
	const onBlur = (): void => {
		if (!held) return;
		held = false;
		onChange(false);
	};
	doc.addEventListener('keydown', onDown, true);
	doc.addEventListener('keyup', onUp, true);
	const win = doc.defaultView;
	if (win) win.addEventListener('blur', onBlur);
	return () => {
		doc.removeEventListener('keydown', onDown, true);
		doc.removeEventListener('keyup', onUp, true);
		if (win) win.removeEventListener('blur', onBlur);
		if (held) {
			held = false;
			onChange(false);
		}
	};
}

// ---- small shared helpers ------------------------------------------------------

/** The largest side of the box around these container points, or 0 for no points. */
/** Whether a new item scales with the map, from the host's drawing defaults. */
export function defaultScaleWithMap(ctx: InkToolContext): boolean {
	return ctx.host.drawDefaults?.().scaleWithMap ?? true;
}

export function extentOf(points: readonly Point[]): number {
	const b = bounds(points);
	if (!b) return 0;
	return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}

/** A path draft for previews. */
export function pathDraft(points: InkPoint[], style: InkStyle): InkPath {
	return { id: 'draft', kind: 'path', layer: 'draft', scaleWithMap: true, points, style };
}

