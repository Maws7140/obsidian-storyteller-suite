import { App } from 'obsidian';
import { StoryMap, Location } from '../types';
import StorytellerSuitePlugin from '../main';
import { MapManager } from './MapManager';
import { LocationService } from '../services/LocationService';

/**
 * Map Hierarchy Manager - Handles map parent/child relationships and navigation
 * Manages the hierarchical structure of maps and their relationship to locations
 */
export class MapHierarchyManager {
    private mapManager: MapManager;
    private locationService: LocationService;

    constructor(
        private app: App,
        private plugin: StorytellerSuitePlugin
    ) {
        this.mapManager = new MapManager(app, plugin);
        this.locationService = new LocationService(plugin);
    }

    /**
     * Get the full path from root to a specific map
     * Returns array: [worldMap, kingdomMap, cityMap, currentMap]
     * @param mapId - ID of the map to get path for
     * @returns Array of maps from root to target, or empty array if not found
     */
    async getMapPath(mapId: string): Promise<StoryMap[]> {
        const map = await this.mapManager.getMapById(mapId);
        if (!map) {
            return [];
        }

        const path: StoryMap[] = [map];
        let currentMap = map;

        // Walk up the hierarchy to the root
        const visited = new Set<string>([mapId]); // Prevent infinite loops
        while (currentMap.parentMapId) {
            if (visited.has(currentMap.parentMapId)) {
                console.warn(`Circular reference detected in map hierarchy for map: ${mapId}`);
                break;
            }

            const parentMap = await this.mapManager.getMapById(currentMap.parentMapId);
            if (!parentMap) {
                console.warn(`Parent map not found: ${currentMap.parentMapId}`);
                break;
            }

            path.unshift(parentMap);
            visited.add(currentMap.parentMapId);
            currentMap = parentMap;
        }

        return path;
    }

    /**
     * Get all direct children of a map
     * @param mapId - ID of the parent map
     * @returns Array of child maps
     */
    async getChildMaps(mapId: string): Promise<StoryMap[]> {
        const allMaps = await this.mapManager.listMaps();

        // Find maps where parentMapId matches the given mapId
        const children = allMaps.filter(m => m.parentMapId === mapId);

        return children.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get all descendant maps (recursive)
     * @param mapId - ID of the ancestor map
     * @returns Array of all descendant maps
     */
    async getDescendantMaps(mapId: string): Promise<StoryMap[]> {
        const descendants: StoryMap[] = [];
        const visited = new Set<string>();

        const collectDescendants = async (currentMapId: string) => {
            if (visited.has(currentMapId)) {
                return; // Prevent infinite loops
            }
            visited.add(currentMapId);

            const children = await this.getChildMaps(currentMapId);
            for (const child of children) {
                if (child.id) {
                    descendants.push(child);
                    await collectDescendants(child.id);
                }
            }
        };

        await collectDescendants(mapId);
        return descendants;
    }

    /**
     * Validate map hierarchy for circular references and integrity issues
     * @param mapId - ID of the map to validate (validates entire hierarchy)
     * @returns Validation result with any errors found
     */
    async validateHierarchy(mapId: string): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];
        const map = await this.mapManager.getMapById(mapId);

        if (!map) {
            return { valid: false, errors: [`Map not found: ${mapId}`] };
        }

        // Check for circular references
        const path = await this.getMapPath(mapId);
        const ids = path.map(m => m.id).filter((id): id is string => id !== undefined);
        const uniqueIds = new Set(ids);

        if (ids.length !== uniqueIds.size) {
            errors.push(`Circular reference detected in hierarchy for map: ${map.name}`);
        }

        // Validate parent map exists if specified
        if (map.parentMapId) {
            const parent = await this.mapManager.getMapById(map.parentMapId);
            if (!parent) {
                errors.push(`Parent map not found: ${map.parentMapId} for map: ${map.name}`);
            }
        }

        // Validate child maps exist
        if (map.childMapIds && map.childMapIds.length > 0) {
            for (const childId of map.childMapIds) {
                const child = await this.mapManager.getMapById(childId);
                if (!child) {
                    errors.push(`Child map not found: ${childId} referenced by map: ${map.name}`);
                } else if (child.parentMapId !== (map.id || map.name)) {
                    errors.push(`Child map ${child.name} has mismatched parent reference`);
                }
            }
        }

        // Validate corresponding location exists
        if (map.correspondingLocationId) {
            const location = await this.locationService.getLocation(map.correspondingLocationId);
            if (!location) {
                errors.push(`Corresponding location not found: ${map.correspondingLocationId} for map: ${map.name}`);
            } else {
                // Check if location's correspondingMapId points back to this map
                if (location.correspondingMapId && location.correspondingMapId !== (map.id || map.name)) {
                    errors.push(`Location ${location.name} has mismatched map reference`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Sync map hierarchy with location hierarchy
     *
     * This now works in **both directions** so that:
     * - Location.parentLocationId ⇄ Location.childLocationIds remain the source of truth
     * - Map.parentMapId ⇄ Map.childMapIds are inferred from the corresponding locations
     * - When only map hierarchy exists (legacy worlds like Fireland), the corresponding
     *   locations will be given matching parentLocationId values so the hierarchies unify.
     *
     * @param mapId - ID of the map to sync
     */
    async syncMapLocationHierarchy(mapId: string): Promise<void> {
        const map = await this.mapManager.getMapById(mapId);
        if (!map || !map.correspondingLocationId) {
            return;
        }

        const location = await this.locationService.getLocation(map.correspondingLocationId);
        if (!location) {
            return;
        }

        let mapUpdated = false;
        let locationUpdated = false;

        // ---------------------------------------------------------------------
        // 1) Primary direction: use location hierarchy to enforce map hierarchy
        // ---------------------------------------------------------------------

        // Sync parent: if location has parent, find parent's map
        if (location.parentLocationId) {
            const parentLocation = await this.locationService.getLocation(location.parentLocationId);
            if (parentLocation?.correspondingMapId) {
                if (map.parentMapId !== parentLocation.correspondingMapId) {
                    map.parentMapId = parentLocation.correspondingMapId;
                    mapUpdated = true;
                }
            }
        }

        // Sync children: if location has children, find their maps
        if (location.childLocationIds && location.childLocationIds.length > 0) {
            const childMapIds: string[] = [];
            for (const childLocId of location.childLocationIds) {
                const childLoc = await this.locationService.getLocation(childLocId);
                if (childLoc?.correspondingMapId) {
                    childMapIds.push(childLoc.correspondingMapId);
                }
            }

            // Update if childMapIds changed
            const currentChildIds = map.childMapIds || [];
            if (JSON.stringify(currentChildIds.sort()) !== JSON.stringify(childMapIds.sort())) {
                map.childMapIds = childMapIds;
                mapUpdated = true;
            }
        }

        // ---------------------------------------------------------------------
        // 2) Secondary direction: if only map hierarchy exists, repair locations
        // ---------------------------------------------------------------------

        // If the map already has a parent but the location doesn't,
        // infer the parent location from the parent map.
        if (!location.parentLocationId && map.parentMapId) {
            const parentMap = await this.mapManager.getMapById(map.parentMapId);
            if (parentMap?.correspondingLocationId) {
                const parentLocation = await this.locationService.getLocation(parentMap.correspondingLocationId);
                if (parentLocation) {
                    location.parentLocationId = parentLocation.id || parentLocation.name;
                    locationUpdated = true;
                }
            }
        }

        // If the map has explicit child maps but the location has no children,
        // infer child locations from those maps.
        if ((!location.childLocationIds || location.childLocationIds.length === 0) && map.childMapIds && map.childMapIds.length > 0) {
            const childLocIds: string[] = [];
            for (const childMapId of map.childMapIds) {
                const childMap = await this.mapManager.getMapById(childMapId);
                if (childMap?.correspondingLocationId) {
                    const childLoc = await this.locationService.getLocation(childMap.correspondingLocationId);
                    if (childLoc) {
                        childLocIds.push(childLoc.id || childLoc.name);
                    }
                }
            }

            if (childLocIds.length > 0) {
                location.childLocationIds = childLocIds;
                locationUpdated = true;
            }
        }

        // ---------------------------------------------------------------------
        // 3) Persist any changes
        // ---------------------------------------------------------------------

        if (mapUpdated) {
            await this.plugin.saveMap(map);
        }

        if (locationUpdated) {
            await this.plugin.saveLocation(location);
        }
    }

    /**
     * Migration helper: ensures all maps have correspondingLocationId
     * Auto-creates locations for maps without them
     */
    async autoLinkMapsToLocations(): Promise<void> {
        const maps = await this.mapManager.listMaps();
        let created = 0;
        let linked = 0;

        for (const map of maps) {
            // Skip if already has corresponding location
            if (map.correspondingLocationId) {
                const exists = await this.locationService.getLocation(map.correspondingLocationId);
                if (exists) {
                    continue;
                }
            }

            // Try to find location by matching name
            const allLocations = await this.plugin.listLocations();
            const matchingLocation = allLocations.find(loc =>
                loc.name.toLowerCase() === map.name.toLowerCase()
            );

            if (matchingLocation) {
                // Link to existing location
                map.correspondingLocationId = matchingLocation.id || matchingLocation.name;

                // Also update location to reference this map
                if (!matchingLocation.correspondingMapId) {
                    matchingLocation.correspondingMapId = map.id || map.name;
                    await this.plugin.saveLocation(matchingLocation);
                }

                // If this map already has a parent, try to infer the location parent as well
                if (!matchingLocation.parentLocationId && map.parentMapId) {
                    const parentMap = await this.mapManager.getMapById(map.parentMapId);
                    if (parentMap?.correspondingLocationId) {
                        const parentLoc = await this.locationService.getLocation(parentMap.correspondingLocationId);
                        if (parentLoc) {
                            matchingLocation.parentLocationId = parentLoc.id || parentLoc.name;
                            await this.plugin.saveLocation(matchingLocation);
                        }
                    }
                }

                await this.plugin.saveMap(map);
                linked++;
            } else {
                // Create new location for this map
                const newLocation: Location = {
                    name: map.name,
                    description: map.description || '',
                    type: this.guessLocationTypeFromMapScale(map.scale) as Location['type'],
                    correspondingMapId: map.id || map.name,
                    customFields: {},
                    groups: map.groups || []
                };

                // If this map already has a parent, mirror that relationship
                // into the new location so location hierarchies are complete.
                if (map.parentMapId) {
                    const parentMap = await this.mapManager.getMapById(map.parentMapId);
                    if (parentMap?.correspondingLocationId) {
                        const parentLoc = await this.locationService.getLocation(parentMap.correspondingLocationId);
                        if (parentLoc) {
                            newLocation.parentLocationId = parentLoc.id || parentLoc.name;
                        }
                    }
                }

                await this.plugin.saveLocation(newLocation);

                // Update map with location reference (use name since we just created it)
                map.correspondingLocationId = newLocation.name;
                await this.plugin.saveMap(map);
                created++;
            }
        }

        console.log(`Auto-linked maps to locations: ${linked} linked, ${created} created`);
    }

    /**
     * Guess location type from map scale
     * Helper for migration
     */
    private guessLocationTypeFromMapScale(scale: StoryMap['scale']): string {
        const scaleToType: Record<string, string> = {
            'world': 'Planet',
            'region': 'Region',
            'city': 'City',
            'building': 'Building',
            'custom': 'Location'
        };
        return scaleToType[scale || 'custom'] || 'Location';
    }

    /**
     * Get breadcrumb path as string array for display
     * @param mapId - ID of the current map
     * @returns Array of map names from root to current
     */
    async getBreadcrumbPath(mapId: string): Promise<{ id: string; name: string; scale: StoryMap['scale'] }[]> {
        const path = await this.getMapPath(mapId);
        return path.map(m => ({
            id: m.id || m.name,
            name: m.name,
            scale: m.scale || 'custom'
        }));
    }

    /**
     * Find portal targets: child maps that can be navigated to from current map
     * @param mapId - ID of the current map
     * @returns Array of child maps with their location coordinates
     */
    async getPortalTargets(mapId: string): Promise<Array<{
        map: StoryMap;
        location: Location | null;
        locationName: string;
    }>> {
        const childMaps = await this.getChildMaps(mapId);
        const portals: Array<{
            map: StoryMap;
            location: Location | null;
            locationName: string;
        }> = [];

        for (const childMap of childMaps) {
            let location: Location | null = null;
            let locationName = childMap.name;

            if (childMap.correspondingLocationId) {
                location = await this.locationService.getLocation(childMap.correspondingLocationId);
                if (location) {
                    locationName = location.name;
                }
            }

            portals.push({
                map: childMap,
                location,
                locationName
            });
        }

        return portals;
    }
}
