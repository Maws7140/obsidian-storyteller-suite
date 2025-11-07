/**
 * DEPRECATED: Map functionality has been deprecated and will be removed in a future version.
 * This file is kept for backward compatibility only.
 */

import * as L from 'leaflet';
import { Notice } from 'obsidian';
import type { Map as StoryMap } from '../../types';
import type { MapInitializationConfig, MapViewContext } from '../types';
import { BaseMap } from './BaseMap';

const DEFAULT_OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_SUBDOMAINS = ['a', 'b', 'c'];

export class RealMap extends BaseMap {
  private tileLayer: L.TileLayer | null = null;

  constructor(context: MapViewContext) {
    super(context);
  }

  protected async buildInitializationConfig(mapData: StoryMap): Promise<MapInitializationConfig> {
    this.stripImageMetadata(mapData);

    const center = this.resolveCenter(mapData.center);
    const zoom = mapData.defaultZoom ?? 2;

    return {
      center,
      zoom,
      minZoom: 0,
      maxZoom: 19,
      crs: L.CRS.EPSG3857
    };
  }

  protected async applyBaseLayers(_init: MapInitializationConfig): Promise<void> {
    if (!this.map) return;

    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
      this.tileLayer = null;
    }

    let url: string | undefined = this.context.tileServer;
    let subdomains: string[] = DEFAULT_TILE_SUBDOMAINS;

    if (this.context.tileSubdomains) {
      subdomains = this.context.tileSubdomains.split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (!url && this.context.osmLayer !== false) {
      url = DEFAULT_OSM_URL;
    }

    if (!url) {
      new Notice('No tile server configured for real-world map.');
      return;
    }

    const attribution = this.resolveAttribution(url);

    this.tileLayer = L.tileLayer(url, {
      maxZoom: 19,
      subdomains,
      attribution
    });

    this.tileLayer.addTo(this.map);
  }

  private stripImageMetadata(mapData: StoryMap): void {
    if (mapData.width) mapData.width = undefined;
    if (mapData.height) mapData.height = undefined;
    if (mapData.backgroundImagePath) {
      mapData.backgroundImagePath = undefined;
    }
  }

  private resolveCenter(center?: [number, number]): L.LatLngExpression {
    if (!center) return L.latLng(20, 0);
    const [lat, lng] = center;
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return L.latLng(lat, lng);
    }
    return L.latLng(20, 0);
  }

  /**
   * Sanitize HTML string for safe use in attribution
   * Encodes special characters while preserving basic HTML entities and structure
   */
  private sanitizeAttribution(attribution: string): string {
    if (!attribution) return '';
    
    // Create a temporary element to leverage browser's HTML encoding
    const temp = document.createElement('div');
    temp.textContent = attribution;
    const encoded = temp.innerHTML;
    
    // Re-allow safe HTML entities and anchor tags that are common in attributions
    return encoded
      .replace(/&amp;copy;/g, '&copy;')
      .replace(/&amp;/g, '&')
      .replace(/&lt;a\s+href=&quot;([^&quot;]+)&quot;\s*&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">')
      .replace(/&lt;\/a&gt;/g, '</a>');
  }

  /**
   * Determine if a tile URL is from OpenStreetMap
   */
  private isOpenStreetMapUrl(url: string): boolean {
    return url.toLowerCase().includes('openstreetmap.org');
  }

  /**
   * Resolve the attribution string based on configuration and tile URL
   */
  private resolveAttribution(url: string): string {
    // 1. Use explicit attribution from context if provided
    if (this.context.tileAttribution !== undefined) {
      return this.sanitizeAttribution(this.context.tileAttribution);
    }

    // 2. Auto-detect OpenStreetMap and use appropriate attribution
    if (this.isOpenStreetMapUrl(url)) {
      return '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
    }

    // 3. Default to empty string for custom tile servers
    return '';
  }
}
