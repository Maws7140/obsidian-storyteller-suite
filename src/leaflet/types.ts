import type { LatLngExpression, LatLngBoundsExpression, CRS, Layer } from 'leaflet';
import type { TFile, CachedMetadata } from 'obsidian';

/**
 * YAML Parameters from code block
 * Parsed from ```storyteller-map blocks
 */
export interface BlockParameters {
    // Map Type
    type?: 'image' | 'real';

    // Image Map Parameters
    image?: string;           // Path to image file
    height?: string | number; // Image height in pixels
    width?: string | number;  // Image width in pixels

    // Real Map Parameters
    lat?: number;            // Initial latitude
    long?: number;           // Initial longitude
    minZoom?: number;        // Minimum zoom level
    maxZoom?: number;        // Maximum zoom level
    defaultZoom?: number;    // Initial zoom level

    // Tile Server
    tileServer?: string;     // Custom tile server URL

    // Map Appearance
    unit?: string;           // Distance unit (miles, kilometers, etc.)
    scale?: number;          // Real-world scale ratio
    darkMode?: boolean;      // Enable dark mode tiles

    // Drawing Controls
    draw?: boolean;          // Enable drawing controls

    // Markers
    marker?: string | string[];           // Marker definitions
    markerFile?: string | string[];       // Files to load markers from
    markerTag?: string | string[];        // Tags to filter markers

    // GeoJSON/GPX Layers
    geojson?: string | string[];          // GeoJSON file paths
    geojsonColor?: string;                // GeoJSON default color
    gpx?: string | string[];              // GPX file paths
    gpxColor?: string;                    // GPX default color

    // Overlays
    overlay?: Array<[string, [number, number], [number, number]]>; // Image overlays

    // Map ID
    id?: string;             // Unique map identifier

    // Coordinates from links
    coordinates?: Array<{ link: string; location: LatLngExpression }>;

    // Bounds
    bounds?: LatLngBoundsExpression;

    // Additional metadata
    [key: string]: any;
}

/**
 * Marker Definition
 */
export interface MarkerDefinition {
    id?: string;
    type: 'default' | 'location' | 'character' | 'event';

    // Position
    loc: LatLngExpression | [string | number, string | number]; // Coords or percent for image maps
    percent?: boolean;  // Whether loc is percentage-based

    // Content
    link?: string;      // Link to note ([[Note]] or [Note](path))
    command?: string;   // Obsidian command to execute
    description?: string; // Tooltip/popup text

    // Appearance
    icon?: string;      // Icon name/HTML
    iconColor?: string; // Icon color

    // Visibility
    minZoom?: number;
    maxZoom?: number;

    // Layer
    layer?: string;     // Layer name for grouping

    // Metadata
    mutable?: boolean;  // Can be edited/deleted
}

/**
 * Marker Icon Definition
 */
export interface MarkerIconDefinition {
    name: string;
    type: 'html' | 'svg';
    html?: string;
    iconUrl?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
    className?: string;
    color?: string;
}

/**
 * Map Configuration (stored in settings)
 */
export interface MapConfiguration {
    id: string;
    created: number;
    modified: number;

    // Map Type
    type: 'image' | 'real';

    // Image Map
    image?: string;
    bounds?: LatLngBoundsExpression;

    // Real Map
    center?: LatLngExpression;
    zoom?: number;
    tileServer?: string;

    // Appearance
    darkMode?: boolean;

    // Layers
    markers: MarkerDefinition[];
    geojsonFiles?: string[];
    gpxFiles?: string[];
    overlays?: OverlayDefinition[];

    // Settings
    scale?: number;
    unit?: string;
}

/**
 * Overlay Definition
 */
export interface OverlayDefinition {
    url: string;
    bounds: LatLngBoundsExpression;
    opacity?: number;
}

/**
 * GeoJSON Layer Configuration
 */
export interface GeoJSONLayerConfig {
    file: string;
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    weight?: number;
    radius?: number; // For point features
}

/**
 * GPX Layer Configuration
 */
export interface GPXLayerConfig {
    file: string;
    color?: string;
    weight?: number;
}

/**
 * Map Options (runtime configuration)
 */
export interface MapOptions {
    type: 'image' | 'real';

    // Container
    containerEl: HTMLElement;

    // Coordinate Reference System
    crs?: typeof CRS;

    // Image Map
    imageUrl?: string;
    imageBounds?: LatLngBoundsExpression;

    // Real Map
    center?: LatLngExpression;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    tileUrl?: string;

    // Appearance
    darkMode?: boolean;
    attributionControl?: boolean;
    zoomControl?: boolean;

    // Interaction
    dragging?: boolean;
    doubleClickZoom?: boolean;
    scrollWheelZoom?: boolean;
    touchZoom?: boolean;

    // Drawing
    drawControl?: boolean;
}

/**
 * Marker Click Event
 */
export interface MarkerClickEvent {
    marker: MarkerDefinition;
    originalEvent: MouseEvent;
}

/**
 * Marker Context Menu Event
 */
export interface MarkerContextMenuEvent {
    marker: MarkerDefinition;
    originalEvent: MouseEvent;
}

/**
 * Frontmatter Location Data
 */
export interface FrontmatterLocation {
    location: string | [number, number]; // Can be link reference or coords
    lat?: number;
    long?: number;
    link?: string;
}

/**
 * File Marker Metadata
 * Extracted from note frontmatter
 */
export interface FileMarkerMetadata {
    file: TFile;
    cache: CachedMetadata;

    // Location data
    location?: FrontmatterLocation;

    // Marker appearance
    markerIcon?: string;
    markerColor?: string;

    // Marker behavior
    markerTooltip?: string;

    // Visibility
    markerMinZoom?: number;
    markerMaxZoom?: number;
}

/**
 * DataView Query Result
 */
export interface DataViewQueryResult {
    file: TFile;
    values: Record<string, any>;
}

/**
 * Map Event Types
 */
export type MapEvent =
    | 'marker-added'
    | 'marker-updated'
    | 'marker-removed'
    | 'layer-added'
    | 'layer-removed'
    | 'bounds-changed'
    | 'zoom-changed';

/**
 * Map Event Handler
 */
export interface MapEventHandler {
    event: MapEvent;
    handler: (...args: any[]) => void;
}

/**
 * Distance Measurement
 */
export interface DistanceMeasurement {
    distance: number;
    unit: string;
    coordinates: LatLngExpression[];
}

/**
 * Drawing Data
 */
export interface DrawingData {
    type: 'polyline' | 'polygon' | 'circle' | 'rectangle' | 'marker';
    layer: Layer;
    coordinates?: LatLngExpression[];
    radius?: number;
    bounds?: LatLngBoundsExpression;
}

/**
 * Plugin Settings for Maps
 */
export interface LeafletMapSettings {
    // Default tile server
    defaultTileServer: string;

    // Marker icons
    markerIcons: MarkerIconDefinition[];

    // Map configurations
    maps: Record<string, MapConfiguration>;

    // Default settings
    defaultZoom: number;
    defaultMinZoom: number;
    defaultMaxZoom: number;
    defaultCenter: LatLngExpression;

    // Feature flags
    enableDrawing: boolean;
    enableMarkerClustering: boolean;

    // Performance
    markerClusterRadius: number;
    debounceTime: number; // Milliseconds
}
