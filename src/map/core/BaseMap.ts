/**
 * DEPRECATED: Map functionality has been deprecated and will be removed in a future version.
 * This file is kept so maybe I implement later.
 */

import * as L from 'leaflet';
import 'leaflet-draw/dist/leaflet.draw';
import 'leaflet.markercluster';
import { TFile } from 'obsidian';
import type { Map as StoryMap, MapMarker } from '../../types';
import { readFrontmatter, toMapMarker } from '../../utils/frontmatter';
import { getDataviewApi, hasDataview } from '../../utils/dataview';
import { generateMarkerId } from '../../utils/MapUtils';
import type { MapInitializationConfig, MapViewContext } from '../types';

export abstract class BaseMap {
  protected map: L.Map | null = null;
  protected mapData: StoryMap | null = null;
  protected drawnItems!: L.FeatureGroup;
  protected markersById: Map<string, L.Marker> = new Map();
  protected markerClusterGroup: L.MarkerClusterGroup | null = null;
  protected geojsonLayers: L.GeoJSON[] = [];
  protected gpxLayers: L.LayerGroup[] = [];
  protected gridLayer: L.LayerGroup | null = null;
  protected drawControl: L.Control.Draw | null = null;
  protected suppressMapChange: boolean = false;

  constructor(protected readonly context: MapViewContext) {
    // drawnItems is initialized in init() method
  }

  async init(mapData: StoryMap): Promise<void> {
    this.mapData = this.cloneMap(mapData);

    await this.teardownExistingMap();
    this.assertContainer();

    const init = await this.buildInitializationConfig(this.mapData);
    this.map = L.map(this.context.container, {
      crs: init.crs,
      center: init.center,
      zoom: init.zoom,
      minZoom: init.minZoom,
      maxZoom: init.maxZoom,
      zoomControl: !this.context.readOnly,
      attributionControl: false,
      maxBounds: init.bounds,
      maxBoundsViscosity: init.bounds ? 1.0 : 0,
      preferCanvas: false
    });

    this.drawnItems = new L.FeatureGroup();
    this.drawnItems.addTo(this.map);

    await this.applyBaseLayers(init);

    this.renderExistingMarkers();
    await this.loadExternalData();

    if (!this.context.readOnly) {
      this.setupDrawingControls();
    }

    this.invalidateSize(init.bounds);
  }

  destroy(): void {
    if (this.drawControl && this.map) {
      this.map.removeControl(this.drawControl);
      this.drawControl = null;
    }

    if (this.markerClusterGroup && this.map) {
      this.map.removeLayer(this.markerClusterGroup);
      this.markerClusterGroup = null;
    }

    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    this.geojsonLayers = [];
    this.gpxLayers = [];
    this.markersById.clear();
  }

  getMapData(): StoryMap | null {
    return this.mapData ? this.cloneMap(this.mapData) : null;
  }

  fitToMarkers(): void {
    if (!this.map || !this.mapData?.markers?.length) return;
    const latLngs = this.mapData.markers.map((m) => L.latLng(m.lat, m.lng));
    this.map.fitBounds(L.latLngBounds(latLngs), { padding: [20, 20] });
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
    if (!this.suppressMapChange) {
      this.context.onMapChange?.();
    }
    return marker;
  }

  removeMarker(markerId: string): void {
    if (!this.mapData) return;
    const idx = this.mapData.markers.findIndex((m) => m.id === markerId);
    if (idx !== -1) this.mapData.markers.splice(idx, 1);
    const marker = this.markersById.get(markerId);
    if (marker) {
      if (this.markerClusterGroup) {
        this.markerClusterGroup.removeLayer(marker);
      } else if (this.map) {
        this.map.removeLayer(marker);
      }
      this.markersById.delete(markerId);
    }
    this.context.onMapChange?.();
  }

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
    for (let x = Math.ceil(minLng / size) * size; x <= maxLng; x += size) {
      layers.push(
        L.polyline(
          [
            [minLat, x],
            [maxLat, x]
          ],
          { color: '#888', opacity: 0.2, weight: 1 }
        )
      );
    }
    for (let y = Math.ceil(minLat / size) * size; y <= maxLat; y += size) {
      layers.push(
        L.polyline(
          [
            [y, minLng],
            [y, maxLng]
          ],
          { color: '#888', opacity: 0.2, weight: 1 }
        )
      );
    }

    this.gridLayer = L.layerGroup(layers).addTo(this.map);
  }

  protected async loadExternalData(): Promise<void> {
    await this.loadMarkersFromFrontmatter();
    await this.loadMarkersFromDataView();
    await this.loadGeoJSONLayers();
    await this.loadGPXLayers();
  }

  protected renderExistingMarkers(): void {
    if (!this.mapData?.markers?.length) return;
    if (this.mapData.markers.length >= 20) {
      this.enableClustering();
    }
    this.mapData.markers.forEach((marker) => this.renderMarker(marker));
  }

  protected async loadMarkersFromFrontmatter(): Promise<void> {
    if (!this.map || !this.mapData || !this.context.enableFrontmatterMarkers) return;
    const filesToScan: TFile[] = [];

    if (this.context.markerFiles) {
      for (const path of this.context.markerFiles) {
        const file = this.context.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) filesToScan.push(file);
      }
    }

    if (this.context.markerFolders) {
      for (const folderPath of this.context.markerFolders) {
        const folder = this.context.app.vault.getAbstractFileByPath(folderPath);
        if (folder && 'children' in folder) {
          this.context.app.vault.getMarkdownFiles().forEach((f) => {
            if (f.path.startsWith(folderPath + '/')) filesToScan.push(f);
          });
        }
      }
    }

    for (const file of filesToScan) {
      const fmData = readFrontmatter(this.context.app, file);
      if (!fmData) continue;

      if (fmData.location && Array.isArray(fmData.location)) {
        const [lat, lng] = fmData.location;
        const marker: MapMarker = {
          id: generateMarkerId(),
          lat,
          lng,
          label: file.basename,
          locationName: file.basename,
          markerType: 'location',
          visible: true
        };
        this.mapData.markers.push(marker);
        this.renderMarker(marker);
      }

      if (fmData.mapmarkers) {
        for (const def of fmData.mapmarkers) {
          const marker = toMapMarker(def);
          marker.id = generateMarkerId();
          marker.locationName = file.basename;
          this.mapData.markers.push(marker);
          this.renderMarker(marker);
        }
      }
    }

    this.context.onMapChange?.();
  }

  protected async loadMarkersFromDataView(): Promise<void> {
    if (!this.map || !this.mapData || !this.context.enableDataViewMarkers || !this.context.markerTags?.length) {
      return;
    }
    if (!hasDataview(this.context.app)) return;

    const api = getDataviewApi(this.context.app);
    if (!api) return;

    this.suppressMapChange = true;
    let hasChanges = false;

    try {
      for (const tag of this.context.markerTags) {
        try {
          const pages = api.pages(`#${tag}`);
          const results = pages?.array() ?? [];

          for (const page of results) {
            const file = this.context.app.vault.getAbstractFileByPath(page.file.path);
            if (!(file instanceof TFile)) continue;

            const fmData = readFrontmatter(this.context.app, file);
            if (fmData?.location && Array.isArray(fmData.location)) {
              const [lat, lng] = fmData.location;
              this.addMarker(lat, lng, undefined, {
                label: file.basename,
                locationName: file.basename,
                markerType: 'location'
              });
              hasChanges = true;
            }
          }
        } catch (err) {
          console.error('DataView marker query failed:', err);
        }
      }
    } finally {
      this.suppressMapChange = false;
      if (hasChanges) {
        this.context.onMapChange?.();
      }
    }
  }

  protected async loadGeoJSONLayers(): Promise<void> {
    if (!this.map || !this.context.geojsonFiles?.length) return;

    for (const filePath of this.context.geojsonFiles) {
      try {
        const file = this.context.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) continue;

        const content = await this.context.app.vault.read(file);
        const geojsonData = JSON.parse(content);

        const layer = L.geoJSON(geojsonData, {
          style: (feature) => ({
            color: feature?.properties?.color || '#3388ff',
            weight: feature?.properties?.weight || 2,
            opacity: feature?.properties?.opacity || 0.8,
            fillColor: feature?.properties?.fillColor || '#3388ff',
            fillOpacity: feature?.properties?.fillOpacity || 0.3
          }),
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

  protected async loadGPXLayers(): Promise<void> {
    if (!this.map || !this.context.gpxFiles?.length) return;

    for (const filePath of this.context.gpxFiles) {
      try {
        const file = this.context.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) continue;

        const content = await this.context.app.vault.read(file);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');

        const layerGroup = new L.LayerGroup();
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

  protected renderMarker(marker: MapMarker): void {
    if (!this.map) return;

    const color = marker.markerType === 'event'
      ? '#ff6b6b'
      : marker.markerType === 'childMap'
      ? '#4ecdc4'
      : marker.color ?? '#3388ff';

    const icon = L.divIcon({
      className: 'storyteller-marker',
      html: `<div style="
        width:14px;height:14px;border-radius:${marker.markerType === 'location' ? '50%' : '4px'};
        background:${color};border:2px solid rgba(0,0,0,0.2);
        box-shadow:0 0 4px rgba(0,0,0,0.3);
      "></div>`
    });

    const layer = L.marker([marker.lat, marker.lng], { icon });
    if (marker.label) {
      layer.bindTooltip(marker.label, { direction: 'top', opacity: 0.9 });
    }

    if (this.context.onMarkerClick) {
      layer.on('click', () => this.context.onMarkerClick?.(marker));
    }

    if (this.markerClusterGroup) {
      this.markerClusterGroup.addLayer(layer);
    } else {
      layer.addTo(this.map);
    }

    this.markersById.set(marker.id, layer);
  }

  protected enableClustering(): void {
    if (!this.map || this.markerClusterGroup) return;

    const clusterGroup = (L as any).markerClusterGroup({
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

    this.markerClusterGroup = clusterGroup;
    clusterGroup.addTo(this.map);
  }

  protected rerenderMarkers(): void {
    if (!this.map || !this.mapData) return;
    
    // Handle cluster group cleanup
    if (this.markerClusterGroup) {
      this.markerClusterGroup.clearLayers();
      if (this.map) {
        this.map.removeLayer(this.markerClusterGroup);
      }
      this.markerClusterGroup = null;
    } else {
      // Only remove individual markers if not using clustering
      this.markersById.forEach((markerLayer) => {
        if (this.map) this.map.removeLayer(markerLayer);
      });
    }
    
    this.markersById.clear();
    this.mapData.markers.forEach((marker) => this.renderMarker(marker));
  }

  protected setupDrawingControls(): void {
    if (!this.map) return;

    if (typeof (L as any).Draw === 'undefined' || typeof (L as any).Control.Draw === 'undefined') {
      console.warn('Leaflet Draw library not loaded, skipping drawing controls');
      return;
    }

    try {
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

      this.map.on('draw:created', (e: any) => {
        const layer = e.layer;
        this.drawnItems.addLayer(layer);
        this.context.onMapChange?.();
      });

      this.map.on('draw:edited', () => {
        this.context.onMapChange?.();
      });

      this.map.on('draw:deleted', () => {
        this.context.onMapChange?.();
      });
    } catch (error) {
      console.error('Failed to setup drawing controls:', error);
    }
  }

  protected invalidateSize(bounds?: L.LatLngBounds): void {
    if (!this.map) return;
    requestAnimationFrame(() => {
      if (!this.map) return;
      try {
        this.map.invalidateSize({ pan: false, animate: false });
        if (bounds && this.context.mode === 'image') {
          this.map.fitBounds(bounds, { padding: [10, 10], animate: false });
        }
      } catch (error) {
        console.error('Error invalidating map size:', error);
      }
    });
  }

  protected async teardownExistingMap(): Promise<void> {
    if (!this.map) return;

    try {
      this.map.remove();
    } catch (error) {
      console.error('Error removing previous map:', error);
    }

    this.map = null;
    this.backgroundCleanup();
  }

  protected backgroundCleanup(): void {
    this.markerClusterGroup = null;
    this.drawnItems = new L.FeatureGroup();
    this.markersById.clear();
    this.geojsonLayers = [];
    this.gpxLayers = [];
    this.gridLayer = null;
  }

  protected assertContainer(): void {
    if (!this.context.container || !this.context.container.isConnected) {
      throw new Error('MapView: Container is not in the DOM');
    }

    if (!this.context.container.offsetWidth || !this.context.container.offsetHeight) {
      console.warn('MapView: Container not visible or has no dimensions, applying defaults...');

      if (!this.context.container.offsetWidth) {
        this.context.container.style.width = '100%';
      }
      if (!this.context.container.offsetHeight) {
        this.context.container.style.height = '500px';
      }
    }
  }

  protected cloneMap(map: StoryMap): StoryMap {
    return JSON.parse(JSON.stringify(map));
  }

  protected abstract buildInitializationConfig(mapData: StoryMap): Promise<MapInitializationConfig>;

  protected abstract applyBaseLayers(init: MapInitializationConfig): Promise<void>;
}
