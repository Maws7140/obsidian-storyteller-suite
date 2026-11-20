import { describe, it, expect } from 'vitest';
import { planMigration, countUnassigned, canMigrateWithoutAsking, MigratableEntry } from '../../src/utils/TimelineMigrationPlan';

const era = (id: string, storyId?: string): MigratableEntry => ({ id, name: `Era ${id}`, ...(storyId ? { storyId } : {}) });

describe('planMigration', () => {
    it('keeps a row in the story it already names', () => {
        const plan = planMigration([era('a', 'story-1')], 'story-2');
        expect(plan.assigned).toEqual([{ entry: era('a', 'story-1'), storyId: 'story-1' }]);
        expect(plan.unassignable).toHaveLength(0);
    });

    it('adopts an unlabelled row into the fallback story', () => {
        const plan = planMigration([era('a')], 'story-2');
        expect(plan.assigned[0].storyId).toBe('story-2');
    });

    it('leaves a row alone when there is no story to file it into', () => {
        const plan = planMigration([era('a')], undefined);
        expect(plan.assigned).toHaveLength(0);
        expect(plan.unassignable).toEqual([era('a')]);
    });

    it('still files labelled rows when the fallback is missing', () => {
        const plan = planMigration([era('a', 'story-1'), era('b')], undefined);
        expect(plan.assigned.map(item => item.entry.id)).toEqual(['a']);
        expect(plan.unassignable.map(entry => entry.id)).toEqual(['b']);
    });

    it('handles an absent list', () => {
        const plan = planMigration(undefined, 'story-1');
        expect(plan.assigned).toHaveLength(0);
        expect(plan.unassignable).toHaveLength(0);
    });

    it('never drops a row: every entry lands in exactly one bucket', () => {
        const entries = [era('a', 'story-1'), era('b'), era('c', 'story-2'), era('d')];
        const plan = planMigration(entries, undefined);
        expect(plan.assigned.length + plan.unassignable.length).toBe(entries.length);
    });
});

describe('countUnassigned', () => {
    it('counts rows with no story across every list', () => {
        expect(countUnassigned([era('a'), era('b', 's1')], [era('c')], undefined)).toBe(2);
    });

    it('is zero once everything is labelled', () => {
        expect(countUnassigned([era('a', 's1')], [era('b', 's2')])).toBe(0);
    });
});

describe('canMigrateWithoutAsking', () => {
    it('runs unprompted for a single story', () => {
        expect(canMigrateWithoutAsking(1)).toBe(true);
    });

    it('asks when there is more than one story to choose between', () => {
        expect(canMigrateWithoutAsking(2)).toBe(false);
    });

    it('does nothing when there are no stories at all', () => {
        expect(canMigrateWithoutAsking(0)).toBe(false);
    });
});
