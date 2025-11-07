import type * as L from 'leaflet';
import type { App } from 'obsidian';
import type { MapMarker } from '../types';

export interface MapDataSourceOptions {
  enableFrontmatterMarkers?: boolean;
  enableDataViewMarkers?: boolean;
  markerFiles?: string[];
  markerFolders?: string[];
  markerTags?: string[];
  geojsonFiles?: string[];
  gpxFiles?: string[];
}

export interface TileLayerOptions {
  tileServer?: string;
  osmLayer?: boolean;
  tileSubdomains?: string;
  tileAttribution?: string;
}

export interface MapViewOptions extends MapDataSourceOptions, TileLayerOptions {
  container: HTMLElement;
  app: App;
  readOnly?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
  onMapChange?: () => void;
}

export type MapMode = 'real' | 'image';

export interface MapInitializationConfig {
  center: L.LatLngExpression;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  crs: L.CRS;
  bounds?: L.LatLngBounds;
}

export interface MapViewContext extends MapViewOptions {
  mode: MapMode;
}
