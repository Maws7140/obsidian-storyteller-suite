/**
 * Draws any parsed icon value into an element: Lucide, Map Ink symbol, icon pack,
 * emoji, vault image, web image or data URI. Unknown or missing values draw a small
 * dot, so callers never need an error state.
 */

import { getIcon, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { isValidIconColor, parseIconValue } from './EntityIcon';
import type { ParsedIcon } from './EntityIcon';
import { isTintableIconKind } from './IconPickerLogic';
import { resolvePackFile } from './IconPackNames';
import type { PackListing } from './IconPackNames';
import { symbolSvg } from '../leaflet/ink/symbols';

const PREVIEW_CLASS = 'storyteller-icon-picker-preview';
const DOT_CLASS = 'storyteller-icon-picker-dot';

let packCache: { dir: string; promise: Promise<PackListing[]> } | null = null;

/**
 * Every icon pack folder under `<configDir>/icons` with its SVG file names. Cached
 * until `clearIconPackCache()` is called, so a picker can refresh it when it opens.
 * A missing folder gives an empty list.
 */
export function loadIconPacks(app: App): Promise<PackListing[]> {
    const dir = `${app.vault.configDir}/icons`;
    if (packCache && packCache.dir === dir) return packCache.promise;
    const promise = (async (): Promise<PackListing[]> => {
        try {
            const root = await app.vault.adapter.list(dir);
            const packs = await Promise.all(root.folders.map(async (path): Promise<PackListing> => {
                const listing = await app.vault.adapter.list(path);
                const files = listing.files
                    .map(file => file.split('/').pop() ?? '')
                    .filter(name => /\.svg$/i.test(name));
                return { folder: path.split('/').pop() ?? path, path, files };
            }));
            return packs.filter(pack => pack.files.length > 0);
        } catch {
            return [];
        }
    })();
    packCache = { dir, promise };
    return promise;
}

/** Forget the pack listing, so the next load reads the folder again. */
export function clearIconPackCache(): void {
    packCache = null;
}

/** Vault resource URL for a pack SVG. */
export function packResourcePath(app: App, pack: PackListing, file: string): string {
    return app.vault.adapter.getResourcePath(`${pack.path}/${file}`);
}

/** Tinted pack glyph: the SVG used as a CSS mask so its colour follows the icon colour. */
export function drawPackGlyph(el: HTMLElement, src: string, colour: string | undefined): void {
    if (!colour) {
        const img = ownerDoc(el).createElement('img');
        img.className = `${PREVIEW_CLASS}-img`;
        img.alt = '';
        img.src = src;
        el.appendChild(img);
        return;
    }
    const mask = ownerDoc(el).createElement('span');
    mask.className = `${PREVIEW_CLASS}-mask`;
    const url = `url("${src}")`;
    mask.style.setProperty('-webkit-mask-image', url);
    mask.style.setProperty('mask-image', url);
    mask.style.backgroundColor = colour;
    el.appendChild(mask);
}

/** The document that owns an element, so nodes are made in the right window (popouts too). */
function ownerDoc(el: HTMLElement): Document {
    return el.ownerDocument;
}

function appendDot(el: HTMLElement): void {
    const dot = ownerDoc(el).createElement('span');
    dot.className = DOT_CLASS;
    el.appendChild(dot);
}

function appendImage(el: HTMLElement, src: string): void {
    const img = ownerDoc(el).createElement('img');
    img.className = `${PREVIEW_CLASS}-img`;
    img.alt = '';
    img.onerror = () => {
        img.remove();
        appendDot(el);
    };
    img.src = src;
    el.appendChild(img);
}

/** Lucide glyph through Obsidian's setIcon. Returns false when the icon does not exist. */
function drawLucide(el: HTMLElement, name: string, colour: string | undefined): boolean {
    const holder = ownerDoc(el).createElement('span');
    holder.className = `${PREVIEW_CLASS}-glyph`;
    if (colour) holder.style.color = colour;
    const id = name.replace(/^lucide-/, '');
    if (!getIcon(id) && !getIcon(`lucide-${id}`)) return false;
    setIcon(holder, id);
    if (!holder.querySelector('svg')) return false;
    el.appendChild(holder);
    return true;
}

/** Map Ink symbol, drawn with the same SVG the map uses. */
function drawInk(el: HTMLElement, id: string, colour: string | undefined): boolean {
    const markup = symbolSvg(id, { size: 24, color: colour });
    if (!markup) return false;
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const svg = parsed.documentElement;
    if (!svg || svg.nodeName === 'parsererror' || svg.getElementsByTagName('parsererror').length > 0) return false;
    const holder = ownerDoc(el).createElement('span');
    holder.className = `${PREVIEW_CLASS}-glyph`;
    if (colour) holder.style.color = colour;
    holder.appendChild(ownerDoc(el).importNode(svg, true));
    el.appendChild(holder);
    return true;
}

function drawEmoji(el: HTMLElement, emoji: string): void {
    const span = ownerDoc(el).createElement('span');
    span.className = `${PREVIEW_CLASS}-emoji`;
    span.textContent = emoji;
    el.appendChild(span);
}

/**
 * Draw a value into `el`, replacing what was there. Lucide, ink, emoji, vault, web and
 * data values draw at once. Pack icons draw once the pack listing has loaded; until
 * then, and for anything unknown, the dot shows.
 */
export function renderIconPreview(
    el: HTMLElement,
    value: string | null | undefined,
    color: string | null | undefined,
    app: App
): void {
    el.replaceChildren();
    el.classList.add(PREVIEW_CLASS);
    const parsed = parseIconValue(value);
    if (!parsed) {
        appendDot(el);
        return;
    }
    const colour = isTintableIconKind(parsed.kind) && isValidIconColor(color) ? color.trim() : undefined;
    const drawn = drawParsed(el, parsed, colour, app);
    if (!drawn) appendDot(el);
}

/** Returns false when nothing was drawn synchronously. */
function drawParsed(el: HTMLElement, parsed: ParsedIcon, colour: string | undefined, app: App): boolean {
    switch (parsed.kind) {
        case 'lucide':
            return drawLucide(el, parsed.ref, colour);
        case 'ink':
            return drawInk(el, parsed.ref, colour);
        case 'emoji':
            drawEmoji(el, parsed.ref);
            return true;
        case 'vault': {
            const file = app.metadataCache.getFirstLinkpathDest(parsed.ref, '');
            if (!file) return false;
            appendImage(el, app.vault.getResourcePath(file));
            return true;
        }
        case 'url':
        case 'data':
            appendImage(el, parsed.ref);
            return true;
        case 'pack': {
            const token = `${Date.now()}-${Math.random()}`;
            el.dataset.iconRequest = token;
            void loadIconPacks(app).then(packs => {
                if (el.dataset.iconRequest !== token) return;
                const hit = resolvePackFile(packs, parsed);
                if (!hit) return;
                el.replaceChildren();
                el.classList.add(PREVIEW_CLASS);
                drawPackGlyph(el, packResourcePath(app, hit.pack, hit.file), colour);
            });
            return false;
        }
    }
}

