/**
 * Pure parsing helpers for GeoJSON and GPX overlay layers.
 *
 * No Leaflet or Obsidian imports here so this module can be unit tested.
 * GPX parsing works against a minimal element interface; a browser
 * `Element` from `DOMParser` satisfies it structurally.
 */

/** Minimal XML element surface needed to read GPX. */
export interface XmlElementLike {
    localName: string;
    textContent: string | null;
    getAttribute(name: string): string | null;
    children: ArrayLike<XmlElementLike>;
}

/** A single GPX point (track point, route point or waypoint). */
export interface GpxPoint {
    lat: number;
    lng: number;
    name?: string;
    description?: string;
}

/** A GPX track or route: a named list of points. */
export interface GpxLine {
    name?: string;
    points: GpxPoint[];
}

/** Plain data extracted from a GPX document. */
export interface GpxData {
    tracks: GpxLine[];
    routes: GpxLine[];
    waypoints: GpxPoint[];
}

/** Name and description shown in a feature or waypoint popup. */
export interface OverlayPopupInfo {
    name?: string;
    description?: string;
}

/** Structural GeoJSON object (a Feature, FeatureCollection or geometry). */
export interface GeoJsonRoot {
    type: string;
    [key: string]: unknown;
}

const GEOMETRY_TYPES = [
    'Point', 'MultiPoint', 'LineString', 'MultiLineString',
    'Polygon', 'MultiPolygon', 'GeometryCollection',
] as const;

/** Nesting depth of coordinate arrays per geometry type (a position is depth 1). */
const COORDINATE_DEPTH: Record<string, number> = {
    Point: 1,
    MultiPoint: 2,
    LineString: 2,
    MultiLineString: 3,
    Polygon: 3,
    MultiPolygon: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function childrenNamed(parent: XmlElementLike, localName: string): XmlElementLike[] {
    const matches: XmlElementLike[] = [];
    for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child.localName === localName) matches.push(child);
    }
    return matches;
}

function childText(parent: XmlElementLike, localName: string): string | undefined {
    const [first] = childrenNamed(parent, localName);
    return first ? cleanText(first.textContent) : undefined;
}

/** Parse a numeric attribute; blank, missing or non-numeric values give null. */
function parseCoordinate(raw: string | null): number | null {
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function readPoint(el: XmlElementLike, withText: boolean): GpxPoint | null {
    const lat = parseCoordinate(el.getAttribute('lat'));
    const lng = parseCoordinate(el.getAttribute('lon'));
    if (lat === null || lng === null) return null;

    const point: GpxPoint = { lat, lng };
    if (withText) {
        const name = childText(el, 'name');
        const description = childText(el, 'desc');
        if (name) point.name = name;
        if (description) point.description = description;
    }
    return point;
}

/**
 * Extract tracks (trk > trkseg > trkpt), routes (rte > rtept) and
 * waypoints (wpt) from a GPX root element.
 *
 * Throws when the root is not a `gpx` element (for example a DOMParser
 * error document). Points with missing or non-numeric coordinates are skipped.
 */
export function parseGpxRoot(root: XmlElementLike): GpxData {
    if (root.localName !== 'gpx') {
        throw new Error(`Not a GPX document (root element is "${root.localName}")`);
    }

    const tracks: GpxLine[] = childrenNamed(root, 'trk').map(trk => {
        const points: GpxPoint[] = [];
        for (const seg of childrenNamed(trk, 'trkseg')) {
            for (const pt of childrenNamed(seg, 'trkpt')) {
                const point = readPoint(pt, false);
                if (point) points.push(point);
            }
        }
        const line: GpxLine = { points };
        const name = childText(trk, 'name');
        if (name) line.name = name;
        return line;
    });

    const routes: GpxLine[] = childrenNamed(root, 'rte').map(rte => {
        const points: GpxPoint[] = [];
        for (const pt of childrenNamed(rte, 'rtept')) {
            const point = readPoint(pt, false);
            if (point) points.push(point);
        }
        const line: GpxLine = { points };
        const name = childText(rte, 'name');
        if (name) line.name = name;
        return line;
    });

    const waypoints: GpxPoint[] = [];
    for (const wpt of childrenNamed(root, 'wpt')) {
        const point = readPoint(wpt, true);
        if (point) waypoints.push(point);
    }

    return { tracks, routes, waypoints };
}

function isPosition(value: unknown): boolean {
    return Array.isArray(value)
        && value.length >= 2
        && value.every(n => typeof n === 'number' && Number.isFinite(n));
}

function hasValidCoordinates(coords: unknown, depth: number): boolean {
    if (!Array.isArray(coords)) return false;
    if (depth === 1) return isPosition(coords);
    return coords.length > 0 && coords.every(c => hasValidCoordinates(c, depth - 1));
}

function isValidGeometry(value: unknown): boolean {
    if (value === null) return true; // Features may have a null geometry
    if (!isRecord(value) || typeof value.type !== 'string') return false;
    if (value.type === 'GeometryCollection') {
        return Array.isArray(value.geometries) && value.geometries.every(isValidGeometry);
    }
    const depth = COORDINATE_DEPTH[value.type];
    if (depth === undefined) return false;
    return hasValidCoordinates(value.coordinates, depth);
}

function isValidFeature(value: unknown): boolean {
    return isRecord(value) && value.type === 'Feature' && isValidGeometry(value.geometry);
}

/**
 * Check that a parsed JSON value is a GeoJSON Feature, FeatureCollection or
 * geometry with well-formed coordinates. Returns the value typed as a
 * GeoJSON root; throws with a descriptive message otherwise.
 */
export function validateGeoJson(value: unknown): GeoJsonRoot {
    if (!isRecord(value) || typeof value.type !== 'string') {
        throw new Error('Not a GeoJSON object (missing "type")');
    }

    let valid: boolean;
    if (value.type === 'FeatureCollection') {
        valid = Array.isArray(value.features) && value.features.every(isValidFeature);
    } else if (value.type === 'Feature') {
        valid = isValidFeature(value);
    } else if ((GEOMETRY_TYPES as readonly string[]).includes(value.type)) {
        valid = isValidGeometry(value);
    } else {
        throw new Error(`Unsupported GeoJSON type "${value.type}"`);
    }

    if (!valid) throw new Error(`Malformed GeoJSON ${value.type} (invalid geometry or coordinates)`);
    return value as GeoJsonRoot;
}

/** Parse JSON text and validate it as GeoJSON. */
export function parseGeoJsonText(text: string): GeoJsonRoot {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return validateGeoJson(parsed);
}

/**
 * Read `name` and `description` from GeoJSON feature properties for a popup.
 * Non-string values are ignored. Returns null when there is nothing to show.
 */
export function describeOverlayProperties(properties: unknown): OverlayPopupInfo | null {
    if (!isRecord(properties)) return null;
    const name = typeof properties.name === 'string' ? cleanText(properties.name) : undefined;
    const description = typeof properties.description === 'string' ? cleanText(properties.description) : undefined;
    if (!name && !description) return null;
    const info: OverlayPopupInfo = {};
    if (name) info.name = name;
    if (description) info.description = description;
    return info;
}

/** Normalise a block parameter that may be a single path or a list of paths. */
export function toOverlayPathList(value: string | string[] | undefined): string[] {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list.map(v => String(v).trim()).filter(v => v.length > 0);
}
