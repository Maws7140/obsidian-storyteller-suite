/**
 * Map Ink tokens: the round markers for characters, locations, items, events and
 * other entities. A token is a disc in the entity colour with a white glyph (or a
 * circular portrait), a light ring and a soft shadow. A count pill sits top right
 * and an optional label sits below with a halo.
 *
 * tokenHtml() returns a string. Every caller-supplied value is escaped, and the
 * glyph comes only from the built-in library (theme.ts or symbols.ts), never from raw input.
 *
 * Pure TypeScript: no Obsidian or DOM imports, and no imports from outside this folder.
 */

import { ENTITY_GLYPHS, entityColor, entityGlyph, entityTokenType, type EntityTokenType } from './theme';
import { getSymbol } from './symbols';

export type TokenSize = 'sm' | 'md' | 'lg';

/** Token diameter in CSS pixels. */
export const TOKEN_SIZES: Readonly<Record<TokenSize, number>> = { sm: 22, md: 28, lg: 36 };

export interface TokenState {
    current?: boolean;
    selected?: boolean;
}

export interface TokenOptions {
    /** Entity type, in any spelling ("character", "magicSystem", ...). Unknown types use the default colour. */
    type: string;
    /** A ENTITY_GLYPHS key, or a symbol id from symbols.ts. Defaults to the type's glyph. */
    glyph?: string;
    /** Disc colour: #hex, rgb()/hsl() or a plain colour name. Defaults to the type's colour. */
    color?: string;
    /** Text shown under the token, with a halo. */
    label?: string;
    /** Count shown in a pill top right. Shown when it reaches minCount. */
    count?: number;
    /** The smallest count that shows a pill. Defaults to 2, so a single item shows no pill. */
    minCount?: number;
    size?: TokenSize;
    state?: TokenState;
    /** Portrait image drawn over the disc. The glyph stays underneath if it fails to load. */
    imageUrl?: string;
}

const COLOUR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|(rgb|rgba|hsl|hsla)\([0-9.,%\s]+\))$/;

/** Escapes text for element content and quoted attribute values. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveSize(size: string | undefined): TokenSize {
    return size === 'sm' || size === 'lg' ? size : 'md';
}

/** Token diameter in CSS pixels for a size name. */
export function tokenSizePx(size?: TokenSize): number {
    return TOKEN_SIZES[resolveSize(size)];
}

/** The divIcon iconSize for a token: a square, the token's diameter. */
export function tokenIconSize(size?: TokenSize): [number, number] {
    const px = tokenSizePx(size);
    return [px, px];
}

/** The divIcon iconAnchor for a token: its centre, so the token sits on the map point. */
export function tokenAnchor(size?: TokenSize): [number, number] {
    const half = tokenSizePx(size) / 2;
    return [half, half];
}

function glyphBody(type: string, glyph: string | undefined): string {
    if (glyph) {
        if (Object.prototype.hasOwnProperty.call(ENTITY_GLYPHS, glyph)) {
            return ENTITY_GLYPHS[glyph as EntityTokenType];
        }
        const symbol = getSymbol(glyph);
        if (symbol) return symbol.body;
    }
    return entityGlyph(type);
}

function colourValue(color: string | undefined, type: string): string {
    if (color && COLOUR_PATTERN.test(color.trim())) return color.trim();
    return entityColor(type);
}

/** HTML for one token. Returns a span tree; wrap it in a div when placing it on a map. */
export function tokenHtml(opts: TokenOptions): string {
    const size = resolveSize(opts.size);
    const px = tokenSizePx(size);
    const typeKey = entityTokenType(opts.type);
    const colour = colourValue(opts.color, opts.type);
    const glyphPx = Math.round(px * 0.58);

    const classes = ['ink-token', `ink-token-${size}`, `ink-token-type-${typeKey}`];
    if (opts.state?.current) classes.push('is-current');
    if (opts.state?.selected) classes.push('is-selected');

    const glyph = `<svg class="ink-token-glyph" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"`
        + ` width="${glyphPx}" height="${glyphPx}" fill="none" stroke="currentColor" stroke-width="2"`
        + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`
        + `${glyphBody(opts.type, opts.glyph)}</svg>`;

    const portrait = opts.imageUrl
        ? `<img class="ink-token-portrait" src="${escapeHtml(opts.imageUrl)}" alt="" draggable="false" onerror="this.remove()">`
        : '';

    const threshold = Math.max(1, opts.minCount ?? 2);
    const count = typeof opts.count === 'number' && Number.isFinite(opts.count) ? Math.floor(opts.count) : 0;
    const pill = count >= threshold && count > 0
        ? `<span class="ink-token-count">${count}</span>`
        : '';

    const label = opts.label && opts.label.trim().length > 0
        ? `<span class="ink-token-label">${escapeHtml(opts.label.trim())}</span>`
        : '';

    const style = `--ink-token-size:${px}px;--ink-token-color:${colour}`;

    return `<span class="${classes.join(' ')}" data-token-type="${typeKey}" style="${escapeHtml(style)}">`
        + `<span class="ink-token-disc">${glyph}${portrait}</span>`
        + `${pill}${label}</span>`;
}
