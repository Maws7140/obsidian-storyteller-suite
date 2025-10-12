// Utilities for processing network graph data and relationships

import { Character, Location, Event, PlotItem, TypedRelationship, RelationshipType, GraphNode, GraphEdge } from '../types';

// Extract all relationships from a collection of entities
// Handles both old string[] format and new TypedRelationship[] format
export function extractAllRelationships(
    characters: Character[],
    locations: Location[],
    events: Event[],
    items: PlotItem[]
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

    // Extract edges from each entity type
    const allEntities = [
        ...characters.map(c => ({ entity: c, type: 'character' as const })),
        ...locations.map(l => ({ entity: l, type: 'location' as const })),
        ...events.map(e => ({ entity: e, type: 'event' as const })),
        ...items.map(i => ({ entity: i, type: 'item' as const }))
    ];

    allEntities.forEach(({ entity, type }) => {
        const sourceId = entity.id || entity.name;

        // Process typed connections
        if (entity.connections && Array.isArray(entity.connections)) {
            entity.connections.forEach(conn => {
                const targetId = resolveEntityId(conn.target, entityMap);
                if (targetId) {
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
            char.relationships?.forEach(rel => {
                if (typeof rel === 'string') {
                    // Legacy string relationship
                    const targetId = resolveEntityId(rel, entityMap);
                    if (targetId) {
                        edges.push({
                            source: sourceId,
                            target: targetId,
                            relationshipType: 'neutral',
                            label: undefined
                        });
                    }
                } else {
                    // TypedRelationship
                    const targetId = resolveEntityId(rel.target, entityMap);
                    if (targetId) {
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
            (entity as Character).locations?.forEach(locName => {
                const targetId = resolveEntityId(locName, entityMap);
                if (targetId && !edges.some(e => e.source === sourceId && e.target === targetId)) {
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
            (entity as Character).events?.forEach(evtName => {
                const targetId = resolveEntityId(evtName, entityMap);
                if (targetId && !edges.some(e => e.source === sourceId && e.target === targetId)) {
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
            (entity as Event).characters?.forEach(charName => {
                const targetId = resolveEntityId(charName, entityMap);
                if (targetId && !edges.some(e => e.source === sourceId && e.target === targetId)) {
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
            if (targetId && !edges.some(e => e.source === sourceId && e.target === targetId)) {
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
            if (targetId && !edges.some(e => e.source === sourceId && e.target === targetId)) {
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
            if (targetId && !edges.some(e => e.source === sourceId && e.target === targetId)) {
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
            (entity as PlotItem).associatedEvents?.forEach(evtName => {
                const targetId = resolveEntityId(evtName, entityMap);
                if (targetId && !edges.some(e => e.source === sourceId && e.target === targetId)) {
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
            if (targetId && !edges.some(e => e.source === sourceId && e.target === targetId)) {
                edges.push({
                    source: sourceId,
                    target: targetId,
                    relationshipType: 'neutral',
                    label: 'within'
                });
            }
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
            // Check if reverse edge already exists
            const reverseExists = edges.some(e => 
                e.source === edge.target && e.target === edge.source
            );
            if (!reverseExists) {
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
export function getEntityShape(type: 'character' | 'location' | 'event' | 'item'): string {
    const shapes: Record<string, string> = {
        'character': 'ellipse',
        'location': 'round-rectangle',
        'event': 'diamond',
        'item': 'round-hexagon'
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

