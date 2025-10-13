// MapEditor - Interactive Leaflet-based map editor component
// Provides canvas editing, drawing tools, marker placement, and layer management

import * as L from 'leaflet';
import 'leaflet-draw';
import { Map as StoryMap, MapMarker, MapLayer } from '../types';
import { 
    generateMarkerId, 
    pixelToLatLng, 
    calculateImageBounds,
    getDefaultMarkerIcon,
    serializeMapData,
    deserializeMapData
} from '../utils/MapUtils';
import { App, TFile } from 'obsidian';

export interface MapEditorOptions {
    container: HTMLElement;
    app: App;
    readOnly?: boolean;
    onMarkerClick?: (marker: MapMarker) => void;
    onMapChange?: () => void;
}

export class MapEditor {
    private container: HTMLElement;
    private app: App;
    private map: L.Map | null = null;
    private readOnly: boolean;
    private onMarkerClick?: (marker: MapMarker) => void;
    private onMapChange?: () => void;
    
    // Drawing and editing
    private drawControl: L.Control.Draw | null = null;
    private drawnItems: L.FeatureGroup;
    private currentTool: string = 'select';
    
    // Map state
    private mapData: StoryMap | null = null;
    private backgroundImageLayer: L.ImageOverlay | null = null;
    private markerLayers: Map<string, L.Marker> = new Map();
    private currentLayer: MapLayer | null = null;
    
    // Undo/redo stacks
    private undoStack: any[] = [];
    private redoStack: any[] = [];

    constructor(options: MapEditorOptions) {
        this.container = options.container;
        this.app = options.app;
        this.readOnly = options.readOnly || false;
        this.onMarkerClick = options.onMarkerClick;
        this.onMapChange = options.onMapChange;
        this.drawnItems = new L.FeatureGroup();
    }

    // Initialize the Leaflet map
    async initMap(mapData: StoryMap): Promise<void> {
        this.mapData = mapData;

        // Clear any existing map
        if (this.map) {
            this.map.remove();
        }

        // Calculate bounds based on background image or default
        let bounds: L.LatLngBounds;
        if (mapData.backgroundImagePath && mapData.width && mapData.height) {
            bounds = calculateImageBounds(mapData.width, mapData.height);
        } else {
            // Default bounds for maps without background
            bounds = L.latLngBounds([[-100, -100], [100, 100]]);
        }

        // Create map with CRS.Simple for image-based maps
        this.map = L.map(this.container, {
            crs: L.CRS.Simple,
            center: mapData.center ? L.latLng(mapData.center[0], mapData.center[1]) : bounds.getCenter(),
            zoom: mapData.defaultZoom || 0,
            minZoom: -2,
            maxZoom: 4,
            zoomControl: !this.readOnly,
            attributionControl: false
        });

        // Set max bounds to prevent excessive panning
        this.map.setMaxBounds(bounds.pad(0.5));

        // Add drawn items layer
        this.drawnItems.addTo(this.map);

        // Load background image if available
        if (mapData.backgroundImagePath) {
            await this.setBackgroundImage(mapData.backgroundImagePath);
        }

        // Load markers
        this.loadMarkers(mapData.markers);

        // Load saved map data (drawings, etc.)
        if (mapData.mapData) {
            this.loadMapData(mapData.mapData);
        }

        // Setup drawing controls if not read-only
        if (!this.readOnly) {
            this.setupDrawingControls();
        }

        // Setup event handlers
        this.setupEventHandlers();

        // Add grid if enabled
        if (mapData.gridEnabled) {
            this.toggleGrid(true, mapData.gridSize || 50);
        }
    }

    // Setup Leaflet.draw controls
    private setupDrawingControls(): void {
        if (!this.map) return;

        const drawOptions: L.Control.DrawConstructorOptions = {
            position: 'topright',
            draw: {
                polyline: {
                    shapeOptions: {
                        color: '#3388ff',
                        weight: 3
                    }
                },
                polygon: {
                    allowIntersection: false,
                    shapeOptions: {
                        color: '#3388ff',
                        fillOpacity: 0.3
                    }
                },
                circle: {
                    shapeOptions: {
                        color: '#3388ff',
                        fillOpacity: 0.3
                    }
                },
                rectangle: {
                    shapeOptions: {
                        color: '#3388ff',
                        fillOpacity: 0.3
                    }
                },
                marker: {},
                circlemarker: false
            },
            edit: {
                featureGroup: this.drawnItems,
                remove: true
            }
        };

        this.drawControl = new L.Control.Draw(drawOptions);
        this.map.addControl(this.drawControl);
    }

    // Setup event handlers for drawing and editing
    private setupEventHandlers(): void {
        if (!this.map) return;

        // Drawing created
        this.map.on(L.Draw.Event.CREATED, (event: any) => {
            const layer = event.layer;
            this.drawnItems.addLayer(layer);
            this.saveToUndoStack();
            this.notifyChange();
        });

        // Drawing edited
        this.map.on(L.Draw.Event.EDITED, (event: any) => {
            this.saveToUndoStack();
            this.notifyChange();
        });

        // Drawing deleted
        this.map.on(L.Draw.Event.DELETED, (event: any) => {
            this.saveToUndoStack();
            this.notifyChange();
        });

        // Map moved or zoomed
        this.map.on('moveend zoomend', () => {
            this.notifyChange();
        });
    }

    // Set or update background image
    async setBackgroundImage(imagePath: string): Promise<void> {
        if (!this.map) return;

        // Remove existing background
        if (this.backgroundImageLayer) {
            this.map.removeLayer(this.backgroundImageLayer);
        }

        // Get image from vault
        const file = this.app.vault.getAbstractFileByPath(imagePath);
        if (!file || !(file instanceof TFile)) {
            console.error('Background image not found:', imagePath);
            return;
        }

        // Get resource path
        const resourcePath = this.app.vault.getResourcePath(file);

        // Load image to get dimensions
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = resourcePath;
        });

        // Update map data dimensions
        if (this.mapData) {
            this.mapData.width = img.width;
            this.mapData.height = img.height;
            this.mapData.backgroundImagePath = imagePath;
        }

        // Calculate bounds for image
        const bounds = calculateImageBounds(img.width, img.height);

        // Create image overlay
        this.backgroundImageLayer = L.imageOverlay(resourcePath, bounds, {
            interactive: false,
            opacity: 1
        });
        this.backgroundImageLayer.addTo(this.map);

        // Fit map to bounds
        this.map.fitBounds(bounds);
        this.map.setMaxBounds(bounds.pad(0.5));

        this.notifyChange();
    }

    // Add a location marker to the map
    addMarker(lat: number, lng: number, locationName?: string, customOptions?: Partial<MapMarker>): MapMarker {
        if (!this.map || !this.mapData) {
            throw new Error('Map not initialized');
        }

        const marker: MapMarker = {
            id: generateMarkerId(),
            locationName,
            lat,
            lng,
            icon: customOptions?.icon || 'map-pin',
            color: customOptions?.color || '#3388ff',
            label: customOptions?.label || locationName || 'Marker',
            description: customOptions?.description,
            scale: customOptions?.scale || 1,
            visible: customOptions?.visible !== false,
            minZoom: customOptions?.minZoom,
            maxZoom: customOptions?.maxZoom
        };

        // Add to map data
        this.mapData.markers.push(marker);

        // Create Leaflet marker
        this.createLeafletMarker(marker);

        this.saveToUndoStack();
        this.notifyChange();

        return marker;
    }

    // Create a Leaflet marker from MapMarker data
    private createLeafletMarker(marker: MapMarker): L.Marker {
        if (!this.map) {
            throw new Error('Map not initialized');
        }

        // Create custom icon
        const iconHtml = this.createMarkerIconHtml(marker);
        const icon = L.divIcon({
            html: iconHtml,
            className: 'storyteller-map-marker',
            iconSize: [32 * (marker.scale || 1), 32 * (marker.scale || 1)],
            iconAnchor: [16 * (marker.scale || 1), 32 * (marker.scale || 1)]
        });

        // Create marker
        const markerOptions: L.MarkerOptions = {
            icon,
            draggable: !this.readOnly
        };
        const leafletMarker = L.marker([marker.lat, marker.lng], markerOptions);

        // Bind popup
        const popupContent = `
            <div class="storyteller-marker-popup">
                <strong>${marker.label || marker.locationName || 'Marker'}</strong>
                ${marker.description ? `<p>${marker.description}</p>` : ''}
                ${marker.locationName ? `<p><em>Location: ${marker.locationName}</em></p>` : ''}
            </div>
        `;
        leafletMarker.bindPopup(popupContent);

        // Handle marker drag
        if (!this.readOnly) {
            leafletMarker.on('dragend', (event: L.DragEndEvent) => {
                const newPos = event.target.getLatLng();
                marker.lat = newPos.lat;
                marker.lng = newPos.lng;
                this.saveToUndoStack();
                this.notifyChange();
            });
        }

        // Handle marker click
        leafletMarker.on('click', () => {
            if (this.onMarkerClick) {
                this.onMarkerClick(marker);
            }
        });

        // Add to map and store reference
        leafletMarker.addTo(this.map);
        this.markerLayers.set(marker.id, leafletMarker);

        return leafletMarker;
    }

    // Create HTML for marker icon
    private createMarkerIconHtml(marker: MapMarker): string {
        const color = marker.color || '#3388ff';
        return `
            <div style="
                background-color: ${color};
                border: 2px solid white;
                border-radius: 50% 50% 50% 0;
                width: 100%;
                height: 100%;
                transform: rotate(-45deg);
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">
                <div style="
                    transform: rotate(45deg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: white;
                    font-size: 14px;
                ">
                    📍
                </div>
            </div>
        `;
    }

    // Load all markers from map data
    private loadMarkers(markers: MapMarker[]): void {
        if (!this.map) return;

        // Clear existing markers
        this.markerLayers.forEach(marker => marker.remove());
        this.markerLayers.clear();

        // Create new markers
        markers.forEach(marker => {
            if (marker.visible !== false) {
                this.createLeafletMarker(marker);
            }
        });
    }

    // Remove a marker by ID
    removeMarker(markerId: string): void {
        if (!this.mapData) return;

        // Remove from map data
        const index = this.mapData.markers.findIndex(m => m.id === markerId);
        if (index !== -1) {
            this.mapData.markers.splice(index, 1);
        }

        // Remove Leaflet marker
        const leafletMarker = this.markerLayers.get(markerId);
        if (leafletMarker) {
            leafletMarker.remove();
            this.markerLayers.delete(markerId);
        }

        this.saveToUndoStack();
        this.notifyChange();
    }

    // Toggle grid overlay
    toggleGrid(enabled: boolean, gridSize: number = 50): void {
        if (!this.map) return;

        // Remove existing grid layers
        this.map.eachLayer((layer: L.Layer) => {
            if ((layer as any).gridLayer) {
                this.map?.removeLayer(layer);
            }
        });

        if (enabled && this.mapData) {
            // Create grid using canvas
            const bounds = this.map.getBounds();
            // Grid implementation would go here - simplified for now
            // This would create a canvas overlay with grid lines
        }

        if (this.mapData) {
            this.mapData.gridEnabled = enabled;
            this.mapData.gridSize = gridSize;
        }

        this.notifyChange();
    }

    // Export current map state to JSON
    exportMapData(): string {
        if (!this.map || !this.mapData) {
            return '{}';
        }

        // Get current view state
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();

        // Collect all drawn items as GeoJSON
        const drawnGeoJSON = this.drawnItems.toGeoJSON();

        const mapState = {
            center: [center.lat, center.lng],
            zoom,
            drawings: drawnGeoJSON,
            layers: this.mapData.layers
        };

        return serializeMapData(mapState);
    }

    // Load map state from JSON
    loadMapData(mapDataString: string): void {
        if (!this.map) return;

        try {
            const mapState = deserializeMapData(mapDataString);

            // Restore drawings
            if (mapState.drawings && mapState.drawings.features) {
                L.geoJSON(mapState.drawings, {
                    onEachFeature: (feature, layer) => {
                        this.drawnItems.addLayer(layer);
                    }
                });
            }

            // Restore view state
            if (mapState.center) {
                this.map.setView(mapState.center, mapState.zoom || 0);
            }
        } catch (error) {
            console.error('Error loading map data:', error);
        }
    }

    // Get current map data
    getMapData(): StoryMap | null {
        if (!this.mapData) return null;

        // Update current view state
        if (this.map) {
            const center = this.map.getCenter();
            this.mapData.center = [center.lat, center.lng];
            this.mapData.defaultZoom = this.map.getZoom();
        }

        // Update serialized map data
        this.mapData.mapData = this.exportMapData();

        return this.mapData;
    }

    // Undo last action
    undo(): void {
        if (this.undoStack.length === 0) return;

        const state = this.undoStack.pop();
        if (state) {
            this.redoStack.push(this.captureCurrentState());
            this.restoreState(state);
            this.notifyChange();
        }
    }

    // Redo last undone action
    redo(): void {
        if (this.redoStack.length === 0) return;

        const state = this.redoStack.pop();
        if (state) {
            this.undoStack.push(this.captureCurrentState());
            this.restoreState(state);
            this.notifyChange();
        }
    }

    // Save current state to undo stack
    private saveToUndoStack(): void {
        const state = this.captureCurrentState();
        this.undoStack.push(state);
        this.redoStack = []; // Clear redo stack
        
        // Limit undo stack size
        if (this.undoStack.length > 50) {
            this.undoStack.shift();
        }
    }

    // Capture current map state
    private captureCurrentState(): any {
        return {
            markers: JSON.parse(JSON.stringify(this.mapData?.markers || [])),
            drawings: this.drawnItems.toGeoJSON()
        };
    }

    // Restore a previous state
    private restoreState(state: any): void {
        if (!this.mapData) return;

        // Restore markers
        this.mapData.markers = JSON.parse(JSON.stringify(state.markers));
        this.loadMarkers(this.mapData.markers);

        // Restore drawings
        this.drawnItems.clearLayers();
        if (state.drawings) {
            L.geoJSON(state.drawings, {
                onEachFeature: (feature, layer) => {
                    this.drawnItems.addLayer(layer);
                }
            });
        }
    }

    // Notify parent of changes
    private notifyChange(): void {
        if (this.onMapChange) {
            this.onMapChange();
        }
    }

    // Fit map to show all markers
    fitToMarkers(): void {
        if (!this.map || !this.mapData || this.mapData.markers.length === 0) return;

        const markerPositions = this.mapData.markers.map(m => L.latLng(m.lat, m.lng));
        const bounds = L.latLngBounds(markerPositions);
        this.map.fitBounds(bounds.pad(0.1));
    }

    // Clean up and destroy map
    destroy(): void {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.markerLayers.clear();
        this.drawnItems.clearLayers();
    }
}

