import { describe, expect, it } from 'vitest';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import {
  OBSIDIAN_NATIVE_THEME,
  decodeShareCode,
  encodeShareCode,
  makeCalendarDocument,
  makeThemeDocument,
  parsePortableDocument,
} from '../../src/calendar/TimelineDocuments';

describe('portable timeline documents', () => {
  it('round-trips a Unicode calendar through a share code', () => {
    const calendar = { ...GREGORIAN_CALENDAR, id: 'test-ko', name: 'Japanese kō' };
    const document = makeCalendarDocument(calendar, { author: 'Bubblegum Cherry-pop' });
    expect(decodeShareCode(encodeShareCode(document))).toEqual(document);
  });

  it('round-trips an Obsidian-inheriting timeline theme', () => {
    const document = makeThemeDocument(OBSIDIAN_NATIVE_THEME);
    expect(decodeShareCode(encodeShareCode(document))).toEqual(document);
  });

  it('rejects unknown document kinds', () => {
    expect(() => parsePortableDocument({ kind: 'storyteller-events', schemaVersion: 1 })).toThrow(/Unsupported/);
  });

  it('rejects invalid calendar month lengths', () => {
    const document = makeCalendarDocument({
      ...GREGORIAN_CALENDAR,
      months: [{ name: 'Broken', days: 0 }],
    });
    expect(() => parsePortableDocument(JSON.stringify(document))).toThrow(/Month 1/);
  });
});
