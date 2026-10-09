/**
 * Pure helpers for the Partylog-compatible campaign data model.
 *
 * Everything here works on plain values (a clock, a thread, a resource map) so it can be
 * tested without Obsidian. Session-level wrappers live in CampaignProgress.ts.
 */
import type {
    CampaignClock,
    CampaignGroupRelationshipType,
    CampaignGroupStanding,
    CampaignSession,
    CampaignThread,
    CampaignThreadKind,
    CampaignThreadStatus,
    CampaignTrackerKind,
} from '../types';
import { buildFrontmatter } from '../yaml/EntitySections';

// ─── Progress trackers ───────────────────────────────────────────────────────

export const TRACKER_KINDS: readonly CampaignTrackerKind[] = ['clock', 'track', 'timer'];
export const TRACKER_MIN_SEGMENTS = 2;
export const TRACKER_MAX_SEGMENTS = 24;
/** Timers may start at 1 (one tick left); clocks and tracks need at least two segments. */
const TIMER_MIN_START = 1;
const DEFAULT_SEGMENTS = 4;

export function normalizeTrackerKind(value: unknown): CampaignTrackerKind {
    return typeof value === 'string' && (TRACKER_KINDS as readonly string[]).includes(value)
        ? value as CampaignTrackerKind
        : 'clock';
}

/** Kind of a tracker, treating a missing or unknown `kind` as a clock. */
export function trackerKindOf(clock: Pick<CampaignClock, 'kind'>): CampaignTrackerKind {
    return normalizeTrackerKind(clock.kind);
}

/** Clamp a requested size into the supported range for the kind. Non-numbers fall back to 4. */
export function clampTrackerSegments(value: number, kind: CampaignTrackerKind = 'clock'): number {
    const rounded = Math.round(Number(value)) || DEFAULT_SEGMENTS;
    const min = kind === 'timer' ? TIMER_MIN_START : TRACKER_MIN_SEGMENTS;
    return Math.max(min, Math.min(TRACKER_MAX_SEGMENTS, rounded));
}

/** Starting `current` for a new tracker: empty for clocks and tracks, full for timers. */
export function initialTrackerCurrent(kind: CampaignTrackerKind, segments: number): number {
    return kind === 'timer' ? segments : 0;
}

/**
 * Apply a change to a tracker and return its new `current`.
 * clock / track: positive delta fills, negative empties.
 * timer: positive delta is time elapsed (counts down), negative adds time back.
 * The result is always clamped to 0..segments.
 */
export function applyTrackerDelta(clock: CampaignClock, delta: number): number {
    const step = Math.trunc(Number(delta)) || 0;
    const signed = trackerKindOf(clock) === 'timer' ? -step : step;
    clock.current = clampCurrent(clock, clock.current + signed);
    return clock.current;
}

/** Set `current` directly (e.g. a clicked segment), clamped to 0..segments. */
export function setTrackerValue(clock: CampaignClock, value: number): number {
    clock.current = clampCurrent(clock, Math.trunc(Number(value)) || 0);
    return clock.current;
}

/** Reset to the kind's starting state: empty for clocks and tracks, full for timers. */
export function resetTracker(clock: CampaignClock): number {
    clock.current = initialTrackerCurrent(trackerKindOf(clock), clock.segments);
    return clock.current;
}

/** A clock or track is complete when full. A timer is complete when it reaches zero. */
export function isTrackerComplete(clock: CampaignClock): boolean {
    return trackerKindOf(clock) === 'timer'
        ? clock.current <= 0
        : clock.current >= clock.segments;
}

const TRACKER_TAG_LABEL: Record<CampaignTrackerKind, string> = {
    clock: 'Clock',
    track: 'Track',
    timer: 'Timer',
};

/** Partylog tag for a tracker, e.g. `[Clock:Ritual 5/12]`, `[Track:Heist 3/8]`, `[Timer:Dawn 3]`. */
export function formatTrackerTag(clock: CampaignClock): string {
    const kind = trackerKindOf(clock);
    const label = TRACKER_TAG_LABEL[kind];
    const name = clock.name.trim();
    return kind === 'timer'
        ? `[${label}:${name} ${clock.current}]`
        : `[${label}:${name} ${clock.current}/${clock.segments}]`;
}

function clampCurrent(clock: CampaignClock, value: number): number {
    return Math.max(0, Math.min(clock.segments, value));
}

// ─── Threads, goals and quests ───────────────────────────────────────────────

export const THREAD_KINDS: readonly CampaignThreadKind[] = ['thread', 'goal', 'quest'];

/** Default states per kind. The first entry is the state a new record starts in. */
export const CAMPAIGN_THREAD_STATES: Readonly<Record<CampaignThreadKind, readonly string[]>> = {
    thread: ['Open', 'Closed'],
    goal: ['Active', 'Done', 'Failed'],
    quest: ['Main', 'Side', 'Active', 'Done'],
};

const LEGACY_STATUS_TO_STATE: Record<CampaignThreadStatus, string> = {
    active: 'Open',
    resolved: 'Closed',
    abandoned: 'Abandoned',
};

/** Map a free-text state onto the legacy status used by older builds, if there is a clear mapping. */
export function legacyStatusForState(state: string): CampaignThreadStatus | undefined {
    switch (state.trim().toLowerCase()) {
        case 'open':
        case 'active':
        case 'main':
        case 'side':
            return 'active';
        case 'closed':
        case 'done':
        case 'resolved':
            return 'resolved';
        case 'abandoned':
        case 'failed':
            return 'abandoned';
        default:
            return undefined;
    }
}

export function threadKindOf(thread: Pick<CampaignThread, 'kind'>): CampaignThreadKind {
    return typeof thread.kind === 'string' && (THREAD_KINDS as readonly string[]).includes(thread.kind)
        ? thread.kind
        : 'thread';
}

export function defaultThreadState(kind: CampaignThreadKind): string {
    return CAMPAIGN_THREAD_STATES[kind][0];
}

/**
 * Current state of a thread record. `state` wins when present; otherwise the legacy
 * `status` is mapped (active -> Open, resolved -> Closed, abandoned -> Abandoned).
 */
export function threadStateOf(thread: CampaignThread): string {
    const state = typeof thread.state === 'string' ? thread.state.trim() : '';
    if (state) return state;
    const kind = threadKindOf(thread);
    return thread.status ? LEGACY_STATUS_TO_STATE[thread.status] : defaultThreadState(kind);
}

/** Legacy three-way status for display and CSS, derived from the state. */
export function threadLegacyStatus(thread: CampaignThread): CampaignThreadStatus {
    return legacyStatusForState(threadStateOf(thread)) ?? thread.status ?? 'active';
}

/**
 * Migrate a thread loaded from an older note: fill `kind` and `state`, keep `status` and
 * every other field. Returns a new object.
 */
export function normalizeCampaignThread(raw: CampaignThread): CampaignThread {
    const kind = threadKindOf(raw);
    return { ...raw, kind, state: threadStateOf(raw) };
}

/**
 * Set a custom or default state. Mirrors the legacy status when the state has a clear
 * mapping so older plugin builds still show the thread correctly.
 */
export function setThreadState(thread: CampaignThread, state: string): string | null {
    const cleaned = state.trim();
    if (!cleaned) return null;
    thread.state = cleaned;
    const legacy = legacyStatusForState(cleaned);
    if (legacy) thread.status = legacy;
    return cleaned;
}

/** Move to the next state in the kind's default list. An unknown current state goes to the first. */
export function cycleThreadState(thread: CampaignThread): string {
    const states = CAMPAIGN_THREAD_STATES[threadKindOf(thread)];
    const current = threadStateOf(thread).toLowerCase();
    const index = states.findIndex(candidate => candidate.toLowerCase() === current);
    return setThreadState(thread, states[(index + 1) % states.length]) ?? states[0];
}

// ─── Party resources ─────────────────────────────────────────────────────────

export type PartyResourceValue = number | string;

export interface PartyResourceChange {
    name: string;
    before: PartyResourceValue | undefined;
    after: PartyResourceValue;
}

function parseResourceValue(raw: string): PartyResourceValue {
    const trimmed = raw.trim();
    return /^-?\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed;
}

/** Find an existing resource key by case-insensitive name, so `gold` updates `Gold`. */
export function findPartyResourceKey(resources: Record<string, PartyResourceValue>, name: string): string | undefined {
    const wanted = name.trim().toLowerCase();
    return Object.keys(resources).find(key => key.trim().toLowerCase() === wanted);
}

/**
 * Apply one Partylog party expression to a resource map. Forms:
 *   `Gold-30` / `Rations+5`        numeric delta (missing numeric resource counts as 0)
 *   `Gold 150` / `Gold: 150`       set a number
 *   `Wagon:intact`                 set text
 *   `Wagon:intact->damaged`        text transition (sets to the new value)
 * Mutates `resources`. Returns the change, or null when the expression is not understood
 * or a numeric delta targets a text resource.
 */
export function applyPartyResourceExpression(
    resources: Record<string, PartyResourceValue>,
    expression: string,
): PartyResourceChange | null {
    const text = expression.trim();
    if (!text) return null;

    const transition = /^([^:]+?)\s*:\s*(.+?)\s*->\s*(.+)$/.exec(text);
    if (transition) {
        return setPartyResource(resources, transition[1], parseResourceValue(transition[3]));
    }

    const delta = /^(.+?)\s*([+-])\s*(\d+(?:\.\d+)?)$/.exec(text);
    if (delta) {
        const key = findPartyResourceKey(resources, delta[1]);
        const existing = key === undefined ? undefined : resources[key];
        if (typeof existing === 'string') return null;
        const base = existing ?? 0;
        const amount = Number(delta[3]);
        const next = delta[2] === '-' ? base - amount : base + amount;
        return setPartyResource(resources, delta[1], next);
    }

    const numeric = /^(.+?)\s*:?\s*(-?\d+(?:\.\d+)?)$/.exec(text);
    if (numeric) {
        return setPartyResource(resources, numeric[1], Number(numeric[2]));
    }

    const named = /^([^:]+?)\s*:\s*(.+)$/.exec(text);
    if (named) {
        return setPartyResource(resources, named[1], parseResourceValue(named[2]));
    }

    return null;
}

/** Apply several expressions in order. Returns the changes that were understood. */
export function applyPartyResourceExpressions(
    resources: Record<string, PartyResourceValue>,
    expressions: readonly string[],
): PartyResourceChange[] {
    const changes: PartyResourceChange[] = [];
    for (const expression of expressions) {
        const change = applyPartyResourceExpression(resources, expression);
        if (change) changes.push(change);
    }
    return changes;
}

/** Remove a resource by name (case-insensitive). Returns true when something was removed. */
export function removePartyResource(resources: Record<string, PartyResourceValue>, name: string): boolean {
    const key = findPartyResourceKey(resources, name);
    if (key === undefined) return false;
    delete resources[key];
    return true;
}

function setPartyResource(
    resources: Record<string, PartyResourceValue>,
    rawName: string,
    value: PartyResourceValue,
): PartyResourceChange | null {
    const name = rawName.trim();
    if (!name) return null;
    const key = findPartyResourceKey(resources, name) ?? name;
    const before = resources[key];
    resources[key] = value;
    return { name: key, before, after: value };
}

// ─── Factions ────────────────────────────────────────────────────────────────

const RELATIONSHIP_SYNONYMS: Record<CampaignGroupRelationshipType, readonly string[]> = {
    allied: ['allied', 'allies', 'ally'],
    friendly: ['friendly', 'friend', 'friends'],
    neutral: ['neutral', 'indifferent'],
    rival: ['rival', 'rivals', 'rivalry'],
    hostile: ['hostile', 'enemy', 'enemies'],
    'at-war': ['at-war', 'at war', 'war', 'warring'],
};

/** Map free-text standing onto the structured relationship type, when there is a clear match. */
export function relationshipTypeForStanding(standing: string | undefined): CampaignGroupRelationshipType | undefined {
    const wanted = (standing ?? '').trim().toLowerCase();
    if (!wanted) return undefined;
    for (const [type, words] of Object.entries(RELATIONSHIP_SYNONYMS) as [CampaignGroupRelationshipType, readonly string[]][]) {
        if (words.includes(wanted)) return type;
    }
    return undefined;
}

/** Free-text standing for a structured relationship type (same word, so the two stay readable). */
export function standingForRelationshipType(type: CampaignGroupRelationshipType): string {
    return type;
}

/**
 * Apply one Partylog faction expression. Forms:
 *   `standing:neutral->suspicious` / `standing:hostile`   set standing
 *   `neutral->suspicious`                                 analog form, sets standing
 *   `tier:3`                                              set tier (number)
 *   `+owes us a debt`                                     add a status note
 *   `-hostile` / `-hunting us`                            clear standing if it matches, else remove the note
 * Returns true when the record changed.
 */
export function applyFactionExpression(standing: CampaignGroupStanding, expression: string): boolean {
    const text = expression.trim();
    if (!text) return false;

    if (text.startsWith('+')) {
        const note = text.slice(1).trim();
        if (!note) return false;
        standing.statusNotes ??= [];
        if (standing.statusNotes.some(existing => existing.toLowerCase() === note.toLowerCase())) return false;
        standing.statusNotes.push(note);
        return true;
    }

    if (text.startsWith('-')) {
        const target = text.slice(1).trim();
        if (!target) return false;
        if (standing.standing && standing.standing.toLowerCase() === target.toLowerCase()) {
            standing.standing = undefined;
            return true;
        }
        const before = standing.statusNotes?.length ?? 0;
        standing.statusNotes = (standing.statusNotes ?? []).filter(note => note.toLowerCase() !== target.toLowerCase());
        if (standing.statusNotes.length === 0) standing.statusNotes = undefined;
        return (standing.statusNotes?.length ?? 0) !== before;
    }

    const tierMatch = /^tier\s*:\s*(\d+)$/i.exec(text);
    if (tierMatch) {
        standing.tier = Number(tierMatch[1]);
        return true;
    }

    const standingMatch = /^standing\s*:\s*(.+)$/i.exec(text);
    const standingValue = standingMatch ? standingMatch[1] : text.includes('->') ? text : undefined;
    if (standingValue !== undefined) {
        // `from->to` keeps only the new standing; the old one is not checked.
        const next = (standingValue.includes('->') ? standingValue.split('->').pop() ?? '' : standingValue).trim();
        if (!next) return false;
        standing.standing = next;
        const mapped = relationshipTypeForStanding(next);
        if (mapped) standing.relationshipType = mapped;
        return true;
    }

    return false;
}

// ─── Session normalization and frontmatter ───────────────────────────────────

/** Session fields written as YAML block scalars. Other top-level strings are single-line. */
export const CAMPAIGN_SESSION_MULTILINE_KEYS: readonly string[] = ['recap', 'goals', 'mood', 'hook', 'endNotes'];

/**
 * Build campaign session frontmatter through the entity whitelist. This is the same builder
 * saveSession uses, so tests exercise the real persisted shape.
 */
export function buildCampaignSessionFrontmatter(
    source: Record<string, unknown>,
    options?: { omitOriginalKeys?: Iterable<string> },
): Record<string, unknown> {
    return buildFrontmatter('campaignSession', source, undefined, {
        multilineKeys: CAMPAIGN_SESSION_MULTILINE_KEYS,
        omitOriginalKeys: options?.omitOriginalKeys,
    });
}

/**
 * Normalize a session read from frontmatter. Only threads are migrated in memory (kind and
 * state filled from the legacy status). Other fields are kept as found, so older notes keep
 * their exact values and new fields simply stay absent.
 */
export function normalizeCampaignSessionData<T extends Partial<CampaignSession>>(data: T): T {
    if (!Array.isArray(data.threads)) return data;
    const threads = data.threads
        .filter((thread): thread is CampaignThread => Boolean(thread) && typeof thread === 'object')
        .map(thread => normalizeCampaignThread(thread));
    return { ...data, threads };
}
