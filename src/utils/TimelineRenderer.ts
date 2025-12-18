// Timeline Renderer - Shared rendering logic for Timeline Modal and Timeline View
// Handles vis-timeline initialization, dataset building, Gantt mode, dependencies, and interactions

import { App, Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Event, Location } from '../types';
import { parseEventDate, toMillis, toDisplay } from './DateParsing';
import { EventModal } from '../modals/EventModal';
import { ConflictDetector, DetectedConflict } from './ConflictDetector';

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
    groupMode?: 'none' | 'location' | 'group' | 'character' | 'track';
    showDependencies?: boolean;
    stackEnabled?: boolean;
    density?: number;
    defaultGanttDuration?: number; // days
    editMode?: boolean;
    showEras?: boolean;
    narrativeOrder?: boolean;
    onConflictsDetected?: (conflicts: DetectedConflict[]) => void;
}

export interface TimelineFilters {
    characters?: Set<string>;
    locations?: Set<string>;
    groups?: Set<string>;
    milestonesOnly?: boolean;
    tags?: Set<string>;
    eras?: Set<string>;
    forkId?: string;
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
    private locations: Location[] = [];

    // Era and narrative order configuration
    private showEras: boolean = false;
    private narrativeOrder: boolean = false;
    
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
        this.locations = await this.plugin.listLocations();
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
    setGroupMode(mode: 'none' | 'location' | 'group' | 'character' | 'track'): void {
        this.options.groupMode = mode;
        this.render();
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
     * Set show eras mode
     */
    setShowEras(enabled: boolean): void {
        this.showEras = enabled;
        this.options.showEras = enabled;
        this.render();
    }

    /**
     * Set narrative order mode
     */
    setNarrativeOrder(enabled: boolean): void {
        this.narrativeOrder = enabled;
        this.options.narrativeOrder = enabled;
        this.render();
    }

    /**
     * Set visible range (zoom/pan position)
     */
    setVisibleRange(start: Date, end: Date): void {
        if (this.timeline) {
            this.timeline.setWindow(start, end);
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
        const center = this.plugin.getReferenceTodayDate().getTime();
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
            const parsed = evt.dateTime ? parseEventDate(evt.dateTime, { referenceDate }) : null;
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
            const build = this.buildDatasets(referenceDate);
            const items = build.items;
            const groups = build.groups;

            // Timeline options
            // In Gantt mode, use larger margins for better bar visibility
            const baseMargin = this.options.ganttMode ? 15 : 4;
            const itemMargin = baseMargin + Math.round((this.options.density || 50) / 6);
            const dayMs = 24 * 60 * 60 * 1000;
            const yearMs = 365.25 * dayMs;

            // Calculate dynamic zoomMax based on actual event date range
            const dateRange = this.getDateRange();
            let calculatedZoomMax = 1000 * yearMs; // default fallback
            const maxZoomMax = 10000 * yearMs; // vis-timeline's recommended maximum (10,000 years)
            
            if (dateRange) {
                const timeSpan = dateRange.end.getTime() - dateRange.start.getTime();
                // Apply 2x padding for comfortable viewing
                calculatedZoomMax = Math.max(timeSpan * 2, 1000 * yearMs);
                // Cap at vis-timeline's recommended maximum (10,000 years)
                calculatedZoomMax = Math.min(calculatedZoomMax, maxZoomMax);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const timelineOptions: any = {
                stack: this.options.stackEnabled,
                stackSubgroups: true,
                margin: { item: itemMargin, axis: 20 },
                zoomable: true,
                zoomFriction: 10,
                zoomKey: 'ctrlKey',
                horizontalScroll: true,
                zoomMin: dayMs,
                zoomMax: calculatedZoomMax,
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
                }
            };

            // Ensure container doesn't clip tooltips
            this.container.style.overflow = 'visible';

            // Add explicit item height in Gantt mode for consistent bar sizing
            // if (this.options.ganttMode) {
            //    timelineOptions.height = '40px';
            // }

            // Enable drag-and-drop editing when in edit mode
            if (this.options.editMode) {
                timelineOptions.editable = {
                    updateTime: true,
                    updateGroup: true,
                    remove: false,
                    add: false
                };
                
                // Add proper onMove callback for drag-and-drop
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                timelineOptions.onMove = async (item: any, callback: (item: any) => void) => {
                    const event = this.events[item.id];
                    if (!event) {
                        callback(null); // Cancel move if event not found
                        return;
                    }
                    
                    const startDate = new Date(item.start);
                    const endDate = item.end ? new Date(item.end) : null;
                    
                    // Update event dateTime - handle both range and point events (milestones)
                    if (endDate && !event.isMilestone) {
                        event.dateTime = `${startDate.toISOString()} to ${endDate.toISOString()}`;
                    } else {
                        event.dateTime = startDate.toISOString();
                    }
                    
                    try {
                        await this.plugin.saveEvent(event);
                        new Notice(`Event "${event.name}" rescheduled`);
                        callback(item); // Confirm the move
                    } catch (error) {
                        console.error('Error saving event after drag:', error);
                        new Notice('Error saving event changes');
                        callback(null); // Cancel move on error
                    }
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

            // Handle double-click to edit
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.timeline.on('doubleClick', (props: any) => {
                if (props.item != null) {
                    const idx = props.item as number;
                    const event = this.events[idx];
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

            // Render narrative connector lines
            if (this.narrativeOrder) {
                try {
                    this.renderNarrativeConnectors();
                } catch (connectorError) {
                    console.warn('Storyteller Suite: Error rendering narrative connectors:', connectorError);
                    // Non-critical, continue without connectors
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
    private buildDatasets(referenceDate: Date): {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groups?: any;
        legend: Array<{ key: string; label: string; color: string }>;
    } {
        const items = new DataSet();
        const legend: Array<{ key: string; label: string; color: string }> = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let groupsDS: any | undefined;

        // Detect conflicts for all events
        const allConflicts = ConflictDetector.detectAllConflicts(this.events);
        
        // Notify listener
        if (this.options.onConflictsDetected) {
            this.options.onConflictsDetected(allConflicts);
        }

        const conflictsByEvent = new Map<string, DetectedConflict[]>();

        // Group conflicts by event name for quick lookup
        allConflicts.forEach(conflict => {
            conflict.events.forEach(event => {
                const existing = conflictsByEvent.get(event.name) || [];
                existing.push(conflict);
                conflictsByEvent.set(event.name, existing);
            });
        });

        // Sort events by narrative order if enabled
        let eventsToRender = [...this.events];
        if (this.narrativeOrder) {
            eventsToRender.sort((a, b) => {
                const seqA = a.narrativeSequence ?? Number.MAX_SAFE_INTEGER;
                const seqB = b.narrativeSequence ?? Number.MAX_SAFE_INTEGER;
                return seqA - seqB;
            });
        }

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
                    // Resolve location ID to display name
                    const displayName = id === 'Unspecified' ? 'Unspecified' : this.resolveLocationName(id);
                    const color = this.palette[i % this.palette.length];
                    keyToColor.set(id, color);
                    keyToLabel.set(id, displayName);
                    groupsDS.add({ id, content: displayName });
                    legend.push({ key: id, label: displayName, color });
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
            } else if (this.options.groupMode === 'track') {
                const tracks = this.plugin.settings.timelineTracks || [];
                const visibleTracks = tracks.filter(t => t.visible !== false);

                visibleTracks.forEach((track, i) => {
                    const color = track.color || this.palette[i % this.palette.length];
                    keyToColor.set(track.id, color);
                    keyToLabel.set(track.id, track.name);
                    groupsDS.add({ id: track.id, content: track.name });
                    legend.push({ key: track.id, label: track.name, color });
                });

                // Add a default track for unassigned events
                const defaultColor = '#64748B';
                keyToColor.set('__no_track__', defaultColor);
                keyToLabel.set('__no_track__', 'Unassigned');
                groupsDS.add({ id: '__no_track__', content: 'Unassigned' });
                legend.push({ key: '__no_track__', label: 'Unassigned', color: defaultColor });
            }
        }

        // Build items
        eventsToRender.forEach((evt) => {
            if (!this.shouldIncludeEvent(evt)) return;

            // Find original index in this.events for ID mapping
            const originalIdx = this.events.findIndex(e => e === evt);
            if (originalIdx === -1) return;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsed = evt.dateTime ? parseEventDate(evt.dateTime, { referenceDate }) : { error: 'empty' } as any;
            const startMs = toMillis(parsed.start);
            const endMs = toMillis(parsed.end);
            if (startMs == null) return;

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
            } else if (this.options.groupMode === 'track') {
                const tracks = this.plugin.settings.timelineTracks || [];
                const visibleTracks = tracks.filter(t => t.visible !== false);

                // Find the first matching track for this event
                const matchingTrack = visibleTracks.find(track => {
                    if (track.type === 'global') return true;
                    if (track.type === 'character' && track.entityId) {
                        return evt.characters?.includes(track.entityId);
                    }
                    if (track.type === 'location' && track.entityId) {
                        return evt.location === track.entityId;
                    }
                    if (track.type === 'group' && track.entityId) {
                        return evt.groups?.includes(track.entityId);
                    }
                    if (track.type === 'custom' && track.filterCriteria) {
                        // Check if event matches custom track's filter criteria
                        const criteria = track.filterCriteria;
                        let matches = true;

                        if (criteria.characters && criteria.characters.length > 0) {
                            const hasCharacter = criteria.characters.some(char =>
                                evt.characters?.includes(char)
                            );
                            if (!hasCharacter) matches = false;
                        }

                        if (criteria.locations && criteria.locations.length > 0) {
                            if (!evt.location || !criteria.locations.includes(evt.location)) {
                                matches = false;
                            }
                        }

                        if (criteria.tags && criteria.tags.length > 0) {
                            const hasTag = criteria.tags.some(tag =>
                                evt.tags?.includes(tag)
                            );
                            if (!hasTag) matches = false;
                        }

                        if (criteria.groups && criteria.groups.length > 0) {
                            const hasGroup = criteria.groups.some(group =>
                                evt.groups?.includes(group)
                            );
                            if (!hasGroup) matches = false;
                        }

                        if (criteria.status && criteria.status.length > 0) {
                            if (!evt.status || !criteria.status.includes(evt.status)) {
                                matches = false;
                            }
                        }

                        if (criteria.milestonesOnly === true) {
                            if (!evt.isMilestone) {
                                matches = false;
                            }
                        }

                        return matches;
                    }
                    return false;
                });

                groupId = matchingTrack ? matchingTrack.id : '__no_track__';
                color = keyToColor.get(groupId);
            }

            const approx = !!parsed.approximate;
            const isMilestone = !!evt.isMilestone;
            
            // Gantt mode: ensure all events have duration
            let displayEndMs = endMs;
            if (this.options.ganttMode && displayEndMs == null) {
                // Both milestones and regular events use the same default duration
                // This ensures milestones are visible at all zoom levels
                const durationMs = (this.options.defaultGanttDuration || 1) * 24 * 60 * 60 * 1000;
                displayEndMs = startMs + durationMs;
            }
            
            // Build CSS classes
            const classes: string[] = [];
            if (approx) classes.push('is-approx');
            if (isMilestone) {
                classes.push('timeline-milestone');
                // Add gantt-milestone class for Gantt-specific milestone styling (no stem/dot)
                if (this.options.ganttMode) classes.push('gantt-milestone');
            }
            // Only apply gantt-bar class to non-milestone events - milestones should remain as point events
            if (this.options.ganttMode && !isMilestone) classes.push('gantt-bar');

            // Detect narrative markers (flashback/flash-forward)
            const isFlashback = evt.narrativeMarkers?.isFlashback || false;
            const isFlashforward = evt.narrativeMarkers?.isFlashforward || false;

            if (isFlashback) classes.push('narrative-flashback');
            if (isFlashforward) classes.push('narrative-flashforward');

            // Style - narrative marker styles are handled by CSS classes
            // For milestones, don't apply group colors - they should always be orange/gold
            const style = (color && !isMilestone) ? `background-color:${this.hexWithAlpha(color, 0.18)};border-color:${color};` : '';

            // Check for conflicts
            const eventConflicts = conflictsByEvent.get(evt.name) || [];
            const hasConflicts = eventConflicts.length > 0;
            const hasErrors = eventConflicts.some(c => c.severity === 'error');
            const hasWarnings = eventConflicts.some(c => c.severity === 'warning');

            // Add narrative sequence number when in narrative order mode
            // Safeguard: ensure content is never empty - use fallback if name is missing or whitespace-only
            const eventName = evt.name?.trim();
            let content = eventName || '(Untitled Event)';
            if (!eventName) {
                console.warn(`Storyteller Suite: Event at index ${originalIdx} has no name. File: ${evt.filePath || 'unknown'}`);
            }
            if (this.narrativeOrder && evt.narrativeSequence !== undefined) {
                content = `[${evt.narrativeSequence}] ${content}`;
                classes.push('has-narrative-sequence');
            }

            // Add conflict badges to content
            if (hasErrors) {
                content = '⚠️ ' + content;
                classes.push('has-conflict-error');
            } else if (hasWarnings) {
                content = '⚠ ' + content;
                classes.push('has-conflict-warning');
            }

            // Add narrative marker icons
            if (isFlashback) content = '↶ ' + content;
            if (isFlashforward) content = '↷ ' + content;
            if (isMilestone) content = '⭐ ' + content;

            // Item type - determines how item renders
            // In Gantt mode: use 'range' for all items (including milestones) to avoid stems/dots
            // In Timeline mode: milestones use 'box' (with stem), others use 'range' or 'box' based on end date
            let itemType: string;
            if (this.options.ganttMode) {
                itemType = 'range';
            } else if (isMilestone) {
                itemType = 'box';
            } else {
                itemType = displayEndMs != null ? 'range' : 'box';
            }

            items.add({
                id: originalIdx,
                content: content,
                start: new Date(startMs),
                end: displayEndMs != null ? new Date(displayEndMs) : undefined,
                title: this.makeTooltip(evt, parsed, eventConflicts),
                type: itemType,
                className: classes.length > 0 ? classes.join(' ') : undefined,
                group: groupId,
                style,
                progress: evt.progress
            });
        });

        // Add era background items when showEras is enabled
        if (this.showEras) {
            const eras = this.plugin.settings.timelineEras || [];
            const visibleEras = eras.filter(era => era.visible !== false);

            visibleEras.forEach((era, index) => {
                if (!era.startDate || !era.endDate) return;

                const eraStartParsed = parseEventDate(era.startDate, { referenceDate });
                const eraEndParsed = parseEventDate(era.endDate, { referenceDate });
                
                const eraStartMs = toMillis(eraStartParsed?.start);
                const eraEndMs = toMillis(eraEndParsed?.start);

                if (eraStartMs == null || eraEndMs == null) return;

                // Create background item for the era
                items.add({
                    id: `era-${era.id}`,
                    content: era.name,
                    start: new Date(eraStartMs),
                    end: new Date(eraEndMs),
                    type: 'background',
                    className: 'timeline-era-background',
                    style: era.color 
                        ? `background-color: ${era.color}; opacity: 0.3;`
                        : `background-color: ${this.palette[index % this.palette.length]}; opacity: 0.2;`
                });
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

        // Fork filter
        const eventIdentifier = evt.id || evt.name;
        if (this.filters.forkId) {
            // Viewing a specific fork - only show events in that fork
            const fork = this.plugin.getTimelineFork(this.filters.forkId);
            if (fork) {
                const isInFork = fork.forkEvents?.includes(eventIdentifier);
                if (!isInFork) return false;
            }
        } else {
            // Main timeline - exclude events that belong to any fork
            const allForks = this.plugin.getTimelineForks();
            const isInAnyFork = allForks.some(fork => 
                fork.forkEvents?.includes(eventIdentifier)
            );
            if (isInAnyFork) return false;
        }

        return true;
    }

    /**
     * Resolve a location ID or name to its display name
     */
    private resolveLocationName(locationValue: string): string {
        // First, try to find by ID
        const locationById = this.locations.find(loc => loc.id === locationValue);
        if (locationById) {
            return locationById.name;
        }
        // If not found by ID, try to find by name (in case it's already a name)
        const locationByName = this.locations.find(loc => loc.name === locationValue);
        if (locationByName) {
            return locationByName.name;
        }
        // Return original value if no match found
        return locationValue;
    }

    /**
     * Make tooltip for event
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private makeTooltip(evt: Event, parsed: any, conflicts: DetectedConflict[] = []): string {
        const parts: string[] = [evt.name || '(Untitled Event)'];
        const dt = parsed?.start ? toDisplay(parsed.start, undefined, parsed.isBCE, parsed.originalYear) : (evt.dateTime || '');
        if (dt) parts.push(dt);
        if (evt.location) parts.push(`@ ${this.resolveLocationName(evt.location)}`);
        if (evt.description) parts.push(evt.description.length > 120 ? evt.description.slice(0, 120) + '…' : evt.description);

        // Add conflict information
        if (conflicts.length > 0) {
            const errors = conflicts.filter(c => c.severity === 'error');
            const warnings = conflicts.filter(c => c.severity === 'warning');

            if (errors.length > 0) {
                parts.push('');
                parts.push(`⚠️ ${errors.length} ERROR(S):`);
                errors.slice(0, 3).forEach(c => parts.push(`  • ${c.message}`));
                if (errors.length > 3) parts.push(`  ... and ${errors.length - 3} more`);
            }

            if (warnings.length > 0) {
                parts.push('');
                parts.push(`⚠ ${warnings.length} WARNING(S):`);
                warnings.slice(0, 3).forEach(c => parts.push(`  • ${c.message}`));
                if (warnings.length > 3) parts.push(`  ... and ${warnings.length - 3} more`);
            }
        }

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

    /**
     * Render narrative connector lines between events and their frame events
     */
    private renderNarrativeConnectors(): void {
        if (!this.timeline) return;

        // Remove existing connectors if any
        const existingConnectors = this.container.querySelectorAll('.narrative-connector-svg');
        existingConnectors.forEach(el => el.remove());

        // Find all events with frame event references
        const connectors: Array<{ fromIdx: number; toIdx: number; type: 'flashback' | 'flashforward' }> = [];

        this.events.forEach((evt, idx) => {
            if (!this.shouldIncludeEvent(evt)) return;

            const markers = evt.narrativeMarkers;
            if (!markers || !markers.targetEvent) return;

            // Find the frame event index
            const frameIdx = this.events.findIndex(e =>
                this.sanitizeEventId(e.name) === this.sanitizeEventId(markers.targetEvent || '')
            );

            if (frameIdx === -1) return;
            if (!this.shouldIncludeEvent(this.events[frameIdx])) return;

            const type = markers.isFlashback ? 'flashback' : markers.isFlashforward ? 'flashforward' : null;
            if (type) {
                connectors.push({ fromIdx: idx, toIdx: frameIdx, type });
            }
        });

        if (connectors.length === 0) return;

        // Create SVG overlay
        const timelineContent = this.container.querySelector('.vis-timeline') as HTMLElement;
        if (!timelineContent) return;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('narrative-connector-svg');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '1';
        timelineContent.appendChild(svg);

        // Draw connectors
        connectors.forEach(({ fromIdx, toIdx, type }) => {
            const fromEl = this.container.querySelector(`[data-id="${fromIdx}"]`) as HTMLElement;
            const toEl = this.container.querySelector(`[data-id="${toIdx}"]`) as HTMLElement;

            if (!fromEl || !toEl) return;

            // Get positions
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const containerRect = timelineContent.getBoundingClientRect();

            const x1 = fromRect.left - containerRect.left + fromRect.width / 2;
            const y1 = fromRect.top - containerRect.top + fromRect.height / 2;
            const x2 = toRect.left - containerRect.left + toRect.width / 2;
            const y2 = toRect.top - containerRect.top + toRect.height / 2;

            // Create curved path
            const dx = x2 - x1;
            const dy = y2 - y1;
            const curve = Math.abs(dx) * 0.3;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', type === 'flashback' ? '#8B5C2E' : '#2563EB');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-dasharray', '5,5');
            path.setAttribute('opacity', '0.6');
            path.classList.add('narrative-connector-line');

            // Add arrowhead
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            const markerId = `arrow-${type}-${fromIdx}-${toIdx}`;
            marker.setAttribute('id', markerId);
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '10');
            marker.setAttribute('refX', '5');
            marker.setAttribute('refY', '5');
            marker.setAttribute('orient', 'auto');

            const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
            arrowPath.setAttribute('fill', type === 'flashback' ? '#8B5C2E' : '#2563EB');
            marker.appendChild(arrowPath);

            svg.appendChild(marker);
            path.setAttribute('marker-end', `url(#${markerId})`);
            svg.appendChild(path);
        });
    }
}
