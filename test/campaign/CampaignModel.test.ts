import { describe, expect, it } from 'vitest';
import { parseFrontmatterFromContent } from '../../src/yaml/EntitySections';
import { stringifyYaml } from 'obsidian';
import type { CampaignClock, CampaignGroupStanding, CampaignSession, CampaignThread } from '../../src/types';
import {
    addCampaignAdvancement,
    addCampaignClock,
    addCampaignInterlude,
    addCampaignLoot,
    addCampaignThread,
    advanceCampaignClock,
    applyCampaignPartyResources,
    assignCampaignLoot,
    cycleCampaignThread,
    removeCampaignLoot,
    setCampaignThreadState,
    updateCampaignFaction,
} from '../../src/utils/CampaignProgress';
import {
    applyFactionExpression,
    applyPartyResourceExpression,
    applyTrackerDelta,
    buildCampaignSessionFrontmatter,
    clampTrackerSegments,
    cycleThreadState,
    formatTrackerTag,
    isTrackerComplete,
    normalizeCampaignSessionData,
    normalizeCampaignThread,
    removePartyResource,
    relationshipTypeForStanding,
    resetTracker,
    setTrackerValue,
    standingForRelationshipType,
    threadLegacyStatus,
    threadStateOf,
} from '../../src/utils/CampaignModel';

function emptySession(): CampaignSession {
    return { id: 'session-1', name: 'Lantern court', storyId: 'story-1' };
}

function tracker(overrides: Partial<CampaignClock>): CampaignClock {
    return { id: 't', name: 'Test', current: 0, segments: 6, ...overrides };
}

describe('progress trackers', () => {
    it('fills clocks and tracks up to their segment count and clamps both ends', () => {
        const clock = tracker({ kind: 'clock', current: 4, segments: 6 });
        applyTrackerDelta(clock, 5);
        expect(clock.current).toBe(6);
        applyTrackerDelta(clock, -20);
        expect(clock.current).toBe(0);

        const track = tracker({ kind: 'track', current: 0, segments: 8 });
        applyTrackerDelta(track, 3);
        expect(track.current).toBe(3);
    });

    it('counts timers down from the start value to zero and never below it', () => {
        const timer = tracker({ kind: 'timer', current: 3, segments: 3 });
        applyTrackerDelta(timer, 1);
        expect(timer.current).toBe(2);
        expect(isTrackerComplete(timer)).toBe(false);
        applyTrackerDelta(timer, 5);
        expect(timer.current).toBe(0);
        expect(isTrackerComplete(timer)).toBe(true);
        applyTrackerDelta(timer, -10);
        expect(timer.current).toBe(3);
    });

    it('completes clocks when full and timers at zero', () => {
        expect(isTrackerComplete(tracker({ current: 6, segments: 6 }))).toBe(true);
        expect(isTrackerComplete(tracker({ current: 5, segments: 6 }))).toBe(false);
        expect(isTrackerComplete(tracker({ kind: 'timer', current: 0, segments: 4 }))).toBe(true);
    });

    it('resets each kind to its starting state', () => {
        expect(resetTracker(tracker({ kind: 'clock', current: 4, segments: 6 }))).toBe(0);
        expect(resetTracker(tracker({ kind: 'timer', current: 0, segments: 4 }))).toBe(4);
    });

    it('clamps set values and segment sizes per kind', () => {
        const clock = tracker({ current: 0, segments: 12 });
        expect(setTrackerValue(clock, 40)).toBe(12);
        expect(setTrackerValue(clock, -2)).toBe(0);
        expect(clampTrackerSegments(1)).toBe(2);
        expect(clampTrackerSegments(30)).toBe(24);
        expect(clampTrackerSegments(1, 'timer')).toBe(1);
        expect(clampTrackerSegments(10, 'track')).toBe(10);
    });

    it('formats Partylog tracker tags', () => {
        expect(formatTrackerTag(tracker({ name: 'Ritual', kind: 'clock', current: 5, segments: 12 }))).toBe('[Clock:Ritual 5/12]');
        expect(formatTrackerTag(tracker({ name: 'Heist', kind: 'track', current: 3, segments: 8 }))).toBe('[Track:Heist 3/8]');
        expect(formatTrackerTag(tracker({ name: 'Dawn', kind: 'timer', current: 3, segments: 3 }))).toBe('[Timer:Dawn 3]');
        expect(formatTrackerTag(tracker({ name: 'Legacy', current: 1, segments: 4 }))).toBe('[Clock:Legacy 1/4]');
    });

    it('creates each kind at the right starting value through the session helper', () => {
        const session = emptySession();
        const timer = addCampaignClock(session, 'Reinforcements', 5, 'timer-1', 'timer');
        const track = addCampaignClock(session, 'Heist Plan', 8, 'track-1', 'track');
        expect(timer).toMatchObject({ kind: 'timer', current: 5, segments: 5 });
        expect(track).toMatchObject({ kind: 'track', current: 0, segments: 8 });
        advanceCampaignClock(session, 'timer-1', 2);
        expect(timer?.current).toBe(3);
        advanceCampaignClock(session, 'track-1', 3);
        expect(track?.current).toBe(3);
    });
});

describe('threads, goals and quests', () => {
    it('defaults each kind to its first state and cycles through the kind list', () => {
        const session = emptySession();
        const goal = addCampaignThread(session, 'Escort the prince', 'g1', 'goal');
        const quest = addCampaignThread(session, 'The Sunstone Conspiracy', 'q1', 'quest');
        expect(goal).toMatchObject({ kind: 'goal', state: 'Active' });
        expect(quest).toMatchObject({ kind: 'quest', state: 'Main' });
        expect(cycleThreadState(goal!)).toBe('Done');
        expect(cycleThreadState(goal!)).toBe('Failed');
        expect(cycleThreadState(goal!)).toBe('Active');
        expect(cycleCampaignThread(quest!)).toBe('Side');
        expect(cycleCampaignThread(quest!)).toBe('Active');
    });

    it('accepts a custom state and mirrors it to the legacy status when it maps', () => {
        const session = emptySession();
        const thread = addCampaignThread(session, 'Missing merchant', 't1')!;
        expect(setCampaignThreadState(thread, 'Stalled')).toBe('Stalled');
        expect(thread.state).toBe('Stalled');
        expect(thread.status).toBe('active');
        expect(setCampaignThreadState(thread, 'Abandoned')).toBe('Abandoned');
        expect(thread.status).toBe('abandoned');
        expect(setCampaignThreadState(thread, '   ')).toBeNull();
        expect(thread.state).toBe('Abandoned');
        // A state outside the kind's list cycles back to the first default.
        expect(cycleThreadState(thread)).toBe('Open');
    });

    it('migrates old status values on load without losing data', () => {
        const legacy: CampaignThread = { id: 'old-1', name: 'Find the beacon', status: 'active' };
        expect(normalizeCampaignThread(legacy)).toEqual({ id: 'old-1', name: 'Find the beacon', status: 'active', kind: 'thread', state: 'Open' });
        expect(normalizeCampaignThread({ id: 'old-2', name: 'x', status: 'resolved' }).state).toBe('Closed');
        const abandoned = normalizeCampaignThread({ id: 'old-3', name: 'x', status: 'abandoned' });
        expect(abandoned.state).toBe('Abandoned');
        expect(abandoned.status).toBe('abandoned');
        // An explicit state wins over the legacy status.
        expect(threadStateOf({ id: 'n', name: 'x', status: 'active', state: 'Closed' })).toBe('Closed');
        expect(threadLegacyStatus({ id: 'n', name: 'x', kind: 'goal', state: 'Failed' })).toBe('abandoned');
    });
});

describe('party resources', () => {
    it('applies numeric deltas, sets and text transitions case-insensitively', () => {
        const resources: Record<string, number | string> = { Gold: 150, Rations: 10, Wagon: 'intact' };
        expect(applyPartyResourceExpression(resources, 'Gold-30')).toEqual({ name: 'Gold', before: 150, after: 120 });
        expect(applyPartyResourceExpression(resources, 'rations+5')).toMatchObject({ name: 'Rations', after: 15 });
        expect(applyPartyResourceExpression(resources, 'gold 200')).toMatchObject({ name: 'Gold', after: 200 });
        expect(applyPartyResourceExpression(resources, 'Wagon:intact->damaged')).toMatchObject({ before: 'intact', after: 'damaged' });
        expect(applyPartyResourceExpression(resources, 'Reputation: feared in Northport')).toMatchObject({ after: 'feared in Northport' });
        expect(resources).toEqual({ Gold: 200, Rations: 15, Wagon: 'damaged', Reputation: 'feared in Northport' });
    });

    it('rejects expressions it cannot apply and removes resources by name', () => {
        const resources: Record<string, number | string> = { Wagon: 'intact' };
        expect(applyPartyResourceExpression(resources, '')).toBeNull();
        expect(applyPartyResourceExpression(resources, 'Wagon-1')).toBeNull();
        expect(resources.Wagon).toBe('intact');
        expect(removePartyResource(resources, 'wagon')).toBe(true);
        expect(resources).toEqual({});
    });

    it('updates the session resource map through the session helper', () => {
        const session = emptySession();
        const changes = applyCampaignPartyResources(session, ['Gold 150', 'Rations 10', 'Gold-30']);
        expect(changes).toHaveLength(3);
        expect(session.partyResources).toEqual({ Gold: 120, Rations: 10 });
    });
});

describe('factions', () => {
    it('updates standing, tier and status notes', () => {
        const standing: CampaignGroupStanding = { groupName: 'City Watch', value: 0 };
        expect(applyFactionExpression(standing, 'standing:neutral->suspicious')).toBe(true);
        expect(standing.standing).toBe('suspicious');
        expect(applyFactionExpression(standing, 'tier:2')).toBe(true);
        expect(standing.tier).toBe(2);
        expect(applyFactionExpression(standing, '+owes us a debt')).toBe(true);
        expect(applyFactionExpression(standing, '+Owes us a debt')).toBe(false);
        expect(standing.statusNotes).toEqual(['owes us a debt']);
        expect(applyFactionExpression(standing, '-owes us a debt')).toBe(true);
        expect(standing.statusNotes).toBeUndefined();
    });

    it('keeps the structured relationship type in step with mappable standings', () => {
        const standing: CampaignGroupStanding = { groupName: 'Thieves Guild', value: 0, relationshipType: 'neutral' };
        applyFactionExpression(standing, 'standing:allied');
        expect(standing.relationshipType).toBe('allied');
        applyFactionExpression(standing, 'standing:suspicious');
        expect(standing.standing).toBe('suspicious');
        expect(standing.relationshipType).toBe('allied');
        applyFactionExpression(standing, 'neutral->hostile');
        expect(standing.standing).toBe('hostile');
        expect(standing.relationshipType).toBe('hostile');
        applyFactionExpression(standing, '-hostile');
        expect(standing.standing).toBeUndefined();
    });

    it('maps between free-text standing and relationship types', () => {
        expect(relationshipTypeForStanding('ally')).toBe('allied');
        expect(relationshipTypeForStanding('at war')).toBe('at-war');
        expect(relationshipTypeForStanding('suspicious')).toBeUndefined();
        expect(standingForRelationshipType('friendly')).toBe('friendly');
    });

    it('finds or creates the faction record by id or name', () => {
        const session = emptySession();
        const first = updateCampaignFaction(session, { groupId: 'g-1', groupName: 'City Watch' }, ['tier:2', 'standing:neutral']);
        const again = updateCampaignFaction(session, { groupName: 'city watch' }, ['standing:hostile']);
        expect(session.groupStandings).toHaveLength(1);
        expect(again).toBe(first);
        expect(first).toMatchObject({ groupId: 'g-1', tier: 2, standing: 'hostile', relationshipType: 'hostile' });
    });
});

describe('loot stash', () => {
    it('adds, merges, assigns and removes loot', () => {
        const session = emptySession();
        addCampaignLoot(session, 'Ancient Silver Ring');
        addCampaignLoot(session, 'ancient silver ring');
        addCampaignLoot(session, 'Potion of Healing', 2);
        expect(session.loot).toEqual([
            { name: 'Ancient Silver Ring', qty: 2 },
            { name: 'Potion of Healing', qty: 2 },
        ]);

        expect(assignCampaignLoot(session, 'Ancient Silver Ring', 'Mira')).toEqual({ name: 'Ancient Silver Ring', qty: 1, assignedTo: 'Mira' });
        expect(session.loot?.[0]).toEqual({ name: 'Ancient Silver Ring', qty: 1 });
        expect(assignCampaignLoot(session, 'Nothing Here', 'Mira')).toBeNull();

        expect(removeCampaignLoot(session, 'Potion of Healing', 1)).toBe(1);
        expect(removeCampaignLoot(session, 'Potion of Healing')).toBe(1);
        expect(removeCampaignLoot(session, 'Ancient Silver Ring', undefined, 'Mira')).toBe(1);
        expect(session.loot).toEqual([{ name: 'Ancient Silver Ring', qty: 1 }]);
    });

    it('drops the loot key once the stash is empty and rejects blank names', () => {
        const session = emptySession();
        expect(addCampaignLoot(session, '   ')).toBeNull();
        addCampaignLoot(session, 'Torch');
        removeCampaignLoot(session, 'Torch');
        expect(session.loot).toBeUndefined();
    });
});

describe('advancement and interludes', () => {
    it('records advancements and interludes, rejecting blank entries', () => {
        const session = emptySession();
        expect(addCampaignAdvancement(session, 'Kael', '')).toBeNull();
        addCampaignAdvancement(session, 'Kael', 'Rogue 6 (+Expertise)', { sessionNumber: 7 });
        expect(session.advancements).toEqual([{ character: 'Kael', summary: 'Rogue 6 (+Expertise)', sessionNumber: 7 }]);
        expect(addCampaignInterlude(session, '')).toBeNull();
        addCampaignInterlude(session, 'One week, coast road', 'Off camera.', ['Mira healed']);
        expect(session.interludes).toEqual([{ title: 'One week, coast road', summary: 'Off camera.', changes: ['Mira healed'] }]);
    });
});

describe('session frontmatter round trip', () => {
    const fullSession: CampaignSession = {
        id: 'sess-7',
        name: 'Session 7',
        storyId: 'story-1',
        currentSceneName: 'Sewer tunnels',
        partyCharacterNames: ['Kael', 'Sable', 'Mira'],
        partyItems: ['Lantern'],
        clocks: [
            { id: 'c1', name: 'Ritual', current: 5, segments: 12, kind: 'clock' },
            { id: 'c2', name: 'Heist Plan', current: 3, segments: 8, kind: 'track' },
            { id: 'c3', name: 'Dawn', current: 3, segments: 3, kind: 'timer' },
        ],
        threads: [
            { id: 't1', name: 'Find the merchant', kind: 'thread', state: 'Open', status: 'active' },
            { id: 'g1', name: 'Escort the prince', kind: 'goal', state: 'Done', status: 'resolved' },
            { id: 'q1', name: 'The Sunstone Conspiracy', kind: 'quest', state: 'Main' },
        ],
        partyResources: { Gold: 120, Rations: 10, Wagon: 'damaged', Reputation: 'feared in Northport' },
        groupStandings: [{
            groupId: 'g-watch',
            groupName: 'City Watch',
            value: 0,
            tier: 2,
            standing: 'suspicious',
            statusNotes: ['owes us a debt', 'hunting us'],
            relationshipType: 'neutral',
        }],
        loot: [
            { name: 'Ancient Silver Ring', qty: 1 },
            { name: 'Potion of Healing', qty: 2, assignedTo: 'Mira' },
        ],
        advancements: [{ character: 'Kael', summary: 'Rogue 6 (+Expertise: Thieves Tools)', sessionNumber: 7, at: '2025-11-15' }],
        sessionNumber: 7,
        date: '2025-11-15',
        duration: '3h30',
        players: ['Alex (Kael)', 'Jordan (Sable)', 'Sam (Mira)'],
        scribe: 'Jordan',
        absent: ['Sam'],
        recap: 'Infiltrated the estate.\nEscaped through the sewers.',
        goals: 'Regroup, find a healer.',
        mood: 'tense',
        hook: 'The shipment arrives in 3 days.',
        endNotes: 'Strong session.\nThe escape was tense.',
        interludes: [{ title: 'One week, coast road', summary: 'Off camera.', changes: ['Mira healed'] }],
        status: 'active',
        created: '2025-11-01T10:00:00.000Z',
        modified: '2025-11-15T20:00:00.000Z',
    };

    function writeNote(session: Record<string, unknown>): string {
        const fm = stringifyYaml(buildCampaignSessionFrontmatter(session));
        return `---\n${fm}---\n\n## Session Log\n\nThe party escaped.\n`;
    }

    it('persists every Partylog field through the real whitelist builder and reads it back', () => {
        const note = writeNote(fullSession as unknown as Record<string, unknown>);
        const loaded = normalizeCampaignSessionData(parseFrontmatterFromContent(note) as Partial<CampaignSession>);

        expect(loaded).toMatchObject({
            id: 'sess-7',
            name: 'Session 7',
            partyResources: fullSession.partyResources,
            loot: fullSession.loot,
            advancements: fullSession.advancements,
            interludes: fullSession.interludes,
            clocks: fullSession.clocks,
            groupStandings: fullSession.groupStandings,
            players: fullSession.players,
            absent: ['Sam'],
            sessionNumber: 7,
            date: '2025-11-15',
            duration: '3h30',
            scribe: 'Jordan',
            recap: fullSession.recap,
            goals: fullSession.goals,
            mood: 'tense',
            hook: fullSession.hook,
            endNotes: fullSession.endNotes,
        });
        expect(loaded.threads).toEqual([
            { id: 't1', name: 'Find the merchant', kind: 'thread', state: 'Open', status: 'active' },
            { id: 'g1', name: 'Escort the prince', kind: 'goal', state: 'Done', status: 'resolved' },
            { id: 'q1', name: 'The Sunstone Conspiracy', kind: 'quest', state: 'Main' },
        ]);
        expect(note).toContain('## Session Log');
    });

    it('keeps the body of a note free of the structured fields', () => {
        const note = writeNote(fullSession as unknown as Record<string, unknown>);
        const frontmatter = parseFrontmatterFromContent(note) ?? {};
        expect(frontmatter.recap).toBe(fullSession.recap);
        expect(note.split('## Session Log')[1]).toContain('The party escaped.');
    });

    it('loads an old-format session note with its fields unchanged', () => {
        const oldNote = [
            '---',
            'entityType: campaignSession',
            'id: sess-old',
            'name: Lantern court',
            'storyId: story-1',
            'partyCharacterNames:',
            '  - Mira Vale',
            '  - Orin Pike',
            'partyItems:',
            '  - Lantern',
            'clocks:',
            '  - id: clock-1',
            '    name: Storm arrives',
            '    current: 2',
            '    segments: 6',
            'threads:',
            '  - id: thread-1',
            '    name: Find the second beacon',
            '    status: active',
            '  - id: thread-2',
            '    name: Old debt',
            '    status: resolved',
            'status: active',
            'created: 2025-10-01T10:00:00.000Z',
            'modified: 2025-10-02T10:00:00.000Z',
            '---',
            '',
            '## Session Log',
            '',
            'Old narrative.',
            '',
        ].join('\n');

        const raw = parseFrontmatterFromContent(oldNote) as Partial<CampaignSession>;
        const loaded = normalizeCampaignSessionData(raw);

        // Untouched old fields keep their exact values.
        expect(loaded.clocks).toEqual([{ id: 'clock-1', name: 'Storm arrives', current: 2, segments: 6 }]);
        expect(loaded.partyItems).toEqual(['Lantern']);
        expect(loaded.partyCharacterNames).toEqual(['Mira Vale', 'Orin Pike']);
        expect(loaded.status).toBe('active');
        expect(loaded.created).toBe('2025-10-01T10:00:00.000Z');
        // New fields are simply absent.
        expect(loaded.partyResources).toBeUndefined();
        expect(loaded.loot).toBeUndefined();
        expect(loaded.advancements).toBeUndefined();
        expect(loaded.interludes).toBeUndefined();
        expect(loaded.sessionNumber).toBeUndefined();
        // Only threads are migrated in memory; their legacy status is preserved.
        expect(loaded.threads).toEqual([
            { id: 'thread-1', name: 'Find the second beacon', status: 'active', kind: 'thread', state: 'Open' },
            { id: 'thread-2', name: 'Old debt', status: 'resolved', kind: 'thread', state: 'Closed' },
        ]);
    });

    it('re-saves an old note without dropping any of its existing fields', () => {
        const oldFrontmatter = {
            entityType: 'campaignSession',
            id: 'sess-old',
            name: 'Lantern court',
            storyId: 'story-1',
            clocks: [{ id: 'clock-1', name: 'Storm arrives', current: 2, segments: 6 }],
            threads: [{ id: 'thread-1', name: 'Find the second beacon', status: 'active' }],
            status: 'active',
        };
        const resaved = buildCampaignSessionFrontmatter(normalizeCampaignSessionData(oldFrontmatter as Partial<CampaignSession>) as unknown as Record<string, unknown>);
        expect(resaved).toMatchObject({
            id: 'sess-old',
            clocks: [{ id: 'clock-1', name: 'Storm arrives', current: 2, segments: 6 }],
            threads: [{ id: 'thread-1', name: 'Find the second beacon', status: 'active', kind: 'thread', state: 'Open' }],
            status: 'active',
        });
    });

    it('normalizeCampaignThread does not touch unrelated fields', () => {
        const thread: CampaignThread = { id: 'x', name: 'y', status: 'resolved' };
        expect(normalizeCampaignThread(thread)).not.toBe(thread);
        expect(thread).toEqual({ id: 'x', name: 'y', status: 'resolved' });
    });
});

describe('tracker kinds on existing clocks', () => {
    it('treats a clock without kind as a clock when formatting', () => {
        const legacy: CampaignClock = { id: 'c', name: 'Old', current: 1, segments: 4 };
        expect(formatTrackerTag(legacy)).toBe('[Clock:Old 1/4]');
        expect(isTrackerComplete(legacy)).toBe(false);
    });
});
