// Timeline View - Full workspace view for timeline visualization
// Provides a dedicated panel for viewing and interacting with the story timeline

import { ItemView, WorkspaceLeaf, setIcon, Menu, DropdownComponent } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { TimelineRenderer, TimelineFilters } from '../utils/TimelineRenderer';
import { TimelineUIState } from '../types';
import { TimelineTrackManager } from '../utils/TimelineTrackManager';
import { TimelineControlsBuilder, TimelineControlCallbacks } from '../utils/TimelineControlsBuilder';
import { TimelineFilterBuilder, TimelineFilterCallbacks } from '../utils/TimelineFilterBuilder';

export const VIEW_TYPE_TIMELINE = 'storyteller-timeline-view';

// Re-export TimelineUIState as TimelineViewState for backward compatibility
export type TimelineViewState = TimelineUIState;

/**
 * TimelineView provides a full-screen dedicated view for the timeline
 * Users can open this in any workspace leaf for a larger, persistent visualization
 * 
 * UI Structure (Optimized for vertical space):
 * - Toolbar: Icon buttons for Gantt toggle, layout, export, refresh, zoom controls
 * - Entity Filters: Inline toggles for milestone-only
 * - Advanced Filters (collapsible): Character, location, group filters
 * - Timeline Container: Flex-grow to fill remaining space
 * - Status Footer: Event count, date range display
 */
export class TimelineView extends ItemView {
    plugin: StorytellerSuitePlugin;
    private renderer: TimelineRenderer | null = null;
    private currentState: TimelineViewState;

    // Shared builders
    private controlsBuilder: TimelineControlsBuilder;
    private filterBuilder: TimelineFilterBuilder;

    // UI Elements
    private toolbarEl: HTMLElement | null = null;
    private filterToggleEl: HTMLElement | null = null;
    private advancedFiltersEl: HTMLElement | null = null;
    private advancedFiltersContent: HTMLElement | null = null;
    private timelineContainer: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private footerStatusEl: HTMLElement | null = null;

    // State
    private advancedFiltersExpanded = false;
    private resizeObserver: ResizeObserver | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;

        // Initialize default state using shared utility
        this.currentState = TimelineControlsBuilder.createDefaultState(plugin);

        // Create control callbacks
        const controlCallbacks: TimelineControlCallbacks = {
            onStateChange: () => this.updateFooterStatus(),
            onRendererUpdate: () => this.buildTimeline(),
            getRenderer: () => this.renderer,
            getEvents: () => this.plugin.listEvents()
        };

        // Create filter callbacks
        const filterCallbacks: TimelineFilterCallbacks = {
            onFilterChange: () => this.updateFooterStatus(),
            getRenderer: () => this.renderer
        };

        // Initialize builders
        this.controlsBuilder = new TimelineControlsBuilder(plugin, this.currentState, controlCallbacks);
        this.filterBuilder = new TimelineFilterBuilder(plugin, this.currentState, filterCallbacks);
    }

    getViewType(): string {
        return VIEW_TYPE_TIMELINE;
    }

    getDisplayText(): string {
        return t('timeline');
    }

    getIcon(): string {
        return 'clock';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('storyteller-timeline-view');

        // Create main sections with flex layout
        this.toolbarEl = container.createDiv('storyteller-timeline-toolbar');
        this.filterToggleEl = container.createDiv('storyteller-timeline-filter-toggle');
        this.advancedFiltersEl = container.createDiv('storyteller-timeline-advanced-filters');
        this.timelineContainer = container.createDiv('storyteller-timeline-container');
        this.footerEl = container.createDiv('storyteller-timeline-footer');

        // Build each section
        this.buildToolbar();
        this.buildFilterToggle();
        await this.buildAdvancedFilters();
        await this.buildTimeline();
        this.buildFooter();
        
        // Setup resize observer for responsive layout
        this.setupResizeObserver();
    }

    /**
     * Build toolbar with icon buttons
     */
    private buildToolbar(): void {
        if (!this.toolbarEl) return;
        this.toolbarEl.empty();

        // Use shared controls builder for common controls
        this.controlsBuilder.createGanttToggle(this.toolbarEl);
        this.controlsBuilder.createGroupingDropdown(this.toolbarEl);

        // Fork selector dropdown
        const forkContainer = this.toolbarEl.createDiv('storyteller-fork-container');
        const forkSelect = forkContainer.createEl('select', {
            cls: 'dropdown storyteller-fork-select',
            attr: { 'aria-label': 'Timeline fork' }
        });

        // Add main timeline option
        const mainOption = forkSelect.createEl('option', {
            value: 'main',
            text: 'Main Timeline'
        });
        mainOption.selected = true;

        // Add fork options
        const forks = this.plugin.getTimelineForks();
        forks.forEach(fork => {
            const option = forkSelect.createEl('option', {
                value: fork.id,
                text: `🔀 ${fork.name}`
            });
            if (fork.color) {
                option.style.color = fork.color;
            }
        });

        forkSelect.addEventListener('change', async () => {
            const selectedFork = forkSelect.value;
            this.currentState.currentForkId = selectedFork === 'main' ? undefined : selectedFork;

            if (selectedFork === 'main') {
                // Show all events - clear any fork filters
                this.currentState.filters = {
                    ...this.currentState.filters,
                    forkId: undefined
                };
            } else {
                // Filter to fork-specific events
                const fork = this.plugin.getTimelineFork(selectedFork);
                if (fork) {
                    this.currentState.filters = {
                        ...this.currentState.filters,
                        forkId: fork.id
                    };
                }
            }

            // Rebuild timeline with new filters
            await this.buildTimeline();
            this.updateFooterStatus();
        });

        // Conflict warnings badge (if conflicts exist)
        const conflicts = this.plugin.settings.timelineConflicts || [];
        const activeConflicts = conflicts.filter(c => !c.dismissed);
        if (activeConflicts.length > 0) {
            const conflictBadge = this.toolbarEl.createEl('button', {
                cls: 'clickable-icon storyteller-toolbar-btn storyteller-conflict-badge',
                attr: {
                    'aria-label': `${activeConflicts.length} timeline conflicts`,
                    'title': `View ${activeConflicts.length} timeline conflict(s)`
                }
            });
            conflictBadge.innerHTML = `<span class="storyteller-badge-icon">⚠️</span><span class="storyteller-badge-count">${activeConflicts.length}</span>`;
            conflictBadge.addEventListener('click', async () => {
                const { ConflictListModal } = await import('../modals/ConflictListModal');
                new ConflictListModal(
                    this.app,
                    this.plugin,
                    conflicts,
                    async () => {
                        // Re-scan callback
                        const events = await this.plugin.listEvents();
                        const { ConflictDetector } = await import('../utils/ConflictDetector');
                        const detectedConflicts = ConflictDetector.detectAllConflicts(events);
                        const newConflicts = ConflictDetector.toStorageFormat(detectedConflicts);

                        this.plugin.settings.timelineConflicts = newConflicts;
                        await this.plugin.saveSettings();

                        // Rebuild toolbar to update badge
                        this.buildToolbar();
                    }
                ).open();
            });
        }

        // Use shared controls for zoom and navigation buttons
        this.controlsBuilder.createFitButton(this.toolbarEl);
        this.controlsBuilder.createDecadeButton(this.toolbarEl);
        this.controlsBuilder.createCenturyButton(this.toolbarEl);
        this.controlsBuilder.createTodayButton(this.toolbarEl);
        this.controlsBuilder.createEditModeToggle(this.toolbarEl);
        this.controlsBuilder.createNarrativeOrderToggle(this.toolbarEl);
        this.controlsBuilder.createEraToggle(this.toolbarEl);

        // Manage eras button
        const manageErasBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': 'Manage timeline eras',
                'title': 'Manage timeline eras'
            }
        });
        setIcon(manageErasBtn, 'calendar-range');
        manageErasBtn.addEventListener('click', async () => {
            const { EraListModal } = await import('../modals/EraListModal');
            new EraListModal(this.app, this.plugin).open();
        });

        // Track selector dropdown
        const trackSelectorContainer = this.toolbarEl.createDiv('storyteller-track-selector');
        const trackLabel = trackSelectorContainer.createEl('span', {
            text: 'Track: ',
            cls: 'storyteller-track-label'
        });

        const trackDropdown = new DropdownComponent(trackSelectorContainer);
        trackDropdown.addOption('', 'All Events (Global)');

        // Populate tracks from settings
        const tracks = this.plugin.settings.timelineTracks || [];
        const visibleTracks = TimelineTrackManager.getVisibleTracks(tracks);
        for (const track of visibleTracks) {
            trackDropdown.addOption(track.id, track.name);
        }

        trackDropdown.setValue(this.currentState.currentTrackId || '');
        trackDropdown.onChange(async (trackId) => {
            this.currentState.currentTrackId = trackId || undefined;
            await this.applyTrackFilter(trackId);
        });

        // Export button
        const exportBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('export'),
                'title': t('export')
            }
        });
        setIcon(exportBtn, 'download');
        exportBtn.addEventListener('click', () => this.showExportMenu(exportBtn));

        // Refresh button using shared builder
        this.controlsBuilder.createRefreshButton(this.toolbarEl);
    }

    /**
     * Build filter toggle (milestone only)
     */
    private buildFilterToggle(): void {
        if (!this.filterToggleEl) return;
        this.filterToggleEl.empty();

        const label = this.filterToggleEl.createEl('label', { 
            text: t('milestonesOnly'),
            cls: 'storyteller-filter-label'
        });
        const checkbox = this.filterToggleEl.createEl('input', { 
            type: 'checkbox',
            cls: 'storyteller-filter-checkbox'
        });
        checkbox.checked = this.currentState.filters.milestonesOnly || false;
        checkbox.addEventListener('change', () => {
            this.currentState.filters.milestonesOnly = checkbox.checked;
            this.renderer?.applyFilters(this.currentState.filters);
            this.updateFooterStatus();
        });
        label.prepend(checkbox);

        // Filter button to expand advanced filters
        const filterBtn = this.filterToggleEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('filters'),
                'title': t('filters')
            }
        });
        setIcon(filterBtn, 'filter');
        filterBtn.addEventListener('click', () => {
            this.advancedFiltersExpanded = !this.advancedFiltersExpanded;
            if (this.advancedFiltersContent) {
                this.advancedFiltersContent.style.display = this.advancedFiltersExpanded ? 'block' : 'none';
            }
        });
    }

    /**
     * Build collapsible advanced filters section
     */
    private async buildAdvancedFilters(): Promise<void> {
        if (!this.advancedFiltersEl) return;
        this.advancedFiltersEl.empty();

        // Content section (initially hidden)
        this.advancedFiltersContent = this.advancedFiltersEl.createDiv('storyteller-advanced-filters-content');
        this.advancedFiltersContent.style.display = this.advancedFiltersExpanded ? 'block' : 'none';

        // Get events for filter population
        const events = await this.plugin.listEvents();

        // Use shared filter builder for all filter controls
        this.filterBuilder.buildFilterPanel(this.advancedFiltersContent, events);
    }

    /**
     * Build timeline container and initialize renderer
     */
    private async buildTimeline(): Promise<void> {
        if (!this.timelineContainer) return;
        this.timelineContainer.empty();
        this.timelineContainer.style.flexGrow = '1';
        // Allow timeline to handle its own overflow
        this.timelineContainer.style.overflow = 'auto';

        // Initialize timeline renderer
        this.renderer = new TimelineRenderer(this.timelineContainer, this.plugin, {
            ganttMode: this.currentState.ganttMode,
            groupMode: this.currentState.groupMode,
            stackEnabled: this.currentState.stackEnabled,
            density: this.currentState.density,
            editMode: this.currentState.editMode,
            showEras: this.currentState.showEras,
            narrativeOrder: this.currentState.narrativeOrder,
            defaultGanttDuration: this.plugin.settings.ganttDefaultDuration ?? 1
        });

        await this.renderer.initialize();
        this.renderer.applyFilters(this.currentState.filters);
    }

    /**
     * Build status footer
     */
    private buildFooter(): void {
        if (!this.footerEl) return;
        this.footerEl.empty();
        
        this.footerStatusEl = this.footerEl.createEl('span', {
            cls: 'storyteller-timeline-status',
            attr: { 'aria-live': 'polite' }
        });
        this.updateFooterStatus();
    }

    /**
     * Apply track-based filtering
     */
    private async applyTrackFilter(trackId: string): Promise<void> {
        if (!trackId) {
            // Clear track filter - show all events
            this.currentState.filters = {
                ...this.currentState.filters,
                characters: undefined,
                locations: undefined,
                groups: undefined,
                tags: undefined
            };
            this.renderer?.applyFilters(this.currentState.filters);
            this.updateFooterStatus();
            return;
        }

        // Get the selected track
        const track = this.plugin.getTimelineTrack(trackId);
        if (!track) {
            console.error(`Track not found: ${trackId}`);
            return;
        }

        // Apply track's filter criteria to current filters
        const newFilters: TimelineFilters = { ...this.currentState.filters };

        if (track.filterCriteria) {
            if (track.filterCriteria.characters && track.filterCriteria.characters.length > 0) {
                newFilters.characters = new Set(track.filterCriteria.characters);
            }
            if (track.filterCriteria.locations && track.filterCriteria.locations.length > 0) {
                newFilters.locations = new Set(track.filterCriteria.locations);
            }
            if (track.filterCriteria.groups && track.filterCriteria.groups.length > 0) {
                newFilters.groups = new Set(track.filterCriteria.groups);
            }
            if (track.filterCriteria.tags && track.filterCriteria.tags.length > 0) {
                newFilters.tags = new Set(track.filterCriteria.tags);
            }
            if (track.filterCriteria.milestonesOnly) {
                newFilters.milestonesOnly = true;
            }
        }

        this.currentState.filters = newFilters;
        this.renderer?.applyFilters(this.currentState.filters);
        this.updateFooterStatus();
    }

    /**
     * Update footer status text
     */
    private updateFooterStatus(): void {
        if (!this.footerStatusEl || !this.renderer) return;
        
        const eventCount = this.renderer.getEventCount();
        const dateRange = this.renderer.getDateRange();
        
        if (eventCount === 0) {
            this.footerStatusEl.setText(t('noEventsFound'));
        } else {
            let statusText = `${eventCount} event${eventCount !== 1 ? 's' : ''}`;
            if (dateRange) {
                const startStr = dateRange.start.toLocaleDateString();
                const endStr = dateRange.end.toLocaleDateString();
                statusText += ` • ${startStr} — ${endStr}`;
            }
            if (this.currentState.ganttMode) {
                statusText += ` • ${t('ganttView')}`;
            }
            this.footerStatusEl.setText(statusText);
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
     */
    onResize(): void {
        // Timeline should auto-adjust to container size
        // Force redraw to ensure proper rendering after resize
        if (this.renderer) {
            // Request a redraw from vis-timeline without losing zoom position
            try {
                // The timeline library handles resize automatically, but we need to ensure it updates
                // No need to call fitToView() as that would change the user's zoom level
                // vis-timeline has internal resize handling
            } catch (error) {
                console.warn('Timeline: Resize handling error:', error);
            }
        }
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
                    this.renderer?.exportAsImage('png');
                });
        });

        menu.addItem((item) => {
            item.setTitle(t('exportAsJPG'))
                .setIcon('image')
                .onClick(() => {
                    this.renderer?.exportAsImage('jpg');
                });
        });

        menu.showAtMouseEvent(new MouseEvent('click', { 
            clientX: buttonEl.getBoundingClientRect().left,
            clientY: buttonEl.getBoundingClientRect().bottom
        }));
    }

    /**
     * Get view state for persistence
     */
    getState(): Record<string, unknown> {
        // Capture current window range for zoom/scroll persistence
        const visibleRange = this.renderer?.getVisibleRange();

        return {
            ganttMode: this.currentState.ganttMode,
            groupMode: this.currentState.groupMode,
            stackEnabled: this.currentState.stackEnabled,
            density: this.currentState.density,
            editMode: this.currentState.editMode,
            filters: {
                milestonesOnly: this.currentState.filters.milestonesOnly,
                characters: this.currentState.filters.characters ?
                    Array.from(this.currentState.filters.characters) : undefined,
                locations: this.currentState.filters.locations ?
                    Array.from(this.currentState.filters.locations) : undefined,
                groups: this.currentState.filters.groups ?
                    Array.from(this.currentState.filters.groups) : undefined
            },
            // Save visible window range for restoring zoom/scroll position
            visibleRange: visibleRange ? {
                start: visibleRange.start.toISOString(),
                end: visibleRange.end.toISOString()
            } : undefined
        };
    }

    /**
     * Set view state from persistence
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async setState(state: any, result: any): Promise<void> {
        await super.setState(state, result);

        if (state) {
            this.currentState = {
                ganttMode: state.ganttMode ?? false,
                groupMode: state.groupMode ?? 'none',
                stackEnabled: state.stackEnabled ?? true,
                density: state.density ?? 50,
                editMode: state.editMode ?? false,
                filters: state.filters || {},
                showEras: state.showEras ?? false,
                narrativeOrder: state.narrativeOrder ?? false
            };

            // Restore Sets from arrays if needed
            if (state.filters) {
                if (state.filters.characters && Array.isArray(state.filters.characters)) {
                    this.currentState.filters.characters = new Set(state.filters.characters);
                }
                if (state.filters.locations && Array.isArray(state.filters.locations)) {
                    this.currentState.filters.locations = new Set(state.filters.locations);
                }
                if (state.filters.groups && Array.isArray(state.filters.groups)) {
                    this.currentState.filters.groups = new Set(state.filters.groups);
                }
            }

            // Restore visible window range if available
            if (state.visibleRange && this.renderer) {
                try {
                    const start = new Date(state.visibleRange.start);
                    const end = new Date(state.visibleRange.end);
                    // Use setTimeout to ensure timeline is fully initialized
                    setTimeout(() => {
                        if (this.renderer) {
                            this.renderer.setVisibleRange(start, end);
                        }
                    }, 100);
                } catch (error) {
                    console.warn('Timeline: Could not restore visible range from state:', error);
                }
            }
        }
    }

    async onClose(): Promise<void> {
        // Clean up resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Clean up timeline renderer
        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }
    }

    /**
     * Refresh the timeline with current data
     */
    async refresh(): Promise<void> {
        if (this.renderer) {
            await this.renderer.refresh();
            this.updateFooterStatus();
        }
    }
}
