import { describe, expect, it, vi } from 'vitest';
import { InkStore } from '../../src/leaflet/ink/InkStore';
import type { InkHost } from '../../src/leaflet/ink/host';
import { defaultInkDoc, normalizeInk } from '../../src/leaflet/ink/model';
import type { InkDoc, InkStamp } from '../../src/leaflet/ink/model';

/** A fake host that records saves. */
function fakeHost(initial: InkDoc = defaultInkDoc()) {
	const saves: InkDoc[] = [];
	const notify = vi.fn<[string], void>();
	const save = vi.fn(async (doc: InkDoc) => {
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
	return { host: host as unknown as InkHost, saves, save };
}

function stamp(id: string, layer: string): InkStamp {
	return { id, kind: 'stamp', layer, scaleWithMap: true, at: [5, 5], symbol: 'door', size: 32, rotation: 0, color: '#2b2b2b', opacity: 1 };
}

function layerIds(store: InkStore): string[] {
	return store.doc.layers.map(layer => layer.id);
}

describe('InkStore layer edits', () => {
	it('adds a layer on top, makes it active, and saves it', async () => {
		const { host, saves } = fakeHost();
		const store = new InkStore(host);
		const id = store.addLayer('Water');
		expect(id).toBe('layer-water');
		expect(layerIds(store).at(-1)).toBe(id);
		expect(store.activeLayer()).toBe(id);
		await store.flush();
		expect(saves.at(-1)?.layers.at(-1)?.name).toBe('Water');
	});

	it('undoes and redoes an added layer', () => {
		const store = new InkStore(fakeHost().host);
		const before = layerIds(store);
		store.addLayer('Roads');
		expect(layerIds(store)).toHaveLength(before.length + 1);
		store.undo();
		expect(layerIds(store)).toEqual(before);
		store.redo();
		expect(layerIds(store)).toContain('layer-roads');
	});

	it('renames, shows, hides and locks a layer, each as one undo step', () => {
		const store = new InkStore(fakeHost().host);
		store.renameLayer('terrain', 'Ground');
		expect(store.doc.layers.find(l => l.id === 'terrain')?.name).toBe('Ground');
		store.setLayerVisible('terrain', false);
		expect(store.doc.layers.find(l => l.id === 'terrain')?.visible).toBe(false);
		store.setLayerLocked('terrain', true);
		expect(store.doc.layers.find(l => l.id === 'terrain')?.locked).toBe(true);
		store.undo();
		expect(store.doc.layers.find(l => l.id === 'terrain')?.locked).toBe(false);
		store.undo();
		expect(store.doc.layers.find(l => l.id === 'terrain')?.visible).toBe(true);
		store.undo();
		expect(store.doc.layers.find(l => l.id === 'terrain')?.name).toBe('Terrain');
	});

	it('ignores a blank rename and an unknown layer id', () => {
		const store = new InkStore(fakeHost().host);
		const before = JSON.stringify(store.doc);
		store.renameLayer('terrain', '   ');
		store.renameLayer('nope', 'Anything');
		store.setLayerVisible('nope', false);
		expect(JSON.stringify(store.doc)).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('moves a layer to a new position', () => {
		const store = new InkStore(fakeHost().host);
		store.moveLayer('terrain', 3);
		expect(layerIds(store).at(-1)).toBe('terrain');
	});

	it('deletes a layer and moves its items to the layer below', () => {
		const initial = normalizeInk({ ...defaultInkDoc(), items: [stamp('a', 'labels')] });
		const store = new InkStore(fakeHost(initial).host);
		store.deleteLayer('labels');
		expect(layerIds(store)).not.toContain('labels');
		expect(store.doc.items[0].layer).toBe('features');
		store.undo();
		expect(store.doc.items[0].layer).toBe('labels');
	});

	it('clears the active layer when it is deleted, so another layer becomes active', () => {
		const store = new InkStore(fakeHost().host);
		store.setActiveLayer('labels');
		store.deleteLayer('labels');
		expect(layerIds(store)).toContain(store.activeLayer());
		expect(store.activeLayer()).not.toBe('labels');
	});

	it('does not delete the last layer', () => {
		const initial = normalizeInk({ version: 1, layers: [{ id: 'only', name: 'Only', visible: true, locked: false }], items: [] });
		const store = new InkStore(fakeHost(initial).host);
		store.deleteLayer('only');
		expect(layerIds(store)).toEqual(['only']);
	});

	it('keeps a selected item selected when its layer is deleted, because the item moves', () => {
		const initial = normalizeInk({ ...defaultInkDoc(), items: [stamp('a', 'labels')] });
		const store = new InkStore(fakeHost(initial).host);
		store.select(['a']);
		store.deleteLayer('labels');
		expect([...store.selection]).toEqual(['a']);
	});
});
