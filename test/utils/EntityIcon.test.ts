import { describe, it, expect } from 'vitest';
import {
    iconColorKey,
    iconForEntity,
    isSafeFrontmatterKey,
    isValidIconColor,
    parseIconValue,
    readIconFromFrontmatter,
    resolveIconPropertyKeys,
    writeIconToFrontmatter,
} from '../../src/utils/EntityIcon';

const ON = { showIcons: true, useCoverImage: true };

describe('parseIconValue: Lucide', () => {
    it.each([
        ['sword', 'sword'],
        ['lucide-sword', 'sword'],
        ['lucide:sword', 'sword'],
        ['book-open', 'book-open'],
        ['arrow-down-0-1', 'arrow-down-0-1'],
    ])('%s -> lucide %s', (input, ref) => {
        expect(parseIconValue(input)).toEqual({ kind: 'lucide', ref, raw: input });
    });

    it('accepts a bare lowercase word that is not obviously a path', () => {
        expect(parseIconValue('dragon')).toMatchObject({ kind: 'lucide', ref: 'dragon' });
    });

    it('rejects uppercase Lucide-style ids', () => {
        expect(parseIconValue('Sword')).toBeNull();
    });
});

describe('parseIconValue: Map Ink symbols', () => {
    it('reads ink:<name> as an ink symbol', () => {
        expect(parseIconValue('ink:tower')).toEqual({ kind: 'ink', ref: 'tower', raw: 'ink:tower' });
        expect(parseIconValue('ink:skull')).toMatchObject({ kind: 'ink', ref: 'skull' });
    });

    it('does not read ink:<name> with spaces as an ink symbol', () => {
        expect(parseIconValue('ink:big tower')).toBeNull();
    });
});

describe('parseIconValue: icon packs', () => {
    it.each([
        ['LiSword', 'Li', 'Sword'],
        ['GiDragonHead', 'Gi', 'DragonHead'],
        ['FasDragon', 'Fas', 'Dragon'],
        ['RiSwordFill', 'Ri', 'SwordFill'],
    ])('%s -> pack prefix %s, ref %s', (input, pack, ref) => {
        expect(parseIconValue(input)).toEqual({ kind: 'pack', pack, ref, raw: input });
    });

    it('reads explicit pack:<pack>/<icon> form', () => {
        expect(parseIconValue('pack:game-icons/dragon-head')).toEqual({
            kind: 'pack',
            pack: 'game-icons',
            ref: 'dragon-head',
            raw: 'pack:game-icons/dragon-head',
        });
    });

    it('rejects a PascalCase word with no 2 to 4 letter prefix', () => {
        expect(parseIconValue('SwordFighter')).toBeNull();
        expect(parseIconValue('Sword')).toBeNull();
    });
});

describe('parseIconValue: emoji', () => {
    it.each(['⚔️', '🐉', '🏰', '🧙‍♀️', '🇬🇧', '👍🏽'])('%s -> emoji', (input) => {
        expect(parseIconValue(input)).toEqual({ kind: 'emoji', ref: input, raw: input });
    });

    it('does not read digits as an emoji', () => {
        expect(parseIconValue('123')).toBeNull();
    });
});

describe('parseIconValue: vault images and SVGs', () => {
    it.each([
        '[[dragon.png]]',
        '![[dragon.svg|20]]',
        '[[Art/dragon.webp|alt text]]',
        '![[dragon.svg|20]]',
    ])('%s is a vault image', (input) => {
        const parsed = parseIconValue(input);
        expect(parsed?.kind).toBe('vault');
        expect(parsed?.ref).not.toMatch(/[|[\]]/);
    });

    it('strips the alias and size from wikilinks', () => {
        expect(parseIconValue('![[dragon.svg|20]]')).toMatchObject({ kind: 'vault', ref: 'dragon.svg' });
        expect(parseIconValue('[[Art/dragon.png|Dragon]]')).toMatchObject({ kind: 'vault', ref: 'Art/dragon.png' });
    });

    it.each([
        'Art/dragon.webp',
        'Art/dragon.png',
        'Art/dragon.jpg',
        'Art/dragon.jpeg',
        'Art/dragon.gif',
        'Art/dragon.svg',
        'Art/dragon.avif',
        'Art/dragon.bmp',
        'Art/Big Dragon.PNG',
    ])('%s is a vault path', (input) => {
        expect(parseIconValue(input)).toEqual({ kind: 'vault', ref: input, raw: input });
    });

    it('does not read a wikilink to a note as an icon', () => {
        expect(parseIconValue('[[Ada Lovelace]]')).toBeNull();
    });
});

describe('parseIconValue: URLs and data URIs', () => {
    it('reads http and https URLs as url', () => {
        expect(parseIconValue('https://example.com/dragon.png')).toEqual({
            kind: 'url',
            ref: 'https://example.com/dragon.png',
            raw: 'https://example.com/dragon.png',
        });
        expect(parseIconValue('http://example.com/a')).toMatchObject({ kind: 'url' });
    });

    it('reads data:image URIs as data', () => {
        const uri = 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E';
        expect(parseIconValue(uri)).toEqual({ kind: 'data', ref: uri, raw: uri });
        expect(parseIconValue('data:image/png;base64,AAAA')).toMatchObject({ kind: 'data' });
    });

    it('rejects data URIs that are not images', () => {
        expect(parseIconValue('data:text/plain,hello')).toBeNull();
    });
});

describe('parseIconValue: trimming, quotes and garbage', () => {
    it('trims whitespace', () => {
        expect(parseIconValue('   sword  ')).toMatchObject({ kind: 'lucide', ref: 'sword', raw: 'sword' });
    });

    it('strips one pair of surrounding quotes', () => {
        expect(parseIconValue('"sword"')).toMatchObject({ kind: 'lucide', ref: 'sword', raw: 'sword' });
        expect(parseIconValue("'[[dragon.png]]'")).toMatchObject({ kind: 'vault', ref: 'dragon.png' });
        expect(parseIconValue('"⚔️"')).toMatchObject({ kind: 'emoji' });
    });

    it('returns null for empty, blank and non-string values', () => {
        expect(parseIconValue('')).toBeNull();
        expect(parseIconValue('   ')).toBeNull();
        expect(parseIconValue('""')).toBeNull();
        expect(parseIconValue(undefined)).toBeNull();
        expect(parseIconValue(null)).toBeNull();
        expect(parseIconValue(42)).toBeNull();
        expect(parseIconValue(['sword'])).toBeNull();
        expect(parseIconValue({ icon: 'sword' })).toBeNull();
    });

    it('returns null for text with spaces that is not an emoji', () => {
        expect(parseIconValue('sword fight')).toBeNull();
        expect(parseIconValue('Sword Fight')).toBeNull();
        expect(parseIconValue('⚔️ sword')).toBeNull();
    });

    it('returns null for punctuation and other junk', () => {
        expect(parseIconValue('!!!')).toBeNull();
        expect(parseIconValue('../../etc')).toBeNull();
        expect(parseIconValue('sword/')).toBeNull();
    });
});

describe('isValidIconColor', () => {
    it.each(['#c9a227', '#fff', '#ffff', '#c9a22780', 'rgb(10, 20, 30)', 'hsl(120 50% 40% / 0.5)'])('accepts %s', (v) => {
        expect(isValidIconColor(v)).toBe(true);
    });

    it.each(['', 'gold', 'javascript:alert(1)', '#zzz', '#12345', 42, undefined, null])('rejects %s', (v) => {
        expect(isValidIconColor(v)).toBe(false);
    });
});

describe('iconColorKey', () => {
    it('derives the colour key from the icon key', () => {
        expect(iconColorKey('icon')).toBe('iconColor');
        expect(iconColorKey('mapIcon')).toBe('mapIconColor');
        expect(iconColorKey('timeline-icon')).toBe('timeline-iconColor');
    });
});

describe('iconForEntity', () => {
    it('returns the parsed icon with a valid colour', () => {
        const source = iconForEntity({ icon: 'sword', iconColor: '#c9a227' }, ON);
        expect(source).toEqual({
            kind: 'icon',
            icon: { kind: 'lucide', ref: 'sword', raw: 'sword' },
            color: '#c9a227',
        });
    });

    it('drops an invalid colour but keeps the icon', () => {
        const source = iconForEntity({ icon: 'sword', iconColor: 'javascript:x' }, ON);
        expect(source).toEqual({ kind: 'icon', icon: { kind: 'lucide', ref: 'sword', raw: 'sword' } });
        expect(source && 'color' in source).toBe(false);
    });

    it('prefers the icon over the cover image', () => {
        const source = iconForEntity({ icon: '🐉', profileImagePath: 'Art/dragon.png' }, ON);
        expect(source).toMatchObject({ kind: 'icon', icon: { kind: 'emoji' } });
    });

    it('falls back to the cover image when there is no icon', () => {
        expect(iconForEntity({ profileImagePath: 'Art/dragon.png' }, ON)).toEqual({ kind: 'cover', path: 'Art/dragon.png' });
    });

    it('falls back to the cover image when the icon is unrecognised', () => {
        expect(iconForEntity({ icon: 'sword fight', profileImagePath: 'Art/dragon.png' }, ON)).toEqual({ kind: 'cover', path: 'Art/dragon.png' });
    });

    it('returns null when there is neither an icon nor a cover image', () => {
        expect(iconForEntity({}, ON)).toBeNull();
        expect(iconForEntity({ icon: '' }, ON)).toBeNull();
        expect(iconForEntity({ profileImagePath: '   ' }, ON)).toBeNull();
    });

    it('returns null when icons are hidden, even with an icon and a cover image', () => {
        expect(iconForEntity({ icon: 'sword', profileImagePath: 'a.png' }, { showIcons: false, useCoverImage: true })).toBeNull();
    });

    it('ignores the cover image when that setting is off', () => {
        expect(iconForEntity({ profileImagePath: 'a.png' }, { showIcons: true, useCoverImage: false })).toBeNull();
    });

    it('still shows an icon when the cover image setting is off', () => {
        expect(iconForEntity({ icon: 'sword' }, { showIcons: true, useCoverImage: false })).toMatchObject({ kind: 'icon' });
    });

    it('covers the full settings matrix for an entity with both an icon and a cover', () => {
        const entity = { icon: 'sword', profileImagePath: 'a.png' };
        expect(iconForEntity(entity, { showIcons: true, useCoverImage: true })).toMatchObject({ kind: 'icon' });
        expect(iconForEntity(entity, { showIcons: true, useCoverImage: false })).toMatchObject({ kind: 'icon' });
        expect(iconForEntity(entity, { showIcons: false, useCoverImage: true })).toBeNull();
        expect(iconForEntity(entity, { showIcons: false, useCoverImage: false })).toBeNull();
    });

    it('covers the settings matrix for an entity with only a cover image', () => {
        const entity = { profileImagePath: 'a.png' };
        expect(iconForEntity(entity, { showIcons: true, useCoverImage: true })).toEqual({ kind: 'cover', path: 'a.png' });
        expect(iconForEntity(entity, { showIcons: true, useCoverImage: false })).toBeNull();
        expect(iconForEntity(entity, { showIcons: false, useCoverImage: true })).toBeNull();
    });
});

describe('isSafeFrontmatterKey', () => {
    it.each(['icon', 'timelineIcon', 'map-icon', 'icon_2', 'Icon'])('accepts %s', (k) => {
        expect(isSafeFrontmatterKey(k)).toBe(true);
    });

    it.each(['', '2icon', '_icon', 'my icon', 'icon:x', 'a'.repeat(65), 'name', 'entityType', 'id', 'tags', 42, undefined])('rejects %s', (k) => {
        expect(isSafeFrontmatterKey(k)).toBe(false);
    });
});

describe('resolveIconPropertyKeys', () => {
    it('uses icon and iconColor by default', () => {
        expect(resolveIconPropertyKeys(undefined, undefined)).toEqual({ icon: 'icon', color: 'iconColor' });
        expect(resolveIconPropertyKeys('', '')).toEqual({ icon: 'icon', color: 'iconColor' });
    });

    it('derives the colour key from a custom icon key', () => {
        expect(resolveIconPropertyKeys('timelineIcon', '')).toEqual({ icon: 'timelineIcon', color: 'timelineIconColor' });
    });

    it('uses an explicit colour key when given', () => {
        expect(resolveIconPropertyKeys('timelineIcon', 'tint')).toEqual({ icon: 'timelineIcon', color: 'tint' });
    });

    it('falls back to the default when the icon key is unsafe', () => {
        expect(resolveIconPropertyKeys('name', '')).toEqual({ icon: 'icon', color: 'iconColor' });
    });
});

describe('readIconFromFrontmatter and writeIconToFrontmatter', () => {
    const keys = { icon: 'timelineIcon', color: 'timelineIconColor' };

    it('reads only the configured keys', () => {
        const fm = { icon: 'book-open', timelineIcon: 'sword', timelineIconColor: '#fff' };
        expect(readIconFromFrontmatter(fm, keys)).toEqual({ icon: 'sword', iconColor: '#fff' });
    });

    it('ignores non-string and blank values', () => {
        expect(readIconFromFrontmatter({ timelineIcon: 3, timelineIconColor: '  ' }, keys)).toEqual({});
    });

    it('writes configured keys and asks for the empty ones to be removed', () => {
        expect(writeIconToFrontmatter({ icon: ' sword ', iconColor: '' }, keys)).toEqual({
            set: { timelineIcon: 'sword' },
            omit: ['timelineIconColor'],
        });
        expect(writeIconToFrontmatter({}, keys)).toEqual({
            set: {},
            omit: ['timelineIcon', 'timelineIconColor'],
        });
    });
});
