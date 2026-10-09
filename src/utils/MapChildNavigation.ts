import type { Location, StoryMap } from '../types';

/**
 * Pure helpers for the location marker "Create child location" and
 * "Zoom to child map" actions. Kept free of Obsidian/Leaflet imports so they
 * can be unit tested directly.
 */

/** Stable reference used by the hierarchy (ID when present, name otherwise). */
export function locationRef(location: Pick<Location, 'id' | 'name'>): string {
    return location.id || location.name;
}

/**
 * Field defaults applied to a new location created as a child of `parent`.
 * The caller merges these into the location modal draft before it opens.
 */
export function buildChildLocationDefaults(parent: Pick<Location, 'id' | 'name'>): Partial<Location> {
    return {
        parentLocationId: locationRef(parent),
    };
}

/**
 * Find the maps that represent the direct child locations of `location`.
 *
 * A child map is matched either by `StoryMap.correspondingLocationId` pointing at
 * the child location, or by the child location's `correspondingMapId` pointing at
 * the map. Results are unique and follow the order of `location.childLocationIds`.
 */
export function findChildLocationMaps(
    location: Pick<Location, 'childLocationIds'>,
    locations: Location[],
    maps: StoryMap[],
): StoryMap[] {
    const found: StoryMap[] = [];
    const seen = new Set<string>();

    for (const childId of location.childLocationIds ?? []) {
        const childLocation = locations.find(l => l.id === childId || l.name === childId);
        const keys = new Set([childId, childLocation?.id, childLocation?.name].filter((k): k is string => !!k));

        for (const map of maps) {
            const mapKey = map.id || map.name;
            if (seen.has(mapKey)) continue;

            const linkedByLocation = !!map.correspondingLocationId && keys.has(map.correspondingLocationId);
            const linkedByLocationMapId = !!childLocation?.correspondingMapId
                && (map.id === childLocation.correspondingMapId || map.name === childLocation.correspondingMapId);

            if (linkedByLocation || linkedByLocationMapId) {
                seen.add(mapKey);
                found.push(map);
            }
        }
    }

    return found;
}

/** User-facing message when no child map is linked to any child location. */
export function noChildMapMessage(locationName: string): string {
    return `No map is linked to the child locations of ${locationName}. Create a map and set its location to one of them.`;
}
