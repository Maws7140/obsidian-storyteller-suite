// How the network graph looks, and the legend that explains it.
//
// The graph takes its colours from the same timeline theme as the timeline
// (TimelineStyle), and colours nodes by the same keys the timeline groups
// lanes by, so a faction or a city is one colour in both views. Everything
// here is pure: no Obsidian, no DOM, no Cytoscape, so it can be unit tested.

import type { GraphEntityType, RelationshipDirection, RelationshipType } from '../types';
import { GROUP_MEMBERSHIP_LABEL, getRelationshipColor } from './GraphUtils';
import { paletteColorFor } from './TimelineStyle';

export type GraphColorMode = 'type' | 'group' | 'location' | 'culture' | 'status' | 'connections';
export type GraphLayoutName = 'cose' | 'circle' | 'grid' | 'concentric';
export type GraphSpacing = 'compact' | 'balanced' | 'spacious';

/** Everything the "Colour by" dropdown and the "Show" menu control. Saved in settings. */
export interface GraphDisplayOptions {
    colorMode: GraphColorMode;
    layout: GraphLayoutName;
    spacing: GraphSpacing;
    /** Portraits and images fill their node. Off shows the colour instead. */
    showImages: boolean;
    showEdgeLabels: boolean;
    showEnded: boolean;
    showImplied: boolean;
    /** The thin "member of" lines from entities to their groups. */
    showMembership: boolean;
    /** Entities with no visible connection. */
    showIsolated: boolean;
    /** Bigger nodes and stronger rims for better connected entities. */
    sizeByConnections: boolean;
    legendVisible: boolean;
}

export const DEFAULT_GRAPH_DISPLAY: GraphDisplayOptions = {
    colorMode: 'type',
    layout: 'cose',
    spacing: 'balanced',
    showImages: true,
    showEdgeLabels: false,
    showEnded: true,
    showImplied: true,
    showMembership: true,
    showIsolated: true,
    sizeByConnections: true,
    legendVisible: false,
};

export const GRAPH_COLOR_MODES: ReadonlyArray<{ value: GraphColorMode; label: string }> = [
    { value: 'type', label: 'Entity type' },
    { value: 'group', label: 'Group' },
    { value: 'location', label: 'Location' },
    { value: 'culture', label: 'Culture' },
    { value: 'status', label: 'Status' },
    { value: 'connections', label: 'Connections' },
];

export const GRAPH_LAYOUTS: ReadonlyArray<{ value: GraphLayoutName; label: string }> = [
    { value: 'cose', label: 'Force directed' },
    { value: 'circle', label: 'Circle' },
    { value: 'grid', label: 'Grid' },
    { value: 'concentric', label: 'Concentric' },
];

export const GRAPH_SPACINGS: ReadonlyArray<{ value: GraphSpacing; label: string }> = [
    { value: 'compact', label: 'Compact' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'spacious', label: 'Spacious' },
];

/** Force-layout settings per spacing, and the spread factor the other layouts use. */
export function spacingFor(spacing: GraphSpacing): { idealEdgeLength: number; nodeRepulsion: number; spacingFactor: number; minNodeSpacing: number } {
    if (spacing === 'compact') return { idealEdgeLength: 120, nodeRepulsion: 12000, spacingFactor: 1.1, minNodeSpacing: 60 };
    if (spacing === 'spacious') return { idealEdgeLength: 300, nodeRepulsion: 45000, spacingFactor: 2, minNodeSpacing: 150 };
    return { idealEdgeLength: 200, nodeRepulsion: 25000, spacingFactor: 1.5, minNodeSpacing: 100 };
}

const COLOR_MODES = new Set(GRAPH_COLOR_MODES.map(mode => mode.value));
const LAYOUTS = new Set(GRAPH_LAYOUTS.map(layout => layout.value));
const SPACINGS = new Set(GRAPH_SPACINGS.map(spacing => spacing.value));

/** Saved options with anything unknown or missing set back to its default. */
export function sanitizeGraphDisplay(raw: unknown): GraphDisplayOptions {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof GraphDisplayOptions, unknown>>;
    const d = DEFAULT_GRAPH_DISPLAY;
    const flag = (key: keyof GraphDisplayOptions): boolean => typeof value[key] === 'boolean' ? value[key] as boolean : d[key] as boolean;
    return {
        colorMode: COLOR_MODES.has(value.colorMode as GraphColorMode) ? value.colorMode as GraphColorMode : d.colorMode,
        layout: LAYOUTS.has(value.layout as GraphLayoutName) ? value.layout as GraphLayoutName : d.layout,
        spacing: SPACINGS.has(value.spacing as GraphSpacing) ? value.spacing as GraphSpacing : d.spacing,
        showImages: flag('showImages'),
        showEdgeLabels: flag('showEdgeLabels'),
        showEnded: flag('showEnded'),
        showImplied: flag('showImplied'),
        showMembership: flag('showMembership'),
        showIsolated: flag('showIsolated'),
        sizeByConnections: flag('sizeByConnections'),
        legendVisible: flag('legendVisible'),
    };
}

/** The layers the "Show" menu badge counts: what is drawn, not how it is arranged. */
export function activeGraphLayers(options: GraphDisplayOptions): string[] {
    return [
        options.showImages && 'Images',
        options.showEdgeLabels && 'Relationship labels',
        options.showEnded && 'Ended relationships',
        options.showImplied && 'Implied relationships',
        options.showMembership && 'Group membership',
        options.showIsolated && 'Unconnected entities',
    ].filter((name): name is string => !!name);
}

/** Entity type colours (Paul Tol's muted scheme, readable with colour blindness) and shapes. */
export const GRAPH_TYPE_STYLES: Record<GraphEntityType, { label: string; color: string; shape: string }> = {
    character: { label: 'Characters', color: '#CC6677', shape: 'ellipse' },
    location: { label: 'Locations', color: '#44AA99', shape: 'round-rectangle' },
    event: { label: 'Events', color: '#DDCC77', shape: 'diamond' },
    item: { label: 'Items', color: '#88CCEE', shape: 'hexagon' },
    culture: { label: 'Cultures', color: '#AA4499', shape: 'tag' },
    economy: { label: 'Economies', color: '#117733', shape: 'pentagon' },
    magicsystem: { label: 'Magic systems', color: '#332288', shape: 'star' },
    group: { label: 'Groups', color: '#D55E00', shape: 'round-triangle' },
};

/** The colour of "nothing to colour by": no group, no location, no status. */
export const GRAPH_UNSET_COLOR = '#64748B';
export const GRAPH_DECEASED_COLOR = '#6b6b6b';

/** Connection tiers, the same cut-offs the node sizing uses. */
export const CONNECTION_TIERS: ReadonlyArray<{ key: string; label: string; min: number; max: number }> = [
    { key: 'hub', label: 'Hub (10+ connections)', min: 11, max: Infinity },
    { key: 'major', label: 'Major (6–10)', min: 6, max: 10 },
    { key: 'moderate', label: 'Moderate (3–5)', min: 3, max: 5 },
    { key: 'minor', label: 'Minor (1–2)', min: 1, max: 2 },
    { key: 'isolated', label: 'Unconnected', min: 0, max: 0 },
];

export function connectionTier(degree: number): { key: string; label: string; index: number } {
    const index = CONNECTION_TIERS.findIndex(tier => degree >= tier.min && degree <= tier.max);
    const safe = index < 0 ? CONNECTION_TIERS.length - 1 : index;
    return { key: CONNECTION_TIERS[safe].key, label: CONNECTION_TIERS[safe].label, index: safe };
}

/** The fields of an entity the colour modes read. Every entity type has some of them. */
export interface GraphEntityFields {
    groups?: string[];
    status?: string;
    currentLocationId?: string;
    locations?: string[];
    location?: string;
    currentLocation?: string;
    linkedLocations?: string[];
    cultures?: string[];
    linkedCultures?: string[];
    linkedCulture?: string;
    color?: string;
}

export interface GraphColorNode {
    id: string;
    label: string;
    type: GraphEntityType;
    degree: number;
    data: GraphEntityFields;
}

/** Names and colours the colour modes need, from the plugin's entity lists. */
export interface GraphColorContext {
    /** The theme's lane palette, resolved through the cascade like the timeline's. */
    palette: string[];
    /** A group by id or name. */
    group: (idOrName: string) => { id?: string; name: string; color?: string } | undefined;
    /** A location's display name, from its id or name. */
    locationName: (value: string) => string;
    /** A culture's display name, from its id or name. */
    cultureName: (value: string) => string;
}

export interface GraphColorKey {
    key: string;
    label: string;
    color: string;
    /** Sort position in the legend: tiers keep their order, "none" goes last. */
    order?: number;
}

const firstOf = (...values: Array<string | string[] | undefined>): string | undefined => {
    for (const value of values) {
        const first = Array.isArray(value) ? value.find(entry => !!entry?.trim()) : value?.trim();
        if (first) return first;
    }
    return undefined;
};

const UNSET_ORDER = 1e6;

/**
 * What a node is coloured by under a mode, and the colour.
 *
 * Keys and colours follow the timeline's grouping: a group's own colour when
 * it has one, otherwise the palette entry its id hashes to; locations and
 * cultures hash their display name. So the timeline lane for Valewood and the
 * Valewood node are the same colour, under any theme.
 */
export function graphColorKey(node: GraphColorNode, mode: GraphColorMode, context: GraphColorContext): GraphColorKey {
    const data = node.data;
    const palette = context.palette.length ? context.palette : [GRAPH_UNSET_COLOR];
    switch (mode) {
        case 'group': {
            const raw = node.type === 'group' ? (data as { id?: string }).id || node.id : firstOf(data.groups);
            if (!raw) return { key: 'group:none', label: 'No group', color: GRAPH_UNSET_COLOR, order: UNSET_ORDER };
            const group = context.group(raw);
            const id = group?.id || raw;
            return { key: `group:${id}`, label: group?.name || raw, color: group?.color || paletteColorFor(raw, palette) };
        }
        case 'location': {
            const raw = node.type === 'location'
                ? node.label
                : firstOf(data.currentLocationId, data.location, data.currentLocation, data.locations, data.linkedLocations);
            if (!raw) return { key: 'location:none', label: 'No location', color: GRAPH_UNSET_COLOR, order: UNSET_ORDER };
            const name = node.type === 'location' ? raw : context.locationName(raw);
            return { key: `location:${name}`, label: name, color: paletteColorFor(name, palette) };
        }
        case 'culture': {
            const raw = node.type === 'culture'
                ? node.label
                : firstOf(data.cultures, data.linkedCultures, data.linkedCulture);
            if (!raw) return { key: 'culture:none', label: 'No culture', color: GRAPH_UNSET_COLOR, order: UNSET_ORDER };
            const name = node.type === 'culture' ? raw : context.cultureName(raw);
            return { key: `culture:${name}`, label: name, color: paletteColorFor(name, palette) };
        }
        case 'status': {
            const status = data.status?.trim();
            if (!status) return { key: 'status:none', label: 'No status', color: GRAPH_UNSET_COLOR, order: UNSET_ORDER };
            const label = status.charAt(0).toUpperCase() + status.slice(1);
            return { key: `status:${status.toLowerCase()}`, label, color: paletteColorFor(status.toLowerCase(), palette) };
        }
        case 'connections': {
            const tier = connectionTier(node.degree);
            const color = tier.key === 'isolated' ? GRAPH_UNSET_COLOR : palette[tier.index % palette.length];
            return { key: `connections:${tier.key}`, label: tier.label, color, order: tier.index };
        }
        case 'type':
        default: {
            const style = GRAPH_TYPE_STYLES[node.type];
            return { key: `type:${node.type}`, label: style.label, color: style.color, order: Object.keys(GRAPH_TYPE_STYLES).indexOf(node.type) };
        }
    }
}

export interface GraphLegendEntry {
    key: string;
    label: string;
    color: string;
    count: number;
    /** Cytoscape node shape, for entries that stand for an entity type. */
    shape?: string;
    /** Line pattern, for entries that describe edges. */
    line?: 'solid' | 'dashed' | 'dotted' | 'arrow' | 'thin';
}

export interface GraphLegendEdge {
    relationshipType: RelationshipType;
    direction?: RelationshipDirection;
    ended?: boolean;
    implied?: boolean;
    label?: string;
}

export interface GraphLegend {
    colorTitle: string;
    colors: GraphLegendEntry[];
    /** Entity shapes present. Left empty when colouring by type, where the colour entries carry the shapes. */
    shapes: GraphLegendEntry[];
    relationships: GraphLegendEntry[];
    lines: GraphLegendEntry[];
    deceased: number;
}

function sortEntries<T extends { label: string; count: number; order?: number }>(entries: T[]): T[] {
    return entries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.count - a.count || a.label.localeCompare(b.label));
}

/** "loyal-to" as "Loyal to". */
export function relationshipLabel(kind: string): string {
    const text = kind.replace(/-/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The legend for what is on screen now: only the colours, shapes,
 * relationship kinds and line styles that some visible node or edge uses,
 * each with how many use it. Rebuilt after every filter, colour or theme
 * change, so it never describes something the graph is not showing.
 */
export function buildGraphLegend(
    nodes: Array<GraphColorNode & { colorKey: GraphColorKey; deceased?: boolean }>,
    edges: GraphLegendEdge[],
    mode: GraphColorMode,
): GraphLegend {
    const colors = new Map<string, GraphLegendEntry & { order?: number }>();
    const shapes = new Map<GraphEntityType, GraphLegendEntry & { order?: number }>();
    let deceased = 0;
    nodes.forEach(node => {
        const key = node.colorKey;
        const entry = colors.get(key.key);
        if (entry) entry.count++;
        else colors.set(key.key, {
            key: key.key, label: key.label, color: key.color, count: 1, order: key.order,
            shape: mode === 'type' ? GRAPH_TYPE_STYLES[node.type].shape : undefined,
        });
        const type = shapes.get(node.type);
        if (type) type.count++;
        else shapes.set(node.type, {
            key: `type:${node.type}`, label: GRAPH_TYPE_STYLES[node.type].label, color: GRAPH_TYPE_STYLES[node.type].color,
            count: 1, shape: GRAPH_TYPE_STYLES[node.type].shape, order: Object.keys(GRAPH_TYPE_STYLES).indexOf(node.type),
        });
        if (node.deceased) deceased++;
    });

    const relationships = new Map<string, GraphLegendEntry>();
    const lineCounts = { arrow: 0, mutual: 0, ended: 0, implied: 0, membership: 0 };
    edges.forEach(edge => {
        if (edge.label === GROUP_MEMBERSHIP_LABEL) { lineCounts.membership++; return; }
        const kind = edge.relationshipType;
        const entry = relationships.get(kind);
        if (entry) entry.count++;
        else relationships.set(kind, { key: `rel:${kind}`, label: relationshipLabel(kind), color: getRelationshipColor(kind), count: 1, line: 'solid' });
        if (edge.direction === 'mutual') lineCounts.mutual++;
        else lineCounts.arrow++;
        if (edge.ended) lineCounts.ended++;
        if (edge.implied) lineCounts.implied++;
    });

    const lines: GraphLegendEntry[] = [];
    const neutral = GRAPH_UNSET_COLOR;
    if (lineCounts.arrow) lines.push({ key: 'line:arrow', label: 'One way (arrow from the owner)', color: neutral, count: lineCounts.arrow, line: 'arrow' });
    if (lineCounts.mutual) lines.push({ key: 'line:mutual', label: 'Mutual (plain line)', color: neutral, count: lineCounts.mutual, line: 'solid' });
    if (lineCounts.ended) lines.push({ key: 'line:ended', label: 'Ended', color: neutral, count: lineCounts.ended, line: 'dashed' });
    if (lineCounts.implied) lines.push({ key: 'line:implied', label: 'Implied inverse', color: neutral, count: lineCounts.implied, line: 'dotted' });
    if (lineCounts.membership) lines.push({ key: 'line:membership', label: 'Member of a group', color: neutral, count: lineCounts.membership, line: 'thin' });

    const title = GRAPH_COLOR_MODES.find(entry => entry.value === mode)?.label || 'Entity type';
    return {
        colorTitle: `Colour: ${title.toLowerCase()}`,
        colors: sortEntries(Array.from(colors.values())),
        shapes: mode === 'type' ? [] : sortEntries(Array.from(shapes.values())),
        relationships: Array.from(relationships.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
        lines,
        deceased,
    };
}
