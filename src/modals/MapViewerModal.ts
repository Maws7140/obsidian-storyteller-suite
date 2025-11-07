/**
 * DEPRECATED: Map functionality has been deprecated and will be removed in a future version.
 * This file is kept for backward compatibility only.
 */

// MapViewerModal - Read-only map viewer with clickable markers
// Allows users to view maps, navigate hierarchy, and open linked locations

import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { Map as StoryMap, MapMarker } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { MapView } from '../map/MapView';
import { LocationModal } from './LocationModal';
import { EventModal } from './EventModal';

export class MapViewerModal extends Modal {
    plugin: StorytellerSuitePlugin;
    map: StoryMap;
    private mapEditor: MapView | null = null;
    private editorContainer: HTMLElement | null = null;
    private showLabels: boolean = true;
    private filterVisible: boolean = true;

    constructor(app: App, plugin: StorytellerSuitePlugin, map: StoryMap) {
        super(app);
        this.plugin = plugin;
        this.map = map;
        this.modalEl.addClass('storyteller-map-viewer-modal');
    }

    async onOpen(): Promise<void> {
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

        // Breadcrumb navigation
        await this.renderBreadcrumbs(headerContainer);

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

        // Quick navigation buttons
        await this.renderQuickNavigation(contentEl);

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
                .onClick(async () => {
                    this.close();
                    await this.plugin.openMapEditor(this.map.id);
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

        this.mapEditor = new MapView({
            container: this.editorContainer,
            app: this.app,
            readOnly: true,
            onMarkerClick: (marker) => this.handleMarkerClick(marker),
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
    }

    // Handle marker click - open location, event, or navigate to child map
    private async handleMarkerClick(marker: MapMarker): Promise<void> {
        const markerType = marker.markerType || 'location';

        if (markerType === 'location' && marker.locationName) {
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
        } else if (markerType === 'event' && marker.eventName) {
            // Try to find and open the event
            const events = await this.plugin.listEvents();
            const event = events.find(evt => evt.name === marker.eventName);

            if (event) {
                this.close();
                new EventModal(
                    this.app,
                    this.plugin,
                    event,
                    async (updatedData) => {
                        await this.plugin.saveEvent(updatedData);
                        new Notice(`Event "${updatedData.name}" updated`);
                    }
                ).open();
            } else {
                new Notice(`Event "${marker.eventName}" not found`);
            }
        } else if (markerType === 'childMap' && marker.childMapId) {
            // Navigate to child map
            const maps = await this.plugin.listMaps();
            const childMap = maps.find(m => m.id === marker.childMapId || m.name === marker.childMapId);

            if (childMap) {
                this.close();
                new MapViewerModal(this.app, this.plugin, childMap).open();
            } else {
                new Notice(`Child map "${marker.childMapId}" not found`);
            }
        } else {
            new Notice(`Marker: ${marker.label || 'Unnamed'}`);
        }
    }

    // Render quick navigation buttons for parent/child maps
    private async renderQuickNavigation(container: HTMLElement): Promise<void> {
        const hasParent = !!this.map.parentMapId;
        const hasChildren = this.map.childMapIds && this.map.childMapIds.length > 0;

        if (!hasParent && !hasChildren) return;

        const navContainer = container.createDiv('storyteller-quick-navigation');
        navContainer.style.marginTop = '15px';
        navContainer.style.padding = '12px';
        navContainer.style.background = 'var(--background-secondary)';
        navContainer.style.borderRadius = '8px';
        navContainer.style.display = 'flex';
        navContainer.style.gap = '10px';
        navContainer.style.alignItems = 'center';

        navContainer.createEl('span', {
            text: 'Navigate:',
            attr: { style: 'font-weight: bold; margin-right: 5px;' }
        });

        // Parent map button
        if (hasParent) {
            const allMaps = await this.plugin.listMaps();
            const parentMap = allMaps.find(m => m.id === this.map.parentMapId || m.name === this.map.parentMapId);

            const parentBtn = new ButtonComponent(navContainer);
            parentBtn
                .setButtonText(`↑ ${parentMap?.name || 'Parent Map'}`)
                .setTooltip('Go to parent map')
                .setClass('storyteller-nav-button')
                .onClick(() => {
                    if (parentMap) {
                        this.close();
                        new MapViewerModal(this.app, this.plugin, parentMap).open();
                    } else {
                        new Notice('Parent map not found');
                    }
                });
        }

        // Child maps dropdown button
        if (hasChildren) {
            const allMaps = await this.plugin.listMaps();
            const childMaps = this.map.childMapIds!
                .map(id => allMaps.find(m => m.id === id || m.name === id))
                .filter(m => m !== undefined) as StoryMap[];

            if (childMaps.length > 0) {
                const childBtn = new ButtonComponent(navContainer);
                childBtn
                    .setButtonText(`↓ ${childMaps.length} Child Map${childMaps.length > 1 ? 's' : ''}`)
                    .setTooltip('View child maps')
                    .setClass('storyteller-nav-button')
                    .onClick(() => {
                        // Show child map selector
                        this.showChildMapSelector(childMaps);
                    });
            }
        }
    }

    // Show child map selector
    private showChildMapSelector(childMaps: StoryMap[]): void {
        const menu = document.createElement('div');
        menu.className = 'menu';
        menu.style.position = 'fixed';
        menu.style.background = 'var(--background-primary)';
        menu.style.border = '1px solid var(--background-modifier-border)';
        menu.style.borderRadius = '4px';
        menu.style.padding = '4px';
        menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        menu.style.zIndex = '1000';
        menu.style.left = '50%';
        menu.style.top = '50%';
        menu.style.transform = 'translate(-50%, -50%)';
        menu.style.maxWidth = '300px';

        childMaps.forEach(childMap => {
            const item = menu.createDiv('menu-item');
            item.textContent = childMap.name;
            item.style.padding = '8px 12px';
            item.style.cursor = 'pointer';

            item.addEventListener('mouseenter', () => {
                item.style.background = 'var(--background-modifier-hover)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = '';
            });

            item.onclick = () => {
                this.close();
                new MapViewerModal(this.app, this.plugin, childMap).open();
                menu.remove();
            };
        });

        document.body.appendChild(menu);

        // Close on click outside
        const closeMenu = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 100);
    }

    // Render breadcrumb navigation
    private async renderBreadcrumbs(container: HTMLElement): Promise<void> {
        if (!this.map.parentMapId) return;

        const breadcrumbContainer = container.createDiv('storyteller-map-breadcrumbs');
        breadcrumbContainer.style.marginTop = '10px';
        breadcrumbContainer.style.padding = '8px 0';
        breadcrumbContainer.style.display = 'flex';
        breadcrumbContainer.style.alignItems = 'center';
        breadcrumbContainer.style.gap = '8px';
        breadcrumbContainer.style.fontSize = '0.9em';
        breadcrumbContainer.style.color = 'var(--text-muted)';

        // Build hierarchy path
        const hierarchy: StoryMap[] = [];
        let currentMapId: string | undefined = this.map.parentMapId;
        const allMaps = await this.plugin.listMaps();

        // Traverse up the hierarchy
        while (currentMapId) {
            const parentMap = allMaps.find(m => m.id === currentMapId || m.name === currentMapId);
            if (!parentMap) break;
            hierarchy.unshift(parentMap);
            currentMapId = parentMap.parentMapId;
        }

        // Render breadcrumbs
        hierarchy.forEach((map, index) => {
            const breadcrumb = breadcrumbContainer.createEl('a', {
                text: map.name,
                cls: 'storyteller-breadcrumb-link'
            });
            breadcrumb.style.color = 'var(--link-color)';
            breadcrumb.style.cursor = 'pointer';
            breadcrumb.style.textDecoration = 'none';

            breadcrumb.addEventListener('mouseenter', () => {
                breadcrumb.style.textDecoration = 'underline';
            });
            breadcrumb.addEventListener('mouseleave', () => {
                breadcrumb.style.textDecoration = 'none';
            });

            breadcrumb.onclick = () => {
                this.close();
                new MapViewerModal(this.app, this.plugin, map).open();
            };

            if (index < hierarchy.length - 1) {
                const separator = breadcrumbContainer.createEl('span', { text: '›' });
                separator.style.opacity = '0.5';
            }
        });

        // Current map (not clickable)
        if (hierarchy.length > 0) {
            const separator = breadcrumbContainer.createEl('span', { text: '›' });
            separator.style.opacity = '0.5';
        }
        const currentCrumb = breadcrumbContainer.createEl('span', { text: this.map.name });
        currentCrumb.style.fontWeight = 'bold';
        currentCrumb.style.color = 'var(--text-normal)';
    }

    // Render hierarchy navigation section with tree view
    private async renderHierarchyNavigation(container: HTMLElement): Promise<void> {
        const hierarchySection = container.createDiv('storyteller-map-hierarchy-section');
        hierarchySection.style.marginTop = '20px';
        hierarchySection.style.padding = '15px';
        hierarchySection.style.border = '1px solid var(--background-modifier-border)';
        hierarchySection.style.borderRadius = '8px';

        hierarchySection.createEl('h3', { text: 'Map Hierarchy Tree' });

        const allMaps = await this.plugin.listMaps();

        // Find root map (topmost ancestor)
        let rootMap = this.map;
        while (rootMap.parentMapId) {
            const parent = allMaps.find(m => m.id === rootMap.parentMapId || m.name === rootMap.parentMapId);
            if (!parent) break;
            rootMap = parent;
        }

        // Render tree starting from root
        const treeContainer = hierarchySection.createDiv('storyteller-hierarchy-tree');
        treeContainer.style.marginTop = '12px';
        await this.renderMapTreeNode(treeContainer, rootMap, allMaps, 0);
    }

    // Recursively render map tree node
    private async renderMapTreeNode(
        container: HTMLElement,
        map: StoryMap,
        allMaps: StoryMap[],
        depth: number
    ): Promise<void> {
        const nodeContainer = container.createDiv('storyteller-tree-node');
        nodeContainer.style.marginLeft = `${depth * 20}px`;
        nodeContainer.style.marginTop = depth > 0 ? '4px' : '0';
        nodeContainer.style.padding = '6px 10px';
        nodeContainer.style.borderRadius = '4px';
        nodeContainer.style.cursor = 'pointer';
        nodeContainer.style.transition = 'all 0.2s ease';

        // Highlight current map
        const isCurrent = map.id === this.map.id || map.name === this.map.name;
        if (isCurrent) {
            nodeContainer.style.background = 'var(--interactive-accent)';
            nodeContainer.style.color = 'var(--text-on-accent)';
            nodeContainer.style.fontWeight = 'bold';
        }

        // Node content
        const nodeContent = nodeContainer.createDiv();
        nodeContent.style.display = 'flex';
        nodeContent.style.alignItems = 'center';
        nodeContent.style.gap = '8px';

        // Expand/collapse icon for nodes with children
        const hasChildren = map.childMapIds && map.childMapIds.length > 0;
        if (hasChildren) {
            const expandIcon = nodeContent.createSpan({
                text: '▸',
                cls: 'storyteller-tree-expand-icon'
            });
            expandIcon.style.fontSize = '12px';
            expandIcon.style.transition = 'transform 0.2s ease';
        } else {
            nodeContent.createSpan({ text: '  ' }); // Spacer for alignment
        }

        // Map name
        const mapName = nodeContent.createSpan({ text: map.name });

        // Scale badge
        const scaleBadge = nodeContent.createSpan({
            text: (map.scale || 'custom').substring(0, 1).toUpperCase(),
            cls: 'storyteller-tree-scale-badge'
        });
        scaleBadge.style.fontSize = '10px';
        scaleBadge.style.padding = '2px 6px';
        scaleBadge.style.borderRadius = '3px';
        scaleBadge.style.background = isCurrent ? 'rgba(255,255,255,0.2)' : 'var(--background-modifier-border)';

        // Child container (initially hidden)
        let childContainer: HTMLElement | null = null;
        let isExpanded = depth < 2 || isCurrent; // Auto-expand first 2 levels and current map

        if (hasChildren) {
            childContainer = container.createDiv('storyteller-tree-children');
            childContainer.style.display = isExpanded ? 'block' : 'none';

            // Render children
            const childMaps = map.childMapIds!
                .map(id => allMaps.find(m => m.id === id || m.name === id))
                .filter(m => m !== undefined) as StoryMap[];

            for (const childMap of childMaps) {
                await this.renderMapTreeNode(childContainer, childMap, allMaps, depth + 1);
            }

            // Toggle expand/collapse
            const expandIcon = nodeContent.querySelector('.storyteller-tree-expand-icon') as HTMLElement;
            if (expandIcon && isExpanded) {
                expandIcon.style.transform = 'rotate(90deg)';
            }

            nodeContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                isExpanded = !isExpanded;
                childContainer!.style.display = isExpanded ? 'block' : 'none';
                if (expandIcon) {
                    expandIcon.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
                }
            });
        } else {
            // No children - navigate on click
            nodeContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isCurrent) {
                    this.close();
                    new MapViewerModal(this.app, this.plugin, map).open();
                }
            });
        }

        // Hover effect
        if (!isCurrent) {
            nodeContainer.addEventListener('mouseenter', () => {
                nodeContainer.style.background = 'var(--background-modifier-hover)';
            });
            nodeContainer.addEventListener('mouseleave', () => {
                nodeContainer.style.background = '';
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



