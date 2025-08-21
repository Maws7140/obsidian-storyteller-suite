import { describe, it, expect } from 'vitest';
import { parseEventDate, toMillis, toDisplay } from '../../src/utils/DateParsing';

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

  describe('BCE date parsing', () => {
    it('parses BCE year', () => {
      const r = parseEventDate('500 BCE');
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      expect(r.isBCE).toBe(true);
      expect(r.originalYear).toBe(500);
    });

    it('parses BCE with different casing', () => {
      const testCases = ['500 BCE', '500 bce', '500 bc', '500 B.C.', '500 b.c.e.'];
      testCases.forEach(dateStr => {
        const r = parseEventDate(dateStr);
        expect(r.error).toBeUndefined();
        expect(r.start).toBeDefined();
        expect(r.isBCE).toBe(true);
        expect(r.originalYear).toBe(500);
      });
    });

    it('parses BCE with month and day', () => {
      const r = parseEventDate('March 15, 500 BCE');

      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      expect(r.isBCE).toBe(true);
      expect(r.originalYear).toBe(500);
      expect(r.start?.month).toBe(3);
      expect(r.start?.day).toBe(15);
    });

    it('parses BCE with full date', () => {
      const r = parseEventDate('2024-03-02 500 BCE');
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      expect(r.isBCE).toBe(true);
      expect(r.originalYear).toBe(500);
    });

    it('converts BCE year to correct JavaScript year', () => {
      const r = parseEventDate('100 BCE');
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      // BCE 100 should become year -99 (JavaScript year)
      expect(r.start?.year).toBe(-99);
    });

    it('handles BCE 1 correctly', () => {
      const r = parseEventDate('1 BCE');
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      expect(r.isBCE).toBe(true);
      expect(r.originalYear).toBe(1);
      // BCE 1 should become year 0
      expect(r.start?.year).toBe(0);
    });
  });

  describe('BCE date display', () => {
    it('displays BCE year correctly', () => {
      const r = parseEventDate('500 BCE');
      const display = toDisplay(r.start, undefined, r.isBCE, r.originalYear);
      expect(display).toBe('500 BCE');
    });

    it('displays BCE with month correctly', () => {
      const r = parseEventDate('March 500 BCE');
      const display = toDisplay(r.start, undefined, r.isBCE, r.originalYear);
      expect(display).toBe('March 500 BCE');
    });

    it('displays BCE with month and day correctly', () => {
      const r = parseEventDate('March 15, 500 BCE');
      const display = toDisplay(r.start, undefined, r.isBCE, r.originalYear);
      expect(display).toBe('March 15, 500 BCE');
    });

    it('falls back to standard display for CE dates', () => {
      const r = parseEventDate('2024-03-02');
      const display = toDisplay(r.start);
      expect(display).toBeDefined();
      expect(display).not.toContain('BCE');
    });
  });

  describe('BCE timeline integration', () => {
    it('provides valid milliseconds for BCE dates', () => {
      const r = parseEventDate('500 BCE');
      const millis = toMillis(r.start);
      expect(typeof millis).toBe('number');
      expect(millis).toBeLessThan(0); // BCE dates should be negative timestamps
    });

    it('BCE dates sort before CE dates', () => {
      const bceDate = parseEventDate('100 BCE');
      const ceDate = parseEventDate('100 CE');



      const bceMillis = toMillis(bceDate.start);
      const ceMillis = toMillis(ceDate.start);

      expect(bceMillis).toBeLessThan(ceMillis!);
    });
  });
});
