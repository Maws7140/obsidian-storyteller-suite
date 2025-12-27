// Map View - Full workspace view for interactive map visualization
// Provides a dedicated panel for viewing and interacting with story maps

import { ItemView, WorkspaceLeaf, setIcon, Menu, DropdownComponent, Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { StoryMap } from '../types';
import { t } from '../i18n/strings';
import { LeafletRenderer } from '../leaflet/renderer';
import { BlockParameters } from '../leaflet/types';
import { LocationService } from '../services/LocationService';
import { LocationSuggestModal } from '../modals/LocationSuggestModal';
import { CharacterSuggestModal } from '../modals/CharacterSuggestModal';
import { EventSuggestModal } from '../modals/EventSuggestModal';
import { PlotItemSuggestModal } from '../modals/PlotItemSuggestModal';
import { openMapModal } from '../utils/MapModalHelper';
import { MapHierarchyManager } from '../utils/MapHierarchyManager';

export const VIEW_TYPE_MAP = 'storyteller-map-view';

/**
 * MapView provides a full-screen dedicated view for interactive maps
 * Users can open this in any workspace leaf for a larger, persistent visualization
 *
 * UI Structure:
 * - Toolbar: Zoom controls, fullscreen, refresh
 * - Map Selector: Dropdown to select which map to display
 * - Map Container: Flex-grow to fill remaining space with Leaflet map
 * - Status Footer: Map info (type, scale, marker count)
 */
export class MapView extends ItemView {
    plugin: StorytellerSuitePlugin;
    private currentMap: StoryMap | null = null;
    private leafletRenderer: LeafletRenderer | null = null;
    private hierarchyManager: MapHierarchyManager;

    // UI Elements
    private toolbarEl: HTMLElement | null = null;
    private mapSelectorEl: HTMLElement | null = null;
    private breadcrumbEl: HTMLElement | null = null;
    private mapContainer: HTMLElement | null = null;
    private entityBarEl: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private footerStatusEl: HTMLElement | null = null;

    // Controls
    private mapDropdown: DropdownComponent | null = null;

    // State
    private resizeObserver: ResizeObserver | null = null;
    private currentZoom = 2;
    private placementMode: { type: 'location' | 'character' | 'event' | 'item' | null } = { type: null };
    private placementClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
    private placementOverlay: HTMLElement | null = null;
    private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.hierarchyManager = new MapHierarchyManager(this.app, this.plugin);
    }

    getViewType(): string {
        return VIEW_TYPE_MAP;
    }

    getDisplayText(): string {
        return this.currentMap ? this.currentMap.name : 'Map';
    }

    getIcon(): string {
        return 'map';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('storyteller-map-view');
        
        // Ensure container has proper base styles
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.height = '100%';
        container.style.overflow = 'hidden';

        // Create main sections with flex layout
        this.toolbarEl = container.createDiv('storyteller-map-toolbar');
        this.mapSelectorEl = container.createDiv('storyteller-map-selector');
        this.breadcrumbEl = container.createDiv('storyteller-map-breadcrumb');
        this.mapContainer = container.createDiv('storyteller-map-container');
        this.entityBarEl = container.createDiv('storyteller-map-entity-bar');
        this.footerEl = container.createDiv('storyteller-map-footer');
        
        // CRITICAL: Set map container positioning for Leaflet
        this.mapContainer.style.flex = '1';
        this.mapContainer.style.position = 'relative';
        this.mapContainer.style.overflow = 'hidden';
        this.mapContainer.style.minHeight = '200px';

        // Build each section
        await this.buildToolbar();
        await this.buildMapSelector();
        await this.buildBreadcrumb();
        this.buildEntityBar();
        this.buildFooter();

        // Setup resize observer for responsive layout
        this.setupResizeObserver();

        // Load map from state if provided
        const state = this.getState();
        if (state?.mapId) {
            await this.loadMap(state.mapId);
        }
    }

    /**
     * Build toolbar with map controls
     */
    private async buildToolbar(): Promise<void> {
        if (!this.toolbarEl) return;
        this.toolbarEl.empty();

        // Back to Parent Map button (only show if map has parent)
        if (this.currentMap?.parentMapId) {
            const parentMap = await this.hierarchyManager.getMapPath(
                this.currentMap.id || this.currentMap.name
            );
            const parentMapInfo = parentMap.length > 1 ? parentMap[parentMap.length - 2] : null;

            if (parentMapInfo) {
                const backBtn = this.toolbarEl.createEl('button', {
                    cls: 'clickable-icon storyteller-toolbar-btn storyteller-back-btn',
                    attr: {
                        'aria-label': `Back to ${parentMapInfo.name}`,
                        'title': `Back to ${parentMapInfo.name}`
                    }
                });
                setIcon(backBtn, 'arrow-left');
                backBtn.createSpan({
                    text: ` ${parentMapInfo.name}`,
                    cls: 'storyteller-back-btn-text'
                });
                backBtn.onclick = async () => {
                    const parentId = parentMapInfo.id || parentMapInfo.name;
                    await this.loadMap(parentId);
                    // Briefly highlight the current map marker on parent map (future enhancement)
                    new Notice(`Navigated to ${parentMapInfo.name}`);
                };

                // Add separator
                this.toolbarEl.createDiv('storyteller-toolbar-separator');
            }
        }

        // Spacer
        this.toolbarEl.createDiv('storyteller-toolbar-spacer');

        // Refresh button
        const refreshBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('refresh'),
                'title': t('refresh')
            }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.onclick = () => this.refresh();

        // More options menu
        const moreBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': 'More options',
                'title': 'More options'
            }
        });
        setIcon(moreBtn, 'more-vertical');
        moreBtn.onclick = (event) => this.showMoreMenu(event);
    }

    /**
     * Build map selector dropdown
     */
    private async buildMapSelector(): Promise<void> {
        if (!this.mapSelectorEl) return;
        this.mapSelectorEl.empty();

        // Load all maps
        const maps = await this.plugin.listMaps();

        // Create label
        this.mapSelectorEl.createEl('label', {
            text: 'Select Map: ',
            cls: 'storyteller-map-selector-label'
        });

        // Create dropdown
        const dropdownContainer = this.mapSelectorEl.createDiv('storyteller-map-selector-dropdown');

        this.mapDropdown = new DropdownComponent(dropdownContainer);

        if (maps.length === 0) {
            this.mapDropdown.addOption('', 'No maps available');
            this.mapDropdown.setDisabled(true);
        } else {
            this.mapDropdown.addOption('', 'Select a map...');
            maps.forEach(map => {
                const mapId = map.id || map.name;
                this.mapDropdown!.addOption(mapId, map.name);
            });

            this.mapDropdown.onChange(async (value) => {
                if (value) {
                    await this.loadMap(value);
                }
            });
        }

        // Set current map if exists
        if (this.currentMap) {
            const mapId = this.currentMap.id || this.currentMap.name;
            this.mapDropdown.setValue(mapId);
        }
    }

    /**
     * Build breadcrumb navigation showing map hierarchy
     */
    private async buildBreadcrumb(): Promise<void> {
        if (!this.breadcrumbEl) return;
        this.breadcrumbEl.empty();

        // Only show if a map is loaded
        if (!this.currentMap || !this.currentMap.id) {
            this.breadcrumbEl.style.display = 'none';
            return;
        }

        this.breadcrumbEl.style.display = 'flex';
        this.breadcrumbEl.style.flexShrink = '0';
        this.breadcrumbEl.addClass('storyteller-map-breadcrumb');

        // Get breadcrumb path
        const breadcrumbPath = await this.hierarchyManager.getBreadcrumbPath(
            this.currentMap.id || this.currentMap.name
        );

        // Only show if there's more than one map in the hierarchy (has parent)
        if (breadcrumbPath.length <= 1) {
            this.breadcrumbEl.style.display = 'none';
            return;
        }

        // Create breadcrumb items
        breadcrumbPath.forEach((mapInfo, index) => {
            // Don't add separator before first item
            if (index > 0) {
                const separator = this.breadcrumbEl!.createSpan('breadcrumb-separator');
                separator.textContent = ' > ';
            }

            const breadcrumbItem = this.breadcrumbEl!.createEl('button', {
                cls: 'breadcrumb-item',
                text: mapInfo.name
            });

            // Add scale emoji for visual hierarchy
            const scaleEmoji = this.getScaleEmoji(mapInfo.scale);
            if (scaleEmoji) {
                breadcrumbItem.prepend(scaleEmoji + ' ');
            }

            // Make clickable unless it's the current map (last item)
            if (index < breadcrumbPath.length - 1) {
                breadcrumbItem.addClass('breadcrumb-item-clickable');
                breadcrumbItem.onclick = async () => {
                    await this.loadMap(mapInfo.id);
                };
            } else {
                breadcrumbItem.addClass('breadcrumb-item-current');
            }
        });
    }

    /**
     * Get emoji icon for map scale
     */
    private getScaleEmoji(scale: StoryMap['scale']): string {
        const scaleEmojis: Record<string, string> = {
            'world': '🌍',
            'region': '👑',
            'city': '🏰',
            'building': '🏛️',
            'custom': '📍'
        };
        return scaleEmojis[scale || 'custom'] || '📍';
    }

    /**
     * Build entity bar for adding entities to the map
     */
    private buildEntityBar(): void {
        if (!this.entityBarEl) return;
        this.entityBarEl.empty();
        this.entityBarEl.addClass('storyteller-map-entity-bar');

        // Only show if a map is loaded
        if (!this.currentMap) {
            this.entityBarEl.style.display = 'none';
            return;
        }

        this.entityBarEl.style.display = 'flex';
        this.entityBarEl.style.flexShrink = '0';

        // Label
        const label = this.entityBarEl.createDiv('entity-bar-label');
        label.textContent = 'Add to Map:';

        // Add Location button
        const addLocationBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add Location',
                'title': 'Add a location to this map'
            }
        });
        setIcon(addLocationBtn, 'map-pin');
        addLocationBtn.createSpan({ text: 'Location' });
        addLocationBtn.onclick = () => this.showAddLocationModal();

        // Add Character button
        const addCharacterBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add Character',
                'title': 'Add a character to this map'
            }
        });
        setIcon(addCharacterBtn, 'user');
        addCharacterBtn.createSpan({ text: 'Character' });
        addCharacterBtn.onclick = () => this.showAddCharacterModal();

        // Add Event button
        const addEventBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add Event',
                'title': 'Add an event to this map'
            }
        });
        setIcon(addEventBtn, 'calendar');
        addEventBtn.createSpan({ text: 'Event' });
        addEventBtn.onclick = () => this.showAddEventModal();

        // Add Item button
        const addItemBtn = this.entityBarEl.createEl('button', {
            cls: 'entity-bar-btn',
            attr: {
                'aria-label': 'Add Item',
                'title': 'Add an item to this map'
            }
        });
        setIcon(addItemBtn, 'box');
        addItemBtn.createSpan({ text: 'Item' });
        addItemBtn.onclick = () => this.showAddItemModal();

        // Spacer
        this.entityBarEl.createDiv('entity-bar-spacer');

        // Quick actions
        const quickActions = this.entityBarEl.createDiv('entity-bar-quick-actions');
        
        // Edit map button
        const editMapBtn = quickActions.createEl('button', {
            cls: 'entity-bar-btn entity-bar-btn-small',
            attr: {
                'aria-label': 'Edit map',
                'title': 'Edit map settings'
            }
        });
        setIcon(editMapBtn, 'edit');
        editMapBtn.onclick = () => this.showEditMapModal();
        
        // Refresh entities button
        const refreshBtn = quickActions.createEl('button', {
            cls: 'entity-bar-btn entity-bar-btn-small',
            attr: {
                'aria-label': 'Refresh entities',
                'title': 'Refresh entities on map'
            }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.onclick = () => this.refresh();
    }

    /**
     * Enable placement mode for clicking on map to place entities
     */
    private enablePlacementMode(
        entityType: 'location' | 'character' | 'event' | 'item',
        onPlaceCoordinates: (coordinates: [number, number]) => void
    ): void {
        // Disable any existing placement mode first
        this.disablePlacementMode();

        this.placementMode.type = entityType;

        // Create instruction overlay
        if (this.mapContainer) {
            this.placementOverlay = this.mapContainer.createDiv('storyteller-placement-overlay');
            const instruction = this.placementOverlay.createDiv('storyteller-placement-instruction');

            const entityTypeText = entityType.charAt(0).toUpperCase() + entityType.slice(1);
            instruction.innerHTML = `
                <div class="placement-icon">📍</div>
                <div class="placement-text">Click map to place ${entityTypeText}</div>
                <div class="placement-hint">Press ESC to cancel</div>
            `;
        }

        // Change cursor to crosshair
        if (this.mapContainer) {
            this.mapContainer.style.cursor = 'crosshair';
        }

        // Get the Leaflet map instance
        const leafletMap = this.leafletRenderer?.getMap();
        if (!leafletMap) {
            new Notice('Map not initialized. Please wait.');
            this.disablePlacementMode();
            return;
        }

        // Add click handler to map
        this.placementClickHandler = (e: L.LeafletMouseEvent) => {
            const coordinates: [number, number] = [e.latlng.lat, e.latlng.lng];

            // Disable placement mode
            this.disablePlacementMode();

            // Call callback with coordinates
            onPlaceCoordinates(coordinates);
        };

        leafletMap.on('click', this.placementClickHandler);

        // Add ESC key handler to cancel
        this.escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.disablePlacementMode();
                new Notice('Placement cancelled');
            }
        };
        document.addEventListener('keydown', this.escapeHandler);
    }

    /**
     * Disable placement mode
     */
    private disablePlacementMode(): void {
        // Remove overlay
        if (this.placementOverlay) {
            this.placementOverlay.remove();
            this.placementOverlay = null;
        }

        // Reset cursor
        if (this.mapContainer) {
            this.mapContainer.style.cursor = '';
        }

        // Remove click handler
        const leafletMap = this.leafletRenderer?.getMap();
        if (leafletMap && this.placementClickHandler) {
            leafletMap.off('click', this.placementClickHandler);
            this.placementClickHandler = null;
        }

        // Remove ESC handler
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }

        // Reset placement mode
        this.placementMode.type = null;
    }

    /**
     * Show map editing modal
     */
    private showEditMapModal(): void {
        if (!this.currentMap) return;

        openMapModal(
            this.app,
            this.plugin,
            this.currentMap,
            {
                refreshMapView: true,
                onSave: async (updatedMap) => {
                    // Reload the map to reflect changes
                    const mapId = updatedMap.id || updatedMap.name;
                    await this.loadMap(mapId);
                },
                onDelete: async () => {
                    // Clear current map and refresh selector
                    this.currentMap = null;
                    await this.buildMapSelector();
                    this.buildEntityBar();
                    this.updateFooterStatus();
                    
                    if (this.mapContainer) {
                        this.mapContainer.empty();
                    }
                    if (this.leafletRenderer) {
                        this.leafletRenderer.unload();
                        this.leafletRenderer = null;
                    }
                }
            }
        );
    }

    /**
     * Show modal to add a location to the map
     */
    private showAddLocationModal(): void {
        if (!this.currentMap) return;

        // First, select the location
        new LocationSuggestModal(this.app, this.plugin, async (selectedLocation) => {
            if (!selectedLocation) return;

            const mapId = this.currentMap!.id || this.currentMap!.name;
            const locationService = new LocationService(this.plugin);

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode('location', async (coordinates) => {
                try {
                    await locationService.addMapBinding(
                        selectedLocation.id || selectedLocation.name,
                        mapId,
                        coordinates
                    );

                    new Notice(`Added ${selectedLocation.name} to map at [${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}]`);
                    await this.refresh();
                } catch (error) {
                    console.error('Error adding location to map:', error);
                    new Notice('Error adding location to map');
                }
            });

            new Notice(`Click map to place ${selectedLocation.name}`);
        }).open();
    }

    /**
     * Show modal to add a character to the map
     */
    private showAddCharacterModal(): void {
        if (!this.currentMap) return;

        // First, select the character
        new CharacterSuggestModal(this.app, this.plugin, async (selectedCharacter) => {
            if (!selectedCharacter) return;

            const mapId = this.currentMap!.id || this.currentMap!.name;
            const locationService = new LocationService(this.plugin);

            // Check if character has a current location
            let characterLocation: any = null;
            if (selectedCharacter.currentLocationId) {
                characterLocation = await locationService.getLocation(selectedCharacter.currentLocationId);

                // Check if location is already on this map
                if (characterLocation) {
                    const binding = characterLocation.mapBindings?.find((b: any) => b.mapId === mapId);
                    if (binding) {
                        new Notice(`Character "${selectedCharacter.name}" is already on the map at their current location`);
                        return;
                    }
                }
            }

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode('character', async (coordinates) => {
                try {
                    if (characterLocation) {
                        // Character has existing location - place it at coordinates
                        await locationService.addMapBinding(
                            characterLocation.id || characterLocation.name,
                            mapId,
                            coordinates
                        );
                        await locationService.addEntityToLocation(
                            characterLocation.id || characterLocation.name,
                            {
                                entityId: selectedCharacter.id || selectedCharacter.name,
                                entityType: 'character',
                                relationship: 'located here'
                            }
                        );
                        new Notice(`Added ${selectedCharacter.name} to map at [${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}]`);
                    } else {
                        // Character has no location - try to find location at clicked coordinates
                        const foundLocation = await locationService.findLocationAtCoordinates(
                            mapId,
                            coordinates,
                            this.getCoordinateTolerance()
                        );

                        if (foundLocation) {
                            // Auto-assign existing location to character
                            selectedCharacter.currentLocationId = foundLocation.id || foundLocation.name;
                            await this.plugin.saveCharacter(selectedCharacter);

                            // Add character to location's entityRefs
                            await locationService.moveEntityToLocation(
                                selectedCharacter.id || selectedCharacter.name,
                                'character',
                                foundLocation.id || foundLocation.name
                            );

                            new Notice(`Character placed at "${foundLocation.name}"`);
                        } else {
                            // No location found - create a new location at these coordinates
                            const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                            const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                            // For real-world maps, try to get the location name from reverse geocoding
                            let locationName = `${selectedCharacter.name}'s Location`;
                            let locationDescription = `Auto-created location for ${selectedCharacter.name} at coordinates [${coordText}]`;

                            // Check if this is a real-world map (multiple indicators)
                            const isRealWorldMap = this.currentMap && (
                                this.currentMap.type === 'real' ||
                                this.currentMap.osmLayer === true ||
                                this.currentMap.tileServer?.includes('openstreetmap') ||
                                this.currentMap.tileServer?.includes('tile')
                            );

                            if (isRealWorldMap) {
                                console.log('Real-world map detected, attempting reverse geocoding at:', coordinates);
                                try {
                                    const geoName = await this.reverseGeocode(coordinates[0], coordinates[1]);
                                    if (geoName) {
                                        locationName = geoName;
                                        locationDescription = `${geoName} - Auto-created for ${selectedCharacter.name}`;
                                        console.log('Location named from geocoding:', geoName);
                                    } else {
                                        console.warn('Reverse geocoding returned null');
                                    }
                                } catch (error) {
                                    console.warn('Reverse geocoding failed:', error);
                                }
                            } else {
                                console.log('Image map detected, using default location name');
                            }

                            const newLocation = {
                                id: locationId,
                                name: locationName,
                                description: locationDescription,
                                type: 'point-of-interest',
                                mapBindings: [{
                                    mapId: mapId,
                                    coordinates: coordinates
                                }],
                                entityRefs: [{
                                    entityId: selectedCharacter.id || selectedCharacter.name,
                                    entityType: 'character' as const,
                                    relationship: 'located here'
                                }]
                            };

                            // Save the new location
                            await this.plugin.saveLocation(newLocation as any);

                            // Assign to character using the location ID
                            selectedCharacter.currentLocationId = locationId;
                            await this.plugin.saveCharacter(selectedCharacter);

                            new Notice(`Created new location "${newLocation.name}" for ${selectedCharacter.name}`);
                        }
                    }

                    // Refresh entities on the map
                    if (this.leafletRenderer) {
                        await this.leafletRenderer.refreshEntities();
                    } else {
                        await this.refresh();
                    }
                } catch (error) {
                    console.error('Error adding character to map:', error);
                    new Notice('Error adding character to map');
                }
            });

            new Notice(`Click map to place ${selectedCharacter.name}`);
        }).open();
    }

    /**
     * Show modal to add an event to the map
     */
    private showAddEventModal(): void {
        if (!this.currentMap) return;

        // First, select the event
        new EventSuggestModal(this.app, this.plugin, async (selectedEvent) => {
            if (!selectedEvent) return;

            const mapId = this.currentMap!.id || this.currentMap!.name;
            const locationService = new LocationService(this.plugin);

            // Check if event has a location
            let eventLocation: any = null;
            if (selectedEvent.location) {
                eventLocation = await locationService.getLocation(selectedEvent.location);

                // Check if location is already on this map
                if (eventLocation) {
                    const binding = eventLocation.mapBindings?.find((b: any) => b.mapId === mapId);
                    if (binding) {
                        new Notice(`Event "${selectedEvent.name}" is already on the map at its location`);
                        return;
                    }
                }
            }

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode('event', async (coordinates) => {
                try {
                    // If event has a location, bind that location to the map at these coordinates
                    if (eventLocation) {
                        await locationService.addMapBinding(
                            eventLocation.id || eventLocation.name,
                            mapId,
                            coordinates
                        );
                        await locationService.addEntityToLocation(
                            eventLocation.id || eventLocation.name,
                            {
                                entityId: selectedEvent.id || selectedEvent.name,
                                entityType: 'event',
                                relationship: 'occurred here'
                            }
                        );
                        new Notice(`Added ${selectedEvent.name} to map at [${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}]`);
                    } else {
                        // Event has no location - try to find location at clicked coordinates
                        const foundLocation = await locationService.findLocationAtCoordinates(
                            mapId,
                            coordinates,
                            this.getCoordinateTolerance()
                        );

                        if (foundLocation) {
                            // Auto-assign existing location to event
                            selectedEvent.location = foundLocation.id || foundLocation.name;
                            await this.plugin.saveEvent(selectedEvent);

                            // Add event to location's entityRefs
                            await locationService.addEntityToLocation(
                                foundLocation.id || foundLocation.name,
                                {
                                    entityId: selectedEvent.id || selectedEvent.name,
                                    entityType: 'event',
                                    relationship: 'occurred here'
                                }
                            );

                            new Notice(`Event placed at "${foundLocation.name}"`);
                        } else {
                            // No location found - create a new location at these coordinates
                            const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                            const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                            // For real-world maps, try to get the location name from reverse geocoding
                            let locationName = `${selectedEvent.name} Location`;
                            let locationDescription = `Auto-created location for event "${selectedEvent.name}" at coordinates [${coordText}]`;

                            // Check if this is a real-world map
                            const isRealWorldMap = this.currentMap && (
                                this.currentMap.type === 'real' ||
                                this.currentMap.osmLayer === true ||
                                this.currentMap.tileServer?.includes('openstreetmap') ||
                                this.currentMap.tileServer?.includes('tile')
                            );

                            if (isRealWorldMap) {
                                try {
                                    const geoName = await this.reverseGeocode(coordinates[0], coordinates[1]);
                                    if (geoName) {
                                        locationName = geoName;
                                        locationDescription = `${geoName} - Auto-created for event "${selectedEvent.name}"`;
                                    }
                                } catch (error) {
                                    console.warn('Reverse geocoding failed:', error);
                                }
                            }

                            const newLocation = {
                                id: locationId,
                                name: locationName,
                                description: locationDescription,
                                type: 'point-of-interest',
                                mapBindings: [{
                                    mapId: mapId,
                                    coordinates: coordinates
                                }],
                                entityRefs: [{
                                    entityId: selectedEvent.id || selectedEvent.name,
                                    entityType: 'event' as const,
                                    relationship: 'occurred here'
                                }]
                            };

                            // Save the new location
                            await this.plugin.saveLocation(newLocation as any);

                            // Assign to event using the location ID
                            selectedEvent.location = locationId;
                            await this.plugin.saveEvent(selectedEvent);

                            new Notice(`Created new location "${newLocation.name}" for ${selectedEvent.name}`);
                        }
                    }

                    // Refresh entities on the map (preserves zoom/pan state)
                    if (this.leafletRenderer) {
                        await this.leafletRenderer.refreshEntities();
                    } else {
                        await this.refresh();
                    }
                } catch (error) {
                    console.error('Error adding event to map:', error);
                    new Notice('Error adding event to map');
                }
            });

            new Notice(`Click map to place ${selectedEvent.name}`);
        }).open();
    }

    /**
     * Show modal to add an item to the map
     */
    private showAddItemModal(): void {
        if (!this.currentMap) return;

        // First, select the item
        new PlotItemSuggestModal(this.app, this.plugin, async (selectedItem) => {
            if (!selectedItem) return;

            const mapId = this.currentMap!.id || this.currentMap!.name;
            const locationService = new LocationService(this.plugin);

            // Check if item has a current location
            let itemLocation: any = null;
            if (selectedItem.currentLocation) {
                itemLocation = await locationService.getLocation(selectedItem.currentLocation);

                // Check if location is already on this map
                if (itemLocation) {
                    const binding = itemLocation.mapBindings?.find((b: any) => b.mapId === mapId);
                    if (binding) {
                        new Notice(`Item "${selectedItem.name}" is already on the map at its current location`);
                        return;
                    }
                }
            }

            // Enable placement mode - user clicks map to place
            this.enablePlacementMode('item', async (coordinates) => {
                try {
                    // If item has a location, bind that location to the map at these coordinates
                    if (itemLocation) {
                        await locationService.addMapBinding(
                            itemLocation.id || itemLocation.name,
                            mapId,
                            coordinates
                        );
                        await locationService.addEntityToLocation(
                            itemLocation.id || itemLocation.name,
                            {
                                entityId: selectedItem.id || selectedItem.name,
                                entityType: 'item',
                                relationship: 'located here'
                            }
                        );
                        new Notice(`Added ${selectedItem.name} to map at [${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}]`);
                    } else {
                        // Item has no location - try to find location at clicked coordinates
                        const foundLocation = await locationService.findLocationAtCoordinates(
                            mapId,
                            coordinates,
                            this.getCoordinateTolerance()
                        );

                        if (foundLocation) {
                            // Auto-assign existing location to item
                            selectedItem.currentLocation = foundLocation.id || foundLocation.name;
                            await this.plugin.savePlotItem(selectedItem);

                            // Add item to location's entityRefs
                            await locationService.addEntityToLocation(
                                foundLocation.id || foundLocation.name,
                                {
                                    entityId: selectedItem.id || selectedItem.name,
                                    entityType: 'item',
                                    relationship: 'located here'
                                }
                            );

                            new Notice(`Item placed at "${foundLocation.name}"`);
                        } else {
                            // No location found - create a new location at these coordinates
                            const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                            const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                            // For real-world maps, try to get the location name from reverse geocoding
                            let locationName = `${selectedItem.name} Location`;
                            let locationDescription = `Auto-created location for item "${selectedItem.name}" at coordinates [${coordText}]`;

                            // Check if this is a real-world map
                            const isRealWorldMap = this.currentMap && (
                                this.currentMap.type === 'real' ||
                                this.currentMap.osmLayer === true ||
                                this.currentMap.tileServer?.includes('openstreetmap') ||
                                this.currentMap.tileServer?.includes('tile')
                            );

                            if (isRealWorldMap) {
                                try {
                                    const geoName = await this.reverseGeocode(coordinates[0], coordinates[1]);
                                    if (geoName) {
                                        locationName = geoName;
                                        locationDescription = `${geoName} - Auto-created for item "${selectedItem.name}"`;
                                    }
                                } catch (error) {
                                    console.warn('Reverse geocoding failed:', error);
                                }
                            }

                            const newLocation = {
                                id: locationId,
                                name: locationName,
                                description: locationDescription,
                                type: 'point-of-interest',
                                mapBindings: [{
                                    mapId: mapId,
                                    coordinates: coordinates
                                }],
                                entityRefs: [{
                                    entityId: selectedItem.id || selectedItem.name,
                                    entityType: 'item' as const,
                                    relationship: 'located here'
                                }]
                            };

                            // Save the new location
                            await this.plugin.saveLocation(newLocation as any);

                            // Assign to item using the location ID
                            selectedItem.currentLocation = locationId;
                            await this.plugin.savePlotItem(selectedItem);

                            new Notice(`Created new location "${newLocation.name}" for ${selectedItem.name}`);
                        }
                    }

                    // Refresh entities on the map (preserves zoom/pan state)
                    if (this.leafletRenderer) {
                        await this.leafletRenderer.refreshEntities();
                    } else {
                        await this.refresh();
                    }
                } catch (error) {
                    console.error('Error adding item to map:', error);
                    new Notice('Error adding item to map');
                }
            });

            new Notice(`Click map to place ${selectedItem.name}`);
        }).open();
    }

    /**
     * Build footer with map information
     */
    private buildFooter(): void {
        if (!this.footerEl) return;
        this.footerEl.empty();

        this.footerStatusEl = this.footerEl.createDiv('storyteller-map-footer-status');
        this.updateFooterStatus();
    }

    /**
     * Update footer status text
     */
    private updateFooterStatus(): void {
        if (!this.footerStatusEl) return;

        if (!this.currentMap) {
            this.footerStatusEl.setText('No map selected');
            return;
        }

        const parts: string[] = [];

        // Map type
        const type = this.currentMap.type === 'real' ? 'Real-world' : 'Image-based';
        parts.push(type);

        // Scale
        if (this.currentMap.scale) {
            const scaleText = this.currentMap.scale.charAt(0).toUpperCase() + this.currentMap.scale.slice(1);
            parts.push(scaleText);
        }

        // Marker count
        const markerCount = this.currentMap.markers?.length || 0;
        parts.push(`${markerCount} marker${markerCount !== 1 ? 's' : ''}`);

        this.footerStatusEl.setText(parts.join(' • '));
    }

    /**
     * Get coordinate tolerance for proximity matching based on map type
     * @returns Distance tolerance (pixels for image maps, degrees for real-world maps)
     */
    private getCoordinateTolerance(): number {
        if (!this.currentMap) {
            return 20; // Default to image map tolerance
        }

        if (this.currentMap.type === 'real') {
            return 0.001; // ~111 meters at equator
        } else {
            return 20; // 20 pixels for image maps
        }
    }

    /**
     * Reverse geocode coordinates to get location name (for real-world maps)
     * Uses OpenStreetMap Nominatim API
     * @param lat Latitude
     * @param lng Longitude
     * @returns Location name or null if not found
     */
    private async reverseGeocode(lat: number, lng: number): Promise<string | null> {
        try {
            // Use Nominatim API for reverse geocoding
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`;

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Obsidian-Storyteller-Suite/1.0'
                }
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            // Try to build a meaningful name from the address components
            const address = data.address;
            if (!address) {
                return data.display_name || null;
            }

            // Prefer specific locations over general areas
            const name =
                address.tourism ||           // Tourist attraction
                address.amenity ||           // Amenity (restaurant, etc.)
                address.building ||          // Building name
                address.shop ||              // Shop
                address.historic ||          // Historic site
                address.railway ||           // Train station
                address.aeroway ||           // Airport
                address.neighbourhood ||     // Neighborhood
                address.suburb ||            // Suburb
                address.village ||           // Village
                address.town ||              // Town
                address.city ||              // City
                address.state ||             // State/Province
                address.country ||           // Country
                data.display_name;           // Fallback to full display name

            return name || null;
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            return null;
        }
    }

    /**
     * Load a specific map by ID or name
     */
    async loadMap(mapIdOrName: string): Promise<void> {
        try {
            // Try to find map by ID first, then by name
            const maps = await this.plugin.listMaps();
            const map = maps.find(m => m.id === mapIdOrName || m.name === mapIdOrName);

            if (!map) {
                new Notice(`Map not found: ${mapIdOrName}`);
                return;
            }

            this.currentMap = map;

            // Update dropdown
            if (this.mapDropdown) {
                const mapId = map.id || map.name;
                this.mapDropdown.setValue(mapId);
            }

            // Render the map
            await this.renderMap();

            // Update toolbar, footer, breadcrumb, and entity bar
            await this.buildToolbar();
            this.updateFooterStatus();
            await this.buildBreadcrumb();
            this.buildEntityBar();

        } catch (error) {
            console.error('Error loading map:', error);
            new Notice('Error loading map. See console for details.');
        }
    }

    /**
     * Render the Leaflet map
     */
    private async renderMap(): Promise<void> {
        if (!this.mapContainer || !this.currentMap) return;

        this.mapContainer.empty();

        // CRITICAL FIX: Parent container must have position:relative for absolute children
        // Without this, tiles will scatter across the viewport
        this.mapContainer.style.position = 'relative';
        this.mapContainer.style.overflow = 'hidden';

        // Create Leaflet container with explicit sizing and ID
        const leafletContainer = this.mapContainer.createDiv('leaflet-map-container');
        leafletContainer.style.width = '100%';
        leafletContainer.style.height = '100%';
        leafletContainer.style.position = 'absolute';
        leafletContainer.style.top = '0';
        leafletContainer.style.left = '0';
        leafletContainer.style.minHeight = '400px'; // Ensure minimum height
        leafletContainer.style.backgroundColor = 'transparent'; // Ensure background is transparent
        
        // CRITICAL: Add inline style tag to override Obsidian's global img styles
        // This is essential because Obsidian themes apply max-width, object-fit, etc.
        // to all img elements which breaks Leaflet tile positioning
        this.injectLeafletCSSOverrides(leafletContainer);

        // Set ID for Leaflet to use (following standard pattern)
        const mapId = this.currentMap.id || this.currentMap.name;
        leafletContainer.id = `map-view-${mapId}-${Date.now()}`;

        // Convert map entity to block parameters
        const params = this.mapToBlockParams(this.currentMap);
        params.id = mapId; // Use map ID so MapEntityRenderer can find map bindings
        params.mapId = mapId; // Also set mapId parameter for entity rendering

        try {
            // Create mock context for renderer that supports Component lifecycle
            const mockContext = {
                sourcePath: this.currentMap.filePath || '',
                addChild: (component: any) => {
                    // Trigger onload() lifecycle method after container is in DOM
                    // This matches the code block processor pattern
                    requestAnimationFrame(() => {
                        if (component.onload) {
                            component.onload();
                        }
                    });
                },
                getSectionInfo: () => null
            } as any;

            // Ensure container has explicit dimensions like code block processor
            const containerRect = leafletContainer.getBoundingClientRect();
            if (containerRect.height === 0 || containerRect.width === 0) {
                // Set explicit minimum dimensions if flex layout hasn't computed yet
                leafletContainer.style.minHeight = '500px';
                leafletContainer.style.minWidth = '100%';
            }

            // Create renderer
            this.leafletRenderer = new LeafletRenderer(
                this.plugin,
                leafletContainer,
                params,
                mockContext
            );

            // Register as child component to trigger lifecycle (like code block processor)
            mockContext.addChild(this.leafletRenderer);

            // Add zoom/pan state tracking after map is initialized
            setTimeout(() => {
                const map = this.leafletRenderer?.getMap();
                if (map) {
                    map.on('zoomend', () => {
                        this.saveMapViewState();
                    });

                    map.on('moveend', () => {
                        this.saveMapViewState();
                    });
                }
            }, 100);

            // Fix sizing after initialization - multiple calls handle Obsidian's async layout
            const invalidateSizes = () => {
                if (this.leafletRenderer) {
                    this.leafletRenderer.invalidateSize();
                }
            };
            
            // Immediate + delayed calls to ensure tiles render correctly
            invalidateSizes();
            setTimeout(invalidateSizes, 100);
            setTimeout(invalidateSizes, 300);
            setTimeout(invalidateSizes, 500);

        } catch (error) {
            console.error('Error rendering map:', error);
            leafletContainer.empty();
            leafletContainer.createEl('div', {
                text: 'Error rendering map. Check console for details.',
                cls: 'storyteller-map-error'
            });
        }
    }

    /**
     * Inject critical CSS overrides to fix Obsidian's global img styles
     * that break Leaflet tile positioning.
     * 
     * This is the key fix for the "scattered tiles" bug in Obsidian.
     * Obsidian themes apply max-width:100%, object-fit:cover, border-radius,
     * etc. to all img elements, which breaks Leaflet's tile layout.
     */
    private injectLeafletCSSOverrides(container: HTMLElement): void {
        const styleId = 'leaflet-obsidian-overrides';
        
        // Only inject once per document
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* CRITICAL: Reset Obsidian's global img styles for Leaflet */
            .leaflet-container img,
            .leaflet-tile-pane img,
            .leaflet-tile {
                max-width: none !important;
                max-height: none !important;
                width: auto !important;
                height: auto !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                object-fit: unset !important;
                display: block !important;
            }
            
            /* Ensure tile panes are positioned correctly */
            .leaflet-pane,
            .leaflet-tile,
            .leaflet-marker-icon,
            .leaflet-marker-shadow,
            .leaflet-tile-container,
            .leaflet-pane > svg,
            .leaflet-pane > canvas,
            .leaflet-zoom-box,
            .leaflet-image-layer,
            .leaflet-layer {
                position: absolute;
                left: 0;
                top: 0;
            }
            
            /* Leaflet container must be relative positioned */
            .leaflet-container {
                position: relative !important;
                overflow: hidden !important;
            }
            
            /* Fix for map container sizing */
            .storyteller-map-container {
                position: relative !important;
                overflow: hidden !important;
            }
            
            .storyteller-map-container .leaflet-container {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100% !important;
                height: 100% !important;
            }
        `;
        
        document.head.appendChild(style);
    }

    /**
     * Convert StoryMap entity to BlockParameters for LeafletRenderer
     */
    private mapToBlockParams(map: StoryMap): BlockParameters {
        const params: BlockParameters = {
            type: map.type || 'image',
            id: map.id
        };

        // Image-based map parameters
        if (map.type === 'image' || !map.type) {
            if (map.backgroundImagePath || map.image) {
                params.image = map.backgroundImagePath || map.image;
            }
            if (map.width) params.width = map.width;
            if (map.height) params.height = map.height;
        }

        // Real-world map parameters
        if (map.type === 'real') {
            // Set default coordinates if not provided (London, UK as a reasonable default)
            params.lat = map.lat !== undefined ? map.lat : 51.5074;
            params.long = map.long !== undefined ? map.long : -0.1278;
            if (map.tileServer) params.tileServer = map.tileServer;
            if (map.darkMode) params.darkMode = map.darkMode;
            // Set default zoom if not provided
            if (map.defaultZoom === undefined) params.defaultZoom = 10;
        }

        // Zoom parameters
        if (map.defaultZoom !== undefined) params.defaultZoom = map.defaultZoom;
        if (map.minZoom !== undefined) params.minZoom = map.minZoom;
        if (map.maxZoom !== undefined) params.maxZoom = map.maxZoom;

        // Grid
        if (map.gridEnabled) {
            // Grid parameters would go here if needed
        }

        // Note: Markers are handled differently in the renderer
        // They're loaded from the map entity's markers array

        return params;
    }

    /**
     * Show more options menu
     */
    private showMoreMenu(event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item
                .setTitle('Edit map')
                .setIcon('edit')
                .onClick(() => {
                    if (this.currentMap) {
                        this.showEditMapModal();
                    }
                });
        });

        menu.addItem((item) => {
            item
                .setTitle('Export as image')
                .setIcon('image')
                .onClick(() => {
                    new Notice('Map export coming soon');
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item
                .setTitle('Open map note')
                .setIcon('file-text')
                .onClick(async () => {
                    if (this.currentMap?.filePath) {
                        const file = this.app.vault.getAbstractFileByPath(this.currentMap.filePath);
                        if (file) {
                            await this.app.workspace.getLeaf('tab').openFile(file as any);
                        }
                    }
                });
        });

        menu.showAtMouseEvent(event);
    }

    /**
     * Refresh the current map
     */
    async refresh(): Promise<void> {
        if (this.currentMap) {
            const mapId = this.currentMap.id || this.currentMap.name;
            await this.loadMap(mapId);
        }
    }

    /**
     * Setup resize observer for responsive layout
     */
    private setupResizeObserver(): void {
        if (this.mapContainer) {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.leafletRenderer) {
                    this.leafletRenderer.invalidateSize();
                }
            });
            this.resizeObserver.observe(this.mapContainer);
        }
    }

    async onClose(): Promise<void> {
        // Clean up placement mode
        this.disablePlacementMode();

        // Clean up resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Clean up Leaflet renderer
        if (this.leafletRenderer) {
            this.leafletRenderer.unload();
            this.leafletRenderer = null;
        }
    }

    /**
     * Save current map view state (zoom and center position)
     * Called automatically when user zooms or pans the map
     */
    private saveMapViewState(): void {
        const map = this.leafletRenderer?.getMap();
        if (!map) return;

        const zoom = map.getZoom();
        const center = map.getCenter();

        // Update instance variable
        this.currentZoom = zoom;

        // Save to workspace state (persists across sessions)
        // Note: This updates Obsidian's view state which is automatically persisted
        this.leaf?.setViewState({
            type: VIEW_TYPE_MAP,
            state: {
                mapId: this.currentMap?.id || this.currentMap?.name,
                zoom: zoom,
                center: {
                    lat: center.lat,
                    lng: center.lng
                }
            }
        });
    }

    /**
     * Get state for persistence
     */
    getState(): any {
        const map = this.leafletRenderer?.getMap();
        return {
            mapId: this.currentMap?.id || this.currentMap?.name,
            zoom: this.currentZoom,
            center: map?.getCenter()
        };
    }

    /**
     * Set state from persistence
     */
    async setState(state: any, result: any): Promise<void> {
        if (state?.mapId) {
            await this.loadMap(state.mapId);

            // Restore zoom and position after map loads
            setTimeout(() => {
                const map = this.leafletRenderer?.getMap();
                if (map && state.zoom !== undefined) {
                    map.setView(
                        state.center || map.getCenter(),
                        state.zoom,
                        { animate: false }  // Instant restore
                    );
                    this.currentZoom = state.zoom;
                }
            }, 200);  // Small delay to ensure map is fully initialized
        }
    }
}