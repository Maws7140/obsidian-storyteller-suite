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

  it('shows Calendar as its own view', () => {
    expect(timelineViewMode({ ganttMode: false, timelineLayout: 'chronology', calendarMode: true })).toBe('calendar');
  });

  it('lets Calendar override Gantt and the Timeline layout', () => {
    expect(timelineViewMode({ ganttMode: true, timelineLayout: 'timeline', calendarMode: true })).toBe('calendar');
  });

  it('reads a saved state with no calendar key as not calendar', () => {
    expect(timelineViewMode({ ganttMode: false, timelineLayout: 'timeline', calendarMode: undefined })).toBe('timeline');
  });
});
