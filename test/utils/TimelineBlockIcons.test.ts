import { describe, expect, it } from 'vitest';
import { parseTimelineBlock } from '../../src/utils/TimelineBlockConfig';

describe('timeline block icons option', () => {
    it('leaves the mode unset by default so the plugin setting decides', () => {
        const config = parseTimelineBlock('group: location');
        expect(config.iconMode).toBeUndefined();
        expect(config.errors).toEqual([]);
    });

    it('reads off, icons and images', () => {
        expect(parseTimelineBlock('icons: off').iconMode).toBe('off');
        expect(parseTimelineBlock('icons: icons').iconMode).toBe('icons');
        expect(parseTimelineBlock('icons: images').iconMode).toBe('images');
    });

    it('reports an unknown mode rather than ignoring it', () => {
        const config = parseTimelineBlock('icons: pictures');
        expect(config.iconMode).toBeUndefined();
        expect(config.errors).toHaveLength(1);
        expect(config.errors[0]).toContain('pictures');
    });
});
