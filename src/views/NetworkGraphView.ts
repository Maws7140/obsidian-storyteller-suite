// Network Graph View - Full workspace view for network visualization
// Provides a dedicated panel for viewing and interacting with the entity relationship graph

import { ItemView, WorkspaceLeaf, setIcon, Menu } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { NetworkGraphRenderer } from './NetworkGraphRenderer';
import { GraphFilters } from '../types';

export const VIEW_TYPE_NETWORK_GRAPH = 'storyteller-network-graph-view';

/**
 * NetworkGraphView provides a full-screen dedicated view for the network graph
 * Users can open this in any workspace leaf for a larger, more detailed visualization
 * 
 * UI Structure (Optimized for vertical space):
 * - Toolbar: Icon buttons for layout, export, refresh
 * - Entity Filters: Inline icon toggles for character/location/event/item
 * - Advanced Filters (collapsible): Search, timeline range
 * - Graph Container: Flex-grow to fill remaining space
 * - Status Footer: Entity count display
 */
export class NetworkGraphView extends ItemView {
    plugin: StorytellerSuitePlugin;
    private graphRenderer: NetworkGraphRenderer | null = null;
    private currentFilters: GraphFilters = {
        entityTypes: ['character', 'location', 'event', 'item']
    };
    
    // UI Elements
    private toolbarEl: HTMLElement | null = null;
    private entityFilterEl: HTMLElement | null = null;
    private advancedFiltersEl: HTMLElement | null = null;
    private advancedFiltersContent: HTMLElement | null = null;
    private graphContainer: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private footerStatusEl: HTMLElement | null = null;
    
    // Filter inputs
    private searchInput: HTMLInputElement | null = null;
    private startDateInput: HTMLInputElement | null = null;
    private endDateInput: HTMLInputElement | null = null;
    
    // State
    private advancedFiltersExpanded = false;
    private filterDebounceTimer = 0;
    private resizeObserver: ResizeObserver | null = null;
    
    // (keyboard shortcuts removed)

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

        // Create main sections with flex layout
        this.toolbarEl = container.createDiv('storyteller-graph-toolbar');
        this.entityFilterEl = container.createDiv('storyteller-graph-entity-filters');
        this.advancedFiltersEl = container.createDiv('storyteller-graph-advanced-filters');
        this.graphContainer = container.createDiv('storyteller-graph-container');
        this.footerEl = container.createDiv('storyteller-graph-footer');

        // Build each section
        this.buildToolbar();
        this.buildEntityFilters();
        this.buildAdvancedFilters();
        await this.buildGraph();
        this.buildFooter();
        
        // Setup resize observer for responsive layout
        this.setupResizeObserver();
        
        // Keyboard shortcuts removed - no keyboard listener attached
    }

    /**
     * Build slim toolbar with icon buttons
     */
    private buildToolbar(): void {
        if (!this.toolbarEl) return;
        this.toolbarEl.empty();

        // Layout toggle button
        const layoutBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('layout'),
                'title': t('layout')
            }
        });
        setIcon(layoutBtn, 'layout-grid');
        layoutBtn.addEventListener('click', () => this.showLayoutMenu(layoutBtn));

        // Export button (prominent)
        const exportBtn = this.toolbarEl.createEl('button', {
            cls: 'storyteller-export-button',
            text: t('exportGraph'),
            attr: { 
                'aria-label': t('exportGraph') + ' (Ctrl+E)',
                'title': t('exportGraph') + ' (Ctrl+E)'
            }
        });
        const exportIcon = exportBtn.createSpan();
        setIcon(exportIcon, 'download');
        exportBtn.addEventListener('click', () => this.showExportMenu(exportBtn));

        // Refresh button
        const refreshBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('refresh'),
                'title': t('refresh')
            }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', async () => {
            await this.graphRenderer?.refresh();
            this.updateFooterStatus();
        });

        // Zoom in button
        const zoomInBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('zoomIn'),
                'title': t('zoomIn')
            }
        });
        setIcon(zoomInBtn, 'zoom-in');
        zoomInBtn.addEventListener('click', () => this.graphRenderer?.zoomIn());

        // Zoom out button
        const zoomOutBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('zoomOut'),
                'title': t('zoomOut')
            }
        });
        setIcon(zoomOutBtn, 'zoom-out');
        zoomOutBtn.addEventListener('click', () => this.graphRenderer?.zoomOut());

        // Fit to view button
        const fitBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('fitToView') + ' (F)',
                'title': t('fitToView') + ' (F)'
            }
        });
        setIcon(fitBtn, 'maximize-2');
        fitBtn.addEventListener('click', () => this.graphRenderer?.fitToView());
        
        // (keyboard shortcuts button removed)
    }

    /**
     * Build entity type filter icon bar
     */
    private buildEntityFilters(): void {
        if (!this.entityFilterEl) return;
        this.entityFilterEl.empty();

        const entityTypes: Array<{
            type: 'character' | 'location' | 'event' | 'item';
            icon: string;
            label: string;
        }> = [
            { type: 'character', icon: 'user', label: t('characters') },
            { type: 'location', icon: 'map-pin', label: t('locations') },
            { type: 'event', icon: 'calendar', label: t('events') },
            { type: 'item', icon: 'package', label: t('items') }
        ];

        entityTypes.forEach(({ type, icon, label }) => {
            if (!this.entityFilterEl) return;
            
            const btn = this.entityFilterEl.createEl('button', {
                cls: 'storyteller-entity-filter-btn clickable-icon is-active',
                attr: { 
                    'aria-label': label,
                    'aria-pressed': 'true',
                    'data-entity-type': type,
                    'title': label
                }
            });
            setIcon(btn, icon);
            
            btn.addEventListener('click', () => {
                const isActive = btn.hasClass('is-active');
                if (isActive) {
                    btn.removeClass('is-active');
                } else {
                    btn.addClass('is-active');
                }
                btn.setAttribute('aria-pressed', !isActive ? 'true' : 'false');
                this.onFilterChange();
            });

            // Keyboard support
            btn.tabIndex = 0;
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    btn.click();
                }
            });
        });
    }

    /**
     * Build collapsible advanced filters section
     */
    private buildAdvancedFilters(): void {
        if (!this.advancedFiltersEl) return;
        this.advancedFiltersEl.empty();

        // Header with collapse toggle
        const header = this.advancedFiltersEl.createDiv('storyteller-advanced-filters-header');
        const chevron = header.createEl('span', { cls: 'collapse-icon' });
        setIcon(chevron, 'chevron-right');
        header.createEl('span', { text: t('filters') });

        // Content section (initially hidden)
        this.advancedFiltersContent = this.advancedFiltersEl.createDiv('storyteller-advanced-filters-content');
        this.advancedFiltersContent.style.display = 'none';

        // Search input
        const searchContainer = this.advancedFiltersContent.createDiv('storyteller-filter-row');
        searchContainer.createEl('label', { text: t('search') });
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: t('searchEntities'),
            attr: { 'aria-label': t('searchEntities') }
        });
        this.searchInput.addEventListener('input', () => this.onFilterChange());

        // Timeline date range
        const timelineContainer = this.advancedFiltersContent.createDiv('storyteller-filter-row');
        timelineContainer.createEl('label', { text: t('filterByTimeline') });
        const dateRow = timelineContainer.createDiv('storyteller-date-range');
        this.startDateInput = dateRow.createEl('input', { 
            type: 'date',
            attr: { 'aria-label': t('timelineStart') }
        });
        dateRow.createEl('span', { text: '—', cls: 'date-separator' });
        this.endDateInput = dateRow.createEl('input', { 
            type: 'date',
            attr: { 'aria-label': t('timelineEnd') }
        });
        this.startDateInput.addEventListener('change', () => this.onFilterChange());
        this.endDateInput.addEventListener('change', () => this.onFilterChange());

        // Toggle behavior
        header.addEventListener('click', () => {
            this.advancedFiltersExpanded = !this.advancedFiltersExpanded;
            if (this.advancedFiltersContent) {
                this.advancedFiltersContent.style.display = this.advancedFiltersExpanded ? 'block' : 'none';
            }
            chevron.empty();
            setIcon(chevron, this.advancedFiltersExpanded ? 'chevron-down' : 'chevron-right');
            header.setAttribute('aria-expanded', this.advancedFiltersExpanded ? 'true' : 'false');
        });
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('role', 'button');
        header.tabIndex = 0;
        
        // Keyboard support for toggle
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });
    }

    /**
     * Build graph container and initialize renderer
     */
    private async buildGraph(): Promise<void> {
        if (!this.graphContainer) return;
        this.graphContainer.empty();

        // Show loading state
        const loader = this.graphContainer.createDiv('storyteller-graph-loader');
        loader.createDiv('storyteller-loader-spinner');
        loader.createEl('p', { text: t('loadingNodes') });

        // Initialize graph renderer asynchronously
        try {
            await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI thread
            loader.remove();
            
            this.graphRenderer = new NetworkGraphRenderer(this.graphContainer, this.plugin);
            await this.graphRenderer.initializeCytoscape();
            await this.applyCurrentFilters();
            
            // Add zoom indicator
            this.addZoomIndicator();
        } catch (error) {
            console.error('Error initializing network graph:', error);
            loader.remove();
            this.graphContainer.createEl('p', {
                text: 'Error loading network graph. See console for details.',
                cls: 'storyteller-empty-state'
            });
        }
    }

    /**
     * Build status footer
     */
    private buildFooter(): void {
        if (!this.footerEl) return;
        this.footerEl.empty();
        
        this.footerStatusEl = this.footerEl.createEl('span', {
            cls: 'storyteller-graph-status',
            attr: { 'aria-live': 'polite' }
        });
        this.updateFooterStatus();
    }

    /**
     * Update footer status text
     */
    private updateFooterStatus(): void {
        if (!this.footerStatusEl || !this.graphRenderer) return;
        
        // Get node and edge count - fallback if methods don't exist on renderer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nodeCount = (this.graphRenderer as any).getNodeCount?.() || 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const edgeCount = (this.graphRenderer as any).getEdgeCount?.() || 0;
        
        if (nodeCount === 0 && edgeCount === 0) {
            this.footerStatusEl.setText(t('emptyGraphMessage'));
        } else {
            this.footerStatusEl.setText(
                `${t('showingXNodes', nodeCount)} • ${t('showingXEdges', edgeCount)}`
            );
        }
    }

    /**
     * Setup resize observer for responsive layout
     */
    private setupResizeObserver(): void {
        this.resizeObserver = new ResizeObserver(() => {
            this.onResize();
        });
        this.resizeObserver.observe(this.containerEl);
    }

    /**
     * Handle resize events
     * Note: We don't call fitToView here to preserve user's zoom level
     * We only call resize() to update the canvas dimensions
     */
    onResize(): void {
        if (this.graphRenderer) {
            // Tell Cytoscape to update canvas size, but keep zoom/pan position
            this.graphRenderer.resize();
        }
    }

    /**
     * Get currently active entity types from filter buttons
     */
    private getActiveEntityTypes(): ('character' | 'location' | 'event' | 'item')[] {
        if (!this.entityFilterEl) return ['character', 'location', 'event', 'item'];
        
        const activeButtons = this.entityFilterEl.querySelectorAll('.storyteller-entity-filter-btn.is-active');
        const types: ('character' | 'location' | 'event' | 'item')[] = [];
        
        activeButtons.forEach(btn => {
            const type = btn.getAttribute('data-entity-type') as 'character' | 'location' | 'event' | 'item';
            if (type) types.push(type);
        });
        
        return types.length > 0 ? types : ['character', 'location', 'event', 'item'];
    }

    /**
     * Handle filter changes with debouncing
     */
    private onFilterChange(): void {
        clearTimeout(this.filterDebounceTimer);
        this.filterDebounceTimer = window.setTimeout(async () => {
            await this.applyCurrentFilters();
            this.updateFooterStatus();
        }, 250);
    }

    /**
     * Apply current filter settings to graph
     */
    private async applyCurrentFilters(): Promise<void> {
        const activeTypes = this.getActiveEntityTypes();
        const searchQuery = this.searchInput?.value.trim() || '';
        const startDate = this.startDateInput?.value || '';
        const endDate = this.endDateInput?.value || '';

        this.currentFilters = {
            entityTypes: activeTypes,
            timelineStart: startDate || undefined,
            timelineEnd: endDate || undefined
        };

        if (this.graphRenderer) {
            await this.graphRenderer.applyFilters(this.currentFilters);
            
            // Apply search highlight if needed
            if (searchQuery) {
                this.graphRenderer.searchAndHighlight(searchQuery);
            } else {
                this.graphRenderer.clearSearch();
            }
        }
    }

    /**
     * Show layout menu
     */
    private showLayoutMenu(buttonEl: HTMLElement): void {
        const menu = new Menu();
        
        const layouts: Array<{ value: 'cose' | 'circle' | 'grid' | 'concentric'; label: string }> = [
            { value: 'cose', label: t('forceDirected') },
            { value: 'circle', label: t('circle') },
            { value: 'grid', label: t('grid') },
            { value: 'concentric', label: t('concentric') }
        ];

        layouts.forEach(layout => {
            menu.addItem((item) => {
                item.setTitle(layout.label)
                    .setIcon('layout')
                    .onClick(() => {
                        this.graphRenderer?.changeLayout(layout.value);
                    });
            });
        });

        menu.showAtMouseEvent(new MouseEvent('click', { 
            clientX: buttonEl.getBoundingClientRect().left,
            clientY: buttonEl.getBoundingClientRect().bottom
        }));
    }

    /**
     * Show export menu
     */
    private showExportMenu(buttonEl: HTMLElement): void {
        const menu = new Menu();
        
        menu.addItem((item) => {
            item.setTitle(t('exportAsPNG'))
                .setIcon('image')
                .onClick(() => {
                    this.graphRenderer?.exportAsImage('png');
                });
        });

        menu.addItem((item) => {
            item.setTitle(t('exportAsJPG'))
                .setIcon('image')
                .onClick(() => {
                    this.graphRenderer?.exportAsImage('jpg');
                });
        });

        menu.showAtMouseEvent(new MouseEvent('click', { 
            clientX: buttonEl.getBoundingClientRect().left,
            clientY: buttonEl.getBoundingClientRect().bottom
        }));
    }

    async onClose(): Promise<void> {
        // No keyboard listener to clean up (shortcuts removed)
        
        // Clean up resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Clean up debounce timer
        clearTimeout(this.filterDebounceTimer);

        // Clean up graph renderer
        if (this.graphRenderer) {
            this.graphRenderer.destroy();
            this.graphRenderer = null;
        }
    }
    
    /**
     * Handle keyboard shortcuts for the graph view
     */
    // keyboard shortcuts removed

    /**
     * Refresh the graph with current data
     */
    async refresh(): Promise<void> {
        if (this.graphRenderer) {
            await this.graphRenderer.refresh();
            this.updateFooterStatus();
        }
    }
    
    /**
     * Add zoom indicator overlay
     */
    private addZoomIndicator(): void {
        if (!this.graphContainer) return;
        
        const zoomIndicator = this.graphContainer.createDiv('storyteller-zoom-indicator');
        zoomIndicator.setText('100%');
        
        // Update zoom on zoom events
        if (this.graphRenderer) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cy = (this.graphRenderer as any).cy;
            if (cy) {
                cy.on('zoom', () => {
                    const zoom = cy.zoom();
                    zoomIndicator.setText(`${Math.round(zoom * 100)}%`);
                });
            }
        }
    }
    
    /**
     * Show keyboard shortcuts modal
     */
    // keyboard shortcuts modal removed
}
