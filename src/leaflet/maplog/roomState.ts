/**
 * Room state from a Lonelog log, for display beside a Maplog place ID.
 *
 * Space lives on the map and state lives in the log (maplog.md Section 1.2). The
 * Dungeon Crawling Add-on records state as Room tags, `[R:3|cleared, looted]`, and
 * a map place `R3` shows that state read-only. Shorthand `[R:3|+looted]` adds to
 * the status recorded before it.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */

export interface MaplogRoomState {
    /** Room number as written in the tag, without the R prefix. */
    key: string;
    status: string;
    description?: string;
}

const ROOM_TAG = /\[R:([^\]|]+)((?:\|[^\]]*)?)\]/g;

/** The lookup key for a room tag ID: `R:3`, `R:R3` and `R:03` all give `3`. */
export function roomTagKey(tagId: string): string {
    const trimmed = tagId.trim();
    const match = /^R?\s*0*(\d+)$/i.exec(trimmed);
    return match ? match[1] : trimmed;
}

/** The lookup key for a map place ID. Only `R` room IDs have a key, so hex IDs such as 0203 have none. */
export function roomPlaceKey(placeId: string | undefined): string | undefined {
    if (!placeId) return undefined;
    const match = /^R\s*0*(\d+)$/i.exec(placeId.trim());
    return match ? match[1] : undefined;
}

/**
 * The latest state of every room tagged in the log. A later tag replaces an
 * earlier one; a `+` status adds to the status before it.
 */
export function parseRoomStates(log: string): Map<string, MaplogRoomState> {
    const states = new Map<string, MaplogRoomState>();
    ROOM_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ROOM_TAG.exec(log)) !== null) {
        const key = roomTagKey(match[1]);
        if (!key) continue;
        const fields = match[2] ? match[2].slice(1).split('|').map(field => field.trim()) : [];
        // Exits are recorded for the map, not for the state of the room.
        const stateFields = fields.filter(field => field !== '' && !/^exits\b/i.test(field));
        let status = stateFields[0] ?? '';
        const description = stateFields[1];
        const previous = states.get(key);
        if (status.startsWith('+')) {
            const added = status.slice(1).trim();
            status = previous?.status ? [previous.status, added].filter(Boolean).join(', ') : added;
        }
        states.set(key, description ? { key, status, description } : { key, status });
    }
    return states;
}

/** The state of the room a place ID names, or undefined when the log has no tag for it. */
export function roomStateForPlace(states: ReadonlyMap<string, MaplogRoomState>, placeId: string | undefined): MaplogRoomState | undefined {
    const key = roomPlaceKey(placeId);
    return key === undefined ? undefined : states.get(key);
}

/** Tooltip text for a place: `R3: cleared, looted (library)`. */
export function describeRoomState(state: MaplogRoomState, placeId: string): string {
    const detail = state.description ? ` (${state.description})` : '';
    return `${placeId}: ${state.status || 'no status'}${detail}`;
}
