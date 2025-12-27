/**
 * MapModalHelper - Unified helper for opening MapModal with consistent behavior
 * Ensures all map editing uses the same modal with consistent callbacks
 */

import { App, Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { StoryMap } from '../types';
import { MapModal } from '../modals/MapModal';

export interface MapModalOptions {
    /** Callback after map is saved */
    onSave?: (map: StoryMap) => Promise<void> | void;
    /** Callback after map is deleted */
    onDelete?: (map: StoryMap) => Promise<void> | void;
    /** Whether to refresh map view if open */
    refreshMapView?: boolean;
}

/**
 * Open MapModal with unified, consistent callbacks
 * This is the single entry point for all map editing
 */
export function openMapModal(
    app: App,
    plugin: StorytellerSuitePlugin,
    map: StoryMap | null,
    options: MapModalOptions = {}
): void {
    const {
        onSave,
        onDelete,
        refreshMapView = false
    } = options;

    new MapModal(
        app,
        plugin,
        map,
        async (updatedMap: StoryMap) => {
            await plugin.saveMap(updatedMap);
            new Notice(`Map "${updatedMap.name}" ${map ? 'updated' : 'created'}.`);

            // Call custom onSave callback if provided
            if (onSave) {
                await onSave(updatedMap);
            }

            // Refresh map view if it's open and showing this map
            if (refreshMapView) {
                const mapId = updatedMap.id || updatedMap.name;
                const mapView = app.workspace.getLeavesOfType('storyteller-map-view')[0];
                if (mapView) {
                    const view = mapView.view as any;
                    if (view && typeof view.loadMap === 'function') {
                        await view.loadMap(mapId);
                    }
                }
            }
        },
        async (mapToDelete: StoryMap) => {
            if (mapToDelete.filePath) {
                await plugin.deleteMap(mapToDelete.filePath);
                new Notice(`Deleted map: ${mapToDelete.name}`);

                // Call custom onDelete callback if provided
                if (onDelete) {
                    await onDelete(mapToDelete);
                }

                // Refresh map view if it's open
                if (refreshMapView) {
                    const mapView = app.workspace.getLeavesOfType('storyteller-map-view')[0];
                    if (mapView) {
                        const view = mapView.view as any;
                        if (view && typeof view.loadMap === 'function') {
                            // Clear the map view
                            view.currentMap = null;
                            if (view.mapContainer) {
                                view.mapContainer.empty();
                            }
                            if (view.leafletRenderer) {
                                view.leafletRenderer.unload();
                                view.leafletRenderer = null;
                            }
                            await view.buildMapSelector();
                            view.buildEntityBar();
                            view.updateFooterStatus();
                        }
                    }
                }
            }
        }
    ).open();
}

