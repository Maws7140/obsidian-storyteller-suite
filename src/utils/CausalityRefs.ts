// Cause and effect, written on the events themselves.
//
// A causal link used to be a row in a third list that named two events. That
// made it invisible from either event's note and impossible to hand to anyone
// along with the story. It belongs on the events, like every other relationship
// in the plugin.
//
// The stored form is one readable string per link, the same shape connections
// and entityRefs already use so Obsidian's Properties panel renders it as text
// and the wiki link feeds Graph view:
//
//   direct: [[The siege breaks]] — the gates were already weakened
//   indirect/strong: [[The famine]]
//
// Type before the colon, optional strength after a slash, target in brackets,
// optional description after an em-dash-free separator.

export type CausalityStrength = 'weak' | 'moderate' | 'strong' | 'absolute';

export interface CausalityRef {
    /** Name of the event on the other end of the link */
    target: string;
    /** How the cause led to the effect: direct, indirect, conditional, catalyst… */
    linkType: string;
    /** How firm the connection is */
    strength?: CausalityStrength;
    /** Prose explanation of the link */
    description?: string;
}

const STRENGTHS: CausalityStrength[] = ['weak', 'moderate', 'strong', 'absolute'];
const SEPARATOR = ' - ';
const REF_PATTERN = /^\s*([^:[\]]+?)\s*:\s*(?:\[\[([^\]]+)\]\]|([^-]+?))\s*(?:-\s*(.*))?$/;

function normalizeStrength(value: unknown): CausalityStrength | undefined {
    const raw = String(value ?? '').trim().toLowerCase();
    return STRENGTHS.find(strength => strength === raw);
}

/** One link as the string stored in frontmatter. */
export function serializeCausalityRef(ref: CausalityRef): string {
    const target = ref.target.trim();
    if (!target) return '';
    const linkType = ref.linkType.trim() || 'direct';
    const head = ref.strength ? `${linkType}/${ref.strength}` : linkType;
    const description = (ref.description || '').trim();
    return description
        ? `${head}: [[${target}]]${SEPARATOR}${description}`
        : `${head}: [[${target}]]`;
}

/**
 * Read one stored link back.
 *
 * Anything unparseable is treated as a bare event name with a direct link
 * rather than discarded: a link the user can see and fix beats a link that
 * quietly disappeared.
 */
export function parseCausalityRef(value: unknown): CausalityRef | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        const target = typeof record.target === 'string' ? record.target.trim() : '';
        if (!target) return null;
        return {
            target,
            linkType: typeof record.linkType === 'string' && record.linkType.trim() ? record.linkType.trim() : 'direct',
            ...(normalizeStrength(record.strength) ? { strength: normalizeStrength(record.strength) } : {}),
            ...(typeof record.description === 'string' && record.description.trim()
                ? { description: record.description.trim() }
                : {})
        };
    }

    if (typeof value !== 'string' || !value.trim()) return null;
    const match = value.match(REF_PATTERN);
    if (!match) {
        const bare = stripLink(value);
        return bare ? { target: bare, linkType: 'direct' } : null;
    }

    const target = stripLink(match[2] ?? match[3] ?? '');
    if (!target) {
        const bare = stripLink(value);
        return bare ? { target: bare, linkType: 'direct' } : null;
    }

    const [rawType, rawStrength] = match[1].split('/');
    const description = (match[4] ?? '').trim();
    const strength = normalizeStrength(rawStrength);
    return {
        target,
        linkType: rawType.trim() || 'direct',
        ...(strength ? { strength } : {}),
        ...(description ? { description } : {})
    };
}

/** Read a whole stored array, dropping only entries with no target at all. */
export function parseCausalityRefs(values: unknown): CausalityRef[] {
    if (!Array.isArray(values)) return [];
    return values.map(parseCausalityRef).filter((ref): ref is CausalityRef => ref !== null);
}

/** The event name a stored link points at, for matching and lookup. */
export function causalityRefTarget(value: unknown): string {
    return parseCausalityRef(value)?.target ?? '';
}

/**
 * Turn a link around: the same link, described from the other event's side.
 *
 * Type, strength and description all belong to the link itself rather than to
 * either end, so they survive the flip unchanged. Only the target swaps.
 */
export function invertCausalityRef(value: unknown, otherEventName: string): string {
    const ref = parseCausalityRef(value);
    return serializeCausalityRef({
        target: otherEventName,
        linkType: ref?.linkType || 'direct',
        ...(ref?.strength ? { strength: ref.strength } : {}),
        ...(ref?.description ? { description: ref.description } : {})
    });
}

function stripLink(raw: string): string {
    return raw.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
}
