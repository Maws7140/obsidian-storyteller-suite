/**
 * Map Ink Leaflet layer: one SVG in its own pane, with items drawn in reference
 * pixels and a single root transform for zoom.
 *
 * Leaflet is not imported here, because the core may not import packages. The
 * caller passes the Leaflet namespace:
 *
 *   import * as L from 'leaflet';
 *   const ink = createInkLayer(L, { readOnly: true }).addTo(map);
 *
 * Pure TypeScript apart from the DOM calls on the layer's own SVG: no Obsidian imports.
 */
import { brushDetailFor, buildScene, buildSelection, fmt, itemBounds } from './svgBuild';
import type { Projector } from './svgBuild';
import { defaultInkDoc } from './model';
import type { InkDoc, InkItem } from './model';
import { rectsIntersect } from './geometry';
import { getBrush } from './brushes';
import type { Bounds, Point } from './geometry';

/** Name of the Leaflet pane that holds the ink SVG. */
export const INK_PANE = 'storyteller-ink';
/** Between overlayPane (400) and markerPane (600). */
export const INK_PANE_Z_INDEX = 450;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The part of the Leaflet namespace this layer uses. Pass the real `L`. */
export interface InkLeafletNamespace {
	Layer: { extend(props: Record<string, unknown>): new (options?: InkLayerOptions) => unknown };
	CRS: { Simple: unknown };
}

export interface InkLatLngLike {
	lat: number;
	lng: number;
}

/** Anything with getNorth, getSouth, getEast and getWest, such as a Leaflet LatLngBounds. */
export interface InkBoundsLike {
	getNorth(): number;
	getSouth(): number;
	getEast(): number;
	getWest(): number;
}

export interface InkLayerOptions {
	/** No selection overlay, and only linked items take pointer input. */
	readOnly?: boolean;
	/** Zoom at which reference pixels equal projected pixels. Defaults to 0 for CRS.Simple, else the map's min zoom. */
	refZoom?: number;
	/** Called with the item id when an item (not the empty map) is clicked. */
	onItemClick?: (id: string, event: MouseEvent) => void;
}

/** The Leaflet layer returned by createInkLayer. */
export interface InkLayer {
	onItemClick?: (id: string, event: MouseEvent) => void;
	/** Replace the document. Items keep their DOM nodes when their markup is unchanged. */
	setDoc(doc: InkDoc): void;
	/** The document the layer is showing. */
	getDoc(): InkDoc;
	/** Draw the selection overlay for these item ids. */
	setSelection(ids: readonly string[]): void;
	setReadOnly(readOnly: boolean): void;
	/** Id of the topmost item under a client point, or undefined. */
	itemAt(clientX: number, clientY: number): string | undefined;
	/** Ids of visible items whose bounds touch the Leaflet bounds, in paint order. */
	itemsInRect(bounds: InkBoundsLike): string[];
	/** Leaflet's Layer.addTo. The map is typed loosely so any Leaflet map fits. */
	addTo(map: unknown): this;
	/** Leaflet's Layer.remove. */
	remove(): this;
	/** Remove the layer and everything it added. Safe to call twice. */
	destroy(): void;
}

/** The subset of Leaflet's Map that the layer calls. */
interface InkMapLike {
	options: { crs?: unknown };
	getZoom(): number;
	getMinZoom(): number;
	getCenter(): InkLatLngLike;
	getSize(): Point;
	getPane(name: string): HTMLElement | undefined;
	createPane(name: string): HTMLElement;
	project(latlng: [number, number] | InkLatLngLike, zoom?: number): Point;
	unproject(point: [number, number], zoom?: number): InkLatLngLike;
	latLngToLayerPoint(latlng: [number, number] | InkLatLngLike): Point;
	getZoomScale(toZoom: number, fromZoom: number): number;
	on(events: Record<string, (e: never) => void>): unknown;
	off(events: Record<string, (e: never) => void>): unknown;
}

interface ZoomAnimEvent {
	center: InkLatLngLike;
	zoom: number;
}

/** Whether an item draws a known brush, so its look depends on the zoom. */
function hasBrush(item: InkItem): boolean {
	const style = (item as { style?: { brush?: string } }).style;
	return !!style?.brush && getBrush(style.brush) !== undefined;
}

/** Holds all the state. The Leaflet class forwards to it. */
class InkSurface {
	private map: InkMapLike | undefined;
	private refZoom = 0;
	private svg: SVGSVGElement | undefined;
	private defsEl: SVGDefsElement | undefined;
	private itemsEl: SVGGElement | undefined;
	private overlayEl: SVGGElement | undefined;
	private rootEl: SVGGElement | undefined;
	private nodes = new Map<string, { markup: string; node: Element }>();
	private defsMarkup: string | undefined;
	private doc: InkDoc = defaultInkDoc();
	private visible: InkItem[] = [];
	private selection = new Set<string>();
	private readOnly: boolean;
	private readonly explicitRef: boolean;
	private destroyed = false;
	/** Layer-space position of the reference origin, and the zoom scale, at the last reset. */
	private originX = 0;
	private originY = 0;
	private scale = 1;
	/** Brush width multiplier for the current zoom, see brushDetailFor. */
	private brushDetail = 1;
	private handlers: Record<string, (e: never) => void> = {};
	private readonly prefix: string;
	private readonly project: Projector = p => {
		const q = (this.map as InkMapLike).project([p[0], p[1]], this.refZoom);
		return { x: q.x, y: q.y };
	};

	private static counter = 0;

	constructor(
		private readonly L: InkLeafletNamespace,
		private readonly owner: { onItemClick?: (id: string, event: MouseEvent) => void },
		options: InkLayerOptions,
	) {
		this.readOnly = options.readOnly === true;
		this.explicitRef = typeof options.refZoom === 'number' && Number.isFinite(options.refZoom);
		this.prefix = `ink${++InkSurface.counter}-`;
		if (this.explicitRef) this.refZoom = options.refZoom as number;
	}

	attach(map: InkMapLike, pane: HTMLElement): void {
		this.map = map;
		if (!this.explicitRef) this.refZoom = map.options.crs === this.L.CRS.Simple ? 0 : map.getMinZoom();
		const doc = pane.ownerDocument;
		const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
		svg.setAttribute('class', 'ink-svg leaflet-zoom-animated');
		svg.setAttribute('role', 'group');
		// A <title>, not aria-label: Obsidian's tooltip handler treats any [aria-label] as an HTMLElement
		// and throws on SVG elements.
		const title = doc.createElementNS(SVG_NS, 'title');
		title.textContent = 'Map drawing';
		svg.appendChild(title);
		svg.setAttribute('style', 'position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none;');
		this.defsEl = doc.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
		this.rootEl = doc.createElementNS(SVG_NS, 'g') as SVGGElement;
		this.rootEl.setAttribute('class', 'ink-root');
		this.itemsEl = doc.createElementNS(SVG_NS, 'g') as SVGGElement;
		this.itemsEl.setAttribute('class', 'ink-items');
		this.overlayEl = doc.createElementNS(SVG_NS, 'g') as SVGGElement;
		this.overlayEl.setAttribute('class', 'ink-overlay');
		this.rootEl.append(this.itemsEl, this.overlayEl);
		svg.append(this.defsEl, this.rootEl);
		svg.addEventListener('click', this.onClick);
		svg.addEventListener('dblclick', this.onDblClick);
		this.svg = svg;
		pane.append(svg);
		this.handlers = {
			viewreset: () => this.reset(),
			zoomend: () => this.reset(),
			zoomanim: (e: never) => this.animateZoom(e as unknown as ZoomAnimEvent),
		};
		map.on(this.handlers);
		this.reset();
		this.render();
	}

	detach(): void {
		if (this.map) this.map.off(this.handlers);
		this.svg?.remove();
		this.svg = undefined;
		this.nodes.clear();
		this.defsMarkup = undefined;
		this.map = undefined;
	}

	destroy(): void {
		this.destroyed = true;
		this.detach();
		this.doc = defaultInkDoc();
		this.visible = [];
		this.selection.clear();
		this.owner.onItemClick = undefined;
	}

	setDoc(doc: InkDoc): void {
		if (this.destroyed) return;
		this.doc = doc;
		this.render();
	}

	getDoc(): InkDoc {
		return this.doc;
	}

	setSelection(ids: readonly string[]): void {
		if (this.destroyed) return;
		this.selection = new Set(ids);
		this.renderOverlay();
	}

	setReadOnly(readOnly: boolean): void {
		if (this.destroyed || readOnly === this.readOnly) return;
		this.readOnly = readOnly;
		this.render();
	}

	itemAt(clientX: number, clientY: number): string | undefined {
		if (!this.svg || !this.itemsEl) return undefined;
		const found = this.svg.ownerDocument.elementsFromPoint(clientX, clientY);
		for (const el of found) {
			const id = this.idOf(el);
			if (id !== undefined) return id;
		}
		return undefined;
	}

	itemsInRect(b: InkBoundsLike): string[] {
		if (!this.map) return [];
		const a = this.project([b.getNorth(), b.getWest()]);
		const c = this.project([b.getSouth(), b.getEast()]);
		const rect: Bounds = {
			minX: Math.min(a.x, c.x), minY: Math.min(a.y, c.y),
			maxX: Math.max(a.x, c.x), maxY: Math.max(a.y, c.y),
		};
		const pxToRef = 1 / this.scale;
		const out: string[] = [];
		for (const item of this.visible) {
			const bb = itemBounds(item, this.project, pxToRef);
			if (bb && rectsIntersect(rect, bb)) out.push(item.id);
		}
		return out;
	}

	// ---- zoom -----------------------------------------------------------------

	/** Set the root transform from the map's current pixel origin. Called on reset and zoomend. */
	private reset(): void {
		const map = this.map;
		if (!map || !this.rootEl || !this.svg) return;
		const s = map.getZoomScale(map.getZoom(), this.refZoom);
		const o = map.latLngToLayerPoint(map.unproject([0, 0], this.refZoom));
		this.originX = o.x;
		this.originY = o.y;
		this.scale = s;
		this.rootEl.setAttribute('transform', `translate(${fmt(o.x)} ${fmt(o.y)}) scale(${fmt(s)})`);
		this.svg.style.transform = '';
		this.applyCounters(s);
		const detail = brushDetailFor(s);
		if (detail !== this.brushDetail) {
			this.brushDetail = detail;
			// Only brushed items change markup, so render() replaces just those nodes.
			if (this.doc.items.some(hasBrush)) {
				this.render();
				return;
			}
		}
		this.renderOverlay();
	}

	/**
	 * Animate the zoom with a CSS transform on the SVG, the same way L.SVG does.
	 * The target is where the reference origin lands at the new zoom and centre.
	 */
	private animateZoom(e: ZoomAnimEvent): void {
		const map = this.map;
		if (!map || !this.svg) return;
		const sTarget = map.getZoomScale(e.zoom, this.refZoom);
		const origin = map.unproject([0, 0], this.refZoom);
		const target = this.targetOrigin(origin, e.center, e.zoom);
		const k = sTarget / this.scale;
		const ox = target.x - k * this.originX;
		const oy = target.y - k * this.originY;
		this.svg.style.transform = `translate(${fmt(ox)}px, ${fmt(oy)}px) scale(${fmt(k)})`;
		this.applyCounters(sTarget);
	}

	private targetOrigin(origin: InkLatLngLike, centre: InkLatLngLike, zoom: number): Point {
		const map = this.map as InkMapLike & { _latLngToNewLayerPoint?: (ll: InkLatLngLike, z: number, c: InkLatLngLike) => Point };
		if (typeof map._latLngToNewLayerPoint === 'function') {
			return map._latLngToNewLayerPoint(origin, zoom, centre);
		}
		// Fallback when the private helper is missing: centre the map on `centre`.
		const size = map.getSize();
		const s = map.getZoomScale(zoom, this.refZoom);
		const c = map.project([centre.lat, centre.lng], this.refZoom);
		return { x: size.x / 2 - s * c.x, y: size.y / 2 - s * c.y };
	}

	/** Keep stamps and keep-size text at a constant screen size: counter-scale by 1 / scale. */
	private applyCounters(scale: number): void {
		if (!this.itemsEl) return;
		const inv = 1 / scale;
		const els = this.itemsEl.querySelectorAll('[data-ink-counter]');
		for (let i = 0; i < els.length; i++) {
			const el = els[i];
			const at = el.getAttribute('data-ink-at') ?? '0 0';
			el.setAttribute('transform', `translate(${at}) scale(${fmt(inv)})`);
		}
	}

	// ---- rendering --------------------------------------------------------------

	private render(): void {
		if (!this.map || !this.itemsEl || !this.defsEl) return;
		const scene = buildScene(this.doc, {
			project: this.project,
			readOnly: this.readOnly,
			idPrefix: this.prefix,
			brushDetail: this.brushDetail,
		});
		const byId = new Map<string, InkItem>();
		for (const item of this.doc.items) byId.set(item.id, item);
		this.visible = [];

		if (scene.defs !== this.defsMarkup) {
			this.defsEl.replaceChildren(this.parse(this.defsEl, scene.defs));
			this.defsMarkup = scene.defs;
		}

		const next = new Map<string, { markup: string; node: Element }>();
		for (const entry of scene.items) {
			const item = byId.get(entry.id);
			if (item) this.visible.push(item);
			const previous = this.nodes.get(entry.id);
			if (previous && previous.markup === entry.svg) {
				next.set(entry.id, previous);
				continue;
			}
			const node = this.parse(this.itemsEl, entry.svg).firstElementChild as Element;
			next.set(entry.id, { markup: entry.svg, node });
		}
		// Remove nodes for deleted items and the old node of every item that was redrawn.
		for (const [id, old] of this.nodes) {
			if (next.get(id)?.node !== old.node) old.node.remove();
		}
		// Put the nodes in paint order, moving only what is out of place.
		let cursor: ChildNode | null = this.itemsEl.firstChild;
		for (const entry of scene.items) {
			const node = (next.get(entry.id) as { node: Element }).node;
			if (node === cursor) {
				cursor = cursor.nextSibling;
			} else {
				this.itemsEl.insertBefore(node, cursor);
			}
		}
		this.nodes = next;
		this.applyCounters(this.scale);
		this.renderOverlay();
	}

	private renderOverlay(): void {
		if (!this.overlayEl) return;
		if (!this.map || this.readOnly || this.selection.size === 0) {
			this.overlayEl.replaceChildren();
			return;
		}
		const selected = this.visible.filter(item => this.selection.has(item.id));
		const markup = buildSelection(selected, { project: this.project, scale: this.scale });
		if (!markup) {
			this.overlayEl.replaceChildren();
			return;
		}
		this.overlayEl.replaceChildren(this.parse(this.overlayEl, markup));
	}

	/** Parse markup in the SVG namespace, using the element as the parsing context. */
	private parse(context: Element, markup: string): DocumentFragment {
		const range = context.ownerDocument.createRange();
		range.selectNodeContents(context);
		return range.createContextualFragment(markup);
	}

	// ---- events -----------------------------------------------------------------

	private idOf(target: EventTarget | null): string | undefined {
		const el = target as Element | null;
		if (!el || typeof el.closest !== 'function' || !this.itemsEl) return undefined;
		const group = el.closest('[data-ink-id]');
		if (!group || !this.itemsEl.contains(group)) return undefined;
		return group.getAttribute('data-ink-id') ?? undefined;
	}

	private readonly onClick = (e: MouseEvent): void => {
		const id = this.idOf(e.target);
		if (id === undefined) return;
		e.stopPropagation();
		const cb = this.owner.onItemClick;
		if (cb) cb(id, e);
	};

	private readonly onDblClick = (e: MouseEvent): void => {
		if (this.idOf(e.target) !== undefined) e.stopPropagation();
	};
}

/** Leaflet layer class, built once per Leaflet namespace. */
interface InkLayerInternals {
	_surface: InkSurface;
	onItemClick?: (id: string, event: MouseEvent) => void;
}

const classCache = new WeakMap<object, new (options?: InkLayerOptions) => InkLayer>();

function layerClass(L: InkLeafletNamespace): new (options?: InkLayerOptions) => InkLayer {
	const cached = classCache.get(L);
	if (cached) return cached;
	const Ctor = L.Layer.extend({
		options: { pane: INK_PANE },
		initialize(this: InkLayerInternals & { options: Record<string, unknown> }, options: InkLayerOptions = {}) {
			this.options = Object.assign({}, this.options, options);
			this._surface = new InkSurface(L, this, options);
			if (options.onItemClick) this.onItemClick = options.onItemClick;
		},
		onAdd(this: InkLayerInternals, map: unknown) {
			const m = map as InkMapLike;
			let pane = m.getPane(INK_PANE);
			if (!pane) pane = m.createPane(INK_PANE);
			pane.style.zIndex = String(INK_PANE_Z_INDEX);
			this._surface.attach(m, pane);
		},
		onRemove(this: InkLayerInternals) {
			this._surface.detach();
		},
		setDoc(this: InkLayerInternals, doc: InkDoc) {
			this._surface.setDoc(doc);
		},
		getDoc(this: InkLayerInternals) {
			return this._surface.getDoc();
		},
		setSelection(this: InkLayerInternals, ids: readonly string[]) {
			this._surface.setSelection(ids);
		},
		setReadOnly(this: InkLayerInternals, readOnly: boolean) {
			this._surface.setReadOnly(readOnly);
		},
		itemAt(this: InkLayerInternals, x: number, y: number) {
			return this._surface.itemAt(x, y);
		},
		itemsInRect(this: InkLayerInternals, bounds: InkBoundsLike) {
			return this._surface.itemsInRect(bounds);
		},
		destroy(this: InkLayerInternals & { _map?: unknown; remove(): unknown }) {
			if (this._map) this.remove();
			this._surface.destroy();
		},
	});
	classCache.set(L, Ctor as unknown as new (options?: InkLayerOptions) => InkLayer);
	return Ctor as unknown as new (options?: InkLayerOptions) => InkLayer;
}

/**
 * Create the Ink layer. Add it to a map with `.addTo(map)`. `L` is the Leaflet
 * namespace, passed in so the core never imports Leaflet.
 */
export function createInkLayer(L: InkLeafletNamespace, options: InkLayerOptions = {}): InkLayer {
	const Ctor = layerClass(L);
	return new Ctor(options);
}
