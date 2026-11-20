// Implied-link suggestions for the network graph.
//
// Pure logic: no Obsidian imports. The graph view gathers characters, groups and
// occasions (events and scenes) and passes them in. Accepting a suggestion writes a
// real relationship to the source character's note (see connectionForSuggestion).
// Dismissed suggestions are passed back in by key and filtered out.

import type { Character, Group, RelationshipDirection, RelationshipType, TypedRelationship } from '../types';
import { inverseKindOf, resolveDirection } from './RelationshipKinds';

export type LinkSuggestionReason = 'family-field' | 'co-presence' | 'shared-group';

export interface LinkSuggestion {
    /** Stable identity used to remember dismissals */
    key: string;
    reason: LinkSuggestionReason;
    /** Name of the character whose note receives the relationship */
    source: string;
    kind: RelationshipType;
    /** Name of the other character */
    target: string;
    direction: RelationshipDirection;
    label?: string;
    /** Plain-language reason shown to the user */
    detail: string;
}

export type LinkSuggestionCharacter = Pick<Character, 'name' | 'id' | 'groups' | 'connections' | 'relationships' | 'customFields'>;

export interface LinkSuggestionInput {
    characters: LinkSuggestionCharacter[];
    groups?: Array<Pick<Group, 'id' | 'name' | 'members'>>;
    /** Events and scenes, each with the names of the characters present */
    occasions?: Array<{ id: string; participants: string[] }>;
    /** Keys of suggestions the user dismissed */
    dismissed?: readonly string[];
    /** Shared scenes or events needed before two characters are suggested as acquaintances */
    coPresenceThreshold?: number;
    /** Groups larger than this are skipped: every pair in a big faction is noise */
    maxGroupSize?: number;
    limit?: number;
}

export const DEFAULT_CO_PRESENCE_THRESHOLD = 3;
export const DEFAULT_MAX_GROUP_SIZE = 12;
export const DEFAULT_SUGGESTION_LIMIT = 50;

/**
 * Custom fields that describe family, and what the value means.
 * - parent: the value is the owner's parent (parents, father, mother)
 * - child: the value is the owner's child (children, son, daughter)
 * - peer: a mutual tie with the value (siblings, spouse, partner)
 */
type FamilyRole = 'parent' | 'child' | 'peer';
const FAMILY_FIELD_RULES: Record<string, { kind: RelationshipType; role: FamilyRole }> = {
    parent: { kind: 'parent', role: 'parent' },
    parents: { kind: 'parent', role: 'parent' },
    father: { kind: 'parent', role: 'parent' },
    mother: { kind: 'parent', role: 'parent' },
    child: { kind: 'parent', role: 'child' },
    children: { kind: 'parent', role: 'child' },
    son: { kind: 'parent', role: 'child' },
    sons: { kind: 'parent', role: 'child' },
    daughter: { kind: 'parent', role: 'child' },
    daughters: { kind: 'parent', role: 'child' },
    sibling: { kind: 'sibling', role: 'peer' },
    siblings: { kind: 'sibling', role: 'peer' },
    brother: { kind: 'sibling', role: 'peer' },
    brothers: { kind: 'sibling', role: 'peer' },
    sister: { kind: 'sibling', role: 'peer' },
    sisters: { kind: 'sibling', role: 'peer' },
    spouse: { kind: 'spouse', role: 'peer' },
    spouses: { kind: 'spouse', role: 'peer' },
    partner: { kind: 'spouse', role: 'peer' },
    husband: { kind: 'spouse', role: 'peer' },
    wife: { kind: 'spouse', role: 'peer' }
};

const NON_NAME_VALUES = new Set(['', 'none', 'unknown', 'n/a', 'na', '-']);

/** Normalise a name or wiki link for comparison: strips [[ ]], aliases, case and spacing. */
function normaliseName(ref: string): string {
    return ref.replace(/^\[\[|\]\]$/g, '').split('|')[0].replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Names held by a family value: a string list, or an array of wiki links or names (typed
 * fields such as `parents: ["[[Arathorn]]"]`). Anything else names nobody.
 */
function familyNames(raw: unknown): string[] {
    if (typeof raw === 'string') return splitNameList(raw);
    if (Array.isArray(raw)) return raw.flatMap(item => (typeof item === 'string' ? splitNameList(item) : []));
    return [];
}

/**
 * Field/value pairs on a character that may describe family: its custom fields, then its
 * top-level properties (typed defined fields live there).
 */
function familyFieldsOf(owner: LinkSuggestionCharacter): Array<[string, unknown]> {
    const fields: Array<[string, unknown]> = Object.entries(owner.customFields ?? {});
    for (const [field, value] of Object.entries(owner as unknown as Record<string, unknown>)) {
        if (field !== 'customFields') fields.push([field, value]);
    }
    return fields;
}

/** Split a free-text list of names ("Tom, Anne and [[Bob]]") into clean names. */
export function splitNameList(raw: string): string[] {
    return raw
        .split(/[,;\n]|\s+and\s+|\s*&\s*|\s*\/\s*/i)
        .map(part => part.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].trim())
        .filter(part => !NON_NAME_VALUES.has(part.toLowerCase()));
}

/**
 * Stable key for a suggestion. Mutual links ignore order, so "A sibling B" and
 * "B sibling A" share one key and one dismissal.
 */
export function linkSuggestionKey(kind: string, source: string, target: string, direction: RelationshipDirection): string {
    const a = normaliseName(source);
    const b = normaliseName(target);
    if (direction === 'mutual') {
        const [first, second] = a <= b ? [a, b] : [b, a];
        return `${kind}|${first}<>${second}`;
    }
    return `${kind}|${a}>${b}`;
}

/** Relationship to write on the source character's note when a suggestion is accepted. */
export function connectionForSuggestion(suggestion: Pick<LinkSuggestion, 'kind' | 'target' | 'direction' | 'label'>): TypedRelationship {
    return {
        target: suggestion.target,
        type: suggestion.kind,
        direction: suggestion.direction,
        ...(suggestion.label ? { label: suggestion.label } : {})
    };
}

/**
 * Propose relationships the data implies but nobody has stated:
 * 1. family-sounding custom fields (parents, children, siblings, spouse)
 * 2. characters who share scenes or events at least `coPresenceThreshold` times
 * 3. characters who belong to the same (not too large) group
 * Pairs that already have a relationship are skipped (except family fields, which
 * are skipped only when the same relationship is already stated). Dismissed keys
 * are filtered out. Family suggestions come first, then co-presence, then groups.
 */
export function suggestImpliedLinks(input: LinkSuggestionInput): LinkSuggestion[] {
    const threshold = input.coPresenceThreshold ?? DEFAULT_CO_PRESENCE_THRESHOLD;
    const maxGroupSize = input.maxGroupSize ?? DEFAULT_MAX_GROUP_SIZE;
    const limit = input.limit ?? DEFAULT_SUGGESTION_LIMIT;
    const dismissed = new Set((input.dismissed ?? []).map(key => key.toLowerCase()));

    // Lookup of normalised names and ids to characters
    const byRef = new Map<string, LinkSuggestionCharacter>();
    for (const character of input.characters) {
        const nameKey = normaliseName(character.name);
        if (nameKey && !byRef.has(nameKey)) byRef.set(nameKey, character);
        if (character.id) {
            const idKey = normaliseName(character.id);
            if (idKey && !byRef.has(idKey)) byRef.set(idKey, character);
        }
    }
    const resolve = (ref: string): LinkSuggestionCharacter | null => byRef.get(normaliseName(ref)) ?? null;
    const canon = (character: LinkSuggestionCharacter): string => normaliseName(character.name);

    // Existing relationships, in both directions for mutual ones
    const directed = new Set<string>();
    const linkedPairs = new Set<string>();
    const pairKey = (a: LinkSuggestionCharacter, b: LinkSuggestionCharacter): string => [canon(a), canon(b)].sort().join('\u0000');
    const recordLink = (from: LinkSuggestionCharacter, to: LinkSuggestionCharacter, kind: string, direction: RelationshipDirection) => {
        directed.add(`${kind}|${canon(from)}>${canon(to)}`);
        if (direction === 'mutual') directed.add(`${kind}|${canon(to)}>${canon(from)}`);
        linkedPairs.add(pairKey(from, to));
    };
    for (const owner of input.characters) {
        for (const conn of owner.connections ?? []) {
            const other = resolve(conn.target);
            if (other && other !== owner) recordLink(owner, other, conn.type, resolveDirection(conn));
        }
        for (const rel of owner.relationships ?? []) {
            const other = resolve(typeof rel === 'string' ? rel : rel.target);
            if (!other || other === owner) continue;
            const kind = typeof rel === 'string' ? 'neutral' : rel.type;
            recordLink(owner, other, kind, typeof rel === 'string' ? 'mutual' : resolveDirection(rel));
        }
    }
    const hasKind = (kind: string, from: LinkSuggestionCharacter, to: LinkSuggestionCharacter) => directed.has(`${kind}|${canon(from)}>${canon(to)}`);
    const isLinked = (a: LinkSuggestionCharacter, b: LinkSuggestionCharacter) => linkedPairs.has(pairKey(a, b));

    const out: LinkSuggestion[] = [];
    const seen = new Set<string>();
    const offer = (candidate: {
        source: LinkSuggestionCharacter;
        target: LinkSuggestionCharacter;
        kind: RelationshipType;
        direction: RelationshipDirection;
        label?: string;
        reason: LinkSuggestionReason;
        detail: string;
    }) => {
        const key = linkSuggestionKey(candidate.kind, candidate.source.name, candidate.target.name, candidate.direction);
        if (seen.has(key) || dismissed.has(key)) return;
        seen.add(key);
        out.push({
            key,
            reason: candidate.reason,
            source: candidate.source.name,
            kind: candidate.kind,
            target: candidate.target.name,
            direction: candidate.direction,
            ...(candidate.label ? { label: candidate.label } : {}),
            detail: candidate.detail
        });
    };

    // 1. Family-sounding fields: custom fields and typed top-level properties
    for (const owner of input.characters) {
        for (const [field, raw] of familyFieldsOf(owner)) {
            const rule = FAMILY_FIELD_RULES[field.trim().toLowerCase()];
            if (!rule) continue;
            for (const name of familyNames(raw)) {
                const other = resolve(name);
                if (!other || other === owner) continue;
                // A family field already implies a relationship for this pair, so the
                // weaker co-presence and shared-group passes must not offer another kind.
                linkedPairs.add(pairKey(owner, other));

                let source: LinkSuggestionCharacter;
                let target: LinkSuggestionCharacter;
                let direction: RelationshipDirection;
                if (rule.role === 'parent') {
                    source = other; target = owner; direction = 'to';
                } else if (rule.role === 'child') {
                    source = owner; target = other; direction = 'to';
                } else {
                    source = owner; target = other; direction = 'mutual';
                }

                const inverse = inverseKindOf(rule.kind);
                const stated = direction === 'mutual'
                    ? hasKind(rule.kind, source, target) || hasKind(rule.kind, target, source)
                    : hasKind(rule.kind, source, target) || (inverse !== null && hasKind(inverse, target, source));
                if (stated) continue;

                offer({
                    source,
                    target,
                    kind: rule.kind,
                    direction,
                    reason: 'family-field',
                    detail: `${owner.name} lists ${other.name} under "${field.trim()}"`
                });
            }
        }
    }

    // 2. Co-presence in events and scenes
    const occasionCounts = new Map<string, { a: LinkSuggestionCharacter; b: LinkSuggestionCharacter; count: number }>();
    const seenOccasions = new Set<string>();
    for (const occasion of input.occasions ?? []) {
        if (seenOccasions.has(occasion.id)) continue;
        seenOccasions.add(occasion.id);
        const present = new Map<string, LinkSuggestionCharacter>();
        for (const name of occasion.participants) {
            const character = resolve(name);
            if (character) present.set(canon(character), character);
        }
        const people = [...present.values()];
        for (let i = 0; i < people.length; i++) {
            for (let j = i + 1; j < people.length; j++) {
                const [a, b] = canon(people[i]) <= canon(people[j]) ? [people[i], people[j]] : [people[j], people[i]];
                const key = pairKey(a, b);
                const entry = occasionCounts.get(key);
                if (entry) entry.count++;
                else occasionCounts.set(key, { a, b, count: 1 });
            }
        }
    }
    [...occasionCounts.values()]
        .filter(entry => entry.count >= threshold && !isLinked(entry.a, entry.b))
        .sort((x, y) => y.count - x.count)
        .forEach(entry => offer({
            source: entry.a,
            target: entry.b,
            kind: 'acquaintance',
            direction: 'mutual',
            reason: 'co-presence',
            detail: `Together in ${entry.count} scenes or events`
        }));

    // 3. Shared groups (factions, guilds, ...)
    const groupPairs = new Map<string, { a: LinkSuggestionCharacter; b: LinkSuggestionCharacter; names: string[] }>();
    for (const group of input.groups ?? []) {
        const groupKeys = new Set([normaliseName(group.id), normaliseName(group.name)]);
        const members = new Map<string, LinkSuggestionCharacter>();
        for (const character of input.characters) {
            if ((character.groups ?? []).some(ref => groupKeys.has(normaliseName(ref)))) members.set(canon(character), character);
        }
        for (const member of group.members ?? []) {
            if (member.type !== 'character') continue;
            const character = resolve(member.id || member.name || '');
            if (character) members.set(canon(character), character);
        }
        if (members.size < 2 || members.size > maxGroupSize) continue;
        const list = [...members.values()];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const [a, b] = canon(list[i]) <= canon(list[j]) ? [list[i], list[j]] : [list[j], list[i]];
                const key = pairKey(a, b);
                const entry = groupPairs.get(key);
                if (entry) {
                    if (!entry.names.includes(group.name)) entry.names.push(group.name);
                } else {
                    groupPairs.set(key, { a, b, names: [group.name] });
                }
            }
        }
    }
    for (const entry of groupPairs.values()) {
        if (isLinked(entry.a, entry.b)) continue;
        offer({
            source: entry.a,
            target: entry.b,
            kind: 'acquaintance',
            direction: 'mutual',
            label: `same group: ${entry.names.join(', ')}`,
            reason: 'shared-group',
            detail: `Both in ${entry.names.join(', ')}`
        });
    }

    return out.slice(0, limit);
}
