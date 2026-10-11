/**
 * Vertical tool strip for Map Ink: the drawing tools, undo and redo, and a stamp
 * picker flyout that opens while the Stamp tool is active.
 *
 * Plain DOM. Icons come from host.icon (Lucide names).
 */
import type { InkHost } from './host';
import type { InkStoreLike, InkToolId } from './storeTypes';
import { searchSymbols, symbolsByCategory, symbolSvg, type InkSymbol } from './symbols';
import { makeEl } from './ui/ColorPicker';

export interface InkToolDef {
	id: InkToolId;
	name: string;
	/** The single-key shortcut, as shown to the user. */
	shortcut: string;
	/** Lucide icon name. */
	icon: string;
}

/** The drawing tools in toolbar order. Pan is also held on Space. */
export const INK_TOOLS: readonly InkToolDef[] = [
	{ id: 'select', name: 'Select', shortcut: 'V', icon: 'mouse-pointer-2' },
	{ id: 'pan', name: 'Pan', shortcut: 'H', icon: 'hand' },
	{ id: 'stamp', name: 'Stamp', shortcut: 'S', icon: 'stamp' },
	{ id: 'text', name: 'Text', shortcut: 'T', icon: 'type' },
	{ id: 'path', name: 'Path', shortcut: 'L', icon: 'spline' },
	{ id: 'area', name: 'Area', shortcut: 'A', icon: 'pentagon' },
	{ id: 'freehand', name: 'Freehand', shortcut: 'B', icon: 'pen-tool' },
	{ id: 'rect', name: 'Rectangle', shortcut: 'R', icon: 'square' },
	{ id: 'ellipse', name: 'Ellipse', shortcut: 'E', icon: 'circle' },
];

export class InkToolbar {
	readonly el: HTMLElement;
	private readonly doc: Document;
	private readonly store: InkStoreLike;
	private readonly host: InkHost;
	private readonly toolButtons = new Map<InkToolId, HTMLButtonElement>();
	private readonly undoButton: HTMLButtonElement;
	private readonly redoButton: HTMLButtonElement;
	private readonly flyout: HTMLElement;
	private readonly search: HTMLInputElement;
	private readonly grid: HTMLElement;
	private symbolButtons: Array<{ id: string; button: HTMLButtonElement }> = [];
	private query = '';
	private readonly unsubscribe: () => void;

	constructor(parent: HTMLElement, store: InkStoreLike, host: InkHost) {
		this.doc = parent.ownerDocument;
		const doc = this.doc;
		this.store = store;
		this.host = host;

		this.el = makeEl(doc, 'div', 'ink-toolbar', {
			role: 'toolbar',
			'aria-orientation': 'vertical',
			'aria-label': 'Map Ink tools',
		});

		for (const tool of INK_TOOLS) {
			const label = `${tool.name} (${tool.shortcut})`;
			const btn = makeEl(doc, 'button', 'ink-tool', {
				type: 'button',
				'aria-label': label,
				'data-tooltip': label,
				'data-tool': tool.id,
			});
			this.addIcon(btn, tool.icon);
			btn.addEventListener('click', () => this.store.setTool(tool.id));
			this.toolButtons.set(tool.id, btn);
			this.el.appendChild(btn);
		}

		const sep = makeEl(doc, 'div', 'ink-toolbar-sep', { role: 'separator', 'aria-orientation': 'horizontal' });
		this.el.appendChild(sep);

		this.undoButton = makeEl(doc, 'button', 'ink-tool', {
			type: 'button',
			'aria-label': 'Undo (Ctrl+Z)',
			'data-tooltip': 'Undo (Ctrl+Z)',
		});
		this.addIcon(this.undoButton, 'undo-2');
		this.undoButton.addEventListener('click', () => this.store.undo());
		this.el.appendChild(this.undoButton);

		this.redoButton = makeEl(doc, 'button', 'ink-tool', {
			type: 'button',
			'aria-label': 'Redo (Ctrl+Shift+Z)',
			'data-tooltip': 'Redo (Ctrl+Shift+Z)',
		});
		this.addIcon(this.redoButton, 'redo-2');
		this.redoButton.addEventListener('click', () => this.store.redo());
		this.el.appendChild(this.redoButton);

		this.flyout = makeEl(doc, 'div', 'ink-stamp-flyout', {
			role: 'dialog',
			'aria-label': 'Choose a stamp',
		});
		this.flyout.hidden = true;
		this.search = makeEl(doc, 'input', 'ink-stamp-search', {
			type: 'search',
			'aria-label': 'Search stamps',
			placeholder: 'Search stamps',
			autocomplete: 'off',
		});
		this.search.addEventListener('input', () => {
			this.query = this.search.value.trim();
			this.renderGrid();
		});
		this.flyout.appendChild(this.search);
		this.grid = makeEl(doc, 'div', 'ink-stamp-scroll');
		this.flyout.appendChild(this.grid);
		this.el.appendChild(this.flyout);
		this.renderGrid();

		parent.appendChild(this.el);
		this.unsubscribe = this.store.on('change', () => this.refresh());
		this.refresh();
	}

	/** Syncs active tool, undo/redo state, and the stamp flyout with the store. */
	refresh(): void {
		const tool = this.store.tool;
		for (const [id, btn] of this.toolButtons) {
			const active = id === tool;
			btn.setAttribute('aria-pressed', String(active));
			btn.classList.toggle('ink-tool-active', active);
		}
		this.undoButton.disabled = !this.store.canUndo;
		this.redoButton.disabled = !this.store.canRedo;
		this.flyout.hidden = tool !== 'stamp';
		this.syncStamps();
	}

	destroy(): void {
		this.unsubscribe();
		this.el.remove();
	}

	private addIcon(btn: HTMLButtonElement, name: string): void {
		const slot = makeEl(this.doc, 'span', 'ink-icon');
		btn.appendChild(slot);
		this.host.icon(slot, name);
	}

	private renderGrid(): void {
		this.grid.replaceChildren();
		this.symbolButtons = [];
		if (this.query) {
			const found = searchSymbols(this.query);
			if (found.length === 0) {
				const none = makeEl(this.doc, 'p', 'ink-hint');
				none.textContent = `No stamps match "${this.query}".`;
				this.grid.appendChild(none);
			} else {
				this.grid.appendChild(this.symbolGrid(found));
			}
		} else {
			for (const group of symbolsByCategory()) {
				if (group.symbols.length === 0) continue;
				const heading = makeEl(this.doc, 'h4', 'ink-stamp-heading');
				heading.textContent = group.category.name;
				this.grid.appendChild(heading);
				this.grid.appendChild(this.symbolGrid(group.symbols));
			}
		}
		this.syncStamps();
	}

	private symbolGrid(symbols: readonly InkSymbol[]): HTMLElement {
		const cells = makeEl(this.doc, 'div', 'ink-stamp-grid');
		for (const symbol of symbols) {
			const btn = makeEl(this.doc, 'button', 'ink-stamp-btn', {
				type: 'button',
				'aria-label': symbol.name,
				title: symbol.name,
				'data-symbol': symbol.id,
			});
			btn.innerHTML = symbolSvg(symbol.id, { size: 20 });
			btn.addEventListener('click', () => this.store.setCurrentSymbol(symbol.id));
			this.symbolButtons.push({ id: symbol.id, button: btn });
			cells.appendChild(btn);
		}
		return cells;
	}

	private syncStamps(): void {
		const current = this.store.currentSymbol();
		for (const { id, button } of this.symbolButtons) {
			const active = id === current;
			button.setAttribute('aria-pressed', String(active));
			button.classList.toggle('ink-stamp-active', active);
		}
	}
}
