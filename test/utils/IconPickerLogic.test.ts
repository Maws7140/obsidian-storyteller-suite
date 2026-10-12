import { describe, it, expect } from 'vitest';
import { parseIconValue } from '../../src/utils/EntityIcon';
import {
    RECENT_ICON_LIMIT,
    normaliseRecentIcons,
    rememberRecentIcon,
    validateWebImageUrl,
    extensionFromImageUrl,
    imageExtensionFor,
    webImageFileName,
    uploadFileName,
    parseColourInput,
    colourInputValue,
    isTintableIconKind,
} from '../../src/utils/IconPickerLogic';

describe('recent icons', () => {
    it('puts the picked value first and removes its older copy', () => {
        const before = ['sword', 'ink:door', '🐉'];
        expect(rememberRecentIcon(before, 'ink:door')).toEqual(['ink:door', 'sword', '🐉']);
    });

    it('does not change the list it is given', () => {
        const before = ['sword'];
        rememberRecentIcon(before, 'shield');
        expect(before).toEqual(['sword']);
    });

    it('caps the list at 24 entries, newest first', () => {
        let list: string[] = [];
        for (let i = 0; i < 30; i++) list = rememberRecentIcon(list, `icon-${i}`);
        expect(list).toHaveLength(RECENT_ICON_LIMIT);
        expect(list[0]).toBe('icon-29');
        expect(list[RECENT_ICON_LIMIT - 1]).toBe('icon-6');
    });

    it('ignores blank picks and keeps the list as it was', () => {
        expect(rememberRecentIcon(['sword'], '   ')).toEqual(['sword']);
    });

    it('cleans a stored list: strings only, trimmed, no duplicates, parseable values only', () => {
        const stored = [' sword ', 42, 'sword', '', 'ink:door', '!!!', null, 'GiDragonHead'];
        expect(normaliseRecentIcons(stored)).toEqual(['sword', 'ink:door', 'GiDragonHead']);
        expect(normaliseRecentIcons(undefined)).toEqual([]);
    });

    it('remembers a pick that is not in the stored list as the first entry, even when the list was over the cap', () => {
        const full = Array.from({ length: RECENT_ICON_LIMIT }, (_, i) => `icon-${i}`);
        const next = rememberRecentIcon(full, 'shield');
        expect(next[0]).toBe('shield');
        expect(next).toHaveLength(RECENT_ICON_LIMIT);
        expect(next).not.toContain(`icon-${RECENT_ICON_LIMIT - 1}`);
    });
});

describe('web image URLs and file names', () => {
    it('accepts http and https links and rejects everything else', () => {
        expect(validateWebImageUrl('https://example.com/dragon.png')).toBe('https://example.com/dragon.png');
        expect(validateWebImageUrl('  http://example.com/a.gif  ')).toBe('http://example.com/a.gif');
        expect(validateWebImageUrl('ftp://example.com/a.png')).toBeNull();
        expect(validateWebImageUrl('javascript:alert(1)')).toBeNull();
        expect(validateWebImageUrl('not a url')).toBeNull();
        expect(validateWebImageUrl('')).toBeNull();
    });

    it('takes the extension from a content type first', () => {
        expect(imageExtensionFor('image/png', 'https://x.test/a.jpg')).toBe('png');
        expect(imageExtensionFor('image/jpeg; charset=binary', 'https://x.test/a')).toBe('jpg');
        expect(imageExtensionFor('image/svg+xml', 'https://x.test/a')).toBe('svg');
        expect(imageExtensionFor('IMAGE/WEBP', 'https://x.test/a')).toBe('webp');
    });

    it('refuses non-image content types and image types the icon parser does not take', () => {
        expect(imageExtensionFor('text/html', 'https://x.test/a.png')).toBeNull();
        expect(imageExtensionFor('image/x-icon', 'https://x.test/favicon.ico')).toBeNull();
    });

    it('falls back to the link extension when the content type is missing or generic', () => {
        expect(imageExtensionFor(null, 'https://x.test/dragon.JPEG')).toBe('jpg');
        expect(imageExtensionFor('application/octet-stream', 'https://x.test/dragon.webp?v=2')).toBe('webp');
        expect(imageExtensionFor('', 'https://x.test/dragon')).toBeNull();
        expect(imageExtensionFor('', 'https://x.test/page.html')).toBeNull();
    });

    it('reads link extensions only for image types', () => {
        expect(extensionFromImageUrl('https://x.test/a.avif')).toBe('avif');
        expect(extensionFromImageUrl('https://x.test/a.tiff')).toBeNull();
        expect(extensionFromImageUrl('https://x.test/')).toBeNull();
    });

    it('builds a safe, timestamped file name with the right extension', () => {
        expect(webImageFileName('https://x.test/files/Dragon%20Head.PNG', 'image/png', 1700000000000))
            .toBe('1700000000000_Dragon-Head.png');
        expect(webImageFileName('https://x.test/a/%E2%9C%A8%E2%9C%A8.gif', 'image/gif', 5)).toBe('5_image.gif');
        expect(webImageFileName('https://x.test/cafe%CC%81.webp', 'image/webp', 7)).toBe('7_cafe.webp');
    });

    it('caps long stems and never leaves a hyphen at the end', () => {
        const long = `https://x.test/${'a-'.repeat(60)}.png`;
        const name = webImageFileName(long, 'image/png', 1)!;
        const stem = name.replace(/^1_/, '').replace(/\.png$/, '');
        expect(stem.length).toBeLessThanOrEqual(60);
        expect(stem.endsWith('-')).toBe(false);
    });

    it('returns null when the download is not an image', () => {
        expect(webImageFileName('https://x.test/page', 'text/html', 1)).toBeNull();
    });

    it('produces paths the icon parser accepts as vault images', () => {
        const name = webImageFileName('https://x.test/a.svg', 'image/svg+xml', 3)!;
        const path = `StorytellerSuite/GalleryUploads/${name}`;
        expect(parseIconValue(path)).toMatchObject({ kind: 'vault', ref: path });
    });
});

describe('upload file names', () => {
    it('keeps word characters, dots and dashes, and turns spaces into underscores', () => {
        expect(uploadFileName('My Dragon (final).png', 9)).toBe('9_My_Dragon_final.png');
        expect(uploadFileName('a-b.c.webp', 1)).toBe('1_a-b.c.webp');
    });
});

describe('colour input', () => {
    it('accepts hex with or without a hash, and rgb and hsl', () => {
        expect(parseColourInput('#B03A2E')).toBe('#B03A2E');
        expect(parseColourInput('b03a2e')).toBe('#b03a2e');
        expect(parseColourInput('abc')).toBe('#abc');
        expect(parseColourInput('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)');
        expect(parseColourInput('red')).toBeNull();
        expect(parseColourInput('#12')).toBeNull();
    });

    it('gives a six digit value for the colour input, expanding short hex', () => {
        expect(colourInputValue('#abc')).toBe('#aabbcc');
        expect(colourInputValue('#B03A2E')).toBe('#b03a2e');
        expect(colourInputValue('rgb(1,2,3)')).toBe('#888888');
        expect(colourInputValue(null)).toBe('#888888');
    });

    it('marks only icon kinds as tintable', () => {
        expect(isTintableIconKind('lucide')).toBe(true);
        expect(isTintableIconKind('ink')).toBe(true);
        expect(isTintableIconKind('pack')).toBe(true);
        expect(isTintableIconKind('emoji')).toBe(false);
        expect(isTintableIconKind('vault')).toBe(false);
        expect(isTintableIconKind(undefined)).toBe(false);
    });
});
