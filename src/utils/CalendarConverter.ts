/**
 * CalendarConverter - Level 3 Custom Calendar Timeline Feature
 *
 * Comprehensive utility for converting dates between calendar systems,
 * handling custom time units, leap years, intercalary days, and lookup tables.
 *
 * Features:
 * - Multi-calendar date conversion
 * - Custom time units (20-hour days, etc.)
 * - Lookup table support for irregular calendars
 * - Intercalary day handling
 * - Leap year rule application
 * - Unix timestamp conversion for vis-timeline
 * - Formatted date display
 */

import {
    Calendar,
    CalendarDate,
    CalendarLookupEntry,
    LeapYearRule,
    IntercalaryDay,
    CalendarMonth
} from '../types';

/**
 * Conversion result containing both calendars' dates
 */
export interface ConversionResult {
    /** Source calendar date */
    sourceDate: CalendarDate;
    /** Target calendar date */
    targetDate: CalendarDate;
    /** Unix timestamp (milliseconds) */
    timestamp: number;
    /** Precision of the conversion */
    precision: 'year' | 'month' | 'day' | 'time';
    /** Any conversion notes or warnings */
    notes?: string[];
}

/**
 * Internal representation of a date with absolute day offset
 */
interface AbsoluteDate {
    /** Absolute day offset from epoch (day 0) */
    dayOffset: number;
    /** Time component in milliseconds within the day */
    timeOfDay: number;
    /** Source calendar */
    calendar: Calendar;
    /** Original date */
    date: CalendarDate;
}

/**
 * CalendarConverter class for multi-calendar date conversions
 */
export class CalendarConverter {
    /** Milliseconds per day in Gregorian calendar (constant) */
    private static readonly MS_PER_GREGORIAN_DAY = 24 * 60 * 60 * 1000;

    /** Epoch date for Gregorian calendar (Unix epoch: 1970-01-01) */
    private static readonly GREGORIAN_EPOCH_YEAR = 1970;
    private static readonly GREGORIAN_EPOCH_MONTH = 1;
    private static readonly GREGORIAN_EPOCH_DAY = 1;

    /**
     * Convert a date from one calendar to another
     */
    static convert(
        sourceDate: CalendarDate,
        sourceCalendar: Calendar,
        targetCalendar: Calendar
    ): ConversionResult {
        const notes: string[] = [];

        // Step 1: Convert source date to absolute day offset
        const absoluteDate = this.toAbsoluteDate(sourceDate, sourceCalendar);

        // Step 2: Convert absolute date to target calendar
        const targetDate = this.fromAbsoluteDate(absoluteDate, targetCalendar);

        // Step 3: Calculate Unix timestamp for vis-timeline
        const timestamp = this.toUnixTimestamp(absoluteDate);

        // Determine precision
        let precision: 'year' | 'month' | 'day' | 'time' = 'day';
        if (sourceDate.time) {
            precision = 'time';
        } else if (sourceDate.day === undefined || sourceDate.day === 0) {
            if (sourceDate.month === undefined || sourceDate.month === 0) {
                precision = 'year';
            } else {
                precision = 'month';
            }
        }

        return {
            sourceDate,
            targetDate,
            timestamp,
            precision,
            notes: notes.length > 0 ? notes : undefined
        };
    }

    /**
     * Convert a calendar date to absolute day offset from epoch
     */
    private static toAbsoluteDate(date: CalendarDate, calendar: Calendar): AbsoluteDate {
        let dayOffset = 0;
        let timeOfDay = 0;

        // Check if this calendar uses a lookup table
        if (calendar.isLookupTable && calendar.lookupTable) {
            dayOffset = this.lookupAbsoluteDayOffset(date, calendar.lookupTable);
        } else {
            // Calculate using regular calendar math
            dayOffset = this.calculateDayOffset(date, calendar);
        }

        // Calculate time of day component
        if (date.time) {
            timeOfDay = this.parseTimeOfDay(date.time, calendar);
        }

        return {
            dayOffset,
            timeOfDay,
            calendar,
            date
        };
    }

    /**
     * Convert absolute day offset to calendar date
     */
    private static fromAbsoluteDate(absoluteDate: AbsoluteDate, targetCalendar: Calendar): CalendarDate {
        // Check if target calendar uses a lookup table
        if (targetCalendar.isLookupTable && targetCalendar.lookupTable) {
            return this.lookupDateFromOffset(absoluteDate.dayOffset, targetCalendar.lookupTable, absoluteDate.timeOfDay, targetCalendar);
        } else {
            // Calculate using regular calendar math
            return this.calculateDateFromOffset(absoluteDate.dayOffset, targetCalendar, absoluteDate.timeOfDay);
        }
    }

    /**
     * Calculate day offset from epoch for regular calendars
     * Supports both positive (future) and negative (historical) offsets
     */
    private static calculateDayOffset(date: CalendarDate, calendar: Calendar): number {
        // Use reference date as epoch if available
        const epochYear = calendar.referenceDate?.year || 0;

        // Calculate total days from years
        let totalDays = 0;

        if (date.year >= epochYear) {
            // Date is at or after epoch - count forward
            for (let y = epochYear; y < date.year; y++) {
                totalDays += this.getDaysInYear(y, calendar);
            }
        } else {
            // Date is before epoch - count backward (negative offset)
            for (let y = epochYear - 1; y >= date.year; y--) {
                totalDays -= this.getDaysInYear(y, calendar);
            }
        }

        // Add days for months in the current year
        if (typeof date.month === 'number' && date.month > 0) {
            for (let m = 1; m < date.month; m++) {
                totalDays += this.getDaysInMonth(m, date.year, calendar);
            }
        } else if (typeof date.month === 'string' && calendar.months) {
            // Find month by name
            const monthIndex = calendar.months.findIndex(m => m.name === date.month);
            if (monthIndex >= 0) {
                for (let m = 0; m < monthIndex; m++) {
                    totalDays += calendar.months[m].days;
                }
            }
        }

        // Add days in the current month
        if (date.day > 0) {
            totalDays += date.day - 1; // -1 because day 1 is the first day
        }

        return totalDays;
    }

    /**
     * Calculate date from day offset for regular calendars
     * Supports both positive and negative offsets
     */
    private static calculateDateFromOffset(dayOffset: number, calendar: Calendar, timeOfDay: number): CalendarDate {
        const epochYear = calendar.referenceDate?.year || 0;

        // Validate calendar has required fields
        if (!calendar.referenceDate) {
            console.warn('CalendarConverter: Calendar missing referenceDate, using year 0 as epoch');
        }

        let remainingDays = dayOffset;
        let year = epochYear;

        // Find the year - handle both positive and negative offsets
        if (remainingDays >= 0) {
            // Positive offset - move forward from epoch
            while (remainingDays > 0) {
                const daysInYear = this.getDaysInYear(year, calendar);
                if (remainingDays >= daysInYear) {
                    remainingDays -= daysInYear;
                    year++;
                } else {
                    break;
                }
            }
        } else {
            // Negative offset - move backward from epoch
            while (remainingDays < 0) {
                year--;
                const daysInYear = this.getDaysInYear(year, calendar);
                remainingDays += daysInYear;
            }
        }

        // Find the month
        let month: string | number = 1;
        let monthName: string | undefined;

        if (calendar.months && calendar.months.length > 0) {
            let monthFound = false;
            for (let i = 0; i < calendar.months.length; i++) {
                const daysInMonth = calendar.months[i].days;
                if (remainingDays >= daysInMonth) {
                    remainingDays -= daysInMonth;
                } else {
                    month = i + 1;
                    monthName = calendar.months[i].name;
                    monthFound = true;
                    break;
                }
            }

            // If we exhausted all months without finding a match, we have too many remaining days
            // This indicates the date is in the next year or there's a calculation error
            if (!monthFound) {
                console.warn(`CalendarConverter: Remaining days (${remainingDays}) exceed all months in year ${year}. Using last month and adjusting.`);
                // Wrap to last month, last day
                const lastMonthIndex = calendar.months.length - 1;
                month = lastMonthIndex + 1;
                monthName = calendar.months[lastMonthIndex].name;
                // Cap the day at the last day of the last month to avoid invalid dates
                remainingDays = calendar.months[lastMonthIndex].days - 1;
            }
        } else {
            // Fallback to numbered months
            month = Math.floor(remainingDays / 30) + 1;
            remainingDays = remainingDays % 30;
        }

        // Day is the remaining days + 1
        const day = remainingDays + 1;

        // Format time if present
        let time: string | undefined;
        if (timeOfDay > 0) {
            time = this.formatTimeOfDay(timeOfDay, calendar);
        }

        return {
            year,
            month: monthName || month,
            day,
            time
        };
    }

    /**
     * Lookup absolute day offset from lookup table
     */
    private static lookupAbsoluteDayOffset(date: CalendarDate, lookupTable: CalendarLookupEntry[]): number {
        // Find exact match in lookup table
        const entry = lookupTable.find(e =>
            e.year === date.year &&
            (e.month === date.month ||
             (typeof e.month === 'number' && typeof date.month === 'number' && e.month === date.month)) &&
            e.day === date.day
        );

        if (entry) {
            return entry.absoluteDayOffset;
        }

        // If no exact match, find closest and interpolate
        const closestEntry = this.findClosestLookupEntry(date, lookupTable);
        if (closestEntry) {
            // Simple linear interpolation (can be improved)
            return closestEntry.absoluteDayOffset;
        }

        // Fallback: return 0
        console.warn('CalendarConverter: No lookup entry found for date', date);
        return 0;
    }

    /**
     * Lookup date from offset using lookup table
     */
    private static lookupDateFromOffset(dayOffset: number, lookupTable: CalendarLookupEntry[], timeOfDay: number, calendar: Calendar): CalendarDate {
        // Find exact match
        const entry = lookupTable.find(e => e.absoluteDayOffset === dayOffset);

        if (entry) {
            const time = timeOfDay > 0 ? this.formatTimeOfDay(timeOfDay, calendar) : undefined;
            return {
                year: entry.year,
                month: entry.month,
                day: entry.day,
                time
            };
        }

        // Find closest entries for interpolation
        const before = lookupTable.filter(e => e.absoluteDayOffset < dayOffset)
            .sort((a, b) => b.absoluteDayOffset - a.absoluteDayOffset)[0];
        const after = lookupTable.filter(e => e.absoluteDayOffset > dayOffset)
            .sort((a, b) => a.absoluteDayOffset - b.absoluteDayOffset)[0];

        if (before && after) {
            // Linear interpolation
            const ratio = (dayOffset - before.absoluteDayOffset) / (after.absoluteDayOffset - before.absoluteDayOffset);
            // For now, just return the closer one
            const closest = ratio < 0.5 ? before : after;
            const time = timeOfDay > 0 ? this.formatTimeOfDay(timeOfDay, calendar) : undefined;
            return {
                year: closest.year,
                month: closest.month,
                day: closest.day,
                time
            };
        }

        // Fallback
        console.warn('CalendarConverter: No lookup entry found for offset', dayOffset);
        return { year: 0, month: 0, day: 0 };
    }

    /**
     * Find closest lookup entry to a given date
     */
    private static findClosestLookupEntry(date: CalendarDate, lookupTable: CalendarLookupEntry[]): CalendarLookupEntry | null {
        if (lookupTable.length === 0) return null;

        // Simple distance function (can be improved)
        const distance = (entry: CalendarLookupEntry) => {
            const yearDiff = Math.abs(entry.year - date.year) * 365;
            const monthDiff = typeof entry.month === 'number' && typeof date.month === 'number'
                ? Math.abs(entry.month - date.month) * 30
                : 0;
            const dayDiff = Math.abs(entry.day - date.day);
            return yearDiff + monthDiff + dayDiff;
        };

        return lookupTable.reduce((closest, entry) => {
            return distance(entry) < distance(closest) ? entry : closest;
        });
    }

    /**
     * Get number of days in a year, accounting for leap years
     */
    private static getDaysInYear(year: number, calendar: Calendar): number {
        // Check if it's a leap year
        const isLeap = this.isLeapYear(year, calendar);

        // Base days per year
        let days = calendar.daysPerYear || 365;

        // Add leap days if applicable
        if (isLeap && calendar.leapYearRules) {
            for (const rule of calendar.leapYearRules) {
                days += rule.daysAdded || 0;
            }
        }

        return days;
    }

    /**
     * Get number of days in a month
     * (Made public for backward compatibility)
     */
    static getDaysInMonth(month: number, year: number, calendar: Calendar): number {
        if (!calendar.months || month < 1 || month > calendar.months.length) {
            return 30; // Default fallback
        }

        return calendar.months[month - 1].days;
    }

    /**
     * Check if a year is a leap year
     */
    private static isLeapYear(year: number, calendar: Calendar): boolean {
        if (!calendar.leapYearRules || calendar.leapYearRules.length === 0) {
            return false;
        }

        for (const rule of calendar.leapYearRules) {
            if (rule.type === 'divisible') {
                // Gregorian-style leap year rules
                if (rule.divisor && year % rule.divisor === 0) {
                    if (rule.exceptionDivisor && year % rule.exceptionDivisor === 0) {
                        if (rule.exceptionExceptionDivisor && year % rule.exceptionExceptionDivisor === 0) {
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            } else if (rule.type === 'modulo') {
                // Modulo-based rules
                if (rule.divisor && year % rule.divisor === 0) {
                    return true;
                }
            } else if (rule.type === 'custom') {
                // Custom function (would need to be implemented separately)
                console.warn('Custom leap year functions not yet supported');
                return false;
            }
        }

        return false;
    }

    /**
     * Parse time of day string to milliseconds within the day
     */
    private static parseTimeOfDay(timeString: string, calendar: Calendar): number {
        // Parse HH:MM:SS or HH:MM format
        const parts = timeString.split(':');
        if (parts.length < 2) return 0;

        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const seconds = parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0;

        // Use custom time units if defined
        const hoursPerDay = calendar.hoursPerDay || 24;
        const minutesPerHour = calendar.minutesPerHour || 60;
        const secondsPerMinute = calendar.secondsPerMinute || 60;

        // Calculate milliseconds
        const msPerSecond = 1000;
        const msPerMinute = secondsPerMinute * msPerSecond;
        const msPerHour = minutesPerHour * msPerMinute;

        return (hours * msPerHour) + (minutes * msPerMinute) + (seconds * msPerSecond);
    }

    /**
     * Format milliseconds within day to time string
     */
    private static formatTimeOfDay(milliseconds: number, calendar: Calendar): string {
        const hoursPerDay = calendar.hoursPerDay || 24;
        const minutesPerHour = calendar.minutesPerHour || 60;
        const secondsPerMinute = calendar.secondsPerMinute || 60;

        const msPerSecond = 1000;
        const msPerMinute = secondsPerMinute * msPerSecond;
        const msPerHour = minutesPerHour * msPerMinute;

        const hours = Math.floor(milliseconds / msPerHour);
        const minutes = Math.floor((milliseconds % msPerHour) / msPerMinute);
        const seconds = Math.floor((milliseconds % msPerMinute) / msPerSecond);

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Convert absolute date to Unix timestamp (for vis-timeline)
     */
    private static toUnixTimestamp(absoluteDate: AbsoluteDate): number {
        const calendar = absoluteDate.calendar;

        // Get the Unix timestamp for the calendar's epoch
        const epochTimestamp = this.getEpochTimestamp(calendar);

        // absoluteDate.dayOffset is relative to calendar's epoch, so add it to epoch timestamp
        const dayMs = absoluteDate.dayOffset * this.MS_PER_GREGORIAN_DAY;
        const totalMs = epochTimestamp + dayMs + absoluteDate.timeOfDay;

        return totalMs;
    }

    /**
     * Get Unix timestamp for a calendar's epoch
     * Uses epochGregorianDate if available, otherwise falls back to referenceDate year
     */
    private static getEpochTimestamp(calendar: Calendar): number {
        // Prefer epochGregorianDate if available (most accurate)
        if (calendar.epochGregorianDate) {
            try {
                const epochDate = new Date(calendar.epochGregorianDate);
                if (!isNaN(epochDate.getTime())) {
                    console.log(`[CalendarConverter] Using epochGregorianDate for ${calendar.name}:`, calendar.epochGregorianDate, '→', epochDate.getTime());
                    return epochDate.getTime();
                } else {
                    console.warn(`[CalendarConverter] Invalid epochGregorianDate for ${calendar.name}:`, calendar.epochGregorianDate);
                }
            } catch (error) {
                console.warn(`[CalendarConverter] Error parsing epochGregorianDate for ${calendar.name}:`, error);
            }
        }

        // Fallback: use referenceDate year with approximation
        if (calendar.referenceDate && calendar.referenceDate.year) {
            const refYear = calendar.referenceDate.year;
            console.warn(`[CalendarConverter] Calendar "${calendar.name}" missing epochGregorianDate. Using referenceDate.year (${refYear}) with approximation. This may be inaccurate.`);

            // Simple approximation: (year - 1970) * 365.25 days
            // This is rough but better than treating epoch as Unix epoch
            const yearDiff = refYear - this.GREGORIAN_EPOCH_YEAR;
            return yearDiff * 365.25 * this.MS_PER_GREGORIAN_DAY;
        }

        // Last resort: assume Unix epoch
        console.error(`[CalendarConverter] Calendar "${calendar.name}" has no epochGregorianDate or referenceDate. Defaulting to Unix epoch (1970-01-01). Timeline positioning will be INCORRECT.`);
        return 0;
    }

    /**
     * Convert Unix timestamp to calendar date
     */
    static fromUnixTimestamp(timestamp: number, calendar: Calendar): CalendarDate {
        // Validate input
        if (typeof timestamp !== 'number' || isNaN(timestamp)) {
            console.error('CalendarConverter: Invalid timestamp:', timestamp);
            return { year: 0, month: 0, day: 0 };
        }

        // Get the timestamp of the calendar's epoch
        const epochTimestamp = this.getEpochTimestamp(calendar);

        // Calculate offset from calendar's epoch
        const msSinceEpoch = timestamp - epochTimestamp;
        const dayOffset = Math.floor(msSinceEpoch / this.MS_PER_GREGORIAN_DAY);
        const timeOfDay = msSinceEpoch % this.MS_PER_GREGORIAN_DAY;

        return this.calculateDateFromOffset(dayOffset, calendar, timeOfDay);
    }

    /**
     * Format a calendar date for display
     */
    static formatDate(date: CalendarDate, calendar: Calendar, format: 'short' | 'long' | 'full' = 'long'): string {
        const parts: string[] = [];

        // Day
        if (date.day !== undefined && date.day > 0) {
            parts.push(date.day.toString());
        }

        // Month
        if (date.month) {
            if (typeof date.month === 'string') {
                parts.push(date.month);
            } else if (calendar.months && date.month > 0 && date.month <= calendar.months.length) {
                parts.push(calendar.months[date.month - 1].name);
            } else {
                parts.push(`Month ${date.month}`);
            }
        }

        // Year
        parts.push(date.year.toString());

        // Time
        if (format === 'full' && date.time) {
            parts.push(date.time);
        }

        return parts.join(' ');
    }

    /**
     * Get the month name for a given month number or name
     */
    static getMonthName(month: string | number, calendar: Calendar): string {
        if (typeof month === 'string') {
            return month;
        }

        if (calendar.months && month > 0 && month <= calendar.months.length) {
            return calendar.months[month - 1].name;
        }

        return `Month ${month}`;
    }

    /**
     * Get all month names from a calendar
     */
    static getMonthNames(calendar: Calendar): string[] {
        if (calendar.months && calendar.months.length > 0) {
            return calendar.months.map(m => m.name);
        }

        // Fallback: generate numbered months
        const monthCount = Math.ceil((calendar.daysPerYear || 365) / 30);
        return Array.from({ length: monthCount }, (_, i) => `Month ${i + 1}`);
    }

    /**
     * Get days in each month
     */
    static getDaysPerMonth(calendar: Calendar): number[] {
        if (calendar.months && calendar.months.length > 0) {
            return calendar.months.map(m => m.days);
        }

        // Fallback: assume 30 days per month
        const monthCount = Math.ceil((calendar.daysPerYear || 365) / 30);
        return Array.from({ length: monthCount }, () => 30);
    }

    /**
     * Check if a date is an intercalary day
     */
    static isIntercalaryDay(date: CalendarDate, calendar: Calendar): IntercalaryDay | null {
        if (!calendar.intercalaryDays || calendar.intercalaryDays.length === 0) {
            return null;
        }

        // Calculate day of year
        const dayOfYear = this.calculateDayOfYear(date, calendar);

        // Find matching intercalary day
        return calendar.intercalaryDays.find(d => d.dayOfYear === dayOfYear) || null;
    }

    /**
     * Calculate day of year from calendar date
     */
    private static calculateDayOfYear(date: CalendarDate, calendar: Calendar): number {
        let dayOfYear = 0;

        // Add days for previous months
        if (typeof date.month === 'number' && date.month > 0 && calendar.months) {
            for (let m = 1; m < date.month; m++) {
                if (m <= calendar.months.length) {
                    dayOfYear += calendar.months[m - 1].days;
                }
            }
        } else if (typeof date.month === 'string' && calendar.months) {
            const monthIndex = calendar.months.findIndex(m => m.name === date.month);
            if (monthIndex >= 0) {
                for (let m = 0; m < monthIndex; m++) {
                    dayOfYear += calendar.months[m].days;
                }
            }
        }

        // Add current day
        dayOfYear += date.day;

        return dayOfYear;
    }

    /**
     * Validate calendar configuration
     * Returns array of warning messages, empty if valid
     */
    static validateCalendar(calendar: Calendar): string[] {
        const warnings: string[] = [];

        // Check required fields
        if (!calendar.name) {
            warnings.push('Calendar is missing a name');
        }

        if (!calendar.daysPerYear || calendar.daysPerYear <= 0) {
            warnings.push('Calendar is missing or has invalid daysPerYear');
        }

        if (!calendar.months || calendar.months.length === 0) {
            warnings.push('Calendar is missing months definition');
        } else {
            // Validate months add up to daysPerYear
            const totalDays = calendar.months.reduce((sum, m) => sum + m.days, 0);
            if (calendar.daysPerYear && totalDays !== calendar.daysPerYear) {
                warnings.push(`Calendar months total ${totalDays} days but daysPerYear is ${calendar.daysPerYear}`);
            }
        }

        if (!calendar.referenceDate) {
            warnings.push('Calendar is missing referenceDate - timeline display may be incorrect');
        } else {
            if (!calendar.referenceDate.year) {
                warnings.push('Calendar referenceDate is missing year');
            }
            if (!calendar.referenceDate.month) {
                warnings.push('Calendar referenceDate is missing month');
            }
            if (!calendar.referenceDate.day) {
                warnings.push('Calendar referenceDate is missing day');
            }
        }

        // CRITICAL: Check for epochGregorianDate
        if (!calendar.epochGregorianDate) {
            warnings.push('⚠️  CRITICAL: Calendar is missing epochGregorianDate. Timeline positioning will be INCORRECT. Add epochGregorianDate (e.g., "1492-01-01") to specify what Gregorian date corresponds to your calendar\'s epoch.');
        } else {
            // Validate it's a parseable date
            try {
                const testDate = new Date(calendar.epochGregorianDate);
                if (isNaN(testDate.getTime())) {
                    warnings.push(`Calendar has invalid epochGregorianDate: "${calendar.epochGregorianDate}". Must be a valid ISO date string (e.g., "1492-01-01").`);
                }
            } catch (error) {
                warnings.push(`Calendar epochGregorianDate cannot be parsed: "${calendar.epochGregorianDate}"`);
            }
        }

        return warnings;
    }

    /**
     * Validate a custom calendar date
     */
    static validateCustomDate(date: CalendarDate, calendar: Calendar): boolean {
        // Check year
        if (date.year === undefined || isNaN(date.year)) {
            return false;
        }

        // Check month
        if (date.month === undefined) {
            return false;
        }

        if (typeof date.month === 'number') {
            if (calendar.months && (date.month < 1 || date.month > calendar.months.length)) {
                return false;
            }
        } else if (typeof date.month === 'string') {
            if (calendar.months && !calendar.months.find(m => m.name === date.month)) {
                return false;
            }
        }

        // Check day
        if (date.day === undefined || date.day < 1) {
            return false;
        }

        // Check day is within valid range for the month
        const monthIndex = typeof date.month === 'string'
            ? (calendar.months?.findIndex(m => m.name === date.month) ?? -1)
            : (date.month as number);

        const monthNumber = typeof date.month === 'string'
            ? (monthIndex >= 0 ? monthIndex + 1 : 1)
            : monthIndex;

        const daysInMonth = this.getDaysInMonth(monthNumber, date.year, calendar);
        if (date.day > daysInMonth) {
            return false;
        }

        return true;
    }

    /**
     * Convert a custom calendar date to Gregorian date
     */
    static convertCustomToGregorian(date: CalendarDate, calendar: Calendar): Date | null {
        try {
            // Create a default Gregorian calendar
            const gregorianCalendar: Calendar = {
                id: 'gregorian',
                name: 'Gregorian',
                daysPerYear: 365,
                months: [
                    { name: 'January', days: 31 },
                    { name: 'February', days: 28 },
                    { name: 'March', days: 31 },
                    { name: 'April', days: 30 },
                    { name: 'May', days: 31 },
                    { name: 'June', days: 30 },
                    { name: 'July', days: 31 },
                    { name: 'August', days: 31 },
                    { name: 'September', days: 30 },
                    { name: 'October', days: 31 },
                    { name: 'November', days: 30 },
                    { name: 'December', days: 31 }
                ],
                referenceDate: {
                    year: this.GREGORIAN_EPOCH_YEAR,
                    month: this.GREGORIAN_EPOCH_MONTH,
                    day: this.GREGORIAN_EPOCH_DAY
                },
                leapYearRules: [
                    {
                        type: 'divisible',
                        divisor: 4,
                        exceptionDivisor: 100,
                        exceptionExceptionDivisor: 400,
                        daysAdded: 1
                    }
                ]
            };

            // Convert from custom calendar to Gregorian
            const result = this.convert(date, calendar, gregorianCalendar);

            // Convert the result to a JavaScript Date object
            const gregorianDate = result.targetDate;
            
            // Create a JavaScript Date from the Gregorian date
            const jsDate = new Date(
                gregorianDate.year,
                typeof gregorianDate.month === 'number' ? gregorianDate.month - 1 : 0,
                gregorianDate.day
            );

            return jsDate;
        } catch (error) {
            console.error('Error converting custom date to Gregorian:', error);
            return null;
        }
    }
}
