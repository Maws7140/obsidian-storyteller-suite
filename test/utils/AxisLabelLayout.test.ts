import { describe, expect, it } from 'vitest';
import { placeReadableAxisLabels } from '../../src/utils/AxisLabelLayout';

describe('placeReadableAxisLabels', () => {
  it('suppresses labels that overlap at dense zoom thresholds', () => {
    const placed = placeReadableAxisLabels(
      [20, 50, 80, 110].map((x, value) => ({ value, x, width: 48 })),
      4,
      126,
      8,
    );
    expect(placed.map(label => label.value)).toEqual([0, 3]);
  });

  it('accounts for edge clamping before checking collisions', () => {
    const placed = placeReadableAxisLabels(
      [0, 24, 100].map((x, value) => ({ value, x, width: 40 })),
      4,
      104,
      6,
    );
    expect(placed.map(label => label.value)).toEqual([0, 2]);
    expect(placed[0].left).toBe(4);
    expect(placed[1].left).toBe(64);
  });
});
