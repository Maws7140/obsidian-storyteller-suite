import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    SYMBOLS,
    SYMBOL_CATEGORIES,
    getSymbol,
    searchSymbols,
    symbolSvg,
    symbolsByCategory,
} from '../../src/leaflet/ink/symbols';

/**
 * Point, opening and area marks from the old notation that the symbol library ports.
 * Listed here rather than imported, because the old catalogue is removed in a later wave.
 */
const PORTED_IDS = [
    // Openings
    'passage', 'door', 'double', 'window', 'collapsed',
    // Level changes
    'stairs-up', 'stairs-down', 'spiral', 'slope', 'shaft', 'shaft-up',
    // Pits and traps
    'trap', 'pit', 'trapdoor',
    // Fixtures
    'column', 'statue', 'well', 'altar', 'light',
    // Relief and routes
    'peak', 'pass', 'bridge', 'ford', 'ferry',
    // Sites
    'entrance', 'ruin', 'tomb', 'stones', 'shrine', 'lair',
    // Settlements
    'homestead', 'hamlet', 'village', 'town', 'city', 'castle', 'tower', 'inn',
    // Write-ins
    'place-id', 'text', 'north',
    // Terrain areas
    'water', 'plains', 'forest', 'jungle', 'hills', 'mountains', 'desert', 'swamp', 'ice',
];

/** Attribute variants that became their own symbols. */
const VARIANT_IDS = [
    'door-locked', 'door-secret', 'door-barred', 'door-trapped', 'door-oneway',
    'pit-covered', 'trapdoor-secret', 'trapdoor-ceiling',
    'city-port', 'town-port', 'village-port',
    'door-illusory', 'passage-secret',
];

/** Slope grades 1 to 3, which replace the single slope glyph. */
const SLOPE_IDS = ['slope-1', 'slope-2', 'slope-3'];

/** Nature and marker ids added for this library. */
const NEW_IDS = [
    'wave', 'tree', 'pine', 'palm', 'hill', 'mountain', 'reeds', 'rock', 'dune', 'grass', 'snowflake',
    'pin', 'star', 'flag', 'skull', 'x-mark', 'compass-rose', 'scale-bar', 'campfire', 'treasure',
    'question', 'exclamation', 'crossed-swords', 'eye', 'key',
];

/**
 * Minimal well-formedness check: every tag closes in order, attributes are quoted,
 * and no stray angle brackets or ampersands sit outside tags. Returns null when valid.
 */
function wellFormedError(xml: string): string | null {
    const tagRe = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
    const stack: string[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(xml)) !== null) {
        const between = xml.slice(last, match.index);
        if (/[<>&]/.test(between)) return `stray character before offset ${match.index}`;
        last = tagRe.lastIndex;
        const closing = match[1] === '/';
        const name = match[2];
        const selfClosing = match[4] === '/';
        if (closing) {
            const open = stack.pop();
            if (open !== name) return `</${name}> does not match <${open ?? ''}>`;
        } else if (!selfClosing) {
            stack.push(name);
        }
    }
    const tail = xml.slice(last);
    if (/[<>&]/.test(tail)) return 'stray character at end of markup';
    if (stack.length > 0) return `unclosed <${stack[stack.length - 1]}>`;
    return null;
}

function wrapBody(body: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
}

describe('symbol library: structure', () => {
    it('has a unique id for every symbol, in a lowercase kebab form', () => {
        const ids = SYMBOLS.map(symbol => symbol.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('gives every symbol a name, a valid category and at least one keyword', () => {
        const categoryIds = new Set(SYMBOL_CATEGORIES.map(category => category.id));
        for (const symbol of SYMBOLS) {
            expect(symbol.name.trim().length, symbol.id).toBeGreaterThan(0);
            expect(categoryIds.has(symbol.category), symbol.id).toBe(true);
            expect(symbol.keywords.length, symbol.id).toBeGreaterThan(0);
            for (const keyword of symbol.keywords) expect(keyword.trim().length, symbol.id).toBeGreaterThan(0);
        }
    });

    it('lists the six categories in display order with unique ids', () => {
        expect(SYMBOL_CATEGORIES.map(category => category.id)).toEqual([
            'dungeon', 'overland', 'settlements', 'sites', 'nature', 'markers',
        ]);
        expect(SYMBOL_CATEGORIES.map(category => category.name)).toEqual([
            'Dungeon', 'Overland', 'Settlements', 'Sites', 'Nature', 'Markers',
        ]);
    });

    it('has no Maplog mention and no em dashes in names or keywords', () => {
        for (const symbol of SYMBOLS) {
            const text = [symbol.id, symbol.name, ...symbol.keywords].join(' ');
            expect(text.toLowerCase(), symbol.id).not.toContain('maplog');
            expect(text, symbol.id).not.toContain('\u2014');
        }
    });

    it('has no em dashes in the source file', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'src/leaflet/ink/symbols.ts'), 'utf8');
        expect(source).not.toContain('\u2014');
    });

    it('imports nothing, so it stays standalone', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'src/leaflet/ink/symbols.ts'), 'utf8');
        expect(source).not.toMatch(/^\s*import\s/m);
        expect(source).not.toMatch(/\brequire\(/);
    });
});

describe('symbol library: bodies', () => {
    it('uses only currentColor or none as colour values', () => {
        const colourAttr = /\b(stroke|fill|color|stop-color|flood-color|lighting-color)\s*=\s*"([^"]*)"/g;
        for (const symbol of SYMBOLS) {
            let match: RegExpExecArray | null;
            while ((match = colourAttr.exec(symbol.body)) !== null) {
                expect(['currentColor', 'none'], `${symbol.id}: ${match[0]}`).toContain(match[2]);
            }
        }
    });

    it('contains no hex, rgb or named colours anywhere in the markup', () => {
        const hex = /#[0-9a-fA-F]{3,8}\b/;
        const rgb = /\b(rgb|hsl)a?\(/i;
        for (const symbol of SYMBOLS) {
            expect(hex.test(symbol.body), symbol.id).toBe(false);
            expect(rgb.test(symbol.body), symbol.id).toBe(false);
        }
    });

    it('has no ids, scripts, style blocks, nested svg, text, images or links', () => {
        const forbidden = /\s(id|class|style|href|xlink:href)\s*=|<\s*(script|style|svg|text|image|use|foreignObject|defs|pattern|clipPath)\b|url\(/i;
        for (const symbol of SYMBOLS) {
            expect(forbidden.test(symbol.body), symbol.id).toBe(false);
        }
    });

    it('draws every body as well-formed markup', () => {
        for (const symbol of SYMBOLS) {
            expect(wellFormedError(wrapBody(symbol.body)), symbol.id).toBeNull();
        }
    });

    it('keeps geometry inside the 24 grid with 2 units of padding', () => {
        // Numbers in the body that sit in coordinate positions are checked loosely:
        // any absolute coordinate in a 'd' or x/y attribute must be between 0 and 24.
        const numberPair = /\b(?:x|y|cx|cy|x1|x2|y1|y2)="(-?\d+(?:\.\d+)?)"/g;
        for (const symbol of SYMBOLS) {
            let match: RegExpExecArray | null;
            while ((match = numberPair.exec(symbol.body)) !== null) {
                const value = Number(match[1]);
                expect(value, `${symbol.id}: ${match[0]}`).toBeGreaterThanOrEqual(0);
                expect(value, `${symbol.id}: ${match[0]}`).toBeLessThanOrEqual(24);
            }
        }
    });

    it('gives every symbol at least one drawn element', () => {
        for (const symbol of SYMBOLS) {
            expect(/<(path|rect|circle|line|polyline|polygon|ellipse)\b/.test(symbol.body), symbol.id).toBe(true);
        }
    });
});

describe('symbol library: coverage', () => {
    it('ports every point, opening and area mark id from the old notation', () => {
        for (const id of PORTED_IDS) {
            expect(getSymbol(id), id).toBeDefined();
        }
    });

    it('has the attribute variants as their own symbols', () => {
        for (const id of VARIANT_IDS) {
            expect(getSymbol(id), id).toBeDefined();
        }
    });

    it('has the three slope grades, and keeps slope as an alias of slope-3', () => {
        for (const id of SLOPE_IDS) expect(getSymbol(id), id).toBeDefined();
        expect(getSymbol('slope')?.id).toBe('slope-3');
        expect(SYMBOLS.some(symbol => symbol.id === 'slope')).toBe(false);
    });

    it('has the new nature and marker symbols', () => {
        for (const id of NEW_IDS) {
            expect(getSymbol(id), id).toBeDefined();
        }
    });

    it('puts each symbol in the category its plan group names', () => {
        expect(getSymbol('door')?.category).toBe('dungeon');
        expect(getSymbol('peak')?.category).toBe('overland');
        expect(getSymbol('city-port')?.category).toBe('settlements');
        expect(getSymbol('tomb')?.category).toBe('sites');
        expect(getSymbol('forest')?.category).toBe('nature');
        expect(getSymbol('pin')?.category).toBe('markers');
    });

    it('gives the category counts the plan expects', () => {
        const counts = Object.fromEntries(symbolsByCategory().map(group => [group.category.id, group.symbols.length]));
        expect(counts).toEqual({ dungeon: 31, overland: 5, settlements: 11, sites: 6, nature: 20, markers: 17 });
    });
});

describe('getSymbol', () => {
    it('returns the symbol for a known id', () => {
        expect(getSymbol('well')?.name).toBe('Well');
    });

    it('returns undefined for an unknown id', () => {
        expect(getSymbol('no-such-symbol')).toBeUndefined();
        expect(getSymbol('')).toBeUndefined();
    });
});

describe('searchSymbols', () => {
    it('returns every symbol, in library order, for an empty or blank query', () => {
        expect(searchSymbols('')).toHaveLength(SYMBOLS.length);
        expect(searchSymbols('   ')).toHaveLength(SYMBOLS.length);
        expect(searchSymbols('').map(symbol => symbol.id)).toEqual(SYMBOLS.map(symbol => symbol.id));
    });

    it('finds symbols by name, ignoring case', () => {
        expect(searchSymbols('Locked').map(symbol => symbol.id)).toContain('door-locked');
        expect(searchSymbols('COMPASS').map(symbol => symbol.id)).toEqual(['compass-rose', 'north']);
    });

    it('finds symbols by keyword and by id', () => {
        expect(searchSymbols('harbour').map(symbol => symbol.id)).toEqual(
            expect.arrayContaining(['village-port', 'town-port', 'city-port']),
        );
        expect(searchSymbols('x-mark').map(symbol => symbol.id)).toEqual(['x-mark']);
    });

    it('finds symbols by category name', () => {
        const results = searchSymbols('markers');
        expect(results.length).toBe(17);
        for (const symbol of results) expect(symbol.category).toBe('markers');
    });

    it('requires every word to match', () => {
        expect(searchSymbols('secret door').map(symbol => symbol.id)).toEqual(['door-secret']);
        expect(searchSymbols('secret trapdoor').map(symbol => symbol.id)).toEqual(['trapdoor-secret']);
        expect(searchSymbols('locked compass')).toEqual([]);
    });

    it('matches whole words at the start, so "door" does not match "trapdoor"', () => {
        const ids = searchSymbols('door').map(symbol => symbol.id);
        expect(ids).toContain('door');
        expect(ids).not.toContain('trapdoor');
        expect(searchSymbols('trap').map(symbol => symbol.id)).toEqual(expect.arrayContaining(['trap', 'trapdoor']));
    });

    it('returns no symbols for a word that matches nothing', () => {
        expect(searchSymbols('zzzz')).toEqual([]);
    });
});

describe('symbolsByCategory', () => {
    it('returns the categories in display order and covers every symbol once', () => {
        const groups = symbolsByCategory();
        expect(groups.map(group => group.category.id)).toEqual(SYMBOL_CATEGORIES.map(category => category.id));
        const all = groups.flatMap(group => group.symbols.map(symbol => symbol.id));
        expect(all).toHaveLength(SYMBOLS.length);
        expect(new Set(all).size).toBe(SYMBOLS.length);
    });
});

describe('symbolSvg', () => {
    it('produces a 24 by 24 svg wrapper around the body', () => {
        const svg = symbolSvg('door');
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('viewBox="0 0 24 24"');
        expect(svg).toContain('stroke-width="1.75"');
        expect(svg).toContain('stroke-linecap="round"');
        expect(svg).toContain('stroke-linejoin="round"');
        expect(svg).toContain('fill="none"');
        expect(svg).toContain(getSymbol('door')?.body ?? '#missing#');
        expect(svg.endsWith('</svg>')).toBe(true);
    });

    it('is well-formed XML for every symbol, with default and custom options', () => {
        const optionSets = [
            undefined,
            { size: 16 },
            { size: 48, color: '#ff8800', strokeWidth: 2 },
            { color: 'rgb(10, 20, 30)' },
        ];
        for (const symbol of SYMBOLS) {
            for (const opts of optionSets) {
                expect(wellFormedError(symbolSvg(symbol.id, opts)), `${symbol.id} ${JSON.stringify(opts)}`).toBeNull();
            }
        }
    });

    it('is well-formed for the wrapper with the svg root counted', () => {
        const svg = symbolSvg('pin');
        expect(wellFormedError(svg)).toBeNull();
    });

    it('applies size, colour and stroke width options', () => {
        const svg = symbolSvg('star', { size: 16, color: '#ff8800', strokeWidth: 2.5 });
        expect(svg).toContain('width="16"');
        expect(svg).toContain('height="16"');
        expect(svg).toContain('color="#ff8800"');
        expect(svg).toContain('stroke-width="2.5"');
    });

    it('falls back to defaults for invalid size, colour and stroke width', () => {
        const svg = symbolSvg('star', { size: -4, color: '"><script>', strokeWidth: Number.NaN });
        expect(svg).toContain('width="24"');
        expect(svg).not.toContain('color="');
        expect(svg).not.toContain('<script');
        expect(svg).toContain('stroke-width="1.75"');
    });

    it('returns an empty string for an unknown id', () => {
        expect(symbolSvg('no-such-symbol')).toBe('');
    });
});
