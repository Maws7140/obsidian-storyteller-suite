import { describe, expect, it } from 'vitest';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import {
  OBSIDIAN_NATIVE_THEME,
  decodeShareCode,
  encodeShareCode,
  makeCalendarDocument,
  makeThemeDocument,
  parsePortableDocument,
  sanitizeColor,
  sanitizeImageSource,
  sanitizeTheme,
} from '../../src/calendar/TimelineDocuments';
import { BUILTIN_TIMELINE_THEMES } from '../../src/calendar/themes';

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

  it('round-trips every bundled theme, background and palette included', () => {
    for (const theme of BUILTIN_TIMELINE_THEMES) {
      const document = makeThemeDocument(theme);
      expect(decodeShareCode(encodeShareCode(document))).toEqual(document);
    }
    const withImage = makeThemeDocument({
      id: 'img', name: 'Image', palette: ['#112233'],
      background: { image: 'https://example.com/map.png', fit: 'tile', position: 'top', opacity: 0.5, blur: 2 },
    });
    expect(decodeShareCode(encodeShareCode(withImage))).toEqual(withImage);
  });

  it('leaves the bundled themes unchanged when sanitized', () => {
    for (const theme of BUILTIN_TIMELINE_THEMES) expect(sanitizeTheme(theme)).toEqual(theme);
  });
});

describe('imported timeline themes', () => {
  it('keeps the good parts of a theme with some bad values', () => {
    const document = parsePortableDocument({
      kind: 'storyteller-timeline-theme',
      schemaVersion: 1,
      theme: {
        id: 'mixed', name: 'Mixed',
        colors: { accent: '#ff0000', background: 'red; color: blue', text: 42, notARole: '#000000' },
        palette: ['#00ff00', 'url(x)', 'rgb(1, 2, 3)'],
        event: { radius: 100, height: 'tall' },
        connectors: { dependencyStyle: 'wavy', width: 3 },
        background: { image: 'javascript:alert(1)', fit: 'sideways', opacity: 4 },
      },
    });
    if (document.kind !== 'storyteller-timeline-theme') throw new Error('wrong kind');
    const theme = document.theme;
    expect(theme.colors).toEqual({ accent: '#ff0000' });
    expect(theme.palette).toEqual(['#00ff00', 'rgb(1, 2, 3)']);
    expect(theme.event).toEqual({ radius: 16 });
    expect(theme.connectors).toEqual({ width: 3 });
    expect(theme.background).toEqual({ opacity: 1 });
  });

  it('accepts canvas colours and rejects anything that is not one', () => {
    expect(sanitizeColor('#abc')).toBe('#abc');
    expect(sanitizeColor('#aabbccdd')).toBe('#aabbccdd');
    expect(sanitizeColor('hsl(200, 50%, 40%)')).toBe('hsl(200, 50%, 40%)');
    expect(sanitizeColor('rebeccapurple')).toBe('rebeccapurple');
    expect(sanitizeColor('var(--x)')).toBeUndefined();
    expect(sanitizeColor('#ggg')).toBeUndefined();
    expect(sanitizeColor('red;}')).toBeUndefined();
  });

  it('allows vault paths, https links and inline image data as backgrounds', () => {
    expect(sanitizeImageSource('Attachments/World map.png')).toBe('Attachments/World map.png');
    expect(sanitizeImageSource('[[World map.png]]')).toBe('[[World map.png]]');
    expect(sanitizeImageSource('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(sanitizeImageSource('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(sanitizeImageSource('http://example.com/a.jpg')).toBeUndefined();
    expect(sanitizeImageSource('file:///etc/passwd')).toBeUndefined();
    expect(sanitizeImageSource('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeImageSource('data:text/html;base64,PGI+')).toBeUndefined();
    expect(sanitizeImageSource('a"><img src=x>')).toBeUndefined();
  });

  it('still requires an id and a name', () => {
    expect(() => parsePortableDocument({ kind: 'storyteller-timeline-theme', schemaVersion: 1, theme: { id: ' ', name: 'x' } })).toThrow(/id and name/);
  });
});
