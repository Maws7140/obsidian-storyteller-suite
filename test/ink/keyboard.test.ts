import { beforeEach, describe, expect, it } from 'vitest';
import { defaultInkDoc, normalizeInk } from '../../src/leaflet/ink/model';
import type { InkDoc, InkItem, InkPath, InkStamp } from '../../src/leaflet/ink/model';
import { InkHistory } from '../../src/leaflet/ink/history';
import { handleEditorKey, clearClipboard, hasClipboard, PASTE_OFFSET_PX } from '../../src/leaflet/ink/tools/keyboard';
import type { EditorKeyOptions } from '../../src/leaflet/ink/tools/keyboard';
import type { InkSelectStore } from '../../src/leaflet/ink/tools/selectTypes';

/** A store with a real InkHistory. Changes are synchronous, like the real InkStore. */
class FakeStore {
	doc: InkDoc;
	selection = new Set<string>();
	private history = new InkHistory<InkDoc>();
	private layer = 'terrain';
	saves = 0;

	constructor(doc: InkDoc) {
		this.doc = doc;
	}

	get canUndo(): boolean {
		return this.history.canUndo;
	}

	get canRedo(): boolean {
		return this.history.canRedo;
	}

	apply(change: (doc: InkDoc) => InkDoc, coalesceKey?: string): void {
		this.history.push(this.doc, coalesceKey);
		this.doc = normalizeInk(change(this.doc));
		this.saves += 1;
	}

	undo(): void {
		const prev = this.history.undo(this.doc);
		if (prev) this.doc = prev;
	}

	redo(): void {
		const next = this.history.redo(this.doc);
		if (next) this.doc = next;
	}

	select(ids: Iterable<string>): void {
		this.selection = new Set(ids);
	}

	toggleSelect(id: string): void {
		if (this.selection.has(id)) this.selection.delete(id);
		else this.selection.add(id);
	}

	clearSelection(): void {
		this.selection = new Set();
	}

	flush(): Promise<void> {
		return Promise.resolve();
	}

	activeLayer(): string {
		return this.layer;
	}

	setActiveLayer(id: string): void {
		this.layer = id;
	}
}

function store(doc: InkDoc): FakeStore & InkSelectStore {
	return new FakeStore(doc) as unknown as FakeStore & InkSelectStore;
}

/** Linear test projection: 1 px is 0.01 degrees, latitude grows upwards. */
const opts: EditorKeyOptions = {
	pxToLatLng: (x: number, y: number): [number, number] => [-y * 0.01, x * 0.01],
};

function key(k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}, target: unknown = null): KeyboardEvent {
	return {
		key: k,
		ctrlKey: !!mods.ctrl,
		metaKey: !!mods.meta,
		shiftKey: !!mods.shift,
		altKey: !!mods.alt,
		isComposing: false,
		target,
	} as unknown as KeyboardEvent;
}

const line = (id: string, points: [number, number][], extra: Partial<InkPath> = {}): InkPath => ({
	id, kind: 'path', layer: 'routes', scaleWithMap: true, points,
	style: { stroke: '#2b2b2b', strokeWidth: 2, strokeOpacity: 1, dash: 'solid', fill: '#c9a66b', fillOpacity: 0, fillPattern: 'none' },
	...extra,
});
const stamp = (id: string, at: [number, number], extra: Partial<InkStamp> = {}): InkStamp => ({
	id, kind: 'stamp', layer: 'features', scaleWithMap: true, at, symbol: 'tree', size: 24, rotation: 0,
	color: '#2b2b2b', opacity: 1, ...extra,
});

function fixture(items: InkItem[]): InkDoc {
	return normalizeInk({ ...defaultInkDoc(), items });
}

function ids(s: { doc: InkDoc }): string[] {
	return s.doc.items.map(i => i.id);
}

function item<T extends InkItem>(s: { doc: InkDoc }, id: string): T {
	const found = s.doc.items.find(i => i.id === id);
	if (!found) throw new Error(`no item ${id}`);
	return found as T;
}

describe('handleEditorKey', () => {
	let s: FakeStore & InkSelectStore;

	beforeEach(() => {
		clearClipboard();
		s = store(fixture([
			line('a', [[0, 0], [1, 1]]),
			stamp('b', [2, 2]),
			line('locked', [[5, 5], [6, 6]], { locked: true }),
		]));
	});

	it('deletes the selection on Delete and Backspace', () => {
		s.select(['a', 'b']);
		expect(handleEditorKey(key('Delete'), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['locked']);
		expect(s.selection.size).toBe(0);
		s.undo();
		expect(ids(s)).toEqual(['a', 'b', 'locked']);
		s.select(['b']);
		expect(handleEditorKey(key('Backspace'), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['a', 'locked']);
	});

	it('does nothing when there is no selection, so the key is not used', () => {
		expect(handleEditorKey(key('Delete'), s, opts)).toBe(false);
		expect(handleEditorKey(key('ArrowLeft'), s, opts)).toBe(false);
		expect(handleEditorKey(key('Escape'), s, opts)).toBe(false);
		expect(s.saves).toBe(0);
	});

	it('nudges by 1 px, or 10 px with Shift, in the direction of the arrow', () => {
		s.select(['a']);
		expect(handleEditorKey(key('ArrowRight'), s, opts)).toBe(true);
		expect((item<InkPath>(s, 'a').points[0])[1]).toBeCloseTo(0.01, 9);
		expect(handleEditorKey(key('ArrowUp'), s, opts)).toBe(true);
		expect((item<InkPath>(s, 'a').points[0])[0]).toBeCloseTo(0.01, 9);
		expect(handleEditorKey(key('ArrowLeft', { shift: true }), s, opts)).toBe(true);
		expect((item<InkPath>(s, 'a').points[0])[1]).toBeCloseTo(0.01 - 0.1, 9);
		expect(handleEditorKey(key('ArrowDown', { shift: true }), s, opts)).toBe(true);
		expect((item<InkPath>(s, 'a').points[0])[0]).toBeCloseTo(0.01 - 0.1, 9);
	});

	it('merges repeated nudges into one undo step', () => {
		s.select(['a']);
		for (let i = 0; i < 5; i++) handleEditorKey(key('ArrowRight'), s, opts);
		expect((item<InkPath>(s, 'a').points[0])[1]).toBeCloseTo(0.05, 9);
		s.undo();
		expect((item<InkPath>(s, 'a').points[0])[1]).toBeCloseTo(0, 9);
		expect(s.canUndo).toBe(false);
	});

	it('does not nudge locked items', () => {
		s.select(['locked']);
		expect(handleEditorKey(key('ArrowRight'), s, opts)).toBe(false);
		expect(item<InkPath>(s, 'locked').points[0]).toEqual([5, 5]);
	});

	it('copies and pastes with new ids, offset by 10 px, and selects the copies', () => {
		s.select(['a', 'b']);
		expect(handleEditorKey(key('c', { ctrl: true }), s, opts)).toBe(true);
		expect(hasClipboard()).toBe(true);
		expect(handleEditorKey(key('v', { meta: true }), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['a', 'b', 'locked', 'path-1', 'stamp-1']);
		expect(Array.from(s.selection).sort()).toEqual(['path-1', 'stamp-1']);
		const copy = item<InkPath>(s, 'path-1');
		expect(copy.points[0][1]).toBeCloseTo(PASTE_OFFSET_PX * 0.01, 9);
		// 10 px down is -0.1 latitude.
		expect(copy.points[0][0]).toBeCloseTo(-PASTE_OFFSET_PX * 0.01, 9);
		expect(copy.style.stroke).toBe('#2b2b2b');
		// The original stays put.
		expect(item<InkPath>(s, 'a').points[0]).toEqual([0, 0]);
	});

	it('pastes onto the active layer', () => {
		s.setActiveLayer('labels');
		s.select(['b']);
		handleEditorKey(key('c', { ctrl: true }), s, opts);
		handleEditorKey(key('v', { ctrl: true }), s, opts);
		expect(item<InkStamp>(s, 'stamp-1').layer).toBe('labels');
	});

	it('does not copy when nothing selectable is selected', () => {
		s.select(['locked']);
		expect(handleEditorKey(key('c', { ctrl: true }), s, opts)).toBe(false);
		expect(hasClipboard()).toBe(false);
		expect(handleEditorKey(key('v', { ctrl: true }), s, opts)).toBe(false);
	});

	it('duplicates the selection with Ctrl+D and selects the copies', () => {
		s.select(['a']);
		expect(handleEditorKey(key('d', { ctrl: true }), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['a', 'b', 'locked', 'path-1']);
		expect(Array.from(s.selection)).toEqual(['path-1']);
	});

	it('selects every selectable item with Ctrl+A and skips locked ones', () => {
		expect(handleEditorKey(key('a', { ctrl: true }), s, opts)).toBe(true);
		expect(Array.from(s.selection).sort()).toEqual(['a', 'b']);
	});

	it('moves selected items backward and forward with [ and ], within their layer', () => {
		// "a" and "locked" share the routes layer, so "a" swaps with "locked" there and "b" is untouched.
		s.select(['a']);
		expect(handleEditorKey(key(']'), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['locked', 'b', 'a']);
		expect(handleEditorKey(key('['), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['a', 'b', 'locked']);
	});

	it('undoes with Ctrl+Z, and redoes with Ctrl+Shift+Z or Ctrl+Y', () => {
		s.select(['b']);
		handleEditorKey(key('Delete'), s, opts);
		expect(ids(s)).toEqual(['a', 'locked']);
		expect(handleEditorKey(key('z', { ctrl: true }), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['a', 'b', 'locked']);
		expect(handleEditorKey(key('Z', { ctrl: true, shift: true }), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['a', 'locked']);
		handleEditorKey(key('z', { meta: true }), s, opts);
		expect(handleEditorKey(key('y', { ctrl: true }), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['a', 'locked']);
	});

	it('drops selected ids that an undo removed', () => {
		s.apply(doc => ({ ...doc, items: doc.items.concat([stamp('new', [9, 9])]) }));
		s.select(['new', 'b']);
		expect(handleEditorKey(key('z', { ctrl: true }), s, opts)).toBe(true);
		expect(ids(s)).toEqual(['a', 'b', 'locked']);
		expect(Array.from(s.selection)).toEqual(['b']);
	});

	it('clears the selection on Escape, and reports false when it is already clear', () => {
		s.select(['a']);
		expect(handleEditorKey(key('Escape'), s, opts)).toBe(true);
		expect(s.selection.size).toBe(0);
		expect(handleEditorKey(key('Escape'), s, opts)).toBe(false);
	});

	it('ignores keys typed into inputs, text areas, selects and contenteditable elements', () => {
		s.select(['a']);
		for (const target of [{ tagName: 'INPUT' }, { tagName: 'textarea' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
			expect(handleEditorKey(key('Delete', {}, target), s, opts)).toBe(false);
			expect(handleEditorKey(key('a', { ctrl: true }, target), s, opts)).toBe(false);
		}
		expect(ids(s)).toEqual(['a', 'b', 'locked']);
	});

	it('ignores keys with Alt, and keys it does not use', () => {
		s.select(['a']);
		expect(handleEditorKey(key('Delete', { alt: true }), s, opts)).toBe(false);
		expect(handleEditorKey(key('q'), s, opts)).toBe(false);
		expect(ids(s)).toEqual(['a', 'b', 'locked']);
	});
});
