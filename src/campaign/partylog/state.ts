/*
 * Partylog state reducer: replays tags from a log into running session state.
 *
 * Partylog by Roberto Bisceglie (Loreseed Workshop), a fork of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports. Inputs are never mutated.
 *
 * Semantics:
 * - A plain label adds to `labels`. `+x` adds, `-x` removes it (and removes a matching value
 *   from keyed fields, so `-hostile` clears `standing:hostile`).
 * - `a→b` / `a->b` applies `b`. A label `a` is removed first; a delta `a` is applied first.
 * - `Key N` stores a value. `N/M` also records the maximum. Non-numeric values go to `stats`.
 * - `Key+n` / `Key-n` adjusts a gauge. A gauge with no prior value starts at 0, so
 *   `[Party:Gold-25]` with no earlier gold records -25. A known maximum caps the gauge.
 * - `key:a,b` replaces the values of that key.
 * - Clocks and tracks are clamped to [0, max]. Timers are clamped to 0 or above.
 * - Suffixes on deltas (`XP+1 each`) are preserved on the field but do not change the result.
 */
import type {
	AdvanceTag,
	CharacterTag,
	LootTag,
	NamedStateTag,
	ParsedLog,
	PartyTag,
	PartylogEntry,
	ProgressTag,
	Tag,
	TagField,
	InventoryTag,
} from './types';

/** A numeric value with an optional maximum, such as HP `27/34`. */
export interface Gauge {
	current?: number;
	max?: number;
}

/** Shared shape for NPCs, foes, locations, the party, and factions. */
export interface EntityState {
	name: string;
	labels: string[];
	/** Keyed fields. Values are the comma-separated parts of `key:a, b`. */
	props: Record<string, string[]>;
	gauges: Record<string, Gauge>;
	/** Non-numeric set values such as `Supply d8`. */
	stats: Record<string, string>;
}

export interface PcState extends EntityState {
	level?: number;
	characterClass?: string;
	/** Items claimed from the loot stash (or added with `+Item` matching a loot entry). */
	items: string[];
}

export interface FactionState extends EntityState {
	tier?: number;
	standing?: string;
}

export interface ProgressState {
	name: string;
	current: number;
	max?: number;
}

export interface NamedState {
	name: string;
	state?: string;
}

export interface LootItem {
	name: string;
	quantity?: number;
}

export interface AdvancementRecord {
	pc: string;
	detail?: string;
	gains: string[];
}

export interface LootStash {
	/** Unassigned items. */
	stash: LootItem[];
	/** Names removed from the stash that no character has claimed yet. */
	pending: string[];
}

export interface PartylogState {
	pcs: Record<string, PcState>;
	npcs: Record<string, EntityState>;
	foes: Record<string, EntityState>;
	locations: Record<string, EntityState>;
	factions: Record<string, FactionState>;
	party: EntityState;
	/** Quantities from the resource addon `[Inv:]` tag. */
	inventory: Record<string, number>;
	clocks: Record<string, ProgressState>;
	tracks: Record<string, ProgressState>;
	timers: Record<string, ProgressState>;
	threads: Record<string, NamedState>;
	goals: Record<string, NamedState>;
	quests: Record<string, NamedState>;
	loot: LootStash;
	advancements: AdvancementRecord[];
}

type Dict<T> = Record<string, T>;

function has(dict: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(dict, key) === true;
}

function getOwn<T>(dict: Dict<T>, key: string): T | undefined {
	return has(dict, key) ? dict[key] : undefined;
}

/** Writes an own property, including keys such as `__proto__`. Mutates `dict`. */
function setOwn<T>(dict: Dict<T>, key: string, value: T): void {
	Object.defineProperty(dict, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Returns a copy of `dict` with `key` set. */
function withKey<T>(dict: Dict<T>, key: string, value: T): Dict<T> {
	const out: Dict<T> = { ...dict };
	setOwn(out, key, value);
	return out;
}

function withoutKey<T>(dict: Dict<T>, key: string): Dict<T> {
	const out: Dict<T> = { ...dict };
	delete out[key];
	return out;
}

function sameName(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

function looseMatch(a: string, b: string): boolean {
	const la = a.toLowerCase();
	const lb = b.toLowerCase();
	if (la.length === 0 || lb.length === 0) return false;
	return la === lb || la.indexOf(lb) >= 0 || lb.indexOf(la) >= 0;
}

function emptyEntity(name: string): EntityState {
	return { name, labels: [], props: {}, gauges: {}, stats: {} };
}

function emptyPc(name: string): PcState {
	return { ...emptyEntity(name), items: [] };
}

function emptyFaction(name: string): FactionState {
	return emptyEntity(name);
}

/** Creates the empty session state. */
export function createPartylogState(): PartylogState {
	return {
		pcs: {},
		npcs: {},
		foes: {},
		locations: {},
		factions: {},
		party: emptyEntity('Party'),
		inventory: {},
		clocks: {},
		tracks: {},
		timers: {},
		threads: {},
		goals: {},
		quests: {},
		loot: { stash: [], pending: [] },
		advancements: [],
	};
}

function cloneEntity<E extends EntityState>(entity: E): E {
	return {
		...entity,
		labels: entity.labels.slice(),
		props: { ...entity.props },
		gauges: { ...entity.gauges },
		stats: { ...entity.stats },
	};
}

function clonePc(pc: PcState): PcState {
	return { ...cloneEntity(pc), items: pc.items.slice() };
}

function addLabel(entity: EntityState, text: string): void {
	if (!entity.labels.some((label) => sameName(label, text))) entity.labels.push(text);
}

function removeLabel(entity: EntityState, text: string): void {
	entity.labels = entity.labels.filter((label) => !sameName(label, text));
	for (const key of Object.keys(entity.props)) {
		const values = entity.props[key].filter((value) => !sameName(value, text));
		if (values.length === 0) delete entity.props[key];
		else setOwn(entity.props, key, values);
	}
}

function setValue(entity: EntityState, key: string, value: string): void {
	if (sameName(value, 'full')) {
		const gauge = getOwn(entity.gauges, key);
		if (gauge && gauge.max !== undefined) {
			const full: Gauge = { current: gauge.max, max: gauge.max };
			setOwn(entity.gauges, key, full);
		}
		return;
	}
	const numeric = /^(-?\d+)(?:\s*\/\s*(\d+))?$/.exec(value);
	if (!numeric) {
		setOwn(entity.stats, key, value);
		return;
	}
	const previous = getOwn(entity.gauges, key);
	const current = Number(numeric[1]);
	const gauge: Gauge = { current };
	// A bare restated value keeps the known maximum unless it exceeds it.
	const kept = previous && previous.max !== undefined && current <= previous.max ? previous.max : undefined;
	const max = numeric[2] !== undefined ? Number(numeric[2]) : kept;
	if (max !== undefined) gauge.max = max;
	setOwn(entity.gauges, key, gauge);
}

function adjustGauge(entity: EntityState, key: string, amount: number): void {
	const previous = getOwn(entity.gauges, key);
	let current = (previous && previous.current !== undefined ? previous.current : 0) + amount;
	const max = previous ? previous.max : undefined;
	if (max !== undefined && current > max) current = max;
	const gauge: Gauge = { current };
	if (max !== undefined) gauge.max = max;
	setOwn(entity.gauges, key, gauge);
}

/** Applies one field to an entity. `entity` must be a draft that the caller owns. */
function applyField(entity: EntityState, field: TagField): void {
	switch (field.kind) {
		case 'label':
		case 'add':
			addLabel(entity, field.text);
			return;
		case 'remove':
			removeLabel(entity, field.text);
			return;
		case 'set':
			setValue(entity, field.key, field.value);
			return;
		case 'keyed':
			if (field.values.length > 0) setOwn(entity.props, field.key, field.values.slice());
			return;
		case 'delta':
			adjustGauge(entity, field.key, field.amount);
			return;
		case 'change':
			if (field.from.kind === 'label') removeLabel(entity, field.from.text);
			else if (field.from.kind === 'delta') applyField(entity, field.from);
			applyField(entity, field.to);
			return;
	}
}

function applyFields(entity: EntityState, fields: TagField[]): void {
	for (const field of fields) applyField(entity, field);
}

/** Text used as a named state (thread, goal, quest) from one field. */
function stateText(field: TagField): string | undefined {
	switch (field.kind) {
		case 'label':
			return field.text;
		case 'change':
			return stateText(field.to);
		case 'keyed':
			return field.values.join(', ');
		default:
			return undefined;
	}
}

function applyCharacter(state: PartylogState, map: 'npcs' | 'foes' | 'locations', tag: CharacterTag): PartylogState {
	if (!tag.name) return state;
	const draft = cloneEntity(getOwn(state[map], tag.name) ?? emptyEntity(tag.name));
	applyFields(draft, tag.fields);
	const next = { ...state };
	next[map] = withKey(state[map], tag.name, draft);
	return next;
}

/** Removes matching `+x` fields that claim loot, returns the rest. */
function claimLoot(state: PartylogState, fields: TagField[]): { loot: LootStash; claimed: string[]; rest: TagField[] } {
	let loot = state.loot;
	const claimed: string[] = [];
	const rest: TagField[] = [];
	for (const field of fields) {
		const text = field.kind === 'add' ? field.text : undefined;
		const inStash = text !== undefined && loot.stash.some((item) => looseMatch(item.name, text));
		const inPending = text !== undefined && loot.pending.some((name) => looseMatch(name, text));
		if (text !== undefined && (inStash || inPending)) {
			claimed.push(text);
			loot = takeLoot(loot, text);
		} else {
			rest.push(field);
		}
	}
	return { loot, claimed, rest };
}

function applyPc(state: PartylogState, tag: CharacterTag): PartylogState {
	if (!tag.name) return state;
	const draft = clonePc(getOwn(state.pcs, tag.name) ?? emptyPc(tag.name));
	const { loot, claimed, rest } = claimLoot(state, tag.fields);
	for (const item of claimed) {
		if (!draft.items.some((existing) => sameName(existing, item))) draft.items.push(item);
	}
	applyFields(draft, rest);
	const level = getOwn(draft.gauges, 'Level');
	if (level && level.current !== undefined) draft.level = level.current;
	const characterClass = getOwn(draft.props, 'Class');
	if (characterClass && characterClass.length > 0) draft.characterClass = characterClass[0];
	return { ...state, pcs: withKey(state.pcs, tag.name, draft), loot };
}

function applyFaction(state: PartylogState, tag: CharacterTag): PartylogState {
	if (!tag.name) return state;
	const draft = cloneEntity(getOwn(state.factions, tag.name) ?? emptyFaction(tag.name));
	applyFields(draft, tag.fields);
	const result: FactionState = { ...draft };
	delete result.tier;
	delete result.standing;
	const tierGauge = getOwn(draft.gauges, 'tier');
	const tierProp = getOwn(draft.props, 'tier');
	const tier = tierGauge && tierGauge.current !== undefined ? tierGauge.current : tierProp ? Number(tierProp[0]) : NaN;
	if (!Number.isNaN(tier)) result.tier = tier;
	const standing = getOwn(draft.props, 'standing');
	if (standing && standing.length > 0) result.standing = standing[0];
	return { ...state, factions: withKey(state.factions, tag.name, result) };
}

function applyParty(state: PartylogState, tag: PartyTag): PartylogState {
	const party = cloneEntity(state.party);
	let quests = state.quests;
	const rest: TagField[] = [];
	for (const field of tag.fields) {
		if (field.kind === 'keyed' && sameName(field.key, 'Quest')) {
			const name = field.values.join(', ');
			if (name.length > 0 && !has(quests, name)) quests = withKey(quests, name, { name });
		} else {
			rest.push(field);
		}
	}
	applyFields(party, rest);
	return { ...state, party, quests };
}

function applyProgress(state: PartylogState, tag: ProgressTag): PartylogState {
	if (!tag.name) return state;
	const key = tag.kind === 'Track' ? 'tracks' : tag.kind === 'Timer' ? 'timers' : 'clocks';
	const map = state[key];
	const existing = getOwn(map, tag.name);
	const value = tag.value ?? {};
	let current: number;
	if (value.delta !== undefined) current = (existing ? existing.current : 0) + value.delta;
	else if (value.current !== undefined) current = value.current;
	else current = existing ? existing.current : 0;
	const max = value.max !== undefined ? value.max : existing ? existing.max : undefined;
	if (max !== undefined && current > max) current = max;
	if (current < 0) current = 0;
	const progress: ProgressState = { name: tag.name, current };
	if (max !== undefined) progress.max = max;
	const next = { ...state };
	next[key] = withKey(map, tag.name, progress);
	return next;
}

function applyNamed(state: PartylogState, tag: NamedStateTag): PartylogState {
	if (!tag.name) return state;
	const key = tag.kind === 'Thread' ? 'threads' : tag.kind === 'Goal' ? 'goals' : 'quests';
	const map = state[key];
	const existing = getOwn(map, tag.name);
	let text = existing ? existing.state : undefined;
	for (const field of tag.fields) {
		const next = stateText(field);
		if (next !== undefined) text = next;
	}
	const named: NamedState = { name: tag.name };
	if (text !== undefined) named.state = text;
	const next = { ...state };
	next[key] = withKey(map, tag.name, named);
	return next;
}

function takeLoot(loot: LootStash, text: string): LootStash {
	const index = loot.stash.findIndex((item) => looseMatch(item.name, text));
	const stash = index >= 0 ? loot.stash.filter((_, i) => i !== index) : loot.stash;
	const pending = loot.pending.filter((name) => !looseMatch(name, text));
	return { stash, pending };
}

function applyLoot(state: PartylogState, tag: LootTag): PartylogState {
	if (!tag.name) return state;
	let loot = state.loot;
	if (tag.op === 'add') {
		const index = loot.stash.findIndex((item) => sameName(item.name, tag.name));
		if (index >= 0) {
			const existing = loot.stash[index];
			const merged: LootItem = { name: existing.name };
			if (existing.quantity !== undefined || tag.quantity !== undefined) {
				merged.quantity = (existing.quantity !== undefined ? existing.quantity : 1) + (tag.quantity !== undefined ? tag.quantity : 1);
			}
			const stash = loot.stash.slice();
			stash[index] = merged;
			loot = { stash, pending: loot.pending };
		} else {
			const item: LootItem = { name: tag.name };
			if (tag.quantity !== undefined) item.quantity = tag.quantity;
			loot = { stash: [...loot.stash, item], pending: loot.pending };
		}
		return { ...state, loot };
	}

	// remove or assign: take the item out of the stash
	const index = loot.stash.findIndex((item) => sameName(item.name, tag.name));
	const fallback = index >= 0 ? index : loot.stash.findIndex((item) => looseMatch(item.name, tag.name));
	const canonical = fallback >= 0 ? loot.stash[fallback].name : tag.name;
	let stash = loot.stash;
	// Only a whole item leaving the stash becomes pending; a partial take leaves the rest in place.
	let wholeItemTaken = true;
	if (fallback >= 0) {
		const existing = loot.stash[fallback];
		if (tag.quantity !== undefined && existing.quantity !== undefined && existing.quantity > tag.quantity) {
			stash = loot.stash.slice();
			stash[fallback] = { name: existing.name, quantity: existing.quantity - tag.quantity };
			wholeItemTaken = false;
		} else {
			stash = loot.stash.filter((_, i) => i !== fallback);
		}
	}
	if (tag.op === 'remove') {
		const pending = !wholeItemTaken || loot.pending.some((name) => sameName(name, canonical))
			? loot.pending
			: [...loot.pending, canonical];
		return { ...state, loot: { stash, pending } };
	}
	const next = { ...state, loot: { stash, pending: loot.pending.filter((name) => !looseMatch(name, canonical)) } };
	if (tag.to) {
		const pc = clonePc(getOwn(next.pcs, tag.to) ?? emptyPc(tag.to));
		if (!pc.items.some((item) => sameName(item, canonical))) pc.items.push(canonical);
		next.pcs = withKey(next.pcs, tag.to, pc);
	}
	return next;
}

function applyAdvance(state: PartylogState, tag: AdvanceTag): PartylogState {
	if (!tag.name) return state;
	const record: AdvancementRecord = { pc: tag.name, gains: tag.gains.slice() };
	if (tag.detail !== undefined) record.detail = tag.detail;
	const draft = clonePc(getOwn(state.pcs, tag.name) ?? emptyPc(tag.name));
	const match = tag.detail ? /^(.*\S)\s+(\d+)$/.exec(tag.detail) : null;
	if (match) {
		draft.characterClass = match[1].trim();
		draft.level = Number(match[2]);
	}
	return {
		...state,
		pcs: withKey(state.pcs, tag.name, draft),
		advancements: [...state.advancements, record],
	};
}

function applyInventory(state: PartylogState, tag: InventoryTag): PartylogState {
	if (!tag.name) return state;
	const previous = getOwn(state.inventory, tag.name);
	const depleted = tag.fields.some((field) => field.kind === 'label' && sameName(field.text, 'depleted'));
	if (depleted) return { ...state, inventory: withoutKey(state.inventory, tag.name) };
	let quantity: number;
	if (tag.quantity !== undefined) quantity = tag.quantity;
	else if (tag.delta !== undefined) quantity = (previous !== undefined ? previous : 0) + tag.delta;
	else quantity = previous !== undefined ? previous : 1;
	if (quantity <= 0) return { ...state, inventory: withoutKey(state.inventory, tag.name) };
	return { ...state, inventory: withKey(state.inventory, tag.name, quantity) };
}

function applyOne(state: PartylogState, tag: Tag): PartylogState {
	switch (tag.kind) {
		case 'N':
			return applyCharacter(state, 'npcs', tag);
		case 'F':
			return applyCharacter(state, 'foes', tag);
		case 'L':
			return applyCharacter(state, 'locations', tag);
		case 'PC':
			return applyPc(state, tag);
		case 'Faction':
			return applyFaction(state, tag);
		case 'Party':
			return applyParty(state, tag);
		case 'Wealth':
			return applyParty(state, { ...tag, kind: 'Party' });
		case 'Clock':
		case 'E':
		case 'Track':
		case 'Timer':
			return applyProgress(state, tag);
		case 'Thread':
		case 'Goal':
		case 'Quest':
			return applyNamed(state, tag);
		case 'Loot':
			return applyLoot(state, tag);
		case 'Advance':
			return applyAdvance(state, tag);
		case 'Inv':
			return applyInventory(state, tag);
		default:
			return state;
	}
}

/**
 * Applies tags in order and returns the new state. The input state is not modified.
 * Unknown tags, OOC tags and other non-state tags are ignored.
 */
export function applyTagUpdates(state: PartylogState, tags: readonly Tag[]): PartylogState {
	let next = state;
	for (const tag of tags) next = applyOne(next, tag);
	return next;
}

/** Tags carried by an entry, in source order. */
export function entryTags(entry: PartylogEntry): Tag[] {
	switch (entry.kind) {
		case 'action':
		case 'event':
		case 'roll':
		case 'consequence':
		case 'table':
		case 'tags':
		case 'prose':
			return entry.tags;
		default:
			return [];
	}
}

/**
 * Replays a parsed log into state, in document order: scene entries, session end blocks and
 * interludes. `initial` lets a caller continue from an earlier state.
 */
export function replayPartylogLog(log: ParsedLog, initial?: PartylogState): PartylogState {
	let state = initial ?? createPartylogState();
	for (const item of log.sequence) {
		if (item.kind === 'scene') {
			for (const entry of item.scene.entries) state = applyTagUpdates(state, entryTags(entry));
		} else if (item.kind === 'session-end') {
			for (const entry of item.end.entries) state = applyTagUpdates(state, entryTags(entry));
		} else if (item.kind === 'interlude') {
			for (const entry of item.interlude.entries) state = applyTagUpdates(state, entryTags(entry));
		}
	}
	return state;
}
