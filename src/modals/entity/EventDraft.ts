import type { Event } from '../../types';

function cloneValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(entry => cloneValue(entry));
    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            output[key] = cloneValue(entry);
        }
        return output;
    }
    return value;
}

/** A modal draft must never share mutable arrays/objects with its caller. */
export function cloneEventDraft(event: Event): Event {
    return cloneValue(event) as Event;
}

export function changedMemberships(
    before: Iterable<string>,
    after: Iterable<string>
): { added: string[]; removed: string[] } {
    const previous = new Set(Array.from(before).filter(Boolean));
    const next = new Set(Array.from(after).filter(Boolean));
    return {
        added: Array.from(next).filter(value => !previous.has(value)),
        removed: Array.from(previous).filter(value => !next.has(value)),
    };
}
