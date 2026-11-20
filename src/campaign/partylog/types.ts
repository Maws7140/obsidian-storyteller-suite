/*
 * Partylog notation: typed model.
 *
 * Partylog by Roberto Bisceglie (Loreseed Workshop), a fork of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */

/**
 * Attribution of an action or roll.
 * - `implicit`: `@ text` (no name)
 * - `solo`: `@(Name)` / `d(Name):`
 * - `assist`: `@(A > B)` / `d(A > B):`. The spec's own examples are not consistent about which
 *   side leads (§3.1.2 vs Appendix A.1), so `actors` keeps the written order.
 * - `group`: `@(A+B)` / `d(A+B):`
 * - `none`: a roll with no `d(...)` attribution
 */
export type ActorMode = 'implicit' | 'solo' | 'assist' | 'group' | 'none';

export type ProgressKind = 'Clock' | 'E' | 'Track' | 'Timer';
export type NamedStateKind = 'Thread' | 'Goal' | 'Quest';
export type CharacterKind = 'N' | 'PC' | 'F' | 'L' | 'Faction';
export type MetaType = 'note' | 'rule' | 'post' | 'hook' | 'reflection' | 'safety';

/**
 * One `|`-separated segment of a tag, after the name.
 * - `label`: plain descriptor (`hostile`, `bandaged`, `unassigned`)
 * - `add` / `remove`: `+poisoned` / `-wounded`
 * - `set`: `key value` (`HP 12/34`, `Level 6`, `Supply d8`)
 * - `keyed`: `key:value` or `key: a, b` (`standing:neutral`, `trait: brave, reckless`)
 * - `delta`: `key+n` / `key-n` (`HP-5`, `Gold+15`, `XP+1 each` with suffix `each`)
 * - `change`: `from→to` or `from->to`. A bare `to` inherits the key of `from`.
 */
export type TagField =
	| { kind: 'label'; text: string }
	| { kind: 'add'; text: string }
	| { kind: 'remove'; text: string }
	| { kind: 'set'; key: string; value: string }
	| { kind: 'keyed'; key: string; values: string[] }
	| { kind: 'delta'; key: string; amount: number; suffix?: string }
	| { kind: 'change'; from: TagField; to: TagField };

/** Progress value of a clock, track or timer: `X/Y`, `X`, or a delta such as `+2`. */
export interface ProgressValue {
	current?: number;
	max?: number;
	delta?: number;
}

interface TagBase {
	/** Written as `[#N:Name]` */
	reference: boolean;
	fields: TagField[];
}

/** `[N:Name|...]`, `[PC:Name|...]`, `[F:Name|...]`, `[L:Name|...]`, `[Faction:Name|...]` */
export interface CharacterTag extends TagBase {
	kind: CharacterKind;
	name: string;
}

/** `[Party:...]` and `[Wealth:...]`: no name, every segment is a field. */
export interface PartyTag extends TagBase {
	kind: 'Party' | 'Wealth';
}

/** `[Clock:Name X/Y]`, `[E:Name X/Y]`, `[Track:...]`, `[Timer:Name N]` */
export interface ProgressTag extends TagBase {
	kind: ProgressKind;
	name: string;
	value?: ProgressValue;
}

/** `[Thread:Name|state]`, `[Goal:Name|state]`, `[Quest:Name|state]` */
export interface NamedStateTag extends TagBase {
	kind: NamedStateKind;
	name: string;
}

/**
 * `[Loot: Name]` (add), `[Loot: -Name]` (remove), `[Loot: Name|to:Mira]` (assign).
 * `quantity` comes from a trailing ` xN`.
 */
export interface LootTag extends TagBase {
	kind: 'Loot';
	name: string;
	op: 'add' | 'remove' | 'assign';
	quantity?: number;
	to?: string;
}

/** `[Advance:Name|detail|+gain|+gain]` */
export interface AdvanceTag extends TagBase {
	kind: 'Advance';
	name: string;
	detail?: string;
	gains: string[];
}

/** `[OOC: label | note]` */
export interface OocTag extends TagBase {
	kind: 'OOC';
	name: string;
	note?: string;
}

/** Resource addon `[Inv:Item|qty|props]`, with `Item+N` / `Item-N` deltas. */
export interface InventoryTag extends TagBase {
	kind: 'Inv';
	name: string;
	delta?: number;
	quantity?: number;
}

/** Any other bracketed tag. Kept generically so unknown types survive a round trip. */
export interface UnknownTag extends TagBase {
	kind: 'unknown';
	head: string;
	name: string;
}

export type Tag =
	| CharacterTag
	| PartyTag
	| ProgressTag
	| NamedStateTag
	| LootTag
	| AdvanceTag
	| OocTag
	| InventoryTag
	| UnknownTag;

export interface BlankEntry {
	kind: 'blank';
}

/** `@(Name) text`, `@(A > B) text`, `@(A+B) text`, `@ text` */
export interface ActionEntry {
	kind: 'action';
	mode: ActorMode;
	actors: string[];
	text: string;
	tags: Tag[];
}

/** `! text` */
export interface EventEntry {
	kind: 'event';
	text: string;
	tags: Tag[];
}

/**
 * `d: expression -> outcome` and `d(Name): expression -> outcome`.
 * `expression` keeps the source text, including any `[...]` roll context and comparison
 * shorthand. Use `analyzeRoll` for the derived total, comparison and flags.
 */
export interface RollEntry {
	kind: 'roll';
	mode: ActorMode;
	actors: string[];
	expression: string;
	outcome?: string;
	tags: Tag[];
}

/** `=> text` */
export interface ConsequenceEntry {
	kind: 'consequence';
	text: string;
	tags: Tag[];
}

/** `tbl: ...` and `gen: ...` single-line random lookups. */
export interface TableEntry {
	kind: 'table';
	source: 'tbl' | 'gen';
	expression: string;
	outcome?: string;
	tags: Tag[];
}

/** `PC(Name): "..."` and `N(Name): "..."`. The text is kept verbatim. */
export interface DialogueEntry {
	kind: 'dialogue';
	speaker: 'PC' | 'N';
	name: string;
	text: string;
}

/** `(note: ...)`, `(rule: ...)`, `(post: ...)`, `(hook: ...)`, `(reflection: ...)`, `(safety: ...)` */
export interface MetaEntry {
	kind: 'meta';
	type: MetaType;
	text: string;
}

/** `\---` ... `---\` block of in-fiction text. Only produced by the log parser. */
export interface NarrativeEntry {
	kind: 'narrative';
	text: string;
}

/** `\---` or `---\` marker line (single-line parse only). */
export interface NarrativeMarkerEntry {
	kind: 'narrative-marker';
	open: boolean;
}

/** `[COMBAT]` / `[/COMBAT]` and `[RESOURCES]` / `[/RESOURCES]` */
export interface BlockEntry {
	kind: 'block';
	marker: 'COMBAT' | 'RESOURCES';
	open: boolean;
}

/** `R1`, `R2`, ... combat round markers */
export interface RoundEntry {
	kind: 'round';
	number: number;
}

/** A line made of tags, optionally followed by prose: `[N:Tomas|healer]`, `[Absent] Sam (...)` */
export interface TagsEntry {
	kind: 'tags';
	tags: Tag[];
	text: string;
}

/** Anything else: narrative prose. Tags inside prose are still extracted. */
export interface ProseEntry {
	kind: 'prose';
	text: string;
	tags: Tag[];
}

export type SceneKind = 'sequential' | 'flashback' | 'split' | 'montage';

/**
 * Scene identifier. `text` is canonical: `S18`, `S20a` (flashback), `T1-S22` (split party),
 * `S15.1` (montage).
 */
export interface SceneId {
	text: string;
	kind: SceneKind;
	number: number;
	letter?: string;
	thread?: number;
	part?: number;
}

/** `### S18 *context*` (digital) or `S18 *context*` (analog) */
export interface SceneEntry {
	kind: 'scene';
	id: SceneId;
	context: string;
}

/** `## Session 7` or `=== Session 7 ===` */
export interface SessionHeadingEntry {
	kind: 'session-heading';
	number?: number;
}

/** `### End of Session 7` or `--- End of Session 7 ---` */
export interface SessionEndHeadingEntry {
	kind: 'session-end-heading';
	number?: number;
}

/** `## Interlude: title` or `=== Interlude: title ===` */
export interface InterludeHeadingEntry {
	kind: 'interlude-heading';
	title: string;
}

/** Every line-level element of the notation. */
export type PartylogEntry =
	| BlankEntry
	| ActionEntry
	| EventEntry
	| RollEntry
	| ConsequenceEntry
	| TableEntry
	| DialogueEntry
	| MetaEntry
	| NarrativeEntry
	| NarrativeMarkerEntry
	| BlockEntry
	| RoundEntry
	| TagsEntry
	| ProseEntry
	| SceneEntry
	| SessionHeadingEntry
	| SessionEndHeadingEntry
	| InterludeHeadingEntry;

export interface SessionHeader {
	number?: number;
	date?: string;
	duration?: string;
	scenes?: { from: string; to: string };
	players: string[];
	scribe?: string;
	absent: string[];
	mood?: string;
	threads: string[];
	recap?: string;
	goals?: string;
	notes?: string;
}

export interface SessionEnd {
	number?: number;
	entries: PartylogEntry[];
}

export interface Interlude {
	title: string;
	entries: PartylogEntry[];
}

export interface CampaignHeader {
	title?: string;
	/** Other front-matter or analog fields, in source order. */
	fields: Record<string, string>;
	pcs: string[];
}

export interface ParsedScene {
	/** Absent for lines that appear before any scene heading. */
	id?: SceneId;
	context: string;
	entries: PartylogEntry[];
}

/** Ordered view of a parsed log, used for replay. */
export type LogItem =
	| { kind: 'session'; header: SessionHeader }
	| { kind: 'scene'; scene: ParsedScene }
	| { kind: 'session-end'; end: SessionEnd }
	| { kind: 'interlude'; interlude: Interlude };

/**
 * Result of `parsePartylogLog`. `sessionHeader` is the first session header and `sessionEnd`
 * the last end block. Use `sequence` to walk every session in document order.
 */
export interface ParsedLog {
	campaign?: CampaignHeader;
	sessionHeader?: SessionHeader;
	sessionEnd?: SessionEnd;
	scenes: ParsedScene[];
	interludes: Interlude[];
	sequence: LogItem[];
}
