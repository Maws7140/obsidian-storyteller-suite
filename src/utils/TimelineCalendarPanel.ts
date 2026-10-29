/**
 * The Calendar view's DOM. It draws one month of the story's own calendar as a
 * week grid (an agenda on narrow panes) and takes its events, colours, icons,
 * selection, opening and edit-mode moves from the renderer through
 * {@link TimelineCalendarHost}, so each of those keeps a single code path.
 *
 * Canvas views draw on a canvas. This one is ordinary DOM, which is what lets
 * the week rows, "+N more" menus and month header use the same Obsidian
 * controls as the rest of the plugin. Its look comes from the same timeline
 * theme as the canvas: the `--sts-timeline-*` colours and font through CSS, the
 * chip height, corner radius and event opacity through {@link TimelineCalendarHost.metrics},
 * and the background colour and image from the canvas, which stays painted
 * underneath the month.
 */
import { Menu, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { formatCalendarYear } from '../calendar/CalendarDateText';
import type { CalendarSystem } from '../calendar/types';
import type { EntityIconSource } from './EntityIcon';
import type { TimelineMetrics } from './TimelineStyle';
import { renderIconPreview } from './IconPreview';
import type { NativeItem } from './NativeTimelineRenderer';
import {
    buildMonthGrid, daySpanOf, layoutCalendarWeek, shiftMonth, weekdayIndex
} from './TimelineCalendarGrid';
import type { CalendarDaySpan, CalendarMonthGrid, CalendarMonthRef, CalendarWeekLayout } from './TimelineCalendarGrid';

/** Height of a week's day-number row, in pixels. */
const DAY_LABEL_PX = 30;
/** Chip rows a week always has room for: below that the month scrolls rather than squeezing. */
const MIN_LANES = 2;
/** Chip rows a week shows at most, however tall the pane, before the rest collapse into "+N more". */
const MAX_LANES = 12;
/** Pane width below which the month becomes an agenda list. */
const AGENDA_BELOW_PX = 600;
/** Same slop the canvas uses to tell a tap from a drag. */
const DRAG_SLOP_PX = 10;

/** What the panel needs from the renderer. Every method is one the renderer already has or shares. */
export interface TimelineCalendarHost {
    app: App;
    calendar(): CalendarSystem;
    /** Today on the absolute-day axis. */
    todayDay(): number;
    /** The absolute day an instant on the renderer's clock falls on. */
    dayOfTime(time: number): number;
    /** The events the calendar shows: the same filtered set the other views draw. */
    items(): NativeItem[];
    colorOf(item: NativeItem): string;
    /** How solid an event draws: certainty and inheritance fade, scaled by the theme. */
    alphaOf(item: NativeItem): number;
    /** Clock time an event starts at, when it has one, written as the canvas writes it. */
    timeOf(item: NativeItem): string | null;
    /** The theme's chip height, corner radius and opacity. */
    metrics(): TimelineMetrics;
    iconSourceFor(event: NativeItem['event']): EntityIconSource;
    photoUrl(source: EntityIconSource): string | null;
    isDraggable(item: NativeItem): boolean;
    isEditing(): boolean;
    isSelected(item: NativeItem): boolean;
    paneWidth(): number;
    showMonth(ref: CalendarMonthRef): void;
    showToday(): void;
    selectItem(item: NativeItem | null): void;
    openItem(item: NativeItem): void;
    /** Move an item by whole days, keeping its time of day and length. Saves through the renderer's move path. */
    moveItemByDays(item: NativeItem, days: number): Promise<void>;
}

interface CalendarDrag {
    item: NativeItem;
    chip: HTMLElement;
    week: HTMLElement;
    pointerId: number;
    x: number;
    y: number;
    grabDay: number;
    targetDay: number;
    draggable: boolean;
    active: boolean;
}

export class TimelineCalendarPanel {
    private readonly el: HTMLElement;
    private visible = false;
    private drag: CalendarDrag | null = null;
    private lastPointerType = 'mouse';
    private suppressClick = false;

    constructor(parent: HTMLElement, private readonly host: TimelineCalendarHost) {
        this.el = parent.createDiv('storyteller-timeline-calendar');
        this.el.setAttribute('role', 'region');
        this.el.setAttribute('aria-label', 'Story calendar');
        this.el.hide();
    }

    show(): void {
        this.visible = true;
        this.el.show();
    }

    hide(): void {
        this.visible = false;
        this.drag = null;
        this.el.hide();
    }

    destroy(): void {
        this.drag = null;
        this.el.remove();
    }

    render(ref: CalendarMonthRef): void {
        if (!this.visible) return;
        const cal = this.host.calendar();
        const grid = buildMonthGrid(cal, ref);
        const items = this.host.items().filter(item => Number.isFinite(item.start));
        const spans = new Map<string, CalendarDaySpan>();
        for (const item of items) {
            const span = daySpanOf(this.host.dayOfTime(item.start), this.host.dayOfTime(item.end));
            // Order breaks ties inside a day, so a morning event sits above an evening one.
            spans.set(item.id, { key: item.id, ...span, order: item.start });
        }
        const metrics = this.host.metrics();
        const laneHeight = calendarLaneHeight(metrics.eventHeight);
        this.el.empty();
        this.el.setCssProps({
            '--storyteller-timeline-calendar-lane-height': `${laneHeight}px`,
            '--storyteller-timeline-calendar-daynum-height': `${DAY_LABEL_PX}px`,
            '--storyteller-timeline-calendar-week-min': `${DAY_LABEL_PX + MIN_LANES * laneHeight + 6}px`,
            '--storyteller-timeline-calendar-radius': `${metrics.eventRadius + 2}px`,
        });
        const inMonth = Array.from(spans.values()).filter(span => span.lastDay >= grid.firstDay && span.firstDay <= grid.lastDay).length;
        this.renderHeader(cal, grid, inMonth);
        if (this.host.paneWidth() < AGENDA_BELOW_PX) this.renderAgenda(cal, grid, items, spans);
        else this.renderGrid(grid, items, spans, laneHeight);
    }

    private renderHeader(cal: CalendarSystem, grid: CalendarMonthGrid, eventCount: number): void {
        const header = this.el.createDiv('storyteller-timeline-calendar-header');
        const title = header.createDiv('storyteller-timeline-calendar-title');
        title.createSpan({ cls: 'storyteller-timeline-calendar-title-month', text: grid.monthName });
        title.createSpan({ cls: 'storyteller-timeline-calendar-title-year', text: formatCalendarYear(cal, grid.ref.year) });
        title.createSpan({
            cls: 'storyteller-timeline-calendar-title-count',
            text: eventCount === 1 ? '1 event' : `${eventCount} events`
        });

        const nav = header.createDiv('storyteller-timeline-calendar-nav-group');
        const today = nav.createEl('button', {
            cls: 'storyteller-timeline-calendar-today',
            text: 'Today',
            attr: { 'aria-label': 'Show today', 'title': 'Show today' }
        });
        today.addEventListener('click', () => this.host.showToday());

        const previous = nav.createEl('button', {
            cls: 'clickable-icon storyteller-timeline-calendar-nav',
            attr: { 'aria-label': 'Previous month', 'title': 'Previous month' }
        });
        setIcon(previous, 'chevron-left');
        previous.addEventListener('click', () => this.host.showMonth(shiftMonth(cal, grid.ref, -1)));

        const next = nav.createEl('button', {
            cls: 'clickable-icon storyteller-timeline-calendar-nav',
            attr: { 'aria-label': 'Next month', 'title': 'Next month' }
        });
        setIcon(next, 'chevron-right');
        next.addEventListener('click', () => this.host.showMonth(shiftMonth(cal, grid.ref, 1)));
    }

    private renderGrid(grid: CalendarMonthGrid, items: NativeItem[], spans: Map<string, CalendarDaySpan>, laneHeight: number): void {
        const board = this.el.createDiv('storyteller-timeline-calendar-board');
        board.setCssProps({ '--storyteller-timeline-calendar-columns': String(grid.columns) });
        board.addEventListener('click', event => {
            // Clicking the empty part of the board clears the selection, as the canvas does.
            if (event.target === board || (event.target as HTMLElement).hasClass('storyteller-timeline-calendar-day')) this.host.selectItem(null);
        });

        const weekdays = board.createDiv('storyteller-timeline-calendar-weekdays');
        grid.weekdays.forEach(name => weekdays.createDiv({ cls: 'storyteller-timeline-calendar-weekday', text: name, attr: { title: name } }));

        // The weeks share the board's height, so the month fills the pane, and
        // each week shows as many chip rows as its share of that height holds.
        const weekHeight = (board.clientHeight - weekdays.offsetHeight) / grid.rows;
        const lanes = calendarLanesFor(weekHeight, laneHeight);

        const itemByKey = new Map(items.map(item => [item.id, item]));
        const spanList = Array.from(spans.values());
        const dayByAbsolute = new Map(grid.days.map(day => [day.absoluteDay, day]));
        const todayDay = this.host.todayDay();

        for (let row = 0; row < grid.rows; row++) {
            const weekStart = grid.gridStart + row * grid.columns;
            let layout = layoutCalendarWeek(spanList, weekStart, grid.columns, grid.firstDay, grid.lastDay, lanes);
            // "+N more" takes a row of its own, so a week that overflows gives up its last chip row for it.
            if (layout.overflow.length && lanes > 1) layout = layoutCalendarWeek(spanList, weekStart, grid.columns, grid.firstDay, grid.lastDay, lanes - 1);
            this.renderWeek(board, grid, weekStart, layout, itemByKey, spans, dayByAbsolute, todayDay);
        }
    }

    private renderWeek(
        board: HTMLElement,
        grid: CalendarMonthGrid,
        weekStart: number,
        layout: CalendarWeekLayout,
        itemByKey: Map<string, NativeItem>,
        spans: Map<string, CalendarDaySpan>,
        dayByAbsolute: Map<number, CalendarMonthGrid['days'][number]>,
        todayDay: number,
    ): void {
        const week = board.createDiv('storyteller-timeline-calendar-week');
        week.setAttribute('data-week-start', String(weekStart));
        week.setAttribute('data-columns', String(grid.columns));
        week.setCssProps({ '--storyteller-timeline-calendar-lanes': String(Math.max(1, layout.lanes)) });

        // Backgrounds first, so the chips and labels paint over them.
        for (let column = 0; column < grid.columns; column++) {
            const absoluteDay = weekStart + column;
            const day = dayByAbsolute.get(absoluteDay);
            const cell = week.createDiv('storyteller-timeline-calendar-day');
            cell.setAttribute('data-day', String(absoluteDay));
            cell.setCssStyles({ gridColumn: String(column + 1), gridRow: '1 / -1' });
            if (!day) cell.addClass('is-outside');
            if (column === grid.columns - 1) cell.addClass('is-last-column');
            if (absoluteDay === todayDay) cell.addClass('is-today');
        }
        for (let column = 0; column < grid.columns; column++) {
            const absoluteDay = weekStart + column;
            const day = dayByAbsolute.get(absoluteDay);
            if (!day) continue;
            const label = week.createDiv('storyteller-timeline-calendar-daynum');
            label.setCssStyles({ gridColumn: String(column + 1), gridRow: '1' });
            label.toggleClass('is-today', absoluteDay === todayDay);
            label.createSpan({ cls: 'storyteller-timeline-calendar-daynum-value', text: String(day.day) });
            for (const holiday of day.holidays) {
                const tag = label.createDiv({ cls: 'storyteller-timeline-calendar-holiday', text: holiday.name, attr: { title: holiday.name } });
                if (holiday.color) tag.setCssProps({ '--storyteller-timeline-calendar-holiday-color': holiday.color });
            }
        }

        for (const segment of layout.segments) {
            const item = itemByKey.get(segment.key);
            if (!item) continue;
            const chip = week.createDiv('storyteller-timeline-calendar-chip');
            chip.setCssStyles({
                gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`,
                gridRow: String(segment.lane + 2),
            });
            chip.toggleClass('is-continued-before', segment.continuesBefore);
            chip.toggleClass('is-continued-after', segment.continuesAfter);
            chip.toggleClass('is-selected', this.host.isSelected(item));
            this.bindChip(chip, item, week);
            this.fillChip(chip, item, spans.get(item.id));
            if (item.event.dateTime) chip.setAttribute('title', `${item.event.name} (${item.event.dateTime})`);
            else chip.setAttribute('title', item.event.name);
        }

        // With overflow the last lane row is the "+N more" row.
        const moreRow = layout.lanes + 1;
        for (const overflow of layout.overflow) {
            const more = week.createEl('button', {
                cls: 'storyteller-timeline-calendar-more',
                text: `+${overflow.hidden} more`,
                attr: { 'aria-label': `Show ${overflow.hidden} more events` }
            });
            more.setCssStyles({ gridColumn: String(overflow.column + 1), gridRow: String(moreRow) });
            more.addEventListener('click', event => {
                const menu = new Menu();
                for (const key of overflow.keys) {
                    const item = itemByKey.get(key);
                    if (!item) continue;
                    menu.addItem(entry => entry.setTitle(item.event.name).onClick(() => this.host.openItem(item)));
                }
                menu.showAtMouseEvent(event);
            });
        }
    }

    /** Pointer handling for a chip: a tap selects (or opens, on touch, when already selected), a drag moves it in edit mode. */
    private bindChip(chip: HTMLElement, item: NativeItem, week: HTMLElement): void {
        const draggable = this.host.isEditing() && this.host.isDraggable(item);
        if (draggable) chip.addClass('is-draggable');

        chip.addEventListener('pointerdown', event => {
            this.lastPointerType = event.pointerType;
            // A new press starts a new gesture, so a drag whose click never came cannot swallow the next click.
            this.suppressClick = false;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            this.drag = {
                item, chip, week, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
                grabDay: this.dayInWeek(week, event.clientX), targetDay: NaN, draggable, active: false,
            };
            if (draggable) chip.setPointerCapture(event.pointerId);
        });

        chip.addEventListener('pointermove', event => {
            const drag = this.drag;
            if (!drag || drag.pointerId !== event.pointerId || !drag.draggable) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (!drag.active) {
                if (Math.hypot(dx, dy) <= DRAG_SLOP_PX) return;
                drag.active = true;
                drag.chip.addClass('is-dragging');
            }
            const target = this.dayAtPoint(event.clientX, event.clientY);
            if (target !== null) drag.targetDay = target;
            drag.chip.setCssStyles({ transform: `translate(${dx}px, ${dy}px)` });
            this.markDropTarget(drag.targetDay);
        });

        const finish = (event: PointerEvent, commit: boolean) => {
            const drag = this.drag;
            if (!drag || drag.pointerId !== event.pointerId) return;
            this.drag = null;
            if (chip.hasPointerCapture(event.pointerId)) chip.releasePointerCapture(event.pointerId);
            chip.removeClass('is-dragging');
            chip.setCssStyles({ transform: '' });
            this.markDropTarget(NaN);
            if (!drag.active) return;
            // The click that follows a drag must not also select or open the chip.
            this.suppressClick = true;
            const days = Number.isFinite(drag.targetDay) ? drag.targetDay - drag.grabDay : 0;
            if (commit && days !== 0) void this.host.moveItemByDays(drag.item, days);
        };
        chip.addEventListener('pointerup', event => finish(event, true));
        chip.addEventListener('pointercancel', event => finish(event, false));

        chip.addEventListener('click', event => {
            event.stopPropagation();
            if (this.suppressClick) { this.suppressClick = false; return; }
            const wasSelected = this.host.isSelected(item);
            this.host.selectItem(item);
            // Touch has no double click, so a second tap on the selected chip opens it.
            if (wasSelected && this.lastPointerType !== 'mouse') this.host.openItem(item);
        });
        chip.addEventListener('dblclick', () => {
            if (this.suppressClick) { this.suppressClick = false; return; }
            this.host.openItem(item);
        });
    }

    /** The absolute day under a horizontal position within a week row. */
    private dayInWeek(week: HTMLElement, x: number): number {
        const start = Number(week.getAttribute('data-week-start'));
        const columns = Number(week.getAttribute('data-columns')) || 1;
        const rect = week.getBoundingClientRect();
        const width = rect.width || 1;
        const column = Math.min(columns - 1, Math.max(0, Math.floor((x - rect.left) / width * columns)));
        return start + column;
    }

    /** The day under a point, or null when the point is not over a week row. */
    private dayAtPoint(x: number, y: number): number | null {
        const element = this.el.ownerDocument.elementFromPoint(x, y);
        const week = element?.closest<HTMLElement>('.storyteller-timeline-calendar-week');
        if (!week || !this.el.contains(week)) return null;
        return this.dayInWeek(week, x);
    }

    private markDropTarget(day: number): void {
        this.el.querySelectorAll('.is-drop-target').forEach(cell => cell.removeClass('is-drop-target'));
        if (!Number.isFinite(day)) return;
        this.el.querySelector(`[data-day="${day}"]`)?.addClass('is-drop-target');
    }

    /**
     * A chip's contents. An event over several days is a tinted bar; a one-day
     * event is its icon (or a dot in its colour), its start time and its name.
     * Grid chips and agenda rows both come through here.
     */
    private fillChip(chip: HTMLElement, item: NativeItem, span: CalendarDaySpan | undefined): void {
        const multiDay = !!span && span.lastDay > span.firstDay;
        chip.addClass(multiDay ? 'is-span' : 'is-single');
        chip.toggleClass('is-milestone', !!item.event.isMilestone);
        chip.setCssProps({
            '--storyteller-timeline-calendar-chip-color': this.host.colorOf(item),
            '--storyteller-timeline-calendar-chip-alpha': String(this.host.alphaOf(item)),
        });
        if (!this.appendIcon(chip, item)) chip.createSpan('storyteller-timeline-calendar-chip-dot');
        const time = multiDay ? null : this.host.timeOf(item);
        if (time) chip.createSpan({ cls: 'storyteller-timeline-calendar-chip-time', text: time });
        chip.createSpan({ cls: 'storyteller-timeline-calendar-chip-label', text: item.event.name });
    }

    /** The event's photo or icon, if it has one. False when nothing was added. */
    private appendIcon(parent: HTMLElement, item: NativeItem): boolean {
        const source = this.host.iconSourceFor(item.event);
        if (!source) return false;
        const url = this.host.photoUrl(source);
        if (url) {
            const image = parent.createEl('img', { cls: 'storyteller-timeline-calendar-icon is-image', attr: { alt: '' } });
            image.src = url;
            return true;
        }
        if (source.kind !== 'icon') return false;
        const holder = parent.createSpan({ cls: 'storyteller-timeline-calendar-icon' });
        renderIconPreview(holder, source.icon.raw, source.color ?? null, this.host.app);
        return true;
    }

    /** A month as a list of days with something on them. Taps open the event directly. */
    private renderAgenda(cal: CalendarSystem, grid: CalendarMonthGrid, items: NativeItem[], spans: Map<string, CalendarDaySpan>): void {
        const list = this.el.createDiv('storyteller-timeline-calendar-agenda');
        const todayDay = this.host.todayDay();
        const byDay = new Map<number, NativeItem[]>();
        for (const item of items) {
            const span = spans.get(item.id);
            if (!span) continue;
            for (let day = Math.max(span.firstDay, grid.firstDay); day <= Math.min(span.lastDay, grid.lastDay); day++) {
                const bucket = byDay.get(day) ?? [];
                bucket.push(item);
                byDay.set(day, bucket);
            }
        }
        for (const day of grid.days) {
            const dayItems = (byDay.get(day.absoluteDay) ?? []).sort((a, b) => a.start - b.start);
            if (!dayItems.length && !day.holidays.length) continue;
            const section = list.createDiv('storyteller-timeline-calendar-agenda-day');
            section.toggleClass('is-today', day.absoluteDay === todayDay);
            const weekday = grid.weekdays[weekdayIndex(cal, day.absoluteDay)] ?? '';
            const date = section.createDiv({ cls: 'storyteller-timeline-calendar-agenda-date', attr: { 'aria-label': `${weekday}, ${grid.monthName} ${day.day}` } });
            date.createSpan({ cls: 'storyteller-timeline-calendar-agenda-weekday', text: weekday.slice(0, 3) });
            date.createSpan({ cls: 'storyteller-timeline-calendar-agenda-daynum', text: String(day.day) });
            const entries = section.createDiv('storyteller-timeline-calendar-agenda-items');
            for (const holiday of day.holidays) {
                const tag = entries.createDiv({ cls: 'storyteller-timeline-calendar-holiday', text: holiday.name });
                if (holiday.color) tag.setCssProps({ '--storyteller-timeline-calendar-holiday-color': holiday.color });
            }
            for (const item of dayItems) {
                const row = entries.createEl('button', { cls: 'storyteller-timeline-calendar-agenda-item' });
                row.toggleClass('is-selected', this.host.isSelected(item));
                this.fillChip(row, item, spans.get(item.id));
                row.addEventListener('click', () => this.host.openItem(item));
            }
        }
        if (!list.hasChildNodes()) list.createDiv({ cls: 'storyteller-timeline-calendar-empty', text: 'No dated events this month.' });
    }
}

/** One chip row's height for the theme's event height: the chip plus a little air. */
export function calendarLaneHeight(eventHeight: number): number {
    return Math.round(Math.min(32, Math.max(18, eventHeight)));
}

/** Chip rows that fit in a week of the given height, within the floor and ceiling the grid keeps. */
export function calendarLanesFor(weekHeight: number, laneHeight: number): number {
    if (!Number.isFinite(weekHeight) || laneHeight <= 0) return MIN_LANES;
    return Math.min(MAX_LANES, Math.max(MIN_LANES, Math.floor((weekHeight - DAY_LABEL_PX - 4) / laneHeight)));
}
