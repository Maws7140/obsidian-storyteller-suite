import { App, Modal, Setting, Notice, ButtonComponent, setIcon } from 'obsidian';
import { t } from '../i18n/strings';
import { Event, TimelineUIState } from '../types';
import StorytellerSuitePlugin from '../main';
import { EventModal } from './EventModal';
import { TimelineRenderer } from '../utils/TimelineRenderer';
import { TimelineControlsBuilder, TimelineControlCallbacks } from '../utils/TimelineControlsBuilder';
import { TimelineFilterBuilder, TimelineFilterCallbacks } from '../utils/TimelineFilterBuilder';

export class TimelineModal extends Modal {
    plugin: StorytellerSuitePlugin;
    events: Event[];
    timelineContainer: HTMLElement;
    renderer: TimelineRenderer | null = null;
    legendEl?: HTMLElement;
    detailsEl?: HTMLElement;

    // Shared state and builders
    private currentState: TimelineUIState;
    private controlsBuilder: TimelineControlsBuilder;
    private filterBuilder: TimelineFilterBuilder;

    // UI state
    private defaultGanttDuration = 1;
    private filterPanelVisible = false;
    private filterChipsEl: HTMLElement | null = null;
    private timelineSearchInputEl: HTMLInputElement | null = null;
    private timelineSearchDropdownEl: HTMLElement | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin, events: Event[]) {
        super(app);
        this.plugin = plugin;
        this.events = events;
        this.modalEl.addClass('storyteller-list-modal');
        this.modalEl.addClass('storyteller-timeline-modal');

        // Initialize state using shared utility
        this.currentState = TimelineControlsBuilder.createDefaultState(plugin);
        this.defaultGanttDuration = plugin.settings.ganttDefaultDuration ?? 1;

        // Create control callbacks
        const controlCallbacks: TimelineControlCallbacks = {
            onStateChange: () => {
                if (this.filterChipsEl) {
                    this.filterBuilder.renderFilterChips(this.filterChipsEl);
                }
                this.updateSearchDropdown();
            },
            onRendererUpdate: () => this.renderTimeline(),
            getRenderer: () => this.renderer,
            getEvents: () => this.events
        };

        // Create filter callbacks
        const filterCallbacks: TimelineFilterCallbacks = {
            onFilterChange: () => {
                if (this.filterChipsEl) {
                    this.filterBuilder.renderFilterChips(this.filterChipsEl);
                }
                this.updateSearchDropdown();
            },
            getRenderer: () => this.renderer
        };

        // Initialize builders
        this.controlsBuilder = new TimelineControlsBuilder(plugin, this.currentState, controlCallbacks);
        this.filterBuilder = new TimelineFilterBuilder(plugin, this.currentState, filterCallbacks);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('timeline') });

        // Controls toolbar using shared builder
        const toolbarContainer = contentEl.createDiv('storyteller-timeline-toolbar');

        // Create toolbar controls using shared builder
        this.controlsBuilder.createGanttToggle(toolbarContainer);
        this.controlsBuilder.createGroupingDropdown(toolbarContainer);
        this.controlsBuilder.createFitButton(toolbarContainer);
        this.controlsBuilder.createFitGroupsButton(toolbarContainer);
        this.controlsBuilder.createDecadeButton(toolbarContainer);
        this.controlsBuilder.createCenturyButton(toolbarContainer);
        this.controlsBuilder.createTodayButton(toolbarContainer);
        this.controlsBuilder.createEditModeToggle(toolbarContainer);
        this.controlsBuilder.createCopyRangeButton(toolbarContainer);
        this.controlsBuilder.createDensityPresetButton(toolbarContainer);

        // Quick jump-to-event search
        const searchWrap = toolbarContainer.createDiv('storyteller-timeline-search-wrap');
        this.timelineSearchInputEl = searchWrap.createEl('input', {
            type: 'search',
            cls: 'storyteller-timeline-search-input',
            placeholder: 'Jump to event...'
        });
        this.timelineSearchDropdownEl = searchWrap.createDiv('storyteller-timeline-search-dropdown');
        const searchBtn = searchWrap.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 'aria-label': 'Jump to event', 'title': 'Jump to event' }
        });
        searchBtn.setText('Go');
        searchBtn.addEventListener('click', () => this.runEventSearch());

        const milestonesBtn = searchWrap.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn' + (this.currentState.filters.milestonesOnly ? ' is-active' : ''),
            attr: { 'aria-label': t('milestonesOnly'), 'title': t('milestonesOnly') }
        });
        setIcon(milestonesBtn, 'star');
        milestonesBtn.addEventListener('click', () => {
            const next = !this.currentState.filters.milestonesOnly;
            this.currentState.filters.milestonesOnly = next;
            milestonesBtn.toggleClass('is-active', next);
            this.renderer?.applyFilters(this.currentState.filters);
            if (this.filterChipsEl) this.filterBuilder.renderFilterChips(this.filterChipsEl);
            this.updateSearchDropdown();
        });

        this.timelineSearchInputEl.addEventListener('input', () => this.updateSearchDropdown());
        this.timelineSearchInputEl.addEventListener('focus', () => this.updateSearchDropdown());
        this.timelineSearchInputEl.addEventListener('blur', () => window.setTimeout(() => this.hideSearchDropdown(), 120));
        this.timelineSearchInputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') this.runEventSearch();
            if (e.key === 'Escape') this.hideSearchDropdown();
        });

        // Filter panel
        const filterPanelContainer = contentEl.createDiv('storyteller-filter-panel-container');
        new ButtonComponent(filterPanelContainer)
            .setButtonText('Filters')
            .setIcon('filter')
            .onClick(() => {
                this.filterPanelVisible = !this.filterPanelVisible;
                filterPanel.style.display = this.filterPanelVisible ? 'block' : 'none';
            });

        const filterPanel = filterPanelContainer.createDiv('storyteller-filter-panel');
        filterPanel.style.display = this.filterPanelVisible ? 'block' : 'none';

        // Use shared filter builder for all filter controls
        await this.filterBuilder.buildFilterPanel(filterPanel, this.events);

        // Active filter chips
        this.filterChipsEl = contentEl.createDiv('storyteller-filter-chips');
        this.filterBuilder.renderFilterChips(this.filterChipsEl);

        // Timeline container
        this.timelineContainer = contentEl.createDiv('storyteller-timeline-container');
        this.timelineContainer.style.height = 'clamp(360px, 58vh, 680px)';
        this.timelineContainer.style.minHeight = '360px';
        this.timelineContainer.style.marginBottom = '0.75rem';

        // Legend container
        this.legendEl = contentEl.createDiv('storyteller-timeline-legend');
        // Selection details container
        this.detailsEl = contentEl.createDiv('storyteller-timeline-details');

        // Build timeline now
        await this.renderTimeline();
        this.controlsBuilder.applyDefaultZoomPreset();
        // No secondary list render

        // Add New button
        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText(t('createNewEvent'))
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new EventModal(this.app, this.plugin, null, async (eventData: Event) => {
                            await this.plugin.saveEvent(eventData);
                            new Notice(t('created', t('event'), eventData.name));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip('Select or create a story first.');
                }
            });
    }

    // List UI removed

    private async renderTimeline() {
        // Clear existing renderer if present
        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }

        // Clear legend and details
        if (this.legendEl) {
            this.legendEl.empty();
        }
        if (this.detailsEl) {
            this.detailsEl.empty();
        }

        // Initialize new renderer with current settings from shared state
        this.renderer = new TimelineRenderer(this.timelineContainer, this.plugin, {
            ganttMode: this.currentState.ganttMode,
            groupMode: this.currentState.groupMode,
            stackEnabled: this.currentState.stackEnabled,
            density: this.currentState.density,
            editMode: this.currentState.editMode,
            defaultGanttDuration: this.defaultGanttDuration,
            showProgressBars: this.plugin.settings.ganttShowProgressBars ?? true,
            dependencyArrowStyle: this.plugin.settings.ganttArrowStyle ?? 'solid',
            showDependencies: true,
            showEras: this.currentState.showEras,
            narrativeOrder: this.currentState.narrativeOrder
        });

        try {
            await this.renderer.initialize();

            // Apply filters using shared utility
            if (this.filterBuilder.hasActiveFilters()) {
                this.renderer.applyFilters(this.currentState.filters);
            }
            this.updateSearchDropdown();
        } catch (error) {
            console.error('Storyteller Suite: Timeline modal failed to initialize.', error);
            this.timelineContainer.empty();
            const errorEl = this.timelineContainer.createDiv('storyteller-timeline-error');
            errorEl.createEl('h3', { text: 'Timeline Error' });
            errorEl.createEl('p', { text: 'Failed to initialize timeline data. Check developer console for details.' });
            new Notice('Timeline failed to load. Check console for details.');
        }
    }


    onClose() {
        this.contentEl.empty();
        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
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
}
