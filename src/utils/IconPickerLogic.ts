/**
 * Pure helpers behind the icon picker: the recent list, web image rules and colour
 * input. No Obsidian or DOM imports, so each rule can be unit tested.
 */

import { isValidIconColor, parseIconValue } from './EntityIcon';
import type { IconKind } from './EntityIcon';

/** How many recent picks are kept, newest first. */
export const RECENT_ICON_LIMIT = 24;

/** Largest web image the picker will download into the vault (bytes). */
export const MAX_ICON_DOWNLOAD_BYTES = 20 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/pjpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/x-ms-bmp': 'bmp',
};

const URL_EXTENSIONS: Record<string, string> = {
    png: 'png',
    jpg: 'jpg',
    jpeg: 'jpg',
    gif: 'gif',
    webp: 'webp',
    svg: 'svg',
    avif: 'avif',
    bmp: 'bmp',
};

/** Icon kinds that take the icon colour. Photos and emoji ignore it. */
export function isTintableIconKind(kind: IconKind | null | undefined): boolean {
    return kind === 'lucide' || kind === 'ink' || kind === 'pack';
}

/**
 * Clean a stored recent list: strings only, trimmed, no duplicates, values the parser
 * accepts, capped at `limit`. Order is kept.
 */
export function normaliseRecentIcons(list: unknown, limit: number = RECENT_ICON_LIMIT): string[] {
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const item of list) {
        if (typeof item !== 'string') continue;
        const value = item.trim();
        if (!value || out.includes(value) || !parseIconValue(value)) continue;
        out.push(value);
        if (out.length >= limit) break;
    }
    return out;
}

/**
 * The recent list after a pick: the value moves (or is added) to the front, the rest
 * keep their order, and the list is capped. Returns a new array; the caller writes it
 * back into the existing settings array in place.
 */
export function rememberRecentIcon(list: readonly unknown[], value: string, limit: number = RECENT_ICON_LIMIT): string[] {
    const picked = value.trim();
    if (!picked) return normaliseRecentIcons(list, limit);
    const rest = list.filter(item => typeof item !== 'string' || item.trim() !== picked);
    return normaliseRecentIcons([picked, ...rest], limit);
}

/** A full http or https link, or null. Returns the normalised URL string. */
export function validateWebImageUrl(input: string): string | null {
    const value = input.trim();
    if (!value || /\s/.test(value)) return null;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
}

/** Image extension from the link's path, or null when it is not one the icon parser takes. */
export function extensionFromImageUrl(url: string): string | null {
    try {
        const match = /\.([A-Za-z0-9]{1,5})$/.exec(new URL(url).pathname);
        if (!match) return null;
        return URL_EXTENSIONS[match[1].toLowerCase()] ?? null;
    } catch {
        return null;
    }
}

/**
 * Extension to save a downloaded image under. The server's content type wins. If the
 * server sends no type, or a generic one, the link's extension is used. Anything that
 * is not an image, or an image type the icon parser does not take, gives null.
 */
export function imageExtensionFor(contentType: string | null | undefined, url: string): string | null {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    if (type.startsWith('image/')) return CONTENT_TYPE_EXTENSIONS[type] ?? null;
    if (type === '' || type === 'application/octet-stream' || type === 'binary/octet-stream') {
        return extensionFromImageUrl(url);
    }
    return null;
}

/** File name for a downloaded image: `<timestamp>_<stem>.<ext>`, or null when it is not an image. */
export function webImageFileName(url: string, contentType: string | null | undefined, timestamp: number): string | null {
    const ext = imageExtensionFor(contentType, url);
    if (!ext) return null;
    let last = '';
    try {
        const segments = new URL(url).pathname.split('/').filter(Boolean);
        last = decodeURIComponent(segments[segments.length - 1] ?? '');
    } catch {
        last = '';
    }
    last = last.replace(/\.[A-Za-z0-9]{1,5}$/, '');
    const stem = last
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '') || 'image';
    return `${timestamp}_${stem}.${ext}`;
}

/** Name for an uploaded file, following the gallery upload rule: keep word characters, dots and dashes, spaces become underscores. */
export function uploadFileName(originalName: string, timestamp: number): string {
    const sanitised = originalName.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
    return `${timestamp}_${sanitised}`;
}

/**
 * Colour typed in the picker. Accepts `#rgb`, `#rrggbb`, a bare six or three digit hex,
 * or any colour the icon colour rule takes. Returns the trimmed colour or null.
 */
export function parseColourInput(input: string): string | null {
    let value = input.trim();
    if (/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) value = `#${value}`;
    return isValidIconColor(value) ? value : null;
}

/** A six digit lower-case hex for an `<input type="color">`, from a hex colour. Other colours give a neutral grey. */
export function colourInputValue(colour: string | null | undefined): string {
    const value = (colour ?? '').trim();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    return '#888888';
}
