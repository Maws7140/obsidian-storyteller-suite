import { describe, expect, it } from 'vitest';
import { ConflictDetector } from '../../src/utils/ConflictDetector';

// Two events for one character at two locations. "tomorrow" is the only thing that
// decides whether they overlap, so the answer depends entirely on the reference day.
const events = [
  { id: 'a', name: 'A', dateTime: 'tomorrow', location: 'Harbour', characters: ['Ana'] },
  { id: 'b', name: 'B', dateTime: '2026-10-10', location: 'Keep', characters: ['Ana'] },
] as any[];

describe('ConflictDetector resolves relative dates against the story reference day', () => {
  it('does not place "tomorrow" on the wall-clock day when a custom today is in force', () => {
    // Custom today is 1420-06-01, so "tomorrow" is 1420-06-02 and cannot overlap 2026-10-10.
    const conflicts = ConflictDetector.detectAllConflicts(events, [], [], new Date('1420-06-01T00:00:00Z'));
    expect(conflicts.filter(c => c.type === 'location')).toHaveLength(0);
  });

  it('still reports the overlap when the reference day is the wall-clock day', () => {
    const conflicts = ConflictDetector.detectAllConflicts(events, [], [], new Date('2026-10-09T00:00:00Z'));
    expect(conflicts.filter(c => c.type === 'location')).toHaveLength(1);
  });
});
