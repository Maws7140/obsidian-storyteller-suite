// Timeline View - Full workspace view for timeline visualization
// Provides a dedicated panel for viewing and interacting with the story timeline

import { ItemView, WorkspaceLeaf, setIcon, Menu, Setting } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { TimelineRenderer, TimelineFilters } from '../utils/TimelineRenderer';

export const VIEW_TYPE_TIMELINE = 'storyteller-timeline-view';

export interface TimelineViewState {
    ganttMode: boolean;
    groupMode: 'none' | 'location' | 'group' | 'character';
    filters: TimelineFilters;
    stackEnabled: boolean;
    density: number;
    editMode: boolean;
    /** Selected calendar for timeline display (Level 3 feature)
     * undefined = "All Calendars (Gregorian)" mode */
    selectedCalendarId?: string;
    /** Display mode for timeline (Level 3 feature) */
    calendarDisplayMode?: 'single' | 'dual-axis';
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
    private currentState: TimelineViewState;
    
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
        
        // Initialize default state
        this.currentState = {
            ganttMode: false,
            groupMode: (this.plugin.settings.defaultTimelineGroupMode || 'none') as 'none' | 'location' | 'group' | 'character',
            filters: {},
            stackEnabled: this.plugin.settings.defaultTimelineStack ?? true,
            density: this.plugin.settings.defaultTimelineDensity ?? 50,
            editMode: false
        };
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
        this.buildAdvancedFilters();
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

        // Gantt/Timeline toggle button
        const ganttBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': this.currentState.ganttMode ? t('timelineView') : t('ganttView'),
                'title': this.currentState.ganttMode ? t('timelineView') : t('ganttView')
            }
        });
        setIcon(ganttBtn, this.currentState.ganttMode ? 'bar-chart-2' : 'clock');
        ganttBtn.addEventListener('click', () => {
            this.currentState.ganttMode = !this.currentState.ganttMode;
            setIcon(ganttBtn, this.currentState.ganttMode ? 'bar-chart-2' : 'clock');
            ganttBtn.setAttribute('aria-label', this.currentState.ganttMode ? t('timelineView') : t('ganttView'));
            ganttBtn.setAttribute('title', this.currentState.ganttMode ? t('timelineView') : t('ganttView'));
            this.renderer?.setGanttMode(this.currentState.ganttMode);
            this.updateFooterStatus();
        });

        // Grouping dropdown (compact)
        const groupingContainer = this.toolbarEl.createDiv('storyteller-grouping-container');
        const groupingSelect = groupingContainer.createEl('select', {
            cls: 'dropdown storyteller-grouping-select',
            attr: { 'aria-label': 'Grouping mode' }
        });
        [
            { value: 'none', label: t('noGrouping') },
            { value: 'location', label: t('byLocation') },
            { value: 'group', label: t('byGroup') },
            { value: 'character', label: t('byCharacter') }
        ].forEach(opt => {
            const option = groupingSelect.createEl('option', { value: opt.value, text: opt.label });
            if (opt.value === this.currentState.groupMode) {
                option.selected = true;
            }
        });
        groupingSelect.addEventListener('change', () => {
            this.currentState.groupMode = groupingSelect.value as 'none' | 'location' | 'group' | 'character';
            this.renderer?.setGroupMode(this.currentState.groupMode);
            this.updateFooterStatus();
        });

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

        forkSelect.addEventListener('change', () => {
            const selectedFork = forkSelect.value;
            // TODO: Filter events by fork
            // For now, just show a notice
            if (selectedFork === 'main') {
                // Show all events
            } else {
                // Filter to fork-specific events
                const fork = this.plugin.getTimelineFork(selectedFork);
                if (fork) {
                    // Future: filter events by fork
                }
            }
        });

        // Calendar selector dropdown (Level 3 feature)
        const calendarContainer = this.toolbarEl.createDiv('storyteller-calendar-container');
        const calendarSelect = calendarContainer.createEl('select', {
            cls: 'dropdown storyteller-calendar-select',
            attr: { 'aria-label': 'Calendar system' }
        });

        // Add "All Calendars (Gregorian)" option
        const allCalendarsOption = calendarSelect.createEl('option', {
            value: '',
            text: '📅 All Calendars (Gregorian)'
        });
        allCalendarsOption.selected = !this.currentState.selectedCalendarId;

        // Add custom calendar options
        this.plugin.listCalendars().then(calendars => {
            calendars.forEach(calendar => {
                const option = calendarSelect.createEl('option', {
                    value: calendar.id || calendar.name,
                    text: `📆 ${calendar.name}`
                });
                if (this.currentState.selectedCalendarId === (calendar.id || calendar.name)) {
                    option.selected = true;
                }
            });
        });

        calendarSelect.addEventListener('change', () => {
            this.currentState.selectedCalendarId = calendarSelect.value || undefined;
            // Update timeline with selected calendar
            this.renderer?.setCalendar(this.currentState.selectedCalendarId);
            this.updateFooterStatus();
            // Rebuild toolbar to show calendar mode badge
            this.buildToolbar();
        });

        // Calendar mode badge (if custom calendar is selected)
        if (this.currentState.selectedCalendarId) {
            this.plugin.listCalendars().then(calendars => {
                const selectedCalendar = calendars.find(
                    c => (c.id || c.name) === this.currentState.selectedCalendarId
                );
                if (selectedCalendar) {
                    const calendarBadge = this.toolbarEl?.createEl('span', {
                        cls: 'storyteller-calendar-badge',
                        attr: {
                            'title': `Viewing in ${selectedCalendar.name} calendar`
                        }
                    });
                    if (calendarBadge) {
                        calendarBadge.textContent = `📆 ${selectedCalendar.name}`;
                    }
                }
            });
        }

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
                        const characters = await this.plugin.listCharacters();
                        const locations = await this.plugin.listLocations();
                        const causalityLinks = this.plugin.getCausalityLinks();

                        const { ConflictDetector } = await import('../utils/ConflictDetection');
                        const newConflicts = ConflictDetector.detectConflicts(
                            events,
                            characters,
                            locations,
                            causalityLinks
                        );

                        this.plugin.settings.timelineConflicts = newConflicts;
                        await this.plugin.saveSettings();

                        // Rebuild toolbar to update badge
                        this.buildToolbar();
                    }
                ).open();
            });
        }

        // Fit button
        const fitBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('fit'),
                'title': t('fit')
            }
        });
        setIcon(fitBtn, 'maximize-2');
        fitBtn.addEventListener('click', () => this.renderer?.fitToView());

        // Decade button
        const decadeBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('decade'),
                'title': t('decade')
            }
        });
        setIcon(decadeBtn, 'calendar');
        decadeBtn.addEventListener('click', () => this.renderer?.zoomPresetYears(10));

        // Century button
        const centuryBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('century'),
                'title': t('century')
            }
        });
        setIcon(centuryBtn, 'calendar-days');
        centuryBtn.addEventListener('click', () => this.renderer?.zoomPresetYears(100));

        // Today button
        const todayBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('today'),
                'title': t('today')
            }
        });
        setIcon(todayBtn, 'calendar-clock');
        todayBtn.addEventListener('click', () => this.renderer?.moveToToday());

        // Edit mode toggle
        const editBtn = this.toolbarEl.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 
                'aria-label': t('editMode'),
                'title': t('editModeTooltip')
            }
        });
        setIcon(editBtn, this.currentState.editMode ? 'pencil' : 'lock');
        editBtn.addEventListener('click', () => {
            this.currentState.editMode = !this.currentState.editMode;
            setIcon(editBtn, this.currentState.editMode ? 'pencil' : 'lock');
            this.renderer?.setEditMode(this.currentState.editMode);
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
            await this.renderer?.refresh();
            this.updateFooterStatus();
        });
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
    private buildAdvancedFilters(): void {
        if (!this.advancedFiltersEl) return;
        this.advancedFiltersEl.empty();

        // Content section (initially hidden)
        this.advancedFiltersContent = this.advancedFiltersEl.createDiv('storyteller-advanced-filters-content');
        this.advancedFiltersContent.style.display = this.advancedFiltersExpanded ? 'block' : 'none';

        // Character filter
        new Setting(this.advancedFiltersContent)
            .setName(t('filterByCharacter'))
            .addDropdown(dropdown => {
                dropdown.addOption('', t('selectCharacterFilter'));
                // Populate with characters from events
                const allCharacters = new Set<string>();
                this.plugin.listEvents().then(events => {
                    events.forEach(e => {
                        if (e.characters) e.characters.forEach(c => allCharacters.add(c));
                    });
                    Array.from(allCharacters).sort().forEach(char => {
                        dropdown.addOption(char, char);
                    });
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value) {
                        if (!this.currentState.filters.characters) {
                            this.currentState.filters.characters = new Set();
                        }
                        this.currentState.filters.characters.add(value);
                        this.renderer?.applyFilters(this.currentState.filters);
                        this.updateFooterStatus();
                        dropdown.setValue('');
                    }
                });
            });

        // Location filter
        new Setting(this.advancedFiltersContent)
            .setName(t('filterByLocation'))
            .addDropdown(dropdown => {
                dropdown.addOption('', t('selectLocationFilter'));
                const allLocations = new Set<string>();
                this.plugin.listEvents().then(events => {
                    events.forEach(e => {
                        if (e.location) allLocations.add(e.location);
                    });
                    Array.from(allLocations).sort().forEach(loc => {
                        dropdown.addOption(loc, loc);
                    });
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value) {
                        if (!this.currentState.filters.locations) {
                            this.currentState.filters.locations = new Set();
                        }
                        this.currentState.filters.locations.add(value);
                        this.renderer?.applyFilters(this.currentState.filters);
                        this.updateFooterStatus();
                        dropdown.setValue('');
                    }
                });
            });

        // Group filter
        new Setting(this.advancedFiltersContent)
            .setName(t('filterByGroup'))
            .addDropdown(dropdown => {
                dropdown.addOption('', t('selectGroupFilter'));
                const groups = this.plugin.getGroups();
                groups.forEach(g => {
                    dropdown.addOption(g.id, g.name);
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value) {
                        if (!this.currentState.filters.groups) {
                            this.currentState.filters.groups = new Set();
                        }
                        this.currentState.filters.groups.add(value);
                        this.renderer?.applyFilters(this.currentState.filters);
                        this.updateFooterStatus();
                        dropdown.setValue('');
                    }
                });
            });

        // Clear all filters button
        new Setting(this.advancedFiltersContent)
            .addButton(button => button
                .setButtonText(t('clearAllFilters'))
                .onClick(() => {
                    this.currentState.filters = {};
                    this.renderer?.applyFilters(this.currentState.filters);
                    this.updateFooterStatus();
                }));
    }

    /**
     * Build timeline container and initialize renderer
     */
    private async buildTimeline(): Promise<void> {
        if (!this.timelineContainer) return;
        this.timelineContainer.empty();
        this.timelineContainer.style.flexGrow = '1';
        this.timelineContainer.style.overflow = 'hidden';

        // Initialize timeline renderer
        this.renderer = new TimelineRenderer(this.timelineContainer, this.plugin, {
            ganttMode: this.currentState.ganttMode,
            groupMode: this.currentState.groupMode,
            stackEnabled: this.currentState.stackEnabled,
            density: this.currentState.density,
            editMode: this.currentState.editMode,
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
        // Timeline auto-adjusts to container size, but we can trigger fit if needed
        // this.renderer?.fitToView();
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
            }
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
                filters: state.filters || {}
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
