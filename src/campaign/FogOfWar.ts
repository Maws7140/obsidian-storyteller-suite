/**
 * Fog of war for the player board, in the three states tabletop and strategy games use:
 *
 * - Unexplored: the map is hidden under a dark, blurred, desaturated copy of itself, so the
 *   players sense land and sea but cannot read it, with dark mist drifting over it.
 * - Explored: places the party has seen. The map shows through, greyed and dimmed, under a thin
 *   lingering mist.
 * - Here: around the party's current place the map is fully clear.
 *
 * Edges between the states are soft and broken up by the mist's own noise, so they look like
 * fog thinning out rather than cut-out shapes. The map's pixels are never read back (only drawn
 * through canvas filters), so an image from any source works.
 */

export interface FogPlace {
    key: string;
    /** Percent from the left and from the top of the board. */
    x: number;
    y: number;
    /** The party is here: fully clear rather than explored. */
    current: boolean;
}

/** Radius of the clear area around the party, in percent of the board width. */
const HERE_RADIUS = 11;
/** Radius of the explored area around each seen place, in percent of the board width. */
const SEEN_RADIUS = 9;
/** Width of the soft edge, as a share of the radius. */
const EDGE_SOFTNESS = 0.6;
/** How far the mist's density pushes an edge in or out, as a share of the radius. */
const EDGE_NOISE = 0.55;
/** Canvas pixels per screen pixel. Fog is soft, so a lower resolution looks the same and costs far less. */
const RESOLUTION = 0.42;
/** Unexplored ground: how the map is treated before the mist goes over it. */
const UNEXPLORED_FILTER = 'blur(5px) grayscale(0.8) brightness(0.5) contrast(0.85)';
/** Explored ground: the map greyed and dimmed. */
const EXPLORED_FILTER = 'grayscale(0.7) brightness(0.62)';
/** Tint laid over unexplored ground: a cold night blue. */
const UNEXPLORED_TINT = 'rgba(14, 20, 34, 0.38)';
const MIST_SIZE = 256;
const FRAME_MS = 80;
/** The fog's edges are recomputed every this many frames; the mist itself moves every frame. */
const MASK_EVERY_FRAMES = 4;

/** Small seeded random number generator (mulberry32). */
function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Tileable value noise: lattice values wrap every `period` cells. */
function makeValueNoise(seed: number, period: number): (x: number, y: number) => number {
    const random = seededRandom(seed);
    const lattice = new Float32Array(period * period);
    for (let i = 0; i < lattice.length; i++) lattice[i] = random();
    const at = (ix: number, iy: number) => lattice[(((iy % period) + period) % period) * period + (((ix % period) + period) % period)];
    const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    return (x: number, y: number) => {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = smooth(x - ix);
        const fy = smooth(y - iy);
        const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
        const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
        return top + (bottom - top) * fy;
    };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
    const t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
};

/** A tileable fractal noise field in 0..1, wispy rather than puffy. */
export function makeMistField(size = MIST_SIZE, seed = 11): Float32Array {
    const octaves = 5;
    const baseCells = 4;
    const noise = Array.from({ length: octaves }, (_, o) => makeValueNoise(seed * 7919 + o * 104729, baseCells << o));
    const field = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let sum = 0;
            let amplitude = 1;
            let norm = 0;
            for (let o = 0; o < octaves; o++) {
                const cells = baseCells << o;
                sum += noise[o]((x / size) * cells, (y / size) * cells) * amplitude;
                norm += amplitude;
                amplitude *= 0.5;
            }
            field[y * size + x] = smoothstep(0.25, 0.75, sum / norm);
        }
    }
    return field;
}

/** Paints a mist field as a tileable canvas of one colour with the field as its opacity. */
function mistCanvas(doc: Document, field: Float32Array, size: number, rgb: [number, number, number], maxAlpha: number): HTMLCanvasElement {
    const canvas = doc.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < field.length; i++) {
        image.data[i * 4] = rgb[0];
        image.data[i * 4 + 1] = rgb[1];
        image.data[i * 4 + 2] = rgb[2];
        image.data[i * 4 + 3] = field[i] * maxAlpha * 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

/** Draws a tileable canvas across the target at an offset and scale. */
function tile(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, width: number, height: number, offsetX: number, offsetY: number, scale: number): void {
    const w = source.width * scale;
    const h = source.height * scale;
    const startX = ((offsetX % w) + w) % w - w;
    const startY = ((offsetY % h) + h) % h - h;
    for (let x = startX; x < width; x += w) {
        for (let y = startY; y < height; y += h) {
            ctx.drawImage(source, x, y, w + 1, h + 1);
        }
    }
}

/** Draws and animates the fog on a canvas laid over the board image. */
export class FogOfWarLayer {
    private places: FogPlace[] = [];
    private mistField: Float32Array | null = null;
    private darkMist: HTMLCanvasElement | null = null;
    private paleMist: HTMLCanvasElement | null = null;
    /** The map as unexplored and as explored ground, at canvas size. */
    private unexploredBase: HTMLCanvasElement | null = null;
    private exploredBase: HTMLCanvasElement | null = null;
    private baseKey = '';
    /** Per canvas pixel: distance to the party and to the nearest seen place, in their radii. */
    private hereDistance: Float32Array | null = null;
    private seenDistance: Float32Array | null = null;
    private distanceKey = '';
    private layer: HTMLCanvasElement | null = null;
    /** The two state masks, kept between frames: the edges move slowly, so they are redrawn every few frames. */
    private unexploredMask: HTMLCanvasElement | null = null;
    private exploredMask: HTMLCanvasElement | null = null;
    private framesSinceMasks = Infinity;
    private frame: number | null = null;
    private lastDraw = 0;
    private time = 0;
    private resizeObserver: ResizeObserver | null = null;
    private readonly reduceMotion: boolean;

    constructor(private readonly canvas: HTMLCanvasElement, private readonly image: HTMLImageElement) {
        const win = canvas.ownerDocument.defaultView;
        this.reduceMotion = Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.draw());
            this.resizeObserver.observe(canvas);
        }
        if (!image.complete) image.addEventListener('load', () => { this.baseKey = ''; this.draw(); }, { once: true });
    }

    setPlaces(places: FogPlace[]): void {
        this.places = places;
        this.distanceKey = '';
        this.draw();
    }

    start(): void {
        this.draw();
        if (this.reduceMotion || this.frame !== null) return;
        const win = this.canvas.ownerDocument.defaultView;
        if (!win) return;
        const tick = (now: number) => {
            this.frame = win.requestAnimationFrame(tick);
            // Nothing to animate while the window is hidden or minimised.
            if (this.canvas.ownerDocument.hidden || now - this.lastDraw < FRAME_MS) return;
            const elapsed = this.lastDraw ? Math.min(now - this.lastDraw, 500) : FRAME_MS;
            this.lastDraw = now;
            this.time += elapsed / 1000;
            this.draw();
        };
        this.frame = win.requestAnimationFrame(tick);
    }

    stop(): void {
        if (this.frame !== null) this.canvas.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
        this.frame = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
    }

    private offscreen(width: number, height: number): HTMLCanvasElement {
        const c = this.canvas.ownerDocument.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
    }

    private prepare(): { width: number; height: number } | null {
        const width = Math.round(this.canvas.clientWidth * RESOLUTION);
        const height = Math.round(this.canvas.clientHeight * RESOLUTION);
        if (width < 2 || height < 2) return null;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.baseKey = '';
            this.distanceKey = '';
        }
        const doc = this.canvas.ownerDocument;
        if (!this.mistField) {
            this.mistField = makeMistField();
            this.darkMist = mistCanvas(doc, this.mistField, MIST_SIZE, [10, 13, 22], 0.5);
            this.paleMist = mistCanvas(doc, this.mistField, MIST_SIZE, [196, 204, 216], 0.32);
        }
        const key = `${width}x${height}`;
        if (this.baseKey !== key && this.image.complete && this.image.naturalWidth > 0) {
            // The map drawn through filters only, never read back, so its source does not matter.
            this.unexploredBase = this.offscreen(width, height);
            const u = this.unexploredBase.getContext('2d');
            if (u) {
                u.filter = UNEXPLORED_FILTER;
                u.drawImage(this.image, 0, 0, width, height);
                u.filter = 'none';
                u.fillStyle = UNEXPLORED_TINT;
                u.fillRect(0, 0, width, height);
            }
            this.exploredBase = this.offscreen(width, height);
            const e = this.exploredBase.getContext('2d');
            if (e) {
                e.filter = EXPLORED_FILTER;
                e.drawImage(this.image, 0, 0, width, height);
                e.filter = 'none';
            }
            this.layer = this.offscreen(width, height);
            this.unexploredMask = this.offscreen(width, height);
            this.exploredMask = this.offscreen(width, height);
            this.framesSinceMasks = Infinity;
            this.baseKey = key;
        }
        if (this.distanceKey !== key) {
            const hereRadius = Math.max(1, (HERE_RADIUS / 100) * width);
            const seenRadius = Math.max(1, (SEEN_RADIUS / 100) * width);
            const here = this.places.filter(p => p.current).map(p => [(p.x / 100) * width, (p.y / 100) * height]);
            const seen = this.places.map(p => [(p.x / 100) * width, (p.y / 100) * height]);
            const nearest = (points: number[][], x: number, y: number) => {
                let best = Infinity;
                for (const [px, py] of points) {
                    const d = (x - px) * (x - px) + (y - py) * (y - py);
                    if (d < best) best = d;
                }
                return Math.sqrt(best);
            };
            this.hereDistance = new Float32Array(width * height);
            this.seenDistance = new Float32Array(width * height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = y * width + x;
                    this.hereDistance[i] = here.length ? nearest(here, x, y) / hereRadius : Infinity;
                    this.seenDistance[i] = seen.length ? nearest(seen, x, y) / seenRadius : Infinity;
                }
            }
            this.distanceKey = key;
            this.framesSinceMasks = Infinity;
        }
        return { width, height };
    }

    /** Fills a mask canvas with one state's coverage: opaque where that state's fog is, clear elsewhere. */
    private paintMask(mask: HTMLCanvasElement | null, width: number, height: number, coverage: (i: number, mist: number) => number): void {
        const ctx = mask?.getContext('2d');
        const field = this.mistField;
        if (!mask || !ctx || !field) return;
        const image = ctx.createImageData(width, height);
        const data = image.data;
        // The edge noise drifts with the mist, so the boundary breathes.
        const shift = this.time * 6;
        for (let y = 0; y < height; y++) {
            const fy = ((Math.floor(y * 0.6 + shift * 0.3) % MIST_SIZE) + MIST_SIZE) % MIST_SIZE;
            for (let x = 0; x < width; x++) {
                const fx = ((Math.floor(x * 0.6 + shift) % MIST_SIZE) + MIST_SIZE) % MIST_SIZE;
                const i = y * width + x;
                data[i * 4 + 3] = coverage(i, field[fy * MIST_SIZE + fx]) * 255;
            }
        }
        ctx.putImageData(image, 0, 0);
    }

    /** Draws one fog state: its ground and mist, cut to its mask, onto the output. */
    private paintState(out: CanvasRenderingContext2D, mask: HTMLCanvasElement | null, width: number, height: number, ground: HTMLCanvasElement, mists: Array<[HTMLCanvasElement, number, number, number]>): void {
        const layer = this.layer;
        const ctx = layer?.getContext('2d');
        if (!layer || !ctx || !mask) return;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(ground, 0, 0);
        for (const [mist, dx, dy, scale] of mists) tile(ctx, mist, width, height, dx, dy, scale);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        out.drawImage(layer, 0, 0);
    }

    draw(): void {
        const size = this.prepare();
        const out = this.canvas.getContext('2d');
        if (!size || !out || !this.hereDistance || !this.seenDistance) return;
        const { width, height } = size;
        out.clearRect(0, 0, width, height);
        if (!this.unexploredBase || !this.exploredBase || !this.darkMist || !this.paleMist) {
            // The map image has not loaded yet: keep everything hidden.
            out.fillStyle = 'rgb(10, 13, 20)';
            out.fillRect(0, 0, width, height);
            return;
        }
        const here = this.hereDistance;
        const seen = this.seenDistance;
        const t = this.time;

        if (this.framesSinceMasks >= MASK_EVERY_FRAMES) {
            this.framesSinceMasks = 0;
            // Unexplored: everything beyond the seen places, the edge pushed about by the mist.
            this.paintMask(this.unexploredMask, width, height, (i, mist) => {
                const reach = seen[i] + (mist - 0.5) * EDGE_NOISE;
                return smoothstep(1 - EDGE_SOFTNESS * 0.5, 1 + EDGE_SOFTNESS * 0.5, reach);
            });
            // Explored: seen ground outside the party's clearing.
            this.paintMask(this.exploredMask, width, height, (i, mist) => {
                const outside = smoothstep(1 - EDGE_SOFTNESS * 0.5, 1 + EDGE_SOFTNESS * 0.5, seen[i] + (mist - 0.5) * EDGE_NOISE);
                const awayFromParty = smoothstep(1 - EDGE_SOFTNESS * 0.6, 1 + EDGE_SOFTNESS * 0.4, here[i] + (mist - 0.5) * EDGE_NOISE);
                return (1 - outside) * awayFromParty;
            });
        }
        this.framesSinceMasks++;

        // Unexplored ground under dark drifting mist; explored ground under a thin pale mist.
        this.paintState(out, this.unexploredMask, width, height, this.unexploredBase, [
            [this.darkMist, t * 9, t * 2, 2.2],
            [this.darkMist, -t * 5, t * 4, 3.4],
        ]);
        this.paintState(out, this.exploredMask, width, height, this.exploredBase, [
            [this.paleMist, t * 7, -t * 2, 2.6],
        ]);
    }
}
