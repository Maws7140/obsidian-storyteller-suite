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
 * Uses the parent's name, matching what the modal's parent picker stores.
 */
export function buildChildLocationDefaults(parent: Pick<Location, 'name'>): Partial<Location> {
    return {
        parentLocationId: parent.name,
    };
}

/**
 * Find the maps a location zooms into: first the map that represents the
 * location itself (its interior), then the maps of its direct child locations.
 *
 * A map is matched either by `StoryMap.correspondingLocationId` pointing at the
 * location, or by the location's `correspondingMapId` pointing at the map.
 * Results are unique; child maps follow the order of `location.childLocationIds`.
 */
export function findChildLocationMaps(
    location: Pick<Location, 'id' | 'name' | 'childLocationIds' | 'correspondingMapId'>,
    locations: Location[],
    maps: StoryMap[],
): StoryMap[] {
    const found: StoryMap[] = [];
    const seen = new Set<string>();

    const collect = (ref: string, target: Pick<Location, 'id' | 'name' | 'correspondingMapId'> | undefined) => {
        const keys = new Set([ref, target?.id, target?.name].filter((k): k is string => !!k));
        for (const map of maps) {
            const mapKey = map.id || map.name;
            if (seen.has(mapKey)) continue;

            const linkedByLocation = !!map.correspondingLocationId && keys.has(map.correspondingLocationId);
            const linkedByLocationMapId = !!target?.correspondingMapId
                && (map.id === target.correspondingMapId || map.name === target.correspondingMapId);

            if (linkedByLocation || linkedByLocationMapId) {
                seen.add(mapKey);
                found.push(map);
            }
        }
    };

    collect(locationRef(location), location);
    for (const childId of location.childLocationIds ?? []) {
        collect(childId, locations.find(l => l.id === childId || l.name === childId));
    }

    return found;
}

/** User-facing message when neither the location nor its children have a map. */
export function noChildMapMessage(locationName: string): string {
    return `No map is linked to ${locationName} or its child locations. Create a map and set its location to ${locationName}.`;
}
