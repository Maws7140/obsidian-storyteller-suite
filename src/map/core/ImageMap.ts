/**
 * DEPRECATED: Map functionality has been deprecated and will be removed in a future version.
 * This file is kept for backward compatibility only.
 */

import * as L from 'leaflet';
import { Notice, TFile } from 'obsidian';
import type { Map as StoryMap } from '../../types';
import { calculateImageBounds } from '../../utils/MapUtils';
import type { MapInitializationConfig, MapViewContext } from '../types';
import { BaseMap } from './BaseMap';

export class ImageMap extends BaseMap {
  private backgroundImageLayer: L.ImageOverlay | null = null;

  constructor(context: MapViewContext) {
    super(context);
  }

  protected async buildInitializationConfig(mapData: StoryMap): Promise<MapInitializationConfig> {
    const bounds = this.resolveBounds(mapData);
    const center = mapData.center
      ? L.latLng(mapData.center[0], mapData.center[1])
      : bounds.getCenter();
    const zoom = mapData.defaultZoom ?? 0;

    return {
      center,
      zoom,
      minZoom: -2,
      maxZoom: 4,
      crs: L.CRS.Simple,
      bounds
    };
  }

  protected async applyBaseLayers(init: MapInitializationConfig): Promise<void> {
    if (!this.map) return;

    if (this.backgroundImageLayer) {
      this.map.removeLayer(this.backgroundImageLayer);
      this.backgroundImageLayer = null;
    }

    if (!this.mapData?.backgroundImagePath) {
      return;
    }

    const file = this.context.app.vault.getAbstractFileByPath(this.mapData.backgroundImagePath);
    if (!(file instanceof TFile)) {
      new Notice('Background image not found in vault.');
      return;
    }

    const imageUrl = this.context.app.vault.getResourcePath(file);
    const bounds = init.bounds;
    if (!bounds) {
      console.warn('Image map missing bounds; skipping background layer.');
      return;
    }

    this.backgroundImageLayer = L.imageOverlay(imageUrl, bounds, {
      interactive: false,
      opacity: 1
    });

    this.backgroundImageLayer.addTo(this.map);
    this.map.fitBounds(bounds, { padding: [10, 10] });
  }

  private resolveBounds(mapData: StoryMap): L.LatLngBounds {
    if (mapData.width && mapData.height) {
      return calculateImageBounds(mapData.width, mapData.height);
    }
    if (mapData.bounds) {
      return L.latLngBounds(mapData.bounds[0], mapData.bounds[1]);
    }
    return L.latLngBounds(
      [0, 0],
      [100, 100]
    );
  }
}
