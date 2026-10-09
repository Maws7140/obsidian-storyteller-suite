/*
 * Partylog session bridge tests: tags replayed into a campaign session, and session header,
 * end, interlude and scene blocks placed inside a log string.
 */
import { describe, expect, it } from 'vitest';
import type { CampaignSession } from '../../src/types';
import {
    advancementLinesForSession,
    appendInterludeBlock,
    appendLogLines,
    applyPartylogTagsToSession,
    lastSceneContext,
    nextSceneHeaderLine,
    parseLogLines,
    partylogStateFromSession,
    sceneIdsInLog,
    sessionEndFromLines,
    upsertSessionEndBlock,
    upsertSessionHeaderBlock,
} from '../../src/campaign/PartylogSessionBridge';
import { parsePartylogLog, parseTag, type Tag } from '../../src/campaign/partylog';
import { FELLOWSHIP_SESSION_01 } from './fixtures/fellowship-sessions';

function tags(...texts: string[]): Tag[] {
    return texts.map(text => {
        const tag = parseTag(text);
        if (!tag) throw new Error(`not a tag: ${text}`);
        return tag;
    });
}

function session(overrides: Partial<CampaignSession> = {}): CampaignSession {
    return { name: 'Session 7', storyId: 'story-1', sessionNumber: 7, ...overrides };
}

const GROUPS = [
    { id: 'g-watch', name: 'City Watch' },
    { id: 'g-thieves', name: 'Thieves Guild' },
];

describe('applyPartylogTagsToSession: party HP and conditions', () => {
    it('updates HP and conditions of a party member that already has a record', () => {
        const s = session({
            partyCharacterNames: ['Mira'],
            partyState: [{ characterId: 'c-mira', characterName: 'Mira', currentHp: 20, maxHp: 30 }],
        });
        const result = applyPartylogTagsToSession(s, tags('[PC:Mira|HP-5|+poisoned]'));
        expect(result.changed).toBe(true);
        expect(s.partyState?.[0]).toMatchObject({ currentHp: 15, maxHp: 30, conditions: ['poisoned'] });
        expect(result.summary).toContain('HP Mira 15/30');
    });

    it('creates a party record when the tag gives both current and max HP', () => {
        const s = session({ partyCharacterNames: ['Kael'] });
        applyPartylogTagsToSession(s, tags('[PC:Kael|HP 12/20]'));
        expect(s.partyState).toEqual([{ characterId: '', characterName: 'Kael', currentHp: 12, maxHp: 20 }]);
    });

    it('clamps HP to the range 0..max and removes a condition with a minus tag', () => {
        const s = session({
            partyState: [{ characterId: 'c', characterName: 'Mira', currentHp: 4, maxHp: 30, conditions: ['wounded'] }],
        });
        applyPartylogTagsToSession(s, tags('[PC:Mira|HP-50|-wounded]'));
        expect(s.partyState?.[0].currentHp).toBe(0);
        expect(s.partyState?.[0].conditions).toBeUndefined();
    });

    it('matches PC names case-insensitively and keeps the session spelling', () => {
        const s = session({
            partyState: [{ characterId: 'c', characterName: 'Mira', currentHp: 10, maxHp: 10 }],
        });
        applyPartylogTagsToSession(s, tags('[PC:mira|HP-2]'));
        expect(s.partyState).toHaveLength(1);
        expect(s.partyState?.[0]).toMatchObject({ characterName: 'Mira', currentHp: 8 });
    });

    it('does not create a record when no maximum HP is known', () => {
        const s = session();
        const result = applyPartylogTagsToSession(s, tags('[PC:Sam|HP-3]'));
        expect(s.partyState).toBeUndefined();
        expect(result.summary.join(' ')).toMatch(/no max HP/);
    });

    it('reports no change when a tag restates the current values', () => {
        const s = session({
            partyState: [{ characterId: 'c', characterName: 'Mira', currentHp: 20, maxHp: 30 }],
        });
        const result = applyPartylogTagsToSession(s, tags('[PC:Mira|HP 20/30]'));
        expect(result.changed).toBe(false);
        expect(result.summary).toEqual([]);
    });
});

describe('applyPartylogTagsToSession: party resources', () => {
    it('applies deltas and text transitions, matching existing keys case-insensitively', () => {
        const s = session({ partyResources: { Gold: 150, Rations: 10, Wagon: 'intact' } });
        applyPartylogTagsToSession(s, tags('[Party:Gold-30]', '[Party:gold-5]', '[Party:Rations-3]', '[Party:Wagon:intact->damaged]'));
        expect(s.partyResources).toEqual({ Gold: 115, Rations: 7, Wagon: 'damaged' });
    });

    it('creates a numeric resource that did not exist before', () => {
        const s = session({ partyResources: {} });
        applyPartylogTagsToSession(s, tags('[Party:Gold 40]'));
        expect(s.partyResources).toEqual({ Gold: 40 });
    });
});

describe('applyPartylogTagsToSession: loot', () => {
    it('adds stash loot with a quantity', () => {
        const s = session();
        applyPartylogTagsToSession(s, tags('[Loot: Potion of Healing x2]'));
        expect(s.loot).toEqual([{ name: 'Potion of Healing', qty: 2 }]);
    });

    it('assigns stash loot to a character and moves the units with it', () => {
        const s = session({
            partyCharacterNames: ['Mira'],
            loot: [{ name: 'Silver Ring', qty: 1 }],
        });
        applyPartylogTagsToSession(s, tags('[Loot: Silver Ring|to:Mira]'));
        expect(s.loot).toEqual([{ name: 'Silver Ring', qty: 1, assignedTo: 'Mira' }]);
    });

    it('keeps the unit count when a whole stash line is claimed by a character', () => {
        const s = session({
            partyCharacterNames: ['Mira'],
            loot: [{ name: 'Arrow', qty: 3 }],
        });
        applyPartylogTagsToSession(s, tags('[PC:Mira|+Arrow]'));
        const total = (s.loot ?? []).reduce((sum, item) => sum + (item.qty ?? 1), 0);
        expect(total).toBe(3);
        expect(s.loot?.find(item => item.assignedTo === 'Mira')).toMatchObject({ name: 'Arrow', qty: 3 });
        expect(s.loot?.find(item => !item.assignedTo)).toBeUndefined();
    });

    it('removes stash loot with a minus tag', () => {
        const s = session({ loot: [{ name: 'Rope', qty: 2 }] });
        applyPartylogTagsToSession(s, tags('[Loot: -Rope x2]'));
        expect(s.loot ?? []).toEqual([]);
    });
});

describe('applyPartylogTagsToSession: factions', () => {
    it('changes the standing of an existing faction and adds a new one with tier and standing', () => {
        const s = session({
            groupStandings: [{ groupId: 'g-watch', groupName: 'City Watch', value: 0, standing: 'neutral' }],
        });
        const ctx = { groups: GROUPS };
        applyPartylogTagsToSession(s, tags('[Faction:City Watch|standing:neutral->suspicious]'), ctx);
        expect(s.groupStandings?.[0]).toMatchObject({ groupId: 'g-watch', standing: 'suspicious' });

        applyPartylogTagsToSession(s, tags('[Faction:Thieves Guild|tier:3|standing:allied]'), ctx);
        const thieves = s.groupStandings?.find(entry => entry.groupId === 'g-thieves');
        expect(thieves).toMatchObject({ groupName: 'Thieves Guild', tier: 3, standing: 'allied', relationshipType: 'allied' });
    });

    it('adds and removes status notes and clears a matching standing', () => {
        const s = session({
            groupStandings: [
                { groupId: 'g-watch', groupName: 'City Watch', value: 0 },
                { groupId: 'g-thieves', groupName: 'Thieves Guild', value: 0, standing: 'allied' },
            ],
        });
        const ctx = { groups: GROUPS };
        applyPartylogTagsToSession(s, tags('[Faction:City Watch|+owes us a debt]'), ctx);
        expect(s.groupStandings?.[0].statusNotes).toEqual(['owes us a debt']);

        applyPartylogTagsToSession(s, tags('[Faction:Thieves Guild|-allied]'), ctx);
        expect(s.groupStandings?.[1].standing).toBeUndefined();

        applyPartylogTagsToSession(s, tags('[Faction:City Watch|-owes us a debt]'), ctx);
        expect(s.groupStandings?.[0].statusNotes).toBeUndefined();
    });
});

describe('applyPartylogTagsToSession: progress trackers', () => {
    it('advances clocks, counts timers down and creates tracks', () => {
        const s = session({
            clocks: [
                { id: 'c1', name: 'Ritual', current: 2, segments: 6, kind: 'clock' },
                { id: 't1', name: 'Dawn', current: 3, segments: 3, kind: 'timer' },
            ],
        });
        applyPartylogTagsToSession(s, tags('[Clock:Ritual +2]', '[Timer:Dawn -1]', '[Track:Heist 3/8]'));
        expect(s.clocks?.find(c => c.name === 'Ritual')).toMatchObject({ current: 4, segments: 6, kind: 'clock' });
        expect(s.clocks?.find(c => c.name === 'Dawn')).toMatchObject({ current: 2, segments: 3, kind: 'timer' });
        expect(s.clocks?.find(c => c.name === 'Heist')).toMatchObject({ current: 3, segments: 8, kind: 'track' });
    });

    it('resizes a clock when the tag gives a new maximum, and clamps to it', () => {
        const s = session({ clocks: [{ id: 'c1', name: 'Ritual', current: 2, segments: 6, kind: 'clock' }] });
        applyPartylogTagsToSession(s, tags('[Clock:Ritual 5/12]'));
        expect(s.clocks?.[0]).toMatchObject({ current: 5, segments: 12 });
        applyPartylogTagsToSession(s, tags('[Clock:Ritual +50]'));
        expect(s.clocks?.[0].current).toBe(12);
    });

    it('creates a timer from its start value when no maximum is given', () => {
        const s = session();
        applyPartylogTagsToSession(s, tags('[Timer:Reinforcements 5]'));
        expect(s.clocks?.[0]).toMatchObject({ name: 'Reinforcements', kind: 'timer', current: 5, segments: 5 });
    });
});

describe('applyPartylogTagsToSession: threads, goals and quests', () => {
    it('changes the state of an existing thread and creates goals and quests', () => {
        const s = session({
            threads: [{ id: 'th1', name: 'Find the merchant', kind: 'thread', state: 'Open', status: 'active' }],
        });
        applyPartylogTagsToSession(s, tags(
            '[Thread:Find the merchant|Closed]',
            '[Goal:Escort the prince|Abandoned]',
            '[Quest:The Sunstone|Main]',
        ));
        expect(s.threads?.find(t => t.name === 'Find the merchant')).toMatchObject({ state: 'Closed', status: 'resolved' });
        expect(s.threads?.find(t => t.name === 'Escort the prince')).toMatchObject({ kind: 'goal', state: 'Abandoned' });
        expect(s.threads?.find(t => t.name === 'The Sunstone')).toMatchObject({ kind: 'quest', state: 'Main' });
    });
});

describe('applyPartylogTagsToSession: advancement', () => {
    it('records an advancement against the session with its gains', () => {
        const s = session({ partyCharacterNames: ['Kael'] });
        applyPartylogTagsToSession(s, tags('[Advance:Kael|Rogue 6|+Expertise]'));
        expect(s.advancements).toEqual([{ character: 'Kael', summary: 'Rogue 6, Expertise', sessionNumber: 7 }]);
    });
});

describe('partylogStateFromSession', () => {
    it('derives the same values the session holds', () => {
        const state = partylogStateFromSession(session({
            partyState: [{ characterId: 'c', characterName: 'Mira', currentHp: 9, maxHp: 12, conditions: ['bandaged'] }],
            partyResources: { Gold: 3 },
            clocks: [{ id: 'c1', name: 'Alarm', current: 1, segments: 4, kind: 'clock' }],
        }));
        expect(state.pcs.Mira.gauges.HP).toEqual({ current: 9, max: 12 });
        expect(state.pcs.Mira.labels).toEqual(['bandaged']);
        expect(state.party.gauges.Gold).toEqual({ current: 3 });
        expect(state.clocks.Alarm).toEqual({ name: 'Alarm', current: 1, max: 4 });
    });
});

describe('session header, end and interlude blocks', () => {
    const existing = [
        '## Session 6',
        '*Date: 2026-01-01 | Duration: 2h*',
        '*Players: Alex (Kael)*',
        '',
        '**Recap:** The old recap',
        'continues on a second line.',
        '',
        '### S17 *Old scene*',
        '@(Kael) Pick the lock',
        'd: Thieves Tools d20+4=16 vs DC 15 -> Success',
        '',
    ].join('\n');

    const header = {
        number: 7,
        date: '2026-02-01',
        duration: '3h',
        players: ['Alex (Kael)', 'Jordan (Sable)'],
        absent: [],
        threads: [],
        recap: 'The new recap',
        goals: 'Regroup',
    };

    it('replaces an existing header instead of duplicating it and keeps the scene log', () => {
        const out = upsertSessionHeaderBlock(existing, header);
        expect(out.match(/^## Session /gm)).toHaveLength(1);
        expect(out).toContain('## Session 7');
        expect(out).not.toContain('## Session 6');
        expect(out).not.toContain('The old recap');
        expect(out).toContain('**Recap:** The new recap');
        expect(out).toContain('### S17 *Old scene*');
        expect(out).toContain('@(Kael) Pick the lock');
    });

    it('is idempotent when the same header is written twice', () => {
        const once = upsertSessionHeaderBlock(existing, header);
        expect(upsertSessionHeaderBlock(once, header)).toBe(once);
    });

    it('writes a header that the library parses back', () => {
        const out = upsertSessionHeaderBlock(existing, header);
        const parsed = parsePartylogLog(out);
        expect(parsed.sessionHeader?.number).toBe(7);
        expect(parsed.sessionHeader?.players).toEqual(['Alex (Kael)', 'Jordan (Sable)']);
    });

    it('inserts a header above a log that has none', () => {
        const out = upsertSessionHeaderBlock('@(Kael) Hello', header);
        expect(out.startsWith('## Session 7')).toBe(true);
        expect(out).toContain('@(Kael) Hello');
    });

    it('appends an end block and replaces it on a second save', () => {
        const first = upsertSessionEndBlock(existing, sessionEndFromLines(7, [
            '[Advance:Kael|Rogue 6|+Expertise]',
            '(hook: the shipment arrives)',
        ]));
        expect(first).toContain('### End of Session 7');
        expect(first).toContain('```\n[Advance:Kael|Rogue 6|+Expertise]\n(hook: the shipment arrives)\n```');

        const second = upsertSessionEndBlock(first, sessionEndFromLines(7, ['(hook: a new hook)']));
        expect(second.match(/### End of Session/g)).toHaveLength(1);
        expect(second).toContain('(hook: a new hook)');
        expect(second).not.toContain('the shipment arrives');
        expect(second).toContain('@(Kael) Pick the lock');
    });

    it('appends an interlude block with its changes', () => {
        const out = appendInterludeBlock(existing, {
            title: 'One week, coast road',
            entries: parseLogLines(['Holt sends riders north.', '[Clock:Suspicion +1]']),
        });
        expect(out).toContain('## Interlude: One week, coast road');
        expect(out).toContain('```\nHolt sends riders north.\n[Clock:Suspicion +1]\n```');
    });
});

describe('scene headers and plain log lines', () => {
    it('chooses the next scene id with the library rules', () => {
        const log = '### S18 *Sewers*\n### S19 *Docks*\n';
        expect(nextSceneHeaderLine(log, 'next', 'Tavern')).toEqual({ id: 'S20', line: '### S20 *Tavern*' });
        expect(nextSceneHeaderLine('### S20 *Tavern*', 'flashback', 'Dinner').id).toBe('S20a');
        expect(nextSceneHeaderLine(log, 'montage', 'Training').id).toBe('S19.1');
        expect(nextSceneHeaderLine(log, 'split', 'Tail', 1).id).toMatch(/^T1-S\d+$/);
    });

    it('reads back scene ids and the latest scene context', () => {
        const log = '### S1 *Docks*\n@(Kael) hi\n### S2 *Tavern*\n### S2a *Flashback*';
        expect(sceneIdsInLog(log)).toEqual(['S1', 'S2', 'S2a']);
        expect(lastSceneContext(log)).toBe('Flashback');
    });

    it('appends plain Partylog lines without list bullets', () => {
        expect(appendLogLines('### S1 *x*', ['@(Kael) hi', '=> done'])).toBe('### S1 *x*\n@(Kael) hi\n=> done\n');
        expect(appendLogLines('', ['! Bells ring'])).toBe('! Bells ring\n');
    });
});

describe('legacy session records without characterName or group names', () => {
    const legacy = (): CampaignSession => JSON.parse(JSON.stringify(FELLOWSHIP_SESSION_01)) as CampaignSession;

    it('derives PC names from characterId wikilinks and group names from groupId wikilinks', () => {
        const state = partylogStateFromSession(legacy());
        expect(state.pcs['Frodo Baggins'].gauges.HP).toEqual({ current: 38, max: 38 });
        expect(state.pcs.Boromir.labels).toEqual(['Tempted by the Ring']);
        expect(state.factions['The Free Peoples']).toBeDefined();
        expect(state.factions['Forces of Sauron']).toBeDefined();
    });

    it('uses injected characters to turn a bare character id into its name', () => {
        const session = legacy();
        session.partyState = [{ characterId: 'char-frodo', currentHp: 38, maxHp: 38 }];
        const state = partylogStateFromSession(session, { characters: [{ id: 'char-frodo', name: 'Frodo Baggins' }] });
        expect(state.pcs['Frodo Baggins'].gauges.HP).toEqual({ current: 38, max: 38 });
    });

    it('replays a PC tag onto the legacy party record instead of creating a second one', () => {
        const session = legacy();
        const result = applyPartylogTagsToSession(session, tags('[PC:Frodo Baggins|HP 30/38]'));
        expect(result.changed).toBe(true);
        expect(session.partyState).toHaveLength(7);
        expect(session.partyState?.find(member => member.characterId === '[[Frodo Baggins]]')?.currentHp).toBe(30);
    });

    it('replays a faction tag onto the legacy standing instead of creating a second one', () => {
        const session = legacy();
        applyPartylogTagsToSession(session, tags('[Faction:The Free Peoples|tier:2]'));
        expect(session.groupStandings).toHaveLength(2);
        expect(session.groupStandings?.find(standing => standing.groupId === '[[The Free Peoples]]')?.tier).toBe(2);
    });
});

describe('end block regenerated from the session keeps every advancement of that session', () => {
    const recorded = session({
        sessionNumber: 7,
        advancements: [
            { character: 'Kael', summary: 'Rogue 6', sessionNumber: 7 },
            { character: 'Mira', summary: 'Cleric 3', sessionNumber: 6 },
            { character: 'Sable', summary: 'Ranger 2', sessionNumber: 7 },
        ],
    });

    it('writes an Advance line for each advancement of the session number, and no others', () => {
        expect(advancementLinesForSession(recorded, 7)).toEqual(['[Advance:Kael|Rogue 6]', '[Advance:Sable|Ranger 2]']);
    });

    it('keeps the advancements when the end block is saved again with no new advancement entered', () => {
        const first = upsertSessionEndBlock('@(Kael) Hi', sessionEndFromLines(7, [
            ...advancementLinesForSession(recorded, 7),
            '(hook: first hook)',
        ]));
        const second = upsertSessionEndBlock(first, sessionEndFromLines(7, [
            ...advancementLinesForSession(recorded, 7),
            '(hook: second hook)',
        ]));
        expect(second.match(/\[Advance:Kael\|Rogue 6\]/g)).toHaveLength(1);
        expect(second).toContain('[Advance:Sable|Ranger 2]');
        expect(second).toContain('(hook: second hook)');
    });
});
