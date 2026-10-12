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
import { InkToolbar, INK_TOOLS, brushStylePatch } from '../../src/leaflet/ink/InkToolbar';
import { BRUSHES, brushesByCategory } from '../../src/leaflet/ink/brushes';
import { InkInspector } from '../../src/leaflet/ink/InkInspector';
import type { InkHost } from '../../src/leaflet/ink/host';
import type { InkStoreLike, InkToolId } from '../../src/leaflet/ink/storeTypes';
import type { InkArea, InkItem, InkKind, InkPath, InkStamp, InkText } from '../../src/leaflet/ink/model';
import { defaultInkDoc } from '../../src/leaflet/ink/model';
import type { InkBox } from '../../src/leaflet/ink/model';
import { DEFAULT_PATH_STYLE, DEFAULT_STYLE, DEFAULT_TEXT_STYLE, HAND_INKED_BRUSHES, HAND_INKED_FILLS, HAND_INKED_GROUP, INK_COLOUR, PRESETS, SWATCHES, withPatch } from '../../src/leaflet/ink/styles';

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
		one(root, '[aria-label="Stroke colour: #5b4a3a"]').dispatch('click');
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

// ---- brushes: toolbar flyout ------------------------------------------------------

const brushPath: InkPath = {
	id: 'bp', kind: 'path', layer: 'routes', scaleWithMap: true,
	points: [[0, 0], [1, 1]], style: { ...DEFAULT_STYLE, strokeWidth: 3, brush: 'cliff' },
};
const plainPath: InkPath = {
	id: 'pp', kind: 'path', layer: 'routes', scaleWithMap: true,
	points: [[0, 0], [1, 1]], style: { ...DEFAULT_STYLE, strokeWidth: 3 },
};
const rect1: InkBox = {
	id: 'r1', kind: 'rect', layer: 'terrain', scaleWithMap: true,
	a: [0, 0], b: [2, 2], rotation: 0, style: { ...DEFAULT_STYLE },
};

describe('brush width and flip rules', () => {
	it('a brush sets its default width only while the width is still the kind start width', () => {
		const path = { ...DEFAULT_PATH_STYLE };
		expect(brushStylePatch('path', path, 'wall')).toEqual({ brush: 'wall', brushFlip: undefined, strokeWidth: 4 });
		expect(brushStylePatch('freehand', { ...path, strokeWidth: 7 }, 'wall')).toEqual({ brush: 'wall', brushFlip: undefined });
		const area = { ...DEFAULT_STYLE };
		expect(brushStylePatch('area', area, 'wall').strokeWidth).toBe(4);
		expect(brushStylePatch('area', { ...area, strokeWidth: 5 }, 'wall')).not.toHaveProperty('strokeWidth');
	});

	it('None clears the brush and the flip', () => {
		expect(brushStylePatch('path', { ...DEFAULT_PATH_STYLE, brush: 'cliff', brushFlip: true }, null))
			.toEqual({ brush: undefined, brushFlip: undefined });
	});

	it('flip is kept only for a one-sided brush, and an unknown brush changes nothing', () => {
		const flipped = { ...DEFAULT_PATH_STYLE, brush: 'cliff', brushFlip: true };
		expect(brushStylePatch('path', flipped, 'cliff').brushFlip).toBe(true);
		expect(brushStylePatch('path', flipped, 'wall').brushFlip).toBeUndefined();
		expect(brushStylePatch('path', flipped, 'no-such-brush')).toEqual({});
	});

	it('withPatch removes a key set to undefined and keeps the rest', () => {
		const out = withPatch({ ...DEFAULT_STYLE, brush: 'cliff' }, { brush: undefined, strokeWidth: 9 });
		expect('brush' in out).toBe(false);
		expect(out.strokeWidth).toBe(9);
	});
});

describe('InkToolbar brush flyout', () => {
	it('opens only for the Path, Freehand and Area tools', () => {
		const { root, store } = toolbar();
		const flyout = one(root, '.ink-brush-flyout');
		expect(flyout.hidden).toBe(true);
		for (const tool of ['path', 'freehand', 'area'] as const) {
			store.tool = tool;
			store.emit();
			expect(flyout.hidden).toBe(false);
		}
		store.tool = 'stamp';
		store.emit();
		expect(flyout.hidden).toBe(true);
	});

	it('lists None first, then every brush under its category heading, each with a thumbnail', () => {
		const { root } = toolbar();
		const buttons = queryAll(root, 'button.ink-brush-btn');
		expect(buttons[0].getAttribute('data-brush')).toBe('none');
		expect(buttons[0].getAttribute('aria-label')).toBe('No brush');
		expect(buttons.map(b => b.getAttribute('data-brush')).slice(1)).toEqual(
			brushesByCategory().flatMap(g => g.brushes.map(b => b.id)),
		);
		expect(buttons.length).toBe(BRUSHES.length + 1);
		const headings = queryAll(root, 'h4.ink-brush-heading').map(h => h.textContent);
		expect(headings).toEqual(brushesByCategory().filter(g => g.brushes.length > 0).map(g => g.name));
		expect(one(root, '[data-brush="cliff"]').children[0].innerHTML).toContain('<svg');
		expect(one(root, '[data-brush="cliff"]').getAttribute('aria-label')).toBe('Cliff');
	});

	it('picking a brush sets it for the active tool; None clears it', () => {
		const { root, store } = toolbar();
		store.tool = 'freehand';
		store.emit();
		one(root, '[data-brush="cliff"]').dispatch('click');
		expect(store.setCurrentStyle).toHaveBeenLastCalledWith(expect.objectContaining({ brush: 'cliff' }));
		one(root, '[data-brush="none"]').dispatch('click');
		expect(store.setCurrentStyle).toHaveBeenLastCalledWith({ brush: undefined, brushFlip: undefined });
	});

	it('the brush in use is marked pressed; None is pressed when there is no brush', () => {
		const { root, store } = toolbar();
		store.tool = 'path';
		store.currentStyle.mockImplementation(() => ({ ...DEFAULT_STYLE, brush: 'wall' }));
		store.emit();
		expect(one(root, '[data-brush="wall"]').getAttribute('aria-pressed')).toBe('true');
		expect(one(root, '[data-brush="wall"]').classList.contains('ink-brush-active')).toBe(true);
		expect(one(root, '[data-brush="none"]').getAttribute('aria-pressed')).toBe('false');
		store.currentStyle.mockImplementation(() => ({ ...DEFAULT_STYLE }));
		store.emit();
		expect(one(root, '[data-brush="none"]').getAttribute('aria-pressed')).toBe('true');
	});

	it('search filters the brushes by name, and says so when none match', () => {
		const { root } = toolbar();
		const search = one(root, '[aria-label="Search brushes"]');
		search.value = 'river';
		search.dispatch('input');
		const found = queryAll(root, 'button.ink-brush-btn').map(b => b.getAttribute('data-brush'));
		expect(found).toContain('river');
		expect(found.length).toBeLessThan(BRUSHES.length + 1);
		expect(queryAll(root, 'h4.ink-brush-heading')).toHaveLength(0);
		search.value = 'zzqqxx';
		search.dispatch('input');
		expect(one(root, '.ink-brush-empty').textContent).toContain('No brushes match');
	});
});

// ---- brushes: inspector ------------------------------------------------------------

function optionValues(select: FakeElement): string[] {
	return queryAll(select, 'option').map(o => o.getAttribute('value') ?? '');
}

describe('InkInspector brush controls', () => {
	it('the Brush select lists None and the brushes, and shows the brush of the selection', () => {
		const { byLabel } = inspector([plainPath], ['pp']);
		const select = byLabel('Brush');
		expect(optionValues(select)).toEqual(['', 'none', ...brushesByCategory().flatMap(g => g.brushes.map(b => b.id))]);
		expect(select.value).toBe('none');
		const cliffPanel = inspector([brushPath], ['bp']);
		expect(cliffPanel.byLabel('Brush').value).toBe('cliff');
	});

	it('choosing a brush writes it, and None removes the brush key', () => {
		const { byLabel, store } = inspector([plainPath], ['pp']);
		const select = byLabel('Brush');
		select.value = 'wall';
		select.dispatch('change');
		expect((lastUpdate(store).apply(plainPath) as InkPath).style.brush).toBe('wall');

		const brushed = inspector([brushPath], ['bp']);
		brushed.byLabel('Brush').value = 'none';
		brushed.byLabel('Brush').dispatch('change');
		const cleared = lastUpdate(brushed.store).apply(brushPath) as InkPath;
		expect('brush' in cleared.style).toBe(false);
	});

	it('a mixed selection shows a blank brush', () => {
		const { byLabel } = inspector([brushPath, plainPath], ['bp', 'pp']);
		expect(byLabel('Brush').value).toBe('');
	});

	it('Flip side shows only for a one-sided brush and writes brushFlip', () => {
		const wall = inspector([{ ...brushPath, style: { ...brushPath.style, brush: 'wall' } }], ['bp']);
		expect(wall.byLabel('Flip side').parentNode?.hidden).toBe(true);

		const cliff = inspector([brushPath], ['bp']);
		const flip = cliff.byLabel('Flip side');
		expect(flip.parentNode?.hidden).toBe(false);
		flip.checked = true;
		flip.dispatch('change');
		expect((lastUpdate(cliff.store).apply(brushPath) as InkPath).style.brushFlip).toBe(true);
	});

	it('Brush scale shows only with a brush, is 0.5 to 3, and coalesces under brush-scale', () => {
		const none = inspector([plainPath], ['pp']);
		expect(none.byLabel('Brush scale').parentNode?.parentNode?.hidden).toBe(true);

		const { byLabel, store } = inspector([brushPath], ['bp']);
		const range = byLabel('Brush scale');
		expect(range.parentNode?.parentNode?.hidden).toBe(false);
		expect(range.getAttribute('min')).toBe('0.5');
		expect(range.getAttribute('max')).toBe('3');
		range.value = '1.5';
		range.dispatch('input');
		const { apply, key } = lastUpdate(store);
		expect(key).toBe('brush-scale');
		expect((apply(brushPath) as InkPath).style.brushScale).toBe(1.5);
	});

	it('the dash picker is disabled, with a hint, while a brush is set', () => {
		const dashTrigger = (root: FakeElement) => one(root, '.ink-dropdown-trigger');
		const hint = (root: FakeElement) => queryAll(root, 'p.ink-hint').find(p => p.textContent === 'Brush replaces the dash style');

		const branded = inspector([brushPath], ['bp']);
		expect(dashTrigger(branded.root).disabled).toBe(true);
		expect(hint(branded.root)?.hidden).toBe(false);

		const plain = inspector([plainPath], ['pp']);
		expect(dashTrigger(plain.root).disabled).toBe(false);
		expect(hint(plain.root)?.hidden).toBe(true);
	});

	it('brushes apply to areas and rectangles too', () => {
		const area = inspector([{ ...area1, style: { ...area1.style, brush: 'wall' } }], ['a1']);
		expect(area.titles()).toContain('Stroke');
		expect(area.byLabel('Brush').value).toBe('wall');
		const rect = inspector([rect1], ['r1']);
		expect(rect.byLabel('Brush')).toBeDefined();
		expect(rect.byLabel('Brush').value).toBe('none');
	});

	it('with the Path tool and nothing selected, choosing a brush sets the tool default', () => {
		const { byLabel, store } = inspector([], [], 'path');
		byLabel('Brush').value = 'river';
		byLabel('Brush').dispatch('change');
		expect(store.setCurrentStyle).toHaveBeenCalledWith({ brush: 'river' });
		expect(store.updateSelected).not.toHaveBeenCalled();
	});
});

// ---- hand-inked presets --------------------------------------------------------------

describe('hand-inked presets', () => {
	it('the pack has one line preset per planned brush and one terrain fill per symbol', () => {
		expect(HAND_INKED_BRUSHES).toHaveLength(25);
		expect(HAND_INKED_FILLS.map(f => f.symbol)).toEqual(['tree', 'hill', 'mountain', 'wave', 'reeds', 'dune']);
		const pack = PRESETS.filter(p => p.group === HAND_INKED_GROUP);
		expect(pack).toHaveLength(HAND_INKED_BRUSHES.length + HAND_INKED_FILLS.length);
		const ids = PRESETS.map(p => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const preset of pack) expect(preset.id.startsWith('ink-')).toBe(true);
	});

	it('line presets are monochrome ink with a brush; terrain fills are ink-only', () => {
		for (const { brush, width } of HAND_INKED_BRUSHES) {
			const preset = PRESETS.find(p => p.id === `ink-${brush}`);
			expect(preset?.fits).toBe('path');
			expect(preset?.style).toMatchObject({ stroke: INK_COLOUR, brush, strokeWidth: width });
		}
		for (const { symbol } of HAND_INKED_FILLS) {
			const preset = PRESETS.find(p => p.id === `ink-fill-${symbol}`);
			expect(preset?.fits).toBe('area');
			expect(preset?.style).toMatchObject({
				stroke: INK_COLOUR,
				fillOpacity: 0,
				fillPattern: `symbol:${symbol}`,
				patternColor: INK_COLOUR,
			});
		}
	});

	// Passes once W5a's brushes.ts lists the full set; the test-only stub has three.
	it.skipIf(BRUSHES.length < HAND_INKED_BRUSHES.length)('every hand-inked brush is a registered brush', () => {
		for (const { brush } of HAND_INKED_BRUSHES) {
			expect(BRUSHES.map(b => b.id)).toContain(brush);
		}
	});

	it('the inspector groups hand-inked presets under their heading', () => {
		const { root, store } = inspector([plainPath], ['pp']);
		const headings = queryAll(root, 'h4.ink-preset-heading').map(h => h.textContent);
		expect(headings).toEqual([HAND_INKED_GROUP]);
		one(root, '[aria-label="Apply preset Hand-inked: Cliff"]').dispatch('click');
		expect(store.applyPresetToSelection).toHaveBeenCalledWith('ink-cliff');
		// The plain River preset is still listed on its own.
		one(root, '[aria-label="Apply preset River"]').dispatch('click');
		expect(store.applyPresetToSelection).toHaveBeenLastCalledWith('river');
	});

	it('an area shows the terrain fills but no line presets', () => {
		const { root } = inspector([area1], ['a1']);
		const names = queryAll(root, 'button.ink-preset').map(b => b.textContent);
		expect(names).toEqual(expect.arrayContaining(['Trees', 'Hills', 'Water']));
		expect(names).not.toContain('Cliff');
	});
});
