import { describe, expect, it } from 'vitest';
import {
  INK_FRONTMATTER_KEY,
  decodePoints,
  defaultInkDoc,
  encodePoints,
  inkFrontmatter,
  isValidColor,
  nextInkId,
  normalizeInk,
} from '../../src/leaflet/ink/model';
import type { InkDoc, InkItem } from '../../src/leaflet/ink/model';
import { DEFAULT_STYLE } from '../../src/leaflet/ink/styles';

/** Seeded PRNG (mulberry32) so fuzz failures reproduce. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = [
  'kind', 'id', 'layer', 'layers', 'items', 'points', 'at', 'a', 'b', 'size', 'rotation', 'color', 'opacity',
  'symbol', 'text', 'style', 'textStyle', 'name', 'locationId', 'label', 'scaleWithMap', 'locked', 'hidden',
  'stroke', 'strokeWidth', 'strokeOpacity', 'dash', 'fill', 'fillOpacity', 'fillPattern', 'patternColor',
  'smooth', 'arrowStart', 'arrowEnd', 'font', 'halo', 'haloWidth', 'bold', 'italic', 'letterSpacing', 'align',
  'visible', 'version', 'mapInk',
];
const KINDS = ['stamp', 'text', 'path', 'area', 'freehand', 'rect', 'ellipse', 'bogus', 'Stamp', ''];
const STRINGS = [
  '', ' ', 'abc', '#fff', '#FFFFFF', '#12345', 'rgb(1,2,3)', 'rgba(0, 0, 0, 0.5)', 'rgb(300,0,0)', 'red',
  'Tomato', 'javascript:alert(1)', 'symbol:wave', 'symbol:', 'none', 'hatch', 'serif', 'wavy', 'L1', 'routes',
  '1,2 3,4 5,6', '10,10 20', 'NaN,1', '\u0000\u0007bell\r\n tab\t', 'x'.repeat(2500), '\u2014 dash', '  spaced  ',
];

function garbage(r: () => number, depth: number): unknown {
  const roll = r();
  if (depth > 3 || roll < 0.45) {
    const pick = Math.floor(r() * 12);
    switch (pick) {
      case 0: return undefined;
      case 1: return null;
      case 2: return NaN;
      case 3: return Infinity;
      case 4: return -0;
      case 5: return (r() - 0.5) * 1e6;
      case 6: return Math.floor(r() * 400) - 100;
      case 7: return r() < 0.5;
      case 8: return 'a';
      default: return STRINGS[Math.floor(r() * STRINGS.length)];
    }
  }
  if (roll < 0.6) {
    const n = Math.floor(r() * 4);
    return Array.from({ length: n }, () => garbage(r, depth + 1));
  }
  const obj: Record<string, unknown> = {};
  const n = Math.floor(r() * 12);
  for (let i = 0; i < n; i++) obj[KEYS[Math.floor(r() * KEYS.length)]] = garbage(r, depth + 1);
  return obj;
}

function plausibleItem(r: () => number): Record<string, unknown> {
  const kind = KINDS[Math.floor(r() * 7)];
  const pts = (n: number) => Array.from({ length: n }, () => [r() * 2000 - 500, r() * 2000 - 500]);
  const style = {
    stroke: r() < 0.5 ? '#3b82c4' : 'tomato',
    strokeWidth: r() * 300 - 50,
    strokeOpacity: r() * 3 - 1,
    dash: ['solid', 'wavy', 'nope'][Math.floor(r() * 3)],
    fill: r() < 0.3 ? 'none' : '#abcdef',
    fillOpacity: r() * 2,
    fillPattern: r() < 0.5 ? 'symbol:tree' : 'hatch',
    smooth: r() < 0.5,
  };
  const base = {
    id: r() < 0.2 ? 'dup' : (r() < 0.2 ? '' : `id-${Math.floor(r() * 50)}`),
    kind,
    layer: r() < 0.2 ? 'missing' : ['terrain', 'routes', 'features', 'labels'][Math.floor(r() * 4)],
    scaleWithMap: r() < 0.7,
    name: r() < 0.3 ? '  Name  ' : undefined,
  };
  if (kind === 'stamp') return { ...base, at: pts(1)[0], symbol: 'tree', size: r() * 3000, rotation: r() * 1000 - 200, color: '#abc', opacity: r() * 2 };
  if (kind === 'text') return { ...base, at: pts(1)[0], text: 'Hello\u0001 world', rotation: r() * 720, style: { font: 'serif', size: r() * 3000, halo: '', bold: true } };
  if (kind === 'area') return { ...base, points: pts(3 + Math.floor(r() * 4)), style };
  if (kind === 'rect' || kind === 'ellipse') return { ...base, a: pts(1)[0], b: pts(1)[0], rotation: r() * 400, style };
  return { ...base, points: r() < 0.5 ? encodePoints(pts(3) as [number, number][]) : pts(3), style };
}

function validDocInput(r: () => number): unknown {
  return {
    layers: r() < 0.2 ? undefined : defaultInkDoc().layers.concat(r() < 0.5 ? [{ id: 'extra', name: 'Extra', visible: false, locked: true }] : []),
    items: Array.from({ length: Math.floor(r() * 8) }, () => (r() < 0.8 ? plausibleItem(r) : garbage(r, 0))),
  };
}

function assertInvariants(doc: InkDoc): void {
  const layerIds = doc.layers.map(l => l.id);
  expect(new Set(layerIds).size).toBe(layerIds.length);
  expect(layerIds.length).toBeGreaterThan(0);
  const ids = doc.items.map(i => i.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const item of doc.items) {
    expect(item.id.length).toBeGreaterThan(0);
    expect(layerIds).toContain(item.layer);
    if (item.kind === 'stamp') {
      expect(item.size).toBeGreaterThanOrEqual(1);
      expect(item.size).toBeLessThanOrEqual(2000);
      expect(item.opacity).toBeGreaterThanOrEqual(0);
      expect(item.opacity).toBeLessThanOrEqual(1);
      expect(isValidColor(item.color)).toBe(true);
    }
    if ('rotation' in item) {
      expect(item.rotation).toBeGreaterThanOrEqual(0);
      expect(item.rotation).toBeLessThan(360);
    }
    if (item.kind !== 'stamp' && item.kind !== 'text') {
      expect(isValidColor(item.style.stroke)).toBe(true);
      expect(item.style.strokeWidth).toBeGreaterThanOrEqual(0.1);
      expect(item.style.strokeWidth).toBeLessThanOrEqual(200);
      expect(item.style.fillOpacity).toBeGreaterThanOrEqual(0);
      expect(item.style.fillOpacity).toBeLessThanOrEqual(1);
    }
    if (item.kind === 'path' || item.kind === 'freehand') expect(item.points.length).toBeGreaterThanOrEqual(2);
    if (item.kind === 'area') expect(item.points.length).toBeGreaterThanOrEqual(3);
  }
}

describe('normalizeInk', () => {
  it('is idempotent on fuzzed garbage input', () => {
    const r = rng(12345);
    for (let i = 0; i < 400; i++) {
      const raw = garbage(r, 0);
      const once = normalizeInk(raw);
      expect(normalizeInk(once)).toEqual(once);
      assertInvariants(once);
    }
  });

  it('is idempotent on fuzzed plausible documents, including after JSON and frontmatter round trips', () => {
    const r = rng(777);
    for (let i = 0; i < 400; i++) {
      const raw = validDocInput(r);
      const once = normalizeInk(raw);
      expect(normalizeInk(once)).toEqual(once);
      expect(normalizeInk(JSON.parse(JSON.stringify(once)))).toEqual(once);
      const fm = JSON.parse(JSON.stringify(inkFrontmatter(once)));
      expect(normalizeInk(fm)).toEqual(once);
      assertInvariants(once);
    }
  });

  it('returns a default doc for junk top-level values', () => {
    for (const raw of [undefined, null, 42, 'x', [], { items: 'nope' }, { items: [null, 5, 'a', []] }]) {
      const doc = normalizeInk(raw);
      expect(doc.version).toBe(1);
      expect(doc.items).toEqual([]);
      expect(doc.layers.map(l => l.id)).toEqual(['terrain', 'routes', 'features', 'labels']);
    }
  });

  it('uses the default layers when layers are missing or all invalid', () => {
    expect(normalizeInk({ items: [] }).layers.map(l => l.id)).toEqual(['terrain', 'routes', 'features', 'labels']);
    expect(normalizeInk({ layers: [{ name: 'no id' }, 3] }).layers.map(l => l.id)).toEqual(['terrain', 'routes', 'features', 'labels']);
  });

  it('moves items on unknown layers to the first layer', () => {
    const doc = normalizeInk({
      layers: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      items: [{ kind: 'stamp', id: 's', layer: 'nope', at: [1, 2], symbol: 'tree' }],
    });
    expect(doc.items[0].layer).toBe('a');
  });

  it('drops unknown kinds and malformed items', () => {
    const doc = normalizeInk({
      items: [
        { kind: 'laser', id: 'x', points: [[0, 0], [1, 1]] },
        { kind: 'stamp', id: 'no-symbol', at: [0, 0] },
        { kind: 'path', id: 'one-point', points: [[0, 0]], style: {} },
        { kind: 'area', id: 'two-points', points: [[0, 0], [1, 1]], style: {} },
        { kind: 'text', id: 'empty', at: [0, 0], text: '   ' },
        { kind: 'stamp', id: 'ok', at: [0, 0], symbol: 'tree' },
      ],
    });
    expect(doc.items.map(i => i.id)).toEqual(['ok']);
  });

  it('keeps only valid colours and falls back otherwise', () => {
    const style = (stroke: unknown) => normalizeInk({
      items: [{ kind: 'path', id: 'p', points: [[0, 0], [1, 1]], style: { stroke } }],
    }).items[0] as Extract<InkItem, { kind: 'path' }>;
    expect(style('#abc').style.stroke).toBe('#abc');
    expect(style('#AABBCC').style.stroke).toBe('#AABBCC');
    expect(style('rgb(1, 2, 3)').style.stroke).toBe('rgb(1, 2, 3)');
    expect(style('rgba(0,0,0,0.5)').style.stroke).toBe('rgba(0,0,0,0.5)');
    expect(style('Tomato').style.stroke).toBe('Tomato');
    expect(style('#12345').style.stroke).toBe(DEFAULT_STYLE.stroke);
    expect(style('rgb(300,0,0)').style.stroke).toBe(DEFAULT_STYLE.stroke);
    expect(style('javascript:alert(1)').style.stroke).toBe(DEFAULT_STYLE.stroke);
    expect(style(42).style.stroke).toBe(DEFAULT_STYLE.stroke);
  });

  it('clamps numbers and normalises rotation', () => {
    const stamp = (extra: Record<string, unknown>) => normalizeInk({
      items: [{ kind: 'stamp', id: 's', at: [0, 0], symbol: 'tree', ...extra }],
    }).items[0] as Extract<InkItem, { kind: 'stamp' }>;
    expect(stamp({ opacity: 5 }).opacity).toBe(1);
    expect(stamp({ opacity: -3 }).opacity).toBe(0);
    expect(stamp({ size: 0.2 }).size).toBe(1);
    expect(stamp({ size: 99999 }).size).toBe(2000);
    expect(stamp({ rotation: -90 }).rotation).toBe(270);
    expect(stamp({ rotation: 720 }).rotation).toBe(0);
    expect(stamp({ rotation: 359.999 }).rotation).toBe(0);
    const path = normalizeInk({
      items: [{ kind: 'path', id: 'p', points: [[0, 0], [1, 1]], style: { strokeWidth: 0, strokeOpacity: 9, fillOpacity: -1, dash: 'zigzag' } }],
    }).items[0] as Extract<InkItem, { kind: 'path' }>;
    expect(path.style.strokeWidth).toBe(0.1);
    expect(path.style.strokeOpacity).toBe(1);
    expect(path.style.fillOpacity).toBe(0);
    expect(path.style.dash).toBe('solid');
    const wide = normalizeInk({ items: [{ kind: 'path', id: 'p', points: [[0, 0], [1, 1]], style: { strokeWidth: 5000 } }] });
    expect((wide.items[0] as Extract<InkItem, { kind: 'path' }>).style.strokeWidth).toBe(200);
  });

  it('trims text to 2000 characters and names to 200', () => {
    const doc = normalizeInk({
      items: [
        { kind: 'text', id: 't', at: [0, 0], text: 'a'.repeat(5000), style: {} },
        { kind: 'stamp', id: 's', at: [0, 0], symbol: 'tree', name: 'n'.repeat(500) },
      ],
    });
    expect((doc.items[0] as Extract<InkItem, { kind: 'text' }>).text.length).toBe(2000);
    expect(doc.items[1].name?.length).toBe(200);
  });

  it('strips control characters from text', () => {
    const doc = normalizeInk({ items: [{ kind: 'text', id: 't', at: [0, 0], text: 'a\u0001b\r\nc', style: {} }] });
    expect((doc.items[0] as Extract<InkItem, { kind: 'text' }>).text).toBe('ab\nc');
  });

  it('makes ids unique, keeping the first occurrence', () => {
    const doc = normalizeInk({
      items: [
        { kind: 'stamp', id: 'same', at: [0, 0], symbol: 'tree' },
        { kind: 'stamp', id: 'same', at: [1, 1], symbol: 'tree' },
        { kind: 'stamp', at: [2, 2], symbol: 'tree' },
        { kind: 'stamp', id: 'stamp-1', at: [3, 3], symbol: 'tree' },
      ],
    });
    const ids = doc.items.map(i => i.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe('same');
    expect(ids[1]).not.toBe('same');
  });

  it('accepts points as a compact string or as pairs', () => {
    const fromString = normalizeInk({ items: [{ kind: 'path', id: 'p', points: '0,0 10,10', style: {} }] });
    const fromPairs = normalizeInk({ items: [{ kind: 'path', id: 'p', points: [[0, 0], [10, 10]], style: {} }] });
    expect(fromString).toEqual(fromPairs);
  });

  it('keeps the document shape and drops unknown fields', () => {
    const doc = normalizeInk({ version: 9, extra: true, items: [{ kind: 'stamp', id: 's', at: [0, 0], symbol: 'tree', evil: 'x' }] });
    expect(doc.version).toBe(1);
    expect(Object.keys(doc).sort()).toEqual(['items', 'layers', 'version']);
    expect(Object.keys(doc.items[0]).includes('evil')).toBe(false);
  });
});

describe('isValidColor', () => {
  it('accepts hex, rgb, rgba and named colours only', () => {
    for (const ok of ['#fff', '#A1b2C3', 'rgb(0,0,0)', 'rgba(255, 255, 255, 0.5)', 'steelblue', 'REBECCAPURPLE']) {
      expect(isValidColor(ok), ok).toBe(true);
    }
    for (const bad of ['', '#ffff', '#gggggg', 'rgb(256,0,0)', 'rgb(0,0)', 'rgba(0,0,0,2)', 'url(x)', 'none', 'transparent', 5, null]) {
      expect(isValidColor(bad), String(bad)).toBe(false);
    }
  });
});

describe('encodePoints and decodePoints', () => {
  it('rounds to 2 decimals with no trailing zeros', () => {
    expect(encodePoints([[742.5, 404], [730, 470.126], [705.999, 520]])).toBe('742.5,404 730,470.13 706,520');
    expect(encodePoints([[-0.001, 0]])).toBe('0,0');
    expect(encodePoints([])).toBe('');
  });

  it('round-trips points at 2 decimal precision', () => {
    const r = rng(99);
    const points = Array.from({ length: 300 }, () => [r() * 4000 - 2000, r() * 4000 - 2000] as [number, number]);
    const expected = points.map(([x, y]) => [Math.round(x * 100) / 100 + 0, Math.round(y * 100) / 100 + 0]);
    expect(decodePoints(encodePoints(points))).toEqual(expected);
  });

  it('skips garbage tokens when decoding', () => {
    expect(decodePoints('1,2 foo 3 4,5,6 NaN,1 7,8 ,')).toEqual([[1, 2], [7, 8]]);
    expect(decodePoints('')).toEqual([]);
  });

  it('decodes arrays of pairs and drops invalid pairs', () => {
    expect(decodePoints([[1, 2], [3], ['4', '5'], 'x', null])).toEqual([[1, 2], [4, 5]]);
  });
});

describe('inkFrontmatter', () => {
  it('writes points as strings and reads back to the same document', () => {
    const doc = normalizeInk({
      items: [
        { kind: 'path', id: 'road', points: [[0, 0], [10.5, 20]], style: { stroke: '#7a5c3a' } },
        { kind: 'stamp', id: 'door', at: [3, 4], symbol: 'door', size: 24 },
        { kind: 'area', id: 'lake', points: [[0, 0], [5, 0], [5, 5]], style: { fill: '#3b82c4', fillOpacity: 0.35, fillPattern: 'symbol:wave' } },
      ],
    });
    const fm = inkFrontmatter(doc);
    expect(fm.version).toBe(1);
    expect(fm.items[0].points).toBe('0,0 10.5,20');
    expect(typeof fm.items[2].points).toBe('string');
    expect(fm.items[1].at).toEqual([3, 4]);
    expect(normalizeInk(fm)).toEqual(doc);
    expect(normalizeInk(JSON.parse(JSON.stringify(fm)))).toEqual(doc);
  });

  it('contains no undefined values', () => {
    const fm = inkFrontmatter(normalizeInk({ items: [{ kind: 'stamp', id: 's', at: [1, 1], symbol: 'tree' }] }));
    const check = (v: unknown): void => {
      expect(v).not.toBeUndefined();
      if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(check);
    };
    check(fm);
  });

  it('uses the mapInk key', () => {
    expect(INK_FRONTMATTER_KEY).toBe('mapInk');
  });
});

describe('nextInkId', () => {
  it('returns an id of the kind that no item uses', () => {
    const empty = defaultInkDoc();
    expect(nextInkId('stamp', empty)).toBe('stamp-1');
    expect(nextInkId('freehand', empty)).toBe('freehand-1');
    const doc = normalizeInk({
      items: [{ kind: 'stamp', id: 'stamp-1', at: [0, 0], symbol: 'tree' }, { kind: 'stamp', id: 'stamp-2', at: [0, 0], symbol: 'tree' }],
    });
    expect(nextInkId('stamp', doc)).toBe('stamp-3');
    expect(nextInkId('stamp', doc)).not.toBe(doc.items[0].id);
  });
});

describe('defaultInkDoc', () => {
  it('has the four default layers and no items', () => {
    const doc = defaultInkDoc();
    expect(doc.version).toBe(1);
    expect(doc.items).toEqual([]);
    expect(doc.layers.map(l => [l.id, l.name])).toEqual([
      ['terrain', 'Terrain'], ['routes', 'Routes'], ['features', 'Features'], ['labels', 'Labels'],
    ]);
    expect(defaultInkDoc()).not.toBe(doc);
  });
});
