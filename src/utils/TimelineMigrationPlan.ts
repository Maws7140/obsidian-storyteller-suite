// Deciding which story adopts each row when timeline settings become notes.
//
// A row can only become a note by being filed in a folder, and a folder is a
// story. Rows written before story scoping carry no storyId, so something has
// to choose for them. Getting that choice wrong files someone's eras into the
// wrong story, which looks exactly like losing them.

export interface MigratableEntry {
    id: string;
    name: string;
    storyId?: string;
}

export interface MigrationPlanEntry<T extends MigratableEntry> {
    entry: T;
    storyId: string;
}

export interface MigrationPlan<T extends MigratableEntry> {
    /** Rows that have an owner and can be written. */
    assigned: Array<MigrationPlanEntry<T>>;
    /** Rows with no owner and no fallback. They stay in settings and in the backup. */
    unassignable: T[];
}

/**
 * Work out where every row goes.
 *
 * A row that names its own story keeps it, even when a different fallback was
 * offered: the row knows better than the prompt does. A row with no story takes
 * the fallback. With no fallback either, the row is left alone rather than
 * guessed at, because an unmigrated row is recoverable and a misfiled one is
 * indistinguishable from a lost one.
 */
export function planMigration<T extends MigratableEntry>(
    entries: T[] | undefined,
    defaultStoryId: string | undefined
): MigrationPlan<T> {
    const assigned: Array<MigrationPlanEntry<T>> = [];
    const unassignable: T[] = [];

    for (const entry of entries || []) {
        const owner = entry.storyId || defaultStoryId;
        if (owner) assigned.push({ entry, storyId: owner });
        else unassignable.push(entry);
    }

    return { assigned, unassignable };
}

/** How many rows still have no story of their own, so the user has to be asked. */
export function countUnassigned(...lists: Array<MigratableEntry[] | undefined>): number {
    return lists.reduce<number>(
        (total, list) => total + (list || []).filter(entry => !entry.storyId).length,
        0
    );
}

/**
 * Whether the migration can run without asking anything.
 *
 * Exactly one story means every unassigned row has only one place it could go.
 * More than one, and the answer is a question. None at all, and there is nowhere
 * to put anything.
 */
export function canMigrateWithoutAsking(storyCount: number): boolean {
    return storyCount === 1;
}
