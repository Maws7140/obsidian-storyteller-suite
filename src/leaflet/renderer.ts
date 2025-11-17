import {
    Map as LeafletMap,
    TileLayer,
    ImageOverlay,
    CRS,
    LatLngBounds,
    LatLng,
    LatLngExpression,
    DivIcon,
    Marker,
    LayerGroup,
    Control
} from 'leaflet';
import { MarkdownPostProcessorContext, Notice, TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { BlockParameters, MarkerDefinition, MapOptions } from './types';
import { extractLinkPath, parseMarkerString } from './utils/parser';

/**
 * Core Leaflet Map Renderer
 *
 * Handles rendering and managing Leaflet maps for both:
 * - Image-based maps (fantasy worlds, building layouts)
 * - Real-world maps (OpenStreetMap)
 */
export class LeafletRenderer {
    private map: LeafletMap | null = null;
    private markers: Map<string, Marker> = new Map();
    private layers: Map<string, LayerGroup> = new Map();
    private imageOverlay: ImageOverlay | null = null;

    constructor(
        private plugin: StorytellerSuitePlugin,
        private container: HTMLElement,
        private params: BlockParameters,
        private ctx: MarkdownPostProcessorContext
    ) {}

    /**
     * Initialize the map
     */
    async initialize(): Promise<void> {
        try {
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

            // Fit bounds if needed
            this.fitBounds();

        } catch (error) {
            console.error('Error initializing map:', error);
            throw error;
        }
    }

    /**
     * Initialize an image-based map
     */
    private async initializeImageMap(): Promise<void> {
        if (!this.params.image) {
            throw new Error('Image parameter required for image maps');
        }

        // Resolve image path
        const imagePath = extractLinkPath(this.params.image);
        const imageFile = this.plugin.app.metadataCache.getFirstLinkpathDest(
            imagePath,
            this.ctx.sourcePath
        );

        if (!imageFile) {
            throw new Error(`Image not found: ${imagePath}`);
        }

        // Get image URL
        const imageUrl = this.plugin.app.vault.getResourcePath(imageFile);

        // Load image to get dimensions
        const { width, height } = await this.loadImageDimensions(imageUrl);

        // Calculate bounds
        // For image maps, we use a simple coordinate system where [0,0] is top-left
        const bounds = new LatLngBounds(
            [0, 0],
            [height, width]
        );

        // Create map with Simple CRS (non-geographic)
        this.map = new LeafletMap(this.container, {
            crs: CRS.Simple,
            minZoom: this.params.minZoom ?? -2,
            maxZoom: this.params.maxZoom ?? 3,
            zoom: this.params.defaultZoom ?? 0,
            center: bounds.getCenter(),
            attributionControl: false,
            zoomControl: true
        });

        // Add image overlay
        this.imageOverlay = new ImageOverlay(imageUrl, bounds).addTo(this.map);

        // Fit to image bounds
        this.map.fitBounds(bounds);
    }

    /**
     * Initialize a real-world map
     */
    private async initializeRealMap(): Promise<void> {
        const center: [number, number] = [
            this.params.lat ?? 0,
            this.params.long ?? 0
        ];

        // Create map
        this.map = new LeafletMap(this.container, {
            center,
            zoom: this.params.defaultZoom ?? 13,
            minZoom: this.params.minZoom ?? 1,
            maxZoom: this.params.maxZoom ?? 18,
            attributionControl: true,
            zoomControl: true
        });

        // Determine tile server
        const tileUrl = this.getTileServerUrl();

        // Add tile layer
        new TileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(this.map);
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

        // Parse marker strings from parameters
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

        // Load markers from files
        if (this.params.markerFile) {
            const fileMarkers = await this.loadMarkersFromFiles(this.params.markerFile);
            markerDefinitions.push(...fileMarkers);
        }

        // Load markers from tags
        if (this.params.markerTag) {
            const tagMarkers = await this.loadMarkersFromTags(this.params.markerTag);
            markerDefinitions.push(...tagMarkers);
        }

        // Add each marker to the map
        for (const markerDef of markerDefinitions) {
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

        // Create marker
        const marker = new Marker(latLng, { icon });

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
    private createMarkerIcon(markerDef: MarkerDefinition): DivIcon {
        const iconHtml = this.getMarkerIconHtml(markerDef);

        return new DivIcon({
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
        loc: LatLngExpression | [string | number, string | number],
        isPercent?: boolean
    ): LatLng {
        // If already a LatLng, return it
        if (loc instanceof LatLng) {
            return loc;
        }

        // If it's a LatLngLiteral, convert it
        if (typeof loc === 'object' && 'lat' in loc && 'lng' in loc) {
            return new LatLng(loc.lat, loc.lng);
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

            return new LatLng(
                (yPercent / 100) * height,
                (xPercent / 100) * width
            );
        }

        // Direct coordinates
        return new LatLng(
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
            const bounds = new LatLngBounds(latLngs);
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    /**
     * Load image and get dimensions
     */
    private loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };
            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };
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
     * Destroy the map and cleanup
     */
    destroy(): void {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.markers.clear();
        this.layers.clear();
        this.imageOverlay = null;
    }

    /**
     * Get the Leaflet map instance
     */
    getMap(): LeafletMap | null {
        return this.map;
    }
}
