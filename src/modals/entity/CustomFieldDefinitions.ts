/**
 * User-defined typed fields for entity modals (GitHub issue #138).
 *
 * A vault can declare its own properties per entity type, for example an
 * `aliases` list on characters or a `parents` link to other characters. The
 * modal then asks for them with a proper input instead of a free-form row.
 *
 * Storage contract. Every defined field is stored as a TOP-LEVEL key on the
 * entity object, never inside `customFields`:
 *   - text, textarea, number, link  -> `key: value` (string, number, or "[[Note]]")
 *   - list                          -> `key: [a, b]` (YAML string array)
 *   - links                         -> `key: ["[[A]]", "[[B]]"]`
 * Writing: buildFrontmatter already writes every key of the source object (the
 * entity modals pass Object.keys(src) as preserveKeys), so top-level keys reach
 * the note. Reading: the customFields sweep in main.ts skips defined keys, so
 * they stay top-level instead of being folded into customFields. Keeping them
 * out of customFields also keeps number values as numbers, since customFields
 * is a string-only map. Legacy values swept into customFields before a
 * definition existed are adopted by the editor and removed on the next save.
 */

import { EntityType, getWhitelistKeys, WIKI_LINK_ARRAY_FIELDS, WIKI_LINK_SCALAR_FIELDS } from '../../yaml/EntitySections';

export const CUSTOM_FIELD_TYPES = ['text', 'textarea', 'number', 'list', 'link', 'links'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldDefinition {
    /** Frontmatter property name. */
    key: string;
    /** Shown in the modal. Falls back to the key. */
    label?: string;
    type: CustomFieldType;
    /** Entity type that link and links fields point at, e.g. 'character'. */
    target?: string;
}

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
    text: 'Text',
    textarea: 'Long text (keeps line breaks)',
    number: 'Number',
    list: 'List of text',
    link: 'Link to one entity',
    links: 'Links to many entities',
};

/** Entity types a link field can point at. */
export const CUSTOM_FIELD_LINK_TARGETS: ReadonlyArray<{ value: EntityType; label: string }> = [
    { value: 'character', label: 'Character' },
    { value: 'location', label: 'Location' },
    { value: 'event', label: 'Event' },
    { value: 'item', label: 'Item' },
    { value: 'culture', label: 'Culture' },
    { value: 'economy', label: 'Economy' },
    { value: 'magicSystem', label: 'Magic system' },
    { value: 'compendiumEntry', label: 'Compendium entry' },
    { value: 'book', label: 'Book' },
    { value: 'chapter', label: 'Chapter' },
    { value: 'scene', label: 'Scene' },
    { value: 'map', label: 'Map' },
    { value: 'reference', label: 'Reference' },
];

const MAX_KEY_LENGTH = 64;

/** Built-in section-derived fields that must never be claimed by a definition. */
export const DERIVED_SECTION_FIELDS: Partial<Record<EntityType, string[]>> = {
    character: ['description', 'backstory'],
    location: ['description', 'history'],
    event: ['description', 'outcome'],
    item: ['description', 'history'],
    reference: ['content'],
    chapter: ['summary'],
    scene: ['content'],
    map: ['description'],
    culture: ['description', 'values', 'religion', 'socialStructure', 'history', 'namingConventions', 'customs'],
    economy: ['description', 'industries', 'taxation'],
    magicSystem: ['description', 'rules', 'source', 'costs', 'limitations', 'training', 'history'],
};

/** Text for a value of unknown shape. Objects and arrays read as empty, never "[object Object]". */
function toText(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    return '';
}

export function isCustomFieldType(value: unknown): value is CustomFieldType {
    return typeof value === 'string' && (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

export function isLinkFieldType(type: CustomFieldType): boolean {
    return type === 'link' || type === 'links';
}

export function isLinkTargetType(value: unknown): value is EntityType {
    return typeof value === 'string' && CUSTOM_FIELD_LINK_TARGETS.some(t => t.value === value);
}

/**
 * Why a property name cannot be used for an entity type, or null when it can.
 * `taken` lists the other names already defined for that type.
 */
export function validateCustomFieldKey(
    rawKey: string,
    entityType: EntityType,
    taken: readonly string[] = [],
    /** Body-section fields stored as frontmatter for this vault (see SectionFieldPlacement.ts). */
    sectionFrontmatterFields: readonly string[] = []
): string | null {
    const key = rawKey.trim();
    if (!key) return 'Enter a property name.';
    if (/[\r\n:]/.test(key)) return 'Property names cannot contain line breaks or colons.';
    if (key.length > MAX_KEY_LENGTH) return `Keep property names under ${MAX_KEY_LENGTH} characters.`;
    if (key.startsWith('_')) return 'Property names cannot start with an underscore.';

    const lower = key.toLowerCase();
    const builtIn = new Set<string>([
        ...Array.from(getWhitelistKeys(entityType)),
        ...(DERIVED_SECTION_FIELDS[entityType] ?? []),
        ...sectionFrontmatterFields,
        ...WIKI_LINK_ARRAY_FIELDS,
        ...WIKI_LINK_SCALAR_FIELDS,
        'customFields', 'filePath', 'sections', 'connections', 'entityRefs', 'locationHistory',
    ]);
    for (const name of builtIn) {
        if (name.toLowerCase() === lower) return `"${key}" is a built-in property for this entity type.`;
    }
    if (taken.some(name => name.trim().toLowerCase() === lower)) {
        return `"${key}" is already defined for this entity type.`;
    }
    return null;
}

/**
 * Sanitise a stored definition list for one entity type. Anything malformed or
 * invalid is dropped, so a hand-edited settings file cannot break a modal.
 * Blank rows the settings page keeps while a field is being named are dropped
 * here too.
 */
export function sanitizeCustomFieldDefinitions(entityType: EntityType, raw: unknown): CustomFieldDefinition[] {
    if (!Array.isArray(raw)) return [];
    const out: CustomFieldDefinition[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const record = entry as Record<string, unknown>;
        const key = typeof record.key === 'string' ? record.key.trim() : '';
        if (validateCustomFieldKey(key, entityType, out.map(d => d.key)) !== null) continue;
        const type: CustomFieldType = isCustomFieldType(record.type) ? record.type : 'text';
        const definition: CustomFieldDefinition = { key, type };
        const label = typeof record.label === 'string' ? record.label.trim() : '';
        if (label) definition.label = label;
        if (isLinkFieldType(type)) {
            // A link field without a usable target has nothing to pick from.
            if (!isLinkTargetType(record.target)) continue;
            definition.target = record.target;
        }
        out.push(definition);
    }
    return out;
}

export interface DefaultFieldNameCheck {
    /** Names a new entity may start with, in the order given, without duplicates. */
    accepted: string[];
    /** Names the editor would refuse, with the reason to show the user. */
    rejected: Array<{ name: string; problem: string }>;
}

/**
 * Check the default custom field names for an entity type. A default that the
 * editor would refuse must not seed a new entity, because the seeded row would
 * block every Save until the user deleted it. The settings page uses the same
 * check to tell the user which names were dropped.
 */
export function checkDefaultCustomFieldNames(
    entityType: EntityType,
    names: readonly string[],
    definitions: readonly CustomFieldDefinition[] = [],
    sectionFrontmatterFields: readonly string[] = []
): DefaultFieldNameCheck {
    const accepted: string[] = [];
    const rejected: Array<{ name: string; problem: string }> = [];
    const seen = new Set<string>();
    const taken = definitions.map(definition => definition.key);
    for (const raw of names) {
        const name = raw.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const problem = validateCustomFieldKey(name, entityType, taken, sectionFrontmatterFields);
        if (problem) rejected.push({ name, problem });
        else accepted.push(name);
    }
    return { accepted, rejected };
}

/** Normalise a stored settings map (entity type -> definitions). */
export function sanitizeCustomFieldDefinitionMap(raw: unknown): Record<string, CustomFieldDefinition[]> {
    const out: Record<string, CustomFieldDefinition[]> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [entityType, defs] of Object.entries(raw as Record<string, unknown>)) {
        if (!isEntityTypeKey(entityType)) continue;
        const sanitized = sanitizeCustomFieldDefinitions(entityType, defs);
        if (sanitized.length > 0) out[entityType] = sanitized;
    }
    return out;
}

const ENTITY_TYPE_KEYS: ReadonlySet<string> = new Set<string>([
    'character', 'location', 'event', 'item', 'reference', 'chapter', 'scene', 'map', 'culture',
    'faction', 'economy', 'magicSystem', 'compendiumEntry', 'book', 'campaignSession',
    'timelineEra', 'timelineTrack', 'timelineBranch',
]);

function isEntityTypeKey(value: string): value is EntityType {
    return ENTITY_TYPE_KEYS.has(value);
}

// ─── Value normalisation ────────────────────────────────────────────────────

/** Single-line text. Line breaks become spaces because frontmatter is one line per value. */
export function normalizeTextInput(raw: unknown): string | undefined {
    if (raw === null || raw === undefined) return undefined;
    const text = toText(raw).replace(/\s+/g, ' ').trim();
    return text ? text : undefined;
}

/**
 * Multi-line text for a textarea field. Line breaks are kept (they are written
 * as a YAML block scalar, see definedFieldSaveOptions). Trailing spaces on each
 * line and leading or trailing blank lines are dropped.
 */
export function normalizeTextareaInput(raw: unknown): string | undefined {
    if (raw === null || raw === undefined) return undefined;
    const text = toText(raw)
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[ \t]+$/, ''))
        .join('\n')
        .trim();
    return text ? text : undefined;
}

/** Empty input is undefined (not written). Non-numeric input is also undefined. */
export function normalizeNumberInput(raw: unknown): number | undefined {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
}

/** Split comma or line separated input, trimming and removing case-insensitive duplicates. */
export function parseListInput(raw: unknown): string[] {
    const parts: string[] = Array.isArray(raw)
        ? raw.map(item => toText(item))
        : toText(raw).split(/[,\n]/);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
        const value = part.trim();
        if (!value) continue;
        const lower = value.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push(value);
    }
    return out;
}

/** The plain entity name inside a value that may be "[[Name]]", "[[Name|alias]]" or "Name". */
export function linkTargetName(raw: unknown): string {
    let value = toText(raw).trim();
    const wrapped = value.match(/^\[\[([\s\S]*)\]\]$/);
    if (wrapped) value = wrapped[1];
    return value.split('|')[0].trim();
}

/** Wiki-link a single entity name. Empty names produce undefined. */
export function toWikiLink(raw: unknown): string | undefined {
    const name = linkTargetName(raw);
    return name ? `[[${name}]]` : undefined;
}

/** Wiki-link many names, dropping blanks and case-insensitive duplicates. */
export function normalizeLinksInput(raw: unknown): string[] {
    const items: unknown[] = Array.isArray(raw) ? raw : toText(raw).split(/[,\n]/);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
        const link = toWikiLink(item);
        if (!link) continue;
        const lower = link.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push(link);
    }
    return out;
}

/**
 * The value a definition stores for a raw input, or undefined when it is empty.
 */
export function normalizeDefinedValue(definition: CustomFieldDefinition, raw: unknown): unknown {
    switch (definition.type) {
        case 'text':
            return normalizeTextInput(raw);
        case 'textarea':
            return normalizeTextareaInput(raw);
        case 'number':
            return normalizeNumberInput(raw);
        case 'list': {
            const list = parseListInput(raw);
            return list.length > 0 ? list : undefined;
        }
        case 'link':
            return toWikiLink(raw);
        case 'links': {
            const links = normalizeLinksInput(raw);
            return links.length > 0 ? links : undefined;
        }
    }
}

/**
 * What an empty field writes. Empty strings, nulls and empty arrays are
 * skipped by buildFrontmatter for new notes, and written as-is for notes that
 * already had the key, so clearing a field really clears it on disk.
 */
export function emptyStoredValue(type: CustomFieldType): unknown {
    switch (type) {
        case 'text':
        case 'textarea':
        case 'link':
            return '';
        case 'number':
            return null;
        case 'list':
        case 'links':
            return [];
    }
}

/**
 * Turn a stored entity value into the raw input shown in the modal.
 * Accepts the stored shape and legacy strings alike.
 */
export function displayValueForDefinition(definition: CustomFieldDefinition, stored: unknown): unknown {
    switch (definition.type) {
        case 'text':
        case 'textarea':
            return stored === null || stored === undefined ? '' : toText(stored);
        case 'number':
            return typeof stored === 'number' ? toText(stored) : (typeof stored === 'string' ? stored : '');
        case 'list':
            if (Array.isArray(stored)) return stored.map(item => toText(item)).join(', ');
            return stored === null || stored === undefined ? '' : toText(stored);
        case 'link':
            return linkTargetName(stored ?? '');
        case 'links': {
            const items: unknown[] = Array.isArray(stored) ? stored : (stored ? [stored] : []);
            return items.map(item => linkTargetName(item)).filter(name => name.length > 0);
        }
    }
}

/**
 * Whether a draft is still the display form of the value already stored on the
 * entity. Such a draft was not edited, so committing it would only lose detail
 * (commas inside list items, link aliases).
 */
function isUntouchedDraft(definition: CustomFieldDefinition, entity: Record<string, unknown>, draft: unknown): boolean {
    const stored = entity[definition.key];
    if (stored === undefined) return false;
    return JSON.stringify(draft) === JSON.stringify(displayValueForDefinition(definition, stored));
}

/**
 * Write the normalised drafts of each definition onto the entity. Empty values
 * are written as their empty form (see emptyStoredValue). The save path then
 * turns that form into an omitted key (definedFieldSaveOptions), so clearing a
 * field removes it from the note instead of keeping the old value.
 * A draft the user did not change leaves the stored value untouched.
 */
export function commitDefinedFieldValues(
    entity: Record<string, unknown>,
    definitions: readonly CustomFieldDefinition[],
    drafts: Record<string, unknown>
): void {
    for (const definition of definitions) {
        const draft = drafts[definition.key];
        if (isUntouchedDraft(definition, entity, draft)) continue;
        const value = normalizeDefinedValue(definition, draft);
        entity[definition.key] = value === undefined ? emptyStoredValue(definition.type) : value;
    }
}

/** Whether a stored value is the empty form a cleared defined field commits. */
function isEmptyStoredValue(value: unknown): boolean {
    return value === '' || value === null || (Array.isArray(value) && value.length === 0);
}

/**
 * What the save path hands to buildFrontmatter for defined fields.
 * - `source`: a copy of the entity without the cleared defined keys.
 * - `omitKeys`: cleared keys. buildFrontmatter drops them even when the note
 *   already had them, so clearing a field removes its property on disk.
 * - `multilineKeys`: textarea keys, which keep their line breaks.
 * A key that is absent from the entity is left alone, so a save path that does
 * not carry a defined field never removes its value.
 */
export function definedFieldSaveOptions(
    definitions: readonly CustomFieldDefinition[],
    entity: Record<string, unknown>
): { source: Record<string, unknown>; omitKeys: string[]; multilineKeys: string[] } {
    const source: Record<string, unknown> = { ...entity };
    const omitKeys: string[] = [];
    const multilineKeys: string[] = [];
    for (const definition of definitions) {
        const key = definition.key;
        if (definition.type === 'textarea') multilineKeys.push(key);
        if (!(key in source)) continue;
        if (isEmptyStoredValue(source[key])) {
            delete source[key];
            omitKeys.push(key);
        }
    }
    return { source, omitKeys, multilineKeys };
}

// ─── Read path ──────────────────────────────────────────────────────────────

/**
 * Read normalisation for a loaded entity. Non-whitelisted scalar strings and
 * nulls are swept into `customFields`, except keys that are built-in or defined
 * as fields. Arrays and numbers are not swept. Mutates `src` and returns the
 * resulting customFields map, which is also assigned to `src.customFields`.
 */
export function sweepCustomFieldsOnRead(
    entityType: EntityType,
    src: Record<string, unknown>,
    definitions: readonly CustomFieldDefinition[] = [],
    /** Body-section fields the user stores as frontmatter (see SectionFieldPlacement.ts). */
    sectionFrontmatterFields: readonly string[] = []
): Record<string, string> {
    const reserved = new Set<string>([
        ...Array.from(getWhitelistKeys(entityType)),
        'customFields', 'filePath', 'sections', 'id',
        ...(DERIVED_SECTION_FIELDS[entityType] ?? []),
        ...sectionFrontmatterFields,
        ...definitions.map(definition => definition.key),
    ]);
    const existing = src.customFields;
    const currentCustom: Record<string, string> = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, string>) }
        : {};

    for (const [key, value] of Object.entries(src)) {
        if (reserved.has(key)) continue;
        const hasConflict = Object.keys(currentCustom).some(k => k.toLowerCase() === key.toLowerCase());
        if (value === null || value === undefined) {
            if (!hasConflict) {
                currentCustom[key] = '';
                delete src[key];
            }
            continue;
        }
        if (typeof value === 'string' && !value.includes('\n')) {
            if (!hasConflict) {
                currentCustom[key] = value;
                delete src[key];
            }
        }
    }

    const deduped: Record<string, string> = {};
    const seen = new Set<string>();
    for (const [k, v] of Object.entries(currentCustom)) {
        const lower = k.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        deduped[k] = v;
    }
    src.customFields = deduped;
    return deduped;
}

/**
 * Free-form keys that the note had when it was loaded and that the modal's
 * customFields map no longer holds: a deleted row, or the old name of a
 * renamed row. Pass them to buildFrontmatter as omitOriginalKeys, otherwise its
 * original-frontmatter pass writes the old value back.
 *
 * "Loaded" uses the same sweep as the read path, so only keys the modal showed
 * as free-form count. Returns [] when there is no customFields map, so a save
 * that does not come from the editor removes nothing.
 */
export function removedFreeFormKeys(
    entityType: EntityType,
    originalFrontmatter: Record<string, unknown> | undefined,
    customFields: unknown,
    definitions: readonly CustomFieldDefinition[] = [],
    sectionFrontmatterFields: readonly string[] = []
): string[] {
    if (!originalFrontmatter) return [];
    if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return [];
    const loaded = sweepCustomFieldsOnRead(
        entityType,
        { ...originalFrontmatter },
        definitions,
        sectionFrontmatterFields
    );
    const kept = new Set(Object.keys(customFields as Record<string, unknown>).map(key => key.trim().toLowerCase()));
    return Object.keys(loaded).filter(key => !kept.has(key.trim().toLowerCase()));
}
