/*
 * Partylog export: writes campaign sessions as a Partylog log (spec sections 5.1 to 5.5).
 *
 * Partylog by Roberto Bisceglie (Loreseed Workshop), a fork of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 *
 * Layout of the output:
 * - Campaign front matter (story name, players, start and last dates, PCs with HP tags).
 * - For each session, in order: interludes recorded since the previous session, the session
 *   header, the session's log body, then an end block. The end block holds advancements,
 *   a closing state snapshot as tags (PCs, party resources, factions, trackers, threads,
 *   loot), and the hook and debrief notes.
 *
 * The snapshot is written so the log replays to the session's own fields. Absolute values
 * (HP, party resources, trackers, thread states) are safe to replay. Labels and loot are not
 * idempotent, so the snapshot is computed against the state the log body already produces:
 * stale labels are removed with `-label` and loot is added or removed by the difference.
 */
import type { CampaignInterlude, CampaignSession } from '../types';
import { standingForRelationshipType, threadKindOf, threadStateOf, trackerKindOf } from '../utils/CampaignModel';
import {
	createPartylogState,
	entryTags,
	fenceRunLength,
	formatCampaignHeader,
	formatEntry,
	formatInterlude,
	formatSceneHeader,
	formatSessionEnd,
	formatSessionHeader,
	parsePartylogLine,
	parsePartylogLog,
	replayPartylogLog,
} from './partylog';
import type { AdvanceTag, CampaignHeader, FormatStyle, Interlude, MetaEntry, PartylogEntry, PartylogState, SessionHeader } from './partylog';
import {
	memberNameOf,
	partyCharacterNamesOf,
	standingGroupName,
	upsertSessionHeaderBlock,
} from './PartylogSessionBridge';
import type { PartylogBridgeContext } from './PartylogSessionBridge';

/** One session to export: the model fields plus the stored `## Session Log` body. */
export interface PartylogExportSession {
	session: CampaignSession;
	logBody: string;
}

export interface PartylogExportInput {
	/** Story name, used as the campaign title. */
	title: string;
	sessions: PartylogExportSession[];
	style?: FormatStyle;
	/** Story groups and characters, used to name legacy records that only hold ids. */
	context?: PartylogBridgeContext;
}

export interface PartylogExportResult {
	markdown: string;
	/** Values that could not be written in Partylog form and were left out. */
	warnings: string[];
}

const PARTY_KEY = /^[A-Za-z][A-Za-z0-9' ]*$/;

/**
 * Product name as written in UI text. Kept capitalised; the sentence-case lint rule does not
 * know this brand, so UI strings use it through this constant.
 */
export const PARTYLOG_NAME = 'Partylog';

/** Makes free text safe inside a tag segment or a name. */
export function cleanTagText(text: string | undefined): string {
	return (text ?? '')
		.replace(/\s*:\s*/g, ' - ')
		.replace(/[[\]|\r\n]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function sameKey(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

function tagLine(kind: string, parts: string[]): string {
	return `[${kind}:${parts.join('|')}]`;
}

function ownValue<T>(dict: Record<string, T>, key: string): T | undefined {
	return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
}

function sanitizeKeyed(value: string): string {
	return cleanTagText(value).replace(/,/g, ';');
}

/** Writes `HP 12/34` for a gauge with a maximum, `HP 12` otherwise. */
function gaugeText(key: string, current: number, max: number | undefined): string {
	return max !== undefined && max > 0 ? `${key} ${current}/${max}` : `${key} ${current}`;
}

function pcLines(session: CampaignSession, state: PartylogState, ctx: PartylogBridgeContext): string[] {
	const lines: string[] = [];
	const written = new Set<string>();
	for (const member of session.partyState ?? []) {
		const name = cleanTagText(memberNameOf(member, ctx));
		if (!name || written.has(name.toLowerCase())) continue;
		written.add(name.toLowerCase());
		const conditions = (member.conditions ?? []).map((condition) => cleanTagText(condition)).filter((c) => c.length > 0);
		const parts = [name, gaugeText('HP', member.currentHp, member.maxHp)];
		if (member.tempHp !== undefined && member.tempHp > 0) parts.push(`temp HP ${member.tempHp}`);
		parts.push(...conditions);
		const replayed = ownValue(state.pcs, name);
		const stale = replayed ? replayed.labels.filter((label) => !conditions.some((c) => sameKey(c, label))) : [];
		parts.push(...stale.map((label) => `-${cleanTagText(label)}`));
		lines.push(tagLine('PC', parts));
	}
	for (const raw of partyCharacterNamesOf(session, ctx)) {
		const name = cleanTagText(raw);
		if (!name || written.has(name.toLowerCase())) continue;
		written.add(name.toLowerCase());
		lines.push(tagLine('PC', [name]));
	}
	return lines;
}

function partyLine(session: CampaignSession, state: PartylogState, warnings: string[]): string[] {
	const fields: string[] = [];
	for (const [rawKey, value] of Object.entries(session.partyResources ?? {})) {
		const key = cleanTagText(rawKey);
		if (!PARTY_KEY.test(key)) {
			warnings.push(`Party resource "${rawKey}" has no Partylog-safe name and was left out.`);
			continue;
		}
		if (typeof value === 'number') {
			if (Number.isFinite(value)) fields.push(`${key} ${Math.trunc(value)}`);
		} else {
			const text = sanitizeKeyed(value);
			if (text) fields.push(`${key}:${text}`);
		}
	}
	const flags = (session.flags ?? []).map((flag) => cleanTagText(flag)).filter((flag) => flag.length > 0);
	const stale = state.party.labels.filter((label) => !flags.some((flag) => sameKey(flag, label)));
	fields.push(...flags.map((flag) => `+${flag}`), ...stale.map((label) => `-${cleanTagText(label)}`));
	return fields.length > 0 ? [tagLine('Party', fields)] : [];
}

function factionLines(session: CampaignSession, state: PartylogState, ctx: PartylogBridgeContext): string[] {
	const lines: string[] = [];
	for (const standing of session.groupStandings ?? []) {
		const name = cleanTagText(standingGroupName(standing, ctx) ?? '');
		if (!name) continue;
		const parts = [name];
		if (standing.tier !== undefined) parts.push(`tier:${Math.trunc(standing.tier)}`);
		const text = standing.standing ?? (standing.relationshipType ? standingForRelationshipType(standing.relationshipType) : undefined);
		if (text && sanitizeKeyed(text)) parts.push(`standing:${sanitizeKeyed(text)}`);
		const notes = (standing.statusNotes ?? []).map((note) => cleanTagText(note)).filter((note) => note.length > 0);
		parts.push(...notes.map((note) => `+${note}`));
		const replayed = ownValue(state.factions, name);
		if (replayed) {
			parts.push(...replayed.labels.filter((label) => !notes.some((n) => sameKey(n, label))).map((label) => `-${cleanTagText(label)}`));
		}
		lines.push(tagLine('Faction', parts));
	}
	return lines;
}

function progressLines(session: CampaignSession): string[] {
	const lines: string[] = [];
	for (const clock of session.clocks ?? []) {
		const name = cleanTagText(clock.name);
		if (!name) continue;
		const kind = trackerKindOf(clock);
		// The maximum is always written, so a re-import keeps the segment count.
		const label = kind === 'timer' ? 'Timer' : kind === 'track' ? 'Track' : 'Clock';
		lines.push(`[${label}:${name} ${Math.trunc(clock.current)}/${Math.trunc(clock.segments)}]`);
	}
	return lines;
}

function threadLines(session: CampaignSession): string[] {
	const lines: string[] = [];
	for (const thread of session.threads ?? []) {
		const name = cleanTagText(thread.name);
		if (!name) continue;
		const kind = threadKindOf(thread);
		const head = kind === 'goal' ? 'Goal' : kind === 'quest' ? 'Quest' : 'Thread';
		const state = cleanTagText(threadStateOf(thread));
		lines.push(tagLine(head, state ? [name, state] : [name]));
	}
	return lines;
}

/**
 * Loot lines that bring the stash to the session's loot, given the stash the log body
 * already produces. Quantities are added or removed by difference, so replaying the log
 * does not double count.
 */
function lootLines(session: CampaignSession, state: PartylogState): string[] {
	const lines: string[] = [];
	const stash = state.loot.stash;
	const items = session.loot ?? [];
	const assigned = items.filter((item) => cleanTagText(item.assignedTo).length > 0);
	const assignedNames = new Set(assigned.map((item) => cleanTagText(item.name).toLowerCase()));
	const unassigned = items.filter((item) => cleanTagText(item.assignedTo).length === 0 && cleanTagText(item.name).length > 0);
	const wanted = new Set<string>();

	for (const item of unassigned) {
		const name = cleanTagText(item.name);
		const want = item.qty ?? 1;
		if (want <= 0) continue;
		wanted.add(name.toLowerCase());
		const have = stash.find((entry) => sameKey(entry.name, name));
		const haveQty = have ? (have.quantity ?? 1) : 0;
		if (!have) {
			lines.push(want > 1 ? `[Loot: ${name} x${want}]` : `[Loot: ${name}]`);
		} else if (want > haveQty) {
			lines.push(`[Loot: ${name} x${want - haveQty}]`);
		} else if (want < haveQty) {
			lines.push(`[Loot: -${name} x${haveQty - want}]`);
		}
	}
	for (const entry of stash) {
		const key = entry.name.toLowerCase();
		if (wanted.has(key) || assignedNames.has(key)) continue;
		lines.push(`[Loot: -${cleanTagText(entry.name)}]`);
	}
	for (const item of assigned) {
		const name = cleanTagText(item.name);
		const to = cleanTagText(item.assignedTo);
		const pc = ownValue(state.pcs, to);
		const claimed = pc ? pc.items.some((existing) => sameKey(existing, name)) : false;
		const inStash = stash.some((entry) => sameKey(entry.name, name));
		if (name && to && (inStash || !claimed)) lines.push(`[Loot: ${name}|to:${to}]`);
	}
	return lines;
}

/**
 * The closing snapshot for one session, as Partylog lines, given the state that the log body
 * and interludes already produce.
 */
export function sessionSnapshotLines(
	session: CampaignSession,
	state: PartylogState,
	warnings: string[] = [],
	ctx: PartylogBridgeContext = {},
): string[] {
	return [
		...pcLines(session, state, ctx),
		...partyLine(session, state, warnings),
		...factionLines(session, state, ctx),
		...progressLines(session),
		...threadLines(session),
		...lootLines(session, state),
	];
}

/** Partylog section 5.1 campaign header. Keys are spelled for the chosen style. */
function campaignHeader(input: PartylogExportInput, style: FormatStyle, ctx: PartylogBridgeContext): CampaignHeader {
	const dates = input.sessions.map((entry) => entry.session.date).filter((date): date is string => !!date);
	const players: string[] = [];
	for (const entry of input.sessions) {
		for (const player of entry.session.players ?? []) {
			const text = cleanTagText(player);
			if (text && !players.some((existing) => sameKey(existing, text))) players.push(text);
		}
	}
	const keys = style === 'analog'
		? { start: 'Start Date', last: 'Last Update', players: 'Players' }
		: { start: 'start_date', last: 'last_update', players: 'players' };
	const fields: Record<string, string> = {};
	if (players.length > 0) fields[keys.players] = players.join(', ');
	if (dates.length > 0) {
		fields[keys.start] = dates[0];
		fields[keys.last] = dates[dates.length - 1];
	}
	const last = input.sessions[input.sessions.length - 1];
	const pcs: string[] = [];
	if (last) {
		for (const line of pcLines(last.session, createPartylogState(), ctx)) {
			const name = line.slice('[PC:'.length).replace(/\]$/, '').split('|')[0];
			pcs.push(`${name} ${line}`);
		}
	}
	return { title: cleanTagText(input.title) || 'Campaign', fields, pcs };
}

/** Strips list bullets from stored log lines and trims the first line so it cannot continue a header. */
export function normalizeLogBody(body: string): string {
	const lines = body.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/^\s*-\s+(?=\S)/, '').replace(/\s+$/, ''));
	const collapsed: string[] = [];
	for (const line of lines) {
		if (line === '' && (collapsed.length === 0 || collapsed[collapsed.length - 1] === '')) continue;
		collapsed.push(line);
	}
	while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') collapsed.pop();
	if (collapsed.length > 0) collapsed[0] = collapsed[0].replace(/^\s+/, '');
	return collapsed.join('\n');
}

function replayText(text: string, state: PartylogState): PartylogState {
	return replayPartylogLog(parsePartylogLog(text), state);
}

function sessionHeaderOf(session: CampaignSession): SessionHeader {
	const header: SessionHeader = {
		players: (session.players ?? []).map((player) => cleanTagText(player)).filter((p) => p.length > 0),
		absent: (session.absent ?? []).map((player) => cleanTagText(player)).filter((p) => p.length > 0),
		threads: [],
	};
	if (session.sessionNumber !== undefined) header.number = session.sessionNumber;
	if (session.date) header.date = collapseLine(session.date);
	if (session.duration) header.duration = collapseLine(session.duration);
	if (session.scribe) header.scribe = collapseLine(session.scribe);
	if (session.mood) header.mood = collapseLine(session.mood);
	if (session.recap) header.recap = collapseLine(session.recap);
	if (session.goals) header.goals = collapseLine(session.goals);
	return header;
}

function collapseLine(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function interludeOf(interlude: CampaignInterlude): Interlude {
	const entries: PartylogEntry[] = [];
	if (interlude.summary && collapseLine(interlude.summary)) {
		entries.push({ kind: 'meta', type: 'note', text: collapseLine(interlude.summary) });
	}
	for (const change of interlude.changes ?? []) {
		const line = collapseLine(change);
		if (line) entries.push(parsePartylogLine(line));
	}
	return { title: collapseLine(interlude.title) || 'Interlude', entries };
}

const ANALOG_BLOCK_HEADING = /^(#{1,6}\s|=== |--- )/;

/** Lower-case, single-spaced text with trailing punctuation dropped, for comparing stored lines. */
function normalizeText(text: string): string {
	return text.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[.!?;:,\s]+(?=\)?$)/, '');
}

/** Identity of an Advance tag: the same character, summary and gains are the same advancement. */
function advanceKey(tag: AdvanceTag): string {
	return normalizeText([tag.name, tag.detail ?? '', ...tag.gains].join('|'));
}

function metaKey(entry: MetaEntry): string {
	return `${entry.type}:${normalizeText(entry.text)}`;
}

/** What the stored log body already holds, so the export writes only the missing blocks and lines. */
interface StoredLog {
	/** Lower-case titles of the interludes in the body. */
	interludeTitles: Set<string>;
	hasHeader: boolean;
	hasEnd: boolean;
	advances: Set<string>;
	metas: Set<string>;
	/** Normalised lines of the body's end block. */
	endLines: Set<string>;
}

function inspectStoredLog(body: string): StoredLog {
	const stored: StoredLog = { interludeTitles: new Set(), hasHeader: false, hasEnd: false, advances: new Set(), metas: new Set(), endLines: new Set() };
	const parsed = parsePartylogLog(body);
	const noteEntries = (entries: PartylogEntry[]): void => {
		for (const entry of entries) {
			if (entry.kind === 'meta') stored.metas.add(metaKey(entry));
			for (const tag of entryTags(entry)) {
				if (tag.kind === 'Advance') stored.advances.add(advanceKey(tag));
			}
		}
	};
	for (const item of parsed.sequence) {
		switch (item.kind) {
			case 'session':
				stored.hasHeader = true;
				break;
			case 'interlude':
				stored.interludeTitles.add(normalizeText(item.interlude.title));
				noteEntries(item.interlude.entries);
				break;
			case 'scene':
				noteEntries(item.scene.entries);
				break;
			case 'session-end':
				stored.hasEnd = true;
				noteEntries(item.end.entries);
				break;
		}
	}
	const span = endBlockSpan(body.split('\n'));
	if (span) {
		for (const line of span.content) {
			const text = normalizeText(line);
			if (text) stored.endLines.add(text);
		}
	}
	return stored;
}

/** True when the stored log already has this entry, so exporting it again would duplicate it. */
function storedAlready(entry: PartylogEntry, stored: StoredLog): boolean {
	if (entry.kind === 'meta') return stored.metas.has(metaKey(entry));
	const advances = entryTags(entry).filter((tag): tag is AdvanceTag => tag.kind === 'Advance');
	if (advances.length > 0) return advances.every(tag => stored.advances.has(advanceKey(tag)));
	return stored.endLines.has(normalizeText(formatEntry(entry)));
}

/**
 * The end block of a stored log: where its content lines are, and the line index at which new
 * entries go (before a digital closing fence, or at the end of the block).
 */
function endBlockSpan(lines: string[]): { insertAt: number; content: string[] } | undefined {
	const start = lines.findIndex(line => /^(### End of Session\b|--- End of Session\b)/.test(line.trim()));
	if (start < 0) return undefined;
	if (/^###/.test(lines[start].trim())) {
		let first = start + 1;
		while (first < lines.length && lines[first].trim() === '') first++;
		const fence = first < lines.length ? fenceRunLength(lines[first]) : 0;
		if (fence > 0) {
			const closing = '`'.repeat(fence);
			let close = first + 1;
			while (close < lines.length && lines[close].trim() !== closing) close++;
			return { insertAt: close, content: lines.slice(first + 1, close) };
		}
	}
	let end = start + 1;
	while (end < lines.length && !ANALOG_BLOCK_HEADING.test(lines[end].trim())) end++;
	while (end > start + 1 && lines[end - 1].trim() === '') end--;
	return { insertAt: end, content: lines.slice(start + 1, end) };
}

/** Adds entry lines at the end of the stored log's end block. */
function appendToEndBlock(body: string, lines: string[]): string {
	const text = body.split('\n');
	const span = endBlockSpan(text);
	if (!span) return body;
	text.splice(span.insertAt, 0, ...lines);
	return text.join('\n');
}

/**
 * Converts the stored log's digital headings to the analog forms: session header fields, scene
 * headings, `=== Session N ===`, `--- End of Session N ---` and `=== Interlude: title ===`. Fences
 * under the converted end and interlude headings are dropped, since analog blocks are not fenced.
 */
export function analogLogBody(body: string): string {
	let text = body;
	const parsed = parsePartylogLog(text);
	if (parsed.sessionHeader) text = upsertSessionHeaderBlock(text, parsed.sessionHeader, 'analog');
	const out: string[] = [];
	let pendingFence = false;
	let fence = 0;
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (fence > 0) {
			if (trimmed === '`'.repeat(fence)) fence = 0;
			else out.push(line);
			continue;
		}
		if (pendingFence) {
			if (trimmed === '') continue;
			pendingFence = false;
			const opening = fenceRunLength(trimmed);
			if (opening > 0) {
				fence = opening;
				continue;
			}
		}
		let match = /^###\s+End of Session(?:\s+(\d+))?\s*$/.exec(trimmed);
		if (match) {
			out.push(`--- End of Session${match[1] ? ` ${match[1]}` : ''} ---`);
			pendingFence = true;
			continue;
		}
		match = /^##\s+Interlude:\s*(.*?)\s*$/.exec(trimmed);
		if (match) {
			out.push(`=== Interlude: ${match[1]} ===`);
			pendingFence = true;
			continue;
		}
		match = /^##\s+Session(?:\s+(\d+))?\s*$/.exec(trimmed);
		if (match) {
			out.push(`=== Session${match[1] ? ` ${match[1]}` : ''} ===`);
			continue;
		}
		match = /^###\s+((?:T\d+-)?S\d+(?:\.\d+|[a-z])?)(?:\s+\*(.*)\*)?\s*$/.exec(trimmed);
		if (match) {
			out.push(formatSceneHeader({ id: match[1], context: match[2] ?? '' }, 'analog'));
			continue;
		}
		out.push(line);
	}
	return out.join('\n');
}

function sessionChunk(
	entry: PartylogExportSession,
	state: PartylogState,
	style: FormatStyle,
	warnings: string[],
	ctx: PartylogBridgeContext,
): { text: string; state: PartylogState } {
	const { session } = entry;
	const normalized = normalizeLogBody(entry.logBody);
	const body = style === 'analog' && normalized ? analogLogBody(normalized) : normalized;
	const stored = inspectStoredLog(body);

	const leading: string[] = [];
	for (const interlude of session.interludes ?? []) {
		if (stored.interludeTitles.has(normalizeText(collapseLine(interlude.title) || 'Interlude'))) continue;
		leading.push(formatInterlude(interludeOf(interlude), style));
	}
	if (!stored.hasHeader) leading.push(formatSessionHeader(sessionHeaderOf(session), style));
	const prefixBlocks = [...leading, body].filter(block => block.length > 0);
	const before = replayText(prefixBlocks.join('\n\n'), state);

	const endEntries: PartylogEntry[] = [];
	for (const summary of session.advancements ?? []) {
		const character = cleanTagText(summary.character);
		const text = cleanTagText(summary.summary);
		if (character) endEntries.push(parsePartylogLine(tagLine('Advance', text ? [character, text] : [character])));
	}
	for (const line of sessionSnapshotLines(session, before, warnings, ctx)) endEntries.push(parsePartylogLine(line));
	if (session.hook && collapseLine(session.hook)) endEntries.push({ kind: 'meta', type: 'hook', text: collapseLine(session.hook) });
	if (session.endNotes && collapseLine(session.endNotes)) endEntries.push({ kind: 'meta', type: 'note', text: collapseLine(session.endNotes) });
	const fresh = endEntries.filter(endEntry => !storedAlready(endEntry, stored));

	if (fresh.length === 0) return { text: prefixBlocks.join('\n\n'), state: before };
	const endState = formatSessionEnd({ number: session.sessionNumber, entries: fresh }, style);
	if (stored.hasEnd) {
		// The stored log already has an end block: its missing lines go into that block.
		const blocks = [...leading, appendToEndBlock(body, fresh.map(formatEntry))].filter(block => block.length > 0);
		return { text: blocks.join('\n\n'), state: replayText(endState, before) };
	}
	return { text: [...prefixBlocks, endState].join('\n\n'), state: replayText(endState, before) };
}

/**
 * Builds the Partylog document for the given sessions, in the given order. Each session's
 * replayed state is carried into the next session's snapshot.
 */
export function buildPartylogExport(input: PartylogExportInput): PartylogExportResult {
	const style: FormatStyle = input.style ?? 'digital';
	const ctx: PartylogBridgeContext = input.context ?? {};
	const warnings: string[] = [];
	let state = createPartylogState();
	const chunks: string[] = [];
	for (const entry of input.sessions) {
		const result = sessionChunk(entry, state, style, warnings, ctx);
		chunks.push(result.text);
		state = result.state;
	}
	const head = [formatCampaignHeader(campaignHeader(input, style, ctx), style)];
	if (style === 'digital') head.push(`# ${cleanTagText(input.title) || 'Campaign'}`);
	return { markdown: [...head, ...chunks].join('\n\n') + '\n', warnings };
}

/** Characters that cannot appear in a file name on common platforms. */
export function safeFileBase(text: string): string {
	return text.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Partylog export';
}

/**
 * First free path for `base` in `folder`: `folder/base.md`, then `folder/base (2).md`, and so
 * on. `exists` reports whether a vault path is taken.
 */
export function uniqueExportPath(folder: string, base: string, exists: (path: string) => boolean): string {
	const clean = safeFileBase(base);
	let candidate = `${folder}/${clean}.md`;
	let counter = 2;
	while (exists(candidate)) {
		candidate = `${folder}/${clean} (${counter}).md`;
		counter++;
	}
	return candidate;
}
