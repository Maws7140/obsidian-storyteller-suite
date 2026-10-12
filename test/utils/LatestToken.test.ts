import { describe, expect, it } from 'vitest';
import { LatestToken } from '../../src/utils/LatestToken';

describe('LatestToken', () => {
    it('treats only the most recently begun token as current', () => {
        const tokens = new LatestToken();
        const first = tokens.begin();
        expect(tokens.isCurrent(first)).toBe(true);
        const second = tokens.begin();
        expect(tokens.isCurrent(first)).toBe(false);
        expect(tokens.isCurrent(second)).toBe(true);
    });

    it('discards a slow earlier load that finishes after a newer one started', async () => {
        const tokens = new LatestToken();
        const applied: string[] = [];
        const load = async (name: string, delay: number) => {
            const token = tokens.begin();
            await new Promise(r => setTimeout(r, delay));
            if (!tokens.isCurrent(token)) return;
            applied.push(name);
        };
        // "A" starts first but resolves last; only "B" may be applied.
        await Promise.all([load('A', 30), load('B', 5)]);
        expect(applied).toEqual(['B']);
    });
});
