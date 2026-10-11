/**
 * UI component tests for Map Ink: ColorPicker, StrokeStylePicker, InkToolbar and
 * InkInspector. Each control is driven through a fake store and a fake host and
 * the store calls are asserted.
 *
 * No DOM library is installed in node_modules (no jsdom or happy-dom), so this
 * file carries a small fake DOM with just the surface the UI uses: elements,
 * attributes, classes, listeners with bubbling, and a document with an
 * activeElement. Assertions use simple selectors (tag, .class, [attr] and
 * [attr="value"]).
 */
import { describe, expect, it, vi } from 'vitest';
import { ColorPicker, RECENT_LIMIT } from '../../src/leaflet/ink/ui/ColorPicker';
import type { ColorPickerOptions } from '../../src/leaflet/ink/ui/ColorPicker';
import { StrokeStylePicker } from '../../src/leaflet/ink/ui/StrokeStylePicker';
import { InkToolbar, INK_TOOLS } from '../../src/leaflet/ink/InkToolbar';
import { InkInspector } from '../../src/leaflet/ink/InkInspector';
import type { InkHost } from '../../src/leaflet/ink/host';
import type { InkStoreLike, InkToolId } from '../../src/leaflet/ink/storeTypes';
import type { InkArea, InkItem, InkKind, InkPath, InkStamp, InkText } from '../../src/leaflet/ink/model';
import { defaultInkDoc } from '../../src/leaflet/ink/model';
import { DEFAULT_STYLE, DEFAULT_TEXT_STYLE, PRESETS, SWATCHES } from '../../src/leaflet/ink/styles';

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

/** The button whose visible name is `name`. Buttons hold an icon span and a label span. */
function buttonNamed(root: FakeElement, name: string): FakeElement {
	const found = queryAll(root, 'button').find(btn => btn.children.some(c => c.textContent === name));
	if (!found) throw new Error(`no button named ${name}`);
	return found;
}

/** The value readout next to a slider, which shares its parent. */
function outputOf(input: FakeElement): FakeElement {
	const out = input.parentNode?.children.find(c => c.classes.has('ink-range-value'));
	if (!out) throw new Error('no readout next to slider');
	return out;
}

function setup() {
	const doc = new FakeDocument();
	const root = doc.createElement('div');
	doc.body.appendChild(root);
	return { doc, root };
}

// ---- fakes for the store and host ----------------------------------------------

function makeStore(items: InkItem[] = [], selection: string[] = [], tool: InkToolId = 'select') {
	const listeners: Array<() => void> = [];
	const store = {
		doc: { version: 1, layers: defaultInkDoc().layers, items },
		selection: new Set(selection),
		tool,
		canUndo: false,
		canRedo: false,
		currentSymbol: vi.fn(() => 'tree'),
		recentColors: vi.fn((): string[] => ['#112233', '#445566']),
		currentStyle: vi.fn((_kind: InkKind) => ({ ...DEFAULT_STYLE })),
		currentTextStyle: vi.fn(() => ({ ...DEFAULT_TEXT_STYLE })),
		setTool: vi.fn((t: InkToolId) => { store.tool = t; }),
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
		/** Test helper: announces a store change to subscribers. */
		emit(): void { for (const fn of [...listeners]) fn(); },
	};
	return store;
}

type FakeStore = ReturnType<typeof makeStore>;

const CUSTOM_PRESET = { id: 'mine', name: 'My river', fits: 'path' as const, style: { stroke: '#123456' } };

function makeHost() {
	return {
		notify: vi.fn(),
		confirm: vi.fn(async () => true),
		showMenu: vi.fn(),
		icon: vi.fn((el: FakeElement, name: string) => { el.setAttribute('data-icon', name); }),
		pickLocation: vi.fn(async () => ({ id: 'loc-7', name: 'Mira' })),
		openLocation: vi.fn(),
		load: vi.fn(),
		save: vi.fn(async () => undefined),
		presets: vi.fn(() => [CUSTOM_PRESET]),
		savePreset: vi.fn(),
	};
}

type FakeHost = ReturnType<typeof makeHost>;

/** The patch function and coalesce key from the most recent updateSelected call. */
function lastUpdate(store: FakeStore): { apply: (item: InkItem) => InkItem; key: string | undefined } {
	const calls = store.updateSelected.mock.calls;
	const [fn, key] = calls[calls.length - 1] as [(item: InkItem) => InkItem, string | undefined];
	return { apply: fn, key };
}

function settle(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

const path1: InkPath = {
	id: 'p1', kind: 'path', layer: 'routes', scaleWithMap: true,
	points: [[0, 0], [1, 1]], style: { ...DEFAULT_STYLE, strokeWidth: 2 },
};
const path2: InkPath = {
	id: 'p2', kind: 'path', layer: 'routes', scaleWithMap: true,
	points: [[2, 2], [3, 3]], style: { ...DEFAULT_STYLE, strokeWidth: 5 },
};
const area1: InkArea = {
	id: 'a1', kind: 'area', layer: 'terrain', scaleWithMap: true,
	points: [[0, 0], [1, 0], [1, 1]],
	style: { ...DEFAULT_STYLE, fill: '#3b82c4', fillOpacity: 0.5, fillPattern: 'none' },
};
const text1: InkText = {
	id: 't1', kind: 'text', layer: 'labels', scaleWithMap: true,
	at: [0, 0], text: 'Mira', rotation: 0, style: { ...DEFAULT_TEXT_STYLE },
};
const stamp1: InkStamp = {
	id: 's1', kind: 'stamp', layer: 'features', scaleWithMap: true,
	at: [0, 0], symbol: 'tree', size: 32, rotation: 0, color: '#2e7d6b', opacity: 1,
};

// ---- ColorPicker -----------------------------------------------------------------

function colourPicker(overrides: Partial<ColorPickerOptions> = {}) {
	const { doc, root } = setup();
	const onChange = vi.fn();
	const picker = new ColorPicker(root, {
		label: 'Stroke colour',
		color: '#3b82c4',
		opacity: 0.5,
		onChange,
		...overrides,
	});
	const trigger = one(root, '.ink-color-trigger');
	const popover = one(root, '.ink-popover');
	return { doc, root, picker, onChange, trigger, popover };
}

describe('ColorPicker', () => {
	it('opens from the trigger, shows the colour, and closes on a second click', () => {
		const { trigger, popover, root } = colourPicker();
		expect(trigger.getAttribute('aria-label')).toBe('Stroke colour: #3b82c4');
		expect(popover.hidden).toBe(true);
		trigger.dispatch('click');
		expect(popover.hidden).toBe(false);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		trigger.dispatch('click');
		expect(popover.hidden).toBe(true);
		expect(queryAll(root, 'button.ink-swatch')).toHaveLength(SWATCHES.length);
	});

	it('a swatch click emits the colour with opacity unchanged', () => {
		const { trigger, onChange, root } = colourPicker();
		trigger.dispatch('click');
		one(root, `[aria-label="Use colour ${SWATCHES[0]}"]`).dispatch('click');
		expect(onChange).toHaveBeenCalledWith(SWATCHES[0], null);
	});

	it('shows at most eight recent colours and hides the row when there are none', () => {
		const recent = ['#101010', '#202020', '#303030', '#404040', '#505050', '#606060', '#707070', '#808080', '#909090', '#a0a0a0'];
		const { picker, root } = colourPicker({ recent });
		expect(RECENT_LIMIT).toBe(8);
		expect(one(root, '.ink-recent').children).toHaveLength(8);
		picker.update({ color: '#3b82c4', opacity: 0.5, recent: [] });
		expect(one(root, '.ink-recent').parentNode?.hidden).toBe(true);
	});

	it('a valid hex value commits on change, expanding three digits', () => {
		const { root, onChange } = colourPicker();
		const hex = one(root, '.ink-hex');
		hex.value = 'abc';
		hex.dispatch('change');
		expect(onChange).toHaveBeenCalledWith('#aabbcc', null);
	});

	it('an invalid hex value shows a hint and emits nothing', () => {
		const { root, onChange } = colourPicker();
		const hex = one(root, '.ink-hex');
		const hint = one(root, '.ink-hint');
		hex.value = 'zz';
		hex.dispatch('input');
		expect(hint.hidden).toBe(false);
		expect(hex.getAttribute('aria-invalid')).toBe('true');
		hex.dispatch('change');
		expect(onChange).not.toHaveBeenCalled();
	});

	it('Enter in the hex field commits the value', () => {
		const { root, onChange } = colourPicker();
		const hex = one(root, '.ink-hex');
		hex.value = '#112233';
		hex.dispatch('keydown', { key: 'Enter' });
		expect(onChange).toHaveBeenCalledWith('#112233', null);
	});

	it('the native colour input emits the picked colour', () => {
		const { root, onChange } = colourPicker();
		const native = one(root, '.ink-native');
		native.value = '#ff8800';
		native.dispatch('input');
		expect(onChange).toHaveBeenCalledWith('#ff8800', null);
	});

	it('the opacity slider emits a fraction and shows a percentage', () => {
		const { root, onChange } = colourPicker();
		const range = one(root, '.ink-range');
		range.value = '40';
		range.dispatch('input');
		expect(onChange).toHaveBeenCalledWith(null, 0.4);
		expect(one(root, '.ink-range-value').textContent).toBe('40%');
	});

	it('the opacity row is hidden when showOpacity is false', () => {
		const { root } = colourPicker({ showOpacity: false });
		expect(one(root, '.ink-opacity-row').hidden).toBe(true);
	});

	it('"No colour" only appears when allowed, and emits none', () => {
		const without = colourPicker();
		expect(queryAll(without.root, '.ink-none-btn')).toHaveLength(0);

		const { root, onChange, trigger } = colourPicker({ allowNone: true });
		trigger.dispatch('click');
		one(root, '.ink-none-btn').dispatch('click');
		expect(onChange).toHaveBeenCalledWith('none', null);
		expect(one(root, '.ink-chip').classes.has('ink-chip-none')).toBe(true);
	});

	it('Escape closes the popover and returns focus to the trigger', () => {
		const { doc, trigger, popover } = colourPicker();
		trigger.dispatch('click');
		popover.dispatch('keydown', { key: 'Escape' });
		expect(popover.hidden).toBe(true);
		expect(doc.activeElement).toBe(trigger);
	});

	it('a pointerdown outside closes it, and one inside does not', () => {
		const { doc, root, trigger, popover } = colourPicker();
		trigger.dispatch('click');
		one(root, '.ink-swatch').dispatch('pointerdown');
		expect(popover.hidden).toBe(false);
		const outside = doc.createElement('button');
		doc.body.appendChild(outside);
		outside.dispatch('pointerdown');
		expect(popover.hidden).toBe(true);
	});

	it('mixed values show as Mixed and do not emit on refresh', () => {
		const { picker, root, onChange } = colourPicker();
		picker.update({ color: null, opacity: null });
		expect(one(root, '.ink-color-trigger').getAttribute('aria-label')).toBe('Stroke colour: Mixed');
		expect(one(root, '.ink-range-value').textContent).toBe('Mixed');
		expect(onChange).not.toHaveBeenCalled();
	});
});

// ---- StrokeStylePicker -----------------------------------------------------------

function strokePicker(dash: 'solid' | null = 'solid', width: number | null = 2) {
	const { doc, root } = setup();
	const onDashChange = vi.fn();
	const onWidthChange = vi.fn();
	const picker = new StrokeStylePicker(root, { dash, width, onDashChange, onWidthChange });
	return { doc, root, picker, onDashChange, onWidthChange, trigger: one(root, '.ink-dropdown-trigger') };
}

describe('StrokeStylePicker', () => {
	it('lists every dash style with an inline SVG preview', () => {
		const { root, trigger } = strokePicker();
		trigger.dispatch('click');
		const options = queryAll(root, '.ink-option');
		expect(options).toHaveLength(7);
		for (const option of options) expect(option.children[0].tagName).toBe('SVG');
		const dashed = one(root, '[data-dash="dashed"]');
		const paths = queryAll(dashed, 'path');
		expect(paths[0].getAttribute('stroke-dasharray')).toBe('7 4');
	});

	it('choosing a style emits it and closes the list', () => {
		const { root, trigger, onDashChange } = strokePicker();
		trigger.dispatch('click');
		one(root, '[data-dash="dashed"]').dispatch('click');
		expect(onDashChange).toHaveBeenCalledWith('dashed');
		expect(one(root, '.ink-listbox').hidden).toBe(true);
	});

	it('arrow keys move between styles and Escape closes the list', () => {
		const { doc, root, trigger } = strokePicker();
		trigger.dispatch('click');
		const options = queryAll(root, '.ink-option');
		options[0].dispatch('keydown', { key: 'ArrowDown' });
		expect(doc.activeElement).toBe(options[1]);
		options[1].dispatch('keydown', { key: 'ArrowUp' });
		expect(doc.activeElement).toBe(options[0]);
		options[0].dispatch('keydown', { key: 'Escape' });
		expect(one(root, '.ink-listbox').hidden).toBe(true);
	});

	it('the width slider emits the new width', () => {
		const { root, onWidthChange } = strokePicker();
		const range = one(root, '[aria-label="Line width"]');
		range.value = '4';
		range.dispatch('input');
		expect(onWidthChange).toHaveBeenCalledWith(4);
	});

	it('a mixed dash shows as Mixed', () => {
		const { picker, root } = strokePicker();
		picker.update(null, null);
		expect(one(root, '.ink-dropdown-name').textContent).toBe('Mixed');
		expect(outputOf(one(root, '[aria-label="Line width"]')).textContent).toBe('Mixed');
	});
});

// ---- InkToolbar ------------------------------------------------------------------

function toolbar() {
	const { doc, root } = setup();
	const store = makeStore();
	const host = makeHost();
	const bar = new InkToolbar(root, store as unknown as InkStoreLike, host as unknown as InkHost);
	return { doc, root, store, host, bar };
}

describe('InkToolbar', () => {
	it('renders a button per tool with its name, shortcut and Lucide icon', () => {
		const { root, host } = toolbar();
		const tools = queryAll(root, 'button.ink-tool[data-tool]');
		expect(tools).toHaveLength(INK_TOOLS.length);
		expect(tools).toHaveLength(9);
		expect(one(root, '[data-tool="select"]').getAttribute('data-tooltip')).toBe('Select (V)');
		expect(one(root, '[data-tool="ellipse"]').getAttribute('aria-label')).toBe('Ellipse (E)');
		const icons = host.icon.mock.calls.map(call => call[1]);
		for (const name of ['mouse-pointer-2', 'hand', 'stamp', 'type', 'spline', 'pentagon', 'pen-tool', 'square', 'circle', 'undo-2', 'redo-2']) {
			expect(icons).toContain(name);
		}
	});

	it('clicking a tool arms it, and the active tool is marked', () => {
		const { root, store } = toolbar();
		one(root, '[data-tool="path"]').dispatch('click');
		expect(store.setTool).toHaveBeenCalledWith('path');
		store.tool = 'path';
		store.emit();
		const path = one(root, '[data-tool="path"]');
		expect(path.getAttribute('aria-pressed')).toBe('true');
		expect(path.classes.has('ink-tool-active')).toBe(true);
		expect(one(root, '[data-tool="select"]').getAttribute('aria-pressed')).toBe('false');
	});

	it('undo and redo follow the store and do nothing while disabled', () => {
		const { root, store } = toolbar();
		const undo = one(root, '[aria-label="Undo (Ctrl+Z)"]');
		expect(undo.disabled).toBe(true);
		undo.dispatch('click');
		expect(store.undo).not.toHaveBeenCalled();
		store.canUndo = true;
		store.emit();
		expect(undo.disabled).toBe(false);
		undo.dispatch('click');
		expect(store.undo).toHaveBeenCalledTimes(1);
		one(root, '[aria-label="Redo (Ctrl+Shift+Z)"]').dispatch('click');
		expect(store.redo).not.toHaveBeenCalled();
	});

	it('the stamp flyout opens only for the Stamp tool', () => {
		const { root, store } = toolbar();
		const flyout = one(root, '.ink-stamp-flyout');
		expect(flyout.hidden).toBe(true);
		store.tool = 'stamp';
		store.emit();
		expect(flyout.hidden).toBe(false);
		store.tool = 'path';
		store.emit();
		expect(flyout.hidden).toBe(true);
	});

	it('searching stamps filters the grid and a click sets the symbol', () => {
		const { root, store } = toolbar();
		store.tool = 'stamp';
		store.emit();
		const total = queryAll(root, 'button.ink-stamp-btn').length;
		const search = one(root, '[aria-label="Search stamps"]');
		search.value = 'tree';
		search.dispatch('input');
		const found = queryAll(root, 'button.ink-stamp-btn').map(b => b.getAttribute('data-symbol'));
		expect(found).toContain('tree');
		expect(found.length).toBeLessThan(total);
		one(root, '[data-symbol="pine"]').dispatch('click');
		expect(store.setCurrentSymbol).toHaveBeenCalledWith('pine');
	});

	it('a search with no matches says so', () => {
		const { root } = toolbar();
		const search = one(root, '[aria-label="Search stamps"]');
		search.value = 'zzqqxx';
		search.dispatch('input');
		expect(one(root, '.ink-hint').textContent).toContain('No stamps match');
	});

	it('the current stamp is marked pressed and its svg carries the symbol id', () => {
		const { root } = toolbar();
		const tree = one(root, '[data-symbol="tree"]');
		expect(tree.getAttribute('aria-pressed')).toBe('true');
		expect(tree.innerHTML).toContain('data-symbol="tree"');
	});
});

// ---- InkInspector ----------------------------------------------------------------

function inspector(items: InkItem[], selection: string[] = [], tool: InkToolId = 'select') {
	const { doc, root } = setup();
	const store = makeStore(items, selection, tool);
	const host = makeHost();
	const panel = new InkInspector(root, store as unknown as InkStoreLike, host as unknown as InkHost);
	return {
		doc,
		root,
		store,
		host,
		panel,
		byLabel: (label: string) => one(root, `[aria-label="${label}"]`),
		titles: () => queryAll(root, 'h3.ink-section-title').map(h => h.textContent),
	};
}

describe('InkInspector', () => {
	it('with nothing selected and the select tool, shows a hint and no sections', () => {
		const { root, titles } = inspector([]);
		expect(titles()).toEqual([]);
		expect(queryAll(root, '.ink-hint')[0].textContent).toContain('Select an item');
	});

	it('with a path selected, shows Stroke, Arrange, Link and Presets only', () => {
		const { titles } = inspector([path1], ['p1']);
		expect(titles()).toEqual(['Stroke', 'Arrange', 'Link', 'Presets']);
	});

	it('the stroke width slider writes one coalesced patch that sets the width', () => {
		const { byLabel, store } = inspector([path1, text1], ['p1', 't1']);
		const range = byLabel('Stroke width');
		range.value = '3';
		range.dispatch('input');
		range.value = '3.5';
		range.dispatch('input');
		expect(store.updateSelected).toHaveBeenCalledTimes(2);
		const { apply, key } = lastUpdate(store);
		expect(key).toBe('stroke-width');
		expect((apply(path1) as InkPath).style.strokeWidth).toBe(3.5);
		expect(apply(text1)).toBe(text1);
	});

	it('the dash dropdown writes the dash with no coalesce key', () => {
		const { root, store } = inspector([path1], ['p1']);
		one(root, '.ink-dropdown-trigger').dispatch('click');
		one(root, '[data-dash="wavy"]').dispatch('click');
		const { apply, key } = lastUpdate(store);
		expect(key).toBeUndefined();
		expect((apply(path1) as InkPath).style.dash).toBe('wavy');
	});

	it('mixed widths show blank, and editing sets one value for both', () => {
		const { byLabel, root, store } = inspector([path1, path2], ['p1', 'p2']);
		expect(outputOf(byLabel('Stroke width')).textContent).toBe('Mixed');
		const range = byLabel('Stroke width');
		range.value = '6';
		range.dispatch('input');
		const { apply } = lastUpdate(store);
		expect((apply(path1) as InkPath).style.strokeWidth).toBe(6);
		expect((apply(path2) as InkPath).style.strokeWidth).toBe(6);
	});

	it('the stroke colour swatch writes the colour under its own key', () => {
		const { root, store } = inspector([path1], ['p1']);
		one(root, '[aria-label="Stroke colour: #2b2b2b"]').dispatch('click');
		one(root, `[aria-label="Use colour ${SWATCHES[1]}"]`).dispatch('click');
		const { apply, key } = lastUpdate(store);
		expect(key).toBe('stroke-colour');
		expect((apply(path1) as InkPath).style.stroke).toBe(SWATCHES[1]);
	});

	it('the stroke opacity slider writes the opacity under its own key', () => {
		const { byLabel, store } = inspector([path1], ['p1']);
		const range = byLabel('Stroke colour opacity');
		range.value = '25';
		range.dispatch('input');
		const { apply, key } = lastUpdate(store);
		expect(key).toBe('stroke-opacity');
		expect((apply(path1) as InkPath).style.strokeOpacity).toBe(0.25);
	});

	it('smooth applies to paths, and arrows are hidden for areas', () => {
		const path = inspector([path1], ['p1']);
		const smooth = path.byLabel('Smooth curves') as FakeElement & { checked: boolean };
		smooth.checked = true;
		smooth.dispatch('change');
		const { apply } = lastUpdate(path.store);
		expect((apply(path1) as InkPath).style.smooth).toBe(true);
		expect(path.byLabel('Arrow at start').parentNode?.hidden).toBe(false);

		const area = inspector([area1], ['a1']);
		expect(area.byLabel('Arrow at start').parentNode?.hidden).toBe(true);
		expect(area.byLabel('Smooth curves').parentNode?.hidden).toBe(false);
	});

	it('an area shows Fill with No colour and symbol patterns from the nature set', () => {
		const { byLabel, root, store, titles } = inspector([area1], ['a1']);
		expect(titles()).toContain('Fill');
		const pattern = byLabel('Fill pattern');
		const values = pattern.children.map(c => c.getAttribute('value'));
		expect(values).toContain('symbol:tree');
		expect(values).toContain('hatch');

		one(root, '[aria-label="Fill colour: #3b82c4"]').dispatch('click');
		one(root, '.ink-none-btn').dispatch('click');
		const { apply, key } = lastUpdate(store);
		expect(key).toBe('fill-colour');
		expect((apply(area1) as InkArea).style.fill).toBe('none');

		pattern.value = 'symbol:tree';
		pattern.dispatch('change');
		const next = lastUpdate(store);
		expect((next.apply(area1) as InkArea).style.fillPattern).toBe('symbol:tree');
		expect(next.key).toBeUndefined();
	});

	it('the words box writes the text, and an empty value is ignored', () => {
		const { byLabel, store } = inspector([text1], ['t1']);
		const words = byLabel('Text content');
		expect(words.value).toBe('Mira');
		words.value = 'Hollow';
		words.dispatch('input');
		const { apply, key } = lastUpdate(store);
		expect(key).toBe('text-content');
		expect((apply(text1) as InkText).text).toBe('Hollow');
		const count = store.updateSelected.mock.calls.length;
		words.value = '   ';
		words.dispatch('input');
		expect(store.updateSelected.mock.calls.length).toBe(count);
	});

	it('bold writes a style change with no coalesce key', () => {
		const { byLabel, store } = inspector([text1], ['t1']);
		const bold = byLabel('Bold') as FakeElement & { checked: boolean };
		bold.checked = true;
		bold.dispatch('change');
		const { apply, key } = lastUpdate(store);
		expect(key).toBeUndefined();
		expect((apply(text1) as InkText).style.bold).toBe(true);
	});

	it('text size is clamped, and mixed sizes show blank', () => {
		const other: InkText = { ...text1, id: 't2', style: { ...DEFAULT_TEXT_STYLE, size: 20 } };
		const mixed = inspector([text1, other], ['t1', 't2']);
		expect(mixed.byLabel('Text size').value).toBe('');

		const { byLabel, store } = inspector([text1], ['t1']);
		const size = byLabel('Text size');
		size.value = '9999';
		size.dispatch('input');
		const { apply, key } = lastUpdate(store);
		expect(key).toBe('text-size');
		expect((apply(text1) as InkText).style.size).toBe(400);
	});

	it('the stamp symbol choice writes the symbol; with nothing selected it sets the default', () => {
		const placed = inspector([stamp1], ['s1']);
		const symbol = placed.byLabel('Stamp symbol');
		symbol.value = 'pine';
		symbol.dispatch('change');
		expect((lastUpdate(placed.store).apply(stamp1) as InkStamp).symbol).toBe('pine');

		const idle = inspector([], [], 'stamp');
		idle.byLabel('Stamp symbol').value = 'castle';
		idle.byLabel('Stamp symbol').dispatch('change');
		expect(idle.store.setCurrentSymbol).toHaveBeenCalledWith('castle');
		expect(idle.byLabel('Stamp size').parentNode?.hidden).toBe(true);
	});

	it('the stamp opacity slider writes a fraction', () => {
		const { byLabel, store } = inspector([stamp1], ['s1']);
		const range = byLabel('Stamp opacity');
		range.value = '50';
		range.dispatch('input');
		const { apply, key } = lastUpdate(store);
		expect(key).toBe('stamp-opacity');
		expect((apply(stamp1) as InkStamp).opacity).toBe(0.5);
	});

	it('bring forward and send backward call the store, and lock sets then clears the flag', () => {
		const { root, store, byLabel } = inspector([path1], ['p1']);
		buttonNamed(root, 'Bring forward').dispatch('click');
		buttonNamed(root, 'Send backward').dispatch('click');
		expect(store.bringForward).toHaveBeenCalledTimes(1);
		expect(store.sendBackward).toHaveBeenCalledTimes(1);

		const lock = byLabel('Lock item') as FakeElement & { checked: boolean };
		lock.checked = true;
		lock.dispatch('change');
		expect((lastUpdate(store).apply(path1)).locked).toBe(true);
		lock.checked = false;
		lock.dispatch('change');
		expect('locked' in lastUpdate(store).apply(path1)).toBe(false);
	});

	it('the layer choice calls setSelectedLayer', () => {
		const { byLabel, store } = inspector([path1], ['p1']);
		const layer = byLabel('Layer');
		layer.value = 'features';
		layer.dispatch('change');
		expect(store.setSelectedLayer).toHaveBeenCalledWith('features');
	});

	it('linking writes the location id, and unlinking removes it', async () => {
		const { root, store, host } = inspector([path1], ['p1']);
		buttonNamed(root, 'Link to location').dispatch('click');
		await settle();
		expect(host.pickLocation).toHaveBeenCalled();
		expect((lastUpdate(store).apply(path1)).locationId).toBe('loc-7');

		const linked: InkPath = { ...path1, locationId: 'loc-9' };
		const second = inspector([linked], ['p1']);
		expect(buttonNamed(second.root, 'Unlink').hidden).toBe(false);
		buttonNamed(second.root, 'Open location').dispatch('click');
		expect(second.host.openLocation).toHaveBeenCalledWith('loc-9');
		buttonNamed(second.root, 'Unlink').dispatch('click');
		expect('locationId' in lastUpdate(second.store).apply(linked)).toBe(false);
	});

	it('presets fit the selection: applying calls the store, saving creates a preset', () => {
		const { byLabel, root, store, host } = inspector([path1], ['p1']);
		const names = queryAll(root, 'button.ink-preset').map(b => b.textContent);
		expect(names).toContain('River');
		expect(names).toContain('My river');
		expect(names).not.toContain('Water');

		one(root, '[aria-label="Apply preset River"]').dispatch('click');
		expect(store.applyPresetToSelection).toHaveBeenCalledWith('river');

		byLabel('Preset name').value = 'Dark road';
		buttonNamed(root, 'Save as preset').dispatch('click');
		expect(host.savePreset).toHaveBeenCalledTimes(1);
		const saved = host.savePreset.mock.calls[0][0];
		expect(saved.name).toBe('Dark road');
		expect(saved.fits).toBe('path');
		expect(saved.style.stroke).toBe(path1.style.stroke);
		expect(host.notify).toHaveBeenCalledWith('Saved "Dark road" as a preset.');
	});

	it('saving needs a name and one kind of item', () => {
		const empty = inspector([path1], ['p1']);
		buttonNamed(empty.root, 'Save as preset').dispatch('click');
		expect(empty.host.savePreset).not.toHaveBeenCalled();
		expect(empty.host.notify).toHaveBeenCalledWith('Type a name for the preset first.');

		const mixed = inspector([path1, area1], ['p1', 'a1']);
		mixed.byLabel('Preset name').value = 'Both';
		buttonNamed(mixed.root, 'Save as preset').dispatch('click');
		expect(mixed.host.savePreset).not.toHaveBeenCalled();
		expect(mixed.host.notify).toHaveBeenCalledWith('Select items of one kind to save a preset.');
	});

	it('with the Path tool and nothing selected, width edits set the tool default', () => {
		const { byLabel, store } = inspector([], [], 'path');
		const range = byLabel('Stroke width');
		range.value = '4';
		range.dispatch('input');
		expect(store.setCurrentStyle).toHaveBeenCalledWith({ strokeWidth: 4 });
		expect(store.updateSelected).not.toHaveBeenCalled();
	});

	it('a store change without a selection change keeps the same controls', () => {
		const { byLabel, store } = inspector([path1], ['p1']);
		const before = byLabel('Stroke width');
		store.emit();
		expect(byLabel('Stroke width')).toBe(before);
	});

	it('changing the selection rebuilds the sections', () => {
		const { store, titles } = inspector([path1, text1], ['p1']);
		expect(titles()).not.toContain('Text');
		store.selection = new Set(['t1']);
		store.emit();
		expect(titles()).toContain('Text');
		expect(titles()).not.toContain('Stroke');
	});
});
