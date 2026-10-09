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
	formatCampaignHeader,
	formatInterlude,
	formatSessionEnd,
	formatSessionHeader,
	parsePartylogLine,
	parsePartylogLog,
	replayPartylogLog,
} from './partylog';
import type { CampaignHeader, FormatStyle, Interlude, PartylogEntry, PartylogState, SessionHeader } from './partylog';

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

function pcLines(session: CampaignSession, state: PartylogState): string[] {
	const lines: string[] = [];
	const written = new Set<string>();
	for (const member of session.partyState ?? []) {
		const name = cleanTagText(member.characterName);
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
	for (const raw of session.partyCharacterNames ?? []) {
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

function factionLines(session: CampaignSession, state: PartylogState): string[] {
	const lines: string[] = [];
	for (const standing of session.groupStandings ?? []) {
		const name = cleanTagText(standing.groupName ?? standing.groupId ?? '');
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
		if (kind === 'timer') lines.push(`[Timer:${name} ${Math.trunc(clock.current)}]`);
		else lines.push(`[${kind === 'track' ? 'Track' : 'Clock'}:${name} ${Math.trunc(clock.current)}/${Math.trunc(clock.segments)}]`);
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
export function sessionSnapshotLines(session: CampaignSession, state: PartylogState, warnings: string[] = []): string[] {
	return [
		...pcLines(session, state),
		...partyLine(session, state, warnings),
		...factionLines(session, state),
		...progressLines(session),
		...threadLines(session),
		...lootLines(session, state),
	];
}

/** Partylog section 5.1 campaign header. Keys are spelled for the chosen style. */
function campaignHeader(input: PartylogExportInput, style: FormatStyle): CampaignHeader {
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
		for (const line of pcLines(last.session, createPartylogState())) {
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

function sessionChunk(entry: PartylogExportSession, state: PartylogState, style: FormatStyle, warnings: string[]): { text: string; state: PartylogState } {
	const { session } = entry;
	const blocks: string[] = [];
	for (const interlude of session.interludes ?? []) blocks.push(formatInterlude(interludeOf(interlude), style));
	blocks.push(formatSessionHeader(sessionHeaderOf(session), style));
	const body = normalizeLogBody(entry.logBody);
	if (body) blocks.push(body);
	const prefix = blocks.join('\n\n');
	let next = replayText(prefix, state);

	const endEntries: PartylogEntry[] = [];
	for (const summary of session.advancements ?? []) {
		const character = cleanTagText(summary.character);
		const text = cleanTagText(summary.summary);
		if (character) endEntries.push(parsePartylogLine(tagLine('Advance', text ? [character, text] : [character])));
	}
	for (const line of sessionSnapshotLines(session, next, warnings)) endEntries.push(parsePartylogLine(line));
	if (session.hook && collapseLine(session.hook)) endEntries.push({ kind: 'meta', type: 'hook', text: collapseLine(session.hook) });
	if (session.endNotes && collapseLine(session.endNotes)) endEntries.push({ kind: 'meta', type: 'note', text: collapseLine(session.endNotes) });

	const parts = [prefix];
	if (endEntries.length > 0) {
		const endText = formatSessionEnd({ number: session.sessionNumber, entries: endEntries }, style);
		parts.push(endText);
		next = replayText(endText, next);
	}
	return { text: parts.join('\n\n'), state: next };
}

/**
 * Builds the Partylog document for the given sessions, in the given order. Each session's
 * replayed state is carried into the next session's snapshot.
 */
export function buildPartylogExport(input: PartylogExportInput): PartylogExportResult {
	const style: FormatStyle = input.style ?? 'digital';
	const warnings: string[] = [];
	let state = createPartylogState();
	const chunks: string[] = [];
	for (const entry of input.sessions) {
		const result = sessionChunk(entry, state, style, warnings);
		chunks.push(result.text);
		state = result.state;
	}
	const head = [formatCampaignHeader(campaignHeader(input, style), style)];
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
