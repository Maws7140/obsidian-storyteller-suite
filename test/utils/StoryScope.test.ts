import { describe, it, expect } from 'vitest';
import { scopeToStory, stampStory, mergeStoryScoped, backfillStoryIds } from '../../src/utils/StoryScope';

interface Era { id: string; name: string; storyId?: string }

const eras = (): Era[] => [
    { id: 'a', name: 'Act I', storyId: 'story-1' },
    { id: 'b', name: 'Age of Iron', storyId: 'story-2' },
    { id: 'c', name: 'Act II', storyId: 'story-1' }
];

describe('scopeToStory', () => {
    it('returns only the entries belonging to the active story', () => {
        expect(scopeToStory(eras(), 'story-1').map(e => e.id)).toEqual(['a', 'c']);
    });

    it('returns everything when no story is active, so nothing is hidden', () => {
        expect(scopeToStory(eras(), undefined)).toHaveLength(3);
    });

    it('never hands back the caller its own array to mutate', () => {
        const list = eras();
        expect(scopeToStory(list, undefined)).not.toBe(list);
    });

    it('treats a missing list as empty', () => {
        expect(scopeToStory(undefined, 'story-1')).toEqual([]);
    });
});

describe('mergeStoryScoped', () => {
    it('keeps other stories entries when one story saves its own', () => {
        const list = eras();
        const mine = scopeToStory(list, 'story-1');
        mine.pop();
        const merged = mergeStoryScoped(list, mine, 'story-1');
        expect(merged.map(e => e.id).sort()).toEqual(['a', 'b']);
    });

    it('does not lose the other story when one story deletes everything', () => {
        const merged = mergeStoryScoped(eras(), [], 'story-1');
        expect(merged.map(e => e.id)).toEqual(['b']);
    });

    it('stamps unstamped incoming entries with the active story', () => {
        const merged = mergeStoryScoped(eras(), [{ id: 'd', name: 'New' }], 'story-1');
        expect(merged.find(e => e.id === 'd')?.storyId).toBe('story-1');
    });

    it('leaves an entry already claimed by another story alone', () => {
        const merged = mergeStoryScoped([], [{ id: 'd', name: 'New', storyId: 'story-2' }], 'story-1');
        expect(merged[0].storyId).toBe('story-2');
    });

    it('replaces wholesale when no story is active, matching pre-scoping behaviour', () => {
        expect(mergeStoryScoped(eras(), [{ id: 'z', name: 'Only' }], undefined)).toEqual([{ id: 'z', name: 'Only' }]);
    });
});

describe('stampStory', () => {
    it('does not mutate the entry it is given', () => {
        const entry: Era = { id: 'a', name: 'Act I' };
        expect(stampStory(entry, 'story-1')).not.toBe(entry);
        expect(entry.storyId).toBeUndefined();
    });

    it('is a no-op without an active story', () => {
        const entry: Era = { id: 'a', name: 'Act I' };
        expect(stampStory(entry, undefined)).toBe(entry);
    });
});

describe('backfillStoryIds', () => {
    it('adopts unstamped entries and reports the change', () => {
        const list: Era[] = [{ id: 'a', name: 'Act I' }, { id: 'b', name: 'Kept', storyId: 'story-2' }];
        expect(backfillStoryIds([list], 'story-1')).toBe(true);
        expect(list[0].storyId).toBe('story-1');
        expect(list[1].storyId).toBe('story-2');
    });

    it('reports no change when everything is already stamped', () => {
        expect(backfillStoryIds([eras()], 'story-1')).toBe(false);
    });

    it('does nothing without an active story, so nothing is claimed wrongly', () => {
        const list: Era[] = [{ id: 'a', name: 'Act I' }];
        expect(backfillStoryIds([list], undefined)).toBe(false);
        expect(list[0].storyId).toBeUndefined();
    });

    it('tolerates undefined lists', () => {
        expect(backfillStoryIds([undefined, undefined], 'story-1')).toBe(false);
    });
});
