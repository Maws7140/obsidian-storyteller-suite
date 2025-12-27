import { App, TFile } from 'obsidian';
import { MarkerDefinition } from './types';
import type StorytellerSuitePlugin from '../main';
import { Character, Location, Event, PlotItem, Group, StoryMap as Map } from '../types';

/**
 * Entity Marker Discovery
 * Discovers entities from various sources and converts them to map markers
 */
export class EntityMarkerDiscovery {
    constructor(
        private app: App,
        private plugin: StorytellerSuitePlugin
    ) {}

    /**
     * Discover markers from all available sources
     * Priority: explicit markers > mapId links > mapCoordinates > tags > relationships
     */
    async discoverMarkers(
        mapId: string | undefined,
        explicitMarkers: MarkerDefinition[],
        markerTags?: string[]
    ): Promise<MarkerDefinition[]> {
        const markers: MarkerDefinition[] = [];

        // 1. Add explicit markers (highest priority)
        markers.push(...explicitMarkers);

        // 2. Discover entities linked to this map via mapId
        if (mapId) {
            const linkedMarkers = await this.discoverLinkedEntities(mapId);
            markers.push(...linkedMarkers);
        }

        // 3. Discover entities with mapCoordinates in frontmatter
        const coordinateMarkers = await this.discoverEntitiesWithCoordinates();
        markers.push(...coordinateMarkers);

        // 4. Discover entities by tags
        if (markerTags && markerTags.length > 0) {
            const tagMarkers = await this.discoverEntitiesByTags(markerTags);
            markers.push(...tagMarkers);
        }

        // Remove duplicates (same link)
        const seen = new Set<string>();
        return markers.filter(marker => {
            if (!marker.link) return true;
            if (seen.has(marker.link)) return false;
            seen.add(marker.link);
            return true;
        });
    }

    /**
     * Discover entities that are linked to a specific map
     */
    private async discoverLinkedEntities(mapId: string): Promise<MarkerDefinition[]> {
        const markers: MarkerDefinition[] = [];

        // Get all entities and check if they reference this map
        const [characters, locations, events, items] = await Promise.all([
            this.plugin.listCharacters().catch(() => [] as Character[]),
            this.plugin.listLocations().catch(() => [] as Location[]),
            this.plugin.listEvents().catch(() => [] as Event[]),
            this.plugin.listPlotItems().catch(() => [] as PlotItem[])
        ]);
        
        // Groups are stored in settings, not as entities
        const groups = this.plugin.settings.groups || [];

        // Check characters
        for (const char of characters) {
            const file = char.filePath ? this.app.vault.getAbstractFileByPath(char.filePath) : null;
            if (file instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fm = cache?.frontmatter as any;
                if (fm?.mapId === mapId || (Array.isArray(fm?.relatedMapIds) && fm.relatedMapIds.includes(mapId))) {
                    const marker = await this.entityToMarker(char, 'character', file);
                    if (marker) markers.push(marker);
                }
            }
        }

        // Check locations
        for (const loc of locations) {
            const file = loc.filePath ? this.app.vault.getAbstractFileByPath(loc.filePath) : null;
            if (file instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fm = cache?.frontmatter as any;
                if (fm?.mapId === mapId || (Array.isArray(fm?.relatedMapIds) && fm.relatedMapIds.includes(mapId))) {
                    const marker = await this.entityToMarker(loc, 'location', file);
                    if (marker) markers.push(marker);
                }
            }
        }

        // Check events
        for (const evt of events) {
            const file = evt.filePath ? this.app.vault.getAbstractFileByPath(evt.filePath) : null;
            if (file instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fm = cache?.frontmatter as any;
                if (fm?.mapId === mapId || (Array.isArray(fm?.relatedMapIds) && fm.relatedMapIds.includes(mapId))) {
                    const marker = await this.entityToMarker(evt, 'event', file);
                    if (marker) markers.push(marker);
                }
            }
        }

        // Check items
        for (const item of items) {
            const file = item.filePath ? this.app.vault.getAbstractFileByPath(item.filePath) : null;
            if (file instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fm = cache?.frontmatter as any;
                if (fm?.mapId === mapId || (Array.isArray(fm?.relatedMapIds) && fm.relatedMapIds.includes(mapId))) {
                    const marker = await this.entityToMarker(item, 'item', file);
                    if (marker) markers.push(marker);
                }
            }
        }

        // Check groups (factions/organizations)
        // Groups don't have filePath - they're stored in settings
        // We can't create markers for groups directly, but they can be linked via other entities

        return markers;
    }

    /**
     * Discover entities with mapCoordinates in frontmatter
     */
    private async discoverEntitiesWithCoordinates(): Promise<MarkerDefinition[]> {
        const markers: MarkerDefinition[] = [];

        const [characters, locations, events, items] = await Promise.all([
            this.plugin.listCharacters().catch(() => [] as Character[]),
            this.plugin.listLocations().catch(() => [] as Location[]),
            this.plugin.listEvents().catch(() => [] as Event[]),
            this.plugin.listPlotItems().catch(() => [] as PlotItem[]),
        ]);

        // Check all entity types for mapCoordinates
        const allEntities = [
            ...characters.map(e => ({ entity: e, type: 'character' as const, file: e.filePath })),
            ...locations.map(e => ({ entity: e, type: 'location' as const, file: e.filePath })),
            ...events.map(e => ({ entity: e, type: 'event' as const, file: e.filePath })),
            ...items.map(e => ({ entity: e, type: 'item' as const, file: e.filePath }))
        ];

        for (const { entity, type, file } of allEntities) {
            if (!file) continue;
            const fileObj = this.app.vault.getAbstractFileByPath(file);
            if (!(fileObj instanceof TFile)) continue;

            const cache = this.app.metadataCache.getFileCache(fileObj);
            const fm = cache?.frontmatter as any;

            // Check for mapCoordinates, lat/long, or location array
            let coords: [number, number] | undefined;
            if (fm?.mapCoordinates && Array.isArray(fm.mapCoordinates) && fm.mapCoordinates.length >= 2) {
                coords = [Number(fm.mapCoordinates[0]), Number(fm.mapCoordinates[1])];
            } else if (fm?.lat !== undefined && fm?.long !== undefined) {
                coords = [Number(fm.lat), Number(fm.long)];
            } else if (fm?.location && Array.isArray(fm.location) && fm.location.length >= 2) {
                coords = [Number(fm.location[0]), Number(fm.location[1])];
            }

            if (coords && !isNaN(coords[0]) && !isNaN(coords[1])) {
                const marker = await this.entityToMarker(entity, type, fileObj, coords);
                if (marker) markers.push(marker);
            }
        }

        return markers;
    }

    /**
     * Discover entities by tags
     */
    private async discoverEntitiesByTags(tags: string[]): Promise<MarkerDefinition[]> {
        const markers: MarkerDefinition[] = [];
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;

            const fileTags = cache.frontmatter.tags || [];
            const hasMatchingTag = tags.some(tag =>
                fileTags.includes(tag) || fileTags.includes(`#${tag}`)
            );

            if (hasMatchingTag) {
                // Try to determine entity type and create marker
                const marker = await this.fileToMarker(file);
                if (marker) markers.push(marker);
            }
        }

        return markers;
    }

    /**
     * Convert an entity to a marker
     */
    private async entityToMarker(
        entity: Character | Location | Event | PlotItem | Group,
        type: 'character' | 'location' | 'event' | 'item' | 'group',
        file: TFile,
        coords?: [number, number]
    ): Promise<MarkerDefinition | null> {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return null;

        const fm = cache.frontmatter as any;

        // Get coordinates
        let location: [number, number] | undefined = coords;
        if (!location) {
            if (fm?.mapCoordinates && Array.isArray(fm.mapCoordinates) && fm.mapCoordinates.length >= 2) {
                location = [Number(fm.mapCoordinates[0]), Number(fm.mapCoordinates[1])];
            } else if (fm?.lat !== undefined && fm?.long !== undefined) {
                location = [Number(fm.lat), Number(fm.long)];
            } else if (fm?.location && Array.isArray(fm.location) && fm.location.length >= 2) {
                location = [Number(fm.location[0]), Number(fm.location[1])];
            }
        }

        if (!location) return null;

        const marker: MarkerDefinition = {
            type: type === 'item' ? 'default' : type,
            loc: location,
            link: `[[${file.basename}]]`,
            description: entity.name,
            id: fm?.markerId || `${type}-${file.basename}`
        };

        // Add custom icon/color if specified
        if (fm?.mapIcon) marker.icon = fm.mapIcon;
        if (fm?.mapColor) marker.iconColor = fm.mapColor;
        if (fm?.markerIcon) marker.icon = fm.markerIcon;
        if (fm?.markerColor) marker.iconColor = fm.markerColor;

        return marker;
    }

    /**
     * Convert a file to a marker (when entity type is unknown)
     */
    private async fileToMarker(file: TFile): Promise<MarkerDefinition | null> {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return null;

        const fm = cache.frontmatter as any;

        // Get coordinates
        let location: [number, number] | undefined;
        if (fm?.mapCoordinates && Array.isArray(fm.mapCoordinates) && fm.mapCoordinates.length >= 2) {
            location = [Number(fm.mapCoordinates[0]), Number(fm.mapCoordinates[1])];
        } else if (fm?.lat !== undefined && fm?.long !== undefined) {
            location = [Number(fm.lat), Number(fm.long)];
        } else if (fm?.location && Array.isArray(fm.location) && fm.location.length >= 2) {
            location = [Number(fm.location[0]), Number(fm.location[1])];
        }

        if (!location) return null;

        const marker: MarkerDefinition = {
            type: 'default',
            loc: location,
            link: `[[${file.basename}]]`,
            description: file.basename,
            id: `marker-${file.basename}`
        };

        if (fm?.mapIcon) marker.icon = fm.mapIcon;
        if (fm?.mapColor) marker.iconColor = fm.mapColor;

        return marker;
    }
}

