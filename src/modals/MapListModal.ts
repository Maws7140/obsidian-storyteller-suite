/**
 * DEPRECATED: Map functionality has been deprecated and will be removed in a future version.
 * This file is kept for backward compatibility only.
 */

// MapListModal - Browse and manage maps with hierarchical view
// Provides filtering, search, and quick actions for map management

import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { Map as StoryMap } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { MapViewerModal } from './MapViewerModal';
import { buildMapHierarchy, filterMapsByScale } from '../utils/MapUtils';

export class MapListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    maps: StoryMap[];
    listContainer: HTMLElement;
    private currentFilter: string = '';
    private currentScaleFilter: StoryMap['scale'] | 'all' = 'all';
    private viewMode: 'list' | 'hierarchy' | 'grid' = 'list';

    constructor(app: App, plugin: StorytellerSuitePlugin, maps: StoryMap[]) {
        super(app);
        this.plugin = plugin;
        this.maps = maps;
        this.modalEl.addClass('storyteller-list-modal');
        this.modalEl.addClass('storyteller-map-list-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        
        // Header
        const headerContainer = contentEl.createDiv('storyteller-map-list-header');
        headerContainer.createEl('h2', { text: 'Maps' });

        // Statistics
        const statsEl = headerContainer.createDiv('storyteller-map-stats');
        statsEl.createEl('span', { 
            text: `${this.maps.length} map${this.maps.length !== 1 ? 's' : ''}` 
        });
        const totalMarkers = this.maps.reduce((sum, map) => sum + map.markers.length, 0);
        statsEl.createEl('span', { text: ` • ${totalMarkers} marker${totalMarkers !== 1 ? 's' : ''}` });

        // Filters and view controls
        const controlsContainer = contentEl.createDiv('storyteller-map-controls');
        
        // Search
        new Setting(controlsContainer)
            .setName('Search')
            .addText(text => {
                text
                    .setPlaceholder('Search maps...')
                    .onChange(value => {
                        this.currentFilter = value.toLowerCase();
                        this.renderList();
                    });
            });

        // Scale filter
        new Setting(controlsContainer)
            .setName('Scale')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('all', 'All Scales')
                    .addOption('world', 'World')
                    .addOption('region', 'Region')
                    .addOption('city', 'City')
                    .addOption('building', 'Building')
                    .addOption('custom', 'Custom')
                    .setValue(this.currentScaleFilter)
                    .onChange(value => {
                        this.currentScaleFilter = value as StoryMap['scale'] | 'all';
                        this.renderList();
                    });
            });

        // View mode toggle
        new Setting(controlsContainer)
            .setName('View')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('list', 'List View')
                    .addOption('hierarchy', 'Hierarchy View')
                    .addOption('grid', 'Grid View')
                    .setValue(this.viewMode)
                    .onChange(value => {
                        this.viewMode = value as 'list' | 'hierarchy' | 'grid';
                        this.renderList();
                    });
            });

        // List container
        this.listContainer = contentEl.createDiv('storyteller-list-container');
        this.renderList();

        // Create new map button
        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText('Create New Map')
                    .setCta()
                    .onClick(async () => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice('Please select or create a story first');
                            return;
                        }
                        this.close();
                        await this.plugin.openMapEditor();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip('Please select or create a story first');
                }
            });
    }

    // Render the map list based on current filters and view mode
    private renderList(): void {
        this.listContainer.empty();

        // Apply filters
        let filtered = this.maps.filter(map =>
            map.name.toLowerCase().includes(this.currentFilter) ||
            (map.description || '').toLowerCase().includes(this.currentFilter)
        );

        if (this.currentScaleFilter !== 'all') {
            filtered = filterMapsByScale(filtered, this.currentScaleFilter);
        }

        if (filtered.length === 0) {
            this.listContainer.createEl('p', { 
                text: 'No maps found' + (this.currentFilter ? ' matching filter' : '') 
            });
            return;
        }

        switch (this.viewMode) {
            case 'list':
                this.renderListView(filtered);
                break;
            case 'hierarchy':
                this.renderHierarchyView(filtered);
                break;
            case 'grid':
                this.renderGridView(filtered);
                break;
        }
    }

    // Render maps as a simple list
    private renderListView(maps: StoryMap[]): void {
        maps.forEach(map => {
            this.renderMapItem(map, this.listContainer);
        });
    }

    // Render maps in hierarchical tree structure
    private renderHierarchyView(maps: StoryMap[]): void {
        const hierarchy = buildMapHierarchy(maps);
        
        if (hierarchy.length === 0) {
            this.listContainer.createEl('p', { text: 'No root-level maps found' });
            return;
        }

        hierarchy.forEach(rootMap => {
            this.renderMapHierarchyNode(rootMap, this.listContainer, 0);
        });
    }

    // Recursively render map hierarchy nodes
    private renderMapHierarchyNode(map: StoryMap, container: HTMLElement, depth: number): void {
        const itemEl = container.createDiv('storyteller-list-item');
        
        // Add indentation for nested maps
        if (depth > 0) {
            itemEl.style.marginLeft = `${depth * 20}px`;
            itemEl.style.borderLeft = '2px solid var(--background-modifier-border)';
            itemEl.style.paddingLeft = '10px';
        }

        this.renderMapItemContent(map, itemEl);

        // Render children if any
        if (map.childMapIds && map.childMapIds.length > 0) {
            const childMaps = this.maps.filter(m => map.childMapIds?.includes(m.id || ''));
            childMaps.forEach(childMap => {
                this.renderMapHierarchyNode(childMap, container, depth + 1);
            });
        }
    }

    // Render maps in grid layout with thumbnails
    private renderGridView(maps: StoryMap[]): void {
        const gridContainer = this.listContainer.createDiv('storyteller-map-grid');
        gridContainer.style.display = 'grid';
        gridContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
        gridContainer.style.gap = '15px';

        maps.forEach(map => {
            this.renderMapGridItem(map, gridContainer);
        });
    }

    // Render a map as a grid item with thumbnail
    private renderMapGridItem(map: StoryMap, container: HTMLElement): void {
        const itemEl = container.createDiv('storyteller-map-grid-item');
        itemEl.style.border = '1px solid var(--background-modifier-border)';
        itemEl.style.borderRadius = '8px';
        itemEl.style.padding = '10px';
        itemEl.style.cursor = 'pointer';

        // Thumbnail
        const thumbnailEl = itemEl.createDiv('storyteller-map-thumbnail');
        thumbnailEl.style.width = '100%';
        thumbnailEl.style.height = '150px';
        thumbnailEl.style.backgroundColor = 'var(--background-secondary)';
        thumbnailEl.style.borderRadius = '4px';
        thumbnailEl.style.marginBottom = '10px';
        thumbnailEl.style.display = 'flex';
        thumbnailEl.style.alignItems = 'center';
        thumbnailEl.style.justifyContent = 'center';
        thumbnailEl.style.overflow = 'hidden';

        if (map.profileImagePath || map.backgroundImagePath) {
            const imgPath = map.profileImagePath || map.backgroundImagePath;
            const file = this.app.vault.getAbstractFileByPath(imgPath!);
            if (file && 'stat' in file) {
                const img = thumbnailEl.createEl('img');
                img.src = this.app.vault.getResourcePath(file as TFile);
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'contain';
            } else {
                thumbnailEl.createEl('span', { text: '🗺️', cls: 'storyteller-map-placeholder' });
            }
        } else {
            thumbnailEl.createEl('span', { text: '🗺️', cls: 'storyteller-map-placeholder' });
        }

        // Map info
        const infoEl = itemEl.createDiv('storyteller-map-grid-info');
        infoEl.createEl('strong', { text: map.name });
        
        const metaEl = infoEl.createDiv('storyteller-map-grid-meta');
        metaEl.style.fontSize = '0.85em';
        metaEl.style.color = 'var(--text-muted)';
        metaEl.style.marginTop = '5px';
        
        metaEl.createEl('span', { text: map.scale.charAt(0).toUpperCase() + map.scale.slice(1) });
        metaEl.createEl('span', { text: ` • ${map.markers.length} marker${map.markers.length !== 1 ? 's' : ''}` });

        // Click to view
        itemEl.onclick = () => {
            this.close();
            new MapViewerModal(this.app, this.plugin, map).open();
        };
    }

    // Render a map as a list item
    private renderMapItem(map: StoryMap, container: HTMLElement): void {
        const itemEl = container.createDiv('storyteller-list-item');
        this.renderMapItemContent(map, itemEl);
    }

    // Render map item content (shared between views)
    private renderMapItemContent(map: StoryMap, itemEl: HTMLElement): void {
        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        
        const nameEl = infoEl.createEl('strong', { text: map.name });
        
        // Scale badge
        const scaleBadge = nameEl.createSpan({
            cls: 'storyteller-map-scale-badge',
            text: ` [${map.scale}]`
        });
        scaleBadge.style.fontSize = '0.85em';
        scaleBadge.style.marginLeft = '5px';
        scaleBadge.style.color = 'var(--text-muted)';

        if (map.description) {
            infoEl.createEl('p', { 
                text: map.description.substring(0, 100) + (map.description.length > 100 ? '...' : '') 
            });
        }

        // Metadata
        const metaEl = infoEl.createDiv('storyteller-list-item-meta');
        metaEl.style.fontSize = '0.85em';
        metaEl.style.color = 'var(--text-muted)';
        
        metaEl.createEl('span', { text: `${map.markers.length} marker${map.markers.length !== 1 ? 's' : ''}` });
        
        if (map.linkedLocations && map.linkedLocations.length > 0) {
            metaEl.createEl('span', { 
                text: ` • ${map.linkedLocations.length} location${map.linkedLocations.length !== 1 ? 's' : ''}` 
            });
        }

        if (map.parentMapId) {
            metaEl.createEl('span', { text: ` • Child of ${map.parentMapId}` });
        }

        // Action buttons
        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

        new ButtonComponent(actionsEl)
            .setIcon('eye')
            .setTooltip('View map')
            .onClick(() => {
                this.close();
                new MapViewerModal(this.app, this.plugin, map).open();
            });

        new ButtonComponent(actionsEl)
            .setIcon('pencil')
            .setTooltip('Edit map')
            .onClick(async () => {
                this.close();
                await this.plugin.openMapEditor(map.id);
            });

        new ButtonComponent(actionsEl)
            .setIcon('copy')
            .setTooltip('Duplicate map')
            .onClick(async () => {
                const duplicate = { 
                    ...map, 
                    id: undefined,
                    name: `${map.name} (Copy)`,
                    filePath: undefined,
                    created: new Date().toISOString(),
                    modified: new Date().toISOString()
                };
                
                try {
                    await this.plugin.saveMap(duplicate);
                    new Notice(`Map duplicated as "${duplicate.name}"`);
                    this.maps = await this.plugin.listMaps();
                    this.renderList();
                } catch (error) {
                    console.error('Error duplicating map:', error);
                    new Notice('Failed to duplicate map');
                }
            });

        new ButtonComponent(actionsEl)
            .setIcon('trash')
            .setTooltip('Delete map')
            .setClass('mod-warning')
            .onClick(async () => {
                if (confirm(`Delete map "${map.name}"?`)) {
                    if (map.filePath) {
                        try {
                            await this.plugin.deleteMap(map.filePath);
                            this.maps = this.maps.filter(m => m.filePath !== map.filePath);
                            this.renderList();
                            new Notice(`Map "${map.name}" deleted`);
                        } catch (error) {
                            console.error('Error deleting map:', error);
                            new Notice('Failed to delete map');
                        }
                    }
                }
            });

        new ButtonComponent(actionsEl)
            .setIcon('go-to-file')
            .setTooltip('Open note')
            .onClick(() => {
                if (!map.filePath) {
                    new Notice('Map file not found');
                    return;
                }
                const file = this.app.vault.getAbstractFileByPath(map.filePath);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf(false).openFile(file);
                    this.close();
                } else {
                    new Notice('Failed to open map note');
                }
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}



