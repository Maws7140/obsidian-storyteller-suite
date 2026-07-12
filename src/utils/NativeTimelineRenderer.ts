import { App, Notice, TFile } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import type { Event, Location, Scene, TimelineFork, TimelineTrack } from '../types';
import { EventModal } from '../modals/EventModal';
import { parseEventDate, toMillis } from './DateParsing';
import type { DetectedConflict } from './ConflictDetector';
import { ConflictDetector } from './ConflictDetector';
import { CalendarRegistry } from '../calendar/CalendarRegistry';
import { GREGORIAN_CALENDAR } from '../calendar/builtins';
import { parseToAbsoluteDay, formatAbsoluteDay } from '../calendar/CalendarDateText';
import { toAbsolute } from '../calendar/CalendarEngine';
import { generateTicks } from '../calendar/TimelineAxis';

export interface TimelineRendererOptions {
    ganttMode?: boolean;
    timelineOrientation?: 'horizontal' | 'vertical';
    groupMode?: 'none' | 'location' | 'group' | 'character' | 'track';
    showDependencies?: boolean;
    showProgressBars?: boolean;
    dependencyArrowStyle?: 'solid' | 'dashed' | 'dotted';
    stackEnabled?: boolean;
    density?: number;
    defaultGanttDuration?: number;
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

interface NativeItem {
    id: string;
    event: Event;
    eventIndex: number;
    start: number;
    end: number;
    laneId: string;
    laneLabel: string;
    laneColor: string;
    row: number;
    rect?: DOMRect;
    forkId?: string;
    inherited?: boolean;
}

interface Lane {
    id: string;
    label: string;
    color: string;
    items: NativeItem[];
    top: number;
    height: number;
    branchDepth?: number;
}

const DAY_MS = 86_400_000;
const YEAR_MS = 365.2425 * DAY_MS;
const SIDEBAR_WIDTH = 174;
const AXIS_HEIGHT = 42;
const MAX_SPAN = 2_000_000 * YEAR_MS;

export class NativeTimelineRenderer {
    private readonly app: App;
    private readonly plugin: StorytellerSuitePlugin;
    private readonly container: HTMLElement;
    private readonly calendarRegistry: CalendarRegistry;
    private options: Required<Omit<TimelineRendererOptions, 'onConflictsDetected' | 'onEventSelected'>> & Pick<TimelineRendererOptions, 'onConflictsDetected' | 'onEventSelected'>;
    private filters: TimelineFilters = {};
    private events: Event[] = [];
    private locations: Location[] = [];
    private scenes: Scene[] = [];
    private watchedNotes: Array<{ name: string; date: string; filePath: string }> = [];
    private showScenes = false;
    private showWatchedNotes = false;
    private root: HTMLElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private frame = 0;
    private lanes: Lane[] = [];
    private visibleItems: NativeItem[] = [];
    private selected: NativeItem | null = null;
    private viewStart = Date.now() - YEAR_MS;
    private viewEnd = Date.now() + YEAR_MS;
    private scrollTop = 0;
    private dragging: { kind: 'pan' | 'move'; x: number; y: number; start: number; end: number; item?: NativeItem } | null = null;
    private activePointers = new Map<number, { x: number; y: number }>();
    private pinch: { distance: number; span: number; anchorTime: number } | null = null;
    private referenceDate = new Date();
    private palette = ['#7c3aed', '#2563eb', '#059669', '#ca8a04', '#dc2626', '#ea580c', '#0ea5e9', '#22c55e', '#d946ef', '#f59e0b'];

    constructor(container: HTMLElement, plugin: StorytellerSuitePlugin, options: TimelineRendererOptions = {}) {
        this.container = container;
        this.plugin = plugin;
        this.app = plugin.app;
        this.calendarRegistry = new CalendarRegistry(plugin);
        this.options = {
            ganttMode: false,
            timelineOrientation: 'horizontal',
            groupMode: 'none',
            showDependencies: true,
            showProgressBars: true,
            dependencyArrowStyle: 'solid',
            stackEnabled: true,
            density: 50,
            defaultGanttDuration: 1,
            editMode: false,
            showEras: false,
            narrativeOrder: false,
            ...options
        };
    }

    async initialize(): Promise<void> {
        this.events = await this.plugin.listEvents();
        this.locations = await this.plugin.listLocations();
        await this.loadOptionalSources();
        this.mount();
        this.rebuild(true);
    }

    async refresh(): Promise<void> {
        this.events = await this.plugin.listEvents();
        this.locations = await this.plugin.listLocations();
        await this.loadOptionalSources();
        this.rebuild(false);
    }

    applyFilters(filters: Partial<TimelineFilters>): void { this.filters = { ...this.filters, ...filters }; this.rebuild(false); }
    setGanttMode(value: boolean): void { this.options.ganttMode = value; this.rebuild(false); }
    setTimelineOrientation(value: 'horizontal' | 'vertical'): void { this.options.timelineOrientation = value; this.rebuild(false); }
    setGroupMode(value: TimelineRendererOptions['groupMode']): void { this.options.groupMode = value || 'none'; this.rebuild(false); }
    setEditMode(value: boolean): void { this.options.editMode = value; this.container.toggleClass('is-editing', value); }
    setShowEras(value: boolean): void { this.options.showEras = value; this.scheduleDraw(); }
    setNarrativeOrder(value: boolean): void { this.options.narrativeOrder = value; this.rebuild(false); }
    setShowScenes(value: boolean): void { this.showScenes = value; this.rebuild(false); }
    setShowWatchedNotes(value: boolean): void { this.showWatchedNotes = value; this.rebuild(false); }
    setStackEnabled(value: boolean): void { this.options.stackEnabled = value; this.rebuild(false); }
    setDensity(value: number): void { this.options.density = Math.max(0, Math.min(100, value)); this.rebuild(false); }
    redraw(): void { this.resizeCanvas(); this.scheduleDraw(); }

    destroy(): void {
        if (this.frame) (this.container.ownerDocument.defaultView || window).cancelAnimationFrame(this.frame);
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.root?.remove();
        this.root = null;
        this.canvas = null;
        this.ctx = null;
    }

    getVisibleEvents(): Event[] {
        return this.events.filter(event => this.shouldInclude(event)).sort((a, b) => this.eventStart(a) - this.eventStart(b));
    }

    searchVisibleEvents(query: string, limit = 12): Event[] {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return this.getVisibleEvents().map(event => ({ event, score: this.searchScore(event, q) }))
            .filter(entry => entry.score >= 0).sort((a, b) => b.score - a.score).slice(0, limit).map(entry => entry.event);
    }

    focusEventByQuery(query: string): Event | null {
        const event = this.searchVisibleEvents(query, 1)[0] || null;
        if (event) this.focusEvent(event);
        return event;
    }

    focusEvent(event: Event): boolean {
        const item = this.lanes.reduce<NativeItem | undefined>((found, lane) => found || lane.items.find(candidate => candidate.event === event || this.eventKey(candidate.event) === this.eventKey(event)), undefined);
        if (!item) return false;
        const span = Math.max(this.viewEnd - this.viewStart, DAY_MS * 14);
        const center = (item.start + item.end) / 2;
        this.viewStart = center - span / 2;
        this.viewEnd = center + span / 2;
        this.selected = item;
        this.options.onEventSelected?.(event);
        this.ensureLaneVisible(item.laneId);
        this.scheduleDraw();
        return true;
    }

    fitToView(): void {
        const items = this.lanes.flatMap(lane => lane.items);
        if (!items.length) return;
        const min = Math.min(...items.map(item => item.start));
        const max = Math.max(...items.map(item => item.end));
        const pad = Math.max((max - min) * 0.08, DAY_MS * 3);
        this.viewStart = min - pad;
        this.viewEnd = max + pad;
        this.scrollTop = 0;
        this.scheduleDraw();
    }

    zoomPresetYears(years: number): void {
        const center = (this.viewStart + this.viewEnd) / 2;
        const span = Math.max(1, years) * YEAR_MS;
        this.viewStart = center - span / 2;
        this.viewEnd = center + span / 2;
        this.scheduleDraw();
    }

    zoomBy(factor: number): void {
        const center = (this.viewStart + this.viewEnd) / 2;
        const span = Math.max(this.minimumSpan(), Math.min(MAX_SPAN, (this.viewEnd - this.viewStart) * factor));
        this.viewStart = center - span / 2;
        this.viewEnd = center + span / 2;
        this.scheduleDraw();
    }

    moveToToday(): void {
        const span = this.viewEnd - this.viewStart;
        const now = Date.now();
        this.viewStart = now - span / 2;
        this.viewEnd = now + span / 2;
        this.scheduleDraw();
    }

    setVisibleRange(start: Date, end: Date): void {
        if (end.getTime() <= start.getTime()) return;
        this.viewStart = start.getTime();
        this.viewEnd = end.getTime();
        this.scheduleDraw();
    }

    getVisibleRange(): { start: Date; end: Date } { return { start: new Date(this.viewStart), end: new Date(this.viewEnd) }; }
    getEventCount(): number { return this.events.filter(event => this.shouldInclude(event)).length; }

    getDateRange(): { start: Date; end: Date } | null {
        const events = this.getVisibleEvents();
        if (!events.length) return null;
        const starts = events.map(event => this.eventStart(event)).filter(Number.isFinite);
        if (!starts.length) return null;
        return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...starts)) };
    }

    async exportAsImage(format: 'png' | 'jpg'): Promise<void> {
        if (!this.canvas) return;
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const link = this.container.ownerDocument.createElement('a');
        link.download = `timeline-${new Date().toISOString().slice(0, 10)}.${format}`;
        link.href = this.canvas.toDataURL(mime, 0.94);
        link.click();
    }

    async exportAsCsv(): Promise<void> { await this.writeExport('csv', this.toCsv()); }
    async exportAsJson(): Promise<void> { await this.writeExport('json', JSON.stringify(this.getVisibleEvents(), null, 2)); }
    async exportAsMarkdown(): Promise<void> {
        const body = this.getVisibleEvents().map(event => `- **${event.name}** (${event.dateTime || 'Undated'})${event.description ? ` - ${event.description}` : ''}`).join('\n');
        await this.writeExport('md', `# Timeline\n\n${body}\n`);
    }

    private mount(): void {
        this.destroy();
        this.container.empty();
        this.root = this.container.createDiv('sts-native-timeline');
        this.root.setAttribute('tabindex', '0');
        this.root.setAttribute('role', 'application');
        this.root.setAttribute('aria-label', 'Story timeline');
        this.canvas = this.root.createEl('canvas', { cls: 'sts-native-timeline-canvas' });
        this.ctx = this.canvas.getContext('2d');
        this.bindEvents();
        this.resizeObserver = new ResizeObserver(() => this.redraw());
        this.resizeObserver.observe(this.root);
        this.resizeCanvas();
    }

    private bindEvents(): void {
        if (!this.canvas || !this.root) return;
        this.canvas.addEventListener('pointerdown', event => this.onPointerDown(event));
        this.canvas.addEventListener('pointermove', event => this.onPointerMove(event));
        this.canvas.addEventListener('pointerup', event => { void this.onPointerUp(event); });
        this.canvas.addEventListener('pointercancel', event => { void this.onPointerUp(event); });
        this.canvas.addEventListener('dblclick', event => this.openAt(event.offsetX, event.offsetY));
        this.canvas.addEventListener('wheel', event => this.onWheel(event), { passive: false });
        this.root.addEventListener('keydown', event => this.onKeyDown(event));
    }

    private rebuild(fit: boolean): void {
        this.referenceDate = new Date();
        const sourceEvents = this.collectEvents();
        // Conflict analysis is secondary to rendering and can be quadratic for
        // dense character histories. Keep large timelines interactive; users
        // can still run the dedicated conflict tools against the full dataset.
        if (sourceEvents.length <= 10_000) {
            this.options.onConflictsDetected?.(ConflictDetector.detectAllConflicts(sourceEvents));
        }
        this.lanes = this.buildLanes(sourceEvents);
        this.layoutRows();
        if (fit) this.fitToView(); else this.scheduleDraw();
    }

    private collectEvents(): Event[] {
        const result = this.events.filter(event => this.shouldInclude(event)).slice();
        if (this.showScenes) {
            this.scenes.forEach(scene => {
                const date = scene.date;
                if (date) result.push({ name: scene.name, dateTime: date, description: scene.synopsis || scene.content, filePath: scene.filePath, tags: ['scene'] });
            });
        }
        if (this.showWatchedNotes) this.watchedNotes.forEach(note => result.push({ name: note.name, dateTime: note.date, filePath: note.filePath, tags: ['watched-note'] }));
        return result.filter(event => Number.isFinite(this.eventStart(event)));
    }

    private buildLanes(events: Event[]): Lane[] {
        if (this.filters.forkId === '__compare__') return this.buildForkLanes(events);
        const laneMap = new Map<string, Lane>();
        events.forEach((event, eventIndex) => {
            const targets = this.groupTargets(event);
            targets.forEach((target, duplicateIndex) => {
                let lane = laneMap.get(target.id);
                if (!lane) {
                    lane = { ...target, items: [], top: 0, height: 0 };
                    laneMap.set(target.id, lane);
                }
                lane.items.push(this.makeItem(event, eventIndex, target, duplicateIndex));
            });
        });
        return Array.from(laneMap.values());
    }

    private buildForkLanes(events: Event[]): Lane[] {
        const forks = this.plugin.getTimelineForks();
        const byId = new Map(forks.map(fork => [fork.id, fork]));
        const mainIds = new Set(forks.flatMap(fork => fork.forkEvents || []));
        const main = events.filter(event => !mainIds.has(this.eventKey(event)));
        const lanes: Lane[] = [{ id: '__main__', label: 'Main timeline', color: this.css('--interactive-accent', '#7c3aed'), items: [], top: 0, height: 0, branchDepth: 0 }];
        main.forEach((event, index) => lanes[0].items.push(this.makeItem(event, index, lanes[0], 0)));
        const depthOf = (fork: TimelineFork, seen = new Set<string>()): number => {
            if (!fork.parentTimelineId || seen.has(fork.id)) return 1;
            seen.add(fork.id);
            const parent = byId.get(fork.parentTimelineId);
            return parent ? 1 + depthOf(parent, seen) : 1;
        };
        forks.forEach((fork, laneIndex) => {
            const lane: Lane = { id: `fork:${fork.id}`, label: fork.name, color: fork.color || this.palette[laneIndex % this.palette.length], items: [], top: 0, height: 0, branchDepth: depthOf(fork) };
            const divergence = this.parseDate(fork.divergenceDate);
            main.filter(event => this.eventStart(event) <= divergence).forEach((event, index) => lane.items.push({ ...this.makeItem(event, index, lane, 0), forkId: fork.id, inherited: true }));
            events.filter(event => (fork.forkEvents || []).includes(this.eventKey(event))).forEach((event, index) => lane.items.push({ ...this.makeItem(event, index, lane, 0), forkId: fork.id }));
            lanes.push(lane);
        });
        return lanes;
    }

    private makeItem(event: Event, eventIndex: number, lane: Pick<Lane, 'id' | 'label' | 'color'>, duplicateIndex: number): NativeItem {
        const rangeParts = event.dateTime?.split(/\s+(?:to|through|until)\s+/i) || [];
        const start = rangeParts[0] ? this.parseDate(rangeParts[0]) : NaN;
        const explicitEnd = rangeParts[1] ? this.parseDate(rangeParts[1]) : NaN;
        const end = Number.isFinite(explicitEnd) ? explicitEnd : (this.options.ganttMode && !event.isMilestone ? start + this.options.defaultGanttDuration * DAY_MS : start);
        return { id: `${this.eventKey(event)}:${lane.id}:${duplicateIndex}`, event, eventIndex, start, end: Math.max(start, end), laneId: lane.id, laneLabel: lane.label, laneColor: lane.color, row: 0 };
    }

    private layoutRows(): void {
        const rowHeight = this.rowHeight();
        const plotWidth = Math.max(1, (this.root?.clientWidth || 900) - SIDEBAR_WIDTH);
        const visualReservation = (this.viewEnd - this.viewStart) * (210 / plotWidth);
        let top = AXIS_HEIGHT;
        this.lanes.forEach(lane => {
            lane.items.sort((a, b) => a.start - b.start || a.end - b.end);
            const rowEnds: number[] = [];
            lane.items.forEach(item => {
                let row = 0;
                if (this.options.stackEnabled) while (row < rowEnds.length && rowEnds[row] > item.start) row++;
                item.row = row;
                rowEnds[row] = Math.max(item.end, item.start + visualReservation);
            });
            lane.top = top;
            lane.height = Math.max(rowHeight + 12, rowEnds.length * rowHeight + 12);
            top += lane.height;
        });
        if (this.lanes.length === 1 && this.root) {
            this.lanes[0].height = Math.max(this.lanes[0].height, this.root.clientHeight - AXIS_HEIGHT);
            top = AXIS_HEIGHT + this.lanes[0].height;
        }
        const maxScroll = Math.max(0, top - (this.root?.clientHeight || 0));
        this.scrollTop = Math.min(this.scrollTop, maxScroll);
    }

    private groupTargets(event: Event): Array<{ id: string; label: string; color: string }> {
        const mode = this.options.groupMode;
        if (mode === 'character') {
            const chars = event.characters?.length ? Array.from(new Set(event.characters)) : ['No character'];
            return chars.map((name, i) => ({ id: `character:${name}`, label: name, color: this.palette[i % this.palette.length] }));
        }
        if (mode === 'location') {
            const name = event.location || 'No location';
            return [{ id: `location:${name}`, label: name, color: this.colorFor(name) }];
        }
        if (mode === 'group') {
            const id = event.groups?.[0] || '__ungrouped__';
            const group = this.plugin.getGroups().find(candidate => candidate.id === id || candidate.name === id);
            return [{ id: `group:${id}`, label: group?.name || (id === '__ungrouped__' ? 'Ungrouped' : id), color: group?.color || this.colorFor(id) }];
        }
        if (mode === 'track') {
            const track = this.matchTrack(event);
            return [{ id: `track:${track?.id || '__unassigned__'}`, label: track?.name || 'Unassigned', color: track?.color || this.colorFor(track?.id || 'unassigned') }];
        }
        return [{ id: '__timeline__', label: 'Timeline', color: this.css('--interactive-accent', '#7c3aed') }];
    }

    private matchTrack(event: Event): TimelineTrack | undefined {
        return (this.plugin.settings.timelineTracks || []).filter(track => track.visible !== false).find(track => {
            if (track.type === 'global') return true;
            if (track.type === 'character') return !!track.entityId && !!event.characters?.includes(track.entityId);
            if (track.type === 'location') return event.location === track.entityId;
            if (track.type === 'group') return !!track.entityId && !!event.groups?.includes(track.entityId);
            const criteria = track.filterCriteria;
            if (!criteria) return false;
            if (criteria.characters?.length && !criteria.characters.some(value => event.characters?.includes(value))) return false;
            if (criteria.locations?.length && (!event.location || !criteria.locations.includes(event.location))) return false;
            if (criteria.groups?.length && !criteria.groups.some(value => event.groups?.includes(value))) return false;
            if (criteria.tags?.length && !criteria.tags.some(value => event.tags?.includes(value))) return false;
            if (criteria.status?.length && (!event.status || !criteria.status.includes(event.status))) return false;
            return !criteria.milestonesOnly || !!event.isMilestone;
        });
    }

    private scheduleDraw(): void {
        if (this.frame) return;
        this.frame = (this.container.ownerDocument.defaultView || window).requestAnimationFrame(() => { this.frame = 0; this.draw(); });
    }

    private draw(): void {
        if (!this.canvas || !this.ctx || !this.root) return;
        this.layoutRows();
        const ctx = this.ctx;
        const width = this.root.clientWidth;
        const height = this.root.clientHeight;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = this.css('--background-primary', '#111827');
        ctx.fillRect(0, 0, width, height);
        if (!this.options.ganttMode && this.options.timelineOrientation === 'vertical') {
            this.drawVerticalTimeline(ctx, width, height);
            return;
        }
        this.drawAxis(ctx, width, height);
        this.drawEras(ctx, width, height);
        this.visibleItems = [];
        this.lanes.forEach(lane => this.drawLane(ctx, lane, width, height));
        this.drawForkBranches(ctx, width, height);
        this.drawConnectors(ctx, width, height);
        this.drawNow(ctx, width, height);
    }

    private drawAxis(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
        ctx.fillStyle = this.css('--background-secondary', '#1f2937');
        ctx.fillRect(0, 0, width, AXIS_HEIGHT);
        ctx.fillStyle = this.css('--text-muted', '#9ca3af');
        ctx.font = `12px ${this.css('--font-interface', 'sans-serif')}`;
        const plotWidth = Math.max(1, width - SIDEBAR_WIDTH);
        const span = this.viewEnd - this.viewStart;
        const calendar = this.calendarRegistry.getActiveCalendar();
        if (calendar.id !== GREGORIAN_CALENDAR.id) {
            const startDay = this.viewStart / DAY_MS + this.unixEpochAbsoluteDay();
            const endDay = this.viewEnd / DAY_MS + this.unixEpochAbsoluteDay();
            const ticks = generateTicks(calendar, { startDay, endDay, widthPx: plotWidth }, Math.max(2, Math.floor(plotWidth / 120)));
            ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
            ticks.forEach(tick => {
                const x = SIDEBAR_WIDTH + tick.x;
                ctx.beginPath(); ctx.moveTo(x, AXIS_HEIGHT); ctx.lineTo(x, this.root?.clientHeight || 0); ctx.stroke();
                ctx.fillText(tick.label, x + 5, 25);
            });
            ctx.strokeRect(0, 0, width, AXIS_HEIGHT);
            return;
        }
        const desired = Math.max(2, Math.floor(plotWidth / 120));
        const rawStep = span / desired;
        const step = this.niceTimeStep(rawStep);
        const first = Math.ceil(this.viewStart / step) * step;
        ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
        ctx.lineWidth = 1;
        for (let time = first; time < this.viewEnd; time += step) {
            const x = this.timeToX(time, width);
            ctx.beginPath(); ctx.moveTo(x, AXIS_HEIGHT); ctx.lineTo(x, this.root?.clientHeight || 0); ctx.stroke();
            ctx.fillText(this.formatTick(time, step), x + 5, 25);
        }
        ctx.strokeRect(0, 0, width, AXIS_HEIGHT);
    }

    private drawLane(ctx: CanvasRenderingContext2D, lane: Lane, width: number, height: number): void {
        if (!this.options.ganttMode) {
            this.drawChronologyLane(ctx, lane, width, height);
            return;
        }
        const top = lane.top - this.scrollTop;
        if (top > height || top + lane.height < AXIS_HEIGHT) return;
        ctx.fillStyle = this.css('--background-secondary-alt', '#18202d');
        ctx.fillRect(0, top, SIDEBAR_WIDTH, lane.height);
        ctx.fillStyle = lane.color;
        ctx.fillRect(0, top, 4, lane.height);
        ctx.fillStyle = this.css('--text-normal', '#e5e7eb');
        ctx.font = `600 12px ${this.css('--font-interface', 'sans-serif')}`;
        ctx.fillText(this.truncate(ctx, lane.label, SIDEBAR_WIDTH - 24), 13, top + 22);
        ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
        ctx.beginPath(); ctx.moveTo(0, top + lane.height); ctx.lineTo(width, top + lane.height); ctx.stroke();
        const rowHeight = this.rowHeight();
        const leftTime = this.viewStart;
        const rightTime = this.viewEnd;
        const startIndex = this.lowerBound(lane.items, leftTime);
        for (let i = Math.max(0, startIndex - 1); i < lane.items.length; i++) {
            const item = lane.items[i];
            if (item.start > rightTime) break;
            if (item.end < leftTime) continue;
            const x1 = this.timeToX(item.start, width);
            const x2 = this.timeToX(item.end, width);
            const y = top + 7 + item.row * rowHeight;
            const itemHeight = rowHeight - 7;
            const isPoint = Math.abs(x2 - x1) < 3;
            ctx.font = `11px ${this.css('--font-interface', 'sans-serif')}`;
            const markers = `${item.event.narrativeMarkers?.isFlashback ? 'FB ' : ''}${item.event.narrativeMarkers?.isFlashforward ? 'FF ' : ''}`;
            const chipWidth = Math.max(88, Math.min(210, ctx.measureText(markers + item.event.name).width + 34));
            const itemWidth = isPoint ? chipWidth : Math.max(24, x2 - x1);
            const x = isPoint ? x1 - 7 : x1;
            item.rect = new DOMRect(x, y, itemWidth, itemHeight);
            this.visibleItems.push(item);
            this.drawItem(ctx, item, isPoint);
        }
    }

    private drawChronologyLane(ctx: CanvasRenderingContext2D, lane: Lane, width: number, height: number): void {
        const top = lane.top - this.scrollTop;
        if (top > height || top + lane.height < AXIS_HEIGHT) return;
        ctx.fillStyle = this.css('--background-secondary-alt', '#18202d');
        ctx.fillRect(0, top, SIDEBAR_WIDTH, lane.height);
        ctx.fillStyle = lane.color;
        ctx.fillRect(0, top, 4, lane.height);
        ctx.fillStyle = this.css('--text-normal', '#e5e7eb');
        ctx.font = `600 12px ${this.css('--font-interface', 'sans-serif')}`;
        ctx.fillText(this.truncate(ctx, lane.label, SIDEBAR_WIDTH - 24), 13, top + 22);

        const baselineY = top + 18;
        ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(SIDEBAR_WIDTH, baselineY); ctx.lineTo(width, baselineY); ctx.stroke();

        const rowHeight = this.rowHeight();
        const startIndex = this.lowerBound(lane.items, this.viewStart);
        for (let i = Math.max(0, startIndex - 1); i < lane.items.length; i++) {
            const item = lane.items[i];
            if (item.start > this.viewEnd) break;
            if (item.end < this.viewStart) continue;
            const pointX = this.timeToX(item.start, width);
            const endX = this.timeToX(item.end, width);
            const chipY = top + 34 + item.row * rowHeight;
            const markers = `${item.event.narrativeMarkers?.isFlashback ? 'FB ' : ''}${item.event.narrativeMarkers?.isFlashforward ? 'FF ' : ''}`;
            ctx.font = `11px ${this.css('--font-interface', 'sans-serif')}`;
            const chipWidth = Math.max(92, Math.min(210, ctx.measureText(markers + item.event.name).width + 34));
            const chipHeight = rowHeight - 7;
            const chipX = Math.min(Math.max(SIDEBAR_WIDTH + 4, pointX + 9), width - chipWidth - 4);
            item.rect = new DOMRect(chipX, chipY, chipWidth, chipHeight);
            this.visibleItems.push(item);

            ctx.strokeStyle = item.laneColor;
            ctx.globalAlpha = item.inherited ? 0.45 : 0.8;
            ctx.beginPath(); ctx.moveTo(pointX, baselineY); ctx.lineTo(pointX, chipY + chipHeight / 2); ctx.lineTo(chipX, chipY + chipHeight / 2); ctx.stroke();
            if (endX - pointX > 3) {
                ctx.beginPath(); ctx.moveTo(pointX, baselineY); ctx.lineTo(endX, baselineY); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(endX, baselineY - 4); ctx.lineTo(endX, baselineY + 4); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            this.drawPointMarker(ctx, pointX, baselineY, item);
            this.drawItem(ctx, item, true);
        }
    }

    private drawVerticalTimeline(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const top = 28;
        const bottom = Math.max(top + 1, height - 24);
        const axisX = Math.max(220, Math.min(width / 2, width - 230));
        ctx.strokeStyle = this.css('--background-modifier-border', '#374151');
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(axisX, top); ctx.lineTo(axisX, bottom); ctx.stroke();
        ctx.fillStyle = this.css('--text-muted', '#9ca3af');
        ctx.font = `12px ${this.css('--font-interface', 'sans-serif')}`;

        const calendar = this.calendarRegistry.getActiveCalendar();
        const absoluteStart = this.viewStart / DAY_MS + this.unixEpochAbsoluteDay();
        const absoluteEnd = this.viewEnd / DAY_MS + this.unixEpochAbsoluteDay();
        const ticks = generateTicks(calendar, { startDay: absoluteStart, endDay: absoluteEnd, widthPx: bottom - top }, 8);
        ticks.forEach(tick => {
            const time = (tick.absoluteDay - this.unixEpochAbsoluteDay()) * DAY_MS;
            const ratio = (time - this.viewStart) / (this.viewEnd - this.viewStart);
            const y = top + ratio * (bottom - top);
            ctx.beginPath(); ctx.moveTo(axisX - 5, y); ctx.lineTo(axisX + 5, y); ctx.stroke();
            ctx.fillText(tick.label, axisX - ctx.measureText(tick.label).width - 10, y + 4);
        });

        const items = this.lanes.flatMap(lane => lane.items).filter(item => item.start >= this.viewStart && item.start <= this.viewEnd).sort((a, b) => a.start - b.start);
        this.visibleItems = [];
        let previousLeft = -Infinity;
        let previousRight = -Infinity;
        items.forEach((item, index) => {
            const desiredY = top + (item.start - this.viewStart) / (this.viewEnd - this.viewStart) * (bottom - top);
            const rightSide = index % 2 === 0 || axisX < 280;
            const last = rightSide ? previousRight : previousLeft;
            const placedY = Math.max(desiredY, last + 34);
            if (rightSide) previousRight = placedY; else previousLeft = placedY;
            if (placedY > bottom) return;
            const markers = `${item.event.narrativeMarkers?.isFlashback ? 'FB ' : ''}${item.event.narrativeMarkers?.isFlashforward ? 'FF ' : ''}`;
            const lanePrefix = this.lanes.length > 1 ? `${item.laneLabel}: ` : '';
            const label = lanePrefix + markers + item.event.name;
            const chipWidth = Math.max(110, Math.min(230, ctx.measureText(label).width + 34));
            const chipHeight = 27;
            const chipX = rightSide ? axisX + 28 : Math.max(4, axisX - 28 - chipWidth);
            const chipY = placedY - chipHeight / 2;
            item.rect = new DOMRect(chipX, chipY, chipWidth, chipHeight);
            this.visibleItems.push(item);
            ctx.strokeStyle = item.laneColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(axisX, desiredY); ctx.lineTo(rightSide ? chipX : chipX + chipWidth, placedY); ctx.stroke();
            this.drawPointMarker(ctx, axisX, desiredY, item);
            this.drawItem(ctx, item, true, label);
        });
        this.drawConnectors(ctx, width, height);
        this.drawNowVertical(ctx, axisX, top, bottom);
    }

    private drawItem(ctx: CanvasRenderingContext2D, item: NativeItem, isPoint: boolean, labelOverride?: string): void {
        const rect = item.rect!;
        ctx.save();
        ctx.globalAlpha = item.inherited ? 0.45 : 1;
        const accent = item === this.selected ? this.css('--interactive-accent', '#8b5cf6') : item.laneColor;
        if (isPoint) {
            ctx.fillStyle = this.css('--background-secondary', '#1f2937');
            this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 3);
            ctx.fill();
            ctx.strokeStyle = item === this.selected ? this.css('--interactive-accent', '#8b5cf6') : this.css('--background-modifier-border', '#374151');
            ctx.lineWidth = item === this.selected ? 2 : 1;
            ctx.stroke();
            ctx.fillStyle = accent;
            const markerX = rect.x + 10;
            const markerY = rect.y + rect.height / 2;
            if (item.event.isMilestone) {
                ctx.save();
                ctx.translate(markerX, markerY);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-5, -5, 10, 10);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(markerX, markerY, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            ctx.fillStyle = accent;
            this.roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 3); ctx.fill();
            if (this.options.showProgressBars && typeof item.event.progress === 'number') {
                ctx.fillStyle = this.css('--text-on-accent', '#fff');
                ctx.globalAlpha = 0.3;
                ctx.fillRect(rect.x, rect.y + rect.height - 3, rect.width * Math.max(0, Math.min(1, item.event.progress / 100)), 3);
            }
        }
        ctx.globalAlpha = 1;
        const labelX = isPoint ? rect.x + 22 : rect.x + 6;
        const available = isPoint ? Math.max(0, rect.width - 28) : Math.max(0, rect.width - 12);
        if (available > 18) {
            ctx.fillStyle = isPoint ? this.css('--text-normal', '#e5e7eb') : this.css('--text-on-accent', '#fff');
            ctx.font = `11px ${this.css('--font-interface', 'sans-serif')}`;
            const markers = `${item.event.narrativeMarkers?.isFlashback ? 'FB ' : ''}${item.event.narrativeMarkers?.isFlashforward ? 'FF ' : ''}`;
            ctx.fillText(this.truncate(ctx, labelOverride || markers + item.event.name, available), labelX, rect.y + rect.height / 2 + 4);
        }
        ctx.restore();
    }

    private drawPointMarker(ctx: CanvasRenderingContext2D, x: number, y: number, item: NativeItem): void {
        ctx.save();
        ctx.fillStyle = item === this.selected ? this.css('--interactive-accent', '#8b5cf6') : item.laneColor;
        if (item.event.isMilestone) {
            ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12);
        } else {
            ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    private drawEras(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        if (!this.options.showEras) return;
        const eras = (this.plugin.settings.timelineEras || []).filter(era => era.visible !== false);
        eras.forEach(era => {
            const start = this.parseDate(era.startDate); const end = this.parseDate(era.endDate);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return;
            const x1 = this.timeToX(start, width); const x2 = this.timeToX(end, width);
            ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = era.color || '#8b5cf6'; ctx.fillRect(x1, AXIS_HEIGHT, x2 - x1, height - AXIS_HEIGHT); ctx.restore();
        });
    }

    private drawConnectors(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
        const byKey = new Map<string, NativeItem[]>();
        this.visibleItems.forEach(item => {
            [this.eventKey(item.event), item.event.name].forEach(key => {
                const values = byKey.get(key) || []; values.push(item); byKey.set(key, values);
            });
        });
        ctx.save();
        ctx.strokeStyle = this.css('--interactive-accent', '#8b5cf6');
        ctx.lineWidth = 2;
        if (this.options.dependencyArrowStyle === 'dashed') ctx.setLineDash([8, 5]);
        if (this.options.dependencyArrowStyle === 'dotted') ctx.setLineDash([2, 4]);
        if (this.options.ganttMode && this.options.showDependencies) {
            this.visibleItems.forEach(target => (target.event.dependencies || []).forEach(ref => {
                const source = (byKey.get(ref) || [])[0];
                if (source?.rect && target.rect) this.arrow(ctx, source.rect.right, source.rect.y + source.rect.height / 2, target.rect.x, target.rect.y + target.rect.height / 2);
            }));
        }
        if (this.options.narrativeOrder) {
            this.visibleItems.forEach(target => {
                const ref = target.event.narrativeMarkers?.targetEvent;
                const source = ref ? (byKey.get(ref) || [])[0] : undefined;
                if (source?.rect && target.rect) this.curve(ctx, source.rect, target.rect);
            });
        }
        ctx.restore();
    }

    private drawForkBranches(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
        if (this.filters.forkId !== '__compare__' || this.lanes.length < 2) return;
        const forks = this.plugin.getTimelineForks();
        forks.forEach((fork, index) => {
            const lane = this.lanes[index + 1]; if (!lane) return;
            const x = this.timeToX(this.parseDate(fork.divergenceDate), width);
            const mainY = this.lanes[0].top - this.scrollTop + 16;
            const branchY = lane.top - this.scrollTop + 16;
            ctx.save(); ctx.strokeStyle = lane.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, mainY); ctx.bezierCurveTo(x + 28, mainY, x + 28, branchY, x + 56, branchY); ctx.stroke(); ctx.restore();
        });
    }

    private drawNow(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const now = Date.now(); if (now < this.viewStart || now > this.viewEnd) return;
        const x = this.timeToX(now, width); ctx.save(); ctx.strokeStyle = this.css('--color-red', '#ef4444'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, AXIS_HEIGHT); ctx.lineTo(x, height); ctx.stroke(); ctx.restore();
    }

    private drawNowVertical(ctx: CanvasRenderingContext2D, axisX: number, top: number, bottom: number): void {
        const now = Date.now();
        if (now < this.viewStart || now > this.viewEnd) return;
        const y = top + (now - this.viewStart) / (this.viewEnd - this.viewStart) * (bottom - top);
        ctx.save(); ctx.strokeStyle = this.css('--color-red', '#ef4444'); ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(axisX - 16, y); ctx.lineTo(axisX + 16, y); ctx.stroke(); ctx.restore();
    }

    private onPointerDown(event: PointerEvent): void {
        if (!this.canvas) return;
        this.canvas.setPointerCapture(event.pointerId);
        this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.activePointers.size === 2) {
            this.beginPinch();
            this.dragging = null;
            return;
        }
        const item = this.hit(event.offsetX, event.offsetY);
        if (item) {
            this.selected = item; this.options.onEventSelected?.(item.event);
            this.dragging = this.options.editMode
                ? { kind: 'move', x: event.clientX, y: event.clientY, start: item.start, end: item.end, item }
                : event.pointerType === 'touch'
                    ? { kind: 'pan', x: event.clientX, y: event.clientY, start: this.viewStart, end: this.viewEnd }
                    : null;
            this.scheduleDraw();
            return;
        }
        this.selected = null; this.options.onEventSelected?.(null);
        this.dragging = { kind: 'pan', x: event.clientX, y: event.clientY, start: this.viewStart, end: this.viewEnd };
    }

    private onPointerMove(event: PointerEvent): void {
        if (this.activePointers.has(event.pointerId)) this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.activePointers.size >= 2 && this.pinch) {
            this.updatePinch();
            return;
        }
        if (!this.dragging || !this.root) return;
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        const plotSize = vertical ? Math.max(1, this.root.clientHeight - 52) : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
        const pointerDelta = vertical ? event.clientY - this.dragging.y : event.clientX - this.dragging.x;
        const deltaTime = -pointerDelta / plotSize * (this.dragging.end - this.dragging.start);
        if (this.dragging.kind === 'pan') {
            this.viewStart = this.dragging.start + deltaTime; this.viewEnd = this.dragging.end + deltaTime;
            if (!vertical) {
                this.scrollTop = Math.max(0, Math.min(this.maxLaneScroll(), this.scrollTop - (event.clientY - this.dragging.y)));
                this.dragging.y = event.clientY;
            }
        } else if (this.dragging.item) {
            const duration = this.dragging.end - this.dragging.start;
            const snapped = this.snap(this.dragging.start + deltaTime);
            this.dragging.item.start = snapped; this.dragging.item.end = snapped + duration;
        }
        this.scheduleDraw();
    }

    private async onPointerUp(event: PointerEvent): Promise<void> {
        this.activePointers.delete(event.pointerId);
        if (this.pinch) {
            this.pinch = null;
            this.dragging = null;
            this.canvas?.releasePointerCapture(event.pointerId);
            const remaining = Array.from(this.activePointers.values())[0];
            if (remaining) this.dragging = { kind: 'pan', x: remaining.x, y: remaining.y, start: this.viewStart, end: this.viewEnd };
            return;
        }
        if (!this.dragging) {
            this.canvas?.releasePointerCapture(event.pointerId);
            return;
        }
        const dragging = this.dragging; this.dragging = null;
        this.canvas?.releasePointerCapture(event.pointerId);
        if (dragging.kind === 'move' && dragging.item && dragging.item.start !== dragging.start) {
            const item = dragging.item;
            const oldDate = item.event.dateTime;
            const duration = dragging.end - dragging.start;
            const startText = this.formatEditDate(item.start);
            const endText = duration > 0 ? this.formatEditDate(item.end) : '';
            item.event.dateTime = duration > 0 ? `${startText} to ${endText}` : startText;
            try { await this.plugin.saveEvent(item.event); new Notice(`Moved “${item.event.name}” to ${item.event.dateTime}`); }
            catch (error) { item.event.dateTime = oldDate; item.start = dragging.start; item.end = dragging.end; new Notice(`Could not move event: ${error instanceof Error ? error.message : String(error)}`); }
            this.rebuild(false);
        }
    }

    private onWheel(event: WheelEvent): void {
        if (!this.root) return;
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
            const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
            const plotSize = vertical ? Math.max(1, this.root.clientHeight - 52) : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
            const pointer = vertical ? Math.max(0, event.offsetY - 28) : Math.max(0, event.offsetX - SIDEBAR_WIDTH);
            const anchor = this.viewStart + pointer / plotSize * (this.viewEnd - this.viewStart);
            const factor = Math.exp(event.deltaY * 0.0015);
            const span = Math.max(this.minimumSpan(), Math.min(MAX_SPAN, (this.viewEnd - this.viewStart) * factor));
            const ratio = (anchor - this.viewStart) / (this.viewEnd - this.viewStart);
            this.viewStart = anchor - span * ratio; this.viewEnd = this.viewStart + span;
        } else if (!this.options.ganttMode && this.options.timelineOrientation === 'vertical') {
            const delta = event.deltaY / 900 * (this.viewEnd - this.viewStart);
            this.viewStart += delta; this.viewEnd += delta;
        } else {
            const verticalWheel = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
            const canScrollLanes = this.maxLaneScroll() > 0;
            if (!event.shiftKey && verticalWheel && canScrollLanes) {
                const before = this.scrollTop;
                this.scrollTop = Math.max(0, Math.min(this.maxLaneScroll(), this.scrollTop + event.deltaY));
                if (this.scrollTop !== before) {
                    this.scheduleDraw();
                    return;
                }
            }
            const wheelDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            const delta = wheelDelta / 900 * (this.viewEnd - this.viewStart);
            this.viewStart += delta; this.viewEnd += delta;
        }
        this.scheduleDraw();
    }

    private beginPinch(): void {
        if (!this.root) return;
        const points = Array.from(this.activePointers.values());
        if (points.length < 2) return;
        const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        const center = vertical ? (points[0].y + points[1].y) / 2 : (points[0].x + points[1].x) / 2;
        const bounds = this.root.getBoundingClientRect();
        const local = vertical ? center - bounds.top - 28 : center - bounds.left - SIDEBAR_WIDTH;
        const size = vertical ? Math.max(1, this.root.clientHeight - 52) : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
        const ratio = Math.max(0, Math.min(1, local / size));
        this.pinch = { distance: Math.max(1, distance), span: this.viewEnd - this.viewStart, anchorTime: this.viewStart + ratio * (this.viewEnd - this.viewStart) };
    }

    private updatePinch(): void {
        if (!this.root || !this.pinch) return;
        const points = Array.from(this.activePointers.values());
        if (points.length < 2) return;
        const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
        const span = Math.max(this.minimumSpan(), Math.min(MAX_SPAN, this.pinch.span * this.pinch.distance / distance));
        const vertical = !this.options.ganttMode && this.options.timelineOrientation === 'vertical';
        const center = vertical ? (points[0].y + points[1].y) / 2 : (points[0].x + points[1].x) / 2;
        const bounds = this.root.getBoundingClientRect();
        const local = vertical ? center - bounds.top - 28 : center - bounds.left - SIDEBAR_WIDTH;
        const size = vertical ? Math.max(1, this.root.clientHeight - 52) : Math.max(1, this.root.clientWidth - SIDEBAR_WIDTH);
        const ratio = Math.max(0, Math.min(1, local / size));
        this.viewStart = this.pinch.anchorTime - span * ratio;
        this.viewEnd = this.viewStart + span;
        this.scheduleDraw();
    }

    private maxLaneScroll(): number {
        if (!this.root) return 0;
        const total = this.lanes.reduce((sum, lane) => sum + lane.height, AXIS_HEIGHT);
        return Math.max(0, total - this.root.clientHeight);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.selected || !this.options.editMode || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const delta = (event.key === 'ArrowLeft' ? -1 : 1) * this.snapUnit();
        this.selected.start += delta; this.selected.end += delta; this.scheduleDraw();
    }

    private openAt(x: number, y: number): void {
        const item = this.hit(x, y); if (!item || item.event.tags?.includes('watched-note')) return;
        new EventModal(this.app, this.plugin, item.event, async updated => { await this.plugin.saveEvent(updated); await this.refresh(); }).open();
    }

    private hit(x: number, y: number): NativeItem | null {
        for (let i = this.visibleItems.length - 1; i >= 0; i--) { const rect = this.visibleItems[i].rect; if (rect && x >= rect.x && x <= rect.right && y >= rect.y && y <= rect.bottom) return this.visibleItems[i]; }
        return null;
    }

    private shouldInclude(event: Event): boolean {
        if (!event.dateTime) return false;
        if (this.filters.milestonesOnly && !event.isMilestone) return false;
        if (this.filters.characters?.size && !event.characters?.some(value => this.filters.characters!.has(value))) return false;
        if (this.filters.locations?.size && (!event.location || !this.filters.locations.has(event.location))) return false;
        if (this.filters.groups?.size && !event.groups?.some(value => this.filters.groups!.has(value))) return false;
        if (this.filters.tags?.size && !event.tags?.some(value => this.filters.tags!.has(value))) return false;
        const key = this.eventKey(event);
        if (this.filters.forkId && this.filters.forkId !== '__compare__') {
            const fork = this.plugin.getTimelineFork(this.filters.forkId);
            if (!fork?.forkEvents?.includes(key)) return false;
        } else if (this.filters.forkId === undefined) {
            if (this.plugin.getTimelineForks().some(fork => fork.forkEvents?.includes(key))) return false;
        }
        return true;
    }

    private async loadOptionalSources(): Promise<void> {
        try { this.scenes = await this.plugin.listScenes(); } catch { this.scenes = []; }
        this.watchedNotes = [];
        const property = this.plugin.settings.timelineWatchProperty || 'timeline-date';
        const tag = (this.plugin.settings.timelineWatchTag || 'timeline').replace(/^#/, '');
        this.app.vault.getMarkdownFiles().forEach(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            const value = frontmatter?.[property];
            const tagged = cache?.tags?.some(candidate => candidate.tag === `#${tag}`);
            const fallback = frontmatter?.date;
            const date = typeof value === 'string' ? value : tagged && typeof fallback === 'string' ? fallback : null;
            if (date) this.watchedNotes.push({ name: typeof frontmatter?.title === 'string' ? frontmatter.title : file.basename, date, filePath: file.path });
        });
    }

    private eventStart(event: Event): number { return event.dateTime ? this.parseDate(event.dateTime.split(/\s+(?:to|through|until)\s+/i)[0]) : Number.POSITIVE_INFINITY; }
    private parseDate(value: string): number {
        const calendar = this.calendarRegistry.getActiveCalendar();
        if (calendar.id !== GREGORIAN_CALENDAR.id) {
            const absoluteDay = parseToAbsoluteDay(value, calendar);
            if (absoluteDay != null) return (absoluteDay - this.unixEpochAbsoluteDay()) * DAY_MS;
        }
        const parsed = parseEventDate(value, { referenceDate: this.referenceDate });
        return toMillis(parsed.start) ?? NaN;
    }
    private eventKey(event: Event): string { return String(event.id || event.name); }
    private timeToX(time: number, width: number): number { return SIDEBAR_WIDTH + (time - this.viewStart) / (this.viewEnd - this.viewStart) * Math.max(1, width - SIDEBAR_WIDTH); }
    private rowHeight(): number { return Math.round(24 + (100 - this.options.density) * 0.16); }
    private snapUnit(): number { const span = this.viewEnd - this.viewStart; return span < DAY_MS * 4 ? 60_000 : span < DAY_MS * 60 ? DAY_MS : 30 * DAY_MS; }
    private minimumSpan(): number { return this.calendarRegistry.getActiveCalendar().baseUnit === 'minute' ? 60_000 : DAY_MS; }
    private snap(value: number): number { const unit = this.snapUnit(); return Math.round(value / unit) * unit; }
    private formatEditDate(value: number): string {
        const calendar = this.calendarRegistry.getActiveCalendar();
        if (calendar.id !== GREGORIAN_CALENDAR.id) return formatAbsoluteDay(value / DAY_MS + this.unixEpochAbsoluteDay(), calendar, calendar.baseUnit === 'minute' ? 'time' : 'day');
        return new Date(value).toISOString().replace('T', ' ').replace(/:00\.000Z$/, '');
    }
    private unixEpochAbsoluteDay(): number { return toAbsolute(GREGORIAN_CALENDAR, { year: 1970, month: 0, day: 1 }).absoluteDay; }
    private ensureLaneVisible(id: string): void { const lane = this.lanes.find(value => value.id === id); if (lane) this.scrollTop = Math.max(0, lane.top - AXIS_HEIGHT); }
    private colorFor(value: string): string { let hash = 0; for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0; return this.palette[Math.abs(hash) % this.palette.length]; }
    private css(name: string, fallback: string): string {
        const colors = this.calendarRegistry.getActiveTheme().colors;
        const themeValue: Record<string, string | undefined> = {
            '--background-primary': colors?.background,
            '--background-secondary': colors?.surface,
            '--background-secondary-alt': colors?.surface,
            '--background-modifier-border': colors?.grid,
            '--text-normal': colors?.text,
            '--text-muted': colors?.mutedText,
            '--interactive-accent': colors?.accent,
            '--color-red': colors?.now,
        };
        return themeValue[name] || getComputedStyle(this.container).getPropertyValue(name).trim() || fallback;
    }
    private truncate(ctx: CanvasRenderingContext2D, value: string, width: number): string { if (ctx.measureText(value).width <= width) return value; let text = value; while (text.length > 1 && ctx.measureText(`${text}…`).width > width) text = text.slice(0, -1); return `${text}…`; }
    private lowerBound(items: NativeItem[], target: number): number { let low = 0, high = items.length; while (low < high) { const mid = (low + high) >>> 1; if (items[mid].start < target) low = mid + 1; else high = mid; } return low; }
    private niceTimeStep(raw: number): number { const units = [60_000, 5 * 60_000, 15 * 60_000, 3_600_000, 6 * 3_600_000, DAY_MS, 7 * DAY_MS, 30 * DAY_MS, 90 * DAY_MS, YEAR_MS, 5 * YEAR_MS, 10 * YEAR_MS, 100 * YEAR_MS, 1000 * YEAR_MS]; return units.find(unit => unit >= raw) || Math.ceil(raw / (1000 * YEAR_MS)) * 1000 * YEAR_MS; }
    private formatTick(value: number, step: number): string { const date = new Date(value); if (step >= YEAR_MS) return String(date.getUTCFullYear()); if (step >= DAY_MS) return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: step < 30 * DAY_MS ? 'numeric' : undefined, timeZone: 'UTC' }); return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }); }
    private searchScore(event: Event, query: string): number { const name = event.name.toLowerCase(); const all = [event.name, event.description, event.location, event.status, ...(event.characters || []), ...(event.groups || []), ...(event.tags || [])].filter(Boolean).join(' ').toLowerCase(); if (!all.includes(query)) return -1; if (name === query) return 1000; if (name.startsWith(query)) return 800; if (name.includes(query)) return 500; return 100; }
    private arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void { const mid = Math.max(x1 + 18, (x1 + x2) / 2); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x2 - 7, y2 - 4); ctx.lineTo(x2, y2); ctx.lineTo(x2 - 7, y2 + 4); ctx.stroke(); }
    private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void { const r = Math.min(radius, width / 2, height / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r); ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height); ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
    private curve(ctx: CanvasRenderingContext2D, source: DOMRect, target: DOMRect): void { ctx.save(); ctx.setLineDash([5, 4]); this.arrow(ctx, source.right, source.y + source.height / 2, target.x, target.y + target.height / 2); ctx.restore(); }
    private resizeCanvas(): void { if (!this.canvas || !this.root || !this.ctx) return; const ratio = Math.max(1, window.devicePixelRatio || 1); const width = Math.max(1, this.root.clientWidth); const height = Math.max(1, this.root.clientHeight); this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio); this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`; this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
    private toCsv(): string { const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`; return ['Name,Date,Status,Location,Characters,Description', ...this.getVisibleEvents().map(event => [event.name, event.dateTime, event.status, event.location, (event.characters || []).join('; '), event.description].map(escape).join(','))].join('\n'); }
    private async writeExport(extension: string, content: string): Promise<void> { const path = `StorytellerSuite/Exports/timeline-${new Date().toISOString().slice(0, 10)}.${extension}`; const existing = this.app.vault.getAbstractFileByPath(path); if (existing instanceof TFile) await this.app.vault.modify(existing, content); else { const folder = 'StorytellerSuite/Exports'; if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder); await this.app.vault.create(path, content); } new Notice(`Timeline exported to ${path}`); }
}

export { NativeTimelineRenderer as TimelineRenderer };
