/**
 * The Calendar view as an image: one or more month grids painted onto a
 * canvas, with the same week rows and chip lanes the live grid uses. Export
 * shows every event, so lanes are never capped into "+N more".
 */
import type { CalendarSystem } from '../calendar/types';
import {
    buildMonthGrid, layoutCalendarWeek, monthOfDay, shiftMonth,
    type CalendarDaySpan, type CalendarMonthGrid, type CalendarMonthRef,
} from './TimelineCalendarGrid';

/** One event to draw: its whole-day span, label and an already resolved colour. */
export interface CalendarImageChip extends CalendarDaySpan {
    label: string;
    color: string;
}

/** Colours and font read from the theme, so the image matches what is on screen. */
export interface CalendarImageTheme {
    background: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    font: string;
}

/** A full export covers at most this many months, so a long history stays a usable file. */
export const MAX_EXPORT_MONTHS = 24;

const WIDTH = 1400;
const SCALE = 2;
const PAD = 24;
const TITLE_HEIGHT = 44;
const WEEKDAY_HEIGHT = 26;
const DAY_LABEL_HEIGHT = 22;
const LANE_HEIGHT = 22;
const MONTH_GAP = 28;
/** Enough lanes that an export never hides an event. */
const EXPORT_LANES = 1000;

/** The months from the one holding `firstDay` through the one holding `lastDay`, capped. */
export function calendarImageMonths(cal: CalendarSystem, firstDay: number, lastDay: number, max = MAX_EXPORT_MONTHS): CalendarMonthRef[] {
    const last = monthOfDay(cal, Math.max(firstDay, lastDay));
    const months: CalendarMonthRef[] = [];
    let ref = monthOfDay(cal, firstDay);
    while (months.length < max) {
        months.push(ref);
        if (ref.year === last.year && ref.month === last.month) break;
        ref = shiftMonth(cal, ref, 1);
    }
    return months;
}

/** Height in CSS pixels one month takes, from how many lanes each of its weeks needs. */
function monthHeight(grid: CalendarMonthGrid, chips: readonly CalendarImageChip[]): number {
    let height = TITLE_HEIGHT + WEEKDAY_HEIGHT;
    for (let row = 0; row < grid.rows; row++) {
        const weekStart = grid.gridStart + row * grid.columns;
        const layout = layoutCalendarWeek(chips, weekStart, grid.columns, grid.firstDay, grid.lastDay, EXPORT_LANES);
        height += DAY_LABEL_HEIGHT + Math.max(1, layout.lanes) * LANE_HEIGHT;
    }
    return height;
}

function truncate(ctx: CanvasRenderingContext2D, value: string, width: number): string {
    if (ctx.measureText(value).width <= width) return value;
    let text = value;
    while (text.length > 1 && ctx.measureText(`${text}…`).width > width) text = text.slice(0, -1);
    return `${text}…`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

/** Paint the given months, one under the other, onto a new canvas. */
export function paintCalendarImage(
    doc: Document,
    cal: CalendarSystem,
    months: readonly CalendarMonthRef[],
    chips: readonly CalendarImageChip[],
    theme: CalendarImageTheme,
): HTMLCanvasElement | null {
    const grids = months.map(ref => buildMonthGrid(cal, ref));
    const height = PAD * 2 + grids.reduce((total, grid) => total + monthHeight(grid, chips), 0) + MONTH_GAP * Math.max(0, grids.length - 1);
    const canvas = doc.createElement('canvas');
    canvas.width = WIDTH * SCALE;
    canvas.height = Math.ceil(height * SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, WIDTH, height);
    ctx.textBaseline = 'middle';

    let y = PAD;
    for (const grid of grids) {
        y = paintMonth(ctx, grid, chips, theme, y) + MONTH_GAP;
    }
    return canvas;
}

function paintMonth(
    ctx: CanvasRenderingContext2D,
    grid: CalendarMonthGrid,
    chips: readonly CalendarImageChip[],
    theme: CalendarImageTheme,
    top: number,
): number {
    const inner = WIDTH - PAD * 2;
    const column = inner / grid.columns;
    let y = top;

    ctx.fillStyle = theme.text;
    ctx.font = `600 20px ${theme.font}`;
    ctx.fillText(`${grid.monthName} ${grid.ref.year}`, PAD, y + TITLE_HEIGHT / 2);
    y += TITLE_HEIGHT;

    ctx.fillStyle = theme.muted;
    ctx.font = `600 12px ${theme.font}`;
    grid.weekdays.forEach((name, index) => {
        ctx.fillText(truncate(ctx, name, column - 12), PAD + index * column + 6, y + WEEKDAY_HEIGHT / 2);
    });
    y += WEEKDAY_HEIGHT;

    const dayByAbsolute = new Map(grid.days.map(day => [day.absoluteDay, day]));
    for (let row = 0; row < grid.rows; row++) {
        const weekStart = grid.gridStart + row * grid.columns;
        const layout = layoutCalendarWeek(chips, weekStart, grid.columns, grid.firstDay, grid.lastDay, EXPORT_LANES);
        const rowHeight = DAY_LABEL_HEIGHT + Math.max(1, layout.lanes) * LANE_HEIGHT;

        for (let index = 0; index < grid.columns; index++) {
            const x = PAD + index * column;
            const day = dayByAbsolute.get(weekStart + index);
            ctx.strokeStyle = theme.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, column, rowHeight);
            if (!day) continue;
            ctx.fillStyle = theme.text;
            ctx.font = `600 12px ${theme.font}`;
            ctx.fillText(String(day.day), x + 6, y + DAY_LABEL_HEIGHT / 2);
            const holiday = day.holidays[0];
            if (holiday) {
                ctx.fillStyle = holiday.color || theme.accent;
                ctx.font = `11px ${theme.font}`;
                const numberWidth = ctx.measureText(String(day.day)).width + 14;
                ctx.fillText(truncate(ctx, holiday.name, column - numberWidth - 6), x + numberWidth, y + DAY_LABEL_HEIGHT / 2);
            }
        }

        const chipByKey = new Map(chips.map(chip => [chip.key, chip]));
        for (const segment of layout.segments) {
            const chip = chipByKey.get(segment.key);
            if (!chip) continue;
            const x = PAD + segment.startColumn * column + 3;
            const width = (segment.endColumn - segment.startColumn + 1) * column - 6;
            const chipY = y + DAY_LABEL_HEIGHT + segment.lane * LANE_HEIGHT + 2;
            const middle = chipY + (LANE_HEIGHT - 4) / 2;
            // As on screen: an event over several days is a tinted bar, a one-day event a dot and its name.
            ctx.fillStyle = chip.color;
            if (chip.lastDay > chip.firstDay) {
                ctx.globalAlpha = 0.3;
                roundedRect(ctx, x, chipY, width, LANE_HEIGHT - 4, 5);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.beginPath();
            ctx.arc(x + 10, middle, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = theme.text;
            ctx.font = `12px ${theme.font}`;
            ctx.fillText(truncate(ctx, chip.label, width - 26), x + 20, middle);
        }
        y += rowHeight;
    }
    return y;
}
