// MapEditorView - Full workspace view for map editing
// Provides a dedicated panel for creating and editing maps with full screen space

import { ItemView, WorkspaceLeaf, setIcon, Notice, Setting, ButtonComponent, TFile } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { Map as StoryMap, MapMarker } from '../types';
import { MapView } from '../map/MapView';
import { GalleryImageSuggestModal } from '../modals/GalleryImageSuggestModal';
import { LocationSuggestModal } from '../modals/LocationSuggestModal';
import { EventSuggestModal } from '../modals/EventSuggestModal';
import { createDefaultMap } from '../utils/MapUtils';

export const VIEW_TYPE_MAP_EDITOR = 'storyteller-map-editor-view';

export interface MapEditorViewState {
    mapId?: string;
    isNew: boolean;
    currentTab: 'editor' | 'settings' | 'markers';
}

/**
 * MapEditorView provides a full-screen dedicated view for map editing
 * Users can open this in any workspace leaf for a larger, persistent editing experience
 * 
 * UI Structure:
 * - Toolbar: Save, Close, View Map, Export buttons
 * - Tab Bar: Editor | Settings | Markers
 * - Content Area: Tab-specific content (flex-grow to fill space)
 */
export class MapEditorView extends ItemView {
    plugin: StorytellerSuitePlugin;
    
    // Map state
    private map: StoryMap | null = null;
    private originalMap: StoryMap | null = null; // For change tracking
    private isNew: boolean = true;
    private hasUnsavedChanges: boolean = false;
    
    // Current UI state
    private currentTab: 'editor' | 'settings' | 'markers' = 'editor';
    
    // UI Elements
    private toolbarEl: HTMLElement | null = null;
    private tabBarEl: HTMLElement | null = null;
    private contentContainer: HTMLElement | null = null;
    
    // Map editor component
    private mapEditor: MapView | null = null;
    private editorContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_MAP_EDITOR;
    }

    getDisplayText(): string {
        if (this.map?.name) {
            return `Map: ${this.map.name}`;
        }
        return 'Map Editor';
    }

    getIcon(): string {
        return 'map';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('storyteller-map-editor-view');

        // Create main sections
        this.toolbarEl = container.createDiv('storyteller-map-editor-toolbar');
        this.tabBarEl = container.createDiv('storyteller-map-editor-tabs');
        this.contentContainer = container.createDiv('storyteller-map-editor-content');

        // Build UI
        this.buildToolbar();
        this.buildTabBar();
        
        // If no map loaded, create a new one
        if (!this.map) {
            this.map = createDefaultMap('New Map', 'region');
            this.isNew = true;
        }
        
        await this.renderCurrentTab();
    }

    async onClose(): Promise<void> {
        // Check for unsaved changes
        if (this.hasUnsavedChanges) {
            // In a real implementation, we might want to save automatically or show a confirmation
            console.warn('MapEditorView closed with unsaved changes');
        }
        
        // Clean up map editor
        if (this.mapEditor) {
            this.mapEditor.destroy();
            this.mapEditor = null;
        }
    }

    /**
     * Get current view state for persistence
     */
    getState(): any {
        return {
            mapId: this.map?.id,
            isNew: this.isNew,
            currentTab: this.currentTab
        };
    }

    /**
     * Restore view state
     */
    async setState(state: MapEditorViewState, result: any): Promise<void> {
        if (state.mapId) {
            await this.loadMap(state.mapId);
        }
        if (state.currentTab) {
            this.currentTab = state.currentTab;
        }
        this.isNew = state.isNew ?? true;
    }

    /**
     * Load a map by ID
     */
    async loadMap(mapId: string): Promise<void> {
        const maps = await this.plugin.listMaps();
        const mapData = maps.find(m => m.id === mapId);
        
        if (mapData) {
            this.map = { ...mapData };
            this.originalMap = { ...mapData };
            this.isNew = false;
            this.hasUnsavedChanges = false;
            
            // Re-render current tab with new data
            await this.renderCurrentTab();
        } else {
            new Notice(`Map not found: ${mapId}`);
        }
    }

    /**
     * Build toolbar with action buttons
     */
    private buildToolbar(): void {
        if (!this.toolbarEl) return;
        this.toolbarEl.empty();

        // Save button
        const saveBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn mod-cta',
            attr: { 
                'aria-label': 'Save map',
                'title': 'Save map'
            }
        });
        setIcon(saveBtn, 'save');
        saveBtn.addEventListener('click', () => this.handleSave());

        // Close button
        const closeBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': 'Close editor',
                'title': 'Close editor'
            }
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.handleClose());

        // View map button
        const viewBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': 'View map',
                'title': 'View map (read-only)'
            }
        });
        setIcon(viewBtn, 'eye');
        viewBtn.addEventListener('click', () => this.handleViewMap());

        // Spacer
        this.toolbarEl.createDiv('storyteller-toolbar-spacer');

        // Status indicator
        const statusEl = this.toolbarEl.createDiv('storyteller-toolbar-status');
        if (this.hasUnsavedChanges) {
            statusEl.setText('Unsaved changes');
            statusEl.addClass('has-changes');
        }
    }

    /**
     * Build tab bar
     */
    private buildTabBar(): void {
        if (!this.tabBarEl) return;
        this.tabBarEl.empty();

        const tabs = [
            { id: 'editor' as const, label: 'Editor', icon: 'map' },
            { id: 'settings' as const, label: 'Settings', icon: 'settings' },
            { id: 'markers' as const, label: 'Markers', icon: 'map-pin' }
        ];

        tabs.forEach(tab => {
            const tabEl = this.tabBarEl!.createDiv('storyteller-tab');
            if (this.currentTab === tab.id) {
                tabEl.addClass('active');
            }

            const iconEl = tabEl.createSpan('storyteller-tab-icon');
            setIcon(iconEl, tab.icon);
            
            tabEl.createSpan('storyteller-tab-label').setText(tab.label);

            tabEl.addEventListener('click', () => this.switchTab(tab.id));
        });
    }

    /**
     * Switch to a different tab
     */
    private async switchTab(tabId: 'editor' | 'settings' | 'markers'): Promise<void> {
        // Save current map editor state before switching
        if (this.currentTab === 'editor' && this.mapEditor && this.map) {
            const updatedMapData = this.mapEditor.getMapData();
            if (updatedMapData) {
                this.map = updatedMapData;
                this.markAsChanged();
            }
        }

        this.currentTab = tabId;
        this.buildTabBar(); // Rebuild to update active state
        await this.renderCurrentTab();
    }

    /**
     * Render current tab content
     */
    private async renderCurrentTab(): Promise<void> {
        if (!this.contentContainer || !this.map) return;
        this.contentContainer.empty();

        switch (this.currentTab) {
            case 'editor':
                await this.renderEditorTab();
                break;
            case 'settings':
                this.renderSettingsTab();
                break;
            case 'markers':
                this.renderMarkersTab();
                break;
        }
    }

    /**
     * Render Editor tab - main map editing canvas
     */
    private async renderEditorTab(): Promise<void> {
        if (!this.contentContainer || !this.map) return;

        // Check if background image exists or if using tile server
        const hasBackground = this.map.backgroundImagePath || this.map.osmLayer || this.map.tileServer;
        
        if (!hasBackground) {
            // Show prominent "Get Started" section when no background
            const getStartedEl = this.contentContainer.createDiv('storyteller-map-editor-get-started');
            getStartedEl.style.textAlign = 'center';
            getStartedEl.style.padding = '60px 20px';
            getStartedEl.style.background = 'var(--background-secondary)';
            getStartedEl.style.borderRadius = '12px';
            getStartedEl.style.margin = '20px auto';
            getStartedEl.style.maxWidth = '600px';

            getStartedEl.createEl('h2', { 
                text: '🗺️ Get Started With Your Map',
                attr: { style: 'margin-bottom: 20px; color: var(--text-normal);' }
            });
            
            getStartedEl.createEl('p', { 
                text: 'Upload a background image to start editing your map. You can use a hand-drawn map, satellite imagery, or any image file.',
                attr: { style: 'margin-bottom: 30px; color: var(--text-muted);' }
            });

            const buttonContainer = getStartedEl.createDiv();
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '12px';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.flexWrap = 'wrap';

            // Upload button
            const uploadBtn = new ButtonComponent(buttonContainer);
            uploadBtn.setButtonText('📤 Upload Image')
                .setCta()
                .onClick(async () => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.onchange = async (event: Event) => {
                        const target = event.target as HTMLInputElement;
                        const file = target.files?.[0];
                        if (!file || !this.map) return;

                        try {
                            await this.plugin.ensureFolder(this.plugin.settings.galleryUploadFolder);

                            const timestamp = Date.now();
                            const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                            const fileName = `${timestamp}_${sanitizedName}`;
                            const filePath = `${this.plugin.settings.galleryUploadFolder}/${fileName}`;

                            const arrayBuffer = await file.arrayBuffer();
                            await this.app.vault.createBinary(filePath, arrayBuffer);

                            // Get image dimensions
                            const img = new Image();
                            img.onload = async () => {
                                if (this.map) {
                                    this.map.backgroundImagePath = filePath;
                                    this.map.width = img.width;
                                    this.map.height = img.height;
                                    this.markAsChanged();
                                    await this.renderCurrentTab(); // Re-render to show editor
                                    new Notice('Background image uploaded successfully! 🎉');
                                }
                            };
                            img.src = URL.createObjectURL(file);
                        } catch (error) {
                            console.error('Error uploading background image:', error);
                            new Notice(`Error uploading image: ${(error as Error).message || 'Unknown error'}`);
                        }
                    };
                    fileInput.click();
                });

            // Gallery button
            const galleryBtn = new ButtonComponent(buttonContainer);
            galleryBtn.setButtonText('🖼️ Select from Gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, async (selectedImage) => {
                        if (selectedImage && selectedImage.filePath && this.map) {
                            this.map.backgroundImagePath = selectedImage.filePath;
                            
                            // Load image to get dimensions
                            const file = this.app.vault.getAbstractFileByPath(selectedImage.filePath);
                            if (file && 'stat' in file) {
                                const imgUrl = this.app.vault.getResourcePath(file as TFile);
                                const img = new Image();
                                img.onload = async () => {
                                    if (this.map) {
                                        this.map.width = img.width;
                                        this.map.height = img.height;
                                        this.markAsChanged();
                                        await this.renderCurrentTab(); // Re-render to show editor
                                        new Notice('Background image set successfully! 🎉');
                                    }
                                };
                                img.src = imgUrl;
                            }
                        }
                    }).open();
                });

            // Skip button (for tile server / OSM maps)
            const skipBtn = new ButtonComponent(buttonContainer);
            skipBtn.setButtonText('🌍 Use OpenStreetMap')
                .onClick(async () => {
                    if (this.map) {
                        // Enable OSM and set reasonable default center/zoom
                        this.map.osmLayer = true;
                        // Clear any existing image background (OSM and image mode are mutually exclusive)
                        this.map.backgroundImagePath = undefined;
                        // Default to world view centered on Europe (nice neutral starting point)
                        this.map.center = [20, 0]; // Lat: 20°N, Lng: 0° (Prime Meridian)
                        this.map.defaultZoom = 2; // World view
                        this.markAsChanged();
                        await this.renderCurrentTab(); // Re-render to show editor
                        new Notice('Map configured for OpenStreetMap tiles 🗺️');
                    }
                });

            getStartedEl.createEl('p', {
                text: '💡 Tip: You can also use real-world maps with OpenStreetMap tiles (no image needed)',
                attr: { style: 'margin-top: 30px; font-size: 12px; color: var(--text-faint);' }
            });

            return; // Don't show editor until background is set
        }

        // Normal editor rendering when background exists
        // Help text
        this.contentContainer.createEl('p', {
            text: 'Use the drawing tools to create shapes and place markers on your map.',
            cls: 'storyteller-help-text'
        });

        // Editor container
        this.editorContainer = this.contentContainer.createDiv('storyteller-map-editor-container');
        this.editorContainer.style.width = '100%';
        this.editorContainer.style.height = 'calc(100% - 60px)';
        this.editorContainer.style.minHeight = '500px';

        // Initialize map editor
        this.mapEditor = new MapView({
            container: this.editorContainer,
            app: this.app,
            readOnly: false,
            onMarkerClick: async (marker) => {
                await this.handleMarkerClick(marker);
            },
            onMapChange: () => {
                this.markAsChanged();
            },
            enableFrontmatterMarkers: this.plugin.settings.enableFrontmatterMarkers,
            enableDataViewMarkers: this.plugin.settings.enableDataViewMarkers,
            markerFiles: this.map.markerFiles,
            markerFolders: this.map.markerFolders,
            markerTags: this.map.markerTags,
            geojsonFiles: this.map.geojsonFiles,
            gpxFiles: this.map.gpxFiles,
            tileServer: this.map.tileServer,
            osmLayer: this.map.osmLayer,
            tileSubdomains: this.map.tileSubdomains
        });

        await this.mapEditor.initMap(this.map);

        // Quick actions below editor
        const actionsEl = this.contentContainer.createDiv('storyteller-map-editor-actions');
        
        new Setting(actionsEl)
            .setName('Quick Actions')
            .addButton(button => button
                .setButtonText('Fit to Markers')
                .setTooltip('Zoom to show all markers')
                .onClick(() => {
                    if (this.mapEditor) {
                        this.mapEditor.fitToMarkers();
                    }
                })
            )
            .addButton(button => button
                .setButtonText('Add Marker')
                .setTooltip('Add a location marker at map center')
                .onClick(() => {
                    if (this.mapEditor && this.map?.center) {
                        this.mapEditor.addMarker(
                            this.map.center[0],
                            this.map.center[1],
                            undefined,
                            { label: 'New Marker' }
                        );
                        this.markAsChanged();
                    }
                })
            );
    }

    /**
     * Render Settings tab - basic info, background, hierarchy
     */
    private renderSettingsTab(): void {
        if (!this.contentContainer || !this.map) return;

        // Basic Info Section
        this.contentContainer.createEl('h3', { text: 'Basic Information' });

        new Setting(this.contentContainer)
            .setName('Name')
            .setDesc('Name of the map')
            .addText(text => text
                .setPlaceholder('Enter map name')
                .setValue(this.map!.name)
                .onChange(value => {
                    if (this.map) {
                        this.map.name = value;
                        this.markAsChanged();
                    }
                })
            );

        new Setting(this.contentContainer)
            .setName('Description')
            .addTextArea(text => {
                text
                    .setPlaceholder('Describe this map...')
                    .setValue(this.map!.description || '')
                    .onChange(value => {
                        if (this.map) {
                            this.map.description = value || undefined;
                            this.markAsChanged();
                        }
                    });
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        new Setting(this.contentContainer)
            .setName('Map Scale')
            .setDesc('The hierarchical level of this map')
            .addDropdown(dropdown => dropdown
                .addOption('world', 'World')
                .addOption('region', 'Region')
                .addOption('city', 'City')
                .addOption('building', 'Building')
                .addOption('custom', 'Custom')
                .setValue(this.map!.scale)
                .onChange(value => {
                    if (this.map) {
                        this.map.scale = value as StoryMap['scale'];
                        this.markAsChanged();
                    }
                })
            );

        // Background Section
        this.contentContainer.createEl('h3', { text: 'Background Image', cls: 'storyteller-section-heading' });

        if (this.map.backgroundImagePath) {
            const previewContainer = this.contentContainer.createDiv('storyteller-map-background-preview');
            previewContainer.createEl('strong', { text: 'Current Background:' });
            previewContainer.createEl('p', { text: this.map.backgroundImagePath });

            const imgEl = previewContainer.createEl('img');
            imgEl.style.maxWidth = '100%';
            imgEl.style.maxHeight = '300px';

            const file = this.app.vault.getAbstractFileByPath(this.map.backgroundImagePath);
            if (file && 'stat' in file) {
                imgEl.src = this.app.vault.getResourcePath(file as any);
            }
        }

        new Setting(this.contentContainer)
            .setName('Background Image')
            .setDesc('Select or upload a map image')
            .addButton(button => button
                .setButtonText('Select from Gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, async (selectedImage) => {
                        if (selectedImage && selectedImage.filePath && this.map) {
                            this.map.backgroundImagePath = selectedImage.filePath;
                            this.markAsChanged();
                            await this.renderCurrentTab(); // Re-render will reinitialize map
                        }
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText('Upload New')
                .onClick(async () => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.onchange = async (event: Event) => {
                        const target = event.target as HTMLInputElement;
                        const file = target.files?.[0];
                        if (!file || !this.map) return;

                        try {
                            await this.plugin.ensureFolder(this.plugin.settings.galleryUploadFolder);

                            const timestamp = Date.now();
                            const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                            const fileName = `${timestamp}_${sanitizedName}`;
                            const filePath = `${this.plugin.settings.galleryUploadFolder}/${fileName}`;

                            const arrayBuffer = await file.arrayBuffer();
                            await this.app.vault.createBinary(filePath, arrayBuffer);

                            this.map.backgroundImagePath = filePath;
                            this.markAsChanged();
                            await this.renderCurrentTab(); // Re-render will reinitialize map
                            new Notice('Background image uploaded successfully');
                        } catch (error) {
                            console.error('Error uploading background image:', error);
                            new Notice(`Error uploading image: ${error.message || 'Unknown error'}`);
                        }
                    };
                    fileInput.click();
                })
            )
            .addButton(button => button
                .setButtonText('Clear')
                .setClass('mod-warning')
                .onClick(() => {
                    if (this.map) {
                        this.map.backgroundImagePath = undefined;
                        this.map.width = undefined;
                        this.map.height = undefined;
                        this.markAsChanged();
                        this.renderCurrentTab();
                        new Notice('Background cleared');
                    }
                })
            );

        // Hierarchy Section
        this.contentContainer.createEl('h3', { text: 'Map Hierarchy', cls: 'storyteller-section-heading' });

        new Setting(this.contentContainer)
            .setName('Parent Map')
            .setDesc(this.map.parentMapId ? `Current: ${this.map.parentMapId}` : 'None (root level)')
            .addButton(button => button
                .setButtonText('Select Parent')
                .onClick(async () => {
                    new Notice('Map selector coming soon');
                })
            )
            .addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear parent')
                .onClick(() => {
                    if (this.map) {
                        this.map.parentMapId = undefined;
                        this.markAsChanged();
                        this.renderCurrentTab();
                    }
                })
            );
    }

    /**
     * Render Markers tab - list and manage markers
     */
    private renderMarkersTab(): void {
        if (!this.contentContainer || !this.map) return;

        this.contentContainer.createEl('h3', { text: 'Map Markers' });

        if (this.map.markers.length === 0) {
            this.contentContainer.createEl('p', {
                text: 'No markers on this map yet. Switch to the Editor tab to add markers.',
                cls: 'storyteller-modal-list-empty'
            });
            return;
        }

        const markerListContainer = this.contentContainer.createDiv('storyteller-marker-list');

        this.map.markers.forEach((marker, index) => {
            const markerType = marker.markerType || 'location';
            const markerItem = markerListContainer.createDiv('storyteller-list-item');

            const typeIndicatorColor = markerType === 'event' ? '#ff6b6b' :
                markerType === 'childMap' ? '#4ecdc4' : '#3388ff';
            markerItem.style.borderLeft = `4px solid ${typeIndicatorColor}`;

            const infoEl = markerItem.createDiv('storyteller-list-item-info');

            const typeBadge = infoEl.createEl('span', {
                text: markerType === 'event' ? '⚡ Event' :
                    markerType === 'childMap' ? '🗺️ Child Map' : '📍 Location',
                cls: 'storyteller-badge'
            });
            typeBadge.style.background = typeIndicatorColor;
            typeBadge.style.color = 'white';
            typeBadge.style.padding = '2px 8px';
            typeBadge.style.borderRadius = '4px';
            typeBadge.style.fontSize = '11px';
            typeBadge.style.marginRight = '8px';

            infoEl.createEl('strong', {
                text: marker.label || marker.locationName || marker.eventName || `Marker ${index + 1}`
            });

            if (marker.locationName) {
                infoEl.createEl('p', { text: `Location: ${marker.locationName}` });
            } else if (marker.eventName) {
                infoEl.createEl('p', { text: `Event: ${marker.eventName}` });
            } else if (marker.childMapId) {
                infoEl.createEl('p', { text: `Portal to: ${marker.childMapId}` });
            }

            if (marker.description) {
                infoEl.createEl('p', { text: marker.description });
            }

            infoEl.createEl('small', {
                text: `Position: (${marker.lat.toFixed(2)}, ${marker.lng.toFixed(2)})`
            });

            const actionsEl = markerItem.createDiv('storyteller-list-item-actions');

            if (markerType === 'location' || !marker.markerType) {
                new ButtonComponent(actionsEl)
                    .setIcon('map-pin')
                    .setTooltip('Link to location')
                    .onClick(() => {
                        new LocationSuggestModal(this.app, this.plugin, async (selectedLocation) => {
                            if (selectedLocation && this.map) {
                                marker.locationName = selectedLocation.name;
                                marker.markerType = 'location';
                                marker.label = marker.label || selectedLocation.name;
                                this.markAsChanged();
                                await this.renderCurrentTab();
                            }
                        }).open();
                    });
            }

            if (markerType === 'event' || !marker.markerType) {
                new ButtonComponent(actionsEl)
                    .setIcon('zap')
                    .setTooltip('Link to event')
                    .onClick(() => {
                        new EventSuggestModal(this.app, this.plugin, async (selectedEvent) => {
                            if (selectedEvent && this.map) {
                                marker.eventName = selectedEvent.name;
                                marker.markerType = 'event';
                                marker.label = marker.label || selectedEvent.name;
                                this.markAsChanged();
                                await this.renderCurrentTab();
                            }
                        }).open();
                    });
            }

            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip('Delete marker')
                .setClass('mod-warning')
                .onClick(() => {
                    if (confirm(`Delete marker "${marker.label || 'Unnamed'}"?`)) {
                        if (this.mapEditor) {
                            this.mapEditor.removeMarker(marker.id);
                        }
                        const idx = this.map!.markers.findIndex(m => m.id === marker.id);
                        if (idx !== -1) {
                            this.map!.markers.splice(idx, 1);
                        }
                        this.markAsChanged();
                        this.renderCurrentTab();
                    }
                });
        });
    }

    /**
     * Handle marker click in map editor
     */
    private async handleMarkerClick(marker: MapMarker): Promise<void> {
        const markerType = marker.markerType || 'location';

        try {
            if (markerType === 'location' && marker.locationName) {
                const locations = await this.plugin.listLocations();
                const location = locations.find(l => l.name === marker.locationName);

                if (location && location.filePath) {
                    const file = this.app.vault.getAbstractFileByPath(location.filePath);
                    if (file instanceof TFile) {
                        await this.app.workspace.getLeaf('tab').openFile(file);
                        new Notice(`Opened location: ${location.name}`);
                    }
                }
            } else if (markerType === 'event' && marker.eventName) {
                const events = await this.plugin.listEvents();
                const event = events.find(e => e.name === marker.eventName);

                if (event && event.filePath) {
                    const file = this.app.vault.getAbstractFileByPath(event.filePath);
                    if (file instanceof TFile) {
                        await this.app.workspace.getLeaf('tab').openFile(file);
                        new Notice(`Opened event: ${event.name}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error opening marker entity:', error);
            new Notice(`Error: ${error.message}`);
        }
    }

    /**
     * Mark map as changed
     */
    private markAsChanged(): void {
        this.hasUnsavedChanges = true;
        this.buildToolbar(); // Rebuild to show status
    }

    /**
     * Handle Save action
     */
    private async handleSave(): Promise<void> {
        if (!this.map) return;

        try {
            // Get final map state from editor if on editor tab
            if (this.currentTab === 'editor' && this.mapEditor) {
                const updatedMapData = this.mapEditor.getMapData();
                if (updatedMapData) {
                    this.map = updatedMapData;
                }
            }

            // Update timestamps
            if (this.isNew) {
                this.map.created = new Date().toISOString();
            }
            this.map.modified = new Date().toISOString();

            // Update linked locations from markers
            this.map.linkedLocations = Array.from(
                new Set(
                    this.map.markers
                        .filter(m => m.locationName)
                        .map(m => m.locationName!)
                )
            );

            // Save to plugin
            await this.plugin.saveMap(this.map);

            // Update state
            this.hasUnsavedChanges = false;
            this.isNew = false;
            this.originalMap = { ...this.map };

            new Notice(`Map "${this.map.name}" saved successfully`);
            this.buildToolbar(); // Update toolbar to remove "unsaved" indicator
        } catch (error) {
            console.error('Error saving map:', error);
            new Notice('Failed to save map');
        }
    }

    /**
     * Handle Close action
     */
    private async handleClose(): Promise<void> {
        if (this.hasUnsavedChanges) {
            const confirmClose = confirm('You have unsaved changes. Close anyway?');
            if (!confirmClose) {
                return;
            }
        }

        // Close the view
        this.leaf.detach();
    }

    /**
     * Handle View Map action
     */
    private async handleViewMap(): Promise<void> {
        if (!this.map) return;

        // Save current state first
        if (this.hasUnsavedChanges) {
            await this.handleSave();
        }

        // Open viewer modal
        const { MapViewerModal } = await import('../modals/MapViewerModal');
        new MapViewerModal(this.app, this.plugin, this.map).open();
    }
}
