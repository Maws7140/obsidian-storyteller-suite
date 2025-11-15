// Timeline Renderer - Shared rendering logic for Timeline Modal and Timeline View
// Handles vis-timeline initialization, dataset building, Gantt mode, dependencies, and interactions

import { App, Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Event, Calendar } from '../types';
import { parseEventDate, toMillis, toDisplay, getEventDateForTimeline } from './DateParsing';
import { EventModal } from '../modals/EventModal';
import { CalendarConverter } from './CalendarConverter';
import { CustomTimeAxis } from './CustomTimeAxis';
import { CalendarMarkers } from './CalendarMarkers';

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
    
    // Configuration
    private options: TimelineRendererOptions;
    private filters: TimelineFilters = {};
    private events: Event[] = [];

    // Calendar configuration (Level 3 feature)
    private selectedCalendarId?: string;
    
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
        this.render();
    }

    /**
     * Toggle between Gantt and Timeline mode
     */
    setGanttMode(enabled: boolean): void {
        this.options.ganttMode = enabled;
        this.render();
    }

    /**
     * Update grouping mode
     */
    setGroupMode(mode: 'none' | 'location' | 'group' | 'character'): void {
        this.options.groupMode = mode;
        this.render();
    }

    /**
     * Set selected calendar for timeline display (Level 3 feature)
     * @param calendarId Calendar ID, or undefined for "All Calendars (Gregorian)" mode
     */
    setCalendar(calendarId?: string): void {
        this.selectedCalendarId = calendarId;
        this.render();
    }

    /**
     * Get currently selected calendar
     */
    getSelectedCalendarId(): string | undefined {
        return this.selectedCalendarId;
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
        this.render();
    }

    /**
     * Set density (affects item margin)
     */
    setDensity(density: number): void {
        this.options.density = density;
        this.render();
    }

    /**
     * Zoom to fit all events
     */
    fitToView(): void {
        if (this.timeline) {
            this.timeline.fit();
        }
    }

    /**
     * Zoom to preset (years around reference date)
     */
    zoomPresetYears(years: number): void {
        if (!this.timeline) return;
        const refDate = this.plugin.getReferenceTodayDate();
        if (!refDate || !(refDate instanceof Date) || isNaN(refDate.getTime())) {
            console.error('Timeline: Invalid reference date, cannot zoom');
            return;
        }
        const center = refDate.getTime();
        const half = (years * 365.25 * 24 * 60 * 60 * 1000) / 2;
        this.timeline.setWindow(new Date(center - half), new Date(center + half));
    }

    /**
     * Move timeline to today
     */
    moveToToday(): void {
        if (this.timeline) {
            const ref = this.plugin.getReferenceTodayDate();
            this.timeline.moveTo(ref);
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
     * Main rendering method with error boundary
     */
    private async render(): Promise<void> {
        try {
            // Clear existing timeline
            this.destroy();

            const referenceDate = this.plugin.getReferenceTodayDate();
            const build = await this.buildDatasets(referenceDate);
            const items = build.items;
            const groups = build.groups;

            // Add calendar markers if a calendar is selected (Level 3 feature)
            if (this.selectedCalendarId) {
                try {
                    const calendars = await this.plugin.listCalendars();
                    const selectedCalendar = calendars.find(
                        c => (c.id || c.name) === this.selectedCalendarId
                    );

                    if (selectedCalendar) {
                        // Determine year range from events
                        const eventDates = this.events
                            .map(e => parseEventDate(e.dateTime || ''))
                            .filter(d => d.start)
                            .map(d => d.start!.year);

                        // Protect against empty array - use current year ± 1 as fallback
                        const currentYear = new Date().getFullYear();
                        const startYear = eventDates.length > 0
                            ? Math.min(...eventDates, currentYear - 1)
                            : currentYear - 1;
                        const endYear = eventDates.length > 0
                            ? Math.max(...eventDates, currentYear + 1)
                            : currentYear + 1;

                        // Generate calendar markers
                        const markers = CalendarMarkers.generateAllMarkers(
                            selectedCalendar,
                            startYear,
                            endYear
                        );

                        // Add markers to items dataset
                        CalendarMarkers.applyMarkersToTimeline(null, markers, items);
                    }
                } catch (markerError) {
                    console.warn('Storyteller Suite: Error adding calendar markers:', markerError);
                    // Non-critical, continue without markers
                }
            }

            // Timeline options
            // In Gantt mode, use larger margins for better bar visibility
            const baseMargin = this.options.ganttMode ? 15 : 4;
            const itemMargin = baseMargin + Math.round((this.options.density || 50) / 6);
            const dayMs = 24 * 60 * 60 * 1000;
            const yearMs = 365.25 * dayMs;

            // Check if a custom calendar is selected and prepare format function
            let selectedCalendar: Calendar | null = null;
            if (this.selectedCalendarId) {
                try {
                    const calendars = await this.plugin.listCalendars();
                    selectedCalendar = calendars.find(
                        c => (c.id || c.name) === this.selectedCalendarId
                    ) || null;
                } catch (error) {
                    console.warn('Storyteller Suite: Error loading calendar for timeline options:', error);
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const timelineOptions: any = {
                stack: this.options.stackEnabled,
                stackSubgroups: true,
                margin: { item: itemMargin, axis: 20 },
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
                // Ensure gridlines and labels are visible
                showMinorLabels: true,
                showMajorLabels: true,
                showCurrentTime: true
            };

            // Apply custom calendar format function during initialization if calendar is selected
            if (selectedCalendar) {
                const formatFunction = CustomTimeAxis.createFormatFunction(selectedCalendar);
                timelineOptions.format = {
                    minorLabels: formatFunction,
                    majorLabels: formatFunction
                };
                console.log('[Timeline] Applying custom calendar format during initialization:', selectedCalendar.name);
            }

            // Ensure container doesn't clip tooltips
            this.container.style.overflow = 'visible';

            // Add explicit item height in Gantt mode for consistent bar sizing
            if (this.options.ganttMode) {
                timelineOptions.height = '40px';
            }

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

            // Apply custom calendar axis if a calendar is selected (Level 3 feature)
            if (this.timeline && selectedCalendar) {
                try {
                    // Apply custom time axis scale settings (format already applied during init)
                    CustomTimeAxis.applyToTimeline(this.timeline, selectedCalendar);

                    // Determine visible range to add month boundary markers
                    const range = this.timeline.getWindow();
                    if (range && range.start && range.end) {
                        const startDate = new Date(range.start);
                        const endDate = new Date(range.end);

                        // Validate Date objects before calling getFullYear()
                        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                            const startYear = startDate.getFullYear();
                            const endYear = endDate.getFullYear();

                            // Create month boundary markers (limited range to avoid performance issues)
                            const yearRange = Math.min(endYear - startYear, 10); // Limit to 10 years
                            const boundaryMarkers = CustomTimeAxis.createMonthBoundaryMarkers(
                                this.timeline,
                                selectedCalendar,
                                startYear,
                                startYear + yearRange
                            );

                            // Add boundary markers to the timeline items
                            if (boundaryMarkers.length > 0) {
                                items.add(boundaryMarkers);
                                console.log(`[Timeline] Added ${boundaryMarkers.length} month boundary markers to timeline`);
                            }
                        }
                    }
                } catch (calendarError) {
                    console.warn('Storyteller Suite: Could not apply custom calendar axis:', calendarError);
                    // Non-critical, continue with default axis
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

            // Handle double-click to edit
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.timeline.on('doubleClick', (props: any) => {
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

            // Add zoom/pan listener for dynamic calendar axis updates (Level 3 feature)
            if (this.timeline && this.selectedCalendarId) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.timeline.on('rangechanged', async (props: any) => {
                    if (!this.selectedCalendarId) return;

                    try {
                        const calendars = await this.plugin.listCalendars();
                        const selectedCalendar = calendars.find(
                            c => (c.id || c.name) === this.selectedCalendarId
                        );

                        if (selectedCalendar && props.byUser) {
                            // User initiated zoom/pan - update axis scale
                            const range = this.timeline.getWindow();
                            if (range && range.start && range.end) {
                                // Handle both Date objects and raw timestamps
                                const startMs = typeof range.start === 'number'
                                    ? range.start
                                    : (range.start instanceof Date ? range.start.getTime() : range.start.valueOf());
                                const endMs = typeof range.end === 'number'
                                    ? range.end
                                    : (range.end instanceof Date ? range.end.getTime() : range.end.valueOf());

                                if (!isNaN(startMs) && !isNaN(endMs)) {
                                    const timeScale = CustomTimeAxis.determineTimeScale(startMs, endMs);

                                    // Re-apply custom time axis with updated scale
                                    CustomTimeAxis.applyToTimeline(this.timeline, selectedCalendar);
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('Storyteller Suite: Error updating calendar axis on zoom:', error);
                    }
                });
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
        // DEBUG: Log all events before filtering
        console.log('[Timeline] Building datasets with', this.events.length, 'total events');
        console.log('[Timeline] Selected calendar:', this.selectedCalendarId);
        console.log('[Timeline] All events:', this.events.map(e => ({
            name: e.name,
            calendarId: e.calendarId,
            customCalendarDate: e.customCalendarDate,
            gregorianDateTime: e.gregorianDateTime,
            dateTime: e.dateTime
        })));
        
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

            // DEBUG: Log custom calendar events
            if (evt.customCalendarDate) {
                console.log('[Timeline] Processing custom calendar event:', evt.name, {
                    calendarId: evt.calendarId,
                    customDate: evt.customCalendarDate,
                    gregorianDateTime: evt.gregorianDateTime
                });
            }

            if (!this.shouldIncludeEvent(evt)) {
                if (evt.customCalendarDate) {
                    console.log('[Timeline] Event filtered out by shouldIncludeEvent:', evt.name);
                }
                continue;
            }

            const dateString = getEventDateForTimeline(evt);
            if (evt.customCalendarDate) {
                console.log('[Timeline] Date string for', evt.name, ':', dateString);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsed = dateString ? parseEventDate(dateString, { referenceDate }) : { error: 'empty' } as any;
            if (evt.customCalendarDate) {
                console.log('[Timeline] Parsed result for', evt.name, ':', parsed);
            }

            const startMs = toMillis(parsed.start);
            const endMs = toMillis(parsed.end);

            if (evt.customCalendarDate) {
                console.log('[Timeline] Timestamps for', evt.name, ':', { startMs, endMs });
            }

            // Validate that we have a valid numeric timestamp
            if (startMs == null || typeof startMs !== 'number' || isNaN(startMs)) {
                if (evt.customCalendarDate) {
                    console.log('[Timeline] Event excluded due to invalid startMs:', evt.name, startMs);
                }
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

        // Summary of event filtering
        const totalEvents = this.events.length;
        const displayedEvents = items.length;
        const filteredEvents = totalEvents - displayedEvents;

        console.log('[Timeline] Dataset build complete:', {
            totalEvents,
            displayedEvents,
            filteredEvents,
            selectedCalendar: this.selectedCalendarId,
            filterPercentage: totalEvents > 0 ? Math.round((filteredEvents / totalEvents) * 100) : 0
        });

        if (this.selectedCalendarId && filteredEvents > 0) {
            console.log('[Timeline] Note: Events were filtered because they don\'t match the selected calendar or lack conversion data.');
            console.log('[Timeline] To see all events, switch to "All Calendars (Gregorian)" mode.');
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
        // Calendar filter (Level 3 feature)
        // When a calendar is selected, filter events by calendar
        if (this.selectedCalendarId) {
            // If calendar is selected, show events that:
            // 1. Have matching calendarId
            // 2. OR have a valid gregorianDateTime (can be converted to selected calendar)
            // 3. OR have NO calendar set (default Gregorian events with valid dateTime)
            
            const hasMatchingCalendar = evt.calendarId === this.selectedCalendarId;
            const hasGregorianFallback = !!(evt.gregorianDateTime);
            const isDefaultGregorian = !evt.calendarId && !evt.customCalendarDate && evt.dateTime;
            
            // DEBUG logging
            console.log('[Timeline Filter]', evt.name, {
                selectedCalendarId: this.selectedCalendarId,
                eventCalendarId: evt.calendarId,
                hasMatchingCalendar,
                hasGregorianFallback,
                isDefaultGregorian,
                customCalendarDate: evt.customCalendarDate,
                gregorianDateTime: evt.gregorianDateTime,
                dateTime: evt.dateTime,
                willInclude: hasMatchingCalendar || hasGregorianFallback || isDefaultGregorian
            });
            
            // Only show events from the selected calendar OR events with Gregorian dates that can be displayed
            if (!hasMatchingCalendar && !hasGregorianFallback && !isDefaultGregorian) {
                return false;
            }
        } else {
            // "All Calendars (Gregorian)" mode - show all events
            // No calendar-based filtering
        }
        
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

        // If event uses custom calendar, show custom date first
        if (evt.customCalendarDate && evt.calendarId) {
            try {
                const calendars = await this.plugin.listCalendars();
                const calendar = calendars.find(c => c.id === evt.calendarId);

                if (calendar) {
                    const customDateStr = CalendarConverter.formatDate(evt.customCalendarDate, calendar);
                    parts.push(`${calendar.name}: ${customDateStr}`);

                    // Also show Gregorian equivalent
                    const dt = parsed?.start ? toDisplay(parsed.start, undefined, parsed.isBCE, parsed.originalYear) : '';
                    if (dt) parts.push(`(Gregorian: ${dt})`);
                }
            } catch (error) {
                console.error('Error formatting custom calendar date for tooltip:', error);
                // Fallback to standard date display
                const dt = parsed?.start ? toDisplay(parsed.start, undefined, parsed.isBCE, parsed.originalYear) : (evt.dateTime || '');
                if (dt) parts.push(dt);
            }
        } else {
            // Standard Gregorian date
            const dt = parsed?.start ? toDisplay(parsed.start, undefined, parsed.isBCE, parsed.originalYear) : (evt.dateTime || '');
            if (dt) parts.push(dt);
        }

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
