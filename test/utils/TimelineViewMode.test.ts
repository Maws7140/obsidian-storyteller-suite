import { describe, expect, it } from 'vitest';
import { timelineViewMode } from '../../src/utils/TimelineControlsBuilder';

describe('timelineViewMode', () => {
  it('keeps Chronology as a distinct top-level view', () => {
    expect(timelineViewMode({ ganttMode: false, timelineLayout: 'chronology' })).toBe('chronology');
  });

  it('keeps horizontal and vertical inside the same Timeline view', () => {
    expect(timelineViewMode({ ganttMode: false, timelineLayout: 'timeline' })).toBe('timeline');
  });

  it('lets Gantt override the inactive layout', () => {
    expect(timelineViewMode({ ganttMode: true, timelineLayout: 'timeline' })).toBe('gantt');
  });
});
