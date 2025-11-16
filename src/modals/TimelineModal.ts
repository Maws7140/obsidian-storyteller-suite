import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';
import { Event } from '../types';
import StorytellerSuitePlugin from '../main';
import { EventModal } from './EventModal';
import { TimelineRenderer, TimelineFilters } from '../utils/TimelineRenderer';

export class TimelineModal extends Modal {
    plugin: StorytellerSuitePlugin;
    events: Event[];
    // Removed fallback list to keep timeline-only UI
    timelineContainer: HTMLElement;
    renderer: TimelineRenderer | null = null;
    legendEl?: HTMLElement;
    detailsEl?: HTMLElement;

    // UI state
    private groupMode: 'none' | 'location' | 'group' | 'character' = 'none';
    private stackEnabled = true;
    private density = 50; // 0-100 influences item margin
    private editModeEnabled = false;
    private viewMode: 'timeline' | 'gantt' = 'timeline';
    private defaultGanttDuration = 1; // days - default duration for events without end date in Gantt view

    // Filter state
    private filters: Required<TimelineFilters> = {
        characters: new Set<string>(),
        locations: new Set<string>(),
        groups: new Set<string>(),
        milestonesOnly: false
    };
    private filterPanelVisible = false;

    constructor(app: App, plugin: StorytellerSuitePlugin, events: Event[]) {
        super(app);
        this.plugin = plugin;
        // Ensure events are sorted (main.ts listEvents should handle this)
        this.events = events;
        this.modalEl.addClass('storyteller-list-modal');
        this.modalEl.addClass('storyteller-timeline-modal');
        // Initialize from defaults
        this.groupMode = (plugin.settings.defaultTimelineGroupMode || 'none') as any;
        this.stackEnabled = plugin.settings.defaultTimelineStack ?? true;
        this.density = plugin.settings.defaultTimelineDensity ?? 50;
        this.defaultGanttDuration = plugin.settings.ganttDefaultDuration ?? 1;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('timeline') });

        // Controls toolbar (grouping, presets, density, edit mode, filters)
        const controls = new Setting(contentEl)
            .setName('')
            .setClass('storyteller-timeline-toolbar')
            .addDropdown(dd => {
                dd.addOption('none', 'No grouping');
                dd.addOption('location', 'By location');
                dd.addOption('group', 'By group');
                dd.addOption('character', 'By character');
                dd.setValue(this.groupMode);
                dd.onChange(value => {
                    this.groupMode = (value as any);
                    this.renderTimeline();
                });
                return dd;
            })
            .addButton(b => {
                b.setButtonText(this.viewMode === 'gantt' ? 'Gantt' : 'Timeline')
                    .setIcon(this.viewMode === 'gantt' ? 'bar-chart-2' : 'clock')
                    .setTooltip('Switch between Timeline and Gantt chart views')
                    .onClick(() => {
                        this.viewMode = this.viewMode === 'timeline' ? 'gantt' : 'timeline';
                        b.setButtonText(this.viewMode === 'gantt' ? 'Gantt' : 'Timeline');
                        b.setIcon(this.viewMode === 'gantt' ? 'bar-chart-2' : 'clock');
                        this.renderTimeline();
                        new Notice(`Switched to ${this.viewMode === 'gantt' ? 'Gantt' : 'Timeline'} view`);
                    });
                return b;
            })
            .addButton(b => b.setButtonText(t('fit') || 'Fit').onClick(() => { if (this.renderer) this.renderer.fitToView(); }))
            .addButton(b => b.setButtonText(t('decade') || 'Decade').onClick(() => { if (this.renderer) this.renderer.zoomPresetYears(10); }))
            .addButton(b => b.setButtonText(t('century') || 'Century').onClick(() => { if (this.renderer) this.renderer.zoomPresetYears(100); }))
            .addButton(b => b.setButtonText(t('today') || 'Today').onClick(() => { if (this.renderer) this.renderer.moveToToday(); }))
            .addToggle(t => t.setTooltip('Stack items').setValue(this.stackEnabled).onChange(v => { this.stackEnabled = v; this.renderTimeline(); }))
            .addButton(b => {
                b.setTooltip('Edit mode (drag to reschedule)')
                    .setIcon(this.editModeEnabled ? 'pencil' : 'lock')
                    .onClick(() => {
                        this.editModeEnabled = !this.editModeEnabled;
                        b.setIcon(this.editModeEnabled ? 'pencil' : 'lock');
                        this.renderTimeline();
                        if (this.editModeEnabled) {
                            this.timelineContainer.addClass('timeline-edit-mode');
                            new Notice('Edit mode enabled - drag events to reschedule');
                        } else {
                            this.timelineContainer.removeClass('timeline-edit-mode');
                            new Notice('Edit mode disabled');
                        }
                    });
                return b;
            })
            .addButton(b => b.setButtonText(t('copyRange') || 'Copy range').onClick(() => this.copyVisibleRange()));

        // Filter panel
        const filterPanelContainer = contentEl.createDiv('storyteller-filter-panel-container');
        const filterToggleBtn = new ButtonComponent(filterPanelContainer)
            .setButtonText('Filters')
            .setIcon('filter')
            .onClick(() => {
                this.filterPanelVisible = !this.filterPanelVisible;
                filterPanel.style.display = this.filterPanelVisible ? 'block' : 'none';
            });
        
        const filterPanel = filterPanelContainer.createDiv('storyteller-filter-panel');
        filterPanel.style.display = this.filterPanelVisible ? 'block' : 'none';
        
        // Milestones only toggle
        new Setting(filterPanel)
            .setName('Milestones Only')
            .setDesc('Show only milestone events')
            .addToggle(toggle => toggle
                .setValue(this.filters.milestonesOnly)
                .onChange(value => {
                    this.filters.milestonesOnly = value;
                    void this.renderTimeline();
                }));
        
        // Character filter
        new Setting(filterPanel)
            .setName('Filter by Character')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Select character...');
                const allCharacters = new Set<string>();
                this.events.forEach(e => {
                    if (e.characters) e.characters.forEach(c => allCharacters.add(c));
                });
                Array.from(allCharacters).sort().forEach(char => {
                    dropdown.addOption(char, char);
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value && !this.filters.characters.has(value)) {
                        this.filters.characters.add(value);
                        this.renderFilterChips(filterChips);
                        void this.renderTimeline();
                    }
                    dropdown.setValue('');
                });
            });
        
        // Location filter
        new Setting(filterPanel)
            .setName('Filter by Location')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Select location...');
                const allLocations = new Set<string>();
                this.events.forEach(e => {
                    if (e.location) allLocations.add(e.location);
                });
                Array.from(allLocations).sort().forEach(loc => {
                    dropdown.addOption(loc, loc);
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value && !this.filters.locations.has(value)) {
                        this.filters.locations.add(value);
                        this.renderFilterChips(filterChips);
                        void this.renderTimeline();
                    }
                    dropdown.setValue('');
                });
            });
        
        // Group filter
        new Setting(filterPanel)
            .setName('Filter by Group')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Select group...');
                const groups = this.plugin.getGroups();
                groups.forEach(g => {
                    dropdown.addOption(g.id, g.name);
                });
                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value && !this.filters.groups.has(value)) {
                        this.filters.groups.add(value);
                        this.renderFilterChips(filterChips);
                        void this.renderTimeline();
                    }
                    dropdown.setValue('');
                });
            });
        
        // Clear all filters button
        new Setting(filterPanel)
            .addButton(button => button
                .setButtonText('Clear All Filters')
                .onClick(() => {
                    this.filters.characters.clear();
                    this.filters.locations.clear();
                    this.filters.groups.clear();
                    this.filters.milestonesOnly = false;
                    this.renderFilterChips(filterChips);
                    void this.renderTimeline();
                }));
        
        // Active filter chips
        const filterChips = contentEl.createDiv('storyteller-filter-chips');
        this.renderFilterChips(filterChips);

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
        this.applyDefaultZoomPreset();
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

        // Initialize new renderer with current settings
        this.renderer = new TimelineRenderer(this.timelineContainer, this.plugin, {
            ganttMode: this.viewMode === 'gantt',
            groupMode: this.groupMode,
            stackEnabled: this.stackEnabled,
            density: this.density,
            editMode: this.editModeEnabled,
            defaultGanttDuration: this.defaultGanttDuration,
            showDependencies: true
        });

        await this.renderer.initialize();

        if (this.hasActiveFilters()) {
            this.renderer.applyFilters(this.filters);
        }
    }

    private hasActiveFilters(): boolean {
        return this.filters.characters.size > 0 ||
            this.filters.locations.size > 0 ||
            this.filters.groups.size > 0 ||
            this.filters.milestonesOnly;
    }

    private applyDefaultZoomPreset(): void {
        if (!this.renderer) return;
        const preset = this.plugin.settings.defaultTimelineZoomPreset || 'none';
        if (preset === 'fit') {
            this.renderer.fitToView();
        } else if (preset === 'decade') {
            this.renderer.zoomPresetYears(10);
        } else if (preset === 'century') {
            this.renderer.zoomPresetYears(100);
        }
    }

    // Removed buildDatasets, buildDependencyArrows, makeTooltip, hexWithAlpha, zoomPresetYears - now using TimelineRenderer

    private copyVisibleRange() {
        if (!this.renderer) return;
        try {
            const range = this.renderer.getVisibleRange();
            if (!range) return;
            const text = `Timeline range: ${range.start.toISOString()} — ${range.end.toISOString()}`;
            navigator.clipboard?.writeText(text);
            new Notice(t('copyRange'));
        } catch (e) {
            // Fallback
            new Notice('Could not copy timeline range'); // Keep this as is - it's an error message
        }
    }


    private renderFilterChips(container: HTMLElement) {
        container.empty();
        const hasActiveFilters = this.hasActiveFilters();
        
        if (!hasActiveFilters) return;
        
        // Character chips
        this.filters.characters.forEach(char => {
            const chip = container.createDiv('filter-chip');
            chip.createSpan({ text: `Character: ${char}` });
            const removeBtn = chip.createSpan({ text: 'x', cls: 'filter-chip-remove' });
            removeBtn.onclick = () => {
                this.filters.characters.delete(char);
                this.renderFilterChips(container);
                void this.renderTimeline();
            };
        });
        
        // Location chips
        this.filters.locations.forEach(loc => {
            const chip = container.createDiv('filter-chip');
            chip.createSpan({ text: `Location: ${loc}` });
            const removeBtn = chip.createSpan({ text: 'x', cls: 'filter-chip-remove' });
            removeBtn.onclick = () => {
                this.filters.locations.delete(loc);
                this.renderFilterChips(container);
                void this.renderTimeline();
            };
        });
        
        // Group chips
        this.filters.groups.forEach(groupId => {
            const group = this.plugin.getGroups().find(g => g.id === groupId);
            const groupName = group ? group.name : groupId;
            const chip = container.createDiv('filter-chip');
            chip.createSpan({ text: `Group: ${groupName}` });
            const removeBtn = chip.createSpan({ text: 'x', cls: 'filter-chip-remove' });
            removeBtn.onclick = () => {
                this.filters.groups.delete(groupId);
                this.renderFilterChips(container);
                void this.renderTimeline();
            };
        });
        
        // Milestones chip
        if (this.filters.milestonesOnly) {
            const chip = container.createDiv('filter-chip');
            chip.createSpan({ text: 'Milestones Only' });
            const removeBtn = chip.createSpan({ text: 'x', cls: 'filter-chip-remove' });
            removeBtn.onclick = () => {
                this.filters.milestonesOnly = false;
                this.renderFilterChips(container);
                void this.renderTimeline();
            };
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
