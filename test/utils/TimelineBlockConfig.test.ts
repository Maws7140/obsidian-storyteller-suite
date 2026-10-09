import { describe, it, expect } from 'vitest';
import { parseTimelineBlock } from '../../src/utils/TimelineBlockConfig';

/**
 * A fenced timeline block is written by hand, so the parser's job is as much
 * to report a typo as to read a setting. A block that renders while quietly
 * dropping the filter somebody wrote is the failure worth testing for.
 */
describe('parseTimelineBlock', () => {
    it('defaults to an ungrouped horizontal timeline', () => {
        const config = parseTimelineBlock('');

        expect(config.groupMode).toBe('none');
        expect(config.ganttMode).toBe(false);
        expect(config.orientation).toBe('horizontal');
        expect(config.errors).toEqual([]);
    });

    it('reads grouping through its plural and shorthand spellings', () => {
        expect(parseTimelineBlock('group: characters').groupMode).toBe('character');
        expect(parseTimelineBlock('group-by: magic').groupMode).toBe('magicSystem');
        expect(parseTimelineBlock('group: magic-system').groupMode).toBe('magicSystem');
    });

    it('reports an unknown grouping instead of falling back silently', () => {
        const config = parseTimelineBlock('group: vibes');

        expect(config.groupMode).toBe('none');
        expect(config.errors.join(' ')).toContain('vibes');
    });

    it('reports an unknown setting', () => {
        expect(parseTimelineBlock('colour: red').errors).toHaveLength(1);
    });

    it('reports a line that is not a setting at all', () => {
        expect(parseTimelineBlock('just some words').errors).toHaveLength(1);
    });

    it('reads comma separated filters as sets', () => {
        const config = parseTimelineBlock('characters: Sera, Kel\ntags: war');

        expect(Array.from(config.filters.characters || [])).toEqual(['Sera', 'Kel']);
        expect(Array.from(config.filters.tags || [])).toEqual(['war']);
    });

    it('leaves a filter unset when its list is empty', () => {
        expect(parseTimelineBlock('characters:   ').filters.characters).toBeUndefined();
    });

    it('reads the boolean spellings people actually write', () => {
        expect(parseTimelineBlock('gantt: yes').ganttMode).toBe(true);
        expect(parseTimelineBlock('eras: true').showEras).toBe(true);
        expect(parseTimelineBlock('eras: false').showEras).toBe(false);
        expect(parseTimelineBlock('presence: on').showPresence).toBe(true);
    });

    it('clamps a height that would swallow the note', () => {
        expect(parseTimelineBlock('height: 40').height).toBe(160);
        expect(parseTimelineBlock('height: 99999').height).toBe(2000);
        expect(parseTimelineBlock('height: 500').height).toBe(500);
    });

    it('reports a height that is not a number', () => {
        const config = parseTimelineBlock('height: tall');

        expect(config.height).toBe(380);
        expect(config.errors).toHaveLength(1);
    });

    it('ignores blank lines and comments', () => {
        const config = parseTimelineBlock('\n# the siege years\n\ngantt: true\n');

        expect(config.ganttMode).toBe(true);
        expect(config.errors).toEqual([]);
    });
});
