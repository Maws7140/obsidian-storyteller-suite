import type StorytellerSuitePlugin from '../main';
import type { Character, Location, Event, PlotItem } from '../types';

/**
 * Coerce a frontmatter value that should be a list of names into string[].
 * Hand-edited notes routinely carry a scalar where an array is expected
 * (locations: Beacon Market) or an array where a scalar is expected
 * (currentOwner as a list) — readers must tolerate both shapes.
 */
export function toStringArray(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) {
        return value
            .filter(entry => entry !== undefined && entry !== null && entry !== '')
            .map(entry => String(entry));
    }
    return [String(value)];
}

/** First entry of a possibly-scalar, possibly-array value; undefined when empty. */
export function firstString(value: unknown): string | undefined {
    const entries = toStringArray(value);
    return entries.length > 0 ? entries[0] : undefined;
}

/**
 * Extract the target reference from a connection/relationship entry.
 * Notes exist with `target: <name>`, `targetId: <id>`, and legacy `name: <name>`
 * — the reader must accept all three shapes.
 */
export function getRelationshipTargetRef(rel: unknown): string {
    if (typeof rel === 'string') return rel;
    if (!rel || typeof rel !== 'object') return '';
    const record = rel as Record<string, unknown>;
    const ref = record['target'] ?? record['targetId'] ?? record['name'];
    return ref === undefined || ref === null ? '' : String(ref);
}

/**
 * Build an id → display-name map across all entity types so UI code can
 * render a name wherever a note stored an id. Groups come from settings
 * unfiltered by story so stale-story group ids still resolve to their names.
 */
export async function buildEntityNameIndex(plugin: StorytellerSuitePlugin): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    const add = (id: string | undefined, name: string | undefined) => {
        if (id && name) index.set(id, name);
    };

    const [characters, locations, events, items] = await Promise.all([
        plugin.listCharacters().catch((): Character[] => []),
        plugin.listLocations().catch((): Location[] => []),
        plugin.listEvents().catch((): Event[] => []),
        plugin.listPlotItems().catch((): PlotItem[] => []),
    ]);

    characters.forEach(entity => add(entity.id, entity.name));
    locations.forEach(entity => add(entity.id, entity.name));
    events.forEach(entity => add(entity.id, entity.name));
    items.forEach(entity => add(entity.id, entity.name));
    (plugin.settings.groups ?? []).forEach(group => add(group.id, group.name));

    return index;
}

/** Resolve a reference (id or name) to a display name; falls back to the reference itself. */
export function resolveEntityRefName(ref: string | undefined, index?: Map<string, string> | null): string {
    if (!ref) return '';
    return index?.get(ref) ?? ref;
}
