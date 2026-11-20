import { describe, expect, it } from 'vitest';
import {
    parseBranches,
    parseEncounterTable,
    serializeBranches,
    serializeEncounterTable,
} from '../../src/utils/BranchParser';
import {
    applyBranchOutcomes,
    applyEncounterResult,
    checkBranchConditions,
    encounterFlag,
    encounterLeadsToScene,
    encounterRowKey,
} from '../../src/utils/DiceRoller';
import type { CampaignSession } from '../../src/types';

function session(overrides: Partial<CampaignSession> = {}): CampaignSession {
    return { name: 'Test', storyId: 's', partyCharacterNames: [], partyItems: [], flags: [], ...overrides };
}

describe('encounter table rows', () => {
    it('parses outcome fields on rows in either key style', () => {
        const table = parseEncounterTable([
            'dice: d6',
            'trigger: manual',
            'rows:',
            '  - min: 1',
            '    max: 3',
            '    label: Quiet night',
            '    target: continue',
            '  - min: 4',
            '    max: 6',
            '    id: wolves',
            '    label: Wolves circle the camp',
            '    target: Wolf Attack',
            '    sets-flag: met-wolves',
            '    grantsItem: Wolf Pelt',
            '    tags: "[Clock:Night Terrors +1]"',
        ].join('\n'));
        expect(table?.rows[0]).toEqual({ min: 1, max: 3, label: 'Quiet night', target: 'continue' });
        expect(table?.rows[1]).toMatchObject({
            id: 'wolves',
            setsFlag: 'met-wolves',
            grantsItem: 'Wolf Pelt',
            tags: '[Clock:Night Terrors +1]',
        });
    });

    it('round-trips rows with outcomes through the serializer', () => {
        const table = {
            dice: 'd6' as const,
            trigger: 'on-enter' as const,
            rows: [{ min: 1, max: 6, id: 'ambush', label: 'Ambush', target: 'continue', clearsFlag: 'resting', groupStandingDelta: -1, changesGroupStanding: 'Bandits' }],
        };
        expect(parseEncounterTable(serializeEncounterTable(table))).toEqual(table);
    });

    it('keeps old rows without outcomes unchanged', () => {
        const text = serializeEncounterTable({ dice: 'd4', trigger: 'manual', rows: [{ min: 1, max: 4, label: 'Rain', target: 'continue' }] });
        expect(text).not.toContain('tags');
        expect(text).not.toContain('id:');
    });
});

describe('choices', () => {
    it('parses and serializes the encounter and flag fields', () => {
        const [branch] = parseBranches([
            '- label: Make camp',
            '  target: Morning',
            '  rolls-encounter: true',
            '  requires-no-flag: camp-burned',
            '  tags: "[Party:Rations-1]"',
        ].join('\n'));
        expect(branch).toMatchObject({ rollsEncounter: true, requiresNoFlag: 'camp-burned', tags: '[Party:Rations-1]' });
        expect(parseBranches(serializeBranches([branch]))[0]).toEqual(branch);
    });

    it('does not write rolls-encounter when it is off', () => {
        expect(serializeBranches([{ id: 'a', label: 'Go', target: 'Next' }])).not.toContain('rolls-encounter');
    });

    it('blocks a choice whose forbidden flag is set', () => {
        const branch = { id: 'a', label: 'Sneak past', requiresNoFlag: 'encounter:wolves' };
        expect(checkBranchConditions(branch, session()).met).toBe(true);
        const blocked = checkBranchConditions(branch, session({ flags: ['encounter:wolves'] }));
        expect(blocked.met).toBe(false);
        expect(blocked.unmet).toEqual(['Flag is set: encounter:wolves']);
    });

    it('clears a flag before setting another', () => {
        const next = applyBranchOutcomes({ id: 'a', label: 'Wake', clearsFlag: 'resting', setsFlag: 'awake' }, session({ flags: ['resting', 'x'] }));
        expect(next.flags).toEqual(['x', 'awake']);
    });
});

describe('encounter results', () => {
    it('keys rows by id, or by a slug of the label', () => {
        expect(encounterRowKey({ id: 'Wolves', label: 'ignored' })).toBe('wolves');
        expect(encounterRowKey({ label: "Wolves circle the camp!" })).toBe('wolves-circle-the-camp');
        expect(encounterRowKey({ label: '???' })).toBe('result');
        expect(encounterFlag({ label: 'A lost traveller' })).toBe('encounter:a-lost-traveller');
    });

    it('replaces the previous encounter flag and applies the row outcomes', () => {
        const before = session({ flags: ['encounter:quiet-night', 'met-bandits'], partyItems: ['Rope'] });
        const after = applyEncounterResult(
            { min: 4, max: 6, id: 'wolves', label: 'Wolves', target: 'continue', setsFlag: 'met-wolves', grantsItem: 'Wolf Pelt' },
            before,
        );
        expect(after.flags).toEqual(['met-bandits', 'encounter:wolves', 'met-wolves']);
        expect(after.partyItems).toEqual(['Rope', 'Wolf Pelt']);
        expect(before.flags).toEqual(['encounter:quiet-night', 'met-bandits']);
    });

    it('lets a choice gate on the latest encounter', () => {
        const rolled = applyEncounterResult({ min: 1, max: 1, id: 'wolves', label: 'Wolves', target: 'continue' }, session());
        const track = { id: 't', label: 'Track the wolves', requiresFlag: 'encounter:wolves' };
        expect(checkBranchConditions(track, rolled).met).toBe(true);
        const quiet = applyEncounterResult({ min: 2, max: 2, label: 'Quiet', target: 'continue' }, rolled);
        expect(checkBranchConditions(track, quiet).met).toBe(false);
    });

    it('tells scene targets apart from continue', () => {
        expect(encounterLeadsToScene({ target: 'Wolf Attack' })).toBe(true);
        expect(encounterLeadsToScene({ target: 'continue' })).toBe(false);
        expect(encounterLeadsToScene({ target: ' Continue ' })).toBe(false);
        expect(encounterLeadsToScene({ target: '' })).toBe(false);
    });
});
