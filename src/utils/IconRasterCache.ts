/**
 * Turns a timeline icon into a drawable bitmap, cached by kind, reference, colour and size.
 *
 * Icons load asynchronously. `get()` never waits: it returns the bitmap when it is ready,
 * otherwise it starts the load and returns null, and the caller draws the plain dot. When a
 * load finishes, the host's onLoaded() runs once (coalesced with a microtask) so the
 * renderer can redraw.
 *
 * Vault-independent: all Obsidian access goes through IconRasterHost (see ObsidianIconRasterHost).
 */
import type { EntityIconSource, ParsedIcon } from './EntityIcon';

export interface IconRasterHost {
    /** Obsidian getIcon(id)?.outerHTML; null when unknown. */
    lucideSvg(id: string): string | null;
    /** Inner SVG markup of a Map Ink symbol (24 by 24 grid, currentColor). */
    inkSymbolBody(id: string): string | null;
    /** Vault-relative path of an icon pack SVG, or null when the pack or icon is missing. */
    packSvgPath(pack: string, ref: string): Promise<string | null>;
    /** Vault adapter read. */
    readText(path: string): Promise<string>;
    /** Vault resource URL for a path or wikilink target; null when the file is missing. */
    resourceUrl(pathOrLink: string): string | null;
    /** Injectable for tests. */
    createImage(): HTMLImageElement;
    /** Injectable for tests. */
    createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas;
    /** The renderer calls scheduleDraw from here. */
    onLoaded(): void;
}

export interface IconRequest {
    source: EntityIconSource;
    /** Logical size in CSS pixels. */
    size: number;
    dpr: number;
    /** Colour used when the icon has no iconColor (usually the theme text colour). */
    fallbackColor: string;
}

export type IconBitmap = {
    image: CanvasImageSource;
    /** Device pixels. Bitmaps are always square. */
    width: number;
    height: number;
    /** True for photos and cover images: clip to a circle when drawing. */
    round: boolean;
    /** True when a cross-origin image without CORS was drawn into this bitmap. */
    tainted: boolean;
};

export const ICON_RETRY_MS = 30000;
export const DEFAULT_ICON_CACHE_MAX = 300;
const MAX_PIXELS = 1024;
const FALLBACK_COLOUR = '#808080';
const COLOUR_SAFE = /^[#a-zA-Z0-9(),.%\s/-]+$/;
const EMOJI_FONT_STACK = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
const TINTED_KINDS: ReadonlySet<string> = new Set(['lucide', 'ink', 'pack']);
const ROOT_SVG = /<svg\b[^>]*>/i;

function sanitiseColour(value: string | undefined): string {
    const v = typeof value === 'string' ? value.trim() : '';
    return v && COLOUR_SAFE.test(v) ? v : FALLBACK_COLOUR;
}

function pixelSize(req: IconRequest): number {
    const dpr = req.dpr > 0 && Number.isFinite(req.dpr) ? req.dpr : 1;
    const px = Math.round(req.size * dpr);
    if (!Number.isFinite(px) || px < 1) return 1;
    return Math.min(MAX_PIXELS, px);
}

/**
 * Cache key: kind, reference, pack, colour, size and dpr. Colour only matters for tinted
 * kinds (Lucide, ink, pack), so it is left out for the others. Returns null without a source.
 */
export function iconCacheKey(req: IconRequest): string | null {
    const s = req.source;
    if (!s) return null;
    if (s.kind === 'cover') return ['cover', s.path, '', '', req.size, req.dpr].join('\u0001');
    const icon: ParsedIcon = s.icon;
    const colour = TINTED_KINDS.has(icon.kind) ? sanitiseColour(s.color ?? req.fallbackColor) : '';
    return [icon.kind, icon.ref, icon.pack ?? '', colour, req.size, req.dpr].join('\u0001');
}

/**
 * Recolour an SVG document and set its pixel size.
 * Replaces currentColor everywhere, and every fill or stroke value other than none or a url().
 * With addFill, a root svg that has no fill attribute gets fill set to the colour (for pack
 * icons that rely on the default black fill). Returns null when there is no <svg> root.
 */
export function tintSvg(svg: string, colour: string, px: number, addFill: boolean): string | null {
    const match = svg.match(ROOT_SVG);
    if (!match || match.index === undefined) return null;
    let root = match[0]
        .replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
        .replace(/^<svg/i, `<svg width="${px}" height="${px}"`);
    if (addFill && !/\sfill\s*=/i.test(root)) root = root.replace(/^<svg/i, `<svg fill="${colour}"`);
    const body = svg.slice(0, match.index) + root + svg.slice(match.index + match[0].length);
    return body
        .replace(/currentcolor/gi, colour)
        .replace(/(\s(?:fill|stroke)\s*=\s*)"(?!none")(?!url\()[^"]*"/gi, `$1"${colour}"`);
}

function inkSvg(body: string): string {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
        + ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
}

function context2d(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | null {
    return (canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D | null;
}

/** Cover-crop a photo into the square canvas (object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, px: number): void {
    const iw = img.naturalWidth || img.width || 0;
    const ih = img.naturalHeight || img.height || 0;
    if (!iw || !ih) {
        ctx.drawImage(img, 0, 0, px, px);
        return;
    }
    const scale = Math.max(px / iw, px / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (px - dw) / 2, (px - dh) / 2, dw, dh);
}

type Status = 'loading' | 'ready' | 'failed';

interface Entry {
    status: Status;
    bitmap?: IconBitmap;
    blobUrl?: string;
    failedAt?: number;
}

export class IconRasterCache {
    readonly max: number;
    private readonly entries = new Map<string, Entry>();
    private taintedFlag = false;
    private notifyQueued = false;
    private starting = false;

    constructor(private readonly host: IconRasterHost, opts: { max?: number } = {}) {
        this.max = Math.max(1, Math.floor(opts.max ?? DEFAULT_ICON_CACHE_MAX));
    }

    /** True once any cross-origin image without CORS has been drawn. Sticky: export is unsafe for good. */
    get tainted(): boolean {
        return this.taintedFlag;
    }

    /** The bitmap when ready; otherwise starts the load (if needed) and returns null. */
    get(req: IconRequest): IconBitmap | null {
        const key = iconCacheKey(req);
        if (key === null) return null;
        const existing = this.entries.get(key);
        if (existing) {
            if (existing.status === 'ready' && existing.bitmap) {
                this.touch(key, existing);
                return existing.bitmap;
            }
            if (existing.status === 'loading') return null;
            if (Date.now() - (existing.failedAt ?? 0) < ICON_RETRY_MS) {
                this.touch(key, existing);
                return null;
            }
            this.release(key, existing);
        }
        const entry: Entry = { status: 'loading' };
        this.entries.set(key, entry);
        this.evict();
        this.starting = true;
        try {
            this.start(key, entry, req);
        } catch {
            this.fail(key, entry);
        } finally {
            this.starting = false;
        }
        return entry.status === 'ready' && entry.bitmap ? entry.bitmap : null;
    }

    /** True when the bitmap for this request is ready. Does not start a load. */
    has(req: IconRequest): boolean {
        const key = iconCacheKey(req);
        if (key === null) return false;
        return this.entries.get(key)?.status === 'ready';
    }

    /** Drop every entry and revoke its Blob URL. The tainted flag stays set. */
    clear(): void {
        const all: [string, Entry][] = [];
        this.entries.forEach((entry, key) => all.push([key, entry]));
        for (const [key, entry] of all) this.release(key, entry);
    }

    private start(key: string, entry: Entry, req: IconRequest): void {
        const source = req.source;
        if (!source) {
            this.fail(key, entry);
            return;
        }
        const px = pixelSize(req);
        if (source.kind === 'cover') {
            this.loadImage(key, entry, this.host.resourceUrl(source.path), px, false);
            return;
        }
        const icon = source.icon;
        const colour = sanitiseColour(source.color ?? req.fallbackColor);
        switch (icon.kind) {
            case 'lucide': {
                const svg = this.host.lucideSvg(icon.ref);
                const tinted = svg ? tintSvg(svg, colour, px, false) : null;
                if (tinted) this.loadSvgText(key, entry, tinted, px);
                else this.fail(key, entry);
                return;
            }
            case 'ink': {
                const body = this.host.inkSymbolBody(icon.ref);
                const tinted = body ? tintSvg(inkSvg(body), colour, px, false) : null;
                if (tinted) this.loadSvgText(key, entry, tinted, px);
                else this.fail(key, entry);
                return;
            }
            case 'pack':
                this.loadPack(key, entry, icon, colour, px);
                return;
            case 'emoji':
                this.drawEmoji(key, entry, icon.ref, px);
                return;
            case 'vault':
                this.loadImage(key, entry, this.host.resourceUrl(icon.ref), px, false);
                return;
            case 'url':
                this.loadImage(key, entry, icon.ref, px, true);
                return;
            case 'data':
                this.loadImage(key, entry, icon.ref, px, false);
                return;
            default:
                this.fail(key, entry);
        }
    }

    private loadPack(key: string, entry: Entry, icon: ParsedIcon, colour: string, px: number): void {
        const pack = icon.pack ?? '';
        Promise.resolve()
            .then(() => this.host.packSvgPath(pack, icon.ref))
            .then(path => {
                if (!path) {
                    this.fail(key, entry);
                    return null;
                }
                return this.host.readText(path).then(text => {
                    if (this.entries.get(key) !== entry) return;
                    const tinted = tintSvg(text, colour, px, true);
                    if (tinted) this.loadSvgText(key, entry, tinted, px);
                    else this.fail(key, entry);
                });
            })
            .catch(() => this.fail(key, entry));
    }

    private drawEmoji(key: string, entry: Entry, emoji: string, px: number): void {
        const canvas = this.host.createCanvas(px, px);
        const ctx = context2d(canvas);
        if (!ctx) {
            this.fail(key, entry);
            return;
        }
        ctx.font = `${Math.round(px * 0.85)}px ${EMOJI_FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, px / 2, px / 2);
        this.complete(key, entry, { image: canvas, width: px, height: px, round: false, tainted: false });
    }

    private loadSvgText(key: string, entry: Entry, svgText: string, px: number): void {
        const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
        entry.blobUrl = url;
        const img = this.host.createImage();
        img.onload = () => {
            if (this.entries.get(key) !== entry) return;
            const canvas = this.host.createCanvas(px, px);
            const ctx = context2d(canvas);
            if (!ctx) {
                this.fail(key, entry);
                return;
            }
            ctx.drawImage(img, 0, 0, px, px);
            this.complete(key, entry, { image: canvas, width: px, height: px, round: false, tainted: false });
        };
        img.onerror = () => this.fail(key, entry);
        img.src = url;
    }

    /**
     * Load a raster image and cover-crop it into a square. Remote URLs are tried with
     * crossOrigin="anonymous" first; if that fails, retried without it and marked tainted.
     */
    private loadImage(key: string, entry: Entry, src: string | null, px: number, remote: boolean): void {
        if (!src) {
            this.fail(key, entry);
            return;
        }
        const attempt = (cors: boolean): void => {
            const img = this.host.createImage();
            if (cors) img.crossOrigin = 'anonymous';
            img.onload = () => {
                if (this.entries.get(key) !== entry) return;
                const canvas = this.host.createCanvas(px, px);
                const ctx = context2d(canvas);
                if (!ctx) {
                    this.fail(key, entry);
                    return;
                }
                drawCover(ctx, img, px);
                this.complete(key, entry, {
                    image: canvas,
                    width: px,
                    height: px,
                    round: true,
                    tainted: remote && !cors,
                });
            };
            img.onerror = () => {
                if (this.entries.get(key) !== entry) return;
                if (remote && cors) attempt(false);
                else this.fail(key, entry);
            };
            img.src = src;
        };
        attempt(remote);
    }

    private complete(key: string, entry: Entry, bitmap: IconBitmap): void {
        if (this.entries.get(key) !== entry) return;
        entry.status = 'ready';
        entry.bitmap = bitmap;
        if (bitmap.tainted) this.taintedFlag = true;
        // Synchronous completions (emoji, from inside get) need no redraw.
        if (!this.starting) this.notify();
    }

    private fail(key: string, entry: Entry): void {
        if (this.entries.get(key) !== entry) {
            // Evicted or cleared while loading: nothing else holds this Blob URL.
            if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
            entry.blobUrl = undefined;
            return;
        }
        if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
        entry.blobUrl = undefined;
        // No redraw on failure: the plain dot is already on screen.
        entry.status = 'failed';
        entry.failedAt = Date.now();
    }

        private notify(): void {
        if (this.notifyQueued) return;
        this.notifyQueued = true;
        Promise.resolve().then(() => {
            this.notifyQueued = false;
            try {
                this.host.onLoaded();
            } catch {
                // A failing redraw must not break the cache.
            }
        });
    }

    private touch(key: string, entry: Entry): void {
        this.entries.delete(key);
        this.entries.set(key, entry);
    }

    private release(key: string, entry: Entry): void {
        this.entries.delete(key);
        if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
        entry.blobUrl = undefined;
    }

    private evict(): void {
        while (this.entries.size > this.max) {
            const oldest = this.entries.keys().next();
            if (oldest.done) break;
            const entry = this.entries.get(oldest.value);
            if (entry) this.release(oldest.value, entry);
            else this.entries.delete(oldest.value);
        }
    }
}

/** Draw a bitmap centred on x, y at size CSS pixels. Round bitmaps are clipped to a circle. */
export function drawIconBitmap(
    ctx: CanvasRenderingContext2D,
    bmp: IconBitmap,
    x: number,
    y: number,
    size: number
): void {
    const height = bmp.width > 0 ? (size * bmp.height) / bmp.width : size;
    ctx.save();
    if (bmp.round) {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.clip();
    }
    ctx.drawImage(bmp.image, x - size / 2, y - height / 2, size, height);
    ctx.restore();
}
