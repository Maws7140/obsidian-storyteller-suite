import { App, Modal, Setting, Notice, ButtonComponent } from 'obsidian';
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
        this.controlsBuilder.createDecadeButton(toolbarContainer);
        this.controlsBuilder.createCenturyButton(toolbarContainer);
        this.controlsBuilder.createTodayButton(toolbarContainer);
        this.controlsBuilder.createEditModeToggle(toolbarContainer);
        this.controlsBuilder.createCopyRangeButton(toolbarContainer);

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
        this.filterBuilder.buildFilterPanel(filterPanel, this.events);

        // Active filter chips
        this.filterChipsEl = contentEl.createDiv('storyteller-filter-chips');
        this.filterBuilder.renderFilterChips(this.filterChipsEl);

        // Timeline container
        this.timelineContainer = contentEl.createDiv();
        this.timelineContainer.style.height = '380px';
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
            showDependencies: true,
            showEras: this.currentState.showEras,
            narrativeOrder: this.currentState.narrativeOrder
        });

        await this.renderer.initialize();

        // Apply filters using shared utility
        if (this.filterBuilder.hasActiveFilters()) {
            this.renderer.applyFilters(this.currentState.filters);
        }
    }


    onClose() {
        this.contentEl.empty();
        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }
    }
}
