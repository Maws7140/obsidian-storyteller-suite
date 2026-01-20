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
        if (type === 'character' && (entity as Character).relationships) {
            const char = entity as Character;
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
        if (type === 'character' && (entity as Character).locations) {
            const charLocations = (entity as Character).locations;
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
        if (type === 'character' && (entity as Character).events) {
            const charEvents = (entity as Character).events;
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
        if (type === 'event' && (entity as Event).characters) {
            const evtChars = (entity as Event).characters;
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
        if (type === 'event' && (entity as Event).location) {
            const targetId = resolveEntityId((entity as Event).location!, entityMap);
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
        if (type === 'item' && (entity as PlotItem).currentOwner) {
            const targetId = resolveEntityId((entity as PlotItem).currentOwner!, entityMap);
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
        if (type === 'item' && (entity as PlotItem).currentLocation) {
            const targetId = resolveEntityId((entity as PlotItem).currentLocation!, entityMap);
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
        if (type === 'item' && (entity as PlotItem).associatedEvents) {
            const itemEvents = (entity as PlotItem).associatedEvents;
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
        if (type === 'location' && (entity as Location).parentLocation) {
            const targetId = resolveEntityId((entity as Location).parentLocation!, entityMap);
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
        if (type === 'character' && (entity as Character).ownedItems) {
            const charOwnedItems = (entity as Character).ownedItems;
            const ownedItems = Array.isArray(charOwnedItems) ? charOwnedItems : [];
            ownedItems.forEach(itemId => {
                const targetId = resolveEntityId(itemId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'owns')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'owns' });
                }
            });
        }

        // Character -> Cultures
        if (type === 'character' && (entity as Character).cultures) {
            const charCultures = (entity as Character).cultures;
            const cultures = Array.isArray(charCultures) ? charCultures : [];
            cultures.forEach(cultureId => {
                const targetId = resolveEntityId(cultureId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'belongs to')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'belongs to' });
                }
            });
        }

        // Character -> Magic Systems
        if (type === 'character' && (entity as Character).magicSystems) {
            const charMagicSystems = (entity as Character).magicSystems;
            const magicSystems = Array.isArray(charMagicSystems) ? charMagicSystems : [];
            magicSystems.forEach(magicId => {
                const targetId = resolveEntityId(magicId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'uses')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'uses' });
                }
            });
        }

        // Event -> Items
        if (type === 'event' && (entity as Event).items) {
            const evtItems = (entity as Event).items;
            const eventItems = Array.isArray(evtItems) ? evtItems : [];
            eventItems.forEach(itemId => {
                const targetId = resolveEntityId(itemId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'involves')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'involves' });
                }
            });
        }

        // Event -> Cultures
        if (type === 'event' && (entity as Event).cultures) {
            const evtCultures = (entity as Event).cultures;
            const eventCultures = Array.isArray(evtCultures) ? evtCultures : [];
            eventCultures.forEach(cultureId => {
                const targetId = resolveEntityId(cultureId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'involves')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'involves' });
                }
            });
        }

        // Event -> Magic Systems
        if (type === 'event' && (entity as Event).magicSystems) {
            const evtMagicSystems = (entity as Event).magicSystems;
            const eventMagicSystems = Array.isArray(evtMagicSystems) ? evtMagicSystems : [];
            eventMagicSystems.forEach(magicId => {
                const targetId = resolveEntityId(magicId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'involves')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'involves' });
                }
            });
        }

        // Culture -> Linked Locations
        if (type === 'culture' && (entity as Culture).linkedLocations) {
            const cultLocations = (entity as Culture).linkedLocations;
            const cultureLocations = Array.isArray(cultLocations) ? cultLocations : [];
            cultureLocations.forEach(locId => {
                const targetId = resolveEntityId(locId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'present in')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'present in' });
                }
            });
        }

        // Culture -> Linked Characters
        if (type === 'culture' && (entity as Culture).linkedCharacters) {
            const cultCharacters = (entity as Culture).linkedCharacters;
            const cultureCharacters = Array.isArray(cultCharacters) ? cultCharacters : [];
            cultureCharacters.forEach(charId => {
                const targetId = resolveEntityId(charId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'includes')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'includes' });
                }
            });
        }

        // Culture -> Linked Events
        if (type === 'culture' && (entity as Culture).linkedEvents) {
            const cultEvents = (entity as Culture).linkedEvents;
            const cultureEvents = Array.isArray(cultEvents) ? cultEvents : [];
            cultureEvents.forEach(evtId => {
                const targetId = resolveEntityId(evtId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'related to')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'related to' });
                }
            });
        }

        // Economy -> Linked Locations
        if (type === 'economy' && (entity as Economy).linkedLocations) {
            const econLocations = (entity as Economy).linkedLocations;
            const economyLocations = Array.isArray(econLocations) ? econLocations : [];
            economyLocations.forEach(locId => {
                const targetId = resolveEntityId(locId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'active in')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'active in' });
                }
            });
        }

        // MagicSystem -> Linked Locations
        if (type === 'magicsystem' && (entity as MagicSystem).linkedLocations) {
            const magicSysLocations = (entity as MagicSystem).linkedLocations;
            const magicLocations = Array.isArray(magicSysLocations) ? magicSysLocations : [];
            magicLocations.forEach(locId => {
                const targetId = resolveEntityId(locId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'practiced in')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'practiced in' });
                }
            });
        }

        // MagicSystem -> Linked Characters
        if (type === 'magicsystem' && (entity as MagicSystem).linkedCharacters) {
            const magicSysCharacters = (entity as MagicSystem).linkedCharacters;
            const magicCharacters = Array.isArray(magicSysCharacters) ? magicSysCharacters : [];
            magicCharacters.forEach(charId => {
                const targetId = resolveEntityId(charId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'used by')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'used by' });
                }
            });
        }

        // MagicSystem -> Linked Events
        if (type === 'magicsystem' && (entity as MagicSystem).linkedEvents) {
            const magicSysEvents = (entity as MagicSystem).linkedEvents;
            const magicEvents = Array.isArray(magicSysEvents) ? magicSysEvents : [];
            magicEvents.forEach(evtId => {
                const targetId = resolveEntityId(evtId, entityMap);
                if (targetId && !edgeExists(edges, sourceId, targetId, 'neutral', 'featured in')) {
                    edges.push({ source: sourceId, target: targetId, relationshipType: 'neutral', label: 'featured in' });
                }
            });
        }

        // MagicSystem -> Linked Items
        if (type === 'magicsystem' && (entity as MagicSystem).linkedItems) {
            const magicSysItems = (entity as MagicSystem).linkedItems;
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

// Build bidirectional edges where appropriate
// Some relationships should be shown in both directions
export function buildBidirectionalEdges(edges: GraphEdge[]): GraphEdge[] {
    const bidirectionalTypes: RelationshipType[] = ['family', 'ally', 'rival', 'romantic'];
    const newEdges: GraphEdge[] = [...edges];

    edges.forEach(edge => {
        if (bidirectionalTypes.includes(edge.relationshipType)) {
            // Check if reverse edge already exists (with same type and label)
            if (!edgeExists(newEdges, edge.target, edge.source, edge.relationshipType, edge.label)) {
                newEdges.push({
                    source: edge.target,
                    target: edge.source,
                    relationshipType: edge.relationshipType,
                    label: edge.label
                });
            }
        }
    });

    return newEdges;
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
        type: 'neutral' as RelationshipType,
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
                type: 'neutral' as RelationshipType,
                label: undefined
            };
        }
        return rel;
    });
}

