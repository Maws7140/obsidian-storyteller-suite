import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    IconRasterCache,
    IconRasterHost,
    IconRequest,
    IconBitmap,
    ICON_RETRY_MS,
    drawIconBitmap,
    iconCacheKey,
} from '../../src/utils/IconRasterCache';
import { parseIconValue } from '../../src/utils/EntityIcon';

class FakeContext {
    calls: { name: string; args: unknown[] }[] = [];
    font = '';
    textAlign = '';
    textBaseline = '';
    private rec(name: string, args: unknown[]): void { this.calls.push({ name, args }); }
    save(): void { this.rec('save', []); }
    restore(): void { this.rec('restore', []); }
    beginPath(): void { this.rec('beginPath', []); }
    arc(...args: unknown[]): void { this.rec('arc', args); }
    clip(): void { this.rec('clip', []); }
    clearRect(...args: unknown[]): void { this.rec('clearRect', args); }
    fillText(...args: unknown[]): void { this.rec('fillText', args); }
    drawImage(...args: unknown[]): void { this.rec('drawImage', args); }
    names(): string[] { return this.calls.map(c => c.name); }
    named(name: string): { name: string; args: unknown[] }[] { return this.calls.filter(c => c.name === name); }
}

class FakeCanvas {
    ctx = new FakeContext();
    constructor(public width: number, public height: number) {}
    getContext(_type: string): FakeContext { return this.ctx; }
}

interface FakeImg {
    onload: (() => void) | null;
    onerror: (() => void) | null;
    crossOrigin: string;
    src: string;
    naturalWidth: number;
    naturalHeight: number;
    width: number;
    height: number;
}

function makeHost() {
    const pending: Array<() => void> = [];
    const images: FakeImg[] = [];
    const canvases: FakeCanvas[] = [];
    const lucide = new Map<string, string>();
    const ink = new Map<string, string>();
    const packs = new Map<string, { path: string; text: string }>();
    const urls = new Map<string, string>();
    const dims = new Map<string, [number, number]>();
    const failing = new Set<string>();
    const failingCors = new Set<string>();
    const counters = { lucideCalls: 0, loaded: 0 };

    const host: IconRasterHost & { lucide: Map<string, string>; ink: Map<string, string>; packs: typeof packs; urls: Map<string, string>; dims: typeof dims; failing: Set<string>; failingCors: Set<string>; counters: typeof counters; images: FakeImg[]; canvases: FakeCanvas[] } = {
        lucide, ink, packs, urls, dims, failing, failingCors, counters, images, canvases,
        lucideSvg(id: string) {
            counters.lucideCalls++;
            return lucide.get(id) ?? null;
        },
        inkSymbolBody(id: string) {
            return ink.get(id) ?? null;
        },
        async packSvgPath(pack: string, ref: string) {
            return packs.get(`${pack}/${ref}`)?.path ?? null;
        },
        async readText(path: string) {
            const hit = [...packs.values()].find(p => p.path === path);
            if (!hit) throw new Error('missing');
            return hit.text;
        },
        resourceUrl(pathOrLink: string) {
            return urls.get(pathOrLink) ?? null;
        },
        createImage() {
            const img: FakeImg = {
                onload: null, onerror: null, crossOrigin: '', src: '',
                naturalWidth: 0, naturalHeight: 0, width: 0, height: 0,
            };
            let src = '';
            Object.defineProperty(img, 'src', {
                configurable: true,
                get: () => src,
                set: (value: string) => {
                    src = value;
                    const [w, h] = dims.get(value) ?? [100, 100];
                    img.naturalWidth = w;
                    img.naturalHeight = h;
                    pending.push(() => {
                        const fails = failing.has(value) || (failingCors.has(value) && img.crossOrigin === 'anonymous');
                        if (fails) img.onerror?.();
                        else img.onload?.();
                    });
                },
            });
            images.push(img);
            return img as unknown as HTMLImageElement;
        },
        createCanvas(w: number, h: number) {
            const c = new FakeCanvas(w, h);
            canvases.push(c);
            return c as unknown as HTMLCanvasElement;
        },
        onLoaded() {
            counters.loaded++;
        },
    };

    /** Runs queued image callbacks in one synchronous batch, then lets microtasks run. */
    async function settle(): Promise<void> {
        await new Promise(r => setTimeout(r, 0));
        while (pending.length) pending.splice(0).forEach(fn => fn());
        await new Promise(r => setTimeout(r, 0));
    }

    return { host, settle };
}

function iconReq(value: string, extra: Partial<IconRequest> & { color?: string } = {}): IconRequest {
    const icon = parseIconValue(value);
    if (!icon) throw new Error(`bad test value ${value}`);
    const { color, ...rest } = extra;
    return {
        source: color ? { kind: 'icon', icon, color } : { kind: 'icon', icon },
        size: 18,
        dpr: 1,
        fallbackColor: '#111111',
        ...rest,
    };
}

let now = 1000000;
let blobN = 0;
const blobs = new Map<string, Blob>();
let createUrl: ReturnType<typeof vi.spyOn>;
let revokeUrl: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    now = 1000000;
    blobN = 0;
    blobs.clear();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(((b: Blob) => {
        const u = `blob:fake/${++blobN}`;
        blobs.set(u, b);
        return u;
    }) as any);
    revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

const SWORD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="svg-icon lucide-sword"><path d="M1 1L5 5"/></svg>';

describe('IconRasterCache: Lucide', () => {
    it('tints the svg with the colour, sets the pixel size and rasterises once', async () => {
        const { host, settle } = makeHost();
        host.lucide.set('sword', SWORD_SVG);
        const cache = new IconRasterCache(host);
        const req = iconReq('sword', { color: '#ff0000', size: 18, dpr: 2 });

        expect(cache.get(req)).toBeNull();
        await settle();
        const bmp = cache.get(req);
        expect(bmp).not.toBeNull();
        expect(bmp!.width).toBe(36);
        expect(bmp!.height).toBe(36);
        expect(bmp!.round).toBe(false);
        expect(bmp!.tainted).toBe(false);

        const svgText = await blobs.get('blob:fake/1')!.text();
        expect(svgText).toContain('stroke="#ff0000"');
        expect(svgText).not.toContain('currentColor');
        expect(svgText).toContain('width="36" height="36"');
        expect(svgText).toContain('fill="none"');

        expect(cache.get(req)).toBe(bmp);
        expect(host.counters.lucideCalls).toBe(1);
    });

    it('uses the fallback colour when the icon has no iconColor', async () => {
        const { host, settle } = makeHost();
        host.lucide.set('sword', SWORD_SVG);
        const cache = new IconRasterCache(host);
        cache.get(iconReq('sword', { fallbackColor: '#00ff00' }));
        await settle();
        const svgText = await blobs.get('blob:fake/1')!.text();
        expect(svgText).toContain('stroke="#00ff00"');
    });

    it('returns null for an unknown icon, retries only after 30 s', async () => {
        const { host, settle } = makeHost();
        const cache = new IconRasterCache(host);
        const req = iconReq('nosuchicon');
        expect(cache.get(req)).toBeNull();
        await settle();
        expect(cache.get(req)).toBeNull();
        expect(host.counters.lucideCalls).toBe(1);

        now += ICON_RETRY_MS - 1;
        expect(cache.get(req)).toBeNull();
        expect(host.counters.lucideCalls).toBe(1);

        now += 1;
        expect(cache.get(req)).toBeNull();
        expect(host.counters.lucideCalls).toBe(2);
    });

    it('does not call onLoaded for synchronous misses', async () => {
        const { host, settle } = makeHost();
        const cache = new IconRasterCache(host);
        cache.get(iconReq('nosuchicon'));
        await settle();
        expect(host.counters.loaded).toBe(0);
    });
});

describe('IconRasterCache: ink and packs', () => {
    it('tints a Map Ink symbol body', async () => {
        const { host, settle } = makeHost();
        host.ink.set('tower', '<path d="M1 1" stroke="currentColor"/><rect x="2" y="2" width="3" height="3" fill="currentColor"/>');
        const cache = new IconRasterCache(host);
        cache.get(iconReq('ink:tower', { color: '#123456', size: 24, dpr: 1 }));
        await settle();
        const svgText = await blobs.get('blob:fake/1')!.text();
        expect(svgText).toContain('fill="#123456"');
        expect(svgText).toContain('stroke="#123456"');
        expect(svgText).not.toContain('currentColor');
    });

    it('loads a pack svg, adding a fill when the svg has none', async () => {
        const { host, settle } = makeHost();
        host.packs.set('game-icons/dragon-head', {
            path: '.obsidian/icons/game-icons/dragon-head.svg',
            text: '<svg viewBox="0 0 512 512"><path d="M0 0"/></svg>',
        });
        const cache = new IconRasterCache(host);
        const req = iconReq('pack:game-icons/dragon-head', { color: '#abcdef', size: 18, dpr: 1 });
        expect(cache.get(req)).toBeNull();
        await settle();
        const bmp = cache.get(req);
        expect(bmp?.width).toBe(18);
        const svgText = await blobs.get('blob:fake/1')!.text();
        expect(svgText).toContain('fill="#abcdef"');
        expect(svgText).toContain('width="18" height="18"');
    });

    it('remembers a missing pack icon and does not create an image for it', async () => {
        const { host, settle } = makeHost();
        const cache = new IconRasterCache(host);
        const req = iconReq('GiNothing');
        cache.get(req);
        await settle();
        expect(cache.get(req)).toBeNull();
        expect(cache.has(req)).toBe(false);
        expect(host.images.length).toBe(0);
        expect(host.counters.loaded).toBe(0);
    });
});

describe('IconRasterCache: emoji', () => {
    it('draws emoji synchronously with fillText at about 0.85 of the pixel size', () => {
        const { host } = makeHost();
        const cache = new IconRasterCache(host);
        const req = iconReq('🐉', { size: 18, dpr: 2 });
        const bmp = cache.get(req);
        expect(bmp).not.toBeNull();
        expect(bmp!.round).toBe(false);
        expect(cache.has(req)).toBe(true);
        const ctx = host.canvases[0].ctx;
        expect(ctx.font).toContain('31px');
        expect(ctx.named('fillText')[0].args[0]).toBe('🐉');
        expect(host.counters.loaded).toBe(0);
    });
});

describe('IconRasterCache: images', () => {
    it('cover images are round and cover-cropped into the square', async () => {
        const { host, settle } = makeHost();
        host.urls.set('Art/a.png', 'app://local/a.png');
        host.dims.set('app://local/a.png', [100, 50]);
        const cache = new IconRasterCache(host);
        const req: IconRequest = { source: { kind: 'cover', path: 'Art/a.png' }, size: 20, dpr: 2, fallbackColor: '#000' };
        cache.get(req);
        await settle();
        const bmp = cache.get(req);
        expect(bmp!.round).toBe(true);
        expect(bmp!.width).toBe(40);
        const draw = host.canvases[0].ctx.named('drawImage')[0].args;
        // scale = max(40/100, 40/50) = 0.8, so 80 by 40, centred horizontally
        expect(draw.slice(1)).toEqual([-20, 0, 80, 40]);
    });

    it('a missing vault file returns null without an image', async () => {
        const { host, settle } = makeHost();
        const cache = new IconRasterCache(host);
        const req = iconReq('[[missing.png]]');
        expect(cache.get(req)).toBeNull();
        await settle();
        expect(host.images.length).toBe(0);
    });

    it('url images load with crossOrigin and are not tainted when CORS works', async () => {
        const { host, settle } = makeHost();
        const cache = new IconRasterCache(host);
        const req = iconReq('https://cdn.test/ok.png');
        cache.get(req);
        await settle();
        const bmp = cache.get(req);
        expect(bmp).not.toBeNull();
        expect(bmp!.round).toBe(true);
        expect(bmp!.tainted).toBe(false);
        expect(cache.tainted).toBe(false);
        expect(host.images[0].crossOrigin).toBe('anonymous');
    });

    it('url images that refuse CORS are retried without it and marked tainted', async () => {
        const { host, settle } = makeHost();
        host.failingCors.add('https://cdn.test/a.png');
        const cache = new IconRasterCache(host);
        const req = iconReq('https://cdn.test/a.png');
        cache.get(req);
        await settle();
        const bmp = cache.get(req);
        expect(bmp).not.toBeNull();
        expect(bmp!.tainted).toBe(true);
        expect(cache.tainted).toBe(true);
        const attempts = host.images.filter(img => img.src === 'https://cdn.test/a.png');
        expect(attempts.map(img => img.crossOrigin)).toEqual(['anonymous', '']);
    });

    it('a url that fails both attempts is remembered for 30 s', async () => {
        const { host, settle } = makeHost();
        host.failing.add('https://cdn.test/dead.png');
        const cache = new IconRasterCache(host);
        const req = iconReq('https://cdn.test/dead.png');
        cache.get(req);
        await settle();
        expect(cache.get(req)).toBeNull();
        const count = () => host.images.filter(img => img.src === 'https://cdn.test/dead.png').length;
        expect(count()).toBe(2);
        now += 1000;
        cache.get(req);
        expect(count()).toBe(2);
        now += ICON_RETRY_MS;
        cache.get(req);
        expect(count()).toBe(3);
    });

    it('data URIs load directly and are round', async () => {
        const { host, settle } = makeHost();
        const cache = new IconRasterCache(host);
        const req = iconReq('data:image/png;base64,AAAA');
        cache.get(req);
        await settle();
        expect(cache.get(req)!.round).toBe(true);
        expect(host.images[0].crossOrigin).toBe('');
    });
});

describe('IconRasterCache: LRU, revoke and redraw', () => {
    it('evicts the least recently used entry and revokes its Blob URL', async () => {
        const { host, settle } = makeHost();
        host.lucide.set('a', SWORD_SVG);
        host.lucide.set('b', SWORD_SVG);
        host.lucide.set('c', SWORD_SVG);
        const cache = new IconRasterCache(host, { max: 2 });
        const a = iconReq('a');
        const b = iconReq('b');
        const c = iconReq('c');
        cache.get(a);
        cache.get(b);
        await settle();
        cache.get(a); // a is now the most recent
        cache.get(c); // evicts b
        expect(revokeUrl).toHaveBeenCalledWith('blob:fake/2');
        expect(revokeUrl).toHaveBeenCalledTimes(1);
        await settle();
        expect(cache.has(b)).toBe(false);
        expect(cache.has(a)).toBe(true);
        expect(cache.has(c)).toBe(true);
    });

    it('clear() revokes every Blob URL', async () => {
        const { host, settle } = makeHost();
        host.lucide.set('a', SWORD_SVG);
        host.lucide.set('b', SWORD_SVG);
        const cache = new IconRasterCache(host);
        cache.get(iconReq('a'));
        cache.get(iconReq('b'));
        await settle();
        cache.clear();
        expect(revokeUrl).toHaveBeenCalledWith('blob:fake/1');
        expect(revokeUrl).toHaveBeenCalledWith('blob:fake/2');
        expect(cache.has(iconReq('a'))).toBe(false);
    });

    it('coalesces onLoaded: many finished loads cause one redraw, later loads cause another', async () => {
        const { host, settle } = makeHost();
        for (const name of ['a', 'b', 'c', 'd', 'e']) host.lucide.set(name, SWORD_SVG);
        const cache = new IconRasterCache(host);
        for (const name of ['a', 'b', 'c', 'd', 'e']) cache.get(iconReq(name));
        await settle();
        expect(host.counters.loaded).toBe(1);
        cache.get(iconReq('a', { color: '#ffffff' }));
        await settle();
        expect(host.counters.loaded).toBe(2);
    });

    it('keys differ by colour, size and dpr', async () => {
        const { host, settle } = makeHost();
        host.lucide.set('sword', SWORD_SVG);
        const cache = new IconRasterCache(host);
        const variants = [
            iconReq('sword', { color: '#ff0000', size: 18, dpr: 1 }),
            iconReq('sword', { color: '#00ff00', size: 18, dpr: 1 }),
            iconReq('sword', { color: '#ff0000', size: 24, dpr: 1 }),
            iconReq('sword', { color: '#ff0000', size: 18, dpr: 2 }),
        ];
        const keys = new Set(variants.map(v => iconCacheKey(v)));
        expect(keys.size).toBe(4);
        for (const v of variants) cache.get(v);
        await settle();
        expect(host.counters.lucideCalls).toBe(4);
        expect(variants.map(v => cache.get(v)!.width)).toEqual([18, 18, 24, 36]);
    });
});

describe('drawIconBitmap', () => {
    const bmp = (round: boolean): IconBitmap => ({ image: {} as CanvasImageSource, width: 36, height: 36, round, tainted: false });

    it('clips to a circle for round bitmaps', () => {
        const ctx = new FakeContext();
        drawIconBitmap(ctx as unknown as CanvasRenderingContext2D, bmp(true), 100, 50, 18);
        expect(ctx.names()).toEqual(['save', 'beginPath', 'arc', 'clip', 'drawImage', 'restore']);
        expect(ctx.named('arc')[0].args.slice(0, 3)).toEqual([100, 50, 9]);
        expect(ctx.named('drawImage')[0].args.slice(1)).toEqual([91, 41, 18, 18]);
    });

    it('does not clip square bitmaps', () => {
        const ctx = new FakeContext();
        drawIconBitmap(ctx as unknown as CanvasRenderingContext2D, bmp(false), 100, 50, 18);
        expect(ctx.names()).toEqual(['save', 'drawImage', 'restore']);
    });
});
