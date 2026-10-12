import { describe, expect, it } from 'vitest';
import {
	buildItem,
	buildScene,
	buildSelection,
	escapeXml,
	fmt,
	itemBounds,
	itemBox,
} from '../../src/leaflet/ink/svgBuild';
import type { InkSvgOptions, Projector } from '../../src/leaflet/ink/svgBuild';
import { defaultInkDoc, normalizeInk } from '../../src/leaflet/ink/model';
import type { DashStyle, InkArea, InkBox, InkDoc, InkItem, InkPath, InkStamp, InkStyle, InkText, InkTextStyle } from '../../src/leaflet/ink/model';
import { DEFAULT_STYLE, DEFAULT_TEXT_STYLE } from '../../src/leaflet/ink/styles';

/** Identity-like projector: latlng [lat, lng] maps to pixels (x = lng, y = lat) times 2. */
const project: Projector = p => ({ x: p[1] * 2, y: p[0] * 2 });
const opts: InkSvgOptions = { project, idPrefix: 't-' };

function style(patch: Partial<InkStyle> = {}): InkStyle {
	return { ...DEFAULT_STYLE, ...patch };
}

function textStyle(patch: Partial<InkTextStyle> = {}): InkTextStyle {
	return { ...DEFAULT_TEXT_STYLE, ...patch };
}

function pathItem(patch: Partial<InkPath> = {}): InkPath {
	return {
		id: 'p1', kind: 'path', layer: 'routes', scaleWithMap: true,
		points: [[0, 0], [10, 0], [10, 10]], style: style(), ...patch,
	} as InkPath;
}

function areaItem(patch: Partial<InkArea> = {}): InkArea {
	return {
		id: 'a1', kind: 'area', layer: 'terrain', scaleWithMap: true,
		points: [[0, 0], [10, 0], [10, 10], [0, 10]], style: style({ fill: '#3b82c4', fillOpacity: 0.4 }), ...patch,
	} as InkArea;
}

function stampItem(patch: Partial<InkStamp> = {}): InkStamp {
	return {
		id: 's1', kind: 'stamp', layer: 'features', scaleWithMap: true,
		at: [5, 5], symbol: 'door', size: 24, rotation: 0, color: '#8b5a2b', opacity: 1, ...patch,
	} as InkStamp;
}

function textItem(patch: Partial<InkText> = {}): InkText {
	return {
		id: 't1', kind: 'text', layer: 'labels', scaleWithMap: true,
		at: [5, 5], text: 'Hello', rotation: 0, style: textStyle(), ...patch,
	} as InkText;
}

function boxItem(kind: 'rect' | 'ellipse', patch: Partial<InkBox> = {}): InkBox {
	return {
		id: 'b1', kind, layer: 'features', scaleWithMap: true,
		a: [0, 0], b: [10, 20], rotation: 0, style: style({ fill: '#ffffff', fillOpacity: 0.5 }), ...patch,
	} as InkBox;
}

function groupOf(svg: string): string {
	const m = /^<g [^>]*>/.exec(svg);
	return m ? m[0] : '';
}

describe('escaping and numbers', () => {
	it('escapes markup characters in text and attributes', () => {
		expect(escapeXml(`<script>"a" & 'b'</script>`)).toBe('&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;');
	});

	it('formats numbers with at most two decimals and no negative zero', () => {
		expect(fmt(1.23456)).toBe('1.23');
		expect(fmt(-0)).toBe('0');
		expect(fmt(Number.NaN)).toBe('0');
		expect(fmt(10)).toBe('10');
	});

	it('never lets a hostile id or name break out of an attribute', () => {
		const item = pathItem({ id: 'x" onload="alert(1)', layer: '"><b>' });
		const svg = buildItem(item, opts);
		expect(svg).not.toContain('onload="alert');
		expect(svg).not.toContain('<b>');
		expect(svg).toContain('data-ink-id="x&quot; onload=&quot;alert(1)"');
	});

	it('drops unsafe colours and falls back to the default', () => {
		const svg = buildItem(pathItem({ style: style({ stroke: 'red" onload="x' }) }), opts);
		expect(svg).not.toContain('onload="x"');
		expect(svg).toContain('stroke="#2b2b2b"');
	});
});

describe('every kind', () => {
	const items: InkItem[] = [
		stampItem(),
		textItem(),
		pathItem(),
		pathItem({ id: 'f1', kind: 'freehand' }),
		areaItem(),
		boxItem('rect'),
		boxItem('ellipse', { id: 'e1' }),
	];

	it('wraps each item in a group with data-ink-id and its kind', () => {
		for (const item of items) {
			const svg = buildItem(item, opts);
			expect(svg, item.kind).toContain(`data-ink-id="${item.id}"`);
			expect(svg, item.kind).toContain(`data-ink-kind="${item.kind}"`);
			expect(svg.startsWith('<g ')).toBe(true);
			expect(svg.endsWith('</g>')).toBe(true);
		}
	});

	it('emits a wide transparent hit stroke for thin shapes', () => {
		for (const item of [pathItem(), areaItem(), boxItem('rect')]) {
			const svg = buildItem(item, opts);
			expect(svg).toContain('class="ink-hit"');
			expect(svg).toContain('stroke="transparent" stroke-width="12"');
			expect(svg).toContain('pointer-events:stroke');
		}
	});
});

describe('dash styles', () => {
	const styles: DashStyle[] = ['solid', 'dashed', 'dotted', 'double', 'wavy', 'ticked', 'railway'];

	it('gives every dash style its own geometry', () => {
		const bodies = styles.map(dash => {
			const svg = buildItem(pathItem({ style: style({ dash }) }), opts);
			return svg.replace(/data-ink-id="[^"]*"/, '');
		});
		expect(new Set(bodies).size).toBe(styles.length);
	});

	it('uses dash arrays for dashed and round zero-length dashes for dotted', () => {
		expect(buildItem(pathItem({ style: style({ dash: 'dashed' }) }), opts)).toMatch(/stroke-dasharray="[\d.]+ [\d.]+"/);
		const dotted = buildItem(pathItem({ style: style({ dash: 'dotted' }) }), opts);
		expect(dotted).toMatch(/stroke-dasharray="0 [\d.]+"/);
		expect(dotted).toContain('stroke-linecap="round"');
	});

	it('draws two lines for double, rails for railway and ticks for ticked', () => {
		const double = buildItem(pathItem({ style: style({ dash: 'double' }) }), opts);
		expect((double.match(/class="ink-stroke"/g) ?? []).length).toBe(2);
		const railway = buildItem(pathItem({ style: style({ dash: 'railway' }) }), opts);
		expect((railway.match(/class="ink-stroke"/g) ?? []).length).toBe(3);
		const ticked = buildItem(pathItem({ style: style({ dash: 'ticked' }) }), opts);
		expect((ticked.match(/class="ink-stroke"/g) ?? []).length).toBe(2);
	});

	it('uses a wave path for wavy', () => {
		const wavy = buildItem(pathItem({ style: style({ dash: 'wavy' }) }), opts);
		const solid = buildItem(pathItem({ style: style({ dash: 'solid' }) }), opts);
		expect(wavy.length).toBeGreaterThan(solid.length);
	});
});

describe('smoothing and arrowheads', () => {
	it('uses Catmull-Rom curves when smooth is set', () => {
		const smooth = buildItem(pathItem({ style: style({ smooth: true }) }), opts);
		const straight = buildItem(pathItem({ style: style({ smooth: false }) }), opts);
		expect(smooth).toMatch(/ d="M[^"]* C/);
		expect(straight).not.toMatch(/ d="M[^"]* C/);
	});

	it('defines one marker per colour and points the arrows at the ends', () => {
		const defs = new Map<string, string>();
		const svg = buildItem(pathItem({ style: style({ arrowEnd: true, arrowStart: true, stroke: '#112233' }) }), opts, defs);
		const markers = [...defs.values()].filter(v => v.startsWith('<marker'));
		expect(markers).toHaveLength(1);
		expect(markers[0]).toContain('fill="#112233"');
		expect(svg).toMatch(/marker-start="url\(#t-arw-[^)]+\)"/);
		expect(svg).toMatch(/marker-end="url\(#t-arw-[^)]+\)"/);
		// The carrier keeps the stroke width so arrowheads scale with the line.
		expect(svg).toMatch(/stroke="none" stroke-width="2" marker-start/);
	});

	it('adds no markers to closed shapes', () => {
		const defs = new Map<string, string>();
		buildItem(areaItem({ style: style({ arrowEnd: true }) }), opts, defs);
		expect([...defs.values()].filter(v => v.startsWith('<marker'))).toHaveLength(0);
	});
});

describe('fills and patterns', () => {
	it('fill none draws no fill layer', () => {
		const svg = buildItem(areaItem({ style: style({ fillPattern: 'none' }) }), opts);
		expect(svg).not.toContain('class="ink-fill"');
		expect(svg).not.toContain('url(#');
	});

	it('solid draws the base fill with no pattern', () => {
		const defs = new Map<string, string>();
		const svg = buildItem(areaItem({ style: style({ fillPattern: 'solid' }) }), opts, defs);
		expect(svg).toContain('class="ink-fill"');
		expect(svg).not.toContain('url(#');
		expect(defs.size).toBe(0);
	});

	it('hatch, crosshatch and dots add a pattern overlay', () => {
		for (const fillPattern of ['hatch', 'crosshatch', 'dots'] as const) {
			const defs = new Map<string, string>();
			const svg = buildItem(areaItem({ style: style({ fillPattern }) }), opts, defs);
			expect(svg, fillPattern).toMatch(/fill="url\(#t-pat-[^)]+\)"/);
			expect([...defs.values()].some(v => v.startsWith('<pattern'))).toBe(true);
		}
	});

	it('symbol patterns tile the symbol body in the pattern colour', () => {
		const defs = new Map<string, string>();
		buildItem(areaItem({ style: style({ fillPattern: 'symbol:tree', patternColor: '#2e5e3a' }) }), opts, defs);
		const pattern = [...defs.values()].find(v => v.startsWith('<pattern'));
		expect(pattern).toBeDefined();
		expect(pattern).toContain('color="#2e5e3a"');
		expect(pattern).toContain('scale(0.5)');
	});

	it('an unknown symbol pattern draws no overlay', () => {
		const svg = buildItem(areaItem({ style: style({ fillPattern: 'symbol:nope' }) }), opts);
		expect(svg).not.toContain('url(#');
	});

	it('reuses one pattern per pattern and colour, and makes a new one per colour', () => {
		const scene = buildScene(
			normalizeInk({
				layers: [{ id: 'terrain', name: 'T', visible: true, locked: false }],
				items: [
					areaItem({ id: 'a', style: style({ fillPattern: 'hatch', patternColor: '#111111' }) }),
					areaItem({ id: 'b', style: style({ fillPattern: 'hatch', patternColor: '#111111' }) }),
					areaItem({ id: 'c', style: style({ fillPattern: 'hatch', patternColor: '#222222' }) }),
				],
			}),
			opts,
		);
		const patterns = scene.defs.match(/<pattern /g) ?? [];
		expect(patterns).toHaveLength(2);
	});

	it('patternColor defaults to the stroke colour', () => {
		const defs = new Map<string, string>();
		buildItem(areaItem({ style: style({ fillPattern: 'dots', stroke: '#abcdef', patternColor: undefined }) }), opts, defs);
		expect([...defs.values()].join('')).toContain('fill="#abcdef"');
		expect(defs.size).toBe(1);
	});

	it('applies fill and stroke opacity', () => {
		const svg = buildItem(areaItem({ style: style({ fillPattern: 'solid', fillOpacity: 0.25, strokeOpacity: 0.5 }) }), opts);
		expect(svg).toContain('fill-opacity="0.25"');
		expect(svg).toContain('stroke-opacity="0.5"');
	});
});

describe('text', () => {
	it('draws a halo with paint-order stroke and one tspan per line', () => {
		const svg = buildItem(textItem({ text: 'One\nTwo\nThree', style: textStyle({ halo: '#ffffff', haloWidth: 2 }) }), opts);
		expect(svg).toContain('paint-order="stroke"');
		expect(svg).toContain('stroke="#ffffff" stroke-width="4"');
		expect((svg.match(/<tspan /g) ?? []).length).toBe(3);
		expect(svg).toContain('>One</tspan>');
	});

	it('turns the halo off with an empty halo colour', () => {
		const svg = buildItem(textItem({ style: textStyle({ halo: '' }) }), opts);
		expect(svg).toContain('stroke="none"');
	});

	it('maps font families to CSS stacks with fallbacks', () => {
		const fonts: InkTextStyle['font'][] = ['serif', 'sans', 'hand', 'mono'];
		const stacks = fonts.map(font => buildItem(textItem({ style: textStyle({ font }) }), opts));
		expect(stacks[0]).toContain('var(--font-text-theme, Georgia)');
		expect(stacks[1]).toContain('var(--font-interface-theme');
		expect(stacks[2]).toContain('cursive');
		expect(stacks[3]).toContain('monospace');
		expect(new Set(stacks.map(s => s.match(/font-family[^>]*/)?.[0])).size).toBe(4);
	});

	it('bold, italic, letter spacing and alignment', () => {
		const svg = buildItem(textItem({ style: textStyle({ bold: true, italic: true, letterSpacing: 0.1, size: 20, align: 'end' }) }), opts);
		expect(svg).toContain('font-weight="700"');
		expect(svg).toContain('font-style="italic"');
		expect(svg).toContain('letter-spacing="2"');
		expect(svg).toContain('text-anchor="end"');
	});

	it('rotates around the anchor', () => {
		const svg = buildItem(textItem({ rotation: 30 }), opts);
		expect(svg).toContain('<g transform="rotate(30)">');
		expect(svg).toContain('transform="translate(10 10)"');
	});

	it('escapes text content', () => {
		const svg = buildItem(textItem({ text: '<b>&</b>' }), opts);
		expect(svg).toContain('&lt;b&gt;&amp;&lt;/b&gt;');
	});
});

describe('stamps', () => {
	it('draws the body twice: a halo pass in the paper colour, then the real colour', () => {
		const svg = buildItem(stampItem(), opts);
		const halo = svg.indexOf('color="#f4ecd8"');
		const real = svg.indexOf('color="#8b5a2b"');
		expect(halo).toBeGreaterThan(0);
		expect(real).toBeGreaterThan(halo);
		expect(svg).toContain('stroke-width="4.75"');
	});

	it('draws no halo when the halo colour is empty', () => {
		const svg = buildItem(stampItem(), { ...opts, stampHalo: '' });
		expect(svg).not.toContain('color="#f4ecd8"');
		expect(svg.match(/stroke-linejoin="round" color=/g)?.length).toBe(1);
	});

	it('applies size, rotation and opacity', () => {
		const svg = buildItem(stampItem({ size: 48, rotation: 45, opacity: 0.5 }), opts);
		expect(svg).toContain('rotate(45) scale(2) translate(-12 -12)');
		expect(svg).toContain('opacity="0.5"');
	});

	it('keep-size stamps carry a counter-scale hook and no map scaling', () => {
		const svg = buildItem(stampItem({ scaleWithMap: false, at: [5, 5], size: 16 }), opts);
		expect(svg).toContain('data-ink-counter="1"');
		expect(svg).toContain('data-ink-at="10 10"');
		expect(svg).toContain('scale(0.67) translate(-12 -12)');
	});

	it('an unknown symbol draws a placeholder rather than disappearing', () => {
		const svg = buildItem(stampItem({ symbol: 'no-such-symbol' }), opts);
		expect(svg).toContain('stroke-dasharray="2 2"');
	});

	it('has a title for tooltips', () => {
		const svg = buildItem(stampItem({ name: 'Old tower' }), opts);
		expect(svg).toContain('<title>Old tower</title>');
	});
});

describe('keep-size strokes', () => {
	it('use non-scaling strokes, and scaled strokes do not', () => {
		const keep = buildItem(pathItem({ scaleWithMap: false }), opts);
		expect(/class="ink-stroke"[^>]*vector-effect/.test(keep)).toBe(true);
		const scaled = buildItem(pathItem({ scaleWithMap: true }), opts);
		expect(/class="ink-stroke"[^>]*vector-effect/.test(scaled)).toBe(false);
	});

	it('keep-size text gets the counter hook', () => {
		const svg = buildItem(textItem({ scaleWithMap: false, at: [1, 2] }), opts);
		expect(svg).toContain('data-ink-counter="1"');
	});
});

describe('hit areas and read-only', () => {
	it('read-only items with no location get no hit areas and take no pointer input', () => {
		const svg = buildItem(pathItem(), { ...opts, readOnly: true });
		expect(groupOf(svg)).toContain('pointer-events:none');
		expect(svg).not.toContain('class="ink-hit"');
	});

	it('read-only items with a location keep their hit areas', () => {
		const svg = buildItem(stampItem({ locationId: 'loc-1' }), { ...opts, readOnly: true });
		expect(groupOf(svg)).toContain('pointer-events:visiblePainted');
		expect(svg).toContain('class="ink-hit"');
	});

	it('edit mode gives every item hit areas', () => {
		expect(buildItem(stampItem(), opts)).toContain('class="ink-hit"');
		expect(buildItem(textItem(), opts)).toContain('class="ink-hit"');
	});
});

describe('scene', () => {
	const doc = (): InkDoc => normalizeInk({
		layers: [
			{ id: 'terrain', name: 'Terrain', visible: true, locked: false },
			{ id: 'routes', name: 'Routes', visible: true, locked: false },
			{ id: 'hidden', name: 'Hidden', visible: false, locked: false },
		],
		items: [
			pathItem({ id: 'r1', layer: 'routes' }),
			areaItem({ id: 'a1', layer: 'terrain' }),
			pathItem({ id: 'r2', layer: 'routes' }),
			pathItem({ id: 'hid', layer: 'hidden' }),
			pathItem({ id: 'hitem', layer: 'routes', hidden: true }),
		],
	});

	it('orders items by layer, then by document order', () => {
		const scene = buildScene(doc(), opts);
		expect(scene.items.map(i => i.id)).toEqual(['a1', 'r1', 'r2']);
	});

	it('leaves out hidden layers and hidden items', () => {
		const ids = buildScene(doc(), opts).items.map(i => i.id);
		expect(ids).not.toContain('hid');
		expect(ids).not.toContain('hitem');
	});

	it('returns defs once for the whole scene', () => {
		const scene = buildScene(normalizeInk({
			layers: [{ id: 'terrain', name: 'T', visible: true, locked: false }],
			items: [areaItem({ id: 'a', style: style({ fillPattern: 'crosshatch' }) })],
		}), opts);
		expect(scene.defs).toContain('<pattern');
	});

	it('skips items with nothing to draw', () => {
		const scene = buildScene({
			...defaultInkDoc(),
			items: [pathItem({ id: 'short', points: [[1, 1]] })],
		}, opts);
		expect(scene.items).toHaveLength(0);
	});
});

describe('bounds and selection', () => {
	it('stamp bounds are a square around the anchor', () => {
		const b = itemBounds(stampItem({ size: 24 }), project);
		expect(b).toEqual({ minX: 10 - 12, minY: 10 - 12, maxX: 10 + 12, maxY: 10 + 12 });
	});

	it('path bounds cover all points', () => {
		expect(itemBounds(pathItem(), project)).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
	});

	it('text bounds contain the anchor for start and end alignment', () => {
		const left = itemBox(textItem({ style: textStyle({ align: 'start' }) }), project);
		const right = itemBox(textItem({ style: textStyle({ align: 'end' }) }), project);
		expect(left?.rect.minX).toBe(10);
		expect(right?.rect.maxX).toBe(10);
	});

	it('a rotated box reports rotated bounds', () => {
		const flat = itemBounds(boxItem('rect', { a: [0, 0], b: [0, 10] }), project);
		const turned = itemBounds(boxItem('rect', { a: [0, 0], b: [0, 10], rotation: 90 }), project);
		expect(flat).not.toEqual(turned);
	});

	it('a single stamp selection has eight handles and a rotate handle', () => {
		const svg = buildSelection([stampItem()], { project, scale: 1 });
		for (const name of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
			expect(svg).toContain(`data-ink-handle="${name}"`);
		}
		expect(svg).toContain('data-ink-handle="rotate"');
	});

	it('handles keep a constant screen size: they shrink in reference pixels as the scale grows', () => {
		const at1 = buildSelection([stampItem()], { project, scale: 1 });
		const at4 = buildSelection([stampItem()], { project, scale: 4 });
		expect(at1).toContain('width="8" height="8"');
		expect(at4).toContain('width="2" height="2"');
	});

	it('a single path selection has a vertex per point and a midpoint ghost per segment', () => {
		const open = buildSelection([pathItem()], { project, scale: 1 });
		expect((open.match(/data-ink-vertex=/g) ?? []).length).toBe(3);
		expect((open.match(/data-ink-mid=/g) ?? []).length).toBe(2);
		const closed = buildSelection([areaItem()], { project, scale: 1 });
		expect((closed.match(/data-ink-mid=/g) ?? []).length).toBe(4);
	});

	it('a multi-selection has no rotate handle and no vertices', () => {
		const svg = buildSelection([stampItem(), pathItem()], { project, scale: 1 });
		expect(svg).not.toContain('data-ink-handle="rotate"');
		expect(svg).not.toContain('data-ink-vertex');
	});

	it('an empty selection draws nothing', () => {
		expect(buildSelection([], { project, scale: 1 })).toBe('');
	});
});

describe('brushes in the item markup', () => {
	it('draws a brush instead of the dash style, with the hit stroke unchanged', () => {
		const svg = buildItem(pathItem({ style: style({ dash: 'dotted', brush: 'cliff', stroke: '#5c4a3a' }) }), opts);
		expect(svg).toContain('class="ink-brush" data-brush="cliff"');
		expect(svg).not.toContain('class="ink-stroke"');
		expect(svg).toContain('stroke="#5c4a3a"');
		expect(svg).toContain('stroke="transparent" stroke-width="12"');
		expect(svg).toContain('pointer-events:stroke');
	});

	it('keeps the item id and kind on the group', () => {
		const svg = buildItem(pathItem({ id: 'road-9', style: style({ brush: 'road' }) }), opts);
		expect(svg).toContain('data-ink-id="road-9"');
		expect(svg).toContain('data-ink-kind="path"');
	});

	it('falls back to the dash style for an unknown brush id', () => {
		const svg = buildItem(pathItem({ style: style({ dash: 'dashed', brush: 'no-such-brush' }) }), opts);
		expect(svg).not.toContain('ink-brush');
		expect(svg).toContain('class="ink-stroke"');
		expect(svg).toMatch(/stroke-dasharray="[\d.]+ [\d.]+"/);
	});

	it('changes the markup when the brush flips or the scale changes', () => {
		const base = buildItem(pathItem({ style: style({ brush: 'cliff' }) }), opts);
		const flipped = buildItem(pathItem({ style: style({ brush: 'cliff', brushFlip: true }) }), opts);
		const scaled = buildItem(pathItem({ style: style({ brush: 'cliff', brushScale: 2 }) }), opts);
		expect(flipped).not.toBe(base);
		expect(scaled).not.toBe(base);
	});

	it('uses the item opacity on brush strokes', () => {
		const svg = buildItem(pathItem({ style: style({ brush: 'wall', strokeOpacity: 0.5 }) }), opts);
		expect(svg).toContain('stroke-opacity="0.5"');
	});

	it('outlines an area with its brush and leaves the fill alone', () => {
		const fillStyle = { fill: '#3b82c4', fillOpacity: 0.4, stroke: '#5c4a3a', fillPattern: 'hatch' as const };
		const plain = buildItem(areaItem({ style: style(fillStyle) }), opts);
		const rocky = buildItem(areaItem({ style: style({ ...fillStyle, brush: 'rocky-shore' }) }), opts);
		expect(rocky).toContain('class="ink-brush" data-brush="rocky-shore"');
		const fillOf = (svg: string): string | undefined => svg.match(/<path class="ink-fill"[^>]*>/)?.[0];
		expect(fillOf(rocky)).toBeDefined();
		expect(fillOf(rocky)).toBe(fillOf(plain));
		expect(rocky).not.toContain('class="ink-stroke"');
	});

	it('draws brushes on rectangles and ellipses too', () => {
		expect(buildItem(boxItem('rect', { style: style({ brush: 'palisade' }) }), opts)).toContain('data-brush="palisade"');
		expect(buildItem(boxItem('ellipse', { style: style({ brush: 'unexplored' }) }), opts)).toContain('data-brush="unexplored"');
	});

	it('shows brushes in previews through buildItem and in the scene', () => {
		const scene = buildScene(defaultInkDoc(), opts);
		expect(scene.items).toEqual([]);
		const doc = normalizeInk({ layers: defaultInkDoc().layers, items: [pathItem({ style: style({ brush: 'trail' }) })] });
		expect(buildScene(doc, opts).items[0].svg).toContain('data-brush="trail"');
	});

	it('keeps brush strokes non-scaling for keep-size items', () => {
		const svg = buildItem(pathItem({ scaleWithMap: false, style: style({ brush: 'stream' }) }), opts);
		expect(svg).toContain('vector-effect="non-scaling-stroke"');
	});

	it('follows smoothed curves when a brush and smoothing are both set', () => {
		const smooth = buildItem(pathItem({ points: [[0, 0], [10, 10], [20, 0], [30, 10]], style: style({ brush: 'wall', smooth: true }) }), opts);
		const sharp = buildItem(pathItem({ points: [[0, 0], [10, 10], [20, 0], [30, 10]], style: style({ brush: 'wall', smooth: false }) }), opts);
		expect(smooth.length).toBeGreaterThan(sharp.length);
	});
});
