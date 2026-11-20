/**
 * Token tests for Map Ink. No DOM library is installed, so these tests read the
 * returned HTML string with small regex helpers instead of parsing it.
 */
import { describe, expect, it } from 'vitest';
import {
    ENTITY_COLORS,
    ENTITY_GLYPHS,
    ENTITY_TOKEN_TYPES,
    entityColor,
    entityGlyph,
    entityTokenType,
} from '../../src/leaflet/ink/theme';
import { TOKEN_SIZES, escapeHtml, tokenAnchor, tokenHtml, tokenIconSize, tokenSizePx } from '../../src/leaflet/ink/tokens';

/** The class list of the token root element. */
function rootClasses(html: string): string[] {
    const m = /^<span class="([^"]*)"/.exec(html);
    return m ? m[1].split(' ') : [];
}

/** A custom property set on the token root, or undefined. */
function rootVar(html: string, name: string): string | undefined {
    const style = /style="([^"]*)"/.exec(html)?.[1] ?? '';
    const decoded = style.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const m = new RegExp(`${name}:([^;]*)`).exec(decoded);
    return m ? m[1] : undefined;
}

function countText(html: string): string | undefined {
    return /<span class="ink-token-count">([^<]*)<\/span>/.exec(html)?.[1];
}

function labelText(html: string): string | undefined {
    return /<span class="ink-token-label">([^<]*)<\/span>/.exec(html)?.[1];
}

function glyphInner(html: string): string | undefined {
    return /<svg class="ink-token-glyph"[^>]*>([\s\S]*?)<\/svg>/.exec(html)?.[1];
}

function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function whiteContrast(hex: string): number {
    return 1.05 / (luminance(hex) + 0.05);
}

describe('theme colours and glyphs', () => {
    it('defines a colour and a glyph for every token type', () => {
        for (const type of ENTITY_TOKEN_TYPES) {
            expect(ENTITY_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/);
            expect(ENTITY_GLYPHS[type].length).toBeGreaterThan(0);
        }
        expect(ENTITY_TOKEN_TYPES).toEqual(expect.arrayContaining([
            'character', 'location', 'item', 'event', 'group', 'encounter',
            'scene', 'culture', 'economy', 'magic', 'reference', 'portal', 'default',
        ]));
    });

    it('keeps a white glyph readable on every token colour', () => {
        for (const type of ENTITY_TOKEN_TYPES) {
            expect(whiteContrast(ENTITY_COLORS[type])).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('uses a distinct colour for every type', () => {
        const values = Object.values(ENTITY_COLORS);
        expect(new Set(values).size).toBe(values.length);
    });

    it('draws glyphs with currentColor, none or the stroke only', () => {
        for (const type of ENTITY_TOKEN_TYPES) {
            const body = ENTITY_GLYPHS[type];
            const colours = [...body.matchAll(/(fill|stroke)="([^"]*)"/g)].map(m => m[2]);
            for (const value of colours) {
                expect(['none', 'currentColor']).toContain(value);
            }
            expect(body).not.toMatch(/<(script|style|image|foreignObject)/i);
        }
    });

    it('normalises type spellings', () => {
        expect(entityTokenType('magicSystem')).toBe('magic');
        expect(entityTokenType('magic-system')).toBe('magic');
        expect(entityTokenType('magicsystem')).toBe('magic');
        expect(entityTokenType('plotItem')).toBe('item');
        expect(entityTokenType('Character')).toBe('character');
        expect(entityTokenType('nonsense')).toBe('default');
        expect(entityTokenType(undefined)).toBe('default');
    });

    it('returns colour and glyph for a type through the helpers', () => {
        expect(entityColor('character')).toBe(ENTITY_COLORS.character);
        expect(entityColor('unknown-kind')).toBe(ENTITY_COLORS.default);
        expect(entityGlyph('magicSystem')).toBe(ENTITY_GLYPHS.magic);
    });
});

describe('token sizes and anchors', () => {
    it('uses the agreed diameters', () => {
        expect(TOKEN_SIZES).toEqual({ sm: 22, md: 28, lg: 36 });
        expect(tokenSizePx('sm')).toBe(22);
        expect(tokenSizePx('lg')).toBe(36);
    });

    it('centres the anchor on the token so it sits on the point', () => {
        expect(tokenIconSize('md')).toEqual([28, 28]);
        expect(tokenAnchor('md')).toEqual([14, 14]);
        expect(tokenAnchor('lg')).toEqual([18, 18]);
    });

    it('falls back to md for an unknown size', () => {
        expect(tokenSizePx(undefined)).toBe(28);
        expect(tokenIconSize('huge' as never)).toEqual([28, 28]);
    });
});

describe('tokenHtml', () => {
    it('builds a disc with a glyph, in the type colour, at the size', () => {
        const html = tokenHtml({ type: 'character', size: 'lg' });
        const classes = rootClasses(html);
        expect(classes).toContain('ink-token');
        expect(classes).toContain('ink-token-lg');
        expect(classes).toContain('ink-token-type-character');
        expect(html).toContain('data-token-type="character"');
        expect(rootVar(html, '--ink-token-color')).toBe(ENTITY_COLORS.character);
        expect(rootVar(html, '--ink-token-size')).toBe('36px');
        expect(html).toContain('<span class="ink-token-disc"><svg class="ink-token-glyph"');
        expect(html).toContain('stroke="currentColor"');
        expect(html).toContain('viewBox="0 0 24 24"');
        expect(html).not.toContain('<img');
    });

    it('defaults to md and the type glyph', () => {
        const html = tokenHtml({ type: 'location' });
        expect(rootClasses(html)).toContain('ink-token-md');
        expect(glyphInner(html)).toBe(ENTITY_GLYPHS.location);
    });

    it('uses a named glyph key, a symbol id, or the type glyph when neither matches', () => {
        expect(glyphInner(tokenHtml({ type: 'item', glyph: 'portal' }))).toBe(ENTITY_GLYPHS.portal);
        expect(glyphInner(tokenHtml({ type: 'item', glyph: 'castle' }))).toBeTruthy();
        expect(glyphInner(tokenHtml({ type: 'item', glyph: 'castle' }))).not.toBe(ENTITY_GLYPHS.item);
        expect(glyphInner(tokenHtml({ type: 'item', glyph: 'not-a-glyph' }))).toBe(ENTITY_GLYPHS.item);
    });

    it('accepts a valid colour override and ignores an invalid one', () => {
        expect(rootVar(tokenHtml({ type: 'event', color: '#123abc' }), '--ink-token-color')).toBe('#123abc');
        const invalid = tokenHtml({ type: 'event', color: 'red; background:url(x)' });
        expect(rootVar(invalid, '--ink-token-color')).toBe(ENTITY_COLORS.event);
        expect(invalid).not.toContain('url(x)');
    });

    it('shows a count pill only from two up by default', () => {
        expect(countText(tokenHtml({ type: 'group', count: 1 }))).toBeUndefined();
        expect(countText(tokenHtml({ type: 'group' }))).toBeUndefined();
        expect(countText(tokenHtml({ type: 'group', count: 2 }))).toBe('2');
        expect(countText(tokenHtml({ type: 'group', count: 12 }))).toBe('12');
    });

    it('lets minCount 1 show a single count', () => {
        expect(countText(tokenHtml({ type: 'location', count: 1, minCount: 1 }))).toBe('1');
        expect(countText(tokenHtml({ type: 'location', count: 0, minCount: 1 }))).toBeUndefined();
    });

    it('draws a portrait over the glyph when an image is given', () => {
        const html = tokenHtml({ type: 'character', imageUrl: 'app://local/portrait.png' });
        expect(html).toContain('<img class="ink-token-portrait" src="app://local/portrait.png"');
        expect(html).toContain('<svg class="ink-token-glyph"');
    });

    it('marks current and selected states with classes', () => {
        const classes = rootClasses(tokenHtml({ type: 'location', state: { current: true, selected: true } }));
        expect(classes).toContain('is-current');
        expect(classes).toContain('is-selected');
        const plain = rootClasses(tokenHtml({ type: 'location' }));
        expect(plain).not.toContain('is-current');
        expect(plain).not.toContain('is-selected');
    });

    it('renders the label under the token, trimmed', () => {
        expect(labelText(tokenHtml({ type: 'location', label: '  Ravenmoor  ' }))).toBe('Ravenmoor');
        expect(labelText(tokenHtml({ type: 'location', label: '   ' }))).toBeUndefined();
    });

    it('escapes labels and attribute values', () => {
        const html = tokenHtml({
            type: 'character',
            label: '<img src=x onerror=alert(1)>',
            imageUrl: 'x" onerror="alert(2)',
        });
        expect(html).not.toContain('<img src=x');
        expect(labelText(html)).toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).toContain('src="x&quot; onerror=&quot;alert(2)"');
        expect(html).not.toContain('onerror="alert(2)"');
    });

    it('escapes text and attribute characters', () => {
        expect(escapeHtml(`a & b < c > "d" 'e'`)).toBe('a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;');
    });

    it('ignores a non-finite count', () => {
        expect(tokenHtml({ type: 'group', count: Number.NaN })).not.toContain('ink-token-count');
    });
});
