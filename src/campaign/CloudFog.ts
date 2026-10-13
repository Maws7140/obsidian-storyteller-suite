/**
 * Cloud cover for the player board: a drifting layer of clouds over the map, with clearings
 * at the places the party has seen.
 *
 * The clouds are a tileable fractal noise field, built once per size: a density for each point
 * and a shade lit from the top left, so the puffs read as solid. Every frame samples that field at
 * a drifting offset. Near a seen place the cloud thins out, and how far it thins at each point
 * depends on the cloud's own density there, so a clearing's edge follows the cloud shapes and
 * breaks up into wisps instead of being a smooth circle.
 */

export interface FogClearing {
    key: string;
    /** Percent from the left and from the top of the board. */
    x: number;
    y: number;
}

export interface CloudPalette {
    /** Sunlit tops of the clouds. */
    light: [number, number, number];
    /** Body of the clouds. */
    mid: [number, number, number];
    /** Shadowed undersides and folds. */
    shadow: [number, number, number];
}

const DEFAULT_PALETTE: CloudPalette = {
    light: [252, 252, 254],
    mid: [218, 223, 231],
    shadow: [150, 160, 178],
};

/** Clearing radius, in percent of the board width. */
const CLEARING_RADIUS = 8;
/** How far the cloud density pushes a clearing's edge in or out, as a share of the radius. */
const EDGE_RAGGEDNESS = 1.5;
/** Width of the thinning band at a clearing's edge, as a share of the radius. */
const EDGE_SOFTNESS = 0.38;
/** How dark the clouds' shadow on the map gets at a clearing's edge. */
const SHADOW_STRENGTH = 0.3;
const SHADOW_COLOR: [number, number, number] = [24, 30, 44];
/** Canvas pixels per screen pixel. Clouds are soft, so a lower resolution looks the same and costs far less. */
const RESOLUTION = 0.6;
/** Size of the tileable cloud field, in field cells. */
const FIELD_SIZE = 256;
/** Field cells per canvas pixel: below 1 the clouds are drawn larger than the field. */
const FIELD_SCALE = 0.38;
/** Drift speed, in field widths per second. */
const DRIFT_PER_SECOND = 0.006;
const FRAME_MS = 100;

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

/** Tileable value noise: lattice values wrap every `period` cells, so the field repeats seamlessly. */
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

/** Wrapping box blur, two passes, used to light the clouds by their broad shapes. */
function boxBlur(src: Float32Array, size: number, radius: number): Float32Array {
    const pass = (input: Float32Array, horizontal: boolean) => {
        const out = new Float32Array(size * size);
        const span = radius * 2 + 1;
        for (let a = 0; a < size; a++) {
            let sum = 0;
            for (let k = -radius; k <= radius; k++) {
                const b = (k + size) % size;
                sum += horizontal ? input[a * size + b] : input[b * size + a];
            }
            for (let b = 0; b < size; b++) {
                const index = horizontal ? a * size + b : b * size + a;
                out[index] = sum / span;
                const leave = (b - radius + size) % size;
                const enter = (b + radius + 1) % size;
                sum += (horizontal ? input[a * size + enter] : input[enter * size + a]) - (horizontal ? input[a * size + leave] : input[leave * size + a]);
            }
        }
        return out;
    };
    return pass(pass(src, true), false);
}

export interface CloudField {
    size: number;
    /** 0 = thin gap between clouds, 1 = the thick middle of a puff. */
    density: Float32Array;
    /** 0 = in shadow, 1 = facing the light. */
    light: Float32Array;
}

/** Builds the tileable cloud field: puffy density and its lighting. */
export function makeCloudField(size = FIELD_SIZE, seed = 7): CloudField {
    const octaves = 6;
    const baseCells = 3;
    const noise = Array.from({ length: octaves }, (_, o) => makeValueNoise(seed * 1013 + o * 7919, baseCells << o));
    const raw = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            let sum = 0;
            let amplitude = 1;
            let norm = 0;
            for (let o = 0; o < octaves; o++) {
                const cells = baseCells << o;
                let n = noise[o](u * cells, v * cells);
                // The two broadest octaves are billowed, which rounds the big shapes into puffs.
                if (o < 2) n = 1 - Math.abs(n * 2 - 1);
                sum += n * amplitude;
                norm += amplitude;
                amplitude *= 0.5;
            }
            raw[y * size + x] = sum / norm;
        }
    }
    const density = new Float32Array(size * size);
    for (let i = 0; i < raw.length; i++) density[i] = smoothstep(0.32, 0.78, raw[i]);

    // Light from the top left: a point is lit where the cloud thins toward the light.
    const light = new Float32Array(size * size);
    // Lit from a blurred copy, so the shading follows whole puffs rather than every ripple.
    const blurred = boxBlur(density, size, 6);
    const reach = 5;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const here = blurred[y * size + x];
            const toward = blurred[((y - reach + size) % size) * size + ((x - reach + size) % size)];
            // Fine detail from the raw noise gives each puff a soft, lumpy surface.
            const detail = (raw[y * size + x] - 0.5) * 0.35;
            light[y * size + x] = clamp01(0.62 + (here - toward) * 2.0 + density[y * size + x] * 0.15 + detail);
        }
    }
    return { size, density, light };
}

/** Draws and animates the clouds on a canvas laid over the board. */
export class CloudFogLayer {
    private field: CloudField | null = null;
    private clearings: FogClearing[] = [];
    /** Per canvas pixel: distance to the nearest clearing, in clearing radii. */
    private distance: Float32Array | null = null;
    private distanceKey = '';
    private image: ImageData | null = null;
    private frame: number | null = null;
    private lastDraw = 0;
    private drift = 0;
    private resizeObserver: ResizeObserver | null = null;
    private readonly reduceMotion: boolean;

    constructor(private readonly canvas: HTMLCanvasElement, private readonly palette: CloudPalette = DEFAULT_PALETTE) {
        const win = canvas.ownerDocument.defaultView;
        this.reduceMotion = Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.draw());
            this.resizeObserver.observe(canvas);
        }
    }

    setClearings(clearings: FogClearing[]): void {
        this.clearings = clearings;
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
            this.drift = (this.drift + (elapsed / 1000) * DRIFT_PER_SECOND) % 1;
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

    private prepare(): { width: number; height: number } | null {
        const width = Math.round(this.canvas.clientWidth * RESOLUTION);
        const height = Math.round(this.canvas.clientHeight * RESOLUTION);
        if (width < 2 || height < 2) return null;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.image = null;
            this.distanceKey = '';
        }
        if (!this.field) this.field = makeCloudField();
        const key = `${width}x${height}`;
        if (this.distanceKey !== key) {
            const radius = Math.max(1, (CLEARING_RADIUS / 100) * width);
            const distance = new Float32Array(width * height);
            const centres = this.clearings.map(c => [(c.x / 100) * width, (c.y / 100) * height]);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let best = Infinity;
                    for (const [cx, cy] of centres) {
                        const d = Math.hypot(x - cx, y - cy);
                        if (d < best) best = d;
                    }
                    distance[y * width + x] = best / radius;
                }
            }
            this.distance = distance;
            this.distanceKey = key;
        }
        return { width, height };
    }

    draw(): void {
        const size = this.prepare();
        const ctx = this.canvas.getContext('2d');
        if (!size || !ctx || !this.field || !this.distance) return;
        const { width, height } = size;
        if (!this.image) this.image = ctx.createImageData(width, height);
        const data = this.image.data;
        const { size: fieldSize, density, light } = this.field;
        const { light: lc, mid: mc, shadow: sc } = this.palette;
        const shiftX = this.drift * fieldSize;
        const shiftY = Math.sin(this.drift * Math.PI * 2) * fieldSize * 0.04;

        // Bilinear sampling of the wrapping field, so magnified clouds stay smooth rather than blocky.
        const sample = (arr: Float32Array, x0: number, y0: number, x1: number, y1: number, tx: number, ty: number) => {
            const top = arr[y0 + x0] + (arr[y0 + x1] - arr[y0 + x0]) * tx;
            const bottom = arr[y1 + x0] + (arr[y1 + x1] - arr[y1 + x0]) * tx;
            return top + (bottom - top) * ty;
        };
        for (let y = 0; y < height; y++) {
            const sy = y * FIELD_SCALE + shiftY;
            const iy = Math.floor(sy);
            const ty = sy - iy;
            const y0 = (((iy % fieldSize) + fieldSize) % fieldSize) * fieldSize;
            const y1 = ((((iy + 1) % fieldSize) + fieldSize) % fieldSize) * fieldSize;
            for (let x = 0; x < width; x++) {
                const sx = x * FIELD_SCALE + shiftX;
                const ix = Math.floor(sx);
                const tx = sx - ix;
                const x0 = ((ix % fieldSize) + fieldSize) % fieldSize;
                const x1 = (((ix + 1) % fieldSize) + fieldSize) % fieldSize;
                const d = sample(density, x0, y0, x1, y1, tx, ty);
                // Thin cloud between puffs is pale mist; only the bodies of puffs take shadow.
                const l = 0.66 + (sample(light, x0, y0, x1, y1, tx, ty) - 0.66) * smoothstep(0.15, 0.7, d);

                // Thick cloud holds out longer at a clearing's edge than thin cloud does. The pull
                // fades toward the middle, so a place itself is always in the clear.
                const dist = this.distance[y * width + x];
                const pull = (d - 0.5) * EDGE_RAGGEDNESS * smoothstep(0.35, 0.85, dist);
                const reach = dist + pull;
                const cover = smoothstep(1 - EDGE_SOFTNESS, 1 + EDGE_SOFTNESS * 0.4, reach);
                // The clouds cast a soft shadow on the map just inside a clearing's edge.
                const shade = smoothstep(1 - EDGE_SOFTNESS * 2.2, 1 - EDGE_SOFTNESS * 0.4, reach) * (1 - cover) * SHADOW_STRENGTH;
                // Away from clearings the sky is overcast: gaps between puffs are mist, never the map.
                const alpha = cover;

                // Shadow -> body -> sunlit, by the light value.
                let r: number, g: number, b: number;
                if (l < 0.5) {
                    const t = l / 0.5;
                    r = sc[0] + (mc[0] - sc[0]) * t; g = sc[1] + (mc[1] - sc[1]) * t; b = sc[2] + (mc[2] - sc[2]) * t;
                } else {
                    const t = (l - 0.5) / 0.5;
                    r = mc[0] + (lc[0] - mc[0]) * t; g = mc[1] + (lc[1] - mc[1]) * t; b = mc[2] + (lc[2] - mc[2]) * t;
                }
                const i = (y * width + x) * 4;
                // Cloud over its shadow ("over" compositing), so the edge stays soft.
                const outAlpha = alpha + shade * (1 - alpha);
                if (outAlpha <= 0.001) {
                    data[i + 3] = 0;
                } else {
                    const shadowWeight = (shade * (1 - alpha)) / outAlpha;
                    const cloudWeight = alpha / outAlpha;
                    data[i] = r * cloudWeight + SHADOW_COLOR[0] * shadowWeight;
                    data[i + 1] = g * cloudWeight + SHADOW_COLOR[1] * shadowWeight;
                    data[i + 2] = b * cloudWeight + SHADOW_COLOR[2] * shadowWeight;
                    data[i + 3] = outAlpha * 255;
                }
            }
        }
        ctx.putImageData(this.image, 0, 0);
    }
}
