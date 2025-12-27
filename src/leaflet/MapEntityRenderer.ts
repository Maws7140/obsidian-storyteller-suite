/**
 * MapEntityRenderer - Renders locations and entities on Leaflet maps
 * Handles location markers, entity markers, popups, and context menus
 */

import * as L from 'leaflet';
import { Menu, Notice } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { Location, MapBinding, EntityRef, Character, Event, PlotItem, StoryMap } from '../types';
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

    constructor(map: L.Map, plugin: StorytellerSuitePlugin) {
        this.map = map;
        this.plugin = plugin;
        this.locationService = new LocationService(plugin);
        this.hierarchyManager = new MapHierarchyManager(plugin.app, plugin);

        this.initializeLayers();
    }

    /**
     * Initialize layer groups for different entity types
     */
    private initializeLayers(): void {
        const layerTypes = ['locations', 'portals', 'characters', 'events', 'items', 'custom'];

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
     * Render entities on the map based on their locations
     */
    async renderEntitiesForMap(mapId: string): Promise<void> {
        const locations = await this.plugin.listLocations();
        const charactersLayer = this.markerLayers.get('characters')!;
        const eventsLayer = this.markerLayers.get('events')!;
        const itemsLayer = this.markerLayers.get('items')!;
        
        charactersLayer.clearLayers();
        eventsLayer.clearLayers();
        itemsLayer.clearLayers();
        this.entityMarkers.clear();

        for (const location of locations) {
            const binding = location.mapBindings?.find(b => b.mapId === mapId);
            if (!binding || !location.entityRefs) continue;

            for (const entityRef of location.entityRefs) {
                const marker = await this.createEntityMarker(entityRef, binding.coordinates, location);
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
                        default:
                            this.markerLayers.get('custom')?.addLayer(marker);
                    }
                    this.entityMarkers.set(entityRef.entityId, marker);
                }
            }
        }
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

        // Click handler - open location note
        marker.on('click', (e) => {
            if (location.filePath) {
                // Close popup first
                marker.closePopup();
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
        location: Location
    ): Promise<L.Marker | null> {
        let entity: Character | Event | PlotItem | null = null;

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
                default:
                    return null;
            }
        } catch (error) {
            console.error(`Error loading entity ${entityRef.entityId}:`, error);
            return null;
        }

        if (!entity) return null;

        const icon = this.getEntityMarkerIcon(entityRef.entityType);
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

        // Build tooltip for hover - quick info
        const tooltipContent = this.buildEntityTooltip(entity, entityRef);
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

        return marker;
    }

    /**
     * Get location marker icon
     */
    private getLocationMarkerIcon(location: Location, binding: MapBinding): L.Icon | L.DivIcon {
        if (binding.markerIcon) {
            // Custom icon specified
            return L.divIcon({
                html: binding.markerIcon,
                className: 'storyteller-custom-marker',
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            });
        }

        // Default location icon
        const color = '#3b82f6';
        const iconHtml = `
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="10" r="8" fill="${color}" stroke="#fff" stroke-width="2"/>
                <circle cx="12" cy="10" r="3" fill="#fff"/>
            </svg>
        `;

        return L.divIcon({
            html: iconHtml,
            className: 'storyteller-location-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
    }

    /**
     * Get entity marker icon
     */
    private getEntityMarkerIcon(entityType: string): L.DivIcon {
        const icons: Record<string, string> = {
            character: `
                <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>
                    <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>
                </svg>
            `,
            event: `
                <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                          fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `,
            item: `
                <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="4" width="12" height="16" rx="2" fill="#10b981" stroke="#fff" stroke-width="1.5"/>
                    <path d="M9 8h6M9 12h6M9 16h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            `
        };

        const iconHtml = icons[entityType] || icons.character;
        const color = entityType === 'character' ? '#ef4444' : entityType === 'event' ? '#f59e0b' : '#10b981';

        return L.divIcon({
            html: iconHtml,
            className: `storyteller-entity-marker storyteller-entity-${entityType}`,
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        });
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
        entity: Character | Event | PlotItem,
        entityRef: EntityRef,
        location: Location
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
        location: Location,
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
        const locationSection = container.createDiv('popup-section');
        locationSection.innerHTML = `
            <div class="popup-field">
                <span class="popup-field-label">📍 Location:</span>
                <span class="popup-field-value">${location.name}</span>
            </div>
        `;

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
        location: Location,
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
                <p>📍 At: <strong>${location.name}</strong></p>
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
        entity: Character | Event | PlotItem,
        entityRef: EntityRef,
        location: Location
    ): HTMLElement {
        const container = document.createElement('div');
        container.className = 'storyteller-entity-popup';

        container.innerHTML = `
            <div class="popup-header">
                <h3 class="popup-title">${entity.name}</h3>
                <span class="popup-type">${entityRef.entityType}</span>
            </div>
            <div class="popup-section">
                <p>At: <strong>${location.name}</strong></p>
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
        entity: Character | Event | PlotItem,
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
     * Get entity icon by type
     */
    private getEntityIcon(type: string): string {
        const icons: Record<string, string> = {
            character: '👤',
            event: '📅',
            item: '📦',
            culture: '🏛️',
            organization: '🏢',
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

        menu.addItem(item => {
            item.setTitle('Add Character Here')
                .setIcon('user')
                .onClick(() => {
                    // Will be implemented with modal
                    new Notice('Add character functionality coming soon');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Event Here')
                .setIcon('calendar')
                .onClick(() => {
                    new Notice('Add event functionality coming soon');
                });
        });

        menu.addItem(item => {
            item.setTitle('Add Item Here')
                .setIcon('box')
                .onClick(() => {
                    new Notice('Add item functionality coming soon');
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
                    new Notice('Edit marker position functionality coming soon');
                });
        });

        menu.showAtMouseEvent(e.originalEvent);
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

