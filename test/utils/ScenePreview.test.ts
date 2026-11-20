import { describe, expect, it } from 'vitest';
import { sceneMatchesFilter, scenePreview } from '../../src/utils/ScenePreview';

describe('scenePreview', () => {
    it('shows the synopsis when the scene has one (#145)', () => {
        expect(scenePreview({ synopsis: 'Frodo leaves Bag End at nightfall.', content: 'It was a cold evening.' }))
            .toEqual({ text: 'Frodo leaves Bag End at nightfall.', fromSynopsis: true });
    });

    it('falls back to the start of the content without a synopsis', () => {
        expect(scenePreview({ synopsis: '   ', content: 'It was a cold evening.' }))
            .toEqual({ text: 'It was a cold evening.', fromSynopsis: false });
    });

    it('keeps the old 80-character cut for content and allows a longer synopsis', () => {
        const long = 'word '.repeat(60);
        expect(scenePreview({ content: long })!.text.length).toBeLessThanOrEqual(81);
        expect(scenePreview({ synopsis: long })!.text.length).toBeLessThanOrEqual(161);
        expect(scenePreview({ synopsis: long })!.text.endsWith('…')).toBe(true);
    });

    it('flattens line breaks into one line', () => {
        expect(scenePreview({ synopsis: 'Line one.\n\nLine two.' })!.text).toBe('Line one. Line two.');
    });

    it('returns null when there is nothing to show', () => {
        expect(scenePreview({})).toBeNull();
        expect(scenePreview({ synopsis: 42, content: undefined })).toBeNull();
    });
});

describe('sceneMatchesFilter', () => {
    const scene = { name: 'Weathertop', synopsis: 'The Nine attack at night.', content: 'Frodo puts on the Ring.' };

    it('matches the synopsis as well as the name and content', () => {
        expect(sceneMatchesFilter(scene, 'nine')).toBe(true);
        expect(sceneMatchesFilter(scene, 'weather')).toBe(true);
        expect(sceneMatchesFilter(scene, 'ring')).toBe(true);
        expect(sceneMatchesFilter(scene, 'balrog')).toBe(false);
    });

    it('matches everything with an empty filter', () => {
        expect(sceneMatchesFilter(scene, '')).toBe(true);
    });
});
