# Maps Feature Architecture

## Overview

The Maps feature provides interactive, embeddable maps using Leaflet.js. Users can create maps in two modes:
1. **Image-based maps** - Upload custom images (fantasy worlds, building layouts, etc.)
2. **Real-world maps** - Use OpenStreetMap or custom tile servers

Maps are rendered from code blocks in markdown notes and support markers, drawing tools, data integration, and more.

## Core Design Principles

1. **Code-block based** - Maps are defined in markdown using ` ```storyteller-map ` code blocks
2. **YAML configuration** - All map parameters use clean YAML syntax
3. **Vault integration** - Markers auto-generate from note frontmatter using DataView
4. **Entity linking** - Markers link to Characters, Locations, Events
5. **No external dependencies** - All map data stored in vault (markdown + images)
6. **Progressive enhancement** - Basic features work immediately, advanced features optional

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                   User Interface                        │
│  (Markdown Preview - Rendered Map in Reading View)     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│             Code Block Processor                        │
│  - Parse YAML parameters from code block                │
│  - Validate configuration                               │
│  - Initialize map renderer                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Map Renderer (Leaflet)                     │
│  - Create Leaflet map instance                          │
│  - Apply base layers (image or tile server)             │
│  - Render markers, overlays, shapes                     │
│  - Handle user interactions                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│           Data Integration Layer                        │
│  - Load markers from frontmatter (markerFolder, etc.)   │
│  - Execute DataView queries (markerTag)                 │
│  - Load GeoJSON/GPX files                               │
│  - Resolve entity links (characters, locations, events) │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Settings & State                           │
│  - Plugin settings (default markers, tile servers)      │
│  - Marker type definitions                              │
│  - Map state persistence (optional)                     │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
src/
├── leaflet/
│   ├── processor.ts              # Code block processor
│   ├── renderer.ts                # Core Leaflet map rendering
│   ├── types.ts                   # TypeScript interfaces
│   ├── markers/
│   │   ├── MarkerManager.ts       # Create, edit, delete markers
│   │   ├── MarkerLoader.ts        # Load from frontmatter/DataView
│   │   └── MarkerTypes.ts         # Marker type definitions
│   ├── layers/
│   │   ├── ImageLayer.ts          # Image overlay handling
│   │   ├── TileLayer.ts           # OSM/tile server handling
│   │   ├── GeoJSONLayer.ts        # GeoJSON file loading
│   │   └── GPXLayer.ts            # GPX file loading
│   ├── controls/
│   │   ├── DrawControls.ts        # Leaflet Draw integration
│   │   ├── ZoomControls.ts        # Custom zoom controls
│   │   ├── LayerControls.ts       # Layer switcher
│   │   └── DistanceControls.ts    # Distance measurement
│   └── utils/
│       ├── coordinates.ts         # Coordinate conversions
│       ├── bounds.ts              # Bounds calculation
│       └── icons.ts               # Icon management
└── settings/
    └── MapSettings.ts             # Settings tab for maps
```

## Data Model

### Map Configuration (YAML in code block)

```yaml
# Required
id: unique-map-id

# Display
height: 500px
width: 100%

# Image-based maps
image: [[path/to/map.jpg]]
bounds: [[0, 0], [100, 100]]

# Real-world maps
osmLayer: true
tileServer: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
tileSubdomains: a,b,c

# Initial view
lat: 50
long: 50
defaultZoom: 5
minZoom: 1
maxZoom: 10

# Markers (static)
marker: default, 39.5, -82.5, [[Note]], "Description"
marker: location, 40, -83, [[Castle]], "The King's Castle"

# Markers (dynamic from vault)
markerFolder: Locations/Cities, NPCs
markerTag: location, poi
markerFile: [[Important Location]]

# Data layers
geojson: [[regions.geojson]], [[trade-routes.json|Routes]]
gpx: [[journey-01.gpx]]

# Overlays
overlay: [blue, [32, -89], 25 mi, "Kingdom boundary"]

# Visual
darkMode: false
gridSize: 50
unit: meters
scale: 1
```

### Marker Frontmatter (in notes)

```yaml
---
# Simple marker
location: [lat, lng]

# With type
mapmarker: castle

# Multiple markers
mapmarkers:
  - [default, [45, 60], "Main gate"]
  - [tower, [46, 61], "North tower", 2, 8]  # with zoom breakpoints

# Overlay from frontmatter
mapoverlay:
  - [red, [45, 60], 5 km, "Danger zone"]
---
```

### Plugin Settings

```typescript
interface MapPluginSettings {
    // Default map settings
    defaultLatitude: number;
    defaultLongitude: number;
    defaultZoom: number;

    // Marker types
    defaultMarker: MarkerType;
    customMarkers: MarkerType[];

    // Display
    enableDarkMode: boolean;
    defaultHeight: string;
    defaultWidth: string;
    enableNotePreview: boolean;

    // Tile servers
    customTileServers: TileServer[];
}

interface MarkerType {
    name: string;              // "castle", "city", "event"
    icon: string;              // Font Awesome icon name or image path
    color: string;             // Hex color
    layerIcon: boolean;        // Layer on base marker or standalone
    associatedTags?: string[]; // Auto-use for notes with these tags
}

interface TileServer {
    name: string;
    url: string;
    subdomains: string;
    attribution: string;
}
```

## Core Components

### 1. Code Block Processor

**Purpose**: Parse ` ```storyteller-map ` blocks and render Leaflet maps

**Location**: `src/leaflet/processor.ts`

```typescript
export class LeafletMapProcessor {
    constructor(private plugin: StorytellerSuitePlugin) {}

    async process(
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext
    ): Promise<void> {
        // 1. Parse YAML configuration
        const config = this.parseConfig(source);

        // 2. Validate required parameters
        if (!config.id) {
            el.createEl('div', { text: 'Error: map id is required', cls: 'map-error' });
            return;
        }

        // 3. Create map container
        const container = el.createDiv('storyteller-leaflet-map');
        container.style.height = config.height || '500px';
        container.style.width = config.width || '100%';

        // 4. Initialize renderer
        const renderer = new LeafletMapRenderer(container, config, this.plugin);
        await renderer.initialize();

        // 5. Register for cleanup
        ctx.addChild(renderer);
    }

    private parseConfig(source: string): MapConfig {
        // Parse YAML, handle both legacy and new syntax
        // Support both "key: value" and array syntax
    }
}
```

### 2. Map Renderer

**Purpose**: Create and manage Leaflet map instances

**Location**: `src/leaflet/renderer.ts`

```typescript
export class LeafletMapRenderer extends Component {
    private map: L.Map | null = null;
    private markerManager: MarkerManager;
    private layerManager: LayerManager;

    constructor(
        private container: HTMLElement,
        private config: MapConfig,
        private plugin: StorytellerSuitePlugin
    ) {
        super();
    }

    async initialize(): Promise<void> {
        // 1. Fix Leaflet icon paths
        this.fixLeafletIcons();

        // 2. Determine map mode (image vs real-world)
        const mode = this.determineMode();

        // 3. Create Leaflet map
        this.map = L.map(this.container, {
            crs: mode === 'image' ? L.CRS.Simple : L.CRS.EPSG3857,
            center: this.config.center || [this.config.lat || 0, this.config.long || 0],
            zoom: this.config.defaultZoom || 5,
            minZoom: this.config.minZoom || 1,
            maxZoom: this.config.maxZoom || 10,
            zoomControl: !this.config.noUI,
            attributionControl: !this.config.noUI,
        });

        // 4. Apply base layer
        if (mode === 'image' && this.config.image) {
            await this.layerManager.addImageLayer(this.config.image, this.config.bounds);
        } else if (mode === 'real') {
            await this.layerManager.addTileLayer(this.config);
        }

        // 5. Load markers
        await this.markerManager.loadStaticMarkers(this.config.marker);
        await this.markerManager.loadDynamicMarkers({
            markerFolder: this.config.markerFolder,
            markerTag: this.config.markerTag,
            markerFile: this.config.markerFile,
        });

        // 6. Load data layers
        if (this.config.geojson) {
            await this.layerManager.addGeoJSONLayers(this.config.geojson);
        }
        if (this.config.gpx) {
            await this.layerManager.addGPXLayers(this.config.gpx);
        }

        // 7. Add overlays
        if (this.config.overlay) {
            await this.layerManager.addOverlays(this.config.overlay);
        }

        // 8. Setup controls
        if (!this.config.noUI) {
            this.setupControls();
        }

        // 9. Apply visual settings
        this.applyVisualSettings();

        // 10. Invalidate size for proper rendering
        setTimeout(() => this.map?.invalidateSize(), 100);
    }

    onunload(): void {
        this.map?.remove();
        this.map = null;
    }

    private determineMode(): 'image' | 'real' {
        if (this.config.image) return 'image';
        if (this.config.osmLayer || this.config.tileServer) return 'real';
        return 'image'; // default
    }

    private setupControls(): void {
        // Zoom, layer switcher, distance, etc.
    }

    private applyVisualSettings(): void {
        if (this.config.darkMode) {
            this.container.addClass('leaflet-dark-mode');
        }
    }

    private fixLeafletIcons(): void {
        // Fix default icon paths for Obsidian context
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'data:image/svg+xml;base64,...', // Embedded SVG
            iconUrl: 'data:image/svg+xml;base64,...',
            shadowUrl: '',
        });
    }
}
```

### 3. Marker Manager

**Purpose**: Create, manage, and link markers to entities

**Location**: `src/leaflet/markers/MarkerManager.ts`

```typescript
export class MarkerManager {
    private markers: Map<string, L.Marker> = new Map();
    private clusterGroup: L.MarkerClusterGroup | null = null;

    constructor(
        private map: L.Map,
        private config: MapConfig,
        private plugin: StorytellerSuitePlugin
    ) {}

    async loadStaticMarkers(markerDefs: string[] | undefined): Promise<void> {
        if (!markerDefs) return;

        for (const def of markerDefs) {
            // Parse: "type, lat, lng, [[link]], description, minZoom, maxZoom"
            const marker = this.parseMarkerDefinition(def);
            this.addMarker(marker);
        }
    }

    async loadDynamicMarkers(sources: MarkerSources): Promise<void> {
        const vault = this.plugin.app.vault;
        const files: TFile[] = [];

        // Collect files from folders
        if (sources.markerFolder) {
            for (const folder of sources.markerFolder) {
                files.push(...this.getFilesInFolder(folder));
            }
        }

        // Collect files from tags (DataView)
        if (sources.markerTag && hasDataview(this.plugin.app)) {
            const dv = getDataviewApi(this.plugin.app);
            for (const tag of sources.markerTag) {
                const pages = dv.pages(`#${tag}`);
                for (const page of pages) {
                    const file = vault.getAbstractFileByPath(page.file.path);
                    if (file instanceof TFile) files.push(file);
                }
            }
        }

        // Load specific files
        if (sources.markerFile) {
            for (const path of sources.markerFile) {
                const file = vault.getAbstractFileByPath(path);
                if (file instanceof TFile) files.push(file);
            }
        }

        // Parse frontmatter from all files
        for (const file of files) {
            await this.addMarkersFromFile(file);
        }
    }

    private async addMarkersFromFile(file: TFile): Promise<void> {
        const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter) return;

        // Simple location marker
        if (frontmatter.location && Array.isArray(frontmatter.location)) {
            const [lat, lng] = frontmatter.location;
            this.addMarker({
                lat,
                lng,
                link: file.path,
                label: file.basename,
                type: frontmatter.mapmarker || 'default',
            });
        }

        // Multiple markers
        if (frontmatter.mapmarkers && Array.isArray(frontmatter.mapmarkers)) {
            for (const markerDef of frontmatter.mapmarkers) {
                const [type, coords, desc, minZoom, maxZoom] = markerDef;
                this.addMarker({
                    lat: coords[0],
                    lng: coords[1],
                    type: type || 'default',
                    label: desc,
                    link: file.path,
                    minZoom,
                    maxZoom,
                });
            }
        }

        // Overlays
        if (frontmatter.mapoverlay && Array.isArray(frontmatter.mapoverlay)) {
            // Handle overlays...
        }
    }

    private addMarker(markerDef: MarkerDefinition): void {
        const markerType = this.getMarkerType(markerDef.type);
        const icon = this.createIcon(markerType);

        const marker = L.marker([markerDef.lat, markerDef.lng], { icon });

        // Tooltip
        if (markerDef.label) {
            marker.bindTooltip(markerDef.label, { direction: 'top' });
        }

        // Popup with link
        if (markerDef.link) {
            marker.bindPopup(this.createPopup(markerDef));
            marker.on('click', () => this.handleMarkerClick(markerDef.link!));
        }

        // Add to map or cluster
        if (this.shouldCluster()) {
            this.ensureClusterGroup();
            this.clusterGroup!.addLayer(marker);
        } else {
            marker.addTo(this.map);
        }

        this.markers.set(markerDef.id || this.generateId(), marker);
    }

    private createIcon(markerType: MarkerType): L.DivIcon {
        // Create custom icon based on Font Awesome or image
        if (markerType.icon.startsWith('http') || markerType.icon.includes('/')) {
            // Image icon
            return L.icon({
                iconUrl: markerType.icon,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            });
        } else {
            // Font Awesome icon
            return L.divIcon({
                className: 'storyteller-marker',
                html: `
                    <div class="marker-icon" style="background-color: ${markerType.color};">
                        <i class="fa fa-${markerType.icon}"></i>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 32],
            });
        }
    }

    private handleMarkerClick(link: string): void {
        // Open linked note
        const file = this.plugin.app.vault.getAbstractFileByPath(link);
        if (file instanceof TFile) {
            this.plugin.app.workspace.getLeaf('tab').openFile(file);
        }
    }
}
```

### 4. Layer Manager

**Purpose**: Manage image overlays, tile layers, GeoJSON, GPX

**Location**: `src/leaflet/layers/LayerManager.ts`

```typescript
export class LayerManager {
    private layers: L.Layer[] = [];

    constructor(
        private map: L.Map,
        private config: MapConfig,
        private plugin: StorytellerSuitePlugin
    ) {}

    async addImageLayer(imagePath: string, bounds?: [[number, number], [number, number]]): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(imagePath);
        if (!(file instanceof TFile)) {
            console.error('Image file not found:', imagePath);
            return;
        }

        const imageUrl = this.plugin.app.vault.getResourcePath(file);

        // Calculate bounds if not provided
        const imageBounds = bounds || this.calculateBounds(file);

        const imageOverlay = L.imageOverlay(imageUrl, L.latLngBounds(imageBounds));
        imageOverlay.addTo(this.map);
        this.layers.push(imageOverlay);

        // Fit map to image
        this.map.fitBounds(L.latLngBounds(imageBounds));
    }

    async addTileLayer(config: MapConfig): Promise<void> {
        let url = config.tileServer;

        // Default to OSM if enabled
        if (config.osmLayer && !url) {
            url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        }

        if (!url) {
            console.error('No tile server URL provided');
            return;
        }

        const tileLayer = L.tileLayer(url, {
            attribution: config.tileAttribution || '&copy; OpenStreetMap contributors',
            subdomains: config.tileSubdomains?.split(',') || ['a', 'b', 'c'],
            maxZoom: 19,
        });

        tileLayer.addTo(this.map);
        this.layers.push(tileLayer);
    }

    async addGeoJSONLayers(paths: string[]): Promise<void> {
        for (const path of paths) {
            // Parse [[path]] or path|alias
            const [filePath, alias] = this.parsePath(path);

            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) continue;

            const content = await this.plugin.app.vault.read(file);
            const geojson = JSON.parse(content);

            const layer = L.geoJSON(geojson, {
                style: (feature) => ({
                    color: feature?.properties?.stroke || this.config.geojsonColor || '#3388ff',
                    weight: feature?.properties?.['stroke-width'] || 2,
                    opacity: feature?.properties?.['stroke-opacity'] || 1,
                    fillColor: feature?.properties?.fill || this.config.geojsonColor || '#3388ff',
                    fillOpacity: feature?.properties?.['fill-opacity'] || 0.2,
                }),
                onEachFeature: (feature, layer) => {
                    const name = feature.properties?.title || feature.properties?.name;
                    if (name) {
                        layer.bindTooltip(name);
                    }
                },
            });

            layer.addTo(this.map);
            this.layers.push(layer);
        }
    }

    async addGPXLayers(paths: string[]): Promise<void> {
        // Similar to GeoJSON but parse GPX format
        // Use DOMParser to extract tracks and waypoints
    }

    async addOverlays(overlayDefs: any[]): Promise<void> {
        for (const def of overlayDefs) {
            // Parse: [color, [lat, lng], "radius unit", "description"]
            const [color, coords, radiusStr, desc] = def;
            const [radius, unit] = this.parseRadius(radiusStr);

            const circle = L.circle(coords, {
                color: color,
                fillColor: color,
                fillOpacity: 0.2,
                radius: this.convertToMeters(radius, unit),
            });

            if (desc) {
                circle.bindTooltip(desc);
            }

            circle.addTo(this.map);
            this.layers.push(circle);
        }
    }
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (MVP)
- [ ] Set up Leaflet.js dependencies
- [ ] Create code block processor
- [ ] Implement basic image-based maps
- [ ] Static markers from code block
- [ ] Basic rendering and display

### Phase 2: Dynamic Markers
- [ ] Load markers from frontmatter
- [ ] DataView integration (markerTag)
- [ ] Marker clustering
- [ ] Click to open linked notes
- [ ] Marker type customization

### Phase 3: Real-World Maps
- [ ] OSM tile layer support
- [ ] Custom tile servers
- [ ] Proper coordinate handling
- [ ] Attribution

### Phase 4: Advanced Layers
- [ ] GeoJSON support
- [ ] GPX support
- [ ] Circle overlays
- [ ] Image overlays (multi-layer)

### Phase 5: Controls & Interactions
- [ ] Distance measurement
- [ ] Layer switcher
- [ ] Dark mode
- [ ] Zoom controls
- [ ] Lock/unlock

### Phase 6: Settings & Customization
- [ ] Settings tab for default markers
- [ ] Custom marker types with icons
- [ ] Tile server presets
- [ ] Export/import

## Testing Strategy

1. **Unit Tests**: Test individual components (coordinate conversion, YAML parsing, etc.)
2. **Integration Tests**: Test full map rendering with various configurations
3. **Manual Tests**: Create sample maps with different features
4. **Performance Tests**: Large marker sets, multiple GeoJSON layers

## Example Use Cases

### 1. Fantasy World Map

```storyteller-map
id: middle-earth
image: [[maps/middle-earth.jpg]]
bounds: [[0, 0], [2000, 3000]]
defaultZoom: 2
minZoom: 0
maxZoom: 4

markerFolder: Locations/Middle Earth
markerTag: location

marker: city, 1200, 1500, [[Minas Tirith]], "The White City"
marker: mountain, 800, 2100, [[Mount Doom]], "Where the ring was forged"
```

### 2. City Map with Districts

```storyteller-map
id: waterdeep
image: [[maps/waterdeep-city.png]]
bounds: [[0, 0], [1000, 1000]]

geojson: [[waterdeep-districts.geojson|City Districts]]

markerFolder: Locations/Waterdeep/Districts
markerTag: waterdeep, landmark
```

### 3. Real-World Historical Map

```storyteller-map
id: ancient-rome
osmLayer: true
lat: 41.9028
long: 12.4964
defaultZoom: 13

markerFile: [[Forum Romanum]], [[Colosseum]], [[Pantheon]]
overlay: [red, [41.9028, 12.4964], 5 km, "City walls"]
```

## Migration Path from Old System

Users who had maps in the old deprecated system:

1. Old map data was stored in JSON files
2. New system uses code blocks in markdown
3. Migration tool (optional):
   - Parse old map JSON
   - Generate code block syntax
   - Create markdown note with map

## Next Steps

1. Create `src/leaflet/` directory structure
2. Implement `processor.ts` for code block registration
3. Implement `renderer.ts` for basic Leaflet initialization
4. Test with simple image-based map
5. Incrementally add features from phases 2-6
