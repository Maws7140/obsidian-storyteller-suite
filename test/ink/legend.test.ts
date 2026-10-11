/**
 * Legend tests for Map Ink. The legend is read-only, so it is tested with a
 * document and a fake host only, no store.
 *
 * No DOM library is installed in node_modules (no jsdom or happy-dom), so this
 * file carries the same small fake DOM as test/ink/ui.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { InkLegend, legendEntries } from '../../src/leaflet/ink/InkLegend';
import { defaultInkDoc } from '../../src/leaflet/ink/model';
import type { InkDoc, InkItem, InkStyle } from '../../src/leaflet/ink/model';
import { DEFAULT_STYLE, PRESETS, findPreset } from '../../src/leaflet/ink/styles';
import { getSymbol } from '../../src/leaflet/ink/symbols';

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






// ---- helpers ----------------------------------------------------------------------

function stamp(id: string, symbol: string, color: string, layer = 'features'): InkItem {
	return { id, kind: 'stamp', layer, scaleWithMap: true, at: [1, 2], symbol, size: 24, rotation: 0, color, opacity: 1 };
}

function pathItem(id: string, style: InkStyle, layer = 'routes'): InkItem {
	return { id, kind: 'path', layer, scaleWithMap: true, points: [[1, 2], [3, 4]], style };
}

function areaItem(id: string, style: InkStyle, layer = 'terrain'): InkItem {
	return { id, kind: 'area', layer, scaleWithMap: true, points: [[1, 2], [3, 4], [5, 1]], style };
}

function withStyle(preset: string): InkStyle {
	const p = findPreset(preset);
	if (!p || !p.style) throw new Error(`no preset ${preset}`);
	return { ...DEFAULT_STYLE, ...p.style };
}

function docOf(items: InkItem[], hideLayers: string[] = []): InkDoc {
	const base = defaultInkDoc();
	return {
		...base,
		layers: base.layers.map(l => (hideLayers.includes(l.id) ? { ...l, visible: false } : l)),
		items,
	};
}

function makeHost(presets: Array<{ id: string; name: string; fits: 'path' | 'area'; style: Partial<InkStyle> }> = []) {
	return {
		notify: vi.fn(),
		confirm: vi.fn(async () => true),
		showMenu: vi.fn(),
		icon: vi.fn((el: FakeElement, name: string) => { el.setAttribute('data-icon', name); }),
		pickLocation: vi.fn(async () => null),
		openLocation: vi.fn(),
		load: vi.fn(),
		save: vi.fn(async () => undefined),
		presets: vi.fn(() => presets),
		savePreset: vi.fn(),
	};
}

function mount(host = makeHost()) {
	const doc = new FakeDocument();
	const container = doc.createElement('div');
	doc.body.appendChild(container);
	const legend = new InkLegend(container, host, {});
	return { doc, container, legend, host };
}

function toggleOf(container: FakeElement): FakeElement {
	return one(container, 'button.ink-legend-toggle');
}

function panelOf(container: FakeElement): FakeElement {
	return one(container, 'div.ink-legend-panel');
}

/** Each row as [name, count text or '', swatch markup]. */
function rowsOf(container: FakeElement): Array<[string, string, string]> {
	return queryAll(container, 'li.ink-legend-row').map(row => [
		one(row, '.ink-legend-name').textContent,
		queryAll(row, '.ink-legend-count')[0]?.textContent ?? '',
		one(row, '.ink-legend-swatch').innerHTML,
	]);
}

function namesOf(container: FakeElement): string[] {
	return rowsOf(container).map(r => r[0]);
}

function headings(container: FakeElement): string[] {
	return queryAll(container, '.ink-legend-heading').map(h => h.textContent);
}

// ---- tests ------------------------------------------------------------------------

describe('InkLegend: toggle and panel', () => {
	it('shows a Legend toggle at the bottom right of the container, closed by default', () => {
		const { container } = mount();
		const toggle = toggleOf(container);
		expect(one(toggle, 'span.ink-legend-toggle-label').textContent).toBe('Legend');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(panelOf(container).hidden).toBe(true);
	});

	it('opens and closes the panel when the toggle is clicked', () => {
		const { container } = mount();
		toggleOf(container).dispatch('click');
		expect(panelOf(container).hidden).toBe(false);
		expect(toggleOf(container).getAttribute('aria-expanded')).toBe('true');
		toggleOf(container).dispatch('click');
		expect(panelOf(container).hidden).toBe(true);
	});

	it('uses the title option for the toggle and the heading', () => {
		const doc = new FakeDocument();
		const container = doc.createElement('div');
		doc.body.appendChild(container);
		new InkLegend(container, makeHost(), { title: 'Key' });
		expect(one(toggleOf(container), 'span.ink-legend-toggle-label').textContent).toBe('Key');
		expect(one(panelOf(container), '.ink-legend-title').textContent).toBe('Key');
	});

	it('closes on Escape and returns focus to the toggle', () => {
		const { container } = mount();
		toggleOf(container).dispatch('click');
		panelOf(container).dispatch('keydown', { key: 'Escape' });
		expect(panelOf(container).hidden).toBe(true);
		expect(container.ownerDocument.activeElement).toBe(toggleOf(container));
	});

	it('closes when the user clicks outside the legend', () => {
		const { container, doc } = mount();
		toggleOf(container).dispatch('click');
		const outside = doc.createElement('div');
		doc.body.appendChild(outside);
		outside.dispatch('pointerdown');
		expect(panelOf(container).hidden).toBe(true);
	});

	it('stays open when the user clicks inside the legend', () => {
		const { container } = mount();
		toggleOf(container).dispatch('click');
		one(container, '.ink-legend-title').dispatch('pointerdown');
		expect(panelOf(container).hidden).toBe(false);
	});

	it('stops click, double-click, pointer and wheel events from reaching the map', () => {
		const { container } = mount();
		const mapClick = vi.fn();
		const mapWheel = vi.fn();
		const mapDown = vi.fn();
		container.addEventListener('click', mapClick);
		container.addEventListener('wheel', mapWheel);
		container.addEventListener('pointerdown', mapDown);
		toggleOf(container).dispatch('click');
		one(container, '.ink-legend-title').dispatch('wheel');
		one(container, '.ink-legend-title').dispatch('pointerdown');
		one(container, '.ink-legend-title').dispatch('dblclick');
		expect(mapClick).not.toHaveBeenCalled();
		expect(mapWheel).not.toHaveBeenCalled();
		expect(mapDown).not.toHaveBeenCalled();
	});

	it('removes itself on destroy, and ignores later calls', () => {
		const { container, doc, legend } = mount();
		legend.destroy();
		expect(queryAll(container, 'div.ink-legend')).toHaveLength(0);
		expect(() => legend.destroy()).not.toThrow();
		expect(() => legend.setDoc(docOf([]))).not.toThrow();
		// After destroy an outside click must not reach the removed legend.
		const outside = doc.createElement('div');
		doc.body.appendChild(outside);
		expect(() => outside.dispatch('pointerdown')).not.toThrow();
	});
});

describe('InkLegend: empty state', () => {
	it('says nothing is drawn before any document is set', () => {
		const { container } = mount();
		expect(one(container, 'p.ink-legend-empty').textContent).toBe('Nothing drawn yet.');
	});

	it('says nothing is drawn when every item is on a hidden layer', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([stamp('s1', 'tree', '#2b2b2b', 'features')], ['features']));
		expect(one(container, 'p.ink-legend-empty').textContent).toBe('Nothing drawn yet.');
	});
});

describe('InkLegend: stamps', () => {
	it('groups stamps by symbol and colour, with a count when there are several', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([
			stamp('a', 'tree', '#2b2b2b'),
			stamp('b', 'tree', '#2b2b2b'),
			stamp('c', 'tree', '#2b2b2b'),
			stamp('d', 'tree', '#b03a2e'),
			stamp('e', 'door', '#2b2b2b'),
		]));
		expect(headings(container)).toEqual(['Symbols']);
		const rows = rowsOf(container);
		expect(rows.map(r => [r[0], r[1]])).toEqual([
			['Door', ''],
			['Tree', '\u00d73'],
			['Tree', ''],
		]);
	});

	it('draws each symbol with symbolSvg in the item colour', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([stamp('a', 'tree', '#b03a2e')]));
		const swatch = rowsOf(container)[0][2];
		expect(swatch).toContain('data-symbol="tree"');
		expect(swatch).toContain('color="#b03a2e"');
		expect(swatch).toContain('<svg');
	});

	it('takes the name from the symbol library', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([stamp('a', 'tree', '#2b2b2b')]));
		expect(namesOf(container)).toEqual([getSymbol('tree')?.name]);
	});

	it('skips stamps with an unknown symbol id', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([stamp('a', 'no-such-symbol', '#2b2b2b')]));
		expect(queryAll(container, 'li.ink-legend-row')).toHaveLength(0);
	});

	it('skips items on hidden layers and items flagged hidden', () => {
		const { container, legend } = mount();
		const flagged: InkItem = { ...stamp('f', 'door', '#2b2b2b', 'labels'), hidden: true };
		legend.setDoc(docOf([
			stamp('a', 'tree', '#2b2b2b', 'features'),
			stamp('b', 'door', '#2b2b2b', 'labels'),
			flagged,
		], ['features']));
		// The tree is on a hidden layer, and the flagged door does not add to the visible door.
		expect(rowsOf(container).map(r => [r[0], r[1]])).toEqual([['Door', '']]);
	});
});

describe('InkLegend: lines and areas', () => {
	it('names a path by the preset its style matches', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([pathItem('p1', withStyle('river')), pathItem('p2', withStyle('river'))]));
		expect(headings(container)).toEqual(['Lines']);
		expect(rowsOf(container).map(r => [r[0], r[1]])).toEqual([['River', '\u00d72']]);
	});

	it('names an area by the preset its style matches', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([areaItem('a1', withStyle('water'))]));
		expect(headings(container)).toEqual(['Areas']);
		expect(namesOf(container)).toEqual(['Water']);
	});

	it('does not match a preset of the other kind', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([areaItem('a1', withStyle('river'))]));
		expect(namesOf(container)).toEqual(['Custom area']);
	});

	it('uses Custom line and Custom area for styles no preset matches', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([
			pathItem('p1', { ...DEFAULT_STYLE, stroke: '#123456', dash: 'dashed' }),
			areaItem('a1', { ...DEFAULT_STYLE, stroke: '#654321', fill: '#abcdef', fillOpacity: 0.5 }),
		]));
		expect(namesOf(container)).toEqual(['Custom line', 'Custom area']);
	});

	it('groups unmatched items that share a style', () => {
		const { container, legend } = mount();
		const style = { ...DEFAULT_STYLE, stroke: '#123456', dash: 'dotted' as const };
		legend.setDoc(docOf([pathItem('p1', style), pathItem('p2', style), pathItem('p3', style)]));
		expect(rowsOf(container).map(r => [r[0], r[1]])).toEqual([['Custom line', '\u00d73']]);
	});

	it('matches custom presets from the host too', () => {
		const host = makeHost([{ id: 'mine', name: 'My river', fits: 'path', style: { stroke: '#123456' } }]);
		const { container, legend } = mount(host);
		legend.setDoc(docOf([pathItem('p1', { ...DEFAULT_STYLE, stroke: '#123456' })]));
		expect(namesOf(container)).toEqual(['My river']);
	});

	it('skips lines and areas on hidden layers', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([pathItem('p1', withStyle('road'), 'routes'), areaItem('a1', withStyle('water'), 'terrain')], ['routes', 'terrain']));
		expect(queryAll(container, 'li.ink-legend-row')).toHaveLength(0);
	});

	it('draws dashed, double, wavy and ticked lines with their own markup', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([
			pathItem('d', { ...DEFAULT_STYLE, dash: 'dashed', stroke: '#111111' }),
			pathItem('x', { ...DEFAULT_STYLE, dash: 'double', stroke: '#222222' }),
			pathItem('w', { ...DEFAULT_STYLE, dash: 'wavy', stroke: '#333333' }),
			pathItem('t', { ...DEFAULT_STYLE, dash: 'ticked', stroke: '#444444' }),
		]));
		const swatches = rowsOf(container).map(r => r[2]).join('');
		expect(swatches).toContain('stroke-dasharray="6 4"');
		expect(swatches).toContain('M2 5 H34');
		expect(swatches).toContain('M2 9 H34');
		expect(swatches).toContain('q4 -4 8 0');
		expect(swatches).toContain('M6 3 V11');
	});

	it('draws hatching and symbol patterns in area swatches', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([
			areaItem('h', { ...DEFAULT_STYLE, fill: '#8b5a2b', fillOpacity: 0.3, fillPattern: 'hatch' }),
			areaItem('s', { ...DEFAULT_STYLE, fill: '#3f7d3a', fillOpacity: 0.3, fillPattern: 'symbol:tree' }),
		]));
		const swatches = rowsOf(container).map(r => r[2]);
		const hatched = swatches.find(s => s.includes('M-16 17 L0 1'));
		const patterned = swatches.find(s => s.includes('translate(3 1) scale(0.45)'));
		expect(hatched).toContain('fill-opacity="0.3"');
		expect(patterned).toContain('fill="#3f7d3a"');
		expect(swatches).toHaveLength(2);
	});

	it('gives each area swatch its own clip path id', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([
			areaItem('a', { ...DEFAULT_STYLE, fillPattern: 'hatch' }),
			areaItem('b', { ...DEFAULT_STYLE, fillPattern: 'dots', stroke: '#111111' }),
		]));
		const ids = rowsOf(container).map(r => /clipPath id="([^"]+)"/.exec(r[2])?.[1]);
		expect(ids[0]).toBeTruthy();
		expect(ids[1]).toBeTruthy();
		expect(ids[0]).not.toBe(ids[1]);
	});
});

describe('InkLegend: layout', () => {
	it('lists sections in order: symbols, lines, areas, with a heading for each one used', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([
			areaItem('a1', withStyle('water')),
			pathItem('p1', withStyle('road')),
			stamp('s1', 'tree', '#2b2b2b'),
		]));
		expect(headings(container)).toEqual(['Symbols', 'Lines', 'Areas']);
	});

	it('leaves out sections that are not used', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([pathItem('p1', withStyle('road'))]));
		expect(headings(container)).toEqual(['Lines']);
	});

	it('replaces the list on each setDoc', () => {
		const { container, legend } = mount();
		legend.setDoc(docOf([stamp('a', 'tree', '#2b2b2b')]));
		legend.setDoc(docOf([stamp('b', 'door', '#2b2b2b')]));
		expect(namesOf(container)).toEqual(['Door']);
	});
});

describe('legendEntries', () => {
	it('is a pure function of the document and presets', () => {
		const doc = docOf([stamp('a', 'tree', '#2b2b2b'), pathItem('p', withStyle('road'))]);
		const entries = legendEntries(doc, PRESETS);
		expect(entries.map(e => [e.section, e.name, e.count])).toEqual([
			['symbols', 'Tree', 1],
			['lines', 'Road', 1],
		]);
	});
});
