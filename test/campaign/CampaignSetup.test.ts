import { describe, expect, it, vi } from 'vitest';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import {
    applyCampaignSetup,
    campaignTrackTag,
    campaignSetupProblem,
    defaultCampaignSetup,
    knownCampaigns,
} from '../../src/campaign/CampaignSetup';

const fork = (id: string, name: string) => ({ id, name, divergenceEvent: '', divergenceDate: '3018-09-23', status: 'exploring' as const, created: '' });

describe('known campaigns', () => {
    const sessions = [
        { name: 'S1', storyId: 'x', campaignForkId: 'f1', inWorldDate: 'October 1, 3018', modified: '2026-10-01' },
        { name: 'S2', storyId: 'x', campaignForkId: 'f1', inWorldDate: 'January 13, 3019', timeMoves: true, modified: '2026-10-08' },
        { name: 'Other', storyId: 'x', campaignForkId: 'f2', modified: '2026-09-01' },
        { name: 'Loose', storyId: 'x' },
        { name: 'Gone', storyId: 'x', campaignForkId: 'deleted' },
    ];
    const forks = [fork('f1', 'Fellowship'), fork('f2', 'Shire')];

    it('lists each campaign once with its newest session, newest first, skipping deleted forks', () => {
        const campaigns = knownCampaigns(sessions, forks);
        expect(campaigns.map(c => [c.kind, c.name, c.latest.name])).toEqual([['fork', 'Fellowship', 'S2'], ['fork', 'Shire', 'Other']]);
    });

    it('continues the newest campaign where it left off', () => {
        expect(defaultCampaignSetup(knownCampaigns(sessions, forks), 'LOTR')).toEqual({
            recording: { kind: 'fork', forkId: 'f1' },
            startDate: 'January 13, 3019',
            timeMoves: true,
        });
    });

    it('starts a new campaign named after the story when there is none', () => {
        expect(defaultCampaignSetup([], 'LOTR')).toEqual({ recording: { kind: 'new', name: 'LOTR campaign' }, startDate: '', timeMoves: false });
    });
});

describe('campaign setup checks', () => {
    it('needs a readable start date when recording, and a name for a new campaign', () => {
        expect(campaignSetupProblem({ recording: { kind: 'new', name: 'X' }, startDate: '', timeMoves: false }, GREGORIAN_CALENDAR)).toMatch(/Set the in-world date/);
        expect(campaignSetupProblem({ recording: { kind: 'new', name: ' ' }, startDate: '3019-01-13', timeMoves: false }, GREGORIAN_CALENDAR)).toMatch(/name/);
        expect(campaignSetupProblem({ recording: { kind: 'new', name: 'X' }, startDate: 'whenever', timeMoves: false }, GREGORIAN_CALENDAR)).toMatch(/not a date/);
        expect(campaignSetupProblem({ recording: { kind: 'new', name: 'X' }, startDate: '3019-01-13', timeMoves: false }, GREGORIAN_CALENDAR)).toBeNull();
        expect(campaignSetupProblem({ recording: { kind: 'none' }, startDate: '', timeMoves: false }, GREGORIAN_CALENDAR)).toBeNull();
        expect(campaignSetupProblem({ recording: { kind: 'none' }, startDate: '', timeMoves: true }, GREGORIAN_CALENDAR)).toMatch(/Set the in-world date/);
    });
});

describe('applying the setup to a session', () => {
    it('creates the fork for a new campaign and writes the date in the calendar', async () => {
        const plugin: any = { createTimelineFork: vi.fn(async (name: string) => fork('new1', name)) };
        const session: any = { name: 'S1', storyId: 'x' };
        await applyCampaignSetup(plugin, { recording: { kind: 'new', name: 'Fellowship' }, startDate: '3019-01-13', timeMoves: true }, session, GREGORIAN_CALENDAR);
        expect(plugin.createTimelineFork).toHaveBeenCalledWith('Fellowship', '', 'January 13, 3019 CE', expect.any(String));
        expect(session).toMatchObject({ campaignForkId: 'new1', campaignForkName: 'Fellowship', inWorldDate: 'January 13, 3019 CE', timeMoves: true });
    });

    it('joins an existing fork, or records nowhere', async () => {
        const plugin: any = { getTimelineFork: (id: string) => (id === 'f1' ? fork('f1', 'Fellowship') : undefined) };
        const joined: any = { name: 'S3', storyId: 'x' };
        await applyCampaignSetup(plugin, { recording: { kind: 'fork', forkId: 'f1' }, startDate: '3019-01-15', timeMoves: false }, joined, GREGORIAN_CALENDAR);
        expect(joined).toMatchObject({ campaignForkId: 'f1', campaignForkName: 'Fellowship', inWorldDate: 'January 15, 3019 CE' });
        expect(joined.timeMoves).toBeUndefined();
        const loose: any = { name: 'S4', storyId: 'x', campaignForkId: 'f1' };
        await applyCampaignSetup(plugin, { recording: { kind: 'none' }, startDate: '', timeMoves: false }, loose, GREGORIAN_CALENDAR);
        expect(loose.campaignForkId).toBeUndefined();
        expect(loose.inWorldDate).toBeUndefined();
    });
});

describe('campaigns on the main timeline', () => {
    it('lists track campaigns beside fork campaigns', () => {
        const sessions = [
            { name: 'T1', storyId: 'x', campaignTrackId: 't1', campaignTag: 'campaign-red-hand', modified: '2026-10-10' },
            { name: 'F1', storyId: 'x', campaignForkId: 'f1', modified: '2026-10-01' },
        ];
        const tracks = [{ id: 't1', name: 'Red Hand', type: 'custom' as const, filterCriteria: { tags: ['campaign-red-hand'] } }];
        const campaigns = knownCampaigns(sessions, [fork('f1', 'Fellowship')], tracks);
        expect(campaigns.map(c => [c.kind, c.name])).toEqual([['track', 'Red Hand'], ['fork', 'Fellowship']]);
        expect(defaultCampaignSetup(campaigns, 'X').recording).toEqual({ kind: 'track', trackId: 't1' });
    });

    it('makes a tag from the campaign name', () => {
        expect(campaignTrackTag('The Red Hand of Doom!')).toBe('campaign-the-red-hand-of-doom');
        expect(campaignTrackTag('???')).toBe('campaign-play');
    });

    it('creates a custom track that matches the campaign tag, and no fork', async () => {
        const plugin: any = { getActiveStory: () => ({ id: 'story1' }), createTimelineTrack: vi.fn(async () => {}), createTimelineFork: vi.fn() };
        const session: any = { name: 'S1', storyId: 'x' };
        await applyCampaignSetup(plugin, { recording: { kind: 'new-track', name: 'Red Hand' }, startDate: '3019-01-13', timeMoves: false }, session, GREGORIAN_CALENDAR);
        const track = plugin.createTimelineTrack.mock.calls[0][0];
        expect(track).toMatchObject({ name: 'Red Hand', type: 'custom', storyId: 'story1', filterCriteria: { tags: ['campaign-red-hand'] } });
        expect(session).toMatchObject({ campaignTrackId: track.id, campaignTag: 'campaign-red-hand' });
        expect(session.campaignForkId).toBeUndefined();
        expect(plugin.createTimelineFork).not.toHaveBeenCalled();
    });

    it('joins an existing track by its tag', async () => {
        const plugin: any = { getTimelineTrack: () => ({ id: 't1', name: 'Red Hand', type: 'custom', filterCriteria: { tags: ['campaign-red-hand'] } }) };
        const session: any = { name: 'S2', storyId: 'x', campaignForkId: 'old' };
        await applyCampaignSetup(plugin, { recording: { kind: 'track', trackId: 't1' }, startDate: '3019-01-14', timeMoves: false }, session, GREGORIAN_CALENDAR);
        expect(session).toMatchObject({ campaignTrackId: 't1', campaignTag: 'campaign-red-hand' });
        expect(session.campaignForkId).toBeUndefined();
    });
});
