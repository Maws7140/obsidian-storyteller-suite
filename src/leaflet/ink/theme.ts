/**
 * Map Ink theme: the entity colours and glyphs shared by every token on a map.
 *
 * ENTITY_COLORS are the disc colours of Token markers. Each one keeps a white
 * glyph readable on both dark and parchment maps. ENTITY_GLYPHS are Lucide-style
 * bodies on a 24 by 24 grid, drawn with currentColor and stroke only.
 *
 * Pure TypeScript: no Obsidian or DOM imports, and no imports from outside this folder.
 */

export type EntityTokenType =
    | 'character'
    | 'location'
    | 'item'
    | 'event'
    | 'group'
    | 'encounter'
    | 'scene'
    | 'culture'
    | 'economy'
    | 'magic'
    | 'reference'
    | 'portal'
    | 'default';

export const ENTITY_TOKEN_TYPES: readonly EntityTokenType[] = [
    'character',
    'location',
    'item',
    'event',
    'group',
    'encounter',
    'scene',
    'culture',
    'economy',
    'magic',
    'reference',
    'portal',
    'default',
];

/** Disc colour per entity type. White glyphs on these reach at least 4.5:1 contrast. */
export const ENTITY_COLORS: Readonly<Record<EntityTokenType, string>> = {
    character: '#b84a3e',
    location: '#2c6aa8',
    item: '#9c6b08',
    event: '#7b4fb0',
    group: '#327544',
    encounter: '#8e1f3a',
    scene: '#b4487f',
    culture: '#7a5230',
    economy: '#6b7d1d',
    magic: '#17808f',
    reference: '#5b6b7d',
    portal: '#4f46b8',
    default: '#6b7280',
};

/** Lucide-style inner SVG per entity type, on a 24 by 24 grid. Colours: currentColor or none only. */
export const ENTITY_GLYPHS: Readonly<Record<EntityTokenType, string>> = {
    character: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    location: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    item: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
    event: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    group: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    encounter: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
    scene: '<rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
    culture: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7"/><path d="M12 2 20 7H4z"/>',
    economy: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
    magic: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>',
    reference: '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
    portal: '<path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M14 12h.01"/><path d="M22 20h-3"/>',
    default: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
};

/** Aliases from the spellings used across the plugin to the token types. */
const TYPE_ALIASES: Readonly<Record<string, EntityTokenType>> = {
    character: 'character',
    characters: 'character',
    person: 'character',
    location: 'location',
    locations: 'location',
    item: 'item',
    items: 'item',
    plotitem: 'item',
    event: 'event',
    events: 'event',
    group: 'group',
    groups: 'group',
    encounter: 'encounter',
    scene: 'scene',
    scenes: 'scene',
    culture: 'culture',
    cultures: 'culture',
    economy: 'economy',
    economies: 'economy',
    magic: 'magic',
    magicsystem: 'magic',
    reference: 'reference',
    references: 'reference',
    portal: 'portal',
};

/**
 * The token type for any spelling of an entity type. "magicSystem", "magic-system"
 * and "magic_system" all give "magic". Unknown types give "default".
 */
export function entityTokenType(type: string | null | undefined): EntityTokenType {
    const key = String(type ?? '').toLowerCase().replace(/[^a-z]/g, '');
    return TYPE_ALIASES[key] ?? 'default';
}

/** Disc colour for an entity type. */
export function entityColor(type: string | null | undefined): string {
    return ENTITY_COLORS[entityTokenType(type)];
}

/** Inner SVG body of the glyph for an entity type. */
export function entityGlyph(type: string | null | undefined): string {
    return ENTITY_GLYPHS[entityTokenType(type)];
}
