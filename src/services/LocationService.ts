/**
 * LocationService - Manages location hierarchy, map bindings, and entity relationships
 * Provides methods for navigating and manipulating the location tree structure
 */

import { requestUrl } from 'obsidian';
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

        // Resolve map name for human-readable display in Properties
        let mapName: string | undefined;
        try {
            const maps = await this.plugin.listMaps();
            const map = maps.find(m => (m.id || m.name) === mapId);
            mapName = map?.name;
        } catch (e) {
            console.warn('Could not resolve map name for binding:', e);
        }

        // Check if binding already exists for this map
        const existingIndex = location.mapBindings.findIndex(b => b.mapId === mapId);
        const binding: MapBinding = {
            mapId,
            mapName,
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
     * Find all locations at or near specific coordinates on a map
     * Uses proximity-based matching with configurable tolerance
     * @param mapId The map ID to search on
     * @param coordinates The [x, y] or [lat, lng] coordinates to search near
     * @param tolerance Distance tolerance (pixels for image maps, degrees for real-world maps)
     * @returns Array of locations within tolerance, sorted by distance
     */
    async findLocationsAtCoordinates(
        mapId: string,
        coordinates: [number, number],
        tolerance: number
    ): Promise<Location[]> {
        const allLocations = await this.plugin.listLocations();

        // Filter locations that have bindings on this map
        const locationsOnMap = allLocations.filter(loc =>
            loc.mapBindings?.some(binding => binding.mapId === mapId)
        );

        if (locationsOnMap.length === 0) {
            return [];
        }

        const nearbyLocations: { location: Location; distance: number }[] = [];

        for (const location of locationsOnMap) {
            const binding = location.mapBindings!.find(b => b.mapId === mapId);
            if (!binding) continue;

            const distance = this.calculateDistance(coordinates, binding.coordinates);

            if (distance <= tolerance) {
                nearbyLocations.push({ location, distance });
            }
        }

        // Sort by distance
        nearbyLocations.sort((a, b) => a.distance - b.distance);

        return nearbyLocations.map(item => item.location);
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

        // Resolve entity name for human-readable display in Properties
        let entityName: string | undefined;
        try {
            switch (entityRef.entityType) {
                case 'character': {
                    const characters = await this.plugin.listCharacters();
                    const char = characters.find(c => (c.id || c.name) === entityRef.entityId);
                    entityName = char?.name;
                    break;
                }
                case 'event': {
                    const events = await this.plugin.listEvents();
                    const event = events.find(e => (e.id || e.name) === entityRef.entityId);
                    entityName = event?.name;
                    break;
                }
                case 'item': {
                    const items = await this.plugin.listPlotItems();
                    const item = items.find(i => (i.id || i.name) === entityRef.entityId);
                    entityName = item?.name;
                    break;
                }
            }
        } catch (e) {
            console.warn('Could not resolve entity name for ref:', e);
        }

        // Check if entity already exists at this location
        const existingIndex = location.entityRefs.findIndex(
            e => e.entityId === entityRef.entityId && e.entityType === entityRef.entityType
        );

        const refWithName: EntityRef = {
            ...entityRef,
            entityName
        };

        if (existingIndex >= 0) {
            location.entityRefs[existingIndex] = refWithName;
        } else {
            location.entityRefs.push(refWithName);
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

    // =========================================================================
    // Real-World Map Location Methods
    // =========================================================================

    /**
     * Find an existing location by name (case-insensitive, supports partial matching)
     * Prioritizes exact matches, then partial matches
     * @param searchName The name to search for
     * @returns The matching location or null if not found
     */
    async findLocationByName(searchName: string): Promise<Location | null> {
        if (!searchName) return null;
        
        const allLocations = await this.plugin.listLocations();
        const searchLower = searchName.toLowerCase().trim();
        
        // First, try exact match (case-insensitive)
        let match = allLocations.find(loc => 
            loc.name.toLowerCase().trim() === searchLower
        );
        
        if (match) return match;
        
        // Second, try if search name contains or is contained in location name
        match = allLocations.find(loc => {
            const locLower = loc.name.toLowerCase().trim();
            return locLower.includes(searchLower) || searchLower.includes(locLower);
        });
        
        return match || null;
    }

    /**
     * Find location by OSM place ID (for precise matching of geocoded locations)
     * @param osmPlaceId The OpenStreetMap place ID
     * @returns The matching location or null
     */
    async findLocationByOsmPlaceId(osmPlaceId: string): Promise<Location | null> {
        if (!osmPlaceId) return null;
        
        const allLocations = await this.plugin.listLocations();
        return allLocations.find(loc => 
            loc.customFields?.osmPlaceId === osmPlaceId
        ) || null;
    }

    /**
     * Reverse geocode coordinates to get location name (simple version)
     * Uses OpenStreetMap Nominatim API
     * @param lat Latitude
     * @param lng Longitude
     * @returns Location name or null if not found
     */
    async reverseGeocode(lat: number, lng: number): Promise<string | null> {
        const result = await this.reverseGeocodeDetailed(lat, lng);
        return result?.name || null;
    }

    /**
     * Enhanced reverse geocode that returns full place information
     * Used for matching existing locations and creating detailed new ones
     * Uses Obsidian's requestUrl to bypass CORS restrictions
     * @param lat Latitude
     * @param lng Longitude
     * @returns Detailed geocode result with full hierarchy or null
     */
    async reverseGeocodeDetailed(lat: number, lng: number): Promise<GeocodeResult | null> {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

            // Use Obsidian's requestUrl to bypass CORS restrictions
            const response = await requestUrl({
                url: url,
                method: 'GET',
                headers: {
                    'User-Agent': 'Obsidian-Storyteller-Suite/1.0'
                }
            });

            // requestUrl returns data directly in response.json
            const data = response.json;
            if (!data || data.error) {
                console.warn('Nominatim returned error:', data?.error);
                return null;
            }

            const address = data.address || {};

            // Build hierarchy from address components
            const building = address.tourism || address.amenity || address.building || 
                           address.shop || address.historic || address.railway || 
                           address.aeroway || address.office || address.craft;
            
            const neighborhood = address.neighbourhood || address.suburb || address.quarter;
            const city = address.city || address.town || address.village || address.hamlet || address.municipality;
            const region = address.state || address.province || address.county || address.region;
            const country = address.country;
            const continent = getContinent(country);

            // Build a meaningful default name (most specific available)
            const name = building || neighborhood || city || region || country || data.display_name;

            return {
                name: name || data.display_name,
                displayName: data.display_name,
                placeId: String(data.place_id),
                type: data.type || 'place',
                hierarchy: {
                    building,
                    neighborhood,
                    city,
                    region,
                    country,
                    continent
                },
                // Legacy fields
                city,
                state: region,
                country
            };
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            return null;
        }
    }

    /**
     * Select the appropriate location name based on level preference and zoom
     * @param geoResult The geocode result with hierarchy
     * @param level The requested location level ('auto' or specific level)
     * @param zoom Current map zoom level (used when level is 'auto')
     * @returns The selected name and inferred type
     */
    selectLocationByLevel(
        geoResult: GeocodeResult, 
        level: LocationLevel, 
        zoom?: number
    ): { name: string; type: Location['type'] } {
        const h = geoResult.hierarchy;
        
        // If auto, determine level from zoom
        let effectiveLevel = level;
        if (level === 'auto' && zoom !== undefined) {
            if (zoom >= 16) {
                effectiveLevel = 'building';
            } else if (zoom >= 14) {
                effectiveLevel = 'neighborhood';
            } else if (zoom >= 10) {
                effectiveLevel = 'city';
            } else if (zoom >= 6) {
                effectiveLevel = 'region';
            } else if (zoom >= 3) {
                effectiveLevel = 'country';
            } else {
                effectiveLevel = 'continent';
            }
            console.log(`[LocationService] Auto-detected level from zoom ${zoom}: ${effectiveLevel}`);
        }

        // Select based on level, falling back to more general if specific not available
        switch (effectiveLevel) {
            case 'building':
                if (h.building) return { name: h.building, type: 'building' };
                if (h.neighborhood) return { name: h.neighborhood, type: 'district' };
                if (h.city) return { name: h.city, type: 'city' };
                break;
            case 'neighborhood':
                if (h.neighborhood) return { name: h.neighborhood, type: 'district' };
                if (h.city) return { name: h.city, type: 'city' };
                break;
            case 'city':
                if (h.city) return { name: h.city, type: 'city' };
                if (h.region) return { name: h.region, type: 'region' };
                break;
            case 'region':
                if (h.region) return { name: h.region, type: 'region' };
                if (h.country) return { name: h.country, type: 'region' };
                break;
            case 'country':
                if (h.country) return { name: h.country, type: 'region' };
                if (h.continent) return { name: h.continent, type: 'continent' };
                break;
            case 'continent':
                if (h.continent) return { name: h.continent, type: 'continent' };
                if (h.country) return { name: h.country, type: 'region' };
                break;
        }

        // Fallback to default name
        return { name: geoResult.name, type: this.inferLocationType(geoResult.type) };
    }

    /**
     * Find or create a location for a real-world map placement
     * This is the main entry point for world map entity placement
     * 
     * Workflow:
     * 1. Reverse geocode the coordinates to get place information
     * 2. Select appropriate name based on level preference and zoom
     * 3. Search for existing location by name (fuzzy match)
     * 4. If found, add map binding if needed and return existing location
     * 5. If not found, create new location with full geocoded data
     * 
     * @param mapId The map ID
     * @param coordinates The clicked coordinates [lat, lng]
     * @param entityInfo Info about the entity being placed (for description)
     * @param options Optional level and zoom settings
     * @returns The found or created location and whether it was newly created
     */
    async findOrCreateForRealWorldMap(
        mapId: string,
        coordinates: [number, number],
        entityInfo: { type: string; name: string },
        options?: { level?: LocationLevel; zoom?: number }
    ): Promise<{ location: Location; isNew: boolean; selectedLevel?: string }> {
        const level = options?.level || 'auto';
        const zoom = options?.zoom;

        // Step 1: Reverse geocode to get place information
        console.log('[LocationService] Reverse geocoding coordinates:', coordinates);
        const geoResult = await this.reverseGeocodeDetailed(coordinates[0], coordinates[1]);
        
        if (!geoResult) {
            console.warn('[LocationService] Reverse geocoding failed, creating location with coordinates');
            // Fallback: create location with coordinate-based name
            const coordText = `${coordinates[0].toFixed(4)}, ${coordinates[1].toFixed(4)}`;
            const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const newLocation: Location = {
                id: locationId,
                name: `Location at ${coordText}`,
                description: `Auto-created location for ${entityInfo.type} "${entityInfo.name}"`,
                type: 'custom',
                mapBindings: [{
                    mapId: mapId,
                    coordinates: coordinates
                }]
            };
            
            await this.plugin.saveLocation(newLocation);
            return { location: newLocation, isNew: true };
        }

        // Step 2: Select appropriate name based on level/zoom
        const selected = this.selectLocationByLevel(geoResult, level, zoom);
        console.log('[LocationService] Selected location:', selected.name, 'at level:', level, 'zoom:', zoom);
        
        // Log available hierarchy for debugging
        console.log('[LocationService] Available hierarchy:', geoResult.hierarchy);
        
        // Step 3: Search for existing location by name
        let existingLocation = await this.findLocationByName(selected.name);
        
        // Also try OSM place ID for exact matches
        if (!existingLocation) {
            existingLocation = await this.findLocationByOsmPlaceId(geoResult.placeId);
        }
        
        if (existingLocation) {
            console.log('[LocationService] Found existing location:', existingLocation.name);
            
            // Check if this location already has a binding for this map
            const hasBinding = existingLocation.mapBindings?.some(b => b.mapId === mapId);
            
            if (!hasBinding) {
                // Add map binding to existing location
                await this.addMapBinding(
                    existingLocation.id || existingLocation.name,
                    mapId,
                    coordinates
                );
                console.log('[LocationService] Added map binding to existing location');
            }
            
            return { location: existingLocation, isNew: false, selectedLevel: level };
        }
        
        // Step 4: Create new location with selected name
        console.log('[LocationService] No existing location found, creating new:', selected.name);
        const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Build a rich description with full hierarchy
        const h = geoResult.hierarchy;
        const descParts = [`Real-world location: ${geoResult.displayName}`];
        if (h.building && h.building !== selected.name) descParts.push(`Building: ${h.building}`);
        if (h.neighborhood && h.neighborhood !== selected.name) descParts.push(`Neighborhood: ${h.neighborhood}`);
        if (h.city && h.city !== selected.name) descParts.push(`City: ${h.city}`);
        if (h.region && h.region !== selected.name) descParts.push(`Region: ${h.region}`);
        if (h.country && h.country !== selected.name) descParts.push(`Country: ${h.country}`);
        if (h.continent) descParts.push(`Continent: ${h.continent}`);
        
        const newLocation: Location = {
            id: locationId,
            name: selected.name,
            description: descParts.join('\n'),
            type: selected.type,
            region: h.region || h.country,
            mapBindings: [{
                mapId: mapId,
                coordinates: coordinates
            }],
            // Store OSM data and hierarchy for future reference
            // Only include defined values to satisfy Record<string, string> type
            customFields: Object.fromEntries(
                Object.entries({
                    osmPlaceId: geoResult.placeId,
                    osmType: geoResult.type,
                    osmDisplayName: geoResult.displayName,
                    hierarchyCity: h.city,
                    hierarchyRegion: h.region,
                    hierarchyCountry: h.country,
                    hierarchyContinent: h.continent
                }).filter(([_, v]) => v !== undefined)
            ) as Record<string, string>
        };
        
        await this.plugin.saveLocation(newLocation);
        return { location: newLocation, isNew: true, selectedLevel: level };
    }

    /**
     * Infer a location type from OSM type string
     * Maps OpenStreetMap place types to our location type hierarchy
     */
    private inferLocationType(osmType: string): Location['type'] {
        const typeMap: Record<string, Location['type']> = {
            'city': 'city',
            'town': 'city',
            'village': 'city',
            'hamlet': 'city',
            'suburb': 'district',
            'neighbourhood': 'district',
            'quarter': 'district',
            'building': 'building',
            'house': 'building',
            'amenity': 'building',
            'shop': 'building',
            'tourism': 'building',
            'historic': 'building',
            'hotel': 'building',
            'restaurant': 'building',
            'country': 'region',
            'state': 'region',
            'county': 'region',
            'province': 'region',
            'continent': 'continent',
            'room': 'room'
        };
        return typeMap[osmType] || 'custom';
    }
}

/**
 * Location level for granularity control
 */
export type LocationLevel = 'auto' | 'building' | 'neighborhood' | 'city' | 'region' | 'country' | 'continent';

/**
 * Result from reverse geocoding a coordinate
 * Contains all available hierarchy levels from the address
 */
export interface GeocodeResult {
    /** Best name for the location (based on what OSM returns as primary) */
    name: string;
    /** Full display name from OSM */
    displayName: string;
    /** OpenStreetMap place ID (unique identifier) */
    placeId: string;
    /** OSM type (city, building, etc.) */
    type: string;
    
    /** All available address hierarchy levels */
    hierarchy: {
        building?: string;      // Building, amenity, shop, tourism, historic
        neighborhood?: string;  // Neighbourhood, suburb
        city?: string;          // City, town, village
        region?: string;        // State, province, county
        country?: string;       // Country
        continent?: string;     // Continent (derived from country)
    };
    
    /** Legacy fields for backward compatibility */
    city?: string;
    state?: string;
    country?: string;
}

/**
 * Mapping of countries to continents for continent-level location detection
 */
const COUNTRY_TO_CONTINENT: Record<string, string> = {
    // Africa
    'Ghana': 'Africa', 'Nigeria': 'Africa', 'Kenya': 'Africa', 'South Africa': 'Africa',
    'Egypt': 'Africa', 'Morocco': 'Africa', 'Ethiopia': 'Africa', 'Tanzania': 'Africa',
    'Algeria': 'Africa', 'Sudan': 'Africa', 'Uganda': 'Africa', 'Mozambique': 'Africa',
    'Madagascar': 'Africa', 'Cameroon': 'Africa', 'Angola': 'Africa', 'Niger': 'Africa',
    'Mali': 'Africa', 'Senegal': 'Africa', 'Zimbabwe': 'Africa', 'Rwanda': 'Africa',
    'Tunisia': 'Africa', 'Libya': 'Africa', 'Zambia': 'Africa', 'Botswana': 'Africa',
    
    // Europe
    'United Kingdom': 'Europe', 'France': 'Europe', 'Germany': 'Europe', 'Italy': 'Europe',
    'Spain': 'Europe', 'Poland': 'Europe', 'Romania': 'Europe', 'Netherlands': 'Europe',
    'Belgium': 'Europe', 'Greece': 'Europe', 'Portugal': 'Europe', 'Sweden': 'Europe',
    'Hungary': 'Europe', 'Austria': 'Europe', 'Switzerland': 'Europe', 'Norway': 'Europe',
    'Ireland': 'Europe', 'Denmark': 'Europe', 'Finland': 'Europe', 'Czech Republic': 'Europe',
    'Ukraine': 'Europe', 'Russia': 'Europe', 'Turkey': 'Europe',
    
    // Asia
    'China': 'Asia', 'India': 'Asia', 'Japan': 'Asia', 'South Korea': 'Asia',
    'Indonesia': 'Asia', 'Pakistan': 'Asia', 'Bangladesh': 'Asia', 'Vietnam': 'Asia',
    'Thailand': 'Asia', 'Myanmar': 'Asia', 'Malaysia': 'Asia', 'Philippines': 'Asia',
    'Saudi Arabia': 'Asia', 'United Arab Emirates': 'Asia', 'Iran': 'Asia', 'Iraq': 'Asia',
    'Israel': 'Asia', 'Singapore': 'Asia', 'Hong Kong': 'Asia', 'Taiwan': 'Asia',
    
    // North America
    'United States': 'North America', 'United States of America': 'North America',
    'Canada': 'North America', 'Mexico': 'North America', 'Guatemala': 'North America',
    'Cuba': 'North America', 'Haiti': 'North America', 'Dominican Republic': 'North America',
    'Honduras': 'North America', 'Nicaragua': 'North America', 'El Salvador': 'North America',
    'Costa Rica': 'North America', 'Panama': 'North America', 'Jamaica': 'North America',
    
    // South America
    'Brazil': 'South America', 'Argentina': 'South America', 'Colombia': 'South America',
    'Peru': 'South America', 'Venezuela': 'South America', 'Chile': 'South America',
    'Ecuador': 'South America', 'Bolivia': 'South America', 'Paraguay': 'South America',
    'Uruguay': 'South America', 'Guyana': 'South America', 'Suriname': 'South America',
    
    // Oceania
    'Australia': 'Oceania', 'New Zealand': 'Oceania', 'Papua New Guinea': 'Oceania',
    'Fiji': 'Oceania', 'Solomon Islands': 'Oceania', 'Vanuatu': 'Oceania',
    
    // Antarctica
    'Antarctica': 'Antarctica'
};

/**
 * Get continent from country name
 */
function getContinent(country: string | undefined): string | undefined {
    if (!country) return undefined;
    return COUNTRY_TO_CONTINENT[country] || undefined;
}