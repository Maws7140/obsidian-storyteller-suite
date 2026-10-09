/**
 * Optional fields in the entity modals, and which of them a vault has chosen to
 * hide.
 *
 * Hiding is presentation only. A hidden field is not rendered, but the modal
 * submits the entity object it loaded, so any value already stored in a hidden
 * field is preserved untouched. Nothing here deletes data.
 */

/** An entity modal field that can be turned off. */
export interface ModalFieldDef {
    /** Stable key. Persisted in settings, so never rename one of these. */
    key: string;
    /** Shown in the settings list. */
    label: string;
    /** Optional grouping for the settings list. */
    group?: string;
}

/**
 * Character modal fields that may be hidden. Name is deliberately absent: it is
 * required to save, so it can never be turned off.
 */
export const CHARACTER_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Basics' },
    { key: 'traits', label: 'Traits', group: 'Basics' },
    { key: 'backstory', label: 'Backstory', group: 'Basics' },
    { key: 'status', label: 'Status', group: 'Basics' },
    { key: 'affiliation', label: 'Affiliation', group: 'Basics' },
    { key: 'physicalAttributes', label: 'Physical attributes (gender, race, age, height)', group: 'Detail' },
    { key: 'quirks', label: 'Quirks', group: 'Detail' },
    { key: 'location', label: 'Current location and location history', group: 'Detail' },
    { key: 'cultures', label: 'Cultures', group: 'World-building' },
    { key: 'inventory', label: 'Inventory and balance', group: 'World-building' },
    { key: 'economies', label: 'Economies', group: 'World-building' },
    { key: 'groups', label: 'Groups', group: 'World-building' },
    { key: 'connections', label: 'Connections', group: 'World-building' },
    { key: 'customFields', label: 'Custom fields', group: 'Advanced' },
    { key: 'dndStats', label: 'D&D stats', group: 'Advanced' },
];

/**
 * Item modal fields that may be hidden. Name is absent for the same reason it is
 * absent from the character set.
 */
export const ITEM_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'profileImage', label: 'Item image', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Basics' },
    { key: 'history', label: 'History', group: 'Basics' },
    { key: 'whereToFind', label: 'Where to find', group: 'Basics' },
    { key: 'owners', label: 'Current owners', group: 'Ownership' },
    { key: 'creator', label: 'Creator', group: 'Ownership' },
    { key: 'quantity', label: 'Quantity', group: 'Ownership' },
    { key: 'pastOwners', label: 'Past owners', group: 'Ownership' },
    { key: 'location', label: 'Current location', group: 'World-building' },
    { key: 'associatedEvents', label: 'Associated events', group: 'World-building' },
    { key: 'associatedCharacters', label: 'Associated characters', group: 'World-building' },
    { key: 'groups', label: 'Groups', group: 'World-building' },
    { key: 'customFields', label: 'Custom fields', group: 'Advanced' },
    { key: 'campaignUse', label: 'Campaign use', group: 'Advanced' },
];

/**
 * Event modal sections that may be hidden. Name is the only required field and
 * therefore is deliberately absent. The larger specialist areas are section
 * switches rather than dozens of individual toggles: that keeps the Settings
 * page understandable while the modal itself owns the field layout.
 */
export const EVENT_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'dateTime', label: 'Date or range', group: 'Core' },
    { key: 'status', label: 'Status', group: 'Core' },
    { key: 'description', label: 'Description', group: 'Core' },
    { key: 'outcome', label: 'Outcome', group: 'Core' },
    { key: 'characters', label: 'Characters involved', group: 'Core' },
    { key: 'location', label: 'Location', group: 'Core' },
    { key: 'narrative', label: 'Narrative (flashbacks and flash-forwards)', group: 'Sections' },
    { key: 'timeline', label: 'Timeline options', group: 'Sections' },
    { key: 'provenance', label: 'Provenance', group: 'Sections' },
    { key: 'media', label: 'Media', group: 'Sections' },
    { key: 'organization', label: 'Organization (tags, groups, branches)', group: 'Sections' },
    { key: 'customFields', label: 'Custom fields', group: 'Sections' },
];

/** Entity modals that support hiding fields. */
export const MODAL_FIELD_SETS: Record<string, ModalFieldDef[]> = {
    character: CHARACTER_MODAL_FIELDS,
    item: ITEM_MODAL_FIELDS,
    event: EVENT_MODAL_FIELDS,
};

/**
 * Whether a field should render.
 *
 * Defaults to visible: an unknown entity type, a missing settings key, or a
 * malformed stored value all mean "show it". A vault that has never configured
 * this sees exactly the modal it saw before.
 *
 * A key the registry no longer knows also reads as visible. A renamed field
 * leaves a stale entry behind, and settings would no longer offer a toggle to
 * undo it, so honouring it would remove a field with no way to bring it back.
 */
export function isModalFieldVisible(
    hidden: Record<string, string[]> | undefined,
    entityType: string,
    fieldKey: string
): boolean {
    const hiddenForType = hidden?.[entityType];
    if (!Array.isArray(hiddenForType)) return true;
    const known = (MODAL_FIELD_SETS[entityType] ?? []).some(field => field.key === fieldKey);
    if (!known) return true;
    return !hiddenForType.includes(fieldKey);
}

/**
 * Turn one field on or off, returning an updated map. Does not mutate the input.
 */
export function setModalFieldHidden(
    hidden: Record<string, string[]> | undefined,
    entityType: string,
    fieldKey: string,
    isHidden: boolean
): Record<string, string[]> {
    const next: Record<string, string[]> = { ...(hidden ?? {}) };
    const current = new Set(Array.isArray(next[entityType]) ? next[entityType] : []);
    if (isHidden) current.add(fieldKey);
    else current.delete(fieldKey);
    const list = Array.from(current);
    if (list.length > 0) next[entityType] = list;
    else delete next[entityType];
    return next;
}

/**
 * Field names pre-populated on a newly created entity, so a recurring custom
 * field does not have to be typed out for every character.
 *
 * Only ever called for a new entity. Seeding one that already has values could
 * resurrect a field the user had deliberately deleted.
 */
export function seedDefaultCustomFields(
    existing: Record<string, string> | undefined,
    defaults: string[] | undefined
): Record<string, string> {
    const fields: Record<string, string> = { ...(existing ?? {}) };
    for (const rawName of defaults ?? []) {
        const name = rawName.trim();
        if (!name) continue;
        if (name in fields) continue;
        fields[name] = '';
    }
    return fields;
}
