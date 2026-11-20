import { describe, expect, it } from 'vitest';
import { defaultInkDoc } from '../../src/leaflet/ink/model';
import type { InkArea, InkBox, InkDoc, InkItem, InkLayerDef, InkPath, InkStamp, InkText } from '../../src/leaflet/ink/model';
import { DEFAULT_STYLE, DEFAULT_TEXT_STYLE } from '../../src/leaflet/ink/styles';
import {
	copyStyle, deleteItems, deleteVertex, duplicateItems, fitBox, insertVertex, moveItems, moveVertex,
	pasteItems, pasteStyle, reorder, resizeItems, rotateItems, selectable, selectableIds, setLocked,
} from '../../src/leaflet/ink/transform';

function doc(items: InkItem[], layers?: InkLayerDef[]): InkDoc {
	return { version: 1, layers: layers ?? defaultInkDoc().layers, items };
}

const line = (id: string, points: [number, number][], extra: Partial<InkPath> = {}): InkPath => ({
	id, kind: 'path', layer: 'routes', scaleWithMap: true, points, style: { ...DEFAULT_STYLE }, ...extra,
});
const area = (id: string, points: [number, number][], extra: Partial<InkArea> = {}): InkArea => ({
	id, kind: 'area', layer: 'terrain', scaleWithMap: true, points, style: { ...DEFAULT_STYLE }, ...extra,
});
const stamp = (id: string, at: [number, number], extra: Partial<InkStamp> = {}): InkStamp => ({
	id, kind: 'stamp', layer: 'features', scaleWithMap: true, at, symbol: 'tree', size: 24, rotation: 0,
	color: '#2b2b2b', opacity: 1, ...extra,
});
const text = (id: string, at: [number, number], extra: Partial<InkText> = {}): InkText => ({
	id, kind: 'text', layer: 'labels', scaleWithMap: true, at, text: 'Hi', rotation: 0,
	style: { ...DEFAULT_TEXT_STYLE }, ...extra,
});
const box = (id: string, a: [number, number], b: [number, number], extra: Partial<InkBox> = {}): InkBox => ({
	id, kind: 'rect', layer: 'features', scaleWithMap: true, a, b, rotation: 0, style: { ...DEFAULT_STYLE }, ...extra,
});

function byId<T extends InkItem>(d: InkDoc, id: string): T {
	const found = d.items.find(i => i.id === id);
	if (!found) throw new Error(`no item ${id}`);
	return found as T;
}

function close(actual: number[], expected: number[], digits = 9): void {
	expect(actual.length).toBe(expected.length);
	actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits));
}

describe('selectability', () => {
	it('is false for locked, hidden, and items on locked or hidden layers', () => {
		const layers: InkLayerDef[] = [
			{ id: 'terrain', name: 'Terrain', visible: true, locked: false },
			{ id: 'routes', name: 'Routes', visible: true, locked: true },
			{ id: 'labels', name: 'Labels', visible: false, locked: false },
		];
		const d = doc([
			line('free', [[0, 0], [1, 1]], { layer: 'terrain' }),
			line('locked', [[0, 0], [1, 1]], { locked: true, layer: 'terrain' }),
			line('hidden', [[0, 0], [1, 1]], { hidden: true, layer: 'terrain' }),
			line('on-locked-layer', [[0, 0], [1, 1]], { layer: 'routes' }),
			text('on-hidden-layer', [0, 0]),
		], layers);
		expect(selectable(d, 'free')).toBe(true);
		expect(selectable(d, 'locked')).toBe(false);
		expect(selectable(d, 'hidden')).toBe(false);
		expect(selectable(d, 'on-locked-layer')).toBe(false);
		expect(selectable(d, 'on-hidden-layer')).toBe(false);
		expect(selectable(d, 'missing')).toBe(false);
		expect(selectableIds(d, ['locked', 'free', 'on-locked-layer'])).toEqual(['free']);
	});
});

describe('moveItems', () => {
	it('shifts every point of the selected items and nothing else', () => {
		const d = doc([
			stamp('s', [1, 1]),
			text('t', [2, 2]),
			line('p', [[0, 0], [1, 2]]),
			area('a', [[0, 0], [0, 1], [1, 1]]),
			box('b', [0, 0], [1, 1]),
			line('other', [[5, 5], [6, 6]]),
		]);
		const out = moveItems(d, ['s', 't', 'p', 'a', 'b'], 0.5, -1);
		close(byId<InkStamp>(out, 's').at, [1.5, 0]);
		close(byId<InkText>(out, 't').at, [2.5, 1]);
		close(byId<InkPath>(out, 'p').points[1], [1.5, 1]);
		close(byId<InkArea>(out, 'a').points[2], [1.5, 0]);
		close(byId<InkBox>(out, 'b').b, [1.5, 0]);
		close(byId<InkPath>(out, 'other').points[0], [5, 5]);
		// The input is not changed.
		close(byId<InkStamp>(d, 's').at, [1, 1]);
	});

	it('ignores locked items and returns the same document when nothing moves', () => {
		const d = doc([line('p', [[0, 0], [1, 1]], { locked: true })]);
		expect(moveItems(d, ['p'], 1, 1)).toBe(d);
		const free = doc([line('p', [[0, 0], [1, 1]])]);
		expect(moveItems(free, ['p'], 0, 0)).toBe(free);
	});
});

describe('fitBox and resizeItems', () => {
	const from = { minLat: 0, minLng: 0, maxLat: 10, maxLng: 20 };

	it('keeps the ratio on the axis that changed most, anchored on the side that did not move', () => {
		// Drag the max corner: to x 40 with y 10 (x doubled, y unchanged). Ratio keeps y at 2x: 20.
		const fitted = fitBox(from, { minLat: 0, minLng: 0, maxLat: 10, maxLng: 40 }, true);
		expect(fitted).toEqual({ minLat: 0, minLng: 0, maxLat: 20, maxLng: 40 });
		// Without the ratio the box is used as given.
		expect(fitBox(from, { minLat: 0, minLng: 0, maxLat: 10, maxLng: 40 }, false)).toEqual({ minLat: 0, minLng: 0, maxLat: 10, maxLng: 40 });
	});

	it('scales points about the anchor, stamp and text sizes, and box corners', () => {
		const d = doc([
			line('p', [[0, 0], [10, 20]]),
			stamp('s', [5, 10], { size: 20 }),
			text('t', [0, 0], { style: { ...DEFAULT_TEXT_STYLE, size: 10 } }),
			box('b', [0, 0], [10, 20]),
		]);
		// Double the box, anchored at its south-west corner.
		const to = { minLat: 0, minLng: 0, maxLat: 20, maxLng: 40 };
		const out = resizeItems(d, ['p', 's', 't', 'b'], from, to, false);
		close(byId<InkPath>(out, 'p').points[1], [20, 40]);
		close(byId<InkStamp>(out, 's').at, [10, 20]);
		expect(byId<InkStamp>(out, 's').size).toBeCloseTo(40, 9);
		expect(byId<InkText>(out, 't').style.size).toBeCloseTo(20, 9);
		close(byId<InkBox>(out, 'b').b, [20, 40]);
	});

	it('moves the north-east corner with a pointer that drags only one edge', () => {
		const d = doc([box('b', [0, 0], [10, 20])]);
		// Drag the east edge from 20 to 30: only longitude changes.
		const out = resizeItems(d, ['b'], from, { minLat: 0, minLng: 0, maxLat: 10, maxLng: 30 }, false);
		close(byId<InkBox>(out, 'b').b, [10, 30]);
		close(byId<InkBox>(out, 'b').a, [0, 0]);
	});

	it('clamps stamp size to the allowed range', () => {
		const d = doc([stamp('s', [5, 10], { size: 2 })]);
		const out = resizeItems(d, ['s'], from, { minLat: 5, minLng: 10, maxLat: 5.001, maxLng: 10.001 }, false);
		expect(byId<InkStamp>(out, 's').size).toBeGreaterThanOrEqual(1);
	});
});

describe('rotateItems', () => {
	it('adds to the rotation field of stamps, text and boxes', () => {
		const d = doc([stamp('s', [0, 0], { rotation: 350 }), box('b', [-1, -1], [1, 1], { rotation: 0 })]);
		const out = rotateItems(d, ['s', 'b'], [0, 0], 30);
		expect(byId<InkStamp>(out, 's').rotation).toBeCloseTo(20, 9);
		expect(byId<InkBox>(out, 'b').rotation).toBeCloseTo(30, 9);
	});

	it('turns clockwise on screen: a point east of the centre ends up south of it', () => {
		const d = doc([line('p', [[0, 1], [0, 2]])]);
		const out = rotateItems(d, ['p'], [0, 0], 90);
		close(byId<InkPath>(out, 'p').points[0], [-1, 0]);
		close(byId<InkPath>(out, 'p').points[1], [-2, 0]);
	});

	it('moves a stamp around a shared centre, and keeps its rotation field relative', () => {
		const d = doc([stamp('s', [0, 1], { rotation: 0 })]);
		const out = rotateItems(d, ['s'], [0, 0], 90);
		close(byId<InkStamp>(out, 's').at, [-1, 0]);
		expect(byId<InkStamp>(out, 's').rotation).toBeCloseTo(90, 9);
	});

	it('rotates a rectangle about its own centre without moving it', () => {
		const d = doc([box('b', [0, 0], [2, 4])]);
		const out = rotateItems(d, ['b'], [1, 2], 45);
		close(byId<InkBox>(out, 'b').a, [0, 0]);
		close(byId<InkBox>(out, 'b').b, [2, 4]);
		expect(byId<InkBox>(out, 'b').rotation).toBeCloseTo(45, 9);
	});
});

describe('vertices', () => {
	it('moves a vertex to a latlng', () => {
		const d = doc([line('p', [[0, 0], [1, 1], [2, 2]])]);
		const out = moveVertex(d, 'p', 1, [5, 6]);
		close(byId<InkPath>(out, 'p').points[1], [5, 6]);
		expect(moveVertex(d, 'p', 9, [5, 6])).toBe(d);
	});

	it('inserts a vertex after an index, including at the end of a closed area', () => {
		const d = doc([line('p', [[0, 0], [2, 2]]), area('a', [[0, 0], [0, 2], [2, 2]])]);
		const p = insertVertex(d, 'p', 0, [1, 1]);
		expect(byId<InkPath>(p, 'p').points).toEqual([[0, 0], [1, 1], [2, 2]]);
		const a = insertVertex(d, 'a', 2, [1, 1]);
		expect(byId<InkArea>(a, 'a').points.length).toBe(4);
		expect(byId<InkArea>(a, 'a').points[3]).toEqual([1, 1]);
	});

	it('deletes a vertex but keeps two points on a path and three on an area', () => {
		const d = doc([line('p', [[0, 0], [1, 1], [2, 2]]), area('a', [[0, 0], [0, 2], [2, 2], [2, 0]])]);
		expect(byId<InkPath>(deleteVertex(d, 'p', 1), 'p').points).toEqual([[0, 0], [2, 2]]);
		const twoLeft = deleteVertex(d, 'p', 1);
		expect(deleteVertex(twoLeft, 'p', 0)).toBe(twoLeft);
		expect(byId<InkArea>(deleteVertex(d, 'a', 0), 'a').points.length).toBe(3);
		const threeLeft = deleteVertex(d, 'a', 0);
		expect(deleteVertex(threeLeft, 'a', 0)).toBe(threeLeft);
	});

	it('ignores stamps and text', () => {
		const d = doc([stamp('s', [0, 0])]);
		expect(moveVertex(d, 's', 0, [1, 1])).toBe(d);
		expect(insertVertex(d, 's', 0, [1, 1])).toBe(d);
		expect(deleteVertex(d, 's', 0)).toBe(d);
	});
});

describe('duplicateItems and pasteItems', () => {
	it('copies with new ids, offsets them, keeps the layer and appends on top', () => {
		const d = doc([line('p', [[0, 0], [1, 1]], { layer: 'routes' }), stamp('s', [3, 3])]);
		const { doc: out, newIds } = duplicateItems(d, ['p', 's'], { dLat: 0.5, dLng: -0.5 });
		expect(newIds).toEqual(['path-1', 'stamp-1']);
		expect(out.items.map(i => i.id)).toEqual(['p', 's', 'path-1', 'stamp-1']);
		const copy = byId<InkPath>(out, 'path-1');
		expect(copy.layer).toBe('routes');
		close(copy.points[0], [0.5, -0.5]);
		close(byId<InkStamp>(out, 'stamp-1').at, [3.5, 2.5]);
		close(byId<InkPath>(out, 'p').points[0], [0, 0]);
	});

	it('does not copy locked or hidden items', () => {
		const d = doc([line('p', [[0, 0], [1, 1]], { locked: true })]);
		const { doc: out, newIds } = duplicateItems(d, ['p'], { dLat: 1, dLng: 1 });
		expect(newIds).toEqual([]);
		expect(out).toBe(d);
	});

	it('clears locked and hidden flags on pasted copies and uses the layer given', () => {
		const d = doc([line('p', [[0, 0], [1, 1]], { locked: true, hidden: true, layer: 'routes' })]);
		const source = d.items.slice();
		const { doc: out, newIds } = pasteItems(d, source, { dLat: 0, dLng: 0 }, 'labels');
		const copy = byId<InkPath>(out, newIds[0]);
		expect(copy.locked).toBeUndefined();
		expect(copy.hidden).toBeUndefined();
		expect(copy.layer).toBe('labels');
	});

	it('keeps style on copies', () => {
		const d = doc([line('p', [[0, 0], [1, 1]], { style: { ...DEFAULT_STYLE, stroke: '#123456', dash: 'dashed' } })]);
		const { doc: out, newIds } = duplicateItems(d, ['p'], { dLat: 1, dLng: 1 });
		expect(byId<InkPath>(out, newIds[0]).style.stroke).toBe('#123456');
		expect(byId<InkPath>(out, newIds[0]).style.dash).toBe('dashed');
	});
});

describe('reorder', () => {
	const ids = (d: InkDoc, layer?: string): string[] => d.items.filter(i => !layer || i.layer === layer).map(i => i.id);
	const base = (): InkDoc => doc([
		line('a', [[0, 0], [1, 1]]),
		line('b', [[0, 0], [1, 1]]),
		line('c', [[0, 0], [1, 1]]),
		line('d', [[0, 0], [1, 1]]),
	]);

	it('moves one step forward and backward past a neighbour', () => {
		expect(ids(reorder(base(), ['b'], 'forward'))).toEqual(['a', 'c', 'b', 'd']);
		expect(ids(reorder(base(), ['c'], 'backward'))).toEqual(['a', 'c', 'b', 'd']);
	});

	it('moves to the front and back of the layer', () => {
		expect(ids(reorder(base(), ['a', 'b'], 'front'))).toEqual(['c', 'd', 'a', 'b']);
		expect(ids(reorder(base(), ['c', 'd'], 'back'))).toEqual(['c', 'd', 'a', 'b']);
	});

	it('keeps a selection together when moving forward', () => {
		expect(ids(reorder(base(), ['a', 'b'], 'forward'))).toEqual(['c', 'a', 'b', 'd']);
	});

	it('works inside each layer and ignores other layers', () => {
		const d = doc([
			line('r1', [[0, 0], [1, 1]], { layer: 'routes' }),
			stamp('f1', [0, 0], { layer: 'features' }),
			line('r2', [[0, 0], [1, 1]], { layer: 'routes' }),
		]);
		const out = reorder(d, ['r1'], 'front');
		expect(ids(out, 'routes')).toEqual(['r2', 'r1']);
		expect(ids(out, 'features')).toEqual(['f1']);
		expect(ids(out).length).toBe(3);
	});

	it('does nothing when every target is locked', () => {
		const d = doc([line('a', [[0, 0], [1, 1]], { locked: true }), line('b', [[0, 0], [1, 1]])]);
		expect(reorder(d, ['a'], 'front')).toBe(d);
	});
});

describe('styles, locks and deletes', () => {
	it('copies a style from one family and pastes it only onto the same family', () => {
		const shape = line('p', [[0, 0], [1, 1]], { style: { ...DEFAULT_STYLE, stroke: '#00ff00' } });
		const clip = copyStyle(shape);
		expect(clip && clip.family).toBe('shape');
		const d = doc([
			line('target', [[0, 0], [1, 1]]),
			area('area', [[0, 0], [0, 1], [1, 1]]),
			text('label', [0, 0]),
			stamp('s', [0, 0]),
		]);
		const out = pasteStyle(d, ['target', 'area', 'label', 's'], clip!);
		expect(byId<InkPath>(out, 'target').style.stroke).toBe('#00ff00');
		expect(byId<InkArea>(out, 'area').style.stroke).toBe('#00ff00');
		expect(byId<InkText>(out, 'label').style).toEqual(DEFAULT_TEXT_STYLE);
		expect(byId<InkStamp>(out, 's').color).toBe('#2b2b2b');
	});

	it('copies and pastes stamp colour and text style', () => {
		const st = stamp('s', [0, 0], { color: '#ff0000', opacity: 0.5 });
		const clip = copyStyle(st);
		const d = doc([stamp('t', [0, 0])]);
		const out = pasteStyle(d, ['t'], clip!);
		expect(byId<InkStamp>(out, 't').color).toBe('#ff0000');
		expect(byId<InkStamp>(out, 't').opacity).toBe(0.5);
		const textClip = copyStyle(text('x', [0, 0], { style: { ...DEFAULT_TEXT_STYLE, font: 'mono' } }));
		expect(byId<InkText>(pasteStyle(doc([text('y', [0, 0])]), ['y'], textClip!), 'y').style.font).toBe('mono');
	});

	it('locks and unlocks, and deletes by id', () => {
		const d = doc([line('p', [[0, 0], [1, 1]]), line('q', [[0, 0], [1, 1]])]);
		const locked = setLocked(d, ['p'], true);
		expect(byId<InkPath>(locked, 'p').locked).toBe(true);
		expect(byId<InkPath>(setLocked(locked, ['p'], false), 'p').locked).toBeUndefined();
		expect(deleteItems(d, ['p']).items.map(i => i.id)).toEqual(['q']);
		expect(deleteItems(d, ['nope'])).toBe(d);
	});
});
