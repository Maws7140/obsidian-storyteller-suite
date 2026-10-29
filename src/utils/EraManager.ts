import type { DateTime } from 'luxon';
import type { Event, TimelineEra } from '../types';
import { parseTimelineDate } from './DateParsing';
import type StorytellerSuitePlugin from '../main';

function eventBoundaryText(value: string, boundary: 'start' | 'end'): string {
    const parts = value.split(/\s+(?:to|through|until|thru)\s+|\s*\.\.\s*|\s+[–—]\s+/i).map(part => part.trim()).filter(Boolean);
    if (parts.length !== 2) return value;
    return boundary === 'start' ? parts[0] : parts[1];
}

/**
 * The last instant an era's end date covers. A year given as the end runs to
 * the end of that year, so `1420` keeps everything dated in 1420. A month or
 * day covers its whole span, and a timed end stays at its own instant.
 * Returns undefined when the end date cannot be read.
 */
export function resolveEraEndInstant(endDate: string | undefined): DateTime | undefined {
    if (!endDate) return undefined;
    const parsed = parseTimelineDate(eventBoundaryText(endDate, 'end'));
    if (!parsed.start) return undefined;
    if (parsed.end) return parsed.end;
    switch (parsed.precision) {
        case 'year': return parsed.start.endOf('year');
        case 'month': return parsed.start.endOf('month');
        case 'day': return parsed.start.endOf('day');
        default: return parsed.start;
    }
}

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
        return this.plugin.getTimelineEras();
    }

    /**
     * Save eras to settings
     */
    async saveEras(eras: TimelineEra[]): Promise<void> {
        // Scoped setter: this list holds the active story's eras only, so a
        // plain assignment here would delete every other story's.
        await this.plugin.setTimelineEras(eras);
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
            era.id = `era-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
        const start = parseTimelineDate(startDate);
        const end = parseTimelineDate(endDate);

        if (!start.start || !end.start) {
            return [];
        }

        return eras.filter(era => {
            const eraStart = parseTimelineDate(era.startDate);
            const eraEnd = resolveEraEndInstant(era.endDate);

            if (!eraStart.start || !eraEnd) {
                return false;
            }

            // Check for any overlap between the ranges
            return eraStart.start <= end.start! && eraEnd >= start.start!;
        });
    }

    /**
     * Get all events that fall within an era's date range
     */
    static getEventsInEra(era: TimelineEra, allEvents: Event[]): Event[] {
        const eraStart = parseTimelineDate(era.startDate);
        const eraEnd = resolveEraEndInstant(era.endDate);

        if (!eraStart.start || !eraEnd) {
            return [];
        }

        return allEvents.filter(event => {
            if (!event.dateTime) return false;

            const eventDate = parseTimelineDate(event.dateTime);
            if (!eventDate.start) return false;

            // Check if event falls within era range
            const eventStart = eventDate.start;
            const eventEnd = eventDate.end || eventDate.start;

            return eventStart >= eraStart.start! && eventEnd <= eraEnd;
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

                const era1Start = parseTimelineDate(era1.startDate);
                const era1End = parseTimelineDate(era1.endDate);
                const era2Start = parseTimelineDate(era2.startDate);
                const era2End = parseTimelineDate(era2.endDate);

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
     * Suggest eras by finding unusually large empty stretches between events.
     *
     * A gap has to be at least four times the timeline's typical positive gap,
     * and every resulting era must contain at least two dated events. This is
     * deliberately relative rather than a fixed number of days: a campaign
     * measured in hours and a history measured in decades should both work.
     * The names are intentionally provisional because elapsed time can reveal
     * a boundary, but it cannot know what a historian or author calls it.
     */
    static inferErasFromEventGaps(events: Event[]): TimelineEra[] {
        const dated = events
            .map(event => {
                if (!event.dateTime) return null;
                const parsed = parseTimelineDate(event.dateTime);
                if (!parsed.start) return null;
                return {
                    event,
                    start: parsed.start.toMillis(),
                    end: (parsed.end || parsed.start).toMillis()
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
            .sort((a, b) => a.start - b.start || a.end - b.end);

        if (dated.length < 4) return [];

        const gaps = dated.slice(0, -1).map((entry, index) => ({
            index,
            duration: dated[index + 1].start - entry.end
        }));
        const positiveGaps = gaps.map(gap => gap.duration).filter(duration => duration > 0).sort((a, b) => a - b);
        if (positiveGaps.length < 3) return [];

        const middle = Math.floor(positiveGaps.length / 2);
        const median = positiveGaps.length % 2
            ? positiveGaps[middle]
            : (positiveGaps[middle - 1] + positiveGaps[middle]) / 2;
        if (!(median > 0)) return [];

        // Take the largest gaps first and skip any that would strand a single
        // event as its own era, measured against the boundaries already kept.
        const boundaryIndexes: number[] = [];
        for (const gap of gaps.filter(gap => gap.duration >= median * 4).sort((a, b) => b.duration - a.duration)) {
            const boundary = gap.index + 1;
            const previous = Math.max(0, ...boundaryIndexes.filter(kept => kept < boundary));
            const next = Math.min(dated.length, ...boundaryIndexes.filter(kept => kept > boundary));
            if (boundary - previous >= 2 && next - boundary >= 2) boundaryIndexes.push(boundary);
        }
        if (!boundaryIndexes.length) return [];
        boundaryIndexes.sort((a, b) => a - b);

        const starts = [0, ...boundaryIndexes];
        const ends = [...boundaryIndexes, dated.length];
        const palette = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

        return starts.map((startIndex, index) => {
            const endIndex = ends[index] - 1;
            const first = dated[startIndex];
            const last = dated[endIndex];
            const startDate = eventBoundaryText(first.event.dateTime!, 'start');
            const endDate = eventBoundaryText(last.event.dateTime!, 'end');
            return {
                id: `era-auto-${first.start}-${index + 1}`,
                name: `Era ${index + 1}`,
                abbreviation: `E${index + 1}`,
                description: 'Automatically suggested from a large gap between dated events. Rename this era to match your story or history.',
                startDate,
                endDate,
                color: palette[index % palette.length],
                type: 'period',
                sortOrder: index,
                visible: true
            };
        });
    }

    /**
     * Sort eras by explicit sortOrder, then by start date. Does not filter, so
     * management UIs can list hidden eras alongside visible ones.
     */
    static sortEras(eras: TimelineEra[]): TimelineEra[] {
        return [...eras].sort((a, b) => {
            // Sort by explicit sortOrder first
            if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
                return a.sortOrder - b.sortOrder;
            }
            if (a.sortOrder !== undefined) return -1;
            if (b.sortOrder !== undefined) return 1;

            // Then by start date
            const aStart = parseTimelineDate(a.startDate);
            const bStart = parseTimelineDate(b.startDate);

            if (!aStart.start || !bStart.start) return 0;

            return aStart.start < bStart.start ? -1 : 1;
        });
    }

    /**
     * Get visible eras sorted by start date
     */
    static getVisibleEras(eras: TimelineEra[]): TimelineEra[] {
        return this.sortEras(eras.filter(era => era.visible !== false));
    }

    /**
     * Find which era(s) a specific event belongs to
     */
    static findErasForEvent(event: Event, eras: TimelineEra[]): TimelineEra[] {
        if (!event.dateTime) return [];

        const eventDate = parseTimelineDate(event.dateTime);
        if (!eventDate.start) return [];

        return eras.filter(era => {
            const eraStart = parseTimelineDate(era.startDate);
            const eraEnd = resolveEraEndInstant(era.endDate);

            if (!eraStart.start || !eraEnd) return false;

            const eventStart = eventDate.start!;
            const eventEnd = eventDate.end || eventDate.start!;

            return eventStart >= eraStart.start && eventEnd <= eraEnd;
        });
    }

    /**
     * Generate a random color for an era (if not specified)
     */
    static generateEraColor(): string {
        // Generate a random pastel color in hex format for color picker compatibility
        const hue = Math.floor(Math.random() * 360);
        const saturation = 60 + Math.floor(Math.random() * 20); // 60-80%
        const lightness = 85 + Math.floor(Math.random() * 10); // 85-95% (light backgrounds)
        
        // Convert HSL to hex
        const h = hue / 360;
        const s = saturation / 100;
        const l = lightness / 100;
        
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
        const g = Math.round(hue2rgb(p, q, h) * 255);
        const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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

        const startParsed = parseTimelineDate(era.startDate);
        const endParsed = parseTimelineDate(era.endDate);

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
        const startParsed = parseTimelineDate(era.startDate);
        const endParsed = parseTimelineDate(era.endDate);

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
