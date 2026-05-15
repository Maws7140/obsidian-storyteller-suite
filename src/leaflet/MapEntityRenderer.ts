/**
 * MapEntityRenderer - Renders locations and entities on Leaflet maps
 * Handles location markers, entity markers, popups, and context menus
 */

import * as L from 'leaflet';
import { Menu, Notice, TFile, setIcon } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { Location, MapBinding, EntityRef, Character, Event, PlotItem, StoryMap, Scene, Culture, Economy, MagicSystem, Reference } from '../types';
import { LocationService } from '../services/LocationService';
import { MapHierarchyManager } from '../utils/MapHierarchyManager';
import { stripWikiLinkToString } from '../utils/WikiLinks';
import { confirmWithModal } from '../modals/ui/ConfirmModal';

interface MapViewWithLoadMap {
    loadMap(mapId: string): Promise<void>;
}

interface MapViewWithRefreshEntities {
    refreshEntities(): Promise<void>;
}

interface MapViewWithRefresh {
    refresh(): Promise<void>;
}

interface MapViewWithRendererParams {
    leafletRenderer?: {
        params?: {
            mapId?: string;
        };
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasLoadMap(view: unknown): view is MapViewWithLoadMap {
    return isRecord(view) && typeof view.loadMap === 'function';
}

function hasRefreshEntities(view: unknown): view is MapViewWithRefreshEntities {
    return isRecord(view) && typeof view.refreshEntities === 'function';
}

function hasRefresh(view: unknown): view is MapViewWithRefresh {
    return isRecord(view) && typeof view.refresh === 'function';
}

function getMapViewMapId(view: unknown): string | undefined {
    if (!isRecord(view)) {
        return undefined;
    }
    const viewWithRenderer = view as MapViewWithRendererParams;
    return viewWithRenderer.leafletRenderer?.params?.mapId;
}

export class MapEntityRenderer {
    private map: L.Map;
    private plugin: StorytellerSuitePlugin;
    private locationService: LocationService;
    private hierarchyManager: MapHierarchyManager;
    private markerLayers: Map<string, L.LayerGroup> = new Map();
    private locationMarkers: Map<string, L.Marker> = new Map();
    private entityMarkers: Map<string, L.Marker> = new Map();
    private portalMarkers: Map<string, L.Marker> = new Map();
    private mapId: string;
    private isMovingMarker: boolean = false;

    private readonly normalizeName = (value: string): string => this.stripWikiLinkValue(value).trim().toLowerCase();

    constructor(map: L.Map, plugin: StorytellerSuitePlugin, mapId: string) {
        this.map = map;
        this.plugin = plugin;
        this.locationService = new LocationService(plugin);
        this.hierarchyManager = new MapHierarchyManager(plugin.app, plugin);
        this.mapId = mapId;

        this.initializeLayers();
    }

    /**
     * Initialize layer groups for different entity types
     */
    private initializeLayers(): void {
        const layerTypes = ['locations', 'portals', 'characters', 'events', 'items', 'groups', 'cultures', 'economies', 'magicsystems', 'scenes', 'references', 'custom'];

        for (const type of layerTypes) {
            const layer = L.layerGroup().addTo(this.map);
            this.markerLayers.set(type, layer);
        }
    }

    /**
     * Load and render all locations bound to this map
     */
    async renderLocationsForMap(mapId: string): Promise<void> {
        const locations = await this.plugin.listLocations();
        const locationsLayer = this.markerLayers.get('locations')!;
        locationsLayer.clearLayers();
        this.locationMarkers.clear();

        for (const location of locations) {
            const binding = location.mapBindings?.find(b => b.mapId === mapId);
            if (!binding) continue;

            // Check zoom range if specified
            const currentZoom = this.map.getZoom();
            if (binding.zoomRange) {
                const [minZoom, maxZoom] = binding.zoomRange;
                if (currentZoom < minZoom || currentZoom > maxZoom) {
                    continue; // Skip if outside zoom range
                }
            }

            const marker = await this.createLocationMarker(location, binding);
            locationsLayer.addLayer(marker);
            this.locationMarkers.set(location.id || location.name, marker);
        }

        // Update visibility on zoom change
        this.map.on('zoomend', () => {
            void this.updateMarkerVisibility(mapId);
        });
    }

    /**
     * Update marker visibility based on zoom level
     */
    private async updateMarkerVisibility(mapId: string): Promise<void> {
        const locations = await this.plugin.listLocations();
        const currentZoom = this.map.getZoom();

        for (const location of locations) {
            const binding = location.mapBindings?.find(b => b.mapId === mapId);
            if (!binding) continue;

            const marker = this.locationMarkers.get(location.id || location.name);
            if (!marker) continue;

            if (binding.zoomRange) {
                const [minZoom, maxZoom] = binding.zoomRange;
                if (currentZoom >= minZoom && currentZoom <= maxZoom) {
                    if (!this.map.hasLayer(marker)) {
                        marker.addTo(this.map);
                    }
                } else {
                    if (this.map.hasLayer(marker)) {
                        marker.remove();
                    }
                }
            }
        }
    }

    /**
     * Render portal markers for child maps
     * Portal markers allow users to navigate to child maps
     */
    async renderPortalMarkers(mapId: string): Promise<void> {
        const portalsLayer = this.markerLayers.get('portals')!;
        portalsLayer.clearLayers();
        this.portalMarkers.clear();

        // Get all child maps that can be navigated to
        const portalTargets = await this.hierarchyManager.getPortalTargets(mapId);

        const portalsByLocation = new Map<string, Array<{
            map: StoryMap;
            location: Location;
            binding: MapBinding;
        }>>();

        for (const portalInfo of portalTargets) {
            const { map: childMap, location } = portalInfo;

            // Only show portal if location has map binding on current map
            if (!location) continue;

            const binding = location.mapBindings?.find(b => b.mapId === mapId);
            if (!binding) continue;

            const locationKey = location.id || location.name;
            if (!portalsByLocation.has(locationKey)) {
                portalsByLocation.set(locationKey, []);
            }
            portalsByLocation.get(locationKey)!.push({
                map: childMap,
                location,
                binding,
            });
        }

        for (const groupedPortals of portalsByLocation.values()) {
            const total = groupedPortals.length;
            for (let index = 0; index < groupedPortals.length; index++) {
                const { map: childMap, location, binding } = groupedPortals[index];
                const portalCoordinates = this.getPortalMarkerCoordinates(binding.coordinates, index, total);
                const marker = this.createPortalMarker(childMap, location, portalCoordinates);
                portalsLayer.addLayer(marker);
                this.portalMarkers.set(childMap.id || childMap.name, marker);
            }
        }
    }

    /**
     * Create a portal marker for navigating to a child map
     */
    private createPortalMarker(
        childMap: StoryMap,
        location: Location,
        coordinates: [number, number]
    ): L.Marker {
        const marker = L.marker(coordinates, {
            icon: this.getPortalMarkerIcon(),
            title: `Portal to ${childMap.name}`,
            zIndexOffset: 850 // Keep portals visible without sitting directly on the location pin
        });

        // Build popup
        const popupContent = this.buildPortalPopup(childMap, location);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'storyteller-map-popup storyteller-portal-popup'
        });

        // Click handler - navigate to child map
        marker.on('click', (e) => { void (async () => {
            // Don't navigate if user is holding modifier key
            if (!e.originalEvent.ctrlKey && !e.originalEvent.metaKey) {
                // Open child map in MapView
                const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                if (hasLoadMap(mapView?.view)) {
                    const mapId = childMap.id || childMap.name;
                    await mapView.view.loadMap(mapId);
                    new Notice(`Navigated to ${childMap.name}`);
                }
            }
        })(); });

        // Context menu
        marker.on('contextmenu', (e) => {
            const menu = new Menu();

            menu.addItem((item) =>
                item
                    .setTitle(`Open ${childMap.name}`)
                    .setIcon('map')
                    .onClick(async () => {
                        const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                        if (hasLoadMap(mapView?.view)) {
                            const mapId = childMap.id || childMap.name;
                            await mapView.view.loadMap(mapId);
                        }
                    })
            );

            menu.addItem((item) =>
                item
                    .setTitle('View location')
                    .setIcon('map-pin')
                    .onClick(() => {
                        if (location.filePath) {
                            void this.plugin.app.workspace.openLinkText(location.filePath, '', true);
                        }
                    })
            );

            menu.addSeparator();

            menu.addItem((item) =>
                item
                    .setTitle('Edit map')
                    .setIcon('edit')
                    .onClick(async () => {
                        const { openMapModal } = await import('../utils/MapModalHelper');
                        openMapModal(this.plugin.app, this.plugin, childMap);
                    })
            );

            menu.showAtMouseEvent(e.originalEvent);
        });

        return marker;
    }

    private getPortalMarkerCoordinates(
        coordinates: [number, number],
        index: number,
        total: number
    ): [number, number] {
        const radius = total <= 1 ? 28 : 34;
        const startAngle = total <= 1 ? -Math.PI / 4 : -Math.PI / 2;
        const angle = startAngle + ((2 * Math.PI) / Math.max(total, 1)) * index;
        const offsetX = Math.cos(angle) * radius;
        const offsetY = Math.sin(angle) * radius;
        return this.offsetCoordinatesByPixels(coordinates, [offsetX, offsetY]);
    }

    private offsetCoordinatesByPixels(
        coordinates: [number, number],
        offset: [number, number]
    ): [number, number] {
        const basePoint = this.map.latLngToLayerPoint(coordinates);
        const offsetX = offset[0];
        const offsetY = offset[1];
        const shiftedPoint = L.point(basePoint.x + offsetX, basePoint.y + offsetY);
        const shiftedLatLng = this.map.layerPointToLatLng(shiftedPoint);
        return [shiftedLatLng.lat, shiftedLatLng.lng];
    }

    /**
     * Get portal marker icon
     */
    private getPortalMarkerIcon(): L.DivIcon {
        const iconHtml = `
            <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <radialGradient id="portalGradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" style="stop-color:#a855f7;stop-opacity:0.9" />
                        <stop offset="50%" style="stop-color:#7c3aed;stop-opacity:0.7" />
                        <stop offset="100%" style="stop-color:#5b21b6;stop-opacity:0.9" />
                    </radialGradient>
                </defs>
                <circle cx="20" cy="20" r="16" fill="url(#portalGradient)" stroke="#fbbf24" stroke-width="3"/>
                <path d="M20 8 L20 32 M8 20 L32 20" stroke="#fbbf24" stroke-width="2" opacity="0.7"/>
            </svg>
        `;

        return L.divIcon({
            html: iconHtml,
            className: 'storyteller-portal-marker',
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        });
    }

    /**
     * Build popup HTML for portal marker
     */
    private buildPortalPopup(childMap: StoryMap, location: Location): HTMLElement {
        const container = createDiv();
        container.className = 'storyteller-portal-popup';

        const header = container.createDiv('popup-header portal-header');
        const portalIcon = header.createSpan('popup-icon');
        setIcon(portalIcon, 'map');
        header.createEl('h3', { text: childMap.name, cls: 'popup-title' });
        header.createSpan({ text: 'Child Map', cls: 'popup-badge' });

        const content = container.createDiv('popup-content');
        content.createEl('p', { text: childMap.description || 'No description', cls: 'popup-description' });
        const scaleInfo = content.createDiv('popup-info');
        scaleInfo.createSpan({ text: 'Scale:', cls: 'info-label' });
        scaleInfo.createSpan({ text: childMap.scale || 'custom', cls: 'info-value' });
        const typeInfo = content.createDiv('popup-info');
        typeInfo.createSpan({ text: 'Type:', cls: 'info-label' });
        typeInfo.createSpan({ text: childMap.type || 'image', cls: 'info-value' });

        const actions = container.createDiv('popup-actions');
        const button = actions.createEl('button', { cls: 'popup-btn popup-btn-primary' });
        setIcon(button, 'arrow-down');
        button.appendText(' Zoom to Map');

        // Add click handler to button
        button.addEventListener('click', () => { void (async () => {
                const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                if (hasLoadMap(mapView?.view)) {
                    const mapId = childMap.id || childMap.name;
                    await mapView.view.loadMap(mapId);
                    new Notice(`Navigated to ${childMap.name}`);
                }
            })(); });

        return container;
    }

    /**
     * Check if two coordinates are at the same position (within small tolerance)
     */
    private areCoordinatesEqual(coord1: [number, number], coord2: [number, number], tolerance: number = 0.0001): boolean {
        return Math.abs(coord1[0] - coord2[0]) < tolerance && Math.abs(coord1[1] - coord2[1]) < tolerance;
    }

    /**
     * Calculate offset for stacked markers to spread them in a circular pattern
     */
    private calculateStackOffset(index: number, total: number): [number, number] {
        if (total <= 1) return [0, 0];
        
        // Spread markers in a circle around the center
        const radius = 15; // pixels
        const angle = (2 * Math.PI * index) / total;
        return [
            Math.cos(angle) * radius,
            Math.sin(angle) * radius
        ];
    }

    private calculateLocationEntityOffset(index: number, total: number): [number, number] {
        const radius = total <= 1 ? 26 : 24;
        const startAngle = total <= 1 ? -Math.PI / 3 : -Math.PI / 2;
        const angle = startAngle + ((2 * Math.PI) / Math.max(total, 1)) * index;
        return [
            Math.cos(angle) * radius,
            Math.sin(angle) * radius
        ];
    }

    private stripWikiLinkValue(value: string | null | undefined): string {
        return stripWikiLinkToString(value);
    }

    private locationMatchesReference(location: Location, locationRef: string | null | undefined): boolean {
        const normalizedRef = this.normalizeName(String(locationRef ?? ''));
        if (!normalizedRef) return false;
        const locationId = this.normalizeName(location.id || '');
        const locationName = this.normalizeName(location.name);
        return normalizedRef === locationId || normalizedRef === locationName;
    }

    private async getEffectiveLocationEntityRefs(location: Location): Promise<EntityRef[]> {
        const refsByKey = new Map<string, EntityRef>();
        for (const ref of location.entityRefs ?? []) {
            if (!ref?.entityId || !ref?.entityType) continue;
            refsByKey.set(`${ref.entityType}::${ref.entityId}`, ref);
        }

        // Fallback for stale reverse links: derive character presence from currentLocationId.
        const characters = await this.plugin.listCharacters().catch(() => [] as Character[]);
        for (const character of characters) {
            if (!this.locationMatchesReference(location, character.currentLocationId)) continue;
            const entityId = character.id || character.name;
            const key = `character::${entityId}`;
            if (refsByKey.has(key)) continue;
            refsByKey.set(key, {
                entityId,
                entityType: 'character',
                entityName: character.name,
                relationship: 'located',
            });
        }

        return Array.from(refsByKey.values());
    }

    /**
     * Render entities on the map based on their locations
     */
    async renderEntitiesForMap(mapId: string): Promise<void> {
        const locations = await this.plugin.listLocations();
        const charactersLayer = this.markerLayers.get('characters')!;
        const eventsLayer = this.markerLayers.get('events')!;
        const itemsLayer = this.markerLayers.get('items')!;
        const groupsLayer = this.markerLayers.get('groups')!;
        const culturesLayer = this.markerLayers.get('cultures')!;
        const economiesLayer = this.markerLayers.get('economies')!;
        const magicsystemsLayer = this.markerLayers.get('magicsystems')!;
        const scenesLayer = this.markerLayers.get('scenes')!;
        const referencesLayer = this.markerLayers.get('references')!;

        charactersLayer.clearLayers();
        eventsLayer.clearLayers();
        itemsLayer.clearLayers();
        groupsLayer.clearLayers();
        culturesLayer.clearLayers();
        economiesLayer.clearLayers();
        magicsystemsLayer.clearLayers();
        scenesLayer.clearLayers();
        referencesLayer.clearLayers();
        this.entityMarkers.clear();

        // Group entities by coordinate to detect stacking
        const entityGroups: Map<string, { entityRef: EntityRef; coordinates: [number, number]; location: Location | null }[]> = new Map();

        // First, collect entities linked to locations
        for (const location of locations) {
            const binding = location.mapBindings?.find(b => b.mapId === mapId);
            if (!binding) continue;
            const effectiveRefs = await this.getEffectiveLocationEntityRefs(location);
            if (effectiveRefs.length === 0) continue;

            const coordKey = `${binding.coordinates[0].toFixed(4)},${binding.coordinates[1].toFixed(4)}`;
            
            for (const entityRef of effectiveRefs) {
                if (!entityGroups.has(coordKey)) {
                    entityGroups.set(coordKey, []);
                }
                entityGroups.get(coordKey)!.push({
                    entityRef,
                    coordinates: binding.coordinates,
                    location
                });
            }
        }

        // Also discover entities placed directly on the map (with mapCoordinates and matching mapId)
        // This includes entities that may not be linked to a location
        const entitiesWithCoordinates = await this.discoverEntitiesWithMapCoordinates(mapId);
        for (const { entityRef, coordinates } of entitiesWithCoordinates) {
            const coordKey = `${coordinates[0].toFixed(4)},${coordinates[1].toFixed(4)}`;
            
            // Check if this entity is already in the groups (linked to a location)
            const existing = entityGroups.get(coordKey);
            if (existing && existing.some(e => e.entityRef.entityId === entityRef.entityId && e.entityRef.entityType === entityRef.entityType)) {
                // Already added via location, skip to avoid duplicates
                continue;
            }
            
            if (!entityGroups.has(coordKey)) {
                entityGroups.set(coordKey, []);
            }
            entityGroups.get(coordKey)!.push({
                entityRef,
                coordinates,
                location: null // No location for directly placed entities
            });
        }

        // Render entities with offset for stacked ones
        for (const entities of entityGroups.values()) {
            const totalAtLocation = entities.length;
            
            for (let i = 0; i < entities.length; i++) {
                const { entityRef, coordinates, location } = entities[i];
                const offset = location
                    ? this.calculateLocationEntityOffset(i, totalAtLocation)
                    : this.calculateStackOffset(i, totalAtLocation);
                
                const marker = await this.createEntityMarker(
                    entityRef, 
                    coordinates, 
                    location,
                    location || totalAtLocation > 1
                        ? { stackIndex: i, stackTotal: totalAtLocation, offset }
                        : undefined
                );
                
                if (marker) {
                    switch (entityRef.entityType) {
                        case 'character':
                            charactersLayer.addLayer(marker);
                            break;
                        case 'event':
                            eventsLayer.addLayer(marker);
                            break;
                        case 'item':
                            itemsLayer.addLayer(marker);
                            break;
                        case 'group':
                            groupsLayer.addLayer(marker);
                            break;
                        case 'culture':
                            culturesLayer.addLayer(marker);
                            break;
                        case 'economy':
                            economiesLayer.addLayer(marker);
                            break;
                        case 'magicsystem':
                            magicsystemsLayer.addLayer(marker);
                            break;
                        case 'scene':
                            scenesLayer.addLayer(marker);
                            break;
                        case 'reference':
                            referencesLayer.addLayer(marker);
                            break;
                        default:
                            this.markerLayers.get('custom')?.addLayer(marker);
                    }
                    this.entityMarkers.set(entityRef.entityId, marker);
                }
            }
        }
    }

    /**
     * Discover entities with mapCoordinates in frontmatter that match the given mapId
     * Returns entityRefs with their coordinates
     */
    private async discoverEntitiesWithMapCoordinates(mapId: string): Promise<{ entityRef: EntityRef; coordinates: [number, number] }[]> {
        const results: { entityRef: EntityRef; coordinates: [number, number] }[] = [];
        const app = this.plugin.app;

        // Query all entity types that might have mapCoordinates
        const [scenes, cultures, economies, magicSystems, references, groups] = await Promise.all([
            this.plugin.listScenes().catch(() => [] as Scene[]),
            this.plugin.listCultures().catch(() => [] as Culture[]),
            this.plugin.listEconomies().catch(() => [] as Economy[]),
            this.plugin.listMagicSystems().catch(() => [] as MagicSystem[]),
            this.plugin.listReferences().catch(() => [] as Reference[]),
            Promise.resolve(this.plugin.getGroups())
        ]);

        const allEntities = [
            ...scenes.map(e => ({ entity: e, type: 'scene' as const, file: e.filePath })),
            ...cultures.map(e => ({ entity: e, type: 'culture' as const, file: e.filePath })),
            ...economies.map(e => ({ entity: e, type: 'economy' as const, file: e.filePath })),
            ...magicSystems.map(e => ({ entity: e, type: 'magicsystem' as const, file: e.filePath })),
            ...references.map(e => ({ entity: e, type: 'reference' as const, file: e.filePath })),
            ...groups.map(e => ({ entity: e, type: 'group' as const, file: undefined }))
        ];

        for (const { entity, type, file } of allEntities) {
            // For groups, check if they have any entities linked to locations on this map
            // For other entities, check their frontmatter
            if (type === 'group') {
                // Groups don't have file paths, skip direct placement for now
                // They can still appear via location.entityRefs
                continue;
            }

            if (!file) continue;
            const fileObj = app.vault.getAbstractFileByPath(file);
            if (!(fileObj instanceof TFile)) continue;

            const cache = app.metadataCache.getFileCache(fileObj);
            const frontmatter = cache?.frontmatter as unknown;
            const fm = isRecord(frontmatter) ? frontmatter : {};

            // Check if this entity is linked to this map
            const isLinkedToMap = fm.mapId === mapId ||
                (Array.isArray(fm.relatedMapIds) && fm.relatedMapIds.some(relatedMapId => relatedMapId === mapId));

            if (!isLinkedToMap) continue;

            // Get coordinates from frontmatter
            let coords: [number, number] | undefined;
            if (Array.isArray(fm.mapCoordinates) && fm.mapCoordinates.length >= 2) {
                coords = [Number(fm.mapCoordinates[0]), Number(fm.mapCoordinates[1])];
            }

            if (coords && !isNaN(coords[0]) && !isNaN(coords[1])) {
                results.push({
                    entityRef: {
                        entityId: entity.id || entity.name,
                        entityType: type
                    },
                    coordinates: coords
                });
            }
        }

        return results;
    }

    /**
     * Create a marker for a location with entity popup
     */
    private async createLocationMarker(
        location: Location,
        binding: MapBinding
    ): Promise<L.Marker> {
        const effectiveRefs = await this.getEffectiveLocationEntityRefs(location);
        const marker = L.marker(binding.coordinates, {
            icon: this.getLocationMarkerIcon(binding, effectiveRefs.length),
            title: location.name
        });

        // Build popup with location info and entities
        const popupContent = await this.buildLocationPopup(location);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'storyteller-map-popup'
        });

        // Click opens the popup (Leaflet default behaviour).
        // Navigation is handled by the "Open Note" button inside the popup.

        // Context menu for quick actions
        marker.on('contextmenu', (e) => {
            this.showLocationContextMenu(e, location);
        });

        return marker;
    }

    /**
     * Create a marker for an entity
     */
    private async createEntityMarker(
        entityRef: EntityRef,
        coordinates: [number, number],
        location: Location | null,
        stackInfo?: { stackIndex: number; stackTotal: number; offset: [number, number] }
    ): Promise<L.Marker | null> {
        let entity: Character | Event | PlotItem | Scene | Culture | Economy | MagicSystem | Reference | null = null;

        try {
            switch (entityRef.entityType) {
                case 'character': {
                    const chars = await this.plugin.listCharacters();
                    entity = chars.find(c => (c.id || c.name) === entityRef.entityId) || null;
                    break;
                }
                case 'event': {
                    const events = await this.plugin.listEvents();
                    entity = events.find(e => (e.id || e.name) === entityRef.entityId) || null;
                    break;
                }
                case 'item': {
                    const items = await this.plugin.listPlotItems();
                    entity = items.find(i => (i.id || i.name) === entityRef.entityId) || null;
                    break;
                }
                case 'scene': {
                    const scenes = await this.plugin.listScenes();
                    entity = scenes.find(s => (s.id || s.name) === entityRef.entityId) || null;
                    break;
                }
                case 'culture': {
                    const cultures = await this.plugin.listCultures();
                    entity = cultures.find(c => (c.id || c.name) === entityRef.entityId) || null;
                    break;
                }
                case 'economy': {
                    const economies = await this.plugin.listEconomies();
                    entity = economies.find(e => (e.id || e.name) === entityRef.entityId) || null;
                    break;
                }
                case 'magicsystem': {
                    const magicSystems = await this.plugin.listMagicSystems();
                    entity = magicSystems.find(m => (m.id || m.name) === entityRef.entityId) || null;
                    break;
                }
                case 'reference': {
                    const references = await this.plugin.listReferences();
                    entity = references.find(r => (r.id || r.name) === entityRef.entityId) || null;
                    break;
                }
                case 'group': {
                    // Groups are stored in settings, not as entities
                    // We'll create a minimal entity object for display
                    const groups = this.plugin.getGroups();
                    const group = groups.find(g => (g.id || g.name) === entityRef.entityId);
                    if (group) {
                        entity = {
                            id: group.id || group.name,
                            name: group.name,
                            filePath: undefined // Groups don't have file paths
                        };
                    }
                    break;
                }
                default:
                    return null;
            }
        } catch {
            
            return null;
        }

        if (!entity) return null;

        // Get entity image URL if available
        const imagePath = this.getEntityImagePath(entity, entityRef.entityType);
        const imageUrl = imagePath ? this.getImageUrl(imagePath) : null;

        const icon = this.getEntityMarkerIcon(entityRef.entityType, imageUrl, entity.name, stackInfo);
        const markerCoordinates = stackInfo
            ? this.offsetCoordinatesByPixels(coordinates, stackInfo.offset)
            : coordinates;
        const marker = L.marker(markerCoordinates, {
            icon,
            title: entity.name
        });

        // Build popup
        const popupContent = this.buildEntityPopup(entity, entityRef, location);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'storyteller-map-popup'
        });

        // Build tooltip for hover - quick info including stack position if stacked
        const stackLabel = stackInfo ? ` (${stackInfo.stackIndex + 1}/${stackInfo.stackTotal})` : '';
        const tooltipContent = this.buildEntityTooltip(entity, entityRef) + stackLabel;
        marker.bindTooltip(tooltipContent, {
            direction: 'top',
            offset: [0, -20],
            className: 'storyteller-map-tooltip'
        });

        // Click opens the popup (Leaflet default behaviour).
        // Navigation is handled by the action button inside the popup.

        // Context menu for entity marker
        marker.on('contextmenu', (e) => {
            if (entity) {
                this.showEntityContextMenu(e, entity, entityRef, location);
            }
        });

        return marker;
    }

    /**
     * Get location marker icon
     */
    private getLocationMarkerIcon(binding: MapBinding, entityCount: number): L.Icon | L.DivIcon {
        const entityBadge = entityCount > 0 
            ? `<span class="storyteller-entity-count-badge">${entityCount}</span>` 
            : '';

        if (binding.markerIcon) {
            // Custom icon specified
            return L.divIcon({
                html: `<div class="storyteller-marker-wrapper">${binding.markerIcon}${entityBadge}</div>`,
                className: 'storyteller-custom-marker',
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            });
        }

        // Default location icon
        const color = '#3b82f6';
        const iconHtml = `
            <div class="storyteller-marker-wrapper">
                <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="10" r="8" fill="${color}" stroke="#fff" stroke-width="2"/>
                    <circle cx="12" cy="10" r="3" fill="#fff"/>
                </svg>
                ${entityBadge}
            </div>
        `;

        return L.divIcon({
            html: iconHtml,
            className: `storyteller-location-marker${entityCount > 0 ? ' has-entities' : ''}`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
    }

    /**
     * Get entity marker icon - shows entity image as circular avatar if available
     * @param entityType Type of entity (character, event, item)
     * @param imageUrl Optional image URL to display
     * @param entityName Entity name for fallback initials
     * @param stackInfo Optional stacking information for offset positioning
     */
    private getEntityMarkerIcon(
        entityType: string,
        imageUrl?: string | null,
        entityName?: string,
        stackInfo?: { stackIndex: number; stackTotal: number; offset: [number, number] }
    ): L.DivIcon {
        // Uniform color scheme for all entity types with distinct hues
        const colors: Record<string, { bg: string; border: string }> = {
            character: { bg: '#ef4444', border: '#dc2626' },      // Red
            event: { bg: '#f59e0b', border: '#d97706' },          // Orange
            item: { bg: '#10b981', border: '#059669' },           // Green
            culture: { bg: '#8b5cf6', border: '#7c3aed' },        // Purple
            economy: { bg: '#eab308', border: '#ca8a04' },        // Yellow
            magicsystem: { bg: '#06b6d4', border: '#0891b2' },    // Cyan
            group: { bg: '#3b82f6', border: '#2563eb' },          // Blue
            scene: { bg: '#ec4899', border: '#db2777' },          // Pink
            reference: { bg: '#64748b', border: '#475569' }       // Slate
        };

        const color = colors[entityType] || colors.character;
        
        // Show stack badge on first marker only when there are multiple
        const stackBadge = stackInfo && stackInfo.stackIndex === 0 && stackInfo.stackTotal > 1
            ? `<span class="storyteller-stack-badge">${stackInfo.stackTotal}</span>`
            : '';
        
        // If we have an image, show it as a circular avatar
        if (imageUrl) {
            const iconHtml = `
                <div class="storyteller-entity-avatar" style="
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 3px solid ${color.border};
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    overflow: hidden;
                    background-color: ${color.bg};
                    position: relative;
                ">
                    <span class="storyteller-entity-avatar-fallback">${this.getInitials(entityName)}</span>
                    <img src="${imageUrl}" alt="" style="
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    " onerror="this.style.display='none'"/>
                    ${stackBadge}
                </div>
            `;

            return L.divIcon({
                html: iconHtml,
                className: `storyteller-entity-marker storyteller-entity-${entityType} has-image${stackInfo && stackInfo.stackTotal > 1 ? ' stacked' : ''}`,
                iconSize: [36, 36],
                iconAnchor: [18, 36],
                popupAnchor: [0, -36]
            });
        }

        // Uniform SVG icons for all entity types
        const icons: Record<string, string> = {
            character: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <circle cx="12" cy="9" r="3.5" fill="#fff"/>
                    <path d="M12 14c-3.5 0-6 1.5-6 3.5v1h12v-1c0-2-2.5-3.5-6-3.5z" fill="#fff"/>
                </svg>
                ${stackBadge}
            `,
            event: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <path d="M8 7v10M12 5v14M16 8v8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                </svg>
                ${stackBadge}
            `,
            item: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <rect x="8" y="6" width="8" height="12" rx="1" fill="none" stroke="#fff" stroke-width="2"/>
                    <path d="M10 9h4M10 12h4M10 15h2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                ${stackBadge}
            `,
            culture: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <path d="M8 12h8M10 8l2 4 2-4M10 16l2-4 2 4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                ${stackBadge}
            `,
            economy: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="2"/>
                    <path d="M12 7v10M8 12h8" stroke="#fff" stroke-width="1.5"/>
                </svg>
                ${stackBadge}
            `,
            magicsystem: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <path d="M12 5l1.5 4.5h4.5l-3.5 2.5 1.5 4.5-3-2-3 2 1.5-4.5-3.5-2.5h4.5z" fill="#fff"/>
                </svg>
                ${stackBadge}
            `,
            group: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <circle cx="8" cy="10" r="2" fill="#fff"/>
                    <circle cx="16" cy="10" r="2" fill="#fff"/>
                    <circle cx="12" cy="13" r="2" fill="#fff"/>
                    <path d="M8 15c0-1 1-2 2-2h4c1 0 2 1 2 2v2H8z" fill="#fff"/>
                </svg>
                ${stackBadge}
            `,
            scene: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <path d="M7 10l5-3 5 3v7H7z" fill="#fff"/>
                    <rect x="10" y="13" width="4" height="4" fill="${color.bg}"/>
                </svg>
                ${stackBadge}
            `,
            reference: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <rect x="8" y="6" width="8" height="12" rx="1" fill="none" stroke="#fff" stroke-width="2"/>
                    <path d="M10 9h4M10 11h4M10 13h3" stroke="#fff" stroke-width="1" stroke-linecap="round"/>
                </svg>
                ${stackBadge}
            `
        };

        const iconHtml = icons[entityType] || icons.character;

        return L.divIcon({
            html: iconHtml,
            className: `storyteller-entity-marker storyteller-entity-${entityType}${stackInfo && stackInfo.stackTotal > 1 ? ' stacked' : ''}`,
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        });
    }

    /**
     * Get initials from entity name for fallback display
     */
    private getInitials(name?: string): string {
        if (!name) return '?';
        const words = name.trim().split(/\s+/);
        if (words.length === 1) {
            return words[0].substring(0, 2).toUpperCase();
        }
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }

    /**
     * Get image path from an entity based on its type
     */
    private getEntityImagePath(entity: Character | Event | PlotItem | Scene | Culture | Economy | MagicSystem | Reference, entityType: string): string | null {
        switch (entityType) {
            case 'character':
                return (entity as Character).profileImagePath || null;
            case 'item':
                return (entity as PlotItem).profileImagePath || null;
            case 'event': {
                // Events use images array - return first image
                const eventImages = (entity as Event).images;
                return eventImages && eventImages.length > 0 ? eventImages[0] : null;
            }
            case 'scene':
                return (entity as Scene).profileImagePath || null;
            case 'culture':
                return (entity as Culture).profileImagePath || null;
            case 'economy':
                return (entity as Economy).profileImagePath || null;
            case 'magicsystem':
                return (entity as MagicSystem).profileImagePath || null;
            case 'reference':
                return (entity as Reference).profileImagePath || null;
            default:
                return null;
        }
    }

    /**
     * Build popup HTML showing location and its entities
     */
    private async buildLocationPopup(location: Location): Promise<HTMLElement> {
        const container = createDiv();
        container.className = 'storyteller-location-popup';
        const effectiveRefs = await this.getEffectiveLocationEntityRefs(location);

        // Location header with hierarchy
        const path = await this.locationService.getLocationPath(location.id || location.name);
        const pathText = path.map(l => l.name).join(' › ');

        const header = container.createDiv({ cls: 'popup-header' });
        header.createSpan({ cls: 'popup-path', text: pathText });
        header.createEl('h3', { cls: 'popup-title', text: location.name });
        header.createSpan({ cls: 'popup-type', text: location.type || location.locationType || 'location' });

        // Child locations (if any)
        if (location.childLocationIds && location.childLocationIds.length > 0) {
            const childSection = container.createDiv('popup-section');
            childSection.createEl('h4', { text: 'Contains' });
            const childList = childSection.createEl('ul', { cls: 'popup-entity-list' });

            for (const childId of location.childLocationIds.slice(0, 5)) {
                const child = await this.locationService.getLocation(childId);
                if (child) {
                    const li = childList.createEl('li');
                    const childIcon = li.createSpan('entity-icon');
                    setIcon(childIcon, 'map-pin');
                    li.appendText(` ${child.name}`);
                    li.onclick = () => {
                        if (child.filePath) {
                            void this.plugin.app.workspace.openLinkText(child.filePath, '', true);
                        }
                    };
                }
            }

            if (location.childLocationIds.length > 5) {
                childList.createEl('li', {
                    text: `... and ${location.childLocationIds.length - 5} more`,
                    cls: 'popup-more'
                });
            }
        }

        // Entities at this location
        if (effectiveRefs.length > 0) {
            const entitySection = container.createDiv('popup-section');
            entitySection.createEl('h4', { text: 'Here' });
            const entityList = entitySection.createEl('ul', { cls: 'popup-entity-list' });

            // Group by type
            const grouped = this.groupEntitiesByType(effectiveRefs);

            for (const [type, entities] of Object.entries(grouped)) {
                for (const ref of entities.slice(0, 3)) {
                    try {
                        let entity: Character | Event | PlotItem | null = null;
                        switch (type) {
                            case 'character': {
                                const chars = await this.plugin.listCharacters();
                                entity = chars.find(c => (c.id || c.name) === ref.entityId) || null;
                                break;
                            }
                            case 'event': {
                                const events = await this.plugin.listEvents();
                                entity = events.find(e => (e.id || e.name) === ref.entityId) || null;
                                break;
                            }
                            case 'item': {
                                const items = await this.plugin.listPlotItems();
                                entity = items.find(i => (i.id || i.name) === ref.entityId) || null;
                                break;
                            }
                        }

                        if (entity) {
                            const li = entityList.createEl('li');
                            const icon = li.createSpan({ cls: 'entity-icon' });
                            setIcon(icon, this.getEntityIconName(type));
                            li.appendText(` ${entity.name}`);
                            if (ref.relationship) {
                                li.appendText(' ');
                                li.createSpan({ cls: 'entity-rel', text: `(${ref.relationship})` });
                            }
                            li.onclick = () => {
                                if (entity?.filePath) {
                                    void this.plugin.app.workspace.openLinkText(entity.filePath, '', true);
                                }
                            };
                        }
                    } catch {
                    	// intentional
                        
                    }
                }
            }
        }

        // Action buttons
        const actions = container.createDiv('popup-actions');
        const openButton = actions.createEl('button', { cls: 'popup-btn', text: 'Open note' });
        const addEntityButton = actions.createEl('button', { cls: 'popup-btn', text: 'Add entity' });
        const editButton = actions.createEl('button', { cls: 'popup-btn', text: 'Edit location' });

        // Button handlers
        openButton.addEventListener('click', () => {
            if (location.filePath) {
                void this.plugin.app.workspace.openLinkText(location.filePath, '', true);
            }
        });

        addEntityButton.addEventListener('click', (event) => {
            this.showAddEntityTypeMenu(location, event.currentTarget as HTMLElement);
        });

        editButton.addEventListener('click', () => {
            void this.showEditLocationModal(location);
        });

        return container;
    }

    /**
     * Build entity popup
     */
    private buildEntityPopup(
        entity: Character | Event | PlotItem | Scene | Culture | Economy | MagicSystem | Reference,
        entityRef: EntityRef,
        location: Location | null
    ): HTMLElement {
        const container = createDiv();
        container.className = 'storyteller-entity-popup';

        // Build enhanced popup based on entity type
        if (entityRef.entityType === 'character') {
            return this.buildCharacterPopup(entity, location, entityRef);
        } else if (entityRef.entityType === 'event') {
            return this.buildEventPopup(entity, location, entityRef);
        } else {
            return this.buildDefaultEntityPopup(entity, entityRef, location);
        }
    }

    /**
     * Build enhanced character popup with image and details
     */
    private buildCharacterPopup(
        character: Character,
        location: Location | null,
        entityRef: EntityRef
    ): HTMLElement {
        const container = createDiv();
        container.className = 'storyteller-entity-popup storyteller-character-popup';

        // Header with image and name
        const header = container.createDiv('popup-header');

        // Character image if available
        if (character.profileImagePath) {
            const imageUrl = this.getImageUrl(character.profileImagePath);
            if (imageUrl) {
                const imgContainer = header.createDiv('popup-image-container');
                const img = imgContainer.createEl('img', {
                    attr: { src: imageUrl, alt: character.name }
                });
                img.setCssStyles({ width: '60px' });
                img.setCssStyles({ height: '60px' });
                img.setCssStyles({ borderRadius: '50%' });
                img.setCssStyles({ objectFit: 'cover' });
                img.setCssStyles({ border: '2px solid var(--interactive-accent)' });
            }
        }

        const nameContainer = header.createDiv('popup-name-container');
        nameContainer.createEl('h3', { text: character.name, cls: 'popup-title' });
        nameContainer.createEl('span', { text: 'Character', cls: 'popup-type' });

        // Location info
        if (location) {
            const locationSection = container.createDiv('popup-section');
            const field = locationSection.createDiv({ cls: 'popup-field' });
            field.createSpan({ cls: 'popup-field-label', text: 'Location:' });
            field.createSpan({ cls: 'popup-field-value', text: location.name });
        }

        // Character details
        if (character.description || character.traits || character.status) {
            const detailsSection = container.createDiv('popup-section');

            if (character.description) {
                const desc = this.truncateText(character.description, 100);
                detailsSection.createDiv('popup-description').setText(desc);
            }

            if (character.status) {
                const field = detailsSection.createDiv({ cls: 'popup-field' });
                field.createSpan({ cls: 'popup-field-label', text: 'Status:' });
                field.createSpan({ cls: 'popup-field-value', text: character.status });
            }

            if (character.traits && character.traits.length > 0) {
                const traitsDiv = detailsSection.createDiv('popup-traits');
                traitsDiv.createEl('span', { text: 'Traits: ', cls: 'popup-field-label' });
                const traitsText = character.traits.slice(0, 3).join(', ');
                traitsDiv.createEl('span', { text: traitsText, cls: 'popup-field-value' });
            }
        }

        // Action buttons
        const actions = container.createDiv('popup-actions');
        const openButton = actions.createEl('button', { cls: 'popup-btn popup-btn-primary', text: 'Open character' });

        openButton.addEventListener('click', () => {
            if (character.filePath) {
                void this.plugin.app.workspace.openLinkText(character.filePath, '', true);
            }
        });

        return container;
    }

    /**
     * Build event popup
     */
    private buildEventPopup(
        event: Event,
        location: Location | null,
        entityRef: EntityRef
    ): HTMLElement {
        const container = createDiv();
        container.className = 'storyteller-entity-popup storyteller-event-popup';

        const header = container.createDiv({ cls: 'popup-header' });
        header.createEl('h3', { cls: 'popup-title', text: event.name });
        header.createSpan({ cls: 'popup-type', text: 'Event' });

        const section = container.createDiv({ cls: 'popup-section' });
        if (location) {
            const paragraph = section.createEl('p');
            paragraph.appendText('At: ');
            paragraph.createEl('strong', { text: location.name });
        }
        if (event.dateTime) {
            const paragraph = section.createEl('p');
            paragraph.appendText('Date: ');
            paragraph.createEl('strong', { text: event.dateTime });
        }
        if (event.description) {
            section.createEl('p', { cls: 'popup-description', text: this.truncateText(event.description, 100) });
        }

        const actions = container.createDiv('popup-actions');
        const openButton = actions.createEl('button', { cls: 'popup-btn', text: 'Open event' });

        openButton.addEventListener('click', () => {
            if (event.filePath) {
                void this.plugin.app.workspace.openLinkText(event.filePath, '', true);
            }
        });

        return container;
    }

    /**
     * Build default entity popup for other types
     */
    private buildDefaultEntityPopup(
        entity: Character | Event | PlotItem | Scene | Culture | Economy | MagicSystem | Reference,
        entityRef: EntityRef,
        location: Location | null
    ): HTMLElement {
        const container = createDiv();
        container.className = 'storyteller-entity-popup';

        const header = container.createDiv({ cls: 'popup-header' });
        header.createEl('h3', { cls: 'popup-title', text: entity.name });
        header.createSpan({ cls: 'popup-type', text: entityRef.entityType });

        const section = container.createDiv({ cls: 'popup-section' });
        if (location) {
            const paragraph = section.createEl('p');
            paragraph.appendText('At: ');
            paragraph.createEl('strong', { text: location.name });
        }
        if (entityRef.relationship) {
            const paragraph = section.createEl('p');
            paragraph.appendText('Relationship: ');
            paragraph.createEl('em', { text: entityRef.relationship });
        }

        const actions = container.createDiv('popup-actions');
        const openButton = actions.createEl('button', { cls: 'popup-btn', text: 'Open note' });

        openButton.addEventListener('click', () => {
            if (entity.filePath) {
                void this.plugin.app.workspace.openLinkText(entity.filePath, '', true);
            }
        });

        return container;
    }

    /**
     * Get image URL from vault path
     */
    private getImageUrl(imagePath: string): string | null {
        if (!imagePath) return null;

        // Handle external URLs
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            return imagePath;
        }

        // Handle vault paths
        const file = this.plugin.app.vault.getAbstractFileByPath(imagePath);
        if (file instanceof TFile) {
            return this.plugin.app.vault.getResourcePath(file);
        }

        // Try to find file by name
        const files = this.plugin.app.vault.getFiles();
        const imageFile = files.find(f => f.path.endsWith(imagePath) || f.name === imagePath);
        if (imageFile) {
            return this.plugin.app.vault.getResourcePath(imageFile);
        }

        return null;
    }

    /**
     * Truncate text to specified length
     */
    private truncateText(text: string, maxLength: number): string {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    /**
     * Build tooltip for entity marker (shows on hover)
     */
    private buildEntityTooltip(
        entity: Character | Event | PlotItem | Scene | Culture | Economy | MagicSystem | Reference,
        entityRef: EntityRef
    ): string {
        if (entityRef.entityType === 'character') {
            const character = entity as Character;
            let tooltip = `<strong>${character.name}</strong>`;

            if (character.status) {
                tooltip += `<br><em>${character.status}</em>`;
            } else if (character.description) {
                const desc = this.truncateText(character.description, 50);
                tooltip += `<br><em>${desc}</em>`;
            } else if (character.traits && character.traits.length > 0) {
                tooltip += `<br><em>${character.traits[0]}</em>`;
            }

            return tooltip;
        } else if (entityRef.entityType === 'event') {
            const event = entity as Event;
            let tooltip = `<strong>${event.name}</strong>`;

            if (event.dateTime) {
                tooltip += `<br>${event.dateTime}`;
            }

            return tooltip;
        } else {
            return `<strong>${entity.name}</strong><br><em>${entityRef.entityType}</em>`;
        }
    }

    /**
     * Group entities by type
     */
    private groupEntitiesByType(entityRefs: EntityRef[]): Record<string, EntityRef[]> {
        const grouped: Record<string, EntityRef[]> = {};

        for (const ref of entityRefs) {
            if (!grouped[ref.entityType]) {
                grouped[ref.entityType] = [];
            }
            grouped[ref.entityType].push(ref);
        }

        return grouped;
    }

    /**
     * Get entity icon name by type (for popups and lists)
     */
    private getEntityIconName(type: string): string {
        const icons: Record<string, string> = {
            character: 'user',
            event: 'calendar',
            item: 'box',
            culture: 'landmark',
            economy: 'coins',
            magicsystem: 'wand',
            group: 'users',
            scene: 'film',
            reference: 'book-open',
            custom: 'map-pin',
        };
        return icons[type] ?? 'map-pin';
    }

    /**
     * Show context menu for location marker
     */
    private showLocationContextMenu(e: L.LeafletMouseEvent, location: Location): void {
        const menu = new Menu();

        menu.addItem(item => {
            item.setTitle('Open location note')
                .setIcon('file-text')
                .onClick(() => {
                    if (location.filePath) {
                        void this.plugin.app.workspace.openLinkText(location.filePath, '', true);
                    }
                });
        });

        menu.addSeparator();

        this.addLocationAddEntityMenuItems(menu, location);

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle('Create child location')
                .setIcon('map-pin')
                .onClick(() => {
                    new Notice('Create child location functionality coming soon');
                });
        });

        if (location.childLocationIds && location.childLocationIds.length > 0) {
            menu.addItem(item => {
                item.setTitle('Zoom to child map')
                    .setIcon('zoom-in')
                    .onClick(() => {
                        new Notice('Zoom to child map functionality coming soon');
                    });
            });
        }

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle('Edit marker position')
                .setIcon('move')
                .onClick(() => {
                    this.startMoveLocationMarker(location);
                });
        });

        menu.showAtMouseEvent(e.originalEvent);
    }

    private addLocationAddEntityMenuItems(menu: Menu, location: Location): void {
        const entityOptions: Array<{ title: string; icon: string; type: string }> = [
            { title: 'Add Character Here', icon: 'user', type: 'character' },
            { title: 'Add Event Here', icon: 'calendar', type: 'event' },
            { title: 'Add Item Here', icon: 'box', type: 'item' },
            { title: 'Add Culture Here', icon: 'theater', type: 'culture' },
            { title: 'Add Economy Here', icon: 'dollar-sign', type: 'economy' },
            { title: 'Add Magic System Here', icon: 'sparkles', type: 'magicsystem' },
            { title: 'Add Group Here', icon: 'users', type: 'group' },
            { title: 'Add Scene Here', icon: 'clapperboard', type: 'scene' },
            { title: 'Add Reference Here', icon: 'book-open', type: 'reference' },
        ];

        for (const option of entityOptions) {
            menu.addItem(item => {
                item.setTitle(option.title)
                    .setIcon(option.icon)
                    .onClick(() => {
                        this.showAddEntityToLocation(location, option.type);
                    });
            });
        }
    }

    private showAddEntityTypeMenu(location: Location, buttonEl: HTMLElement): void {
        const menu = new Menu();
        this.addLocationAddEntityMenuItems(menu, location);
        const rect = buttonEl.getBoundingClientRect();
        menu.showAtMouseEvent(new MouseEvent('click', {
            clientX: rect.left,
            clientY: rect.bottom,
        }));
    }

    /**
     * Begin interactive move for a location's marker.
     * User is prompted to click a new position on the map; ESC cancels.
     */
    private startMoveLocationMarker(location: Location): void {
        if (this.isMovingMarker) {
            new Notice('Finish moving the current marker first.');
            return;
        }

        const mapId = this.mapId;
        if (!mapId) {
            new Notice('Map ID not available for this marker.');
            return;
        }

        const binding = location.mapBindings?.find(b => b.mapId === mapId);
        const originalCoords = binding?.coordinates;

        this.isMovingMarker = true;
        new Notice('Click on the map to set the new marker position (esc to cancel).');

        const onKeyDown = (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                this.map.off('click', onClick);
                activeDocument.removeEventListener('keydown', onKeyDown);
                this.isMovingMarker = false;
                new Notice('Marker move cancelled');
            }
        };

        const onClick = (e: L.LeafletMouseEvent) => { void (async () => {
            this.map.off('click', onClick);
            activeDocument.removeEventListener('keydown', onKeyDown);

            const newCoords: [number, number] = [e.latlng.lat, e.latlng.lng];

            try {
                // Persist new coordinates on the location binding
                await this.locationService.addMapBinding(
                    location.id || location.name,
                    mapId,
                    newCoords
                );

                // Move the existing marker immediately if we have it
                const markerKey = location.id || location.name;
                const marker = this.locationMarkers.get(markerKey);
                if (marker) {
                    marker.setLatLng(newCoords);
                }

                // Refresh locations and entities so stacked markers update correctly
                await this.renderLocationsForMap(mapId);
                await this.renderEntitiesForMap(mapId);

                new Notice('Marker position updated.');
            } catch {
                
                new Notice('Error updating marker position. See console for details.');

                // Best-effort revert marker position if we changed it
                if (originalCoords) {
                    const markerKey = location.id || location.name;
                    const marker = this.locationMarkers.get(markerKey);
                    if (marker) {
                        marker.setLatLng(originalCoords);
                    }
                }
            } finally {
                this.isMovingMarker = false;
            }
        })(); };

        // Use once-style behaviour but keep explicit off() calls for safety
        this.map.on('click', onClick);
        activeDocument.addEventListener('keydown', onKeyDown);
    }

    /**
     * Show context menu for entity marker
     */
    private showEntityContextMenu(
        e: L.LeafletMouseEvent,
        entity: Character | Event | PlotItem | Scene | Culture | Economy | MagicSystem | Reference,
        entityRef: EntityRef,
        location: Location | null
    ): void {
        const menu = new Menu();
        const entityId = entity.id || entity.name;
        const locationId = location?.id || location?.name;
        const entityTypeName = entityRef.entityType.charAt(0).toUpperCase() + entityRef.entityType.slice(1);

        // All entity types are now supported for removal uniformly
        const supportedTypes = ['character', 'event', 'item', 'culture', 'economy', 'magicsystem', 'group', 'scene', 'reference'];
        const isSupportedType = supportedTypes.includes(entityRef.entityType);

        menu.addItem(item => {
            item.setTitle(`Open ${entityTypeName} Note`)
                .setIcon('file-text')
                .onClick(() => {
                    if (entity.filePath) {
                        void this.plugin.app.workspace.openLinkText(entity.filePath, '', true);
                    }
                });
        });

        if (location) {
            menu.addItem(item => {
                item.setTitle('View location')
                    .setIcon('map-pin')
                    .onClick(() => {
                        if (location.filePath) {
                            void this.plugin.app.workspace.openLinkText(location.filePath, '', true);
                        }
                    });
            });
        }

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle(`Edit ${entityTypeName}`)
                .setIcon('edit')
                .onClick(async () => {
                    // Open the appropriate modal based on entity type
                    switch (entityRef.entityType) {
                        case 'character': {
                            const { CharacterModal } = await import('../modals/CharacterModal');
                            new CharacterModal(this.plugin.app, this.plugin, entity, async (updated) => {
                                await this.plugin.saveCharacter(updated);
                                new Notice(`${updated.name} updated`);
                            }).open();
                            break;
                        }
                        case 'event': {
                            const { EventModal } = await import('../modals/EventModal');
                            new EventModal(this.plugin.app, this.plugin, entity, async (updated) => {
                                await this.plugin.saveEvent(updated);
                                new Notice(`${updated.name} updated`);
                            }).open();
                            break;
                        }
                        case 'item': {
                            const { PlotItemModal } = await import('../modals/PlotItemModal');
                            new PlotItemModal(this.plugin.app, this.plugin, entity as PlotItem, async (updated) => {
                                await this.plugin.savePlotItem(updated);
                                new Notice(`${updated.name} updated`);
                            }).open();
                            break;
                        }
                    }
                });
        });

        menu.addSeparator();

        // Only show remove option for supported entity types
        if (isSupportedType) {
            menu.addItem(item => {
                item.setTitle('Remove from map')
                    .setIcon('trash-2')
                    .onClick(async () => {
                        // Confirmation
                        const locationName = location?.name || 'this map';
                        const confirmed = await confirmWithModal(this.plugin.app, {
                            title: 'Remove from map',
                            body:
                                `Remove "${entity.name}" from "${locationName}"?` + '\n\n' +
                                `This will remove the marker from this map and clear the ${entityRef.entityType}'s location reference.` + '\n\n' +
                                `The ${entityRef.entityType} itself will not be deleted.`,
                            confirmText: 'Remove'
                        });

                        if (confirmed) {
                            try {
                                // If entity is at a location, use removeEntityFromMap
                                if (location && locationId) {
                                    // Only character, event, and item are supported by removeEntityFromMap
                                    if (['character', 'event', 'item'].includes(entityRef.entityType)) {
                                        await this.plugin.removeEntityFromMap(
                                            entityId,
                                            entityRef.entityType as 'character' | 'event' | 'item',
                                            locationId
                                        );
                                    } else {
                                        // For other entity types, remove from location's entityRefs manually
                                        const locationService = new LocationService(this.plugin);
                                        const loc = await locationService.getLocation(locationId);
                                        if (loc && loc.entityRefs) {
                                            loc.entityRefs = loc.entityRefs.filter(
                                                ref => !(ref.entityId === entityId && ref.entityType === entityRef.entityType)
                                            );
                                            await this.plugin.saveLocation(loc);
                                        }
                                    }
                                } else {
                                    // Entity is placed directly on map (no location)
                                    // Clear mapCoordinates and mapId from frontmatter
                                    if (entity.filePath) {
                                        const file = this.plugin.app.vault.getAbstractFileByPath(entity.filePath);
                                        if (file instanceof TFile) {
                                            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                                const frontmatterRecord = frontmatter as unknown as Record<string, unknown>;
                                                delete frontmatterRecord.mapCoordinates;
                                                // Only clear mapId if it matches current map
                                                // relatedMapIds will be handled separately if needed
                                                const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                                                const currentMapId = getMapViewMapId(mapView?.view);
                                                if (frontmatterRecord.mapId === currentMapId) {
                                                    delete frontmatterRecord.mapId;
                                                }
                                            });
                                        }
                                    }
                                }

                                // Refresh the map to remove the marker
                                const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                                if (hasRefreshEntities(mapView?.view)) {
                                    await mapView.view.refreshEntities();
                                }
                            } catch (error) {
                                
                                new Notice(`Error: ${error}`);
                            }
                        }
                    });
            });
        }

        menu.showAtMouseEvent(e.originalEvent);
    }

    /**
     * Show modal to add entity to location
     * Uniform helper for all entity types
     */
    private showAddEntityToLocation(location: Location, entityType: string): void {
        void this.openAddEntityToLocation(location, entityType);
    }

    private async openAddEntityToLocation(location: Location, entityType: string): Promise<void> {
        const { AddEntityToLocationModal } = await import('../modals/AddEntityToLocationModal');

        const modal = new AddEntityToLocationModal(
            this.plugin.app,
            this.plugin,
            location,
            entityType,
            (entityId: string, relationship: string) => { void (async () => {
                try {
                    const locationService = new LocationService(this.plugin);
                    await locationService.addEntityToLocation(location.id || location.name, {
                        entityId,
                        entityType: entityType as EntityRef['entityType'],
                        relationship,
                    });
                    new Notice(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} added to ${location.name}`);
                    await this.refreshOpenMapView();
                } catch (error) {
                    
                    const message = error instanceof Error ? error.message : String(error);
                    new Notice(`Failed to add ${entityType}: ${message}`);
                }
            })(); }
        );
        modal.open();
    }

    private async showEditLocationModal(location: Location): Promise<void> {
        const { LocationModal } = await import('../modals/LocationModal');
        new LocationModal(this.plugin.app, this.plugin, location, async (updatedData: Location) => {
            await this.plugin.saveLocation(updatedData);
            new Notice(`Location "${updatedData.name}" updated.`);
            await this.refreshOpenMapView();
        }).open();
    }

    private async refreshOpenMapView(): Promise<void> {
        const mapLeaf = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
        const view = mapLeaf?.view;
        if (hasRefresh(view)) {
            await view.refresh();
        }
    }

    /**
     * Clean up all markers and layers
     */
    cleanup(): void {
        for (const layer of this.markerLayers.values()) {
            layer.clearLayers();
            this.map.removeLayer(layer);
        }
        this.markerLayers.clear();
        this.locationMarkers.clear();
        this.entityMarkers.clear();
    }
}


