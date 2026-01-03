import * as L from 'leaflet';
import { TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';

/**
 * ObsidianTileLayer - Custom Leaflet tile layer for Obsidian vault tiles
 *
 * Extends L.TileLayer to work with Obsidian's vault file system.
 * Resolves tile paths using vault.adapter.getResourcePath() to get browser-accessible URLs.
 *
 * Why this is needed:
 * - Standard L.TileLayer expects HTTP URLs (https://tiles.com/{z}/{x}/{y}.png)
 * - Obsidian vault files need special handling to convert to app:// protocol URLs
 * - Missing tiles should show transparent instead of broken image icons
 *
 * Usage:
 * ```typescript
 * const tileLayer = new ObsidianTileLayer(
 *     plugin,
 *     imageHash,
 *     'StorytellerSuite/MapTiles/abc123',
 *     { minZoom: 0, maxZoom: 5, tileSize: 256 }
 * );
 * tileLayer.addTo(map);
 * ```
 */
export class ObsidianTileLayer extends L.TileLayer {
    private _emptyTileUrl: string;

    /**
     * Create a new ObsidianTileLayer
     *
     * @param plugin - StorytellerSuitePlugin instance
     * @param hash - Image hash (used for logging/debugging)
     * @param basePath - Base vault path to tiles (e.g., "StorytellerSuite/MapTiles/abc123")
     * @param options - Standard Leaflet TileLayer options
     */
    constructor(
        private plugin: StorytellerSuitePlugin,
        private hash: string,
        private basePath: string,
        options: L.TileLayerOptions
    ) {
        // Pass dummy URL template to parent - we override getTileUrl() but Leaflet needs a non-empty template
        super('{z}/{x}/{y}', options);

        // 1x1 transparent PNG as data URI for missing tiles
        // This prevents broken image icons from showing
        this._emptyTileUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }

    /**
     * Get URL for a specific tile
     * Overrides L.TileLayer.getTileUrl()
     *
     * @param coords - Tile coordinates (z/x/y)
     * @returns Browser-accessible URL for the tile
     */
    getTileUrl(coords: L.Coords): string {
        console.log(`[ObsidianTileLayer] getTileUrl called for z=${coords.z}, x=${coords.x}, y=${coords.y}`);
        
        // Construct vault path: basePath/z/x/y.png
        const tilePath = `${this.basePath}/${coords.z}/${coords.x}/${coords.y}.png`;
        console.log(`[ObsidianTileLayer] Looking for tile at: ${tilePath}`);

        // Check if tile exists in vault
        const file = this.plugin.app.vault.getAbstractFileByPath(tilePath);

        if (file instanceof TFile) {
            // Convert vault path to browser-accessible URL
            // Returns something like: app://local/path/to/vault/StorytellerSuite/MapTiles/abc123/0/0/0.png
            const url = this.plugin.app.vault.adapter.getResourcePath(file.path);
            console.log(`[ObsidianTileLayer] Loading tile ${coords.z}/${coords.x}/${coords.y} -> ${url.substring(0, 50)}...`);
            return url;
        }

        // Tile doesn't exist - log warning and return transparent PNG
        console.warn(`[ObsidianTileLayer] Missing tile: ${tilePath}`);
        return this._emptyTileUrl;
    }

    /**
     * Check if a tile exists in the vault
     * Can be used by Leaflet for tile existence checks
     *
     * @param coords - Tile coordinates
     * @returns True if tile exists
     */
    _isValidTile(coords: L.Coords): boolean {
        const tilePath = `${this.basePath}/${coords.z}/${coords.x}/${coords.y}.png`;
        return this.plugin.app.vault.getAbstractFileByPath(tilePath) !== null;
    }

    /**
     * Override createTile to add error handling and force visibility
     * Creates the DOM element for a tile
     */
    createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
        const tile = document.createElement('img');

        // CRITICAL: Set explicit styles to ensure tile is visible
        // Sometimes Leaflet's default styles don't get applied correctly
        tile.style.width = `${this.options.tileSize || 256}px`;
        tile.style.height = `${this.options.tileSize || 256}px`;
        tile.style.display = 'block';
        tile.style.opacity = '1';
        tile.style.visibility = 'visible';

        L.DomEvent.on(tile, 'load', () => {
            // CRITICAL: Force tile to be visible after load
            tile.style.opacity = '1';
            tile.style.visibility = 'visible';
            done(undefined, tile);
        });

        L.DomEvent.on(tile, 'error', () => {
            // On error, use transparent tile
            tile.src = this._emptyTileUrl;
            done(undefined, tile);
        });

        // Set tile URL
        tile.src = this.getTileUrl(coords);

        return tile;
    }

    /**
     * Override onAdd to force initial tile visibility
     */
    onAdd(map: L.Map): this {
        const result = super.onAdd(map);
        
        // Force visibility after adding to map
        setTimeout(() => {
            this._forceVisibility();
        }, 100);
        
        return result;
    }

    /**
     * Force all tiles to be visible
     * Works around Leaflet's lazy tile rendering issues
     */
    private _forceVisibility(): void {
        const container = this.getContainer();
        if (!container) return;

        // Force tile container to be visible
        container.style.opacity = '1';
        container.style.visibility = 'visible';

        // Force all tile images to be visible
        const tiles = container.querySelectorAll('img');
        tiles.forEach((tile) => {
            tile.style.opacity = '1';
            tile.style.visibility = 'visible';
        });

        console.log(`[ObsidianTileLayer] Forced visibility on ${tiles.length} tiles`);
    }
}
