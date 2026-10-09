import type { Character, PlotItem } from '../types';

const normalizeName = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
};

const cleanName = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
};

/** An item's owners, tolerating notes still carrying the legacy scalar. */
export function getOwners(item: Pick<PlotItem, 'owners' | 'currentOwner'>): string[] {
    if (Array.isArray(item.owners)) {
        return item.owners
            .map(owner => cleanName(owner))
            .filter((owner): owner is string => Boolean(owner));
    }
    // parseFile hoists currentOwner into owners, so this only catches objects
    // built by hand — prebuilt templates, tests, callers holding raw frontmatter.
    // Reading the deprecated field is the entire point of this branch.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const legacy = cleanName(item.currentOwner);
    return legacy ? [legacy] : [];
}

/** The first owner, for UI that has room for only one name. */
export function getPrimaryOwner(item: Pick<PlotItem, 'owners' | 'currentOwner'>): string | undefined {
    return getOwners(item)[0];
}

/**
 * Resolve the most reliable tracked owner for an item.
 * Priority:
 * 1. the item's own owners
 * 2. a character whose ownedItems includes the item name
 */
export function getTrackedItemOwner(
    item: Pick<PlotItem, 'name' | 'owners' | 'currentOwner'>,
    characters: Character[]
): string | undefined {
    const explicitOwner = getPrimaryOwner(item);
    if (explicitOwner) return explicitOwner;

    const normalizedItemName = normalizeName(item.name);
    if (!normalizedItemName) return undefined;

    for (const character of characters) {
        const ownedItems = Array.isArray(character.ownedItems) ? character.ownedItems : [];
        const ownsItem = ownedItems.some(ownedItem => normalizeName(ownedItem) === normalizedItemName);
        if (ownsItem) return cleanName(character.name);
    }

    return undefined;
}

export function isSameName(a: unknown, b: unknown): boolean {
    const normalizedA = normalizeName(a);
    const normalizedB = normalizeName(b);
    return normalizedA.length > 0 && normalizedA === normalizedB;
}

// ── Party-scoped ownership ──────────────────────────────────────────────────
//
// An item can be held by several characters at once, but campaign play asks a
// single-holder question: which member of *this* party is carrying it. The two
// helpers below answer that without disturbing owners outside the party, so
// handing a shared item to a party member never silently drops the NPC who also
// owns a copy.

export type NameNormalizer = (name: string) => string;

/** The owner who belongs to the given party, if any. */
export function getPartyOwner(
    item: Pick<PlotItem, 'owners' | 'currentOwner'>,
    partyNames: Set<string>,
    normalize: NameNormalizer = normalizeName
): string | undefined {
    return getOwners(item).find(owner => partyNames.has(normalize(owner)));
}

/**
 * Hand the item to `nextOwner` within this party, or to nobody when it is
 * undefined. Owners outside the party are left alone.
 *
 * @returns true when the item's owners actually changed.
 */
export function setPartyOwner(
    item: PlotItem,
    nextOwner: string | undefined,
    partyNames: Set<string>,
    normalize: NameNormalizer = normalizeName
): boolean {
    const before = getOwners(item);
    const kept = before.filter(owner => !partyNames.has(normalize(owner)));
    const next = nextOwner ? [...kept, nextOwner] : kept;

    const unchanged = next.length === before.length
        && next.every((owner, i) => owner === before[i]);
    if (unchanged) return false;

    item.owners = next;
    return true;
}
