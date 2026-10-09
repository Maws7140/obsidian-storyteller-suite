import type { CampaignClock, CampaignSession, CampaignThread, Event, Scene } from '../types';

function cleanName(value: string): string {
    return value.trim();
}

function makeId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addCampaignClock(
    session: CampaignSession,
    name: string,
    segments = 4,
    id = makeId('clock'),
): CampaignClock | null {
    const cleaned = cleanName(name);
    if (!cleaned) return null;
    const clock: CampaignClock = {
        id,
        name: cleaned,
        current: 0,
        segments: Math.max(2, Math.min(12, Math.round(segments) || 4)),
    };
    session.clocks = [...(session.clocks ?? []), clock];
    return clock;
}

export function advanceCampaignClock(session: CampaignSession, id: string, delta: number): CampaignClock | null {
    const clock = session.clocks?.find(candidate => candidate.id === id);
    if (!clock) return null;
    clock.current = Math.max(0, Math.min(clock.segments, clock.current + Math.trunc(delta)));
    return clock;
}

export function addCampaignThread(
    session: CampaignSession,
    name: string,
    id = makeId('thread'),
): CampaignThread | null {
    const cleaned = cleanName(name);
    if (!cleaned) return null;
    const thread: CampaignThread = { id, name: cleaned, status: 'active' };
    session.threads = [...(session.threads ?? []), thread];
    return thread;
}

export function cycleCampaignThread(thread: CampaignThread): CampaignThread['status'] {
    thread.status = thread.status === 'active'
        ? 'resolved'
        : thread.status === 'resolved'
            ? 'abandoned'
            : 'active';
    return thread.status;
}

/**
 * Seed a normal Event modal from the live session without inventing a date.
 * The user chooses a date in the story's own calendar before saving.
 */
export function buildSessionTimelineEvent(session: CampaignSession, scene: Scene | null): Event {
    const sceneName = scene?.name ?? session.currentSceneName;
    const location = scene?.linkedLocations?.[0];
    return {
        name: sceneName ? `${session.name}: ${sceneName}` : session.name,
        dateTime: '',
        description: `Recorded during campaign session "${session.name}".`,
        outcome: '',
        status: 'Occurred',
        characters: [...(session.partyCharacterNames ?? [])],
        location,
        linkedScenes: sceneName ? [sceneName] : [],
        sessionId: session.id,
        sessionName: session.name,
        images: [],
        customFields: {},
        groups: [],
        dependencies: [],
        dependencyNames: [],
        isMilestone: false,
        progress: 0,
    };
}
