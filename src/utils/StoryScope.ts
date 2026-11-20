// Story scoping for the timeline's shared settings arrays.
//
// Eras, tracks, forks, conflicts and causality links each describe a single
// story, but they live in flat arrays in data.json shared by every story in
// the vault, while entities are story-scoped through the folder resolver.
// These helpers reconcile the two.

/** Anything stored in a shared settings array that belongs to one story. */
export interface StoryScoped {
    storyId?: string;
}

/**
 * The entries belonging to one story.
 *
 * With no active story there is nothing to scope by, so the whole list comes
 * back. That is the behaviour these arrays had before scoping existed, and it
 * keeps a vault with no stories from opening to an empty timeline.
 */
export function scopeToStory<T extends StoryScoped>(list: T[] | undefined, storyId: string | undefined): T[] {
    if (!storyId) return list ? [...list] : [];
    return (list || []).filter(entry => entry.storyId === storyId);
}

/** Mark an entry as belonging to the active story, if it does not already. */
export function stampStory<T extends StoryScoped>(entry: T, storyId: string | undefined): T {
    return storyId && !entry.storyId ? { ...entry, storyId } : entry;
}

/**
 * Replace one story's slice of a shared array, keeping every other story's.
 *
 * This is the half that matters. Callers are handed a scoped list, edit it,
 * and hand it back; assigning that straight into the shared array would delete
 * every other story's entries. Merging keeps them.
 */
export function mergeStoryScoped<T extends StoryScoped>(
    list: T[] | undefined,
    next: T[],
    storyId: string | undefined
): T[] {
    const stamped = next.map(entry => stampStory(entry, storyId));
    if (!storyId) return stamped;
    const others = (list || []).filter(entry => entry.storyId !== storyId);
    return [...others, ...stamped];
}

/**
 * Adopt pre-scoping entries into a story, once.
 *
 * Entries written before scoping have no storyId and a filtered read would
 * hide all of them. Nothing records which story each was made for, so the
 * story active at upgrade time is the only honest guess. Mutates in place and
 * reports whether anything changed, so the caller knows to save.
 */
export function backfillStoryIds(lists: (StoryScoped[] | undefined)[], storyId: string | undefined): boolean {
    if (!storyId) return false;
    let changed = false;
    lists.forEach(list => {
        (list || []).forEach(entry => {
            if (!entry.storyId) { entry.storyId = storyId; changed = true; }
        });
    });
    return changed;
}
