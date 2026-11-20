/**
 * Keyboard editing for Map Ink: delete, nudge, copy and paste, duplicate, select all,
 * z-order, undo and redo, and Escape.
 *
 * Keys typed into inputs, text areas, selects and contenteditable elements are ignored.
 * The clipboard is module-level and in memory only: it is not the system clipboard.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type { InkItem, InkPoint } from '../model';
import { duplicateItems, deleteItems, moveItems, pasteItems, reorder, selectableIds } from '../transform';
import type { ReorderOp } from '../transform';
import type { InkSelectStore } from './selectTypes';

/** Pixel distance for an arrow nudge, and for a paste or duplicate offset. */
export const NUDGE_PX = 1;
export const NUDGE_PX_SHIFT = 10;
export const PASTE_OFFSET_PX = 10;

export interface EditorKeyOptions {
	/** Container pixels to latlng at the current view. Offsets are measured by differencing two calls. */
	pxToLatLng(x: number, y: number): InkPoint;
	/** Container pixel where offsets are measured. Defaults to [0, 0]. */
	refPx?: [number, number];
}

let clipboard: InkItem[] = [];

/** Whether the clipboard holds anything to paste. */
export function hasClipboard(): boolean {
	return clipboard.length > 0;
}

/** Drop the in-memory clipboard. Used by tests. */
export function clearClipboard(): void {
	clipboard = [];
}

/**
 * Handle one keydown for the editor. Returns true when the key was used, so the caller
 * can call preventDefault and stop the key reaching other handlers.
 */
export function handleEditorKey(e: KeyboardEvent, store: InkSelectStore, opts: EditorKeyOptions): boolean {
	if (isTypingTarget(e.target) || e.isComposing || e.altKey) return false;
	const key = e.key;

	// Bracket keys work with or without Ctrl or Cmd.
	if (key === '[') return reorderSelection(store, 'backward');
	if (key === ']') return reorderSelection(store, 'forward');

	const mod = e.ctrlKey || e.metaKey;
	if (mod) {
		switch (key.toLowerCase()) {
			case 'c': return copySelection(store);
			case 'v': return pasteClipboard(store, opts);
			case 'd': return duplicateSelection(store, opts);
			case 'a': return selectAll(store);
			case 'z': return e.shiftKey ? redo(store) : undo(store);
			case 'y': return redo(store);
			default: return false;
		}
	}

	switch (key) {
		case 'Delete':
		case 'Backspace':
			return deleteSelection(store);
		case 'ArrowLeft':
			return nudge(store, opts, -step(e), 0);
		case 'ArrowRight':
			return nudge(store, opts, step(e), 0);
		case 'ArrowUp':
			return nudge(store, opts, 0, -step(e));
		case 'ArrowDown':
			return nudge(store, opts, 0, step(e));
		case 'Escape':
			if (store.selection.size === 0) return false;
			store.clearSelection();
			return true;
		default:
			return false;
	}
}

/** Copy the selectable selected items into the clipboard. */
export function copySelection(store: InkSelectStore): boolean {
	const ids = new Set(selectableIds(store.doc, Array.from(store.selection)));
	if (ids.size === 0) return false;
	clipboard = store.doc.items.filter(item => ids.has(item.id)).map(item => JSON.parse(JSON.stringify(item)) as InkItem);
	return true;
}

/** Paste the clipboard on the active layer, offset, and select the copies. */
export function pasteClipboard(store: InkSelectStore, opts: EditorKeyOptions): boolean {
	if (clipboard.length === 0) return false;
	const offset = pxOffset(opts, PASTE_OFFSET_PX, PASTE_OFFSET_PX);
	const result = pasteItems(store.doc, clipboard.map(item => JSON.parse(JSON.stringify(item)) as InkItem), offset, store.activeLayer());
	store.apply(() => result.doc);
	store.select(selectableIds(store.doc, result.newIds));
	return true;
}

/** Duplicate the selection with a 10 px offset and select the copies. */
export function duplicateSelection(store: InkSelectStore, opts: EditorKeyOptions): boolean {
	const ids = selectableIds(store.doc, Array.from(store.selection));
	if (ids.length === 0) return false;
	const offset = pxOffset(opts, PASTE_OFFSET_PX, PASTE_OFFSET_PX);
	const result = duplicateItems(store.doc, ids, offset);
	store.apply(() => result.doc);
	store.select(selectableIds(store.doc, result.newIds));
	return true;
}

/** Select every selectable item. */
export function selectAll(store: InkSelectStore): boolean {
	store.select(selectableIds(store.doc, store.doc.items.map(item => item.id)));
	return true;
}

/** Delete the selectable selected items. */
export function deleteSelection(store: InkSelectStore): boolean {
	const ids = selectableIds(store.doc, Array.from(store.selection));
	if (ids.length === 0) return false;
	store.apply(doc => deleteItems(doc, ids));
	store.clearSelection();
	return true;
}

/** Move the selectable selected items by a pixel offset. Repeated nudges merge into one undo step. */
export function nudge(store: InkSelectStore, opts: EditorKeyOptions, dxPx: number, dyPx: number): boolean {
	const ids = selectableIds(store.doc, Array.from(store.selection));
	if (ids.length === 0) return false;
	const offset = pxOffset(opts, dxPx, dyPx);
	store.apply(doc => moveItems(doc, ids, offset.dLat, offset.dLng), 'select-nudge');
	return true;
}

/** Change paint order of the selectable selected items. */
export function reorderSelection(store: InkSelectStore, op: ReorderOp): boolean {
	const ids = selectableIds(store.doc, Array.from(store.selection));
	if (ids.length === 0) return false;
	store.apply(doc => reorder(doc, ids, op));
	return true;
}

export function undo(store: InkSelectStore): boolean {
	if (!store.canUndo) return false;
	store.undo();
	pruneSelection(store);
	return true;
}

export function redo(store: InkSelectStore): boolean {
	if (!store.canRedo) return false;
	store.redo();
	pruneSelection(store);
	return true;
}

// ---- helpers -------------------------------------------------------------------

function step(e: KeyboardEvent): number {
	return e.shiftKey ? NUDGE_PX_SHIFT : NUDGE_PX;
}

/** The latlng offset for a pixel offset, measured at the reference pixel. */
export function pxOffset(opts: EditorKeyOptions, dxPx: number, dyPx: number): { dLat: number; dLng: number } {
	const [rx, ry] = opts.refPx ?? [0, 0];
	const a = opts.pxToLatLng(rx, ry);
	const b = opts.pxToLatLng(rx + dxPx, ry + dyPx);
	return { dLat: b[0] - a[0], dLng: b[1] - a[1] };
}

/** Drop selected ids that no longer exist, such as after an undo removed them. */
function pruneSelection(store: InkSelectStore): void {
	const present = new Set(store.doc.items.map(item => item.id));
	const ids = Array.from(store.selection);
	if (ids.some(id => !present.has(id))) store.select(ids.filter(id => present.has(id)));
}

/** True for inputs, text areas, selects and contenteditable elements, where keys are text. */
export function isTypingTarget(target: EventTarget | null): boolean {
	const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
	if (!el) return false;
	if (el.isContentEditable === true) return true;
	const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
