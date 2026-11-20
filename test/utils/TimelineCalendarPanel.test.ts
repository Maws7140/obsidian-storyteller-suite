import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({ Menu: class {}, setIcon: () => {} }));

const { calendarLaneHeight, calendarLanesFor } = await import('../../src/utils/TimelineCalendarPanel');

describe('Calendar view lanes', () => {
  it('takes its row height from the theme chip height, within limits', () => {
    expect(calendarLaneHeight(24)).toBe(24);
    expect(calendarLaneHeight(10)).toBe(18);
    expect(calendarLaneHeight(48)).toBe(32);
  });

  it('fits more chip rows in a taller week', () => {
    expect(calendarLanesFor(150, 24)).toBe(4);
    expect(calendarLanesFor(300, 24)).toBe(11);
  });

  it('keeps a floor and a ceiling', () => {
    expect(calendarLanesFor(20, 24)).toBe(2);
    expect(calendarLanesFor(5000, 24)).toBe(12);
    expect(calendarLanesFor(Number.NaN, 24)).toBe(2);
  });
});
