import { describe, it, expect } from 'vitest';
import { parseIconValue } from '../../src/utils/EntityIcon';
import { EMOJI_GROUPS, allCuratedEmoji } from '../../src/utils/IconEmojiCatalogue';

describe('curated emoji', () => {
    it('has at least 150 entries across the six themed groups', () => {
        expect(allCuratedEmoji().length).toBeGreaterThanOrEqual(150);
        expect(EMOJI_GROUPS.map(group => group.id)).toEqual(['fantasy', 'people', 'places', 'nature', 'objects', 'symbols']);
    });

    it('has no duplicates', () => {
        const all = allCuratedEmoji();
        expect(new Set(all).size).toBe(all.length);
    });

    it('parses every entry as an emoji icon, so a picked emoji saves and reads back', () => {
        for (const emoji of allCuratedEmoji()) {
            expect(parseIconValue(emoji), emoji).toMatchObject({ kind: 'emoji', ref: emoji });
        }
    });
});
