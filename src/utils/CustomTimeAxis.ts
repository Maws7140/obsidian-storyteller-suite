/**
 * CustomTimeAxis - Level 3 Custom Calendar Timeline Feature
 *
 * Custom time axis renderer for vis-timeline that displays custom calendar dates.
 * Handles variable-length months, custom time units, and smart zoom levels.
 *
 * Features:
 * - Custom month names on axis
 * - Variable-length month boundaries
 * - Smart zoom levels (year → month → day)
 * - Custom time units (20-hour days, etc.)
 * - Dual-axis mode (Gregorian + custom)
 */

import { Calendar, CalendarDate } from '../types';
import { CalendarConverter } from './CalendarConverter';

/**
 * Time scale level for axis display
 */
export type TimeScale = 'year' | 'month' | 'day' | 'hour';

/**
 * Track if we've logged unknown date type warning (to avoid console spam)
 */
let unknownTypeLogged = false;

/**
 * Axis marker for custom calendar
 */
export interface AxisMarker {
    /** Timestamp (ms) where the marker should appear */
    timestamp: number;
    /** Label text to display */
    label: string;
    /** Marker type (major, minor, etc.) */
    type: 'major' | 'minor';
    /** Calendar date this marker represents */
    date: CalendarDate;
    /** Class name for styling */
    className?: string;
}

/**
 * Options for custom axis rendering
 */
export interface CustomAxisOptions {
    /** Target calendar for axis display */
    calendar: Calendar;
    /** Current time scale/zoom level */
    scale: TimeScale;
    /** Start of visible range (Unix timestamp) */
    start: number;
    /** End of visible range (Unix timestamp) */
    end: number;
    /** Show Gregorian axis as secondary */
    showDualAxis?: boolean;
    /** Format for date labels */
    labelFormat?: 'short' | 'long' | 'full';
}

/**
 * CustomTimeAxis class for generating custom calendar axis markers
 */
export class CustomTimeAxis {
    /**
     * Generate axis markers for a custom calendar
     */
    static generateMarkers(options: CustomAxisOptions): AxisMarker[] {
        const markers: AxisMarker[] = [];

        // Determine marker density based on scale and range
        const rangeDays = (options.end - options.start) / (24 * 60 * 60 * 1000);

        switch (options.scale) {
            case 'year':
                return this.generateYearMarkers(options, rangeDays);
            case 'month':
                return this.generateMonthMarkers(options, rangeDays);
            case 'day':
                return this.generateDayMarkers(options, rangeDays);
            case 'hour':
                return this.generateHourMarkers(options, rangeDays);
            default:
                return this.generateMonthMarkers(options, rangeDays);
        }
    }

    /**
     * Generate year-level markers
     */
    private static generateYearMarkers(options: CustomAxisOptions, rangeDays: number): AxisMarker[] {
        const markers: AxisMarker[] = [];

        // Convert start/end timestamps to calendar dates
        const startDate = CalendarConverter.fromUnixTimestamp(options.start, options.calendar);
        const endDate = CalendarConverter.fromUnixTimestamp(options.end, options.calendar);

        // Generate a marker for each year
        for (let year = startDate.year; year <= endDate.year; year++) {
            // Use first month's name if calendar has named months, otherwise use 1
            const firstMonth = options.calendar.months && options.calendar.months.length > 0
                ? options.calendar.months[0].name
                : 1;
            const yearDate: CalendarDate = { year, month: firstMonth, day: 1 };

            // Convert back to timestamp for marker position
            const gregorianCalendar = this.getGregorianCalendar();
            const conversion = CalendarConverter.convert(yearDate, options.calendar, gregorianCalendar);

            markers.push({
                timestamp: conversion.timestamp,
                label: `${year}`,
                type: 'major',
                date: yearDate,
                className: 'custom-axis-year'
            });

            // Add minor markers for quarters or specific months if zoom allows
            if (rangeDays < 3650) { // Less than ~10 years, show more detail
                const monthsToShow = this.getMonthsForYearScale(options.calendar);
                for (const monthIndex of monthsToShow) {
                    if (options.calendar.months && monthIndex < options.calendar.months.length) {
                        const monthDate: CalendarDate = {
                            year,
                            month: options.calendar.months[monthIndex].name,
                            day: 1
                        };
                        const monthConversion = CalendarConverter.convert(monthDate, options.calendar, gregorianCalendar);

                        markers.push({
                            timestamp: monthConversion.timestamp,
                            label: options.calendar.months[monthIndex].name.substring(0, 3),
                            type: 'minor',
                            date: monthDate,
                            className: 'custom-axis-month-minor'
                        });
                    }
                }
            }
        }

        return markers;
    }

    /**
     * Generate month-level markers
     */
    private static generateMonthMarkers(options: CustomAxisOptions, rangeDays: number): AxisMarker[] {
        const markers: AxisMarker[] = [];

        const startDate = CalendarConverter.fromUnixTimestamp(options.start, options.calendar);
        const endDate = CalendarConverter.fromUnixTimestamp(options.end, options.calendar);

        if (!options.calendar.months || options.calendar.months.length === 0) {
            // Fallback: no month data, use generic markers
            return markers;
        }

        const gregorianCalendar = this.getGregorianCalendar();

        // Generate markers for each month in range
        for (let year = startDate.year; year <= endDate.year; year++) {
            for (let monthIndex = 0; monthIndex < options.calendar.months.length; monthIndex++) {
                const month = options.calendar.months[monthIndex];
                const monthDate: CalendarDate = {
                    year,
                    month: month.name,
                    day: 1
                };

                const conversion = CalendarConverter.convert(monthDate, options.calendar, gregorianCalendar);

                // Check if this month is in visible range
                if (conversion.timestamp >= options.start && conversion.timestamp <= options.end) {
                    markers.push({
                        timestamp: conversion.timestamp,
                        label: month.name,
                        type: 'major',
                        date: monthDate,
                        className: 'custom-axis-month'
                    });

                    // Add day markers if zoomed in enough
                    if (rangeDays < 180) { // Less than ~6 months
                        const daysToShow = this.getDaysForMonthScale(month.days, rangeDays);
                        for (const day of daysToShow) {
                            const dayDate: CalendarDate = {
                                year,
                                month: month.name,
                                day
                            };
                            const dayConversion = CalendarConverter.convert(dayDate, options.calendar, gregorianCalendar);

                            markers.push({
                                timestamp: dayConversion.timestamp,
                                label: `${day}`,
                                type: 'minor',
                                date: dayDate,
                                className: 'custom-axis-day-minor'
                            });
                        }
                    }
                }
            }
        }

        return markers;
    }

    /**
     * Generate day-level markers
     */
    private static generateDayMarkers(options: CustomAxisOptions, rangeDays: number): AxisMarker[] {
        const markers: AxisMarker[] = [];

        if (!options.calendar.months) {
            return markers;
        }

        const startDate = CalendarConverter.fromUnixTimestamp(options.start, options.calendar);
        const endDate = CalendarConverter.fromUnixTimestamp(options.end, options.calendar);
        const gregorianCalendar = this.getGregorianCalendar();

        // Generate a marker for each day
        // (This is simplified - in practice, you'd iterate through each day)
        for (let year = startDate.year; year <= endDate.year; year++) {
            for (const month of options.calendar.months) {
                for (let day = 1; day <= month.days; day++) {
                    const dayDate: CalendarDate = {
                        year,
                        month: month.name,
                        day
                    };

                    const conversion = CalendarConverter.convert(dayDate, options.calendar, gregorianCalendar);

                    if (conversion.timestamp >= options.start && conversion.timestamp <= options.end) {
                        markers.push({
                            timestamp: conversion.timestamp,
                            label: `${day} ${month.name}`,
                            type: 'major',
                            date: dayDate,
                            className: 'custom-axis-day'
                        });
                    }
                }
            }
        }

        return markers;
    }

    /**
     * Generate hour-level markers (for custom time units)
     */
    private static generateHourMarkers(options: CustomAxisOptions, rangeDays: number): AxisMarker[] {
        const markers: AxisMarker[] = [];

        // This would use custom time units from the calendar
        const hoursPerDay = options.calendar.hoursPerDay || 24;

        // Implementation would generate hour markers with custom hour labels
        // For now, return empty array
        return markers;
    }

    /**
     * Get which months to show at year scale
     */
    private static getMonthsForYearScale(calendar: Calendar): number[] {
        if (!calendar.months) return [];

        const monthCount = calendar.months.length;

        if (monthCount <= 12) {
            // Show every 3rd month (quarters)
            return [0, Math.floor(monthCount / 4), Math.floor(monthCount / 2), Math.floor(3 * monthCount / 4)];
        } else {
            // Show 4 evenly spaced months
            const step = Math.floor(monthCount / 4);
            return [0, step, 2 * step, 3 * step];
        }
    }

    /**
     * Get which days to show at month scale
     */
    private static getDaysForMonthScale(daysInMonth: number, rangeDays: number): number[] {
        if (rangeDays > 90) {
            // Show 1st and 15th only
            return [1, 15];
        } else if (rangeDays > 30) {
            // Show every 5 days
            return Array.from({ length: Math.ceil(daysInMonth / 5) }, (_, i) => i * 5 + 1);
        } else {
            // Show every day
            return Array.from({ length: daysInMonth }, (_, i) => i + 1);
        }
    }

    /**
     * Create a vis-timeline format function for custom calendar
     */
    static createFormatFunction(calendar: Calendar) {
        return (date: Date | number | undefined, scale: string, step: number) => {
            // Handle various input types from vis-timeline
            let timestamp: number;

            if (date == null) {
                console.warn('CustomTimeAxis: Received null/undefined date, using current time');
                timestamp = Date.now();
            } else if (typeof date === 'number') {
                // Already a timestamp
                timestamp = date;
            } else if (date instanceof Date) {
                // Date object - validate it's valid
                timestamp = date.getTime();
                if (isNaN(timestamp)) {
                    console.warn('CustomTimeAxis: Received invalid Date object, using current time');
                    timestamp = Date.now();
                }
            } else if (typeof date === 'object') {
                // Handle moment-like objects or other date-like objects
                // Try common timestamp extraction patterns
                const obj = date as any;

                if (typeof obj.getTime === 'function') {
                    timestamp = obj.getTime();
                } else if (typeof obj.valueOf === 'function') {
                    const value = obj.valueOf();
                    timestamp = typeof value === 'number' ? value : Date.now();
                } else if (typeof obj.toDate === 'function') {
                    // Moment.js style
                    timestamp = obj.toDate().getTime();
                } else if (obj._d instanceof Date) {
                    // Moment.js internal date
                    timestamp = obj._d.getTime();
                } else {
                    // Unknown object type - log once and fallback
                    if (!unknownTypeLogged) {
                        console.warn('CustomTimeAxis: Received unexpected object type for date:', typeof date, date);
                        unknownTypeLogged = true;
                    }
                    timestamp = Date.now();
                }
            } else {
                // Unknown type - try to coerce to number
                console.warn('CustomTimeAxis: Received unexpected type for date:', typeof date, date);
                timestamp = Date.now();
            }

            const calendarDate = CalendarConverter.fromUnixTimestamp(timestamp, calendar);

            switch (scale) {
                case 'millisecond':
                case 'second':
                case 'minute':
                    return calendarDate.time || '';

                case 'hour':
                    return `${calendarDate.day} ${calendarDate.month} ${calendarDate.time || ''}`.trim();

                case 'day':
                case 'weekday':
                    return `${calendarDate.day} ${CalendarConverter.getMonthName(calendarDate.month, calendar)}`;

                case 'week':
                    return `${CalendarConverter.getMonthName(calendarDate.month, calendar)} ${calendarDate.year}`;

                case 'month':
                    return CalendarConverter.getMonthName(calendarDate.month, calendar);

                case 'year':
                    return calendarDate.year.toString();

                default:
                    return CalendarConverter.formatDate(calendarDate, calendar, 'short');
            }
        };
    }

    /**
     * Determine appropriate time scale based on zoom level
     */
    static determineTimeScale(start: number, end: number): TimeScale {
        const rangeDays = (end - start) / (24 * 60 * 60 * 1000);

        if (rangeDays > 3650) {
            // > 10 years
            return 'year';
        } else if (rangeDays > 180) {
            // > 6 months
            return 'month';
        } else if (rangeDays > 7) {
            // > 1 week
            return 'day';
        } else {
            return 'hour';
        }
    }

    /**
     * Get a basic Gregorian calendar for conversions
     */
    private static getGregorianCalendar(): Calendar {
        return {
            name: 'Gregorian',
            daysPerYear: 365,
            daysPerWeek: 7,
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
            referenceDate: { year: 1970, month: 1, day: 1 },
            hoursPerDay: 24,
            minutesPerHour: 60,
            secondsPerMinute: 60
        };
    }

    /**
     * Apply custom time axis to vis-timeline instance
     */
    static applyToTimeline(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timeline: any,
        calendar: Calendar,
        options?: { showDualAxis?: boolean }
    ): void {
        if (!timeline) return;

        // Validate calendar configuration
        const warnings = CalendarConverter.validateCalendar(calendar);
        if (warnings.length > 0) {
            console.warn('[CustomTimeAxis] Calendar validation warnings:', warnings);
            console.warn('[CustomTimeAxis] Calendar name:', calendar.name);
            console.warn('[CustomTimeAxis] These issues may cause incorrect date display on the timeline.');

            // Check for critical epochGregorianDate warning
            const hasCriticalWarning = warnings.some(w => w.includes('epochGregorianDate'));
            if (hasCriticalWarning) {
                console.error(`[CustomTimeAxis] CRITICAL: Calendar "${calendar.name}" is missing epochGregorianDate field. Timeline events will be positioned incorrectly. Please add this field to your calendar YAML file.`);
            }
        }

        // Set custom format function
        const formatFunction = this.createFormatFunction(calendar);

        // Get current timeline window to determine appropriate scale for logging
        const range = timeline.getWindow();
        let scale: TimeScale = 'month';

        if (range && range.start && range.end) {
            const start = typeof range.start === 'number' ? range.start : new Date(range.start).getTime();
            const end = typeof range.end === 'number' ? range.end : new Date(range.end).getTime();
            scale = this.determineTimeScale(start, end);
        }

        console.log('[CustomTimeAxis] Applying custom calendar format:', {
            calendar: calendar.name,
            scale,
            hasReferenceDate: !!calendar.referenceDate,
            monthCount: calendar.months?.length || 0,
            daysPerYear: calendar.daysPerYear
        });

        // Apply custom format function and ensure axis labels are visible
        // Note: vis-timeline automatically determines scale based on zoom level
        // We only need to provide the format function and ensure labels are shown
        timeline.setOptions({
            format: {
                minorLabels: formatFunction,
                majorLabels: formatFunction
            },
            showMinorLabels: true,
            showMajorLabels: true
        });

        // If dual axis is enabled, we would add a second axis here
        // This would require more advanced vis-timeline customization
        if (options?.showDualAxis) {
            // Future implementation: add secondary Gregorian axis
            console.log('Dual axis mode requested - future implementation');
        }
    }

    /**
     * Create custom time markers for month boundaries
     * Returns an array of background items that can be added to the timeline
     */
    static createMonthBoundaryMarkers(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timeline: any,
        calendar: Calendar,
        startYear: number,
        endYear: number
    ): any[] {
        const markers: any[] = [];

        if (!timeline || !calendar.months) return markers;

        const gregorianCalendar = this.getGregorianCalendar();

        // Create background markers for month boundaries
        for (let year = startYear; year <= endYear; year++) {
            for (const month of calendar.months) {
                const monthDate: CalendarDate = {
                    year,
                    month: month.name,
                    day: 1
                };

                const conversion = CalendarConverter.convert(monthDate, calendar, gregorianCalendar);
                const markerId = `month-boundary-${calendar.name}-${year}-${month.name}`;

                // Validate timestamp before creating Date object
                if (typeof conversion.timestamp !== 'number' || isNaN(conversion.timestamp)) {
                    console.warn('[CustomTimeAxis] Invalid timestamp for month boundary:', {
                        year,
                        month: month.name,
                        timestamp: conversion.timestamp
                    });
                    continue;
                }

                // Add a background item to mark the month boundary
                markers.push({
                    id: markerId,
                    type: 'background',
                    start: new Date(conversion.timestamp),
                    end: new Date(conversion.timestamp + 1), // 1ms duration for vertical line
                    className: 'custom-calendar-month-boundary',
                    content: '', // No content, just visual marker
                    style: 'background-color: rgba(128, 128, 128, 0.1); border-left: 1px solid rgba(128, 128, 128, 0.3);'
                });
            }
        }

        console.log(`[CustomTimeAxis] Created ${markers.length} month boundary markers for ${calendar.name}`);
        return markers;
    }
}
