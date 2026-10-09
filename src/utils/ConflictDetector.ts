import { DateTime } from 'luxon';
import type { Character, Event, Location, TimelineConflict, ConflictEntity } from '../types';
import { parseTimelineDate, type ParsedEventDate } from './DateParsing';

/**
 * Half-open [start, end) range of an event at its precision, as used for overlap checks.
 */
interface EventSpan {
    start: DateTime;
    end: DateTime;
    approximate: boolean;
}

/** Normalize a parsed date into its precision-aware span, or undefined when it has no start. */
function toSpan(date: ParsedEventDate): EventSpan | undefined {
    if (!date.start) return undefined;
    let start = date.start;
    let end = date.end;

    if (date.precision === 'day') {
        start = start.startOf('day');
        end = end ? end.startOf('day').plus({ days: 1 }) : start.plus({ days: 1 });
    } else if (date.precision === 'month') {
        start = start.startOf('month');
        end = end ? end.startOf('month').plus({ months: 1 }) : start.plus({ months: 1 });
    } else if (date.precision === 'year') {
        start = start.startOf('year');
        end = end ? end.startOf('year').plus({ years: 1 }) : start.plus({ years: 1 });
    } else {
        // Time precision
        if (!end) end = start.plus({ hours: 1 });
    }

    return { start, end, approximate: date.approximate || false };
}

/**
 * Memoized date parsing for one detection pass. Parsing (Luxon plus chrono fallbacks) was the
 * dominant cost of conflict detection because the same strings were re-parsed for every pair of
 * events. Keyed by the raw string, so each distinct date is parsed once per pass.
 */
function createDateCache() {
    const parsed = new Map<string, ParsedEventDate>();
    const spans = new Map<string, EventSpan | undefined>();
    const parse = (raw: string): ParsedEventDate => {
        let result = parsed.get(raw);
        if (!result) {
            result = parseTimelineDate(raw);
            parsed.set(raw, result);
        }
        return result;
    };
    const span = (raw: string): EventSpan | undefined => {
        if (!spans.has(raw)) spans.set(raw, toSpan(parse(raw)));
        return spans.get(raw);
    };
    return { parse, span };
}

/**
 * Conflict types
 */
export type ConflictType = 'location' | 'character' | 'temporal' | 'dependency';

export interface DetectedConflict {
    id: string;
    type: ConflictType;
    severity: 'error' | 'warning' | 'info';
    message: string;
    events: Event[];
    character?: string;
    details: {
        timeOverlap?: {
            start: DateTime;
            end: DateTime;
        };
        locations?: string[];
        description?: string;
    };
}

/**
 * Utility class for detecting timeline conflicts
 * Flags when characters are in multiple places simultaneously or when events have logical conflicts
 */
export class ConflictDetector {
    /**
     * Detect all conflicts in a set of events
     */
    static detectAllConflicts(events: Event[], characters: Character[] = [], locations: Location[] = []): DetectedConflict[] {
        const conflicts: DetectedConflict[] = [];

        // Detect character location conflicts
        conflicts.push(...this.detectCharacterLocationConflicts(events));

        conflicts.push(...this.detectPresenceConflicts(events, characters, locations));

        // Detect death conflicts (character appearing after death)
        conflicts.push(...this.detectDeathConflicts(events));

        // Detect dependency conflicts
        conflicts.push(...this.detectDependencyConflicts(events));

        // Detect temporal conflicts (overlapping milestone events)
        conflicts.push(...this.detectTemporalConflicts(events));

        return conflicts;
    }

    /** Detect an event placing a character away from their recorded presence span. */
    static detectPresenceConflicts(events: Event[], characters: Character[], locations: Location[] = []): DetectedConflict[] {
        const conflicts: DetectedConflict[] = [];
        const clean = (value: string): string => {
            const trimmed = String(value ?? '').trim();
            const wiki = trimmed.match(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
            return (wiki?.[1] ?? trimmed).trim().toLowerCase();
        };
        const locationNames = new Map<string, string>();
        for (const location of locations) {
            locationNames.set(clean(location.name), location.name);
            if (location.id) locationNames.set(clean(location.id), location.name);
        }
        const locationName = (value: string): string => locationNames.get(clean(value)) ?? value;
        const { parse } = createDateCache();

        for (const character of characters) {
            const refs = new Set([clean(character.name), character.id ? clean(character.id) : ''].filter(Boolean));
            const characterEvents = events.filter(event =>
                Boolean(event.dateTime && event.location && event.characters?.some(ref => refs.has(clean(ref))))
            );
            if (!characterEvents.length) continue;

            const stays = (character.locationHistory ?? [])
                .map(entry => {
                    const end = entry.timeRange?.end ? parse(entry.timeRange.end) : undefined;
                    return {
                        location: locationName(entry.locationId),
                        start: parse(entry.timeRange?.start ?? '').start,
                        end: end?.end ?? end?.start,
                    };
                })
                .filter((stay): stay is { location: string; start: DateTime; end: DateTime | undefined } => Boolean(stay.start))
                .sort((left, right) => left.start.toMillis() - right.start.toMillis());

            stays.forEach((stay, index) => {
                const spanEnd = stay.end ?? stays[index + 1]?.start;
                for (const event of characterEvents) {
                    if (clean(locationName(event.location!)) === clean(stay.location)) continue;
                    const parsed = parse(event.dateTime!);
                    if (!parsed.start) continue;
                    const eventEnd = parsed.end ?? parsed.start;
                    const overlaps = spanEnd
                        ? parsed.start <= spanEnd && eventEnd >= stay.start
                        : eventEnd >= stay.start;
                    if (!overlaps) continue;

                    const claimed = Boolean(event.claimedBy?.length || (event.certainty && event.certainty !== 'established'));
                    const eventId = event.id || event.name.replace(/[^a-zA-Z0-9]/g, '');
                    conflicts.push({
                        id: `conflict-presence-${character.id || clean(character.name)}-${eventId}`,
                        type: 'location',
                        severity: claimed ? 'warning' : 'error',
                        message: claimed
                            ? `${character.name}'s claimed event conflicts with their recorded presence`
                            : `${character.name}'s event conflicts with their recorded presence`,
                        events: [event],
                        character: character.name,
                        details: {
                            locations: [stay.location, event.location!],
                            description: `${character.name} is recorded at ${stay.location}, but "${event.name}" places them at ${event.location}.`,
                        },
                    });
                }
            });
        }

        return conflicts;
    }

    /**
     * Detect when a character is in multiple locations at the same time
     */
    static detectCharacterLocationConflicts(events: Event[]): DetectedConflict[] {
        const conflicts: DetectedConflict[] = [];

        // Get all characters mentioned in events
        const characters = new Set<string>();
        events.forEach(event => {
            event.characters?.forEach(char => characters.add(char));
        });

        const { parse, span } = createDateCache();

        // Check each character
        for (const character of characters) {
            const characterEvents = events.filter(e =>
                e.characters?.includes(character) && e.dateTime && e.location
            );

            // Sort by date. The comparator is deliberately unchanged (raw parsed starts, undated
            // events and ties compare as equal), so the resulting order and conflict order stay identical.
            const sortedEvents = characterEvents.sort((a, b) => {
                const aStart = parse(a.dateTime!).start;
                const bStart = parse(b.dateTime!).start;
                if (!aStart || !bStart) return 0;
                return aStart < bStart ? -1 : 1;
            });

            const spans = sortedEvents.map(e => span(e.dateTime!));

            // The inner loop can stop early only when every start is known and non-decreasing:
            // once a later event starts at or after the current event ends, nothing after it can
            // overlap either. Any NaN or undated entry falls back to checking every pair.
            let startsSorted = spans.every(Boolean);
            for (let k = 1; startsSorted && k < spans.length; k++) {
                if (!(spans[k - 1]!.start.toMillis() <= spans[k]!.start.toMillis())) startsSorted = false;
            }

            // Check for overlapping events with different locations
            for (let i = 0; i < sortedEvents.length; i++) {
                const span1 = spans[i];
                if (!span1) continue;
                for (let j = i + 1; j < sortedEvents.length; j++) {
                    const event1 = sortedEvents[i];
                    const event2 = sortedEvents[j];
                    const span2 = spans[j];
                    if (!span2) continue;
                    if (startsSorted && span2.start.toMillis() >= span1.end.toMillis()) break;

                    // Skip if same location
                    if (event1.location === event2.location) continue;

                    const overlap = this.checkSpanOverlap(span1, span2);
                    if (overlap) {
                        // Use event IDs or names for stable conflict IDs
                        const id1 = event1.id || event1.name.replace(/[^a-zA-Z0-9]/g, '');
                        const id2 = event2.id || event2.name.replace(/[^a-zA-Z0-9]/g, '');
                        
                        conflicts.push({
                            id: `conflict-${character}-${id1}-${id2}`,
                            type: 'location',
                            severity: overlap.approximate ? 'warning' : 'error',
                            message: `${character} is in two different locations at the same time`,
                            events: [event1, event2],
                            character,
                            details: {
                                timeOverlap: overlap.overlap,
                                locations: [event1.location!, event2.location!],
                                description: `${character} cannot be at two different locations simultaneously. Events: "${event1.name}" and "${event2.name}"`
                            }
                        });
                    }
                }
            }
        }

        return conflicts;
    }

    /**
     * Detect characters appearing alive after death events
     * Looks for events tagged with death-related keywords and checks if character appears in later events
     */
    static detectDeathConflicts(events: Event[]): DetectedConflict[] {
        const conflicts: DetectedConflict[] = [];
        const { parse } = createDateCache();

        // Find characters who have death events
        const characterDeaths = new Map<string, { event: Event; date: DateTime }>();

        events.forEach(event => {
            if (!event.characters || !event.dateTime) return;

            // Check if this is a death event
            const isDeath = event.name.toLowerCase().includes('death') ||
                          event.description?.toLowerCase().includes('dies') ||
                          event.description?.toLowerCase().includes('died') ||
                          event.description?.toLowerCase().includes('killed') ||
                          event.tags?.some(tag => tag.toLowerCase().includes('death'));

            if (isDeath) {
                const parsed = parse(event.dateTime);
                if (parsed.start) {
                    event.characters.forEach(char => {
                        const existing = characterDeaths.get(char);
                        // Store earliest death for each character
                        if (!existing || parsed.start! < existing.date) {
                            characterDeaths.set(char, { event, date: parsed.start! });
                        }
                    });
                }
            }
        });

        // Check for events where dead characters appear
        characterDeaths.forEach((deathInfo, character) => {
            const postDeathEvents = events.filter(evt => {
                if (!evt.characters?.includes(character)) return false;
                if (!evt.dateTime) return false;
                if (evt === deathInfo.event) return false; // Skip the death event itself

                const evtDate = parse(evt.dateTime);
                return evtDate.start && evtDate.start > deathInfo.date;
            });

            if (postDeathEvents.length > 0) {
                const deathId = deathInfo.event.id || deathInfo.event.name.replace(/[^a-zA-Z0-9]/g, '');
                
                conflicts.push({
                    id: `conflict-death-${character}-${deathId}`,
                    type: 'character',
                    severity: 'error',
                    message: `${character} appears in events after their death`,
                    events: [deathInfo.event, ...postDeathEvents],
                    character,
                    details: {
                        description: `${character} died in "${deathInfo.event.name}" (${deathInfo.event.dateTime}) but appears in ${postDeathEvents.length} event(s) after death: ${postDeathEvents.map(e => e.name).join(', ')}`
                    }
                });
            }
        });

        return conflicts;
    }

    /**
     * Detect dependency conflicts (circular dependencies, missing dependencies, etc.)
     */
    static detectDependencyConflicts(events: Event[]): DetectedConflict[] {
        const conflicts: DetectedConflict[] = [];
        const { parse } = createDateCache();
        const eventMap = new Map<string, Event>();
        const eventNameMap = new Map<string, Event>();
        const eventLowerNameMap = new Map<string, Event>();
        const getEventKey = (event: Event): string => event.id || event.name;
        const getDependencyLabel = (event: Event, dependencyRef: string): string => {
            const dependencyIndex = Array.isArray(event.dependencies)
                ? event.dependencies.indexOf(dependencyRef)
                : -1;
            if (dependencyIndex >= 0 && Array.isArray(event.dependencyNames)) {
                const dependencyName = event.dependencyNames[dependencyIndex];
                if (typeof dependencyName === 'string' && dependencyName.trim()) {
                    return dependencyName.trim();
                }
            }
            return dependencyRef;
        };
        const resolveDependency = (dependencyRef: string): Event | undefined => {
            const ref = String(dependencyRef ?? '').trim();
            if (!ref) return undefined;
            return eventMap.get(ref)
                || eventNameMap.get(ref)
                || eventLowerNameMap.get(ref.toLowerCase());
        };

        for (const event of events) {
            const key = getEventKey(event);
            if (key) eventMap.set(key, event);
            if (event.name) {
                eventNameMap.set(event.name, event);
                eventLowerNameMap.set(event.name.toLowerCase(), event);
            }
        }

        for (const event of events) {
            if (!event.dependencies || event.dependencies.length === 0) continue;

            // Check for missing dependencies
            const missingDeps = event.dependencies
                .filter(dep => !resolveDependency(dep))
                .map(dep => getDependencyLabel(event, dep));
            if (missingDeps.length > 0) {
                conflicts.push({
                    id: `conflict-dep-missing-${event.name}`,
                    type: 'dependency',
                    severity: 'warning',
                    message: `Event "${event.name}" has missing dependencies`,
                    events: [event],
                    details: {
                        description: `Missing dependencies: ${missingDeps.join(', ')}`
                    }
                });
            }

            // Check for temporal dependency conflicts (dependent event happens before dependency)
            for (const depRef of event.dependencies) {
                const depEvent = resolveDependency(depRef);
                const depLabel = depEvent?.name || getDependencyLabel(event, depRef);
                if (!depEvent || !depEvent.dateTime || !event.dateTime) continue;

                const eventDate = parse(event.dateTime);
                const depDate = parse(depEvent.dateTime);

                if (!eventDate.start || !depDate.start) continue;

                if (eventDate.start < depDate.start) {
                    conflicts.push({
                        id: `conflict-dep-temporal-${event.name}-${depEvent.id || depLabel}`,
                        type: 'dependency',
                        severity: 'error',
                        message: `Event "${event.name}" occurs before its dependency "${depLabel}"`,
                        events: [event, depEvent],
                        details: {
                            description: `"${event.name}" (${event.dateTime}) depends on "${depLabel}" (${depEvent.dateTime}), but occurs earlier`
                        }
                    });
                }
            }

            // Check for circular dependencies
            const circularPath = this.detectCircularDependencies(event, resolveDependency, new Set());
            if (circularPath.length > 0) {
                const involvedEvents = circularPath
                    .map(label => eventNameMap.get(label) || eventLowerNameMap.get(label.toLowerCase()))
                    .filter((candidate): candidate is Event => Boolean(candidate));
                conflicts.push({
                    id: `conflict-dep-circular-${event.name}`,
                    type: 'dependency',
                    severity: 'error',
                    message: `Circular dependency detected involving "${event.name}"`,
                    events: involvedEvents,
                    details: {
                        description: `Circular dependency chain: ${circularPath.join(' → ')}`
                    }
                });
            }
        }

        return conflicts;
    }

    /**
     * Detect temporal conflicts (e.g., overlapping milestones)
     */
    static detectTemporalConflicts(events: Event[]): DetectedConflict[] {
        const conflicts: DetectedConflict[] = [];
        const milestones = events.filter(e => e.isMilestone && e.dateTime);
        const { parse } = createDateCache();

        // Check for milestones that occur at exactly the same time
        for (let i = 0; i < milestones.length; i++) {
            for (let j = i + 1; j < milestones.length; j++) {
                const m1 = milestones[i];
                const m2 = milestones[j];

                const date1 = parse(m1.dateTime!);
                const date2 = parse(m2.dateTime!);

                if (!date1.start || !date2.start) continue;

                // Check if they're at the exact same time (within 1 minute)
                const diffMinutes = Math.abs(date2.start.diff(date1.start, 'minutes').minutes);
                if (diffMinutes < 1) {
                    const id1 = m1.id || m1.name.replace(/[^a-zA-Z0-9]/g, '');
                    const id2 = m2.id || m2.name.replace(/[^a-zA-Z0-9]/g, '');
                    
                    conflicts.push({
                        id: `conflict-temporal-milestone-${id1}-${id2}`,
                        type: 'temporal',
                        severity: 'info',
                        message: `Multiple milestones at the same time`,
                        events: [m1, m2],
                        details: {
                            description: `Milestones "${m1.name}" and "${m2.name}" occur at the same time (${m1.dateTime})`
                        }
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Check if two precision-normalized event spans overlap in time
     */
    private static checkSpanOverlap(
        span1: EventSpan,
        span2: EventSpan
    ): {
        overlap: { start: DateTime; end: DateTime };
        approximate: boolean;
    } | null {
        const overlapStart = DateTime.max(span1.start, span2.start);
        const overlapEnd = DateTime.min(span1.end, span2.end);

        if (overlapStart < overlapEnd) {
            return {
                overlap: { start: overlapStart, end: overlapEnd },
                approximate: span1.approximate || span2.approximate
            };
        }

        return null;
    }

    /**
     * Detect circular dependencies using DFS
     */
    private static detectCircularDependencies(
        event: Event,
        resolveDependency: (dependencyRef: string) => Event | undefined,
        visited: Set<string>,
        path: string[] = []
    ): string[] {
        const eventKey = event.id || event.name;
        if (!eventKey || !event.name) return [];

        // If we've seen this event in the current path, we have a cycle
        if (path.includes(event.name)) {
            return [...path, event.name];
        }

        // If we've already fully explored this node, skip
        if (visited.has(eventKey)) {
            return [];
        }

        visited.add(eventKey);
        const newPath = [...path, event.name];

        // Check all dependencies
        for (const depRef of event.dependencies || []) {
            const depEvent = resolveDependency(depRef);
            if (!depEvent) continue;

            const cycle = this.detectCircularDependencies(depEvent, resolveDependency, visited, newPath);
            if (cycle.length > 0) {
                return cycle;
            }
        }

        return [];
    }

    /**
     * Get conflicts for a specific character
     */
    static getConflictsForCharacter(character: string, conflicts: DetectedConflict[]): DetectedConflict[] {
        return conflicts.filter(c => c.character === character);
    }

    /**
     * Get conflicts for a specific event
     */
    static getConflictsForEvent(eventName: string, conflicts: DetectedConflict[]): DetectedConflict[] {
        return conflicts.filter(c =>
            c.events.some(e => e.name === eventName)
        );
    }

    /**
     * Get conflicts by severity
     */
    static getConflictsBySeverity(
        severity: 'error' | 'warning' | 'info',
        conflicts: DetectedConflict[]
    ): DetectedConflict[] {
        return conflicts.filter(c => c.severity === severity);
    }

    /**
     * Get conflicts by type
     */
    static getConflictsByType(
        type: ConflictType,
        conflicts: DetectedConflict[]
    ): DetectedConflict[] {
        return conflicts.filter(c => c.type === type);
    }

    /**
     * Convert conflicts to TimelineConflict format for storage
     */
    static toStorageFormat(conflicts: DetectedConflict[]): TimelineConflict[] {
        return conflicts.map(c => {
            const entities: ConflictEntity[] = [];

            // Add character as entity if present
            if (c.character) {
                entities.push({
                    entityId: c.character,
                    entityType: 'character',
                    entityName: c.character
                });
            }

            // Convert severity from 'error' | 'warning' | 'info' to 'critical' | 'moderate' | 'minor'
            const severity = c.severity === 'error' ? 'critical' : c.severity === 'warning' ? 'moderate' : 'minor';

            // Map ConflictType to TimelineConflict type
            let conflictType: 'location' | 'death' | 'age' | 'causality' | 'custom';
            switch (c.type) {
                case 'location':
                    conflictType = 'location';
                    break;
                case 'temporal':
                case 'dependency':
                    conflictType = 'causality';
                    break;
                case 'character':
                    conflictType = 'age'; // Character conflicts often relate to age/timeline issues
                    break;
                default:
                    conflictType = 'custom';
            }

            return {
                id: c.id,
                type: conflictType,
                severity: severity,
                entities: entities,
                events: c.events.map(e => e.id || e.name),
                description: c.message,
                dismissed: false,
                detected: new Date().toISOString()
            };
        });
    }

    /**
     * Get a human-readable description of conflict severity
     */
    static getSeverityDescription(severity: 'error' | 'warning' | 'info'): string {
        switch (severity) {
            case 'error':
                return 'Error - Major timeline inconsistency that breaks narrative logic';
            case 'warning':
                return 'Warning - Potential issue that should be reviewed';
            case 'info':
                return 'Info - Minor inconsistency or suggestion for improvement';
            default:
                return 'Unknown severity level';
        }
    }

    /**
     * Get conflict type icon for UI display
     */
    static getConflictIcon(type: string): string {
        switch (type) {
            case 'location':
                return '📍';
            case 'character':
            case 'death':
                return '💀';
            case 'temporal':
            case 'age':
                return '📅';
            case 'dependency':
            case 'causality':
                return '🔗';
            default:
                return '⚠️';
        }
    }

    /**
     * Generate a summary report of conflicts
     */
    static generateConflictReport(conflicts: DetectedConflict[]): string {
        const errors = conflicts.filter(c => c.severity === 'error');
        const warnings = conflicts.filter(c => c.severity === 'warning');
        const info = conflicts.filter(c => c.severity === 'info');

        let report = `# Timeline Conflict Report\n\n`;
        report += `**Total Conflicts:** ${conflicts.length}\n`;
        report += `- Errors: ${errors.length}\n`;
        report += `- Warnings: ${warnings.length}\n`;
        report += `- Info: ${info.length}\n\n`;

        if (errors.length > 0) {
            report += `## Errors\n\n`;
            errors.forEach((c, i) => {
                report += `${i + 1}. **${c.message}**\n`;
                report += `   - Type: ${c.type}\n`;
                report += `   - Events: ${c.events.map(e => e.name).join(', ')}\n`;
                report += `   - ${c.details.description}\n\n`;
            });
        }

        if (warnings.length > 0) {
            report += `## Warnings\n\n`;
            warnings.forEach((c, i) => {
                report += `${i + 1}. **${c.message}**\n`;
                report += `   - Type: ${c.type}\n`;
                report += `   - Events: ${c.events.map(e => e.name).join(', ')}\n`;
                report += `   - ${c.details.description}\n\n`;
            });
        }

        return report;
    }
}
