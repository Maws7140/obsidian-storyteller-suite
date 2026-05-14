// Utilities for processing network graph data and relationships

import { Character, Location, Event, PlotItem, Culture, Economy, MagicSystem, TypedRelationship, RelationshipType, GraphNode, GraphEdge } from '../types';

// Helper function to check if an edge already exists
// Checks source, target, relationshipType, and label to ensure uniqueness
function edgeExists(edges: GraphEdge[], source: string, target: string, relationshipType: RelationshipType, label?: string): boolean {
    return edges.some(e => 
        e.source === source && 
        e.target === target && 
        e.relationshipType === relationshipType && 
        e.label === label
    );
}

// Extract all relationships from a collection of entities
// Handles both old string[] format and new TypedRelationship[] format
export function extractAllRelationships(
    characters: Character[],
    locations: Location[],
    events: Event[],
    items: PlotItem[],
    cultures: Culture[] = [],
    economies: Economy[] = [],
    magicSystems: MagicSystem[] = []
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
                if (targetId && !edgeExists(edges, sourceId, targetId, conn.type, conn.label)) {
                    edges.push({
                        source: sourceId,
                        target: targetId,
                        relationshipType: conn.type,
                        label: conn.label
                    });
                }
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
        if (type === 'item' && (entity).currentOwner) {
            const targetId = resolveEntityId((entity).currentOwner, entityMap);
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
        if (type === 'location' && (entity).parentLocation) {
            const targetId = resolveEntityId((entity).parentLocation, entityMap);
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
function resolveEntityId(nameOrId: string, entityMap: Map<string, GraphNode>): string | null {
    // Try direct match first (by id or name)
    if (entityMap.has(nameOrId)) {
        return nameOrId;
    }

    // Try case-insensitive name match
    const lowerName = nameOrId.toLowerCase();
    for (const [id, node] of entityMap.entries()) {
        if (node.label.toLowerCase() === lowerName) {
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
        'ally': '#4ade80',       // green
        'enemy': '#ef4444',      // red
        'family': '#3b82f6',     // blue
        'rival': '#f97316',      // orange
        'romantic': '#ec4899',   // pink
        'mentor': '#a855f7',     // purple
        'acquaintance': '#94a3b8', // gray
        'neutral': '#64748b',    // slate
        'custom': '#eab308'      // yellow
    };
    return colors[type] || colors.neutral;
}

// Get shape for entity type
export function getEntityShape(type: 'character' | 'location' | 'event' | 'item' | 'culture' | 'economy' | 'magicsystem'): string {
    const shapes: Record<string, string> = {
        'character': 'ellipse',
        'location': 'round-rectangle',
        'event': 'diamond',
        'item': 'round-hexagon',
        'culture': 'tag',
        'economy': 'pentagon',
        'magicsystem': 'star'
    };
    return shapes[type] || 'ellipse';
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

