# Maps Implementation Insights from Leaflet Plugin Analysis

This document captures detailed implementation patterns learned from analyzing the Obsidian Leaflet plugin source code (17,671 lines).

## Table of Contents
1. [Core Architecture](#core-architecture)
2. [Code Block Processing](#code-block-processing)
3. [Type System](#type-system)
4. [Marker Implementation](#marker-implementation)
5. [GeoJSON & GPX Layers](#geojson--gpx-layers)
6. [Settings & State Management](#settings--state-management)
7. [Implementation Checklist](#implementation-checklist)

---

## Core Architecture

### Plugin Entry Point (`src/main.ts`)

```typescript
export default class ObsidianLeaflet extends Plugin {
    data: ObsidianAppData;               // Plugin settings
    markerIcons: MarkerIcon[];           // Generated marker types
    maps: MapInterface[] = [];           // All active maps
    mapFiles: { file: string; maps: string[] }[] = [];  // Map -> file tracking

    async onload() {
        // 1. Load settings
        await this.loadSettings();

        // 2. Generate marker icons from settings
        this.markerIcons = this.generateMarkerMarkup(this.data.markerIcons);

        // 3. Register code block processor
        this.registerMarkdownCodeBlockProcessor(
            "leaflet",
            this.postprocessor.bind(this)
        );

        // 4. Register settings tab
        this.addSettingTab(new ObsidianLeafletSettingTab(this.app, this));
    }
}
```

**Key Pattern**: Plugin maintains global state for all maps and synchronizes changes across multiple instances of the same map ID.

### Map Lifecycle

```typescript
async postprocessor(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    // 1. Parse parameters from YAML
    let params = getParamsFromSource(source);

    // 2. Validate required fields
    if (!params.id) {
        new Notice("Obsidian Leaflet maps must have an ID.");
        throw new Error("ID required");
    }

    // 3. Create renderer
    const renderer = new LeafletRenderer(
        this,
        ctx.sourcePath,
        el,
        params,
        source
    );

    // 4. Build map
    const map = await renderer.getMap();

    // 5. Register events
    this.registerMapEvents(map);

    // 6. Add to context for cleanup
    ctx.addChild(renderer);

    // 7. Store map reference
    this.maps.push({ map, source, el, id: params.id });
}
```

---

## Code Block Processing

### YAML Parameter Parsing

**Location**: `src/utils/utils.ts` - `getParamsFromSource()`

**Strategy**:
1. Replace all wikilinks/markdown links with placeholders
2. Try parsing with `parseYaml()` (Obsidian's YAML parser)
3. If YAML fails, fall back to manual `key: value` parsing
4. Restore links from placeholders
5. Handle special multi-line parameters (marker, image, geojson, etc.)

```typescript
export function getParamsFromSource(source: string): BlockParameters {
    let params: BlockParameters = {};

    // Step 1: Extract links
    const links = source.match(/(?:\[.*\]\(|\[\[)[^\[\]]*(?:\)|\]\])/g) ?? [];
    for (let link of links) {
        source = source.replace(
            link,
            `LEAFLET_INTERNAL_LINK_${links.indexOf(link)}`
        );
    }

    // Step 2: Parse YAML
    try {
        params = parseYaml(source);
    } catch (e) {
        // Fallback to manual parsing
        params = Object.fromEntries(
            source.split("\n").map((l) => l.split(/:\s?/))
        );
    }

    // Step 3: Restore links
    if (links.length) {
        let stringified = JSON.stringify(params);
        for (let link of links) {
            stringified = stringified.replace(
                `LEAFLET_INTERNAL_LINK_${links.indexOf(link)}`,
                link
            );
        }
        params = JSON.parse(stringified);
    }

    // Step 4: Handle multi-valued parameters
    // (marker, markerFolder, markerTag, geojson, overlay, etc.)
    // ...

    return params;
}
```

**Critical Insight**: The parsing must handle:
- Multiple `marker:` lines in the same code block
- Multiple `image:` lines (for multi-layer image maps)
- Array syntax: `markerTag: [tag1, tag2]` AND multiple lines
- Link preservation (wikilinks and markdown links)

### Block Parameters Type

```typescript
export interface BlockParameters {
    // Required
    id?: string;                          // Map ID (required!)

    // Image-based maps
    image?: string | string[];            // Image file path(s)
    layers?: string[];                    // All image layers
    bounds?: [[number, number], [number, number]];

    // Real-world maps
    osmLayer?: boolean;                   // Enable OpenStreetMap
    tileServer?: string | string[];       // Custom tile URL
    tileSubdomains?: string | string[];   // Tile subdomains
    tileOverlay?: string | string[];      // Overlay tiles

    // View configuration
    lat?: string;                         // Center latitude
    long?: string;                        // Center longitude
    defaultZoom?: number;
    minZoom?: number;
    maxZoom?: number;
    height?: string;                      // "500px" or "75%"
    width?: string;

    // Markers (static)
    marker?: string[];                    // Static markers from code block
    commandMarker?: string[];             // Command-executing markers

    // Markers (dynamic)
    markerFolder?: string[];              // Load from folder
    markerFile?: string[];                // Load specific files
    markerTag?: string[][];               // Load by tag (DataView)
    filterTag?: string[][];               // Filter by tag

    // Data layers
    geojson?: string[];                   // GeoJSON file paths
    geojsonFolder?: string[];             // Folder of GeoJSON
    geojsonColor?: string;
    gpx?: string[];                       // GPX file paths
    gpxFolder?: string[];
    gpxColor?: string;
    gpxMarkers?: {                        // GPX marker types
        start?: string;
        end?: string;
        waypoint?: string;
    };

    // Overlays
    overlay?: string[];                   // Circle overlays
    overlayTag?: string;
    overlayColor?: string;
    imageOverlay?: Array<[string, [number, number], [number, number]]>;

    // Features
    draw?: boolean;                       // Enable drawing tools
    drawColor?: string;
    zoomFeatures?: boolean;               // Zoom to fit all features
    showAllMarkers?: boolean;

    // UI
    noUI?: boolean;                       // Hide all controls
    noScrollZoom?: boolean;
    lock?: boolean;                       // Prevent editing
    darkMode?: string;

    // Advanced
    scale?: number;                       // Distance scale
    unit?: string;                        // "meters", "km", "mi"
    distanceMultiplier?: number;
    preserveAspect?: boolean;             // For images
    recenter?: boolean;                   // Force recenter on drag
    verbose?: boolean;                    // Console logging
}
```

---

## Type System

### Core Map Interface

```typescript
export interface MapInterface {
    map: BaseMapType;      // The actual map instance
    source: string;        // Original code block source
    el: HTMLElement;       // Container element
    id: string;            // Map ID
}
```

### BaseMapType (Abstract Class)

```typescript
abstract class BaseMap extends Events {
    // Must implement
    abstract render(options: {
        coords: [number, number];
        zoomDistance: number;
        imageOverlayData?: {...}[];
    }): Promise<void>;
    abstract type: string;          // "image" or "real"
    abstract get bounds(): L.LatLngBounds;
    abstract get scale(): number;
    abstract get CRS(): L.CRS;      // L.CRS.Simple or L.CRS.EPSG3857

    // Properties
    leafletInstance: L.Map;
    contentEl: HTMLElement;
    controller: DrawingController;

    // Layers
    featureLayer: L.FeatureGroup;   // GeoJSON/GPX
    drawingLayer: L.LayerGroup;      // User drawings
    gpxLayer: L.FeatureGroup;

    // Data
    markers: Marker[];
    geojsonData: any[];
    gpxData: { data: string; alias?: string }[];

    // State
    isDrawing: boolean;
    displaying: Map<string, boolean>;  // Marker type visibility

    // Methods
    createMarker(...): Marker;
    removeMarker(marker: Marker): void;
    addMarker(props: SavedMarkerProperties): void;
    updateMarker(marker: Marker): void;
    toProperties(): MapMarkerData;     // For saving
}
```

### Marker Type System

```typescript
export interface MarkerProperties {
    id: string;
    type: string;                      // Marker type name
    loc: L.LatLng;                     // Coordinates
    link: string;                      // Note path or URL
    layer: string;                     // Layer name
    mutable: boolean;                  // Can edit?
    command: boolean;                  // Execute command?
    percent: [number, number];         // For image maps
    description: string;
    minZoom?: number;                  // Visibility range
    maxZoom?: number;
    tooltip?: TooltipDisplay;          // "always" | "hover" | "never"
}

export interface SavedMarkerProperties {
    type: string | {                   // Can save custom icon inline
        icon: string;
        color: string;
        layer: boolean;
    };
    loc: [number, number];             // Saved as array
    percent: [number, number];
    id: string;
    link: string;
    layer: string;
    command: boolean;
    mutable: boolean;
    description: string;
    minZoom: number;
    maxZoom: number;
    tooltip: TooltipDisplay;
}
```

### Icon System

```typescript
export interface Icon {
    type: string;                      // Icon type name
    iconName?: string;                 // Font Awesome icon
    isImage?: boolean;
    imageUrl?: string;                 // Custom image URL
    color?: string;                    // Icon color
    alpha?: number;                    // Opacity (0-1)
    layer?: boolean;                   // Layer on base marker?
    transform?: {                      // Icon transformations
        size: number;
        x: number;
        y: number;
    };
    tags?: string[];                   // Auto-apply to notes with tags
    minZoom?: number;                  // Type-level zoom constraints
    maxZoom?: number;
}

export interface MarkerIcon {
    type: string;
    html: string;                      // Rendered SVG/HTML
    icon: MarkerDivIcon;               // Leaflet DivIcon
    markerIcon: Icon;                  // Original icon definition
}
```

---

## Marker Implementation

### Marker Class Structure

**Location**: `src/layer/marker.ts`

```typescript
export class Marker extends Layer<DivIconMarker> {
    // Properties
    leafletInstance: DivIconMarker;    // The actual Leaflet marker
    target: MarkerTarget;              // Link, Command, or Text
    loc: L.LatLng;
    id: string;
    type: string;
    layer: string;
    description: string;
    minZoom: number;
    maxZoom: number;
    tooltip: TooltipDisplay;
    mutable: boolean;                  // Can edit?
    command: boolean;                  // Execute command?
    percent: [number, number];         // Position as % (for images)

    constructor(map: BaseMapType, props: MarkerProperties) {
        super();

        // 1. Get marker icon
        const markerIcon = map.markerIcons.get(type) ?? map.markerIcons.get("default");
        const icon = markerDivIcon(plugin.parseIcon(markerIcon));

        // 2. Create Leaflet marker
        this.leafletInstance = divIconMarker(loc, {
            icon,
            keyboard: mutable && !map.options.lock,
            draggable: mutable && !map.options.lock,
            bubblingMouseEvents: true
        });

        // 3. Set up target (link/command/text)
        if (command) {
            this.target = new Command(link, app);
        } else if (link) {
            this.target = new Link(link, app, description);
        } else if (description) {
            this.target = new Text(description);
        }

        // 4. Add to map
        this.checkAndAddToMap();

        // 5. Bind all events
        this.bindEvents();
    }
}
```

### Marker Target Types

**Three types of marker actions**:

```typescript
// 1. Text - just displays text
class Text extends MarkerTarget {
    constructor(public text: string) {}
    get display() {
        return createSpan({ text: this.text });
    }
    async run() {}  // No action
}

// 2. Link - opens a note
class Link extends MarkerTarget {
    constructor(private _text: string, private app: App, public description?: string) {}

    get display() {
        // Shows description + link
        const holder = createDiv();
        holder.createSpan({ text: this.description });
        holder.createSpan({ text: this.text, cls: "internal-link" });
        return holder;
    }

    async run(evt: L.LeafletMouseEvent) {
        await app.workspace.openLinkText(
            this._text.replace("^", "#^").split(/\|/).shift(),
            "",
            evt.originalEvent.getModifierState(MODIFIER_KEY)  // New pane?
        );
    }
}

// 3. Command - executes Obsidian command
class Command extends MarkerTarget {
    constructor(private _text: string, private app: App) {}

    get display() {
        const div = createDiv();
        setIcon(div.createSpan(), "run-command");
        div.createSpan({ text: this.command.name });
        return div;
    }

    run(evt: L.LeafletMouseEvent) {
        if (this.exists) app.commands.executeCommandById(this._text);
    }
}
```

### Marker Event Handling

**All marker events**:

```typescript
private bindEvents() {
    this.leafletInstance
        // Right-click: Edit menu
        .on("contextmenu", (evt) => {
            if (evt.originalEvent.getModifierState("Shift")) {
                this.map.beginOverlayDrawingContext(evt, this);
                return;
            }

            if (!this.mutable) {
                new Notice("This marker cannot be edited...");
                return;
            }

            const menu = new Menu();
            menu.addItem((item) => item.setTitle("Edit Marker").onClick(() => this.editMarker()));
            menu.addItem((item) => item.setTitle("Convert to Code Block").onClick(...));
            menu.addItem((item) => item.setTitle("Delete Marker").onClick(...));
            menu.showAtMouseEvent(evt.originalEvent);
        })

        // Double-click: Edit marker
        .on("dblclick", (evt) => {
            if (!this.mutable) return;
            this.editMarker();
        })

        // Click: Execute action or show coordinates
        .on("click", async (evt) => {
            if (this.map.isDrawing) {
                this.map.onMarkerClick(this, evt);
                return;
            }

            if (evt.originalEvent.getModifierState("Alt") || evt.originalEvent.getModifierState("Shift")) {
                // Show coordinates
                const latlng = formatLatLng(this.latLng);
                this.popup.open(`[${latlng.lat}, ${latlng.lng}]`);

                if (this.map.data.copyOnClick && evt.originalEvent.getModifierState(MODIFIER_KEY)) {
                    await copyToClipboard(this.loc);
                }
                return;
            }

            // Execute target action (open note, run command, etc.)
            if (this.target) {
                this.target.run(evt);
            }
        })

        // Drag: Update position and sync across maps
        .on("drag", (evt) => {
            this.map.trigger("marker-dragging", this);
            if (this.tooltip === "always" && this.popup) {
                this.popup.setLatLng(evt.latlng);
            }
        })
        .on("dragend", (evt) => {
            const old = this.loc;
            this.setLatLng(this.leafletInstance.getLatLng());
            this.map.trigger("marker-data-updated", this, old);
        })

        // Hover: Show popup and note preview
        .on("mouseover", (evt) => {
            this.isBeingHovered = true;

            // Show tooltip
            if (this.target) {
                this.popup.open(this.target.display);
            }

            // Trigger Obsidian's note preview
            if (this.map.data.notePreview && this.link) {
                this.map.plugin.app.workspace.trigger("hover-link", {
                    event: evt.originalEvent,
                    source: this.map.plugin.manifest.id,
                    hoverParent: {
                        state: { source: OBSIDIAN_LEAFLET_POPOVER_SOURCE }
                    },
                    targetEl: this.leafletInstance.getElement(),
                    linktext: this.link.replace("^", "#^").split("|").shift(),
                    state: { source: OBSIDIAN_LEAFLET_POPOVER_SOURCE }
                });
            }
        })
        .on("mouseout", (evt) => {
            this.leafletInstance.closeTooltip();
            this.isBeingHovered = false;
        });

    // Zoom-based visibility
    this.map.leafletInstance.on("zoomanim", (evt: L.ZoomAnimEvent) => {
        if (this.shouldShow(evt.zoom)) {
            this.map.leafletInstance.once("zoomend", () => this.show());
        } else if (this.shouldHide(evt.zoom)) {
            this.hide();
        }
    });

    // Lock state changes
    this.map.on("lock", () => {
        if (!this.mutable) return;
        if (this.map.options.lock) {
            this.leafletInstance.dragging.disable();
        } else {
            this.leafletInstance.dragging.enable();
        }
        this.leafletInstance.options.keyboard = !this.map.options.lock;
    });
}
```

### Zoom-Based Visibility

```typescript
shouldShow(zoom: number) {
    // No constraints = always show
    if (this.minZoom == this.maxZoom && this.minZoom == null) return true;

    // Only minZoom set
    if (this.minZoom != null && this.maxZoom == null) {
        return zoom >= this.minZoom;
    }

    // Only maxZoom set
    if (this.maxZoom != null && this.minZoom == null) {
        return zoom <= this.maxZoom;
    }

    // Both set
    return zoom >= this.minZoom && zoom <= this.maxZoom;
}

shouldHide(zoom: number) {
    if (this.minZoom == this.maxZoom && this.minZoom == null) return false;

    if (this.minZoom != null && this.maxZoom == null) {
        return zoom < this.minZoom;
    }

    if (this.maxZoom != null && this.minZoom == null) {
        return zoom > this.maxZoom;
    }

    return zoom < this.minZoom || zoom > this.maxZoom;
}
```

### Percent-Based Positioning (Image Maps)

```typescript
setLatLng(latlng: L.LatLng) {
    this.loc = latlng;

    // For image maps, also store as percentage
    if (this.map.rendered && this.map.type === "image") {
        let { x, y } = this.map.leafletInstance.project(
            this.loc,
            this.map.zoom.max - 1
        );
        this.percent = [
            x / this.map.currentGroup.dimensions[0],
            y / this.map.currentGroup.dimensions[1]
        ];
    }

    this.leafletInstance.setLatLng(latlng);
}

// When loading from saved percent:
if (percent && map.type === "image") {
    const [x, y] = [
        percent[0] * map.currentGroup.dimensions[0],
        percent[1] * map.currentGroup.dimensions[1]
    ];
    loc = map.leafletInstance.unproject([x, y], map.zoom.max - 1);
}
```

---

## GeoJSON & GPX Layers

### GeoJSON Implementation

**Location**: `src/layer/geojson.ts`

```typescript
export class GeoJSON extends Layer<L.GeoJSON> {
    leafletInstance: L.GeoJSON;
    markers: GeoJSONMarker[] = [];      // Point features
    features: GeoJSONFeature[] = [];    // Polygon/line features

    constructor(
        public map: BaseMapType,
        public parent: L.LayerGroup,
        public options: { color: string; pane?: string },
        data: geojson.GeoJsonObject,
        public note?: string               // Link entire layer to note
    ) {
        super();

        this.leafletInstance = L.geoJSON(data, {
            pane: options.pane ?? "geojson",

            // Convert points to markers
            pointToLayer: (geojsonPoint, latlng) => {
                const marker = new GeoJSONMarker(this, geojsonPoint, latlng, {
                    pane: options.pane ?? "geojson"
                });
                this.markers.push(marker);
                return marker.leafletInstance;
            },

            // Style polygons/lines using MapBox SimpleStyle
            style: (feature) => {
                if (!feature || !feature.properties) return {};

                const {
                    stroke: color = this.options.color,
                    "stroke-opacity": opacity = 0.5,
                    "stroke-width": weight = 2,
                    fill: fillColor = null,
                    "fill-opacity": fillOpacity = 0.2
                } = feature.properties;

                return { color, opacity, weight, fillColor, fillOpacity };
            },

            // Wrap non-point features
            onEachFeature: (feature, layer: L.GeoJSON) => {
                if (feature.geometry?.type == "Point") return;

                const geo = new GeoJSONFeature(this, feature, layer);
                this.features.push(geo);
            }
        });

        // Link entire layer to note
        if (note) {
            this.leafletInstance.on("click", async (evt) => {
                await map.plugin.app.workspace.openLinkText(
                    this.note.replace("^", "#^").split(/\|/).shift(),
                    "",
                    true
                );
            });
        }
    }
}
```

### GeoJSON Properties

**From feature.properties**:

```json
{
  "title": "Feature Name",          // or "name"
  "description": "Feature details",
  "marker-symbol": "castle",        // Marker type for points

  // MapBox SimpleStyle Spec
  "stroke": "#ff0000",
  "stroke-opacity": 0.8,
  "stroke-width": 3,
  "fill": "#00ff00",
  "fill-opacity": 0.3
}
```

**Behavior**:
- **Points**: Create markers with custom icons
- **Polygons/Lines**: Style with SimpleStyle spec
- **Tooltips**: Show title on hover, description on click
- **Zoom**: Ctrl+Click to fit bounds

---

## Settings & State Management

### Settings Structure

```typescript
export interface ObsidianAppData {
    // Saved map data
    mapMarkers: MapMarkerData[];       // All saved markers/overlays/shapes

    // Marker types
    markerIcons: Icon[];               // Custom marker types
    defaultMarker: Icon;               // Default marker icon
    layerMarkers: boolean;             // Layer icons on base marker?

    // Default view
    lat: number;                       // Default center
    long: number;
    defaultUnitType: "metric" | "imperial";

    // Tile servers
    defaultTile: string;               // Light mode tile URL
    defaultTileDark: string;           // Dark mode tile URL
    defaultTileSubdomains: string;     // "a,b,c"
    defaultAttribution: string;

    // UI preferences
    notePreview: boolean;              // Show note preview on hover
    copyOnClick: boolean;              // Copy coordinates on Ctrl+Click
    displayMarkerTooltips: TooltipDisplay;
    displayOverlayTooltips: boolean;
    enableDraw: boolean;               // Enable drawing tools

    // Advanced
    mapViewEnabled: boolean;           // Enable map view
    mapViewParameters: BlockParameters; // Default map view params
    configDirectory: string;           // Custom save location

    // Version tracking
    previousVersion: string;
    version: { major: number; minor: number; patch: number };
}
```

### Map Data Persistence

```typescript
export interface MapMarkerData {
    id: string;                        // Map ID
    path?: string;                     // Map note path
    files: string[];                   // Files containing this map
    lastAccessed: number;              // Timestamp
    locked: boolean;                   // Lock state

    // Saved elements
    markers: SavedMarkerProperties[];
    overlays: SavedOverlayData[];
    shapes: ShapeProperties[];         // Drawings
}
```

**Save Strategy**:
```typescript
saveSettings = debounce(async () => {
    // 1. Update map data from active maps
    this.maps.forEach((map) => {
        this.data.mapMarkers = this.data.mapMarkers.filter(
            ({ id }) => id != map.id
        );
        this.data.mapMarkers.push({
            ...map.map.toProperties(),
            files: this.mapFiles
                .filter(({ maps }) => maps.indexOf(map.id) > -1)
                .map(({ file }) => file)
        });
    });

    // 2. Only save maps with data
    this.data.mapMarkers = this.data.mapMarkers.filter(
        ({ markers, overlays, shapes }) =>
            markers.length > 0 ||
            overlays.length > 0 ||
            shapes.length > 0
    );

    // 3. Save to disk
    await this.saveData(this.data);
}, 100, false);
```

**Event Synchronization**:

Maps with the same ID sync in real-time:

```typescript
registerMapEvents(map: BaseMapType) {
    map.on("marker-added", async (marker: Marker) => {
        // Sync to other maps with same ID
        this.maps
            .filter(({ id, map: m }) => id == map.id && m.contentEl != map.contentEl)
            .forEach((map) => {
                map.map.addMarker(marker.toProperties());
            });
        await this.saveSettings();
    });

    map.on("marker-dragging", (marker: Marker) => {
        // Live sync dragging
        this.maps
            .filter(({ id, map: m }) => id == map.id && m.contentEl != map.contentEl)
            .forEach((otherMap) => {
                let existingMarker = otherMap.map.markers.find(m => m.id == marker.id);
                if (existingMarker) {
                    existingMarker.leafletInstance.setLatLng(marker.leafletInstance.getLatLng());
                }
            });
    });

    map.on("marker-deleted", (marker) => {
        const otherMaps = this.maps.filter(
            ({ id, map: m }) => id == map.id && m.contentEl != map.contentEl
        );
        for (let { map } of otherMaps) {
            map.removeMarker(marker);
        }
    });
}
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Set up Leaflet dependencies
  - [ ] `leaflet@^1.9.4`
  - [ ] `@types/leaflet`
  - [ ] Leaflet CSS
- [ ] Create type definitions
  - [ ] `src/leaflet/types.ts` (BlockParameters, MapOptions, MarkerProperties, etc.)
- [ ] Implement YAML parameter parser
  - [ ] `src/leaflet/utils/parser.ts` - `getParamsFromSource()`
  - [ ] Handle links, arrays, multi-line values
- [ ] Create code block processor
  - [ ] Register `storyteller-map` processor
  - [ ] Parse params, validate ID
  - [ ] Initialize renderer

### Phase 2: Core Renderer
- [ ] Implement `LeafletRenderer` class
  - [ ] Extends `MarkdownRenderChild`
  - [ ] Fix Leaflet icon paths
  - [ ] Create map container
  - [ ] Initialize Leaflet instance
  - [ ] Handle cleanup on unload
- [ ] Implement `BaseMap` abstract class
  - [ ] Properties: leafletInstance, markers, layers
  - [ ] Methods: createMarker, removeMarker, addMarker
  - [ ] Event system (extends Events)
- [ ] Implement `ImageMap` class
  - [ ] CRS: L.CRS.Simple
  - [ ] Load image via `getBlob()`
  - [ ] Calculate bounds from image dimensions
  - [ ] Create L.imageOverlay
- [ ] Implement `RealMap` class
  - [ ] CRS: L.CRS.EPSG3857
  - [ ] Create tile layer
  - [ ] Handle OSM/custom tile servers

### Phase 3: Marker System
- [ ] Create `MarkerManager` class
  - [ ] `loadStaticMarkers(marker: string[])`
  - [ ] `loadDynamicMarkers({ markerFolder, markerTag, markerFile })`
  - [ ] `addMarker(props: MarkerProperties)`
  - [ ] Marker clustering (leaflet.markercluster)
- [ ] Implement `Marker` class
  - [ ] Extends `Layer<DivIconMarker>`
  - [ ] Three target types: Link, Command, Text
  - [ ] Event binding (click, drag, hover, context menu)
  - [ ] Zoom-based visibility
  - [ ] Percent-based positioning for image maps
- [ ] Create `MarkerIcon` system
  - [ ] `parseIcon(icon: Icon): MarkerIcon`
  - [ ] DivIcon with SVG/HTML
  - [ ] Font Awesome icons
  - [ ] Custom image icons
  - [ ] Layer icon on base marker
- [ ] Implement frontmatter loading
  - [ ] `Watcher` class for file change detection
  - [ ] Parse `location: [lat, lng]`
  - [ ] Parse `mapmarker: type`
  - [ ] Parse `mapmarkers: [[type, coords, desc]]`

### Phase 4: Data Layers
- [ ] Implement `GeoJSON` class
  - [ ] Parse GeoJSON files
  - [ ] `pointToLayer` for markers
  - [ ] `style` for MapBox SimpleStyle
  - [ ] `onEachFeature` for tooltips
  - [ ] Link to note
- [ ] Implement `GPX` class
  - [ ] Parse GPX files
  - [ ] Extract tracks, waypoints
  - [ ] Heatlines for elevation/speed/hr
  - [ ] GPX control for switching display mode
- [ ] Create `Overlay` class
  - [ ] Circle overlays
  - [ ] Radius in units (km, mi, meters)
  - [ ] Color, opacity
  - [ ] Tooltip display
- [ ] Implement `LayerManager`
  - [ ] Manage image overlays, tile layers, GeoJSON, GPX
  - [ ] Layer switcher control
  - [ ] Show/hide layers

### Phase 5: Controls & Interactions
- [ ] Distance measurement
  - [ ] Alt+Click to measure
  - [ ] Multi-segment measurement
  - [ ] Unit conversion
- [ ] Drawing tools
  - [ ] Integrate leaflet-draw (or custom)
  - [ ] Polygons, rectangles, circles, polylines
  - [ ] Save drawings to settings
  - [ ] Export as GeoJSON
- [ ] Zoom controls
  - [ ] Custom zoom control with reset
  - [ ] Show current zoom level
  - [ ] Fit bounds to features
- [ ] Lock control
  - [ ] Toggle lock state
  - [ ] Disable dragging/editing when locked

### Phase 6: Settings & Persistence
- [ ] Settings tab
  - [ ] Default marker types
  - [ ] Custom marker types (icon, color, layer)
  - [ ] Tile server presets
  - [ ] Default lat/lng/zoom
  - [ ] UI preferences (tooltips, note preview)
- [ ] Save/load system
  - [ ] Debounced save (100ms)
  - [ ] MapMarkerData structure
  - [ ] Only save maps with data
  - [ ] Handle multi-map sync
- [ ] Event system
  - [ ] marker-added, marker-deleted, marker-dragging
  - [ ] overlay-added, shape-added
  - [ ] should-save
  - [ ] Sync across multiple instances

### Phase 7: Advanced Features
- [ ] Dark mode
  - [ ] CSS filter or separate tile server
- [ ] Map view (optional)
  - [ ] Standalone map view pane
  - [ ] Edit parameters modal
- [ ] Fullscreen support
- [ ] Mobile support
  - [ ] Touch events
  - [ ] Long-press menu
- [ ] DataView integration
  - [ ] Query markers by tag
  - [ ] linksTo/linksFrom queries
- [ ] Performance
  - [ ] Web worker for image loading
  - [ ] Lazy initialization
  - [ ] Viewport-based rendering

### Phase 8: Testing & Polish
- [ ] Test image maps
  - [ ] Various sizes, aspect ratios
  - [ ] Multi-layer images
- [ ] Test real-world maps
  - [ ] OSM, custom tiles
  - [ ] Coordinates, zoom levels
- [ ] Test markers
  - [ ] Static, dynamic (folder/tag/file)
  - [ ] Zoom visibility
  - [ ] Link types (note, command, URL)
- [ ] Test data layers
  - [ ] GeoJSON (points, lines, polygons)
  - [ ] GPX (tracks, waypoints)
- [ ] Test interactions
  - [ ] Click, drag, hover
  - [ ] Drawing, measurement
  - [ ] Lock mode
- [ ] Documentation
  - [ ] User guide
  - [ ] Code block syntax reference
  - [ ] Examples

---

## Critical Implementation Notes

### 1. **Link Parsing**

Always handle three link formats:
- Wikilinks: `[[Note]]`, `[[Note|Alias]]`, `[[Note#Heading]]`, `[[Note#^block]]`
- Markdown links: `[Text](path/to/note.md)`
- External URLs: `https://example.com`

### 2. **Coordinate Systems**

- **Image maps**: Use `L.CRS.Simple` with bounds `[[0, 0], [height, width]]`
- **Real maps**: Use `L.CRS.EPSG3857` (Web Mercator)
- **Percent positioning**: Store marker positions as percentage for image map resizing

### 3. **Icon Paths**

Leaflet's default icons break in Obsidian. Always fix:

```typescript
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'data:image/svg+xml;base64,...',  // Embed as base64
    iconUrl: 'data:image/svg+xml;base64,...',
    shadowUrl: ''
});
```

### 4. **Event Propagation**

Always use `L.DomEvent.stopPropagation(evt)` to prevent map clicks when clicking markers/overlays.

### 5. **Panes**

Use separate panes for rendering order:
- `tilePane` - Tile layers (lowest)
- `overlayPane` - Image overlays
- `geojson` - GeoJSON layers (custom)
- `markerPane` - Markers
- `tooltipPane` - Tooltips (highest)

### 6. **Debouncing**

Always debounce save operations (100ms) to avoid excessive writes during dragging.

### 7. **Cleanup**

Always remove event listeners and Leaflet instances in `onunload()` to prevent memory leaks.

### 8. **Multi-Map Sync**

Maps with the same `id` must sync in real-time. Use events: `marker-added`, `marker-dragging`, `marker-deleted`, etc.

---

## Example Code Block

```storyteller-map
id: fantasy-world

# Image map
image: [[maps/world.jpg]]
bounds: [[0, 0], [2000, 3000]]
height: 600px
defaultZoom: 2
minZoom: 0
maxZoom: 4

# Static markers
marker: city, 1200, 1500, [[Minas Tirith]], "The White City"
marker: mountain, 800, 2100, [[Mount Doom]], "Where the ring was forged"

# Dynamic markers from vault
markerFolder: Locations/Middle Earth
markerTag: location, landmark
markerFile: [[Important Place]]

# Data layers
geojson: [[kingdoms.geojson|Kingdoms]]
overlay: [red, [1000, 1500], 500 km, "Danger zone"]

# UI
unit: km
scale: 100
darkMode: false
lock: false
```

---

## Next Steps

1. **Set up project structure** following the file layout from architecture docs
2. **Implement Phase 1** (Foundation) - types, parser, processor
3. **Implement Phase 2** (Core Renderer) - BaseMap, ImageMap, RealMap
4. **Test with simple image map** before moving to markers
5. **Incrementally add features** following the phase checklist

This implementation will be robust, maintainable, and true to the proven patterns from the Obsidian Leaflet plugin.
