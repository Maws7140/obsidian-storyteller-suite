// Network Graph Modal - Popup overlay for network visualization
// Provides a modal interface for viewing the entity relationship graph

import { App, ButtonComponent, Setting } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { NetworkGraphRenderer } from '../views/NetworkGraphRenderer';
import { GraphFilters } from '../types';

/**
 * NetworkGraphModal displays the network graph in a large modal overlay
 * Includes all controls for search, zoom, layout, filters, and export
 */
export class NetworkGraphModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private graphRenderer: NetworkGraphRenderer | null = null;
    private currentFilters: GraphFilters = {};
    private controlsContainer: HTMLElement | null = null;
    private graphContainer: HTMLElement | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('storyteller-network-graph-modal');

        // Make modal larger for graph visualization
        this.modalEl.style.width = '90vw';
        this.modalEl.style.maxWidth = '1400px';
        this.modalEl.style.height = '85vh';
        contentEl.style.height = '100%';
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';

        // Create header
        const header = contentEl.createDiv('modal-header');
        header.style.borderBottom = '1px solid var(--background-modifier-border)';
        header.style.paddingBottom = '0.5rem';
        header.style.marginBottom = '1rem';
        
        const title = header.createEl('h2', { text: t('networkGraph') });
        title.style.margin = '0 0 0.25rem 0';

        const subtitle = header.createEl('p', { 
            text: 'Interactive visualization of relationships between story entities',
            cls: 'storyteller-network-graph-subtitle'
        });
        subtitle.style.margin = '0';
        subtitle.style.color = 'var(--text-muted)';
        subtitle.style.fontSize = '0.9em';

        // Create controls container
        this.controlsContainer = contentEl.createDiv('storyteller-network-controls');
        this.controlsContainer.style.display = 'flex';
        this.controlsContainer.style.flexWrap = 'wrap';
        this.controlsContainer.style.gap = '0.5rem';
        this.controlsContainer.style.alignItems = 'center';
        this.controlsContainer.style.marginBottom = '1rem';
        this.controlsContainer.style.paddingBottom = '1rem';
        this.controlsContainer.style.borderBottom = '1px solid var(--background-modifier-border)';

        // Initialize graph
        this.initializeGraph();
    }

    async initializeGraph(): Promise<void> {
        if (!this.controlsContainer || !this.contentEl) return;

        let graphRenderer = this.graphRenderer;

        // Search box
        const searchContainer = this.controlsContainer.createDiv();
        searchContainer.style.flex = '1';
        searchContainer.style.minWidth = '200px';
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: t('searchEntities'),
            cls: 'storyteller-network-search'
        });
        searchInput.style.width = '100%';
        searchInput.style.padding = '6px 12px';
        searchInput.style.border = '1px solid var(--background-modifier-border)';
        searchInput.style.borderRadius = '4px';
        searchInput.style.backgroundColor = 'var(--background-primary)';

        searchInput.addEventListener('input', () => {
            const term = searchInput.value.trim();
            if (term) {
                graphRenderer?.searchAndHighlight(term);
            } else {
                graphRenderer?.clearSearch();
            }
        });

        // Layout dropdown
        const layoutContainer = this.controlsContainer.createDiv();
        layoutContainer.style.display = 'flex';
        layoutContainer.style.gap = '0.5rem';
        layoutContainer.style.alignItems = 'center';
        
        const layoutLabel = layoutContainer.createEl('label', { text: t('layout') + ':' });
        layoutLabel.style.fontSize = '0.9em';
        layoutLabel.style.color = 'var(--text-muted)';
        
        const layoutSelect = layoutContainer.createEl('select', { cls: 'dropdown' });
        layoutSelect.style.padding = '4px 8px';
        layoutSelect.style.border = '1px solid var(--background-modifier-border)';
        layoutSelect.style.borderRadius = '4px';
        layoutSelect.style.backgroundColor = 'var(--background-primary)';
        
        const layouts = [
            { value: 'cose', label: t('forceDirected') },
            { value: 'circle', label: t('circle') },
            { value: 'grid', label: t('grid') },
            { value: 'concentric', label: t('concentric') }
        ];
        
        layouts.forEach(layout => {
            const option = layoutSelect.createEl('option', { 
                value: layout.value,
                text: layout.label
            });
        });

        layoutSelect.addEventListener('change', () => {
            const selectedLayout = layoutSelect.value as 'cose' | 'circle' | 'grid' | 'concentric';
            graphRenderer?.changeLayout(selectedLayout);
        });

        // Zoom controls
        const zoomContainer = this.controlsContainer.createDiv();
        zoomContainer.style.display = 'flex';
        zoomContainer.style.gap = '0.25rem';

        const createZoomButton = (text: string, icon: string, onClick: () => void) => {
            const btn = new ButtonComponent(zoomContainer);
            btn.setButtonText(text)
                .setTooltip(text)
                .onClick(onClick);
            btn.buttonEl.style.padding = '4px 12px';
            return btn;
        };

        createZoomButton('+', 'zoom-in', () => graphRenderer?.zoomIn());
        createZoomButton('-', 'zoom-out', () => graphRenderer?.zoomOut());
        createZoomButton('⊡', 'fit-to-view', () => graphRenderer?.fitToView());

        // Filter button
        const filterBtn = new ButtonComponent(this.controlsContainer);
        filterBtn.setButtonText(t('graphFilters'))
            .onClick(() => this.showFilterModal());
        filterBtn.buttonEl.style.padding = '6px 12px';

        // Export button
        const exportBtn = new ButtonComponent(this.controlsContainer);
        exportBtn.setButtonText(t('exportGraph'))
            .onClick(() => this.showExportMenu());
        exportBtn.buttonEl.style.padding = '6px 12px';

        // Refresh button
        const refreshBtn = new ButtonComponent(this.controlsContainer);
        refreshBtn.setButtonText('↻')
            .setTooltip('Refresh graph')
            .onClick(async () => {
                await graphRenderer?.refresh();
            });
        refreshBtn.buttonEl.style.padding = '6px 12px';

        // Create graph container
        this.graphContainer = this.contentEl.createDiv('storyteller-network-graph-container');
        this.graphContainer.style.flex = '1';
        this.graphContainer.style.overflow = 'hidden';
        this.graphContainer.style.position = 'relative';
        this.graphContainer.style.minHeight = '400px';

        // Initialize graph renderer
        try {
            graphRenderer = new NetworkGraphRenderer(this.graphContainer, this.plugin);
            await graphRenderer.initializeCytoscape();
            this.graphRenderer = graphRenderer;
        } catch (error) {
            console.error('Error initializing network graph:', error);
            this.graphContainer.createEl('p', {
                text: 'Error loading network graph. See console for details.',
                cls: 'storyteller-empty-state'
            });
        }
    }

    /**
     * Show filter modal for graph customization
     */
    private showFilterModal(): void {
        // Create a simple filter interface
        const modal = new (class extends require('obsidian').Modal {
            constructor(app: any, parentModal: NetworkGraphModal) {
                super(app);
                this.parentModal = parentModal;
            }

            parentModal: NetworkGraphModal;

            onOpen() {
                const { contentEl } = this;
                contentEl.empty();
                contentEl.createEl('h3', { text: t('graphFilters') });

                // Entity type filters
                const entitySection = contentEl.createDiv();
                entitySection.createEl('h4', { text: t('selectEntityTypes') });
                
                const entityTypes: ('character' | 'location' | 'event' | 'item')[] = ['character', 'location', 'event', 'item'];
                const selectedTypes: ('character' | 'location' | 'event' | 'item')[] = this.parentModal.currentFilters.entityTypes || [];

                entityTypes.forEach(type => {
                    const labelKey = (type + 's') as 'characters' | 'locations' | 'events' | 'items';
                    const setting = new Setting(entitySection)
                        .setName(t(labelKey))
                        .addToggle(toggle => {
                            toggle.setValue(selectedTypes.length === 0 || selectedTypes.includes(type))
                                .onChange(value => {
                                    if (value) {
                                        if (!selectedTypes.includes(type)) {
                                            selectedTypes.push(type);
                                        }
                                    } else {
                                        const idx = selectedTypes.indexOf(type);
                                        if (idx > -1) selectedTypes.splice(idx, 1);
                                    }
                                });
                        });
                });

                // Apply button
                const btnContainer = contentEl.createDiv();
                btnContainer.style.marginTop = '1rem';
                btnContainer.style.display = 'flex';
                btnContainer.style.gap = '0.5rem';
                btnContainer.style.justifyContent = 'flex-end';

                new ButtonComponent(btnContainer)
                    .setButtonText(t('applyFilters'))
                    .setCta()
                    .onClick(async () => {
                        this.parentModal.currentFilters = {
                            ...this.parentModal.currentFilters,
                            entityTypes: selectedTypes.length > 0 ? selectedTypes as ('character' | 'location' | 'event' | 'item')[] : undefined
                        };
                        await this.parentModal.graphRenderer?.applyFilters(this.parentModal.currentFilters);
                        this.close();
                    });

                new ButtonComponent(btnContainer)
                    .setButtonText(t('resetFilters'))
                    .onClick(async () => {
                        this.parentModal.currentFilters = {};
                        await this.parentModal.graphRenderer?.applyFilters({});
                        this.close();
                    });
            }
        })(this.app, this);

        modal.open();
    }

    /**
     * Show export menu for graph export options
     */
    private showExportMenu(): void {
        const menu = new (require('obsidian').Menu)();
        
        menu.addItem((item: any) => {
            item.setTitle(t('exportAsPNG'))
                .setIcon('image')
                .onClick(() => {
                    this.graphRenderer?.exportAsImage('png');
                });
        });

        menu.addItem((item: any) => {
            item.setTitle(t('exportAsJPG'))
                .setIcon('image')
                .onClick(() => {
                    this.graphRenderer?.exportAsImage('jpg');
                });
        });

        // Show menu at the export button
        const exportBtn = this.controlsContainer?.querySelector('button:last-of-type');
        if (exportBtn) {
            menu.showAtMouseEvent(new MouseEvent('click', { 
                clientX: exportBtn.getBoundingClientRect().left,
                clientY: exportBtn.getBoundingClientRect().bottom
            }));
        }
    }

    onClose(): void {
        super.onClose();
        // Clean up graph renderer
        if (this.graphRenderer) {
            this.graphRenderer.destroy();
            this.graphRenderer = null;
        }
    }
}

