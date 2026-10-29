/**
 * Icon values for timeline entities (events and scenes).
 *
 * Pure module: no Obsidian imports, so it can run in unit tests and in any view.
 * The renderer decides whether a Lucide name, pack id or vault path actually
 * exists; this file only decides what kind of value the user wrote.
 */

export type IconKind = 'lucide' | 'ink' | 'pack' | 'emoji' | 'vault' | 'url' | 'data';

export interface ParsedIcon {
    kind: IconKind;
    /** Icon id inside its kind: a Lucide name, an ink symbol, a pack icon, the emoji itself, a vault path, a URL or a data URI. */
    ref: string;
    /** Pack prefix (Iconize style) or pack folder name. Only set for `kind: 'pack'`. */
    pack?: string;
    /** The trimmed value with surrounding quotes removed, before it was split into kind and ref. */
    raw: string;
}

export interface IconDisplaySettings {
    showIcons: boolean;
    useCoverImage: boolean;
}

export type EntityIconSource =
    | { kind: 'icon'; icon: ParsedIcon; color?: string }
    | { kind: 'cover'; path: string }
    | null;

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const WIKILINK = /^!?\[\[([^\]]+)\]\]$/;
const DATA_URI = /^data:image\/[a-z0-9.+-]+[;,]/i;
const HTTP_URL = /^https?:\/\/\S+$/i;
const EXPLICIT_PACK = /^pack:([a-z0-9][a-z0-9._-]*)\/([a-z0-9][a-z0-9._-]*)$/;
const PREFIXED_LUCIDE = /^lucide[:-]([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const INK = /^ink:([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const PREFIXED_PACK = /^([A-Za-z]{2,4})([A-Z][A-Za-z0-9]*)$/;
const BARE_LUCIDE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/**
 * Emoji, emoji modifiers, regional indicators, ZWJ and variation selectors, with
 * at least one pictographic character. Digits are excluded on purpose: they are
 * Emoji_Component characters too, and "123" must not read as an emoji.
 */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍|︎|️)+$/u;
const HAS_PICTOGRAPHIC = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL_COLOR = /^(?:rgba?|hsla?)\([0-9.,%\s/+-]+\)$/i;

/** Strip one pair of matching surrounding quotes, then trim. */
function normaliseRaw(value: string): string {
    let out = value.trim();
    if (out.length >= 2) {
        const first = out[0];
        const last = out[out.length - 1];
        if ((first === '"' || first === "'") && first === last) {
            out = out.slice(1, -1).trim();
        }
    }
    return out;
}

/**
 * Parse a frontmatter icon value into a kind and reference.
 * Returns null for empty, non-string or unrecognised values. Callers draw the plain dot for null.
 */
export function parseIconValue(value: unknown): ParsedIcon | null {
    if (typeof value !== 'string') return null;
    const raw = normaliseRaw(value);
    if (!raw) return null;

    const wiki = raw.match(WIKILINK);
    if (wiki) {
        // [[dragon.png|200]] and ![[dragon.svg|20]]: drop the alias or size after the first pipe.
        const target = wiki[1].split('|')[0].trim();
        if (!target || !IMAGE_EXTENSION.test(target)) return null;
        return { kind: 'vault', ref: target, raw };
    }

    if (DATA_URI.test(raw)) return { kind: 'data', ref: raw, raw };
    if (HTTP_URL.test(raw)) return { kind: 'url', ref: raw, raw };

    const explicitPack = raw.match(EXPLICIT_PACK);
    if (explicitPack) return { kind: 'pack', pack: explicitPack[1], ref: explicitPack[2], raw };

    const lucide = raw.match(PREFIXED_LUCIDE);
    if (lucide) return { kind: 'lucide', ref: lucide[1], raw };

    const ink = raw.match(INK);
    if (ink) return { kind: 'ink', ref: ink[1], raw };

    if (EMOJI_ONLY.test(raw) && HAS_PICTOGRAPHIC.test(raw)) return { kind: 'emoji', ref: raw, raw };

    if (IMAGE_EXTENSION.test(raw)) return { kind: 'vault', ref: raw, raw };

    const pascal = raw.match(PREFIXED_PACK);
    if (pascal) return { kind: 'pack', pack: pascal[1], ref: pascal[2], raw };

    if (BARE_LUCIDE.test(raw)) return { kind: 'lucide', ref: raw, raw };

    return null;
}

/** True for a hex colour (3, 4, 6 or 8 digits) or a plain rgb()/hsl() function. */
export function isValidIconColor(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    const value = v.trim();
    return HEX_COLOR.test(value) || FUNCTIONAL_COLOR.test(value);
}

/**
 * Decide what a timeline marker shows for an entity.
 * Icon first, then the cover image when allowed, otherwise nothing.
 */
export function iconForEntity(
    entity: { icon?: string; iconColor?: string; profileImagePath?: string },
    settings: IconDisplaySettings
): EntityIconSource {
    if (!settings.showIcons) return null;

    const icon = parseIconValue(entity.icon);
    if (icon) {
        const color = isValidIconColor(entity.iconColor) ? entity.iconColor.trim() : undefined;
        return color ? { kind: 'icon', icon, color } : { kind: 'icon', icon };
    }

    if (settings.useCoverImage && typeof entity.profileImagePath === 'string' && entity.profileImagePath.trim()) {
        return { kind: 'cover', path: entity.profileImagePath.trim() };
    }

    return null;
}

/**
 * Frontmatter key for the colour, derived from the icon key:
 * `icon` gives `iconColor`, `mapIcon` gives `mapIconColor`.
 */
export function iconColorKey(iconProperty: string): string {
    const base = (iconProperty ?? '').trim() || 'icon';
    return `${base}Color`;
}

/** Keys that hold core entity data and can never be used as the icon property. */
const RESERVED_ICON_KEYS = new Set([
    'id', 'entityType', 'name', 'filePath', 'tags', 'dateTime', 'status',
    'profileImagePath', 'images', 'characters', 'items', 'content', 'beats',
    'connections', 'customFields', 'color', 'mapCoordinates', 'mapId', 'markerId',
    'linkedChapters', 'linkedScenes', 'chapterId', 'chapterName', 'sections',
]);

/**
 * A frontmatter key that is safe to use as the icon or colour property:
 * starts with a letter, letters, digits, `_` or `-` only, up to 64 characters,
 * not a leading-underscore runtime key, and not a core entity key.
 */
export function isSafeFrontmatterKey(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v)) return false;
    return !RESERVED_ICON_KEYS.has(v);
}

export interface IconPropertyKeys {
    /** Frontmatter key holding the icon value. */
    icon: string;
    /** Frontmatter key holding the icon colour. */
    color: string;
}

/**
 * Resolve the frontmatter keys from plugin settings. Empty or unsafe values fall back to
 * `icon` and to the colour key derived from the icon key.
 */
export function resolveIconPropertyKeys(
    iconProperty: string | undefined,
    colorProperty: string | undefined
): IconPropertyKeys {
    const icon = isSafeFrontmatterKey(iconProperty?.trim()) ? iconProperty!.trim() : 'icon';
    const explicitColor = colorProperty?.trim() ?? '';
    const color = isSafeFrontmatterKey(explicitColor) ? explicitColor : iconColorKey(icon);
    return { icon, color };
}

/**
 * Read the icon and colour from a note's frontmatter. Only the configured keys are read;
 * other keys are never touched. Non-string values are ignored.
 */
export function readIconFromFrontmatter(
    frontmatter: Record<string, unknown>,
    keys: IconPropertyKeys
): { icon?: string; iconColor?: string } {
    const out: { icon?: string; iconColor?: string } = {};
    const icon = frontmatter[keys.icon];
    if (typeof icon === 'string' && icon.trim() !== '') out.icon = icon.trim();
    const color = frontmatter[keys.color];
    if (typeof color === 'string' && color.trim() !== '') out.iconColor = color.trim();
    return out;
}

/**
 * Turn an entity's `icon` and `iconColor` into frontmatter writes.
 * `set` holds the configured keys with values. `omit` lists the configured keys that
 * must be removed from the note because the value is now empty. Nothing else changes.
 */
export function writeIconToFrontmatter(
    entity: { icon?: unknown; iconColor?: unknown },
    keys: IconPropertyKeys
): { set: Record<string, string>; omit: string[] } {
    const set: Record<string, string> = {};
    const omit: string[] = [];

    const icon = typeof entity.icon === 'string' ? entity.icon.trim() : '';
    if (icon) set[keys.icon] = icon;
    else omit.push(keys.icon);

    const color = typeof entity.iconColor === 'string' ? entity.iconColor.trim() : '';
    if (color) set[keys.color] = color;
    else omit.push(keys.color);

    return { set, omit };
}
