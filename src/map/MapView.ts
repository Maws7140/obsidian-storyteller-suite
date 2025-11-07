/**
 * DEPRECATED: Map functionality has been deprecated and will be removed in a future version.
 * 
 * This file is kept for backward compatibility only.
 * 
 * Migration Guide:
 * - Alternative: Use the Obsidian Leaflet plugin (https://github.com/javalent/obsidian-leaflet) 
 *   for interactive map functionality in your vault.
 * - Documentation: See plugin README for migration instructions.
 * 
 * This class and all map-related functionality will be removed in version 2.0.0.
 */

import * as L from 'leaflet';
import type { Map as StoryMap, MapMarker } from '../types';
import type { MapViewOptions, MapMode, MapViewContext } from './types';
import { BaseMap } from './core/BaseMap';
import { RealMap } from './core/RealMap';
import { ImageMap } from './core/ImageMap';

/**
 * MapView - Interactive map component for displaying and editing story maps
 * 
 * @deprecated Map functionality has been deprecated and will be removed in version 2.0.0.
 * Please migrate to Obsidian Leaflet plugin (https://github.com/javalent/obsidian-leaflet).
 * See plugin documentation for migration guide.
 */
export class MapView {
	private engine: BaseMap | null = null;
	private readonly options: MapViewOptions;
	private currentMode: MapMode | null = null;
	private iconsFixed = false;

	constructor(options: MapViewOptions) {
		console.warn(
			'[Storyteller Suite] DEPRECATION WARNING: MapView and all map functionality has been deprecated.\n' +
			'Migration: Please use the Obsidian Leaflet plugin instead (https://github.com/javalent/obsidian-leaflet).\n' +
			'This functionality will be removed in version 2.0.0.\n' +
			'See plugin documentation for migration instructions.'
		);
		this.options = options;
	}

	async initMap(mapData: StoryMap): Promise<void> {
		// Fix Leaflet icons on first initialization
		if (!this.iconsFixed) {
			this.fixLeafletIcons();
			this.iconsFixed = true;
		}

		if (this.engine) {
			this.engine.destroy();
			this.engine = null;
		}

		const mode = this.resolveMode(mapData);
		const context: MapViewContext = {
			...this.options,
			mode
		};

		this.engine = mode === 'real' ? new RealMap(context) : new ImageMap(context);
		this.currentMode = mode;
		await this.engine.init(mapData);
	}

	destroy(): void {
		this.engine?.destroy();
		this.engine = null;
		this.currentMode = null;
	}

	getMapData(): StoryMap | null {
		return this.engine?.getMapData() ?? null;
	}

	addMarker(lat: number, lng: number, id?: string, opts?: Partial<MapMarker>): MapMarker | null {
		return this.engine?.addMarker(lat, lng, id, opts) ?? null;
	}

	removeMarker(markerId: string): void {
		this.engine?.removeMarker(markerId);
	}

	fitToMarkers(): void {
		this.engine?.fitToMarkers();
	}

	toggleGrid(show: boolean, size?: number): void {
		this.engine?.toggleGrid(show, size);
	}

	private resolveMode(mapData: StoryMap): MapMode {
		if (this.options.tileServer || this.options.osmLayer) {
			return 'real';
		}
		if (mapData.backgroundImagePath || (mapData.width && mapData.height)) {
			return 'image';
		}
		return 'real';
	}

	private fixLeafletIcons(): void {
		delete (L.Icon.Default.prototype as any)._getIconUrl;
		L.Icon.Default.mergeOptions({
			iconUrl: '',
			iconRetinaUrl: '',
			shadowUrl: '',
			iconSize: [0, 0],
			iconAnchor: [0, 0]
		});
	}
}

export default MapView;

export type { MapViewOptions } from './types';

