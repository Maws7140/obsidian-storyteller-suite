// Relationship vocabulary for the network graph (R-Map style).
// Pure data and helpers: no Obsidian or DOM imports, so it can be unit tested.

import type { RelationshipDirection, RelationshipType } from '../types';

export type RelationshipCategoryId = 'family' | 'feelings' | 'obligation' | 'conflict' | 'other';

/** Category each kind belongs to. Typed as a full Record so new kinds cannot be forgotten. */
const KIND_CATEGORY: Record<RelationshipType, RelationshipCategoryId> = {
    family: 'family',
    parent: 'family',
    child: 'family',
    sibling: 'family',
    spouse: 'family',
    romantic: 'feelings',
    loves: 'feelings',
    desires: 'feelings',
    wants: 'feelings',
    hates: 'feelings',
    fears: 'feelings',
    ally: 'obligation',
    mentor: 'obligation',
    owes: 'obligation',
    employs: 'obligation',
    serves: 'obligation',
    'loyal-to': 'obligation',
    enemy: 'conflict',
    rival: 'conflict',
    betrayed: 'conflict',
    acquaintance: 'other',
    secret: 'other',
    neutral: 'other',
    custom: 'other'
};

type CategoryLabelKey = 'relCategoryFamily' | 'relCategoryFeelings' | 'relCategoryObligation' | 'relCategoryConflict' | 'relCategoryOther';

const CATEGORY_LABEL_KEYS: Record<RelationshipCategoryId, CategoryLabelKey> = {
    family: 'relCategoryFamily',
    feelings: 'relCategoryFeelings',
    obligation: 'relCategoryObligation',
    conflict: 'relCategoryConflict',
    other: 'relCategoryOther'
};

/** Picker and legend order of categories, with the i18n key for each heading. */
export const RELATIONSHIP_CATEGORIES: ReadonlyArray<{
    id: RelationshipCategoryId;
    labelKey: CategoryLabelKey;
    kinds: RelationshipType[];
}> = (['family', 'feelings', 'obligation', 'conflict', 'other'] as RelationshipCategoryId[]).map(id => ({
    id,
    labelKey: CATEGORY_LABEL_KEYS[id],
    kinds: (Object.keys(KIND_CATEGORY) as RelationshipType[]).filter(kind => KIND_CATEGORY[kind] === id)
}));

/** Every kind, in picker order. */
export const RELATIONSHIP_KINDS: RelationshipType[] = RELATIONSHIP_CATEGORIES.flatMap(category => category.kinds);

/**
 * Kinds that hold both ways by nature. They default to a plain (mutual) line.
 * Everything else defaults to a one-way arrow from the owner to the target.
 */
const SYMMETRIC_KINDS = new Set<string>([
    'family', 'sibling', 'spouse', 'romantic', 'ally', 'enemy', 'rival', 'acquaintance', 'neutral'
]);

/** Kinds whose opposite is another kind: a parent stored on A implies a child on B. */
const INVERSE_KINDS: Record<string, RelationshipType> = {
    parent: 'child',
    child: 'parent'
};

export function isRelationshipKind(value: unknown): value is RelationshipType {
    return typeof value === 'string' && (RELATIONSHIP_KINDS as string[]).includes(value);
}

export function categoryOfKind(kind: string): RelationshipCategoryId | null {
    return isRelationshipKind(kind) ? KIND_CATEGORY[kind] : null;
}

/** Direction used when a note does not state one. Unknown (legacy) words are treated as one-way. */
export function defaultDirectionFor(kind: string): RelationshipDirection {
    return SYMMETRIC_KINDS.has(kind) ? 'mutual' : 'to';
}

/** Effective direction of a stored relationship: explicit when set, otherwise inferred from the kind. */
export function resolveDirection(rel: { type: string; direction?: RelationshipDirection }): RelationshipDirection {
    return rel.direction ?? defaultDirectionFor(rel.type);
}

/** The kind the other side implies, or null when there is no implied inverse. */
export function inverseKindOf(kind: string): RelationshipType | null {
    return INVERSE_KINDS[kind] ?? null;
}
