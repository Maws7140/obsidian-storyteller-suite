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
    private activeMaps: Map<string, LeafletRenderer> = new Map();

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
            const params = parseBlockParameters(source);

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

            // Create and initialize renderer
            const renderer = new LeafletRenderer(
                this.plugin,
                container,
                params,
                ctx
            );

            // Initialize the map
            await renderer.initialize();

            // Track the map
            this.activeMaps.set(params.id, renderer);

            // Register cleanup on section unload
            ctx.addChild({
                onunload: () => {
                    renderer.destroy();
                    this.activeMaps.delete(params.id!);
                }
            } as any);

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
     */
    private createMapContainer(
        el: HTMLElement,
        params: BlockParameters
    ): HTMLElement {
        const container = el.createDiv('storyteller-map-container');

        // Set dimensions
        const height = params.height ?? 500;
        const width = params.width ?? '100%';

        container.style.height = typeof height === 'number' ? `${height}px` : height;
        container.style.width = typeof width === 'number' ? `${width}px` : width;
        container.style.position = 'relative';

        // Add map ID as data attribute
        if (params.id) {
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
}
