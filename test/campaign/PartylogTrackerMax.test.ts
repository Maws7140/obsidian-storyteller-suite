/*
 * Tracker maximums from the Partylog must survive import: a timer written as N/M keeps M, and a
 * zero maximum is not a size, so the existing track keeps its own.
 */
import { describe, expect, it } from 'vitest';
import { applyPartylogTagsToSession, parseLogLines } from '../../src/campaign/PartylogSessionBridge';
import { entryTags } from '../../src/campaign/partylog';
import { buildPartylogExport } from '../../src/campaign/PartylogExport';
import { FELLOWSHIP_SESSION_02 } from './fixtures/fellowship-sessions';

function tagsOf(...lines: string[]) {
    return parseLogLines(lines).flatMap(entryTags);
}

function sessionWith(clocks: unknown[]): any {
    return { name: 'S', storyId: 'story-x', partyState: [], partyResources: {}, clocks, threads: [] };
}

describe('timer maximums on export', () => {
    it('writes the maximum with the current value, as N/M', () => {
        const md = buildPartylogExport({ title: 'Fellowship', sessions: [{ session: FELLOWSHIP_SESSION_02 as any, logBody: '' }] }).markdown;
        expect(md).toContain('[Timer:Torches 2/6]');
        expect(md).not.toContain('[Timer:Torches 2]');
    });
});

describe('timer maximums on import', () => {
    it('creates a new timer with the maximum written as N/M', () => {
        const session = sessionWith([]);
        applyPartylogTagsToSession(session, tagsOf('[Timer:Torches 2/6]'), {});
        expect(session.clocks).toHaveLength(1);
        expect(session.clocks[0]).toMatchObject({ name: 'Torches', kind: 'timer', current: 2, segments: 6 });
    });

    it('updates an existing timer maximum from N/M', () => {
        const session = sessionWith([{ id: 't', name: 'Torches', kind: 'timer', current: 6, segments: 6 }]);
        applyPartylogTagsToSession(session, tagsOf('[Timer:Torches 2/4]'), {});
        expect(session.clocks[0]).toMatchObject({ current: 2, segments: 4 });
    });
});

describe('zero tracker maximum', () => {
    it('keeps the current maximum and clamps the value to it', () => {
        const session = sessionWith([{ id: 'r', name: 'Road', kind: 'track', current: 0, segments: 3 }]);
        applyPartylogTagsToSession(session, tagsOf('[Track:Road 3/0]'), {});
        expect(session.clocks[0]).toMatchObject({ current: 3, segments: 3 });
    });

    it('does not reset the track to the default size', () => {
        const session = sessionWith([{ id: 'r', name: 'Road', kind: 'track', current: 1, segments: 6 }]);
        applyPartylogTagsToSession(session, tagsOf('[Track:Road 1/0]'), {});
        expect(session.clocks[0]).toMatchObject({ current: 1, segments: 6 });
    });
});
