/**
 * Pure decision logic for "Import existing notes as entities".
 *
 * The plugin only recognises entity notes that sit directly inside the entity
 * folder for their type (see listCharacters() and friends in main.ts). The
 * `entityType` stamp is only a compatibility check, and a note without a `name`
 * is hidden from lists. This module therefore:
 * - collects the frontmatter keys used by a set of notes,
 * - suggests which built-in field each key should map to,
 * - computes the frontmatter for one note (renames, type stamp, name fallback),
 * - plans destination paths, leaving non-empty destinations alone or suffixing them.
 *
 * Nothing here touches the vault. The modal applies the results.
 */

import { getWhitelistKeys, normalizeEntityType, WIKI_LINK_ARRAY_FIELDS } from '../yaml/EntitySections';
import type { EntityType } from '../yaml/EntitySections';
import { BODY_SECTION_FIELD_MAP } from './EntityTemplates';

/** Entity types the wizard can import into. Each has a folder scan in main.ts. */
export type AdoptableEntityType =
    | 'character'
    | 'location'
    | 'event'
    | 'item'
    | 'reference'
    | 'culture'
    | 'economy'
    | 'magicSystem'
    | 'compendiumEntry';

export const ADOPTABLE_ENTITY_TYPES: readonly AdoptableEntityType[] = [
    'character',
    'location',
    'event',
    'item',
    'reference',
    'culture',
    'economy',
    'magicSystem',
    'compendiumEntry',
];

export const ADOPTABLE_TYPE_LABELS: Record<AdoptableEntityType, string> = {
    character: 'Character',
    location: 'Location',
    event: 'Event',
    item: 'Plot item',
    reference: 'Reference',
    culture: 'Culture',
    economy: 'Economy',
    magicSystem: 'Magic system',
    compendiumEntry: 'Compendium entry',
};

/** What to do with one frontmatter key of the imported notes. */
export type MappingAction =
    | { kind: 'keep' }
    | { kind: 'ignore' }
    | { kind: 'map'; target: string };

export const KEEP_ACTION: MappingAction = { kind: 'keep' };

export interface FrontmatterKeyStat {
    key: string;
    /** Number of notes that use this key with a non-empty value. */
    count: number;
    /** Short human-readable example value taken from the first note that uses the key. */
    example: string;
}

export interface MappableField {
    field: string;
    label: string;
    isArray: boolean;
}

export interface PlacementInput {
    path: string;
    basename: string;
    /** Parent folder of the note, '' for the vault root. */
    folderPath: string;
}

export type ConflictPolicy = 'skip' | 'suffix';

export interface PlacementDecision {
    path: string;
    destPath: string;
    action: 'stay' | 'move' | 'skip';
    reason?: string;
}

export interface NoteRename {
    from: string;
    to: string;
}

export interface NotePatchResult {
    /** Full frontmatter to write back (replaces the existing block). */
    next: Record<string, unknown>;
    renames: NoteRename[];
    conflicts: Array<{ key: string; target: string; reason: string }>;
    /** True when the note had no usable name and the file basename was used. */
    nameFromFilename: boolean;
    /** Previous entityType stamp when it named a different type. */
    retypedFrom: string | null;
}

/** Array-valued built-in fields that are not wiki-link arrays but still take lists. */
const ARRAY_FIELD_HINTS = new Set([
    'tags', 'aliases', 'traits', 'quirks', 'ownedItems', 'createdItems', 'cultures', 'magicSystems',
    'locations', 'events', 'items', 'languages', 'currencies', 'resources', 'materials', 'categories',
    'abilities', 'members', 'tradeRoutes', 'connections', 'relationships', 'groups',
]);

/** Fields that are plumbing (ids, map placement, runtime) and never offered as targets. */
const NON_MAPPABLE_FIELDS = new Set([
    'id', 'entityType', 'customFields', 'filePath',
    'mapCoordinates', 'mapId', 'markerId', 'relatedMapIds', 'mapIcon', 'mapColor',
]);

/**
 * Obvious source keys for built-in fields. A rule only applies when the target
 * is a real field of the type being imported (and `types`, when given, allows it).
 * Matching is case-insensitive and ignores spaces, underscores and dashes.
 */
const SYNONYM_RULES: Array<{ field: string; sources: string[]; types?: AdoptableEntityType[] }> = [
    { field: 'name', sources: ['title', 'label', 'fullname', 'displayname'] },
    { field: 'profileImagePath', sources: ['image', 'img', 'portrait', 'picture', 'photo', 'avatar', 'thumbnail', 'coverimage'] },
    { field: 'groups', sources: ['faction', 'factions', 'group', 'organization', 'organisation', 'organizations', 'organisations'] },
    { field: 'currentLocationId', sources: ['location', 'currentlocation', 'place', 'home'], types: ['character'] },
    { field: 'currentLocation', sources: ['location', 'currentlocation', 'place'], types: ['item'] },
    { field: 'dateTime', sources: ['date', 'when', 'datetime', 'time'], types: ['event'] },
    { field: 'occupation', sources: ['job', 'profession', 'role'], types: ['character'] },
    { field: 'race', sources: ['species', 'ancestry'], types: ['character'] },
    { field: 'birthDate', sources: ['born', 'dob', 'birthdate', 'dateofbirth'], types: ['character'] },
    { field: 'status', sources: ['state'] },
    { field: 'locationType', sources: ['type', 'kind'], types: ['location'] },
    { field: 'itemType', sources: ['type', 'kind'], types: ['item'] },
    { field: 'entryType', sources: ['type', 'kind'], types: ['compendiumEntry'] },
    { field: 'category', sources: ['type', 'kind'], types: ['reference'] },
    { field: 'systemType', sources: ['type', 'kind'], types: ['magicSystem'] },
    { field: 'owners', sources: ['owner', 'ownedby'], types: ['item'] },
    { field: 'creator', sources: ['createdby', 'author'], types: ['item'] },
    { field: 'tags', sources: ['tag', 'keywords'] },
    // Only a target when the type stores description as a property (see getMappableFields).
    { field: 'description', sources: ['desc', 'summary'] },
];

function normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when a value carries content (empty strings, null and empty arrays do not). */
export function hasValue(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

export function isArrayField(field: string): boolean {
    return WIKI_LINK_ARRAY_FIELDS.has(field) || ARRAY_FIELD_HINTS.has(field);
}

/** "currentLocationId" -> "Current location (ID)". */
export function humanizeFieldName(field: string): string {
    let base = field;
    let suffix = '';
    if (/Ids$/.test(field)) {
        base = field.slice(0, -3);
        suffix = ' (IDs)';
    } else if (/Id$/.test(field)) {
        base = field.slice(0, -2);
        suffix = ' (ID)';
    }
    const words = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1) + suffix;
}

function formatExample(value: unknown): string {
    let text: string;
    if (typeof value === 'string') text = value;
    else if (Array.isArray(value)) text = value.map(entry => (typeof entry === 'string' ? entry : JSON.stringify(entry))).join(', ');
    else if (value === null || value === undefined) text = '';
    else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
    else text = JSON.stringify(value) ?? '';
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/**
 * Collect every frontmatter key used by the notes, with how many notes set a
 * non-empty value and an example. Sorted by count (desc), then key.
 * Obsidian's internal `position` key is ignored.
 */
export function collectFrontmatterKeys(notes: Array<{ frontmatter: Record<string, unknown> }>): FrontmatterKeyStat[] {
    const stats = new Map<string, FrontmatterKeyStat>();
    for (const note of notes) {
        for (const [key, value] of Object.entries(note.frontmatter ?? {})) {
            if (key === 'position') continue;
            if (!hasValue(value)) {
                if (!stats.has(key)) stats.set(key, { key, count: 0, example: '' });
                continue;
            }
            const existing = stats.get(key);
            if (existing) {
                existing.count += 1;
                if (!existing.example) existing.example = formatExample(value);
            } else {
                stats.set(key, { key, count: 1, example: formatExample(value) });
            }
        }
    }
    return [...stats.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Built-in fields of a type that a source key may be mapped to. Body sections are
 * excluded, except the ones the user stores as frontmatter (`frontmatterSectionFields`),
 * which are plain properties and so are ordinary rename targets.
 */
export function getMappableFields(
    type: AdoptableEntityType | EntityType,
    frontmatterSectionFields: readonly string[] = []
): MappableField[] {
    const stored = new Set(frontmatterSectionFields);
    const bodyFields = new Set(
        Object.values(BODY_SECTION_FIELD_MAP[type] ?? {}).filter(field => !stored.has(field))
    );
    const fields = new Set<string>([...getWhitelistKeys(type), ...frontmatterSectionFields]);
    return [...fields]
        .filter(field => !NON_MAPPABLE_FIELDS.has(field) && !bodyFields.has(field))
        .map(field => ({ field, label: humanizeFieldName(field), isArray: isArrayField(field) }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** Encode an action for a <select> value: "keep", "ignore" or "map:<field>". */
export function encodeMappingAction(action: MappingAction): string {
    if (action.kind === 'map') return `map:${action.target}`;
    return action.kind;
}

export function decodeMappingAction(value: string): MappingAction {
    if (value === 'ignore') return { kind: 'ignore' };
    if (value.startsWith('map:') && value.length > 4) return { kind: 'map', target: value.slice(4) };
    return { kind: 'keep' };
}

/**
 * Suggest a mapping for each key. Identity and case-only matches are claimed
 * first so a synonym cannot steal a field the note already names directly.
 * Anything without an obvious match stays "keep".
 */
export function suggestMappings(
    keys: string[],
    type: AdoptableEntityType | EntityType,
    frontmatterSectionFields: readonly string[] = []
): Record<string, MappingAction> {
    const mappable = getMappableFields(type, frontmatterSectionFields);
    const byNormalized = new Map<string, string>();
    for (const { field } of mappable) byNormalized.set(normalizeKey(field), field);

    const suggestions: Record<string, MappingAction> = {};
    const claimed = new Set<string>();
    const pending: string[] = [];

    // Pass 1: keys that already are a built-in field (exactly or ignoring case).
    for (const key of keys) {
        if (key.startsWith('_') || key === 'position') {
            suggestions[key] = KEEP_ACTION;
            continue;
        }
        const exact = byNormalized.get(normalizeKey(key));
        if (exact === key) {
            suggestions[key] = KEEP_ACTION;
            claimed.add(exact);
        } else if (exact && !claimed.has(exact)) {
            suggestions[key] = { kind: 'map', target: exact };
            claimed.add(exact);
        } else {
            pending.push(key);
        }
    }

    // Pass 2: synonyms for everything else.
    for (const key of pending) {
        const normalized = normalizeKey(key);
        suggestions[key] = KEEP_ACTION;
        for (const rule of SYNONYM_RULES) {
            if (rule.types && !rule.types.includes(type as AdoptableEntityType)) continue;
            if (!byNormalized.has(normalizeKey(rule.field))) continue;
            if (claimed.has(rule.field)) continue;
            if (!rule.sources.includes(normalized)) continue;
            suggestions[key] = { kind: 'map', target: rule.field };
            claimed.add(rule.field);
            break;
        }
    }
    return suggestions;
}

/**
 * Compute the frontmatter a note should have after import.
 * - Mapped keys are renamed. The value moves; it is never dropped.
 * - A target that already holds a value keeps it, and the source key stays as is (reported as a conflict).
 * - `ignore` and `keep` leave the key untouched.
 * - entityType is stamped with the target type so the plugin recognises the note.
 * - A missing name falls back to the file basename.
 * The body of the note is not part of this computation and is never touched.
 */
export function computeNotePatch(
    frontmatter: Record<string, unknown>,
    basename: string,
    type: AdoptableEntityType | EntityType,
    mappings: Record<string, MappingAction>
): NotePatchResult {
    const source: Record<string, unknown> = { ...(frontmatter ?? {}) };
    delete source['position'];

    const renames: NoteRename[] = [];
    const conflicts: NotePatchResult['conflicts'] = [];
    const renamedFrom = new Map<string, string>();
    const filledBy = new Map<string, string>();

    for (const key of Object.keys(source)) {
        const action = mappings[key] ?? KEEP_ACTION;
        if (action.kind !== 'map' || action.target === key) continue;
        const target = action.target;
        if (hasValue(source[target])) {
            conflicts.push({ key, target, reason: `"${target}" already has a value, so "${key}" was left in place` });
            continue;
        }
        const owner = filledBy.get(target);
        if (owner !== undefined) {
            conflicts.push({ key, target, reason: `"${target}" is already filled from "${owner}", so "${key}" was left in place` });
            continue;
        }
        filledBy.set(target, key);
        renamedFrom.set(key, target);
        renames.push({ from: key, to: target });
    }

    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        if (renamedFrom.has(key)) {
            const target = renamedFrom.get(key) as string;
            body[target] = coerceForTarget(value, target);
            continue;
        }
        // A target filled by a rename was written at the rename's position.
        if (filledBy.has(key)) continue;
        body[key] = value;
    }

    const previousType = body['entityType'];
    const retypedFrom = typeof previousType === 'string' && previousType.trim() !== '' && normalizeEntityType(previousType) !== type
        ? previousType
        : null;
    delete body['entityType'];

    const next: Record<string, unknown> = { entityType: type };
    let nameFromFilename = false;
    let name = body['name'];
    if (typeof name === 'number' || typeof name === 'boolean') name = String(name);
    if (!hasValue(name)) {
        name = basename;
        nameFromFilename = true;
    }
    next['name'] = name;
    delete body['name'];
    for (const [key, value] of Object.entries(body)) next[key] = value;

    return { next, renames, conflicts, nameFromFilename, retypedFrom };
}

function coerceForTarget(value: unknown, target: string): unknown {
    if (!isArrayField(target)) return value;
    if (Array.isArray(value)) return value;
    if (!hasValue(value)) return [];
    if (typeof value === 'string') return [value.trim()];
    return [value];
}

/**
 * Decide where each note goes. Notes are moved directly into the target folder,
 * which is the only place the plugin reads from. A destination that is already
 * taken (by any vault file, or by another note moved in this run) is either
 * skipped or given a " (2)", " (3)"... suffix, depending on the policy.
 * Notes already in place stay put.
 */
export function planPlacement(
    notes: PlacementInput[],
    targetFolder: string,
    existingPaths: Iterable<string>,
    policy: ConflictPolicy
): PlacementDecision[] {
    const folder = targetFolder.replace(/\/+$/, '');
    const taken = new Set(existingPaths);
    const ordered = [...notes].sort((a, b) => a.path.localeCompare(b.path));
    const decisions: PlacementDecision[] = [];

    for (const note of ordered) {
        const preferred = `${folder}/${note.basename}.md`;
        if (note.path === preferred) {
            decisions.push({ path: note.path, destPath: note.path, action: 'stay' });
            continue;
        }
        if (!taken.has(preferred)) {
            taken.add(preferred);
            decisions.push({ path: note.path, destPath: preferred, action: 'move' });
            continue;
        }
        if (policy === 'skip') {
            decisions.push({
                path: note.path,
                destPath: note.path,
                action: 'skip',
                reason: `"${preferred}" already exists`,
            });
            continue;
        }
        let index = 2;
        let suffixed = `${folder}/${note.basename} (${index}).md`;
        while (taken.has(suffixed)) {
            index += 1;
            suffixed = `${folder}/${note.basename} (${index}).md`;
        }
        taken.add(suffixed);
        decisions.push({ path: note.path, destPath: suffixed, action: 'move', reason: `renamed to avoid "${preferred}"` });
    }
    return decisions;
}

/**
 * Find imported names that clash (case-insensitively) with existing entities or
 * with each other. Clashes are warnings: the plugin keys some lookups by name.
 */
export function findNameDuplicates(
    incoming: Array<{ path: string; name: string }>,
    existing: Array<{ path: string; name: string }>
): Array<{ path: string; name: string; duplicateOf: string }> {
    const seen = new Map<string, string>();
    for (const entry of existing) {
        const key = entry.name.trim().toLowerCase();
        if (key && !seen.has(key)) seen.set(key, entry.path);
    }
    const clashes: Array<{ path: string; name: string; duplicateOf: string }> = [];
    for (const entry of incoming) {
        const key = entry.name.trim().toLowerCase();
        if (!key) continue;
        const owner = seen.get(key);
        if (owner !== undefined) {
            clashes.push({ path: entry.path, name: entry.name, duplicateOf: owner });
        } else {
            seen.set(key, entry.path);
        }
    }
    return clashes;
}

/** Group renames across notes: "from -> to" with how many notes used them. */
export function summarizeRenames(renameLists: NoteRename[][]): Array<{ from: string; to: string; count: number }> {
    const counts = new Map<string, { from: string; to: string; count: number }>();
    for (const renames of renameLists) {
        for (const rename of renames) {
            const key = `${rename.from}\u0000${rename.to}`;
            const entry = counts.get(key);
            if (entry) entry.count += 1;
            else counts.set(key, { from: rename.from, to: rename.to, count: 1 });
        }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
}
