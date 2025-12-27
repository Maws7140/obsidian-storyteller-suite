import { MarkdownPostProcessorContext, Notice } from 'obsidian';
import { parseBlockParameters } from './utils/parser';
import { LeafletRenderer } from './renderer';
import type { BlockParameters } from './types';
import type StorytellerSuitePlugin from '../main';

/**
 * Code Block Processor for storyteller-map blocks
 *
 * Processes markdown code blocks with the syntax:
 * ```storyteller-map
 * type: image
 * image: [[Map.png]]
 * marker: [50%, 50%, [[Location]], Marker description]
 * ```
 */
export class LeafletCodeBlockProcessor {
    // Track active maps for cleanup
    private activeMaps: globalThis.Map<string, LeafletRenderer> = new globalThis.Map();

    constructor(private plugin: StorytellerSuitePlugin) {}

    /**
     * Register the code block processor with Obsidian
     */
    register(): void {
        this.plugin.registerMarkdownCodeBlockProcessor(
            'storyteller-map',
            this.processCodeBlock.bind(this)
        );
    }

    /**
     * Process a storyteller-map code block
     */
    async processCodeBlock(
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext
    ): Promise<void> {
        try {
            // Parse YAML parameters
            let params = parseBlockParameters(source);

            // If mapId is provided, load config from Map entity
            if (params.mapId) {
                const mapEntity = await this.loadMapFromEntity(params.mapId, ctx.sourcePath);
                if (mapEntity) {
                    // Merge: inline params override entity config
                    params = this.mergeMapConfig(mapEntity, params);
                } else {
                    this.renderError(el, `Map entity not found: ${params.mapId}`);
                    return;
                }
            }

            // Validate required parameters
            const validationError = this.validateParameters(params);
            if (validationError) {
                this.renderError(el, validationError);
                return;
            }

            // Generate unique ID if not provided
            if (!params.id) {
                params.id = this.generateMapId(ctx);
            }

            // Create map container
            const container = this.createMapContainer(el, params);

            // Create renderer
            const renderer = new LeafletRenderer(
                this.plugin,
                container,
                params,
                ctx
            );

            // Register renderer as child component for proper lifecycle management
            // Following javalent-obsidian-leaflet pattern: renderer implements Component
            // This ensures onload() is called automatically when the component is added to the DOM
            // onload() will handle initialization - no need to call initialize() manually
            ctx.addChild(renderer as any);

            // Track the map
            this.activeMaps.set(params.id, renderer);

            // Clean up tracking when renderer is unloaded
            renderer.register(() => {
                this.activeMaps.delete(params.id!);
            });

            // Note: No manual initialization needed here
            // The onload() lifecycle method will be called automatically by Obsidian
            // when the component is added to the DOM via ctx.addChild()

        } catch (error) {
            console.error('Error rendering storyteller-map:', error);
            this.renderError(
                el,
                `Failed to render map: ${error.message}`
            );
        }
    }

    /**
     * Validate block parameters
     */
    private validateParameters(params: BlockParameters): string | null {
        // Image map validation
        if (params.type === 'image') {
            if (!params.image) {
                return 'Image maps require an "image" parameter';
            }
        }

        // Real map validation
        if (params.type === 'real') {
            // Lat/long are optional - will use defaults if not provided
            if (params.lat !== undefined && (isNaN(params.lat) || params.lat < -90 || params.lat > 90)) {
                return 'Invalid latitude (must be between -90 and 90)';
            }
            if (params.long !== undefined && (isNaN(params.long) || params.long < -180 || params.long > 180)) {
                return 'Invalid longitude (must be between -180 and 180)';
            }
        }

        return null;
    }

    /**
     * Generate a unique map ID based on context
     */
    private generateMapId(ctx: MarkdownPostProcessorContext): string {
        const filePath = ctx.sourcePath;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 5);

        // Create ID from file path, timestamp and random suffix
        return `map-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}-${random}`;
    }

    /**
     * Create the map container element
     * Ensures container has explicit dimensions before returning
     */
    private createMapContainer(
        el: HTMLElement,
        params: BlockParameters
    ): HTMLElement {
        const container = el.createDiv('storyteller-map-container');

        // Set dimensions
        const height = params.height ?? 500;
        const width = params.width ?? '100%';

        // Ensure explicit pixel dimensions for Leaflet
        // If percentage-based, set a minimum to ensure Leaflet can calculate
        container.style.height = typeof height === 'number' ? `${height}px` : height;
        container.style.width = typeof width === 'number' ? `${width}px` : width;
        container.style.position = 'relative';
        container.style.minHeight = typeof height === 'number' ? `${height}px` : '500px';
        container.style.minWidth = typeof width === 'number' ? `${width}px` : '100px';

        // Set the actual id attribute for Leaflet to use
        // Following standard Leaflet pattern: L.map('id-string')
        if (params.id) {
            container.id = params.id;
            container.dataset.mapId = params.id;
        }

        return container;
    }

    /**
     * Render an error message
     */
    private renderError(el: HTMLElement, message: string): void {
        const errorDiv = el.createDiv('storyteller-map-error');
        errorDiv.style.padding = '1em';
        errorDiv.style.border = '1px solid var(--background-modifier-error)';
        errorDiv.style.borderRadius = '4px';
        errorDiv.style.backgroundColor = 'var(--background-modifier-error)';
        errorDiv.style.color = 'var(--text-error)';

        const title = errorDiv.createEl('strong');
        title.textContent = 'Map Error: ';

        const text = errorDiv.createSpan();
        text.textContent = message;

        // Also show a notice
        new Notice(`Storyteller Map: ${message}`);
    }

    /**
     * Get an active map by ID
     */
    getMap(id: string): LeafletRenderer | undefined {
        return this.activeMaps.get(id);
    }

    /**
     * Get all active maps
     */
    getAllMaps(): LeafletRenderer[] {
        return Array.from(this.activeMaps.values());
    }

    /**
     * Invalidate all active map sizes
     * Called when device orientation changes or window is resized
     * Forces Leaflet to recalculate map dimensions
     */
    invalidateAllMapSizes(): void {
        for (const renderer of this.activeMaps.values()) {
            renderer.invalidateSize();
        }
    }

    /**
     * Cleanup all maps
     */
    cleanup(): void {
        for (const renderer of this.activeMaps.values()) {
            renderer.destroy();
        }
        this.activeMaps.clear();
    }

    /**
     * Load map configuration from Map entity
     */
    private async loadMapFromEntity(mapId: string, sourcePath: string): Promise<any | null> {
        // Extract map name from link
        const mapName = mapId.replace(/[\[\]]/g, '').split('|')[0];
        
        // Try to find the map entity
        const map = await this.plugin.getMapByName(mapName);
        if (!map) {
            // Try by ID
            const mapById = await this.plugin.getMapById(mapName);
            return mapById;
        }
        
        return map;
    }

    /**
     * Merge map entity config with inline parameters
     * Inline parameters override entity config
     */
    private mergeMapConfig(mapEntity: any, inlineParams: BlockParameters): BlockParameters {
        const merged: BlockParameters = {
            // Start with entity config
            type: mapEntity.type || 'image',
            image: mapEntity.backgroundImagePath || mapEntity.image,
            lat: mapEntity.lat || mapEntity.center?.[0],
            long: mapEntity.long || mapEntity.center?.[1],
            defaultZoom: mapEntity.defaultZoom,
            minZoom: mapEntity.minZoom,
            maxZoom: mapEntity.maxZoom,
            tileServer: mapEntity.tileServer,
            darkMode: mapEntity.darkMode,
            width: mapEntity.width,
            height: mapEntity.height,
            bounds: mapEntity.bounds,
            id: mapEntity.id,
            // Override with inline params
            ...inlineParams
        };

        // Merge markers: combine entity markers with inline markers
        if (mapEntity.markers && Array.isArray(mapEntity.markers)) {
            const entityMarkers = mapEntity.markers.map((m: any) => {
                if (typeof m === 'string') return m;
                // Convert marker object to string format
                const coords = m.lat !== undefined && m.lng !== undefined
                    ? `${m.lat},${m.lng}`
                    : m.loc ? `${m.loc[0]},${m.loc[1]}` : '';
                const parts = [coords];
                if (m.link) parts.push(m.link);
                if (m.description) parts.push(m.description);
                return parts.join(',');
            });
            
            if (inlineParams.marker) {
                const inlineMarkers = Array.isArray(inlineParams.marker)
                    ? inlineParams.marker
                    : [inlineParams.marker];
                merged.marker = [...entityMarkers, ...inlineMarkers];
            } else {
                merged.marker = entityMarkers;
            }
        }

        return merged;
    }
}
