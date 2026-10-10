/*
 * Saving the session header must keep the scene range and the **Notes:** paragraph already in the
 * log, since the view's header form does not edit them.
 */
import { describe, expect, it } from 'vitest';
import { upsertSessionHeaderBlock } from '../../src/campaign/PartylogSessionBridge';
import { parsePartylogLog } from '../../src/campaign/partylog';
import type { SessionHeader } from '../../src/campaign/partylog';

const LOG = [
    '## Session 2',
    '*Date: 2026-10-08 | Scenes: S1-S4*',
    '*Players: Kael, Mira*',
    '',
    '**Notes:** Bring the rope back to Frodo.',
    '',
    '### S1 *Bree*',
    '! Rain.',
    '',
].join('\n');

function viewHeader(overrides: Partial<SessionHeader> = {}): SessionHeader {
    return { number: 2, date: '2026-10-08', players: ['Kael', 'Mira'], absent: [], threads: [], ...overrides };
}

describe('saving the session header keeps scenes and notes', () => {
    it('keeps the scene range on the info line', () => {
        const out = upsertSessionHeaderBlock(LOG, viewHeader());
        expect(parsePartylogLog(out).sessionHeader?.scenes).toEqual({ from: 'S1', to: 'S4' });
        expect(out).toContain('Scenes: S1-S4');
    });

    it('keeps the Notes paragraph and the scene that follows it', () => {
        const out = upsertSessionHeaderBlock(LOG, viewHeader());
        expect(parsePartylogLog(out).sessionHeader?.notes).toBe('Bring the rope back to Frodo.');
        expect(out).toContain('**Notes:** Bring the rope back to Frodo.');
        expect(out).toContain('### S1 *Bree*\n! Rain.');
    });

    it('lets an incoming scene range and notes replace the stored ones', () => {
        const out = upsertSessionHeaderBlock(LOG, viewHeader({ scenes: { from: 'S5', to: 'S7' }, notes: 'New note.' }));
        const parsed = parsePartylogLog(out).sessionHeader;
        expect(parsed?.scenes).toEqual({ from: 'S5', to: 'S7' });
        expect(parsed?.notes).toBe('New note.');
        expect(out).not.toContain('Bring the rope back');
    });

    it('still inserts a header into a log that has none', () => {
        const out = upsertSessionHeaderBlock('### S1 *Bree*\n! Rain.\n', viewHeader());
        expect(out.match(/## Session 2/g)).toHaveLength(1);
        expect(out).toContain('### S1 *Bree*');
    });
});
