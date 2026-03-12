// Timeline Renderer - Shared rendering logic for Timeline Modal and Timeline View
// Handles vis-timeline initialization, dataset building, Gantt mode, dependencies, and interactions

import { App, Notice, TFile } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { Event, Location, Scene } from '../types';
import { parseEventDate, toMillis, toDisplay } from './DateParsing';
import { EventModal } from '../modals/EventModal';
import { ConflictDetector, DetectedConflict } from './ConflictDetector';
import { PlatformUtils } from './PlatformUtils';

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
    showProgressBars?: boolean;
    dependencyArrowStyle?: 'solid' | 'dashed' | 'dotted';
    stackEnabled?: boolean;
    density?: number;
    defaultGanttDuration?: number; // days
    editMode?: boolean;
    showEras?: boolean;
    narrativeOrder?: boolean;
    onConflictsDetected?: (conflicts: DetectedConflict[]) => void;
    onEventSelected?: (event: Event | null) => void;
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
    private scenes: Scene[] = [];
    private showScenes = false;
    private watchedNotes: Array<{name: string, date: string, filePath: string}> = [];
    private showWatchedNotes = false;
    private itemIdToEventIndex = new Map<string | number, number>();
    private eventIndexToItemIds = new Map<number, Array<string | number>>();
    private eventIndexToGroupItemIds = new Map<number, Map<string, string | number>>();
    private wheelFallbackHandler: ((event: WheelEvent) => void) | null = null;

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
            showProgressBars: true,
            dependencyArrowStyle: 'solid',
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
        await this.loadOptionalTimelineSources();
        await this.render();
    }

    /**
     * Refresh timeline with latest data
     */
    async refresh(): Promise<void> {
        this.events = await this.plugin.listEvents();
        await this.loadOptionalTimelineSources();
        await this.render();
    }

    /**
     * Load non-critical timeline sources (scenes + watched notes) without breaking core event rendering.
     */
    private async loadOptionalTimelineSources(): Promise<void> {
        try {
            this.scenes = await this.plugin.listScenes();
        } catch (error) {
            this.scenes = [];
            console.warn('Storyteller Suite: Failed to load scenes for timeline. Continuing without scenes.', error);
        }

        try {
            this.watchedNotes = this.scanWatchedNotes();
        } catch (error) {
            this.watchedNotes = [];
            console.warn('Storyteller Suite: Failed to scan watched notes for timeline. Continuing without watched notes.', error);
        }
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
     * Toggle scene items on the timeline
     */
    setShowScenes(val: boolean): void {
        this.showScenes = val;
        this.render();
    }

    /**
     * Toggle watched vault note items on the timeline
     */
    setShowWatchedNotes(val: boolean): void {
        this.showWatchedNotes = val;
        this.render();
    }

    /**
     * Scan vault for notes matching the configured watch property or tag
     */
    private scanWatchedNotes(): Array<{name: string, date: string, filePath: string}> {
        const prop = this.plugin.settings.timelineWatchProperty || 'timeline-date';
        const tag = (this.plugin.settings.timelineWatchTag || 'timeline').replace(/^#/, '');
        const results: Array<{name: string, date: string, filePath: string}> = [];
        for (const file of this.app.vault.getMarkdownFiles()) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;
            const fm = cache.frontmatter;
            const dateVal = fm?.[prop];
            const hasProp = dateVal && typeof dateVal === 'string';
            const hasTag = cache.tags?.some(t => t.tag === '#' + tag);
            if (hasProp) {
                results.push({
                    name: fm?.title || file.basename,
                    date: dateVal as string,
                    filePath: file.path
                });
            } else if (hasTag && fm?.date && typeof fm.date === 'string') {
                results.push({
                    name: fm?.title || file.basename,
                    date: fm.date as string,
                    filePath: file.path
                });
            }
        }
        return results;
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

    private registerEventItem(itemId: string | number, eventIndex: number, groupId?: string): void {
        this.itemIdToEventIndex.set(itemId, eventIndex);
        const ids = this.eventIndexToItemIds.get(eventIndex) || [];
        ids.push(itemId);
        this.eventIndexToItemIds.set(eventIndex, ids);
        if (groupId) {
            const grouped = this.eventIndexToGroupItemIds.get(eventIndex) || new Map<string, string | number>();
            grouped.set(groupId, itemId);
            this.eventIndexToGroupItemIds.set(eventIndex, grouped);
        }
    }

    private resolveEventIndexFromItemId(itemId: unknown): number | null {
        if (typeof itemId !== 'string' && typeof itemId !== 'number') return null;
        const mapped = this.itemIdToEventIndex.get(itemId);
        return typeof mapped === 'number' ? mapped : null;
    }

    private findEventIndex(event: Event): number {
        return this.events.findIndex((candidate) =>
            candidate === event
            || (event.id != null && candidate.id === event.id)
            || (
                (candidate.name || '') === (event.name || '')
                && (candidate.dateTime || '') === (event.dateTime || '')
                && (candidate.location || '') === (event.location || '')
            )
        );
    }

    private buildEventSearchText(evt: Event): string {
        return [
            evt.name || '',
            evt.dateTime || '',
            evt.location || '',
            ...(evt.characters || []),
            ...(evt.groups || []),
            ...(evt.tags || [])
        ].join(' ').toLowerCase();
    }

    private scoreEventQuery(evt: Event, q: string): number {
        const name = (evt.name || '').toLowerCase();
        const hay = this.buildEventSearchText(evt);
        if (!hay.includes(q)) return -1;
        if (name === q) return 1000;
        if (name.startsWith(q)) return 800;
        if (name.includes(q)) return 500;
        return 100;
    }

    /**
     * Get currently visible events with active filters applied and sorted by date
     */
    getVisibleEvents(): Event[] {
        const referenceDate = this.plugin.getReferenceTodayDate();
        return this.events
            .filter(evt => this.shouldIncludeEvent(evt))
            .slice()
            .sort((a, b) => {
                const da = a.dateTime ? parseEventDate(a.dateTime, { referenceDate }) : null;
                const db = b.dateTime ? parseEventDate(b.dateTime, { referenceDate }) : null;
                const ma = toMillis(da?.start);
                const mb = toMillis(db?.start);
                if (ma == null && mb == null) return (a.name || '').localeCompare(b.name || '');
                if (ma == null) return 1;
                if (mb == null) return -1;
                return ma - mb;
            });
    }

    searchVisibleEvents(query: string, limit = 12): Event[] {
        const q = (query || '').trim().toLowerCase();
        if (!q) return [];
        return this.getVisibleEvents()
            .map(evt => ({ evt, score: this.scoreEventQuery(evt, q) }))
            .filter(entry => entry.score >= 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(entry => entry.evt);
    }

    /**
     * Focus timeline on a specific event
     */
    focusEvent(event: Event): boolean {
        if (!this.timeline || !event) return false;
        const idx = this.findEventIndex(event);
        if (idx === -1) return false;
        const itemIds = this.eventIndexToItemIds.get(idx) || [idx];

        try {
            this.timeline.setSelection([itemIds[0]], { focus: true, animation: { duration: 220, easingFunction: 'easeInOutQuad' } });
            const parsed = event.dateTime ? parseEventDate(event.dateTime, { referenceDate: this.plugin.getReferenceTodayDate() }) : null;
            const startMs = toMillis(parsed?.start);
            if (startMs != null) {
                this.timeline.moveTo(new Date(startMs), { animation: { duration: 220, easingFunction: 'easeInOutQuad' } });
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Find and focus first visible event matching search query
     */
    focusEventByQuery(query: string): Event | null {
        const match = this.searchVisibleEvents(query, 1)[0];
        if (!match) return null;
        this.focusEvent(match);
        return match;
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
        const timelineEl = this.container.querySelector('.vis-timeline') as HTMLElement | null;
        if (!timelineEl) {
            new Notice('No timeline visible to export.');
            return;
        }
        try {
            // Serialize the timeline DOM to SVG-backed canvas via inline serialization
            const { default: domtoimage } = await import('dom-to-image' as any).catch(() => null) || { default: null };
            if (domtoimage) {
                const dataUrl = format === 'png'
                    ? await domtoimage.toPng(timelineEl)
                    : await domtoimage.toJpeg(timelineEl, { quality: 0.92 });
                this.downloadDataUrl(dataUrl, `timeline.${format}`);
            } else {
                // Fallback: render a clean image via canvas
                await this.exportAsCanvasImage(format);
            }
        } catch {
            await this.exportAsCanvasImage(format);
        }
    }

    private async exportAsCanvasImage(format: 'png' | 'jpg'): Promise<void> {
        const events = this.events
            .filter(e => this.shouldIncludeEvent(e))
            .filter(e => e.dateTime)
            .sort((a, b) => {
                const refDate = this.plugin.getReferenceTodayDate(); const da = a.dateTime ? parseEventDate(a.dateTime, { referenceDate: refDate }) : null;
                const db = b.dateTime ? parseEventDate(b.dateTime, { referenceDate: refDate }) : null;
                return (toMillis(da?.start) || 0) - (toMillis(db?.start) || 0);
            });

        if (events.length === 0) {
            new Notice('No dated events to export.');
            return;
        }

        const W = 1200, ROW = 28, PADDING = 48, LABEL_W = 220;
        const H = PADDING * 2 + events.length * ROW;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;

        // Background
        ctx.fillStyle = format === 'jpg' ? '#1e1e2e' : 'transparent';
        if (format === 'jpg') ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#1e1e2e';
        ctx.fillRect(0, 0, W, H);

        // Title
        ctx.fillStyle = '#cdd6f4';
        ctx.font = 'bold 16px sans-serif';
        const story = this.plugin.getActiveStory();
        ctx.fillText(`${story?.name || 'Story'} — Timeline`, PADDING, 28);

        // Draw events
        events.forEach((evt, i) => {
            const y = PADDING + i * ROW + ROW / 2;
            const color = this.palette[i % this.palette.length];

            // Dot
            ctx.beginPath();
            ctx.arc(LABEL_W + PADDING, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            // Date label
            ctx.fillStyle = '#a6adc8';
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(evt.dateTime || '', LABEL_W + PADDING - 12, y + 4);

            // Event name
            ctx.fillStyle = '#cdd6f4';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(evt.name, LABEL_W + PADDING + 14, y + 4);
        });

        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        this.downloadDataUrl(canvas.toDataURL(mimeType, 0.92), `timeline.${format}`);
    }

    private downloadDataUrl(dataUrl: string, filename: string): void {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        a.click();
        new Notice(`Timeline exported as ${filename}`);
    }

    async exportAsCsv(): Promise<void> {
        const events = this.events
            .filter(e => this.shouldIncludeEvent(e))
            .sort((a, b) => {
                const refDate = this.plugin.getReferenceTodayDate(); const da = a.dateTime ? parseEventDate(a.dateTime, { referenceDate: refDate }) : null;
                const db = b.dateTime ? parseEventDate(b.dateTime, { referenceDate: refDate }) : null;
                return (toMillis(da?.start) || 0) - (toMillis(db?.start) || 0);
            });

        const escape = (s?: string) => `"${(s || '').replace(/"/g, '""')}"`;
        const rows = [
            ['Name', 'Date', 'Status', 'Location', 'Characters', 'Description'].map(escape).join(','),
            ...events.map(e => [
                escape(e.name),
                escape(e.dateTime),
                escape(e.status),
                escape(e.location),
                escape((e.characters || []).join('; ')),
                escape(e.description)
            ].join(','))
        ];

        const story = this.plugin.getActiveStory();
        const fileName = `${story?.name || 'timeline'}-events.csv`;
        const folderPath = story ? this.plugin.getEntityFolder('event') : 'StorytellerSuite';
        const filePath = `${folderPath}/${fileName}`;

        try {
            const existing = this.app.vault.getAbstractFileByPath(filePath);
            const content = rows.join('\n');
            if (existing) {
                if (existing instanceof TFile) await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(filePath, content);
            }
            new Notice(`Timeline exported to ${filePath}`);
        } catch (e) {
            new Notice('Failed to write CSV export.');
            console.error('[TimelineRenderer] CSV export error:', e);
        }
    }

    async exportAsJson(): Promise<void> {
        const events = this.events
            .filter(e => this.shouldIncludeEvent(e))
            .sort((a, b) => {
                const refDate = this.plugin.getReferenceTodayDate(); const da = a.dateTime ? parseEventDate(a.dateTime, { referenceDate: refDate }) : null;
                const db = b.dateTime ? parseEventDate(b.dateTime, { referenceDate: refDate }) : null;
                return (toMillis(da?.start) || 0) - (toMillis(db?.start) || 0);
            })
            .map(e => ({
                name: e.name,
                date: e.dateTime,
                status: e.status,
                location: e.location,
                characters: e.characters || [],
                description: e.description,
                outcome: e.outcome
            }));

        const story = this.plugin.getActiveStory();
        const fileName = `${story?.name || 'timeline'}-events.json`;
        const folderPath = story ? this.plugin.getEntityFolder('event') : 'StorytellerSuite';
        const filePath = `${folderPath}/${fileName}`;

        try {
            const existing = this.app.vault.getAbstractFileByPath(filePath);
            const content = JSON.stringify({ story: story?.name, exportedAt: new Date().toISOString(), events }, null, 2);
            if (existing) {
                if (existing instanceof TFile) await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(filePath, content);
            }
            new Notice(`Timeline exported to ${filePath}`);
        } catch (e) {
            new Notice('Failed to write JSON export.');
            console.error('[TimelineRenderer] JSON export error:', e);
        }
    }

    async exportAsMarkdown(): Promise<void> {
        const events = this.events
            .filter(e => this.shouldIncludeEvent(e))
            .sort((a, b) => {
                const refDate = this.plugin.getReferenceTodayDate(); const da = a.dateTime ? parseEventDate(a.dateTime, { referenceDate: refDate }) : null;
                const db = b.dateTime ? parseEventDate(b.dateTime, { referenceDate: refDate }) : null;
                return (toMillis(da?.start) || 0) - (toMillis(db?.start) || 0);
            });

        const story = this.plugin.getActiveStory();
        const lines: string[] = [
            `# ${story?.name || 'Story'} — Timeline`,
            `> Exported ${new Date().toLocaleDateString()}`,
            '',
            '| Date | Event | Status | Location | Characters |',
            '|------|-------|--------|----------|------------|',
            ...events.map(e =>
                `| ${e.dateTime || '—'} | ${e.name} | ${e.status || '—'} | ${e.location || '—'} | ${(e.characters || []).join(', ') || '—'} |`
            ),
            ''
        ];

        const fileName = `${story?.name || 'timeline'}-timeline.md`;
        const folderPath = story ? this.plugin.getEntityFolder('event') : 'StorytellerSuite';
        const filePath = `${folderPath}/${fileName}`;

        try {
            const existing = this.app.vault.getAbstractFileByPath(filePath);
            const content = lines.join('\n');
            if (existing) {
                if (existing instanceof TFile) await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(filePath, content);
            }
            new Notice(`Timeline exported to ${filePath}`);
        } catch (e) {
            new Notice('Failed to write Markdown export.');
            console.error('[TimelineRenderer] Markdown export error:', e);
        }
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
        if (this.wheelFallbackHandler) {
            this.container.removeEventListener('wheel', this.wheelFallbackHandler);
            this.wheelFallbackHandler = null;
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
     * Main rendering method with error boundary
     */
    private async render(): Promise<void> {
        try {
            // Clear existing timeline
            this.destroy();
            this.container.classList.add('storyteller-timeline-container');
            this.container.classList.toggle('sts-gantt-mode', !!this.options.ganttMode);
            this.container.classList.toggle('sts-timeline-mode', !this.options.ganttMode);

            const referenceDate = this.plugin.getReferenceTodayDate();
            const build = this.buildDatasets(referenceDate);
            const items = build.items;
            const groups = build.groups;
            const hasGroups = !!groups && (
                (typeof (groups as any).length === 'number' && (groups as any).length > 0) ||
                (typeof (groups as any).getIds === 'function' && (groups as any).getIds().length > 0)
            );

            // Timeline options
            // Modern spacing: give items plenty of breathing room vertically
            const grouped = !!(this.options.groupMode && this.options.groupMode !== 'none' && hasGroups);
            const baseMargin = this.options.ganttMode ? 10 : 8;
            const itemMargin = {
                horizontal: this.options.ganttMode ? 10 : 12,
                vertical: baseMargin + Math.round((this.options.density || 50) / 8)
            };
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

            const showProgressBars = this.options.ganttMode && this.options.showProgressBars !== false;
            const useNativeMobileScroll = PlatformUtils.shouldUseSimplifiedUI();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const timelineOptions: any = {
                stack: grouped ? true : this.options.stackEnabled,
                stackSubgroups: true,
                margin: { item: itemMargin, axis: 32 },
                zoomable: true,
                zoomFriction: 10,
                zoomKey: 'ctrlKey',
                horizontalScroll: true,
                // In grouped mode, require Shift for horizontal wheel panning so
                // vertical lane scrolling does not intermittently win wheel events.
                horizontalScrollKey: grouped && !useNativeMobileScroll ? 'shiftKey' : undefined,
                verticalScroll: grouped && !useNativeMobileScroll,
                verticalScrollSticky: false,
                // Keep rows in vis-timeline's native auto mode to avoid
                // horizontal-scroll desync where box/point stems can mis-anchor.
                groupHeightMode: 'auto',
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
                visibleFrameTemplate: function() {
                    return '';
                }
            };

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
                    const eventIndex = this.resolveEventIndexFromItemId(item.id);
                    if (eventIndex == null) {
                        callback(null); // Cancel move if event not found
                        return;
                    }
                    const event = this.events[eventIndex];
                    if (!event) {
                        callback(null);
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

            // Create timeline with error handling (retry with safe options if advanced options fail)
            try {
                this.timeline = groups 
                    ? new Timeline(this.container, items, groups, timelineOptions)
                    : new Timeline(this.container, items, timelineOptions);
            } catch (timelineError) {
                console.warn('Storyteller Suite: Primary vis-timeline options failed, retrying with safe options.', timelineError);
                try {
                    const safeOptions = {
                        ...timelineOptions,
                        verticalScroll: undefined,
                        verticalScrollSticky: undefined,
                        groupHeightMode: undefined,
                        stackSubgroups: undefined
                    };
                    this.timeline = groups
                        ? new Timeline(this.container, items, groups, safeOptions)
                        : new Timeline(this.container, items, safeOptions);
                } catch (safeError) {
                    console.error('Storyteller Suite: Error creating vis-timeline (safe fallback failed):', safeError);
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
            }

            this.installWheelFallback(grouped);

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
                    const idx = this.resolveEventIndexFromItemId(props.item);
                    if (idx == null) return;
                    const event = this.events[idx];
                    new EventModal(this.app, this.plugin, event, async (updatedData: Event) => {
                        await this.plugin.saveEvent(updatedData);
                        new Notice(`Event "${updatedData.name}" updated`);
                        await this.refresh();
                    }).open();
                }
            });

            // Handle selection for synchronized list/search UX
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.timeline.on('select', (props: any) => {
                try {
                    const selectedId = Array.isArray(props?.items) ? props.items[0] : undefined;
                    const selectedIdx = this.resolveEventIndexFromItemId(selectedId);
                    if (selectedIdx != null) {
                        const selected = this.events[selectedIdx] || null;
                        this.options.onEventSelected?.(selected);
                    } else {
                        this.options.onEventSelected?.(null);
                    }
                } catch {
                    this.options.onEventSelected?.(null);
                }
            });

            // Grouped timelines can drift a frame during horizontal pan/scroll.
            // Force a lightweight redraw after range changes so stems/boxes remain anchored.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.timeline.on('rangechanged', (_props: any) => {
                if (!grouped) return;
                window.requestAnimationFrame(() => {
                    try {
                        this.timeline?.redraw?.();
                    } catch {
                        // Non-fatal
                    }
                });
            });

            // Render dependency arrows in Gantt mode
            if (this.options.ganttMode && this.options.showDependencies) {
                try {
                    const arrowSpecs = this.buildDependencyArrows();
                    if (arrowSpecs.length > 0) {
                        const arrowOptions = {
                            followRelationships: true,
                            color: this.getDependencyArrowColor(),
                            strokeWidth: 2.75,
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

    private installWheelFallback(grouped: boolean): void {
        if (PlatformUtils.isMobile() || !this.timeline) return;

        this.wheelFallbackHandler = (event: WheelEvent) => {
            if (!this.timeline || event.defaultPrevented || event.ctrlKey || event.metaKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, button, a[href]')) return;

            const delta = this.normalizeWheelDelta(event);
            const horizontalIntent = Math.abs(delta.x) > Math.abs(delta.y) || event.shiftKey;

            if (grouped && !horizontalIntent && this.applyVerticalWheelFallback(delta.y, event)) {
                return;
            }

            this.applyHorizontalWheelFallback(horizontalIntent ? (Math.abs(delta.x) > Math.abs(delta.y) ? delta.x : delta.y) : delta.y, event);
        };

        this.container.addEventListener('wheel', this.wheelFallbackHandler, { passive: false });
    }

    private normalizeWheelDelta(event: WheelEvent): { x: number; y: number } {
        const LINE_HEIGHT = 40;
        const PAGE_HEIGHT = 800;
        let scale = 1;
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
            scale = LINE_HEIGHT;
        } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
            scale = PAGE_HEIGHT;
        }
        return {
            x: event.deltaX * scale,
            y: event.deltaY * scale
        };
    }

    private applyVerticalWheelFallback(deltaY: number, event: WheelEvent): boolean {
        if (!deltaY || !this.timeline) return false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const timelineAny = this.timeline as any;
        if (typeof timelineAny._getScrollTop === 'function' && typeof timelineAny._setScrollTop === 'function') {
            const current = timelineAny._getScrollTop();
            const next = timelineAny._setScrollTop(current + deltaY);
            if (next !== current) {
                timelineAny._redraw?.();
                event.preventDefault();
                return true;
            }
        }

        const leftPanel = this.container.querySelector('.vis-panel.vis-left') as HTMLElement | null;
        const scrollHost = leftPanel?.parentElement as HTMLElement | null;
        if (!scrollHost) return false;

        const before = scrollHost.scrollTop;
        scrollHost.scrollTop += deltaY;
        if (scrollHost.scrollTop !== before) {
            event.preventDefault();
            return true;
        }

        return false;
    }

    private applyHorizontalWheelFallback(delta: number, event: WheelEvent): boolean {
        if (!delta || !this.timeline) return false;

        const range = this.getVisibleRange();
        if (!range) return false;

        const span = range.end.getTime() - range.start.getTime();
        if (!Number.isFinite(span) || span <= 0) return false;

        const diff = (delta * span) / 2400;
        if (!Number.isFinite(diff) || diff === 0) return false;

        try {
            this.timeline.setWindow(
                new Date(range.start.getTime() + diff),
                new Date(range.end.getTime() + diff),
                { animation: false }
            );
            event.preventDefault();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create a styled DOM element for group labels (sidebar chips)
     */
    private createGroupLabel(text: string, color: string): HTMLElement {
        const el = document.createElement('div');
        el.className = 'sts-group-chip';
        el.innerText = text;
        el.style.backgroundColor = this.hexWithAlpha(color, 0.15);
        el.style.color = color;
        el.style.borderColor = this.hexWithAlpha(color, 0.4);
        return el;
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
        this.itemIdToEventIndex.clear();
        this.eventIndexToItemIds.clear();
        this.eventIndexToGroupItemIds.clear();

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
        const groupDefinitions = new Map<string, { id: string; label: string; color: string; content: HTMLElement }>();
        const usedGroupIds = new Set<string>();
        const registerGroup = (id: string, label: string, color: string) => {
            keyToColor.set(id, color);
            keyToLabel.set(id, label);
            groupDefinitions.set(id, {
                id,
                label,
                color,
                content: this.createGroupLabel(label, color)
            });
        };

        if (this.options.groupMode !== 'none') {
            if (this.options.groupMode === 'group') {
                const groups = this.plugin.getGroups();
                groups.forEach((g, i) => {
                    const color = g.color || this.palette[i % this.palette.length];
                    registerGroup(g.id, g.name, color);
                });
                const noneColor = '#64748B';
                registerGroup('__ungrouped__', 'Ungrouped', noneColor);
            } else if (this.options.groupMode === 'location') {
                const uniqueLocations = Array.from(new Set(this.events.map(e => e.location || 'Unspecified')));
                uniqueLocations.forEach((loc, i) => {
                    const id = loc || 'Unspecified';
                    // Resolve location ID to display name
                    const displayName = id === 'Unspecified' ? 'Unspecified' : this.resolveLocationName(id);
                    const color = this.palette[i % this.palette.length];
                    registerGroup(id, displayName, color);
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
                    registerGroup(char, char, color);
                });
                const noneColor = '#64748B';
                registerGroup('__unassigned__', 'No character', noneColor);
            } else if (this.options.groupMode === 'track') {
                const tracks = this.plugin.settings.timelineTracks || [];
                const visibleTracks = tracks.filter(t => t.visible !== false);

                visibleTracks.forEach((track, i) => {
                    const color = track.color || this.palette[i % this.palette.length];
                    registerGroup(track.id, track.name, color);
                });

                // Add a default track for unassigned events
                const defaultColor = '#64748B';
                registerGroup('__no_track__', 'Unassigned', defaultColor);
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
            let baseGroupId: string | undefined;
            let baseColor: string | undefined;
            if (this.options.groupMode === 'group') {
                baseGroupId = (evt.groups && evt.groups.length > 0) ? evt.groups[0] : '__ungrouped__';
                baseColor = keyToColor.get(baseGroupId);
            } else if (this.options.groupMode === 'location') {
                baseGroupId = evt.location || 'Unspecified';
                baseColor = keyToColor.get(baseGroupId);
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

                baseGroupId = matchingTrack ? matchingTrack.id : '__no_track__';
                baseColor = keyToColor.get(baseGroupId);
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
            const statusSlug = (evt.status || '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            if (statusSlug) classes.push(`sts-status-${statusSlug}`);

            // Detect narrative markers (flashback/flash-forward)
            const isFlashback = evt.narrativeMarkers?.isFlashback || false;
            const isFlashforward = evt.narrativeMarkers?.isFlashforward || false;

            if (isFlashback) classes.push('narrative-flashback');
            if (isFlashforward) classes.push('narrative-flashforward');
            if (isFlashback || isFlashforward) classes.push('timeline-has-narrative-flag');
            if (isMilestone && isFlashback) classes.push('timeline-milestone-flashback');
            if (isMilestone && isFlashforward) classes.push('timeline-milestone-flashforward');

            // Check for conflicts
            const eventConflicts = conflictsByEvent.get(evt.name) || [];
            const hasConflicts = eventConflicts.length > 0;
            const hasErrors = eventConflicts.some(c => c.severity === 'error');
            const hasWarnings = eventConflicts.some(c => c.severity === 'warning');

            // Add narrative sequence number when in narrative order mode
            // Safeguard: ensure content is never empty - use fallback if name is missing or whitespace-only
            const eventName = (evt.name?.trim() || '(Untitled Event)');
            let contentText = eventName;
            
            if (!evt.name?.trim()) {
                console.warn(`Storyteller Suite: Event at index ${originalIdx} has no name. File: ${evt.filePath || 'unknown'}`);
            }
            if (this.narrativeOrder && evt.narrativeSequence !== undefined) {
                contentText = `[${evt.narrativeSequence}] ${contentText}`;
                classes.push('has-narrative-sequence');
            }

            // Determine text marker for compatibility across vis-timeline versions
            const markerParts: string[] = [];
            if (hasErrors) {
                markerParts.push('!!');
                classes.push('has-conflict-error');
            } else if (hasWarnings) {
                markerParts.push('!');
                classes.push('has-conflict-warning');
            }
            if (isMilestone) markerParts.push('\u2605');
            if (isFlashback) markerParts.push('\u21b6');
            if (isFlashforward) markerParts.push('\u21b7');
            const marker = markerParts.length > 0 ? `${markerParts.join(' ')} ` : '';
            const itemContent = `${marker}${contentText}`.trim();

            // Item type - determines how item renders
            // In Gantt mode: use 'range' for all items (including milestones) to avoid stems/dots
            // In Timeline mode: use box for instant events (keeps stem support) and range when an end date exists
            let itemType: string;
            if (this.options.ganttMode) {
                itemType = 'range';
            } else {
                itemType = displayEndMs != null ? 'range' : 'box';
            }

            // Character-group mode: replicate multi-character events into each matching lane.
            const groupTargets: Array<{ id?: string; color?: string; label?: string }> = [];
            if (this.options.groupMode === 'character') {
                const uniqueChars = Array.from(new Set(
                    (evt.characters || [])
                        .map(c => (c || '').trim())
                        .filter(c => c.length > 0)
                ));
                const characterGroupIds = uniqueChars.length > 0 ? uniqueChars : ['__unassigned__'];
                characterGroupIds.forEach(charId => {
                    groupTargets.push({
                        id: charId,
                        color: keyToColor.get(charId),
                        label: keyToLabel.get(charId) || charId
                    });
                });
            } else {
                groupTargets.push({
                    id: baseGroupId,
                    color: baseColor,
                    label: baseGroupId ? (keyToLabel.get(baseGroupId) || baseGroupId) : undefined
                });
            }

            groupTargets.forEach((target, targetIdx) => {
                if (target.id) usedGroupIds.add(target.id);

                const itemId: string | number = targetIdx === 0
                    ? originalIdx
                    : `${originalIdx}::char::${this.sanitizeEventId(target.id || 'group')}:${targetIdx}`;

                // Use a more opaque group background so stem lines behind cards
                // do not bleed through and look visually detached in grouped mode.
                const groupBgAlpha = isMilestone ? 0.82 : 0.9;
                let style = target.color
                    ? `--sts-group-color:${target.color};--sts-group-bg:${this.hexWithAlpha(target.color, groupBgAlpha)};background-color:${this.hexWithAlpha(target.color, groupBgAlpha)};border-color:${target.color};`
                    : '';

                const laneContent = (
                    this.options.groupMode === 'character' && groupTargets.length > 1 && target.label
                ) ? `${itemContent} [${target.label}]` : itemContent;
                const shouldRenderProgress = this.options.ganttMode && this.options.showProgressBars !== false;
                const progressValue = Number(evt.progress ?? 0);
                const clampedProgress = Number.isFinite(progressValue)
                    ? Math.max(0, Math.min(100, progressValue))
                    : 0;
                const laneContentHtml = this.options.ganttMode
                    ? `<span class="timeline-item-label">${this.escapeHtml(laneContent)}</span>`
                    : this.escapeHtml(laneContent);
                if (this.options.ganttMode && shouldRenderProgress && clampedProgress > 0) {
                    classes.push('has-progress');
                    style += `--sts-progress:${clampedProgress}%;`;
                }

                items.add({
                    id: itemId,
                    content: laneContentHtml,
                    start: new Date(startMs),
                    end: displayEndMs != null ? new Date(displayEndMs) : undefined,
                    title: this.makeTooltip(evt, parsed, eventConflicts),
                    type: itemType,
                    className: classes.length > 0 ? classes.join(' ') : undefined,
                    group: target.id,
                    style,
                    progress: clampedProgress
                });
                this.registerEventItem(itemId, originalIdx, target.id);
            });
        });

        // Add scene items when showScenes is enabled
        if (this.showScenes) {
            const referenceDate2 = referenceDate;
            this.scenes.forEach((scene, sceneIdx) => {
                if (!scene.date) return;
                const parsed = parseEventDate(scene.date, { referenceDate: referenceDate2 });
                const startMs = toMillis(parsed?.start);
                if (startMs == null) return;

                items.add({
                    id: `scene-${scene.id || scene.filePath || scene.name || sceneIdx}`,
                    content: `SCN ${scene.name || '(Untitled Scene)'}`,
                    start: new Date(startMs),
                    className: 'storyteller-timeline-scene',
                    type: 'point'
                });
            });
        }

        // Add watched vault note items when showWatchedNotes is enabled
        if (this.showWatchedNotes) {
            const referenceDate3 = referenceDate;
            this.watchedNotes.forEach((note, noteIdx) => {
                const parsed = parseEventDate(note.date, { referenceDate: referenceDate3 });
                const startMs = toMillis(parsed?.start);
                if (startMs == null) return;

                items.add({
                    id: `note-${note.filePath || noteIdx}`,
                    content: `NOTE ${note.name || '(Untitled Note)'}`,
                    start: new Date(startMs),
                    className: 'storyteller-timeline-note',
                    type: 'point'
                });
            });
        }

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

        // Only keep groups that have at least one visible/renderable event item.
        if (this.options.groupMode !== 'none') {
            const activeGroups = Array.from(groupDefinitions.values())
                .filter(group => usedGroupIds.has(group.id));

            if (activeGroups.length > 0) {
                groupsDS = new DataSet();
                legend.length = 0;
                activeGroups.forEach(group => {
                    groupsDS!.add({ id: group.id, content: group.content });
                    legend.push({ key: group.id, label: group.label, color: group.color });
                });
            } else {
                groupsDS = undefined;
                legend.length = 0;
            }
        }

        return { items, groups: groupsDS, legend };
    }

    /**
     * Build dependency arrow specifications
     * Validates dependency IDs and logs warnings for missing dependencies
     */
    private buildDependencyArrows(): Array<{
        id: string;
        id_item_1: string | number;
        id_item_2: string | number;
        title?: string;
        color?: string;
        line?: number;
        type?: number;
        track?: number;
    }> {
        const arrows: Array<{
            id: string;
            id_item_1: string | number;
            id_item_2: string | number;
            title?: string;
            color?: string;
            line?: number;
            type?: number;
            track?: number;
        }> = [];
        let arrowId = 0;

        const arrowLineType = this.getDependencyArrowLineType();
        const arrowColor = this.getDependencyArrowColor();
        const eventIdToIndex = new Map<string, number>();
        const eventNameToIndex = new Map<string, number>();
        const eventLowerNameToIndex = new Map<string, number>();

        this.events.forEach((event, index) => {
            const eventId = typeof event.id === 'string' ? event.id.trim() : '';
            const eventName = typeof event.name === 'string' ? event.name.trim() : '';
            if (eventId) eventIdToIndex.set(eventId, index);
            if (eventName && !eventNameToIndex.has(eventName)) eventNameToIndex.set(eventName, index);
            if (eventName) {
                const lowerName = eventName.toLowerCase();
                if (!eventLowerNameToIndex.has(lowerName)) eventLowerNameToIndex.set(lowerName, index);
            }
        });

        const resolveDependencyIndex = (dependencyRef: string): number | null => {
            const trimmed = String(dependencyRef ?? '').trim();
            if (!trimmed) return null;
            if (eventIdToIndex.has(trimmed)) return eventIdToIndex.get(trimmed) ?? null;
            if (eventNameToIndex.has(trimmed)) return eventNameToIndex.get(trimmed) ?? null;
            return eventLowerNameToIndex.get(trimmed.toLowerCase()) ?? null;
        };

        this.events.forEach((evt, targetIdx) => {
            if (!evt.dependencies || evt.dependencies.length === 0) return;
            if (!this.shouldIncludeEvent(evt)) return;

            evt.dependencies.forEach((dependencyRef, dependencyIndex) => {
                const sourceIdx = resolveDependencyIndex(dependencyRef);
                const dependencyLabel = evt.dependencyNames?.[dependencyIndex]
                    || this.events[sourceIdx ?? -1]?.name
                    || dependencyRef;

                if (sourceIdx == null || sourceIdx < 0) {
                    console.warn(`Storyteller Suite: Dependency "${dependencyLabel}" not found for event "${evt.name}". Arrow will not be rendered.`);
                    return;
                }

                if (!this.shouldIncludeEvent(this.events[sourceIdx])) return;

                const sourceItemIds = this.resolveDependencyItemIds(sourceIdx, targetIdx);
                const targetItemIds = this.resolveDependencyItemIds(targetIdx, sourceIdx);
                const pairCount = Math.min(sourceItemIds.length, targetItemIds.length);
                if (pairCount === 0) return;

                for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
                    arrows.push({
                        id: `arrow_${arrowId++}`,
                        id_item_1: sourceItemIds[pairIndex],
                        id_item_2: targetItemIds[pairIndex],
                        title: `${dependencyLabel} -> ${evt.name}`,
                        color: arrowColor,
                        line: arrowLineType,
                        type: 3,
                        track: dependencyIndex + pairIndex
                    });
                }
            });
        });

        return arrows;
    }

    private getDependencyArrowLineType(): number {
        const style = this.options.dependencyArrowStyle ?? 'solid';
        if (style === 'dashed') return 1;
        if (style === 'dotted') return 2;
        return 0;
    }

    private getDependencyArrowColor(): string {
        const computed = window.getComputedStyle(this.container);
        const colorCandidates = [
            computed.getPropertyValue('--interactive-accent').trim(),
            computed.getPropertyValue('--color-accent').trim(),
            computed.getPropertyValue('--text-accent').trim(),
            typeof computed.color === 'string' ? computed.color.trim() : ''
        ];

        return colorCandidates.find(color => color.length > 0) || '#7cb3ff';
    }

    private resolveDependencyItemIds(eventIndex: number, otherEventIndex: number): Array<string | number> {
        const itemIds = this.eventIndexToItemIds.get(eventIndex) || [];
        if (itemIds.length <= 1 || this.options.groupMode !== 'character') {
            return itemIds.slice(0, 1);
        }

        const event = this.events[eventIndex];
        const otherEvent = this.events[otherEventIndex];
        const eventGroups = this.eventIndexToGroupItemIds.get(eventIndex) || new Map<string, string | number>();
        const otherGroups = this.eventIndexToGroupItemIds.get(otherEventIndex) || new Map<string, string | number>();
        const otherCharacters = new Set(this.getCharacterLaneKeys(otherEvent));
        const sharedLanes = this.getCharacterLaneKeys(event)
            .filter(characterId => otherCharacters.has(characterId))
            .sort((a, b) => a.localeCompare(b));

        if (sharedLanes.length > 0) {
            return sharedLanes
                .map(characterId => eventGroups.get(characterId))
                .filter((itemId): itemId is string | number => itemId !== undefined);
        }

        const fallbackLaneOrder = Array.from(eventGroups.keys());
        if (fallbackLaneOrder.length > 0) {
            const preferredLane = fallbackLaneOrder.find(characterId => !otherGroups.has(characterId)) ?? fallbackLaneOrder[0];
            const itemId = eventGroups.get(preferredLane);
            return itemId === undefined ? [] : [itemId];
        }

        return itemIds.slice(0, 1);
    }

    private getCharacterLaneKeys(event?: Event): string[] {
        if (!event || !Array.isArray(event.characters) || event.characters.length === 0) {
            return ['__unassigned__'];
        }

        return Array.from(new Set(
            event.characters
                .map(character => String(character ?? '').trim())
                .filter(character => character.length > 0)
        ));
    }

    private escapeHtml(value: string): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

        // Tag filter
        if (this.filters.tags && this.filters.tags.size > 0) {
            const hasMatchingTag = evt.tags?.some(t => this.filters.tags && this.filters.tags.has(t));
            if (!hasMatchingTag) return false;
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



