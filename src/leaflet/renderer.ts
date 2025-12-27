// Use global L object that's set in main.ts: (window as any).L = L
// Import Leaflet CSS to ensure it's loaded when renderer is used
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';
import { Component, MarkdownPostProcessorContext, Notice, TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { BlockParameters, MarkerDefinition, MapOptions } from './types';
import { extractLinkPath, parseMarkerString } from './utils/parser';
import { EntityMarkerDiscovery } from './EntityMarkerDiscovery';
import { MapEntityRenderer } from './MapEntityRenderer';

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
    private isInitialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;
    private mapEntityRenderer: MapEntityRenderer | null = null;

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
            if (this.params.type === 'image') {
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

            // Fit bounds if needed
            this.fitBounds();

            this.isInitialized = true;

            // Call invalidateSize after initialization to ensure proper rendering
            requestAnimationFrame(() => {
                this.invalidateSize();
            });

        } catch (error) {
            console.error('Error initializing map:', error);
            throw error;
        }
    }

    /**
     * Wait for container to have computed dimensions
     * This ensures Leaflet initializes with proper dimensions
     */
    private async waitForContainerDimensions(): Promise<void> {
        return new Promise((resolve) => {
            const checkDimensions = () => {
                const rect = this.containerEl.getBoundingClientRect();
                const hasDimensions = rect.width > 0 && rect.height > 0;

                if (hasDimensions) {
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
     */
    private setupResizeObserver(): void {
        if (typeof ResizeObserver === 'undefined') {
            // Fallback for environments without ResizeObserver
            return;
        }

        this.resizeObserver = new ResizeObserver(() => {
            if (this.map && this.isInitialized) {
                // Debounce invalidateSize calls
                requestAnimationFrame(() => {
                    this.invalidateSize();
                });
            }
        });

        this.resizeObserver.observe(this.containerEl);
    }

    /**
     * Initialize an image-based map
     */
    private async initializeImageMap(): Promise<void> {
        if (!this.params.image) {
            throw new Error('Image parameter required for image maps');
        }

        console.log('[LeafletRenderer] Initializing image map with image:', this.params.image);

        // Resolve image path
        const imagePath = extractLinkPath(this.params.image);
        console.log('[LeafletRenderer] Resolved image path:', imagePath);

        const imageFile = this.plugin.app.metadataCache.getFirstLinkpathDest(
            imagePath,
            this.ctx.sourcePath
        );

        if (!imageFile) {
            console.error('[LeafletRenderer] Image file not found:', imagePath);
            throw new Error(`Image not found: ${imagePath}`);
        }

        console.log('[LeafletRenderer] Found image file:', imageFile.path);

        // Get image URL using the correct Obsidian API
        // CRITICAL: Use vault.adapter.getResourcePath() not vault.getResourcePath()
        // This matches the pattern used in NetworkGraphRenderer, DashboardView, and GalleryModal
        const imageUrl = this.plugin.app.vault.adapter.getResourcePath(imageFile.path);
        console.log('[LeafletRenderer] Image resource URL:', imageUrl);

        // Load image to get dimensions
        try {
            const { width, height } = await this.loadImageDimensions(imageUrl);
            console.log('[LeafletRenderer] Image dimensions:', { width, height });

            // Calculate bounds for Leaflet Simple CRS
            // Simple CRS uses pixel coordinates with origin at top-left
            // Bounds format: [[south, west], [north, east]] or [[minY, minX], [maxY, maxX]]
            // For images: top-left is [0, 0] and bottom-right is [height, width]
            const bounds = L.latLngBounds(
                [0, 0],           // Top-left corner
                [height, width]   // Bottom-right corner
            );

            console.log('[LeafletRenderer] Calculated bounds:', bounds.toBBoxString());

            // Ensure container has an ID for Leaflet
            if (!this.containerEl.id) {
                this.containerEl.id = `leaflet-map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            }

            // Create map with Simple CRS (non-geographic) using L.map() with ID string
            // DON'T set initial zoom/center - let fitBounds handle it!
            // This prevents the tiling/repeating issue
            this.map = L.map(this.containerEl.id, {
                crs: L.CRS.Simple,
                minZoom: this.params.minZoom ?? -2,
                maxZoom: this.params.maxZoom ?? 3,
                attributionControl: false,
                zoomControl: true,
                // Smooth zoom options optimized for trackpad/mouse wheel
                zoomDelta: 0.25,
                zoomSnap: 0,  // No snapping = completely fluid
                wheelPxPerZoomLevel: 150,  // Reduced sensitivity for smoother scrolling
                wheelDebounceTime: 100,  // Increased debounce to prevent event stacking
                zoomAnimation: true,
                fadeAnimation: true,
                markerZoomAnimation: false,  // Disabled to reduce lag with many markers
                // Smooth panning with reduced inertia
                inertia: true,
                inertiaDeceleration: 2000,  // Reduced for more predictable panning
                inertiaMaxSpeed: 1000  // Reduced for better control
                // NOTE: No initial zoom, center, or maxBounds set here
                // These interfere with fitBounds()
            });

            console.log('[LeafletRenderer] Created map with Simple CRS using ID:', this.containerEl.id);

            // Add image overlay using L.imageOverlay() factory
            this.imageOverlay = L.imageOverlay(imageUrl, bounds, {
                interactive: false,
                className: 'storyteller-map-image-overlay'
            }).addTo(this.map);

            console.log('[LeafletRenderer] Added image overlay with bounds:', bounds.toBBoxString());

            // Fit to image bounds - this sets the correct zoom and center
            // Do this AFTER adding the overlay
            this.map.fitBounds(bounds);

            // AFTER fitBounds, set maxBounds to prevent panning outside
            this.map.setMaxBounds(bounds.pad(0.1));

            console.log('[LeafletRenderer] Fitted map to bounds and set max bounds');

            console.log('[LeafletRenderer] Image map initialization complete');

        } catch (error) {
            console.error('[LeafletRenderer] Error loading image dimensions:', error);
            throw new Error(`Failed to load image: ${error.message}`);
        }
    }

    /**
     * Initialize a real-world map
     * Following standard Leaflet pattern: L.map() + L.tileLayer()
     */
    private async initializeRealMap(): Promise<void> {
        // Use default coordinates if not provided (London, UK as a reasonable default)
        const center: [number, number] = [
            this.params.lat ?? 51.5074,
            this.params.long ?? -0.1278
        ];

        console.log('[LeafletRenderer] Initializing real-world map at', center);

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
            // Smooth zoom options optimized for trackpad/mouse wheel
            zoomDelta: 0.25,
            zoomSnap: 0,  // No snapping = completely fluid
            wheelPxPerZoomLevel: 150,  // Reduced sensitivity for smoother scrolling
            wheelDebounceTime: 100,  // Increased debounce to prevent event stacking
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: false,  // Disabled to reduce lag with many markers
            // Smooth panning with reduced inertia
            inertia: true,
            inertiaDeceleration: 2000,  // Reduced for more predictable panning
            inertiaMaxSpeed: 1000  // Reduced for better control
        }).setView(center, this.params.defaultZoom ?? 13);

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

        if (isPercent && this.params.type === 'image' && this.imageOverlay) {
            // Convert percentage to pixel coordinates
            const bounds = this.imageOverlay.getBounds();
            const height = bounds.getNorth();
            const width = bounds.getEast();

            const xPercent = typeof tuple[1] === 'string'
                ? parseFloat(tuple[1].replace('%', ''))
                : tuple[1];
            const yPercent = typeof tuple[0] === 'string'
                ? parseFloat(tuple[0].replace('%', ''))
                : tuple[0];

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
     */
    invalidateSize(): void {
        if (this.map) {
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            });
        }
    }

    /**
     * Refresh entities on the map without reloading the entire map
     * Useful after adding/removing entities
     */
    async refreshEntities(): Promise<void> {
        if (!this.mapEntityRenderer || !this.params.mapId) return;

        const mapId = this.params.mapId;
        await this.mapEntityRenderer.renderEntitiesForMap(mapId);
    }

    /**
     * Component lifecycle: called when component is loaded into DOM
     * This is called automatically by Obsidian when the component is added to the DOM
     * Following javalent-obsidian-leaflet pattern
     */
    onload(): void {
        console.log('[LeafletRenderer] onload() called - component added to DOM');

        // If map hasn't been initialized yet, initialize it now
        // This ensures the container is in the DOM before initialization
        // Use a small delay to ensure the container has been properly reflowed
        if (!this.isInitialized && !this.initializationPromise) {
            // Use setTimeout instead of requestAnimationFrame for more reliable timing
            // This gives the browser time to fully process the DOM insertion and layout
            setTimeout(() => {
                console.log('[LeafletRenderer] Starting initialization after onload delay');
                this.initialize();
            }, 50); // 50ms delay for DOM reflow
        } else if (this.isInitialized && this.map) {
            // If already initialized, invalidate size to ensure proper rendering
            requestAnimationFrame(() => {
                this.invalidateSize();
            });
        }
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

        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.markers.clear();
        this.layers.clear();
        this.imageOverlay = null;
        this.isInitialized = false;
        this.initializationPromise = null;
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
