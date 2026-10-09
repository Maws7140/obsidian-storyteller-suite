import { describe, expect, it } from 'vitest';
import { TextMeasureCache } from '../../src/utils/TextMeasureCache';

/** Fake 2D context: each character is 6px wide, 7px in a bold face. */
function fakeContext(font = '11px sans-serif') {
  const ctx = {
    font,
    calls: 0,
    measureText(value: string) {
      ctx.calls++;
      return { width: value.length * (ctx.font.startsWith('600') ? 7 : 6) };
    },
  };
  return ctx;
}

/** The loop the cache replaces, kept here as the reference answer. */
function reference(ctx: ReturnType<typeof fakeContext>, value: string, width: number): string {
  if (ctx.measureText(value).width <= width) return value;
  let text = value;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > width) text = text.slice(0, -1);
  return `${text}…`;
}

describe('TextMeasureCache', () => {
  it('returns the same truncation as the uncached loop across widths', () => {
    const cache = new TextMeasureCache(100);
    const label = 'The long road to the north gate, part two';
    for (let width = 0; width <= 300; width += 7) {
      const ctx = fakeContext();
      expect(cache.truncate(ctx, label, width)).toBe(reference(fakeContext(), label, width));
    }
  });

  it('measures a repeated label once, so later frames cost no measuring', () => {
    const cache = new TextMeasureCache(100);
    const ctx = fakeContext();
    cache.truncate(ctx, 'A fairly long card title', 60);
    const firstFrame = ctx.calls;
    cache.truncate(ctx, 'A fairly long card title', 60);
    expect(ctx.calls).toBe(firstFrame);
  });

  it('keeps widths apart by font', () => {
    const cache = new TextMeasureCache(100);
    expect(cache.measure(fakeContext('11px sans-serif'), 'Hello')).toBe(30);
    expect(cache.measure(fakeContext('600 11px sans-serif'), 'Hello')).toBe(35);
  });

  it('forgets everything on clear, so a late font load is measured again', () => {
    const cache = new TextMeasureCache(100);
    const ctx = fakeContext();
    cache.measure(ctx, 'Hello');
    cache.clear();
    const before = ctx.calls;
    cache.measure(ctx, 'Hello');
    expect(ctx.calls).toBe(before + 1);
  });
});
