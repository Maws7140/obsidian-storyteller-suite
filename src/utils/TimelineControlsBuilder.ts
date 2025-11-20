// Timeline Controls Builder - Shared toolbar control creation for Timeline UI components
// Provides factory methods for creating common timeline toolbar controls

import { setIcon, Notice, Setting } from 'obsidian';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { TimelineRenderer } from './TimelineRenderer';
import { TimelineUIState, TimelineUIFilters, Event } from '../types';

/**
 * Callbacks for control state changes
 */
export interface TimelineControlCallbacks {
    /** Called when state changes and UI needs refresh */
    onStateChange: () => void;
    /** Called when renderer needs to be updated */
    onRendererUpdate: () => void;
    /** Get the current renderer instance */
    getRenderer: () => TimelineRenderer | null;
    /** Get current events (for filter population) */
    getEvents: () => Event[] | Promise<Event[]>;
}

/**
 * TimelineControlsBuilder provides factory methods for creating timeline toolbar controls
 * Used by both TimelineView and TimelineModal to reduce code duplication
 */
export class TimelineControlsBuilder {
    private plugin: StorytellerSuitePlugin;
    private state: TimelineUIState;
    private callbacks: TimelineControlCallbacks;

    constructor(
        plugin: StorytellerSuitePlugin,
        state: TimelineUIState,
        callbacks: TimelineControlCallbacks
    ) {
        this.plugin = plugin;
        this.state = state;
        this.callbacks = callbacks;
    }

    /**
     * Create initial state from plugin settings
     */
    static createDefaultState(plugin: StorytellerSuitePlugin): TimelineUIState {
        return {
            ganttMode: false,
            groupMode: (plugin.settings.defaultTimelineGroupMode || 'none') as 'none' | 'location' | 'group' | 'character',
            filters: {},
            stackEnabled: plugin.settings.defaultTimelineStack ?? true,
            density: plugin.settings.defaultTimelineDensity ?? 50,
            editMode: false,
            showEras: false,
            narrativeOrder: false
        };
    }

    /**
     * Create Gantt/Timeline toggle button
     */
    createGanttToggle(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': this.state.ganttMode ? t('timelineView') : t('ganttView'),
                'title': this.state.ganttMode ? t('timelineView') : t('ganttView')
            }
        });
        setIcon(btn, this.state.ganttMode ? 'bar-chart-2' : 'clock');

        btn.addEventListener('click', () => {
            this.state.ganttMode = !this.state.ganttMode;
            setIcon(btn, this.state.ganttMode ? 'bar-chart-2' : 'clock');
            btn.setAttribute('aria-label', this.state.ganttMode ? t('timelineView') : t('ganttView'));
            btn.setAttribute('title', this.state.ganttMode ? t('timelineView') : t('ganttView'));
            this.callbacks.getRenderer()?.setGanttMode(this.state.ganttMode);
            this.callbacks.onStateChange();
        });

        return btn;
    }

    /**
     * Create grouping mode dropdown
     */
    createGroupingDropdown(container: HTMLElement): HTMLSelectElement {
        const groupingContainer = container.createDiv('storyteller-grouping-container');
        const select = groupingContainer.createEl('select', {
            cls: 'dropdown storyteller-grouping-select',
            attr: { 'aria-label': 'Grouping mode' }
        });

        [
            { value: 'none', label: t('noGrouping') },
            { value: 'location', label: t('byLocation') },
            { value: 'group', label: t('byGroup') },
            { value: 'character', label: t('byCharacter') }
        ].forEach(opt => {
            const option = select.createEl('option', { value: opt.value, text: opt.label });
            if (opt.value === this.state.groupMode) {
                option.selected = true;
            }
        });

        select.addEventListener('change', () => {
            this.state.groupMode = select.value as 'none' | 'location' | 'group' | 'character';
            this.callbacks.getRenderer()?.setGroupMode(this.state.groupMode);
            this.callbacks.onStateChange();
        });

        return select;
    }

    /**
     * Create fit-to-view button
     */
    createFitButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('fit'),
                'title': t('fit')
            }
        });
        setIcon(btn, 'maximize-2');
        btn.addEventListener('click', () => this.callbacks.getRenderer()?.fitToView());
        return btn;
    }

    /**
     * Create decade zoom button
     */
    createDecadeButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('decade'),
                'title': t('decade')
            }
        });
        setIcon(btn, 'calendar');
        btn.addEventListener('click', () => this.callbacks.getRenderer()?.zoomPresetYears(10));
        return btn;
    }

    /**
     * Create century zoom button
     */
    createCenturyButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('century'),
                'title': t('century')
            }
        });
        setIcon(btn, 'calendar-days');
        btn.addEventListener('click', () => this.callbacks.getRenderer()?.zoomPresetYears(100));
        return btn;
    }

    /**
     * Create today button
     */
    createTodayButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('today'),
                'title': t('today')
            }
        });
        setIcon(btn, 'calendar-clock');
        btn.addEventListener('click', () => this.callbacks.getRenderer()?.moveToToday());
        return btn;
    }

    /**
     * Create edit mode toggle button
     */
    createEditModeToggle(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('editMode'),
                'title': t('editModeTooltip')
            }
        });
        setIcon(btn, this.state.editMode ? 'pencil' : 'lock');

        btn.addEventListener('click', () => {
            this.state.editMode = !this.state.editMode;
            setIcon(btn, this.state.editMode ? 'pencil' : 'lock');
            this.callbacks.getRenderer()?.setEditMode(this.state.editMode);

            if (this.state.editMode) {
                new Notice('Edit mode enabled - drag events to reschedule');
            } else {
                new Notice('Edit mode disabled');
            }
        });

        return btn;
    }

    /**
     * Create narrative order toggle button
     */
    createNarrativeOrderToggle(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: `clickable-icon storyteller-toolbar-btn${this.state.narrativeOrder ? ' is-active' : ''}`,
            attr: {
                'aria-label': 'Toggle narrative order',
                'title': this.state.narrativeOrder ? 'Show chronological order' : 'Show narrative order'
            }
        });
        setIcon(btn, 'book-open');

        btn.addEventListener('click', () => {
            this.state.narrativeOrder = !this.state.narrativeOrder;
            btn.toggleClass('is-active', this.state.narrativeOrder);
            btn.setAttribute('title', this.state.narrativeOrder ? 'Show chronological order' : 'Show narrative order');
            this.callbacks.getRenderer()?.setNarrativeOrder(this.state.narrativeOrder);
        });

        return btn;
    }

    /**
     * Create era backgrounds toggle button
     */
    createEraToggle(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: `clickable-icon storyteller-toolbar-btn${this.state.showEras ? ' is-active' : ''}`,
            attr: {
                'aria-label': 'Toggle era backgrounds',
                'title': this.state.showEras ? 'Hide era backgrounds' : 'Show era backgrounds'
            }
        });
        setIcon(btn, 'layers');

        btn.addEventListener('click', () => {
            this.state.showEras = !this.state.showEras;
            btn.toggleClass('is-active', this.state.showEras);
            btn.setAttribute('title', this.state.showEras ? 'Hide era backgrounds' : 'Show era backgrounds');
            this.callbacks.getRenderer()?.setShowEras(this.state.showEras);
        });

        return btn;
    }

    /**
     * Create refresh button
     */
    createRefreshButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('refresh'),
                'title': t('refresh')
            }
        });
        setIcon(btn, 'refresh-cw');
        btn.addEventListener('click', async () => {
            await this.callbacks.getRenderer()?.refresh();
            this.callbacks.onStateChange();
        });
        return btn;
    }

    /**
     * Create stack toggle (returns toggle control for use with Setting)
     */
    addStackToggle(setting: Setting): void {
        setting.addToggle(toggle => {
            toggle.setTooltip('Stack items')
                .setValue(this.state.stackEnabled)
                .onChange(value => {
                    this.state.stackEnabled = value;
                    this.callbacks.onRendererUpdate();
                });
            return toggle;
        });
    }

    /**
     * Create copy range button
     */
    createCopyRangeButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': t('copyRange') || 'Copy range',
                'title': t('copyRange') || 'Copy range'
            }
        });
        setIcon(btn, 'copy');

        btn.addEventListener('click', () => {
            const renderer = this.callbacks.getRenderer();
            if (!renderer) return;

            try {
                const range = renderer.getVisibleRange();
                if (!range) return;
                const text = `Timeline range: ${range.start.toISOString()} — ${range.end.toISOString()}`;
                navigator.clipboard?.writeText(text);
                new Notice(t('copyRange'));
            } catch (e) {
                new Notice('Could not copy timeline range');
            }
        });

        return btn;
    }

    /**
     * Check if there are active filters
     */
    hasActiveFilters(): boolean {
        const f = this.state.filters;
        return (f.characters && f.characters.size > 0) ||
            (f.locations && f.locations.size > 0) ||
            (f.groups && f.groups.size > 0) ||
            (f.tags && f.tags.size > 0) ||
            f.milestonesOnly === true;
    }

    /**
     * Clear all filters
     */
    clearAllFilters(): void {
        this.state.filters = {};
        this.callbacks.getRenderer()?.applyFilters(this.state.filters);
        this.callbacks.onStateChange();
    }

    /**
     * Apply default zoom preset based on settings
     */
    applyDefaultZoomPreset(): void {
        const renderer = this.callbacks.getRenderer();
        if (!renderer) return;

        const preset = this.plugin.settings.defaultTimelineZoomPreset || 'none';
        if (preset === 'fit') {
            renderer.fitToView();
        } else if (preset === 'decade') {
            renderer.zoomPresetYears(10);
        } else if (preset === 'century') {
            renderer.zoomPresetYears(100);
        }
    }

    /**
     * Get the current state
     */
    getState(): TimelineUIState {
        return this.state;
    }

    /**
     * Get the plugin instance
     */
    getPlugin(): StorytellerSuitePlugin {
        return this.plugin;
    }
}
