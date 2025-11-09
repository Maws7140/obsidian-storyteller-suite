/**
 * LookupTableBuilder - Level 3 Custom Calendar Timeline Feature
 *
 * Helper class for generating lookup tables for irregular calendars.
 * Lookup tables are necessary for calendars that don't follow simple mathematical patterns.
 *
 * Examples of irregular calendars:
 * - Calendars with variable-length months
 * - Calendars with intercalary days/weeks
 * - Calendars with complex leap year rules
 * - Historical calendars with reforms (e.g., Julian to Gregorian switch)
 */

import {
    Calendar,
    CalendarLookupEntry,
    CalendarDate,
    IntercalaryDay
} from '../types';

/**
 * Options for building a lookup table
 */
export interface LookupTableOptions {
    /** Starting year */
    startYear: number;

    /** Ending year */
    endYear: number;

    /** Include intercalary days in the table */
    includeIntercalaryDays?: boolean;

    /** Reference date to align with (optional) */
    referenceDate?: CalendarDate;

    /** Reference day offset for the reference date (optional) */
    referenceDayOffset?: number;
}

/**
 * LookupTableBuilder class
 */
export class LookupTableBuilder {
    /**
     * Build a complete lookup table for a calendar
     */
    static buildLookupTable(
        calendar: Calendar,
        options: LookupTableOptions
    ): CalendarLookupEntry[] {
        const entries: CalendarLookupEntry[] = [];

        // Determine starting offset
        let absoluteDayOffset = options.referenceDayOffset || 0;

        // If reference date is provided, calculate offset from it
        if (options.referenceDate && calendar.referenceDate) {
            const referenceYear = calendar.referenceDate.year;
            if (options.startYear < referenceYear) {
                // Need to work backwards from reference date
                absoluteDayOffset -= this.calculateDaysBack(calendar, referenceYear, options.startYear);
            } else if (options.startYear > referenceYear) {
                // Need to work forwards from reference date
                absoluteDayOffset += this.calculateDaysForward(calendar, referenceYear, options.startYear);
            }
        }

        // Build entries for each year
        for (let year = options.startYear; year <= options.endYear; year++) {
            const yearEntries = this.buildYearEntries(
                year,
                calendar,
                absoluteDayOffset,
                options.includeIntercalaryDays || false
            );

            entries.push(...yearEntries);

            // Advance offset for next year
            const daysInYear = this.getDaysInYear(year, calendar);
            absoluteDayOffset += daysInYear;
        }

        return entries;
    }

    /**
     * Build lookup table entries for a single year
     */
    private static buildYearEntries(
        year: number,
        calendar: Calendar,
        startingOffset: number,
        includeIntercalary: boolean
    ): CalendarLookupEntry[] {
        const entries: CalendarLookupEntry[] = [];
        let currentOffset = startingOffset;

        if (!calendar.months || calendar.months.length === 0) {
            // Fallback: generate based on daysPerYear
            const daysPerYear = calendar.daysPerYear || 365;
            for (let day = 1; day <= daysPerYear; day++) {
                entries.push({
                    year,
                    month: 1,
                    day,
                    absoluteDayOffset: currentOffset++
                });
            }
            return entries;
        }

        // Process each month
        for (let monthIndex = 0; monthIndex < calendar.months.length; monthIndex++) {
            const month = calendar.months[monthIndex];
            const monthNumber = monthIndex + 1;

            // Add entry for each day in the month
            for (let day = 1; day <= month.days; day++) {
                entries.push({
                    year,
                    month: month.name,
                    day,
                    absoluteDayOffset: currentOffset++,
                    isIntercalary: false
                });
            }

            // Check for intercalary days after this month
            if (includeIntercalary && calendar.intercalaryDays) {
                const intercalaryAfterMonth = calendar.intercalaryDays.filter(
                    iday => this.isIntercalaryAfterMonth(iday, monthNumber, calendar)
                );

                for (const iday of intercalaryAfterMonth) {
                    entries.push({
                        year,
                        month: iday.name,
                        day: 1,
                        absoluteDayOffset: currentOffset++,
                        isIntercalary: true
                    });
                }
            }
        }

        return entries;
    }

    /**
     * Check if an intercalary day comes after a specific month
     */
    private static isIntercalaryAfterMonth(
        intercalaryDay: IntercalaryDay,
        monthNumber: number,
        calendar: Calendar
    ): boolean {
        // Simple heuristic: check if dayOfYear falls in range
        let daysSoFar = 0;

        if (!calendar.months) return false;

        for (let i = 0; i < monthNumber && i < calendar.months.length; i++) {
            daysSoFar += calendar.months[i].days;
        }

        const nextMonthDays = monthNumber < calendar.months.length
            ? daysSoFar + calendar.months[monthNumber].days
            : daysSoFar;

        return intercalaryDay.dayOfYear > daysSoFar && intercalaryDay.dayOfYear <= nextMonthDays;
    }

    /**
     * Get number of days in a year
     */
    private static getDaysInYear(year: number, calendar: Calendar): number {
        let days = 0;

        if (calendar.months && calendar.months.length > 0) {
            // Sum up month days
            for (const month of calendar.months) {
                days += month.days;
            }
        } else {
            days = calendar.daysPerYear || 365;
        }

        // Add intercalary days if counted
        if (calendar.intercalaryDays) {
            for (const iday of calendar.intercalaryDays) {
                if (iday.counted !== false) {
                    days++;
                }
            }
        }

        // Add leap year days
        if (this.isLeapYear(year, calendar) && calendar.leapYearRules) {
            for (const rule of calendar.leapYearRules) {
                days += rule.daysAdded || 0;
            }
        }

        return days;
    }

    /**
     * Calculate days from referenceYear backwards to targetYear
     */
    private static calculateDaysBack(calendar: Calendar, referenceYear: number, targetYear: number): number {
        let totalDays = 0;

        for (let year = targetYear; year < referenceYear; year++) {
            totalDays += this.getDaysInYear(year, calendar);
        }

        return totalDays;
    }

    /**
     * Calculate days from referenceYear forward to targetYear
     */
    private static calculateDaysForward(calendar: Calendar, referenceYear: number, targetYear: number): number {
        let totalDays = 0;

        for (let year = referenceYear; year < targetYear; year++) {
            totalDays += this.getDaysInYear(year, calendar);
        }

        return totalDays;
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
                if (rule.divisor && year % rule.divisor === 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Generate a sample lookup table for a given calendar
     * (useful for documentation and testing)
     */
    static generateSampleTable(calendar: Calendar, years: number = 10): CalendarLookupEntry[] {
        const referenceYear = calendar.referenceDate?.year || 1;

        return this.buildLookupTable(calendar, {
            startYear: referenceYear,
            endYear: referenceYear + years - 1,
            includeIntercalaryDays: true,
            referenceDayOffset: 0
        });
    }

    /**
     * Export lookup table to JSON string
     */
    static exportToJSON(entries: CalendarLookupEntry[]): string {
        return JSON.stringify(entries, null, 2);
    }

    /**
     * Import lookup table from JSON string
     */
    static importFromJSON(json: string): CalendarLookupEntry[] {
        try {
            return JSON.parse(json) as CalendarLookupEntry[];
        } catch (error) {
            console.error('Failed to parse lookup table JSON:', error);
            return [];
        }
    }

    /**
     * Validate a lookup table
     */
    static validateLookupTable(entries: CalendarLookupEntry[]): {
        valid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (entries.length === 0) {
            errors.push('Lookup table is empty');
            return { valid: false, errors, warnings };
        }

        // Check for gaps in absolute day offsets
        for (let i = 1; i < entries.length; i++) {
            const prev = entries[i - 1];
            const curr = entries[i];

            if (curr.absoluteDayOffset !== prev.absoluteDayOffset + 1) {
                const gap = curr.absoluteDayOffset - prev.absoluteDayOffset;
                if (gap > 1) {
                    warnings.push(
                        `Gap of ${gap - 1} days between ${prev.year}-${prev.month}-${prev.day} and ${curr.year}-${curr.month}-${curr.day}`
                    );
                } else if (gap < 1) {
                    errors.push(
                        `Negative or zero gap between ${prev.year}-${prev.month}-${prev.day} and ${curr.year}-${curr.month}-${curr.day}`
                    );
                }
            }
        }

        // Check for duplicate dates
        const dateKeys = new Set<string>();
        for (const entry of entries) {
            const key = `${entry.year}-${entry.month}-${entry.day}`;
            if (dateKeys.has(key)) {
                errors.push(`Duplicate date: ${key}`);
            }
            dateKeys.add(key);
        }

        // Check for duplicate offsets
        const offsetKeys = new Set<number>();
        for (const entry of entries) {
            if (offsetKeys.has(entry.absoluteDayOffset)) {
                errors.push(`Duplicate offset: ${entry.absoluteDayOffset}`);
            }
            offsetKeys.add(entry.absoluteDayOffset);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Merge multiple lookup tables (useful for combining calendar data)
     */
    static mergeLookupTables(...tables: CalendarLookupEntry[][]): CalendarLookupEntry[] {
        const merged: CalendarLookupEntry[] = [];
        const seen = new Set<string>();

        for (const table of tables) {
            for (const entry of table) {
                const key = `${entry.year}-${entry.month}-${entry.day}`;
                if (!seen.has(key)) {
                    merged.push(entry);
                    seen.add(key);
                }
            }
        }

        // Sort by absolute day offset
        return merged.sort((a, b) => a.absoluteDayOffset - b.absoluteDayOffset);
    }

    /**
     * Create a lookup table for a simple regular calendar
     * (useful for testing and as a baseline)
     */
    static createSimpleTable(
        daysPerYear: number,
        startYear: number,
        endYear: number
    ): CalendarLookupEntry[] {
        const entries: CalendarLookupEntry[] = [];
        let absoluteDayOffset = 0;

        for (let year = startYear; year <= endYear; year++) {
            for (let day = 1; day <= daysPerYear; day++) {
                entries.push({
                    year,
                    month: 1,
                    day,
                    absoluteDayOffset: absoluteDayOffset++
                });
            }
        }

        return entries;
    }
}
