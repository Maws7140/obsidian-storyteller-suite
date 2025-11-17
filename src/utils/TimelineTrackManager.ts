import type { Event, TimelineTrack, Character, Location } from '../types';

/**
 * Utility class for managing timeline tracks
 * Handles track creation, filtering, and event assignment
 */
export class TimelineTrackManager {
    /**
     * Filter events based on track criteria
     */
    static getEventsForTrack(track: TimelineTrack, allEvents: Event[]): Event[] {
        // Global track shows all events
        if (track.type === 'global') {
            return allEvents;
        }

        // Character track - show events involving specific character
        if (track.type === 'character' && track.entityId) {
            return allEvents.filter(event =>
                event.characters?.includes(track.entityId!)
            );
        }

        // Location track - show events at specific location
        if (track.type === 'location' && track.entityId) {
            return allEvents.filter(event =>
                event.location === track.entityId
            );
        }

        // Group track - show events in specific group
        if (track.type === 'group' && track.entityId) {
            return allEvents.filter(event =>
                event.groups?.includes(track.entityId!)
            );
        }

        // Custom track with filter criteria
        if (track.type === 'custom' && track.filterCriteria) {
            return allEvents.filter(event => {
                const criteria = track.filterCriteria!;
                let matches = true;

                // Filter by characters
                if (criteria.characters && criteria.characters.length > 0) {
                    const hasCharacter = criteria.characters.some(char =>
                        event.characters?.includes(char)
                    );
                    if (!hasCharacter) matches = false;
                }

                // Filter by locations
                if (criteria.locations && criteria.locations.length > 0) {
                    if (!event.location || !criteria.locations.includes(event.location)) {
                        matches = false;
                    }
                }

                // Filter by tags
                if (criteria.tags && criteria.tags.length > 0) {
                    const hasTag = criteria.tags.some(tag =>
                        event.tags?.includes(tag)
                    );
                    if (!hasTag) matches = false;
                }

                // Filter by groups
                if (criteria.groups && criteria.groups.length > 0) {
                    const hasGroup = criteria.groups.some(group =>
                        event.groups?.includes(group)
                    );
                    if (!hasGroup) matches = false;
                }

                // Filter by status
                if (criteria.status && criteria.status.length > 0) {
                    if (!event.status || !criteria.status.includes(event.status)) {
                        matches = false;
                    }
                }

                // Filter by milestones only
                if (criteria.milestonesOnly === true) {
                    if (!event.isMilestone) {
                        matches = false;
                    }
                }

                return matches;
            });
        }

        return [];
    }

    /**
     * Auto-create character tracks from all characters
     */
    static createCharacterTracks(characters: Character[]): TimelineTrack[] {
        return characters.map((char, index) => ({
            id: `track-character-${char.id || char.name}`,
            name: `${char.name}'s Timeline`,
            type: 'character' as const,
            entityId: char.name,
            description: `Personal timeline for ${char.name}`,
            color: this.generateTrackColor(index),
            sortOrder: index + 100, // After global track
            visible: false // Hidden by default
        }));
    }

    /**
     * Auto-create location tracks from all locations
     */
    static createLocationTracks(locations: Location[]): TimelineTrack[] {
        return locations.map((loc, index) => ({
            id: `track-location-${loc.id || loc.name}`,
            name: `${loc.name} Timeline`,
            type: 'location' as const,
            entityId: loc.name,
            description: `Events at ${loc.name}`,
            color: this.generateTrackColor(index + 100),
            sortOrder: index + 1000, // After character tracks
            visible: false // Hidden by default
        }));
    }

    /**
     * Create the global track (shows all events)
     */
    static createGlobalTrack(): TimelineTrack {
        return {
            id: 'track-global',
            name: 'Global Timeline',
            type: 'global',
            description: 'All events across the entire story',
            color: '#cccccc',
            sortOrder: 0,
            visible: true
        };
    }

    /**
     * Get visible tracks sorted by sortOrder
     */
    static getVisibleTracks(tracks: TimelineTrack[]): TimelineTrack[] {
        return tracks
            .filter(track => track.visible !== false)
            .sort((a, b) => {
                const orderA = a.sortOrder ?? 999;
                const orderB = b.sortOrder ?? 999;
                return orderA - orderB;
            });
    }

    /**
     * Validate track configuration
     */
    static validateTrack(track: TimelineTrack): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!track.name || track.name.trim() === '') {
            errors.push('Track name is required');
        }

        if (!track.type) {
            errors.push('Track type is required');
        }

        if ((track.type === 'character' || track.type === 'location' || track.type === 'group')
            && !track.entityId) {
            errors.push(`Entity ID is required for ${track.type} tracks`);
        }

        if (track.type === 'custom' && !track.filterCriteria) {
            errors.push('Filter criteria is required for custom tracks');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Generate a color for a track based on index
     */
    static generateTrackColor(index: number): string {
        const hue = (index * 137.508) % 360; // Golden angle for good color distribution
        return `hsl(${hue}, 70%, 60%)`;
    }

    /**
     * Get track statistics
     */
    static getTrackStats(track: TimelineTrack, events: Event[]): {
        eventCount: number;
        dateRange?: { start: string; end: string };
        milestoneCount: number;
    } {
        const trackEvents = this.getEventsForTrack(track, events);

        const milestoneCount = trackEvents.filter(e => e.isMilestone).length;

        // Find date range
        const datedEvents = trackEvents.filter(e => e.dateTime);
        if (datedEvents.length === 0) {
            return { eventCount: trackEvents.length, milestoneCount };
        }

        const dates = datedEvents.map(e => e.dateTime!).sort();

        return {
            eventCount: trackEvents.length,
            dateRange: {
                start: dates[0],
                end: dates[dates.length - 1]
            },
            milestoneCount
        };
    }

    /**
     * Find tracks that contain a specific event
     */
    static findTracksForEvent(event: Event, tracks: TimelineTrack[]): TimelineTrack[] {
        return tracks.filter(track => {
            const trackEvents = this.getEventsForTrack(track, [event]);
            return trackEvents.length > 0;
        });
    }

    /**
     * Merge multiple tracks into a custom track
     */
    static mergeTracks(
        tracks: TimelineTrack[],
        newTrackName: string
    ): TimelineTrack {
        const mergedCriteria: TimelineTrack['filterCriteria'] = {
            characters: [],
            locations: [],
            tags: [],
            groups: [],
            status: []
        };

        for (const track of tracks) {
            if (track.type === 'character' && track.entityId) {
                mergedCriteria.characters!.push(track.entityId);
            } else if (track.type === 'location' && track.entityId) {
                mergedCriteria.locations!.push(track.entityId);
            } else if (track.type === 'group' && track.entityId) {
                mergedCriteria.groups!.push(track.entityId);
            } else if (track.type === 'custom' && track.filterCriteria) {
                if (track.filterCriteria.characters) {
                    mergedCriteria.characters!.push(...track.filterCriteria.characters);
                }
                if (track.filterCriteria.locations) {
                    mergedCriteria.locations!.push(...track.filterCriteria.locations);
                }
                if (track.filterCriteria.tags) {
                    mergedCriteria.tags!.push(...track.filterCriteria.tags);
                }
                if (track.filterCriteria.groups) {
                    mergedCriteria.groups!.push(...track.filterCriteria.groups);
                }
                if (track.filterCriteria.status) {
                    mergedCriteria.status!.push(...track.filterCriteria.status);
                }
            }
        }

        // Remove duplicates
        mergedCriteria.characters = [...new Set(mergedCriteria.characters)];
        mergedCriteria.locations = [...new Set(mergedCriteria.locations)];
        mergedCriteria.tags = [...new Set(mergedCriteria.tags)];
        mergedCriteria.groups = [...new Set(mergedCriteria.groups)];
        mergedCriteria.status = [...new Set(mergedCriteria.status)];

        return {
            id: `track-merged-${Date.now()}`,
            name: newTrackName,
            type: 'custom',
            description: `Merged track from ${tracks.length} tracks`,
            filterCriteria: mergedCriteria,
            sortOrder: 500,
            visible: true
        };
    }
}
