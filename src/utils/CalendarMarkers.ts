/**
 * CalendarMarkers - Level 3 Custom Calendar Timeline Feature
 *
 * Utility for adding visual markers to the timeline for calendar events
 * like seasons, holidays, astronomical events, and special days.
 *
 * Features:
 * - Season background shading
 * - Holiday markers and tooltips
 * - Astronomical event indicators
 * - Intercalary day highlighting
 */

import { Calendar, CalendarDate, CalendarHoliday, Season } from '../types';
import { CalendarConverter } from './CalendarConverter';

/**
 * Visual marker for timeline
 */
export interface TimelineMarker {
    /** Unique ID for the marker */
    id: string;
    /** Timestamp (ms) where marker appears */
    timestamp: number;
    /** Display label */
    label: string;
    /** Marker type */
    type: 'season' | 'holiday' | 'astronomical' | 'intercalary';
    /** CSS class name for styling */
    className: string;
    /** Tooltip text */
    tooltip?: string;
    /** Color for visual emphasis */
    color?: string;
    /** Duration (for seasons - end timestamp) */
    endTimestamp?: number;
}

/**
 * CalendarMarkers class for generating timeline visual markers
 */
export class CalendarMarkers {
    /**
     * Generate all markers for a calendar in a given year range
     */
    static generateAllMarkers(
        calendar: Calendar,
        startYear: number,
        endYear: number
    ): TimelineMarker[] {
        const markers: TimelineMarker[] = [];

        // Add season markers
        if (calendar.seasons && calendar.seasons.length > 0) {
            markers.push(...this.generateSeasonMarkers(calendar, startYear, endYear));
        }

        // Add holiday markers
        if (calendar.holidays && calendar.holidays.length > 0) {
            markers.push(...this.generateHolidayMarkers(calendar, startYear, endYear));
        }

        // Add astronomical event markers
        if (calendar.astronomicalEvents && calendar.astronomicalEvents.length > 0) {
            markers.push(...this.generateAstronomicalMarkers(calendar, startYear, endYear));
        }

        // Add intercalary day markers
        if (calendar.intercalaryDays && calendar.intercalaryDays.length > 0) {
            markers.push(...this.generateIntercalaryMarkers(calendar, startYear, endYear));
        }

        return markers.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Generate season markers (background shading regions)
     */
    private static generateSeasonMarkers(
        calendar: Calendar,
        startYear: number,
        endYear: number
    ): TimelineMarker[] {
        const markers: TimelineMarker[] = [];
        if (!calendar.seasons || !calendar.months) return markers;

        const gregorianCalendar = this.getGregorianCalendar();

        // Season colors (can be customized)
        const seasonColors: Record<string, string> = {
            'spring': '#E8F5E9',
            'summer': '#FFF9C4',
            'autumn': '#FFE0B2',
            'fall': '#FFE0B2',
            'winter': '#E3F2FD'
        };

        for (let year = startYear; year <= endYear; year++) {
            for (const season of calendar.seasons) {
                if (!season.startMonth) continue;

                // Find the month index
                const monthIndex = calendar.months.findIndex(m => m.name === season.startMonth);
                if (monthIndex < 0) continue;

                // Season start date
                const seasonStartDate: CalendarDate = {
                    year,
                    month: season.startMonth,
                    day: 1
                };

                const startConversion = CalendarConverter.convert(
                    seasonStartDate,
                    calendar,
                    gregorianCalendar
                );

                // Calculate season end (based on duration in months)
                const duration = season.duration || 3;
                let endMonthIndex = (monthIndex + duration) % calendar.months.length;
                const endYear = year + Math.floor((monthIndex + duration) / calendar.months.length);

                const seasonEndDate: CalendarDate = {
                    year: endYear,
                    month: calendar.months[endMonthIndex].name,
                    day: 1
                };

                const endConversion = CalendarConverter.convert(
                    seasonEndDate,
                    calendar,
                    gregorianCalendar
                );

                // Determine color based on season name
                const seasonNameLower = season.name.toLowerCase();
                const color = Object.keys(seasonColors).find(key =>
                    seasonNameLower.includes(key)
                ) ? seasonColors[Object.keys(seasonColors).find(key =>
                    seasonNameLower.includes(key))!] : '#F5F5F5';

                markers.push({
                    id: `season-${calendar.name}-${year}-${season.name}`,
                    timestamp: startConversion.timestamp,
                    endTimestamp: endConversion.timestamp,
                    label: season.name,
                    type: 'season',
                    className: 'timeline-season-marker',
                    tooltip: season.description || `${season.name} season`,
                    color
                });
            }
        }

        return markers;
    }

    /**
     * Generate holiday markers
     */
    private static generateHolidayMarkers(
        calendar: Calendar,
        startYear: number,
        endYear: number
    ): TimelineMarker[] {
        const markers: TimelineMarker[] = [];
        if (!calendar.holidays) return markers;

        const gregorianCalendar = this.getGregorianCalendar();

        for (let year = startYear; year <= endYear; year++) {
            for (const holiday of calendar.holidays) {
                // Parse holiday date (format: "3rd of Springrise" or "Springrise 3")
                const holidayDate = this.parseHolidayDate(holiday.date, calendar, year);
                if (!holidayDate) continue;

                const conversion = CalendarConverter.convert(
                    holidayDate,
                    calendar,
                    gregorianCalendar
                );

                markers.push({
                    id: `holiday-${calendar.name}-${year}-${holiday.name}`,
                    timestamp: conversion.timestamp,
                    label: `🎉 ${holiday.name}`,
                    type: 'holiday',
                    className: 'timeline-holiday-marker',
                    tooltip: holiday.description || holiday.name,
                    color: '#FF6B6B'
                });
            }
        }

        return markers;
    }

    /**
     * Generate astronomical event markers
     */
    private static generateAstronomicalMarkers(
        calendar: Calendar,
        startYear: number,
        endYear: number
    ): TimelineMarker[] {
        const markers: TimelineMarker[] = [];
        if (!calendar.astronomicalEvents) return markers;

        // Astronomical events would need frequency calculations
        // For now, returning empty - this would require more complex date math
        // based on the event's frequency (annual, monthly, etc.)

        return markers;
    }

    /**
     * Generate intercalary day markers
     */
    private static generateIntercalaryMarkers(
        calendar: Calendar,
        startYear: number,
        endYear: number
    ): TimelineMarker[] {
        const markers: TimelineMarker[] = [];
        if (!calendar.intercalaryDays) return markers;

        const gregorianCalendar = this.getGregorianCalendar();

        for (let year = startYear; year <= endYear; year++) {
            for (const intercalaryDay of calendar.intercalaryDays) {
                // Calculate the exact date of the intercalary day
                const intercalaryDate = this.calculateIntercalaryDate(intercalaryDay, calendar, year);
                if (!intercalaryDate) continue;

                const conversion = CalendarConverter.convert(
                    intercalaryDate,
                    calendar,
                    gregorianCalendar
                );

                markers.push({
                    id: `intercalary-${calendar.name}-${year}-${intercalaryDay.name}`,
                    timestamp: conversion.timestamp,
                    label: `✨ ${intercalaryDay.name}`,
                    type: 'intercalary',
                    className: 'timeline-intercalary-marker',
                    tooltip: intercalaryDay.description || `${intercalaryDay.name} (Special Day)`,
                    color: '#9C27B0'
                });
            }
        }

        return markers;
    }

    /**
     * Parse holiday date string to CalendarDate
     */
    private static parseHolidayDate(
        dateStr: string,
        calendar: Calendar,
        year: number
    ): CalendarDate | null {
        if (!calendar.months) return null;

        // Try to parse formats like:
        // "3rd of Springrise"
        // "Springrise 3"
        // "15 Hammer"

        const patterns = [
            /(\d+)(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)/i,
            /(\w+)\s+(\d+)/i
        ];

        for (const pattern of patterns) {
            const match = dateStr.match(pattern);
            if (match) {
                const [, first, second] = match;

                // Determine which is day and which is month
                let day: number;
                let monthName: string;

                if (isNaN(Number(first))) {
                    // first is month name, second is day
                    monthName = first;
                    day = parseInt(second, 10);
                } else {
                    // first is day, second is month name
                    day = parseInt(first, 10);
                    monthName = second;
                }

                // Find month in calendar
                const month = calendar.months.find(m =>
                    m.name.toLowerCase() === monthName.toLowerCase()
                );

                if (month) {
                    return {
                        year,
                        month: month.name,
                        day
                    };
                }
            }
        }

        return null;
    }

    /**
     * Calculate intercalary day date
     */
    private static calculateIntercalaryDate(
        intercalaryDay: { name: string; dayOfYear: number },
        calendar: Calendar,
        year: number
    ): CalendarDate | null {
        if (!calendar.months) return null;

        let remainingDays = intercalaryDay.dayOfYear - 1; // -1 because we start at day 1

        // Find which month this day falls in
        for (const month of calendar.months) {
            if (remainingDays <= month.days) {
                return {
                    year,
                    month: month.name,
                    day: remainingDays + 1
                };
            }
            remainingDays -= month.days;
        }

        return null;
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
            epochGregorianDate: "1970-01-01", // Critical: Unix epoch anchor
            hoursPerDay: 24,
            minutesPerHour: 60,
            secondsPerMinute: 60
        };
    }

    /**
     * Apply markers to vis-timeline as background items
     */
    static applyMarkersToTimeline(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timeline: any,
        markers: TimelineMarker[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itemsDataSet: any
    ): void {
        if (!timeline || !markers || markers.length === 0) return;

        for (const marker of markers) {
            // Add as background item
            try {
                if (marker.type === 'season' && marker.endTimestamp) {
                    // Seasons are background ranges
                    itemsDataSet.add({
                        id: marker.id,
                        content: marker.label,
                        start: new Date(marker.timestamp),
                        end: new Date(marker.endTimestamp),
                        type: 'background',
                        className: marker.className,
                        style: `background-color: ${marker.color || '#F5F5F5'}; opacity: 0.3;`,
                        title: marker.tooltip || marker.label
                    });
                } else {
                    // Holidays, intercalary days are point markers
                    itemsDataSet.add({
                        id: marker.id,
                        content: marker.label,
                        start: new Date(marker.timestamp),
                        type: 'point',
                        className: marker.className,
                        style: `color: ${marker.color || '#666'}; font-weight: bold;`,
                        title: marker.tooltip || marker.label
                    });
                }
            } catch (error) {
                console.warn(`Failed to add marker ${marker.id}:`, error);
            }
        }
    }
}
