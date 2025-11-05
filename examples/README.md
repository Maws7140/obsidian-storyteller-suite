# Demo Maps Examples

This folder contains example files demonstrating the map features in Storyteller Suite.

## Quick Start

1. **Enable Frontmatter Markers** in plugin settings
2. Add `examples/demo-maps` as a marker folder in your map configuration
3. Create or open a map in the plugin

## Example Files

### Location Markers

**Location-Castle-Example.md**
- Demonstrates single location marker using `location` frontmatter
- Simple [lat, lng] coordinate format
- Marker will link back to this note

```yaml
---
location: [45.523, -122.676]
---
```

**Multiple-Markers-Example.md**
- Shows multiple markers from one note using `mapmarkers` array
- Each marker has customizable label and color
- Great for marking multiple points of interest in one document

```yaml
---
mapmarkers:
  - loc: [45.520, -122.680]
    label: "Town Square"
    color: "#4ecdc4"
  - loc: [45.525, -122.675]
    label: "Old Mill"
    color: "#ff6b6b"
---
```

### GeoJSON Support

**sample-route.geojson**
- Demonstrates GeoJSON FeatureCollection format
- Includes:
  - **LineString**: Travel routes and paths
  - **Polygon**: Regions and areas (forest, territories)
  - **Point**: Individual landmarks
- Supports custom styling via properties (color, weight, opacity, fillColor)

To use: Add file path to `geojsonFiles` option when creating MapView

### GPX Support

**sample-track.gpx**
- Standard GPX format with tracks and waypoints
- Tracks appear as colored polylines (red)
- Waypoints appear as markers with popups
- Includes elevation data (optional)

To use: Add file path to `gpxFiles` option when creating MapView

## Feature Overview

### Frontmatter Markers
Enable in plugin settings → "Map Settings" → "Enable Frontmatter Markers"

Supported frontmatter fields:
- `location: [lat, lng]` - Single marker at note's location
- `mapmarkers: [{loc: [lat, lng], label: "Name", color: "#hex"}]` - Multiple markers

### DataView Integration
Enable in plugin settings → "Map Settings" → "Enable DataView Markers"

Requires DataView plugin. Markers can be queried by tags:
```yaml
markerTags: ["location", "place"]
```

### Marker Clustering
Automatic when 20+ markers are on a map. Features:
- Small clusters (1-49): Blue circles
- Medium clusters (50-99): Orange circles
- Large clusters (100+): Red circles
- Click to zoom and spiderfy

### Tile Servers
Switch from image-based maps to real-world maps using:

**OpenStreetMap** (built-in):
```typescript
new MapView({
  // ... other options
  osmLayer: true
})
```

**Custom Tile Server**:
```typescript
new MapView({
  // ... other options
  tileServer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileSubdomains: 'a,b,c'
})
```

Popular tile servers:
- **CartoDB Dark**: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`
- **CartoDB Positron**: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`
- **OpenTopoMap**: `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png`

### Drawing Tools
Available in edit mode (non-read-only maps):
- Polyline: Draw paths and routes
- Polygon: Draw areas and regions
- Rectangle: Quick rectangular areas
- Circle: Radial areas
- Edit/Delete: Modify existing shapes

## Code Example

```typescript
// Create a map with all features
const mapView = new MapView({
  container: containerElement,
  app: this.app,
  readOnly: false,
  
  // Frontmatter markers
  enableFrontmatterMarkers: true,
  markerFolders: ['examples/demo-maps'],
  
  // DataView markers
  enableDataViewMarkers: true,
  markerTags: ['location'],
  
  // External data
  geojsonFiles: ['examples/demo-maps/sample-route.geojson'],
  gpxFiles: ['examples/demo-maps/sample-track.gpx'],
  
  // Real-world map mode
  osmLayer: true,
  
  // Callbacks
  onMarkerClick: (marker) => console.log('Clicked:', marker),
  onMapChange: () => console.log('Map changed')
});

await mapView.initMap(mapData);
```

## Coordinate Systems

### CRS.Simple (Image-based Maps)
- Used when `backgroundImagePath` is provided
- Coordinates are pixel-based: [y, x] in image space
- Origin [0, 0] at top-left
- Bounds calculated from image dimensions

### CRS.EPSG3857 (Real-world Maps)
- Used when `osmLayer: true` or `tileServer` is set
- Standard lat/lng coordinates
- Latitude range: -85 to 85
- Longitude range: -180 to 180

## Testing Checklist

- [ ] Create map with frontmatter markers from demo folder
- [ ] Verify single location marker appears (Castle Example)
- [ ] Verify multiple markers appear (Multiple Markers Example)
- [ ] Load GeoJSON file and verify path/polygon/point rendering
- [ ] Load GPX file and verify track polyline + waypoint markers
- [ ] Test marker clustering with 20+ markers
- [ ] Test OSM tile layer in real-world mode
- [ ] Test drawing tools (polyline, polygon, rectangle, circle)
- [ ] Test marker click callbacks open correct notes

## Troubleshooting

**Markers not appearing?**
- Check plugin settings: "Enable Frontmatter Markers" must be on
- Verify folder path matches: `examples/demo-maps`
- Check note frontmatter syntax (YAML must be valid)

**GeoJSON not loading?**
- Verify file path is correct
- Check JSON syntax with validator
- Console errors will show parsing issues

**GPX not loading?**
- Verify file is valid GPX 1.1 format
- Check XML structure has `<trk>` or `<wpt>` elements
- Console errors will show parsing issues

**Clustering not working?**
- Ensure 20+ markers are present
- Check console for leaflet.markercluster errors
- Verify styles.css has `.marker-cluster` styles

## Additional Resources

- [Leaflet Documentation](https://leafletjs.com/)
- [GeoJSON Specification](https://geojson.org/)
- [GPX Format](https://en.wikipedia.org/wiki/GPS_Exchange_Format)
- [leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
