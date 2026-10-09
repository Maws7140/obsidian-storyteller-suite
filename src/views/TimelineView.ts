// Timeline View - Full workspace view for timeline visualization
// Provides a dedicated panel for viewing and interacting with the story timeline

import { ItemView, WorkspaceLeaf, setIcon, Menu, DropdownComponent, Notice, ViewStateResult } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { TimelineRenderer, TimelineFilters } from '../utils/NativeTimelineRenderer';
import { TimelineUIFilters, TimelineUIState } from '../types';
import { TimelineTrackManager } from '../utils/TimelineTrackManager';
import { TimelineControlsBuilder, TimelineControlCallbacks } from '../utils/TimelineControlsBuilder';
import { TimelineFilterBuilder, TimelineFilterCallbacks } from '../utils/TimelineFilterBuilder';
import { ConflictDetector, DetectedConflict } from '../utils/ConflictDetector';
import { PlatformUtils } from '../utils/PlatformUtils';

export const VIEW_TYPE_TIMELINE = 'storyteller-timeline-view';

/** Sentinel value for the "manage these" entry at the foot of a picker. */
const MANAGE_OPTION = '__manage__';

// Re-export TimelineUIState as TimelineViewState for backward compatibility
export type TimelineViewState = TimelineUIState;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const GROUP_MODES: ReadonlyArray<TimelineUIState['groupMode']> = ['none', 'location', 'group', 'character', 'track', 'item', 'culture', 'magicSystem'];

function isGroupMode(value: unknown): value is TimelineUIState['groupMode'] {
    return GROUP_MODES.includes(value as TimelineUIState['groupMode']);
}

function asStringSet(value: unknown): Set<string> | undefined {
    return Array.isArray(value) ? new Set(value.map(item => String(item))) : undefined;
}

function restoreFilters(value: unknown): TimelineUIFilters {
    if (!isRecord(value)) {
        return {};
    }

    return {
        milestonesOnly: typeof value.milestonesOnly === 'boolean' ? value.milestonesOnly : undefined,
        characters: asStringSet(value.characters),
        locations: asStringSet(value.locations),
        groups: asStringSet(value.groups),
        tags: asStringSet(value.tags),
        eras: asStringSet(value.eras),
        forkId: typeof value.forkId === 'string' ? value.forkId : undefined
    };
}

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
    /** Bumped by each buildTimeline call, so a superseded build can tell it is stale. */
    private timelineBuildGeneration = 0;
    private currentState: TimelineViewState;

    // Shared builders
    private controlsBuilder: TimelineControlsBuilder;
    private filterBuilder: TimelineFilterBuilder;

    // UI Elements
    private toolbarEl: HTMLElement | null = null;
    private filterToggleEl: HTMLElement | null = null;
    private advancedFiltersEl: HTMLElement | null = null;
    private advancedFiltersContent: HTMLElement | null = null;
    private filterChipsEl: HTMLElement | null = null;
    private timelineContainer: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private footerStatusEl: HTMLElement | null = null;
    private timelineSearchInputEl: HTMLInputElement | null = null;
    private timelineSearchDropdownEl: HTMLElement | null = null;

    // State
    private advancedFiltersExpanded = false;
    private resizeObserver: ResizeObserver | null = null;
    private showScenes = false;
    private showWatchedNotes = false;
    /** Branch list the toolbar was last built against. */
    private lastBranchSignature = '';

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;

        // Initialize default state using shared utility
        this.currentState = TimelineControlsBuilder.createDefaultState(plugin);

        // Create control callbacks
        const controlCallbacks: TimelineControlCallbacks = {
            onStateChange: () => {
                this.updateFooterStatus();
                this.updateSearchDropdown();
            },
            onRendererUpdate: () => { void this.buildTimeline(); },
            getRenderer: () => this.renderer,
            getEvents: () => this.plugin.listEvents()
        };

        // Create filter callbacks
        const filterCallbacks: TimelineFilterCallbacks = {
            onFilterChange: () => {
                if (this.filterChipsEl) {
                    this.filterBuilder.renderFilterChips(this.filterChipsEl);
                }
                this.updateFooterStatus();
                this.updateSearchDropdown();
            },
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
        if (PlatformUtils.shouldUseSimplifiedUI()) {
            container.addClass('storyteller-timeline-view--mobile');
        }
        
        // Add gantt-mode class if enabled
        if (this.currentState.ganttMode) {
            container.addClass('gantt-mode');
        }

        // Create main sections with flex layout
        this.toolbarEl = container.createDiv('storyteller-timeline-toolbar');
        this.filterToggleEl = container.createDiv('storyteller-timeline-filter-toggle');
        this.advancedFiltersEl = container.createDiv('storyteller-timeline-advanced-filters');
        this.filterChipsEl = container.createDiv('storyteller-filter-chips');
        this.timelineContainer = container.createDiv('storyteller-timeline-container');
        this.timelineContainer.setCssStyles({ minHeight: '260px' });
        this.footerEl = container.createDiv('storyteller-timeline-footer');

        // Build each section
        this.buildToolbar();
        this.buildFilterToggle();
        await this.buildAdvancedFilters();
        // Render any active filter chips
        if (this.filterChipsEl) {
            this.filterBuilder.renderFilterChips(this.filterChipsEl);
        }
        await this.buildTimeline();
        this.buildFooter();
        
        // Setup resize observer for responsive layout
        this.setupResizeObserver();
    }
    /**
     * Build the toolbar.
     *
     * Grouped rather than flat. The old row put twenty-three controls side by
     * side, most of them icon-only, so nothing signalled which control belonged
     * with which and a first-time reader had no way in. Now: what you are
     * looking at, how it is framed, how it is drawn, then search and the rest.
     */
    private buildToolbar(): void {
        if (!this.toolbarEl) return;
        this.toolbarEl.empty();
        this.lastBranchSignature = this.branchSignature();

        // What am I looking at
        const scope = this.toolbarEl.createDiv('storyteller-toolbar-group');
        this.controlsBuilder.createViewModeSegment(scope);
        this.buildGroupingField(scope);
        this.buildTrackField(scope);
        this.buildBranchField(scope);

        // How much of it is on screen
        const frame = this.toolbarEl.createDiv('storyteller-toolbar-group');
        this.controlsBuilder.createZoomControl(frame);

        // How is it drawn
        const display = this.toolbarEl.createDiv('storyteller-toolbar-group');
        this.controlsBuilder.createEditModeToggle(display);
        this.controlsBuilder.createDisplayMenu(display, {
            getShowScenes: () => this.showScenes,
            setShowScenes: value => { this.showScenes = value; this.renderer?.setShowScenes(value); },
            getShowWatchedNotes: () => this.showWatchedNotes,
            setShowWatchedNotes: value => { this.showWatchedNotes = value; this.renderer?.setShowWatchedNotes(value); },
            onManageEras: () => this.openEraManager()
        });

        // Pushed right: conflicts, search, overflow
        const trailing = this.toolbarEl.createDiv('storyteller-toolbar-group storyteller-toolbar-trailing');
        this.buildConflictBadge(trailing);
        this.buildSearchField(trailing);
        this.buildOverflowButton(trailing);
    }

    /** A labelled control, so the toolbar reads as words rather than glyphs. */
    private labelledField(container: HTMLElement, label: string): HTMLElement {
        const field = container.createDiv('storyteller-toolbar-field');
        field.createSpan({ cls: 'storyteller-toolbar-field-label', text: label });
        return field;
    }

    private buildGroupingField(container: HTMLElement): void {
        const field = this.labelledField(container, 'Group');
        this.controlsBuilder.createGroupingDropdown(field);
    }

    /**
     * The track picker, with its own manager as the last option.
     *
     * Management belongs next to the thing it manages. Buried in an overflow
     * menu it was a second place to learn about tracks; here you find it the
     * moment you go looking at the list.
     */
    private buildTrackField(container: HTMLElement): void {
        const tracks = this.plugin.getTimelineTracks();
        const visibleTracks = TimelineTrackManager.getVisibleTracks(tracks);

        const field = this.labelledField(container, 'Track');
        const dropdown = new DropdownComponent(field);
        dropdown.addOption('', visibleTracks.length ? 'All events' : 'No tracks yet');
        visibleTracks.forEach(track => { dropdown.addOption(track.id, track.name); });
        dropdown.addOption(MANAGE_OPTION, 'Manage tracks…');
        dropdown.setValue(this.currentState.currentTrackId || '');
        dropdown.onChange((trackId: string) => {
            if (trackId === MANAGE_OPTION) {
                dropdown.setValue(this.currentState.currentTrackId || '');
                this.openTrackManager();
                return;
            }
            this.currentState.currentTrackId = trackId || undefined;
            void this.applyTrackFilter(trackId);
        });
    }

    /**
     * Which branch you are reading, as a field rather than a menu item.
     *
     * A fork changes what events exist, the same class of thing as Group and
     * Track, and hiding it in the overflow meant you could be looking at a
     * branch with nothing on screen saying so.
     */
    private buildBranchField(container: HTMLElement): void {
        const forks = this.plugin.getTimelineForks();
        if (!forks.length) return;

        const field = this.labelledField(container, 'Branch');
        const dropdown = new DropdownComponent(field);
        dropdown.addOption('main', 'Main timeline');
        dropdown.addOption('__compare__', 'Compare branches');
        forks.forEach(fork => { dropdown.addOption(fork.id, fork.name); });
        // Same rule as tracks: management belongs next to the list it manages.
        dropdown.addOption(MANAGE_OPTION, 'Manage branches…');
        dropdown.setValue(this.currentState.currentForkId || 'main');
        dropdown.onChange((selection: string) => {
            if (selection === MANAGE_OPTION) {
                dropdown.setValue(this.currentState.currentForkId || 'main');
                this.openBranchManager();
                return;
            }
            void this.selectFork(selection);
        });
    }

    private openBranchManager(): void {
        void (async () => {
            const { TimelineForkListModal } = await import('../modals/TimelineForkListModal');
            new TimelineForkListModal(this.app, this.plugin).open();
        })();
    }

    /** Open a branch from outside the view, rebuilding the picker around it. */
    async showBranch(forkId: string): Promise<void> {
        this.buildToolbar();
        await this.selectFork(forkId);
    }

    private openTrackManager(): void {
        void (async () => {
            const { TrackManagerModal } = await import('../modals/TrackManagerModal');
            const tracks = this.plugin.getTimelineTracks();
            new TrackManagerModal(this.app, this.plugin, tracks, updated => { void (async () => {
                await this.plugin.setTimelineTracks(updated);
                await this.refresh();
            })(); }).open();
        })();
    }

    private openEraManager(): void {
        void (async () => {
            const { EraListModal } = await import('../modals/EraListModal');
            new EraListModal(this.app, this.plugin).open();
        })();
    }

    /**
     * Conflicts stay in the toolbar rather than the overflow menu: it is the
     * one control that reports a problem, so hiding it would defeat it.
     */
    private buildConflictBadge(container: HTMLElement): void {
        const conflicts = this.plugin.getTimelineConflicts();
        const activeConflicts = conflicts.filter(c => !c.dismissed);
        if (!activeConflicts.length) return;

        const badge = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn storyteller-conflict-badge',
            attr: {
                'aria-label': `${activeConflicts.length} timeline conflicts`,
                'title': `View ${activeConflicts.length} timeline conflict(s)`
            }
        });
        const badgeIcon = badge.createSpan('storyteller-badge-icon');
        setIcon(badgeIcon, 'alert-triangle');
        badge.createSpan({ text: String(activeConflicts.length), cls: 'storyteller-badge-count' });
        badge.addEventListener('click', () => { void (async () => {
            const { ConflictListModal } = await import('../modals/ConflictListModal');
            new ConflictListModal(this.app, this.plugin, conflicts, async () => { await this.refresh(); }).open();
        })(); });
    }

    private buildSearchField(container: HTMLElement): void {
        const searchWrap = container.createDiv('storyteller-timeline-search-wrap');
        const searchIcon = searchWrap.createSpan('storyteller-timeline-search-icon');
        setIcon(searchIcon, 'search');
        this.timelineSearchInputEl = searchWrap.createEl('input', {
            type: 'search',
            cls: 'storyteller-timeline-search-input',
            placeholder: 'Find an event'
        });
        this.timelineSearchDropdownEl = searchWrap.createDiv('storyteller-timeline-search-dropdown');

        this.timelineSearchInputEl.addEventListener('input', () => this.updateSearchDropdown());
        this.timelineSearchInputEl.addEventListener('focus', () => this.updateSearchDropdown());
        this.timelineSearchInputEl.addEventListener('blur', () => window.setTimeout(() => this.hideSearchDropdown(), 120));
        this.timelineSearchInputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') this.runEventSearch();
            if (e.key === 'Escape') this.hideSearchDropdown();
        });
    }

    /**
     * What is left once everything that changes the view has a home of its own:
     * two one-shot actions that touch the whole timeline.
     *
     * The overflow used to hold a filter, the branch switcher and both entity
     * managers as well, which meant an unlabelled button was the only route to
     * things you needed while reading. Nothing in here changes what you see.
     */
    private buildOverflowButton(container: HTMLElement): void {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 'aria-label': 'More timeline options', 'aria-haspopup': 'menu', 'title': 'More options' }
        });
        setIcon(btn, 'more-horizontal');

        btn.addEventListener('click', clickEvent => {
            const menu = new Menu();
            menu.addItem(item => item.setTitle('Export…').setIcon('download').onClick(() => this.showExportMenu(btn)));
            menu.addItem(item => item.setTitle('Refresh').setIcon('refresh-cw').onClick(() => { void this.refresh(); }));
            menu.showAtMouseEvent(clickEvent);
        });
    }

    /** Switch the visible branch, main or a fork or the comparison overlay. */
    private async selectFork(selection: string): Promise<void> {
        this.currentState.currentForkId = selection === 'main' ? undefined : selection;
        this.currentState.filters = {
            ...this.currentState.filters,
            forkId: selection === 'main' ? undefined : selection
        };
        await this.buildTimeline();
        this.updateFooterStatus();
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
            this.updateSearchDropdown();
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
                this.advancedFiltersContent.setCssStyles({ display: this.advancedFiltersExpanded ? 'block' : 'none' });
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
        this.advancedFiltersContent.setCssStyles({ display: this.advancedFiltersExpanded ? 'block' : 'none' });

        // Get events for filter population
        const events = await this.plugin.listEvents();

        // Use shared filter builder for all filter controls
        await this.filterBuilder.buildFilterPanel(this.advancedFiltersContent, events);
    }

    /**
     * Build timeline container and initialize renderer
     */
    private async buildTimeline(): Promise<void> {
        if (!this.timelineContainer) return;
        // A newer build supersedes this one. Destroying the renderer it replaces stops that
        // renderer from mounting when its load finishes, and the generation check keeps a
        // superseded build from touching the controls that now belong to the newer renderer.
        const generation = ++this.timelineBuildGeneration;
        this.renderer?.destroy();
        this.renderer = null;
        this.timelineContainer.empty();
        this.timelineContainer.setCssStyles({ flexGrow: '1' });

        // Initialize timeline renderer
        this.renderer = new TimelineRenderer(this.timelineContainer, this.plugin, {
            ganttMode: this.currentState.ganttMode,
            timelineLayout: this.currentState.timelineLayout,
            timelineOrientation: this.currentState.timelineOrientation,
            groupMode: this.currentState.groupMode,
            stackEnabled: this.currentState.stackEnabled,
            density: this.currentState.density,
            editMode: this.currentState.editMode,
            showEras: this.currentState.showEras,
            showPresence: this.currentState.showPresence,
            narrativeOrder: this.currentState.narrativeOrder,
            getReferenceDate: () => this.plugin.getReferenceTodayDate(),
            defaultGanttDuration: this.plugin.settings.ganttDefaultDuration ?? 1,
            showProgressBars: this.plugin.settings.ganttShowProgressBars ?? true,
            dependencyArrowStyle: this.plugin.settings.ganttArrowStyle ?? 'solid',
            onConflictsDetected: (conflicts) => { void this.handleConflicts(conflicts); },
            // The span readout is only honest if panning and the wheel update
            // it too, not just the zoom buttons.
            onViewChange: () => this.controlsBuilder.updateZoomReadout()
        });

        try {
            const renderer = this.renderer;
            await renderer.initialize();
            if (generation !== this.timelineBuildGeneration) return;
            // Layers are not constructor options, so a fresh renderer starts
            // with both off no matter what the Show menu says.
            if (this.showScenes) renderer.setShowScenes(true);
            if (this.showWatchedNotes) renderer.setShowWatchedNotes(true);
            renderer.applyFilters(this.currentState.filters);
            this.scheduleTimelineRedraw();
            this.updateSearchDropdown();
            this.renderEmptyState();
        } catch {
            if (generation !== this.timelineBuildGeneration) return;
            this.timelineContainer.empty();
            const errorEl = this.timelineContainer.createDiv('storyteller-timeline-error');
            errorEl.createEl('h3', { text: 'Timeline error' });
            errorEl.createEl('p', { text: 'Failed to initialize timeline data. Check developer console for details.' });
            new Notice('Timeline failed to load. Check console for details.');
        }
    }

    /**
     * An empty canvas says nothing. Someone opening the timeline for the first
     * time, or filtering everything away by accident, gets told what the view
     * is for and what to do next instead of an expanse of nothing.
     */
    private renderEmptyState(): void {
        this.timelineContainer?.querySelector('.storyteller-timeline-empty')?.remove();
        if (!this.timelineContainer || !this.renderer) return;
        const tally = this.renderer.getEventTally();
        if (tally.dated > 0) return;

        const empty = this.timelineContainer.createDiv('storyteller-timeline-empty');
        const icon = empty.createDiv('storyteller-timeline-empty-icon');

        // Three different blanks need three different messages: no events at
        // all, events that are waiting on a date, and events that filters hide.
        if (tally.undated.length > 0) {
            const count = tally.undated.length;
            setIcon(icon, 'calendar-plus');
            empty.createEl('h3', {
                text: `${count} ${count === 1 ? 'event needs' : 'events need'} a date`
            });
            empty.createEl('p', {
                cls: 'storyteller-timeline-empty-body',
                text: 'Events appear on the timeline once they have a date. Start by giving the first one a date, and the rest can follow the same way.'
            });
            const actions = empty.createDiv('storyteller-timeline-empty-actions');
            const [first] = tally.undated;
            const dateBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Set a date on the first event' });
            dateBtn.addEventListener('click', () => { void (async () => {
                const { EventModal } = await import('../modals/EventModal');
                new EventModal(this.app, this.plugin, first, async updated => {
                    await this.plugin.saveEvent(updated);
                    await this.refresh();
                }).open();
            })(); });
        } else if (tally.hiddenByFilters > 0) {
            const count = tally.hiddenByFilters;
            setIcon(icon, 'filter-x');
            empty.createEl('h3', {
                text: `Filters are hiding ${count} ${count === 1 ? 'event' : 'events'}`
            });
            empty.createEl('p', {
                cls: 'storyteller-timeline-empty-body',
                text: 'Every event was filtered out. Clear the filters to see the whole story again.'
            });
            const actions = empty.createDiv('storyteller-timeline-empty-actions');
            const clearBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Clear filters' });
            clearBtn.addEventListener('click', () => { void (async () => {
                this.currentState.filters = {};
                this.currentState.currentTrackId = undefined;
                await this.refresh();
            })(); });
        } else {
            setIcon(icon, 'clock');
            empty.createEl('h3', { text: 'Nothing on this timeline yet' });
            empty.createEl('p', {
                cls: 'storyteller-timeline-empty-body',
                text: 'Events that have a date appear here in order, so you can see how your story unfolds and drag things around to change when they happen.'
            });
            const actions = empty.createDiv('storyteller-timeline-empty-actions');
            const createBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Create an event' });
            createBtn.addEventListener('click', () => { void (async () => {
                const { EventModal } = await import('../modals/EventModal');
                new EventModal(this.app, this.plugin, null, async created => {
                    await this.plugin.saveEvent(created);
                    await this.refresh();
                }).open();
            })(); });
        }
    }

    private scheduleTimelineRedraw(): void {
        window.requestAnimationFrame(() => {
            this.renderer?.redraw();
            window.setTimeout(() => this.renderer?.redraw(), 80);
        });
    }

    /**
     * Handle detected conflicts from renderer
     */
    private async handleConflicts(conflicts: DetectedConflict[]): Promise<void> {
        const newConflicts = ConflictDetector.toStorageFormat(conflicts);
        const currentConflicts = this.plugin.getTimelineConflicts();
        
        // Merge to preserve dismissed status
        const mergedConflicts = newConflicts.map(newC => {
            const existing = currentConflicts.find(c => c.id === newC.id);
            if (existing) {
                return { ...newC, dismissed: existing.dismissed };
            }
            return newC;
        });

        // Only update if changed
        if (JSON.stringify(mergedConflicts) !== JSON.stringify(currentConflicts)) {
            await this.plugin.setTimelineConflicts(mergedConflicts);
            this.buildToolbar();
        }
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
        // Always start with clean entity filters when switching tracks
        const newFilters: TimelineFilters = {
            ...this.currentState.filters,
            characters: undefined,
            locations: undefined,
            groups: undefined,
            tags: undefined
        };

        if (!trackId) {
            // Clear track filter - show all events
            this.currentState.filters = newFilters;
            // Rebuild timeline to ensure proper refresh
            await this.buildTimeline();
            this.updateFooterStatus();
            return;
        }

        // Get the selected track
        const track = this.plugin.getTimelineTrack(trackId);
        if (!track) {
            
            // Still rebuild with cleared filters to show all events
            this.currentState.filters = newFilters;
            await this.buildTimeline();
            this.updateFooterStatus();
            return;
        }

        // Handle different track types
        if (track.type === 'global') {
            // Global track shows all events - filters already cleared above
            newFilters.milestonesOnly = false;
        } else if (track.type === 'character' && track.entityId) {
            // Character track - filter by specific character
            newFilters.characters = new Set([track.entityId]);
        } else if (track.type === 'location' && track.entityId) {
            // Location track - filter by specific location
            newFilters.locations = new Set([track.entityId]);
        } else if (track.type === 'group' && track.entityId) {
            // Group track - filter by specific group
            newFilters.groups = new Set([track.entityId]);
        } else if (track.type === 'custom' && track.filterCriteria) {
            // Custom track - use filter criteria
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
            newFilters.milestonesOnly = track.filterCriteria.milestonesOnly || false;
        }

        this.currentState.filters = newFilters;
        // Rebuild timeline to ensure proper refresh when switching tracks
        await this.buildTimeline();
        this.updateFooterStatus();
    }

    /**
     * Update footer status text
     */
    private updateFooterStatus(): void {
        if (!this.footerStatusEl || !this.renderer) return;

        const tally = this.renderer.getEventTally();
        const dateRange = this.renderer.getDateRange();
        const plural = (n: number) => `${n} event${n !== 1 ? 's' : ''}`;

        if (tally.total === 0) {
            this.footerStatusEl.setText(t('noEventsFound'));
        } else if (tally.dated === 0 && tally.undated.length === 0) {
            this.footerStatusEl.setText(`0 events shown, ${tally.hiddenByFilters} hidden by filters`);
        } else if (tally.dated === 0) {
            this.footerStatusEl.setText(`${plural(tally.undated.length)}, none dated`);
        } else {
            let statusText = plural(tally.dated);
            if (tally.undated.length > 0) statusText += `, ${tally.undated.length} undated`;
            if (dateRange) {
                statusText += ` • ${this.renderer.formatDateSpan(dateRange.start, dateRange.end)}`;
            }
            if (this.currentState.ganttMode) {
                statusText += ` • ${t('ganttView')}`;
            }
            this.footerStatusEl.setText(statusText);
        }
    }

    private runEventSearch(): void {
        const q = this.timelineSearchInputEl?.value?.trim() || '';
        if (!q || !this.renderer) return;
        const found = this.renderer.focusEventByQuery(q);
        if (!found) {
            new Notice(`No event found for "${q}"`);
            return;
        }
        this.hideSearchDropdown();
    }

    private updateSearchDropdown(): void {
        if (!this.timelineSearchDropdownEl || !this.renderer) return;
        const query = (this.timelineSearchInputEl?.value || '').trim().toLowerCase();
        this.timelineSearchDropdownEl.empty();

        if (!query) {
            this.hideSearchDropdown();
            return;
        }

        const matches = this.renderer.searchVisibleEvents(query, 12);

        if (matches.length === 0) {
            const empty = this.timelineSearchDropdownEl.createDiv('storyteller-timeline-search-empty');
            empty.setText('No matching events');
            this.timelineSearchDropdownEl.addClass('is-open');
            return;
        }

        for (const evt of matches) {
            const row = this.timelineSearchDropdownEl.createEl('button', {
                cls: 'storyteller-timeline-search-row',
                type: 'button'
            });
            row.createSpan({ cls: 'storyteller-timeline-search-row-name', text: evt.name || '(Untitled Event)' });
            row.createSpan({ cls: 'storyteller-timeline-search-row-date', text: evt.dateTime || 'Undated' });
            row.addEventListener('mousedown', (e) => e.preventDefault());
            row.addEventListener('click', () => {
                this.renderer?.focusEvent(evt);
                this.hideSearchDropdown();
            });
        }

        this.timelineSearchDropdownEl.addClass('is-open');
    }

    private hideSearchDropdown(): void {
        if (!this.timelineSearchDropdownEl) return;
        this.timelineSearchDropdownEl.removeClass('is-open');
        this.timelineSearchDropdownEl.empty();
    }

    /**
     * Setup resize observer for responsive layout
     */
    private setupResizeObserver(): void {
        this.resizeObserver?.disconnect();
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
            this.scheduleTimelineRedraw();
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
                .onClick(() => { void this.renderer?.exportAsImage('png'); });
        });

        menu.addItem((item) => {
            item.setTitle(t('exportAsJPG'))
                .setIcon('image')
                .onClick(() => { void this.renderer?.exportAsImage('jpg'); });
        });

        menu.addSeparator();

        // Kept apart from the two above because they capture different things:
        // those save the window, these save the story.
        menu.addItem((item) => {
            item.setTitle('Export whole timeline as PNG')
                .setIcon('maximize')
                .onClick(() => { void this.renderer?.exportAsImage('png', 'full'); });
        });

        menu.addItem((item) => {
            item.setTitle('Export whole timeline as JPG')
                .setIcon('maximize')
                .onClick(() => { void this.renderer?.exportAsImage('jpg', 'full'); });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Export as CSV')
                .setIcon('table')
                .onClick(() => { void this.renderer?.exportAsCsv(); });
        });

        menu.addItem((item) => {
            item.setTitle('Export as JSON')
                .setIcon('braces')
                .onClick(() => { void this.renderer?.exportAsJson(); });
        });

        menu.addItem((item) => {
            item.setTitle('Export as Markdown')
                .setIcon('file-text')
                .onClick(() => { void this.renderer?.exportAsMarkdown(); });
        });

        menu.showAtMouseEvent(new MouseEvent('click', {
            clientX: buttonEl.getBoundingClientRect().left,
            clientY: buttonEl.getBoundingClientRect().bottom
        }));
    }

    /**
     * Get view state for persistence.
     *
     * Everything the toolbar can change belongs here. Anything left out is a
     * control that silently forgets itself the next time the workspace loads,
     * and `setState` already reads several keys that nothing was writing.
     */
    getState(): Record<string, unknown> {
        // Capture current window range for zoom/scroll persistence
        const visibleRange = this.renderer?.getVisibleRange();
        const setOrUndefined = (value: Set<string> | undefined) =>
            value ? Array.from(value) : undefined;

        return {
            ganttMode: this.currentState.ganttMode,
            timelineLayout: this.currentState.timelineLayout,
            timelineOrientation: this.currentState.timelineOrientation,
            groupMode: this.currentState.groupMode,
            stackEnabled: this.currentState.stackEnabled,
            density: this.currentState.density,
            editMode: this.currentState.editMode,
            showEras: this.currentState.showEras,
            showPresence: this.currentState.showPresence,
            narrativeOrder: this.currentState.narrativeOrder,
            currentTrackId: this.currentState.currentTrackId,
            currentForkId: this.currentState.currentForkId,
            // Layers live on the view rather than in TimelineUIState, but they
            // are toolbar state all the same.
            showScenes: this.showScenes,
            showWatchedNotes: this.showWatchedNotes,
            filters: {
                milestonesOnly: this.currentState.filters.milestonesOnly,
                characters: setOrUndefined(this.currentState.filters.characters),
                locations: setOrUndefined(this.currentState.filters.locations),
                groups: setOrUndefined(this.currentState.filters.groups),
                tags: setOrUndefined(this.currentState.filters.tags),
                eras: setOrUndefined(this.currentState.filters.eras),
                forkId: this.currentState.filters.forkId
            },
            // Save visible window range for restoring zoom/scroll position
            visibleRange: visibleRange ? {
                start: visibleRange.start.toISOString(),
                end: visibleRange.end.toISOString()
            } : undefined
        };
    }

    /** Everything in the persisted state except the window, which drifts on every pan. */
    private stateSignature(): string {
        const state = this.getState();
        state.visibleRange = undefined;
        return JSON.stringify(state);
    }

    /**
     * Set view state from persistence.
     *
     * The state object is updated in place rather than replaced. Both builders
     * were handed this exact object in the constructor and hold their own
     * reference to it, so swapping it out left the toolbar driving one state
     * and the view reading another.
     */

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);

        if (isRecord(state)) {
            const before = this.stateSignature();
            const filters = restoreFilters(state.filters);
            const restored: TimelineViewState = {
                ganttMode: state.ganttMode === true,
                timelineLayout: state.timelineLayout === 'timeline' ? 'timeline' : 'chronology',
                timelineOrientation: state.timelineOrientation === 'vertical' ? 'vertical' : 'horizontal',
                groupMode: isGroupMode(state.groupMode) ? state.groupMode : (this.plugin.settings.defaultTimelineGroupMode || 'location'),
                stackEnabled: typeof state.stackEnabled === 'boolean' ? state.stackEnabled : true,
                density: typeof state.density === 'number' ? state.density : 50,
                editMode: state.editMode === true,
                filters,
                showEras: state.showEras === true,
                showPresence: state.showPresence === true,
                narrativeOrder: state.narrativeOrder === true,
                currentTrackId: typeof state.currentTrackId === 'string' ? state.currentTrackId : undefined,
                currentForkId: typeof state.currentForkId === 'string' ? state.currentForkId : undefined
            };
            Object.assign(this.currentState, restored);
            this.showScenes = state.showScenes === true;
            this.showWatchedNotes = state.showWatchedNotes === true;

            // A restore can land after onOpen has already drawn the toolbar off
            // the defaults, and nothing else re-reads state afterwards. Only when
            // something actually moved: setState also fires on workspace churn
            // that has nothing to do with the timeline.
            if (this.toolbarEl && this.stateSignature() !== before) {
                this.buildToolbar();
                await this.buildTimeline();
            }

            // Restore visible window range if available
            if (isRecord(state.visibleRange) && this.renderer) {
                try {
                    if (typeof state.visibleRange.start === 'string' && typeof state.visibleRange.end === 'string') {
                        const start = new Date(state.visibleRange.start);
                        const end = new Date(state.visibleRange.end);
                        // Use setTimeout to ensure timeline is fully initialized
                        window.setTimeout(() => {
                            if (this.renderer) {
                                this.renderer.setVisibleRange(start, end);
                            }
                        }, 100);
                    }
                } catch {
                	// intentional
                    
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
        if (!this.renderer) return;
        // The Branch picker is built from the fork list, and refresh only ever
        // redrew the canvas. A branch created while this view was open never
        // showed up in the picker, which read as forks being broken when the
        // only thing missing was the control that selects one.
        const signature = this.branchSignature();
        if (signature !== this.lastBranchSignature) this.buildToolbar();
        await this.renderer.refresh();
        this.updateFooterStatus();
        this.updateSearchDropdown();
    }

    /**
     * Point the view at whichever story is active now.
     *
     * Filters name characters, locations, tracks and branches belonging to the
     * story that was active when they were set. Carrying them across a switch
     * would filter the new story by names it has never heard of, which shows up
     * as an empty timeline and reads as the new story having no events.
     */
    async reloadForStory(): Promise<void> {
        this.currentState.filters = {};
        this.currentState.currentTrackId = undefined;
        this.currentState.currentForkId = undefined;
        this.buildToolbar();
        await this.buildAdvancedFilters();
        if (this.filterChipsEl) this.filterBuilder.renderFilterChips(this.filterChipsEl);
        await this.buildTimeline();
        this.updateFooterStatus();
        this.updateSearchDropdown();
    }

    /** Changes whenever a branch is added, renamed or removed. */
    private branchSignature(): string {
        return this.plugin.getTimelineForks().map(fork => `${fork.id}:${fork.name}`).join('|');
    }
}
