/**
 * LocationMigration - Utilities for migrating existing location data to new hierarchical system
 * Handles conversion of parentLocation (name-based) to parentLocationId (ID-based)
 * and migration of deprecated map references to mapBindings
 */

import type StorytellerSuitePlugin from '../main';
import type { Location, MapBinding } from '../types';

export class LocationMigration {
    private plugin: StorytellerSuitePlugin;

    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;
    }

    /**
     * Migrate parentLocation name to parentLocationId
     * Finds location by name and sets parentLocationId to its ID
     */
    async migrateParentLocationToId(location: Location): Promise<Location> {
        if (!location.parentLocation || location.parentLocationId) {
            return location; // Already migrated or no parent
        }

        const allLocations = await this.plugin.listLocations();
        const parent = allLocations.find(
            l => l.name === location.parentLocation || l.id === location.parentLocation
        );

        if (parent) {
            location.parentLocationId = parent.id || parent.name;
            // Keep parentLocation for backward compatibility during transition
            // It will be removed in a future version
        } else {
            console.warn(`Could not find parent location: ${location.parentLocation} for location: ${location.name}`);
        }

        return location;
    }

    /**
     * Migrate deprecated mapId/relatedMapIds to mapBindings
     * Creates MapBinding entries for each map reference
     */
    async migrateMapReferences(location: Location): Promise<Location> {
        if (!location.mapId && (!location.relatedMapIds || location.relatedMapIds.length === 0)) {
            return location; // No map references to migrate
        }

        if (!location.mapBindings) {
            location.mapBindings = [];
        }

        // Migrate primary mapId
        if (location.mapId) {
            const existingBinding = location.mapBindings.find(b => b.mapId === location.mapId);
            if (!existingBinding) {
                // Try to get coordinates from markerIds or use default
                const coordinates: [number, number] = [0, 0]; // Default, user will need to set proper coordinates
                
                location.mapBindings.push({
                    mapId: location.mapId,
                    coordinates
                });
            }
        }

        // Migrate relatedMapIds
        if (location.relatedMapIds) {
            for (const mapId of location.relatedMapIds) {
                const existingBinding = location.mapBindings.find(b => b.mapId === mapId);
                if (!existingBinding) {
                    const coordinates: [number, number] = [0, 0]; // Default
                    location.mapBindings.push({
                        mapId,
                        coordinates
                    });
                }
            }
        }

        return location;
    }

    /**
     * Populate childLocationIds from all locations
     * Scans all locations and builds childLocationIds arrays based on parentLocationId
     */
    async updateChildLocationIds(location: Location): Promise<void> {
        if (!location.id && !location.name) {
            return; // Cannot identify location
        }

        const locationId = location.id || location.name;
        const allLocations = await this.plugin.listLocations();
        
        // Find all locations that have this location as parent
        const children = allLocations.filter(
            l => l.parentLocationId === locationId || l.parentLocation === location.name
        );

        if (children.length > 0) {
            location.childLocationIds = children.map(c => c.id || c.name);
        } else if (!location.childLocationIds) {
            location.childLocationIds = [];
        }
    }

    /**
     * Migrate a single location (all migration steps)
     */
    async migrateLocation(location: Location): Promise<Location> {
        // Step 1: Migrate parentLocation to parentLocationId
        let migrated = await this.migrateParentLocationToId(location);

        // Step 2: Migrate map references
        migrated = await this.migrateMapReferences(migrated);

        // Step 3: Update childLocationIds
        await this.updateChildLocationIds(migrated);

        return migrated;
    }

    /**
     * Migrate all locations in the plugin
     * Returns count of migrated locations
     */
    async migrateAllLocations(): Promise<{ migrated: number; errors: string[] }> {
        const allLocations = await this.plugin.listLocations();
        const errors: string[] = [];
        let migrated = 0;

        for (const location of allLocations) {
            try {
                const needsMigration = 
                    (location.parentLocation && !location.parentLocationId) ||
                    (location.mapId && (!location.mapBindings || location.mapBindings.length === 0)) ||
                    (!location.childLocationIds);

                if (needsMigration) {
                    const migratedLocation = await this.migrateLocation(location);
                    await this.plugin.saveLocation(migratedLocation);
                    migrated++;
                }
            } catch (error) {
                const errorMsg = `Error migrating location "${location.name}": ${error instanceof Error ? error.message : String(error)}`;
                errors.push(errorMsg);
                console.error(errorMsg, error);
            }
        }

        // Second pass: Update all childLocationIds after all parentLocationIds are set
        for (const location of allLocations) {
            try {
                await this.updateChildLocationIds(location);
                await this.plugin.saveLocation(location);
            } catch (error) {
                const errorMsg = `Error updating childLocationIds for "${location.name}": ${error instanceof Error ? error.message : String(error)}`;
                if (!errors.includes(errorMsg)) {
                    errors.push(errorMsg);
                }
                console.error(errorMsg, error);
            }
        }

        return { migrated, errors };
    }

    /**
     * Check if migration is needed
     */
    async needsMigration(): Promise<boolean> {
        const allLocations = await this.plugin.listLocations();
        
        for (const location of allLocations) {
            if (location.parentLocation && !location.parentLocationId) {
                return true;
            }
            if (location.mapId && (!location.mapBindings || location.mapBindings.length === 0)) {
                return true;
            }
            if (!location.childLocationIds) {
                return true;
            }
        }

        return false;
    }
}

