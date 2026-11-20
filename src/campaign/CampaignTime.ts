/**
 * Campaign time: how long a scene, choice or encounter takes, and moving the
 * campaign's in-world date forward by it in the story's own calendar.
 *
 * Durations are typed the way a DM says them ("2 hours", "3 days", "1d 4h",
 * "a week", "1 month"). Months and years step through the calendar's real
 * month lengths; weeks use the calendar's own week. Hours and minutes only
 * mean something on a calendar that keeps time of day.
 */
import type { CalendarDate, CalendarSystem } from '../calendar/types';
import { fromAbsolute, monthLength, monthsInYear, toAbsolute } from '../calendar/CalendarEngine';
import { formatInCalendar, parseInCalendar } from '../calendar/CalendarDateText';

export interface CampaignDuration {
    years: number;
    months: number;
    weeks: number;
    days: number;
    minutes: number;
}

const UNITS: ReadonlyArray<{ pattern: RegExp; key: keyof CampaignDuration; scale: number }> = [
    { pattern: /^(y|yr|yrs|year|years)$/, key: 'years', scale: 1 },
    { pattern: /^(mo|mon|month|months)$/, key: 'months', scale: 1 },
    { pattern: /^(w|wk|wks|week|weeks)$/, key: 'weeks', scale: 1 },
    { pattern: /^(d|day|days)$/, key: 'days', scale: 1 },
    { pattern: /^(h|hr|hrs|hour|hours)$/, key: 'minutes', scale: 60 },
    { pattern: /^(m|min|mins|minute|minutes)$/, key: 'minutes', scale: 1 },
];

function emptyDuration(): CampaignDuration {
    return { years: 0, months: 0, weeks: 0, days: 0, minutes: 0 };
}

/** Parse "2 hours", "1d 4h", "a week", "1 month 2 days". Returns null for anything else. */
export function parseCampaignDuration(text: string | undefined): CampaignDuration | null {
    const source = text?.trim().toLowerCase();
    if (!source) return null;
    const duration = emptyDuration();
    const tokens = source.replace(/,|\band\b/g, ' ').match(/(\d+(?:\.\d+)?|an?)\s*([a-z]+)/g);
    if (!tokens) return null;
    // Everything typed must be understood, so "3 dayz" is an error and not 0.
    if (tokens.join('').replace(/\s+/g, '') !== source.replace(/,|\band\b/g, '').replace(/\s+/g, '')) return null;
    for (const token of tokens) {
        const match = token.match(/^(\d+(?:\.\d+)?|an?)\s*([a-z]+)$/);
        if (!match) return null;
        const amount = match[1] === 'a' || match[1] === 'an' ? 1 : Number(match[1]);
        const unit = UNITS.find(candidate => candidate.pattern.test(match[2]));
        if (!unit || !Number.isFinite(amount)) return null;
        duration[unit.key] += amount * unit.scale;
    }
    return duration;
}

/** True when nothing would move. */
export function isZeroDuration(duration: CampaignDuration): boolean {
    return !duration.years && !duration.months && !duration.weeks && !duration.days && !duration.minutes;
}

/** Add two durations, e.g. a choice's own time and an encounter it rolled. */
export function addDurations(a: CampaignDuration, b: CampaignDuration): CampaignDuration {
    return {
        years: a.years + b.years,
        months: a.months + b.months,
        weeks: a.weeks + b.weeks,
        days: a.days + b.days,
        minutes: a.minutes + b.minutes,
    };
}

/** True when the calendar keeps time of day, so hours and minutes can move it. */
export function calendarKeepsTime(cal: CalendarSystem): boolean {
    return cal.baseUnit === 'minute' && cal.unitsPerDay > 1;
}

/** Why a duration cannot be used with this calendar, or null when it can. */
export function durationProblem(text: string | undefined, cal: CalendarSystem): string | null {
    if (!text?.trim()) return null;
    const duration = parseCampaignDuration(text);
    if (!duration) return 'Use amounts like 2 hours, 3 days, 1 week or 1 month.';
    if (duration.minutes % (24 * 60) !== 0 && !calendarKeepsTime(cal)) {
        return 'This calendar has no time of day, so use days, weeks, months or years.';
    }
    return null;
}

/** Plain text for a duration, largest unit first: "1 month 2 days 3 hours". */
export function formatCampaignDuration(duration: CampaignDuration): string {
    const parts: string[] = [];
    const push = (value: number, one: string, many: string) => {
        if (value) parts.push(`${value} ${value === 1 ? one : many}`);
    };
    push(duration.years, 'year', 'years');
    push(duration.months, 'month', 'months');
    push(duration.weeks, 'week', 'weeks');
    push(duration.days, 'day', 'days');
    const hours = Math.floor(duration.minutes / 60);
    push(hours, 'hour', 'hours');
    push(duration.minutes % 60, 'minute', 'minutes');
    return parts.join(' ') || '0 days';
}

/** Step months and years through the calendar, keeping the day where the new month allows it. */
function addMonths(cal: CalendarSystem, date: CalendarDate, months: number): CalendarDate {
    let { year, month } = date;
    let remaining = Math.trunc(months);
    while (remaining > 0) {
        month++;
        if (month >= monthsInYear(cal, year).length) { month = 0; year++; }
        remaining--;
    }
    while (remaining < 0) {
        month--;
        if (month < 0) { year--; month = monthsInYear(cal, year).length - 1; }
        remaining++;
    }
    return { ...date, year, month, day: Math.min(date.day, monthLength(cal, year, month)) };
}

function addYears(cal: CalendarSystem, date: CalendarDate, years: number): CalendarDate {
    const year = date.year + Math.trunc(years);
    const month = Math.min(date.month, monthsInYear(cal, year).length - 1);
    return { ...date, year, month, day: Math.min(date.day, monthLength(cal, year, month)) };
}

/**
 * Move a date written in the calendar forward by a duration. Returns the new
 * date text, or null when the date does not parse in this calendar. The result
 * keeps a time of day when the calendar has one and the date or duration uses it.
 */
export function advanceCampaignDate(dateText: string, duration: CampaignDuration, cal: CalendarSystem): string | null {
    const parsed = parseInCalendar(dateText, cal);
    if (!parsed) return null;
    let date = addYears(cal, parsed.date, duration.years);
    date = addMonths(cal, date, duration.months);
    const weekLength = cal.week?.days.length || 7;
    const keepsTime = calendarKeepsTime(cal);
    const wholeDays = duration.weeks * weekLength + duration.days + (keepsTime ? 0 : Math.floor(duration.minutes / (24 * 60)));
    const units = keepsTime ? (date.unitOfDay ?? 0) + duration.minutes * (cal.unitsPerDay / (24 * 60)) : 0;
    const carryDays = keepsTime ? Math.floor(units / cal.unitsPerDay) : 0;
    const unitOfDay = keepsTime ? units - carryDays * cal.unitsPerDay : undefined;
    const absoluteDay = Math.floor(toAbsolute(cal, { ...date, unitOfDay: 0 }).absoluteDay) + Math.floor(wholeDays) + carryDays;
    const next = { ...fromAbsolute(cal, { absoluteDay }), unitOfDay };
    const showTime = keepsTime && (parsed.precision === 'time' || duration.minutes % (24 * 60) !== 0);
    return formatInCalendar(next, cal, showTime ? 'time' : 'day');
}

/** A date range the timeline reads as one span: "start to end", or just the start when they match. */
export function campaignDateRange(start: string, end: string | undefined): string {
    return end && end !== start ? `${start} to ${end}` : start;
}
