/**
 * Maplog mark catalogue: a typed list of every mark in the Maplog notation for
 * maps drawn during play (walls, openings, level changes, traps, fixtures,
 * terrain, routes, sites and settlements).
 *
 * Maplog by Roberto Bisceglie, licensed under CC BY-SA 4.0:
 * https://creativecommons.org/licenses/by-sa/4.0/
 * The marks here are drawn from the notation's written descriptions, not copied
 * from its reference sheets.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */

/** Credit line shown in the legend and kept with every Maplog mark. */
export const MAPLOG_CREDIT = 'Maplog by Roberto Bisceglie (CC BY-SA 4.0)';

/** Lines run along edges, openings sit in gaps, points mark a place, areas fill a place. */
export type MaplogKind = 'line' | 'opening' | 'point' | 'area';

export type MaplogFamily =
    | 'walls'
    | 'openings'
    | 'levels'
    | 'traps'
    | 'fixtures'
    | 'relief'
    | 'routes'
    | 'sites'
    | 'settlements'
    | 'terrain'
    | 'write-ins';

/** Small marks and letters added to a base mark (rule 2). */
export type MaplogAttributeId =
    | 'locked'
    | 'secret'
    | 'barred'
    | 'trapped'
    | 'oneway'
    | 'illusory'
    | 'covered'
    | 'ceiling'
    | 'port'
    | 'temple';

export interface MaplogAttributeDef {
    id: MaplogAttributeId;
    label: string;
    description: string;
}

export const MAPLOG_ATTRIBUTES: readonly MaplogAttributeDef[] = [
    { id: 'locked', label: 'Locked', description: 'Solid rectangle: the way is shut' },
    { id: 'secret', label: 'Secret', description: 'S beside the mark: hidden until found' },
    { id: 'barred', label: 'Barred', description: 'Two bars on the side the bar is on' },
    { id: 'trapped', label: 'Trapped', description: 'Small triangle on the side the trap is on' },
    { id: 'oneway', label: 'One-way', description: 'Arrow through the opening' },
    { id: 'illusory', label: 'Illusory', description: 'Question mark: a wall that is not really there' },
    { id: 'covered', label: 'Covered', description: 'C beside the pit: hidden under a lid' },
    { id: 'ceiling', label: 'Ceiling', description: 'U beside the trapdoor: opens overhead' },
    { id: 'port', label: 'Port', description: 'Anchor beside the settlement' },
    { id: 'temple', label: 'Temple', description: 'Shrine beside the settlement' },
];

export interface MaplogGradeRule {
    min: number;
    max: number;
    default: number;
}

export interface MaplogMarkDef {
    id: string;
    kind: MaplogKind;
    family: MaplogFamily;
    label: string;
    /** Attributes this mark accepts (rule 2). */
    attributes: readonly MaplogAttributeId[];
    /** Rotation is meaningful for directional marks: openings, stairs, crossings. */
    rotatable: boolean;
    /** Count grade (rule 4): the number of chevrons on a slope. */
    grades?: MaplogGradeRule;
    /** Rings drawn around a settlement (rule 4): village 1, town 2, city 3. */
    rings?: number;
    description: string;
}

export const MAPLOG_FAMILIES: readonly { id: MaplogFamily; label: string }[] = [
    { id: 'walls', label: 'Walls and boundaries' },
    { id: 'openings', label: 'Openings' },
    { id: 'levels', label: 'Level changes' },
    { id: 'traps', label: 'Pits and traps' },
    { id: 'fixtures', label: 'Fixtures' },
    { id: 'relief', label: 'Relief and borders' },
    { id: 'routes', label: 'Routes and crossings' },
    { id: 'sites', label: 'Sites and landmarks' },
    { id: 'settlements', label: 'Settlements' },
    { id: 'terrain', label: 'Terrain and water' },
    { id: 'write-ins', label: 'Write-ins' },
];

const DOOR_ATTRIBUTES: readonly MaplogAttributeId[] = ['locked', 'secret', 'barred', 'trapped', 'oneway', 'illusory'];
const SETTLEMENT_ATTRIBUTES: readonly MaplogAttributeId[] = ['port', 'temple'];

export const MAPLOG_MARKS: readonly MaplogMarkDef[] = [
    // Lines: along an edge or from place to place
    { id: 'wall', kind: 'line', family: 'walls', label: 'Wall', attributes: ['illusory'], rotatable: false, description: 'Thick line. Every other line and opening sits on it.' },
    { id: 'offmap', kind: 'line', family: 'walls', label: 'Off-map edge', attributes: [], rotatable: false, description: 'Passage leaving the drawn map, ended with slanted breaks.' },
    { id: 'bars', kind: 'line', family: 'walls', label: 'Bars', attributes: [], rotatable: false, description: 'Wall broken by a row of dots: see and shout through, not walk.' },
    { id: 'ledge', kind: 'line', family: 'walls', label: 'Ledge', attributes: [], rotatable: false, description: 'Drop-off: thin line with ticks on the lower side.' },
    { id: 'cliff', kind: 'line', family: 'relief', label: 'Cliff', attributes: [], rotatable: false, description: 'The ledge at the scale of the land.' },
    { id: 'border', kind: 'line', family: 'relief', label: 'Border', attributes: [], rotatable: false, description: 'Edge of a realm: thin line with small circles.' },
    { id: 'road', kind: 'line', family: 'routes', label: 'Road', attributes: [], rotatable: false, description: 'Built and kept up. Two lines.' },
    { id: 'track', kind: 'line', family: 'routes', label: 'Track', attributes: [], rotatable: false, description: 'Beaten earth. One line. A sea lane is a track over water.' },
    { id: 'trail', kind: 'line', family: 'routes', label: 'Trail', attributes: [], rotatable: false, description: 'A path on foot: one line with ticks across it.' },
    { id: 'river', kind: 'line', family: 'routes', label: 'River', attributes: [], rotatable: false, description: 'Too wide or deep to wade. Two wavy lines.' },
    { id: 'stream', kind: 'line', family: 'routes', label: 'Stream', attributes: [], rotatable: false, description: 'You can wade it. One wavy line.' },

    // Openings: in a gap in a wall
    { id: 'passage', kind: 'opening', family: 'openings', label: 'Open passage', attributes: ['secret', 'illusory'], rotatable: true, description: 'A gap with nothing in it.' },
    { id: 'door', kind: 'opening', family: 'openings', label: 'Door', attributes: DOOR_ATTRIBUTES, rotatable: true, description: 'A way through that you can open.' },
    { id: 'double', kind: 'opening', family: 'openings', label: 'Double door', attributes: DOOR_ATTRIBUTES, rotatable: true, description: 'Two doors side by side.' },
    { id: 'window', kind: 'opening', family: 'openings', label: 'Window', attributes: [], rotatable: true, description: 'You can see through, and perhaps climb.' },
    { id: 'collapsed', kind: 'opening', family: 'openings', label: 'Collapsed', attributes: [], rotatable: true, description: 'Blocked by rubble.' },

    // Points: level changes
    { id: 'stairs-up', kind: 'point', family: 'levels', label: 'Stairs up', attributes: [], rotatable: true, description: 'Box of evenly spaced step lines.' },
    { id: 'stairs-down', kind: 'point', family: 'levels', label: 'Stairs down', attributes: [], rotatable: true, description: 'Box whose step lines shorten toward the way down.' },
    { id: 'spiral', kind: 'point', family: 'levels', label: 'Spiral stairs', attributes: [], rotatable: true, description: 'Spoked circle with an arrow for the way you turn going down.' },
    { id: 'slope', kind: 'point', family: 'levels', label: 'Slope', attributes: [], rotatable: true, grades: { min: 1, max: 3, default: 3 }, description: 'Chevrons pointing down the slope: three for steep, one for slight. Also a chute.' },
    { id: 'shaft', kind: 'point', family: 'levels', label: 'Shaft', attributes: [], rotatable: false, description: 'Vertical hole in the floor.' },
    { id: 'shaft-up', kind: 'point', family: 'levels', label: 'Shaft in the ceiling', attributes: [], rotatable: false, description: 'Vertical hole that opens in the ceiling.' },

    // Points: pits and traps
    { id: 'trap', kind: 'point', family: 'traps', label: 'Trap', attributes: [], rotatable: false, description: 'A trap or danger you know about.' },
    { id: 'pit', kind: 'point', family: 'traps', label: 'Pit', attributes: ['covered'], rotatable: false, description: 'Open hole in the floor. Add C for a covered pit.' },
    { id: 'trapdoor', kind: 'point', family: 'traps', label: 'Trapdoor', attributes: ['secret', 'ceiling'], rotatable: false, description: 'Hatch in the floor. S for secret, U for the ceiling.' },

    // Points: fixtures
    { id: 'column', kind: 'point', family: 'fixtures', label: 'Column', attributes: [], rotatable: false, description: 'Pillar or column: small solid square.' },
    { id: 'statue', kind: 'point', family: 'fixtures', label: 'Statue', attributes: [], rotatable: false, description: 'Circle with a star.' },
    { id: 'well', kind: 'point', family: 'fixtures', label: 'Well', attributes: [], rotatable: false, description: 'Circle with a wave. Also a fountain.' },
    { id: 'altar', kind: 'point', family: 'fixtures', label: 'Altar', attributes: [], rotatable: false, description: 'Block with a small cross on top.' },
    { id: 'light', kind: 'point', family: 'fixtures', label: 'Light', attributes: [], rotatable: false, description: 'Lit brazier, glowing crystal, anything that lights the room.' },

    // Points: relief
    { id: 'peak', kind: 'point', family: 'relief', label: 'Peak', attributes: [], rotatable: false, description: 'A single mountain worth naming.' },
    { id: 'pass', kind: 'point', family: 'relief', label: 'Pass', attributes: [], rotatable: true, description: 'A way through mountains or hills.' },

    // Points: routes and crossings
    { id: 'bridge', kind: 'point', family: 'routes', label: 'Bridge', attributes: [], rotatable: true, description: 'Two short lines across the river, ends flared.' },
    { id: 'ford', kind: 'point', family: 'routes', label: 'Ford', attributes: [], rotatable: true, description: 'Place to wade a river: three stepping stones.' },
    { id: 'ferry', kind: 'point', family: 'routes', label: 'Ferry', attributes: [], rotatable: true, description: 'Small boat on the river.' },

    // Points: sites
    { id: 'entrance', kind: 'point', family: 'sites', label: 'Entrance', attributes: [], rotatable: false, description: 'The way into a cave, dungeon or mine: the link to a site map.' },
    { id: 'ruin', kind: 'point', family: 'sites', label: 'Ruin', attributes: [], rotatable: false, description: 'Broken wall. Anything fallen down you can walk around in.' },
    { id: 'tomb', kind: 'point', family: 'sites', label: 'Tomb', attributes: [], rotatable: false, description: 'Tomb, barrow, crypt or graveyard.' },
    { id: 'stones', kind: 'point', family: 'sites', label: 'Standing stones', attributes: [], rotatable: false, description: 'Two standing stones and a lintel: a monument.' },
    { id: 'shrine', kind: 'point', family: 'sites', label: 'Shrine', attributes: [], rotatable: false, description: 'Holy place outside a settlement.' },
    { id: 'lair', kind: 'point', family: 'sites', label: 'Lair', attributes: [], rotatable: false, description: 'Where something dangerous lives. Three claw marks.' },

    // Points: settlements (ring count grades size)
    { id: 'homestead', kind: 'point', family: 'settlements', label: 'Homestead', attributes: [], rotatable: false, description: 'A single farm or dwelling.' },
    { id: 'hamlet', kind: 'point', family: 'settlements', label: 'Hamlet', attributes: SETTLEMENT_ATTRIBUTES, rotatable: false, description: 'A handful of houses. Solid dot.' },
    { id: 'village', kind: 'point', family: 'settlements', label: 'Village', attributes: SETTLEMENT_ATTRIBUTES, rotatable: false, rings: 1, description: 'One ring.' },
    { id: 'town', kind: 'point', family: 'settlements', label: 'Town', attributes: SETTLEMENT_ATTRIBUTES, rotatable: false, rings: 2, description: 'Two rings.' },
    { id: 'city', kind: 'point', family: 'settlements', label: 'City', attributes: SETTLEMENT_ATTRIBUTES, rotatable: false, rings: 3, description: 'Three rings.' },
    { id: 'castle', kind: 'point', family: 'settlements', label: 'Castle', attributes: [], rotatable: false, description: 'Wide crenellated wall with a gate: a castle or walled keep.' },
    { id: 'tower', kind: 'point', family: 'settlements', label: 'Tower', attributes: [], rotatable: false, description: 'Narrow crenellated tower: a fort, watchtower or lone tower.' },
    { id: 'inn', kind: 'point', family: 'settlements', label: 'Inn', attributes: [], rotatable: false, description: 'House with a hanging sign: an inn or waystation.' },

    // Points: write-ins and furniture
    { id: 'place-id', kind: 'point', family: 'write-ins', label: 'Place ID', attributes: [], rotatable: false, description: 'Room or hex ID, such as R3 or 0203. Ties the map to your notes.' },
    { id: 'text', kind: 'point', family: 'write-ins', label: 'Text', attributes: [], rotatable: false, description: 'A name, level tag (L1), stair destination (L3, 1) or scale.' },
    { id: 'north', kind: 'point', family: 'write-ins', label: 'North', attributes: [], rotatable: true, description: 'Arrow pointing up, with an N above it.' },

    // Areas: terrain and water
    { id: 'water', kind: 'area', family: 'terrain', label: 'Water', attributes: [], rotatable: false, description: 'Sea, lake, or the water in a room. Wavy lines.' },
    { id: 'plains', kind: 'area', family: 'terrain', label: 'Plains', attributes: [], rotatable: false, description: 'Grassland, steppe, open country.' },
    { id: 'forest', kind: 'area', family: 'terrain', label: 'Forest', attributes: [], rotatable: false, description: 'Round trees. Draw more for denser woods.' },
    { id: 'jungle', kind: 'area', family: 'terrain', label: 'Jungle', attributes: [], rotatable: false, description: 'Palm trees.' },
    { id: 'hills', kind: 'area', family: 'terrain', label: 'Hills', attributes: [], rotatable: false, description: 'Rounded humps.' },
    { id: 'mountains', kind: 'area', family: 'terrain', label: 'Mountains', attributes: [], rotatable: false, description: 'Pointed peaks.' },
    { id: 'desert', kind: 'area', family: 'terrain', label: 'Desert', attributes: [], rotatable: false, description: 'Sand, dunes and dust.' },
    { id: 'swamp', kind: 'area', family: 'terrain', label: 'Swamp', attributes: [], rotatable: false, description: 'Marsh, bog or fen.' },
    { id: 'ice', kind: 'area', family: 'terrain', label: 'Ice', attributes: [], rotatable: false, description: 'Tundra, glacier or snowfield.' },
];

const MARKS_BY_ID: ReadonlyMap<string, MaplogMarkDef> = new Map(MAPLOG_MARKS.map(mark => [mark.id, mark]));
const ATTRIBUTES_BY_ID: ReadonlyMap<string, MaplogAttributeDef> = new Map(MAPLOG_ATTRIBUTES.map(attr => [attr.id, attr]));

/** The catalogue entry for a mark id, or undefined for an unknown id. */
export function getMaplogMark(id: string): MaplogMarkDef | undefined {
    return MARKS_BY_ID.get(id);
}

export function getMaplogAttribute(id: string): MaplogAttributeDef | undefined {
    return ATTRIBUTES_BY_ID.get(id);
}

/** Attribute definitions a mark accepts, in catalogue order. */
export function maplogAttributesFor(markId: string): MaplogAttributeDef[] {
    const mark = getMaplogMark(markId);
    if (!mark) return [];
    return MAPLOG_ATTRIBUTES.filter(attr => mark.attributes.includes(attr.id));
}

/** The attributes of a mark that are both accepted by it and present in the list, in catalogue order. */
export function acceptedMaplogAttributes(markId: string, attributes: readonly string[] | undefined): MaplogAttributeId[] {
    const mark = getMaplogMark(markId);
    if (!mark || !attributes?.length) return [];
    return MAPLOG_ATTRIBUTES
        .map(attr => attr.id)
        .filter(id => mark.attributes.includes(id) && attributes.includes(id));
}

/** Clamp a grade to a mark's count rule, or return the default when the mark has none. */
export function clampMaplogGrade(markId: string, grade: number | undefined): number | undefined {
    const rule = getMaplogMark(markId)?.grades;
    if (!rule) return undefined;
    const value = Number.isFinite(grade) ? Math.round(grade as number) : rule.default;
    return Math.min(rule.max, Math.max(rule.min, value));
}

/**
 * Marks whose label, id, description or family contain every word of the query.
 * An empty query returns every mark in catalogue order.
 */
export function searchMaplogMarks(query: string, marks: readonly MaplogMarkDef[] = MAPLOG_MARKS): MaplogMarkDef[] {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [...marks];
    return marks.filter(mark => {
        const family = MAPLOG_FAMILIES.find(f => f.id === mark.family)?.label ?? '';
        const haystack = `${mark.id} ${mark.label} ${mark.description} ${family}`.toLowerCase();
        return words.every(word => haystack.includes(word));
    });
}

/** Marks grouped by family in the order the palette shows them. Empty families are left out. */
export function maplogMarksByFamily(marks: readonly MaplogMarkDef[] = MAPLOG_MARKS): { family: (typeof MAPLOG_FAMILIES)[number]; marks: MaplogMarkDef[] }[] {
    return MAPLOG_FAMILIES
        .map(family => ({ family, marks: marks.filter(mark => mark.family === family.id) }))
        .filter(group => group.marks.length > 0);
}
