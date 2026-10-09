/*
 * Partylog session bridge: keeps the live campaign session in step with a Partylog log.
 *
 * Pure TypeScript with no Obsidian imports. Three jobs:
 *   1. Derive a PartylogState from a CampaignSession (partylogStateFromSession).
 *   2. Replay tags with applyTagUpdates, then write only the differences back into the
 *      session (applyPartylogTagsToSession). Names are canonicalized to the session's own
 *      spelling first, so `gold` updates `Gold`.
 *   3. Place session header, end, interlude and scene blocks inside a log string. Header and
 *      end blocks replace an existing block instead of duplicating it.
 */
import type {
    CampaignClock,
    CampaignGroupStanding,
    CampaignSession,
    CampaignThread,
    CampaignThreadKind,
    CampaignTrackerKind,
    PartyMemberState,
} from '../types';
import {
    applyTagUpdates,
    createPartylogState,
    formatInterlude,
    formatSceneHeader,
    formatSessionEnd,
    formatSessionHeader,
    nextSceneId,
    parsePartylogLine,
} from './partylog';
import type {
    EntityState,
    FactionState,
    FormatStyle,
    Interlude,
    NamedState,
    PartylogEntry,
    PartylogState,
    ProgressState,
    SessionEnd,
    SessionHeader,
    Tag,
    TagField,
    PcState,
} from './partylog';
import {
    addCampaignAdvancement,
    addCampaignClock,
    addCampaignLoot,
    addCampaignThread,
    removeCampaignLoot,
    setCampaignThreadState,
} from '../utils/CampaignProgress';
import {
    clampTrackerSegments,
    findPartyResourceKey,
    removePartyResource,
    relationshipTypeForStanding,
    setTrackerValue,
    threadKindOf,
    threadStateOf,
    trackerKindOf,
} from '../utils/CampaignModel';
import type { PartyResourceValue } from '../utils/CampaignModel';

export interface PartylogBridgeContext {
    /** Story groups. Used to match `[Faction:Name]` to a group id. */
    groups?: ReadonlyArray<{ id: string; name: string }>;
}

export interface PartylogBridgeResult {
    changed: boolean;
    /** Short readable lines describing each record that changed. */
    summary: string[];
}

const TRACKER_DEFAULT_SIZE = 4;
/** Scene kinds the view can request for the next header (sequential is the default "next"). */
export type SceneKindChoice = 'next' | 'flashback' | 'split' | 'montage';
const PC_FIELD_KEYS = ['HP', 'Level', 'Class'] as const;
const TRACKER_KINDS: readonly CampaignTrackerKind[] = ['clock', 'track', 'timer'];
const THREAD_KINDS: readonly CampaignThreadKind[] = ['thread', 'goal', 'quest'];

// ─── Small helpers ───────────────────────────────────────────────────────────

function own<T>(dict: Record<string, T>, key: string): T | undefined {
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
}

function sameText(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The known spelling of `name`, or `name` itself when nothing matches case-insensitively. */
function canonical(name: string, known: readonly string[]): string {
    return known.find(candidate => sameText(candidate, name)) ?? name;
}

function uniqueNames(names: Iterable<string>): string[] {
    const out: string[] = [];
    for (const name of names) {
        const trimmed = name.trim();
        if (trimmed && !out.some(existing => sameText(existing, trimmed))) out.push(trimmed);
    }
    return out;
}

function emptyEntity(name: string): EntityState {
    return { name, labels: [], props: {}, gauges: {}, stats: {} };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every(item => b.some(other => sameText(item, other)));
}

function clampHp(value: number, max: number): number {
    return Math.max(0, Math.min(max, value));
}

function progressMapOf(state: PartylogState, kind: CampaignTrackerKind): Record<string, ProgressState> {
    if (kind === 'track') return state.tracks;
    if (kind === 'timer') return state.timers;
    return state.clocks;
}

function threadMapOf(state: PartylogState, kind: CampaignThreadKind): Record<string, NamedState> {
    if (kind === 'goal') return state.goals;
    if (kind === 'quest') return state.quests;
    return state.threads;
}

function groupNameFor(standing: CampaignGroupStanding, ctx: PartylogBridgeContext): string | undefined {
    const group = standing.groupId ? ctx.groups?.find(candidate => candidate.id === standing.groupId) : undefined;
    return group?.name ?? standing.groupName;
}

function partyNamesOf(session: CampaignSession): string[] {
    return uniqueNames([
        ...(session.partyCharacterNames ?? []),
        ...(session.partyState ?? []).map(member => member.characterName),
        ...(session.loot ?? []).filter(item => item.assignedTo?.trim()).map(item => item.assignedTo as string),
    ]);
}

function findMember(session: CampaignSession, name: string): PartyMemberState | undefined {
    return (session.partyState ?? []).find(member => sameText(member.characterName, name));
}

// ─── Derive state from the session ───────────────────────────────────────────

function ensurePc(state: PartylogState, name: string): PcState {
    const existing = own(state.pcs, name);
    if (existing) return existing;
    const pc: PcState = { ...emptyEntity(name), items: [] };
    state.pcs[name] = pc;
    return pc;
}

/**
 * Build the Partylog state that matches the session's current values. Replaying tags on top of
 * this state and diffing the result gives exactly the changes a log line makes.
 */
export function partylogStateFromSession(session: CampaignSession, ctx: PartylogBridgeContext = {}): PartylogState {
    const state = createPartylogState();

    for (const member of session.partyState ?? []) {
        const pc = ensurePc(state, member.characterName);
        pc.gauges.HP = { current: member.currentHp, max: member.maxHp };
        pc.labels = [...(member.conditions ?? [])];
    }

    for (const item of session.loot ?? []) {
        const owner = item.assignedTo?.trim();
        if (owner) {
            const pc = ensurePc(state, owner);
            if (!pc.items.some(existing => sameText(existing, item.name))) pc.items.push(item.name);
        } else {
            state.loot.stash.push({ name: item.name, quantity: item.qty ?? 1 });
        }
    }

    for (const [key, value] of Object.entries(session.partyResources ?? {})) {
        if (typeof value === 'number') state.party.gauges[key] = { current: value };
        else state.party.props[key] = [String(value)];
    }

    for (const standing of session.groupStandings ?? []) {
        const name = groupNameFor(standing, ctx);
        if (!name) continue;
        const faction: FactionState = { ...emptyEntity(name) };
        faction.labels = [...(standing.statusNotes ?? [])];
        if (standing.tier !== undefined) {
            faction.tier = standing.tier;
            faction.props.tier = [String(standing.tier)];
        }
        if (standing.standing) {
            faction.standing = standing.standing;
            faction.props.standing = [standing.standing];
        }
        state.factions[name] = faction;
    }

    for (const clock of session.clocks ?? []) {
        const kind = trackerKindOf(clock);
        progressMapOf(state, kind)[clock.name] = { name: clock.name, current: clock.current, max: clock.segments };
    }

    for (const thread of session.threads ?? []) {
        const kind = threadKindOf(thread);
        threadMapOf(state, kind)[thread.name] = { name: thread.name, state: threadStateOf(thread) };
    }

    return state;
}

// ─── Canonical names ─────────────────────────────────────────────────────────

function canonicalFieldKeys(field: TagField, keys: readonly string[]): TagField {
    switch (field.kind) {
        case 'set':
        case 'keyed':
        case 'delta':
            return { ...field, key: canonical(field.key, keys) };
        case 'change':
            return { kind: 'change', from: canonicalFieldKeys(field.from, keys), to: canonicalFieldKeys(field.to, keys) };
        default:
            return field;
    }
}

function canonicalizeTag(tag: Tag, session: CampaignSession, ctx: PartylogBridgeContext): Tag {
    const pcNames = partyNamesOf(session);
    switch (tag.kind) {
        case 'PC':
            return {
                ...tag,
                name: canonical(tag.name, pcNames),
                fields: tag.fields.map(field => canonicalFieldKeys(field, PC_FIELD_KEYS)),
            };
        case 'Advance':
            return { ...tag, name: canonical(tag.name, pcNames) };
        case 'Faction': {
            const names = uniqueNames([
                ...(ctx.groups ?? []).map(group => group.name),
                ...(session.groupStandings ?? []).map(standing => groupNameFor(standing, ctx) ?? ''),
            ]);
            return { ...tag, name: canonical(tag.name, names) };
        }
        case 'Thread':
        case 'Goal':
        case 'Quest': {
            const kind = tag.kind.toLowerCase() as CampaignThreadKind;
            const names = (session.threads ?? []).filter(thread => threadKindOf(thread) === kind).map(thread => thread.name);
            return { ...tag, name: canonical(tag.name, names) };
        }
        case 'Clock':
        case 'E':
        case 'Track':
        case 'Timer':
            return { ...tag, name: canonical(tag.name, (session.clocks ?? []).map(clock => clock.name)) };
        case 'Loot': {
            return {
                ...tag,
                name: canonical(tag.name, (session.loot ?? []).map(item => item.name)),
                to: tag.to === undefined ? undefined : canonical(tag.to, pcNames),
            };
        }
        case 'Party':
        case 'Wealth': {
            const keys = Object.keys(session.partyResources ?? {});
            return { ...tag, fields: tag.fields.map(field => canonicalFieldKeys(field, keys)) };
        }
        default:
            return tag;
    }
}

// ─── Diff helpers ────────────────────────────────────────────────────────────

function partyValue(party: EntityState, key: string): PartyResourceValue | undefined {
    const gauge = own(party.gauges, key);
    if (gauge && gauge.current !== undefined) return gauge.current;
    const stat = own(party.stats, key);
    if (stat !== undefined) return stat;
    const prop = own(party.props, key);
    if (prop && prop.length > 0) return prop.join(', ');
    return undefined;
}

function writePartyResources(session: CampaignSession, before: PartylogState, after: PartylogState, summary: string[]): void {
    const keys = uniqueNames([
        ...Object.keys(before.party.gauges), ...Object.keys(before.party.stats), ...Object.keys(before.party.props),
        ...Object.keys(after.party.gauges), ...Object.keys(after.party.stats), ...Object.keys(after.party.props),
    ]);
    for (const key of keys) {
        const previous = partyValue(before.party, key);
        const next = partyValue(after.party, key);
        if (previous === next) continue;
        const resources = session.partyResources ?? {};
        session.partyResources = resources;
        if (next === undefined) {
            removePartyResource(resources, key);
            summary.push(`Party ${key} removed`);
            continue;
        }
        const resourceKey = findPartyResourceKey(resources, key) ?? key;
        resources[resourceKey] = next;
        summary.push(`Party ${resourceKey} ${next}`);
    }
}

function writeCharacters(session: CampaignSession, before: PartylogState, after: PartylogState, summary: string[]): void {
    for (const name of Object.keys(after.pcs)) {
        const next = after.pcs[name];
        const prev = own(before.pcs, name);
        const nextHp = own(next.gauges, 'HP');
        const prevHp = prev ? own(prev.gauges, 'HP') : undefined;
        const hpChanged = nextHp !== undefined && nextHp.current !== undefined
            && (!prevHp || prevHp.current !== nextHp.current || prevHp.max !== nextHp.max);
        const conditionsChanged = !sameList(next.labels, prev ? prev.labels : []);
        if (!hpChanged && !conditionsChanged) continue;

        let member = findMember(session, name);
        const maxHp = nextHp?.max ?? member?.maxHp;
        if (maxHp === undefined) {
            // Without a maximum there is no party record to write to yet.
            summary.push(`${name} has no max HP yet, so HP and conditions were not stored`);
            continue;
        }
        if (!member) {
            member = { characterId: '', characterName: name, currentHp: 0, maxHp };
            session.partyState = [...(session.partyState ?? []), member];
        }
        member.maxHp = maxHp;
        if (hpChanged && nextHp?.current !== undefined) {
            member.currentHp = clampHp(nextHp.current, maxHp);
            summary.push(`HP ${member.characterName} ${member.currentHp}/${maxHp}`);
        }
        if (conditionsChanged) {
            if (next.labels.length > 0) member.conditions = [...next.labels];
            else delete member.conditions;
            summary.push(`Conditions ${member.characterName}: ${next.labels.join(', ') || 'none'}`);
        }
    }
}

function sameFaction(prev: FactionState | undefined, next: FactionState): boolean {
    if (!prev) return false;
    return prev.tier === next.tier && prev.standing === next.standing && sameList(prev.labels, next.labels);
}

function writeFactions(
    session: CampaignSession,
    before: PartylogState,
    after: PartylogState,
    ctx: PartylogBridgeContext,
    summary: string[],
): void {
    for (const name of Object.keys(after.factions)) {
        const next = after.factions[name];
        const prev = own(before.factions, name);
        if (sameFaction(prev, next)) continue;

        let standing = (session.groupStandings ?? []).find(candidate => groupNameFor(candidate, ctx) !== undefined
            && sameText(groupNameFor(candidate, ctx) as string, name));
        if (!standing) {
            const group = ctx.groups?.find(candidate => sameText(candidate.name, name));
            const created: CampaignGroupStanding = { groupName: name, value: 0 };
            if (group) created.groupId = group.id;
            session.groupStandings = [...(session.groupStandings ?? []), created];
            standing = created;
        }

        if (next.tier !== prev?.tier) {
            if (next.tier === undefined) delete standing.tier;
            else standing.tier = next.tier;
        }
        if (next.standing !== prev?.standing) {
            if (next.standing === undefined) {
                delete standing.standing;
                delete standing.relationshipType;
            } else {
                standing.standing = next.standing;
                const mapped = relationshipTypeForStanding(next.standing);
                if (mapped) standing.relationshipType = mapped;
                else delete standing.relationshipType;
            }
        }

        const previousNotes = prev ? prev.labels : [];
        const notes = [...(standing.statusNotes ?? [])];
        for (const note of next.labels) {
            if (!notes.some(existing => sameText(existing, note))) notes.push(note);
        }
        const removed = previousNotes.filter(note => !next.labels.some(label => sameText(label, note)));
        const kept = notes.filter(note => !removed.some(gone => sameText(gone, note)));
        if (kept.length > 0) standing.statusNotes = kept;
        else delete standing.statusNotes;

        const parts = [
            next.tier !== undefined ? `tier ${next.tier}` : '',
            next.standing !== undefined ? `standing ${next.standing}` : '',
        ].filter(Boolean);
        summary.push(`Faction ${name}${parts.length ? `: ${parts.join(', ')}` : ' updated'}`);
    }
}

function writeTrackers(session: CampaignSession, before: PartylogState, after: PartylogState, summary: string[]): void {
    for (const kind of TRACKER_KINDS) {
        const nextMap = progressMapOf(after, kind);
        const prevMap = progressMapOf(before, kind);
        for (const name of Object.keys(nextMap)) {
            const next = nextMap[name];
            const prev = own(prevMap, name);
            if (prev && prev.current === next.current && prev.max === next.max) continue;

            let clock: CampaignClock | undefined = (session.clocks ?? [])
                .find(candidate => trackerKindOf(candidate) === kind && sameText(candidate.name, name));
            if (!clock) {
                const fallback = kind === 'timer' ? Math.max(1, next.current) : Math.max(TRACKER_DEFAULT_SIZE, next.current);
                const size = clampTrackerSegments(next.max ?? fallback, kind);
                clock = addCampaignClock(session, name, size, undefined, kind) ?? undefined;
                if (!clock) continue;
            } else if (next.max !== undefined && next.max !== clock.segments) {
                clock.segments = clampTrackerSegments(next.max, kind);
            }
            setTrackerValue(clock, next.current);
            summary.push(`${kind} ${name} ${clock.current}/${clock.segments}`);
        }
    }
}

function writeThreads(session: CampaignSession, before: PartylogState, after: PartylogState, summary: string[]): void {
    for (const kind of THREAD_KINDS) {
        const nextMap = threadMapOf(after, kind);
        const prevMap = threadMapOf(before, kind);
        for (const name of Object.keys(nextMap)) {
            const next = nextMap[name];
            const prev = own(prevMap, name);
            if (prev && prev.state === next.state) continue;
            if (next.state === undefined && prev) continue;

            let thread: CampaignThread | null | undefined = (session.threads ?? [])
                .find(candidate => threadKindOf(candidate) === kind && sameText(candidate.name, name));
            if (!thread) {
                thread = addCampaignThread(session, name, undefined, kind);
                if (!thread) continue;
            }
            if (next.state !== undefined) setCampaignThreadState(thread, next.state);
            summary.push(`${kind} ${name}: ${threadStateOf(thread)}`);
        }
    }
}

function stashQuantity(stash: readonly { name: string; quantity?: number }[], name: string): number {
    return stash
        .filter(item => sameText(item.name, name))
        .reduce((sum, item) => sum + (item.quantity ?? 1), 0);
}

function writeLoot(session: CampaignSession, before: PartylogState, after: PartylogState, summary: string[]): void {
    const names = uniqueNames([
        ...before.loot.stash.map(item => item.name),
        ...after.loot.stash.map(item => item.name),
    ]);
    // Units that left the stash, so a character who claims them receives the same count.
    const leaving = new Map<string, number>();
    for (const name of names) {
        const previous = stashQuantity(before.loot.stash, name);
        const next = stashQuantity(after.loot.stash, name);
        if (next > previous) {
            addCampaignLoot(session, name, next - previous);
            summary.push(`Loot +${next - previous} ${name}`);
        } else if (next < previous) {
            removeCampaignLoot(session, name, previous - next);
            leaving.set(name.toLowerCase(), previous - next);
            summary.push(`Loot -${previous - next} ${name}`);
        }
    }

    for (const pcName of Object.keys(after.pcs)) {
        const next = after.pcs[pcName];
        const prev = own(before.pcs, pcName);
        for (const item of next.items) {
            if (prev?.items.some(existing => sameText(existing, item))) continue;
            const units = leaving.get(item.toLowerCase());
            let quantity = 1;
            if (units !== undefined && units > 0) {
                quantity = units;
                leaving.delete(item.toLowerCase());
            }
            addCampaignLoot(session, item, quantity, pcName);
            summary.push(`Gear ${pcName} +${quantity} ${item}`);
        }
    }
}

function writeAdvancements(session: CampaignSession, before: PartylogState, after: PartylogState, summary: string[]): void {
    for (const record of after.advancements.slice(before.advancements.length)) {
        const text = [record.detail, ...record.gains].filter((part): part is string => Boolean(part)).join(', ') || 'Advanced';
        const entry = addCampaignAdvancement(session, record.pc, text, { sessionNumber: session.sessionNumber });
        if (entry) summary.push(`Advance ${record.pc}: ${text}`);
    }
}

/**
 * Replay tags against the session. Each tag is canonicalized to the session's spelling, replayed
 * with `applyTagUpdates`, and the difference from the derived state is written back. The session
 * object is mutated in place. Returns the readable summary of what changed.
 */
export function applyPartylogTagsToSession(
    session: CampaignSession,
    tags: readonly Tag[],
    ctx: PartylogBridgeContext = {},
): PartylogBridgeResult {
    if (tags.length === 0) return { changed: false, summary: [] };
    const canonicalTags = tags.map(tag => canonicalizeTag(tag, session, ctx));
    const before = partylogStateFromSession(session, ctx);
    const after = applyTagUpdates(before, canonicalTags);
    const summary: string[] = [];
    writePartyResources(session, before, after, summary);
    writeCharacters(session, before, after, summary);
    writeFactions(session, before, after, ctx, summary);
    writeTrackers(session, before, after, summary);
    writeThreads(session, before, after, summary);
    writeLoot(session, before, after, summary);
    writeAdvancements(session, before, after, summary);
    return { changed: summary.length > 0, summary };
}

/** Parse user-typed Partylog lines into entries, skipping blank lines. */
export function parseLogLines(lines: readonly string[]): PartylogEntry[] {
    return lines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => parsePartylogLine(line));
}

// ─── Log text: blocks and lines ──────────────────────────────────────────────

const DIGITAL_SESSION_HEADING = /^## Session(?: \d+)?\s*$/;
const ANALOG_SESSION_HEADING = /^=== Session(?: \d+)? ===\s*$/;
const DIGITAL_END_HEADING = /^### End of Session(?: \d+)?\s*$/;
const ANALOG_END_HEADING = /^--- End of Session(?: \d+)? ---\s*$/;
const ANY_HEADING = /^(#{1,6}\s|=== |--- )/;
const ENTRY_START = /^(@|!|=>|d[:(]|tbl:|gen:|N\(|PC\(|\(|\[|R\d+\s*$|\\---|---\\|- )/;
const SCENE_HEADING = /^###\s+((?:T\d+-)?S\d+(?:\.\d+|[a-z])?)(?=\s|$)/;
const ANALOG_HEADER_FIELD = /^\[(Date|Duration|Scenes|Players|Absent|Scribe|Mood|Threads|Recap|Goals|Notes)\]/;
const PROSE_FIELD = /^\*\*(Recap|Goals|Notes):\*\*/;

function splitLines(text: string): string[] {
    return text.replace(/\r\n?/g, '\n').split('\n');
}

function joinBlocks(parts: readonly string[]): string {
    const kept = parts.map(part => part.trim()).filter(part => part.length > 0);
    return kept.length > 0 ? `${kept.join('\n\n')}\n` : '';
}

interface LineRange {
    start: number;
    end: number;
}

/** Range of the digital or analog session header: heading plus its info and prose lines. */
function sessionHeaderRange(lines: string[]): LineRange | undefined {
    const start = lines.findIndex(line => DIGITAL_SESSION_HEADING.test(line.trim()) || ANALOG_SESSION_HEADING.test(line.trim()));
    if (start < 0) return undefined;
    const analog = ANALOG_SESSION_HEADING.test(lines[start].trim());
    let i = start + 1;

    if (analog) {
        let consumed = false;
        while (i < lines.length) {
            const line = lines[i];
            if (ANALOG_HEADER_FIELD.test(line)) {
                consumed = true;
            } else if (consumed && /^\s+\S/.test(line)) {
                // continuation of a wrapped analog field
            } else {
                break;
            }
            i++;
        }
        return { start, end: i };
    }

    let inProse = false;
    while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (trimmed === '') {
            inProse = false;
            i++;
            continue;
        }
        if (PROSE_FIELD.test(trimmed)) {
            inProse = true;
        } else if (trimmed.startsWith('*') && !trimmed.startsWith('**')) {
            inProse = false;
        } else if (!(inProse && !ANY_HEADING.test(trimmed) && !ENTRY_START.test(trimmed))) {
            break;
        }
        i++;
    }
    // Do not swallow trailing blank lines; the caller joins blocks with its own spacing.
    let end = i;
    while (end > start + 1 && lines[end - 1].trim() === '') end--;
    return { start, end };
}

/** Range of an existing session end block: `### End of Session N` with its fence, or analog. */
function sessionEndRange(lines: string[]): LineRange | undefined {
    const start = lines.findIndex(line => DIGITAL_END_HEADING.test(line.trim()) || ANALOG_END_HEADING.test(line.trim()));
    if (start < 0) return undefined;
    const digital = DIGITAL_END_HEADING.test(lines[start].trim());
    let i = start + 1;
    if (digital) {
        let first = i;
        while (first < lines.length && lines[first].trim() === '') first++;
        if (first < lines.length && lines[first].trim() === '```') {
            let close = first + 1;
            while (close < lines.length && lines[close].trim() !== '```') close++;
            return { start, end: Math.min(close + 1, lines.length) };
        }
    }
    while (i < lines.length && !ANY_HEADING.test(lines[i].trim())) i++;
    let end = i;
    while (end > start + 1 && lines[end - 1].trim() === '') end--;
    return { start, end };
}

/**
 * Replaces the session header block at the top of a log, or inserts one when the log has none.
 * The header is never duplicated.
 */
export function upsertSessionHeaderBlock(log: string, header: SessionHeader, style: FormatStyle = 'digital'): string {
    const lines = splitLines(log);
    const block = formatSessionHeader(header, style);
    const range = sessionHeaderRange(lines);
    if (!range) return joinBlocks([block, log]);
    return joinBlocks([lines.slice(0, range.start).join('\n'), block, lines.slice(range.end).join('\n')]);
}

/** Replaces the session end block, or appends one at the end of the log. */
export function upsertSessionEndBlock(log: string, end: SessionEnd, style: FormatStyle = 'digital'): string {
    const block = formatSessionEnd(end, style);
    const lines = splitLines(log);
    const range = sessionEndRange(lines);
    if (!range) return joinBlocks([log, block]);
    return joinBlocks([lines.slice(0, range.start).join('\n'), block, lines.slice(range.end).join('\n')]);
}

/** Appends an interlude block at the end of the log. Interludes are never replaced. */
export function appendInterludeBlock(log: string, interlude: Interlude, style: FormatStyle = 'digital'): string {
    return joinBlocks([log, formatInterlude(interlude, style)]);
}

/** Appends plain Partylog lines (no list bullet) to the end of the log. */
export function appendLogLines(log: string, lines: readonly string[]): string {
    const added = lines.map(line => line.trim()).filter(line => line.length > 0).join('\n');
    if (!added) return log;
    const body = log.replace(/\s+$/, '');
    return body ? `${body}\n${added}\n` : `${added}\n`;
}

/** Scene ids already written in the log, in document order (`S18`, `S20a`, `T1-S22`, `S15.1`). */
export function sceneIdsInLog(log: string): string[] {
    const ids: string[] = [];
    for (const line of splitLines(log)) {
        const match = SCENE_HEADING.exec(line.trim());
        if (match) ids.push(match[1]);
    }
    return ids;
}

/** Context text of the most recent scene header, e.g. `Sewer tunnels` for `### S18 *Sewer tunnels*`. */
export function lastSceneContext(log: string): string | undefined {
    let context: string | undefined;
    for (const line of splitLines(log)) {
        const match = /^###\s+\S+\s+\*(.*)\*\s*$/.exec(line.trim());
        if (match) context = match[1];
    }
    return context;
}

/** Builds the next scene header line, choosing the id with the library's `nextSceneId`. */
export function nextSceneHeaderLine(
    log: string,
    kind: SceneKindChoice,
    context: string,
    thread?: number,
): { id: string; line: string } {
    const id = nextSceneId(sceneIdsInLog(log), kind, thread);
    return { id, line: formatSceneHeader({ id, context }, 'digital') };
}

/** Helper for tests and the view: a session end block built from user-typed lines. */
export function sessionEndFromLines(number: number | undefined, lines: readonly string[]): SessionEnd {
    const end: SessionEnd = { entries: parseLogLines(lines) };
    if (number !== undefined) end.number = number;
    return end;
}
