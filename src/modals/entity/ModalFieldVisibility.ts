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
    /** Optional explanation shown under the label in settings. */
    description?: string;
}

/** Settings help for the free-form switch. Defined fields are not affected by it. */
const FREE_FORM_DESCRIPTION = 'Name and value rows you add by hand. Defined fields always show, whatever this is set to.';

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
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
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
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
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
    { key: 'customFields', label: 'Free-form custom fields', group: 'Sections', description: FREE_FORM_DESCRIPTION },
];

/**
 * Location modal fields that may be hidden. Name is required, so it is absent.
 */
export const LOCATION_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'profileImage', label: 'Image', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Basics' },
    { key: 'history', label: 'History', group: 'Basics' },
    { key: 'locationType', label: 'Type', group: 'Basics' },
    { key: 'type', label: 'Hierarchy type', group: 'Basics' },
    { key: 'region', label: 'Region', group: 'Basics' },
    { key: 'status', label: 'Status', group: 'Basics' },
    { key: 'parentLocationId', label: 'Parent location', group: 'Place' },
    { key: 'childLocationIds', label: 'Child locations', group: 'Place' },
    { key: 'images', label: 'Associated images', group: 'Place' },
    { key: 'mapBindings', label: 'Map bindings', group: 'Place' },
    { key: 'entityRefs', label: 'Entities here', group: 'Place' },
    { key: 'cultures', label: 'Cultures', group: 'World-building' },
    { key: 'balance', label: 'Finances (treasury and ledger note)', group: 'World-building' },
    { key: 'linkedEconomies', label: 'Economies', group: 'World-building' },
    { key: 'groups', label: 'Groups', group: 'World-building' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Group modal fields that may be hidden. Group membership and the faction
 * detail sections are all optional. The faction detail sections only appear
 * for a group whose type is not "collection", so their switches only matter
 * for those groups.
 */
export const GROUP_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Basics' },
    { key: 'color', label: 'Color', group: 'Basics' },
    { key: 'tags', label: 'Tags', group: 'Basics' },
    { key: 'memberCharacters', label: 'Characters', group: 'Members' },
    { key: 'memberLocations', label: 'Locations', group: 'Members' },
    { key: 'memberEvents', label: 'Events', group: 'Members' },
    { key: 'memberItems', label: 'Items', group: 'Members' },
    { key: 'history', label: 'History', group: 'Faction details' },
    { key: 'structure', label: 'Structure', group: 'Faction details' },
    { key: 'goals', label: 'Goals', group: 'Faction details' },
    { key: 'resources', label: 'Resources', group: 'Faction details' },
    { key: 'strength', label: 'Strength', group: 'Faction details' },
    { key: 'status', label: 'Status', group: 'Faction details' },
    { key: 'powerInfluence', label: 'Power and influence (military, economic, political)', group: 'Faction details' },
    { key: 'identity', label: 'Identity (colors, emblem, motto, territories)', group: 'Faction details' },
    { key: 'groupRelationships', label: 'Inter-group relationships', group: 'Relationships' },
    { key: 'linkedCulture', label: 'Linked culture', group: 'Relationships' },
    { key: 'parentGroup', label: 'Parent group', group: 'Relationships' },
    { key: 'subgroups', label: 'Subgroups', group: 'Relationships' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Culture modal fields that may be hidden. The long-form text sections are
 * separate switches so a vault can keep, say, religion and drop customs.
 */
export const CULTURE_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'techLevel', label: 'Technology level', group: 'Basics' },
    { key: 'governmentType', label: 'Government type', group: 'Basics' },
    { key: 'status', label: 'Status', group: 'Basics' },
    { key: 'languages', label: 'Languages', group: 'Basics' },
    { key: 'population', label: 'Population', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Writing' },
    { key: 'values', label: 'Values and beliefs', group: 'Writing' },
    { key: 'religion', label: 'Religion', group: 'Writing' },
    { key: 'socialStructure', label: 'Social structure', group: 'Writing' },
    { key: 'history', label: 'History', group: 'Writing' },
    { key: 'namingConventions', label: 'Naming conventions', group: 'Writing' },
    { key: 'customs', label: 'Customs and traditions', group: 'Writing' },
    { key: 'linkedCharacters', label: 'Characters', group: 'World-building' },
    { key: 'linkedLocations', label: 'Locations', group: 'World-building' },
    { key: 'balance', label: 'Collective wealth', group: 'World-building' },
    { key: 'linkedEconomies', label: 'Economies', group: 'World-building' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Economy modal fields that may be hidden.
 */
export const ECONOMY_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'economicSystem', label: 'Economic system', group: 'Basics' },
    { key: 'status', label: 'Status', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Writing' },
    { key: 'industries', label: 'Industries', group: 'Writing' },
    { key: 'taxation', label: 'Taxation', group: 'Writing' },
    { key: 'linkedCharacters', label: 'Characters', group: 'World-building' },
    { key: 'linkedLocations', label: 'Locations', group: 'World-building' },
    { key: 'linkedCultures', label: 'Cultures', group: 'World-building' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Magic system modal fields that may be hidden.
 */
export const MAGIC_SYSTEM_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'profileImage', label: 'Representative image', group: 'Basics' },
    { key: 'systemType', label: 'System type', group: 'Basics' },
    { key: 'rarity', label: 'Rarity', group: 'Basics' },
    { key: 'powerLevel', label: 'Power level', group: 'Basics' },
    { key: 'status', label: 'Status', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Writing' },
    { key: 'rules', label: 'Rules and mechanics', group: 'Writing' },
    { key: 'source', label: 'Source', group: 'Writing' },
    { key: 'costs', label: 'Costs and consequences', group: 'Writing' },
    { key: 'limitations', label: 'Limitations', group: 'Writing' },
    { key: 'training', label: 'Training and learning', group: 'Writing' },
    { key: 'history', label: 'History', group: 'Writing' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Compendium entry modal fields that may be hidden. The creature-style lore
 * areas are separate switches because most vaults use only some of them.
 */
export const COMPENDIUM_ENTRY_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'entryType', label: 'Entry type', group: 'Basics' },
    { key: 'rarity', label: 'Rarity', group: 'Basics' },
    { key: 'dangerRating', label: 'Danger rating', group: 'Basics' },
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Lore' },
    { key: 'behavior', label: 'Behavior and ecology', group: 'Lore' },
    { key: 'properties', label: 'Properties', group: 'Lore' },
    { key: 'history', label: 'History and lore', group: 'Lore' },
    { key: 'dimorphism', label: 'Dimorphism', group: 'Lore' },
    { key: 'huntingNotes', label: 'Hunting notes', group: 'Lore' },
    { key: 'linkedLocations', label: 'Locations', group: 'Links' },
    { key: 'linkedCharacters', label: 'Characters', group: 'Links' },
    { key: 'linkedItems', label: 'Items', group: 'Links' },
    { key: 'linkedMagicSystems', label: 'Magic systems', group: 'Links' },
    { key: 'linkedCultures', label: 'Cultures', group: 'Links' },
    { key: 'linkedEvents', label: 'Events', group: 'Links' },
    { key: 'groups', label: 'Groups', group: 'Links' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Reference modal fields that may be hidden. A reference is mostly its
 * content, so only the supporting fields can be switched off.
 */
export const REFERENCE_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'category', label: 'Category', group: 'Basics' },
    { key: 'tags', label: 'Tags', group: 'Basics' },
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'content', label: 'Content', group: 'Basics' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Scene modal fields that may be hidden. Title is required, so it is absent.
 */
export const SCENE_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'chapterId', label: 'Chapter', group: 'Placement' },
    { key: 'date', label: 'Date', group: 'Placement' },
    { key: 'campaignBoardMapId', label: 'Campaign board map', group: 'Placement' },
    { key: 'status', label: 'Status', group: 'Writing' },
    { key: 'priority', label: 'Priority in chapter', group: 'Writing' },
    { key: 'povCharacter', label: 'POV character', group: 'Writing' },
    { key: 'emotion', label: 'Emotional tone', group: 'Writing' },
    { key: 'intensity', label: 'Intensity', group: 'Writing' },
    { key: 'synopsis', label: 'Synopsis', group: 'Writing' },
    { key: 'tags', label: 'Tags', group: 'Writing' },
    { key: 'profileImage', label: 'Profile image', group: 'Writing' },
    { key: 'content', label: 'Content', group: 'Writing' },
    { key: 'beats', label: 'Beat sheet', group: 'Writing' },
    { key: 'linkedCharacters', label: 'Characters', group: 'Links' },
    { key: 'linkedLocations', label: 'Locations', group: 'Links' },
    { key: 'linkedEvents', label: 'Events', group: 'Links' },
    { key: 'linkedItems', label: 'Items', group: 'Links' },
    { key: 'linkedGroups', label: 'Groups', group: 'Links' },
    { key: 'setupScenes', label: 'Sets up scenes', group: 'Links' },
    { key: 'payoffScenes', label: 'Paid off by scenes', group: 'Links' },
    { key: 'branches', label: 'Branches (existing scenes only)', group: 'Links' },
];

/**
 * Chapter modal fields that may be hidden. Title is required, so it is absent.
 */
export const CHAPTER_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'number', label: 'Number', group: 'Basics' },
    { key: 'tags', label: 'Tags', group: 'Basics' },
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'summary', label: 'Summary', group: 'Basics' },
    { key: 'bookId', label: 'Book', group: 'Basics' },
    { key: 'linkedCharacters', label: 'Characters', group: 'Links' },
    { key: 'linkedLocations', label: 'Locations', group: 'Links' },
    { key: 'linkedEvents', label: 'Events', group: 'Links' },
    { key: 'linkedItems', label: 'Items', group: 'Links' },
    { key: 'linkedGroups', label: 'Groups', group: 'Links' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Book modal fields that may be hidden. Title is required, so it is absent.
 */
export const BOOK_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'series', label: 'Series', group: 'Basics' },
    { key: 'bookNumber', label: 'Book number', group: 'Basics' },
    { key: 'genre', label: 'Genre', group: 'Basics' },
    { key: 'status', label: 'Status', group: 'Basics' },
    { key: 'coverImagePath', label: 'Cover image', group: 'Basics' },
    { key: 'description', label: 'Description', group: 'Basics' },
    { key: 'synopsis', label: 'Synopsis', group: 'Basics' },
    { key: 'linkedChapters', label: 'Chapters', group: 'Structure' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/**
 * Map modal fields that may be hidden. Name is required, and the map type is
 * deliberately absent: it decides which configuration sections exist.
 */
export const MAP_MODAL_FIELDS: ModalFieldDef[] = [
    { key: 'description', label: 'Description', group: 'Basics' },
    { key: 'scale', label: 'Scale', group: 'Basics' },
    { key: 'profileImage', label: 'Profile image', group: 'Basics' },
    { key: 'correspondingLocationId', label: 'Corresponding location', group: 'Links' },
    { key: 'imageMapSettings', label: 'Image map settings (background, width, height)', group: 'Configuration' },
    { key: 'realWorldSettings', label: 'Real-world map settings (coordinates, tiles, dark mode)', group: 'Configuration' },
    { key: 'zoomLimits', label: 'Zoom limits (min and max)', group: 'Configuration' },
    { key: 'groups', label: 'Groups', group: 'Links' },
    { key: 'customFields', label: 'Free-form custom fields', group: 'Advanced', description: FREE_FORM_DESCRIPTION },
];

/** Entity modals that support hiding fields. */
export const MODAL_FIELD_SETS: Record<string, ModalFieldDef[]> = {
    character: CHARACTER_MODAL_FIELDS,
    item: ITEM_MODAL_FIELDS,
    event: EVENT_MODAL_FIELDS,
    location: LOCATION_MODAL_FIELDS,
    // The group modal is keyed by 'faction', the EntityType used for groups
    // in the YAML whitelists and custom field editor.
    faction: GROUP_MODAL_FIELDS,
    culture: CULTURE_MODAL_FIELDS,
    economy: ECONOMY_MODAL_FIELDS,
    magicSystem: MAGIC_SYSTEM_MODAL_FIELDS,
    compendiumEntry: COMPENDIUM_ENTRY_MODAL_FIELDS,
    reference: REFERENCE_MODAL_FIELDS,
    scene: SCENE_MODAL_FIELDS,
    chapter: CHAPTER_MODAL_FIELDS,
    book: BOOK_MODAL_FIELDS,
    map: MAP_MODAL_FIELDS,
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
