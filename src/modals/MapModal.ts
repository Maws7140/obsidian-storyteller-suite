// MapModal - Main modal for creating and editing maps
// Provides tabbed interface with basic info, editor, background, markers, hierarchy, and metadata

import { App, Modal, Setting, Notice, ButtonComponent } from 'obsidian';
import { Map as StoryMap, MapMarker } from '../types';
import { MapEditor } from '../components/MapEditor';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { createDefaultMap, generateMarkerId } from '../utils/MapUtils';

export type MapModalSubmitCallback = (map: StoryMap) => Promise<void>;
export type MapModalDeleteCallback = (map: StoryMap) => Promise<void>;

export class MapModal extends Modal {
    map: StoryMap;
    plugin: StorytellerSuitePlugin;
    onSubmit: MapModalSubmitCallback;
    onDelete?: MapModalDeleteCallback;
    isNew: boolean;

    private currentTab: string = 'basic';
    private mapEditor: MapEditor | null = null;
    private editorContainer: HTMLElement | null = null;
    private hasUnsavedChanges: boolean = false;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        map: StoryMap | null,
        onSubmit: MapModalSubmitCallback,
        onDelete?: MapModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = map === null;
        
        // Initialize map data
        this.map = map ? { ...map } : createDefaultMap('New Map', 'region');
        
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        
        this.modalEl.addClass('storyteller-map-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        contentEl.createEl('h2', { 
            text: this.isNew ? 'Create New Map' : `Edit ${this.map.name}` 
        });

        // Tab navigation
        const tabContainer = contentEl.createDiv('storyteller-modal-tabs');
        this.renderTabs(tabContainer);

        // Tab content
        const tabContentContainer = contentEl.createDiv('storyteller-modal-tab-content');
        this.renderTabContent(tabContentContainer);

        // Action buttons
        this.renderActionButtons(contentEl);
    }

    // Render tab navigation
    private renderTabs(container: HTMLElement): void {
        const tabs = [
            { id: 'basic', label: 'Basic Info', icon: 'info' },
            { id: 'editor', label: 'Map Editor', icon: 'map' },
            { id: 'background', label: 'Background', icon: 'image' },
            { id: 'markers', label: 'Markers', icon: 'map-pin' },
            { id: 'hierarchy', label: 'Hierarchy', icon: 'network' },
            { id: 'metadata', label: 'Metadata', icon: 'settings' }
        ];

        tabs.forEach(tab => {
            const tabEl = container.createDiv('storyteller-modal-tab');
            if (this.currentTab === tab.id) {
                tabEl.addClass('active');
            }
            tabEl.setText(tab.label);
            tabEl.onclick = () => {
                this.switchTab(tab.id);
            };
        });
    }

    // Switch to a different tab
    private switchTab(tabId: string): void {
        this.currentTab = tabId;
        
        // Save map editor state before switching
        if (this.mapEditor) {
            const updatedMapData = this.mapEditor.getMapData();
            if (updatedMapData) {
                this.map = updatedMapData;
            }
        }
        
        // Re-render
        this.onOpen();
    }

    // Render current tab content
    private renderTabContent(container: HTMLElement): void {
        container.empty();

        switch (this.currentTab) {
            case 'basic':
                this.renderBasicTab(container);
                break;
            case 'editor':
                this.renderEditorTab(container);
                break;
            case 'background':
                this.renderBackgroundTab(container);
                break;
            case 'markers':
                this.renderMarkersTab(container);
                break;
            case 'hierarchy':
                this.renderHierarchyTab(container);
                break;
            case 'metadata':
                this.renderMetadataTab(container);
                break;
        }
    }

    // Basic Info Tab
    private renderBasicTab(container: HTMLElement): void {
        new Setting(container)
            .setName(t('name'))
            .setDesc('Name of the map')
            .addText(text => text
                .setPlaceholder('Enter map name')
                .setValue(this.map.name)
                .onChange(value => {
                    this.map.name = value;
                    this.hasUnsavedChanges = true;
                })
            );

        new Setting(container)
            .setName('Description')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder('Describe this map...')
                    .setValue(this.map.description || '')
                    .onChange(value => {
                        this.map.description = value || undefined;
                        this.hasUnsavedChanges = true;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(container)
            .setName('Map Scale')
            .setDesc('The hierarchical level of this map')
            .addDropdown(dropdown => dropdown
                .addOption('world', 'World')
                .addOption('region', 'Region')
                .addOption('city', 'City')
                .addOption('building', 'Building')
                .addOption('custom', 'Custom')
                .setValue(this.map.scale)
                .onChange(value => {
                    this.map.scale = value as StoryMap['scale'];
                    this.hasUnsavedChanges = true;
                })
            );

        // Thumbnail image
        let imagePathDesc: HTMLElement;
        new Setting(container)
            .setName('Thumbnail')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', { 
                    text: `Current: ${this.map.profileImagePath || 'None'}` 
                });
            })
            .addButton(button => button
                .setButtonText('Select')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.map.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.map.profileImagePath || 'None'}`);
                        this.hasUnsavedChanges = true;
                    }).open();
                })
            )
            .addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear thumbnail')
                .onClick(() => {
                    this.map.profileImagePath = undefined;
                    imagePathDesc.setText('Current: None');
                    this.hasUnsavedChanges = true;
                })
            );
    }

    // Map Editor Tab
    private renderEditorTab(container: HTMLElement): void {
        container.createEl('p', { 
            text: 'Use the tools below to draw on your map and place markers.', 
            cls: 'storyteller-help-text' 
        });

        // Editor container
        this.editorContainer = container.createDiv('storyteller-map-editor-container');
        this.editorContainer.style.width = '100%';
        this.editorContainer.style.height = '500px';
        this.editorContainer.style.border = '1px solid var(--background-modifier-border)';
        this.editorContainer.style.borderRadius = '8px';
        this.editorContainer.style.marginTop = '10px';

        // Initialize map editor
        this.initializeMapEditor();

        // Editor controls
        const controlsContainer = container.createDiv('storyteller-map-editor-controls');
        controlsContainer.style.marginTop = '10px';

        new Setting(controlsContainer)
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
                    if (this.mapEditor && this.map.center) {
                        this.mapEditor.addMarker(
                            this.map.center[0], 
                            this.map.center[1],
                            undefined,
                            { label: 'New Marker' }
                        );
                        this.hasUnsavedChanges = true;
                    }
                })
            );

        new Setting(controlsContainer)
            .setName('Grid')
            .setDesc('Show grid overlay on the map')
            .addToggle(toggle => toggle
                .setValue(this.map.gridEnabled || false)
                .onChange(value => {
                    this.map.gridEnabled = value;
                    if (this.mapEditor) {
                        this.mapEditor.toggleGrid(value, this.map.gridSize || 50);
                    }
                    this.hasUnsavedChanges = true;
                })
            )
            .addText(text => text
                .setPlaceholder('Grid size')
                .setValue(String(this.map.gridSize || 50))
                .onChange(value => {
                    const size = parseInt(value);
                    if (!isNaN(size) && size > 0) {
                        this.map.gridSize = size;
                        if (this.mapEditor && this.map.gridEnabled) {
                            this.mapEditor.toggleGrid(true, size);
                        }
                        this.hasUnsavedChanges = true;
                    }
                })
            );
    }

    // Initialize the map editor component
    private async initializeMapEditor(): Promise<void> {
        if (!this.editorContainer) return;

        this.mapEditor = new MapEditor({
            container: this.editorContainer,
            app: this.app,
            readOnly: false,
            onMarkerClick: (marker) => {
                new Notice(`Marker: ${marker.label || marker.locationName || 'Unnamed'}`);
            },
            onMapChange: () => {
                this.hasUnsavedChanges = true;
            }
        });

        await this.mapEditor.initMap(this.map);
    }

    // Background Image Tab
    private renderBackgroundTab(container: HTMLElement): void {
        container.createEl('p', { 
            text: 'Upload or select a background image for your map.', 
            cls: 'storyteller-help-text' 
        });

        // Current background
        if (this.map.backgroundImagePath) {
            const previewContainer = container.createDiv('storyteller-map-background-preview');
            previewContainer.createEl('strong', { text: 'Current Background:' });
            previewContainer.createEl('p', { text: this.map.backgroundImagePath });
            
            // Show preview if possible
            const imgEl = previewContainer.createEl('img');
            imgEl.style.maxWidth = '100%';
            imgEl.style.maxHeight = '300px';
            imgEl.style.marginTop = '10px';
            imgEl.style.border = '1px solid var(--background-modifier-border)';
            imgEl.style.borderRadius = '4px';
            
            const file = this.app.vault.getAbstractFileByPath(this.map.backgroundImagePath);
            if (file && 'stat' in file) {
                imgEl.src = this.app.vault.getResourcePath(file as any);
            }
        }

        // Upload new background
        new Setting(container)
            .setName('Background Image')
            .setDesc('Select or upload a map image')
            .addButton(button => button
                .setButtonText('Select from Gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, async (selectedImage) => {
                        if (selectedImage && selectedImage.filePath) {
                            this.map.backgroundImagePath = selectedImage.filePath;
                            if (this.mapEditor) {
                                await this.mapEditor.setBackgroundImage(selectedImage.filePath);
                            }
                            this.hasUnsavedChanges = true;
                            this.renderTabContent(container.parentElement!);
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
                    fileInput.onchange = async () => {
                        const file = fileInput.files?.[0];
                        if (file) {
                            try {
                                await this.plugin.ensureFolder(this.plugin.settings.galleryUploadFolder);
                                
                                const timestamp = Date.now();
                                const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                                const fileName = `${timestamp}_${sanitizedName}`;
                                const filePath = `${this.plugin.settings.galleryUploadFolder}/${fileName}`;
                                
                                const arrayBuffer = await file.arrayBuffer();
                                await this.app.vault.createBinary(filePath, arrayBuffer);
                                
                                this.map.backgroundImagePath = filePath;
                                if (this.mapEditor) {
                                    await this.mapEditor.setBackgroundImage(filePath);
                                }
                                this.hasUnsavedChanges = true;
                                this.renderTabContent(container.parentElement!);
                                
                                new Notice('Background image uploaded');
                            } catch (error) {
                                console.error('Error uploading background:', error);
                                new Notice('Error uploading image');
                            }
                        }
                    };
                    fileInput.click();
                })
            )
            .addButton(button => button
                .setButtonText('Clear')
                .setClass('mod-warning')
                .onClick(() => {
                    this.map.backgroundImagePath = undefined;
                    this.map.width = undefined;
                    this.map.height = undefined;
                    this.hasUnsavedChanges = true;
                    this.renderTabContent(container.parentElement!);
                    new Notice('Background cleared');
                })
            );

        // Image dimensions
        if (this.map.width && this.map.height) {
            new Setting(container)
                .setName('Dimensions')
                .setDesc(`${this.map.width} × ${this.map.height} pixels`);
        }
    }

    // Markers Tab
    private renderMarkersTab(container: HTMLElement): void {
        container.createEl('h3', { text: 'Map Markers' });
        
        if (this.map.markers.length === 0) {
            container.createEl('p', { 
                text: 'No markers on this map yet. Add markers from the Map Editor tab.', 
                cls: 'storyteller-modal-list-empty' 
            });
            return;
        }

        const markerListContainer = container.createDiv('storyteller-marker-list');

        this.map.markers.forEach((marker, index) => {
            const markerItem = markerListContainer.createDiv('storyteller-list-item');
            
            const infoEl = markerItem.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { 
                text: marker.label || marker.locationName || `Marker ${index + 1}` 
            });
            
            if (marker.locationName) {
                infoEl.createEl('p', { text: `Location: ${marker.locationName}` });
            }
            
            if (marker.description) {
                infoEl.createEl('p', { text: marker.description });
            }
            
            infoEl.createEl('small', { 
                text: `Position: (${marker.lat.toFixed(2)}, ${marker.lng.toFixed(2)})` 
            });

            const actionsEl = markerItem.createDiv('storyteller-list-item-actions');
            
            new ButtonComponent(actionsEl)
                .setIcon('link')
                .setTooltip('Link to location')
                .onClick(() => {
                    new LocationSuggestModal(this.app, this.plugin, async (selectedLocation) => {
                        if (selectedLocation) {
                            marker.locationName = selectedLocation.name;
                            marker.label = marker.label || selectedLocation.name;
                            this.hasUnsavedChanges = true;
                            this.renderTabContent(container.parentElement!);
                        }
                    }).open();
                });
            
            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip('Delete marker')
                .setClass('mod-warning')
                .onClick(() => {
                    if (confirm(`Delete marker "${marker.label || 'Unnamed'}"?`)) {
                        if (this.mapEditor) {
                            this.mapEditor.removeMarker(marker.id);
                        }
                        const idx = this.map.markers.findIndex(m => m.id === marker.id);
                        if (idx !== -1) {
                            this.map.markers.splice(idx, 1);
                        }
                        this.hasUnsavedChanges = true;
                        this.renderTabContent(container.parentElement!);
                    }
                });
        });

        // Add new marker button
        new Setting(container)
            .addButton(button => button
                .setButtonText('Add Marker at Center')
                .setIcon('plus')
                .onClick(() => {
                    this.switchTab('editor');
                })
            );
    }

    // Hierarchy Tab
    private renderHierarchyTab(container: HTMLElement): void {
        container.createEl('h3', { text: 'Map Hierarchy' });
        container.createEl('p', { 
            text: 'Organize maps hierarchically (e.g., World > Region > City).', 
            cls: 'storyteller-help-text' 
        });

        // Parent map
        let parentMapDesc: HTMLElement;
        new Setting(container)
            .setName('Parent Map')
            .setDesc('')
            .then(setting => {
                parentMapDesc = setting.descEl.createEl('small', { 
                    text: `Current: ${this.map.parentMapId || 'None (root level)'}` 
                });
            })
            .addButton(button => button
                .setButtonText('Select Parent')
                .onClick(async () => {
                    // This would open a map selector modal (simplified for now)
                    new Notice('Map selector coming soon');
                })
            )
            .addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear parent')
                .onClick(() => {
                    this.map.parentMapId = undefined;
                    parentMapDesc.setText('Current: None (root level)');
                    this.hasUnsavedChanges = true;
                })
            );

        // Child maps
        if (this.map.childMapIds && this.map.childMapIds.length > 0) {
            container.createEl('h4', { text: 'Child Maps' });
            const childList = container.createDiv('storyteller-child-maps-list');
            this.map.childMapIds.forEach(childId => {
                childList.createEl('li', { text: childId });
            });
        }
    }

    // Metadata Tab
    private renderMetadataTab(container: HTMLElement): void {
        // Linked locations
        container.createEl('h3', { text: 'Linked Locations' });
        
        const locationsList = container.createDiv('storyteller-linked-locations');
        if (this.map.linkedLocations && this.map.linkedLocations.length > 0) {
            this.map.linkedLocations.forEach(loc => {
                locationsList.createEl('li', { text: loc });
            });
        } else {
            locationsList.createEl('p', { 
                text: 'No linked locations yet. Link locations from the Markers tab.', 
                cls: 'storyteller-modal-list-empty' 
            });
        }

        // Timestamps
        if (this.map.created) {
            new Setting(container)
                .setName('Created')
                .setDesc(new Date(this.map.created).toLocaleString());
        }

        if (this.map.modified) {
            new Setting(container)
                .setName('Last Modified')
                .setDesc(new Date(this.map.modified).toLocaleString());
        }

        // Custom fields
        container.createEl('h3', { text: 'Custom Fields' });
        container.createEl('p', { 
            text: 'Custom fields functionality to be added', 
            cls: 'storyteller-help-text' 
        });
    }

    // Render action buttons
    private renderActionButtons(container: HTMLElement): void {
        const buttonsSetting = new Setting(container)
            .setClass('storyteller-modal-buttons');

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete Map')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Delete map "${this.map.name}"?`)) {
                        if (this.onDelete) {
                            await this.onDelete(this.map);
                            new Notice(`Map "${this.map.name}" deleted`);
                            this.close();
                        }
                    }
                })
            );
        }

        buttonsSetting.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });

        buttonsSetting
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => {
                    if (this.hasUnsavedChanges) {
                        if (confirm('You have unsaved changes. Discard them?')) {
                            this.close();
                        }
                    } else {
                        this.close();
                    }
                })
            )
            .addButton(button => button
                .setButtonText(this.isNew ? 'Create Map' : 'Save Changes')
                .setCta()
                .onClick(async () => {
                    if (!this.map.name?.trim()) {
                        new Notice('Map name is required');
                        return;
                    }

                    // Get final map state from editor
                    if (this.mapEditor) {
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

                    try {
                        await this.onSubmit(this.map);
                        new Notice(`Map "${this.map.name}" ${this.isNew ? 'created' : 'saved'}`);
                        this.close();
                    } catch (error) {
                        console.error('Error saving map:', error);
                        new Notice('Failed to save map');
                    }
                })
            );
    }

    onClose(): void {
        if (this.mapEditor) {
            this.mapEditor.destroy();
            this.mapEditor = null;
        }
        this.contentEl.empty();
    }
}

