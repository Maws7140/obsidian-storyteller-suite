// Use global L object that's set in main.ts: (window as any).L = L
// Import Leaflet CSS to ensure it's loaded when renderer is used
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';
import { Component, MarkdownPostProcessorContext, Notice, TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { BlockParameters, MarkerDefinition, MapOptions, TileMetadata } from './types';
import { extractLinkPath, parseMarkerString } from './utils/parser';
import { RasterCoords } from './utils/RasterCoords';
import { EntityMarkerDiscovery } from './EntityMarkerDiscovery';
import { MapEntityRenderer } from './MapEntityRenderer';
import { ObsidianTileLayer } from './ObsidianTileLayer';

/**
 * Core Leaflet Map Renderer
 *
 * Handles rendering and managing Leaflet maps for both:
 * - Image-based maps (fantasy worlds, building layouts)
 * - Real-world maps (OpenStreetMap)
 * 
 * Implements Component interface for proper lifecycle management following javalent-obsidian-leaflet pattern
 */
export class LeafletRenderer extends Component {
    public containerEl: HTMLElement;
    private map: L.Map | null = null;
    private markers: globalThis.Map<string, L.Marker> = new globalThis.Map();
    private layers: globalThis.Map<string, L.LayerGroup> = new globalThis.Map();
    private imageOverlay: L.ImageOverlay | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private intersectionObserver: IntersectionObserver | null = null;
    private isInitialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;
    private mapEntityRenderer: MapEntityRenderer | null = null;
    private imageWidth: number = 0;
    private imageHeight: number = 0;
    private imageBounds: L.LatLngBounds | null = null;
    private wheelHandler: ((e: WheelEvent) => void) | null = null;
    private hasRenderedTiles: boolean = false;

    constructor(
        private plugin: StorytellerSuitePlugin,
        container: HTMLElement,
        private params: BlockParameters,
        private ctx: MarkdownPostProcessorContext
    ) {
        super();
        this.containerEl = container;
        
        // Setup ResizeObserver to watch for container size changes
        this.setupResizeObserver();
        
        // Setup IntersectionObserver to detect when map becomes visible
        // This is critical for ensuring tiles render when scrolling into view
        this.setupIntersectionObserver();
    }

    /**
     * Initialize the map
     * Waits for container to have dimensions before creating the map
     */
    async initialize(): Promise<void> {
        // If already initializing, return the existing promise
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        // If already initialized, return immediately
        if (this.isInitialized) {
            return;
        }

        this.initializationPromise = this.doInitialize();
        return this.initializationPromise;
    }

    /**
     * Internal initialization method
     */
    private async doInitialize(): Promise<void> {
        try {
            // Wait for container to have computed dimensions
            await this.waitForContainerDimensions();

            // Create map based on type
            // Default to 'image' if type is not specified but image param exists
            const mapType = this.params.type || (this.params.image ? 'image' : 'real');
            
            if (mapType === 'image') {
                await this.initializeImageMap();
            } else {
                await this.initializeRealMap();
            }

            // Add markers
            await this.addMarkers();

            // Add layers (GeoJSON, GPX, overlays)
            await this.addLayers();

            // Initialize MapEntityRenderer for location and entity rendering
            if (this.map) {
                const mapId = (this.params as any).mapId || this.params.id;
                if (mapId) {
                    this.mapEntityRenderer = new MapEntityRenderer(this.map, this.plugin);
                    // Render locations and entities bound to this map
                    await this.mapEntityRenderer.renderLocationsForMap(mapId);
                    await this.mapEntityRenderer.renderPortalMarkers(mapId);
                    await this.mapEntityRenderer.renderEntitiesForMap(mapId);
                }
            }

            // Note: fitBounds is already called in initializeImageMap/initializeRealMap
            // Don't call it again here as it can interfere with centering
            // Note: restoreSavedViewState is called BEFORE default positioning in each init method
            // to avoid visible jump when a saved state exists

            this.isInitialized = true;

            // Set up position saving for inline maps
            this.setupPositionSaving();

            // Note: invalidateSize is already called in initializeImageMap
            // Don't call it again here as it can reset the view

        } catch (error) {
            console.error('Error initializing map:', error);
            throw error;
        }
    }

    /**
     * Wait for container to have computed dimensions
     * This ensures Leaflet initializes with proper dimensions
     * Times out after 5 seconds to prevent infinite waiting
     */
    private async waitForContainerDimensions(): Promise<void> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const timeout = 5000; // 5 second timeout
            
            const checkDimensions = () => {
                let rect = this.containerEl.getBoundingClientRect();
                let hasDimensions = rect.width > 0 && rect.height > 0;

                // CRITICAL FIX: If container has no dimensions, force them explicitly
                // This handles cases where the container uses percentage sizing or flex
                // but the parent hasn't been laid out yet
                if (!hasDimensions) {
                    // Check if parent has dimensions we can use
                    const parent = this.containerEl.parentElement;
                    if (parent) {
                        const parentRect = parent.getBoundingClientRect();
                        if (parentRect.width > 0 && parentRect.height > 0) {
                            // Force explicit pixel dimensions based on parent
                            this.containerEl.style.width = `${parentRect.width}px`;
                            this.containerEl.style.height = `${parentRect.height}px`;
                            console.log('[LeafletRenderer] Forced container dimensions from parent:', parentRect.width, 'x', parentRect.height);
                            resolve();
                            return;
                        }
                    }
                }

                if (hasDimensions) {
                    console.log('[LeafletRenderer] Container dimensions ready:', rect.width, 'x', rect.height);
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    // Timeout - force explicit dimensions as fallback
                    console.warn('[LeafletRenderer] Timeout waiting for container dimensions, forcing defaults');
                    // Set explicit pixel dimensions - not percentages!
                    this.containerEl.style.width = '800px';
                    this.containerEl.style.height = '500px';
                    this.containerEl.style.minHeight = '500px';
                    this.containerEl.style.minWidth = '800px';
                    resolve();
                } else {
                    // Use requestAnimationFrame to wait for next layout cycle
                    requestAnimationFrame(checkDimensions);
                }
            };

            // Start checking on next frame
            requestAnimationFrame(checkDimensions);
        });
    }

    /**
     * Setup ResizeObserver to watch for container size changes
     * Also listens to Obsidian workspace resize events as fallback
     * Note: MapView also has a ResizeObserver, so we use a flag to prevent conflicts
     */
    private setupResizeObserver(): void {
        if (typeof ResizeObserver === 'undefined') {
            // Fallback for environments without ResizeObserver
            return;
        }

        let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
        let lastWidth = 0;
        let lastHeight = 0;

        const handleResize = () => {
            if (!this.map || !this.isInitialized) return;
            
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                if (!this.map || !this.isInitialized) return;
                
                const rect = this.containerEl.getBoundingClientRect();
                const { width, height } = rect;
                
                // Only react to actual size changes
                if (width === lastWidth && height === lastHeight) return;
                
                lastWidth = width;
                lastHeight = height;

                // Debounce to prevent rapid fire during animations
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout);
                }
                resizeTimeout = setTimeout(() => {
                    this.invalidateSizeWithTileRefresh();
                }, 150);
            });
        };

        this.resizeObserver = new ResizeObserver((entries) => {
            handleResize();
        });

        this.resizeObserver.observe(this.containerEl);

        // CRITICAL FIX: Also listen to Obsidian workspace resize events
        // This catches sidebar open/close events that ResizeObserver might miss
        this.registerEvent(this.plugin.app.workspace.on('resize', () => {
            // Delay slightly to let Obsidian finish its layout update
            setTimeout(() => {
                handleResize();
            }, 100);
        }));
    }

    /**
     * Setup IntersectionObserver to detect when map becomes visible
     * This ensures tiles render properly when the map scrolls into view
     * or when the container becomes visible after being hidden
     */
    private setupIntersectionObserver(): void {
        if (typeof IntersectionObserver === 'undefined') {
            return;
        }

        this.intersectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting && this.map && this.isInitialized) {
                    console.log('[LeafletRenderer] Map became visible, forcing tile refresh');
                    // Force tiles to render when map becomes visible
                    this.forceTileRefresh();
                }
            }
        }, {
            // Trigger when any part of the map is visible
            threshold: [0, 0.1, 0.5, 1.0],
            // Use root margin to detect slightly before visible
            rootMargin: '50px'
        });

        this.intersectionObserver.observe(this.containerEl);
    }

    /**
     * Force tile layers to refresh and render
     * This is the key fix for tiles not rendering until zoom
     */
    private forceTileRefresh(): void {
        if (!this.map || this.hasRenderedTiles) return;

        console.log('[LeafletRenderer] Forcing tile refresh...');

        // Mark that we've triggered a refresh to avoid doing it repeatedly
        this.hasRenderedTiles = true;

        // Step 1: Invalidate the map size to recalculate dimensions
        this.map.invalidateSize({ animate: false });

        // Step 2: Force all tile layers to update and be visible
        this.map.eachLayer((layer: any) => {
            if (layer._url || layer.getTileUrl || layer instanceof L.TileLayer) {
                // Force the tile layer to recalculate visible tiles
                if (layer._resetView) {
                    layer._resetView();
                }
                if (layer._update) {
                    layer._update();
                }
                if (layer.redraw) {
                    layer.redraw();
                }
                
                // Force visibility on tile container
                const container = layer.getContainer?.();
                if (container) {
                    container.style.opacity = '1';
                    container.style.visibility = 'visible';
                    
                    // Force visibility on all tile images
                    const tiles = container.querySelectorAll('img');
                    tiles.forEach((tile: HTMLElement) => {
                        tile.style.opacity = '1';
                        tile.style.visibility = 'visible';
                    });
                }
            }
        });

        // Step 3: Force tile pane visibility
        const tilePane = this.map.getPane('tilePane');
        if (tilePane) {
            tilePane.style.opacity = '1';
            tilePane.style.visibility = 'visible';
            tilePane.style.display = 'block';
        }

        // Step 4: Fire a moveend event to trigger Leaflet's internal tile loading
        // This simulates what happens when the user zooms
        this.map.fire('moveend');
        this.map.fire('zoomend');

        // Step 5: Force a tiny zoom change to trigger Leaflet's internal state update
        // This is the nuclear option - simulate what zoom does
        const currentZoom = this.map.getZoom();
        const currentCenter = this.map.getCenter();
        
        // Micro zoom - invisible to user but triggers Leaflet's full update cycle
        this.map.setView(currentCenter, currentZoom + 0.001, { animate: false });
        
        setTimeout(() => {
            if (this.map) {
                // Return to original zoom
                this.map.setView(currentCenter, currentZoom, { animate: false });
                
                // Force one more update
                this.map.invalidateSize({ animate: false });
                this.map.eachLayer((layer: any) => {
                    if (layer._update) {
                        layer._update();
                    }
                    if (layer._forceVisibility) {
                        layer._forceVisibility();
                    }
                });
            }
        }, 50);
    }

    /**
     * Ensure the map has non-zero dimensions before proceeding
     * This is CRITICAL for tile loading - Leaflet won't request tiles if size is 0x0
     */
    private async ensureMapHasDimensions(): Promise<void> {
        if (!this.map) return;

        const maxAttempts = 100; // 2 seconds max (100 * 20ms)
        let attempts = 0;

        while (attempts < maxAttempts) {
            const size = this.map.getSize();
            
            if (size.x > 0 && size.y > 0) {
                console.log(`[LeafletRenderer] Map has dimensions: ${size.x} x ${size.y}`);
                return;
            }

            // Try to force dimensions on the container
            const rect = this.containerEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                // Container has dimensions but map doesn't see them - force invalidate
                this.containerEl.style.width = `${rect.width}px`;
                this.containerEl.style.height = `${rect.height}px`;
                this.map.invalidateSize({ animate: false });
                
                const newSize = this.map.getSize();
                if (newSize.x > 0 && newSize.y > 0) {
                    console.log(`[LeafletRenderer] Map dimensions after fix: ${newSize.x} x ${newSize.y}`);
                    return;
                }
            }

            // Check parent container
            const parent = this.containerEl.parentElement;
            if (parent) {
                const parentRect = parent.getBoundingClientRect();
                if (parentRect.width > 0 && parentRect.height > 0) {
                    // Force container to use parent dimensions
                    this.containerEl.style.width = `${parentRect.width}px`;
                    this.containerEl.style.height = `${parentRect.height}px`;
                    this.map.invalidateSize({ animate: false });
                    
                    const newSize = this.map.getSize();
                    if (newSize.x > 0 && newSize.y > 0) {
                        console.log(`[LeafletRenderer] Map dimensions from parent: ${newSize.x} x ${newSize.y}`);
                        return;
                    }
                }
            }

            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, 20));
            attempts++;
        }

        // Last resort: force explicit dimensions
        console.warn('[LeafletRenderer] Could not get dimensions, forcing 800x600');
        this.containerEl.style.width = '800px';
        this.containerEl.style.height = '600px';
        this.map.invalidateSize({ animate: false });
    }

    /**
     * Initialize an image-based map
     * 
     * Based on official Leaflet CRS.Simple tutorial:
     * https://leafletjs.com/examples/crs-simple/crs-simple.html
     * 
     * Key principles:
     * 1. CRS.Simple uses [y, x] coordinates (like [lat, lng])
     * 2. At zoom 0, 1 map unit = 1 pixel
     * 3. For large images, use negative minZoom to zoom out
     * 4. Image bounds [[0,0], [height, width]] puts origin at top-left
     * 5. fitBounds() centers the image and calculates proper zoom
     */
    /**
     * Initialize image-based map
     * Automatically detects if tiles exist and uses appropriate rendering method
     */
    private async initializeImageMap(): Promise<void> {
        if (!this.params.image) {
            throw new Error('Image parameter required for image maps');
        }

        console.log('[LeafletRenderer] === INITIALIZING IMAGE MAP ===');
        console.log('[LeafletRenderer] Image param:', this.params.image);

        // Resolve image path
        const imagePath = extractLinkPath(this.params.image);
        console.log('[LeafletRenderer] Extracted image path:', imagePath);
        
        const imageFile = this.plugin.app.metadataCache.getFirstLinkpathDest(
            imagePath,
            this.ctx.sourcePath
        );

        if (!imageFile) {
            // Try to find the file directly by path as fallback
            const directFile = this.plugin.app.vault.getAbstractFileByPath(imagePath);
            if (directFile instanceof TFile) {
                console.log('[LeafletRenderer] Found image via direct path lookup:', directFile.path);
                await this.initializeImageMapWithPath(directFile.path);
                return;
            }
            
            console.error('[LeafletRenderer] Image not found. Searched path:', imagePath);
            console.error('[LeafletRenderer] Source path context:', this.ctx.sourcePath);
            throw new Error(`Image not found: ${imagePath}. Check that the image file exists and the path is correct.`);
        }

        console.log('[LeafletRenderer] Resolved image file:', imageFile.path);
        await this.initializeImageMapWithPath(imageFile.path);
    }

    /**
     * Initialize image map with a resolved file path
     * Separated to allow direct path initialization as fallback
     * For map images, tiles are required - will generate if missing
     */
    private async initializeImageMapWithPath(imagePath: string): Promise<void> {
        try {
            // Check if tiles exist for this image
            let tileInfo = await this.checkForTiles(imagePath);

            if (tileInfo) {
                // Tiles found - use tile-based rendering
                console.log('[LeafletRenderer] Tiles found, using tiled rendering');
                await this.initializeTiledMap(imagePath, tileInfo);
            } else {
                // No tiles found - generate them first (map images require tiles)
                console.log('[LeafletRenderer] No tiles found, generating tiles for map image...');
                new Notice('Generating tiles for map image. This may take a moment...');
                
                try {
                    // Force generate tiles and wait for completion
                    await this.plugin.forceGenerateTilesForMap(imagePath);
                    
                    // Re-check for tiles after generation
                    tileInfo = await this.checkForTiles(imagePath);
                    
                    if (tileInfo) {
                        console.log('[LeafletRenderer] Tiles generated successfully, using tiled rendering');
                        await this.initializeTiledMap(imagePath, tileInfo);
                    } else {
                        throw new Error('Tile generation completed but tiles not found');
                    }
                } catch (tileError) {
                    console.error('[LeafletRenderer] Failed to generate tiles:', tileError);
                    throw new Error(`Failed to generate required tiles for map: ${tileError.message}. Map images require tiles to function properly.`);
                }
            }
        } catch (error) {
            console.error('[LeafletRenderer] Map initialization failed:', error);
            // Don't fallback to standard image overlay - map images must use tiles
            throw new Error(`Failed to initialize map: ${error.message}`);
        }
    }

    /**
     * Check if tiles exist for an image
     * @param imagePath - Vault path to image
     * @returns TileMetadata if tiles exist, null otherwise
     */
    private async checkForTiles(imagePath: string): Promise<TileMetadata | null> {
        try {
            // Calculate image hash (same algorithm as TileGenerator)
            const imageData = await this.plugin.app.vault.adapter.readBinary(imagePath);
            const hashBuffer = await crypto.subtle.digest('SHA-256', imageData);
            const hash = Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
                .substring(0, 16);

            // Check for metadata file
            const metadataPath = `StorytellerSuite/MapTiles/${hash}/metadata.json`;
            const metadataFile = this.plugin.app.vault.getAbstractFileByPath(metadataPath);

            if (metadataFile instanceof TFile) {
                const content = await this.plugin.app.vault.read(metadataFile);
                const metadata = JSON.parse(content) as TileMetadata;
                console.log('[LeafletRenderer] Tile metadata found:', metadata);
                return metadata;
            }
        } catch (error) {
            console.log('[LeafletRenderer] No tiles found for image:', error);
        }

        return null;
    }

    /**
     * Initialize map using pre-generated tiles
     * Uses L.tileLayer with ObsidianTileLayer for optimal performance
     */
    private async initializeTiledMap(
        imagePath: string,
        tileInfo: TileMetadata
    ): Promise<void> {
        this.imageWidth = tileInfo.width;
        this.imageHeight = tileInfo.height;

        // Create a custom CRS that matches how tiles were generated
        // The tile generator creates tiles where:
        // - At maxZoom, the image is at native resolution (1 pixel = 1 coordinate unit)
        // - Each lower zoom level halves the resolution
        // We need to create a CRS where tile coordinates match this scheme
        
        // Calculate the scale factor based on maxZoom
        // At maxZoom, we want 1 tile to cover tileSize pixels of the original image
        // The transformation maps pixel coordinates to the tileSize-based system Leaflet expects
        const maxZoom = tileInfo.maxZoom;
        const tileSize = tileInfo.tileSize;
        
        // Create custom CRS for the tiled image
        // The scale at each zoom level should be: 2^(zoom - maxZoom) * tileSize
        // This means at maxZoom, scale = tileSize, which gives us 1:1 pixel mapping
        const customCRS = L.extend({}, L.CRS.Simple, {
            // The transformation: we need to flip Y axis (images have Y=0 at top)
            // and scale coordinates to match tile coordinates
            transformation: new L.Transformation(1 / tileSize, 0, -1 / tileSize, tileInfo.height / tileSize),
            
            // Scale function - at zoom Z, scale is 2^(Z - maxZoom)
            // This matches how tiles were generated
            scale: function(zoom: number): number {
                return Math.pow(2, zoom);
            },
            
            zoom: function(scale: number): number {
                return Math.log(scale) / Math.LN2;
            }
        });

        console.log('[LeafletRenderer] Created custom CRS for tiled map');
        console.log('[LeafletRenderer] Image dimensions:', tileInfo.width, 'x', tileInfo.height);
        console.log('[LeafletRenderer] Tile size:', tileSize);
        console.log('[LeafletRenderer] Max zoom:', maxZoom);

        // Create map with custom CRS
        this.map = L.map(this.containerEl, {
            zoomSnap: 0,
            zoomDelta: 0.25,
            scrollWheelZoom: true,
            zoomAnimation: true,
            attributionControl: false,
            zoomControl: true,
            crs: customCRS,
            minZoom: tileInfo.minZoom,
            maxZoom: tileInfo.maxZoom
        });

        // Define bounds in pixel coordinates
        // In our coordinate system: (0,0) is top-left, (width, height) is bottom-right
        const bounds: L.LatLngBoundsExpression = [[0, 0], [tileInfo.height, tileInfo.width]];
        this.imageBounds = L.latLngBounds(bounds);

        // Create and add custom tile layer
        const basePath = `StorytellerSuite/MapTiles/${tileInfo.imageHash}`;
        console.log('[LeafletRenderer] Creating tile layer with basePath:', basePath);
        
        const tileLayer = new ObsidianTileLayer(
            this.plugin,
            tileInfo.imageHash,
            basePath,
            {
                minZoom: tileInfo.minZoom,
                maxZoom: tileInfo.maxZoom,
                tileSize: tileInfo.tileSize,
                noWrap: true,
                bounds: this.imageBounds,
                keepBuffer: 2,
                updateWhenIdle: false,
                updateWhenZooming: true
            }
        );

        console.log('[LeafletRenderer] Adding tile layer to map...');
        
        // CRITICAL FIX: Don't add tile layer until container has real dimensions
        // Leaflet uses map.getSize() to determine which tiles to load
        // If size is 0x0, no tiles will be requested
        await this.ensureMapHasDimensions();
        
        tileLayer.addTo(this.map);
        console.log('[LeafletRenderer] Tile layer added');

        // CRITICAL FIX: Listen for tile load events - but DON'T call invalidateSize!
        // invalidateSize can cause tiles to disappear - just log that tiles loaded
        let tilesLoaded = false;
        tileLayer.on('load', () => {
            if (!tilesLoaded) {
                tilesLoaded = true;
                console.log('[LeafletRenderer] Tiles loaded successfully');
                this.hasRenderedTiles = true;
            }
        });

        // Invalidate size to ensure Leaflet recalculates
        this.map.invalidateSize({ animate: false });

        // Try to restore saved view state BEFORE default positioning to avoid visible jump
        const restoredSavedState = this.restoreSavedViewState();

        if (!restoredSavedState) {
            // No saved state - use default positioning
            // Calculate center point
            const centerLat = tileInfo.height / 2;
            const centerLng = tileInfo.width / 2;

            // Set initial view - start at middle zoom level to ensure tiles load
            const initialZoom = Math.floor((tileInfo.minZoom + tileInfo.maxZoom) / 2);

            this.map.setView([centerLat, centerLng], initialZoom, { animate: false });
        }

        // CRITICAL FIX: Force tile pane to be explicitly visible
        // Sometimes CSS or Leaflet state can hide the tile pane initially
        const tilePane = this.map.getPane('tilePane');
        if (tilePane) {
            tilePane.style.opacity = '1';
            tilePane.style.visibility = 'visible';
            tilePane.style.display = 'block';
            console.log('[LeafletRenderer] Forced tile pane visibility');
        }

        // Force a tile redraw after setting view
        tileLayer.redraw();
        
        // Force tile layer to update and request tiles
        if ((tileLayer as any)._update) {
            (tileLayer as any)._update();
        }

        // CRITICAL FIX: Use forceTileRefresh after a short delay
        setTimeout(() => {
            if (this.map) {
                this.hasRenderedTiles = false; // Reset so forceTileRefresh will run
                this.forceTileRefresh();
            }
        }, 100);

        // Additional refresh after a longer delay for reliability
        setTimeout(() => {
            if (this.map && !this.hasRenderedTiles) {
                console.log('[LeafletRenderer] Secondary tile refresh (500ms)...');
                this.hasRenderedTiles = false;
                this.forceTileRefresh();
            }
        }, 500);

        // Log final state
        const finalZoom = this.map.getZoom();
        const finalCenter = this.map.getCenter();
        const mapSize = this.map.getSize();
        const mapBounds = this.map.getBounds();
        console.log('[LeafletRenderer] === TILED MAP READY ===');
        console.log('[LeafletRenderer] Zoom range:', tileInfo.minZoom, 'to', tileInfo.maxZoom);
        console.log('[LeafletRenderer] Tile size:', tileInfo.tileSize);
        console.log('[LeafletRenderer] Final zoom:', finalZoom.toFixed(2));
        console.log('[LeafletRenderer] Final center:', [finalCenter.lat.toFixed(1), finalCenter.lng.toFixed(1)]);
        console.log('[LeafletRenderer] Map pixel size:', mapSize.x, 'x', mapSize.y);
        console.log('[LeafletRenderer] Current map bounds:', mapBounds.getSouthWest(), mapBounds.getNorthEast());
        console.log('[LeafletRenderer] Image bounds:', bounds);
        console.log('[LeafletRenderer] Container dimensions:', this.containerEl.offsetWidth, 'x', this.containerEl.offsetHeight);
    }

    /**
     * Initialize map using standard L.imageOverlay
     * Used for small images or when tiles don't exist
     */
    private async initializeStandardImageMap(imagePath: string): Promise<void> {
        console.log('[LeafletRenderer] initializeStandardImageMap called with path:', imagePath);
        
        // Verify file exists before attempting to get resource path
        const imageFile = this.plugin.app.vault.getAbstractFileByPath(imagePath);
        if (!imageFile) {
            throw new Error(`Image file not found in vault: ${imagePath}`);
        }
        
        const imageUrl = this.plugin.app.vault.adapter.getResourcePath(imagePath);
        console.log('[LeafletRenderer] Resource URL generated:', imageUrl ? imageUrl.substring(0, 100) + '...' : 'NULL');
        
        if (!imageUrl) {
            throw new Error(`Failed to get resource path for image: ${imagePath}`);
        }

        // Load image dimensions
        console.log('[LeafletRenderer] Loading image dimensions...');
        const { width, height } = await this.loadImageDimensions(imageUrl);
        console.log('[LeafletRenderer] Image dimensions:', width, 'x', height);

        if (width === 0 || height === 0) {
            throw new Error(`Image has invalid dimensions: ${width}x${height}`);
        }

        // Store for later use
        this.imageWidth = width;
        this.imageHeight = height;

        // Get container dimensions
        const containerRect = this.containerEl.getBoundingClientRect();
        const containerWidth = containerRect.width || 800;
        const containerHeight = containerRect.height || 600;
        console.log('[LeafletRenderer] Container dimensions:', containerWidth, 'x', containerHeight);

        if (containerWidth === 0 || containerHeight === 0) {
            console.warn('[LeafletRenderer] Container has zero dimensions, using defaults');
        }

        // Create map instance (needed for RasterCoords)
        console.log('[LeafletRenderer] Creating Leaflet map instance...');
        this.map = L.map(this.containerEl, {
            zoomSnap: 0,
            zoomDelta: 0.25,
            scrollWheelZoom: true,
            zoomAnimation: true,
            attributionControl: false,
            zoomControl: true,
            crs: L.CRS.Simple
        });

        // Initialize RasterCoords helper
        const rc = new RasterCoords(this.map, width, height);
        rc.setup();

        // Calculate zoom range
        // Fix: Use a generous minZoom to ensure the image can always be fully fitted
        // The previous calculation (getMaxZoom() - 5) might not be enough for large images in small containers
        const minZoom = -10; 
        const maxZoom = rc.getMaxZoom() + 3;

        console.log('[LeafletRenderer] Zoom config:', { minZoom, maxZoom, maxNativeZoom: rc.getMaxZoom() });

        this.map.setMinZoom(minZoom);
        this.map.setMaxZoom(maxZoom);

        // Add image overlay
        const bounds: L.LatLngBoundsExpression = [[0, 0], [height, width]];
        this.imageBounds = L.latLngBounds(bounds);

        console.log('[LeafletRenderer] Adding image overlay with bounds:', bounds);
        this.imageOverlay = L.imageOverlay(imageUrl, bounds).addTo(this.map);

        // CRITICAL FIX: Listen for image load to trigger invalidateSize
        // This ensures the map recalculates when image is actually loaded
        let imageLoaded = false;
        this.imageOverlay.on('load', () => {
            if (!imageLoaded) {
                imageLoaded = true;
                console.log('[LeafletRenderer] Image loaded, invalidating size...');
                this.hasRenderedTiles = true;
                setTimeout(() => {
                    if (this.map) {
                        this.map.invalidateSize({ animate: false });
                    }
                }, 50);
            }
        });

        // Wait for DOM
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Invalidate size first
        this.map.invalidateSize({ animate: false });

        // Try to restore saved view state BEFORE default positioning to avoid visible jump
        const restoredSavedState = this.restoreSavedViewState();

        if (!restoredSavedState) {
            // No saved state - use default fitBounds
            this.map.fitBounds(bounds, {
                padding: [20, 20],
                animate: false
            });
        }

        // Force image overlay to be visible
        // This addresses similar visibility issues as with tile layers
        const overlayPane = this.map.getPane('overlayPane');
        if (overlayPane) {
            overlayPane.style.opacity = '1';
            overlayPane.style.visibility = 'visible';
        }

        // Log final state
        const finalZoom = this.map.getZoom();
        const finalCenter = this.map.getCenter();
        console.log('[LeafletRenderer] === STANDARD IMAGE MAP READY ===');
        console.log('[LeafletRenderer] Final zoom:', finalZoom.toFixed(2));
        console.log('[LeafletRenderer] Final center:', finalCenter ? `[${finalCenter.lat.toFixed(1)}, ${finalCenter.lng.toFixed(1)}]` : 'N/A');
        console.log('[LeafletRenderer] Bounds:', bounds);
    }

    /**
     * Initialize a real-world map
     * Following standard Leaflet pattern: L.map() + L.tileLayer()
     * 
     * IMPORTANT:
     * - If a saved view state exists for this map, we should start from that
     *   position instead of the default (London) center. This ensures that
     *   reopening the world map returns the user to their last viewed location.
     */
    private async initializeRealMap(): Promise<void> {
        // Determine map ID so we can check for a saved view state
        const mapId = (this.params as any).mapId || this.params.id;

        // Use saved view state if available; otherwise fall back to defaults
        const savedState = mapId ? this.plugin.getMapViewState(mapId) : null;

        let initialCenter: [number, number];
        let initialZoom: number;

        if (savedState) {
            initialCenter = [savedState.center.lat, savedState.center.lng];
            initialZoom = savedState.zoom;
            console.log('[LeafletRenderer] Initializing real-world map from saved view state', {
                mapId,
                center: initialCenter,
                zoom: initialZoom
            });
        } else {
            // Use default coordinates if not provided (London, UK as a reasonable default)
            initialCenter = [
                this.params.lat ?? 51.5074,
                this.params.long ?? -0.1278
            ];
            initialZoom = this.params.defaultZoom ?? 13;
            console.log('[LeafletRenderer] Initializing real-world map at default center', initialCenter, 'zoom', initialZoom);
        }

        // Ensure container has an ID for Leaflet
        if (!this.containerEl.id) {
            this.containerEl.id = `leaflet-map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // Ensure container is in the DOM and has dimensions
        const rect = this.containerEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            console.warn('[LeafletRenderer] Container has no dimensions, waiting...');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Create map using L.map() factory function with element directly
        // Using element instead of ID ensures Leaflet can find it
        this.map = L.map(this.containerEl, {
            // CRITICAL: Explicitly enable scroll wheel zoom
            scrollWheelZoom: true,
            // Smooth zoom options optimized for trackpad/mouse wheel
            zoomDelta: 0.1,           // Smaller increments for finer control
            zoomSnap: 0,              // No snapping = completely fluid
            wheelPxPerZoomLevel: 120, // Higher = slower zoom, smoother trackpad feel
            // NOTE: Removed wheelDebounceTime - it causes choppy/stuttery zoom!
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: true,
            // Smooth panning
            inertia: true,
            inertiaDeceleration: 3000,
            inertiaMaxSpeed: 1500,
            easeLinearity: 0.25
        }).setView(initialCenter, initialZoom);

        // Set zoom limits
        if (this.params.minZoom !== undefined) this.map.setMinZoom(this.params.minZoom);
        if (this.params.maxZoom !== undefined) this.map.setMaxZoom(this.params.maxZoom);

        console.log('[LeafletRenderer] Created real-world map using ID:', this.containerEl.id);

        // Determine tile server
        const tileUrl = this.getTileServerUrl();

        console.log('[LeafletRenderer] Using tile server:', tileUrl);

        // Add tile layer using L.tileLayer() factory function
        L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(this.map);

        // CRITICAL: Force map to recognize its size and load tiles immediately
        // Without this, tiles may not load until user zooms/pans
        this.map.whenReady(() => {
            if (this.map) {
                this.map.invalidateSize({ animate: false });

                // Force tile layers to update after invalidateSize
                this.map.eachLayer((layer: any) => {
                    if (layer._url || layer.getTileUrl) {
                        layer.redraw?.();
                    }
                });
            }
        });

        console.log('[LeafletRenderer] Real-world map initialization complete');
    }

    /**
     * Get tile server URL based on settings
     */
    private getTileServerUrl(): string {
        // Custom tile server from parameters
        if (this.params.tileServer) {
            return this.params.tileServer;
        }

        // Dark mode tiles
        if (this.params.darkMode) {
            return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        }

        // Default OpenStreetMap
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }

    /**
     * Add markers to the map
     */
    private async addMarkers(): Promise<void> {
        if (!this.map) return;

        const markerDefinitions: MarkerDefinition[] = [];

        // Parse explicit marker strings from parameters
        if (this.params.marker) {
            const markerStrings = Array.isArray(this.params.marker)
                ? this.params.marker
                : [this.params.marker];

            for (const markerStr of markerStrings) {
                const parsed = parseMarkerString(markerStr);
                if (parsed.loc) {
                    markerDefinitions.push(parsed as MarkerDefinition);
                }
            }
        }

        // Load markers from files (legacy support)
        if (this.params.markerFile) {
            const fileMarkers = await this.loadMarkersFromFiles(this.params.markerFile);
            markerDefinitions.push(...fileMarkers);
        }

        // Use EntityMarkerDiscovery for comprehensive entity discovery
        const discovery = new EntityMarkerDiscovery(this.plugin.app, this.plugin);
        const discoveredMarkers = await discovery.discoverMarkers(
            this.params.id, // mapId
            markerDefinitions, // explicit markers
            this.params.markerTag ? (Array.isArray(this.params.markerTag) ? this.params.markerTag : [this.params.markerTag]) : undefined
        );

        // Add each marker to the map
        for (const markerDef of discoveredMarkers) {
            this.addMarker(markerDef);
        }
    }

    /**
     * Add a single marker to the map
     */
    addMarker(markerDef: MarkerDefinition): void {
        if (!this.map) return;

        // Convert location to LatLng
        const latLng = this.convertToLatLng(markerDef.loc, markerDef.percent);

        // Create icon
        const icon = this.createMarkerIcon(markerDef);

        // Create marker using L.marker() factory
        const marker = L.marker(latLng, { icon });

        // Add click handler for links
        if (markerDef.link) {
            marker.on('click', () => {
                this.handleMarkerClick(markerDef);
            });
        }

        // Add tooltip
        if (markerDef.description) {
            marker.bindTooltip(markerDef.description);
        }

        // Add to map
        marker.addTo(this.map);

        // Track marker
        const markerId = markerDef.id ?? this.generateMarkerId();
        this.markers.set(markerId, marker);
    }

    /**
     * Create a marker icon
     */
    private createMarkerIcon(markerDef: MarkerDefinition): L.DivIcon {
        const iconHtml = this.getMarkerIconHtml(markerDef);

        return L.divIcon({
            html: iconHtml,
            className: 'storyteller-map-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
    }

    /**
     * Get marker icon HTML
     */
    private getMarkerIconHtml(markerDef: MarkerDefinition): string {
        const color = markerDef.iconColor ?? '#3b82f6';

        // Use custom icon if provided
        if (markerDef.icon) {
            return markerDef.icon;
        }

        // Default marker SVG based on type
        // Supports all entity types: location, character, event, item, group,
        // culture, economy, magicsystem, scene, reference
        switch (markerDef.type) {
            case 'location':
                return this.createLocationIcon(color);
            case 'character':
                return this.createCharacterIcon(color);
            case 'event':
                return this.createEventIcon(color);
            case 'item':
                return this.createItemIcon(color);
            case 'group':
                return this.createGroupIcon(color);
            case 'culture':
                return this.createCultureIcon(color);
            case 'economy':
                return this.createEconomyIcon(color);
            case 'magicsystem':
                return this.createMagicSystemIcon(color);
            case 'scene':
                return this.createSceneIcon(color);
            case 'reference':
                return this.createReferenceIcon(color);
            default:
                return this.createDefaultIcon(color);
        }
    }

    /**
     * Create default marker icon SVG
     */
    private createDefaultIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                      fill="${color}"
                      stroke="#fff"
                      stroke-width="1"/>
            </svg>
        `;
    }

    /**
     * Create location marker icon
     */
    private createLocationIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="10" r="8" fill="${color}" stroke="#fff" stroke-width="2"/>
                <circle cx="12" cy="10" r="3" fill="#fff"/>
            </svg>
        `;
    }

    /**
     * Create character marker icon
     */
    private createCharacterIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/>
                <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z"
                      fill="${color}"
                      stroke="#fff"
                      stroke-width="1.5"/>
            </svg>
        `;
    }

    /**
     * Create event marker icon
     */
    private createEventIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                      fill="none"
                      stroke="${color}"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"/>
            </svg>
        `;
    }

    /**
     * Create plot item marker icon
     */
    private createItemIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="4" width="12" height="16" rx="2"
                      fill="${color}"
                      stroke="#fff"
                      stroke-width="1.5"/>
                <path d="M9 8h6M9 12h6M9 16h4"
                      stroke="#fff"
                      stroke-width="1.5"
                      stroke-linecap="round"/>
            </svg>
        `;
    }

    /**
     * Create group/faction marker icon
     */
    private createGroupIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7l10 5 10-5-10-5z"
                      fill="${color}"
                      stroke="#fff"
                      stroke-width="1.5"/>
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5"
                      fill="none"
                      stroke="${color}"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"/>
            </svg>
        `;
    }

    /**
     * Create culture marker icon (theater masks)
     */
    private createCultureIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="9" cy="10" r="6" fill="${color}" stroke="#fff" stroke-width="1.5"/>
                <circle cx="7" cy="9" r="1" fill="#fff"/>
                <circle cx="11" cy="9" r="1" fill="#fff"/>
                <path d="M7 12c1 1 3 1 4 0" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round"/>
                <circle cx="15" cy="12" r="5" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.8"/>
                <circle cx="13.5" cy="11" r="0.8" fill="#fff"/>
                <circle cx="16.5" cy="11" r="0.8" fill="#fff"/>
                <path d="M14 14c0.8-0.8 2.2-0.8 3 0" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round"/>
            </svg>
        `;
    }

    /**
     * Create economy marker icon (coin/currency)
     */
    private createEconomyIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" fill="${color}" stroke="#fff" stroke-width="2"/>
                <text x="12" y="16" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold">$</text>
            </svg>
        `;
    }

    /**
     * Create magic system marker icon (sparkles/star)
     */
    private createMagicSystemIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z"
                      fill="${color}"
                      stroke="#fff"
                      stroke-width="1.5"
                      stroke-linejoin="round"/>
                <circle cx="12" cy="10" r="2" fill="#fff"/>
            </svg>
        `;
    }

    /**
     * Create scene marker icon (clapperboard)
     */
    private createSceneIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="8" width="18" height="12" rx="2" fill="${color}" stroke="#fff" stroke-width="1.5"/>
                <path d="M3 8l3-4h12l3 4" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
                <line x1="6" y1="4" x2="8" y2="8" stroke="#fff" stroke-width="1.5"/>
                <line x1="11" y1="4" x2="13" y2="8" stroke="#fff" stroke-width="1.5"/>
                <line x1="16" y1="4" x2="18" y2="8" stroke="#fff" stroke-width="1.5"/>
            </svg>
        `;
    }

    /**
     * Create reference marker icon (book)
     */
    private createReferenceIcon(color: string): string {
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4h6c1 0 2 1 2 2v14c0-1-1-2-2-2H4V4z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
                <path d="M20 4h-6c-1 0-2 1-2 2v14c0-1 1-2 2-2h6V4z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
                <line x1="12" y1="6" x2="12" y2="18" stroke="#fff" stroke-width="1"/>
            </svg>
        `;
    }

    /**
     * Handle marker click
     */
    private handleMarkerClick(markerDef: MarkerDefinition): void {
        if (!markerDef.link) return;

        const linkPath = extractLinkPath(markerDef.link);

        // Open the linked file
        const file = this.plugin.app.metadataCache.getFirstLinkpathDest(
            linkPath,
            this.ctx.sourcePath
        );

        if (file) {
            this.plugin.app.workspace.getLeaf(false).openFile(file);
        } else {
            new Notice(`File not found: ${linkPath}`);
        }
    }

    /**
     * Convert location to LatLng
     */
    private convertToLatLng(
        loc: L.LatLngExpression | [string | number, string | number],
        isPercent?: boolean
    ): L.LatLng {
        // If already a LatLng, return it
        if (loc instanceof L.LatLng) {
            return loc;
        }

        // If it's a LatLngLiteral, convert it
        if (typeof loc === 'object' && 'lat' in loc && 'lng' in loc) {
            return L.latLng(loc.lat, loc.lng);
        }

        // Must be a tuple
        const tuple = loc as [string | number, string | number];

        if (isPercent && this.params.type === 'image') {
            // Convert percentage to coordinates
            // Bounds are [[0, 0], [height, width]]
            // So 0% = 0, 100% = full dimension
            let height: number;
            let width: number;
            
            if (this.imageOverlay) {
                const bounds = this.imageOverlay.getBounds();
                height = bounds.getNorth(); // = image height (since south is 0)
                width = bounds.getEast();   // = image width (since west is 0)
            } else if (this.imageWidth && this.imageHeight) {
                // Fallback for tiled maps where imageOverlay doesn't exist
                height = this.imageHeight;
                width = this.imageWidth;
            } else {
                // No dimension info available, fall back to direct coordinates
                return L.latLng(
                    typeof tuple[0] === 'string' ? parseFloat(tuple[0]) : tuple[0],
                    typeof tuple[1] === 'string' ? parseFloat(tuple[1]) : tuple[1]
                );
            }

            const xPercent = typeof tuple[1] === 'string'
                ? parseFloat(tuple[1].replace('%', ''))
                : tuple[1];
            const yPercent = typeof tuple[0] === 'string'
                ? parseFloat(tuple[0].replace('%', ''))
                : tuple[0];

            // Convert percentage to coordinates
            // 0% -> 0, 100% -> full dimension
            return L.latLng(
                (yPercent / 100) * height,
                (xPercent / 100) * width
            );
        }

        // Direct coordinates
        return L.latLng(
            typeof tuple[0] === 'string' ? parseFloat(tuple[0]) : tuple[0],
            typeof tuple[1] === 'string' ? parseFloat(tuple[1]) : tuple[1]
        );
    }

    /**
     * Load markers from files
     */
    private async loadMarkersFromFiles(files: string | string[]): Promise<MarkerDefinition[]> {
        const markers: MarkerDefinition[] = [];
        const fileList = Array.isArray(files) ? files : [files];

        for (const filePath of fileList) {
            const linkPath = extractLinkPath(filePath);
            const file = this.plugin.app.metadataCache.getFirstLinkpathDest(
                linkPath,
                this.ctx.sourcePath
            );

            if (file) {
                const fileMarkers = await this.extractMarkersFromFile(file);
                markers.push(...fileMarkers);
            }
        }

        return markers;
    }

    /**
     * Load markers from tags
     */
    private async loadMarkersFromTags(tags: string | string[]): Promise<MarkerDefinition[]> {
        const markers: MarkerDefinition[] = [];
        const tagList = Array.isArray(tags) ? tags : [tags];

        // Get all files with matching tags
        const files = this.plugin.app.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.plugin.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;

            const fileTags = cache.frontmatter.tags ?? [];
            const hasMatchingTag = tagList.some(tag =>
                fileTags.includes(tag) || fileTags.includes(`#${tag}`)
            );

            if (hasMatchingTag) {
                const fileMarkers = await this.extractMarkersFromFile(file);
                markers.push(...fileMarkers);
            }
        }

        return markers;
    }

    /**
     * Extract markers from file frontmatter
     */
    private async extractMarkersFromFile(file: TFile): Promise<MarkerDefinition[]> {
        const markers: MarkerDefinition[] = [];
        const cache = this.plugin.app.metadataCache.getFileCache(file);

        if (!cache?.frontmatter) return markers;

        const fm = cache.frontmatter;

        // Check for location data
        if (fm.location || (fm.lat && fm.long)) {
            const marker: MarkerDefinition = {
                type: 'default',
                loc: [0, 0],
                link: `[[${file.basename}]]`
            };

            // Parse location
            if (fm.lat && fm.long) {
                marker.loc = [Number(fm.lat), Number(fm.long)];
            } else if (fm.location) {
                // Could be coordinates or reference
                if (Array.isArray(fm.location) && fm.location.length >= 2) {
                    marker.loc = [Number(fm.location[0]), Number(fm.location[1])];
                }
            }

            // Add metadata
            if (fm.markerIcon) marker.icon = fm.markerIcon;
            if (fm.markerColor) marker.iconColor = fm.markerColor;
            if (fm.markerTooltip) marker.description = fm.markerTooltip;

            markers.push(marker);
        }

        return markers;
    }

    /**
     * Add layers (GeoJSON, GPX, etc.)
     */
    private async addLayers(): Promise<void> {
        // TODO: Implement GeoJSON and GPX layer support
        // This will be added in Phase 4
    }

    /**
     * Fit map to bounds
     */
    private fitBounds(): void {
        if (!this.map || this.markers.size === 0) return;

        // For image maps, bounds are already set
        if (this.params.type === 'image') return;

        // For real maps, fit to marker bounds
        const latLngs = Array.from(this.markers.values()).map(m => m.getLatLng());
        if (latLngs.length > 0) {
            const bounds = L.latLngBounds(latLngs);
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    /**
     * Load image and get dimensions
     */
    private loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            let timeoutId: NodeJS.Timeout;

            const cleanup = () => {
                clearTimeout(timeoutId);
                img.onload = null;
                img.onerror = null;
            };

            img.onload = () => {
                cleanup();
                if (img.width === 0 || img.height === 0) {
                    reject(new Error('Image loaded but has zero dimensions'));
                } else {
                    console.log('[LeafletRenderer] Image loaded successfully:', {
                        width: img.width,
                        height: img.height,
                        naturalWidth: img.naturalWidth,
                        naturalHeight: img.naturalHeight
                    });
                    resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
                }
            };

            img.onerror = (error) => {
                cleanup();
                console.error('[LeafletRenderer] Image load error:', error);
                reject(new Error(`Failed to load image: ${url}`));
            };

            // Set timeout for image loading (30 seconds)
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Image load timeout: ${url}`));
            }, 30000);

            // Start loading
            img.src = url;
        });
    }

    /**
     * Generate a unique marker ID
     */
    private generateMarkerId(): string {
        return `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Invalidate map size - forces Leaflet to recalculate dimensions
     * Called when device orientation changes or container is resized
     * CRITICAL: Also updates tile layers to prevent tiles from disappearing
     */
    invalidateSize(): void {
        if (this.map) {
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                if (this.map) {
                    this.map.invalidateSize({ animate: false });

                    // CRITICAL FIX: Force tile layers to update after invalidateSize
                    // Without this, tiles can disappear when container resizes
                    const tileLayers: any[] = [];
                    this.map.eachLayer((layer: any) => {
                        if (layer._url || layer.getTileUrl) {
                            tileLayers.push(layer);
                        }
                    });

                    tileLayers.forEach(tileLayer => {
                        if (tileLayer.redraw) {
                            tileLayer.redraw();
                        }
                        if (tileLayer._update) {
                            tileLayer._update();
                        }
                    });
                }
            });
        }
    }

    /**
     * Invalidate map size with aggressive tile refresh
     * Used when sidebars open/close to prevent grey screen
     * Forces tiles to re-render even if they've already rendered
     */
    private invalidateSizeWithTileRefresh(): void {
        if (!this.map || !this.isInitialized) return;

        console.log('[LeafletRenderer] Invalidating size with tile refresh after resize');

        // Use requestAnimationFrame to ensure DOM has fully updated
        requestAnimationFrame(() => {
            if (!this.map) return;

            // Step 1: Invalidate the map size to recalculate dimensions
            this.map.invalidateSize({ animate: false });

            // Step 2: Force all tile layers to update and be visible
            this.map.eachLayer((layer: any) => {
                if (layer._url || layer.getTileUrl || layer instanceof L.TileLayer) {
                    // Force the tile layer to recalculate visible tiles
                    if (layer._resetView) {
                        layer._resetView();
                    }
                    if (layer._update) {
                        layer._update();
                    }
                    if (layer.redraw) {
                        layer.redraw();
                    }
                    
                    // Force visibility on tile container
                    const container = layer.getContainer?.();
                    if (container) {
                        container.style.opacity = '1';
                        container.style.visibility = 'visible';
                        container.style.display = 'block';
                        
                        // Force visibility on all tile images
                        const tiles = container.querySelectorAll('img');
                        tiles.forEach((tile: HTMLElement) => {
                            tile.style.opacity = '1';
                            tile.style.visibility = 'visible';
                        });
                    }
                }
            });

            // Step 3: Force tile pane visibility
            const tilePane = this.map.getPane('tilePane');
            if (tilePane) {
                tilePane.style.opacity = '1';
                tilePane.style.visibility = 'visible';
                tilePane.style.display = 'block';
            }

            // Step 4: Fire events to trigger Leaflet's internal tile loading
            this.map.fire('moveend');
            this.map.fire('zoomend');

            // Step 5: Trigger a view update to force tile recalculation
            // Use a tiny zoom change (invisible to user) to trigger full update cycle
            const currentZoom = this.map.getZoom();
            const currentCenter = this.map.getCenter();
            
            setTimeout(() => {
                if (this.map && this.map.getZoom() === currentZoom) {
                    // Only do micro-zoom if zoom hasn't changed (user didn't zoom manually)
                    this.map.setView(currentCenter, currentZoom + 0.0001, { animate: false });
                    
                    setTimeout(() => {
                        if (this.map) {
                            // Return to original zoom
                            this.map.setView(currentCenter, currentZoom, { animate: false });
                        }
                    }, 50);
                }
            }, 100);
        });
    }

    /**
     * Fit the map view to show the entire image
     * Useful for resetting the view or after resize
     */
    fitToImage(): void {
        if (!this.map || !this.imageOverlay) return;
        
        const bounds = this.imageOverlay.getBounds();
        if (bounds.isValid()) {
            // For image maps, just fit without extra padding
            this.map.fitBounds(bounds);
        }
    }

    /**
     * Refresh entities on the map without reloading the entire map
     * Useful after adding/removing entities
     */
    async refreshEntities(): Promise<void> {
        if (!this.mapEntityRenderer || !this.params.mapId) return;

        const mapId = this.params.mapId;
        // Refresh both locations and entities to ensure markers appear at correct positions
        await this.mapEntityRenderer.renderLocationsForMap(mapId);
        await this.mapEntityRenderer.renderEntitiesForMap(mapId);
    }

    /**
     * Check if a saved view state exists for this map (synchronous)
     * Used to determine whether to skip default positioning during initialization
     */
    private hasSavedViewState(): boolean {
        const mapId = (this.params as any).mapId || this.params.id;
        if (!mapId) return false;
        return !!this.plugin.getMapViewState(mapId);
    }

    /**
     * Restore saved map view state (zoom and center position)
     * Called during initialization to return user to their last viewed position
     * @returns true if a saved state was restored, false otherwise
     */
    private restoreSavedViewState(): boolean {
        if (!this.map) return false;

        const mapId = (this.params as any).mapId || this.params.id;
        if (!mapId) return false;

        const savedState = this.plugin.getMapViewState(mapId);
        if (!savedState) {
            console.log('[LeafletRenderer] No saved view state for map:', mapId);
            return false;
        }

        console.log('[LeafletRenderer] Restoring saved view state for map:', mapId, savedState);

        try {
            // Restore view with saved zoom and center
            this.map.setView(
                [savedState.center.lat, savedState.center.lng],
                savedState.zoom,
                { animate: false }
            );
            console.log('[LeafletRenderer] View state restored successfully');
            return true;
        } catch (error) {
            console.warn('[LeafletRenderer] Failed to restore view state:', error);
            return false;
        }
    }

    /**
     * Get the map ID for this renderer
     */
    getMapId(): string | undefined {
        return (this.params as any).mapId || this.params.id;
    }

    /**
     * Set up position saving when user moves/zooms the map
     * Debounced to avoid too many saves during continuous movement
     */
    private setupPositionSaving(): void {
        if (!this.map) return;

        const mapId = this.getMapId();
        if (!mapId) return;

        let saveTimeout: ReturnType<typeof setTimeout> | null = null;

        const savePosition = () => {
            if (!this.map) return;
            
            // Clear any pending save
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }

            // Debounce: wait 500ms after last movement before saving
            saveTimeout = setTimeout(() => {
                if (!this.map) return;
                
                const zoom = this.map.getZoom();
                const center = this.map.getCenter();
                
                this.plugin.saveMapViewState(mapId, zoom, {
                    lat: center.lat,
                    lng: center.lng
                });
            }, 500);
        };

        // Listen for both move and zoom events
        this.map.on('moveend', savePosition);
        this.map.on('zoomend', savePosition);

        // Clean up on unload
        this.register(() => {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            if (this.map) {
                this.map.off('moveend', savePosition);
                this.map.off('zoomend', savePosition);
            }
        });
    }


    /**
     * Component lifecycle: called when component is loaded into DOM
     * This is called automatically by Obsidian when the component is added to the DOM
     * Following javalent-obsidian-leaflet pattern
     */
    onload(): void {
        console.log('[LeafletRenderer] onload() called, isInitialized:', this.isInitialized);
        
        // If map hasn't been initialized yet, initialize it now
        // This ensures the container is in the DOM before initialization
        // Use a small delay to ensure the container has been properly reflowed
        if (!this.isInitialized && !this.initializationPromise) {
            // Use setTimeout instead of requestAnimationFrame for more reliable timing
            // This gives the browser time to fully process the DOM insertion and layout
            setTimeout(async () => {
                try {
                    console.log('[LeafletRenderer] Starting delayed initialization...');
                    await this.initialize();
                    console.log('[LeafletRenderer] Initialization complete');
                    
                    // CRITICAL: Force tile refresh after initialization completes
                    // This ensures tiles render immediately without waiting for user interaction
                    setTimeout(() => {
                        if (this.map && this.isInitialized) {
                            console.log('[LeafletRenderer] Post-initialization tile refresh...');
                            this.hasRenderedTiles = false;
                            this.forceTileRefresh();
                        }
                    }, 100);
                } catch (error) {
                    console.error('[LeafletRenderer] Initialization failed in onload:', error);
                    // Show error in the container
                    this.showErrorInContainer(`Map initialization failed: ${error.message || error}`);
                }
            }, 50); // 50ms delay for DOM reflow
        } else if (this.isInitialized && this.map) {
            // If already initialized, invalidate size and force tile refresh
            requestAnimationFrame(() => {
                this.invalidateSize();
                // Also force tile refresh in case tiles didn't render
                if (!this.hasRenderedTiles) {
                    this.forceTileRefresh();
                }
            });
        }
    }

    /**
     * Display an error message in the map container
     */
    private showErrorInContainer(message: string): void {
        if (!this.containerEl) return;
        
        this.containerEl.empty();
        const errorDiv = this.containerEl.createDiv('storyteller-map-error');
        errorDiv.style.padding = '1em';
        errorDiv.style.border = '1px solid var(--background-modifier-error)';
        errorDiv.style.borderRadius = '4px';
        errorDiv.style.backgroundColor = 'var(--background-modifier-error)';
        errorDiv.style.color = 'var(--text-error)';
        errorDiv.style.textAlign = 'center';

        const title = errorDiv.createEl('strong');
        title.textContent = 'Map Error: ';

        const text = errorDiv.createSpan();
        text.textContent = message;
        
        console.error('[LeafletRenderer] Error displayed in container:', message);
    }

    /**
     * Component lifecycle: cleanup when unloaded
     * Called automatically by Obsidian when the markdown section is unloaded
     */
    async onunload(): Promise<void> {
        // Clean up MapEntityRenderer
        if (this.mapEntityRenderer) {
            this.mapEntityRenderer.cleanup();
            this.mapEntityRenderer = null;
        }

        // Clean up ResizeObserver
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Clean up IntersectionObserver
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }

        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.markers.clear();
        this.layers.clear();
        this.imageOverlay = null;
        this.isInitialized = false;
        this.initializationPromise = null;
        this.hasRenderedTiles = false;
    }

    /**
     * Destroy the map and cleanup (legacy method, kept for compatibility)
     * @deprecated Use onunload() instead - it's called automatically
     */
    destroy(): void {
        this.onunload();
    }

    /**
     * Get the Leaflet map instance
     */
    getMap(): L.Map | null {
        return this.map;
    }

    /**
     * Zoom in - instant zoom like Google Maps
     * Note: Mouse wheel uses smooth scrolling (configured in map options)
     * Button clicks should be instant for best UX
     */
    zoomIn(): void {
        if (this.map) {
            const currentZoom = this.map.getZoom();
            // Zoom by 1 full level, instant (no animation) like Google Maps buttons
            this.map.setZoom(Math.round(currentZoom) + 1, {
                animate: false  // Instant zoom for crisp, responsive feel
            });
        }
    }

    /**
     * Zoom out - instant zoom like Google Maps
     */
    zoomOut(): void {
        if (this.map) {
            const currentZoom = this.map.getZoom();
            // Zoom by 1 full level, instant (no animation) like Google Maps buttons
            this.map.setZoom(Math.round(currentZoom) - 1, {
                animate: false  // Instant zoom for crisp, responsive feel
            });
        }
    }

    /**
     * Reset zoom to default level
     */
    resetZoom(): void {
        if (this.map && this.params.defaultZoom !== undefined) {
            // Quick animation for reset (not instant, but fast)
            this.map.setZoom(this.params.defaultZoom, {
                animate: true,
                duration: 0.15
            });
        }
    }

    /**
     * Unload the renderer (alias for onunload)
     */
    unload(): void {
        this.onunload();
    }
}