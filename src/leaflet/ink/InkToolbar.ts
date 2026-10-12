/**
 * Vertical tool strip for Map Ink: the drawing tools, undo and redo, a stamp
 * picker flyout that opens while the Stamp tool is active, and a brush picker
 * flyout that opens while the Path, Freehand or Area tool is active.
 *
 * Plain DOM. Icons come from host.icon (Lucide names).
 */
import type { InkHost } from './host';
import type { InkStoreLike, InkToolId } from './storeTypes';
import { searchSymbols, symbolsByCategory, symbolSvg, type InkSymbol } from './symbols';
import { BRUSHES, brushPreviewSvg, brushesByCategory, getBrush } from './brushes';
import type { InkBrush } from './brushes';
import type { InkStyle } from './model';
import { DEFAULT_PATH_STYLE, DEFAULT_STYLE } from './styles';
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

/** Tools whose style takes a brush, and the item kind each one edits. */
export type BrushKind = 'path' | 'freehand' | 'area';

const BRUSH_KIND: Partial<Record<InkToolId, BrushKind>> = {
	path: 'path',
	freehand: 'freehand',
	area: 'area',
};

/** The width a kind starts with. A brush sets its own width only while the width is still this one. */
function startWidth(kind: BrushKind): number {
	return kind === 'area' ? DEFAULT_STYLE.strokeWidth : DEFAULT_PATH_STYLE.strokeWidth;
}

/**
 * The style patch for picking a brush (or None, when `brushId` is null).
 * Picking a brush sets its id and its default width, but only while the user has
 * not changed the width from the kind's start width. Flip is kept only for a
 * one-sided brush. None clears the brush and the flip.
 */
export function brushStylePatch(kind: BrushKind, current: InkStyle, brushId: string | null): Partial<InkStyle> {
	if (brushId === null) return { brush: undefined, brushFlip: undefined };
	const brush = getBrush(brushId);
	if (!brush) return {};
	const patch: Partial<InkStyle> = {
		brush: brush.id,
		brushFlip: brush.oneSided ? current.brushFlip : undefined,
	};
	// Take the brush's own width and colour unless the user picked their own: a value still at the
	// tool's start value, or at the previous brush's default, counts as not chosen. So a River brush
	// draws blue straight away, and switching River to Cliff turns blue to brown.
	const previous = current.brush ? getBrush(current.brush) : undefined;
	const startStroke = (kind === 'area' ? DEFAULT_STYLE : DEFAULT_PATH_STYLE).stroke;
	const width = brush.defaultStyle.strokeWidth;
	if (width !== undefined && (current.strokeWidth === startWidth(kind) || current.strokeWidth === previous?.defaultStyle.strokeWidth)) {
		patch.strokeWidth = width;
	}
	const stroke = brush.defaultStyle.stroke;
	if (stroke !== undefined && (current.stroke === startStroke || current.stroke === previous?.defaultStyle.stroke)) {
		patch.stroke = stroke;
	}
	return patch;
}

function matchesBrush(brush: InkBrush, query: string): boolean {
	const q = query.toLowerCase();
	return brush.name.toLowerCase().includes(q)
		|| brush.keywords.some(k => k.toLowerCase().includes(q))
		|| brush.description.toLowerCase().includes(q);
}

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
	private readonly brushFlyout: HTMLElement;
	private readonly brushSearch: HTMLInputElement;
	private readonly brushScroll: HTMLElement;
	private brushButtons: Array<{ id: string | null; button: HTMLButtonElement }> = [];
	private symbolButtons: Array<{ id: string; button: HTMLButtonElement }> = [];
	private query = '';
	private brushQuery = '';
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

		this.brushFlyout = makeEl(doc, 'div', 'ink-brush-flyout', {
			role: 'dialog',
			'aria-label': 'Choose a brush',
		});
		this.brushFlyout.hidden = true;
		this.brushSearch = makeEl(doc, 'input', 'ink-brush-search', {
			type: 'search',
			'aria-label': 'Search brushes',
			placeholder: 'Search brushes',
			autocomplete: 'off',
		});
		this.brushSearch.addEventListener('input', () => {
			this.brushQuery = this.brushSearch.value.trim();
			this.renderBrushes();
		});
		this.brushFlyout.appendChild(this.brushSearch);
		this.brushScroll = makeEl(doc, 'div', 'ink-brush-scroll');
		this.brushFlyout.appendChild(this.brushScroll);
		this.el.appendChild(this.brushFlyout);
		this.renderBrushes();

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
		this.brushFlyout.hidden = BRUSH_KIND[tool] === undefined;
		this.syncBrushes();
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

	private renderBrushes(): void {
		this.brushScroll.replaceChildren();
		this.brushButtons = [];
		this.brushScroll.appendChild(this.brushOption(null, 'None', 'No brush'));
		const query = this.brushQuery;
		if (query) {
			const found = BRUSHES.filter(brush => matchesBrush(brush, query));
			if (found.length === 0) {
				const none = makeEl(this.doc, 'p', 'ink-brush-empty');
				none.textContent = `No brushes match "${query}".`;
				this.brushScroll.appendChild(none);
			} else {
				for (const brush of found) this.brushScroll.appendChild(this.brushOption(brush.id, brush.name, brush.name));
			}
		} else {
			for (const group of brushesByCategory()) {
				if (group.brushes.length === 0) continue;
				const heading = makeEl(this.doc, 'h4', 'ink-brush-heading');
				heading.textContent = group.name;
				this.brushScroll.appendChild(heading);
				for (const brush of group.brushes) this.brushScroll.appendChild(this.brushOption(brush.id, brush.name, brush.name));
			}
		}
		this.syncBrushes();
	}

	/** One row of the brush list: a thumbnail and the name. `id` null is None. */
	private brushOption(id: string | null, name: string, label: string): HTMLButtonElement {
		const btn = makeEl(this.doc, 'button', 'ink-brush-btn', {
			type: 'button',
			'aria-label': label,
			title: label,
			'data-brush': id ?? 'none',
		});
		if (id === null) {
			btn.classList.add('ink-brush-none');
		} else {
			const thumb = makeEl(this.doc, 'span', 'ink-brush-thumb');
			thumb.innerHTML = brushPreviewSvg(id, { width: 56, height: 16, color: 'currentColor' });
			btn.appendChild(thumb);
		}
		const text = makeEl(this.doc, 'span', 'ink-brush-name');
		text.textContent = name;
		btn.appendChild(text);
		btn.addEventListener('click', () => this.pickBrush(id));
		this.brushButtons.push({ id, button: btn });
		return btn;
	}

	/** Sets the brush for the active tool's kind. Does nothing for other tools. */
	private pickBrush(id: string | null): void {
		const kind = BRUSH_KIND[this.store.tool];
		if (!kind) return;
		this.store.setCurrentStyle(brushStylePatch(kind, this.store.currentStyle(kind), id));
	}

	private syncBrushes(): void {
		const kind = BRUSH_KIND[this.store.tool];
		const current = kind ? this.store.currentStyle(kind).brush : undefined;
		for (const { id, button } of this.brushButtons) {
			const active = id === null ? current === undefined : id === current;
			button.setAttribute('aria-pressed', String(active));
			button.classList.toggle('ink-brush-active', active);
		}
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
