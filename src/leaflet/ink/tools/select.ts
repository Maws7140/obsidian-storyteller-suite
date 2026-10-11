/**
 * The Map Ink select tool.
 *
 * Click selects (Shift toggles), empty space clears, and a drag on empty space draws a
 * marquee. Dragging a selected item moves the selection. Handles resize (Shift keeps the
 * ratio) and rotate (Shift snaps to 15 degrees). Path, freehand and area vertices can be
 * dragged, and a midpoint ghost inserts a vertex. Alt-click or right-click a vertex
 * deletes it. Double-clicking text calls onEditText. Right-click, or a long press on
 * touch, opens the item menu.
 *
 * Gestures use pointer events. The container listens in the capture phase, so Leaflet
 * never sees a gesture that the tool handles: the map does not pan, and no map click
 * fires. Space held down gives the press back to Leaflet, so the map pans. Controls,
 * markers and popups are left alone.
 *
 * Geometry is worked in reference pixels, the same space the layer draws in, and
 * converted to latlng for the store.
 *
 * Pure TypeScript apart from the DOM calls on the map's own container: no Obsidian
 * imports and no document or window globals.
 */
import type { InkArea, InkDoc, InkItem, InkPath, InkPoint } from '../model';
import { itemBox, itemBounds } from '../svgBuild';
import type { Projector } from '../svgBuild';
import { rotatePoint } from '../geometry';
import type { Bounds, Point } from '../geometry';
import {
	copyStyle, deleteItems, deleteVertex, duplicateItems, insertVertex, moveItems, moveVertex, pasteStyle,
	reorder, resizeItems, rotateItems, selectable, selectableIds, setLocked,
} from '../transform';
import type { LatLngBox, ReorderOp, StyleClip } from '../transform';
import type { InkMenuItem } from '../host';
import { handleEditorKey, isTypingTarget, pxOffset, PASTE_OFFSET_PX } from './keyboard';
import type { EditorKeyOptions } from './keyboard';
import type { InkSelectMap, InkToolContext, InkToolLike } from './selectTypes';

const DRAG_SLOP = 2;
const TOUCH_SLOP = 8;
const MARQUEE_SLOP = 3;
const LONG_PRESS_MS = 500;
const ROTATE_SNAP_DEG = 15;
const MIN_BOX_PX = 0.5;
const CHROME = '.leaflet-control, .leaflet-control-container, .leaflet-marker-icon, .leaflet-popup, .leaflet-tooltip';
const ROTATABLE: readonly string[] = ['stamp', 'text', 'rect', 'ellipse'];

interface GestureBase {
	pointerId: number;
	startX: number;
	startY: number;
	slop: number;
	moved: boolean;
	timer?: number;
	downEvent: PointerEvent;
}
interface MoveGesture extends GestureBase {
	kind: 'move';
	ids: string[];
	last: InkPoint;
	key: string;
	collapseTo?: string;
	hit?: string;
}
interface ResizeGesture extends GestureBase {
	kind: 'resize';
	key: string;
	handle: string;
	from: Bounds;
	rotation: number;
	centre: Point;
	fromLL: LatLngBox;
	ids: string[];
	startDoc: InkDoc;
}
interface RotateGesture extends GestureBase {
	kind: 'rotate';
	key: string;
	ids: string[];
	centreRef: Point;
	centreLL: InkPoint;
	startAngle: number;
	applied: number;
}
interface VertexGesture extends GestureBase {
	kind: 'vertex';
	key: string;
	id: string;
	index: number;
}
interface MarqueeGesture extends GestureBase {
	kind: 'marquee';
	el: HTMLElement;
	start: Point;
	base: string[];
	additive: boolean;
}
type Gesture = MoveGesture | ResizeGesture | RotateGesture | VertexGesture | MarqueeGesture;

// ---- DOM helpers (plain DOM, no Obsidian helpers) ----------------------------------

function closestIn(target: EventTarget | null, selector: string): Element | null {
	const el = target as Element | null;
	if (!el || typeof el.closest !== 'function') return null;
	return el.closest(selector);
}

function attrOf(target: EventTarget | null, name: string): string | undefined {
	const el = closestIn(target, `[${name}]`);
	return el ? el.getAttribute(name) ?? undefined : undefined;
}

/** True for controls, markers and popups, which keep their own pointer handling. */
function isChrome(target: EventTarget | null): boolean {
	return closestIn(target, CHROME) !== null;
}

function isVertexKind(item: InkItem): item is InkPath | InkArea {
	return item.kind === 'path' || item.kind === 'freehand' || item.kind === 'area';
}

function angleDeg(p: Point, c: Point): number {
	return (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
}

/** The select tool. Create one per editor with createSelectTool. */
class SelectTool implements InkToolLike {
	readonly id = 'select' as const;
	private ctx: InkToolContext | undefined;
	private container: HTMLElement | undefined;
	private refZoom = 0;
	private cleanups: Array<() => void> = [];
	private docCleanups: Array<() => void> = [];
	private gesture: Gesture | undefined;
	private suppressCompat = false;
	private spaceDown = false;
	private longPressFired = false;
	private dragRestore = false;
	private styleClip: StyleClip | undefined;
	private seq = 0;
	private shownDoc: InkDoc | undefined;
	private shownSel: string | undefined;
	private view: Window | undefined;

	activate(ctx: InkToolContext): void {
		if (this.ctx) this.deactivate();
		this.ctx = ctx;
		const container = ctx.map.getContainer();
		this.container = container;
		this.refZoom = ctx.refZoom ?? (ctx.map.options.crs === ctx.L.CRS.Simple ? 0 : ctx.map.getMinZoom());
		const doc = container.ownerDocument;
		this.view = doc.defaultView ?? undefined;

		const add = (target: EventTarget, type: string, fn: (e: Event) => void, capture: boolean): void => {
			const listener = fn;
			target.addEventListener(type, listener, capture);
			this.cleanups.push(() => target.removeEventListener(type, listener, capture));
		};
		add(container, 'pointerdown', e => this.handleDown(e as PointerEvent), true);
		add(container, 'click', e => {
			if (!isChrome(e.target)) e.stopPropagation();
		}, true);
		add(container, 'dblclick', e => this.handleDblClick(e as MouseEvent), true);
		add(container, 'contextmenu', e => this.handleContext(e as MouseEvent), true);
		// The press's mousedown is kept (Chrome counts clicks from it, so dblclick still fires),
		// but Leaflet never sees it and it does no default work such as selecting text.
		add(container, 'mousedown', e => {
			if (!this.suppressCompat) return;
			e.preventDefault();
			e.stopPropagation();
		}, true);
		const endPress = (): void => {
			this.suppressCompat = false;
		};
		add(doc, 'pointerup', endPress, true);
		add(doc, 'pointercancel', endPress, true);
		add(doc, 'keydown', e => {
			const ke = e as KeyboardEvent;
			if (ke.key === ' ' && !isTypingTarget(ke.target)) this.spaceDown = true;
		}, true);
		add(doc, 'keyup', e => {
			if ((e as KeyboardEvent).key === ' ') this.spaceDown = false;
		}, true);
		this.cleanups.push(ctx.store.on('change', () => this.sync()));
		this.sync();
	}

	deactivate(): void {
		const ctx = this.ctx;
		if (!ctx) return;
		if (this.gesture) this.endGesture(false);
		for (const fn of this.cleanups.splice(0)) fn();
		this.ctx = undefined;
		this.container = undefined;
		this.shownDoc = undefined;
		this.shownSel = undefined;
		this.view = undefined;
		this.spaceDown = false;
		this.suppressCompat = false;
		ctx.layer.setSelection([]);
		ctx.store.clearSelection();
		ctx.store.flush().catch(() => undefined);
	}

	onKey(e: KeyboardEvent): boolean {
		if (!this.ctx) return false;
		return handleEditorKey(e, this.ctx.store, this.keyOpts());
	}

	// ---- pointer -------------------------------------------------------------------

	private handleDown(e: PointerEvent): void {
		const ctx = this.ctx;
		if (!ctx || this.gesture || isChrome(e.target)) return;
		this.longPressFired = false;
		if (e.button !== 0) {
			// A right press on an item must not reach Leaflet. The menu opens on contextmenu.
			if (this.idsAt(e.clientX, e.clientY).length > 0) e.stopPropagation();
			return;
		}
		if (this.spaceDown) return;
		e.stopPropagation();
		this.suppressCompat = true;

		const store = ctx.store;
		const doc = store.doc;
		const target = e.target;
		const svg = closestIn(target, 'svg.ink-svg');
		const handle = svg ? attrOf(target, 'data-ink-handle') : undefined;
		const vertexAttr = svg ? attrOf(target, 'data-ink-vertex') : undefined;
		const midAttr = svg ? attrOf(target, 'data-ink-mid') : undefined;
		const selIds = Array.from(store.selection);
		const single = selIds.length === 1 ? doc.items.find(i => i.id === selIds[0]) : undefined;

		if (single && isVertexKind(single) && selectable(doc, single.id)) {
			const id = single.id;
			if (vertexAttr !== undefined) {
				const index = Number(vertexAttr);
				if (e.altKey) {
					this.run(d => deleteVertex(d, id, index));
					return;
				}
				const key = this.key('vertex');
				this.begin(e, base => ({ kind: 'vertex', ...base, key, id, index }));
				return;
			}
			if (midAttr !== undefined) {
				const m = Number(midAttr);
				const pts = single.points;
				const a = pts[m - 1];
				const b = pts[m % pts.length];
				if (!a || !b) return;
				const mid: InkPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
				const key = this.key('vertex');
				store.apply(d => insertVertex(d, id, m - 1, mid), key);
				this.sync();
				this.begin(e, base => ({ kind: 'vertex', ...base, key, id, index: m }));
				return;
			}
		}

		if (single && handle === 'rotate' && ROTATABLE.indexOf(single.kind) >= 0) {
			this.beginRotate(single, e);
			return;
		}
		if (handle !== undefined && handle !== 'move' && handle !== 'rotate' && selIds.length > 0) {
			this.beginResize(handle, e);
			return;
		}

		// Items, the selection box, and empty space.
		const onBox = handle === 'move';
		const hit = this.pickSelectable(e.clientX, e.clientY);
		let collapseTo: string | undefined;
		if (e.shiftKey) {
			if (hit !== undefined) {
				store.toggleSelect(hit);
				this.sync();
				if (!store.selection.has(hit)) return;
			} else if (!onBox) {
				this.beginMarquee(e, true);
				return;
			}
		} else if (hit !== undefined) {
			if (!store.selection.has(hit)) store.select([hit]);
			else if (store.selection.size > 1) collapseTo = hit;
			this.sync();
		} else if (!(onBox && selIds.length > 0)) {
			store.clearSelection();
			this.sync();
			this.beginMarquee(e, false);
			return;
		}
		const ids = selectableIds(store.doc, Array.from(store.selection));
		if (ids.length === 0) return;
		const key = this.key('move');
		const last = this.latLng(e);
		this.begin(e, base => ({ kind: 'move', ...base, ids, last, key, collapseTo, hit }));
	}

	private handleMove(e: PointerEvent): void {
		const g = this.gesture;
		const ctx = this.ctx;
		if (!g || !ctx || e.pointerId !== g.pointerId) return;
		if (!g.moved) {
			if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < g.slop) return;
			g.moved = true;
			this.clearTimer(g);
		}
		const store = ctx.store;
		switch (g.kind) {
			case 'move': {
				const ll = this.latLng(e);
				const dLat = ll[0] - g.last[0];
				const dLng = ll[1] - g.last[1];
				g.last = ll;
				if (dLat === 0 && dLng === 0) return;
				store.apply(doc => moveItems(doc, g.ids, dLat, dLng), g.key);
				break;
			}
			case 'resize': {
				const q = rotatePoint(this.refPoint(e), g.centre, -g.rotation);
				const r: Bounds = { ...g.from };
				const h = g.handle;
				if (h.indexOf('w') >= 0) r.minX = Math.min(q.x, g.from.maxX - MIN_BOX_PX);
				if (h.indexOf('e') >= 0) r.maxX = Math.max(q.x, g.from.minX + MIN_BOX_PX);
				if (h.indexOf('n') >= 0) r.minY = Math.min(q.y, g.from.maxY - MIN_BOX_PX);
				if (h.indexOf('s') >= 0) r.maxY = Math.max(q.y, g.from.minY + MIN_BOX_PX);
				const toLL = this.boxToLatLng(r);
				const keepRatio = e.shiftKey;
				store.apply(() => resizeItems(g.startDoc, g.ids, g.fromLL, toLL, keepRatio), g.key);
				break;
			}
			case 'rotate': {
				let total = angleDeg(this.refPoint(e), g.centreRef) - g.startAngle;
				while (total > 180) total -= 360;
				while (total <= -180) total += 360;
				if (e.shiftKey) total = Math.round(total / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
				const delta = total - g.applied;
				if (Math.abs(delta) < 1e-9) return;
				g.applied = total;
				store.apply(doc => rotateItems(doc, g.ids, g.centreLL, delta), g.key);
				break;
			}
			case 'vertex': {
				const ll = this.latLng(e);
				store.apply(doc => moveVertex(doc, g.id, g.index, ll), g.key);
				break;
			}
			case 'marquee': {
				const cur = this.local(e);
				this.drawMarquee(g, cur);
				const bounds = this.containerBounds(g.start, cur);
				const found = ctx.layer.itemsInRect(bounds).filter(id => selectable(store.doc, id));
				const next = g.additive ? Array.from(new Set(g.base.concat(found))) : found;
				store.select(next);
				break;
			}
		}
		this.sync();
	}

	private handleUp(e: PointerEvent): void {
		const g = this.gesture;
		if (!g || e.pointerId !== g.pointerId) return;
		this.endGesture(true);
	}

	private endGesture(commit: boolean): void {
		const g = this.gesture;
		const ctx = this.ctx;
		if (!g || !ctx) return;
		this.clearTimer(g);
		if (commit && g.kind === 'move' && !g.moved && g.collapseTo !== undefined) {
			ctx.store.select([g.collapseTo]);
		}
		if (g.kind === 'marquee') g.el.remove();
		this.gesture = undefined;
		for (const fn of this.docCleanups.splice(0)) fn();
		const container = this.container;
		if (container) {
			try {
				container.releasePointerCapture(g.pointerId);
			} catch {
				// The capture may already be gone.
			}
		}
		if (this.dragRestore) {
			this.dragRestore = false;
			ctx.map.dragging?.enable();
		}
		this.suppressCompat = false;
		this.sync();
		ctx.store.flush().catch(() => undefined);
	}

	private begin(e: PointerEvent, make: (base: GestureBase) => Gesture): void {
		const ctx = this.ctx;
		const container = this.container;
		if (!ctx || !container) return;
		const base: GestureBase = {
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			slop: e.pointerType === 'touch' ? TOUCH_SLOP : DRAG_SLOP,
			moved: false,
			downEvent: e,
		};
		const g = make(base);
		if (g.kind === 'marquee') g.slop = MARQUEE_SLOP;
		this.gesture = g;
		const drag = ctx.map.dragging;
		if (drag && drag.enabled()) {
			drag.disable();
			this.dragRestore = true;
		}
		try {
			container.setPointerCapture(e.pointerId);
		} catch {
			// Without capture the document listeners still get the moves.
		}
		const doc = container.ownerDocument;
		const onMove = (ev: Event): void => this.handleMove(ev as PointerEvent);
		const onUp = (ev: Event): void => this.handleUp(ev as PointerEvent);
		const onCancel = (ev: Event): void => {
			if (this.gesture && (ev as PointerEvent).pointerId === this.gesture.pointerId) this.endGesture(false);
		};
		for (const [type, fn] of [['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onCancel]] as Array<[string, (ev: Event) => void]>) {
			doc.addEventListener(type, fn);
			this.docCleanups.push(() => doc.removeEventListener(type, fn));
		}
		const view = this.view;
		if (g.kind === 'move' && e.pointerType !== 'mouse' && view) {
			g.timer = view.setTimeout(() => {
				if (this.gesture !== g || g.moved) return;
				this.longPressFired = true;
				this.endGesture(false);
				this.openMenu(g.hit, g.downEvent);
			}, LONG_PRESS_MS);
		}
	}

	private clearTimer(g: GestureBase): void {
		if (g.timer !== undefined) {
			this.view?.clearTimeout(g.timer);
			g.timer = undefined;
		}
	}

	private beginResize(handle: string, e: PointerEvent): void {
		const ctx = this.ctx;
		if (!ctx) return;
		const doc = ctx.store.doc;
		const ids = selectableIds(doc, Array.from(ctx.store.selection));
		const box = this.selectionBox(doc, ids);
		if (!box) return;
		const fromLL = this.boxToLatLng(box.rect);
		const key = this.key('resize');
		this.begin(e, base => ({
			kind: 'resize', ...base, key, handle, from: box.rect, rotation: box.rotation,
			centre: box.centre, fromLL, ids, startDoc: doc,
		}));
	}

	private beginRotate(item: InkItem, e: PointerEvent): void {
		const ctx = this.ctx;
		if (!ctx) return;
		const box = itemBox(item, this.project(), this.pxToRef());
		if (!box) return;
		const key = this.key('rotate');
		const startAngle = angleDeg(this.refPoint(e), box.centre);
		const centreLL = this.unproject(box.centre);
		const ids = [item.id];
		this.begin(e, base => ({
			kind: 'rotate', ...base, key, ids, centreRef: box.centre, centreLL, startAngle, applied: 0,
		}));
	}

	private beginMarquee(e: PointerEvent, additive: boolean): void {
		const container = this.container;
		if (!container) return;
		const el = container.ownerDocument.createElement('div');
		el.className = 'ink-marquee';
		el.style.cssText = 'position:absolute;pointer-events:none;z-index:1000;border:1px dashed var(--interactive-accent, #4a90d9);'
			+ 'background:rgba(74,144,217,0.12);left:0;top:0;width:0;height:0;';
		container.appendChild(el);
		const store = this.ctx ? this.ctx.store : undefined;
		const base = additive && store ? Array.from(store.selection) : [];
		this.begin(e, b => ({ kind: 'marquee', ...b, el, start: this.local(e), base, additive }));
	}

	// ---- right-click and long-press menu --------------------------------------------

	private handleContext(e: MouseEvent): void {
		const ctx = this.ctx;
		if (!ctx || isChrome(e.target)) return;
		if (this.longPressFired) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		// Right-click on a vertex deletes it, as Alt-click does.
		const svg = closestIn(e.target, 'svg.ink-svg');
		const vertexAttr = svg ? attrOf(e.target, 'data-ink-vertex') : undefined;
		if (vertexAttr !== undefined) {
			const selIds = Array.from(ctx.store.selection);
			const single = selIds.length === 1 ? ctx.store.doc.items.find(i => i.id === selIds[0]) : undefined;
			if (single && isVertexKind(single) && selectable(ctx.store.doc, single.id)) {
				const id = single.id;
				const index = Number(vertexAttr);
				e.preventDefault();
				e.stopPropagation();
				this.run(d => deleteVertex(d, id, index));
				return;
			}
		}
		const id = this.idsAt(e.clientX, e.clientY)[0];
		if (id === undefined) return;
		e.preventDefault();
		e.stopPropagation();
		this.openMenu(id, e);
	}

	private openMenu(id: string | undefined, e: MouseEvent): void {
		const ctx = this.ctx;
		if (!ctx || id === undefined) return;
		const store = ctx.store;
		const item = store.doc.items.find(i => i.id === id);
		if (!item) return;
		if (item.locked) {
			ctx.host.showMenu([{ title: 'Unlock', icon: 'unlock', onClick: () => this.run(d => setLocked(d, [id], false)) }], e);
			return;
		}
		if (!selectable(store.doc, id)) return;
		if (!store.selection.has(id)) store.select([id]);
		this.sync();

		const sel = (): string[] => selectableIds(store.doc, Array.from(store.selection));
		const items: InkMenuItem[] = [];
		if (item.kind === 'text' && ctx.onEditText) {
			const edit = ctx.onEditText;
			items.push({ title: 'Edit text', icon: 'pencil', onClick: () => edit(id) });
		}
		items.push({ title: 'Duplicate', icon: 'copy', separatorBefore: items.length > 0, onClick: () => this.duplicate() });
		items.push({ title: 'Bring forward', icon: 'arrow-up', separatorBefore: true, onClick: () => this.reorderSel(sel, 'forward') });
		items.push({ title: 'Send backward', icon: 'arrow-down', onClick: () => this.reorderSel(sel, 'backward') });
		items.push({ title: 'Bring to front', icon: 'bring-to-front', onClick: () => this.reorderSel(sel, 'front') });
		items.push({ title: 'Send to back', icon: 'send-to-back', onClick: () => this.reorderSel(sel, 'back') });
		items.push({
			title: 'Copy style', icon: 'pipette', separatorBefore: true,
			onClick: () => { this.styleClip = copyStyle(item); },
		});
		items.push({
			title: 'Paste style', icon: 'paintbrush', disabled: this.styleClip === undefined,
			onClick: () => {
				const clip = this.styleClip;
				if (clip) this.run(d => pasteStyle(d, sel(), clip));
			},
		});
		items.push({
			title: 'Lock', icon: 'lock', separatorBefore: true,
			onClick: () => {
				this.run(d => setLocked(d, [id], true));
				store.select(Array.from(store.selection).filter(x => x !== id));
				this.sync();
			},
		});
		items.push({ title: 'Delete', icon: 'trash-2', separatorBefore: true, onClick: () => this.deleteSel(sel) });
		ctx.host.showMenu(items, e);
	}

	private reorderSel(sel: () => string[], op: ReorderOp): void {
		this.run(d => reorder(d, sel(), op));
	}

	private duplicate(): void {
		const ctx = this.ctx;
		if (!ctx) return;
		const ids = selectableIds(ctx.store.doc, Array.from(ctx.store.selection));
		if (ids.length === 0) return;
		const offset = pxOffset(this.keyOpts(), PASTE_OFFSET_PX, PASTE_OFFSET_PX);
		const result = duplicateItems(ctx.store.doc, ids, offset);
		ctx.store.apply(() => result.doc);
		ctx.store.select(selectableIds(ctx.store.doc, result.newIds));
		this.sync();
	}

	private deleteSel(sel: () => string[]): void {
		const ctx = this.ctx;
		if (!ctx) return;
		const ids = sel();
		if (ids.length === 0) return;
		ctx.store.apply(d => deleteItems(d, ids));
		ctx.store.clearSelection();
		this.sync();
	}

	private handleDblClick(e: MouseEvent): void {
		const ctx = this.ctx;
		if (!ctx || isChrome(e.target)) return;
		e.stopPropagation();
		const id = this.pickSelectable(e.clientX, e.clientY);
		if (id === undefined) return;
		const item = ctx.store.doc.items.find(i => i.id === id);
		if (!item || item.kind !== 'text') return;
		ctx.store.select([id]);
		this.sync();
		if (ctx.onEditText) ctx.onEditText(id);
	}

	// ---- helpers -----------------------------------------------------------------

	/** Apply one change to the store and redraw. */
	private run(change: (doc: InkDoc) => InkDoc): void {
		const ctx = this.ctx;
		if (!ctx) return;
		ctx.store.apply(change);
		this.sync();
	}

	/**
	 * Push the store's document and selection to the layer, but only when they changed.
	 * Re-rendering the overlay under a press replaces the node the press started on, and
	 * then the browser drops the click and double-click.
	 */
	private sync(): void {
		const ctx = this.ctx;
		if (!ctx) return;
		const doc = ctx.store.doc;
		if (doc !== this.shownDoc) {
			this.shownDoc = doc;
			ctx.layer.setDoc(doc);
		}
		const sel = Array.from(ctx.store.selection);
		const key = sel.join('\n');
		if (key !== this.shownSel) {
			this.shownSel = key;
			ctx.layer.setSelection(sel);
		}
	}

	private key(name: string): string {
		this.seq += 1;
		return `select-${name}-${this.seq}`;
	}

	private keyOpts(): EditorKeyOptions {
		const ctx = this.ctx as InkToolContext;
		const container = this.container as HTMLElement;
		return {
			pxToLatLng: (x: number, y: number): InkPoint => {
				const ll = ctx.map.containerPointToLatLng([x, y]);
				return [ll.lat, ll.lng];
			},
			refPx: [container.clientWidth / 2, container.clientHeight / 2],
		};
	}

	/** Items under a client point, topmost first, including locked ones. */
	private idsAt(clientX: number, clientY: number): string[] {
		const container = this.container;
		if (!container) return [];
		const found = container.ownerDocument.elementsFromPoint(clientX, clientY);
		const out: string[] = [];
		for (const el of Array.from(found)) {
			const group = closestIn(el, '[data-ink-id]');
			if (!group || !closestIn(group, 'svg.ink-svg')) continue;
			const id = group.getAttribute('data-ink-id');
			if (id && out.indexOf(id) < 0) out.push(id);
		}
		return out;
	}

	/** The topmost item under a client point that can be selected. */
	private pickSelectable(clientX: number, clientY: number): string | undefined {
		const store = this.ctx ? this.ctx.store : undefined;
		if (!store) return undefined;
		return this.idsAt(clientX, clientY).find(id => selectable(store.doc, id));
	}

	/** Container pixel of a pointer event. */
	private local(e: { clientX: number; clientY: number }): Point {
		const container = this.container as HTMLElement;
		const r = container.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	private latLng(e: { clientX: number; clientY: number }): InkPoint {
		const p = this.local(e);
		const ll = (this.ctx as InkToolContext).map.containerPointToLatLng([p.x, p.y]);
		return [ll.lat, ll.lng];
	}

	private refPoint(e: { clientX: number; clientY: number }): Point {
		const ll = this.latLng(e);
		const q = (this.ctx as InkToolContext).map.project(ll, this.refZoom);
		return { x: q.x, y: q.y };
	}

	private map(): InkSelectMap {
		return (this.ctx as InkToolContext).map;
	}

	private scale(): number {
		const map = this.map();
		return map.getZoomScale(map.getZoom(), this.refZoom);
	}

	private pxToRef(): number {
		return 1 / this.scale();
	}

	private project(): Projector {
		const map = this.map();
		const zoom = this.refZoom;
		return (p: InkPoint): Point => {
			const q = map.project([p[0], p[1]], zoom);
			return { x: q.x, y: q.y };
		};
	}

	private unproject(p: Point): InkPoint {
		const u = this.map().unproject([p.x, p.y], this.refZoom);
		return [u.lat, u.lng];
	}

	private boxToLatLng(b: Bounds): LatLngBox {
		const a = this.unproject({ x: b.minX, y: b.minY });
		const c = this.unproject({ x: b.maxX, y: b.maxY });
		return {
			minLat: Math.min(a[0], c[0]),
			maxLat: Math.max(a[0], c[0]),
			minLng: Math.min(a[1], c[1]),
			maxLng: Math.max(a[1], c[1]),
		};
	}

	/** Latlng bounds for a container-pixel rectangle, in the shape the layer expects. */
	private containerBounds(p: Point, q: Point): { getNorth(): number; getSouth(): number; getEast(): number; getWest(): number } {
		const map = this.map();
		const a = map.containerPointToLatLng([p.x, p.y]);
		const b = map.containerPointToLatLng([q.x, q.y]);
		const north = Math.max(a.lat, b.lat);
		const south = Math.min(a.lat, b.lat);
		const east = Math.max(a.lng, b.lng);
		const west = Math.min(a.lng, b.lng);
		return { getNorth: () => north, getSouth: () => south, getEast: () => east, getWest: () => west };
	}

	private drawMarquee(g: MarqueeGesture, cur: Point): void {
		const x0 = Math.min(g.start.x, cur.x);
		const y0 = Math.min(g.start.y, cur.y);
		const style = g.el.style;
		style.left = `${x0}px`;
		style.top = `${y0}px`;
		style.width = `${Math.abs(cur.x - g.start.x)}px`;
		style.height = `${Math.abs(cur.y - g.start.y)}px`;
	}

	/** Reference-pixel box of the selection: the item's own box for one item, else the union of bounds. */
	private selectionBox(doc: InkDoc, ids: string[]): { rect: Bounds; rotation: number; centre: Point } | undefined {
		const project = this.project();
		const pxToRef = this.pxToRef();
		if (ids.length === 1) {
			const item = doc.items.find(i => i.id === ids[0]);
			if (!item) return undefined;
			const box = itemBox(item, project, pxToRef);
			return box ? { rect: box.rect, rotation: box.rotation, centre: box.centre } : undefined;
		}
		let rect: Bounds | undefined;
		for (const item of doc.items) {
			if (ids.indexOf(item.id) < 0) continue;
			const b = itemBounds(item, project, pxToRef);
			if (!b) continue;
			rect = rect
				? { minX: Math.min(rect.minX, b.minX), minY: Math.min(rect.minY, b.minY), maxX: Math.max(rect.maxX, b.maxX), maxY: Math.max(rect.maxY, b.maxY) }
				: b;
		}
		if (!rect) return undefined;
		return { rect, rotation: 0, centre: { x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2 } };
	}
}

/** A new select tool. Each editor needs its own instance, because the tool keeps gesture state. */
export function createSelectTool(): InkToolLike & { readonly id: 'select' } {
	return new SelectTool();
}

