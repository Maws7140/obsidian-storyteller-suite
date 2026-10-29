/**
 * Layers panel tests for Map Ink. The panel is driven through a fake store and a
 * fake host, and the store calls are asserted.
 *
 * No DOM library is installed in node_modules (no jsdom or happy-dom), so this
 * file carries the same small fake DOM as test/ink/ui.test.ts: elements,
 * attributes, classes, listeners with bubbling, and a document with an
 * activeElement, plus a rect and select() for drag and rename.
 */
import { describe, expect, it, vi } from 'vitest';
import { InkLayersPanel } from '../../src/leaflet/ink/InkLayersPanel';
import type { InkLayerStoreLike } from '../../src/leaflet/ink/layerOps';
import { defaultInkDoc } from '../../src/leaflet/ink/model';
import type { InkDoc, InkItem } from '../../src/leaflet/ink/model';
import type { InkHost } from '../../src/leaflet/ink/host';
import type { InkToolId } from '../../src/leaflet/ink/storeTypes';
import { addLayer, deleteLayer, moveLayer, renameLayer, setLayerLocked, setLayerVisible } from '../../src/leaflet/ink/layerOps';

// ---- fake DOM ----------------------------------------------------------------

interface FakeEventInit { key?: string; [k: string]: unknown }

class FakeEvent {
	type: string;
	target: FakeElement;
	currentTarget: FakeElement | null = null;
	key?: string;
	defaultPrevented = false;
	propagationStopped = false;
	constructor(type: string, target: FakeElement, init: FakeEventInit) {
		this.type = type;
		this.target = target;
		Object.assign(this, init);
	}
	preventDefault(): void { this.defaultPrevented = true; }
	stopPropagation(): void { this.propagationStopped = true; }
}

type Listener = (event: FakeEvent) => void;

class FakeElement {
	readonly tagName: string;
	ownerDocument!: FakeDocument;
	parentNode: FakeElement | null = null;
	children: FakeElement[] = [];
	classes = new Set<string>();
	style: Record<string, string> = {};
	value = '';
	checked = false;
	indeterminate = false;
	disabled = false;
	hidden = false;
	private attributes = new Map<string, string>();
	private listeners = new Map<string, Listener[]>();
	private text = '';
	private html = '';

	constructor(doc: FakeDocument | null, tag: string) {
		this.ownerDocument = doc as FakeDocument;
		this.tagName = tag.toUpperCase();
	}

	get className(): string { return Array.from(this.classes).join(' '); }
	set className(value: string) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }

	readonly classList = {
		add: (...names: string[]): void => { for (const n of names) this.classes.add(n); },
		remove: (...names: string[]): void => { for (const n of names) this.classes.delete(n); },
		toggle: (name: string, force?: boolean): boolean => {
			const on = force ?? !this.classes.has(name);
			if (on) this.classes.add(name);
			else this.classes.delete(name);
			return on;
		},
		contains: (name: string): boolean => this.classes.has(name),
	};

	get textContent(): string { return this.text; }
	set textContent(value: string) { this.text = String(value); }
	get innerHTML(): string { return this.html; }
	set innerHTML(value: string) {
		this.html = value;
		for (const child of this.children) child.parentNode = null;
		this.children = [];
	}

	setAttribute(name: string, value: string): void { this.attributes.set(name, String(value)); }
	getAttribute(name: string): string | null { return this.attributes.has(name) ? (this.attributes.get(name) as string) : null; }

	appendChild<T extends FakeElement>(child: T): T {
		child.parentNode?.removeChild(child);
		child.parentNode = this;
		this.children.push(child);
		return child;
	}
	removeChild<T extends FakeElement>(child: T): T {
		const index = this.children.indexOf(child);
		if (index >= 0) {
			this.children.splice(index, 1);
			child.parentNode = null;
		}
		return child;
	}
	remove(): void { this.parentNode?.removeChild(this); }
	replaceChildren(...nodes: FakeElement[]): void {
		for (const child of this.children) child.parentNode = null;
		this.children = [];
		for (const node of nodes) this.appendChild(node);
	}
	contains(node: FakeElement | null): boolean {
		for (let n: FakeElement | null = node; n; n = n.parentNode) if (n === this) return true;
		return false;
	}
	focus(): void { this.ownerDocument.activeElement = this; }
	select(): void { this.selected = true; }
	selected = false;
	/** Set by a test to place the element; used by the layer panel's drag reordering. */
	rect: { top: number; bottom: number; left: number; right: number } | null = null;
	getBoundingClientRect(): { top: number; bottom: number; left: number; right: number; height: number; width: number } {
		const r = this.rect ?? { top: 0, bottom: 0, left: 0, right: 0 };
		return { ...r, height: r.bottom - r.top, width: r.right - r.left };
	}
	setPointerCapture(_id: number): void { /* no-op in the fake */ }

	addEventListener(type: string, fn: Listener): void {
		const list = this.listeners.get(type) ?? [];
		list.push(fn);
		this.listeners.set(type, list);
	}
	removeEventListener(type: string, fn: Listener): void {
		const list = this.listeners.get(type);
		if (list) this.listeners.set(type, list.filter(l => l !== fn));
	}

	/** Fires an event that bubbles up through the parents, as a browser would. A disabled button ignores clicks. */
	dispatch(type: string, init: FakeEventInit = {}): FakeEvent {
		const event = new FakeEvent(type, this, init);
		if (this.disabled && type === 'click') return event;
		for (let node: FakeElement | null = this; node && !event.propagationStopped; node = node.parentNode) {
			event.currentTarget = node;
			for (const fn of [...(node.listeners.get(type) ?? [])]) fn(event);
		}
		return event;
	}
}

class FakeDocument extends FakeElement {
	activeElement: FakeElement | null = null;
	readonly body: FakeElement;
	constructor() {
		super(null, '#document');
		this.ownerDocument = this;
		this.body = this.appendChild(new FakeElement(this, 'body'));
	}
	createElement(tag: string): FakeElement { return new FakeElement(this, tag); }
	createElementNS(_ns: string, tag: string): FakeElement { return new FakeElement(this, tag); }
}

function matches(el: FakeElement, selector: string): boolean {
	const tag = /^[a-z][a-z0-9]*/i.exec(selector)?.[0];
	if (tag && el.tagName !== tag.toUpperCase()) return false;
	for (const m of selector.matchAll(/\.([\w-]+)/g)) if (!el.classes.has(m[1])) return false;
	for (const m of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
		const value = el.getAttribute(m[1]);
		if (value === null) return false;
		if (m[2] !== undefined && value !== m[2]) return false;
	}
	return true;
}

function queryAll(root: FakeElement, selector: string): FakeElement[] {
	const found: FakeElement[] = [];
	const walk = (node: FakeElement): void => {
		for (const child of node.children) {
			if (matches(child, selector)) found.push(child);
			walk(child);
		}
	};
	walk(root);
	return found;
}

function one(root: FakeElement, selector: string): FakeElement {
	const found = queryAll(root, selector);
	if (found.length === 0) throw new Error(`no element matches ${selector}`);
	return found[0];
}





// ---- fake store and host ---------------------------------------------------------

function stamp(id: string, layer: string): InkItem {
	return { id, kind: 'stamp', layer, scaleWithMap: true, at: [1, 2], symbol: 'tree', size: 24, rotation: 0, color: '#2b2b2b', opacity: 1 };
}

/**
 * A store that keeps real state. Mutations update the document and emit a change,
 * like InkStore does, so the panel is tested against the layer rules themselves.
 */
function makeStore(items: InkItem[] = []) {
	let doc: InkDoc = { ...defaultInkDoc(), items };
	let active = 'routes';
	const listeners: Array<() => void> = [];
	const emit = (): void => { for (const fn of [...listeners]) fn(); };
	const store = {
		get doc(): InkDoc { return doc; },
		selection: new Set<string>(),
		tool: 'select' as InkToolId,
		canUndo: false,
		canRedo: false,
		currentSymbol: vi.fn(() => 'tree'),
		recentColors: vi.fn((): string[] => []),
		currentStyle: vi.fn(),
		currentTextStyle: vi.fn(),
		setTool: vi.fn(),
		setCurrentStyle: vi.fn(),
		setCurrentTextStyle: vi.fn(),
		setCurrentSymbol: vi.fn(),
		updateSelected: vi.fn(),
		applyPresetToSelection: vi.fn(),
		deleteSelected: vi.fn(),
		bringForward: vi.fn(),
		sendBackward: vi.fn(),
		setSelectedLayer: vi.fn(),
		undo: vi.fn(),
		redo: vi.fn(),
		on: vi.fn((_event: 'change', fn: () => void) => {
			listeners.push(fn);
			return () => {
				const i = listeners.indexOf(fn);
				if (i >= 0) listeners.splice(i, 1);
			};
		}),
		addLayer: vi.fn((name: string) => {
			const out = addLayer(doc, name);
			doc = out.doc;
			emit();
			return out.id;
		}),
		renameLayer: vi.fn((id: string, name: string) => { doc = renameLayer(doc, id, name); emit(); }),
		moveLayer: vi.fn((id: string, toIndex: number) => { doc = moveLayer(doc, id, toIndex); emit(); }),
		setLayerVisible: vi.fn((id: string, visible: boolean) => { doc = setLayerVisible(doc, id, visible); emit(); }),
		setLayerLocked: vi.fn((id: string, locked: boolean) => { doc = setLayerLocked(doc, id, locked); emit(); }),
		deleteLayer: vi.fn((id: string) => { doc = deleteLayer(doc, id); emit(); }),
		activeLayer: vi.fn(() => active),
		setActiveLayer: vi.fn((id: string) => { active = id; emit(); }),
	};
	return store as typeof store & InkLayerStoreLike;
}

type FakeStore = ReturnType<typeof makeStore>;

function makeHost(confirmAnswer = true) {
	return {
		notify: vi.fn(),
		confirm: vi.fn(async () => confirmAnswer),
		showMenu: vi.fn(),
		icon: vi.fn((el: FakeElement, name: string) => { el.setAttribute('data-icon', name); }),
		pickLocation: vi.fn(async () => null),
		openLocation: vi.fn(),
		load: vi.fn(),
		save: vi.fn(async () => undefined),
		presets: vi.fn(() => []),
		savePreset: vi.fn(),
	};
}

function settle(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

function mount(store: FakeStore, host: InkHost) {
	const doc = new FakeDocument();
	const root = doc.createElement('div');
	doc.body.appendChild(root);
	const panel = new InkLayersPanel(root, store, host);
	return { doc, root, panel };
}

/** Rows as shown, top first. */
function rows(root: FakeElement): FakeElement[] {
	return queryAll(root, 'li.ink-layer-row');
}

/** A row's name: the name button, or the rename input's value while renaming. */
function nameOf(row: FakeElement): string {
	const button = queryAll(row, 'button.ink-layer-name')[0];
	if (button) return button.textContent;
	return one(row, 'input.ink-layer-rename').value;
}

function rowNames(root: FakeElement): string[] {
	return rows(root).map(nameOf);
}

function rowOf(root: FakeElement, name: string): FakeElement {
	const found = rows(root).find(row => nameOf(row) === name);
	if (!found) throw new Error(`no row for ${name}`);
	return found;
}

function iconOf(el: FakeElement): string | null {
	return one(el, 'span.ink-icon').getAttribute('data-icon');
}

/** Lays rows out so the top row is the first in the list, 30px each. */
function layOut(root: FakeElement): void {
	rows(root).forEach((row, i) => {
		row.rect = { top: i * 30, bottom: i * 30 + 30, left: 0, right: 200 };
	});
}

// ---- tests ------------------------------------------------------------------------

describe('InkLayersPanel: rows', () => {
	it('lists the layers top first, so the last layer is shown first', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		expect(rowNames(root)).toEqual(['Labels', 'Features', 'Routes', 'Terrain']);
	});

	it('shows the item count on each row', () => {
		const store = makeStore([stamp('a', 'features'), stamp('b', 'features'), stamp('c', 'labels')]);
		const { root } = mount(store, makeHost());
		expect(one(rowOf(root, 'Features'), '.ink-layer-count').textContent).toBe('2');
		expect(one(rowOf(root, 'Labels'), '.ink-layer-count').textContent).toBe('1');
		expect(one(rowOf(root, 'Terrain'), '.ink-layer-count').textContent).toBe('0');
	});

	it('uses the eye icons for visibility and the lock icons for lock state', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		expect(iconOf(one(rowOf(root, 'Terrain'), 'button.ink-layer-eye'))).toBe('eye');
		expect(iconOf(one(rowOf(root, 'Terrain'), 'button.ink-layer-lock'))).toBe('lock-open');
		store.setLayerVisible('terrain', false);
		store.setLayerLocked('terrain', true);
		expect(iconOf(one(rowOf(root, 'Terrain'), 'button.ink-layer-eye'))).toBe('eye-off');
		expect(iconOf(one(rowOf(root, 'Terrain'), 'button.ink-layer-lock'))).toBe('lock');
	});

	it('marks the active layer', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		const active = rows(root).filter(r => r.classes.has('ink-layer-active'));
		expect(active).toHaveLength(1);
		expect(one(active[0], '.ink-layer-name').textContent).toBe('Routes');
		expect(one(active[0], '.ink-layer-name').getAttribute('aria-current')).toBe('true');
	});

	it('gives every control an accessible label', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		const terrain = rowOf(root, 'Terrain');
		expect(one(terrain, 'button.ink-layer-eye').getAttribute('aria-label')).toBe('Hide layer Terrain');
		expect(one(terrain, 'button.ink-layer-lock').getAttribute('aria-label')).toBe('Lock layer Terrain');
		expect(one(terrain, 'button.ink-layer-handle').getAttribute('aria-label')).toBe('Reorder layer Terrain');
		expect(one(terrain, 'button.ink-layer-delete').getAttribute('aria-label')).toBe('Delete layer Terrain');
		expect(one(root, 'button.ink-layers-add').getAttribute('aria-label')).toBe('Add layer');
	});

	it('marks hidden layers', () => {
		const store = makeStore();
		store.setLayerVisible('labels', false);
		const { root } = mount(store, makeHost());
		expect(rowOf(root, 'Labels').classes.has('ink-layer-off')).toBe(true);
	});
});

describe('InkLayersPanel: toggles and activation', () => {
	it('toggles visibility through the store', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-eye').dispatch('click');
		expect(store.setLayerVisible).toHaveBeenCalledWith('features', false);
		expect(store.doc.layers.find(l => l.id === 'features')?.visible).toBe(false);
		expect(iconOf(one(rowOf(root, 'Features'), 'button.ink-layer-eye'))).toBe('eye-off');
	});

	it('toggles lock through the store', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Labels'), 'button.ink-layer-lock').dispatch('click');
		expect(store.setLayerLocked).toHaveBeenCalledWith('labels', true);
	});

	it('makes a layer active when its row is clicked', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		rowOf(root, 'Terrain').dispatch('click');
		expect(store.setActiveLayer).toHaveBeenCalledWith('terrain');
		expect(rowOf(root, 'Terrain').classes.has('ink-layer-active')).toBe(true);
	});

	it('makes a layer active when its name is clicked, without the click reaching the row', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Labels'), 'button.ink-layer-name').dispatch('click');
		expect(store.setActiveLayer).toHaveBeenCalledTimes(1);
		expect(store.setActiveLayer).toHaveBeenCalledWith('labels');
	});

	it('does not change the active layer when a control inside the row is clicked', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Terrain'), 'button.ink-layer-eye').dispatch('click');
		expect(store.setActiveLayer).not.toHaveBeenCalled();
	});
});

describe('InkLayersPanel: rename', () => {
	it('opens an input on double-click, with the current name', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-name').dispatch('dblclick');
		const input = one(root, 'input.ink-layer-rename');
		expect(input.value).toBe('Features');
		expect(input.selected).toBe(true);
	});

	it('opens the input on Enter from the name button', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-name').dispatch('keydown', { key: 'Enter' });
		expect(one(root, 'input.ink-layer-rename').value).toBe('Features');
	});

	it('commits the new name on Enter', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-name').dispatch('dblclick');
		const input = one(root, 'input.ink-layer-rename');
		input.value = '  Dungeon  ';
		input.dispatch('keydown', { key: 'Enter' });
		expect(store.renameLayer).toHaveBeenCalledWith('features', 'Dungeon');
		expect(rowNames(root)).toContain('Dungeon');
		expect(queryAll(root, 'input.ink-layer-rename')).toHaveLength(0);
	});

	it('cancels on Escape without renaming', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-name').dispatch('dblclick');
		const input = one(root, 'input.ink-layer-rename');
		input.value = 'Nope';
		input.dispatch('keydown', { key: 'Escape' });
		expect(store.renameLayer).not.toHaveBeenCalled();
		expect(rowNames(root)).toContain('Features');
		expect(queryAll(root, 'input.ink-layer-rename')).toHaveLength(0);
	});

	it('does not rename to a blank name', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-name').dispatch('dblclick');
		const input = one(root, 'input.ink-layer-rename');
		input.value = '   ';
		input.dispatch('keydown', { key: 'Enter' });
		expect(store.renameLayer).not.toHaveBeenCalled();
		expect(rowNames(root)).toContain('Features');
	});

	it('commits on blur, but does not commit twice when Escape is followed by blur', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-name').dispatch('dblclick');
		const input = one(root, 'input.ink-layer-rename');
		input.value = 'Dungeon';
		input.dispatch('blur');
		expect(store.renameLayer).toHaveBeenCalledTimes(1);
		expect(store.renameLayer).toHaveBeenCalledWith('features', 'Dungeon');

		store.renameLayer.mockClear();
		one(rowOf(root, 'Routes'), 'button.ink-layer-name').dispatch('dblclick');
		const second = one(root, 'input.ink-layer-rename');
		second.value = 'Roads';
		second.dispatch('keydown', { key: 'Escape' });
		second.dispatch('blur');
		expect(store.renameLayer).not.toHaveBeenCalled();
	});

	it('keeps keystrokes inside the rename input away from map shortcuts', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-name').dispatch('dblclick');
		const event = one(root, 'input.ink-layer-rename').dispatch('keydown', { key: 'Delete' });
		expect(event.propagationStopped).toBe(true);
	});
});

describe('InkLayersPanel: keyboard reordering', () => {
	it('moves the focused layer up with Alt+ArrowUp and keeps focus on it', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		const button = one(rowOf(root, 'Routes'), 'button.ink-layer-name');
		button.focus();
		button.dispatch('keydown', { key: 'ArrowUp', altKey: true });
		expect(store.moveLayer).toHaveBeenCalledWith('routes', 2);
		expect(rowNames(root)).toEqual(['Labels', 'Routes', 'Features', 'Terrain']);
		expect(root.ownerDocument.activeElement?.textContent).toBe('Routes');
	});

	it('moves the focused layer down with Alt+ArrowDown', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Routes'), 'button.ink-layer-handle').dispatch('keydown', { key: 'ArrowDown', altKey: true });
		expect(store.moveLayer).toHaveBeenCalledWith('routes', 0);
		expect(rowNames(root)).toEqual(['Labels', 'Features', 'Terrain', 'Routes']);
	});

	it('announces the new position', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Routes'), 'button.ink-layer-name').dispatch('keydown', { key: 'ArrowUp', altKey: true });
		expect(one(root, '[role="status"]').textContent).toBe('Routes moved to position 2 of 4.');
	});

	it('does nothing at the top or bottom and says so', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Labels'), 'button.ink-layer-name').dispatch('keydown', { key: 'ArrowUp', altKey: true });
		expect(store.moveLayer).not.toHaveBeenCalled();
		expect(one(root, '[role="status"]').textContent).toBe('Labels is already at the top.');
	});

	it('ignores arrow keys without Alt', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Routes'), 'button.ink-layer-name').dispatch('keydown', { key: 'ArrowUp' });
		expect(store.moveLayer).not.toHaveBeenCalled();
	});
});

describe('InkLayersPanel: drag to reorder', () => {
	function handleOf(root: FakeElement, name: string): FakeElement {
		return one(rowOf(root, name), 'button.ink-layer-handle');
	}

	it('drags the bottom layer to the top', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		layOut(root);
		const handle = handleOf(root, 'Terrain');
		handle.dispatch('pointerdown', { pointerId: 1, clientY: 105, button: 0 });
		handle.dispatch('pointermove', { pointerId: 1, clientY: 5 });
		handle.dispatch('pointerup', { pointerId: 1, clientY: 5 });
		expect(store.moveLayer).toHaveBeenCalledWith('terrain', 3);
		expect(rowNames(root)).toEqual(['Terrain', 'Labels', 'Features', 'Routes']);
	});

	it('drags the top layer to the bottom', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		layOut(root);
		const handle = handleOf(root, 'Labels');
		handle.dispatch('pointerdown', { pointerId: 2, clientY: 15, button: 0 });
		handle.dispatch('pointermove', { pointerId: 2, clientY: 140 });
		handle.dispatch('pointerup', { pointerId: 2, clientY: 140 });
		expect(store.moveLayer).toHaveBeenCalledWith('labels', 0);
		expect(rowNames(root)).toEqual(['Features', 'Routes', 'Terrain', 'Labels']);
	});

	it('does nothing when the layer is dropped where it already is', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		layOut(root);
		const handle = handleOf(root, 'Features');
		handle.dispatch('pointerdown', { pointerId: 3, clientY: 45, button: 0 });
		handle.dispatch('pointermove', { pointerId: 3, clientY: 50 });
		handle.dispatch('pointerup', { pointerId: 3, clientY: 50 });
		expect(store.moveLayer).not.toHaveBeenCalled();
	});

	it('treats a small movement as a click, not a reorder', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		layOut(root);
		const handle = handleOf(root, 'Terrain');
		handle.dispatch('pointerdown', { pointerId: 4, clientY: 105, button: 0 });
		handle.dispatch('pointermove', { pointerId: 4, clientY: 107 });
		handle.dispatch('pointerup', { pointerId: 4, clientY: 107 });
		expect(store.moveLayer).not.toHaveBeenCalled();
	});

	it('shows a drop indicator while dragging, and clears it on cancel', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		layOut(root);
		const handle = handleOf(root, 'Terrain');
		handle.dispatch('pointerdown', { pointerId: 5, clientY: 105, button: 0 });
		handle.dispatch('pointermove', { pointerId: 5, clientY: 5 });
		expect(rowOf(root, 'Terrain').classes.has('ink-layer-dragging')).toBe(true);
		expect(rowOf(root, 'Labels').classes.has('ink-layer-drop-before')).toBe(true);
		handle.dispatch('pointercancel', { pointerId: 5 });
		expect(rowOf(root, 'Terrain').classes.has('ink-layer-dragging')).toBe(false);
		expect(rowOf(root, 'Labels').classes.has('ink-layer-drop-before')).toBe(false);
		expect(store.moveLayer).not.toHaveBeenCalled();
	});

	it('ignores pointer moves from a different pointer', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		layOut(root);
		const handle = handleOf(root, 'Terrain');
		handle.dispatch('pointerdown', { pointerId: 6, clientY: 105, button: 0 });
		handle.dispatch('pointermove', { pointerId: 99, clientY: 40 });
		handle.dispatch('pointerup', { pointerId: 99, clientY: 40 });
		expect(store.moveLayer).not.toHaveBeenCalled();
	});
});

describe('InkLayersPanel: add and delete', () => {
	it('adds a layer on top, makes it active and starts renaming it', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(root, 'button.ink-layers-add').dispatch('click');
		expect(store.addLayer).toHaveBeenCalledWith('Layer 5');
		expect(store.setActiveLayer).toHaveBeenCalledWith('layer-layer-5');
		expect(rowNames(root)[0]).toBe('Layer 5');
		expect(one(root, 'input.ink-layer-rename').value).toBe('Layer 5');
	});

	it('asks before deleting, and deletes when the user agrees', async () => {
		const store = makeStore([stamp('a', 'features')]);
		const host = makeHost(true);
		const { root } = mount(store, host);
		one(rowOf(root, 'Features'), 'button.ink-layer-delete').dispatch('click');
		await settle();
		expect(host.confirm).toHaveBeenCalledWith('Delete the layer "Features"? Its 1 item will move to "Routes".');
		expect(store.deleteLayer).toHaveBeenCalledWith('features');
		expect(rowNames(root)).not.toContain('Features');
	});

	it('does not delete when the user cancels', async () => {
		const store = makeStore();
		const host = makeHost(false);
		const { root } = mount(store, host);
		one(rowOf(root, 'Features'), 'button.ink-layer-delete').dispatch('click');
		await settle();
		expect(host.confirm).toHaveBeenCalledTimes(1);
		expect(store.deleteLayer).not.toHaveBeenCalled();
		expect(rowNames(root)).toContain('Features');
	});

	it('uses a plain confirmation when the layer has no items', async () => {
		const store = makeStore();
		const host = makeHost(true);
		const { root } = mount(store, host);
		one(rowOf(root, 'Terrain'), 'button.ink-layer-delete').dispatch('click');
		await settle();
		expect(host.confirm).toHaveBeenCalledWith('Delete the layer "Terrain"?');
	});

	it('disables delete when only one layer is left', () => {
		const store = makeStore();
		store.deleteLayer('terrain');
		store.deleteLayer('routes');
		store.deleteLayer('features');
		const { root } = mount(store, makeHost());
		expect(rowNames(root)).toEqual(['Labels']);
		expect(one(root, 'button.ink-layer-delete').disabled).toBe(true);
	});
});

describe('InkLayersPanel: store changes and lifecycle', () => {
	it('redraws when the store changes from outside the panel', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		store.renameLayer('terrain', 'Ground');
		expect(rowNames(root)).toContain('Ground');
	});

	it('does not rebuild the list while a rename is open, so typed text survives', () => {
		const store = makeStore();
		const { root } = mount(store, makeHost());
		one(rowOf(root, 'Features'), 'button.ink-layer-name').dispatch('dblclick');
		const input = one(root, 'input.ink-layer-rename');
		input.value = 'Dun';
		store.setLayerVisible('terrain', false);
		expect(one(root, 'input.ink-layer-rename')).toBe(input);
		expect(input.value).toBe('Dun');
	});

	it('removes itself on destroy and stops redrawing from store changes', () => {
		const store = makeStore();
		const { panel, root } = mount(store, makeHost());
		panel.destroy();
		expect(queryAll(root, 'section.ink-layers')).toHaveLength(0);
		store.renameLayer('terrain', 'Ground');
		expect(queryAll(root, 'li.ink-layer-row')).toHaveLength(0);
	});
});
