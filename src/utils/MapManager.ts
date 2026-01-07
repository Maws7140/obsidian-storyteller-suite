import { App, TFile, normalizePath } from 'obsidian';
import { StoryMap as Map } from '../types';
import StorytellerSuitePlugin from '../main';

/**
 * Map Manager - Utility for managing Map entities
 * Handles CRUD operations for maps
 */
export class MapManager {
    constructor(
        private app: App,
        private plugin: StorytellerSuitePlugin
    ) {}

    /**
     * Get the map folder path for the active story
     */
    getMapFolder(): string {
        return this.plugin.getEntityFolder('map');
    }

    /**
     * Ensure the map folder exists
     */
    async ensureMapFolder(): Promise<void> {
        await this.plugin.ensureFolder(this.getMapFolder());
    }

    /**
     * Load all maps from the map folder
     */
    async listMaps(): Promise<Map[]> {
        await this.ensureMapFolder();
        const folderPath = this.getMapFolder();
        
        const allFiles = this.app.vault.getMarkdownFiles();
        const prefix = normalizePath(folderPath) + '/';
        const files = allFiles.filter(file => 
            file.path.startsWith(prefix) && 
            file.extension === 'md'
        );
        
        const maps: Map[] = [];
        for (const file of files) {
            const mapData = await this.plugin.parseFile<Map>(file, { name: '', markers: [], scale: 'custom' }, 'map');
            if (mapData) {
                // normalizeEntityCustomFields is private, so we'll handle it here if needed
                // For now, just use the parsed data directly
                maps.push(mapData);
            }
        }
        
        return maps.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get a map by ID
     */
    async getMapById(id: string): Promise<Map | null> {
        const maps = await this.listMaps();
        return maps.find(m => m.id === id) || null;
    }

    /**
     * Get a map by name
     */
    async getMapByName(name: string): Promise<Map | null> {
        const maps = await this.listMaps();
        return maps.find(m => m.name === name) || null;
    }

    /**
     * Get maps linked to a specific entity
     * Now supports all entity types uniformly
     */
    async getMapsForEntity(
        entityType: 'location' | 'character' | 'event' | 'item' | 'group' | 'culture' | 'economy' | 'magicsystem' | 'scene' | 'reference',
        entityName: string
    ): Promise<Map[]> {
        const maps = await this.listMaps();
        
        // Field mapping for all entity types
        const fieldMap: Record<string, keyof Map> = {
            location: 'linkedLocations',
            character: 'linkedCharacters',
            event: 'linkedEvents',
            item: 'linkedItems',
            group: 'linkedGroups',
            culture: 'linkedCultures',
            economy: 'linkedEconomies',
            magicsystem: 'linkedMagicSystems',
            scene: 'linkedScenes',
            reference: 'linkedReferences'
        };

        const field = fieldMap[entityType];
        return maps.filter(map => {
            const linked = map[field] as string[] | undefined;
            return linked && linked.includes(entityName);
        });
    }

    /**
     * Generate storyteller-map code block from Map entity
     * This creates the YAML configuration that the Leaflet renderer will parse
     */
    generateMapCodeBlock(map: Map): string {
        const lines: string[] = [];

        // Map type (required)
        lines.push(`type: ${map.type || 'image'}`);

        // Image-based map parameters
        if (map.type === 'image' || !map.type) {
            if (map.backgroundImagePath || map.image) {
                const imagePath = map.backgroundImagePath || map.image;
                lines.push(`image: [[${imagePath}]]`);
            }
            if (map.width) lines.push(`width: ${map.width}`);
            if (map.height) lines.push(`height: ${map.height}`);
        }

        // Real-world map parameters
        if (map.type === 'real') {
            if (map.lat !== undefined) lines.push(`lat: ${map.lat}`);
            if (map.long !== undefined) lines.push(`long: ${map.long}`);
            if (map.tileServer) lines.push(`tileServer: ${map.tileServer}`);
            if (map.darkMode) lines.push(`darkMode: ${map.darkMode}`);
        }

        // Common zoom parameters
        if (map.defaultZoom !== undefined) lines.push(`defaultZoom: ${map.defaultZoom}`);
        if (map.minZoom !== undefined) lines.push(`minZoom: ${map.minZoom}`);
        if (map.maxZoom !== undefined) lines.push(`maxZoom: ${map.maxZoom}`);

        // Grid (for dungeons/buildings)
        if (map.gridEnabled) {
            lines.push(`gridEnabled: true`);
            if (map.gridSize) lines.push(`gridSize: ${map.gridSize}`);
        }

        // Add markers
        if (map.markers && map.markers.length > 0) {
            lines.push(''); // Blank line before markers
            map.markers.forEach(marker => {
                const lat = marker.lat || 0;
                const lng = marker.lng || 0;
                const link = marker.locationName ? `[[${marker.locationName}]]` : (marker.eventName ? `[[${marker.eventName}]]` : '');
                const desc = marker.description || marker.label || '';
                lines.push(`marker: [${lat}, ${lng}, ${link}, ${desc}]`);
            });
        }

        // GeoJSON files
        if (map.geojsonFiles && map.geojsonFiles.length > 0) {
            map.geojsonFiles.forEach(file => {
                lines.push(`geojson: ${file}`);
            });
        }

        // GPX files
        if (map.gpxFiles && map.gpxFiles.length > 0) {
            map.gpxFiles.forEach(file => {
                lines.push(`gpx: ${file}`);
            });
        }

        return lines.join('\n');
    }
}