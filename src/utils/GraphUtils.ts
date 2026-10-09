// Utilities for processing network graph data and relationships

import { Character, Location, Event, PlotItem, Culture, Economy, MagicSystem, Group, TypedRelationship, RelationshipType, RelationshipDirection, GraphNode, GraphEdge } from '../types';
import { getOwners } from './ItemOwnership';
import { inverseKindOf, resolveDirection } from './RelationshipKinds';

/** Label of the structural edge drawn from a character to each group it belongs to */
export const GROUP_MEMBERSHIP_LABEL = 'member of';

// Helper function to check if an edge already exists
// Checks source, target, relationshipType, label and the R-Map flags, so that an
// ended relationship and a live one with the same words are both kept.
function edgeExists(
    edges: GraphEdge[],
    source: string,
    target: string,
    relationshipType: RelationshipType,
    label?: string,
    variant: { ended?: boolean; direction?: RelationshipDirection } = {}
): boolean {
    return edges.some(e =>
        e.source === source &&
        e.target === target &&
        e.relationshipType === relationshipType &&
        e.label === label &&
        Boolean(e.ended) === Boolean(variant.ended) &&
        e.direction === variant.direction
    );
}

// Extract all relationships from a collection of entities
// Handles both old string[] format and new TypedRelationship[] format.
// Groups are optional: when passed, they become nodes and membership edges are drawn.
export function extractAllRelationships(
    characters: Character[],
    locations: Location[],
    events: Event[],
    items: PlotItem[],
    cultures: Culture[] = [],
    economies: Economy[] = [],
    magicSystems: MagicSystem[] = [],
    groups: Group[] = []
): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const entityMap = new Map<string, GraphNode>();

    // Build entity lookup map
    characters.forEach(c => entityMap.set(c.id || c.name, {
        id: c.id || c.name,
        label: c.name,
        type: 'character',
        data: c
    }));
    locations.forEach(l => entityMap.set(l.id || l.name, {
        id: l.id || l.name,
        label: l.name,
        type: 'location',
        data: l
    }));
    events.forEach(e => entityMap.set(e.id || e.name, {
        id: e.id || e.name,
        label: e.name,
        type: 'event',
        data: e
    }));
    items.forEach(i => entityMap.set(i.id || i.name, {
        id: i.id || i.name,
        label: i.name,
        type: 'item',
        data: i
    }));
    cultures.forEach(c => entityMap.set(c.id || c.name, {
        id: c.id || c.name,
        label: c.name,
        type: 'culture',
        data: c
    }));
    economies.forEach(e => entityMap.set(e.id || e.name, {
        id: e.id || e.name,
        label: e.name,
        type: 'economy',
        data: e
    }));
    magicSystems.forEach(m => entityMap.set(m.id || m.name, {
        id: m.id || m.name,
        label: m.name,
        type: 'magicsystem',
        data: m
    }));
    groups.forEach(g => entityMap.set(g.id || g.name, {
        id: g.id || g.name,
        label: g.name,
        type: 'group',
        data: g
    }));

    // Group membership: a character's groups list, and a group's character members.
    // Both sources are merged and de-duplicated into one "member of" edge per pair.
    characters.forEach(c => {
        const sourceId = c.id || c.name;
        for (const groupRef of Array.isArray(c.groups) ? c.groups : []) {
            const targetId = resolveEntityId(groupRef, entityMap);
            if (targetId && entityMap.get(targetId)?.type === 'group' && !edgeExists(edges, sourceId, targetId, 'neutral', GROUP_MEMBERSHIP_LABEL, { direction: 'to' })) {
                edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: GROUP_MEMBERSHIP_LABEL, direction: 'to' });
            }
        }
    });
    groups.forEach(g => {
        const groupId = g.id || g.name;
        for (const member of Array.isArray(g.members) ? g.members : []) {
            if (member.type !== 'character') continue;
            const sourceId = resolveEntityId(member.id || member.name || '', entityMap);
            if (sourceId && entityMap.get(sourceId)?.type === 'character' && !edgeExists(edges, sourceId, groupId, 'neutral', GROUP_MEMBERSHIP_LABEL, { direction: 'to' })) {
                edges.push({ source: sourceId, target: groupId, relationshipType: 'neutral', label: GROUP_MEMBERSHIP_LABEL, direction: 'to' });
            }
        }
    });

    // Extract edges from each entity type
    const allEntities = [
        ...characters.map(c => ({ entity: c, type: 'character' as const })),
        ...locations.map(l => ({ entity: l, type: 'location' as const })),
        ...events.map(e => ({ entity: e, type: 'event' as const })),
        ...items.map(i => ({ entity: i, type: 'item' as const })),
        ...cultures.map(c => ({ entity: c, type: 'culture' as const })),
        ...economies.map(e => ({ entity: e, type: 'economy' as const })),
        ...magicSystems.map(m => ({ entity: m, type: 'magicsystem' as const }))
    ];

    allEntities.forEach(({ entity, type }) => {
        const sourceId = entity.id || entity.name;

        // Process typed connections (common to all entities)
        if (entity.connections && Array.isArray(entity.connections)) {
            entity.connections.forEach(conn => {
                const targetId = resolveEntityId(conn.target, entityMap);
                if (!targetId) return;
                const direction = resolveDirection(conn);
                const ended = conn.ended === true;
                const variant = { ended, direction };
                if (edgeExists(edges, sourceId, targetId, conn.type, conn.label, variant)) return;
                // A mutual line is one line: skip it when the other side already drew the same one
                if (direction === 'mutual' && edgeExists(edges, targetId, sourceId, conn.type, conn.label, variant)) return;
                edges.push({
                    source: sourceId,
                    target: targetId,
                    relationshipType: conn.type,
                    label: conn.label,
                    direction,
                    ...(ended ? { ended: true } : {})
                });
            });
        }

        // Process legacy character relationships
        if (type === 'character' && (entity).relationships) {
            const char = entity;
            // Ensure relationships is an array before iterating
            const relationships = Array.isArray(char.relationships) ? char.relationships : [];
            relationships.forEach(rel => {
                if (typeof rel === 'string') {
                    // Legacy string relationship
                    const targetId = resolveEntityId(rel, entityMap);
                    if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', undefined)) {
                        edges.push({
                            source: sourceId,
                            target: targetId,
                            relationshipType: 'neutral',
                            label: undefined
                        });
                    }
                } else if (rel && typeof rel === 'object' && 'target' in rel) {
                    // TypedRelationship
                    const targetId = resolveEntityId(rel.target, entityMap);
                    if (targetId && !edgeExists(edges, sourceId, targetId, rel.type, rel.label)) {
                        edges.push({
                            source: sourceId,
                            target: targetId,
                            relationshipType: rel.type,
                            label: rel.label
                        });
                    }
                }
            });
        }

        // Extract implicit connections from entity fields
        // Characters -> locations
        if (type === 'character' && (entity).locations) {
            const charLocations = (entity).locations;
            const locations = Array.isArray(charLocations) ? charLocations : [];
            locations.forEach(locName => {
                const targetId = resolveEntityId(locName, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'associated')) {
                    edges.push({
                        source: sourceId,
                        target: targetId,
                        relationshipType: 'neutral',
                        label: 'associated'
                    });
                }
            });
        }

        // Characters -> events
        if (type === 'character' && (entity).events) {
            const charEvents = (entity).events;
            const events = Array.isArray(charEvents) ? charEvents : [];
            events.forEach(evtName => {
                const targetId = resolveEntityId(evtName, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'involved')) {
                    edges.push({
                        source: sourceId,
                        target: targetId,
                        relationshipType: 'neutral',
                        label: 'involved'
                    });
                }
            });
        }

        // Events -> characters
        if (type === 'event' && (entity).characters) {
            const evtChars = (entity).characters;
            const eventCharacters = Array.isArray(evtChars) ? evtChars : [];
            eventCharacters.forEach(charName => {
                const targetId = resolveEntityId(charName, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'involved')) {
                    edges.push({
                        source: sourceId,
                        target: targetId,
                        relationshipType: 'neutral',
                        label: 'involved'
                    });
                }
            });
        }

        // Events -> locations
        if (type === 'event' && (entity).location) {
            const targetId = resolveEntityId((entity).location, entityMap);
            if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'occurred at')) {
                edges.push({
                    source: sourceId,
                    target: targetId,
                    relationshipType: 'neutral',
                    label: 'occurred at'
                });
            }
        }

        // Items -> owner (character)
        for (const ownerName of type === 'item' ? getOwners(entity) : []) {
            const targetId = resolveEntityId(ownerName, entityMap);
            if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'owned by')) {
                edges.push({
                    source: sourceId,
                    target: targetId,
                    relationshipType: 'neutral',
                    label: 'owned by'
                });
            }
        }

        // Items -> location
        if (type === 'item' && (entity).currentLocation) {
            const targetId = resolveEntityId((entity).currentLocation, entityMap);
            if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'located at')) {
                edges.push({
                    source: sourceId,
                    target: targetId,
                    relationshipType: 'neutral',
                    label: 'located at'
                });
            }
        }

        // Items -> events
        if (type === 'item' && (entity).associatedEvents) {
            const itemEvents = (entity).associatedEvents;
            const associatedEvents = Array.isArray(itemEvents) ? itemEvents : [];
            associatedEvents.forEach(evtName => {
                const targetId = resolveEntityId(evtName, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'featured in')) {
                    edges.push({
                        source: sourceId,
                        target: targetId,
                        relationshipType: 'neutral',
                        label: 'featured in'
                    });
                }
            });
        }

        // Locations -> parent location
        if (type === 'location' && (entity).parentLocationId) {
            const targetId = resolveEntityId((entity).parentLocationId, entityMap);
            if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'within')) {
                edges.push({
                    source: sourceId,
                    target: targetId,
                    relationshipType: 'neutral',
                    label: 'within'
                });
            }
        }

        // Character -> Owned Items
        if (type === 'character' && (entity).ownedItems) {
            const charOwnedItems = (entity).ownedItems;
            const ownedItems = Array.isArray(charOwnedItems) ? charOwnedItems : [];
            ownedItems.forEach(itemId => {
                const targetId = resolveEntityId(itemId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'owns')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'owns' });
                }
            });
        }

        // Character -> Cultures
        if (type === 'character' && (entity).cultures) {
            const charCultures = (entity).cultures;
            const cultures = Array.isArray(charCultures) ? charCultures : [];
            cultures.forEach(cultureId => {
                const targetId = resolveEntityId(cultureId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'belongs to')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'belongs to' });
                }
            });
        }

        // Character -> Magic Systems
        if (type === 'character' && (entity).magicSystems) {
            const charMagicSystems = (entity).magicSystems;
            const magicSystems = Array.isArray(charMagicSystems) ? charMagicSystems : [];
            magicSystems.forEach(magicId => {
                const targetId = resolveEntityId(magicId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'uses')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'uses' });
                }
            });
        }

        // Event -> Items
        if (type === 'event' && (entity).items) {
            const evtItems = (entity).items;
            const eventItems = Array.isArray(evtItems) ? evtItems : [];
            eventItems.forEach(itemId => {
                const targetId = resolveEntityId(itemId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'involves')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'involves' });
                }
            });
        }

        // Event -> Cultures
        if (type === 'event' && (entity).cultures) {
            const evtCultures = (entity).cultures;
            const eventCultures = Array.isArray(evtCultures) ? evtCultures : [];
            eventCultures.forEach(cultureId => {
                const targetId = resolveEntityId(cultureId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'involves')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'involves' });
                }
            });
        }

        // Event -> Magic Systems
        if (type === 'event' && (entity).magicSystems) {
            const evtMagicSystems = (entity).magicSystems;
            const eventMagicSystems = Array.isArray(evtMagicSystems) ? evtMagicSystems : [];
            eventMagicSystems.forEach(magicId => {
                const targetId = resolveEntityId(magicId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'involves')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'involves' });
                }
            });
        }

        // Culture -> Linked Locations
        if (type === 'culture' && (entity).linkedLocations) {
            const cultLocations = (entity).linkedLocations;
            const cultureLocations = Array.isArray(cultLocations) ? cultLocations : [];
            cultureLocations.forEach(locId => {
                const targetId = resolveEntityId(locId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'present in')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'present in' });
                }
            });
        }

        // Culture -> Linked Characters
        if (type === 'culture' && (entity).linkedCharacters) {
            const cultCharacters = (entity).linkedCharacters;
            const cultureCharacters = Array.isArray(cultCharacters) ? cultCharacters : [];
            cultureCharacters.forEach(charId => {
                const targetId = resolveEntityId(charId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'includes')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'includes' });
                }
            });
        }

        // Culture -> Linked Events
        if (type === 'culture' && (entity).linkedEvents) {
            const cultEvents = (entity).linkedEvents;
            const cultureEvents = Array.isArray(cultEvents) ? cultEvents : [];
            cultureEvents.forEach(evtId => {
                const targetId = resolveEntityId(evtId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'related to')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'related to' });
                }
            });
        }

        // Economy -> Linked Locations
        if (type === 'economy' && (entity).linkedLocations) {
            const econLocations = (entity).linkedLocations;
            const economyLocations = Array.isArray(econLocations) ? econLocations : [];
            economyLocations.forEach(locId => {
                const targetId = resolveEntityId(locId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'active in')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'active in' });
                }
            });
        }

        // MagicSystem -> Linked Locations
        if (type === 'magicsystem' && (entity).linkedLocations) {
            const magicSysLocations = (entity).linkedLocations;
            const magicLocations = Array.isArray(magicSysLocations) ? magicSysLocations : [];
            magicLocations.forEach(locId => {
                const targetId = resolveEntityId(locId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'practiced in')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'practiced in' });
                }
            });
        }

        // MagicSystem -> Linked Characters
        if (type === 'magicsystem' && (entity).linkedCharacters) {
            const magicSysCharacters = (entity).linkedCharacters;
            const magicCharacters = Array.isArray(magicSysCharacters) ? magicSysCharacters : [];
            magicCharacters.forEach(charId => {
                const targetId = resolveEntityId(charId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'used by')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'used by' });
                }
            });
        }

        // MagicSystem -> Linked Events
        if (type === 'magicsystem' && (entity).linkedEvents) {
            const magicSysEvents = (entity).linkedEvents;
            const magicEvents = Array.isArray(magicSysEvents) ? magicSysEvents : [];
            magicEvents.forEach(evtId => {
                const targetId = resolveEntityId(evtId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'featured in')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'featured in' });
                }
            });
        }

        // MagicSystem -> Linked Items
        if (type === 'magicsystem' && (entity).linkedItems) {
            const magicSysItems = (entity).linkedItems;
            const magicItems = Array.isArray(magicSysItems) ? magicSysItems : [];
            magicItems.forEach(itemId => {
                const targetId = resolveEntityId(itemId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'associated with')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'associated with' });
                }
            });
        }
    });

    return edges;
}

// Build bidirectional edges where appropriate.
// We intentionally do not auto-mirror typed relationships here. EntitySyncService already
// mirrors the relationship onto the counterpart character, and the renderer collapses
// matching pairs into a single bidirectional arrow. Auto-mirroring here produced a second
// labeled arrow on top of the original, which was the "two arrows for family" bug.
export function buildBidirectionalEdges(edges: GraphEdge[]): GraphEdge[] {
    return edges;
}

// Canonical rules for reciprocal neutral relationships
// Defines which direction and label should be kept when we have semantically reciprocal edges
interface CanonicalRule {
    preferred: {
        sourceType: 'character' | 'location' | 'event' | 'item' | 'culture' | 'economy' | 'magicsystem';
        targetType: 'character' | 'location' | 'event' | 'item' | 'culture' | 'economy' | 'magicsystem';
        label: string;
    };
    redundant: {
        sourceType: 'character' | 'location' | 'event' | 'item' | 'culture' | 'economy' | 'magicsystem';
        targetType: 'character' | 'location' | 'event' | 'item' | 'culture' | 'economy' | 'magicsystem';
        label: string;
    };
}

const CANONICAL_NEUTRAL_RELATIONSHIP_RULES: CanonicalRule[] = [
    {
        preferred: { sourceType: 'character', targetType: 'item', label: 'owns' },
        redundant: { sourceType: 'item', targetType: 'character', label: 'owned by' }
    },
    {
        preferred: { sourceType: 'character', targetType: 'event', label: 'involved' },
        redundant: { sourceType: 'event', targetType: 'character', label: 'involved' }
    }
];

// Filter out redundant reciprocal edges based on canonical rules
// This prevents showing duplicate paths for semantically reciprocal relationships
export function filterRedundantReciprocalEdges(
    edges: GraphEdge[],
    entityMap: Map<string, GraphNode>
): GraphEdge[] {
    const filteredEdges: GraphEdge[] = [];

    for (const edge of edges) {
        let isRedundant = false;

        // Check if this edge matches any redundant pattern
        for (const rule of CANONICAL_NEUTRAL_RELATIONSHIP_RULES) {
            const sourceNode = entityMap.get(edge.source);
            const targetNode = entityMap.get(edge.target);

            if (!sourceNode || !targetNode) continue;

            // Check if this edge matches the redundant pattern
            if (
                edge.relationshipType === 'neutral' &&
                sourceNode.type === rule.redundant.sourceType &&
                targetNode.type === rule.redundant.targetType &&
                edge.label === rule.redundant.label
            ) {
                // Check if the preferred edge exists
                const preferredEdgeExists = edges.some(e => {
                    const eSourceNode = entityMap.get(e.source);
                    const eTargetNode = entityMap.get(e.target);
                    return (
                        e.relationshipType === 'neutral' &&
                        e.source === edge.target && // Reversed source/target
                        e.target === edge.source &&
                        eSourceNode?.type === rule.preferred.sourceType &&
                        eTargetNode?.type === rule.preferred.targetType &&
                        e.label === rule.preferred.label
                    );
                });

                // If preferred edge exists, mark this as redundant
                if (preferredEdgeExists) {
                    isRedundant = true;
                    break;
                }
            }
        }

        // Only keep non-redundant edges
        if (!isRedundant) {
            filteredEdges.push(edge);
        }
    }

    return filteredEdges;
}

// Resolve entity name/id to actual entity id using lookup map
function resolveEntityId(nameOrId: unknown, entityMap: Map<string, GraphNode>): string | null {
    // Coerce common non-string shapes: typed relationship objects, wikilinks, numbers
    let key: string | null = null;
    if (typeof nameOrId === 'string') {
        key = nameOrId;
    } else if (nameOrId && typeof nameOrId === 'object') {
        const obj = nameOrId as { target?: unknown; id?: unknown; name?: unknown };
        if (typeof obj.target === 'string') key = obj.target;
        else if (typeof obj.id === 'string') key = obj.id;
        else if (typeof obj.name === 'string') key = obj.name;
    } else if (typeof nameOrId === 'number') {
        key = String(nameOrId);
    }

    if (!key) return null;

    // Strip wikilink brackets if present: [[Name]] or [[Name|alias]]
    const stripped = key.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
    if (!stripped) return null;

    // Try direct match first (by id or name)
    if (entityMap.has(stripped)) {
        return stripped;
    }

    // Try case-insensitive name match
    const lowerName = stripped.toLowerCase();
    for (const [id, node] of entityMap.entries()) {
        if (typeof node.label === 'string' && node.label.toLowerCase() === lowerName) {
            return id;
        }
    }

    return null;
}

// Resolve entity by id or name
export function resolveEntityById(
    id: string,
    entities: (Character | Location | Event | PlotItem)[]
): Character | Location | Event | PlotItem | null {
    // Try exact id match
    let found = entities.find(e => e.id === id || e.name === id);
    if (found) return found;

    // Try case-insensitive name match
    const lowerName = id.toLowerCase();
    found = entities.find(e => e.name.toLowerCase() === lowerName);
    return found || null;
}

// Get color for relationship type (Obsidian theme-aware)
export function getRelationshipColor(type: RelationshipType): string {
    const colors: Record<RelationshipType, string> = {
        'family': '#3b82f6',     // blue
        'parent': '#3b82f6',     // blue (family)
        'child': '#60a5fa',      // lighter blue (family)
        'sibling': '#38bdf8',    // sky (family)
        'spouse': '#f472b6',     // light pink (family)
        'romantic': '#ec4899',   // pink
        'loves': '#db2777',      // deep pink
        'desires': '#e11d48',    // rose
        'wants': '#fb923c',      // light orange
        'hates': '#b91c1c',      // dark red
        'fears': '#6d28d9',      // violet
        'ally': '#4ade80',       // green
        'mentor': '#a855f7',     // purple
        'owes': '#ca8a04',       // dark gold
        'employs': '#84cc16',    // lime
        'serves': '#14b8a6',     // teal
        'loyal-to': '#22c55e',   // emerald
        'enemy': '#ef4444',      // red
        'rival': '#f97316',      // orange
        'betrayed': '#9f1239',   // crimson
        'acquaintance': '#94a3b8', // gray
        'secret': '#475569',     // dark slate
        'neutral': '#64748b',    // slate
        'custom': '#eab308'      // yellow
    };
    return colors[type] || colors.neutral;
}

// Get shape for entity type
export function getEntityShape(type: GraphNode['type']): string {
    const shapes: Record<string, string> = {
        'character': 'ellipse',
        'location': 'round-rectangle',
        'event': 'diamond',
        'item': 'round-hexagon',
        'culture': 'tag',
        'economy': 'pentagon',
        'magicsystem': 'star',
        'group': 'round-triangle'
    };
    return shapes[type] || 'ellipse';
}

// ── R-Map helpers ───────────────────────────────────────────────────────────

/** Status values that mean a character has died. Matched on the leading word. */
const DECEASED_STATUS_PATTERN = /^(dead|deceased|killed|slain|died)\b/i;

/** True when a character's status marks them as dead (kept on the map, crossed out). */
export function isDeceasedStatus(status: string | undefined | null): boolean {
    return typeof status === 'string' && DECEASED_STATUS_PATTERN.test(status.trim());
}

/**
 * R-Map minimum notation under a character's name: age and gender, when present.
 * Returns '' when neither is set, e.g. "34 · female".
 */
export function characterSubtitle(character: { age?: unknown; gender?: unknown }): string {
    const parts = [character.age, character.gender]
        .map(value => (typeof value === 'string' || typeof value === 'number') ? String(value).trim() : '')
        .filter(Boolean);
    return parts.join(' · ');
}

/**
 * Stable element id for an edge. Ended and implied edges get their own ids, so an
 * ended relationship never collides with a live one that has the same words.
 */
export function graphEdgeId(edge: GraphEdge): string {
    const flags = `${edge.ended ? '#ended' : ''}${edge.implied ? '#implied' : ''}`;
    return `${edge.source}-${edge.target}-${edge.relationshipType}-${edge.label || ''}${flags}`;
}

/**
 * Add the inverse of each stored parent/child relationship, unless the other side
 * already states it. A parent stored on A ("A's parent is B") is drawn as a
 * dotted child edge from B back to A. Implied edges are marked `implied` so the
 * renderer can draw them differently from what the note actually says.
 */
export function withImpliedInverseEdges(edges: GraphEdge[]): GraphEdge[] {
    const out = [...edges];
    for (const edge of edges) {
        const inverse = inverseKindOf(edge.relationshipType);
        if (!inverse || edge.implied) continue;
        const exists = out.some(e =>
            e.source === edge.target &&
            e.target === edge.source &&
            e.relationshipType === inverse &&
            Boolean(e.ended) === Boolean(edge.ended)
        );
        if (exists) continue;
        out.push({
            source: edge.target,
            target: edge.source,
            relationshipType: inverse,
            label: edge.label,
            direction: 'to',
            ...(edge.ended ? { ended: true } : {}),
            implied: true
        });
    }
    return out;
}

/** Shape of a Cytoscape element as the renderer consumes it. */
export interface CytoscapeElement {
    data: Record<string, unknown>;
}

/**
 * Build Cytoscape elements from extracted nodes and edges. Shared by the initial
 * render and refresh so both carry the same data (degree, R-Map flags, ids).
 */
export function buildCytoscapeElements(nodes: GraphNode[], edges: GraphEdge[]): CytoscapeElement[] {
    const degrees = new Map<string, number>();
    nodes.forEach(node => degrees.set(node.id, 0));
    edges.forEach(edge => {
        degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
        degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    });

    const nodeElements: CytoscapeElement[] = nodes.map(node => {
        const isCharacter = node.type === 'character';
        const character = isCharacter ? (node.data as Character) : null;
        return {
            data: {
                id: node.id,
                label: node.label,
                type: node.type,
                entityData: node.data,
                imageUrl: node.imageUrl,
                degree: degrees.get(node.id) || 0,
                deceased: character ? isDeceasedStatus(character.status) : false,
                subtitle: character ? characterSubtitle(character) : ''
            }
        };
    });

    const edgeElements: CytoscapeElement[] = edges.map(edge => ({
        data: {
            id: graphEdgeId(edge),
            source: edge.source,
            target: edge.target,
            relationshipType: edge.relationshipType,
            label: edge.label,
            // Structural edges (owns, located at, ...) carry no direction and keep their arrows
            direction: edge.direction,
            ended: edge.ended === true,
            implied: edge.implied === true
        }
    }));

    return [...nodeElements, ...edgeElements];
}

// Migrate legacy string relationships to typed format
export function migrateStringRelationshipsToTyped(relationships: string[]): TypedRelationship[] {
    return relationships.map(rel => ({
        target: rel,
        type: 'neutral',
        label: undefined
    }));
}

// Check if relationships array contains typed relationships
export function hasTypedRelationships(relationships: (string | TypedRelationship)[]): boolean {
    return relationships.some(rel => typeof rel === 'object' && 'type' in rel);
}

// Normalize relationships array to TypedRelationship[]
export function normalizeRelationships(relationships: (string | TypedRelationship)[]): TypedRelationship[] {
    return relationships.map(rel => {
        if (typeof rel === 'string') {
            return {
                target: rel,
                type: 'neutral',
                label: undefined
            };
        }
        return rel;
    });
}

