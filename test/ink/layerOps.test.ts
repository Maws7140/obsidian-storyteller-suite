import { describe, expect, it } from 'vitest';
import {
	addLayer,
	deleteLayer,
	deleteTargetLayer,
	layerItemCount,
	moveLayer,
	renameLayer,
	setLayerLocked,
	setLayerVisible,
} from '../../src/leaflet/ink/layerOps';
import { defaultInkDoc, normalizeInk } from '../../src/leaflet/ink/model';
import type { InkDoc, InkItem } from '../../src/leaflet/ink/model';

function stamp(id: string, layer: string): InkItem {
	return {
		id,
		kind: 'stamp',
		layer,
		scaleWithMap: true,
		at: [1, 2],
		symbol: 'tree',
		size: 24,
		rotation: 0,
		color: '#2b2b2b',
		opacity: 1,
	};
}

/** Four default layers: terrain, routes, features, labels (bottom first). */
function docWithItems(): InkDoc {
	return {
		...defaultInkDoc(),
		items: [stamp('s1', 'terrain'), stamp('s2', 'features'), stamp('s3', 'features'), stamp('s4', 'labels')],
	};
}

const names = (doc: InkDoc): string[] => doc.layers.map(l => l.id);

describe('addLayer', () => {
	it('adds a visible, unlocked layer on top and returns its id', () => {
		const before = defaultInkDoc();
		const { doc, id } = addLayer(before, 'Ruins');
		expect(names(doc)).toEqual(['terrain', 'routes', 'features', 'labels', id]);
		expect(doc.layers[doc.layers.length - 1]).toEqual({ id, name: 'Ruins', visible: true, locked: false });
		expect(id).toBe('layer-ruins');
	});

	it('does not change the input document', () => {
		const before = defaultInkDoc();
		addLayer(before, 'Ruins');
		expect(before.layers).toHaveLength(4);
	});

	it('uses Layer as the name when the name is blank', () => {
		const { doc, id } = addLayer(defaultInkDoc(), '   ');
		expect(doc.layers[4].name).toBe('Layer');
		expect(id).toBe('layer-layer');
	});

	it('keeps ids unique when the name repeats an existing layer', () => {
		const first = addLayer(defaultInkDoc(), 'Terrain');
		const second = addLayer(first.doc, 'Terrain');
		const ids = second.doc.layers.map(l => l.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(second.id).not.toBe(first.id);
	});

	it('gives a layer with an unusable name a safe id', () => {
		const { id } = addLayer(defaultInkDoc(), '!!! ???');
		expect(id).toMatch(/^[a-z0-9-]+$/);
	});
});

describe('renameLayer', () => {
	it('trims and collapses spaces in the new name', () => {
		const doc = renameLayer(defaultInkDoc(), 'routes', '  Roads   and rivers ');
		expect(doc.layers.find(l => l.id === 'routes')?.name).toBe('Roads and rivers');
	});

	it('ignores a blank name', () => {
		const doc = renameLayer(defaultInkDoc(), 'routes', '   ');
		expect(doc.layers.find(l => l.id === 'routes')?.name).toBe('Routes');
	});

	it('ignores an unknown id', () => {
		const doc = renameLayer(defaultInkDoc(), 'nope', 'Anything');
		expect(names(doc)).toEqual(names(defaultInkDoc()));
		expect(doc.layers.map(l => l.name)).toEqual(['Terrain', 'Routes', 'Features', 'Labels']);
	});

	it('keeps the id, so items still belong to the layer', () => {
		const doc = renameLayer(docWithItems(), 'features', 'Dungeon');
		expect(doc.items.filter(i => i.layer === 'features')).toHaveLength(2);
	});
});

describe('moveLayer', () => {
	it('moves a layer up the stack', () => {
		const doc = moveLayer(defaultInkDoc(), 'terrain', 2);
		expect(names(doc)).toEqual(['routes', 'features', 'terrain', 'labels']);
	});

	it('moves a layer down the stack', () => {
		const doc = moveLayer(defaultInkDoc(), 'labels', 0);
		expect(names(doc)).toEqual(['labels', 'terrain', 'routes', 'features']);
	});

	it('clamps the target index to the stack', () => {
		expect(names(moveLayer(defaultInkDoc(), 'routes', 99))).toEqual(['terrain', 'features', 'labels', 'routes']);
		expect(names(moveLayer(defaultInkDoc(), 'routes', -5))).toEqual(['routes', 'terrain', 'features', 'labels']);
	});

	it('leaves the order alone when the layer is already there', () => {
		expect(names(moveLayer(defaultInkDoc(), 'routes', 1))).toEqual(names(defaultInkDoc()));
	});

	it('ignores an unknown id and a non-finite index', () => {
		expect(names(moveLayer(defaultInkDoc(), 'nope', 0))).toEqual(names(defaultInkDoc()));
		expect(names(moveLayer(defaultInkDoc(), 'routes', Number.NaN))).toEqual(names(defaultInkDoc()));
	});

	it('keeps items on their layers', () => {
		const doc = moveLayer(docWithItems(), 'features', 0);
		expect(doc.items.map(i => i.layer)).toEqual(['terrain', 'features', 'features', 'labels']);
	});
});

describe('visibility and lock', () => {
	it('hides and shows a layer', () => {
		const hidden = setLayerVisible(defaultInkDoc(), 'routes', false);
		expect(hidden.layers[1].visible).toBe(false);
		expect(setLayerVisible(hidden, 'routes', true).layers[1].visible).toBe(true);
	});

	it('locks and unlocks a layer without touching the others', () => {
		const locked = setLayerLocked(defaultInkDoc(), 'labels', true);
		expect(locked.layers.map(l => l.locked)).toEqual([false, false, false, true]);
		expect(setLayerLocked(locked, 'labels', false).layers[3].locked).toBe(false);
	});

	it('does not change the input document', () => {
		const before = defaultInkDoc();
		setLayerVisible(before, 'routes', false);
		expect(before.layers[1].visible).toBe(true);
	});
});

describe('deleteLayer', () => {
	it('moves the items to the layer below', () => {
		const doc = deleteLayer(docWithItems(), 'features');
		expect(names(doc)).toEqual(['terrain', 'routes', 'labels']);
		expect(doc.items.map(i => i.layer)).toEqual(['terrain', 'routes', 'routes', 'labels']);
	});

	it('moves the items of the bottom layer to the layer above', () => {
		const withBottom: InkDoc = { ...defaultInkDoc(), items: [stamp('s1', 'terrain')] };
		const doc = deleteLayer(withBottom, 'terrain');
		expect(names(doc)).toEqual(['routes', 'features', 'labels']);
		expect(doc.items[0].layer).toBe('routes');
	});

	it('refuses to delete the last layer', () => {
		const single: InkDoc = { version: 1, layers: [{ id: 'only', name: 'Only', visible: true, locked: false }], items: [stamp('s1', 'only')] };
		const doc = deleteLayer(single, 'only');
		expect(doc.layers).toHaveLength(1);
		expect(doc.items[0].layer).toBe('only');
	});

	it('ignores an unknown id', () => {
		expect(names(deleteLayer(docWithItems(), 'nope'))).toEqual(names(defaultInkDoc()));
	});

	it('names the layer that will receive the items', () => {
		expect(deleteTargetLayer(defaultInkDoc(), 'features')?.id).toBe('routes');
		expect(deleteTargetLayer(defaultInkDoc(), 'terrain')?.id).toBe('routes');
		expect(deleteTargetLayer({ ...defaultInkDoc(), layers: [defaultInkDoc().layers[0]] }, 'terrain')).toBeUndefined();
		expect(deleteTargetLayer(defaultInkDoc(), 'nope')).toBeUndefined();
	});

	it('does not change the input document', () => {
		const before = docWithItems();
		deleteLayer(before, 'features');
		expect(before.layers).toHaveLength(4);
		expect(before.items[1].layer).toBe('features');
	});
});

describe('layerItemCount', () => {
	it('counts the items on a layer', () => {
		expect(layerItemCount(docWithItems(), 'features')).toBe(2);
		expect(layerItemCount(docWithItems(), 'routes')).toBe(0);
	});
});

describe('results stay valid documents', () => {
	it('every operation output survives normalizeInk unchanged', () => {
		let doc = docWithItems();
		doc = addLayer(doc, 'Ruins').doc;
		doc = moveLayer(doc, 'terrain', 3);
		doc = renameLayer(doc, 'routes', 'Roads');
		doc = setLayerVisible(doc, 'labels', false);
		doc = setLayerLocked(doc, 'features', true);
		doc = deleteLayer(doc, 'features');
		expect(normalizeInk(doc)).toEqual(doc);
		expect(doc.layers.length).toBeGreaterThan(0);
	});
});
