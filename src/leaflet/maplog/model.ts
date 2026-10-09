/**
 * Persisted shape of Maplog marks, lines and areas on a map note, with the
 * normalisation every load goes through. Values come from frontmatter, so they
 * are untrusted: unknown marks, wrong kinds and bad numbers are dropped rather
 * than rendered.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { acceptedMaplogAttributes, clampMaplogGrade, getMaplogMark, type MaplogKind } from './catalogue';

/** [lat, lng] in Leaflet coordinates (image maps use [y, x] in pixels). */
export type MaplogLatLng = [number, number];

/** A point or opening placed on the map. */
export interface MaplogMarkRecord {
    id: string;
    mark: string;
    latlng: MaplogLatLng;
    attributes?: string[];
    /** Unconfirmed (rule 5). */
    dashed?: boolean;
    /** Degrees clockwise, for rotatable marks. */
    rotation?: number;
    /** Count grade for marks that have one, such as slope chevrons. */
    grade?: number;
    /** Free text: a name, a scale, or a level tag written on the map. */
    label?: string;
    /** Room or hex ID written inside the place, such as R3 or 0203. */
    placeId?: string;
    /** A Storyteller location this place is linked to. */
    locationId?: string;
    /** Level tag for the place, such as L1. */
    level?: string;
    /** Stair destination, such as L3, 1. */
    destination?: string;
}

/** A wall, route or other line drawn between points. */
export interface MaplogLineRecord {
    id: string;
    mark: string;
    points: MaplogLatLng[];
    attributes?: string[];
    dashed?: boolean;
    label?: string;
}

/** A terrain or water area drawn as a polygon. */
export interface MaplogAreaRecord {
    id: string;
    mark: string;
    points: MaplogLatLng[];
    dashed?: boolean;
    label?: string;
}

export interface MaplogData {
    marks: MaplogMarkRecord[];
    lines: MaplogLineRecord[];
    areas: MaplogAreaRecord[];
}

/** The frontmatter keys that hold Maplog data on a map note. */
export const MAPLOG_FRONTMATTER_KEYS = ['maplogMarks', 'maplogLines', 'maplogAreas'] as const;

const MAX_TEXT = 200;
const MAX_POINTS = 2000;

export function emptyMaplogData(): MaplogData {
    return { marks: [], lines: [], areas: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function latLng(value: unknown): MaplogLatLng | undefined {
    if (!Array.isArray(value) || value.length < 2) return undefined;
    const lat = finiteNumber(value[0]);
    const lng = finiteNumber(value[1]);
    return lat === undefined || lng === undefined ? undefined : [lat, lng];
}

function latLngList(value: unknown, minimum: number): MaplogLatLng[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const points: MaplogLatLng[] = [];
    for (const entry of value.slice(0, MAX_POINTS)) {
        const point = latLng(entry);
        if (point) points.push(point);
    }
    return points.length >= minimum ? points : undefined;
}

function text(value: unknown): string | undefined {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const trimmed = String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    return trimmed === '' ? undefined : trimmed;
}

function attributeList(value: unknown, markId: string): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const accepted = acceptedMaplogAttributes(markId, value.filter((v): v is string => typeof v === 'string'));
    return accepted.length > 0 ? accepted : undefined;
}

/** Makes an id unique within a list, keeping a valid id when one is given. */
function uniqueId(raw: unknown, fallback: string, used: Set<string>): string {
    const base = text(raw) ?? fallback;
    let candidate = base;
    let counter = 2;
    while (used.has(candidate)) candidate = `${base}-${counter++}`;
    used.add(candidate);
    return candidate;
}

function kindOf(markId: unknown): MaplogKind | undefined {
    return typeof markId === 'string' ? getMaplogMark(markId)?.kind : undefined;
}

function normalizeMark(raw: unknown, used: Set<string>, index: number): MaplogMarkRecord | undefined {
    if (!isRecord(raw)) return undefined;
    const markId = typeof raw.mark === 'string' ? raw.mark : '';
    const kind = kindOf(markId);
    if (kind !== 'point' && kind !== 'opening') return undefined;
    const latlng = latLng(raw.latlng);
    if (!latlng) return undefined;
    const def = getMaplogMark(markId);
    const record: MaplogMarkRecord = {
        id: uniqueId(raw.id, `${markId}-${index + 1}`, used),
        mark: markId,
        latlng,
    };
    const attributes = attributeList(raw.attributes, markId);
    if (attributes) record.attributes = attributes;
    if (raw.dashed === true) record.dashed = true;
    const rotation = finiteNumber(raw.rotation);
    if (def?.rotatable && rotation !== undefined) {
        const turned = ((rotation % 360) + 360) % 360;
        if (turned !== 0) record.rotation = Math.round(turned * 100) / 100;
    }
    if (def?.grades) record.grade = clampMaplogGrade(markId, finiteNumber(raw.grade)) ?? def.grades.default;
    const label = text(raw.label);
    if (label) record.label = label;
    const placeId = text(raw.placeId);
    if (placeId) record.placeId = placeId;
    const locationId = text(raw.locationId);
    if (locationId) record.locationId = locationId;
    const level = text(raw.level);
    if (level) record.level = level;
    const destination = text(raw.destination);
    if (destination) record.destination = destination;
    return record;
}

function normalizeLine(raw: unknown, used: Set<string>, index: number): MaplogLineRecord | undefined {
    if (!isRecord(raw)) return undefined;
    const markId = typeof raw.mark === 'string' ? raw.mark : '';
    if (kindOf(markId) !== 'line') return undefined;
    const points = latLngList(raw.points, 2);
    if (!points) return undefined;
    const record: MaplogLineRecord = {
        id: uniqueId(raw.id, `${markId}-${index + 1}`, used),
        mark: markId,
        points,
    };
    const attributes = attributeList(raw.attributes, markId);
    if (attributes) record.attributes = attributes;
    if (raw.dashed === true) record.dashed = true;
    const label = text(raw.label);
    if (label) record.label = label;
    return record;
}

function normalizeArea(raw: unknown, used: Set<string>, index: number): MaplogAreaRecord | undefined {
    if (!isRecord(raw)) return undefined;
    const markId = typeof raw.mark === 'string' ? raw.mark : '';
    if (kindOf(markId) !== 'area') return undefined;
    const points = latLngList(raw.points, 3);
    if (!points) return undefined;
    const record: MaplogAreaRecord = {
        id: uniqueId(raw.id, `${markId}-${index + 1}`, used),
        mark: markId,
        points,
    };
    if (raw.dashed === true) record.dashed = true;
    const label = text(raw.label);
    if (label) record.label = label;
    return record;
}

function normalizeList<T>(value: unknown, make: (raw: unknown, used: Set<string>, index: number) => T | undefined): T[] {
    if (!Array.isArray(value)) return [];
    const used = new Set<string>();
    const out: T[] = [];
    value.forEach((raw, index) => {
        const record = make(raw, used, index);
        if (record) out.push(record);
    });
    return out;
}

/**
 * Turns whatever a map note holds into valid Maplog data. Idempotent: normalising
 * the result again gives the same result.
 */
export function normalizeMaplogData(source: unknown): MaplogData {
    const record = isRecord(source) ? source : {};
    return {
        marks: normalizeList(record.maplogMarks, normalizeMark),
        lines: normalizeList(record.maplogLines, normalizeLine),
        areas: normalizeList(record.maplogAreas, normalizeArea),
    };
}

/**
 * Frontmatter patch for a Maplog state: empty lists are omitted so a map with no
 * Maplog marks keeps its note clean. A key mapped to undefined should be removed.
 */
export function maplogFrontmatter(data: MaplogData): Record<(typeof MAPLOG_FRONTMATTER_KEYS)[number], unknown> {
    return {
        maplogMarks: data.marks.length ? data.marks : undefined,
        maplogLines: data.lines.length ? data.lines : undefined,
        maplogAreas: data.areas.length ? data.areas : undefined,
    };
}

/** A fresh id for a new item: the prefix plus the first number not yet used. */
export function nextMaplogId(prefix: string, used: Iterable<string>): string {
    const taken = new Set(used);
    let counter = 1;
    while (taken.has(`${prefix}-${counter}`)) counter++;
    return `${prefix}-${counter}`;
}

export type MaplogItemRef =
    | { type: 'mark'; id: string }
    | { type: 'line'; id: string }
    | { type: 'area'; id: string };

/** Data without the referenced item. Unknown references leave the data unchanged. */
export function removeMaplogItem(data: MaplogData, ref: MaplogItemRef): MaplogData {
    switch (ref.type) {
        case 'mark':
            return { ...data, marks: data.marks.filter(item => item.id !== ref.id) };
        case 'line':
            return { ...data, lines: data.lines.filter(item => item.id !== ref.id) };
        case 'area':
            return { ...data, areas: data.areas.filter(item => item.id !== ref.id) };
    }
}

/** Data with one mark replaced by the result of `update`. Unknown ids leave the data unchanged. */
export function updateMaplogMark(data: MaplogData, id: string, update: (item: MaplogMarkRecord) => MaplogMarkRecord): MaplogData {
    return { ...data, marks: data.marks.map(item => (item.id === id ? update(item) : item)) };
}

/** Data with one line replaced by the result of `update`. */
export function updateMaplogLine(data: MaplogData, id: string, update: (item: MaplogLineRecord) => MaplogLineRecord): MaplogData {
    return { ...data, lines: data.lines.map(item => (item.id === id ? update(item) : item)) };
}

/** Data with one area replaced by the result of `update`. */
export function updateMaplogArea(data: MaplogData, id: string, update: (item: MaplogAreaRecord) => MaplogAreaRecord): MaplogData {
    return { ...data, areas: data.areas.map(item => (item.id === id ? update(item) : item)) };
}

/** Whether there is anything to draw. */
export function hasMaplogData(data: MaplogData): boolean {
    return data.marks.length > 0 || data.lines.length > 0 || data.areas.length > 0;
}
