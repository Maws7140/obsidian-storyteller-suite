/**
 * MapEntityRenderer - Renders locations and entities on Leaflet maps
 * Handles location markers, entity markers, popups, and context menus
 */

import * as L from 'leaflet';
import { Menu, Notice, TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { Location, MapBinding, EntityRef, Character, Event, PlotItem, StoryMap, Scene, Culture, Economy, MagicSystem, Reference } from '../types';
import { LocationService } from '../services/LocationService';
import { MapHierarchyManager } from '../utils/MapHierarchyManager';

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
            this.updateMarkerVisibility(mapId);
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

        for (const portalInfo of portalTargets) {
            const { map: childMap, location, locationName } = portalInfo;

            // Only show portal if location has map binding on current map
            if (!location) continue;

            const binding = location.mapBindings?.find(b => b.mapId === mapId);
            if (!binding) continue;

            const marker = this.createPortalMarker(childMap, location, binding);
            portalsLayer.addLayer(marker);
            this.portalMarkers.set(childMap.id || childMap.name, marker);
        }
    }

    /**
     * Create a portal marker for navigating to a child map
     */
    private createPortalMarker(
        childMap: StoryMap,
        location: Location,
        binding: MapBinding
    ): L.Marker {
        const marker = L.marker(binding.coordinates, {
            icon: this.getPortalMarkerIcon(),
            title: `Portal to ${childMap.name}`,
            zIndexOffset: 1000 // Render on top of other markers
        });

        // Build popup
        const popupContent = this.buildPortalPopup(childMap, location);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'storyteller-map-popup storyteller-portal-popup'
        });

        // Click handler - navigate to child map
        marker.on('click', async (e) => {
            // Don't navigate if user is holding modifier key
            if (!e.originalEvent.ctrlKey && !e.originalEvent.metaKey) {
                // Open child map in MapView
                const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                if (mapView && mapView.view && 'loadMap' in mapView.view) {
                    const mapId = childMap.id || childMap.name;
                    await (mapView.view as any).loadMap(mapId);
                    new Notice(`Navigated to ${childMap.name}`);
                }
            }
        });

        // Context menu
        marker.on('contextmenu', (e) => {
            const menu = new Menu();

            menu.addItem((item) =>
                item
                    .setTitle(`Open ${childMap.name}`)
                    .setIcon('map')
                    .onClick(async () => {
                        const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                        if (mapView && mapView.view && 'loadMap' in mapView.view) {
                            const mapId = childMap.id || childMap.name;
                            await (mapView.view as any).loadMap(mapId);
                        }
                    })
            );

            menu.addItem((item) =>
                item
                    .setTitle('View Location')
                    .setIcon('map-pin')
                    .onClick(() => {
                        if (location.filePath) {
                            this.plugin.app.workspace.openLinkText(location.filePath, '', true);
                        }
                    })
            );

            menu.addSeparator();

            menu.addItem((item) =>
                item
                    .setTitle('Edit Map')
                    .setIcon('edit')
                    .onClick(() => {
                        const { openMapModal } = require('../utils/MapModalHelper');
                        openMapModal(this.plugin.app, this.plugin, childMap);
                    })
            );

            menu.showAtMouseEvent(e.originalEvent as MouseEvent);
        });

        return marker;
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
                <text x="20" y="26" font-size="16" text-anchor="middle" fill="white">🗺️</text>
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
        const container = document.createElement('div');
        container.className = 'storyteller-portal-popup';

        container.innerHTML = `
            <div class="popup-header portal-header">
                <span class="popup-icon">🗺️</span>
                <h3 class="popup-title">${childMap.name}</h3>
                <span class="popup-badge">Child Map</span>
            </div>
            <div class="popup-content">
                <p class="popup-description">${childMap.description || 'No description'}</p>
                <div class="popup-info">
                    <span class="info-label">Scale:</span>
                    <span class="info-value">${childMap.scale || 'custom'}</span>
                </div>
                <div class="popup-info">
                    <span class="info-label">Type:</span>
                    <span class="info-value">${childMap.type || 'image'}</span>
                </div>
            </div>
            <div class="popup-actions">
                <button class="popup-btn popup-btn-primary">
                    <span class="btn-icon">↓</span> Zoom to Map
                </button>
            </div>
        `;

        // Add click handler to button
        const button = container.querySelector('.popup-btn-primary');
        if (button) {
            button.addEventListener('click', async () => {
                const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                if (mapView && mapView.view && 'loadMap' in mapView.view) {
                    const mapId = childMap.id || childMap.name;
                    await (mapView.view as any).loadMap(mapId);
                    new Notice(`Navigated to ${childMap.name}`);
                }
            });
        }

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
            if (!binding || !location.entityRefs) continue;

            const coordKey = `${binding.coordinates[0].toFixed(4)},${binding.coordinates[1].toFixed(4)}`;
            
            for (const entityRef of location.entityRefs) {
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
        for (const [coordKey, entities] of entityGroups) {
            const totalAtLocation = entities.length;
            
            for (let i = 0; i < entities.length; i++) {
                const { entityRef, coordinates, location } = entities[i];
                const offset = this.calculateStackOffset(i, totalAtLocation);
                
                const marker = await this.createEntityMarker(
                    entityRef, 
                    coordinates, 
                    location,
                    totalAtLocation > 1 ? { stackIndex: i, stackTotal: totalAtLocation, offset } : undefined
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
            const fm = cache?.frontmatter as any;

            // Check if this entity is linked to this map
            const isLinkedToMap = fm?.mapId === mapId || 
                (Array.isArray(fm?.relatedMapIds) && fm.relatedMapIds.includes(mapId));

            if (!isLinkedToMap) continue;

            // Get coordinates from frontmatter
            let coords: [number, number] | undefined;
            if (fm?.mapCoordinates && Array.isArray(fm.mapCoordinates) && fm.mapCoordinates.length >= 2) {
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
        const marker = L.marker(binding.coordinates, {
            icon: this.getLocationMarkerIcon(location, binding),
            title: location.name
        });

        // Build popup with location info and entities
        const popupContent = await this.buildLocationPopup(location);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'storyteller-map-popup'
        });

        // Click handler - open location note or map
        marker.on('click', async (e) => {
            // Close popup first
            marker.closePopup();
            
            // Check if setting is enabled and location has a corresponding map
            if (this.plugin.settings.locationPinsOpenMap && location.correspondingMapId) {
                try {
                    const map = await this.plugin.getMap(location.correspondingMapId);
                    if (map) {
                        // Open map view
                        await this.plugin.activateMapView(location.correspondingMapId);
                        return;
                    }
                } catch (error) {
                    console.error('Error opening map for location:', error);
                    // Fall through to opening note if map doesn't exist or error occurs
                }
            }
            
            // Fall back to opening location note (default behavior)
            if (location.filePath) {
                // Open note in new tab if Ctrl/Cmd is held, otherwise same tab
                const newLeaf = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
                this.plugin.app.workspace.openLinkText(location.filePath, '', newLeaf);
            }
        });

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
                        } as any;
                    }
                    break;
                }
                default:
                    return null;
            }
        } catch (error) {
            console.error(`Error loading entity ${entityRef.entityId}:`, error);
            return null;
        }

        if (!entity) return null;

        // Get entity image URL if available
        const imagePath = this.getEntityImagePath(entity, entityRef.entityType);
        const imageUrl = imagePath ? this.getImageUrl(imagePath) : null;

        const icon = this.getEntityMarkerIcon(entityRef.entityType, imageUrl, entity.name, stackInfo);
        const marker = L.marker(coordinates, {
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

        // Click handler - open entity note
        marker.on('click', (e) => {
            // Open the entity note on click
            if (entity?.filePath) {
                // Close popup first
                marker.closePopup();
                // Open note in new tab if Ctrl/Cmd is held, otherwise same tab
                const newLeaf = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
                this.plugin.app.workspace.openLinkText(entity.filePath, '', newLeaf);
            }
        });

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
    private getLocationMarkerIcon(location: Location, binding: MapBinding): L.Icon | L.DivIcon {
        // Count entities at this location
        const entityCount = location.entityRefs?.length || 0;
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
        
        // Calculate transform for stacked markers
        const transform = stackInfo && stackInfo.stackTotal > 1
            ? `transform: translate(${stackInfo.offset[0]}px, ${stackInfo.offset[1]}px);`
            : '';
        
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
                    ${transform}
                    position: relative;
                ">
                    <img src="${imageUrl}" alt="" style="
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    " onerror="this.style.display='none'; this.parentElement.innerHTML='${this.getInitials(entityName)}'"/>
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
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <circle cx="12" cy="9" r="3.5" fill="#fff"/>
                    <path d="M12 14c-3.5 0-6 1.5-6 3.5v1h12v-1c0-2-2.5-3.5-6-3.5z" fill="#fff"/>
                </svg>
                ${stackBadge}
            `,
            event: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <path d="M8 7v10M12 5v14M16 8v8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                </svg>
                ${stackBadge}
            `,
            item: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <rect x="8" y="6" width="8" height="12" rx="1" fill="none" stroke="#fff" stroke-width="2"/>
                    <path d="M10 9h4M10 12h4M10 15h2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                ${stackBadge}
            `,
            culture: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <path d="M8 12h8M10 8l2 4 2-4M10 16l2-4 2 4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                ${stackBadge}
            `,
            economy: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="2"/>
                    <path d="M12 7v10M8 12h8" stroke="#fff" stroke-width="1.5"/>
                </svg>
                ${stackBadge}
            `,
            magicsystem: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <path d="M12 5l1.5 4.5h4.5l-3.5 2.5 1.5 4.5-3-2-3 2 1.5-4.5-3.5-2.5h4.5z" fill="#fff"/>
                </svg>
                ${stackBadge}
            `,
            group: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <circle cx="8" cy="10" r="2" fill="#fff"/>
                    <circle cx="16" cy="10" r="2" fill="#fff"/>
                    <circle cx="12" cy="13" r="2" fill="#fff"/>
                    <path d="M8 15c0-1 1-2 2-2h4c1 0 2 1 2 2v2H8z" fill="#fff"/>
                </svg>
                ${stackBadge}
            `,
            scene: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
                    <circle cx="12" cy="12" r="11" fill="${color.bg}" stroke="#fff" stroke-width="2"/>
                    <path d="M7 10l5-3 5 3v7H7z" fill="#fff"/>
                    <rect x="10" y="13" width="4" height="4" fill="${color.bg}"/>
                </svg>
                ${stackBadge}
            `,
            reference: `
                <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${transform}">
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
            case 'event':
                // Events use images array - return first image
                const eventImages = (entity as Event).images;
                return eventImages && eventImages.length > 0 ? eventImages[0] : null;
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
        const container = document.createElement('div');
        container.className = 'storyteller-location-popup';

        // Location header with hierarchy
        const path = await this.locationService.getLocationPath(location.id || location.name);
        const pathText = path.map(l => l.name).join(' › ');

        container.innerHTML = `
            <div class="popup-header">
                <span class="popup-path">${pathText}</span>
                <h3 class="popup-title">${location.name}</h3>
                <span class="popup-type">${location.type || location.locationType || 'location'}</span>
            </div>
        `;

        // Child locations (if any)
        if (location.childLocationIds && location.childLocationIds.length > 0) {
            const childSection = container.createDiv('popup-section');
            childSection.innerHTML = `<h4>Contains</h4>`;
            const childList = childSection.createEl('ul', { cls: 'popup-entity-list' });

            for (const childId of location.childLocationIds.slice(0, 5)) {
                const child = await this.locationService.getLocation(childId);
                if (child) {
                    const li = childList.createEl('li');
                    li.innerHTML = `<span class="entity-icon">📍</span> ${child.name}`;
                    li.onclick = () => {
                        if (child.filePath) {
                            this.plugin.app.workspace.openLinkText(child.filePath, '', true);
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
        if (location.entityRefs && location.entityRefs.length > 0) {
            const entitySection = container.createDiv('popup-section');
            entitySection.innerHTML = `<h4>Here</h4>`;
            const entityList = entitySection.createEl('ul', { cls: 'popup-entity-list' });

            // Group by type
            const grouped = this.groupEntitiesByType(location.entityRefs);

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
                            const icon = this.getEntityIcon(type);
                            li.innerHTML = `<span class="entity-icon">${icon}</span> ${entity.name}`;
                            if (ref.relationship) {
                                li.innerHTML += ` <span class="entity-rel">(${ref.relationship})</span>`;
                            }
                            li.onclick = () => {
                                if (entity?.filePath) {
                                    this.plugin.app.workspace.openLinkText(entity.filePath, '', true);
                                }
                            };
                        }
                    } catch (error) {
                        console.error(`Error loading entity ${ref.entityId}:`, error);
                    }
                }
            }
        }

        // Action buttons
        const actions = container.createDiv('popup-actions');
        actions.innerHTML = `
            <button class="popup-btn" data-action="open">Open Note</button>
            <button class="popup-btn" data-action="add-entity">Add Entity</button>
            <button class="popup-btn" data-action="edit">Edit Location</button>
        `;

        // Button handlers
        actions.querySelector('[data-action="open"]')?.addEventListener('click', () => {
            if (location.filePath) {
                this.plugin.app.workspace.openLinkText(location.filePath, '', true);
            }
        });

        actions.querySelector('[data-action="add-entity"]')?.addEventListener('click', () => {
            // Will be implemented with modal
            new Notice('Add entity functionality coming soon');
        });

        actions.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
            // Will be implemented with modal
            new Notice('Edit location functionality coming soon');
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
        const container = document.createElement('div');
        container.className = 'storyteller-entity-popup';

        // Build enhanced popup based on entity type
        if (entityRef.entityType === 'character') {
            return this.buildCharacterPopup(entity as Character, location, entityRef);
        } else if (entityRef.entityType === 'event') {
            return this.buildEventPopup(entity as Event, location, entityRef);
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
        const container = document.createElement('div');
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
                img.style.width = '60px';
                img.style.height = '60px';
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';
                img.style.border = '2px solid var(--interactive-accent)';
            }
        }

        const nameContainer = header.createDiv('popup-name-container');
        nameContainer.createEl('h3', { text: character.name, cls: 'popup-title' });
        nameContainer.createEl('span', { text: 'Character', cls: 'popup-type' });

        // Location info
        if (location) {
            const locationSection = container.createDiv('popup-section');
            locationSection.innerHTML = `
                <div class="popup-field">
                    <span class="popup-field-label">📍 Location:</span>
                    <span class="popup-field-value">${location.name}</span>
                </div>
            `;
        }

        // Character details
        if (character.description || character.traits || character.status) {
            const detailsSection = container.createDiv('popup-section');

            if (character.description) {
                const desc = this.truncateText(character.description, 100);
                detailsSection.createDiv('popup-description').setText(desc);
            }

            if (character.status) {
                detailsSection.innerHTML += `
                    <div class="popup-field">
                        <span class="popup-field-label">Status:</span>
                        <span class="popup-field-value">${character.status}</span>
                    </div>
                `;
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
        actions.innerHTML = `
            <button class="popup-btn popup-btn-primary" data-action="open">Open Character</button>
        `;

        actions.querySelector('[data-action="open"]')?.addEventListener('click', () => {
            if (character.filePath) {
                this.plugin.app.workspace.openLinkText(character.filePath, '', true);
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
        const container = document.createElement('div');
        container.className = 'storyteller-entity-popup storyteller-event-popup';

        container.innerHTML = `
            <div class="popup-header">
                <h3 class="popup-title">${event.name}</h3>
                <span class="popup-type">Event</span>
            </div>
            <div class="popup-section">
                ${location ? `<p>📍 At: <strong>${location.name}</strong></p>` : ''}
                ${event.dateTime ? `<p>📅 Date: <strong>${event.dateTime}</strong></p>` : ''}
                ${event.description ? `<p class="popup-description">${this.truncateText(event.description, 100)}</p>` : ''}
            </div>
        `;

        const actions = container.createDiv('popup-actions');
        actions.innerHTML = `<button class="popup-btn" data-action="open">Open Event</button>`;

        actions.querySelector('[data-action="open"]')?.addEventListener('click', () => {
            if (event.filePath) {
                this.plugin.app.workspace.openLinkText(event.filePath, '', true);
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
        const container = document.createElement('div');
        container.className = 'storyteller-entity-popup';

        container.innerHTML = `
            <div class="popup-header">
                <h3 class="popup-title">${entity.name}</h3>
                <span class="popup-type">${entityRef.entityType}</span>
            </div>
            <div class="popup-section">
                ${location ? `<p>At: <strong>${location.name}</strong></p>` : ''}
                ${entityRef.relationship ? `<p>Relationship: <em>${entityRef.relationship}</em></p>` : ''}
            </div>
        `;

        const actions = container.createDiv('popup-actions');
        actions.innerHTML = `<button class="popup-btn" data-action="open">Open Note</button>`;

        actions.querySelector('[data-action="open"]')?.addEventListener('click', () => {
            if (entity.filePath) {
                this.plugin.app.workspace.openLinkText(entity.filePath, '', true);
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
        if (file) {
            return this.plugin.app.vault.getResourcePath(file as any);
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
                tooltip += `<br>📅 ${event.dateTime}`;
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
     * Get entity icon by type (for popups and lists)
     */
    private getEntityIcon(type: string): string {
        const icons: Record<string, string> = {
            character: '👤',
            event: '📅',
            item: '📦',
            culture: '🎭',
            economy: '💰',
            magicsystem: '✨',
            group: '👥',
            scene: '🎬',
            reference: '📚',
            custom: '📌'
        };
        return icons[type] || '📌';
    }

    /**
     * Show context menu for location marker
     */
    private showLocationContextMenu(e: L.LeafletMouseEvent, location: Location): void {
        const menu = new Menu();

        menu.addItem(item => {
            item.setTitle('Open Location Note')
                .setIcon('file-text')
                .onClick(() => {
                    if (location.filePath) {
                        this.plugin.app.workspace.openLinkText(location.filePath, '', true);
                    }
                });
        });

        menu.addSeparator();

        // Add menu items for all entity types uniformly
        menu.addItem(item => {
            item.setTitle('Add Character Here')
                .setIcon('user')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'character');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Event Here')
                .setIcon('calendar')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'event');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Item Here')
                .setIcon('box')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'item');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Culture Here')
                .setIcon('theater')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'culture');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Economy Here')
                .setIcon('dollar-sign')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'economy');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Magic System Here')
                .setIcon('sparkles')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'magicsystem');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Group Here')
                .setIcon('users')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'group');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Scene Here')
                .setIcon('clapperboard')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'scene');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Reference Here')
                .setIcon('book-open')
                .onClick(() => {
                    this.showAddEntityToLocation(location, 'reference');
                });
        });

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle('Create Child Location')
                .setIcon('map-pin')
                .onClick(() => {
                    new Notice('Create child location functionality coming soon');
                });
        });

        if (location.childLocationIds && location.childLocationIds.length > 0) {
            menu.addItem(item => {
                item.setTitle('Zoom to Child Map')
                    .setIcon('zoom-in')
                    .onClick(() => {
                        new Notice('Zoom to child map functionality coming soon');
                    });
            });
        }

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle('Edit Marker Position')
                .setIcon('move')
                .onClick(() => {
                    this.startMoveLocationMarker(location);
                });
        });

        menu.showAtMouseEvent(e.originalEvent);
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
        const originalCoords = binding?.coordinates as [number, number] | undefined;

        this.isMovingMarker = true;
        new Notice('Click on the map to set the new marker position (ESC to cancel).');

        const onKeyDown = (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                this.map.off('click', onClick as any);
                document.removeEventListener('keydown', onKeyDown);
                this.isMovingMarker = false;
                new Notice('Marker move cancelled');
            }
        };

        const onClick = async (e: L.LeafletMouseEvent) => {
            this.map.off('click', onClick as any);
            document.removeEventListener('keydown', onKeyDown);

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
            } catch (error) {
                console.error('Error moving marker:', error);
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
        };

        // Use once-style behaviour but keep explicit off() calls for safety
        this.map.on('click', onClick as any);
        document.addEventListener('keydown', onKeyDown);
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
                        this.plugin.app.workspace.openLinkText(entity.filePath, '', true);
                    }
                });
        });

        if (location) {
            menu.addItem(item => {
                item.setTitle('View Location')
                    .setIcon('map-pin')
                    .onClick(() => {
                        if (location.filePath) {
                            this.plugin.app.workspace.openLinkText(location.filePath, '', true);
                        }
                    });
            });
        }

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle(`Edit ${entityTypeName}`)
                .setIcon('edit')
                .onClick(() => {
                    // Open the appropriate modal based on entity type
                    switch (entityRef.entityType) {
                        case 'character':
                            const { CharacterModal } = require('../modals/CharacterModal');
                            new CharacterModal(this.plugin.app, this.plugin, entity as Character, async (updated) => {
                                await this.plugin.saveCharacter(updated);
                                new Notice(`${updated.name} updated`);
                            }).open();
                            break;
                        case 'event':
                            const { EventModal } = require('../modals/EventModal');
                            new EventModal(this.plugin.app, this.plugin, entity as Event, async (updated) => {
                                await this.plugin.saveEvent(updated);
                                new Notice(`${updated.name} updated`);
                            }).open();
                            break;
                        case 'item':
                            const { PlotItemModal } = require('../modals/PlotItemModal');
                            new PlotItemModal(this.plugin.app, this.plugin, entity as PlotItem, async (updated) => {
                                await this.plugin.savePlotItem(updated);
                                new Notice(`${updated.name} updated`);
                            }).open();
                            break;
                    }
                });
        });

        menu.addSeparator();

        // Only show remove option for supported entity types
        if (isSupportedType) {
            menu.addItem(item => {
                item.setTitle('Remove from Map')
                    .setIcon('trash-2')
                    .onClick(async () => {
                        // Confirmation
                        const locationName = location?.name || 'this map';
                        const confirmed = confirm(
                            `Remove "${entity.name}" from "${locationName}"?\n\n` +
                            `This will:\n` +
                            `• Remove the marker from this map\n` +
                            `• Clear the ${entityRef.entityType}'s location reference\n\n` +
                            `The ${entityRef.entityType} itself will NOT be deleted.`
                        );

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
                                                delete frontmatter.mapCoordinates;
                                                // Only clear mapId if it matches current map
                                                // relatedMapIds will be handled separately if needed
                                                const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                                                const currentMapId = (mapView?.view as any)?.leafletRenderer?.params?.mapId;
                                                if (frontmatter.mapId === currentMapId) {
                                                    delete frontmatter.mapId;
                                                }
                                            });
                                        }
                                    }
                                }

                                // Refresh the map to remove the marker
                                const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                                if (mapView && mapView.view && 'refreshEntities' in mapView.view) {
                                    await (mapView.view as any).refreshEntities();
                                }
                            } catch (error) {
                                console.error('Error removing entity from map:', error);
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
        const { AddEntityToLocationModal } = require('../modals/AddEntityToLocationModal');
        const { LocationService } = require('../services/LocationService');

        const modal = new AddEntityToLocationModal(
            this.plugin.app,
            this.plugin,
            location,
            entityType,
            async (entityId: string, relationship: string) => {
                try {
                    const locationService = new LocationService(this.plugin);
                    await locationService.addEntityToLocation(location, entityId, entityType, relationship);
                    new Notice(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} added to ${location.name}`);

                    // Refresh map markers
                    const mapView = this.plugin.app.workspace.getLeavesOfType('storyteller-map-view')[0];
                    if (mapView && mapView.view && 'refreshMarkers' in mapView.view) {
                        await (mapView.view as any).refreshMarkers();
                    }
                } catch (error) {
                    console.error('Error adding entity to location:', error);
                    new Notice(`Failed to add ${entityType}: ${error.message}`);
                }
            }
        );
        modal.open();
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


