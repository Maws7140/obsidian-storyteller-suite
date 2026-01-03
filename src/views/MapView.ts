// Map View - Full workspace view for interactive map visualization
// Provides a dedicated panel for viewing and interacting with story maps

import { ItemView, WorkspaceLeaf, setIcon, Menu, DropdownComponent, Notice } from 'obsidian';
import * as L from 'leaflet';
import StorytellerSuitePlugin from '../main';
import { StoryMap } from '../types';
import { t } from '../i18n/strings';
import { LeafletRenderer } from '../leaflet/renderer';
import { BlockParameters } from '../leaflet/types';
import { LocationService, LocationLevel } from '../services/LocationService';
import { LocationSuggestModal } from '../modals/LocationSuggestModal';
import { LocationSelectionModal } from '../modals/LocationSelectionModal';
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
    private locationLevelDropdown: DropdownComponent | null = null;

    // State
    private resizeObserver: ResizeObserver | null = null;
    private currentZoom = 2;
    private locationLevelMode: LocationLevel = 'auto';
    private placementMode: { type: 'location' | 'character' | 'event' | 'item' | null } = { type: null };
    private placementClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
    private placementOverlay: HTMLElement | null = null;
    private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
    private _savedCenter: { lat: number; lng: number } | null = null;

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

        // Location Level dropdown (only for real-world maps)
        const isRealWorldMap = this.currentMap && (
            this.currentMap.type === 'real' ||
            this.currentMap.osmLayer === true ||
            this.currentMap.tileServer?.includes('openstreetmap') ||
            this.currentMap.tileServer?.includes('tile')
        );

        if (isRealWorldMap) {
            // Separator
            this.entityBarEl.createDiv('entity-bar-separator');

            // Location level container
            const levelContainer = this.entityBarEl.createDiv('entity-bar-level-container');
            
            const levelLabel = levelContainer.createEl('label', {
                cls: 'entity-bar-level-label',
                attr: { title: 'Control the granularity of auto-created locations' }
            });
            setIcon(levelLabel, 'layers');
            levelLabel.createSpan({ text: ' Level:' });

            const dropdownContainer = levelContainer.createDiv('entity-bar-level-dropdown');
            this.locationLevelDropdown = new DropdownComponent(dropdownContainer);
            
            // Add options
            this.locationLevelDropdown.addOption('auto', '🔍 Auto (by zoom)');
            this.locationLevelDropdown.addOption('building', '🏛️ Building');
            this.locationLevelDropdown.addOption('neighborhood', '🏘️ Neighborhood');
            this.locationLevelDropdown.addOption('city', '🏙️ City');
            this.locationLevelDropdown.addOption('region', '🗺️ Region/State');
            this.locationLevelDropdown.addOption('country', '🏳️ Country');
            this.locationLevelDropdown.addOption('continent', '🌍 Continent');

            this.locationLevelDropdown.setValue(this.locationLevelMode);
            this.locationLevelDropdown.onChange((value) => {
                this.locationLevelMode = value as LocationLevel;
                console.log('[MapView] Location level mode changed to:', value);
                // Update footer and dropdown label to reflect new selection
                this.updateFooterStatus();
                this.updateLocationLevelDropdownLabel();
            });

            // Initial label update
            setTimeout(() => this.updateLocationLevelDropdownLabel(), 100);
        }

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
     * Get the effective location level based on current zoom
     * Used for auto mode to determine what granularity to use
     */
    private getEffectiveLevelForZoom(zoom: number): LocationLevel {
        if (zoom >= 16) return 'building';
        if (zoom >= 14) return 'neighborhood';
        if (zoom >= 10) return 'city';
        if (zoom >= 6) return 'region';
        if (zoom >= 3) return 'country';
        return 'continent';
    }

    /**
     * Get display label for a location level
     */
    private getLevelDisplayLabel(level: LocationLevel, includeEmoji = true): string {
        const labels: Record<LocationLevel, { emoji: string; text: string }> = {
            'auto': { emoji: '🔍', text: 'Auto' },
            'building': { emoji: '🏛️', text: 'Building' },
            'neighborhood': { emoji: '🏘️', text: 'Neighborhood' },
            'city': { emoji: '🏙️', text: 'City' },
            'region': { emoji: '🗺️', text: 'Region' },
            'country': { emoji: '🏳️', text: 'Country' },
            'continent': { emoji: '🌍', text: 'Continent' }
        };
        const l = labels[level];
        return includeEmoji ? `${l.emoji} ${l.text}` : l.text;
    }

    /**
     * Update the location level dropdown label to show effective level when in Auto mode
     * Called on zoom changes to give real-time feedback
     */
    private updateLocationLevelDropdownLabel(): void {
        if (!this.locationLevelDropdown) return;
        
        const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
        
        // Update footer status with zoom info
        this.updateFooterStatus();

        // If in auto mode, update the dropdown to show effective level
        if (this.locationLevelMode === 'auto') {
            const effectiveLevel = this.getEffectiveLevelForZoom(currentZoom);
            const effectiveLabel = this.getLevelDisplayLabel(effectiveLevel, false);
            
            // Update the 'auto' option text to show current effective level
            const selectEl = this.locationLevelDropdown.selectEl;
            if (selectEl) {
                const autoOption = selectEl.querySelector('option[value="auto"]');
                if (autoOption) {
                    autoOption.textContent = `🔍 Auto → ${effectiveLabel} (z${Math.round(currentZoom)})`;
                }
            }
        }
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
                        // Character has no location - find or create one at clicked coordinates
                        
                        // Check if this is a real-world map
                        const isRealWorldMap = this.currentMap && (
                            this.currentMap.type === 'real' ||
                            this.currentMap.osmLayer === true ||
                            this.currentMap.tileServer?.includes('openstreetmap') ||
                            this.currentMap.tileServer?.includes('tile')
                        );

                        let targetLocation: any;
                        let isNewLocation = false;

                        if (isRealWorldMap) {
                            // For real-world maps: use geocoding to find/create location by place name
                            // Pass current zoom and level preference for granularity control
                            const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
                            console.log('Real-world map detected, using geocode-based location matching');
                            console.log('Level mode:', this.locationLevelMode, 'Zoom:', currentZoom);
                            
                            const result = await locationService.findOrCreateForRealWorldMap(
                                mapId,
                                coordinates,
                                { type: 'character', name: selectedCharacter.name },
                                { level: this.locationLevelMode, zoom: currentZoom }
                            );
                            targetLocation = result.location;
                            isNewLocation = result.isNew;
                        } else {
                            // For image maps: use coordinate proximity matching
                            console.log('Image map detected, using coordinate-based matching');
                            const nearbyLocations = await locationService.findLocationsAtCoordinates(
                                mapId,
                                coordinates,
                                this.getCoordinateTolerance()
                            );

                            if (nearbyLocations.length > 0) {
                                const result = await new Promise<any | 'create-new' | null>((resolve) => {
                                    let selected = false;
                                    const modal = new LocationSelectionModal(this.app, nearbyLocations, (res) => {
                                        selected = true;
                                        resolve(res);
                                    });
                                    const originalOnClose = modal.onClose;
                                    modal.onClose = () => {
                                        originalOnClose.call(modal);
                                        if (!selected) resolve(null);
                                    };
                                    modal.open();
                                });

                                if (!result) return; // User cancelled

                                if (result === 'create-new') {
                                    // Create new location for image map
                                    const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                    const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                                    targetLocation = {
                                        id: locationId,
                                        name: `${selectedCharacter.name}'s Location`,
                                        description: `Auto-created location for ${selectedCharacter.name} at coordinates [${coordText}]`,
                                        type: 'custom',
                                        mapBindings: [{
                                            mapId: mapId,
                                            coordinates: coordinates
                                        }]
                                    };

                                    await this.plugin.saveLocation(targetLocation as any);
                                    isNewLocation = true;
                                } else {
                                    targetLocation = result;
                                    isNewLocation = false;
                                    // Add map binding for existing location at the clicked coordinates
                                    await locationService.addMapBinding(
                                        result.id || result.name,
                                        mapId,
                                        coordinates
                                    );
                                }
                            } else {
                                // Create new location for image map
                                const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                                targetLocation = {
                                    id: locationId,
                                    name: `${selectedCharacter.name}'s Location`,
                                    description: `Auto-created location for ${selectedCharacter.name} at coordinates [${coordText}]`,
                                    type: 'custom',
                                    mapBindings: [{
                                        mapId: mapId,
                                        coordinates: coordinates
                                    }]
                                };

                                await this.plugin.saveLocation(targetLocation as any);
                                isNewLocation = true;
                            }
                        }

                        // Assign character to the location
                        const locationId = targetLocation.id || targetLocation.name;
                        selectedCharacter.currentLocationId = locationId;
                        await this.plugin.saveCharacter(selectedCharacter);

                        // Add character to location's entityRefs
                        await locationService.addEntityToLocation(
                            locationId,
                            {
                                entityId: selectedCharacter.id || selectedCharacter.name,
                                entityType: 'character',
                                relationship: 'located here'
                            }
                        );

                        if (isNewLocation) {
                            new Notice(`Created location "${targetLocation.name}" for ${selectedCharacter.name}`);
                        } else {
                            new Notice(`Character placed at existing location "${targetLocation.name}"`);
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
                        // Event has no location - find or create one at clicked coordinates
                        
                        // Check if this is a real-world map
                        const isRealWorldMap = this.currentMap && (
                            this.currentMap.type === 'real' ||
                            this.currentMap.osmLayer === true ||
                            this.currentMap.tileServer?.includes('openstreetmap') ||
                            this.currentMap.tileServer?.includes('tile')
                        );

                        let targetLocation: any;
                        let isNewLocation = false;

                        if (isRealWorldMap) {
                            // For real-world maps: use geocoding to find/create location by place name
                            // Pass current zoom and level preference for granularity control
                            const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
                            console.log('Real-world map detected, using geocode-based location matching');
                            console.log('Level mode:', this.locationLevelMode, 'Zoom:', currentZoom);
                            
                            const result = await locationService.findOrCreateForRealWorldMap(
                                mapId,
                                coordinates,
                                { type: 'event', name: selectedEvent.name },
                                { level: this.locationLevelMode, zoom: currentZoom }
                            );
                            targetLocation = result.location;
                            isNewLocation = result.isNew;
                        } else {
                            // For image maps: use coordinate proximity matching
                            console.log('Image map detected, using coordinate-based matching');
                            const nearbyLocations = await locationService.findLocationsAtCoordinates(
                                mapId,
                                coordinates,
                                this.getCoordinateTolerance()
                            );

                            if (nearbyLocations.length > 0) {
                                const result = await new Promise<any | 'create-new' | null>((resolve) => {
                                    let selected = false;
                                    const modal = new LocationSelectionModal(this.app, nearbyLocations, (res) => {
                                        selected = true;
                                        resolve(res);
                                    });
                                    const originalOnClose = modal.onClose;
                                    modal.onClose = () => {
                                        originalOnClose.call(modal);
                                        if (!selected) resolve(null);
                                    };
                                    modal.open();
                                });

                                if (!result) return; // User cancelled

                                if (result === 'create-new') {
                                    // Create new location for image map
                                    const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                    const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                                    targetLocation = {
                                        id: locationId,
                                        name: `${selectedEvent.name} Location`,
                                        description: `Auto-created location for event "${selectedEvent.name}" at coordinates [${coordText}]`,
                                        type: 'custom',
                                        mapBindings: [{
                                            mapId: mapId,
                                            coordinates: coordinates
                                        }]
                                    };

                                    await this.plugin.saveLocation(targetLocation as any);
                                    isNewLocation = true;
                                } else {
                                    targetLocation = result;
                                    isNewLocation = false;
                                    // Add map binding for existing location at the clicked coordinates
                                    await locationService.addMapBinding(
                                        result.id || result.name,
                                        mapId,
                                        coordinates
                                    );
                                }
                            } else {
                                // Create new location for image map
                                const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                                targetLocation = {
                                    id: locationId,
                                    name: `${selectedEvent.name} Location`,
                                    description: `Auto-created location for event "${selectedEvent.name}" at coordinates [${coordText}]`,
                                    type: 'custom',
                                    mapBindings: [{
                                        mapId: mapId,
                                        coordinates: coordinates
                                    }]
                                };

                                await this.plugin.saveLocation(targetLocation as any);
                                isNewLocation = true;
                            }
                        }

                        // Assign event to the location
                        const locationId = targetLocation.id || targetLocation.name;
                        selectedEvent.location = locationId;
                        await this.plugin.saveEvent(selectedEvent);

                        // Add event to location's entityRefs
                        await locationService.addEntityToLocation(
                            locationId,
                            {
                                entityId: selectedEvent.id || selectedEvent.name,
                                entityType: 'event',
                                relationship: 'occurred here'
                            }
                        );

                        if (isNewLocation) {
                            new Notice(`Created location "${targetLocation.name}" for ${selectedEvent.name}`);
                        } else {
                            new Notice(`Event placed at existing location "${targetLocation.name}"`);
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
                        // Item has no location - find or create one at clicked coordinates
                        
                        // Check if this is a real-world map
                        const isRealWorldMap = this.currentMap && (
                            this.currentMap.type === 'real' ||
                            this.currentMap.osmLayer === true ||
                            this.currentMap.tileServer?.includes('openstreetmap') ||
                            this.currentMap.tileServer?.includes('tile')
                        );

                        let targetLocation: any;
                        let isNewLocation = false;

                        if (isRealWorldMap) {
                            // For real-world maps: use geocoding to find/create location by place name
                            // Pass current zoom and level preference for granularity control
                            const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
                            console.log('Real-world map detected, using geocode-based location matching');
                            console.log('Level mode:', this.locationLevelMode, 'Zoom:', currentZoom);
                            
                            const result = await locationService.findOrCreateForRealWorldMap(
                                mapId,
                                coordinates,
                                { type: 'item', name: selectedItem.name },
                                { level: this.locationLevelMode, zoom: currentZoom }
                            );
                            targetLocation = result.location;
                            isNewLocation = result.isNew;
                        } else {
                            // For image maps: use coordinate proximity matching
                            console.log('Image map detected, using coordinate-based matching');
                            const nearbyLocations = await locationService.findLocationsAtCoordinates(
                                mapId,
                                coordinates,
                                this.getCoordinateTolerance()
                            );

                            if (nearbyLocations.length > 0) {
                                const result = await new Promise<any | 'create-new' | null>((resolve) => {
                                    let selected = false;
                                    const modal = new LocationSelectionModal(this.app, nearbyLocations, (res) => {
                                        selected = true;
                                        resolve(res);
                                    });
                                    const originalOnClose = modal.onClose;
                                    modal.onClose = () => {
                                        originalOnClose.call(modal);
                                        if (!selected) resolve(null);
                                    };
                                    modal.open();
                                });

                                if (!result) return; // User cancelled

                                if (result === 'create-new') {
                                    // Create new location for image map
                                    const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                    const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                                    targetLocation = {
                                        id: locationId,
                                        name: `${selectedItem.name} Location`,
                                        description: `Auto-created location for item "${selectedItem.name}" at coordinates [${coordText}]`,
                                        type: 'custom',
                                        mapBindings: [{
                                            mapId: mapId,
                                            coordinates: coordinates
                                        }]
                                    };

                                    await this.plugin.saveLocation(targetLocation as any);
                                    isNewLocation = true;
                                } else {
                                    targetLocation = result;
                                    isNewLocation = false;
                                    // Add map binding for existing location at the clicked coordinates
                                    await locationService.addMapBinding(
                                        result.id || result.name,
                                        mapId,
                                        coordinates
                                    );
                                }
                            } else {
                                // Create new location for image map
                                const coordText = `${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)}`;
                                const locationId = `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                                targetLocation = {
                                    id: locationId,
                                    name: `${selectedItem.name} Location`,
                                    description: `Auto-created location for item "${selectedItem.name}" at coordinates [${coordText}]`,
                                    type: 'custom',
                                    mapBindings: [{
                                        mapId: mapId,
                                        coordinates: coordinates
                                    }]
                                };

                                await this.plugin.saveLocation(targetLocation as any);
                                isNewLocation = true;
                            }
                        }

                        // Assign item to the location
                        const locationId = targetLocation.id || targetLocation.name;
                        selectedItem.currentLocation = locationId;
                        await this.plugin.savePlotItem(selectedItem);

                        // Add item to location's entityRefs
                        await locationService.addEntityToLocation(
                            locationId,
                            {
                                entityId: selectedItem.id || selectedItem.name,
                                entityType: 'item',
                                relationship: 'located here'
                            }
                        );

                        if (isNewLocation) {
                            new Notice(`Created location "${targetLocation.name}" for ${selectedItem.name}`);
                        } else {
                            new Notice(`Item placed at existing location "${targetLocation.name}"`);
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
        const isRealWorldMap = this.currentMap.type === 'real' ||
            this.currentMap.osmLayer === true ||
            this.currentMap.tileServer?.includes('openstreetmap') ||
            this.currentMap.tileServer?.includes('tile');
        
        const type = isRealWorldMap ? 'Real-world' : 'Image-based';
        parts.push(type);

        // For real-world maps, show zoom level and effective location level
        if (isRealWorldMap) {
            const currentZoom = this.leafletRenderer?.getMap()?.getZoom() || this.currentZoom;
            parts.push(`Zoom: ${Math.round(currentZoom)}`);
            
            if (this.locationLevelMode === 'auto') {
                const effectiveLevel = this.getEffectiveLevelForZoom(currentZoom);
                const levelLabel = this.getLevelDisplayLabel(effectiveLevel, false);
                parts.push(`Level: ${levelLabel}`);
            } else {
                const levelLabel = this.getLevelDisplayLabel(this.locationLevelMode, false);
                parts.push(`Level: ${levelLabel}`);
            }
        }

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
     * Calculates tolerance dynamically based on current zoom level to ensure
     * a consistent screen-pixel click area (approx 400px radius)
     * @returns Distance tolerance in map units (pixels for image maps, degrees for real-world maps)
     */
    private getCoordinateTolerance(): number {
        const map = this.leafletRenderer?.getMap();
        
        // Fallback if map not ready
        if (!this.currentMap || !map) {
            return this.currentMap?.type === 'real' ? 0.001 : 400;
        }

        // Target tolerance in screen pixels (radius)
        // Increased to 400px to ensure easy selection even on large/tiled maps
        const screenPixels = 400;

        try {
            // Calculate how many map units correspond to 'screenPixels' at current zoom
            const center = map.getCenter();
            const centerPoint = map.latLngToContainerPoint(center);
            
            // Point 'screenPixels' away to the right
            const offsetPoint = L.point(centerPoint.x + screenPixels, centerPoint.y);
            const offsetLatLng = map.containerPointToLatLng(offsetPoint);
            
            if (this.currentMap.type === 'real') {
                // For real-world maps, calculate distance in degrees
                const dLat = offsetLatLng.lat - center.lat;
                const dLng = offsetLatLng.lng - center.lng;
                return Math.sqrt(dLat*dLat + dLng*dLng);
            } else {
                // For image maps (CRS.Simple), calculate distance in map pixels
                // Note: In CRS.Simple, lat is y, lng is x
                const dx = offsetLatLng.lng - center.lng;
                const dy = offsetLatLng.lat - center.lat;
                return Math.sqrt(dx*dx + dy*dy);
            }
        } catch (e) {
            console.warn('Error calculating dynamic tolerance:', e);
            return this.currentMap.type === 'real' ? 0.001 : 400;
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

        // Clean up existing renderer before creating new one
        if (this.leafletRenderer) {
            try {
                await this.leafletRenderer.onunload();
            } catch (e) {
                console.warn('Error cleaning up old renderer:', e);
            }
            this.leafletRenderer = null;
        }

        this.mapContainer.empty();

        // CRITICAL FIX: Wait for container to have non-zero dimensions
        // Without this, Leaflet initializes with 0x0 size and tiles don't render
        await this.waitForContainerDimensions(this.mapContainer);

        // CRITICAL FIX: Parent container must have position:relative for absolute children
        // Without this, tiles will scatter across the viewport
        this.mapContainer.style.position = 'relative';
        this.mapContainer.style.overflow = 'hidden';

        // Get actual dimensions from parent container
        const containerRect = this.mapContainer.getBoundingClientRect();
        const containerWidth = containerRect.width > 0 ? containerRect.width : 800;
        const containerHeight = containerRect.height > 0 ? containerRect.height : 500;

        // Create Leaflet container with EXPLICIT PIXEL dimensions
        // Using percentages with absolute positioning can cause 0x0 dimensions
        const leafletContainer = this.mapContainer.createDiv('leaflet-map-container');
        
        // CRITICAL: Set explicit PIXEL dimensions - not percentages!
        // Leaflet needs real pixel values to calculate which tiles to load
        leafletContainer.style.position = 'absolute';
        leafletContainer.style.top = '0';
        leafletContainer.style.left = '0';
        leafletContainer.style.width = `${containerWidth}px`;
        leafletContainer.style.height = `${containerHeight}px`;
        leafletContainer.style.minHeight = '400px';
        leafletContainer.style.minWidth = '400px';

        // Use transparent background for image maps, grey for real-world maps
        const isImageMap = this.currentMap.type === 'image' || this.currentMap.image;
        leafletContainer.style.backgroundColor = isImageMap
            ? 'transparent'
            : 'var(--background-secondary)';

        // CRITICAL: Add inline style tag to override Obsidian's global img styles
        // This is essential because Obsidian themes apply max-width, object-fit, etc.
        // to all img elements which breaks Leaflet tile positioning
        this.injectLeafletCSSOverrides(leafletContainer);

        // Use stable ID based on map ID only (no Date.now() - causes issues)
        const mapId = this.currentMap.id || this.currentMap.name;
        leafletContainer.id = `map-view-${mapId.replace(/[^a-zA-Z0-9]/g, '-')}`;

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

            // CRITICAL: Prevent Obsidian from intercepting events when using the map
            // 
            // Key insight from esm7 (Obsidian Map View author):
            // Leaflet 1.8+ listens for events at a higher level (document), so calling
            // stopPropagation on the map element blocks Leaflet itself from receiving events.
            // 
            // Solution: Add event listener at DOCUMENT level, check if event is on map,
            // then stopPropagation. This lets Leaflet handle the event first, then
            // prevents Obsidian from also handling it.
            // 
            // Reference: https://github.com/Leaflet/Leaflet/discussions/8972

            // Wheel events for scroll zoom
            // Custom zoom handler that zooms from center (not mouse position)
            // Must be at document level to work with Leaflet 1.8+ event handling
            let wheelTimeout: NodeJS.Timeout | null = null;
            let wheelDelta = 0;

            const wheelHandler = (ev: WheelEvent) => {
                const targetNode = ev.target as Node;
                const isEventOnMap = ev.target === leafletContainer || leafletContainer.contains(targetNode);
                if (isEventOnMap) {
                    // Prevent default scroll and Obsidian handling
                    ev.preventDefault();
                    ev.stopPropagation();

                    // Accumulate wheel delta for smooth zooming
                    wheelDelta += ev.deltaY;

                    // Debounce wheel events
                    if (wheelTimeout) {
                        clearTimeout(wheelTimeout);
                    }

                    wheelTimeout = setTimeout(() => {
                        const map = this.leafletRenderer?.getMap();
                        if (!map) return;

                        // Calculate zoom change (negative deltaY = zoom in, positive = zoom out)
                        const zoomChange = -wheelDelta / 80;  // 80 pixels per zoom level
                        const currentZoom = map.getZoom();
                        const currentCenter = map.getCenter();

                        // Calculate new zoom level and clamp to min/max
                        const minZoom = map.getMinZoom();
                        const maxZoom = map.getMaxZoom();
                        let newZoom = currentZoom + (zoomChange * 0.25);  // 0.25 for fine control
                        newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

                        // Zoom to new level, keeping the same center (prevents panning!)
                        map.setView(currentCenter, newZoom, { animate: false });

                        // Reset accumulator
                        wheelDelta = 0;
                    }, 40);  // 40ms debounce
                }
            };
            document.addEventListener('wheel', wheelHandler, { passive: false });
            
            // Touch events for mobile panning
            const touchMoveHandler = (ev: TouchEvent) => {
                const targetNode = ev.target as Node;
                const isEventOnMap = ev.target === leafletContainer || leafletContainer.contains(targetNode);
                if (isEventOnMap) {
                    ev.stopPropagation();
                }
            };
            document.addEventListener('touchmove', touchMoveHandler);

            // Store handlers for cleanup
            (this as any)._wheelHandler = wheelHandler;
            (this as any)._touchMoveHandler = touchMoveHandler;

            // Make container focusable for keyboard navigation
            leafletContainer.tabIndex = 0;

            // Add zoom/pan event handlers after a short delay
            setTimeout(() => {
                const map = this.leafletRenderer?.getMap();
                if (map) {
                    map.on('zoomend', () => {
                        this.saveMapViewState();
                        this.updateLocationLevelDropdownLabel();
                    });

                    map.on('moveend', () => {
                        this.saveMapViewState();
                    });

                    this.updateLocationLevelDropdownLabel();
                }
            }, 100);

            // CRITICAL FIX: Force invalidateSize after layout completes WITH tile layer updates
            // Multiple delays handle different layout completion scenarios
            // IMPORTANT: Must also update tile layers, not just invalidateSize, or tiles disappear
            const forceMapUpdate = () => {
                const map = this.leafletRenderer?.getMap();
                if (map) {
                    map.invalidateSize({ animate: false });

                    // Force tile layers to update after invalidateSize
                    const tileLayers: any[] = [];
                    map.eachLayer((layer: any) => {
                        if (layer._url || layer.getTileUrl) {
                            tileLayers.push(layer);
                        }
                    });

                    tileLayers.forEach(tileLayer => {
                        if (tileLayer.redraw) {
                            tileLayer.redraw();
                        }
                        if (tileLayer._update) {
                            tileLayer._update();
                        }
                    });
                }
            };

            setTimeout(forceMapUpdate, 150);
            setTimeout(forceMapUpdate, 300);
            setTimeout(forceMapUpdate, 500);

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

            /* Entity avatar markers with images */
            .storyteller-entity-avatar {
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 12px;
                color: #fff;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }

            .storyteller-entity-avatar img {
                max-width: none !important;
                max-height: none !important;
                width: 100% !important;
                height: 100% !important;
                border-radius: 50% !important;
                object-fit: cover !important;
            }

            .storyteller-entity-marker.has-image {
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            }

            .storyteller-entity-marker.has-image:hover {
                transform: scale(1.1);
                z-index: 1000 !important;
            }

            /* Entity marker hover effects */
            .storyteller-entity-marker {
                transition: transform 0.15s ease-out;
            }

            .storyteller-entity-marker:hover {
                transform: scale(1.15);
                z-index: 1000 !important;
            }

            /* Location marker styles */
            .storyteller-location-marker {
                transition: transform 0.15s ease-out;
            }

            .storyteller-location-marker:hover {
                transform: scale(1.1);
            }

            /* Image overlay for image-based maps */
            .storyteller-map-image-overlay {
                pointer-events: none !important;
            }

            /* CRITICAL: Ensure Leaflet captures wheel/touch events */
            .leaflet-container {
                touch-action: none !important;
                outline: none !important;
                /* Prevent scroll chaining to parent elements */
                overscroll-behavior: contain !important;
            }

            /* Prevent Obsidian workspace from capturing scroll on map */
            .leaflet-map-container {
                overflow: hidden !important;
                touch-action: none !important;
                /* Prevent scroll chaining */
                overscroll-behavior: contain !important;
            }

            /* Map container also needs overscroll-behavior */
            .storyteller-map-container {
                overscroll-behavior: contain !important;
            }

            /* Allow wheel events on the map pane */
            .leaflet-map-pane,
            .leaflet-tile-pane,
            .leaflet-overlay-pane,
            .leaflet-shadow-pane,
            .leaflet-marker-pane,
            .leaflet-tooltip-pane,
            .leaflet-popup-pane {
                pointer-events: auto !important;
            }

            /* But disable pointer events on overlay images so they don't block */
            .leaflet-overlay-pane img,
            .leaflet-image-layer {
                pointer-events: none !important;
            }

            /* Ensure zoom controls are clickable */
            .leaflet-control-zoom,
            .leaflet-control-zoom a {
                pointer-events: auto !important;
            }

            /* Make sure the map container itself captures events */
            .storyteller-map-view .storyteller-map-container {
                pointer-events: auto !important;
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
     * Wait for container to have non-zero dimensions
     * Critical for Leaflet initialization - it needs real pixel dimensions
     */
    private async waitForContainerDimensions(container: HTMLElement, maxAttempts = 50): Promise<void> {
        let attempts = 0;

        while (attempts < maxAttempts) {
            const rect = container.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
                console.log(`[MapView] Container has dimensions: ${rect.width}x${rect.height}`);
                return;
            }

            // Wait a bit and try again
            await new Promise(resolve => setTimeout(resolve, 20));
            attempts++;
        }

        console.warn('[MapView] Container still has no dimensions after waiting, proceeding anyway...');
    }

    /**
     * Setup resize observer for responsive layout
     * Uses debouncing to prevent rapid invalidateSize calls
     */
    private setupResizeObserver(): void {
        if (!this.mapContainer) return;

        let resizeTimeout: NodeJS.Timeout | null = null;

        this.resizeObserver = new ResizeObserver((entries) => {
            // Debounce resize events to prevent excessive invalidateSize calls
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }

            resizeTimeout = setTimeout(() => {
                // Update leaflet container dimensions to match parent
                const leafletContainer = this.mapContainer?.querySelector('.leaflet-map-container') as HTMLElement;
                if (leafletContainer && this.mapContainer) {
                    const rect = this.mapContainer.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        leafletContainer.style.width = `${rect.width}px`;
                        leafletContainer.style.height = `${rect.height}px`;
                    }
                }

                const map = this.leafletRenderer?.getMap();
                if (map) {
                    console.log('[MapView] ResizeObserver triggered, updating map...');
                    // Use requestAnimationFrame to ensure DOM has updated
                    requestAnimationFrame(() => {
                        if (map) {
                            map.invalidateSize({ animate: false });

                            // CRITICAL FIX: After resize invalidateSize, force tile layers to update
                            // Without this, tiles can disappear after initial load
                            const tileLayers: any[] = [];
                            map.eachLayer((layer: any) => {
                                if (layer._url || layer.getTileUrl) {
                                    tileLayers.push(layer);
                                }
                            });

                            tileLayers.forEach(tileLayer => {
                                if (tileLayer.redraw) {
                                    tileLayer.redraw();
                                }
                                if (tileLayer._update) {
                                    tileLayer._update();
                                }
                            });

                            console.log('[MapView] Forced tile layer update after resize');
                        }
                    });
                }
            }, 150); // 150ms debounce
        });

        this.resizeObserver.observe(this.mapContainer);
    }

    async onClose(): Promise<void> {
        // Clean up placement mode
        this.disablePlacementMode();

        // Clean up debounce timer for view state persistence
        if (this._persistViewStateTimeout) {
            clearTimeout(this._persistViewStateTimeout);
            // Save immediately if there's a pending save
            const mapId = this.currentMap?.id || this.currentMap?.name;
            if (mapId && this._savedCenter) {
                this.plugin.saveMapViewState(mapId, this.currentZoom, this._savedCenter);
            }
            this._persistViewStateTimeout = null;
        }

        // Clean up document-level event handlers
        if ((this as any)._wheelHandler) {
            document.removeEventListener('wheel', (this as any)._wheelHandler);
            (this as any)._wheelHandler = null;
        }
        if ((this as any)._touchMoveHandler) {
            document.removeEventListener('touchmove', (this as any)._touchMoveHandler);
            (this as any)._touchMoveHandler = null;
        }

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
     * 
     * NOTE: We only update instance variables, NOT Obsidian's view state.
     * Calling setViewState() triggers setState() which calls loadMap(),
     * creating an infinite re-initialization loop.
     * 
     * Also persists to plugin settings so position is remembered across sessions.
     */
    private saveMapViewState(): void {
        const map = this.leafletRenderer?.getMap();
        if (!map) return;

        const zoom = map.getZoom();
        const center = map.getCenter();

        // Update instance variables only - don't call setViewState()
        this.currentZoom = zoom;
        
        // Store in a private variable for later use in getState()
        this._savedCenter = { lat: center.lat, lng: center.lng };

        // Persist to plugin settings (debounced via the plugin method)
        const mapId = this.currentMap?.id || this.currentMap?.name;
        if (mapId) {
            // Use debouncing to avoid excessive writes during rapid pan/zoom
            this.debouncedPersistViewState(mapId, zoom, this._savedCenter);
        }
    }

    /** Debounce timer for persisting view state */
    private _persistViewStateTimeout: ReturnType<typeof setTimeout> | null = null;

    /**
     * Debounced persistence of view state to avoid excessive writes
     */
    private debouncedPersistViewState(mapId: string, zoom: number, center: { lat: number; lng: number }): void {
        if (this._persistViewStateTimeout) {
            clearTimeout(this._persistViewStateTimeout);
        }
        this._persistViewStateTimeout = setTimeout(() => {
            this.plugin.saveMapViewState(mapId, zoom, center);
            this._persistViewStateTimeout = null;
        }, 500); // 500ms debounce
    }

    /**
     * Get state for persistence
     */
    getState(): any {
        return {
            mapId: this.currentMap?.id || this.currentMap?.name,
            zoom: this.currentZoom,
            center: this._savedCenter || this.leafletRenderer?.getMap()?.getCenter()
        };
    }

    /**
     * Set state from persistence
     */
    async setState(state: any, result: any): Promise<void> {
        // Guard: Don't reload if we already have this map loaded
        const currentMapId = this.currentMap?.id || this.currentMap?.name;
        if (state?.mapId && state.mapId !== currentMapId) {
            await this.loadMap(state.mapId);
        }

        // Restore zoom and position after map loads (or if same map)
        if (state?.zoom !== undefined) {
            setTimeout(() => {
                const map = this.leafletRenderer?.getMap();
                if (map) {
                    map.setView(
                        state.center || map.getCenter(),
                        state.zoom,
                        { animate: false }  // Instant restore
                    );
                    this.currentZoom = state.zoom;
                    this._savedCenter = state.center || null;
                }
            }, 200);  // Small delay to ensure map is fully initialized
        }
    }
}