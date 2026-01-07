/**
 * EntitySyncService - Automatically maintains bidirectional links between entities
 * Ensures that when one side of a relationship changes, the other side is updated automatically
 * 
 * Edge Cases Handled:
 * - Name vs ID mismatches: Characters use IDs for locations, Events/Items use names
 * - Case-insensitive matching: Entity lookups handle case variations
 * - Array initialization: Automatically initializes undefined arrays (e.g., character.events)
 * - Missing entities: Gracefully handles references to deleted/non-existent entities
 * - Stale references: Cleans up entityRefs when target entities are deleted
 * - Whitespace normalization: Trims and normalizes string values for comparison
 * - Circular update prevention: Uses _skipSync flag and syncInProgress tracking
 * - Entity renaming: Handles name changes by matching both old and new names
 * - Concurrent updates: Prevents infinite loops with sync tracking
 * - Empty vs undefined: Distinguishes between empty arrays and undefined fields
 */

import type StorytellerSuitePlugin from '../main';
import type { Character, Location, Event, PlotItem, EntityRef } from '../types';

/**
 * Relationship mapping configuration
 */
interface RelationshipMapping {
    /** Source entity type */
    sourceType: 'character' | 'location' | 'event' | 'item';
    /** Field name on source entity */
    sourceField: string;
    /** Target entity type */
    targetType: 'character' | 'location' | 'event' | 'item';
    /** Field name on target entity */
    targetField: string;
    /** Whether this relationship is bidirectional */
    bidirectional: boolean;
    /** Whether the target field is an array (for array handling) */
    isArray?: boolean;
    /** Transform function to convert source value to target format */
    transform?: (value: any, sourceEntity: any) => any;
    /** Reverse transform for bidirectional relationships */
    reverseTransform?: (value: any, targetEntity: any) => any;
}

/**
 * Entity sync service that maintains bidirectional relationships
 */
export class EntitySyncService {
    private plugin: StorytellerSuitePlugin;
    private syncInProgress: Set<string> = new Set();
    
    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;
    }

    /**
     * Relationship mappings defining how entities are linked
     */
    private readonly relationshipMappings: RelationshipMapping[] = [
        // Character ↔ Location (currentLocationId ↔ entityRefs)
        {
            sourceType: 'character',
            sourceField: 'currentLocationId',
            targetType: 'location',
            targetField: 'entityRefs',
            bidirectional: true,
            transform: (locationId: string, character: Character) => ({
                entityId: character.id || character.name,
                entityType: 'character' as const,
                entityName: character.name,
                relationship: 'located'
            }),
            reverseTransform: (entityRef: EntityRef, location: Location) => entityRef.entityId
        },
        // Item ↔ Location (currentLocation ↔ entityRefs)
        {
            sourceType: 'item',
            sourceField: 'currentLocation',
            targetType: 'location',
            targetField: 'entityRefs',
            bidirectional: true,
            transform: (locationNameOrId: string, item: PlotItem) => ({
                entityId: item.id || item.name,
                entityType: 'item' as const,
                entityName: item.name,
                relationship: 'located'
            }),
            reverseTransform: (entityRef: EntityRef, location: Location) => {
                // Items store location as name, not ID, so return location name
                return location.name;
            }
        },
        // Event ↔ Location (location ↔ entityRefs)
        {
            sourceType: 'event',
            sourceField: 'location',
            targetType: 'location',
            targetField: 'entityRefs',
            bidirectional: true,
            transform: (locationNameOrId: string, event: Event) => ({
                entityId: event.id || event.name,
                entityType: 'event' as const,
                entityName: event.name,
                relationship: 'occurred here'
            }),
            reverseTransform: (entityRef: EntityRef, location: Location) => {
                // Events store location as name, not ID, so return location name
                return location.name;
            }
        },
        // Event ↔ Characters (characters[] ↔ events[])
        {
            sourceType: 'event',
            sourceField: 'characters',
            targetType: 'character',
            targetField: 'events',
            bidirectional: true,
            transform: (characterName: string, event: Event) => {
                // Character.events stores event names, so return event name
                return event.name || event.id || '';
            },
            reverseTransform: (eventName: string, character: Character) => {
                // Event.characters stores character names, so return character name
                return character.name || character.id || '';
            }
        },
        // Item ↔ Character (currentOwner ↔ owned items - note: owned items not tracked in Character type yet)
        {
            sourceType: 'item',
            sourceField: 'currentOwner',
            targetType: 'character',
            targetField: 'events', // Placeholder - we'll handle this specially
            bidirectional: false, // One-way for now since Character doesn't have ownedItems field
            transform: (ownerName: string, item: PlotItem) => ownerName
        },
        // Location ↔ Location (parentLocationId ↔ childLocationIds)
        {
            sourceType: 'location',
            sourceField: 'parentLocationId',
            targetType: 'location',
            targetField: 'childLocationIds',
            bidirectional: true,
            isArray: true, // targetField is an array
            transform: (parentId: string, childLocation: any) => {
                // Return the child location's ID to add to parent's childLocationIds
                return childLocation.id || childLocation.name;
            },
            reverseTransform: (childId: string, parentLocation: any) => {
                // Return the parent location's ID to set as child's parentLocationId
                return parentLocation.id || parentLocation.name;
            }
        }
    ];

    /**
     * Sync an entity's relationships with related entities
     * @param entityType Type of entity being saved
     * @param newEntity The updated entity
     * @param oldEntity The previous version of the entity (if available)
     */
    async syncEntity(
        entityType: 'character' | 'location' | 'event' | 'item',
        newEntity: any,
        oldEntity?: any
    ): Promise<void> {
        const entityId = (newEntity as any).id || (newEntity as any).name;
        const syncKey = `${entityType}:${entityId}`;

        // Prevent circular updates
        if (this.syncInProgress.has(syncKey)) {
            return;
        }

        this.syncInProgress.add(syncKey);

        try {
            // Find all mappings that apply to this entity type
            const relevantMappings = this.relationshipMappings.filter(
                m => m.sourceType === entityType
            );

            for (const mapping of relevantMappings) {
                try {
                    await this.syncRelationship(mapping, newEntity, oldEntity);
                } catch (error) {
                    console.error(`[EntitySyncService] Error syncing relationship ${mapping.sourceField} → ${mapping.targetField}:`, error);
                    // Continue with other relationships even if one fails
                }
            }

            // Handle reverse mappings (when this entity is the target)
            const reverseMappings = this.relationshipMappings.filter(
                m => m.targetType === entityType && m.bidirectional
            );

            for (const mapping of reverseMappings) {
                try {
                    await this.syncReverseRelationship(mapping, newEntity, oldEntity);
                } catch (error) {
                    console.error(`[EntitySyncService] Error syncing reverse relationship ${mapping.targetField} → ${mapping.sourceField}:`, error);
                    // Continue with other relationships even if one fails
                }
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error syncing ${entityType} "${entityId}":`, error);
            // Don't throw - sync failures shouldn't prevent saves
        } finally {
            this.syncInProgress.delete(syncKey);
        }
    }

    /**
     * Sync a forward relationship (source → target)
     */
    private async syncRelationship(
        mapping: RelationshipMapping,
        newEntity: any,
        oldEntity?: any
    ): Promise<void> {
        const sourceValue = newEntity[mapping.sourceField];
        const oldValue = oldEntity?.[mapping.sourceField];

        // Handle array fields (e.g., event.characters)
        if (Array.isArray(sourceValue)) {
            const newArray = (sourceValue as any[]) || [];
            const oldArray = (oldValue as any[]) || [];

            // Normalize arrays for comparison (trim strings, handle empty values)
            const normalizeArray = (arr: any[]) => arr
                .filter(item => item !== null && item !== undefined && item !== '')
                .map(item => typeof item === 'string' ? item.trim() : item);

            const normalizedNew = normalizeArray(newArray);
            const normalizedOld = normalizeArray(oldArray);

            // Find items that were added (case-insensitive for strings)
            const added = normalizedNew.filter(newItem => {
                if (typeof newItem === 'string') {
                    return !normalizedOld.some(oldItem => 
                        typeof oldItem === 'string' && 
                        oldItem.toLowerCase() === newItem.toLowerCase()
                    );
                }
                return !normalizedOld.includes(newItem);
            });

            // Find items that were removed
            const removed = normalizedOld.filter(oldItem => {
                if (typeof oldItem === 'string') {
                    return !normalizedNew.some(newItem => 
                        typeof newItem === 'string' && 
                        newItem.toLowerCase() === oldItem.toLowerCase()
                    );
                }
                return !normalizedNew.includes(oldItem);
            });

            // Remove from targets
            for (const item of removed) {
                await this.removeFromTarget(mapping, item, newEntity);
            }

            // Add to targets
            for (const item of added) {
                await this.addToTarget(mapping, item, newEntity);
            }

            return;
        }

        // Handle single value fields
        // Normalize values for comparison
        const normalizeValue = (val: any) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'string') return val.trim() || null;
            return val;
        };

        const normalizedNew = normalizeValue(sourceValue);
        const normalizedOld = normalizeValue(oldValue);

        // Skip if value hasn't changed (handles whitespace differences)
        if (normalizedNew === normalizedOld) {
            return;
        }

        // Remove from old target if value changed
        if (normalizedOld !== null && normalizedOld !== '') {
            await this.removeFromTarget(mapping, normalizedOld, newEntity);
        }

        // Add to new target if value is set
        if (normalizedNew !== null && normalizedNew !== '') {
            await this.addToTarget(mapping, normalizedNew, newEntity);
        }
    }

    /**
     * Sync a reverse relationship (target → source)
     */
    private async syncReverseRelationship(
        mapping: RelationshipMapping,
        newEntity: any,
        oldEntity?: any
    ): Promise<void> {
        // For entityRefs on locations, we need to sync characters/events/items
        if (mapping.targetField === 'entityRefs' && mapping.sourceType !== 'location') {
            await this.syncEntityRefsReverse(mapping, newEntity, oldEntity);
        }
        // For childLocationIds on locations, we need to sync children's parentLocationId
        else if (mapping.targetField === 'childLocationIds' && mapping.sourceType === 'location') {
            await this.syncChildLocationIdsReverse(mapping, newEntity, oldEntity);
        }
    }

    /**
     * Sync reverse relationship for childLocationIds
     * When a location's childLocationIds changes, update each child's parentLocationId
     */
    private async syncChildLocationIdsReverse(
        mapping: RelationshipMapping,
        newLocation: any,
        oldLocation?: any
    ): Promise<void> {
        const newChildIds = (newLocation.childLocationIds || []) as string[];
        const oldChildIds = (oldLocation?.childLocationIds || []) as string[];

        // Normalize arrays for comparison
        const normalizeArray = (arr: string[]) => arr
            .filter(id => id !== null && id !== undefined && id !== '')
            .map(id => typeof id === 'string' ? id.trim() : id);

        const normalizedNew = normalizeArray(newChildIds);
        const normalizedOld = normalizeArray(oldChildIds);

        // Find children that were added
        const added = normalizedNew.filter(newId => !normalizedOld.includes(newId));
        
        // Find children that were removed
        const removed = normalizedOld.filter(oldId => !normalizedNew.includes(oldId));

        const parentId = newLocation.id || newLocation.name;

        // Update added children to point to this location as parent
        for (const childId of added) {
            try {
                const childLocation = await this.getEntity('location', childId);
                if (childLocation && mapping.reverseTransform) {
                    const parentIdToSet = mapping.reverseTransform(childId, newLocation);
                    if (parentIdToSet && (childLocation as any).parentLocationId !== parentIdToSet) {
                        (childLocation as any).parentLocationId = parentIdToSet;
                        await this.saveEntity('location', childLocation);
                    }
                }
            } catch (error) {
                console.error(`[EntitySyncService] Error syncing child location ${childId}:`, error);
            }
        }

        // Update removed children to clear their parentLocationId
        for (const childId of removed) {
            try {
                const childLocation = await this.getEntity('location', childId);
                if (childLocation && (childLocation as any).parentLocationId === parentId) {
                    (childLocation as any).parentLocationId = undefined;
                    await this.saveEntity('location', childLocation);
                }
            } catch (error) {
                console.error(`[EntitySyncService] Error clearing parent for child location ${childId}:`, error);
            }
        }
    }

    /**
     * Sync reverse relationship for entityRefs
     */
    private async syncEntityRefsReverse(
        mapping: RelationshipMapping,
        newLocation: Location,
        oldLocation?: Location
    ): Promise<void> {
        const newRefs = (newLocation as any).entityRefs || [];
        const oldRefs = (oldLocation as any)?.entityRefs || [];

        // Find entities that were added or removed
        const newEntityIds = new Set(newRefs.map(ref => ref.entityId));
        const oldEntityIds = new Set(oldRefs.map(ref => ref.entityId));

        // Entities added
        for (const ref of newRefs) {
            if (!oldEntityIds.has(ref.entityId) && ref.entityType === mapping.sourceType) {
                await this.updateSourceEntityFromRef(mapping, ref, newLocation);
            }
        }

        // Entities removed
        for (const ref of oldRefs) {
            if (!newEntityIds.has(ref.entityId) && ref.entityType === mapping.sourceType) {
                await this.clearSourceEntityFromRef(mapping, ref);
            }
        }
    }

    /**
     * Update source entity based on entityRef
     */
    private async updateSourceEntityFromRef(
        mapping: RelationshipMapping,
        entityRef: EntityRef,
        location: any
    ): Promise<void> {
        try {
            const sourceEntity = await this.getEntity(mapping.sourceType, entityRef.entityId);
            if (!sourceEntity) {
                console.warn(`[EntitySyncService] Source entity not found: ${mapping.sourceType} with id "${entityRef.entityId}"`);
                return;
            }

            if (mapping.reverseTransform) {
                const value = mapping.reverseTransform(entityRef, location);
                if (value !== undefined && value !== null) {
                    // For array fields, ensure array exists and add if not present
                    if (Array.isArray((sourceEntity as any)[mapping.sourceField])) {
                        const array = (sourceEntity as any)[mapping.sourceField] as any[];
                        if (!array.includes(value)) {
                            array.push(value);
                            await this.saveEntity(mapping.sourceType, sourceEntity);
                        }
                    } else {
                        (sourceEntity as any)[mapping.sourceField] = value;
                        await this.saveEntity(mapping.sourceType, sourceEntity);
                    }
                }
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error updating source entity:`, error);
        }
    }

    /**
     * Clear source entity field when removed from location
     */
    private async clearSourceEntityFromRef(
        mapping: RelationshipMapping,
        entityRef: EntityRef
    ): Promise<void> {
        try {
            const sourceEntity = await this.getEntity(mapping.sourceType, entityRef.entityId);
            if (!sourceEntity) {
                console.warn(`[EntitySyncService] Source entity not found for clearing: ${mapping.sourceType} with id "${entityRef.entityId}"`);
                return;
            }

            // For array fields, remove the value instead of clearing the whole field
            if (Array.isArray((sourceEntity as any)[mapping.sourceField])) {
                const array = (sourceEntity as any)[mapping.sourceField] as any[];
                // Try to find and remove by both ID and name (for events array)
                // Get the location to find its name
                const location = await this.getEntity('location', entityRef.entityId);
                const valueToRemove = location?.name || entityRef.entityId;
                const index = array.indexOf(valueToRemove);
                if (index !== -1) {
                    array.splice(index, 1);
                    await this.saveEntity(mapping.sourceType, sourceEntity);
                }
            } else {
                (sourceEntity as any)[mapping.sourceField] = undefined;
                await this.saveEntity(mapping.sourceType, sourceEntity);
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error clearing source entity:`, error);
        }
    }

    /**
     * Remove entity from target based on old value
     */
    private async removeFromTarget(
        mapping: RelationshipMapping,
        oldValue: any,
        sourceEntity: any
    ): Promise<void> {
        if (!oldValue) return; // Skip if value is empty/null/undefined
        
        try {
            // Special handling for location lookups (events/items use names, characters use IDs)
            let targetEntity: any;
            if (mapping.targetType === 'location' && 
                (mapping.sourceType === 'event' || mapping.sourceType === 'item')) {
                // Events/items reference locations by name, so use special resolver
                targetEntity = await this.resolveLocationReference(oldValue);
            } else {
                targetEntity = await this.getEntity(mapping.targetType, oldValue);
            }
            
            if (!targetEntity) {
                // Target entity might have been deleted - still try to clean up references
                // This handles stale references gracefully
                console.warn(`[EntitySyncService] Target entity not found for removal: ${mapping.targetType} with id/name "${oldValue}" - may have been deleted`);
                
                // For entityRefs, we need to search all locations to remove stale references
                if (mapping.targetField === 'entityRefs' && mapping.targetType === 'location') {
                    await this.removeStaleEntityRef(sourceEntity);
                }
                return;
            }

            if (mapping.targetField === 'entityRefs') {
                // Remove from entityRefs array
                const entityRefs = (targetEntity.entityRefs || []) as EntityRef[];
                const entityId = (sourceEntity as any).id || (sourceEntity as any).name;
                const updatedRefs = entityRefs.filter(
                    (ref: EntityRef) => ref.entityId !== entityId
                );
                targetEntity.entityRefs = updatedRefs;
                await this.saveEntity(mapping.targetType, targetEntity);
                
                // Check if entity still exists in child locations before removing from parents
                if (mapping.targetType === 'location') {
                    await this.removeEntityRefFromParentsIfNotInChildren(targetEntity, entityId);
                }
            } else if (Array.isArray((targetEntity as any)[mapping.targetField])) {
                // Remove from array field (e.g., character.events)
                const array = (targetEntity as any)[mapping.targetField] as any[];
                const valueToRemove = mapping.transform 
                    ? mapping.transform(oldValue, sourceEntity)
                    : sourceEntity.name || sourceEntity.id;
                
                // Try exact match first
                let index = array.indexOf(valueToRemove);
                
                // If not found and value is a string, try case-insensitive match
                if (index === -1 && typeof valueToRemove === 'string') {
                    index = array.findIndex((item: any) => 
                        typeof item === 'string' && 
                        item.toLowerCase().trim() === valueToRemove.toLowerCase().trim()
                    );
                }
                
                if (index !== -1) {
                    array.splice(index, 1);
                    await this.saveEntity(mapping.targetType, targetEntity);
                }
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error removing from target:`, error);
        }
    }

    /**
     * Resolve location reference (handles both name and ID)
     * For events/items that use location names, we need to find by name or ID
     */
    private async resolveLocationReference(locationNameOrId: string): Promise<Location | null> {
        if (!locationNameOrId) return null;
        
        const locations = await this.plugin.listLocations();
        
        // Try exact match first (ID or name)
        let found = locations.find(l => l.id === locationNameOrId || l.name === locationNameOrId);
        if (found) return found;
        
        // Try case-insensitive name match
        const lowerSearch = locationNameOrId.toLowerCase().trim();
        found = locations.find(l => 
            l.name && l.name.toLowerCase().trim() === lowerSearch
        );
        if (found) return found;
        
        return null;
    }

    /**
     * Propagate entityRef up the location hierarchy to all parent locations
     */
    private async propagateEntityRefToParents(location: any, entityRef: EntityRef): Promise<void> {
        if (!location.parentLocationId) {
            return; // No parent, nothing to propagate
        }

        try {
            const parentLocation = await this.getEntity('location', location.parentLocationId);
            if (!parentLocation) {
                return;
            }

            const parentRefs = ((parentLocation as any).entityRefs || []) as EntityRef[];
            const entityId = entityRef.entityId;
            
            // Check if entity already exists in parent
            const exists = parentRefs.some((ref: EntityRef) => ref.entityId === entityId);
            if (!exists) {
                // Add entityRef to parent with same relationship type
                parentRefs.push({
                    ...entityRef,
                    // Keep the same relationship type, or could add a note that it's inherited
                });
                (parentLocation as any).entityRefs = parentRefs;
                await this.saveEntity('location', parentLocation);
                
                // Recursively propagate to grandparent, etc.
                await this.propagateEntityRefToParents(parentLocation, entityRef);
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error propagating entityRef to parent:`, error);
        }
    }

    /**
     * Remove entityRef from parent locations if entity is not in any child locations
     */
    private async removeEntityRefFromParentsIfNotInChildren(location: any, entityId: string): Promise<void> {
        if (!location.parentLocationId) {
            return; // No parent, nothing to check
        }

        try {
            const parentLocation = await this.getEntity('location', location.parentLocationId);
            if (!parentLocation) {
                return;
            }

            // Check if entity exists in any child locations of the parent
            const childLocationIds = ((parentLocation as any).childLocationIds || []) as string[];
            let entityExistsInChildren = false;

            for (const childId of childLocationIds) {
                try {
                    const childLocation = await this.getEntity('location', childId);
                    if (childLocation) {
                        const childRefs = ((childLocation as any).entityRefs || []) as EntityRef[];
                        if (childRefs.some((ref: EntityRef) => ref.entityId === entityId)) {
                            entityExistsInChildren = true;
                            break;
                        }
                    }
                } catch (error) {
                    // Continue checking other children
                    console.warn(`[EntitySyncService] Error checking child location ${childId}:`, error);
                }
            }

            // Only remove from parent if entity doesn't exist in any child
            if (!entityExistsInChildren) {
                const parentRefs = ((parentLocation as any).entityRefs || []) as EntityRef[];
                const updatedRefs = parentRefs.filter((ref: EntityRef) => ref.entityId !== entityId);
                
                if (updatedRefs.length !== parentRefs.length) {
                    (parentLocation as any).entityRefs = updatedRefs;
                    await this.saveEntity('location', parentLocation);
                    
                    // Recursively check and remove from grandparent, etc.
                    await this.removeEntityRefFromParentsIfNotInChildren(parentLocation, entityId);
                }
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error removing entityRef from parent:`, error);
        }
    }

    /**
     * Add entity to target based on new value
     */
    private async addToTarget(
        mapping: RelationshipMapping,
        newValue: any,
        sourceEntity: any
    ): Promise<void> {
        if (!newValue) return; // Skip if value is empty/null/undefined
        
        try {
            // Special handling for location lookups (events/items use names, characters use IDs)
            let targetEntity: any;
            if (mapping.targetType === 'location' && 
                (mapping.sourceType === 'event' || mapping.sourceType === 'item')) {
                // Events/items reference locations by name, so use special resolver
                targetEntity = await this.resolveLocationReference(newValue);
            } else {
                targetEntity = await this.getEntity(mapping.targetType, newValue);
            }
            
            if (!targetEntity) {
                console.warn(`[EntitySyncService] Target entity not found: ${mapping.targetType} with id/name "${newValue}"`);
                return;
            }

            if (mapping.targetField === 'entityRefs') {
                // Add to entityRefs array
                const entityRefs = (targetEntity.entityRefs || []) as EntityRef[];
                const entityId = (sourceEntity as any).id || (sourceEntity as any).name;
                
                // Check if already exists
                const exists = entityRefs.some((ref: EntityRef) => ref.entityId === entityId);
                if (!exists && mapping.transform) {
                    const newRef = mapping.transform(newValue, sourceEntity);
                    entityRefs.push(newRef);
                    targetEntity.entityRefs = entityRefs;
                    await this.saveEntity(mapping.targetType, targetEntity);
                    
                    // Propagate entityRefs up the location hierarchy
                    if (mapping.targetType === 'location') {
                        await this.propagateEntityRefToParents(targetEntity, newRef);
                    }
                }
            } else if (Array.isArray((targetEntity as any)[mapping.targetField])) {
                // Add to array field (e.g., character.events)
                const array = (targetEntity as any)[mapping.targetField] as any[];
                const valueToAdd = mapping.transform 
                    ? mapping.transform(newValue, sourceEntity)
                    : sourceEntity.name || sourceEntity.id;
                
                if (valueToAdd) {
                    // Check if already exists (case-insensitive for strings)
                    const exists = typeof valueToAdd === 'string'
                        ? array.some((item: any) => 
                            typeof item === 'string' && 
                            item.toLowerCase().trim() === valueToAdd.toLowerCase().trim()
                          )
                        : array.includes(valueToAdd);
                    
                    if (!exists) {
                        array.push(valueToAdd);
                        await this.saveEntity(mapping.targetType, targetEntity);
                    }
                }
            } else if ((targetEntity as any)[mapping.targetField] === undefined) {
                // Field doesn't exist yet - initialize as array if it should be an array
                // This handles cases where character.events is undefined
                if (mapping.targetField === 'events') {
                    (targetEntity as any)[mapping.targetField] = [];
                    const valueToAdd = mapping.transform 
                        ? mapping.transform(newValue, sourceEntity)
                        : sourceEntity.name || sourceEntity.id;
                    if (valueToAdd) {
                        (targetEntity as any)[mapping.targetField].push(valueToAdd);
                        await this.saveEntity(mapping.targetType, targetEntity);
                    }
                }
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error adding to target:`, error);
        }
    }

    /**
     * Get an entity by type and ID/name
     * Handles case-insensitive matching and resolves by both ID and name
     */
    private async getEntity(
        entityType: 'character' | 'location' | 'event' | 'item',
        idOrName: string
    ): Promise<any> {
        if (!idOrName) return null;
        
        try {
            let entities: any[];
            
            switch (entityType) {
                case 'character':
                    entities = await this.plugin.listCharacters();
                    break;
                case 'location':
                    entities = await this.plugin.listLocations();
                    break;
                case 'event':
                    entities = await this.plugin.listEvents();
                    break;
                case 'item':
                    entities = await this.plugin.listPlotItems();
                    break;
                default:
                    return null;
            }

            // Strategy 1: Exact match (ID or name, case-sensitive)
            let found = entities.find(e => {
                const id = (e as any).id;
                const name = (e as any).name;
                return id === idOrName || name === idOrName;
            });
            if (found) return found;

            // Strategy 2: Case-insensitive name match
            const lowerSearch = idOrName.toLowerCase().trim();
            found = entities.find(e => {
                const name = (e as any).name;
                return name && name.toLowerCase().trim() === lowerSearch;
            });
            if (found) return found;

            // Strategy 3: Partial name match (if exact match fails)
            // This handles cases where location name might have changed slightly
            found = entities.find(e => {
                const name = (e as any).name;
                if (!name) return false;
                const lowerName = name.toLowerCase().trim();
                return lowerName.includes(lowerSearch) || lowerSearch.includes(lowerName);
            });
            
            return found || null;
        } catch (error) {
            console.error(`[EntitySyncService] Error getting entity ${entityType} with id/name "${idOrName}":`, error);
            return null;
        }
    }

    /**
     * Save an entity (delegates to plugin save methods)
     */
    private async saveEntity(
        entityType: 'character' | 'location' | 'event' | 'item',
        entity: any
    ): Promise<void> {
        try {
            // Use a flag to prevent recursive syncing
            entity._skipSync = true;

            switch (entityType) {
                case 'character':
                    await this.plugin.saveCharacter(entity);
                    break;
                case 'location':
                    await this.plugin.saveLocation(entity);
                    break;
                case 'event':
                    await this.plugin.saveEvent(entity);
                    break;
                case 'item':
                    await this.plugin.savePlotItem(entity);
                    break;
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error saving entity:`, error);
        } finally {
            delete entity._skipSync;
        }
    }

    /**
     * Remove stale entity reference from all locations
     * Called when target entity is not found (may have been deleted)
     */
    private async removeStaleEntityRef(sourceEntity: any): Promise<void> {
        try {
            const entityId = sourceEntity.id || sourceEntity.name;
            if (!entityId) return;

            const allLocations = await this.plugin.listLocations();
            for (const location of allLocations) {
                if (location.entityRefs) {
                    const initialLength = location.entityRefs.length;
                    location.entityRefs = location.entityRefs.filter(
                        (ref: EntityRef) => ref.entityId !== entityId
                    );
                    if (location.entityRefs.length !== initialLength) {
                        await this.saveEntity('location', location);
                    }
                }
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error removing stale entity ref:`, error);
        }
    }

    /**
     * Handle entity deletion - remove all references
     */
    async handleEntityDeletion(
        entityType: 'character' | 'location' | 'event' | 'item',
        entityId: string
    ): Promise<void> {
        if (!entityId) return;
        
        try {
            // Find all mappings where this entity type is a target
            const relevantMappings = this.relationshipMappings.filter(
                m => m.targetType === entityType || 
                     (m.sourceType === entityType && m.bidirectional)
            );

            for (const mapping of relevantMappings) {
                await this.removeEntityReferences(mapping, entityType, entityId);
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error handling entity deletion:`, error);
        }
    }

    /**
     * Remove references to a deleted entity
     */
    private async removeEntityReferences(
        mapping: RelationshipMapping,
        deletedType: 'character' | 'location' | 'event' | 'item',
        deletedId: string
    ): Promise<void> {
        try {
            // Get all entities of the type that might reference the deleted entity
            let entities: any[] = [];
            
            switch (mapping.sourceType) {
                case 'character':
                    entities = await this.plugin.listCharacters();
                    break;
                case 'location':
                    entities = await this.plugin.listLocations();
                    break;
                case 'event':
                    entities = await this.plugin.listEvents();
                    break;
                case 'item':
                    entities = await this.plugin.listPlotItems();
                    break;
            }

            // Get the deleted entity's name for name-based matching
            let deletedName: string | undefined;
            try {
                const deletedEntity = await this.getEntity(deletedType, deletedId);
                if (deletedEntity) {
                    deletedName = (deletedEntity as any)?.name;
                }
            } catch (e) {
                // Entity already deleted, can't get name - that's okay
            }

            for (const entity of entities) {
                let needsUpdate = false;

                if (mapping.sourceField === 'currentLocationId' || mapping.sourceField === 'currentLocation' || mapping.sourceField === 'location') {
                    const value = (entity as any)[mapping.sourceField];
                    // Match by ID or name (case-insensitive)
                    if (value === deletedId || 
                        (deletedName && typeof value === 'string' && 
                         value.toLowerCase().trim() === deletedName.toLowerCase().trim())) {
                        (entity as any)[mapping.sourceField] = undefined;
                        needsUpdate = true;
                    }
                } else if (Array.isArray((entity as any)[mapping.sourceField])) {
                    const array = (entity as any)[mapping.sourceField] as any[];
                    // Try exact match first
                    let index = array.indexOf(deletedId);
                    
                    // If not found and we have a name, try name match (case-insensitive)
                    if (index === -1 && deletedName) {
                        const lowerDeletedName = deletedName.toLowerCase().trim();
                        index = array.findIndex((item: any) => 
                            typeof item === 'string' && 
                            item.toLowerCase().trim() === lowerDeletedName
                        );
                    }
                    
                    if (index !== -1) {
                        array.splice(index, 1);
                        needsUpdate = true;
                    }
                }

                if (needsUpdate) {
                    await this.saveEntity(mapping.sourceType, entity);
                }
            }
        } catch (error) {
            console.error(`[EntitySyncService] Error removing entity references:`, error);
        }
    }
}
