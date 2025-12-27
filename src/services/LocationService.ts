/**
 * LocationService - Manages location hierarchy, map bindings, and entity relationships
 * Provides methods for navigating and manipulating the location tree structure
 */

import type StorytellerSuitePlugin from '../main';
import type { Location, MapBinding, EntityRef, Character } from '../types';

export interface GetEntitiesAtLocationOptions {
    /** Include entities from child locations */
    includeChildren?: boolean;
    /** Filter by entity types */
    entityTypes?: string[];
}

export class LocationService {
    private plugin: StorytellerSuitePlugin;

    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;
    }

    /**
     * Get a location by ID
     */
    async getLocation(locationId: string): Promise<Location | null> {
        if (!locationId) return null;
        
        const locations = await this.plugin.listLocations();
        return locations.find(l => l.id === locationId || l.name === locationId) || null;
    }

    /**
     * Get full location hierarchy path from root to target location
     * Returns array of locations in order: [root, ..., parent, target]
     */
    async getLocationPath(locationId: string): Promise<Location[]> {
        const path: Location[] = [];
        let current = await this.getLocation(locationId);

        while (current) {
            path.unshift(current);
            if (current.parentLocationId) {
                current = await this.getLocation(current.parentLocationId);
            } else {
                break;
            }
        }

        return path;
    }

    /**
     * Get all descendant locations (children, grandchildren, etc.)
     */
    async getLocationDescendants(locationId: string): Promise<Location[]> {
        const location = await this.getLocation(locationId);
        if (!location) return [];

        const descendants: Location[] = [];
        const queue = [...(location.childLocationIds || [])];

        while (queue.length > 0) {
            const childId = queue.shift()!;
            const child = await this.getLocation(childId);
            if (child) {
                descendants.push(child);
                if (child.childLocationIds && child.childLocationIds.length > 0) {
                    queue.push(...child.childLocationIds);
                }
            }
        }

        return descendants;
    }

    /**
     * Get all entities at a location (optionally including child locations)
     */
    async getEntitiesAtLocation(
        locationId: string,
        options: GetEntitiesAtLocationOptions = {}
    ): Promise<EntityRef[]> {
        const location = await this.getLocation(locationId);
        if (!location) return [];

        let entities = [...(location.entityRefs || [])];

        if (options.includeChildren) {
            const descendants = await this.getLocationDescendants(locationId);
            for (const desc of descendants) {
                if (desc.entityRefs) {
                    entities.push(...desc.entityRefs);
                }
            }
        }

        if (options.entityTypes && options.entityTypes.length > 0) {
            entities = entities.filter(e => options.entityTypes!.includes(e.entityType));
        }

        return entities;
    }

    /**
     * Move an entity to a new location
     * Removes entity from old location and adds to new location
     */
    async moveEntityToLocation(
        entityId: string,
        entityType: string,
        newLocationId: string,
        relationship: string = 'located'
    ): Promise<void> {
        // Remove from old location(s)
        const allLocations = await this.plugin.listLocations();
        for (const loc of allLocations) {
            if (loc.entityRefs) {
                const idx = loc.entityRefs.findIndex(e => e.entityId === entityId);
                if (idx !== -1) {
                    loc.entityRefs.splice(idx, 1);
                    await this.plugin.saveLocation(loc);
                }
            }
        }

        // Add to new location
        const newLocation = await this.getLocation(newLocationId);
        if (newLocation) {
            if (!newLocation.entityRefs) {
                newLocation.entityRefs = [];
            }
            newLocation.entityRefs.push({
                entityId,
                entityType: entityType as EntityRef['entityType'],
                relationship
            });
            await this.plugin.saveLocation(newLocation);
        }

        // Update entity's currentLocationId if it's a character
        if (entityType === 'character') {
            const characters = await this.plugin.listCharacters();
            const character = characters.find(c => (c.id || c.name) === entityId);
            if (character) {
                character.currentLocationId = newLocationId;
                await this.plugin.saveCharacter(character);
            }
        }
    }

    /**
     * Add a map binding to a location
     */
    async addMapBinding(
        locationId: string,
        mapId: string,
        coordinates: [number, number],
        options?: {
            markerType?: string;
            markerIcon?: string;
            zoomRange?: [number, number];
        }
    ): Promise<void> {
        const location = await this.getLocation(locationId);
        if (!location) return;

        if (!location.mapBindings) {
            location.mapBindings = [];
        }

        // Check if binding already exists for this map
        const existingIndex = location.mapBindings.findIndex(b => b.mapId === mapId);
        const binding: MapBinding = {
            mapId,
            coordinates,
            markerType: options?.markerType,
            markerIcon: options?.markerIcon,
            zoomRange: options?.zoomRange
        };

        if (existingIndex >= 0) {
            location.mapBindings[existingIndex] = binding;
        } else {
            location.mapBindings.push(binding);
        }

        await this.plugin.saveLocation(location);
    }

    /**
     * Remove a map binding from a location
     */
    async removeMapBinding(locationId: string, mapId: string): Promise<void> {
        const location = await this.getLocation(locationId);
        if (!location || !location.mapBindings) return;

        location.mapBindings = location.mapBindings.filter(b => b.mapId !== mapId);
        await this.plugin.saveLocation(location);
    }

    /**
     * Find a location at or near specific coordinates on a map
     * Uses proximity-based matching with configurable tolerance
     * @param mapId The map ID to search on
     * @param coordinates The [x, y] or [lat, lng] coordinates to search near
     * @param tolerance Distance tolerance (pixels for image maps, degrees for real-world maps)
     * @returns The closest location within tolerance, or null if none found
     */
    async findLocationAtCoordinates(
        mapId: string,
        coordinates: [number, number],
        tolerance: number
    ): Promise<Location | null> {
        const allLocations = await this.plugin.listLocations();

        // Filter locations that have bindings on this map
        const locationsOnMap = allLocations.filter(loc =>
            loc.mapBindings?.some(binding => binding.mapId === mapId)
        );

        if (locationsOnMap.length === 0) {
            return null;
        }

        // Find closest location within tolerance
        let closestLocation: Location | null = null;
        let minDistance = Infinity;

        for (const location of locationsOnMap) {
            const binding = location.mapBindings!.find(b => b.mapId === mapId);
            if (!binding) continue;

            const distance = this.calculateDistance(coordinates, binding.coordinates);

            if (distance < minDistance && distance <= tolerance) {
                minDistance = distance;
                closestLocation = location;
            }
        }

        return closestLocation;
    }

    /**
     * Calculate Euclidean distance between two coordinate points
     * Works for both pixel coordinates and geographic coordinates (approximate for lat/lng)
     * For precise geographic distance, use Haversine formula
     */
    private calculateDistance(
        coord1: [number, number],
        coord2: [number, number]
    ): number {
        const dx = coord2[0] - coord1[0];
        const dy = coord2[1] - coord1[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Add an entity reference to a location
     */
    async addEntityToLocation(locationId: string, entityRef: EntityRef): Promise<void> {
        const location = await this.getLocation(locationId);
        if (!location) return;

        if (!location.entityRefs) {
            location.entityRefs = [];
        }

        // Check if entity already exists at this location
        const existingIndex = location.entityRefs.findIndex(
            e => e.entityId === entityRef.entityId && e.entityType === entityRef.entityType
        );

        if (existingIndex >= 0) {
            location.entityRefs[existingIndex] = entityRef;
        } else {
            location.entityRefs.push(entityRef);
        }

        await this.plugin.saveLocation(location);
    }

    /**
     * Remove an entity reference from a location
     */
    async removeEntityFromLocation(locationId: string, entityId: string): Promise<void> {
        const location = await this.getLocation(locationId);
        if (!location || !location.entityRefs) return;

        location.entityRefs = location.entityRefs.filter(e => e.entityId !== entityId);
        await this.plugin.saveLocation(location);
    }

    /**
     * Create a child location and update parent's childLocationIds
     */
    async createChildLocation(parentId: string, childLocation: Location): Promise<Location> {
        const parent = await this.getLocation(parentId);
        if (!parent) {
            throw new Error(`Parent location not found: ${parentId}`);
        }

        // Ensure child has parent reference
        childLocation.parentLocationId = parentId;

        // Save child location
        await this.plugin.saveLocation(childLocation);

        // Update parent's childLocationIds
        if (!parent.childLocationIds) {
            parent.childLocationIds = [];
        }
        const childId = childLocation.id || childLocation.name;
        if (!parent.childLocationIds.includes(childId)) {
            parent.childLocationIds.push(childId);
            await this.plugin.saveLocation(parent);
        }

        return childLocation;
    }

    /**
     * Update location hierarchy (change parent)
     * Prevents circular references
     */
    async updateLocationHierarchy(locationId: string, newParentId?: string): Promise<void> {
        const location = await this.getLocation(locationId);
        if (!location) return;

        // Prevent circular reference
        if (newParentId) {
            const descendants = await this.getLocationDescendants(locationId);
            if (descendants.some(d => d.id === newParentId || d.name === newParentId)) {
                throw new Error('Cannot set parent to a descendant location (would create circular reference)');
            }
        }

        // Remove from old parent's childLocationIds
        if (location.parentLocationId) {
            const oldParent = await this.getLocation(location.parentLocationId);
            if (oldParent && oldParent.childLocationIds) {
                const childId = location.id || location.name;
                oldParent.childLocationIds = oldParent.childLocationIds.filter(id => id !== childId);
                await this.plugin.saveLocation(oldParent);
            }
        }

        // Update location's parent
        location.parentLocationId = newParentId;

        // Add to new parent's childLocationIds
        if (newParentId) {
            const newParent = await this.getLocation(newParentId);
            if (newParent) {
                if (!newParent.childLocationIds) {
                    newParent.childLocationIds = [];
                }
                const childId = location.id || location.name;
                if (!newParent.childLocationIds.includes(childId)) {
                    newParent.childLocationIds.push(childId);
                    await this.plugin.saveLocation(newParent);
                }
            }
        }

        await this.plugin.saveLocation(location);
    }

    /**
     * Get all root locations (locations without parents)
     */
    async getRootLocations(): Promise<Location[]> {
        const allLocations = await this.plugin.listLocations();
        return allLocations.filter(loc => !loc.parentLocationId);
    }

    /**
     * Get direct children of a location
     */
    async getChildLocations(locationId: string): Promise<Location[]> {
        const location = await this.getLocation(locationId);
        if (!location || !location.childLocationIds) return [];

        const children: Location[] = [];
        for (const childId of location.childLocationIds) {
            const child = await this.getLocation(childId);
            if (child) {
                children.push(child);
            }
        }

        return children;
    }

    /**
     * Validate location hierarchy (check for circular references and orphaned locations)
     */
    async validateHierarchy(): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];
        const allLocations = await this.plugin.listLocations();

        for (const location of allLocations) {
            if (location.parentLocationId) {
                const parent = await this.getLocation(location.parentLocationId);
                if (!parent) {
                    errors.push(`Location "${location.name}" has invalid parentLocationId: ${location.parentLocationId}`);
                } else {
                    // Check for circular reference
                    const path = await this.getLocationPath(location.id || location.name);
                    if (path.length > 1 && path[0].id === location.id) {
                        errors.push(`Circular reference detected in location hierarchy for "${location.name}"`);
                    }
                }
            }

            // Validate childLocationIds
            if (location.childLocationIds) {
                for (const childId of location.childLocationIds) {
                    const child = await this.getLocation(childId);
                    if (!child) {
                        errors.push(`Location "${location.name}" references non-existent child: ${childId}`);
                    } else if (child.parentLocationId !== (location.id || location.name)) {
                        errors.push(`Location "${child.name}" parentLocationId does not match parent "${location.name}"`);
                    }
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

