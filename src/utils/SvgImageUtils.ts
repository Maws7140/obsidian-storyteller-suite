export interface SvgSourceInfo {
    width: number;
    height: number;
    viewBox: string;
    byteLength: number;
}

export interface SvgRenderThresholds {
    maxDirectEdge?: number;
    maxDirectBytes?: number;
    maxRasterEdge?: number;
}

const DEFAULT_SVG_WIDTH = 1024;
const DEFAULT_SVG_HEIGHT = 1024;
const DEFAULT_MAX_DIRECT_EDGE = 4096;
const DEFAULT_MAX_DIRECT_BYTES = 1024 * 1024;
const DEFAULT_MAX_RASTER_EDGE = 8192;

export function isSvgPath(path: string): boolean {
    return path.trim().toLowerCase().endsWith('.svg');
}

export function isSvgArrayBuffer(data: ArrayBuffer): boolean {
    return looksLikeSvgText(decodeSvgText(data, 4096));
}

export function getSvgSourceInfoFromArrayBuffer(data: ArrayBuffer): SvgSourceInfo {
    const text = decodeSvgText(data);
    return getSvgSourceInfoFromText(text, data.byteLength);
}

export function getSvgSourceInfoFromText(svgText: string, byteLength?: number): SvgSourceInfo {
    const svgEl = parseSvgElement(svgText);
    const viewBoxAttr = svgEl.getAttribute('viewBox')?.trim();
    const viewBoxMatch = viewBoxAttr?.match(
        /^\s*([+-]?\d*\.?\d+)[,\s]+([+-]?\d*\.?\d+)[,\s]+([+-]?\d*\.?\d+)[,\s]+([+-]?\d*\.?\d+)\s*$/
    );

    const viewBoxWidth = viewBoxMatch ? Math.abs(Number(viewBoxMatch[3])) : undefined;
    const viewBoxHeight = viewBoxMatch ? Math.abs(Number(viewBoxMatch[4])) : undefined;

    const rawWidth = parseSvgLength(svgEl.getAttribute('width'));
    const rawHeight = parseSvgLength(svgEl.getAttribute('height'));

    let width = rawWidth ?? viewBoxWidth ?? DEFAULT_SVG_WIDTH;
    let height = rawHeight ?? viewBoxHeight ?? DEFAULT_SVG_HEIGHT;

    if (!rawWidth && rawHeight && viewBoxWidth && viewBoxHeight) {
        width = rawHeight * (viewBoxWidth / viewBoxHeight);
    } else if (!rawHeight && rawWidth && viewBoxWidth && viewBoxHeight) {
        height = rawWidth * (viewBoxHeight / viewBoxWidth);
    }

    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));

    return {
        width,
        height,
        viewBox: viewBoxAttr || `0 0 ${width} ${height}`,
        byteLength: byteLength ?? new TextEncoder().encode(svgText).length,
    };
}

export function chooseSvgRenderMode(
    info: SvgSourceInfo,
    thresholds: SvgRenderThresholds = {}
): 'overlay' | 'tiled' {
    const maxDirectEdge = thresholds.maxDirectEdge ?? DEFAULT_MAX_DIRECT_EDGE;
    const maxDirectBytes = thresholds.maxDirectBytes ?? DEFAULT_MAX_DIRECT_BYTES;
    const longestEdge = Math.max(info.width, info.height);

    if (longestEdge <= maxDirectEdge && info.byteLength <= maxDirectBytes) {
        return 'overlay';
    }

    return 'tiled';
}

export function createNormalizedSvgElement(svgText: string, info?: SvgSourceInfo): SVGSVGElement {
    const svgEl = parseSvgElement(svgText);
    const resolved = info ?? getSvgSourceInfoFromText(svgText);

    if (!svgEl.getAttribute('xmlns')) {
        svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    if (!svgEl.getAttribute('viewBox')) {
        svgEl.setAttribute('viewBox', resolved.viewBox);
    }
    if (!svgEl.getAttribute('width')) {
        svgEl.setAttribute('width', `${resolved.width}`);
    }
    if (!svgEl.getAttribute('height')) {
        svgEl.setAttribute('height', `${resolved.height}`);
    }
    if (!svgEl.getAttribute('preserveAspectRatio')) {
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    return svgEl;
}

export async function rasterizeSvgToBlob(
    svgText: string,
    info: SvgSourceInfo,
    options: SvgRenderThresholds & { mimeType?: string; quality?: number } = {}
): Promise<{ blob: Blob; width: number; height: number }> {
    const maxRasterEdge = options.maxRasterEdge ?? DEFAULT_MAX_RASTER_EDGE;
    const longestEdge = Math.max(info.width, info.height);
    const scale = longestEdge > maxRasterEdge ? maxRasterEdge / longestEdge : 1;
    const width = Math.max(1, Math.round(info.width * scale));
    const height = Math.max(1, Math.round(info.height * scale));

    const normalizedSvg = new XMLSerializer().serializeToString(
        createNormalizedSvgElement(svgText, info)
    );
    const svgBlob = new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
        const sourceImage = await loadHtmlImage(svgUrl);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to create a canvas context for SVG rasterization.');
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(sourceImage, 0, 0, width, height);

        const blob = await canvasToBlob(canvas, options.mimeType ?? 'image/png', options.quality);
        return { blob, width, height };
    } finally {
        URL.revokeObjectURL(svgUrl);
    }
}

export async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(blob);
    try {
        return await loadHtmlImage(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

function decodeSvgText(data: ArrayBuffer, maxBytes?: number): string {
    const slice = maxBytes ? data.slice(0, maxBytes) : data;
    return new TextDecoder('utf-8').decode(slice).replace(/^\uFEFF/, '');
}

function looksLikeSvgText(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    return normalized.startsWith('<svg') || (normalized.startsWith('<?xml') && normalized.includes('<svg'));
}

function parseSvgElement(svgText: string): SVGSVGElement {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'svg') {
        throw new Error('SVG source does not contain a valid <svg> root element.');
    }

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        throw new Error(parserError.textContent?.trim() || 'Failed to parse SVG source.');
    }

    return root as unknown as SVGSVGElement;
}

function parseSvgLength(value: string | null): number | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.endsWith('%')) return undefined;

    const match = trimmed.match(/^([+-]?\d*\.?\d+)([a-z]*)$/i);
    if (!match) return undefined;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return undefined;

    const unit = (match[2] || 'px').toLowerCase();
    switch (unit) {
        case 'px':
            return amount;
        case 'pt':
            return amount * (96 / 72);
        case 'pc':
            return amount * 16;
        case 'mm':
            return amount * (96 / 25.4);
        case 'cm':
            return amount * (96 / 2.54);
        case 'in':
            return amount * 96;
        default:
            return amount;
    }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        let timeoutId: number | undefined;

        const cleanup = () => {
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
            }
            img.onload = null;
            img.onerror = null;
        };

        img.onload = () => {
            cleanup();
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            if (width <= 0 || height <= 0) {
                reject(new Error('Image loaded but resolved to zero dimensions.'));
                return;
            }
            resolve(img);
        };

        img.onerror = () => {
            cleanup();
            reject(new Error(`Failed to load image: ${url}`));
        };

        timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error(`Image load timeout: ${url}`));
        }, 30000);

        img.src = url;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('Failed to rasterize SVG to a blob.'));
                return;
            }
            resolve(blob);
        }, mimeType, quality);
    });
}
