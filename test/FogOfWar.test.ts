import { describe, expect, it } from 'vitest';
import { makeMistField } from '../src/campaign/FogOfWar';

describe('makeMistField', () => {
    it('stays between 0 and 1 and has both thick and thin mist', () => {
        const field = makeMistField(64, 3);
        let min = 1, max = 0;
        for (const v of field) { min = Math.min(min, v); max = Math.max(max, v); }
        expect(min).toBeGreaterThanOrEqual(0);
        expect(max).toBeLessThanOrEqual(1);
        expect(max).toBeGreaterThan(0.8);
        expect(min).toBeLessThan(0.2);
    });

    it('is the same for the same seed, so the fog does not jump between redraws', () => {
        expect(Array.from(makeMistField(32, 5))).toEqual(Array.from(makeMistField(32, 5)));
    });
});
