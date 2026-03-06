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

/**
 * Resolve the most reliable tracked owner for an item.
 * Priority:
 * 1. item.currentOwner
 * 2. a character whose ownedItems includes the item name
 */
export function getTrackedItemOwner(
    item: Pick<PlotItem, 'name' | 'currentOwner'>,
    characters: Character[]
): string | undefined {
    const explicitOwner = cleanName(item.currentOwner);
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
