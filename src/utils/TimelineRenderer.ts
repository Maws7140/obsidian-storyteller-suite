// Timeline Renderer - Shared rendering logic for Timeline Modal and Timeline View
// Handles vis-timeline initialization, dataset building, Gantt mode, dependencies, and interactions

import { App, Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Event } from '../types';
import { parseEventDate, toMillis, toDisplay, getEventDateForTimeline } from './DateParsing';
import { EventModal } from '../modals/EventModal';

// @ts-ignore: vis-timeline is bundled dependency
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VisStandalone = require('vis-timeline/standalone');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Timeline: any = VisStandalone.Timeline;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DataSet: any = VisStandalone.DataSet;
// @ts-ignore: timeline-arrows bundled dependency
import Arrow from '../vendor/timeline-arrows.js';

export interface TimelineRendererOptions {
    ganttMode?: boolean;
    groupMode?: 'none' | 'location' | 'group' | 'character';
    showDependencies?: boolean;
    stackEnabled?: boolean;
    density?: number;
    defaultGanttDuration?: number; // days
    editMode?: boolean;
}

export interface TimelineFilters {
    characters?: Set<string>;
    locations?: Set<string>;
    groups?: Set<string>;
    milestonesOnly?: boolean;
}

/**
 * TimelineRenderer manages vis-timeline instance and dataset building
 * Can be used by both modal and panel view implementations
 */
export class TimelineRenderer {
    private app: App;
    private plugin: StorytellerSuitePlugin;
    private container: HTMLElement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private timeline: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private dependencyArrows: any = null;
    private clickTimeout: ReturnType<typeof setTimeout> | null = null;

    // Configuration
    private options: TimelineRendererOptions;
    private filters: TimelineFilters = {};
    private events: Event[] = [];

    // Color palette for grouping
    private palette = [
        '#7C3AED', '#2563EB', '#059669', '#CA8A04', '#DC2626', 
        '#EA580C', '#0EA5E9', '#22C55E', '#D946EF', '#F59E0B'
    ];

    constructor(
        container: HTMLElement,
        plugin: StorytellerSuitePlugin,
        options: TimelineRendererOptions = {}
    ) {
        this.container = container;
        this.plugin = plugin;
        this.app = plugin.app;
        this.options = {
            ganttMode: false,
            groupMode: 'none',
            showDependencies: true,
            stackEnabled: true,
            density: 50,
            defaultGanttDuration: 1,
            editMode: false,
            ...options
        };
    }

    /**
     * Initialize timeline with current events and settings
     */
    async initialize(): Promise<void> {
        this.events = await this.plugin.listEvents();
        await this.render();
    }

    /**
     * Refresh timeline with latest data
     */
    async refresh(): Promise<void> {
        this.events = await this.plugin.listEvents();
        await this.render();
    }

    /**
     * Apply filters to timeline
     */
    applyFilters(filters: Partial<TimelineFilters>): void {
        this.filters = { ...this.filters, ...filters };
        this.renderPreservingView();
    }

    /**
     * Toggle between Gantt and Timeline mode
     */
    setGanttMode(enabled: boolean): void {
        this.options.ganttMode = enabled;
        this.renderPreservingView();
    }

    /**
     * Update grouping mode
     */
    setGroupMode(mode: 'none' | 'location' | 'group' | 'character'): void {
        this.options.groupMode = mode;
        this.renderPreservingView();
    }

    /**
     * Set edit mode (enable/disable dragging)
     */
    setEditMode(enabled: boolean): void {
        this.options.editMode = enabled;
        if (this.timeline) {
            this.timeline.setOptions({
                editable: enabled ? {
                    updateTime: true,
                    updateGroup: true,
                    remove: false,
                    add: false
                } : false
            });
        }
    }

    /**
     * Set stack mode
     */
    setStackEnabled(enabled: boolean): void {
        this.options.stackEnabled = enabled;
        this.renderPreservingView();
    }

    /**
     * Set density (affects item margin)
     */
    setDensity(density: number): void {
        this.options.density = density;
        this.renderPreservingView();
    }

    /**
     * Zoom to fit all events
     */
    fitToView(): void {
        if (!this.timeline) return;
        try {
            // Verify timeline is fully initialized
            if (typeof this.timeline.fit === 'function') {
                this.timeline.fit();
            }
        } catch (error) {
            console.warn('Timeline: Could not fit to view:', error);
        }
    }

    /**
     * Zoom to preset (years around reference date)
     */
    zoomPresetYears(years: number): void {
        if (!this.timeline) return;
        try {
            const refDate = this.plugin.getReferenceTodayDate();
            if (!refDate || !(refDate instanceof Date) || isNaN(refDate.getTime())) {
                console.error('Timeline: Invalid reference date, cannot zoom');
                return;
            }
            // Verify timeline has setWindow method
            if (typeof this.timeline.setWindow !== 'function') {
                console.warn('Timeline: setWindow method not available');
                return;
            }
            const center = refDate.getTime();
            const half = (years * 365.25 * 24 * 60 * 60 * 1000) / 2;
            this.timeline.setWindow(new Date(center - half), new Date(center + half));
        } catch (error) {
            console.warn('Timeline: Could not zoom to preset:', error);
        }
    }

    /**
     * Move timeline to today
     */
    moveToToday(): void {
        if (!this.timeline) return;
        try {
            const ref = this.plugin.getReferenceTodayDate();
            if (!ref || !(ref instanceof Date) || isNaN(ref.getTime())) {
                console.error('Timeline: Invalid reference date, cannot move to today');
                return;
            }
            // Verify timeline has moveTo method
            if (typeof this.timeline.moveTo === 'function') {
                this.timeline.moveTo(ref);
            }
        } catch (error) {
            console.warn('Timeline: Could not move to today:', error);
        }
    }

    /**
     * Zoom timeline to focus on a specific event
     * Intelligently calculates window size based on event duration and neighboring events
     */
    private zoomToEvent(eventIndex: number): void {
        if (!this.timeline) return;

        // Validate array bounds
        if (eventIndex < 0 || eventIndex >= this.events.length) {
            console.error('Timeline: Invalid event index for zoom:', eventIndex);
            return;
        }

        const event = this.events[eventIndex];
        if (!event) {
            console.error('Timeline: Event not found at index:', eventIndex);
            return;
        }

        try {
            const referenceDate = this.plugin.getReferenceTodayDate();
            const dateString = getEventDateForTimeline(event);
            const parsed = dateString ? parseEventDate(dateString, { referenceDate }) : null;

            const startMs = toMillis(parsed?.start);
            if (startMs == null || typeof startMs !== 'number' || isNaN(startMs)) {
                console.warn('Timeline: Cannot zoom to event with invalid date:', event.name);
                return;
            }

            const endMs = toMillis(parsed?.end);

            // Calculate appropriate zoom window
            let windowStart: Date;
            let windowEnd: Date;

            if (endMs != null && typeof endMs === 'number' && !isNaN(endMs)) {
                // Event has a duration (range event)
                const durationMs = endMs - startMs;

                // Add 50% padding on each side for context
                const paddingMs = durationMs * 0.5;
                windowStart = new Date(startMs - paddingMs);
                windowEnd = new Date(endMs + paddingMs);
            } else {
                // Point event - create a window based on the timeline's current zoom level or default
                const currentWindow = this.getVisibleRange();
                let contextWindowMs: number;

                if (currentWindow) {
                    // Use 10% of current visible window as the new window
                    const currentRangeMs = currentWindow.end.getTime() - currentWindow.start.getTime();
                    contextWindowMs = Math.max(currentRangeMs * 0.1, 30 * 24 * 60 * 60 * 1000); // Minimum 30 days
                } else {
                    // Default to 1 year window for point events
                    contextWindowMs = 365.25 * 24 * 60 * 60 * 1000;
                }

                const halfWindow = contextWindowMs / 2;
                windowStart = new Date(startMs - halfWindow);
                windowEnd = new Date(startMs + halfWindow);
            }

            // Apply the zoom with smooth animation
            if (typeof this.timeline.setWindow === 'function') {
                this.timeline.setWindow(windowStart, windowEnd, {
                    animation: {
                        duration: 500,
                        easingFunction: 'easeInOutQuad'
                    }
                });
            }
        } catch (error) {
            console.warn('Timeline: Could not zoom to event:', error);
        }
    }

    /**
     * Get visible date range
     */
    getVisibleRange(): { start: Date; end: Date } | null {
        if (!this.timeline) return null;
        try {
            const range = this.timeline.getWindow();
            return {
                start: new Date(range.start),
                end: new Date(range.end)
            };
        } catch {
            return null;
        }
    }

    /**
     * Set visible window range (for state restoration)
     */
    setVisibleRange(start: Date, end: Date): void {
        if (!this.timeline) return;
        try {
            if (typeof this.timeline.setWindow === 'function') {
                this.timeline.setWindow(start, end, { animation: false });
            }
        } catch (error) {
            console.warn('Timeline: Could not set visible range:', error);
        }
    }

    /**
     * Export timeline as image
     */
    async exportAsImage(format: 'png' | 'jpg'): Promise<void> {
        // TODO: Implement export functionality
        new Notice(`Export as ${format.toUpperCase()} not yet implemented`);
    }

    /**
     * Get event count (respecting filters)
     */
    getEventCount(): number {
        return this.events.filter(evt => this.shouldIncludeEvent(evt)).length;
    }

    /**
     * Get date range of all events
     */
    getDateRange(): { start: Date; end: Date } | null {
        const referenceDate = this.plugin.getReferenceTodayDate();
        let minMs = Infinity;
        let maxMs = -Infinity;

        this.events.forEach(evt => {
            if (!this.shouldIncludeEvent(evt)) return;
            const dateString = getEventDateForTimeline(evt);
            const parsed = dateString ? parseEventDate(dateString, { referenceDate }) : null;
            const startMs = toMillis(parsed?.start);
            const endMs = toMillis(parsed?.end);
            
            if (startMs != null) {
                minMs = Math.min(minMs, startMs);
                maxMs = Math.max(maxMs, endMs || startMs);
            }
        });

        if (minMs === Infinity) return null;
        return { start: new Date(minMs), end: new Date(maxMs) };
    }

    /**
     * Destroy timeline and clean up
     */
    destroy(): void {
        // Clear any pending click timeout
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }

        if (this.dependencyArrows) {
            try {
                this.dependencyArrows.removeArrows();
            } catch {
                // Ignore errors removing arrows
            }
            this.dependencyArrows = null;
        }
        if (this.timeline) {
            try {
                this.timeline.destroy();
            } catch {
                // Ignore errors destroying timeline
            }
            this.timeline = null;
        }
    }

    /**
     * Render while preserving current zoom/scroll position
     */
    private renderPreservingView(): void {
        const currentWindow = this.getVisibleRange();
        this.render(currentWindow);
    }

    /**
     * Main rendering method with error boundary
     * @param preservedWindow Optional window range to restore after rendering
     */
    private async render(preservedWindow?: { start: Date; end: Date } | null): Promise<void> {
        try {
            // Clear existing timeline
            this.destroy();

            const referenceDate = this.plugin.getReferenceTodayDate();
            const build = await this.buildDatasets(referenceDate);
            const items = build.items;
            const groups = build.groups;

            // Timeline options
            // In Gantt mode, use larger margins for better bar visibility
            const baseMargin = this.options.ganttMode ? 15 : 4;
            const itemMargin = baseMargin + Math.round((this.options.density || 50) / 6);
            const dayMs = 24 * 60 * 60 * 1000;
            const yearMs = 365.25 * dayMs;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const timelineOptions: any = {
                stack: this.options.stackEnabled,
                stackSubgroups: true,
                margin: {
                    item: itemMargin,
                    axis: 40  // Increased axis margin to ensure labels have space
                },
                zoomable: true,
                zoomMin: dayMs,
                zoomMax: 1000 * yearMs,
                multiselect: true,
                orientation: 'bottom' as const,
                tooltip: {
                    followMouse: true,
                    overflowMethod: 'cap',
                    delay: 300
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                visibleFrameTemplate: function(item: any) {
                    if (!item.progress || item.progress === 0) return '';
                    return `<div class="timeline-progress" style="width:${item.progress}%"></div>`;
                },
                // Explicitly enable axis labels and gridlines
                showMinorLabels: true,
                showMajorLabels: true,
                showCurrentTime: true,
                // Ensure vertical gridlines are visible
                verticalScroll: false,
                horizontalScroll: true,
                // Configure time axis to ensure proper rendering
                height: this.options.ganttMode ? 'auto' : undefined
            };

            // Set container overflow to allow proper scrolling
            // Remove the overflow: visible that was causing issues
            this.container.style.removeProperty('overflow');

            // Enable drag-and-drop editing when in edit mode
            if (this.options.editMode) {
                timelineOptions.editable = {
                    updateTime: true,
                    updateGroup: true,
                    remove: false,
                    add: false
                };
            }

            // Create timeline with error handling
            try {
                this.timeline = groups 
                    ? new Timeline(this.container, items, groups, timelineOptions)
                    : new Timeline(this.container, items, timelineOptions);
            } catch (timelineError) {
                console.error('Storyteller Suite: Error creating vis-timeline:', timelineError);
                new Notice('Timeline rendering failed. Check console for details.');
                // Create a fallback message in the container
                this.container.empty();
                this.container.createDiv('storyteller-timeline-error', div => {
                    div.createEl('h3', { text: 'Timeline Error' });
                    div.createEl('p', { text: 'Failed to render timeline. This may be due to invalid date formats or vis-timeline configuration issues.' });
                    div.createEl('p', { text: 'Check the developer console (Ctrl+Shift+I) for more details.' });
                });
                return;
            }

            // Set custom current time bar
            if (this.timeline && referenceDate) {
                try {
                    if (typeof this.timeline.setCurrentTime === 'function') {
                        this.timeline.setCurrentTime(referenceDate);
                    }
                } catch (timeError) {
                    console.warn('Storyteller Suite: Could not set current time marker:', timeError);
                }
            }

            // Restore preserved window range if available
            if (preservedWindow && this.timeline) {
                try {
                    if (typeof this.timeline.setWindow === 'function') {
                        // Use requestAnimationFrame to ensure timeline is fully rendered
                        requestAnimationFrame(() => {
                            if (this.timeline && preservedWindow) {
                                this.timeline.setWindow(preservedWindow.start, preservedWindow.end, { animation: false });
                            }
                        });
                    }
                } catch (windowError) {
                    console.warn('Storyteller Suite: Could not restore window range:', windowError);
                }
            }

            // Handle drag-and-drop changes when in edit mode
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.timeline.on('changed', async (props: any) => {
                if (!this.options.editMode) return;
                if (!props || !props.items || props.items.length === 0) return;

                const updatedItemId = props.items[0];
                const updatedItem = items.get(updatedItemId);
                if (!updatedItem) return;

                // Validate array bounds
                if (updatedItemId < 0 || updatedItemId >= this.events.length) {
                    console.error('Timeline: Invalid event index in drag-drop:', updatedItemId);
                    return;
                }

                const event = this.events[updatedItemId];
                if (!event) return;

                const startDate = new Date(updatedItem.start);
                const endDate = updatedItem.end ? new Date(updatedItem.end) : null;

                // Validate Date objects
                if (isNaN(startDate.getTime())) {
                    console.error('Timeline: Invalid start date after drag:', updatedItem.start);
                    new Notice('Error: Invalid date after move');
                    return;
                }

                if (endDate && isNaN(endDate.getTime())) {
                    console.error('Timeline: Invalid end date after drag:', updatedItem.end);
                    new Notice('Error: Invalid date after move');
                    return;
                }

                if (endDate) {
                    event.dateTime = `${startDate.toISOString()} to ${endDate.toISOString()}`;
                } else {
                    event.dateTime = startDate.toISOString();
                }

                try {
                    await this.plugin.saveEvent(event);
                    new Notice(`Event "${event.name}" rescheduled`);
                } catch (error) {
                    console.error('Error saving event after drag:', error);
                    new Notice('Error saving event changes');
                }
            });

            // Handle single click to zoom into event
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.timeline.on('click', (props: any) => {
                if (props.item != null && props.event) {
                    // Prevent zoom if this is the first click of a double-click
                    // We use a simple timeout-based approach to distinguish single from double clicks
                    const clickDelay = 250; // ms to wait before treating as single click

                    if (this.clickTimeout) {
                        clearTimeout(this.clickTimeout);
                        this.clickTimeout = null;
                        return; // This is a double-click, don't zoom
                    }

                    this.clickTimeout = setTimeout(() => {
                        this.clickTimeout = null;
                        this.zoomToEvent(props.item as number);
                    }, clickDelay);
                }
            });

            // Handle double-click to edit
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.timeline.on('doubleClick', (props: any) => {
                // Cancel any pending single-click zoom
                if (this.clickTimeout) {
                    clearTimeout(this.clickTimeout);
                    this.clickTimeout = null;
                }

                if (props.item != null) {
                    const idx = props.item as number;

                    // Validate array bounds
                    if (idx < 0 || idx >= this.events.length) {
                        console.error('Timeline: Invalid event index in double-click:', idx);
                        return;
                    }

                    const event = this.events[idx];
                    if (!event) {
                        console.error('Timeline: Event not found at index:', idx);
                        return;
                    }

                    new EventModal(this.app, this.plugin, event, async (updatedData: Event) => {
                        await this.plugin.saveEvent(updatedData);
                        new Notice(`Event "${updatedData.name}" updated`);
                        await this.refresh();
                    }).open();
                }
            });

            // Render dependency arrows in Gantt mode
            if (this.options.ganttMode && this.options.showDependencies) {
                try {
                    const arrowSpecs = this.buildDependencyArrows();
                    if (arrowSpecs.length > 0) {
                        const arrowOptions = {
                            followRelationships: true,
                            color: '#666',
                            strokeWidth: 2,
                            hideWhenItemsNotVisible: true
                        };
                        this.dependencyArrows = new Arrow(this.timeline, arrowSpecs, arrowOptions);
                    }
                } catch (arrowError) {
                    console.warn('Storyteller Suite: Error rendering dependency arrows:', arrowError);
                    // Non-critical, continue without arrows
                }
            }

        } catch (error) {
            console.error('Storyteller Suite: Fatal error in timeline rendering:', error);
            new Notice('Timeline could not be rendered. Check console for details.');
            // Show error state in container
            this.container.empty();
            this.container.createDiv('storyteller-timeline-error', div => {
                div.createEl('h3', { text: 'Timeline Error' });
                div.createEl('p', { text: 'An unexpected error occurred while rendering the timeline.' });
                div.createEl('p', { text: 'Check the developer console (Ctrl+Shift+I) for more details.' });
            });
        }
    }

    /**
     * Build datasets for vis-timeline
     */
    private async buildDatasets(referenceDate: Date): Promise<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groups?: any;
        legend: Array<{ key: string; label: string; color: string }>;
    }> {
        const items = new DataSet();
        const legend: Array<{ key: string; label: string; color: string }> = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let groupsDS: any | undefined;

        // Build grouping map and colors
        const keyToColor = new Map<string, string>();
        const keyToLabel = new Map<string, string>();

        if (this.options.groupMode !== 'none') {
            groupsDS = new DataSet();
            
            if (this.options.groupMode === 'group') {
                const groups = this.plugin.getGroups();
                groups.forEach((g, i) => {
                    const color = g.color || this.palette[i % this.palette.length];
                    keyToColor.set(g.id, color);
                    keyToLabel.set(g.id, g.name);
                    groupsDS.add({ id: g.id, content: g.name });
                    legend.push({ key: g.id, label: g.name, color });
                });
                const noneColor = '#64748B';
                keyToColor.set('__ungrouped__', noneColor);
                keyToLabel.set('__ungrouped__', 'Ungrouped');
                groupsDS.add({ id: '__ungrouped__', content: 'Ungrouped' });
                legend.push({ key: '__ungrouped__', label: 'Ungrouped', color: noneColor });
            } else if (this.options.groupMode === 'location') {
                const uniqueLocations = Array.from(new Set(this.events.map(e => e.location || 'Unspecified')));
                uniqueLocations.forEach((loc, i) => {
                    const id = loc || 'Unspecified';
                    const color = this.palette[i % this.palette.length];
                    keyToColor.set(id, color);
                    keyToLabel.set(id, loc || 'Unspecified');
                    groupsDS.add({ id, content: loc || 'Unspecified' });
                    legend.push({ key: id, label: loc || 'Unspecified', color });
                });
            } else if (this.options.groupMode === 'character') {
                const uniqueCharacters = new Set<string>();
                this.events.forEach(e => {
                    if (e.characters && e.characters.length > 0) {
                        e.characters.forEach(c => uniqueCharacters.add(c));
                    }
                });
                Array.from(uniqueCharacters).forEach((char, i) => {
                    const color = this.palette[i % this.palette.length];
                    keyToColor.set(char, color);
                    keyToLabel.set(char, char);
                    groupsDS.add({ id: char, content: char });
                    legend.push({ key: char, label: char, color });
                });
                const noneColor = '#64748B';
                keyToColor.set('__unassigned__', noneColor);
                keyToLabel.set('__unassigned__', 'No character');
                groupsDS.add({ id: '__unassigned__', content: 'No character' });
                legend.push({ key: '__unassigned__', label: 'No character', color: noneColor });
            }
        }

        // Build items
        for (let idx = 0; idx < this.events.length; idx++) {
            const evt = this.events[idx];

            if (!this.shouldIncludeEvent(evt)) {
                continue;
            }

            const dateString = getEventDateForTimeline(evt);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsed = dateString ? parseEventDate(dateString, { referenceDate }) : { error: 'empty' } as any;

            const startMs = toMillis(parsed.start);
            const endMs = toMillis(parsed.end);

            // Validate that we have a valid numeric timestamp
            if (startMs == null || typeof startMs !== 'number' || isNaN(startMs)) {
                console.warn('[Timeline] Skipping event with invalid start date:', evt.name, {
                    dateString,
                    parsed,
                    startMs
                });
                continue;
            }

            // Determine grouping
            let groupId: string | undefined;
            let color: string | undefined;
            if (this.options.groupMode === 'group') {
                groupId = (evt.groups && evt.groups.length > 0) ? evt.groups[0] : '__ungrouped__';
                color = keyToColor.get(groupId);
            } else if (this.options.groupMode === 'location') {
                groupId = evt.location || 'Unspecified';
                color = keyToColor.get(groupId);
            } else if (this.options.groupMode === 'character') {
                groupId = (evt.characters && evt.characters.length > 0) ? evt.characters[0] : '__unassigned__';
                color = keyToColor.get(groupId);
            }

            const approx = !!parsed.approximate;
            const isMilestone = !!evt.isMilestone;
            
            // Gantt mode: ensure all events have duration (but not milestones)
            let displayEndMs = endMs;
            if (this.options.ganttMode && displayEndMs == null && !isMilestone) {
                const durationMs = (this.options.defaultGanttDuration || 1) * 24 * 60 * 60 * 1000;
                displayEndMs = startMs + durationMs;
            }
            
            // Validate displayEndMs if it exists
            if (displayEndMs != null && (typeof displayEndMs !== 'number' || isNaN(displayEndMs))) {
                console.warn('[Timeline] Invalid end timestamp for event:', evt.name, displayEndMs);
                displayEndMs = undefined; // Treat as point event
            }
            
            // Build CSS classes
            const classes: string[] = [];
            if (approx) classes.push('is-approx');
            if (isMilestone) classes.push('timeline-milestone');
            if (this.options.ganttMode && !isMilestone) classes.push('gantt-bar');
            
            // Style
            const style = color ? `background-color:${this.hexWithAlpha(color, 0.18)};border-color:${color};` : '';
            
            // Content with milestone icon
            const content = isMilestone ? '⭐ ' + evt.name : evt.name;

            // Item type - milestones always use 'box' to show content without range bars
            let itemType: string;
            if (isMilestone) {
                itemType = 'box';
            } else if (this.options.ganttMode) {
                itemType = 'range';
            } else {
                itemType = displayEndMs != null ? 'range' : 'box';
            }

            items.add({
                id: idx,
                content: content,
                start: new Date(startMs),
                end: displayEndMs != null ? new Date(displayEndMs) : undefined,
                title: await this.makeTooltipAsync(evt, parsed),
                type: itemType,
                className: classes.length > 0 ? classes.join(' ') : undefined,
                group: groupId,
                style,
                progress: evt.progress
            });
        }

        return { items, groups: groupsDS, legend };
    }

    /**
     * Build dependency arrow specifications
     * Validates dependency IDs and logs warnings for missing dependencies
     */
    private buildDependencyArrows(): Array<{
        id: string;
        id_item_1: number;
        id_item_2: number;
        title?: string;
    }> {
        const arrows: Array<{
            id: string;
            id_item_1: number;
            id_item_2: number;
            title?: string;
        }> = [];
        let arrowId = 0;
        
        // Build a set of valid event names for O(1) lookup
        const validEventNames = new Set(this.events.map(e => this.sanitizeEventId(e.name)));
        
        this.events.forEach((evt, targetIdx) => {
            if (!evt.dependencies || evt.dependencies.length === 0) return;
            if (!this.shouldIncludeEvent(evt)) return;
            
            evt.dependencies.forEach(depName => {
                // Sanitize dependency name for comparison
                const sanitizedDepName = this.sanitizeEventId(depName);
                
                // Validate dependency exists
                if (!validEventNames.has(sanitizedDepName)) {
                    console.warn(`Storyteller Suite: Dependency "${depName}" not found for event "${evt.name}". Arrow will not be rendered.`);
                    return;
                }
                
                const sourceIdx = this.events.findIndex(e => this.sanitizeEventId(e.name) === sanitizedDepName);
                if (sourceIdx === -1) {
                    console.warn(`Storyteller Suite: Could not find index for dependency "${depName}" for event "${evt.name}".`);
                    return;
                }
                
                if (!this.shouldIncludeEvent(this.events[sourceIdx])) return;
                
                arrows.push({
                    id: `arrow_${arrowId++}`,
                    id_item_1: sourceIdx,
                    id_item_2: targetIdx,
                    title: `${depName} → ${evt.name}`
                });
            });
        });
        
        return arrows;
    }

    /**
     * Sanitize event ID/name for safe comparison and arrow rendering
     * Removes special characters that could break timeline-arrows library
     */
    private sanitizeEventId(id: string): string {
        if (!id) return '';
        // Remove special characters but preserve basic alphanumerics, spaces, and hyphens
        return id.trim().replace(/[^\w\s-]/g, '').toLowerCase();
    }

    /**
     * Check if event should be included based on filters
     */
    private shouldIncludeEvent(evt: Event): boolean {
        // Milestones filter
        if (this.filters.milestonesOnly && !evt.isMilestone) {
            return false;
        }
        
        // Character filter
        if (this.filters.characters && this.filters.characters.size > 0) {
            const hasMatchingChar = evt.characters?.some(c => this.filters.characters && this.filters.characters.has(c));
            if (!hasMatchingChar) return false;
        }
        
        // Location filter
        if (this.filters.locations && this.filters.locations.size > 0) {
            if (!evt.location || !this.filters.locations.has(evt.location)) return false;
        }
        
        // Group filter
        if (this.filters.groups && this.filters.groups.size > 0) {
            const hasMatchingGroup = evt.groups?.some(g => this.filters.groups && this.filters.groups.has(g));
            if (!hasMatchingGroup) return false;
        }

        return true;
    }

    /**
     * Make tooltip for event
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async makeTooltipAsync(evt: Event, parsed: any): Promise<string> {
        const parts: string[] = [evt.name];
        const dt = parsed?.start ? toDisplay(parsed.start, undefined, parsed.isBCE, parsed.originalYear) : (evt.dateTime || '');
        if (dt) parts.push(dt);
        if (evt.location) parts.push(`@ ${evt.location}`);
        if (evt.description) parts.push(evt.description.length > 120 ? evt.description.slice(0, 120) + '…' : evt.description);
        return parts.filter(Boolean).join(' \n');
    }

    private makeTooltip(evt: Event, parsed: any): string {
        // Synchronous version for backwards compatibility - will be async in tooltip generation
        const parts: string[] = [evt.name];
        const dt = parsed?.start ? toDisplay(parsed.start, undefined, parsed.isBCE, parsed.originalYear) : (evt.dateTime || '');
        if (dt) parts.push(dt);
        if (evt.location) parts.push(`@ ${evt.location}`);
        if (evt.description) parts.push(evt.description.length > 120 ? evt.description.slice(0, 120) + '…' : evt.description);
        return parts.filter(Boolean).join(' \n');
    }

    /**
     * Convert hex color to rgba
     */
    private hexWithAlpha(hex: string, alpha: number): string {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!m) return hex;
        const r = parseInt(m[1], 16);
        const g = parseInt(m[2], 16);
        const b = parseInt(m[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
