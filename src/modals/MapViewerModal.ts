// MapViewerModal - Read-only map viewer with clickable markers
// Allows users to view maps, navigate hierarchy, and open linked locations

import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { Map as StoryMap, MapMarker } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { MapEditor } from '../components/MapEditor';
import { MapModal } from './MapModal';
import { LocationModal } from './LocationModal';

export class MapViewerModal extends Modal {
    plugin: StorytellerSuitePlugin;
    map: StoryMap;
    private mapEditor: MapEditor | null = null;
    private editorContainer: HTMLElement | null = null;
    private showLabels: boolean = true;
    private filterVisible: boolean = true;

    constructor(app: App, plugin: StorytellerSuitePlugin, map: StoryMap) {
        super(app);
        this.plugin = plugin;
        this.map = map;
        this.modalEl.addClass('storyteller-map-viewer-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        const headerContainer = contentEl.createDiv('storyteller-map-viewer-header');
        
        const titleContainer = headerContainer.createDiv('storyteller-map-viewer-title');
        titleContainer.createEl('h2', { text: this.map.name });
        
        // Scale badge
        const scaleBadge = titleContainer.createSpan({
            cls: 'storyteller-map-scale-badge',
            text: this.map.scale.toUpperCase()
        });
        scaleBadge.style.marginLeft = '10px';
        scaleBadge.style.padding = '4px 8px';
        scaleBadge.style.backgroundColor = 'var(--interactive-accent)';
        scaleBadge.style.color = 'white';
        scaleBadge.style.borderRadius = '4px';
        scaleBadge.style.fontSize = '0.75em';

        if (this.map.description) {
            headerContainer.createEl('p', { 
                text: this.map.description,
                cls: 'storyteller-map-description'
            });
        }

        // Map statistics
        const statsContainer = headerContainer.createDiv('storyteller-map-stats');
        statsContainer.style.marginTop = '10px';
        statsContainer.style.fontSize = '0.9em';
        statsContainer.style.color = 'var(--text-muted)';
        
        statsContainer.createEl('span', { 
            text: `${this.map.markers.length} marker${this.map.markers.length !== 1 ? 's' : ''}` 
        });
        
        if (this.map.linkedLocations && this.map.linkedLocations.length > 0) {
            statsContainer.createEl('span', { 
                text: ` • ${this.map.linkedLocations.length} location${this.map.linkedLocations.length !== 1 ? 's' : ''}` 
            });
        }

        // Controls
        const controlsContainer = contentEl.createDiv('storyteller-map-viewer-controls');
        
        new Setting(controlsContainer)
            .setName('View Options')
            .addToggle(toggle => toggle
                .setTooltip('Show marker labels')
                .setValue(this.showLabels)
                .onChange(value => {
                    this.showLabels = value;
                    // Re-render would go here
                    new Notice(value ? 'Labels shown' : 'Labels hidden');
                })
            )
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
                .setButtonText('Edit Map')
                .setIcon('pencil')
                .onClick(() => {
                    this.close();
                    new MapModal(this.app, this.plugin, this.map, async (updatedData: StoryMap) => {
                        await this.plugin.saveMap(updatedData);
                        new Notice(`Map "${updatedData.name}" updated`);
                    }).open();
                })
            );

        // Map container
        this.editorContainer = contentEl.createDiv('storyteller-map-viewer-container');
        this.editorContainer.style.width = '100%';
        this.editorContainer.style.height = '500px';
        this.editorContainer.style.border = '1px solid var(--background-modifier-border)';
        this.editorContainer.style.borderRadius = '8px';
        this.editorContainer.style.marginTop = '10px';

        // Initialize read-only map viewer
        this.initializeMapViewer();

        // Hierarchy navigation
        if (this.map.parentMapId || (this.map.childMapIds && this.map.childMapIds.length > 0)) {
            this.renderHierarchyNavigation(contentEl);
        }

        // Linked locations list
        if (this.map.linkedLocations && this.map.linkedLocations.length > 0) {
            this.renderLinkedLocations(contentEl);
        }

        // Close button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Close')
                .onClick(() => this.close())
            );
    }

    // Initialize the map viewer (read-only)
    private async initializeMapViewer(): Promise<void> {
        if (!this.editorContainer) return;

        this.mapEditor = new MapEditor({
            container: this.editorContainer,
            app: this.app,
            readOnly: true,
            onMarkerClick: (marker) => this.handleMarkerClick(marker)
        });

        await this.mapEditor.initMap(this.map);
    }

    // Handle marker click - open location if linked
    private async handleMarkerClick(marker: MapMarker): Promise<void> {
        if (marker.locationName) {
            // Try to find and open the location
            const locations = await this.plugin.listLocations();
            const location = locations.find(loc => loc.name === marker.locationName);
            
            if (location) {
                this.close();
                new LocationModal(
                    this.app, 
                    this.plugin, 
                    location, 
                    async (updatedData) => {
                        await this.plugin.saveLocation(updatedData);
                        new Notice(`Location "${updatedData.name}" updated`);
                    }
                ).open();
            } else {
                new Notice(`Location "${marker.locationName}" not found`);
            }
        } else {
            new Notice(`Marker: ${marker.label || 'Unnamed'}`);
        }
    }

    // Render hierarchy navigation section
    private renderHierarchyNavigation(container: HTMLElement): void {
        const hierarchySection = container.createDiv('storyteller-map-hierarchy-section');
        hierarchySection.style.marginTop = '20px';
        hierarchySection.style.padding = '15px';
        hierarchySection.style.border = '1px solid var(--background-modifier-border)';
        hierarchySection.style.borderRadius = '8px';

        hierarchySection.createEl('h3', { text: 'Map Hierarchy' });

        // Parent map
        if (this.map.parentMapId) {
            const parentSetting = new Setting(hierarchySection)
                .setName('Parent Map')
                .setDesc(`Go to parent map: ${this.map.parentMapId}`)
                .addButton(button => button
                    .setButtonText('View Parent')
                    .setIcon('arrow-up')
                    .onClick(async () => {
                        const maps = await this.plugin.listMaps();
                        const parentMap = maps.find(m => m.id === this.map.parentMapId);
                        if (parentMap) {
                            this.close();
                            new MapViewerModal(this.app, this.plugin, parentMap).open();
                        } else {
                            new Notice('Parent map not found');
                        }
                    })
                );
        }

        // Child maps
        if (this.map.childMapIds && this.map.childMapIds.length > 0) {
            hierarchySection.createEl('h4', { text: 'Child Maps' });
            
            const childListContainer = hierarchySection.createDiv('storyteller-child-maps-list');
            
            this.map.childMapIds.forEach(async (childId) => {
                const maps = await this.plugin.listMaps();
                const childMap = maps.find(m => m.id === childId);
                
                if (childMap) {
                    const childItem = childListContainer.createDiv('storyteller-child-map-item');
                    childItem.style.display = 'flex';
                    childItem.style.justifyContent = 'space-between';
                    childItem.style.alignItems = 'center';
                    childItem.style.padding = '8px';
                    childItem.style.marginTop = '5px';
                    childItem.style.border = '1px solid var(--background-modifier-border)';
                    childItem.style.borderRadius = '4px';

                    const nameEl = childItem.createSpan({ text: childMap.name });
                    
                    const viewBtn = new ButtonComponent(childItem);
                    viewBtn
                        .setButtonText('View')
                        .setIcon('arrow-right')
                        .onClick(() => {
                            this.close();
                            new MapViewerModal(this.app, this.plugin, childMap).open();
                        });
                }
            });
        }
    }

    // Render linked locations section
    private renderLinkedLocations(container: HTMLElement): void {
        const locationsSection = container.createDiv('storyteller-linked-locations-section');
        locationsSection.style.marginTop = '20px';
        locationsSection.style.padding = '15px';
        locationsSection.style.border = '1px solid var(--background-modifier-border)';
        locationsSection.style.borderRadius = '8px';

        locationsSection.createEl('h3', { text: 'Linked Locations' });

        const locationsList = locationsSection.createDiv('storyteller-locations-list');
        
        this.map.linkedLocations!.forEach(locationName => {
            const locationItem = locationsList.createDiv('storyteller-location-item');
            locationItem.style.display = 'flex';
            locationItem.style.justifyContent = 'space-between';
            locationItem.style.alignItems = 'center';
            locationItem.style.padding = '8px';
            locationItem.style.marginTop = '5px';
            locationItem.style.border = '1px solid var(--background-modifier-border)';
            locationItem.style.borderRadius = '4px';
            locationItem.style.cursor = 'pointer';

            const nameEl = locationItem.createSpan({ text: locationName });
            
            // Find markers for this location
            const markers = this.map.markers.filter(m => m.locationName === locationName);
            if (markers.length > 0) {
                const markerCountEl = locationItem.createSpan({ 
                    text: `${markers.length} marker${markers.length !== 1 ? 's' : ''}` 
                });
                markerCountEl.style.fontSize = '0.85em';
                markerCountEl.style.color = 'var(--text-muted)';
            }

            const actionsContainer = locationItem.createDiv();
            
            new ButtonComponent(actionsContainer)
                .setButtonText('View')
                .setIcon('eye')
                .onClick(async () => {
                    const locations = await this.plugin.listLocations();
                    const location = locations.find(loc => loc.name === locationName);
                    
                    if (location) {
                        this.close();
                        new LocationModal(
                            this.app, 
                            this.plugin, 
                            location, 
                            async (updatedData) => {
                                await this.plugin.saveLocation(updatedData);
                                new Notice(`Location "${updatedData.name}" updated`);
                            }
                        ).open();
                    } else {
                        new Notice(`Location "${locationName}" not found`);
                    }
                });
        });
    }

    onClose(): void {
        if (this.mapEditor) {
            this.mapEditor.destroy();
            this.mapEditor = null;
        }
        this.contentEl.empty();
    }
}



