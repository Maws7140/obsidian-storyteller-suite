import { describe, expect, it } from 'vitest';
import type { CampaignSession, Scene } from '../../src/types';
import {
    addCampaignClock,
    addCampaignThread,
    advanceCampaignClock,
    buildSessionTimelineEvent,
    cycleCampaignThread,
} from '../../src/utils/CampaignProgress';

function session(): CampaignSession {
    return {
        id: 'session-1',
        name: 'Lantern court',
        storyId: 'story-1',
        partyCharacterNames: ['Mira Vale', 'Orin Pike'],
    };
}

describe('campaign progress', () => {
    it('creates and clamps segmented clocks', () => {
        const current = session();
        const clock = addCampaignClock(current, 'Storm arrives', 6, 'clock-1');
        expect(clock).toMatchObject({ id: 'clock-1', current: 0, segments: 6 });
        advanceCampaignClock(current, 'clock-1', 20);
        expect(clock?.current).toBe(6);
        advanceCampaignClock(current, 'clock-1', -20);
        expect(clock?.current).toBe(0);
    });

    it('rejects blank progress records and normalizes clock sizes', () => {
        const current = session();
        expect(addCampaignClock(current, '  ', 4, 'clock-1')).toBeNull();
        expect(addCampaignThread(current, '  ', 'thread-1')).toBeNull();
        expect(addCampaignClock(current, 'Short', 1, 'clock-2')?.segments).toBe(2);
        expect(addCampaignClock(current, 'Long', 50, 'clock-3')?.segments).toBe(24);
        expect(addCampaignClock(current, 'Wide', 24, 'clock-4')?.segments).toBe(24);
    });

    it('cycles thread state without losing the thread', () => {
        const current = session();
        const thread = addCampaignThread(current, 'Find the second beacon', 'thread-1');
        expect(thread).toMatchObject({ state: 'Open', status: 'active', kind: 'thread' });
        expect(thread && cycleCampaignThread(thread)).toBe('Closed');
        expect(thread?.status).toBe('resolved');
        expect(thread && cycleCampaignThread(thread)).toBe('Open');
        expect(current.threads).toHaveLength(1);
    });

    it('seeds a timeline event with session and scene provenance but no invented date', () => {
        const current = session();
        const scene: Scene = {
            id: 'scene-1',
            name: 'The archive door',
            linkedLocations: ['Sunken Archive'],
        };
        const event = buildSessionTimelineEvent(current, scene);
        expect(event).toMatchObject({
            name: 'Lantern court: The archive door',
            dateTime: '',
            sessionId: 'session-1',
            sessionName: 'Lantern court',
            location: 'Sunken Archive',
            linkedScenes: ['The archive door'],
            characters: ['Mira Vale', 'Orin Pike'],
        });
    });
});
