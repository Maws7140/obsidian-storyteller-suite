import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TagTimelineGenerator } from '../../src/utils/TagTimelineGenerator';

type DateExtractor = {
  extractDateFromContent(content: string, customPatterns?: RegExp[]): { date: string | null };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const fakeApp = {} as unknown as App;

describe('TagTimelineGenerator reference date', () => {
  // A custom "today" set in the plugin settings, far from the real clock.
  const customToday = new Date('2300-06-15T12:00:00Z');

  it('resolves natural-language dates against the supplied reference date', () => {
    const generator = new TagTimelineGenerator(fakeApp, () => customToday) as unknown as DateExtractor;
    const result = generator.extractDateFromContent('We meet tomorrow at the tavern.');
    expect(result.date).not.toBeNull();
    const resolved = new Date(result.date as string).getTime();
    expect(Math.abs(resolved - (customToday.getTime() + DAY_MS))).toBeLessThan(DAY_MS);
    expect(new Date(resolved).getUTCFullYear()).toBe(2300);
  });

  it('falls back to the wall clock when no reference date is supplied', () => {
    const before = Date.now();
    const generator = new TagTimelineGenerator(fakeApp) as unknown as DateExtractor;
    const result = generator.extractDateFromContent('We meet tomorrow at the tavern.');
    const resolved = new Date(result.date as string).getTime();
    expect(Math.abs(resolved - (before + DAY_MS))).toBeLessThan(2 * DAY_MS);
  });
});
