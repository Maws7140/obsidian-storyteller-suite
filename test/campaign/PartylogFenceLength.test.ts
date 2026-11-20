/*
 * A body line that is exactly a code fence must not close the fenced end or interlude block.
 */
import { describe, expect, it } from 'vitest';
import {
    previousSessionEndChangeLines,
    sessionEndFromLines,
    upsertSessionEndBlock,
} from '../../src/campaign/PartylogSessionBridge';
import { formatInterlude } from '../../src/campaign/partylog';

const BODY = ['(note: first)', 'Plain prose here', '```', 'after fence line'];

function count(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

describe('end block whose body contains a fence line', () => {
    it('keeps every body line when the block is saved again', () => {
        let log = '## Session 1\n\n- Entered *Bree*\n';
        log = upsertSessionEndBlock(log, sessionEndFromLines(1, BODY));
        const again = upsertSessionEndBlock(log, sessionEndFromLines(1, previousSessionEndChangeLines(log)));
        expect(count(again, 'Plain prose here')).toBe(1);
        expect(count(again, 'after fence line')).toBe(1);
        expect(count(again, '### End of Session 1')).toBe(1);
    });

    it('keeps the fence line itself among the change lines', () => {
        let log = '## Session 1\n\n- Entered *Bree*\n';
        log = upsertSessionEndBlock(log, sessionEndFromLines(1, BODY));
        expect(previousSessionEndChangeLines(log)).toContain('```');
    });

    it('replaces the block rather than appending a second one', () => {
        let log = '## Session 1\n\n- Entered *Bree*\n';
        log = upsertSessionEndBlock(log, sessionEndFromLines(1, BODY));
        log = upsertSessionEndBlock(log, sessionEndFromLines(1, [...BODY, '(note: second)']));
        expect(count(log, '### End of Session 1')).toBe(1);
        expect(count(log, '(note: first)')).toBe(1);
        expect(count(log, '(note: second)')).toBe(1);
    });

    it('writes a fence longer than any backtick run in the body', () => {
        const log = upsertSessionEndBlock('## Session 1\n', sessionEndFromLines(1, BODY));
        expect(log).toContain('````');
        expect(log).toContain('````\n(note: first)\nPlain prose here\n```\nafter fence line\n````');
    });
});

describe('interlude block whose body contains a fence line', () => {
    it('uses a fence longer than the body backtick run', () => {
        const text = formatInterlude({ title: 'Camp', entries: sessionEndFromLines(1, BODY).entries }, 'digital');
        expect(text.split('\n')[0]).toBe('## Interlude: Camp');
        expect(text.split('\n').at(-1)).toBe('````');
        expect(text).toContain('after fence line');
    });
});
