import type { Event, TimelineTrack, Character, Location } from '../types';
import type StorytellerSuitePlugin from '../main';

/**
 * Utility class for managing timeline tracks
 * Handles track creation, filtering, event assignment, and persistence
 */
export class TimelineTrackManager {
    private plugin: StorytellerSuitePlugin;

    constructor(plugin: StorytellerSuitePlugin) {
        this.plugin = plugin;
    }

    /**
     * Get all tracks from settings
     */
    async getTracks(): Promise<TimelineTrack[]> {
        return this.plugin.settings.timelineTracks || [];
    }

    /**
     * Save tracks to settings
     */
    async saveTracks(tracks: TimelineTrack[]): Promise<void> {
        this.plugin.settings.timelineTracks = tracks;
        await this.plugin.saveSettings();
    }

    /**
     * Add a new track
     */
    async addTrack(track: TimelineTrack): Promise<TimelineTrack> {
        const tracks = await this.getTracks();

        // Validate
        const validation = TimelineTrackManager.validateTrack(track);
        if (!validation.valid) {
            throw new Error(`Invalid track: ${validation.errors.join(', ')}`);
        }

        // Ensure unique ID
        if (!track.id) {
            track.id = `track-${Date.now()}`;
        }

        // Check for duplicate ID
        if (tracks.find(t => t.id === track.id)) {
            track.id = `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // Set sort order if not provided
        if (track.sortOrder === undefined) {
            const maxOrder = Math.max(...tracks.map(t => t.sortOrder || 0), -1);
            track.sortOrder = maxOrder + 1;
        }

        tracks.push(track);
        await this.saveTracks(tracks);
        return track;
    }

    /**
     * Update an existing track
     */
    async updateTrack(trackId: string, updates: Partial<TimelineTrack>): Promise<TimelineTrack | null> {
        const tracks = await this.getTracks();
        const trackIndex = tracks.findIndex(t => t.id === trackId);

        if (trackIndex === -1) {
            return null;
        }

        const updatedTrack = { ...tracks[trackIndex], ...updates, id: trackId };

        // Validate
        const validation = TimelineTrackManager.validateTrack(updatedTrack);
        if (!validation.valid) {
            throw new Error(`Invalid track: ${validation.errors.join(', ')}`);
        }

        tracks[trackIndex] = updatedTrack;
        await this.saveTracks(tracks);
        return updatedTrack;
    }

    /**
     * Delete a track
     */
    async deleteTrack(trackId: string): Promise<boolean> {
        const tracks = await this.getTracks();
        const filtered = tracks.filter(t => t.id !== trackId);

        if (filtered.length === tracks.length) {
            return false; // Track not found
        }

        await this.saveTracks(filtered);
        return true;
    }

    /**
     * Get a track by ID
     */
    async getTrack(trackId: string): Promise<TimelineTrack | null> {
        const tracks = await this.getTracks();
        return tracks.find(t => t.id === trackId) || null;
    }

    /**
     * Reorder tracks
     */
    async reorderTracks(trackIds: string[]): Promise<void> {
        const tracks = await this.getTracks();
        const trackMap = new Map(tracks.map(t => [t.id, t]));

        const reorderedTracks: TimelineTrack[] = [];
        trackIds.forEach((id, index) => {
            const track = trackMap.get(id);
            if (track) {
                track.sortOrder = index;
                reorderedTracks.push(track);
                trackMap.delete(id);
            }
        });

        // Add any tracks not in the reorder list at the end
        trackMap.forEach(track => {
            track.sortOrder = reorderedTracks.length;
            reorderedTracks.push(track);
        });

        await this.saveTracks(reorderedTracks);
    }

    /**
     * Toggle track visibility
     */
    async toggleTrackVisibility(trackId: string): Promise<boolean> {
        const track = await this.getTrack(trackId);
        if (!track) return false;

        track.visible = !track.visible;
        await this.updateTrack(trackId, { visible: track.visible });
        return track.visible;
    }

    /**
     * Initialize default tracks if none exist
     */
    async initializeDefaultTracks(): Promise<void> {
        const tracks = await this.getTracks();
        if (tracks.length > 0) return;

        const defaultTracks: TimelineTrack[] = [
            TimelineTrackManager.createGlobalTrack()
        ];

        await this.saveTracks(defaultTracks);
    }

    /**
     * Auto-generate tracks from current entities
     */
    async generateEntityTracks(options: {
        characters?: boolean;
        locations?: boolean;
        groups?: boolean;
        hideByDefault?: boolean;
    } = {}): Promise<number> {
        const {
            characters: includeCharacters = false,
            locations: includeLocations = false,
            groups: includeGroups = false,
            hideByDefault = true
        } = options;

        const tracks = await this.getTracks();
        let addedCount = 0;

        if (includeCharacters) {
            const characters = await this.plugin.listCharacters();
            const characterTracks = TimelineTrackManager.createCharacterTracks(characters);
            for (const track of characterTracks) {
                // Check if track already exists
                if (!tracks.find(t => t.id === track.id)) {
                    track.visible = !hideByDefault;
                    await this.addTrack(track);
                    addedCount++;
                }
            }
        }

        if (includeLocations) {
            const locations = await this.plugin.listLocations();
            const locationTracks = TimelineTrackManager.createLocationTracks(locations);
            for (const track of locationTracks) {
                if (!tracks.find(t => t.id === track.id)) {
                    track.visible = !hideByDefault;
                    await this.addTrack(track);
                    addedCount++;
                }
            }
        }

        if (includeGroups) {
            const groups = this.plugin.settings.groups || [];
            const groupTracks = groups.map((group, index) => ({
                id: `track-group-${group.id}`,
                name: `${group.name} Timeline`,
                type: 'group' as const,
                entityId: group.id,
                description: `Events for ${group.name}`,
                color: group.color || TimelineTrackManager.generateTrackColor(index),
                sortOrder: index + 2000,
                visible: !hideByDefault
            }));

            for (const track of groupTracks) {
                if (!tracks.find(t => t.id === track.id)) {
                    await this.addTrack(track);
                    addedCount++;
                }
            }
        }

        return addedCount;
    }
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
