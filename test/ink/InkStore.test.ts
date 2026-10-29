import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InkStore, SAVE_DELAY_MS } from '../../src/leaflet/ink/InkStore';
import type { InkHost } from '../../src/leaflet/ink/host';
import { defaultInkDoc, normalizeInk } from '../../src/leaflet/ink/model';
import type { InkDoc, InkItem, InkPath, InkStamp } from '../../src/leaflet/ink/model';
import { DEFAULT_STYLE } from '../../src/leaflet/ink/styles';

function pathItem(id: string, layer = 'routes', extra: Partial<InkPath> = {}): InkItem {
	return {
		id, kind: 'path', layer, scaleWithMap: true,
		points: [[0, 0], [10, 10]], style: { ...DEFAULT_STYLE }, ...extra,
	} as InkPath;
}

function stampItem(id: string, layer = 'features'): InkItem {
	return { id, kind: 'stamp', layer, scaleWithMap: true, at: [5, 5], symbol: 'door', size: 32, rotation: 0, color: '#2b2b2b', opacity: 1 } as InkStamp;
}

function docWith(...items: InkItem[]): InkDoc {
	return normalizeInk({ ...defaultInkDoc(), items });
}

/** A fake host that records saves. `failNext(n)` makes the next n saves reject. */
function fakeHost(initial: InkDoc = defaultInkDoc()) {
	const saves: InkDoc[] = [];
	let failures = 0;
	const notify = vi.fn<[string], void>();
	const save = vi.fn(async (doc: InkDoc) => {
		if (failures > 0) {
			failures--;
			throw new Error('disk full');
		}
		saves.push(JSON.parse(JSON.stringify(doc)) as InkDoc);
	});
	const host = {
		notify,
		confirm: async () => true,
		showMenu: () => undefined,
		icon: () => undefined,
		pickLocation: async () => null,
		openLocation: () => undefined,
		load: () => JSON.parse(JSON.stringify(initial)) as InkDoc,
		save,
		presets: () => [],
		savePreset: () => undefined,
	};
	return {
		host: host as unknown as InkHost,
		saves,
		notify,
		save,
		failNext(n: number) {
			failures = n;
		},
	};
}

function idsOf(store: InkStore): string[] {
	return store.doc.items.map(item => item.id);
}

describe('InkStore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('construction', () => {
		it('uses the initial document, normalised', () => {
			const h = fakeHost();
			const store = new InkStore(h.host, { version: 1, layers: [], items: [pathItem('a')] } as unknown as InkDoc);
			expect(store.doc.layers.map(l => l.id)).toEqual(['terrain', 'routes', 'features', 'labels']);
			expect(idsOf(store)).toEqual(['a']);
			expect(h.save).not.toHaveBeenCalled();
		});

		it('loads from the host when no initial document is given', () => {
			const h = fakeHost(docWith(pathItem('loaded')));
			const store = new InkStore(h.host);
			expect(idsOf(store)).toEqual(['loaded']);
		});

		it('starts with the select tool, nothing selected and nothing to undo', () => {
			const store = new InkStore(fakeHost().host);
			expect(store.tool).toBe('select');
			expect(store.selection.size).toBe(0);
			expect(store.canUndo).toBe(false);
			expect(store.canRedo).toBe(false);
		});
	});

	describe('undo and redo', () => {
		it('restores the document and keeps redo until the next change', () => {
			const store = new InkStore(fakeHost().host);
			store.apply(() => docWith(pathItem('a')));
			store.apply(() => docWith(pathItem('a'), pathItem('b')));
			expect(idsOf(store)).toEqual(['a', 'b']);

			store.undo();
			expect(idsOf(store)).toEqual(['a']);
			expect(store.canRedo).toBe(true);

			store.redo();
			expect(idsOf(store)).toEqual(['a', 'b']);
			expect(store.canRedo).toBe(false);

			store.undo();
			store.undo();
			expect(idsOf(store)).toEqual([]);
			expect(store.canUndo).toBe(false);
		});

		it('clears redo when a new change is made after an undo', () => {
			const store = new InkStore(fakeHost().host);
			store.apply(() => docWith(pathItem('a')));
			store.undo();
			store.apply(() => docWith(pathItem('z')));
			expect(store.canRedo).toBe(false);
		});

		it('ignores a change that does not alter the document', () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			const listener = vi.fn();
			store.on('change', listener);
			store.apply(doc => doc);
			expect(listener).not.toHaveBeenCalled();
			expect(store.canUndo).toBe(false);
		});

		it('keeps the selection valid after undo', () => {
			const store = new InkStore(fakeHost().host);
			store.apply(() => docWith(pathItem('a'), pathItem('b')));
			store.select(['a', 'b']);
			store.deleteSelected();
			expect(store.selection.size).toBe(0);
			store.undo();
			expect(idsOf(store)).toEqual(['a', 'b']);
			expect(store.selection.size).toBe(0);
		});
	});

	describe('coalescing', () => {
		it('merges edits that share a key into one undo step', () => {
			const store = new InkStore(fakeHost().host);
			store.apply(() => docWith(pathItem('a')));
			store.apply(doc => ({ ...doc, items: doc.items.map(i => ({ ...i, name: 'one' })) }), 'drag');
			store.apply(doc => ({ ...doc, items: doc.items.map(i => ({ ...i, name: 'two' })) }), 'drag');
			store.apply(doc => ({ ...doc, items: doc.items.map(i => ({ ...i, name: 'three' })) }), 'drag');
			expect(store.doc.items[0].name).toBe('three');

			store.undo();
			expect(store.doc.items[0].name).toBeUndefined();
			expect(idsOf(store)).toEqual(['a']);
			expect(store.canUndo).toBe(true); // the first apply (add a) is still there
		});

		it('starts a new undo step after flush, even with the same key', () => {
			const store = new InkStore(fakeHost().host);
			store.apply(() => docWith(pathItem('a')), 'drag');
			void store.flush();
			store.apply(() => docWith(pathItem('a'), pathItem('b')), 'drag');
			store.undo();
			expect(idsOf(store)).toEqual(['a']);
		});

		it('starts a new undo step when the key changes', () => {
			const store = new InkStore(fakeHost().host);
			store.apply(() => docWith(pathItem('a')), 'x');
			store.apply(() => docWith(pathItem('a'), pathItem('b')), 'y');
			store.undo();
			expect(idsOf(store)).toEqual(['a']);
		});
	});

	describe('saving', () => {
		it('saves a keyless change straight away', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			store.apply(() => docWith(pathItem('a')));
			await store.flush();
			expect(h.saves).toHaveLength(1);
			expect(h.saves[0].items.map(i => i.id)).toEqual(['a']);
		});

		it('debounces saves while a coalesce key is active', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			store.apply(() => docWith(pathItem('a')), 'drag');
			vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
			store.apply(() => docWith(pathItem('a'), pathItem('b')), 'drag');
			vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
			await Promise.resolve();
			expect(h.saves).toHaveLength(0);

			vi.advanceTimersByTime(1);
			await store.flush();
			expect(h.saves).toHaveLength(1);
			expect(h.saves[0].items.map(i => i.id)).toEqual(['a', 'b']);
		});

		it('flush saves a pending coalesced edit at once', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			store.apply(() => docWith(pathItem('a')), 'drag');
			await store.flush();
			expect(h.saves).toHaveLength(1);
			vi.advanceTimersByTime(SAVE_DELAY_MS * 2);
			await store.flush();
			expect(h.saves).toHaveLength(1);
		});

		it('saves the latest document, not the one from when the save was queued', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			store.apply(() => docWith(pathItem('a')));
			store.apply(() => docWith(pathItem('a'), pathItem('b')));
			await store.flush();
			expect(h.saves.length).toBeGreaterThanOrEqual(1);
			expect(h.saves[h.saves.length - 1].items.map(i => i.id)).toEqual(['a', 'b']);
		});

		it('keeps the document and notifies when a save fails, then retries on the next change', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			h.failNext(1);
			store.apply(() => docWith(pathItem('a')));
			await store.flush();
			expect(h.notify).toHaveBeenCalledWith('Map Ink could not save: disk full');
			expect(idsOf(store)).toEqual(['a']);
			expect(h.saves).toHaveLength(0);

			store.apply(() => docWith(pathItem('a'), pathItem('b')));
			await store.flush();
			expect(h.saves).toHaveLength(1);
			expect(h.saves[0].items.map(i => i.id)).toEqual(['a', 'b']);
		});

		it('does not throw when a save fails', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			h.failNext(2);
			store.apply(() => docWith(pathItem('a')));
			await expect(store.flush()).resolves.toBeUndefined();
		});

		it('saves when the tool changes', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			store.apply(() => docWith(pathItem('a')), 'drag');
			store.setTool('path');
			await store.flush();
			expect(h.saves).toHaveLength(1);
		});

		it('does not save on undo-free reads or selection changes', async () => {
			const h = fakeHost(docWith(pathItem('a')));
			const store = new InkStore(h.host);
			store.select(['a']);
			store.clearSelection();
			await store.flush();
			expect(h.saves).toHaveLength(0);
		});
	});

	describe('selection', () => {
		it('select replaces the selection and ignores unknown ids', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), pathItem('b'))).host);
			store.select(['a']);
			store.select(['b', 'nope']);
			expect([...store.selection]).toEqual(['b']);
		});

		it('select emits change', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'))).host);
			const listener = vi.fn();
			store.on('change', listener);
			store.select(['a']);
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('toggleSelect adds and removes an id', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'))).host);
			store.toggleSelect('a');
			expect([...store.selection]).toEqual(['a']);
			store.toggleSelect('a');
			expect(store.selection.size).toBe(0);
			store.toggleSelect('missing');
			expect(store.selection.size).toBe(0);
		});

		it('clearSelection empties the selection', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'))).host);
			store.select(['a']);
			store.clearSelection();
			expect(store.selection.size).toBe(0);
		});

		it('drops ids that no longer exist after any change', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), pathItem('b'))).host);
			store.select(['a', 'b']);
			store.apply(doc => ({ ...doc, items: doc.items.filter(i => i.id !== 'a') }));
			expect([...store.selection]).toEqual(['b']);
		});

		it('is a snapshot: a held reference does not change under the caller', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), pathItem('b'))).host);
			store.select(['a']);
			const held = store.selection;
			store.select(['b']);
			expect([...held]).toEqual(['a']);
		});

		it('updateSelected patches only the selected items, and keeps id and kind', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), pathItem('b'))).host);
			store.select(['a']);
			store.updateSelected(item => ({ ...item, name: 'Renamed', id: 'hacked', kind: 'area' } as InkItem));
			expect(store.doc.items.find(i => i.id === 'a')?.name).toBe('Renamed');
			expect(store.doc.items.find(i => i.id === 'a')?.kind).toBe('path');
			expect(store.doc.items.find(i => i.id === 'b')?.name).toBeUndefined();
		});

		it('updateSelected does nothing with an empty selection', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'))).host);
			store.updateSelected(item => ({ ...item, name: 'x' }));
			expect(store.canUndo).toBe(false);
		});
	});

	describe('addItem', () => {
		it('assigns a fresh id, the active layer, selects it and returns the id', () => {
			const store = new InkStore(fakeHost().host);
			const id = store.addItem({ kind: 'stamp', scaleWithMap: true, at: [1, 2], symbol: 'door', size: 32, rotation: 0, color: '#000000', opacity: 1 });
			expect(id).toBe('stamp-1');
			expect(store.doc.items[0].layer).toBe('features');
			expect(store.doc.items[0].id).toBe('stamp-1');
			expect([...store.selection]).toEqual(['stamp-1']);
		});

		it('gives each new item a different id', () => {
			const store = new InkStore(fakeHost().host);
			const a = store.addItem({ kind: 'stamp', scaleWithMap: true, at: [1, 2], symbol: 'door', size: 32, rotation: 0, color: '#000000', opacity: 1 });
			const b = store.addItem({ kind: 'stamp', scaleWithMap: true, at: [3, 4], symbol: 'door', size: 32, rotation: 0, color: '#000000', opacity: 1 });
			expect(a).not.toBe(b);
			expect(idsOf(store)).toEqual([a, b]);
		});

		it('uses a given id when it is free, and makes a new one when it is taken', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('path-1'))).host);
			const taken = store.addItem({ id: 'path-1', kind: 'path', scaleWithMap: true, points: [[0, 0], [1, 1]], style: { ...DEFAULT_STYLE } });
			expect(taken).not.toBe('path-1');
			const free = store.addItem({ id: 'mine', kind: 'path', scaleWithMap: true, points: [[0, 0], [1, 1]], style: { ...DEFAULT_STYLE } });
			expect(free).toBe('mine');
		});

		it('uses the layer given, and the active layer when none is given', () => {
			const store = new InkStore(fakeHost().host);
			const a = store.addItem({ kind: 'path', layer: 'terrain', scaleWithMap: true, points: [[0, 0], [1, 1]], style: { ...DEFAULT_STYLE } });
			store.setActiveLayer('labels');
			const b = store.addItem({ kind: 'path', scaleWithMap: true, points: [[0, 0], [1, 1]], style: { ...DEFAULT_STYLE } });
			expect(store.doc.items.find(i => i.id === a)?.layer).toBe('terrain');
			expect(store.doc.items.find(i => i.id === b)?.layer).toBe('labels');
		});

		it('returns an empty string when normalising drops the item', () => {
			const store = new InkStore(fakeHost().host);
			const id = store.addItem({ kind: 'path', scaleWithMap: true, points: [[0, 0]], style: { ...DEFAULT_STYLE } });
			expect(id).toBe('');
			expect(store.doc.items).toHaveLength(0);
			expect(store.canUndo).toBe(false);
		});

		it('is one undo step and is saved straight away', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			store.addItem({ kind: 'path', scaleWithMap: true, points: [[0, 0], [1, 1]], style: { ...DEFAULT_STYLE } });
			await store.flush();
			expect(h.saves).toHaveLength(1);
			store.undo();
			expect(store.doc.items).toHaveLength(0);
		});
	});

	describe('active layer', () => {
		it('defaults to features when present', () => {
			expect(new InkStore(fakeHost().host).activeLayer()).toBe('features');
		});

		it('falls back to the first layer when features is missing', () => {
			const doc = normalizeInk({ layers: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
			expect(new InkStore(fakeHost().host, doc).activeLayer()).toBe('a');
		});

		it('ignores a layer id that does not exist', () => {
			const store = new InkStore(fakeHost().host);
			store.setActiveLayer('nope');
			expect(store.activeLayer()).toBe('features');
		});
	});

	describe('replaceDoc', () => {
		it('replaces the document and keeps history unless told to reset it', () => {
			const store = new InkStore(fakeHost().host);
			store.apply(() => docWith(pathItem('a')));
			store.replaceDoc(docWith(pathItem('x')));
			expect(idsOf(store)).toEqual(['x']);
			expect(store.canUndo).toBe(true);
		});

		it('clears history when asked to reset it', () => {
			const store = new InkStore(fakeHost().host);
			store.apply(() => docWith(pathItem('a')));
			store.replaceDoc(docWith(pathItem('x')), { resetHistory: true });
			expect(store.canUndo).toBe(false);
		});

		it('does not save the replacement', async () => {
			const h = fakeHost();
			const store = new InkStore(h.host);
			store.replaceDoc(docWith(pathItem('x')));
			await store.flush();
			expect(h.saves).toHaveLength(0);
		});
	});

	describe('ordering and layers', () => {
		it('bringForward moves a selected item above its neighbour on the same layer', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), pathItem('b'), pathItem('c'))).host);
			store.select(['a']);
			store.bringForward();
			expect(idsOf(store)).toEqual(['b', 'a', 'c']);
		});

		it('sendBackward moves a selected item below its neighbour on the same layer', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), pathItem('b'), pathItem('c'))).host);
			store.select(['c']);
			store.sendBackward();
			expect(idsOf(store)).toEqual(['a', 'c', 'b']);
		});

		it('keeps two selected items in order when bringing both forward', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), pathItem('b'), pathItem('c'))).host);
			store.select(['a', 'b']);
			store.bringForward();
			expect(idsOf(store)).toEqual(['c', 'a', 'b']);
		});

		it('ignores items on other layers when ordering', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a', 'routes'), pathItem('t', 'terrain'), pathItem('b', 'routes'))).host);
			store.select(['a']);
			store.bringForward();
			expect(idsOf(store)).toEqual(['t', 'b', 'a']);
		});

		it('setSelectedLayer moves the selection, and ignores unknown layers', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a', 'routes'))).host);
			store.select(['a']);
			store.setSelectedLayer('nope');
			expect(store.doc.items[0].layer).toBe('routes');
			store.setSelectedLayer('labels');
			expect(store.doc.items[0].layer).toBe('labels');
		});

		it('deleteSelected removes the selection', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), pathItem('b'))).host);
			store.select(['a']);
			store.deleteSelected();
			expect(idsOf(store)).toEqual(['b']);
		});
	});

	describe('styles, colours and events', () => {
		it('keeps a current style per tool kind', () => {
			const store = new InkStore(fakeHost().host);
			store.setTool('path');
			store.setCurrentStyle({ stroke: '#123456', strokeWidth: 5 });
			expect(store.currentStyle('path').stroke).toBe('#123456');
			expect(store.currentStyle('area').stroke).toBe(DEFAULT_STYLE.stroke);
			store.setTool('area');
			expect(store.currentStyle('path').stroke).toBe('#123456');
		});

		it('setCurrentStyle does nothing under the select tool', () => {
			const store = new InkStore(fakeHost().host);
			store.setCurrentStyle({ stroke: '#123456' });
			expect(store.currentStyle('path').stroke).toBe(DEFAULT_STYLE.stroke);
		});

		it('returns copies of styles so callers cannot change the store', () => {
			const store = new InkStore(fakeHost().host);
			store.currentStyle('path').stroke = '#ffffff';
			expect(store.currentStyle('path').stroke).toBe(DEFAULT_STYLE.stroke);
		});

		it('merges text style and symbol changes', () => {
			const store = new InkStore(fakeHost().host);
			store.setCurrentTextStyle({ size: 40, bold: true });
			expect(store.currentTextStyle().size).toBe(40);
			expect(store.currentTextStyle().bold).toBe(true);
			expect(store.currentTextStyle().font).toBe('serif');
			store.setCurrentSymbol('tower');
			expect(store.currentSymbol()).toBe('tower');
		});

		it('keeps the last eight distinct colours, most recent first', () => {
			const store = new InkStore(fakeHost().host);
			for (let i = 0; i < 10; i++) store.pushRecentColor(`#00000${i}`);
			store.pushRecentColor('#000003');
			const recent = store.recentColors();
			expect(recent).toHaveLength(8);
			expect(recent[0]).toBe('#000003');
			expect(new Set(recent).size).toBe(8);
		});

		it('on returns an unsubscribe function', () => {
			const store = new InkStore(fakeHost().host);
			const listener = vi.fn();
			const off = store.on('change', listener);
			store.setCurrentSymbol('tower');
			off();
			store.setCurrentSymbol('door');
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('applies a built-in preset to selected paths only', () => {
			const store = new InkStore(fakeHost(docWith(pathItem('a'), stampItem('s'))).host);
			store.select(['a', 's']);
			store.applyPresetToSelection('river');
			const path = store.doc.items.find(i => i.id === 'a') as InkPath;
			expect(path.style.stroke).toBe('#3b6fa8');
			expect(path.style.dash).toBe('wavy');
			expect(store.doc.items.find(i => i.id === 's')).toEqual(docWith(pathItem('a'), stampItem('s')).items[1]);
		});
	});
});
