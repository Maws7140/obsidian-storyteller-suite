import { describe, it, expect } from 'vitest';
import { isEventInFork, isEventLinkedToFork, isEventOnMain, orderForksByParent, ForkLike } from '../../src/utils/ForkVisibility';
import type { EventKey } from '../../src/utils/ForkVisibility';

const DAY = 24 * 60 * 60 * 1000;
const DIVERGENCE = 100 * DAY;

const rebellion: ForkLike = { id: 'f1', linkedEvents: ['The king lives'] };
const invasion: ForkLike = { id: 'f2', linkedEvents: ['The fleet arrives'] };
const forks = [rebellion, invasion];

const inFork = (key: EventKey, start: number, fork = rebellion, divergence = DIVERGENCE) =>
    isEventInFork(key, start, fork, divergence, forks);

describe('isEventOnMain', () => {
    it('keeps events no fork has claimed', () => {
        expect(isEventOnMain('The coronation', forks)).toBe(true);
    });

    it('drops events claimed by a fork', () => {
        expect(isEventOnMain('The king lives', forks)).toBe(false);
    });

    it('keeps everything when there are no forks', () => {
        expect(isEventOnMain('The king lives', [])).toBe(true);
    });

    it('recognizes a fork name reference when the event also has an ID', () => {
        expect(isEventLinkedToFork(['event-123', 'The king lives'], rebellion)).toBe(true);
        expect(isEventOnMain(['event-123', 'The king lives'], forks)).toBe(false);
    });
});

describe('isEventInFork', () => {
    it('includes the fork own events regardless of date', () => {
        expect(inFork('The king lives', DIVERGENCE + 500 * DAY)).toBe(true);
    });

    it('matches fork membership through either the event ID or name', () => {
        expect(inFork(['event-123', 'The king lives'], DIVERGENCE + 500 * DAY)).toBe(true);
    });

    it('inherits shared history from before the divergence', () => {
        expect(inFork('The coronation', DIVERGENCE - 10 * DAY)).toBe(true);
    });

    it('includes an event exactly at the divergence', () => {
        expect(inFork('The betrayal', DIVERGENCE)).toBe(true);
    });

    it('excludes trunk events after the branch left it', () => {
        expect(inFork('The king dies', DIVERGENCE + 10 * DAY)).toBe(false);
    });

    it('never shows another branch exclusive events', () => {
        expect(inFork('The fleet arrives', DIVERGENCE - 50 * DAY)).toBe(false);
    });

    it('keeps the whole trunk when the divergence date cannot be read', () => {
        expect(inFork('The king dies', DIVERGENCE + 10 * DAY, rebellion, NaN)).toBe(true);
    });

    it('keeps an undated trunk event rather than dropping it', () => {
        expect(inFork('An undated rumour', NaN)).toBe(true);
    });

    it('inherits everything when the fork has no events of its own yet', () => {
        const fresh: ForkLike = { id: 'f3' };
        expect(isEventInFork('The coronation', DIVERGENCE - DAY, fresh, DIVERGENCE, [fresh])).toBe(true);
    });
});

describe('orderForksByParent', () => {
    const ids = (forks: Array<{ id: string }>) => forks.map(fork => fork.id);

    it('places a branch after the branch it left', () => {
        const ordered = orderForksByParent([
            { id: 'grandchild', parentTimelineId: 'child' },
            { id: 'child', parentTimelineId: 'trunk-branch' },
            { id: 'trunk-branch' }
        ]);

        expect(ids(ordered)).toEqual(['trunk-branch', 'child', 'grandchild']);
    });

    it('keeps siblings in the order they were made', () => {
        const ordered = orderForksByParent([
            { id: 'first', parentTimelineId: 'trunk-branch' },
            { id: 'trunk-branch' },
            { id: 'second', parentTimelineId: 'trunk-branch' }
        ]);

        expect(ids(ordered)).toEqual(['trunk-branch', 'first', 'second']);
    });

    it('keeps a branch whose parent was deleted', () => {
        const ordered = orderForksByParent([{ id: 'orphan', parentTimelineId: 'gone' }]);

        expect(ids(ordered)).toEqual(['orphan']);
    });

    it('keeps branches whose parent links form a loop', () => {
        const ordered = orderForksByParent([
            { id: 'a', parentTimelineId: 'b' },
            { id: 'b', parentTimelineId: 'a' }
        ]);

        expect(ids(ordered).sort()).toEqual(['a', 'b']);
    });
});
