import { Calendar, CalendarDate, CalendarMonth } from '../types';
import { DateTime } from 'luxon';

/**
 * Utility class for converting between custom calendars and Gregorian dates
 * Supports both linear formula conversion and manual lookup table conversion
 */
export class CalendarConverter {
    /**
     * Convert a custom calendar date to Gregorian date
     * @param customDate Custom calendar date
     * @param calendar Calendar definition
     * @returns Gregorian Date object or null if conversion fails
     */
    static convertCustomToGregorian(customDate: CalendarDate, calendar: Calendar): Date | null {
        try {
            if (!calendar.conversionType) {
                console.warn('Calendar has no conversion type specified');
                return null;
            }

            if (calendar.conversionType === 'linear') {
                return this.linearConvertToGregorian(customDate, calendar);
            } else if (calendar.conversionType === 'lookup') {
                return this.lookupConvertToGregorian(customDate, calendar);
            }

            return null;
        } catch (error) {
            console.error('Error converting custom date to Gregorian:', error);
            return null;
        }
    }

    /**
     * Convert a Gregorian date to custom calendar date
     * @param gregorianDate Gregorian Date object
     * @param calendar Calendar definition
     * @returns Custom calendar date or null if conversion fails
     */
    static convertGregorianToCustom(gregorianDate: Date, calendar: Calendar): CalendarDate | null {
        try {
            if (!calendar.conversionType) {
                console.warn('Calendar has no conversion type specified');
                return null;
            }

            if (calendar.conversionType === 'linear') {
                return this.linearConvertToCustom(gregorianDate, calendar);
            } else if (calendar.conversionType === 'lookup') {
                return this.lookupConvertToCustom(gregorianDate, calendar);
            }

            return null;
        } catch (error) {
            console.error('Error converting Gregorian date to custom:', error);
            return null;
        }
    }

    /**
     * Linear conversion from custom calendar to Gregorian
     * Uses days-per-year formula with epoch offset
     */
    private static linearConvertToGregorian(customDate: CalendarDate, calendar: Calendar): Date | null {
        const config = calendar.linearConversion;
        if (!config || !config.epochGregorianDate) {
            console.warn('Linear conversion config incomplete');
            return null;
        }

        // Parse epoch Gregorian date
        const epochGregorian = DateTime.fromISO(config.epochGregorianDate);
        if (!epochGregorian.isValid) {
            console.warn('Invalid epoch Gregorian date');
            return null;
        }

        // Calculate total days from custom epoch to target date
        const yearsSinceEpoch = customDate.year - config.epochYear;
        let totalDays = yearsSinceEpoch * config.daysPerYear;

        // Add days for months
        const monthIndex = this.getMonthIndex(customDate.month, calendar);
        if (monthIndex === -1) {
            console.warn('Invalid month in custom date');
            return null;
        }

        for (let i = 0; i < monthIndex; i++) {
            totalDays += this.getDaysInMonthByIndex(i, calendar);
        }

        // Add remaining days
        totalDays += customDate.day - 1; // -1 because day 1 is the start

        // Apply leap years if configured
        if (config.useLeapYears && config.leapYearFrequency) {
            const leapYears = Math.floor(Math.abs(yearsSinceEpoch) / config.leapYearFrequency);
            totalDays += yearsSinceEpoch >= 0 ? leapYears : -leapYears;
        }

        // Add to epoch and convert to Date
        const result = epochGregorian.plus({ days: totalDays });
        return result.toJSDate();
    }

    /**
     * Linear conversion from Gregorian to custom calendar
     */
    private static linearConvertToCustom(gregorianDate: Date, calendar: Calendar): CalendarDate | null {
        const config = calendar.linearConversion;
        if (!config || !config.epochGregorianDate) {
            console.warn('Linear conversion config incomplete');
            return null;
        }

        // Parse epoch Gregorian date
        const epochGregorian = DateTime.fromISO(config.epochGregorianDate);
        if (!epochGregorian.isValid) {
            console.warn('Invalid epoch Gregorian date');
            return null;
        }

        // Calculate days difference
        const target = DateTime.fromJSDate(gregorianDate);
        let daysDiff = Math.floor(target.diff(epochGregorian, 'days').days);

        // Account for leap years if configured
        if (config.useLeapYears && config.leapYearFrequency) {
            const estimatedYears = Math.floor(daysDiff / config.daysPerYear);
            const leapDays = Math.floor(Math.abs(estimatedYears) / config.leapYearFrequency);
            daysDiff -= estimatedYears >= 0 ? leapDays : -leapDays;
        }

        // Calculate year
        const customYear = config.epochYear + Math.floor(daysDiff / config.daysPerYear);
        let remainingDays = daysDiff % config.daysPerYear;

        if (remainingDays < 0) {
            remainingDays += config.daysPerYear;
        }

        // Find month and day
        let monthIndex = 0;
        let monthName = '';
        const months = calendar.months || [];

        for (let i = 0; i < months.length; i++) {
            const daysInMonth = months[i].days;
            if (remainingDays < daysInMonth) {
                monthIndex = i;
                monthName = months[i].name;
                break;
            }
            remainingDays -= daysInMonth;
        }

        const customDay = remainingDays + 1; // +1 because days start at 1

        return {
            year: customYear,
            month: monthName || monthIndex,
            day: customDay
        };
    }

    /**
     * Lookup table conversion from custom to Gregorian
     * Finds closest match in lookup table and interpolates if needed
     */
    private static lookupConvertToGregorian(customDate: CalendarDate, calendar: Calendar): Date | null {
        const lookupTable = calendar.lookupTable;
        if (!lookupTable || lookupTable.length === 0) {
            console.warn('Lookup table is empty');
            return null;
        }

        // Find exact match
        for (const entry of lookupTable) {
            if (this.datesEqual(entry.customDate, customDate)) {
                return new Date(entry.gregorianDate);
            }
        }

        // Find closest earlier and later dates for interpolation
        let before: typeof lookupTable[0] | null = null;
        let after: typeof lookupTable[0] | null = null;

        for (const entry of lookupTable) {
            const comparison = this.compareDates(entry.customDate, customDate, calendar);
            if (comparison < 0 && (!before || this.compareDates(entry.customDate, before.customDate, calendar) > 0)) {
                before = entry;
            } else if (comparison > 0 && (!after || this.compareDates(entry.customDate, after.customDate, calendar) < 0)) {
                after = entry;
            }
        }

        // Fallback to linear conversion if available
        if (!before && !after && calendar.linearConversion) {
            console.warn('No suitable lookup entries found, falling back to linear conversion');
            return this.linearConvertToGregorian(customDate, calendar);
        }

        if (!before || !after) {
            console.warn('Cannot interpolate - need both before and after dates');
            return null;
        }

        // Simple linear interpolation
        const customDaysBefore = this.calculateTotalDays(before.customDate, calendar);
        const customDaysAfter = this.calculateTotalDays(after.customDate, calendar);
        const customDaysTarget = this.calculateTotalDays(customDate, calendar);

        const ratio = (customDaysTarget - customDaysBefore) / (customDaysAfter - customDaysBefore);

        const gregorianBefore = DateTime.fromISO(before.gregorianDate);
        const gregorianAfter = DateTime.fromISO(after.gregorianDate);
        const gregorianDiff = gregorianAfter.diff(gregorianBefore, 'days').days;

        const result = gregorianBefore.plus({ days: gregorianDiff * ratio });
        return result.toJSDate();
    }

    /**
     * Lookup table conversion from Gregorian to custom
     */
    private static lookupConvertToCustom(gregorianDate: Date, calendar: Calendar): CalendarDate | null {
        const lookupTable = calendar.lookupTable;
        if (!lookupTable || lookupTable.length === 0) {
            console.warn('Lookup table is empty');
            return null;
        }

        const targetDate = DateTime.fromJSDate(gregorianDate);
        const targetISO = targetDate.toISODate();

        // Find exact match
        for (const entry of lookupTable) {
            if (entry.gregorianDate === targetISO) {
                return { ...entry.customDate };
            }
        }

        // Find closest dates for interpolation
        let before: typeof lookupTable[0] | null = null;
        let after: typeof lookupTable[0] | null = null;

        for (const entry of lookupTable) {
            const entryDate = DateTime.fromISO(entry.gregorianDate);
            if (entryDate < targetDate && (!before || DateTime.fromISO(before.gregorianDate) < entryDate)) {
                before = entry;
            } else if (entryDate > targetDate && (!after || DateTime.fromISO(after.gregorianDate) > entryDate)) {
                after = entry;
            }
        }

        // Fallback to linear if available
        if (!before && !after && calendar.linearConversion) {
            console.warn('No suitable lookup entries found, falling back to linear conversion');
            return this.linearConvertToCustom(gregorianDate, calendar);
        }

        if (!before || !after) {
            console.warn('Cannot interpolate - need both before and after dates');
            return null;
        }

        // Interpolate custom calendar date
        const gregorianBefore = DateTime.fromISO(before.gregorianDate);
        const gregorianAfter = DateTime.fromISO(after.gregorianDate);
        const gregorianDiff = gregorianAfter.diff(gregorianBefore, 'days').days;
        const gregorianProgress = targetDate.diff(gregorianBefore, 'days').days;
        const ratio = gregorianProgress / gregorianDiff;

        const customDaysBefore = this.calculateTotalDays(before.customDate, calendar);
        const customDaysAfter = this.calculateTotalDays(after.customDate, calendar);
        const customDaysTarget = customDaysBefore + (customDaysAfter - customDaysBefore) * ratio;

        // Convert total days back to year/month/day
        return this.daysToCalendarDate(Math.floor(customDaysTarget), calendar);
    }

    /**
     * Validate a custom calendar date against calendar structure
     */
    static validateCustomDate(date: CalendarDate, calendar: Calendar): boolean {
        try {
            // Check month exists
            const monthIndex = this.getMonthIndex(date.month, calendar);
            if (monthIndex === -1) {
                return false;
            }

            // Check day is within month's range
            const daysInMonth = this.getDaysInMonthByIndex(monthIndex, calendar);
            if (date.day < 1 || date.day > daysInMonth) {
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get month object by name or index
     */
    static getMonthByName(monthName: string, calendar: Calendar): CalendarMonth | null {
        if (!calendar.months) {
            return null;
        }

        return calendar.months.find(m => m.name === monthName) || null;
    }

    /**
     * Get index of month by name or number
     */
    private static getMonthIndex(month: string | number, calendar: Calendar): number {
        if (!calendar.months) {
            return -1;
        }

        if (typeof month === 'number') {
            return month >= 0 && month < calendar.months.length ? month : -1;
        }

        return calendar.months.findIndex(m => m.name === month);
    }

    /**
     * Get number of days in a month by index
     */
    static getDaysInMonth(monthIndex: number, year: number, calendar: Calendar): number {
        return this.getDaysInMonthByIndex(monthIndex, calendar);
    }

    private static getDaysInMonthByIndex(monthIndex: number, calendar: Calendar): number {
        if (!calendar.months || monthIndex < 0 || monthIndex >= calendar.months.length) {
            return 30; // Default fallback
        }

        return calendar.months[monthIndex].days;
    }

    /**
     * Check if two calendar dates are equal
     */
    private static datesEqual(date1: CalendarDate, date2: CalendarDate): boolean {
        return date1.year === date2.year &&
               date1.month === date2.month &&
               date1.day === date2.day;
    }

    /**
     * Compare two calendar dates
     * Returns: -1 if date1 < date2, 0 if equal, 1 if date1 > date2
     */
    private static compareDates(date1: CalendarDate, date2: CalendarDate, calendar: Calendar): number {
        const totalDays1 = this.calculateTotalDays(date1, calendar);
        const totalDays2 = this.calculateTotalDays(date2, calendar);

        if (totalDays1 < totalDays2) return -1;
        if (totalDays1 > totalDays2) return 1;
        return 0;
    }

    /**
     * Calculate total days from an arbitrary epoch (year 0, month 0, day 0)
     * Used for date comparison and interpolation
     */
    private static calculateTotalDays(date: CalendarDate, calendar: Calendar): number {
        const config = calendar.linearConversion;
        const daysPerYear = config?.daysPerYear || 365;

        let totalDays = date.year * daysPerYear;

        const monthIndex = this.getMonthIndex(date.month, calendar);
        if (monthIndex !== -1) {
            for (let i = 0; i < monthIndex; i++) {
                totalDays += this.getDaysInMonthByIndex(i, calendar);
            }
        }

        totalDays += date.day;

        return totalDays;
    }

    /**
     * Convert total days to a calendar date
     */
    private static daysToCalendarDate(totalDays: number, calendar: Calendar): CalendarDate {
        const config = calendar.linearConversion;
        const daysPerYear = config?.daysPerYear || 365;

        const year = Math.floor(totalDays / daysPerYear);
        let remainingDays = totalDays % daysPerYear;

        const months = calendar.months || [];
        let monthIndex = 0;
        let monthName = '';

        for (let i = 0; i < months.length; i++) {
            const daysInMonth = months[i].days;
            if (remainingDays < daysInMonth) {
                monthIndex = i;
                monthName = months[i].name;
                break;
            }
            remainingDays -= daysInMonth;
        }

        return {
            year,
            month: monthName || monthIndex,
            day: remainingDays + 1
        };
    }

    /**
     * Format a custom calendar date as a human-readable string
     */
    static formatCustomCalendarDate(date: CalendarDate, calendar: Calendar): string {
        const monthName = typeof date.month === 'string' ? date.month :
            (calendar.months && calendar.months[date.month as number]?.name) || `Month ${date.month}`;

        const parts = [
            monthName,
            date.day,
            `Year ${date.year}`
        ];

        if (date.time) {
            parts.push(date.time);
        }

        return parts.join(', ');
    }

    /**
     * Format both custom and Gregorian dates together
     */
    static formatDualDate(customDate: CalendarDate, gregorianDate: Date | null, calendar: Calendar): string {
        const customStr = this.formatCustomCalendarDate(customDate, calendar);

        if (!gregorianDate) {
            return customStr;
        }

        const gregorianStr = DateTime.fromJSDate(gregorianDate).toLocaleString(DateTime.DATE_MED);
        return `${customStr} (${gregorianStr})`;
    }
}
