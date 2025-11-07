import type { Event, Character, Location, TimelineConflict, CausalityLink, AlteredEntity } from '../types';
import { parseEventDate } from './DateParsing';

/**
 * ConflictDetector
 *
 * Automated timeline conflict detection engine for narrative consistency.
 * Detects various types of timeline conflicts including:
 * - Characters appearing in multiple locations simultaneously
 * - Dead characters appearing alive after death events
 * - Age inconsistencies (future implementation)
 * - Causality violations (effect before cause)
 */
export class ConflictDetector {

    /**
     * Detect all timeline conflicts
     * @param events - All story events
     * @param characters - All story characters
     * @param locations - All story locations
     * @param causalityLinks - Optional causality links for enhanced detection
     * @returns Array of detected conflicts
     */
    static detectConflicts(
        events: Event[],
        characters: Character[],
        locations: Location[],
        causalityLinks?: CausalityLink[]
    ): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // Detect character at multiple places simultaneously
        conflicts.push(...this.detectLocationConflicts(events, characters));

        // Detect dead characters appearing alive
        conflicts.push(...this.detectDeathConflicts(events, characters));

        // Detect age inconsistencies (future implementation with calendar integration)
        conflicts.push(...this.detectAgeConflicts(events, characters));

        // Detect causality violations (effect before cause)
        conflicts.push(...this.detectCausalityConflicts(events, causalityLinks));

        return conflicts;
    }

    /**
     * Detect characters appearing in multiple locations at the same time
     * Groups events by date and checks if any character is in multiple places
     * @param events - All story events
     * @param characters - All story characters
     * @returns Array of location conflicts
     */
    static detectLocationConflicts(events: Event[], characters: Character[]): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // Group events by date
        const eventsByDate = new Map<string, Event[]>();
        events.forEach(event => {
            if (event.dateTime) {
                const date = event.dateTime;
                if (!eventsByDate.has(date)) {
                    eventsByDate.set(date, []);
                }
                eventsByDate.get(date)!.push(event);
            }
        });

        // Check each date for conflicts
        eventsByDate.forEach((dayEvents, date) => {
            const characterLocations = new Map<string, Set<string>>();

            dayEvents.forEach(event => {
                if (event.location && event.characters) {
                    event.characters.forEach(charName => {
                        if (!characterLocations.has(charName)) {
                            characterLocations.set(charName, new Set());
                        }
                        characterLocations.get(charName)!.add(event.location!);
                    });
                }
            });

            // Find characters at multiple locations
            characterLocations.forEach((locations, charName) => {
                if (locations.size > 1) {
                    const affectedEvents = dayEvents
                        .filter(e => e.characters?.includes(charName))
                        .map(e => e.id || e.name);

                    conflicts.push({
                        id: `location-conflict-${charName}-${date}-${Date.now()}`,
                        type: 'location',
                        severity: 'critical',
                        entities: [
                            {
                                entityId: charName,
                                entityType: 'character',
                                entityName: charName,
                                conflictField: 'location',
                                conflictValue: Array.from(locations).join(', ')
                            }
                        ],
                        events: affectedEvents,
                        description: `Character "${charName}" appears at multiple locations on ${date}: ${Array.from(locations).join(', ')}`,
                        suggestion: `Review events on ${date} and ensure ${charName} is only in one location, or add travel time between events.`,
                        dismissed: false,
                        detected: new Date().toISOString()
                    });
                }
            });
        });

        return conflicts;
    }

    /**
     * Detect characters appearing alive after death events
     * Identifies deceased characters who appear in events after their death
     * @param events - All story events
     * @param characters - All story characters
     * @returns Array of death conflicts
     */
    static detectDeathConflicts(events: Event[], characters: Character[]): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // Find characters marked as deceased
        const deceasedCharacters = characters.filter(c =>
            c.status?.toLowerCase() === 'deceased' ||
            c.status?.toLowerCase() === 'dead'
        );

        deceasedCharacters.forEach(character => {
            // Find events where they died
            const deathEvents = events.filter(e =>
                e.characters?.includes(character.name) &&
                (e.name.toLowerCase().includes('death') ||
                 e.description?.toLowerCase().includes('dies') ||
                 e.description?.toLowerCase().includes('killed') ||
                 e.description?.toLowerCase().includes('died'))
            );

            if (deathEvents.length > 0) {
                const deathEvent = deathEvents[0]; // First death event
                const deathDate = parseEventDate(deathEvent.dateTime || '');

                if (!deathDate.start?.toMillis()) {
                    return; // Can't detect conflicts without valid death date
                }

                // Find events after death where character appears
                const postDeathEvents = events.filter(e => {
                    if (!e.characters?.includes(character.name)) return false;
                    if (!e.dateTime || !deathEvent.dateTime) return false;

                    const eventDate = parseEventDate(e.dateTime);
                    const deathMillis = deathDate.start?.toMillis();
                    const eventMillis = eventDate.start?.toMillis();
                    return eventMillis && deathMillis && eventMillis > deathMillis;
                });

                if (postDeathEvents.length > 0) {
                    conflicts.push({
                        id: `death-conflict-${character.name}-${Date.now()}`,
                        type: 'death',
                        severity: 'critical',
                        entities: [
                            {
                                entityId: character.id || character.name,
                                entityType: 'character',
                                entityName: character.name,
                                conflictField: 'status',
                                conflictValue: 'deceased'
                            }
                        ],
                        events: [deathEvent.id || deathEvent.name, ...postDeathEvents.map(e => e.id || e.name)],
                        description: `Character "${character.name}" appears alive after death event "${deathEvent.name}" (${deathEvent.dateTime})`,
                        suggestion: `Review events after ${deathEvent.dateTime} and remove ${character.name} or change their status to alive if they were resurrected.`,
                        dismissed: false,
                        detected: new Date().toISOString()
                    });
                }
            }
        });

        return conflicts;
    }

    /**
     * Detect age inconsistencies
     * Placeholder for future implementation with Calendar integration
     * Will detect characters being too young/old for events
     * @param events - All story events
     * @param characters - All story characters
     * @returns Array of age conflicts (currently empty)
     */
    static detectAgeConflicts(events: Event[], characters: Character[]): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // This requires birthdate information in customFields or as a field
        // To be implemented with Calendar integration in future phase
        // Would check:
        // - Character age vs event requirements (e.g., 5-year-old in battle)
        // - Character appearing before birth
        // - Character living beyond reasonable lifespan

        return conflicts;
    }

    /**
     * Detect causality violations (effect occurring before cause)
     * Checks event dependencies and explicit causality links
     * @param events - All story events
     * @param causalityLinks - Optional explicit causality links
     * @returns Array of causality conflicts
     */
    static detectCausalityConflicts(
        events: Event[],
        causalityLinks?: CausalityLink[]
    ): TimelineConflict[] {
        const conflicts: TimelineConflict[] = [];

        // Check event dependencies
        events.forEach(event => {
            if (event.dependencies && event.dependencies.length > 0) {
                const eventDate = parseEventDate(event.dateTime || '');

                if (!eventDate.start?.toMillis()) {
                    return; // Can't detect conflicts without valid date
                }

                event.dependencies.forEach(depName => {
                    const depEvent = events.find(e => e.name === depName || e.id === depName);
                    if (depEvent && depEvent.dateTime) {
                        const depDate = parseEventDate(depEvent.dateTime);
                        const depMillis = depDate.start?.toMillis();
                        const eventMillis = eventDate.start?.toMillis();

                        // Effect should come after cause
                        if (depMillis && eventMillis && eventMillis < depMillis) {
                            conflicts.push({
                                id: `causality-conflict-${event.id || event.name}-${depEvent.id || depEvent.name}-${Date.now()}`,
                                type: 'causality',
                                severity: 'critical',
                                entities: [],
                                events: [event.id || event.name, depEvent.id || depEvent.name],
                                description: `Event "${event.name}" (${event.dateTime}) depends on "${depEvent.name}" (${depEvent.dateTime}), but occurs before it`,
                                suggestion: `Adjust the dates so "${depEvent.name}" occurs before "${event.name}", or remove the dependency.`,
                                dismissed: false,
                                detected: new Date().toISOString()
                            });
                        }
                    }
                });
            }
        });

        // Check explicit causality links
        if (causalityLinks) {
            causalityLinks.forEach(link => {
                const causeEvent = events.find(e => e.id === link.causeEvent || e.name === link.causeEvent);
                const effectEvent = events.find(e => e.id === link.effectEvent || e.name === link.effectEvent);

                if (causeEvent && effectEvent && causeEvent.dateTime && effectEvent.dateTime) {
                    const causeDate = parseEventDate(causeEvent.dateTime);
                    const effectDate = parseEventDate(effectEvent.dateTime);
                    const causeMillis = causeDate.start?.toMillis();
                    const effectMillis = effectDate.start?.toMillis();

                    // Effect must come after cause
                    if (causeMillis && effectMillis && effectMillis < causeMillis) {
                        conflicts.push({
                            id: `causality-link-conflict-${link.id}-${Date.now()}`,
                            type: 'causality',
                            severity: 'critical',
                            entities: [],
                            events: [causeEvent.id || causeEvent.name, effectEvent.id || effectEvent.name],
                            description: `Causality link violation: "${effectEvent.name}" (${effectEvent.dateTime}) occurs before its cause "${causeEvent.name}" (${causeEvent.dateTime})`,
                            suggestion: `Adjust event dates so "${causeEvent.name}" occurs before "${effectEvent.name}", or remove the causality link.`,
                            dismissed: false,
                            detected: new Date().toISOString()
                        });
                    }
                }
            });
        }

        return conflicts;
    }

    /**
     * Get a human-readable description of conflict severity
     * @param severity - Conflict severity level
     * @returns Description of what the severity means
     */
    static getSeverityDescription(severity: 'critical' | 'warning' | 'info'): string {
        switch (severity) {
            case 'critical':
                return 'Critical - Major timeline inconsistency that breaks narrative logic';
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
     * @param type - Conflict type
     * @returns Icon string (emoji or icon name)
     */
    static getConflictIcon(type: string): string {
        switch (type) {
            case 'location':
                return '📍';
            case 'death':
                return '💀';
            case 'age':
                return '📅';
            case 'causality':
                return '🔗';
            default:
                return '⚠️';
        }
    }
}
