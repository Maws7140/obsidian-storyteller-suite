// Timeline Controls Builder - Shared toolbar control creation for Timeline UI components
// Provides factory methods for creating common timeline toolbar controls

import { setIcon, Menu, Notice, Setting } from 'obsidian';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { TimelineRenderer } from './NativeTimelineRenderer';
import { TimelineUIState, TimelineGroupMode, Event } from '../types';
import { TrackManagerModal } from '../modals/TrackManagerModal';
import { ConflictViewModal } from '../modals/ConflictViewModal';
import { TagTimelineModal } from '../modals/TagTimelineModal';
import { ConflictDetector } from './ConflictDetector';

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

/** The three top-level views. Horizontal/vertical are orientations of Timeline. */
export type TimelineViewMode = 'chronology' | 'timeline' | 'gantt';

/** Resolve the top-level view without confusing Timeline orientation for a view. */
export function timelineViewMode(state: Pick<TimelineUIState, 'ganttMode' | 'timelineLayout'>): TimelineViewMode {
    return state.ganttMode ? 'gantt' : state.timelineLayout;
}

/**
 * Display toggles the view owns rather than the shared UI state, passed in so
 * the Display menu can present every display option in one place.
 */
export interface DisplayMenuExtras {
    getShowScenes: () => boolean;
    setShowScenes: (value: boolean) => void;
    getShowWatchedNotes: () => boolean;
    setShowWatchedNotes: (value: boolean) => void;
    /** Era management lives beside the era layer rather than in an overflow. */
    onManageEras: () => void;
}

const DENSITY_PRESETS = [
    { key: 'compact', value: 30, label: 'Compact rows' },
    { key: 'balanced', value: 50, label: 'Balanced rows' },
    { key: 'spacious', value: 70, label: 'Spacious rows' }
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

/**
 * The visible span in the largest unit that still reads as a whole number, so
 * the readout says "3 decades" rather than "10957 days".
 *
 * Each threshold sits where the next unit first rounds to one of itself. Cut
 * over any earlier and the readout jumps straight from "18 months" to "2
 * years", skipping a value it should have passed through.
 */
export function formatSpan(ms: number): string {
    const days = Math.max(ms, 0) / DAY_MS;
    if (days < 1.5) return 'a day';
    if (days < 45) return plural(Math.round(days), 'day', 'days');
    const months = days / 30.44;
    if (months < 22) return plural(Math.round(months), 'month', 'months');
    const years = days / 365.25;
    if (years < 20) return plural(Math.round(years), 'year', 'years');
    if (years < 100) return plural(Math.round(years / 10), 'decade', 'decades');
    if (years < 1000) return plural(Math.round(years / 100), 'century', 'centuries');
    return plural(Math.round(years / 1000), 'millennium', 'millennia');
}

function nearestDensity(density: number): typeof DENSITY_PRESETS[number] {
    return DENSITY_PRESETS.reduce(
        (best, preset) => Math.abs(preset.value - density) < Math.abs(best.value - density) ? preset : best,
        DENSITY_PRESETS[1]
    );
}

/**
 * TimelineControlsBuilder provides factory methods for creating timeline toolbar controls
 * Used by both TimelineView and TimelineModal to reduce code duplication
 */
export class TimelineControlsBuilder {
    private plugin: StorytellerSuitePlugin;
    private state: TimelineUIState;
    private callbacks: TimelineControlCallbacks;
    /** Span readout inside the zoom control, refreshed from the draw loop. */
    private zoomReadoutEl: HTMLElement | null = null;

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
            timelineLayout: 'chronology',
            timelineOrientation: 'horizontal',
            groupMode: (plugin.settings.defaultTimelineGroupMode || 'location'),
            filters: {},
            stackEnabled: plugin.settings.defaultTimelineStack ?? true,
            density: plugin.settings.defaultTimelineDensity ?? 50,
            editMode: false,
            showEras: false,
            showPresence: false,
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
            const orientationButton = container.querySelector<HTMLButtonElement>('.storyteller-orientation-toggle');
            if (orientationButton) {
                orientationButton.disabled = this.state.ganttMode;
                orientationButton.setAttribute('aria-disabled', String(this.state.ganttMode));
            }
            
            // Toggle gantt-mode class on the timeline view container
            const timelineView = container.closest('.storyteller-timeline-view');
            if (timelineView) {
                if (this.state.ganttMode) {
                    timelineView.addClass('gantt-mode');
                } else {
                    timelineView.removeClass('gantt-mode');
                }
            }
            
            this.callbacks.onStateChange();
        });

        return btn;
    }

    /** Toggle horizontal/vertical inside the Timeline view. */
    createOrientationToggle(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: `clickable-icon storyteller-toolbar-btn storyteller-orientation-toggle${this.state.timelineOrientation === 'vertical' ? ' is-active' : ''}`,
            attr: {
                'aria-label': this.state.timelineOrientation === 'vertical' ? 'Use horizontal timeline' : 'Use vertical timeline',
                'title': this.state.timelineOrientation === 'vertical' ? 'Horizontal timeline' : 'Vertical timeline'
            }
        });
        const sync = () => {
            const vertical = this.state.timelineOrientation === 'vertical';
            setIcon(btn, vertical ? 'move-horizontal' : 'move-vertical');
            btn.toggleClass('is-active', vertical);
            const disabled = this.state.ganttMode || this.state.timelineLayout !== 'timeline';
            btn.disabled = disabled;
            btn.setAttribute('aria-disabled', String(disabled));
        };
        sync();
        btn.addEventListener('click', () => {
            if (this.state.ganttMode || this.state.timelineLayout !== 'timeline') return;
            this.state.timelineOrientation = this.state.timelineOrientation === 'horizontal' ? 'vertical' : 'horizontal';
            sync();
            this.callbacks.getRenderer()?.setTimelineOrientation(this.state.timelineOrientation);
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
            { value: 'character', label: t('byCharacter') },
            { value: 'track', label: 'By Track' },
            { value: 'item', label: 'By Item' },
            { value: 'culture', label: 'By Culture' },
            { value: 'magicSystem', label: 'By Magic System' }
        ].forEach(opt => {
            const option = select.createEl('option', { value: opt.value, text: opt.label });
            if (opt.value === this.state.groupMode) {
                option.selected = true;
            }
        });

        select.addEventListener('change', () => {
            this.state.groupMode = select.value as TimelineGroupMode;
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

    createZoomInButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 'aria-label': 'Zoom in', 'title': 'Zoom in' }
        });
        setIcon(btn, 'zoom-in');
        btn.addEventListener('click', () => this.callbacks.getRenderer()?.zoomBy(0.25));
        return btn;
    }

    createZoomOutButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 'aria-label': 'Zoom out', 'title': 'Zoom out' }
        });
        setIcon(btn, 'zoom-out');
        btn.addEventListener('click', () => this.callbacks.getRenderer()?.zoomBy(4));
        return btn;
    }

    /**
     * Create fit visible groups button (same core action as fit, labeled for grouped workflows)
     */
    createFitGroupsButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': 'Fit visible groups',
                'title': 'Fit visible groups'
            }
        });
        setIcon(btn, 'rows-3');
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
     * Edit mode, as a labelled toggle.
     *
     * It used to show a padlock when off and a pencil when on. A padlock says
     * "this is protected" rather than "click here to edit", and swapping the
     * glyph between states left the button with no stable identity: the pencil
     * only ever appeared once you had already found the thing you were looking
     * for. One icon, one word, and a pressed state instead.
     */
    createEditModeToggle(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'storyteller-toolbar-btn-labelled storyteller-toolbar-toggle',
            attr: {
                'aria-label': t('editMode'),
                'title': t('editModeTooltip')
            }
        });
        const icon = btn.createSpan('storyteller-toolbar-btn-icon');
        setIcon(icon, 'pencil');
        const label = btn.createSpan({ cls: 'storyteller-toolbar-btn-text' });

        const sync = () => {
            const on = this.state.editMode;
            label.setText(on ? 'Editing' : 'Edit');
            btn.toggleClass('is-active', on);
            btn.setAttribute('aria-pressed', String(on));
        };
        sync();

        btn.addEventListener('click', () => {
            this.state.editMode = !this.state.editMode;
            sync();
            this.callbacks.getRenderer()?.setEditMode(this.state.editMode);
            new Notice(this.state.editMode ? t('editModeEnabled') : t('editModeDisabled'));
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
        btn.addEventListener('click', () => { void (async () => {
            await this.callbacks.getRenderer()?.refresh();
            this.callbacks.onStateChange();
        })(); });
        return btn;
    }

    /**
     * Chronology remains the original grouped lane view. Timeline is a separate
     * view with horizontal and vertical orientations; Gantt remains its own
     * duration view. Orientation is deliberately nested under Timeline.
     */
    createViewModeSegment(container: HTMLElement): HTMLElement {
        const wrapper = container.createDiv('storyteller-view-mode-controls');
        const group = wrapper.createDiv('storyteller-segment');
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', 'Timeline view');

        const modes: { id: TimelineViewMode; label: string; icon: string; hint: string }[] = [
            { id: 'chronology', label: 'Chronology', icon: 'list-tree', hint: 'Original grouped chronological lanes' },
            { id: 'timeline', label: 'Timeline', icon: 'git-branch', hint: 'Card timeline with horizontal or vertical orientation' },
            { id: 'gantt', label: 'Gantt', icon: 'align-left', hint: 'Durations as bars, with dependencies' }
        ];

        const current = (): TimelineViewMode => timelineViewMode(this.state);

        const buttons = modes.map(mode => {
            const btn = group.createEl('button', {
                cls: 'storyteller-segment-btn',
                attr: { role: 'radio', title: mode.hint, 'aria-label': mode.label }
            });
            const icon = btn.createSpan('storyteller-segment-icon');
            setIcon(icon, mode.icon);
            btn.createSpan({ cls: 'storyteller-segment-label', text: mode.label });
            btn.addEventListener('click', () => this.setViewMode(mode.id, sync));
            return { mode, btn };
        });

        const orientation = wrapper.createDiv('storyteller-segment storyteller-timeline-orientation-segment');
        orientation.setAttribute('role', 'radiogroup');
        orientation.setAttribute('aria-label', 'Timeline orientation');
        const orientationButtons = (['horizontal', 'vertical'] as const).map(value => {
            const label = value === 'horizontal' ? 'Horizontal' : 'Vertical';
            const btn = orientation.createEl('button', {
                cls: 'storyteller-segment-btn',
                attr: { role: 'radio', title: `${label} timeline`, 'aria-label': label }
            });
            const icon = btn.createSpan('storyteller-segment-icon');
            setIcon(icon, value === 'horizontal' ? 'move-horizontal' : 'move-vertical');
            btn.createSpan({ cls: 'storyteller-segment-label', text: label });
            btn.addEventListener('click', () => {
                if (this.state.ganttMode || this.state.timelineLayout !== 'timeline') return;
                if (this.state.timelineOrientation === value) return;
                this.state.timelineOrientation = value;
                this.callbacks.getRenderer()?.setTimelineOrientation(value);
                sync();
                this.callbacks.onStateChange();
            });
            return { value, btn };
        });

        const sync = () => {
            const active = current();
            buttons.forEach(({ mode, btn }) => {
                const on = mode.id === active;
                btn.toggleClass('is-active', on);
                btn.setAttribute('aria-checked', String(on));
            });
            const timelineActive = active === 'timeline';
            orientation.toggleClass('is-hidden', !timelineActive);
            orientationButtons.forEach(({ value, btn }) => {
                const on = timelineActive && this.state.timelineOrientation === value;
                btn.toggleClass('is-active', on);
                btn.setAttribute('aria-checked', String(on));
                btn.disabled = !timelineActive;
            });
        };
        sync();
        return wrapper;
    }

    private setViewMode(mode: TimelineViewMode, sync: () => void): void {
        const gantt = mode === 'gantt';
        const layout = mode === 'timeline' ? 'timeline' : 'chronology';
        const changed = gantt !== this.state.ganttMode || layout !== this.state.timelineLayout;
        if (!changed) return;
        this.state.ganttMode = gantt;
        this.state.timelineLayout = layout;
        sync();
        const renderer = this.callbacks.getRenderer();
        renderer?.setTimelineLayout(layout);
        renderer?.setGanttMode(gantt);
        this.callbacks.onStateChange();
    }

    /**
     * Zoom, as one control: minus, the span you are currently looking at, plus.
     *
     * The two magnifiers had no readout, so nothing told you how much time was
     * on screen, and the decade and century presets sat in a separate menu as
     * though they were a different axis. Putting the span between the two
     * buttons gives zooming feedback and makes the presets obviously the same
     * dimension: they set the number the readout shows.
     */
    createZoomControl(container: HTMLElement): HTMLElement {
        const group = container.createDiv('storyteller-zoom-control');

        const out = group.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 'aria-label': 'Zoom out', 'title': 'Show more time' }
        });
        setIcon(out, 'zoom-out');
        out.addEventListener('click', () => {
            this.callbacks.getRenderer()?.zoomBy(4);
            this.updateZoomReadout();
        });

        const readout = group.createEl('button', {
            cls: 'storyteller-zoom-readout',
            attr: { 'aria-label': 'Time on screen', 'aria-haspopup': 'menu', 'title': 'Jump to a span' }
        });
        this.zoomReadoutEl = readout.createSpan({ cls: 'storyteller-zoom-readout-text' });
        const caret = readout.createSpan('storyteller-toolbar-caret');
        setIcon(caret, 'chevron-down');

        readout.addEventListener('click', clickEvent => {
            const renderer = this.callbacks.getRenderer();
            const jump = (apply: () => void) => { apply(); this.updateZoomReadout(); };
            const menu = new Menu();
            menu.addItem(item => item.setTitle('Fit every event').setIcon('maximize-2')
                .onClick(() => jump(() => renderer?.fitToView())));
            menu.addSeparator();
            menu.addItem(item => item.setTitle('Show a decade').setIcon('calendar-range')
                .onClick(() => jump(() => renderer?.zoomPresetYears(10))));
            menu.addItem(item => item.setTitle('Show a century').setIcon('calendar-range')
                .onClick(() => jump(() => renderer?.zoomPresetYears(100))));
            menu.addItem(item => item.setTitle('Jump to today').setIcon('calendar-clock')
                .onClick(() => jump(() => renderer?.moveToToday())));
            menu.showAtMouseEvent(clickEvent);
        });

        const zoomIn = group.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: { 'aria-label': 'Zoom in', 'title': 'Show less time' }
        });
        setIcon(zoomIn, 'zoom-in');
        zoomIn.addEventListener('click', () => {
            this.callbacks.getRenderer()?.zoomBy(0.25);
            this.updateZoomReadout();
        });

        this.updateZoomReadout();
        return group;
    }

    /**
     * Refresh the span readout. Wired to the renderer's draw loop so panning,
     * pinching and the scroll wheel keep it honest, not just the buttons.
     */
    updateZoomReadout(): void {
        if (!this.zoomReadoutEl?.isConnected) return;
        const range = this.callbacks.getRenderer()?.getVisibleRange();
        const text = range ? formatSpan(range.end.getTime() - range.start.getTime()) : '';
        if (this.zoomReadoutEl.textContent !== text) this.zoomReadoutEl.setText(text);
    }

    /**
     * The layers and the shape of the drawing, named rather than iconified.
     *
     * These were the least discoverable part of the old toolbar: toggles whose
     * only clue was an icon and whose only feedback was a highlight. A menu
     * states what each one does and shows its state as a checkmark. The badge
     * on the button carries the part a menu otherwise hides, which layers are
     * on, so the state is still readable without opening anything.
     */
    createDisplayMenu(container: HTMLElement, extras: DisplayMenuExtras): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'storyteller-toolbar-btn-labelled',
            attr: { 'aria-haspopup': 'menu' }
        });
        const icon = btn.createSpan('storyteller-toolbar-btn-icon');
        setIcon(icon, 'sliders-horizontal');
        btn.createSpan({ cls: 'storyteller-toolbar-btn-text', text: 'Show' });
        const badge = btn.createSpan({ cls: 'storyteller-toolbar-badge' });
        const caret = btn.createSpan('storyteller-toolbar-caret');
        setIcon(caret, 'chevron-down');

        // Only the three layers count here. Stacking, narrative order and
        // density change how the same events are arranged, not what is on
        // screen, so folding them into the number would make it mean nothing.
        const layers = () => [
            { name: 'Era backgrounds', on: this.state.showEras },
            { name: 'Presence bands', on: this.state.showPresence === true },
            { name: 'Scenes', on: extras.getShowScenes() },
            { name: 'Vault notes', on: extras.getShowWatchedNotes() }
        ];

        const syncBadge = () => {
            const on = layers().filter(layer => layer.on);
            badge.setText(String(on.length));
            badge.toggleClass('is-empty', on.length === 0);
            const summary = on.length ? on.map(layer => layer.name).join(', ') : 'no extra layers';
            btn.setAttribute('aria-label', `Show: ${summary}`);
            btn.setAttribute('title', `Showing ${summary}`);
        };
        syncBadge();

        btn.addEventListener('click', clickEvent => {
            const renderer = this.callbacks.getRenderer();
            const menu = new Menu();
            const check = (title: string, on: boolean, apply: () => void) => {
                menu.addItem(item => item.setTitle(title).setChecked(on).onClick(() => {
                    apply();
                    syncBadge();
                    this.callbacks.onStateChange();
                }));
            };

            check('Era backgrounds', this.state.showEras, () => {
                this.state.showEras = !this.state.showEras;
                renderer?.setShowEras(this.state.showEras);
            });
            // Named for what it does rather than for the grouping it needs, and
            // the hint carries the condition, because a checked layer that
            // draws nothing reads as broken.
            menu.addItem(item => item
                .setTitle(this.state.groupMode === 'character' ? 'Presence bands' : 'Presence bands (group by character)')
                .setChecked(this.state.showPresence === true)
                .setDisabled(this.state.groupMode !== 'character')
                .onClick(() => {
                    this.state.showPresence = !this.state.showPresence;
                    renderer?.setShowPresence(this.state.showPresence);
                    syncBadge();
                    this.callbacks.onStateChange();
                }));
            check('Scenes', extras.getShowScenes(), () => extras.setShowScenes(!extras.getShowScenes()));
            check('Vault notes', extras.getShowWatchedNotes(), () => extras.setShowWatchedNotes(!extras.getShowWatchedNotes()));
            menu.addItem(item => item.setTitle('Manage eras…').setIcon('calendar-range')
                .onClick(() => extras.onManageEras()));

            menu.addSeparator();
            check('Stack overlapping events', this.state.stackEnabled, () => {
                this.state.stackEnabled = !this.state.stackEnabled;
                this.callbacks.onRendererUpdate();
            });
            check('Narrative order', this.state.narrativeOrder, () => {
                this.state.narrativeOrder = !this.state.narrativeOrder;
                renderer?.setNarrativeOrder(this.state.narrativeOrder);
            });

            menu.addSeparator();
            DENSITY_PRESETS.forEach(preset => {
                menu.addItem(item => item
                    .setTitle(preset.label)
                    .setChecked(nearestDensity(this.state.density).key === preset.key)
                    .onClick(() => {
                        this.state.density = preset.value;
                        renderer?.setDensity(preset.value);
                        this.callbacks.onStateChange();
                    }));
            });
            menu.showAtMouseEvent(clickEvent);
        });
        return btn;
    }

    /**
     * Create density preset cycle button (Compact -> Balanced -> Spacious)
     */
    createDensityPresetButton(container: HTMLElement): HTMLButtonElement {
        const presets = [
            { key: 'compact', value: 30, label: 'Compact density' },
            { key: 'balanced', value: 50, label: 'Balanced density' },
            { key: 'spacious', value: 70, label: 'Spacious density' }
        ];
        const nearest = presets.reduce((best, p) => Math.abs(p.value - this.state.density) < Math.abs(best.value - this.state.density) ? p : best, presets[1]);
        let idx = presets.findIndex(p => p.key === nearest.key);

        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': presets[idx].label,
                'title': presets[idx].label
            }
        });
        setIcon(btn, 'panel-top');

        btn.addEventListener('click', () => {
            idx = (idx + 1) % presets.length;
            const next = presets[idx];
            this.state.density = next.value;
            btn.setAttribute('aria-label', next.label);
            btn.setAttribute('title', next.label);
            this.callbacks.getRenderer()?.setDensity(next.value);
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
                void navigator.clipboard?.writeText(text);
                new Notice(t('copyRange'));
            } catch {
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

    /**
     * Create manage tracks button
     */
    createManageTracksButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': 'Manage timeline tracks',
                'title': 'Manage timeline tracks'
            }
        });
        setIcon(btn, 'layers-2');

        btn.addEventListener('click', () => {
            const tracks = this.plugin.getTimelineTracks();
            new TrackManagerModal(
                this.plugin.app,
                this.plugin,
                tracks,
                (updatedTracks) => { void (async () => {
                    await this.plugin.setTimelineTracks(updatedTracks);
                    this.callbacks.onRendererUpdate();
                })(); }
            ).open();
        });

        return btn;
    }

    /**
     * Create manage eras button
     */
    createManageErasButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': 'Manage timeline eras',
                'title': 'Manage timeline eras & periods'
            }
        });
        setIcon(btn, 'calendar-range');

        btn.addEventListener('click', () => { void (async () => {
            const { EraListModal } = await import('../modals/EraListModal');
            new EraListModal(this.plugin.app, this.plugin).open();
        })(); });

        return btn;
    }

    /**
     * Create check conflicts button
     */
    createCheckConflictsButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': 'Check timeline conflicts',
                'title': 'Detect timeline conflicts'
            }
        });
        setIcon(btn, 'alert-triangle');

        btn.addEventListener('click', () => { void (async () => {
            const eventsPromise = this.callbacks.getEvents();
            const events = Array.isArray(eventsPromise) ? eventsPromise : await eventsPromise;
            const conflicts = ConflictDetector.detectAllConflicts(events, [], [], this.plugin.getReferenceTodayDate());

            new ConflictViewModal(this.plugin.app, this.plugin, conflicts).open();

            // Show quick summary
            const errorCount = conflicts.filter(c => c.severity === 'error').length;
            const warningCount = conflicts.filter(c => c.severity === 'warning').length;

            if (conflicts.length === 0) {
                new Notice('✓ no timeline conflicts detected');
            } else {
                new Notice(`Found ${errorCount} error(s), ${warningCount} warning(s)`);
            }
        })(); });

        return btn;
    }

    /**
     * Create generate from tags button
     */
    createGenerateFromTagsButton(container: HTMLElement): HTMLButtonElement {
        const btn = container.createEl('button', {
            cls: 'clickable-icon storyteller-toolbar-btn',
            attr: {
                'aria-label': 'Generate timeline from tags',
                'title': 'Generate events from tagged notes'
            }
        });
        setIcon(btn, 'hash');

        btn.addEventListener('click', () => {
            new TagTimelineModal(this.plugin.app, this.plugin).open();
        });

        return btn;
    }
}
