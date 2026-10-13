import { describe, expect, it } from 'vitest';
import { makeCloudField } from '../src/campaign/CloudFog';

describe('makeCloudField', () => {
    it('keeps density and light between 0 and 1', () => {
        const field = makeCloudField(64, 3);
        for (const arr of [field.density, field.light]) {
            for (const v of arr) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        }
    });

    it('is the same for the same seed, so the clouds do not jump between redraws', () => {
        expect(Array.from(makeCloudField(32, 5).density)).toEqual(Array.from(makeCloudField(32, 5).density));
    });

    it('has both thick cloud and thin gaps', () => {
        const { density } = makeCloudField(64, 7);
        expect(Math.max(...density)).toBeGreaterThan(0.8);
        expect(Math.min(...density)).toBeLessThan(0.2);
    });
});
