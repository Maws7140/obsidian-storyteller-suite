/**
 * Turns the palette's current tool into persisted Maplog records. Pure
 * TypeScript: no Obsidian or DOM imports, so the rules are unit tested.
 */
import { acceptedMaplogAttributes, clampMaplogGrade, getMaplogMark, type MaplogMarkDef } from './catalogue';
import { nextMaplogId, normalizeMaplogData, type MaplogAreaRecord, type MaplogData, type MaplogLatLng, type MaplogLineRecord, type MaplogMarkRecord } from './model';

/** Rotation steps offered in the palette, in degrees clockwise. */
export const MAPLOG_ROTATIONS: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];

/** Everything the palette currently has set. The map editor reads it when the user clicks the map. */
export interface MaplogToolState {
    markId: string;
    attributes: string[];
    dashed: boolean;
    rotation: number;
    grade?: number;
    label?: string;
    level?: string;
    destination?: string;
    placeId?: string;
    locationId?: string;
}

/** Why a tool cannot be placed yet, or undefined when it can. */
export function maplogToolError(tool: MaplogToolState): string | undefined {
    const def = getMaplogMark(tool.markId);
    if (!def) return 'Choose a Maplog mark first.';
    if (def.id === 'text' && !tool.label?.trim()) return 'Type the text to place first.';
    if (def.id === 'place-id' && !tool.placeId?.trim()) return 'Type the place ID to place first.';
    return undefined;
}

/** Attribute, grade and rotation fields as a mark record stores them. */
function markFields(def: MaplogMarkDef, tool: MaplogToolState): Partial<MaplogMarkRecord> {
    const fields: Partial<MaplogMarkRecord> = {};
    const attributes = acceptedMaplogAttributes(def.id, tool.attributes);
    if (attributes.length) fields.attributes = attributes;
    if (tool.dashed) fields.dashed = true;
    if (def.rotatable && tool.rotation) fields.rotation = ((tool.rotation % 360) + 360) % 360;
    if (def.grades) fields.grade = clampMaplogGrade(def.id, tool.grade) ?? def.grades.default;
    const label = tool.label?.trim();
    if (label) fields.label = label;
    const level = tool.level?.trim();
    if (level) fields.level = level;
    const destination = tool.destination?.trim();
    if (destination) fields.destination = destination;
    const placeId = tool.placeId?.trim();
    if (placeId) fields.placeId = placeId;
    const locationId = tool.locationId?.trim();
    if (locationId) fields.locationId = locationId;
    return fields;
}

/** A point or opening record at a clicked position. Returns an error message instead when the tool is incomplete. */
export function createMaplogMark(tool: MaplogToolState, latlng: MaplogLatLng, existing: MaplogData): MaplogMarkRecord | string {
    const error = maplogToolError(tool);
    if (error) return error;
    const def = getMaplogMark(tool.markId);
    if (!def || (def.kind !== 'point' && def.kind !== 'opening')) return 'That mark is drawn as a line or an area.';
    const id = nextMaplogId(def.id, existing.marks.map(m => m.id));
    const [record] = normalizeMaplogData({ maplogMarks: [{ id, mark: def.id, latlng, ...markFields(def, tool) }] }).marks;
    return record ?? 'That mark could not be placed.';
}

/** A line record from the clicked points. Needs at least two distinct points. */
export function createMaplogLine(tool: MaplogToolState, points: MaplogLatLng[], existing: MaplogData): MaplogLineRecord | string {
    const def = getMaplogMark(tool.markId);
    if (!def || def.kind !== 'line') return 'That mark is not a line.';
    if (points.length < 2) return 'A line needs at least two points.';
    const id = nextMaplogId(def.id, existing.lines.map(l => l.id));
    const [record] = normalizeMaplogData({
        maplogLines: [{ id, mark: def.id, points, attributes: acceptedMaplogAttributes(def.id, tool.attributes), dashed: tool.dashed, label: tool.label }],
    }).lines;
    return record ?? 'That line could not be drawn.';
}

/** An area record from the clicked corners. Needs at least three distinct corners. */
export function createMaplogArea(tool: MaplogToolState, points: MaplogLatLng[], existing: MaplogData): MaplogAreaRecord | string {
    const def = getMaplogMark(tool.markId);
    if (!def || def.kind !== 'area') return 'That mark is not an area.';
    if (points.length < 3) return 'An area needs at least three corners.';
    const id = nextMaplogId(def.id, existing.areas.map(a => a.id));
    const [record] = normalizeMaplogData({
        maplogAreas: [{ id, mark: def.id, points, dashed: tool.dashed, label: tool.label }],
    }).areas;
    return record ?? 'That area could not be drawn.';
}

/** Whether a mark id names a point or an opening, which are placed with one click. */
export function isPlacedMark(markId: string): boolean {
    const kind = getMaplogMark(markId)?.kind;
    return kind === 'point' || kind === 'opening';
}
