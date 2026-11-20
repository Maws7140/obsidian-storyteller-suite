/**
 * Layers panel for Map Ink. Lists the layers top first (the last layer is drawn
 * on top). Each row has a visibility toggle, a lock toggle, the name (double-click
 * or Enter to rename), an item count, a drag handle, and a delete button. A row
 * click makes that layer the active one. Alt+ArrowUp and Alt+ArrowDown move the
 * focused row, and the new position is announced.
 *
 * The list is rebuilt after every action and on store changes. While a rename is
 * open, store changes wait so the typed text is not lost.
 *
 * Plain DOM. Elements come from the parent's ownerDocument. Icons come from
 * host.icon (Lucide names).
 */
import type { InkHost } from './host';
import { deleteTargetLayer, layerItemCount } from './layerOps';
import type { InkLayerStoreLike } from './layerOps';
import type { InkDoc } from './model';
import { makeEl } from './ui/ColorPicker';

/** A pointer drag shorter than this many pixels is a click, not a reorder. */
const DRAG_THRESHOLD = 4;
const NAME_LIMIT = 200;

interface DragState {
	id: string;
	pointerId: number;
	startY: number;
	moved: boolean;
	/** Where the dragged row would be inserted, counted in rows from the top. */
	dropDisplay: number;
}

interface RenameState {
	id: string;
	draft: string;
}

export class InkLayersPanel {
	readonly el: HTMLElement;
	private readonly doc: Document;
	private readonly store: InkLayerStoreLike;
	private readonly host: InkHost;
	private readonly list: HTMLElement;
	private readonly live: HTMLElement;
	private readonly unsubscribe: () => void;
	/** Element lookup for the current build, keyed by "layerId:part". */
	private keyed = new Map<string, HTMLElement>();
	/** Rows in display order, top first. */
	private rows: Array<{ id: string; el: HTMLElement }> = [];
	private lastSignature = '';
	private editing: RenameState | null = null;
	private focusKey: string | null = null;
	private drag: DragState | null = null;

	constructor(parent: HTMLElement, store: InkLayerStoreLike, host: InkHost) {
		this.doc = parent.ownerDocument;
		this.store = store;
		this.host = host;

		this.el = makeEl(this.doc, 'section', 'ink-layers', { 'aria-label': 'Map Ink layers' });
		const title = makeEl(this.doc, 'div', 'ink-layers-title');
		title.textContent = 'Layers';
		this.list = makeEl(this.doc, 'ul', 'ink-layers-list', { 'aria-label': 'Layers, top first' });
		this.live = makeEl(this.doc, 'div', 'ink-sr-only', { role: 'status', 'aria-live': 'polite' });

		const add = makeEl(this.doc, 'button', 'ink-layers-add', { type: 'button', 'aria-label': 'Add layer' });
		this.addIcon(add, 'plus');
		const addLabel = makeEl(this.doc, 'span', 'ink-layers-add-label');
		addLabel.textContent = 'Add layer';
		add.appendChild(addLabel);
		add.addEventListener('click', () => this.addLayer());

		this.el.appendChild(title);
		this.el.appendChild(this.list);
		this.el.appendChild(add);
		this.el.appendChild(this.live);
		parent.appendChild(this.el);

		// Keys belong to the panel: map shortcuts such as Delete or arrow nudges must not fire while typing or reordering here.
		this.el.addEventListener('keydown', event => event.stopPropagation());

		this.unsubscribe = this.store.on('change', () => this.refresh());
		this.refresh(true);
	}

	/**
	 * Re-reads the store and rebuilds the rows when something shown has changed.
	 * `force` always rebuilds. While a rename is open, a non-forced refresh waits.
	 */
	refresh(force = false): void {
		if (this.editing && !force) return;
		const signature = this.signature();
		if (force || signature !== this.lastSignature) {
			this.lastSignature = signature;
			this.build();
		}
	}

	destroy(): void {
		this.unsubscribe();
		this.drag = null;
		this.el.remove();
	}

	// ---- building -----------------------------------------------------------

	private signature(): string {
		const doc = this.store.doc;
		return JSON.stringify([
			doc.layers.map(l => [l.id, l.name, l.visible, l.locked, layerItemCount(doc, l.id)]),
			this.store.activeLayer(),
		]);
	}

	private build(): void {
		this.list.replaceChildren();
		this.keyed = new Map<string, HTMLElement>();
		this.rows = [];
		const doc = this.store.doc;
		const active = this.store.activeLayer();
		for (let i = doc.layers.length - 1; i >= 0; i--) {
			const row = this.buildRow(doc, i, active);
			this.list.appendChild(row);
			this.rows.push({ id: doc.layers[i].id, el: row });
		}
		this.restoreFocus();
	}

	private buildRow(doc: InkDoc, index: number, active: string): HTMLElement {
		const layer = doc.layers[index];
		const id = layer.id;
		const isActive = id === active;
		const isEditing = this.editing?.id === id;
		const row = makeEl(this.doc, 'li', 'ink-layer-row');
		row.classList.toggle('ink-layer-active', isActive);
		row.classList.toggle('ink-layer-off', !layer.visible);
		row.classList.toggle('ink-layer-locked', layer.locked);
		row.addEventListener('click', () => {
			if (this.editing || isActive) return;
			this.act(() => {
				this.store.setActiveLayer(id);
				return null;
			});
		});
		row.addEventListener('keydown', event => this.onRowKey(event, id));

		const handle = this.iconButton(id, 'handle', 'grip-vertical', `Reorder layer ${layer.name}`, () => undefined);
		handle.setAttribute('title', 'Drag to reorder, or press Alt+Up or Alt+Down');
		handle.addEventListener('pointerdown', event => this.onDragStart(event, id));
		handle.addEventListener('pointermove', event => this.onDragMove(event));
		handle.addEventListener('pointerup', event => this.onDragEnd(event));
		handle.addEventListener('pointercancel', () => this.cancelDrag());
		row.appendChild(handle);

		row.appendChild(this.iconButton(id, 'eye',
			layer.visible ? 'eye' : 'eye-off',
			layer.visible ? `Hide layer ${layer.name}` : `Show layer ${layer.name}`,
			() => this.act(() => {
				this.store.setLayerVisible(id, !layer.visible);
				return `${id}:eye`;
			})));

		row.appendChild(this.iconButton(id, 'lock',
			layer.locked ? 'lock' : 'lock-open',
			layer.locked ? `Unlock layer ${layer.name}` : `Lock layer ${layer.name}`,
			() => this.act(() => {
				this.store.setLayerLocked(id, !layer.locked);
				return `${id}:lock`;
			})));

		row.appendChild(isEditing ? this.renameInput(id, layer.name) : this.nameButton(id, layer.name, isActive));

		const count = makeEl(this.doc, 'span', 'ink-layer-count', { title: `${layerItemCount(doc, id)} items on this layer` });
		count.textContent = String(layerItemCount(doc, id));
		row.appendChild(count);

		const onlyLayer = doc.layers.length < 2;
		row.appendChild(this.iconButton(id, 'delete', 'trash-2', `Delete layer ${layer.name}`,
			() => { void this.deleteLayer(id); }, onlyLayer));

		return row;
	}

	private nameButton(id: string, name: string, isActive: boolean): HTMLButtonElement {
		const attrs: Record<string, string> = {
			type: 'button',
			title: 'Double-click or press Enter to rename',
		};
		if (isActive) attrs['aria-current'] = 'true';
		const btn = makeEl(this.doc, 'button', 'ink-layer-name', attrs);
		btn.textContent = name;
		btn.setAttribute('data-part', 'name');
		btn.addEventListener('click', event => {
			event.stopPropagation();
			if (this.editing || isActive) return;
			this.act(() => {
				this.store.setActiveLayer(id);
				return `${id}:name`;
			});
		});
		btn.addEventListener('dblclick', event => {
			event.stopPropagation();
			this.startRename(id);
		});
		btn.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === 'F2') {
				event.preventDefault();
				this.startRename(id);
			}
		});
		this.keyed.set(`${id}:name`, btn);
		return btn;
	}

	private renameInput(id: string, name: string): HTMLInputElement {
		const input = makeEl(this.doc, 'input', 'ink-input ink-layer-rename', {
			type: 'text',
			'aria-label': `Name of layer ${name}`,
			maxlength: String(NAME_LIMIT),
			'data-part': 'rename',
		});
		input.value = this.editing?.draft ?? name;
		input.addEventListener('keydown', event => {
			event.stopPropagation();
			if (event.key === 'Enter') {
				event.preventDefault();
				this.commitRename(id, input.value, true);
			} else if (event.key === 'Escape') {
				event.preventDefault();
				this.cancelRename(id);
			}
		});
		input.addEventListener('blur', () => this.commitRename(id, input.value, false));
		this.keyed.set(`${id}:rename`, input);
		return input;
	}

	private iconButton(
		id: string,
		part: string,
		icon: string,
		label: string,
		onClick: () => void,
		disabled = false,
	): HTMLButtonElement {
		const btn = makeEl(this.doc, 'button', `ink-layer-icon-btn ink-layer-${part}`, {
			type: 'button',
			'aria-label': label,
			title: label,
			'data-part': part,
		});
		btn.disabled = disabled;
		this.addIcon(btn, icon);
		btn.addEventListener('click', event => {
			event.stopPropagation();
			onClick();
		});
		this.keyed.set(`${id}:${part}`, btn);
		return btn;
	}

	private addIcon(btn: HTMLElement, name: string): void {
		const slot = makeEl(this.doc, 'span', 'ink-icon');
		btn.appendChild(slot);
		this.host.icon(slot, name);
	}

	/** Runs an edit, then rebuilds. `fn` returns the key of the control to focus afterwards, or null. */
	private act(fn: () => string | null): void {
		const key = fn();
		this.focusKey = key;
		try {
			this.refresh(true);
		} finally {
			this.focusKey = null;
		}
	}

	private restoreFocus(): void {
		if (!this.focusKey) return;
		const el = this.keyed.get(this.focusKey);
		if (!el) return;
		el.focus();
		const input = el as HTMLInputElement;
		if (typeof input.select === 'function' && input.tagName === 'INPUT') input.select();
	}

	private announce(message: string): void {
		this.live.textContent = message;
	}

	// ---- actions --------------------------------------------------------------

	private addLayer(): void {
		const name = `Layer ${this.store.doc.layers.length + 1}`;
		let id = '';
		this.act(() => {
			id = this.store.addLayer(name);
			this.store.setActiveLayer(id);
			return null;
		});
		if (id) this.startRename(id);
	}

	private startRename(id: string): void {
		const layer = this.store.doc.layers.find(l => l.id === id);
		if (!layer) return;
		this.act(() => {
			this.editing = { id, draft: layer.name };
			return `${id}:rename`;
		});
	}

	/** Ends a rename and applies the new name. `restoreFocus` is false for a blur, so focus is not pulled back. */
	private commitRename(id: string, value: string, restoreFocus: boolean): void {
		if (!this.editing || this.editing.id !== id) return;
		const name = value.trim();
		const current = this.store.doc.layers.find(l => l.id === id);
		this.act(() => {
			this.editing = null;
			if (current && name && name !== current.name) this.store.renameLayer(id, name);
			return restoreFocus ? `${id}:name` : null;
		});
	}

	private cancelRename(id: string): void {
		if (!this.editing || this.editing.id !== id) return;
		this.act(() => {
			this.editing = null;
			return `${id}:name`;
		});
	}

	private async deleteLayer(id: string): Promise<void> {
		const doc = this.store.doc;
		const layer = doc.layers.find(l => l.id === id);
		if (!layer || doc.layers.length < 2) return;
		const target = deleteTargetLayer(doc, id);
		const count = layerItemCount(doc, id);
		const message = count > 0 && target
			? `Delete the layer "${layer.name}"? Its ${count} ${count === 1 ? 'item' : 'items'} will move to "${target.name}".`
			: `Delete the layer "${layer.name}"?`;
		const ok = await this.host.confirm(message);
		if (!ok) return;
		// The layer may have changed while the dialog was open.
		const now = this.store.doc;
		if (!now.layers.some(l => l.id === id) || now.layers.length < 2) return;
		this.act(() => {
			this.store.deleteLayer(id);
			return `${this.store.activeLayer()}:name`;
		});
		this.announce(`Deleted layer ${layer.name}.`);
	}

	private onRowKey(event: KeyboardEvent, id: string): void {
		if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
		if (this.editing) return;
		event.preventDefault();
		const layers = this.store.doc.layers;
		const index = layers.findIndex(l => l.id === id);
		if (index < 0) return;
		const up = event.key === 'ArrowUp';
		const toIndex = up ? index + 1 : index - 1;
		const name = layers[index].name;
		if (toIndex < 0 || toIndex >= layers.length) {
			this.announce(`${name} is already ${up ? 'at the top' : 'at the bottom'}.`);
			return;
		}
		const part = (event.target as HTMLElement | null)?.getAttribute?.('data-part') ?? 'handle';
		const position = layers.length - toIndex;
		this.act(() => {
			this.store.moveLayer(id, toIndex);
			return `${id}:${part}`;
		});
		this.announce(`${name} moved to position ${position} of ${layers.length}.`);
	}

	// ---- pointer reordering ---------------------------------------------------

	private onDragStart(event: PointerEvent, id: string): void {
		if (this.editing || event.button > 0) return;
		this.drag = { id, pointerId: event.pointerId, startY: event.clientY, moved: false, dropDisplay: 0 };
		const handle = event.currentTarget as HTMLElement | null;
		if (handle && typeof handle.setPointerCapture === 'function') {
			handle.setPointerCapture(event.pointerId);
		}
	}

	private onDragMove(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (!drag.moved) {
			if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
			drag.moved = true;
		}
		drag.dropDisplay = this.dropPosition(event.clientY);
		this.showDrop(drag);
	}

	private onDragEnd(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		this.drag = null;
		this.clearDrop();
		if (!drag.moved) return;

		const layers = this.store.doc.layers;
		const from = this.rows.findIndex(r => r.id === drag.id);
		if (from < 0) return;
		// Removing the dragged row shifts the rows below it up by one.
		const finalDisplay = drag.dropDisplay > from ? drag.dropDisplay - 1 : drag.dropDisplay;
		if (finalDisplay === from) return;
		const toIndex = layers.length - 1 - finalDisplay;
		const name = layers.find(l => l.id === drag.id)?.name ?? drag.id;
		this.act(() => {
			this.store.moveLayer(drag.id, toIndex);
			return `${drag.id}:handle`;
		});
		this.announce(`${name} moved to position ${layers.length - toIndex} of ${layers.length}.`);
	}

	private cancelDrag(): void {
		this.drag = null;
		this.clearDrop();
	}

	/** How many rows (top first) sit above the pointer. */
	private dropPosition(clientY: number): number {
		let above = 0;
		for (const row of this.rows) {
			const rect = row.el.getBoundingClientRect();
			if (clientY > (rect.top + rect.bottom) / 2) above++;
		}
		return above;
	}

	private showDrop(drag: DragState): void {
		const last = this.rows.length - 1;
		this.rows.forEach((row, i) => {
			row.el.classList.toggle('ink-layer-dragging', row.id === drag.id);
			row.el.classList.toggle('ink-layer-drop-before', drag.dropDisplay === i);
			row.el.classList.toggle('ink-layer-drop-after', drag.dropDisplay > last && i === last);
		});
	}

	private clearDrop(): void {
		for (const row of this.rows) {
			row.el.classList.remove('ink-layer-dragging', 'ink-layer-drop-before', 'ink-layer-drop-after');
		}
	}
}
