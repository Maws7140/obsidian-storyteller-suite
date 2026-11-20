// Which events belong to which branch of the timeline.
//
// A fork records only the events unique to it (`linkedEvents`). Everything
// before the divergence is shared trunk that the fork inherits rather than
// copies, so deciding what a branch contains means combining the two.

/** The parts of a TimelineFork that decide membership. */
export interface ForkLike {
    id: string;
    linkedEvents?: string[];
}

/** An Event may be referenced by its stable ID or its display name. */
export type EventKey = string | readonly string[];

function eventKeys(value: EventKey): readonly string[] {
    return typeof value === 'string' ? [value] : value;
}

/** Whether a fork claims any valid identifier for an Event. */
export function isEventLinkedToFork(eventKey: EventKey, fork: ForkLike): boolean {
    const linked = fork.linkedEvents || [];
    return eventKeys(eventKey).some(key => linked.includes(key));
}

/** The parts of a TimelineFork that decide lane order. */
export interface ForkParentLike {
    id: string;
    parentTimelineId?: string;
}

/**
 * Forks sorted so a branch is always listed after the branch it left.
 *
 * Compare mode stacks lanes in this order and draws each branch curving away
 * from its parent. A branch placed above its own parent has to reach backwards
 * up the screen, which reads as the parent having come from the child.
 *
 * A parent that is not in the list, or a chain that loops, still gets its
 * branch placed: the entry is a branch somebody made, and dropping it over a
 * bad link would hide their work rather than report it.
 */
export function orderForksByParent<T extends ForkParentLike>(forks: T[]): T[] {
    const known = new Set(forks.map(fork => fork.id));
    const children = new Map<string, T[]>();
    forks.forEach(fork => {
        const parent = fork.parentTimelineId && known.has(fork.parentTimelineId) ? fork.parentTimelineId : ROOT;
        const siblings = children.get(parent) || [];
        siblings.push(fork);
        children.set(parent, siblings);
    });
    const ordered: T[] = [];
    const placed = new Set<string>();
    const visit = (parent: string): void => {
        (children.get(parent) || []).forEach(fork => {
            if (placed.has(fork.id)) return;
            placed.add(fork.id);
            ordered.push(fork);
            visit(fork.id);
        });
    };
    visit(ROOT);
    forks.forEach(fork => { if (!placed.has(fork.id)) ordered.push(fork); });
    return ordered;
}

/** Stands in for the trunk, which is not itself a fork. */
const ROOT = '__main__';

/** An event is on the main timeline when no fork has claimed it. */
export function isEventOnMain(eventKey: EventKey, forks: ForkLike[]): boolean {
    return !forks.some(fork => isEventLinkedToFork(eventKey, fork));
}

/**
 * Whether an event appears when viewing a single branch.
 *
 * A branch is its own events plus the trunk it grew from. Viewing a fork used
 * to show only its own events, which erased the entire shared history before
 * the divergence and left a branch looking like a handful of orphans. Compare
 * mode never had that problem, because it inherits the trunk into each fork's
 * lane; this is the same rule applied to the single-branch view.
 *
 * @param divergence parsed divergence time, NaN when the fork's date is
 *   missing or unparseable. An unreadable date keeps the whole trunk visible:
 *   showing too much history is recoverable, silently hiding a story's past is
 *   not.
 */
export function isEventInFork(
    eventKey: EventKey,
    eventStart: number,
    fork: ForkLike,
    divergence: number,
    allForks: ForkLike[]
): boolean {
    if (isEventLinkedToFork(eventKey, fork)) return true;
    // Another branch's exclusive event never bleeds into this one.
    if (!isEventOnMain(eventKey, allForks)) return false;
    if (!Number.isFinite(divergence)) return true;
    // An undated trunk event cannot be placed relative to the divergence;
    // keep it rather than drop it for want of a date.
    if (!Number.isFinite(eventStart)) return true;
    return eventStart <= divergence;
}
