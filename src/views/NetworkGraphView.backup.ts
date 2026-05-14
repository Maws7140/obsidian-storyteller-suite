// Network Graph View - Full workspace view for network visualization
// Provides a dedicated panel for viewing and interacting with the entity relationship graph

import { ItemView, WorkspaceLeaf, Setting, ButtonComponent } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { NetworkGraphRenderer } from './NetworkGraphRenderer';
import { GraphFilters } from '../types';

export const VIEW_TYPE_NETWORK_GRAPH = 'storyteller-network-graph-view';

/**
 * NetworkGraphView provides a full-screen dedicated view for the network graph
 * Users can open this in any workspace leaf for a larger, more detailed visualization
 */
export class NetworkGraphView extends ItemView {
    plugin: StorytellerSuitePlugin;
    private graphRenderer: NetworkGraphRenderer | null = null;
    private currentFilters: GraphFilters = {
        entityTypes: ['character', 'location', 'event', 'item']
    };
    private controlsContainer: HTMLElement | null = null;
    private graphContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_NETWORK_GRAPH;
    }

    getDisplayText(): string {
        return t('networkGraph');
    }

    getIcon(): string {
        return 'git-fork';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('storyteller-network-graph-view');

        // Create header
        const header = container.createDiv('storyteller-network-graph-header');
        header.setCssStyles({ padding: '1rem' });
        header.setCssStyles({ borderBottom: '1px solid var(--background-modifier-border)' });
        
        const title = header.createEl('h3', { text: t('networkGraph') });
        title.setCssStyles({ margin: '0 0 0.5rem 0' });

        const subtitle = header.createEl('p', { 
            text: 'Interactive visualization of relationships between story entities',
            cls: 'storyteller-network-graph-subtitle'
        });
        subtitle.setCssStyles({ margin: '0' });
        subtitle.setCssStyles({ color: 'var(--text-muted)' });
        subtitle.setCssStyles({ fontSize: '0.9em' });

        // Create controls container
        this.controlsContainer = container.createDiv('storyteller-network-controls');
        this.controlsContainer.setCssStyles({ padding: '1rem' });
        this.controlsContainer.setCssStyles({ display: 'flex' });
        this.controlsContainer.setCssStyles({ flexWrap: 'wrap' });
        this.controlsContainer.setCssStyles({ gap: '0.5rem' });
        this.controlsContainer.setCssStyles({ alignItems: 'center' });
        this.controlsContainer.setCssStyles({ borderBottom: '1px solid var(--background-modifier-border)' });

        // Initialize graph
        await this.initializeGraph(container);
    }

    async initializeGraph(container: HTMLElement): Promise<void> {
        if (!this.controlsContainer) return;

        let graphRenderer = this.graphRenderer;

        // Search box
        const searchContainer = this.controlsContainer.createDiv();
        searchContainer.setCssStyles({ flex: '1' });
        searchContainer.setCssStyles({ minWidth: '200px' });
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: t('searchEntities'),
            cls: 'storyteller-network-search'
        });
        searchInput.setCssStyles({ width: '100%' });
        searchInput.setCssStyles({ padding: '6px 12px' });
        searchInput.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        searchInput.setCssStyles({ borderRadius: '4px' });
        searchInput.setCssStyles({ backgroundColor: 'var(--background-primary)' });

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
        layoutContainer.setCssStyles({ display: 'flex' });
        layoutContainer.setCssStyles({ gap: '0.5rem' });
        layoutContainer.setCssStyles({ alignItems: 'center' });
        
        const layoutLabel = layoutContainer.createEl('label', { text: t('layout') + ':' });
        layoutLabel.setCssStyles({ fontSize: '0.9em' });
        layoutLabel.setCssStyles({ color: 'var(--text-muted)' });
        
        const layoutSelect = layoutContainer.createEl('select', { cls: 'dropdown' });
        layoutSelect.setCssStyles({ padding: '4px 8px' });
        layoutSelect.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
        layoutSelect.setCssStyles({ borderRadius: '4px' });
        layoutSelect.setCssStyles({ backgroundColor: 'var(--background-primary)' });
        
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
        zoomContainer.setCssStyles({ display: 'flex' });
        zoomContainer.setCssStyles({ gap: '0.25rem' });

        const createZoomButton = (text: string, icon: string, onClick: () => void) => {
            const btn = new ButtonComponent(zoomContainer);
            btn.setButtonText(text)
                .setTooltip(text)
                .onClick(onClick);
            btn.buttonEl.setCssStyles({ padding: '4px 12px' });
            return btn;
        };

        createZoomButton('+', 'zoom-in', () => graphRenderer?.zoomIn());
        createZoomButton('-', 'zoom-out', () => graphRenderer?.zoomOut());
        createZoomButton('⊡', 'fit-to-view', () => graphRenderer?.fitToView());

        // Filter button
        const filterBtn = new ButtonComponent(this.controlsContainer);
        filterBtn.setButtonText(t('graphFilters'))
            .onClick(() => this.showFilterModal());
        filterBtn.buttonEl.setCssStyles({ padding: '6px 12px' });

        // Export button
        const exportBtn = new ButtonComponent(this.controlsContainer);
        exportBtn.setButtonText(t('exportGraph'))
            .onClick(() => this.showExportMenu());
        exportBtn.buttonEl.setCssStyles({ padding: '6px 12px' });

        // Refresh button
        const refreshBtn = new ButtonComponent(this.controlsContainer);
        refreshBtn.setButtonText('↻')
            .setTooltip('Refresh graph')
            .onClick(async () => {
                await graphRenderer?.refresh();
            });
        refreshBtn.buttonEl.setCssStyles({ padding: '6px 12px' });

        // Create graph container
        this.graphContainer = container.createDiv('storyteller-network-graph-container');
        this.graphContainer.setCssStyles({ flex: '1' });
        this.graphContainer.setCssStyles({ overflow: 'hidden' });
        this.graphContainer.setCssStyles({ position: 'relative' });
        this.graphContainer.setCssStyles({ height: 'calc(100vh - 250px)' });
        this.graphContainer.setCssStyles({ minHeight: '500px' });

        // Initialize graph renderer
        try {
            graphRenderer = new NetworkGraphRenderer(this.graphContainer, this.plugin);
            await graphRenderer.initializeCytoscape();
            this.graphRenderer = graphRenderer;
        } catch (error) {
            
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
            constructor(app: any, view: NetworkGraphView) {
                super(app);
                this.view = view;
            }

            view: NetworkGraphView;

            onOpen() {
                const { contentEl } = this;
                contentEl.empty();
                contentEl.createEl('h3', { text: t('graphFilters') });

                // Entity type filters
                const entitySection = contentEl.createDiv();
                entitySection.createEl('h4', { text: t('selectEntityTypes') });
                
                const entityTypes: ('character' | 'location' | 'event' | 'item')[] = ['character', 'location', 'event', 'item'];
                const selectedTypes: ('character' | 'location' | 'event' | 'item')[] = 
                    this.view.currentFilters.entityTypes ? [...this.view.currentFilters.entityTypes] : 
                    ['character', 'location', 'event', 'item'];

                entityTypes.forEach(type => {
                    const labelKey = (type + 's') as 'characters' | 'locations' | 'events' | 'items';
                    const setting = new Setting(entitySection)
                        .setName(t(labelKey))
                        .addToggle(toggle => {
                            toggle.setValue(selectedTypes.includes(type))
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
                btnContainer.setCssStyles({ marginTop: '1rem' });
                btnContainer.setCssStyles({ display: 'flex' });
                btnContainer.setCssStyles({ gap: '0.5rem' });
                btnContainer.setCssStyles({ justifyContent: 'flex-end' });

                new ButtonComponent(btnContainer)
                    .setButtonText(t('applyFilters'))
                    .setCta()
                    .onClick(async () => {
                        this.view.currentFilters = {
                            ...this.view.currentFilters,
                            entityTypes: selectedTypes as ('character' | 'location' | 'event' | 'item')[]
                        };
                        await this.view.graphRenderer?.applyFilters(this.view.currentFilters);
                        this.close();
                    });

                new ButtonComponent(btnContainer)
                    .setButtonText(t('resetFilters'))
                    .onClick(async () => {
                        this.view.currentFilters = {
                            entityTypes: ['character', 'location', 'event', 'item']
                        };
                        await this.view.graphRenderer?.applyFilters(this.view.currentFilters);
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

    async onClose(): Promise<void> {
        // Clean up graph renderer
        if (this.graphRenderer) {
            this.graphRenderer.destroy();
            this.graphRenderer = null;
        }
    }

    /**
     * Refresh the graph with current data
     */
    async refresh(): Promise<void> {
        if (this.graphRenderer) {
            await this.graphRenderer.refresh();
        }
    }
}

