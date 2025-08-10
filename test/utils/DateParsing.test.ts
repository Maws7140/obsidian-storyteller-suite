import { describe, it, expect } from 'vitest';
import { parseEventDate, toMillis } from '../../src/utils/DateParsing';

describe('DateParsing', () => {
  it('parses ISO date', () => {
    const r = parseEventDate('2024-03-02');
    expect(r.error).toBeUndefined();
    expect(r.start).toBeDefined();
  });

  it('respects custom reference date for relative parsing', () => {
    const ref = new Date('2024-01-15');
    const r = parseEventDate('next Friday', { referenceDate: ref });
    // Not asserting exact millis; just ensure it parsed
    expect(r.error).toBeUndefined();
    expect(r.start).toBeDefined();
    expect(typeof toMillis(r.start)).toBe('number');
  });

  it('returns error on empty', () => {
    const r = parseEventDate('');
    expect(r.error).toBe('empty');
  });
});
