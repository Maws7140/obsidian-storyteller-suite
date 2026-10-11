import { describe, expect, it } from 'vitest';
import { applyPreset, DEFAULT_STYLE, DEFAULT_TEXT_STYLE, mergeStyle, PRESETS, SWATCHES } from '../../src/leaflet/ink/styles';
import { isValidColor, normalizeInk } from '../../src/leaflet/ink/model';

const REQUIRED = [
  'Water', 'Deep water', 'River', 'Stream', 'Road', 'Track', 'Trail', 'Wall', 'Border', 'Cliff', 'Forest',
  'Jungle', 'Hills', 'Mountains', 'Plains', 'Desert', 'Swamp', 'Ice', 'Region outline', 'Label (map title)',
  'Label (place)', 'Label (water)',
];

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

describe('defaults and swatches', () => {
  it('has valid default styles', () => {
    expect(isValidColor(DEFAULT_STYLE.stroke)).toBe(true);
    expect(isValidColor(DEFAULT_STYLE.fill)).toBe(true);
    expect(isValidColor(DEFAULT_TEXT_STYLE.color)).toBe(true);
    expect(isValidColor(DEFAULT_TEXT_STYLE.halo)).toBe(true);
  });

  it('has 24 unique valid swatches', () => {
    expect(SWATCHES).toHaveLength(24);
    expect(new Set(SWATCHES).size).toBe(24);
    for (const s of SWATCHES) expect(s).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('PRESETS', () => {
  it('includes every preset named in the plan', () => {
    const names = PRESETS.map(p => p.name);
    for (const name of REQUIRED) expect(names).toContain(name);
  });

  it('has unique ids and a valid fit on every preset', () => {
    const ids = PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRESETS) expect(['path', 'area', 'text', 'stamp']).toContain(p.fits);
  });

  it('makes Water a blue fill with a wave pattern and a darker blue edge', () => {
    const water = PRESETS.find(p => p.name === 'Water');
    expect(water?.fits).toBe('area');
    expect(water?.style?.fill).toBe('#3b82c4');
    expect(water?.style?.fillOpacity).toBeCloseTo(0.35);
    expect(water?.style?.fillPattern).toBe('symbol:wave');
    expect(luminance(water?.style?.stroke as string)).toBeLessThan(luminance('#3b82c4'));
  });

  it('makes River a blue wavy path and Forest a green tree area', () => {
    const river = PRESETS.find(p => p.name === 'River');
    expect(river?.fits).toBe('path');
    expect(river?.style?.dash).toBe('wavy');
    expect(river?.style?.stroke).toBe('#3b82c4');
    const forest = PRESETS.find(p => p.name === 'Forest');
    expect(forest?.fits).toBe('area');
    expect(forest?.style?.fillPattern).toBe('symbol:tree');
    expect(forest?.style?.fill).toMatch(/^#3f7d3a$/i);
  });

  it('makes Label (water) an italic blue serif text preset', () => {
    const label = PRESETS.find(p => p.name === 'Label (water)');
    expect(label?.fits).toBe('text');
    expect(label?.textStyle?.font).toBe('serif');
    expect(label?.textStyle?.italic).toBe(true);
    expect(label?.textStyle?.color).toBe('#1f5fa8');
  });

  it('only uses values that survive normalizeInk unchanged', () => {
    PRESETS.forEach((p, i) => {
      if (p.fits === 'text') {
        const raw = { items: [{ kind: 'text', id: `t${i}`, at: [0, 0], text: 'Label', style: applyPreset(DEFAULT_TEXT_STYLE, p) }] };
        const doc = normalizeInk(raw);
        expect(doc.items[0]).toMatchObject({ style: applyPreset(DEFAULT_TEXT_STYLE, p) });
      } else {
        const kind = p.fits === 'area' ? 'area' : 'path';
        const style = applyPreset(DEFAULT_STYLE, p);
        const raw = { items: [{ kind, id: `p${i}`, points: [[0, 0], [10, 0], [10, 10]], style }] };
        const doc = normalizeInk(raw);
        expect(doc.items[0]).toMatchObject({ style });
      }
    });
  });
});

describe('applyPreset and mergeStyle', () => {
  it('returns a new style and leaves the base alone', () => {
    const base = { ...DEFAULT_STYLE };
    const water = PRESETS.find(p => p.id === 'water');
    if (!water) throw new Error('missing water');
    const out = applyPreset(base, water);
    expect(out).not.toBe(base);
    expect(base).toEqual(DEFAULT_STYLE);
    expect(out.fill).toBe('#3b82c4');
    expect(out.stroke).toBe(water.style?.stroke);
    expect(out.strokeOpacity).toBe(DEFAULT_STYLE.strokeOpacity);
    expect(out.smooth).toBe(DEFAULT_STYLE.smooth);
  });

  it('applies text presets to text styles', () => {
    const title = PRESETS.find(p => p.id === 'label-title');
    if (!title) throw new Error('missing title');
    const out = applyPreset(DEFAULT_TEXT_STYLE, title);
    expect(out.size).toBe(56);
    expect(out.bold).toBe(true);
    expect(out.font).toBe('serif');
  });

  it('mergeStyle skips undefined values and does not mutate', () => {
    const base = { a: 1, b: 'x' };
    const out = mergeStyle(base, { a: undefined, b: 'y' } as Partial<typeof base>);
    expect(out).toEqual({ a: 1, b: 'y' });
    expect(base).toEqual({ a: 1, b: 'x' });
    expect(mergeStyle(base)).toEqual(base);
  });
});
