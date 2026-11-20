import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictNoticeBatcher } from '../../src/utils/ConflictNoticeBatcher';

describe('ConflictNoticeBatcher', () => {
    let shown: Array<[string, number]>;
    let batcher: ConflictNoticeBatcher;

    beforeEach(() => {
        vi.useFakeTimers();
        shown = [];
        batcher = new ConflictNoticeBatcher(
            (message, duration) => shown.push([message, duration]),
            { set: (fn, ms) => setTimeout(fn, ms) as unknown as number, clear: handle => clearTimeout(handle) },
            1500,
        );
    });
    afterEach(() => vi.useRealTimers());

    it('shows the usual message once for a single saved event', () => {
        batcher.report({ errors: 2, warnings: 0 });
        vi.advanceTimersByTime(1500);
        expect(shown).toEqual([['⚠️ Event saved with 2 conflict(s). Use "Detect timeline conflicts" to review.', 5000]]);
    });

    it('shows warnings-only saves with the warning message', () => {
        batcher.report({ errors: 0, warnings: 3 });
        vi.advanceTimersByTime(1500);
        expect(shown).toEqual([['⚠ Event saved with 3 warning(s)', 3000]]);
    });

    it('turns a burst of saves into one summary instead of one notice each', () => {
        for (let i = 0; i < 40; i++) {
            batcher.report({ errors: i % 2, warnings: 1 });
            vi.advanceTimersByTime(100);
        }
        expect(shown).toEqual([]);
        vi.advanceTimersByTime(1500);
        expect(shown).toHaveLength(1);
        expect(shown[0][0]).toBe('⚠️ 40 events saved with conflicts or warnings. Use "Detect timeline conflicts" to review.');
    });

    it('ignores saves without conflicts', () => {
        batcher.report({ errors: 0, warnings: 0 });
        vi.advanceTimersByTime(5000);
        expect(shown).toEqual([]);
    });

    it('starts a fresh count after showing a summary', () => {
        batcher.report({ errors: 1, warnings: 0 });
        vi.advanceTimersByTime(1500);
        batcher.report({ errors: 0, warnings: 1 });
        vi.advanceTimersByTime(1500);
        expect(shown.map(entry => entry[0])).toEqual([
            '⚠️ Event saved with 1 conflict(s). Use "Detect timeline conflicts" to review.',
            '⚠ Event saved with 1 warning(s)',
        ]);
    });
});
