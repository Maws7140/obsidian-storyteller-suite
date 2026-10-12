/**
 * Live state for Map Ink: the document, the selection, the active tool and layer,
 * the current style per tool, undo and redo, and saving.
 *
 * Every change goes through `apply` (or a method that calls it), which normalises
 * the document, records undo history, prunes the selection and schedules a save.
 * Saves are debounced while a coalesce key is active (a drag or a typed field)
 * and immediate otherwise. A failed save keeps the in-memory document and is
 * retried on the next change.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { nextInkId, normalizeInk } from './model';
import type { InkDoc, InkItem, InkKind, InkStyle, InkTextStyle } from './model';
import { DEFAULT_PATH_STYLE, DEFAULT_STYLE, DEFAULT_TEXT_STYLE, applyPreset, findPreset, mergeStyle } from './styles';
import type { InkPreset } from './styles';
import { InkHistory } from './history';
import type { InkHost } from './host';
import type { InkStoreLike, InkToolId } from './storeTypes';
import * as layerOps from './layerOps';
import type { InkLayerStoreLike } from './layerOps';

/** Quiet time after the last change of a coalesced edit before the save runs. */
export const SAVE_DELAY_MS = 300;
/** Most recent colours kept for the colour picker. */
const RECENT_LIMIT = 8;
/** Stamp symbol used before the user picks one. */
const DEFAULT_SYMBOL = 'pin';

/**
 * Stamps keep their look in the current style for their kind: `stroke` is the
 * colour, `strokeOpacity` the opacity and `strokeWidth` the size in map units.
 */
const DEFAULT_STAMP_STYLE: InkStyle = { ...DEFAULT_STYLE, stroke: '#2b2b2b', strokeWidth: 32, strokeOpacity: 1 };

/** The tool's item kind, for the style that tool edits. Select and pan edit no style. */
function kindOfTool(tool: InkToolId): InkKind | undefined {
	switch (tool) {
		case 'path': return 'path';
		case 'area': return 'area';
		case 'freehand': return 'freehand';
		case 'rect': return 'rect';
		case 'ellipse': return 'ellipse';
		case 'stamp': return 'stamp';
		case 'text': return 'text';
		default: return undefined;
	}
}

function defaultStyleFor(kind: InkKind): InkStyle {
	if (kind === 'stamp') return { ...DEFAULT_STAMP_STYLE };
	if (kind === 'path' || kind === 'freehand') return { ...DEFAULT_PATH_STYLE };
	return { ...DEFAULT_STYLE };
}

function messageOf(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

function sameDoc(a: InkDoc, b: InkDoc): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** The preset family that fits an item, or undefined for kinds that take no preset. */
function fitOfItem(item: InkItem): 'path' | 'area' | 'text' | undefined {
	switch (item.kind) {
		case 'path':
		case 'freehand': return 'path';
		case 'area':
		case 'rect':
		case 'ellipse': return 'area';
		case 'text': return 'text';
		default: return undefined;
	}
}

function withPreset(item: InkItem, preset: InkPreset): InkItem {
	const fit = fitOfItem(item);
	if (fit === undefined || fit !== preset.fits) return item;
	if (item.kind === 'text') return { ...item, style: applyPreset(item.style, preset) };
	if (item.kind === 'stamp') return item;
	return { ...item, style: applyPreset(item.style, preset) };
}

export class InkStore implements InkStoreLike, InkLayerStoreLike {
	private current: InkDoc;
	private selected: ReadonlySet<string> = new Set<string>();
	private toolId: InkToolId = 'select';
	private readonly styles = new Map<InkKind, InkStyle>();
	private textStyle: InkTextStyle = { ...DEFAULT_TEXT_STYLE };
	private symbol = DEFAULT_SYMBOL;
	private recent: string[] = [];
	private layerId: string | undefined;
	private readonly history = new InkHistory<InkDoc>();
	private readonly listeners = new Set<() => void>();
	/** Bumped whenever coalescing ends, so an equal key in a later run starts a new undo step. */
	private runId = 0;
	private dirty = false;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private chain: Promise<void> = Promise.resolve();

	constructor(private readonly host: InkHost, initial?: InkDoc) {
		this.current = normalizeInk(initial ?? host.load());
		const font = host.drawDefaults?.().textFont;
		if (font) this.textStyle = { ...this.textStyle, font };
	}

	// ---- reading state --------------------------------------------------------

	get doc(): InkDoc {
		return this.current;
	}

	get selection(): ReadonlySet<string> {
		return this.selected;
	}

	get tool(): InkToolId {
		return this.toolId;
	}

	get canUndo(): boolean {
		return this.history.canUndo;
	}

	get canRedo(): boolean {
		return this.history.canRedo;
	}

	on(event: 'change', fn: () => void): () => void {
		if (event !== 'change') return () => undefined;
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}

	// ---- changing the document -----------------------------------------------

	/**
	 * Change the document. `change` must not mutate its argument. Edits that share
	 * a coalesceKey merge into one undo step and one debounced save.
	 */
	apply(change: (doc: InkDoc) => InkDoc, coalesceKey?: string): void {
		const before = this.current;
		this.commit(before, normalizeInk(change(before)), coalesceKey);
	}

	/**
	 * End coalescing, so the next edit starts a new undo step, and save now if
	 * there is anything unsaved. Resolves when the save has finished.
	 */
	flush(): Promise<void> {
		this.runId++;
		return this.persist();
	}

	/** Add an item on the active layer (or the layer given), select it, and return its id. Returns '' if the item was not valid. */
	addItem(item: Omit<InkItem, 'id' | 'layer'> & Partial<Pick<InkItem, 'id' | 'layer'>>): string {
		const before = this.current;
		const taken = before.items.some(existing => existing.id === item.id);
		const id = item.id && !taken ? item.id : nextInkId(item.kind, before);
		const layer = item.layer ?? this.activeLayer();
		const full = { ...item, id, layer } as InkItem;
		const next = normalizeInk({ ...before, items: [...before.items, full] });
		if (!next.items.some(existing => existing.id === id)) return '';
		this.selected = new Set<string>([id]);
		this.commit(before, next, undefined);
		return id;
	}

	/** Replace the whole document, for example after an outside edit. Unsaved edits are dropped. */
	replaceDoc(doc: InkDoc, opts: { resetHistory?: boolean } = {}): void {
		this.runId++;
		this.clearTimer();
		this.dirty = false;
		this.current = normalizeInk(doc);
		if (opts.resetHistory) this.history.clear();
		this.selected = this.existing(this.selected);
		this.emit();
	}

	updateSelected(patch: (item: InkItem) => InkItem, coalesceKey?: string): void {
		if (this.selected.size === 0) return;
		const ids = this.selected;
		this.apply(doc => ({
			...doc,
			items: doc.items.map(item => {
				if (!ids.has(item.id)) return item;
				const next = patch(item);
				return { ...next, id: item.id, kind: item.kind } as InkItem;
			}),
		}), coalesceKey);
	}

	applyPresetToSelection(id: string): void {
		const preset = findPreset(id) ?? this.host.presets().find(p => p.id === id);
		if (!preset || this.selected.size === 0) return;
		const ids = this.selected;
		this.apply(doc => ({
			...doc,
			items: doc.items.map(item => (ids.has(item.id) ? withPreset(item, preset) : item)),
		}));
	}

	deleteSelected(): void {
		if (this.selected.size === 0) return;
		const ids = this.selected;
		this.apply(doc => ({ ...doc, items: doc.items.filter(item => !ids.has(item.id)) }));
	}

	bringForward(): void {
		this.reorder(true);
	}

	sendBackward(): void {
		this.reorder(false);
	}

	setSelectedLayer(layerId: string): void {
		if (!this.current.layers.some(layer => layer.id === layerId)) return;
		this.updateSelected(item => ({ ...item, layer: layerId }));
	}

	undo(): void {
		const previous = this.history.undo(this.current);
		if (previous !== undefined) this.restore(previous);
	}

	redo(): void {
		const next = this.history.redo(this.current);
		if (next !== undefined) this.restore(next);
	}

	// ---- layers ---------------------------------------------------------------
	// Every layer edit goes through apply, so it is undoable and saved like an item edit.

	/** Adds a layer on top and makes it the active layer. Returns its id. */
	addLayer(name: string): string {
		let id = '';
		this.apply(doc => {
			const added = layerOps.addLayer(doc, name);
			id = added.id;
			return added.doc;
		});
		if (id) {
			this.layerId = id;
			this.emit();
		}
		return id;
	}

	renameLayer(id: string, name: string): void {
		this.apply(doc => layerOps.renameLayer(doc, id, name));
	}

	moveLayer(id: string, toIndex: number): void {
		this.apply(doc => layerOps.moveLayer(doc, id, toIndex));
	}

	setLayerVisible(id: string, visible: boolean): void {
		this.apply(doc => layerOps.setLayerVisible(doc, id, visible));
	}

	setLayerLocked(id: string, locked: boolean): void {
		this.apply(doc => layerOps.setLayerLocked(doc, id, locked));
	}

	/** Deletes a layer. Its items move to the layer below, or above when it is the bottom one. */
	deleteLayer(id: string): void {
		if (this.layerId === id) this.layerId = undefined;
		this.apply(doc => layerOps.deleteLayer(doc, id));
	}

	// ---- selection ------------------------------------------------------------

	/** Replace the selection with these ids. Unknown ids are ignored. */
	select(ids: Iterable<string>): void {
		this.selected = this.existing(ids);
		this.emit();
	}

	toggleSelect(id: string): void {
		const next = new Set<string>(this.selected);
		if (next.has(id)) {
			next.delete(id);
		} else if (this.existing([id]).has(id)) {
			next.add(id);
		}
		this.selected = next;
		this.emit();
	}

	clearSelection(): void {
		this.selected = new Set<string>();
		this.emit();
	}

	// ---- tool, layer and style state -----------------------------------------

	setTool(t: InkToolId): void {
		if (t === this.toolId) return;
		void this.flush();
		this.toolId = t;
		this.emit();
	}

	activeLayer(): string {
		const layers = this.current.layers;
		if (this.layerId !== undefined && layers.some(layer => layer.id === this.layerId)) return this.layerId;
		return layers.some(layer => layer.id === 'features') ? 'features' : layers[0].id;
	}

	setActiveLayer(id: string): void {
		if (!this.current.layers.some(layer => layer.id === id)) return;
		this.layerId = id;
		this.emit();
	}

	currentStyle(kind: InkKind): InkStyle {
		return { ...(this.styles.get(kind) ?? defaultStyleFor(kind)) };
	}

	/** Edit the current style of the active tool's kind. Does nothing for select and pan. */
	setCurrentStyle(patch: Partial<InkStyle>): void {
		const kind = kindOfTool(this.toolId);
		if (kind === undefined) return;
		this.styles.set(kind, mergeStyle(this.currentStyle(kind), patch));
		this.emit();
	}

	currentTextStyle(): InkTextStyle {
		return { ...this.textStyle };
	}

	setCurrentTextStyle(patch: Partial<InkTextStyle>): void {
		this.textStyle = mergeStyle(this.textStyle, patch);
		this.emit();
	}

	currentSymbol(): string {
		return this.symbol;
	}

	setCurrentSymbol(id: string): void {
		this.symbol = id;
		this.emit();
	}

	recentColors(): string[] {
		return this.recent.slice();
	}

	pushRecentColor(color: string): void {
		const value = color.trim();
		if (value === '') return;
		this.recent = [value, ...this.recent.filter(c => c !== value)].slice(0, RECENT_LIMIT);
		this.emit();
	}

	// ---- internals ------------------------------------------------------------

	/** Record `before` for undo, make `next` current, prune the selection, and save. */
	private commit(before: InkDoc, next: InkDoc, coalesceKey: string | undefined): void {
		if (sameDoc(before, next)) return;
		this.history.push(before, coalesceKey === undefined ? undefined : `${this.runId}:${coalesceKey}`);
		this.current = next;
		this.selected = this.existing(this.selected);
		this.dirty = true;
		this.emit();
		this.scheduleSave(coalesceKey !== undefined);
	}

	/** Make a document from undo or redo current, with a save right away. */
	private restore(doc: InkDoc): void {
		this.runId++;
		this.current = doc;
		this.selected = this.existing(this.selected);
		this.dirty = true;
		this.emit();
		this.scheduleSave(false);
	}

	private reorder(forward: boolean): void {
		const ids = this.selected;
		if (ids.size === 0) return;
		this.apply(doc => {
			const items = doc.items.slice();
			const selectedIndices = items.map((_item, i) => i).filter(i => ids.has(items[i].id));
			if (forward) {
				// Highest first, so a lower item is not moved past a higher one that is still to move.
				for (const i of selectedIndices.slice().reverse()) {
					let j = -1;
					for (let k = i + 1; k < items.length; k++) {
						if (items[k].layer === items[i].layer) { j = k; break; }
					}
					if (j < 0) continue;
					const [item] = items.splice(i, 1);
					items.splice(j, 0, item);
				}
			} else {
				for (const i of selectedIndices) {
					let j = -1;
					for (let k = i - 1; k >= 0; k--) {
						if (items[k].layer === items[i].layer) { j = k; break; }
					}
					if (j < 0) continue;
					const [item] = items.splice(i, 1);
					items.splice(j, 0, item);
				}
			}
			return { ...doc, items };
		});
	}

	/** The ids in `ids` that exist in the current document. Always a new set. */
	private existing(ids: Iterable<string>): Set<string> {
		const known = new Set(this.current.items.map(item => item.id));
		const out = new Set<string>();
		for (const id of ids) {
			if (known.has(id)) out.add(id);
		}
		return out;
	}

	private scheduleSave(debounced: boolean): void {
		if (debounced) {
			this.clearTimer();
			this.timer = setTimeout(() => {
				this.timer = undefined;
				void this.persist();
			}, SAVE_DELAY_MS);
			return;
		}
		void this.persist();
	}

	private clearTimer(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	/** Queue a save of whatever the document is when the save runs. Saves never overlap. */
	private persist(): Promise<void> {
		this.clearTimer();
		if (!this.dirty) return this.chain;
		this.chain = this.chain.then(() => this.writeLatest());
		return this.chain;
	}

	private async writeLatest(): Promise<void> {
		if (!this.dirty) return;
		this.dirty = false;
		const snapshot = this.current;
		try {
			await this.host.save(snapshot);
		} catch (err) {
			// The drawing stays in memory. Only the next change saves again, so a
			// failing save is not retried on every flush.
			this.host.notify(`Map Ink could not save: ${messageOf(err)}`);
		}
	}

	private emit(): void {
		for (const fn of Array.from(this.listeners)) fn();
	}
}
