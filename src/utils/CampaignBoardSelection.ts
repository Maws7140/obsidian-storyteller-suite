import { stripWikiLinkToString } from './WikiLinks';

/** Case-insensitive, wiki-link-free form of a name, used for matching references. */
export function normalizeBoardName(value: string | null | undefined): string {
    return stripWikiLinkToString(value).trim().toLowerCase();
}

/**
 * Stable key for a location pin. Shared by the campaign board and the Leaflet
 * renderer so highlight and selection state agree on which pin is meant.
 */
export function locationPinKey(location: { id?: string; name: string }): string {
    return location.id || normalizeBoardName(location.name);
}

/**
 * Pick which pin the inspector shows: keep the previous selection while it still
 * exists, otherwise the scene's current location, otherwise the first pin.
 */
export function resolveBoardSelection(
    keys: string[],
    previousKey: string | null,
    currentKey: string | null,
): string | null {
    if (keys.length === 0) return null;
    if (previousKey && keys.includes(previousKey)) return previousKey;
    if (currentKey && keys.includes(currentKey)) return currentKey;
    return keys[0];
}
