import { DateTime } from 'luxon';
import type { Event, TimelineConflict, Character, ConflictEntity } from '../types';
import { parseEventDate } from './DateParsing';

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
    static detectAllConflicts(events: Event[]): DetectedConflict[] {
        const conflicts: DetectedConflict[] = [];

        // Detect character location conflicts
        conflicts.push(...this.detectCharacterLocationConflicts(events));

        // Detect death conflicts (character appearing after death)
        conflicts.push(...this.detectDeathConflicts(events));

        // Detect dependency conflicts
        conflicts.push(...this.detectDependencyConflicts(events));

        // Detect temporal conflicts (overlapping milestone events)
        conflicts.push(...this.detectTemporalConflicts(events));

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

        // Check each character
        for (const character of characters) {
            const characterEvents = events.filter(e =>
                e.characters?.includes(character) && e.dateTime && e.location
            );

            // Sort by date
            const sortedEvents = characterEvents.sort((a, b) => {
                const aDate = parseEventDate(a.dateTime!);
                const bDate = parseEventDate(b.dateTime!);
                if (!aDate.start || !bDate.start) return 0;
                return aDate.start < bDate.start ? -1 : 1;
            });

            // Check for overlapping events with different locations
            for (let i = 0; i < sortedEvents.length; i++) {
                for (let j = i + 1; j < sortedEvents.length; j++) {
                    const event1 = sortedEvents[i];
                    const event2 = sortedEvents[j];

                    // Skip if same location
                    if (event1.location === event2.location) continue;

                    const overlap = this.checkEventOverlap(event1, event2);
                    if (overlap) {
                        conflicts.push({
                            id: `conflict-${character}-${i}-${j}`,
                            type: 'location',
                            severity: overlap.approximate ? 'warning' : 'error',
                            message: `${character} is in two different locations at the same time`,
                            events: [event1, event2],
                            character,
                            details: {
                                timeOverlap: overlap.overlap,
                                locations: [event1.location!, event2.location!],
                                description: `${character} cannot be at "${event1.location}" and "${event2.location}" simultaneously. Events: "${event1.name}" and "${event2.name}"`
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
                const parsed = parseEventDate(event.dateTime);
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

                const evtDate = parseEventDate(evt.dateTime);
                return evtDate.start && evtDate.start > deathInfo.date;
            });

            if (postDeathEvents.length > 0) {
                conflicts.push({
                    id: `conflict-death-${character}-${Date.now()}`,
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
        const eventMap = new Map(events.map(e => [e.name, e]));

        for (const event of events) {
            if (!event.dependencies || event.dependencies.length === 0) continue;

            // Check for missing dependencies
            const missingDeps = event.dependencies.filter(dep => !eventMap.has(dep));
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
            for (const depName of event.dependencies) {
                const depEvent = eventMap.get(depName);
                if (!depEvent || !depEvent.dateTime || !event.dateTime) continue;

                const eventDate = parseEventDate(event.dateTime);
                const depDate = parseEventDate(depEvent.dateTime);

                if (!eventDate.start || !depDate.start) continue;

                if (eventDate.start < depDate.start) {
                    conflicts.push({
                        id: `conflict-dep-temporal-${event.name}-${depName}`,
                        type: 'dependency',
                        severity: 'error',
                        message: `Event "${event.name}" occurs before its dependency "${depName}"`,
                        events: [event, depEvent],
                        details: {
                            description: `"${event.name}" (${event.dateTime}) depends on "${depName}" (${depEvent.dateTime}), but occurs earlier`
                        }
                    });
                }
            }

            // Check for circular dependencies
            const circularPath = this.detectCircularDependencies(event, eventMap, new Set());
            if (circularPath.length > 0) {
                const involvedEvents = circularPath.map(name => eventMap.get(name)!).filter(e => e);
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

        // Check for milestones that occur at exactly the same time
        for (let i = 0; i < milestones.length; i++) {
            for (let j = i + 1; j < milestones.length; j++) {
                const m1 = milestones[i];
                const m2 = milestones[j];

                const date1 = parseEventDate(m1.dateTime!);
                const date2 = parseEventDate(m2.dateTime!);

                if (!date1.start || !date2.start) continue;

                // Check if they're at the exact same time (within 1 minute)
                const diffMinutes = Math.abs(date2.start.diff(date1.start, 'minutes').minutes);
                if (diffMinutes < 1) {
                    conflicts.push({
                        id: `conflict-temporal-milestone-${i}-${j}`,
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
     * Check if two events overlap in time
     */
    private static checkEventOverlap(
        event1: Event,
        event2: Event
    ): {
        overlap: { start: DateTime; end: DateTime };
        approximate: boolean;
    } | null {
        if (!event1.dateTime || !event2.dateTime) return null;

        const date1 = parseEventDate(event1.dateTime);
        const date2 = parseEventDate(event2.dateTime);

        if (!date1.start || !date2.start) return null;

        // Determine end times (use event duration or default to 1 hour)
        const end1 = date1.end || date1.start.plus({ hours: 1 });
        const end2 = date2.end || date2.start.plus({ hours: 1 });

        // Check for overlap
        const overlapStart = DateTime.max(date1.start, date2.start);
        const overlapEnd = DateTime.min(end1, end2);

        if (overlapStart < overlapEnd) {
            return {
                overlap: { start: overlapStart, end: overlapEnd },
                approximate: date1.approximate || date2.approximate || false
            };
        }

        return null;
    }

    /**
     * Detect circular dependencies using DFS
     */
    private static detectCircularDependencies(
        event: Event,
        eventMap: Map<string, Event>,
        visited: Set<string>,
        path: string[] = []
    ): string[] {
        if (!event.name) return [];

        // If we've seen this event in the current path, we have a cycle
        if (path.includes(event.name)) {
            return [...path, event.name];
        }

        // If we've already fully explored this node, skip
        if (visited.has(event.name)) {
            return [];
        }

        visited.add(event.name);
        const newPath = [...path, event.name];

        // Check all dependencies
        for (const depName of event.dependencies || []) {
            const depEvent = eventMap.get(depName);
            if (!depEvent) continue;

            const cycle = this.detectCircularDependencies(depEvent, eventMap, visited, newPath);
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
                severity: severity as 'minor' | 'moderate' | 'critical',
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
