// MapView - Lightweight Leaflet wrapper inspired by Javalent's architecture
// Implements the minimal surface used by our modals and editor view.

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { App, TFile } from 'obsidian';
import type { Map as StoryMap, MapMarker, MapLayer } from '../types';
import { calculateImageBounds, generateMarkerId } from '../utils/MapUtils';
import { readFrontmatter, toMapMarker } from '../utils/frontmatter';
import { hasDataview, getDataviewApi } from '../utils/dataview';

export interface MapViewOptions {
  container: HTMLElement;
  app: App;
  readOnly?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
  onMapChange?: () => void;
  enableFrontmatterMarkers?: boolean;
  enableDataViewMarkers?: boolean;
  markerFiles?: string[]; // File paths to scan
  markerFolders?: string[]; // Folders to scan
  markerTags?: string[]; // Tags to filter by (requires DataView)
  geojsonFiles?: string[]; // GeoJSON file paths to load
  gpxFiles?: string[]; // GPX file paths to load
  tileServer?: string; // Custom tile server URL template
  osmLayer?: boolean; // Use OpenStreetMap base layer
  tileSubdomains?: string; // Tile server subdomains (e.g., "1,2,3")
}

export class MapView {
  private container: HTMLElement;
  private app: App;
  private map: L.Map | null = null;
  private readOnly: boolean;
  private onMarkerClick?: (marker: MapMarker) => void;
  private onMapChange?: () => void;

  private mapData: StoryMap | null = null;
  private backgroundImageLayer: L.ImageOverlay | null = null;
  private markersById: Map<string, L.Marker> = new Map();
  private markerClusterGroup: L.MarkerClusterGroup | null = null;
  private drawnItems: L.FeatureGroup = new L.FeatureGroup();
  private geojsonLayers: L.GeoJSON[] = [];
  private gpxLayers: L.LayerGroup[] = [];
  private tileLayer: L.TileLayer | null = null;
  private gridLayer: L.LayerGroup | null = null;
  private drawControl: L.Control.Draw | null = null;
  private options: MapViewOptions;

  constructor(options: MapViewOptions) {
    this.container = options.container;
    this.app = options.app;
    this.readOnly = options.readOnly ?? false;
    this.onMarkerClick = options.onMarkerClick;
    this.onMapChange = options.onMapChange;
    this.options = options;

    // Fix Leaflet icon paths for Obsidian environment
    this.fixLeafletIcons();
  }

  private fixLeafletIcons(): void {
    // Create simple circle icons to replace default Leaflet markers
    // This avoids path issues in Obsidian
    const createCircleIcon = (color: string) => {
      return L.divIcon({
        className: 'storyteller-default-marker',
        html: `<div style="width: 24px; height: 24px; background: ${color}; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
    };

    // Override default icon
    L.Icon.Default.prototype.options.iconUrl = '';
    L.Icon.Default.prototype.options.iconRetinaUrl = '';
    L.Icon.Default.prototype.options.shadowUrl = '';
  }

  async initMap(mapData: StoryMap): Promise<void> {
    this.mapData = mapData;

    // Ensure container is visible and has dimensions
    if (!this.container.offsetWidth || !this.container.offsetHeight) {
      console.warn('MapView: Container not visible or has no dimensions, waiting...');
      // Wait for container to be visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force dimensions if still not set
      if (!this.container.offsetWidth) {
        this.container.style.width = '100%';
      }
      if (!this.container.offsetHeight) {
        this.container.style.height = '500px';
      }
    }

    // Clear previous
    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    // Detect mode: real-world (OSM tiles) vs image-based
    const useRealWorldMode = !mapData.backgroundImagePath && (this.options.osmLayer || this.options.tileServer);

    // Determine center, zoom, and bounds based on mode
    let mapCenter: L.LatLngExpression;
    let mapZoom: number;
    let bounds: L.LatLngBounds | undefined;
    
    if (useRealWorldMode) {
      // Real-world coordinates - use lat/lng
      if (mapData.center && (mapData.center[0] !== 0 || mapData.center[1] !== 0)) {
        mapCenter = L.latLng(mapData.center[0], mapData.center[1]);
      } else {
        mapCenter = L.latLng(20, 0); // World view centered on Prime Meridian
      }
      mapZoom = mapData.defaultZoom ?? 2;
      bounds = undefined; // No bounds restriction for real-world maps
    } else {
      // Image-based coordinates - calculate pixel bounds
      bounds = (mapData.width && mapData.height)
        ? calculateImageBounds(mapData.width, mapData.height)
        : L.latLngBounds([[0, 0], [100, 100]]);
      mapCenter = mapData.center ? L.latLng(mapData.center[0], mapData.center[1]) : bounds.getCenter();
      mapZoom = mapData.defaultZoom ?? 0;
    }

    this.map = L.map(this.container, {
      crs: useRealWorldMode ? L.CRS.EPSG3857 : L.CRS.Simple,
      center: mapCenter,
      zoom: mapZoom,
      minZoom: useRealWorldMode ? 0 : -2,
      maxZoom: useRealWorldMode ? 18 : 4,
      zoomControl: !this.readOnly,
      attributionControl: false,
      maxBounds: bounds, // undefined for real-world, defined for image
      maxBoundsViscosity: bounds ? 1.0 : 0
    });

    // Add tile layer for real-world mode OR background image (mutually exclusive)
    if (useRealWorldMode) {
      // Real-world mode: add OSM tiles
      await this.addTileLayer();
      this.drawnItems.addTo(this.map);
    } else if (mapData.backgroundImagePath) {
      // Image mode: add background image overlay
      const file = this.app.vault.getAbstractFileByPath(mapData.backgroundImagePath);
      if (file && (file as TFile)) {
        const url = this.app.vault.getResourcePath(file as TFile);
        const imageBounds = bounds!; // We know bounds is defined in image mode
        this.backgroundImageLayer = L.imageOverlay(url, imageBounds, { interactive: false, opacity: 1 });
        this.backgroundImageLayer.addTo(this.map);
        this.map.fitBounds(imageBounds, { padding: [10, 10] });
      }
      this.drawnItems.addTo(this.map);
    } else {
      // No background - just add an empty feature group
      this.drawnItems.addTo(this.map);
    }

    // Render existing markers
    if (mapData.markers?.length) {
      // Enable clustering if 20+ markers
      if (mapData.markers.length >= 20) {
        this.enableClustering();
      }
      mapData.markers.forEach((m) => this.renderMarker(m));
    }

    // Auto-load markers from frontmatter if enabled
    if (this.options.enableFrontmatterMarkers) {
      await this.loadMarkersFromFrontmatter();
      // Re-check clustering threshold after loading
      if (this.mapData && this.mapData.markers.length >= 20 && !this.markerClusterGroup) {
        this.enableClustering();
        this.rerenderMarkers();
      }
    }

    // Auto-load markers from DataView if enabled
    if (this.options.enableDataViewMarkers && hasDataview(this.app)) {
      await this.loadMarkersFromDataView();
      // Re-check clustering threshold after loading
      if (this.mapData && this.mapData.markers.length >= 20 && !this.markerClusterGroup) {
        this.enableClustering();
        this.rerenderMarkers();
      }
    }

    // Load GeoJSON layers if specified
    if (this.options.geojsonFiles?.length) {
      await this.loadGeoJSONLayers();
    }

    // Load GPX layers if specified
    if (this.options.gpxFiles?.length) {
      await this.loadGPXLayers();
    }

    // Setup drawing tools if not read-only
    if (!this.readOnly) {
      this.setupDrawingControls();
    }

    // Ensure sizing after container attach - use longer delay for proper rendering
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize({ pan: false });
        // Fit bounds again after invalidation
        if (bounds && !useRealWorldMode) {
          this.map.fitBounds(bounds, { padding: [10, 10], animate: false });
        }
      }
    }, 150);
  }

  getMapData(): StoryMap | null {
    return this.mapData ? { ...this.mapData } : null;
  }

  addMarker(lat: number, lng: number, id?: string, opts?: Partial<MapMarker>): MapMarker | null {
    if (!this.map || !this.mapData) return null;

    const marker: MapMarker = {
      id: id ?? generateMarkerId(),
      lat,
      lng,
      markerType: opts?.markerType ?? 'location',
      label: opts?.label,
      description: opts?.description,
      color: opts?.color,
      icon: opts?.icon,
      locationName: opts?.locationName,
      eventName: opts?.eventName,
      childMapId: opts?.childMapId,
      minZoom: opts?.minZoom,
      maxZoom: opts?.maxZoom,
      visible: opts?.visible ?? true,
      scale: opts?.scale
    };

    this.mapData.markers.push(marker);
    this.renderMarker(marker);
    this.onMapChange?.();
    return marker;
  }

  removeMarker(markerId: string): void {
    if (!this.mapData) return;
    const idx = this.mapData.markers.findIndex(m => m.id === markerId);
    if (idx !== -1) this.mapData.markers.splice(idx, 1);
    const m = this.markersById.get(markerId);
    if (m && this.map) {
      this.map.removeLayer(m);
      this.markersById.delete(markerId);
    }
    this.onMapChange?.();
  }

  fitToMarkers(): void {
    if (!this.map || !this.mapData?.markers?.length) return;
    const latLngs = this.mapData.markers.map(m => L.latLng(m.lat, m.lng));
    this.map.fitBounds(L.latLngBounds(latLngs), { padding: [20, 20] });
  }

  destroy(): void {
    if (this.drawControl && this.map) {
      this.map.removeControl(this.drawControl);
      this.drawControl = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.markersById.clear();
    this.backgroundImageLayer = null;
  }

  // Grid overlay toggle (simple implementation)
  toggleGrid(show: boolean, size: number = 50): void {
    if (!this.map) return;
    if (this.gridLayer) {
      this.map.removeLayer(this.gridLayer);
      this.gridLayer = null;
    }
    if (!show) return;

    const bounds = this.map.getBounds();
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    const layers: L.Polyline[] = [];

    // Vertical lines (lng constant)
    for (let x = Math.ceil(minLng / size) * size; x <= maxLng; x += size) {
      layers.push(L.polyline([[minLat, x], [maxLat, x]], { color: '#888', opacity: 0.2, weight: 1 }));
    }
    // Horizontal lines (lat constant)
    for (let y = Math.ceil(minLat / size) * size; y <= maxLat; y += size) {
      layers.push(L.polyline([[y, minLng], [y, maxLng]], { color: '#888', opacity: 0.2, weight: 1 }));
    }

    this.gridLayer = L.layerGroup(layers).addTo(this.map);
  }

  // Load markers from note frontmatter
  private async loadMarkersFromFrontmatter(): Promise<void> {
    if (!this.map || !this.mapData) return;

    const filesToScan: TFile[] = [];

    // Scan specified files
    if (this.options.markerFiles) {
      for (const path of this.options.markerFiles) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) filesToScan.push(file);
      }
    }

    // Scan specified folders
    if (this.options.markerFolders) {
      for (const folderPath of this.options.markerFolders) {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (folder && 'children' in folder) {
          this.app.vault.getMarkdownFiles().forEach(f => {
            if (f.path.startsWith(folderPath + '/')) filesToScan.push(f);
          });
        }
      }
    }

    for (const file of filesToScan) {
      const fmData = readFrontmatter(this.app, file);
      if (!fmData) continue;

      // Single location marker
      if (fmData.location && Array.isArray(fmData.location)) {
        const [lat, lng] = fmData.location;
        this.addMarker(lat, lng, undefined, {
          label: file.basename,
          locationName: file.basename,
          markerType: 'location'
        });
      }

      // Multiple markers from mapmarkers array
      if (fmData.mapmarkers) {
        for (const def of fmData.mapmarkers) {
          const m = toMapMarker(def);
          m.id = generateMarkerId();
          m.locationName = file.basename;
          this.mapData.markers.push(m);
          this.renderMarker(m);
        }
      }
    }

    this.onMapChange?.();
  }

  // Load markers from DataView queries
  private async loadMarkersFromDataView(): Promise<void> {
    if (!this.map || !this.mapData || !this.options.markerTags?.length) return;

    const api = getDataviewApi(this.app);
    if (!api) return;

    for (const tag of this.options.markerTags) {
      try {
        const pages = api.pages(`#${tag}`);
        const results = pages?.array() ?? [];

        for (const page of results) {
          const file = this.app.vault.getAbstractFileByPath(page.file.path);
          if (!(file instanceof TFile)) continue;

          const fmData = readFrontmatter(this.app, file);
          if (fmData?.location && Array.isArray(fmData.location)) {
            const [lat, lng] = fmData.location;
            this.addMarker(lat, lng, undefined, {
              label: file.basename,
              locationName: file.basename,
              markerType: 'location'
            });
          }
        }
      } catch (err) {
        console.error('DataView marker query failed:', err);
      }
    }
  }

  // Setup leaflet-draw controls
  private setupDrawingControls(): void {
    if (!this.map) return;

    this.drawnItems.addTo(this.map);

    this.drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polyline: { shapeOptions: { color: '#3388ff' } },
        polygon: { shapeOptions: { color: '#3388ff' } },
        rectangle: { shapeOptions: { color: '#3388ff' } },
        circle: { shapeOptions: { color: '#3388ff' } },
        marker: false,
        circlemarker: false
      },
      edit: {
        featureGroup: this.drawnItems,
        remove: true
      }
    });

    this.map.addControl(this.drawControl);

    // Handle draw events
    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      this.drawnItems.addLayer(layer);
      this.onMapChange?.();
    });

    this.map.on(L.Draw.Event.EDITED, () => {
      this.onMapChange?.();
    });

    this.map.on(L.Draw.Event.DELETED, () => {
      this.onMapChange?.();
    });
  }

  // Add tile layer (OSM or custom)
  private async addTileLayer(): Promise<void> {
    if (!this.map) return;

    let url: string;
    let subdomains: string[] = ['a', 'b', 'c'];

    if (this.options.tileServer) {
      url = this.options.tileServer;
      if (this.options.tileSubdomains) {
        subdomains = this.options.tileSubdomains.split(',').map(s => s.trim());
      }
    } else if (this.options.osmLayer) {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    } else {
      return;
    }

    this.tileLayer = L.tileLayer(url, {
      maxZoom: 19,
      subdomains: subdomains,
      attribution: '© OpenStreetMap contributors'
    });

    this.tileLayer.addTo(this.map);
  }

  // Load GeoJSON layers from vault files
  private async loadGeoJSONLayers(): Promise<void> {
    if (!this.map || !this.options.geojsonFiles?.length) return;

    for (const filePath of this.options.geojsonFiles) {
      try {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) continue;

        const content = await this.app.vault.read(file);
        const geojsonData = JSON.parse(content);

        const layer = L.geoJSON(geojsonData, {
          style: (feature) => {
            return {
              color: feature?.properties?.color || '#3388ff',
              weight: feature?.properties?.weight || 2,
              opacity: feature?.properties?.opacity || 0.8,
              fillColor: feature?.properties?.fillColor || '#3388ff',
              fillOpacity: feature?.properties?.fillOpacity || 0.3
            };
          },
          onEachFeature: (feature, layer) => {
            if (feature.properties?.name || feature.properties?.description) {
              const popupContent = `
                ${feature.properties.name ? `<strong>${feature.properties.name}</strong><br>` : ''}
                ${feature.properties.description || ''}
              `;
              layer.bindPopup(popupContent);
            }
          }
        });

        layer.addTo(this.map);
        this.geojsonLayers.push(layer);
      } catch (err) {
        console.error(`Failed to load GeoJSON from ${filePath}:`, err);
      }
    }
  }

  // Load GPX layers from vault files
  private async loadGPXLayers(): Promise<void> {
    if (!this.map || !this.options.gpxFiles?.length) return;

    for (const filePath of this.options.gpxFiles) {
      try {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) continue;

        const content = await this.app.vault.read(file);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');

        const layerGroup = new L.LayerGroup();

        // Parse track points (trk/trkseg/trkpt)
        const tracks = xmlDoc.getElementsByTagName('trk');
        for (let i = 0; i < tracks.length; i++) {
          const segments = tracks[i].getElementsByTagName('trkseg');
          for (let j = 0; j < segments.length; j++) {
            const points = segments[j].getElementsByTagName('trkpt');
            const latLngs: L.LatLngExpression[] = [];
            
            for (let k = 0; k < points.length; k++) {
              const lat = parseFloat(points[k].getAttribute('lat') || '0');
              const lon = parseFloat(points[k].getAttribute('lon') || '0');
              latLngs.push([lat, lon]);
            }

            if (latLngs.length > 0) {
              const polyline = L.polyline(latLngs, {
                color: '#ff6b6b',
                weight: 3,
                opacity: 0.8
              });
              layerGroup.addLayer(polyline);
            }
          }
        }

        // Parse waypoints (wpt)
        const waypoints = xmlDoc.getElementsByTagName('wpt');
        for (let i = 0; i < waypoints.length; i++) {
          const lat = parseFloat(waypoints[i].getAttribute('lat') || '0');
          const lon = parseFloat(waypoints[i].getAttribute('lon') || '0');
          const name = waypoints[i].getElementsByTagName('name')[0]?.textContent || 'Waypoint';
          const desc = waypoints[i].getElementsByTagName('desc')[0]?.textContent || '';

          const marker = L.marker([lat, lon]);
          marker.bindPopup(`<strong>${name}</strong>${desc ? '<br>' + desc : ''}`);
          layerGroup.addLayer(marker);
        }

        layerGroup.addTo(this.map);
        this.gpxLayers.push(layerGroup);
      } catch (err) {
        console.error(`Failed to load GPX from ${filePath}:`, err);
      }
    }
  }

  // Internal: render a single marker
  private renderMarker(marker: MapMarker): void {
    if (!this.map) return;

    // Simple divIcon with color cue; can be extended later
    const color = marker.markerType === 'event' ? '#ff6b6b'
      : marker.markerType === 'childMap' ? '#4ecdc4'
      : marker.color ?? '#3388ff';

    const icon = L.divIcon({
      className: 'storyteller-marker',
      html: `<div style="
        width:14px;height:14px;border-radius:${marker.markerType==='location'?'50%':'4px'};
        background:${color};border:2px solid rgba(0,0,0,0.2);
        box-shadow:0 0 4px rgba(0,0,0,0.3);
      "></div>`
    });

    const m = L.marker([marker.lat, marker.lng], { icon });
    if (marker.label) m.bindTooltip(marker.label, { direction: 'top', opacity: 0.9 });
    if (this.onMarkerClick) {
      m.on('click', () => this.onMarkerClick!(marker));
    }
    
    // Add to cluster group if enabled, otherwise directly to map
    if (this.markerClusterGroup) {
      this.markerClusterGroup.addLayer(m);
    } else {
      m.addTo(this.map);
    }
    
    this.markersById.set(marker.id, m);
  }

  // Enable marker clustering
  private enableClustering(): void {
    if (!this.map || this.markerClusterGroup) return;

    this.markerClusterGroup = (L as any).markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 80,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count >= 100) size = 'large';
        else if (count >= 50) size = 'medium';

        return L.divIcon({
          html: `<div>${count}</div>`,
          className: `marker-cluster marker-cluster-${size}`,
          iconSize: L.point(40, 40)
        });
      }
    });

    if (this.markerClusterGroup) {
      this.markerClusterGroup.addTo(this.map);
    }
  }

  // Re-render all markers (used when switching to clustering mode)
  private rerenderMarkers(): void {
    if (!this.map || !this.mapData) return;

    // Remove all individual markers from map
    this.markersById.forEach(m => {
      if (this.map) this.map.removeLayer(m);
    });
    this.markersById.clear();

    // Re-render all markers (will go into cluster group)
    this.mapData.markers.forEach(m => this.renderMarker(m));
  }

}

export default MapView;
