import { DateTime } from 'luxon';
import type { Event, TimelineEra } from '../types';
import { parseEventDate } from './DateParsing';
import type StorytellerSuitePlugin from '../main';

/**
 * Utility class for managing timeline eras
 * Handles era-based filtering, overlap detection, event assignment, and persistence
 */
export class EraManager {
    private plugin: StorytellerSuitePlugin;

    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;
    }

    /**
     * Get all eras from settings
     */
    async getEras(): Promise<TimelineEra[]> {
        return this.plugin.settings.timelineEras || [];
    }

    /**
     * Save eras to settings
     */
    async saveEras(eras: TimelineEra[]): Promise<void> {
        this.plugin.settings.timelineEras = eras;
        await this.plugin.saveSettings();
    }

    /**
     * Add a new era
     */
    async addEra(era: TimelineEra): Promise<TimelineEra> {
        const eras = await this.getEras();

        // Validate
        const validation = EraManager.validateEra(era);
        if (!validation.valid) {
            throw new Error(`Invalid era: ${validation.errors.join(', ')}`);
        }

        // Ensure unique ID
        if (!era.id) {
            era.id = `era-${Date.now()}`;
        }

        // Check for duplicate ID
        if (eras.find(e => e.id === era.id)) {
            era.id = `era-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // Set sort order if not provided
        if (era.sortOrder === undefined) {
            const maxOrder = Math.max(...eras.map(e => e.sortOrder || 0), -1);
            era.sortOrder = maxOrder + 1;
        }

        eras.push(era);
        await this.saveEras(eras);
        return era;
    }

    /**
     * Update an existing era
     */
    async updateEra(eraId: string, updates: Partial<TimelineEra>): Promise<TimelineEra | null> {
        const eras = await this.getEras();
        const eraIndex = eras.findIndex(e => e.id === eraId);

        if (eraIndex === -1) {
            return null;
        }

        const updatedEra = { ...eras[eraIndex], ...updates, id: eraId };

        // Validate
        const validation = EraManager.validateEra(updatedEra);
        if (!validation.valid) {
            throw new Error(`Invalid era: ${validation.errors.join(', ')}`);
        }

        eras[eraIndex] = updatedEra;
        await this.saveEras(eras);
        return updatedEra;
    }

    /**
     * Delete an era
     */
    async deleteEra(eraId: string): Promise<boolean> {
        const eras = await this.getEras();

        // Remove parent reference from children
        eras.forEach(era => {
            if (era.parentEraId === eraId) {
                era.parentEraId = undefined;
            }
        });

        const filtered = eras.filter(e => e.id !== eraId);

        if (filtered.length === eras.length - 1) {
            await this.saveEras(filtered);
            return true;
        }

        return false; // Era not found
    }

    /**
     * Get an era by ID
     */
    async getEra(eraId: string): Promise<TimelineEra | null> {
        const eras = await this.getEras();
        return eras.find(e => e.id === eraId) || null;
    }

    /**
     * Get all child eras of a parent era (hierarchical support)
     */
    async getChildEras(parentEraId: string): Promise<TimelineEra[]> {
        const eras = await this.getEras();
        return eras.filter(e => e.parentEraId === parentEraId);
    }

    /**
     * Get top-level eras (no parent)
     */
    async getTopLevelEras(): Promise<TimelineEra[]> {
        const eras = await this.getEras();
        return eras.filter(e => !e.parentEraId);
    }

    /**
     * Get hierarchical era tree
     */
    async getEraHierarchy(): Promise<Array<{ era: TimelineEra; children: TimelineEra[] }>> {
        const eras = await this.getEras();
        const topLevel = eras.filter(e => !e.parentEraId);

        return topLevel.map(era => ({
            era,
            children: eras.filter(e => e.parentEraId === era.id)
        }));
    }

    /**
     * Toggle era visibility
     */
    async toggleEraVisibility(eraId: string): Promise<boolean> {
        const era = await this.getEra(eraId);
        if (!era) return false;

        era.visible = !era.visible;
        await this.updateEra(eraId, { visible: era.visible });
        return era.visible;
    }

    /**
     * Auto-assign events to all eras
     */
    async autoAssignEventsToAllEras(): Promise<number> {
        const eras = await this.getEras();
        const events = await this.plugin.listEvents();

        const eraEventMap = EraManager.autoAssignEventsToEras(events, eras);

        let assignedCount = 0;
        for (const [eraId, eventIds] of eraEventMap) {
            const era = await this.getEra(eraId);
            if (era) {
                era.events = eventIds;
                await this.updateEra(eraId, { events: eventIds });
                assignedCount += eventIds.length;
            }
        }

        return assignedCount;
    }

    /**
     * Get era statistics
     */
    async getEraStats(eraId: string): Promise<{
        eventCount: number;
        duration: string;
        childCount: number;
    } | null> {
        const era = await this.getEra(eraId);
        if (!era) return null;

        const children = await this.getChildEras(eraId);
        const events = await this.plugin.listEvents();
        const eventsInEra = EraManager.getEventsInEra(era, events);

        return {
            eventCount: eventsInEra.length,
            duration: EraManager.getEraDuration(era),
            childCount: children.length
        };
    }
    /**
     * Get all eras that overlap with a given date range
     */
    static getErasForDateRange(
        eras: TimelineEra[],
        startDate: string,
        endDate: string
    ): TimelineEra[] {
        const start = parseEventDate(startDate);
        const end = parseEventDate(endDate);

        if (!start.start || !end.start) {
            return [];
        }

        return eras.filter(era => {
            const eraStart = parseEventDate(era.startDate);
            const eraEnd = parseEventDate(era.endDate);

            if (!eraStart.start || !eraEnd.start) {
                return false;
            }

            // Check for any overlap between the ranges
            return eraStart.start! <= end.start! && eraEnd.start! >= start.start!;
        });
    }

    /**
     * Get all events that fall within an era's date range
     */
    static getEventsInEra(era: TimelineEra, allEvents: Event[]): Event[] {
        const eraStart = parseEventDate(era.startDate);
        const eraEnd = parseEventDate(era.endDate);

        if (!eraStart.start || !eraEnd.start) {
            return [];
        }

        return allEvents.filter(event => {
            if (!event.dateTime) return false;

            const eventDate = parseEventDate(event.dateTime);
            if (!eventDate.start) return false;

            // Check if event falls within era range
            const eventStart = eventDate.start;
            const eventEnd = eventDate.end || eventDate.start;

            return eventStart! >= eraStart.start! && eventEnd! <= eraEnd.start!;
        });
    }

    /**
     * Detect overlapping eras (useful for validation warnings)
     */
    static detectEraOverlaps(eras: TimelineEra[]): Array<{
        era1: TimelineEra;
        era2: TimelineEra;
        overlapType: 'partial' | 'complete' | 'nested';
    }> {
        const overlaps: Array<{
            era1: TimelineEra;
            era2: TimelineEra;
            overlapType: 'partial' | 'complete' | 'nested';
        }> = [];

        for (let i = 0; i < eras.length; i++) {
            for (let j = i + 1; j < eras.length; j++) {
                const era1 = eras[i];
                const era2 = eras[j];

                const era1Start = parseEventDate(era1.startDate);
                const era1End = parseEventDate(era1.endDate);
                const era2Start = parseEventDate(era2.startDate);
                const era2End = parseEventDate(era2.endDate);

                if (!era1Start.start || !era1End.start || !era2Start.start || !era2End.start) {
                    continue;
                }

                // Check for overlap
                if (era1Start.start <= era2End.start && era1End.start >= era2Start.start) {
                    let overlapType: 'partial' | 'complete' | 'nested';

                    // Determine overlap type
                    if (
                        era1Start.start <= era2Start.start &&
                        era1End.start >= era2End.start
                    ) {
                        overlapType = 'nested'; // era1 contains era2
                    } else if (
                        era2Start.start <= era1Start.start &&
                        era2End.start >= era1End.start
                    ) {
                        overlapType = 'nested'; // era2 contains era1
                    } else if (
                        era1Start.start.equals(era2Start.start) &&
                        era1End.start.equals(era2End.start)
                    ) {
                        overlapType = 'complete'; // Exact same dates
                    } else {
                        overlapType = 'partial'; // Partial overlap
                    }

                    overlaps.push({ era1, era2, overlapType });
                }
            }
        }

        return overlaps;
    }

    /**
     * Auto-assign events to eras based on date ranges
     * Updates era.events arrays with event IDs/names
     */
    static autoAssignEventsToEras(
        events: Event[],
        eras: TimelineEra[]
    ): Map<string, string[]> {
        const eraEventMap = new Map<string, string[]>();

        for (const era of eras) {
            const eventsInEra = this.getEventsInEra(era, events);
            const eventIds = eventsInEra
                .map(e => e.id || e.name)
                .filter(id => id);
            eraEventMap.set(era.id, eventIds);
        }

        return eraEventMap;
    }

    /**
     * Get visible eras sorted by start date
     */
    static getVisibleEras(eras: TimelineEra[]): TimelineEra[] {
        return eras
            .filter(era => era.visible !== false)
            .sort((a, b) => {
                // Sort by explicit sortOrder first
                if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
                    return a.sortOrder - b.sortOrder;
                }
                if (a.sortOrder !== undefined) return -1;
                if (b.sortOrder !== undefined) return 1;

                // Then by start date
                const aStart = parseEventDate(a.startDate);
                const bStart = parseEventDate(b.startDate);

                if (!aStart.start || !bStart.start) return 0;

                return aStart.start < bStart.start ? -1 : 1;
            });
    }

    /**
     * Find which era(s) a specific event belongs to
     */
    static findErasForEvent(event: Event, eras: TimelineEra[]): TimelineEra[] {
        if (!event.dateTime) return [];

        const eventDate = parseEventDate(event.dateTime);
        if (!eventDate.start) return [];

        return eras.filter(era => {
            const eraStart = parseEventDate(era.startDate);
            const eraEnd = parseEventDate(era.endDate);

            if (!eraStart.start || !eraEnd.start) return false;

            const eventStart = eventDate.start!;
            const eventEnd = eventDate.end || eventDate.start!;

            return eventStart >= eraStart.start && eventEnd <= eraEnd.start;
        });
    }

    /**
     * Generate a random color for an era (if not specified)
     */
    static generateEraColor(): string {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 60 + Math.floor(Math.random() * 20); // 60-80%
        const lightness = 85 + Math.floor(Math.random() * 10); // 85-95% (light backgrounds)
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    /**
     * Validate era dates
     */
    static validateEra(era: TimelineEra): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!era.name || era.name.trim() === '') {
            errors.push('Era name is required');
        }

        if (!era.startDate || era.startDate.trim() === '') {
            errors.push('Start date is required');
        }

        if (!era.endDate || era.endDate.trim() === '') {
            errors.push('End date is required');
        }

        const startParsed = parseEventDate(era.startDate);
        const endParsed = parseEventDate(era.endDate);

        if (startParsed.error) {
            errors.push(`Invalid start date: ${startParsed.error}`);
        }

        if (endParsed.error) {
            errors.push(`Invalid end date: ${endParsed.error}`);
        }

        if (startParsed.start && endParsed.start && startParsed.start > endParsed.start) {
            errors.push('Start date must be before or equal to end date');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get era duration in a human-readable format
     */
    static getEraDuration(era: TimelineEra): string {
        const startParsed = parseEventDate(era.startDate);
        const endParsed = parseEventDate(era.endDate);

        if (!startParsed.start || !endParsed.start) {
            return 'Unknown duration';
        }

        const diff = endParsed.start.diff(startParsed.start, ['years', 'months', 'days']);

        if (diff.years > 0) {
            const months = Math.round(diff.months);
            return `${Math.round(diff.years)} year${diff.years !== 1 ? 's' : ''}${
                months > 0 ? `, ${months} month${months !== 1 ? 's' : ''}` : ''
            }`;
        } else if (diff.months > 0) {
            const days = Math.round(diff.days);
            return `${Math.round(diff.months)} month${diff.months !== 1 ? 's' : ''}${
                days > 0 ? `, ${days} day${days !== 1 ? 's' : ''}` : ''
            }`;
        } else {
            return `${Math.round(diff.days)} day${diff.days !== 1 ? 's' : ''}`;
        }
    }
}
