import type {
    CampaignAdvancement,
    CampaignClock,
    CampaignGroupStanding,
    CampaignInterlude,
    CampaignLootItem,
    CampaignSession,
    CampaignThread,
    CampaignThreadKind,
    CampaignTrackerKind,
    Event,
    Scene,
} from '../types';
import {
    applyFactionExpression,
    applyPartyResourceExpressions,
    clampTrackerSegments,
    cycleThreadState,
    defaultThreadState,
    initialTrackerCurrent,
    applyTrackerDelta,
    legacyStatusForState,
    normalizeTrackerKind,
    PartyResourceChange,
    PartyResourceValue,
    setThreadState,
} from './CampaignModel';

function cleanName(value: string): string {
    return value.trim();
}

function makeId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ─── Progress trackers ───────────────────────────────────────────────────────

/**
 * Add a clock, track or timer. `segments` is the size for clocks and tracks, and the start
 * value for timers. Sizes are clamped to 2..24 (timers 1..24).
 */
export function addCampaignClock(
    session: CampaignSession,
    name: string,
    segments = 4,
    id = makeId('clock'),
    kind: CampaignTrackerKind = 'clock',
): CampaignClock | null {
    const cleaned = cleanName(name);
    if (!cleaned) return null;
    const trackerKind = normalizeTrackerKind(kind);
    const size = clampTrackerSegments(segments, trackerKind);
    const clock: CampaignClock = {
        id,
        name: cleaned,
        current: initialTrackerCurrent(trackerKind, size),
        segments: size,
        kind: trackerKind,
    };
    session.clocks = [...(session.clocks ?? []), clock];
    return clock;
}

/**
 * Advance a tracker. For clocks and tracks a positive delta fills; for timers a positive
 * delta is time elapsed and counts down. The result is clamped to 0..segments.
 */
export function advanceCampaignClock(session: CampaignSession, id: string, delta: number): CampaignClock | null {
    const clock = session.clocks?.find(candidate => candidate.id === id);
    if (!clock) return null;
    applyTrackerDelta(clock, delta);
    return clock;
}

// ─── Threads, goals and quests ───────────────────────────────────────────────

/** Add a thread, goal or quest in its kind's default state. */
export function addCampaignThread(
    session: CampaignSession,
    name: string,
    id = makeId('thread'),
    kind: CampaignThreadKind = 'thread',
): CampaignThread | null {
    const cleaned = cleanName(name);
    if (!cleaned) return null;
    const state = defaultThreadState(kind);
    const thread: CampaignThread = {
        id,
        name: cleaned,
        kind,
        state,
        // Legacy mirror so older builds still read the record as open.
        status: legacyStatusForState(state) ?? 'active',
    };
    session.threads = [...(session.threads ?? []), thread];
    return thread;
}

/** Cycle to the next default state for the thread's kind. Returns the new state. */
export function cycleCampaignThread(thread: CampaignThread): string {
    return cycleThreadState(thread);
}

/** Set a custom state (e.g. "Stalled"). Returns the state, or null when blank. */
export function setCampaignThreadState(thread: CampaignThread, state: string): string | null {
    return setThreadState(thread, state);
}

// ─── Party resources ─────────────────────────────────────────────────────────

/** Apply Partylog party expressions (`Gold-30`, `Wagon:intact->damaged`) to the session. */
export function applyCampaignPartyResources(
    session: CampaignSession,
    expressions: readonly string[],
): PartyResourceChange[] {
    session.partyResources ??= {};
    const resources: Record<string, PartyResourceValue> = session.partyResources;
    return applyPartyResourceExpressions(resources, expressions);
}

// ─── Factions ────────────────────────────────────────────────────────────────

/**
 * Find or create the standing record for a faction and apply expressions to it. Matches
 * by groupId first, then by case-insensitive name.
 */
export function updateCampaignFaction(
    session: CampaignSession,
    faction: { groupId?: string; groupName: string },
    expressions: readonly string[],
): CampaignGroupStanding {
    session.groupStandings ??= [];
    let standing = session.groupStandings.find(entry =>
        (faction.groupId && entry.groupId === faction.groupId) ||
        (entry.groupName !== undefined && sameName(entry.groupName, faction.groupName))
    );
    if (!standing) {
        standing = { groupId: faction.groupId, groupName: faction.groupName, value: 0 };
        session.groupStandings.push(standing);
    }
    for (const expression of expressions) applyFactionExpression(standing, expression);
    return standing;
}

// ─── Loot stash ──────────────────────────────────────────────────────────────

/**
 * Add loot to the stash (no `assignedTo`) or to a character's gear (with `assignedTo`).
 * Merges into an existing line with the same name and owner.
 */
export function addCampaignLoot(
    session: CampaignSession,
    name: string,
    qty = 1,
    assignedTo?: string,
): CampaignLootItem | null {
    const cleaned = cleanName(name);
    if (!cleaned) return null;
    const owner = assignedTo?.trim() || undefined;
    const amount = Math.max(1, Math.trunc(Number(qty)) || 1);
    session.loot ??= [];
    const existing = session.loot.find(item =>
        sameName(item.name, cleaned) && (item.assignedTo?.trim() || undefined) === owner
    );
    if (existing) {
        existing.qty = (existing.qty ?? 1) + amount;
        return existing;
    }
    const item: CampaignLootItem = { name: cleaned, qty: amount };
    if (owner) item.assignedTo = owner;
    session.loot.push(item);
    return item;
}

/**
 * Remove loot from the stash (no `assignedTo`) or from one character (with `assignedTo`).
 * Without `qty` the whole line is removed. Returns how many were removed.
 */
export function removeCampaignLoot(
    session: CampaignSession,
    name: string,
    qty?: number,
    assignedTo?: string,
): number {
    const owner = assignedTo?.trim() || undefined;
    const loot = session.loot ?? [];
    let remaining = qty === undefined ? Infinity : Math.max(0, Math.trunc(Number(qty)) || 0);
    let removed = 0;
    for (const item of loot) {
        if (remaining <= 0) break;
        if (!sameName(item.name, name) || (item.assignedTo?.trim() || undefined) !== owner) continue;
        const have = item.qty ?? 1;
        const take = Math.min(have, remaining);
        removed += take;
        remaining -= take;
        item.qty = have - take;
    }
    session.loot = loot.filter(item => (item.qty ?? 1) > 0);
    if (session.loot.length === 0) delete session.loot;
    return removed;
}

/**
 * Move loot from the unassigned stash to a character. Moves up to `qty` (default 1) and
 * returns the character's line, or null when the stash has none of it.
 */
export function assignCampaignLoot(
    session: CampaignSession,
    name: string,
    character: string,
    qty = 1,
): CampaignLootItem | null {
    const owner = cleanName(character);
    if (!owner) return null;
    const available = (session.loot ?? [])
        .filter(item => !item.assignedTo?.trim() && sameName(item.name, name))
        .reduce((sum, item) => sum + (item.qty ?? 1), 0);
    const amount = Math.min(available, Math.max(1, Math.trunc(Number(qty)) || 1));
    if (amount <= 0) return null;
    removeCampaignLoot(session, name, amount);
    return addCampaignLoot(session, name, amount, owner);
}

// ─── Advancement, interludes ─────────────────────────────────────────────────

/** Record a character advancement for this session. */
export function addCampaignAdvancement(
    session: CampaignSession,
    character: string,
    summary: string,
    details: { sessionNumber?: number; at?: string } = {},
): CampaignAdvancement | null {
    const name = cleanName(character);
    const text = cleanName(summary);
    if (!name || !text) return null;
    const entry: CampaignAdvancement = { character: name, summary: text };
    if (details.sessionNumber !== undefined) entry.sessionNumber = details.sessionNumber;
    if (details.at?.trim()) entry.at = details.at.trim();
    session.advancements = [...(session.advancements ?? []), entry];
    return entry;
}

/** Record an off-camera interlude between sessions. */
export function addCampaignInterlude(
    session: CampaignSession,
    title: string,
    summary?: string,
    changes: string[] = [],
): CampaignInterlude | null {
    const cleaned = cleanName(title);
    if (!cleaned) return null;
    const entry: CampaignInterlude = { title: cleaned };
    if (summary?.trim()) entry.summary = summary.trim();
    const cleanChanges = changes.map(change => change.trim()).filter(Boolean);
    if (cleanChanges.length) entry.changes = cleanChanges;
    session.interludes = [...(session.interludes ?? []), entry];
    return entry;
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
