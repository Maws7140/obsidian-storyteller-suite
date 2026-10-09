/**
 * Pure geometry and naming for "Export as image" on image maps.
 *
 * Kept free of Leaflet and Obsidian imports so the drawing plan can be tested
 * without a DOM. All points are container pixels (CSS px) of the live viewer;
 * the plan scales them to the output canvas.
 */

export interface ExportPoint { x: number; y: number }

export interface ExportRect extends ExportPoint { width: number; height: number }

export interface ExportMarkerInput extends ExportPoint {
    color: string;
    label?: string;
}

export interface ExportPlanInput {
    /** Viewer size in CSS px. */
    viewWidth: number;
    viewHeight: number;
    /** Output pixels per CSS px (device pixel ratio, clamped by the caller). */
    scale: number;
    /** Projected image corners in container pixels. */
    imageNorthWest: ExportPoint;
    imageSouthEast: ExportPoint;
    markers: ExportMarkerInput[];
    /** Marker radius in CSS px. */
    markerRadius?: number;
}

export interface ExportPlannedLabel {
    text: string;
    x: number;
    y: number;
    align: 'left' | 'right';
}

export interface ExportPlannedMarker extends ExportPoint {
    radius: number;
    color: string;
    label: ExportPlannedLabel | null;
}

export interface ExportPlan {
    width: number;
    height: number;
    scale: number;
    image: ExportRect;
    markers: ExportPlannedMarker[];
}

const DEFAULT_MARKER_RADIUS = 7;
const MAX_LABEL_LENGTH = 40;

/** Labels are placed beside the pin; anything past this fraction of the width flips left. */
const LABEL_FLIP_RATIO = 0.7;

/**
 * Compute output canvas size, the image rectangle, and marker positions for a
 * snapshot of the viewer. Markers outside the viewer are dropped. Returns null
 * when the viewer or the projected image has no drawable area.
 */
export function planImageExport(input: ExportPlanInput): ExportPlan | null {
    const { viewWidth, viewHeight, scale } = input;
    if (!(viewWidth > 0) || !(viewHeight > 0) || !(scale > 0)) return null;
    if (![viewWidth, viewHeight, scale].every(Number.isFinite)) return null;

    const nw = input.imageNorthWest;
    const se = input.imageSouthEast;
    const imageWidth = Math.abs(se.x - nw.x);
    const imageHeight = Math.abs(se.y - nw.y);
    if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) return null;
    if (imageWidth <= 0 || imageHeight <= 0) return null;

    const radius = input.markerRadius ?? DEFAULT_MARKER_RADIUS;
    const width = Math.round(viewWidth * scale);
    const height = Math.round(viewHeight * scale);

    const markers: ExportPlannedMarker[] = [];
    for (const marker of input.markers) {
        if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) continue;
        // Keep pins whose disc touches the viewer, so edge pins still show.
        if (marker.x < -radius || marker.y < -radius) continue;
        if (marker.x > viewWidth + radius || marker.y > viewHeight + radius) continue;
        markers.push({
            x: marker.x * scale,
            y: marker.y * scale,
            radius: radius * scale,
            color: marker.color,
            label: planLabel(marker, radius, scale, viewWidth)
        });
    }

    return {
        width,
        height,
        scale,
        image: {
            x: Math.min(nw.x, se.x) * scale,
            y: Math.min(nw.y, se.y) * scale,
            width: imageWidth * scale,
            height: imageHeight * scale
        },
        markers
    };
}

function planLabel(marker: ExportMarkerInput, radius: number, scale: number, viewWidth: number): ExportPlannedLabel | null {
    const text = normalizeLabel(marker.label);
    if (!text) return null;
    const flip = marker.x > viewWidth * LABEL_FLIP_RATIO;
    const offset = (radius + 4) * scale;
    return {
        text,
        x: marker.x * scale + (flip ? -offset : offset),
        y: marker.y * scale,
        align: flip ? 'right' : 'left'
    };
}

/** Collapse whitespace and cap length so a long note title cannot swamp the map. */
export function normalizeLabel(label: string | undefined): string {
    const text = (label ?? '').replace(/\s+/g, ' ').trim();
    if (text.length <= MAX_LABEL_LENGTH) return text;
    return `${text.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
}

/** Lowercase ASCII slug for a file name, falling back to "map". */
export function slugifyMapName(name: string | undefined): string {
    const slug = (name ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
    return slug || 'map';
}

/** `map-<slug>-YYYY-MM-DD-HHmm.png`, using local time. */
export function buildMapExportFileName(mapName: string | undefined, date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
    return `map-${slugifyMapName(mapName)}-${stamp}.png`;
}

/**
 * Pick `folder/name.png`, or `folder/name-2.png`, `-3`, ... so an existing
 * export is never overwritten.
 */
export function uniqueExportPath(folder: string, fileName: string, exists: (path: string) => boolean): string {
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    const prefix = folder ? `${folder.replace(/\/+$/, '')}/` : '';
    let candidate = `${prefix}${base}${ext}`;
    for (let n = 2; exists(candidate); n++) {
        candidate = `${prefix}${base}-${n}${ext}`;
    }
    return candidate;
}

/** MIME type for a base image, or null when the extension is not a raster or SVG format. */
export function imageMimeForPath(path: string): string | null {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'bmp': return 'image/bmp';
        case 'svg': return 'image/svg+xml';
        default: return null;
    }
}
