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

  describe('relative date parsing with custom reference', () => {
    it('parses "next week" relative to custom reference date', () => {
      const ref = new Date('2024-01-15'); // Monday
      const r = parseEventDate('next week', { referenceDate: ref });
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      
      const refMillis = ref.getTime();
      const parsedMillis = toMillis(r.start);
      if (parsedMillis === undefined) throw new Error('parsedMillis is undefined');
      
      const daysDiff = (parsedMillis - refMillis) / (1000 * 60 * 60 * 24);
      // "next week" should be roughly 7 days in the future
      expect(daysDiff).toBeGreaterThan(5);
      expect(daysDiff).toBeLessThan(10);
    });

    it('parses "last month" relative to custom reference date', () => {
      const ref = new Date('2024-03-15'); // March 15
      const r = parseEventDate('last month', { referenceDate: ref });
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      
      const refMillis = ref.getTime();
      const parsedMillis = toMillis(r.start);
      if (parsedMillis === undefined) throw new Error('parsedMillis is undefined');
      
      // Should be in the past
      expect(parsedMillis).toBeLessThan(refMillis);
      
      // Should be roughly 30 days ago
      const daysDiff = Math.abs((parsedMillis - refMillis) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThan(20);
      expect(daysDiff).toBeLessThan(40);
    });

    it('parses "in 2 years" relative to custom reference date', () => {
      const ref = new Date('2024-01-01');
      const r = parseEventDate('in 2 years', { referenceDate: ref });
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      
      // Should be roughly 2 years in the future
      const refMillis = ref.getTime();
      const parsedMillis = toMillis(r.start);
      if (parsedMillis === undefined) throw new Error('parsedMillis is undefined');
      
      const daysDiff = (parsedMillis - refMillis) / (1000 * 60 * 60 * 24);
      // 2 years ≈ 730 days (accounting for leap year)
      expect(daysDiff).toBeGreaterThan(700);
      expect(daysDiff).toBeLessThan(760);
    });

    it('parses "tomorrow" relative to custom reference date', () => {
      const ref = new Date('2024-06-15');
      const r = parseEventDate('tomorrow', { referenceDate: ref });
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      
      const refMillis = ref.getTime();
      const parsedMillis = toMillis(r.start);
      if (parsedMillis === undefined) throw new Error('parsedMillis is undefined');
      
      const daysDiff = (parsedMillis - refMillis) / (1000 * 60 * 60 * 24);
      // Should be exactly 1 day in the future
      expect(daysDiff).toBeGreaterThan(0.9);
      expect(daysDiff).toBeLessThan(1.1);
    });

    it('parses "3 days ago" relative to custom reference date', () => {
      const ref = new Date('2024-05-10');
      const r = parseEventDate('3 days ago', { referenceDate: ref });
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      
      const refMillis = ref.getTime();
      const parsedMillis = toMillis(r.start);
      if (parsedMillis === undefined) throw new Error('parsedMillis is undefined');
      
      const daysDiff = (refMillis - parsedMillis) / (1000 * 60 * 60 * 24);
      // Should be exactly 3 days in the past
      expect(daysDiff).toBeGreaterThan(2.9);
      expect(daysDiff).toBeLessThan(3.1);
    });
  });

  it('returns error on empty', () => {
    const r = parseEventDate('');
    expect(r.error).toBe('empty');
  });

  describe('leap year validation', () => {
    it('accepts Feb 29 in leap year 2024', () => {
      const r = parseEventDate('February 29, 2024');
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      expect(r.start?.month).toBe(2);
      expect(r.start?.day).toBe(29);
      expect(r.start?.year).toBe(2024);
    });

    it('rejects Feb 29 in non-leap year 2025', () => {
      const r = parseEventDate('February 29, 2025');
      // Luxon will either error or roll over to March 1
      // Check that it's not exactly Feb 29, 2025
      if (r.start) {
        const actualDate = `${r.start.month}/${r.start.day}/${r.start.year}`;
        expect(actualDate).not.toBe('2/29/2025');
      }
    });

    it('rejects Feb 29 in non-leap year 2023', () => {
      const r = parseEventDate('February 29, 2023');
      if (r.start) {
        const actualDate = `${r.start.month}/${r.start.day}/${r.start.year}`;
        expect(actualDate).not.toBe('2/29/2023');
      }
    });

    it('accepts Feb 29 in leap year 2000 (century divisible by 400)', () => {
      const r = parseEventDate('February 29, 2000');
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      expect(r.start?.month).toBe(2);
      expect(r.start?.day).toBe(29);
      expect(r.start?.year).toBe(2000);
    });

    it('rejects Feb 29 in non-leap year 1900 (century not divisible by 400)', () => {
      const r = parseEventDate('February 29, 1900');
      if (r.start) {
        const actualDate = `${r.start.month}/${r.start.day}/${r.start.year}`;
        expect(actualDate).not.toBe('2/29/1900');
      }
    });

    it('handles Feb 28 in non-leap years correctly', () => {
      const r = parseEventDate('February 28, 2025');
      expect(r.error).toBeUndefined();
      expect(r.start).toBeDefined();
      expect(r.start?.month).toBe(2);
      expect(r.start?.day).toBe(28);
      expect(r.start?.year).toBe(2025);
    });
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
      if (ceMillis === undefined) throw new Error('ceMillis is undefined');

      expect(bceMillis).toBeLessThan(ceMillis);
    });
  });
});
