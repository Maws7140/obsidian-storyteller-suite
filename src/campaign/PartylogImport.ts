/*
 * Partylog import: plans how a Partylog or Lonelog log becomes vault entities and campaign
 * sessions, then applies the items the user kept. The planner is pure. The applier writes
 * through injected ports, so it can be tested without Obsidian.
 *
 * Partylog by Roberto Bisceglie (Loreseed Workshop), a fork of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Mapping rules (replayed state at the end of each session):
 * - `[PC:]` becomes a Character, and the session's party members.
 * - `[N:]` and `[F:]` become Characters. Their labels, keyed fields and stats go to `status`.
 * - `[L:]` becomes a Location. Its state goes to `status`.
 * - `[Faction:]` becomes a Group. Tier and standing are kept on the session's group standings,
 *   and the standing also goes to the group's `status`.
 * - `[Loot:]`, `[Inv:]` and claimed PC items become PlotItems. Stash and claims are kept on the
 *   session's loot list.
 * - Clocks, tracks and timers, threads, goals and quests, party resources and flags, and
 *   advancements are copied onto the session.
 * - Each Partylog session becomes one campaign session. Its body is the scene and prose lines.
 *   Interludes before it are kept on it.
 *
 * Existing entities match by name, case-insensitively. Nothing is deleted.
 */
import type { Character, CampaignClock, CampaignGroupStanding, CampaignInterlude, CampaignLootItem, CampaignSession, CampaignThread, CampaignThreadKind, CampaignTrackerKind, Group, Location, PartyMemberState, PlotItem } from '../types';
import { clampTrackerSegments, defaultThreadState } from '../utils/CampaignModel';
import {
	applyTagUpdates,
	createPartylogState,
	entryTags,
	formatEntry,
	formatSceneHeader,
	parsePartylogLog,
} from './partylog';
import type { EntityState, Interlude, NamedState, ParsedLog, ParsedScene, PartylogEntry, PartylogState, ProgressState, SessionHeader } from './partylog';

export interface ImportExistingData {
	storyId: string;
	characters: Character[];
	locations: Location[];
	groups: Group[];
	items: PlotItem[];
	sessionNames: string[];
	/** Log bodies already stored in the story's session notes, from `sessionLogBodyOf`. */
	sessionLogBodies?: string[];
}

export interface ImportPlanOptions {
	/** Used in the session name when the log has no session number, e.g. the note's file name. */
	sourceName?: string;
	/** Creates new ids. Defaults to a time and random based id. */
	createId?: (prefix: string) => string;
}

/** A campaign session before its character and group ids are known. */
export interface PlannedSession {
	session: CampaignSession;
	body: string;
	partyMembers: Array<{ name: string; currentHp: number; maxHp: number; tempHp?: number; conditions: string[] }>;
	factions: CampaignGroupStanding[];
}

export type ImportPayload =
	| { kind: 'character'; character: Character }
	| { kind: 'location'; location: Location }
	| { kind: 'group'; name: string; status?: string; group?: Group }
	| { kind: 'item'; item: PlotItem }
	| { kind: 'session'; planned: PlannedSession };

export interface ImportPlanItem {
	id: string;
	kind: 'character' | 'location' | 'group' | 'item' | 'session';
	action: 'create' | 'update';
	name: string;
	/** One line for the preview. */
	detail: string;
	selected: boolean;
	payload: ImportPayload;
}

export interface ImportPlan {
	title?: string;
	/** Party member names from the campaign header. */
	pcs: string[];
	items: ImportPlanItem[];
	/** Ids of existing characters and groups that the plan refers to, keyed by lower-case name. */
	knownCharacterIds: Map<string, string>;
	knownGroupIds: Map<string, string>;
	warnings: string[];
}

/** Product name as written in UI text. See PARTYLOG_NAME in PartylogExport.ts. */
export const LONELOG_NAME = 'Lonelog';

function keyOf(name: string): string {
	return name.trim().toLowerCase();
}

function defaultId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Entity text for `status`: labels, keyed fields and stats. Gauges such as HP stay in the session. */
function describeParts(entity: EntityState): string[] {
	const parts: string[] = entity.labels.slice();
	for (const key of Object.keys(entity.props)) parts.push(`${key}: ${entity.props[key].join(', ')}`);
	for (const key of Object.keys(entity.stats)) parts.push(`${key} ${entity.stats[key]}`);
	return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Adds the parts that a status string does not already list. Parts are separated by `;` in a status,
 * and a part may itself contain commas (for example `Allies: Rohan, Gondor`), so whole parts are compared.
 * Returns undefined when nothing is new.
 */
export function mergeStatus(existing: string | undefined, parts: string[]): { value: string; added: string[] } | undefined {
	const listed = (existing ?? '').split(';').map((part) => part.trim().toLowerCase()).filter((part) => part.length > 0);
	const added = parts.filter((part) => !listed.includes(part.trim().toLowerCase()));
	if (added.length === 0) return undefined;
	const base = (existing ?? '').trim();
	return { value: [base, ...added].filter((part) => part.length > 0).join('; '), added };
}

function interludeOf(interlude: Interlude): CampaignInterlude {
	const summaries: string[] = [];
	const changes: string[] = [];
	for (const entry of interlude.entries) {
		if (entry.kind === 'blank') continue;
		if (entry.kind === 'meta' && entry.type === 'note') summaries.push(entry.text);
		else changes.push(formatEntry(entry));
	}
	const result: CampaignInterlude = { title: interlude.title };
	if (summaries.length > 0) result.summary = summaries.join(' ');
	if (changes.length > 0) result.changes = changes;
	return result;
}

/** Lines of scenes and prose, as stored in the session's log body. */
export function logBodyFromScenes(scenes: ParsedScene[]): string {
	const blocks: string[] = [];
	for (const scene of scenes) {
		const lines: string[] = [];
		if (scene.id) lines.push(formatSceneHeader({ id: scene.id, context: scene.context }, 'digital'));
		for (const entry of scene.entries) {
			if (entry.kind === 'blank') continue;
			lines.push(formatEntry(entry));
		}
		if (lines.length > 0) blocks.push(lines.join('\n'));
	}
	return blocks.join('\n\n');
}

interface SessionRecord {
	header?: SessionHeader;
	interludes: Interlude[];
	scenes: ParsedScene[];
	endEntries: PartylogEntry[];
	advancementsBefore: number;
	stateAfter: PartylogState;
}

/** Splits the log into sessions and replays it in document order. */
function collectRecords(parsed: ParsedLog): { records: SessionRecord[]; state: PartylogState } {
	let state = createPartylogState();
	const records: SessionRecord[] = [];
	let pending: Interlude[] = [];
	let current: Omit<SessionRecord, 'stateAfter'> | undefined;

	const finish = (): void => {
		if (!current) return;
		records.push({ ...current, stateAfter: state });
		current = undefined;
	};
	const open = (header?: SessionHeader): Omit<SessionRecord, 'stateAfter'> => {
		const record = { header, interludes: pending, scenes: [], endEntries: [], advancementsBefore: state.advancements.length };
		pending = [];
		return record;
	};
	const replay = (entries: PartylogEntry[]): void => {
		for (const entry of entries) state = applyTagUpdates(state, entryTags(entry));
	};

	for (const item of parsed.sequence) {
		switch (item.kind) {
			case 'session':
				finish();
				current = open(item.header);
				break;
			case 'scene':
				if (!current) current = open();
				current.scenes.push(item.scene);
				replay(item.scene.entries);
				break;
			case 'session-end':
				if (!current) current = open();
				current.endEntries.push(...item.end.entries);
				replay(item.end.entries);
				break;
			case 'interlude':
				finish();
				replay(item.interlude.entries);
				pending.push(item.interlude);
				break;
		}
	}
	finish();
	if (pending.length > 0 && records.length > 0) {
		const last = records[records.length - 1];
		last.interludes = [...last.interludes, ...pending];
	}
	return { records, state };
}

function normalizeLogBody(body: string): string {
	return body.replace(/\r\n/g, '\n').trim();
}

function sessionName(record: SessionRecord, index: number, count: number, taken: Set<string>, sourceName?: string): string {
	const number = record.header?.number;
	let base: string;
	if (number !== undefined) base = `Session ${number}`;
	else if (sourceName) base = `Imported ${sourceName}`;
	else base = count > 1 ? `Imported session ${index + 1}` : 'Imported session';
	let candidate = base;
	if (taken.has(keyOf(candidate))) candidate = `${base} (imported)`;
	let counter = 2;
	while (taken.has(keyOf(candidate))) {
		candidate = `${base} (imported ${counter})`;
		counter++;
	}
	taken.add(keyOf(candidate));
	return candidate;
}

function progressClocks(state: PartylogState, createId: (prefix: string) => string): CampaignClock[] {
	const sources: Array<[Record<string, ProgressState>, CampaignTrackerKind]> = [
		[state.clocks, 'clock'],
		[state.tracks, 'track'],
		[state.timers, 'timer'],
	];
	const clocks: CampaignClock[] = [];
	for (const [map, kind] of sources) {
		for (const name of Object.keys(map)) {
			const progress = map[name];
			const segments = clampTrackerSegments(progress.max ?? progress.current, kind);
			const current = Math.max(0, Math.min(segments, progress.current));
			clocks.push({ id: createId('clock'), name, current, segments, kind });
		}
	}
	return clocks;
}

function threadRecords(state: PartylogState, createId: (prefix: string) => string): CampaignThread[] {
	const sources: Array<[Record<string, NamedState>, CampaignThreadKind]> = [
		[state.threads, 'thread'],
		[state.goals, 'goal'],
		[state.quests, 'quest'],
	];
	const threads: CampaignThread[] = [];
	for (const [map, kind] of sources) {
		for (const name of Object.keys(map)) {
			const text = map[name].state?.trim();
			threads.push({ id: createId('thread'), name, kind, state: text ? text : defaultThreadState(kind) });
		}
	}
	return threads;
}

function partyResourcesOf(state: PartylogState): Record<string, number | string> {
	const resources: Record<string, number | string> = {};
	for (const key of Object.keys(state.party.gauges)) {
		const current = state.party.gauges[key].current;
		if (current !== undefined) resources[key] = current;
	}
	for (const key of Object.keys(state.party.props)) {
		const values = state.party.props[key];
		if (values.length > 0) resources[key] = values.join(', ');
	}
	for (const key of Object.keys(state.party.stats)) resources[key] = state.party.stats[key];
	return resources;
}

function buildSessionFields(record: SessionRecord, state: PartylogState, name: string, storyId: string, createId: (prefix: string) => string): PlannedSession {
	const session: CampaignSession = { name, storyId };
	const header = record.header;
	if (header) {
		if (header.number !== undefined) session.sessionNumber = header.number;
		if (header.date) session.date = header.date;
		if (header.duration) session.duration = header.duration;
		if (header.scribe) session.scribe = header.scribe;
		if (header.mood) session.mood = header.mood;
		if (header.recap) session.recap = header.recap;
		if (header.goals) session.goals = header.goals;
		if (header.players.length > 0) session.players = header.players.slice();
		if (header.absent.length > 0) session.absent = header.absent.slice();
	}
	const hooks: string[] = [];
	const notes: string[] = [];
	for (const entry of record.endEntries) {
		if (entry.kind !== 'meta') continue;
		if (entry.type === 'hook') hooks.push(entry.text);
		if (entry.type === 'note') notes.push(entry.text);
	}
	if (hooks.length > 0) session.hook = hooks.join(' ');
	if (notes.length > 0) session.endNotes = notes.join(' ');
	if (record.interludes.length > 0) session.interludes = record.interludes.map(interludeOf);

	const pcNames = Object.keys(state.pcs);
	if (pcNames.length > 0) session.partyCharacterNames = pcNames;
	const resources = partyResourcesOf(state);
	if (Object.keys(resources).length > 0) session.partyResources = resources;
	if (state.party.labels.length > 0) session.flags = state.party.labels.slice();
	const clocks = progressClocks(state, createId);
	if (clocks.length > 0) session.clocks = clocks;
	const threads = threadRecords(state, createId);
	if (threads.length > 0) session.threads = threads;
	if (Object.keys(state.inventory).length > 0) session.partyItems = Object.keys(state.inventory);

	const loot: CampaignLootItem[] = [];
	for (const item of state.loot.stash) {
		const entry: CampaignLootItem = { name: item.name };
		if (item.quantity !== undefined && item.quantity !== 1) entry.qty = item.quantity;
		loot.push(entry);
	}
	for (const pcName of pcNames) {
		for (const item of state.pcs[pcName].items) loot.push({ name: item, assignedTo: pcName });
	}
	if (loot.length > 0) session.loot = loot;

	const advancements = state.advancements.slice(record.advancementsBefore).map((advance) => {
		const summary = [advance.detail ?? '', ...advance.gains.map((gain) => `+${gain.replace(/^\+/, '')}`)].filter((part) => part.length > 0).join(' ');
		return summary ? { character: advance.pc, summary } : { character: advance.pc, summary: 'advanced' };
	});
	if (advancements.length > 0) session.advancements = advancements;

	const partyMembers: PlannedSession['partyMembers'] = [];
	for (const pcName of pcNames) {
		const pc = state.pcs[pcName];
		const hp = pc.gauges.HP;
		if (!hp || hp.current === undefined) continue;
		const member: PlannedSession['partyMembers'][number] = {
			name: pcName,
			currentHp: hp.current,
			maxHp: hp.max ?? hp.current,
			conditions: pc.labels.slice(),
		};
		const temp = pc.gauges['temp HP'];
		if (temp && temp.current !== undefined) member.tempHp = temp.current;
		partyMembers.push(member);
	}

	const factions: CampaignGroupStanding[] = [];
	for (const key of Object.keys(state.factions)) {
		const faction = state.factions[key];
		const standing: CampaignGroupStanding = { groupName: faction.name, value: 0 };
		if (faction.tier !== undefined) standing.tier = faction.tier;
		if (faction.standing) standing.standing = faction.standing;
		if (faction.labels.length > 0) standing.statusNotes = faction.labels.slice();
		factions.push(standing);
	}

	return {
		session,
		body: logBodyFromScenes(record.scenes),
		partyMembers,
		factions,
	};
}

/**
 * Plans the import of one log. Returns the items to show in the preview. Every item starts
 * selected.
 */
export function buildImportPlan(text: string, existing: ImportExistingData, options: ImportPlanOptions = {}): ImportPlan {
	const createId = options.createId ?? defaultId;
	const parsed = parsePartylogLog(text);
	const { records, state } = collectRecords(parsed);
	const warnings: string[] = [];
	const items: ImportPlanItem[] = [];
	const knownCharacterIds = new Map<string, string>();
	const knownGroupIds = new Map<string, string>();

	const characterByKey = new Map<string, Character>();
	for (const character of existing.characters) characterByKey.set(keyOf(character.name), character);
	const locationByKey = new Map<string, Location>();
	for (const location of existing.locations) locationByKey.set(keyOf(location.name), location);
	const groupByKey = new Map<string, Group>();
	for (const group of existing.groups) groupByKey.set(keyOf(group.name), group);
	const itemByKey = new Map<string, PlotItem>();
	for (const item of existing.items) itemByKey.set(keyOf(item.name), item);

	const planned = new Set<string>();
	const addCharacter = (name: string, entity: EntityState, isPc: boolean): void => {
		const key = keyOf(name);
		if (planned.has(`character:${key}`)) return;
		planned.add(`character:${key}`);
		const parts = describeParts(entity);
		const match = characterByKey.get(key);
		if (match) {
			if (match.id) knownCharacterIds.set(key, match.id);
			const merged = mergeStatus(match.status, parts);
			if (merged) {
				items.push({
					id: `character:${key}`,
					kind: 'character',
					action: 'update',
					name: match.name,
					detail: `Add to status: ${merged.added.join(', ')}`,
					selected: true,
					payload: { kind: 'character', character: { ...match, status: merged.value } },
				});
			} else if (isPc) {
				// Nothing to write to the character: the row shows the match, and the gauges go to the session.
				items.push({
					id: `character:${key}`,
					kind: 'character',
					action: 'update',
					name: match.name,
					detail: 'Matches existing character. Gauges go to the session party state.',
					selected: false,
					payload: { kind: 'character', character: match },
				});
			}
			return;
		}
		const id = createId('character');
		const character: Character = { id, name };
		if (parts.length > 0) character.status = parts.join('; ');
		const pc = isPc ? state.pcs[name] : undefined;
		if (pc) {
			const custom: Record<string, string> = {};
			if (pc.characterClass) custom.Class = pc.characterClass;
			if (pc.level !== undefined) custom.Level = String(pc.level);
			if (Object.keys(custom).length > 0) character.customFields = custom;
		}
		items.push({
			id: `character:${key}`,
			kind: 'character',
			action: 'create',
			name,
			detail: isPc ? `New party member${character.status ? `: ${character.status}` : ''}` : `New character${character.status ? `: ${character.status}` : ''}`,
			selected: true,
			payload: { kind: 'character', character },
		});
	};

	for (const name of Object.keys(state.pcs)) addCharacter(name, state.pcs[name], true);
	for (const name of Object.keys(state.npcs)) addCharacter(name, state.npcs[name], false);
	for (const name of Object.keys(state.foes)) addCharacter(name, state.foes[name], false);
	for (const campaignPc of parsed.campaign?.pcs ?? []) {
		const name = campaignPc.split('[')[0].trim();
		if (name) addCharacter(name, { name, labels: [], props: {}, gauges: {}, stats: {} }, true);
	}

	for (const name of Object.keys(state.locations)) {
		const key = keyOf(name);
		if (planned.has(`location:${key}`)) continue;
		planned.add(`location:${key}`);
		const parts = describeParts(state.locations[name]);
		const match = locationByKey.get(key);
		if (match) {
			const merged = mergeStatus(match.status, parts);
			if (merged) {
				items.push({
					id: `location:${key}`,
					kind: 'location',
					action: 'update',
					name: match.name,
					detail: `Add to status: ${merged.added.join(', ')}`,
					selected: true,
					payload: { kind: 'location', location: { ...match, status: merged.value } },
				});
			}
			continue;
		}
		const location: Location = { id: createId('location'), name };
		if (parts.length > 0) location.status = parts.join('; ');
		items.push({
			id: `location:${key}`,
			kind: 'location',
			action: 'create',
			name,
			detail: `New location${location.status ? `: ${location.status}` : ''}`,
			selected: true,
			payload: { kind: 'location', location },
		});
	}

	for (const key of Object.keys(state.factions)) {
		const faction = state.factions[key];
		const lower = keyOf(faction.name);
		if (planned.has(`group:${lower}`)) continue;
		planned.add(`group:${lower}`);
		const match = groupByKey.get(lower);
		if (match) {
			knownGroupIds.set(lower, match.id);
			if (faction.standing && match.status !== faction.standing) {
				items.push({
					id: `group:${lower}`,
					kind: 'group',
					action: 'update',
					name: match.name,
					detail: `Set status to ${faction.standing}`,
					selected: true,
					payload: { kind: 'group', name: match.name, status: faction.standing, group: { ...match, status: faction.standing } },
				});
			}
			continue;
		}
		items.push({
			id: `group:${lower}`,
			kind: 'group',
			action: 'create',
			name: faction.name,
			detail: `New faction${faction.standing ? `: ${faction.standing}` : ''}`,
			selected: true,
			payload: { kind: 'group', name: faction.name, status: faction.standing },
		});
	}

	const itemNames: string[] = [];
	for (const entry of state.loot.stash) itemNames.push(entry.name);
	for (const pcName of Object.keys(state.pcs)) itemNames.push(...state.pcs[pcName].items);
	itemNames.push(...Object.keys(state.inventory));
	for (const name of itemNames) {
		const key = keyOf(name);
		if (planned.has(`item:${key}`) || itemByKey.has(key)) {
			planned.add(`item:${key}`);
			continue;
		}
		planned.add(`item:${key}`);
		items.push({
			id: `item:${key}`,
			kind: 'item',
			action: 'create',
			name,
			detail: 'New item from loot or inventory',
			selected: true,
			payload: { kind: 'item', item: { id: createId('item'), name, isPlotCritical: false } },
		});
	}

	const takenNames = new Set(existing.sessionNames.map(keyOf));
	const loggedBodies = new Set((existing.sessionLogBodies ?? []).map(normalizeLogBody).filter((body) => body.length > 0));
	const count = records.length;
	records.forEach((record, index) => {
		const name = sessionName(record, index, count, takenNames, options.sourceName);
		const plannedSession = buildSessionFields(record, record.stateAfter, name, existing.storyId, createId);
		const lineCount = plannedSession.body ? plannedSession.body.split('\n').length : 0;
		// A session whose log is already stored in the story was imported before: leave it unticked
		const alreadyImported = normalizeLogBody(plannedSession.body).length > 0 && loggedBodies.has(normalizeLogBody(plannedSession.body));
		items.push({
			id: `session:${index}`,
			kind: 'session',
			action: 'create',
			name,
			detail: `${record.scenes.length} scene(s), ${lineCount} body line(s), ${plannedSession.partyMembers.length} party member(s) with HP`
				+ (alreadyImported ? '. Already imported: a session with this log is in the story' : ''),
			selected: !alreadyImported,
			payload: { kind: 'session', planned: plannedSession },
		});
	});

	if (records.length === 0) warnings.push('No session or scene content was found. Only the items above, if any, would be created.');

	return {
		title: parsed.campaign?.title,
		pcs: (parsed.campaign?.pcs ?? []).map((pc) => pc.split('[')[0].trim()).filter((pc) => pc.length > 0),
		items,
		knownCharacterIds,
		knownGroupIds,
		warnings,
	};
}

/** Reads the body stored under `## Session Log` in a session note. Returns undefined when there is no such section. */
export function sessionLogBodyOf(content: string): string | undefined {
	const heading = '## Session Log';
	const index = content.indexOf(heading);
	if (index < 0) return undefined;
	const rest = content.slice(index + heading.length);
	const next = rest.search(/\n##\s/);
	return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

/** Puts `body` under `## Session Log` in a session note, keeping any later sections. */
export function withSessionLogBody(content: string, body: string): string {
	const heading = '## Session Log';
	const trimmed = body.trim();
	const section = trimmed ? `${heading}\n\n${trimmed}\n` : `${heading}\n`;
	const index = content.indexOf(heading);
	if (index < 0) return `${content.replace(/\s+$/, '')}\n\n${section}`;
	const rest = content.slice(index + heading.length);
	const next = rest.search(/\n##\s/);
	const after = next >= 0 ? rest.slice(next) : '';
	return `${content.slice(0, index)}${section}${after}`;
}

export interface ImportPorts {
	saveCharacter(character: Character): Promise<void>;
	saveLocation(location: Location): Promise<void>;
	savePlotItem(item: PlotItem): Promise<void>;
	createGroup(name: string): Promise<Group>;
	/** Finds a group of the active story by name, so a retry reuses a faction that was already created. */
	findGroupByName?(name: string): Promise<Group | undefined>;
	saveGroup(group: Group): Promise<void>;
	saveSession(session: CampaignSession): Promise<void>;
	writeSessionLog(session: CampaignSession, body: string): Promise<void>;
}

export interface ImportApplyResult {
	created: number;
	updated: number;
	sessions: number;
	errors: string[];
	/** Ids of the plan items that were saved. A caller can drop these before retrying the rest. */
	succeeded: string[];
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Builds the saved session from the plan, filling ids for the characters and groups that exist. */
function sessionForSave(planned: PlannedSession, characterIds: Map<string, string>, groupIds: Map<string, string>): CampaignSession {
	const session: CampaignSession = { ...planned.session };
	const names = session.partyCharacterNames ?? [];
	const ids = names.map((name) => characterIds.get(keyOf(name))).filter((id): id is string => !!id);
	if (ids.length > 0) session.partyCharacterIds = ids;
	const members: PartyMemberState[] = [];
	for (const member of planned.partyMembers) {
		const id = characterIds.get(keyOf(member.name));
		if (!id) continue;
		const state: PartyMemberState = { characterId: id, characterName: member.name, currentHp: member.currentHp, maxHp: member.maxHp };
		if (member.tempHp !== undefined) state.tempHp = member.tempHp;
		if (member.conditions.length > 0) state.conditions = member.conditions;
		members.push(state);
	}
	if (members.length > 0) session.partyState = members;
	if (planned.factions.length > 0) {
		session.groupStandings = planned.factions.map((standing) => {
			const groupId = groupIds.get(keyOf(standing.groupName ?? ''));
			return groupId ? { ...standing, groupId } : { ...standing };
		});
	}
	return session;
}

/**
 * Applies the selected items in order: entities first, then sessions. A failed item is
 * reported and the rest still run. Nothing is deleted.
 */
export async function applyImportPlan(plan: ImportPlan, selectedIds: ReadonlySet<string>, ports: ImportPorts): Promise<ImportApplyResult> {
	const result: ImportApplyResult = { created: 0, updated: 0, sessions: 0, errors: [], succeeded: [] };
	const characterIds = new Map(plan.knownCharacterIds);
	const groupIds = new Map(plan.knownGroupIds);
	const selected = plan.items.filter((item) => selectedIds.has(item.id));

	for (const item of selected) {
		if (item.kind === 'session') continue;
		try {
			const payload = item.payload;
			switch (payload.kind) {
				case 'character':
					await ports.saveCharacter(payload.character);
					if (payload.character.id) characterIds.set(keyOf(payload.character.name), payload.character.id);
					break;
				case 'location':
					await ports.saveLocation(payload.location);
					break;
				case 'item':
					await ports.savePlotItem(payload.item);
					break;
				case 'group': {
					if (payload.group) {
						await ports.saveGroup(payload.group);
						groupIds.set(keyOf(payload.name), payload.group.id);
					} else {
						// A faction created by an earlier run (double click or retry) is reused, not created again
						const existingId = groupIds.get(keyOf(payload.name))
							?? (await ports.findGroupByName?.(payload.name))?.id;
						if (existingId) {
							groupIds.set(keyOf(payload.name), existingId);
							break;
						}
						const created = await ports.createGroup(payload.name);
						if (payload.status) await ports.saveGroup({ ...created, status: payload.status });
						groupIds.set(keyOf(payload.name), created.id);
					}
					break;
				}
				case 'session':
					break;
			}
			if (item.action === 'create') result.created++;
			else result.updated++;
			result.succeeded.push(item.id);
		} catch (error) {
			result.errors.push(`${item.name}: ${errorText(error)}`);
		}
	}

	for (const item of selected) {
		if (item.payload.kind !== 'session') continue;
		try {
			const session = sessionForSave(item.payload.planned, characterIds, groupIds);
			await ports.saveSession(session);
			await ports.writeSessionLog(session, item.payload.planned.body);
			result.sessions++;
			result.succeeded.push(item.id);
		} catch (error) {
			result.errors.push(`${item.name}: ${errorText(error)}`);
		}
	}
	return result;
}
