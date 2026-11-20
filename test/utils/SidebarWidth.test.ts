import { describe, expect, it } from 'vitest';
import { sidebarWidthFor } from '../../src/utils/TimelineSidebarWidth';

describe('sidebarWidthFor', () => {
  it('scales with the pane so a narrow pane keeps most of its width for the plot', () => {
    expect(sidebarWidthFor(400, false)).toBe(72);
    expect(sidebarWidthFor(760, false)).toBe(137);
  });

  it('caps at the width the column had when it was fixed', () => {
    expect(sidebarWidthFor(1500, false)).toBe(174);
  });

  it('collapses entirely for a single unnamed lane', () => {
    expect(sidebarWidthFor(400, true)).toBe(0);
    expect(sidebarWidthFor(1500, true)).toBe(0);
  });
});
