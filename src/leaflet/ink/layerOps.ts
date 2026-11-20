/**
 * Pure layer operations for Map Ink. Each helper takes a document and returns a
 * new one; the input is never changed. Layers are listed bottom first: the last
 * layer is drawn on top and is shown first in the layers panel.
 *
 * A document always keeps at least one layer. Deleting the last layer does
 * nothing, and an unknown layer id leaves the document as it was.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type { InkDoc, InkLayerDef } from './model';
import type { InkStoreLike } from './storeTypes';

/** The layer operations the store offers the layers panel and the legend. */
export interface InkLayerStoreLike extends InkStoreLike {
	addLayer(name: string): string;           // returns new id, added on top
	renameLayer(id: string, name: string): void;
	moveLayer(id: string, toIndex: number): void;
	setLayerVisible(id: string, visible: boolean): void;
	setLayerLocked(id: string, locked: boolean): void;
	deleteLayer(id: string): void;            // items move to the layer below (or the next one)
	activeLayer(): string;
	setActiveLayer(id: string): void;
}

const NAME_LIMIT = 200;
const ID_LIMIT = 64;
const FALLBACK_NAME = 'Layer';

function cleanName(name: string): string {
	return name.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT);
}

function indexOfLayer(doc: InkDoc, id: string): number {
	return doc.layers.findIndex(layer => layer.id === id);
}

/** A layer id from a name, unique among the layers in `doc`. */
function freshLayerId(doc: InkDoc, name: string): string {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
	const base = `layer-${slug || 'new'}`.slice(0, ID_LIMIT);
	const used = new Set(doc.layers.map(layer => layer.id));
	if (!used.has(base)) return base;
	for (let n = 2; ; n++) {
		const id = `${base}-${n}`;
		if (!used.has(id)) return id;
	}
}

/** Returns a copy of `doc` with `layers` replaced. Items are copied so the input stays unchanged. */
function withLayers(doc: InkDoc, layers: InkLayerDef[]): InkDoc {
	return { version: 1, layers, items: doc.items.map(item => ({ ...item })) as InkDoc['items'] };
}

/**
 * Adds a layer on top of the stack. A blank name becomes "Layer". Returns the new
 * document and the new layer's id.
 */
export function addLayer(doc: InkDoc, name: string): { doc: InkDoc; id: string } {
	const label = cleanName(name) || FALLBACK_NAME;
	const id = freshLayerId(doc, label);
	const layer: InkLayerDef = { id, name: label, visible: true, locked: false };
	return { doc: withLayers(doc, [...doc.layers, layer]), id };
}

/** Renames a layer. A blank name, or an unknown id, leaves the document as it was. */
export function renameLayer(doc: InkDoc, id: string, name: string): InkDoc {
	const index = indexOfLayer(doc, id);
	const label = cleanName(name);
	if (index < 0 || !label) return withLayers(doc, doc.layers.map(l => ({ ...l })));
	const layers = doc.layers.map((layer, i) => (i === index ? { ...layer, name: label } : { ...layer }));
	return withLayers(doc, layers);
}

/**
 * Moves a layer to `toIndex` in the final stack (0 is the bottom). The index is
 * clamped to the valid range. Items keep their layer.
 */
export function moveLayer(doc: InkDoc, id: string, toIndex: number): InkDoc {
	const from = indexOfLayer(doc, id);
	const copies = doc.layers.map(l => ({ ...l }));
	if (from < 0 || !Number.isFinite(toIndex)) return withLayers(doc, copies);
	const target = Math.min(copies.length - 1, Math.max(0, Math.trunc(toIndex)));
	const [layer] = copies.splice(from, 1);
	copies.splice(target, 0, layer);
	return withLayers(doc, copies);
}

/** Shows or hides a layer. */
export function setLayerVisible(doc: InkDoc, id: string, visible: boolean): InkDoc {
	return setFlag(doc, id, 'visible', visible);
}

/** Locks or unlocks a layer. */
export function setLayerLocked(doc: InkDoc, id: string, locked: boolean): InkDoc {
	return setFlag(doc, id, 'locked', locked);
}

function setFlag(doc: InkDoc, id: string, key: 'visible' | 'locked', value: boolean): InkDoc {
	const layers = doc.layers.map(layer => (layer.id === id ? { ...layer, [key]: value } : { ...layer }));
	return withLayers(doc, layers);
}

/**
 * The layer that receives the items of `id` when it is deleted: the layer below
 * it, or the layer above when it is the bottom one. Undefined when `id` is the
 * only layer or is unknown.
 */
export function deleteTargetLayer(doc: InkDoc, id: string): InkLayerDef | undefined {
	const index = indexOfLayer(doc, id);
	if (index < 0 || doc.layers.length < 2) return undefined;
	return index > 0 ? doc.layers[index - 1] : doc.layers[index + 1];
}

/**
 * Deletes a layer. Its items move to the layer below (or the layer above when it
 * is the bottom one). Refuses to delete the last layer.
 */
export function deleteLayer(doc: InkDoc, id: string): InkDoc {
	const target = deleteTargetLayer(doc, id);
	if (!target) return withLayers(doc, doc.layers.map(l => ({ ...l })));
	const layers = doc.layers.filter(layer => layer.id !== id).map(l => ({ ...l }));
	const items = doc.items.map(item => (item.layer === id ? { ...item, layer: target.id } : { ...item })) as InkDoc['items'];
	return { version: 1, layers, items };
}

/** How many items sit on a layer. */
export function layerItemCount(doc: InkDoc, id: string): number {
	let count = 0;
	for (const item of doc.items) if (item.layer === id) count++;
	return count;
}
