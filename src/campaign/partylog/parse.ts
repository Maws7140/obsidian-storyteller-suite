/*
 * Partylog parser: tolerant line parser, tag scanner and log parser. Never throws.
 *
 * Partylog by Roberto Bisceglie (Loreseed Workshop), a fork of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import type {
	ActorMode,
	AdvanceTag,
	CampaignHeader,
	CharacterTag,
	Interlude,
	InventoryTag,
	LogItem,
	LootTag,
	MetaType,
	NamedStateTag,
	OocTag,
	ParsedLog,
	ParsedScene,
	PartyTag,
	PartylogEntry,
	ProgressTag,
	ProgressValue,
	RollEntry,
	SceneId,
	SessionEnd,
	SessionHeader,
	TableEntry,
	Tag,
	TagField,
	UnknownTag,
} from './types';

/** Hyphen, dashes and minus sign, as a character class. */
const DASHES = '[-‐-―−]';
/** Sign characters for deltas: plus, or any dash-like minus. */
const SIGN = '[+\\-‐-―−]';
const SCENE_ID_RE = new RegExp(`^(?:T(\\d+)${DASHES})?S(\\d+)(?:([a-z])|\\.(\\d+))?$`);
const SCENE_LINE_RE = new RegExp(`^(?:#{1,6}\\s+)?((?:T\\d+${DASHES})?S\\d+(?:[a-z]|\\.\\d+)?)(?:\\s+\\*(.*)\\*)?$`);
const SESSION_RE = /^(?:#{1,6}\s*Session\b|={2,}\s*Session\b)\s*(\d+)?\s*(?:={2,})?$/i;
const END_RE = /^(?:#{1,6}\s*End of Session\b|-{2,}\s*End of Session\b)\s*(\d+)?\s*(?:-{2,})?$/i;
const INTERLUDE_RE = /^(?:#{1,6}\s*Interlude|={2,}\s*Interlude)\s*:?\s*(.*?)\s*(?:={2,})?$/i;
const CAMPAIGN_RE = /^={2,}\s*Campaign Log:?\s*(.*?)\s*={2,}$/i;
const BLOCK_RE = /^\[(\/)?(COMBAT|RESOURCES)\]$/i;
const META_RE = /^\(\s*(note|rule|post|hook|reflection|safety)\s*:\s*([\s\S]*)\)$/i;
const ROLL_RE = /^d(?:\(([^()]*)\))?\s*:([\s\S]*)$/;
const TABLE_RE = /^(tbl|gen)\s*:([\s\S]*)$/;
const DIALOGUE_RE = /^(PC|N)\(([^()]*)\)\s*:\s?([\s\S]*)$/;
const ACTION_RE = /^@\s*(?:\(([^()]*)\))?\s*([\s\S]*)$/;
const ANALOG_ADVANCE_RE = /^\[Advance\]\s*([^:]+):\s*(.*)$/i;

const TAG_KIND_BY_LOWER: Record<string, string> = {
	n: 'N',
	pc: 'PC',
	f: 'F',
	l: 'L',
	faction: 'Faction',
	party: 'Party',
	wealth: 'Wealth',
	clock: 'Clock',
	e: 'E',
	track: 'Track',
	timer: 'Timer',
	thread: 'Thread',
	goal: 'Goal',
	quest: 'Quest',
	loot: 'Loot',
	advance: 'Advance',
	ooc: 'OOC',
	inv: 'Inv',
};

const KNOWN_KIND_HEAD = /^[A-Za-z][A-Za-z0-9_-]*$/;

function has(map: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(map, key) === true;
}

/** Collapses every run of whitespace (including newlines) to one space and trims. */
export function collapseSpaces(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function countChar(text: string, ch: string): number {
	let n = 0;
	for (let i = 0; i < text.length; i++) {
		if (text.charAt(i) === ch) n++;
	}
	return n;
}

/** Splits on `sep` outside parentheses and brackets. Empty parts are dropped. */
function splitTopLevel(text: string, sep: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let current = '';
	for (let i = 0; i < text.length; i++) {
		const ch = text.charAt(i);
		if (ch === '(' || ch === '[') depth++;
		else if ((ch === ')' || ch === ']') && depth > 0) depth--;
		if (ch === sep && depth === 0) {
			out.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	out.push(current);
	return out.map((part) => collapseSpaces(part)).filter((part) => part.length > 0);
}

// ---------------------------------------------------------------------------
// Scene identifiers
// ---------------------------------------------------------------------------

/** Parses `S18`, `S20a`, `T1-S22` and `S15.1`. Returns undefined for anything else. */
export function parseSceneId(text: string): SceneId | undefined {
	const m = SCENE_ID_RE.exec(String(text).trim());
	if (!m) return undefined;
	const number = Number(m[2]);
	if (m[1] !== undefined) {
		const thread = Number(m[1]);
		return { text: `T${thread}-S${number}`, kind: 'split', number, thread };
	}
	if (m[3] !== undefined) {
		return { text: `S${number}${m[3]}`, kind: 'flashback', number, letter: m[3] };
	}
	if (m[4] !== undefined) {
		const part = Number(m[4]);
		return { text: `S${number}.${part}`, kind: 'montage', number, part };
	}
	return { text: `S${number}`, kind: 'sequential', number };
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const DELTA_RE = new RegExp(`^([A-Za-z][A-Za-z0-9' ]*?)\\s*(${SIGN})(\\d+)(?:\\s+(.+))?$`);
const KEYED_RE = /^([A-Za-z][A-Za-z0-9' ]*?)\s*:\s*(.*)$/;
const SET_RE = /^([A-Za-z][A-Za-z0-9' ]*?)\s+((?:-?\d|d\d|full\b).*)$/i;

function findArrow(text: string): { index: number; length: number } | undefined {
	const ascii = text.indexOf('->');
	const unicode = text.indexOf('→');
	if (ascii < 0 && unicode < 0) return undefined;
	if (unicode >= 0 && (ascii < 0 || unicode < ascii)) return { index: unicode, length: 1 };
	return { index: ascii, length: 2 };
}

/** A bare value after a change inherits the key of the value before the arrow. */
function inheritKey(from: TagField, to: TagField): TagField {
	if (to.kind !== 'label') return to;
	if (from.kind === 'keyed') return { kind: 'keyed', key: from.key, values: [to.text] };
	if (from.kind === 'set' || from.kind === 'delta') return { kind: 'set', key: from.key, value: to.text };
	return to;
}

/** Parses one `|` segment of a tag body into a typed field. */
export function parseTagField(raw: string): TagField {
	const s = collapseSpaces(raw);
	const arrow = findArrow(s);
	if (arrow) {
		const from = parseTagField(s.slice(0, arrow.index));
		const to = parseTagField(s.slice(arrow.index + arrow.length));
		return { kind: 'change', from, to: inheritKey(from, to) };
	}
	if (s.length > 1 && s.charAt(0) === '+') {
		return { kind: 'add', text: collapseSpaces(s.slice(1)) };
	}
	if (s.length > 1 && s.charAt(0) === '-' && !/^-\d/.test(s)) {
		return { kind: 'remove', text: collapseSpaces(s.slice(1)) };
	}
	const delta = DELTA_RE.exec(s);
	if (delta) {
		const magnitude = Number(delta[3]);
		const amount = delta[2] === '+' ? magnitude : -magnitude;
		const key = collapseSpaces(delta[1]);
		if (delta[4] !== undefined) return { kind: 'delta', key, amount, suffix: delta[4] };
		return { kind: 'delta', key, amount };
	}
	const keyed = KEYED_RE.exec(s);
	if (keyed) {
		const key = collapseSpaces(keyed[1]);
		return { kind: 'keyed', key, values: splitTopLevel(keyed[2], ',') };
	}
	const set = SET_RE.exec(s);
	if (set) {
		return { kind: 'set', key: collapseSpaces(set[1]), value: collapseSpaces(set[2]) };
	}
	return { kind: 'label', text: s };
}

/** Splits a tag body on `|`, trimming segments and dropping empty ones. */
function splitSegments(body: string): string[] {
	return body
		.split('|')
		.map((part) => collapseSpaces(part))
		.filter((part) => part.length > 0);
}

/** Parses `Alert 3/6`, `Dawn 3`, `Holt's Search +2` into a name and value. */
function parseProgressHead(segment: string): { name: string; value?: ProgressValue } {
	const m = new RegExp(`^(.*\\S)\\s+(${SIGN}?)(\\d+)(?:/(\\d+))?$`).exec(segment);
	if (!m) return { name: segment };
	const magnitude = Number(m[3]);
	const value: ProgressValue = {};
	if (m[2] === '') {
		value.current = magnitude;
		if (m[4] !== undefined) value.max = Number(m[4]);
	} else {
		value.delta = m[2] === '+' ? magnitude : -magnitude;
	}
	return { name: collapseSpaces(m[1]), value };
}

function parseLootName(segment: string): { name: string; op: 'add' | 'remove'; quantity?: number } {
	let name = segment;
	let op: 'add' | 'remove' = 'add';
	if (/^-\s*\S/.test(name)) {
		op = 'remove';
		name = name.replace(/^-\s*/, '');
	}
	const q = /^(.*\S)\s+x(\d+)$/.exec(name);
	if (q) return { name: collapseSpaces(q[1]), op, quantity: Number(q[2]) };
	return { name: collapseSpaces(name), op };
}

/** Parses the inside of `[...]` (without the brackets). Returns undefined when it is not a tag. */
function parseTagInner(inner: string): Tag | undefined {
	let rest = inner.trim();
	let reference = false;
	if (rest.charAt(0) === '#') {
		reference = true;
		rest = rest.slice(1).trim();
	}
	const colon = rest.indexOf(':');
	const pipe = rest.indexOf('|');
	let head: string;
	let body: string | undefined;
	if (colon >= 0 && (pipe < 0 || colon < pipe)) {
		head = rest.slice(0, colon).trim();
		body = rest.slice(colon + 1);
	} else if (pipe >= 0) {
		head = rest.slice(0, pipe).trim();
		body = rest.slice(pipe + 1);
	} else {
		head = rest.trim();
	}
	if (!KNOWN_KIND_HEAD.test(head)) return undefined;
	const segments = splitSegments(body ?? '');
	const canonical = has(TAG_KIND_BY_LOWER, head.toLowerCase()) ? TAG_KIND_BY_LOWER[head.toLowerCase()] : undefined;
	const first = segments.length > 0 ? segments[0] : '';
	const rest2 = segments.slice(1);

	if (canonical === undefined) {
		const unknown: UnknownTag = {
			kind: 'unknown',
			reference,
			head,
			name: first,
			fields: rest2.map(parseTagField),
		};
		return unknown;
	}
	switch (canonical) {
		case 'N':
		case 'PC':
		case 'F':
		case 'L':
		case 'Faction': {
			const tag: CharacterTag = {
				kind: canonical,
				reference,
				name: first,
				fields: rest2.map(parseTagField),
			};
			return tag;
		}
		case 'Party':
		case 'Wealth': {
			const tag: PartyTag = {
				kind: canonical,
				reference,
				fields: segments.map(parseTagField),
			};
			return tag;
		}
		case 'Clock':
		case 'E':
		case 'Track':
		case 'Timer': {
			const progress = parseProgressHead(first);
			const tag: ProgressTag = {
				kind: canonical,
				reference,
				name: progress.name,
				fields: rest2.map(parseTagField),
			};
			if (progress.value) tag.value = progress.value;
			return tag;
		}
		case 'Thread':
		case 'Goal':
		case 'Quest': {
			const tag: NamedStateTag = {
				kind: canonical,
				reference,
				name: first,
				fields: rest2.map(parseTagField),
			};
			return tag;
		}
		case 'Loot': {
			const parsed = parseLootName(first);
			let to: string | undefined;
			const fields: TagField[] = [];
			for (const seg of rest2) {
				const assign = /^(?:to|assigned)\s*:\s*(.+)$/i.exec(seg);
				if (assign && to === undefined) {
					to = collapseSpaces(assign[1]);
				} else {
					fields.push(parseTagField(seg));
				}
			}
			const tag: LootTag = {
				kind: 'Loot',
				reference,
				name: parsed.name,
				op: to !== undefined ? 'assign' : parsed.op,
				fields,
			};
			if (parsed.quantity !== undefined) tag.quantity = parsed.quantity;
			if (to !== undefined) tag.to = to;
			return tag;
		}
		case 'Advance': {
			const tag: AdvanceTag = {
				kind: 'Advance',
				reference,
				name: first,
				fields: [],
				gains: rest2.slice(1).map((gain) => collapseSpaces(gain.replace(/^\+\s*/, ''))),
			};
			if (rest2.length > 0) tag.detail = rest2[0];
			return tag;
		}
		case 'OOC': {
			const tag: OocTag = { kind: 'OOC', reference, name: first, fields: [] };
			if (rest2.length > 0) tag.note = rest2.join(' | ');
			return tag;
		}
		case 'Inv': {
			const named = /^(.*\S)\s*([+-]\d+)$/.exec(first);
			const tag: InventoryTag = {
				kind: 'Inv',
				reference,
				name: named ? collapseSpaces(named[1]) : first,
				fields: [],
			};
			if (named) tag.delta = Number(named[2]);
			let remaining = rest2;
			if (rest2.length > 0 && /^\d+$/.test(rest2[0])) {
				tag.quantity = Number(rest2[0]);
				remaining = rest2.slice(1);
			}
			tag.fields = remaining.map(parseTagField);
			return tag;
		}
		default:
			return undefined;
	}
}

/**
 * Parses one tag. Accepts the bracketed form (`[PC:Mira|HP-5]`) or the bare inside
 * (`PC:Mira|HP-5`). Returns undefined when the text is not a tag.
 */
export function parseTag(source: string): Tag | undefined {
	try {
		const trimmed = String(source).trim();
		const inner = trimmed.charAt(0) === '[' && trimmed.charAt(trimmed.length - 1) === ']' ? trimmed.slice(1, -1) : trimmed;
		return parseTagInner(inner);
	} catch {
		return undefined;
	}
}

/**
 * Pulls every well-formed `[...]` tag out of `text`. Brackets that do not form a tag stay in the
 * prose. Unclosed brackets are left alone.
 */
export function extractTags(text: string): { tags: Tag[]; text: string } {
	const tags: Tag[] = [];
	let out = '';
	let i = 0;
	const source = String(text);
	while (i < source.length) {
		if (source.charAt(i) === '[') {
			const close = source.indexOf(']', i + 1);
			if (close >= 0) {
				const tag = parseTagInner(source.slice(i + 1, close));
				if (tag) {
					tags.push(tag);
					out += ' ';
					i = close + 1;
					continue;
				}
			}
		}
		out += source.charAt(i);
		i++;
	}
	return { tags, text: collapseSpaces(out) };
}

// ---------------------------------------------------------------------------
// Roll analysis
// ---------------------------------------------------------------------------

export interface RollComparison {
	op: 'vs' | 'ge' | 'le';
	target?: { label?: string; value?: number; raw: string };
}

export interface RollAnalysis {
	/** Text before the dice, e.g. `Stealth`. */
	label?: string;
	/** The dice expression, e.g. `d20+5` or `2d6`. */
	dice?: string;
	/** The total after `=` or the leading number of `18≥15` shorthand. */
	total?: number;
	comparison?: RollComparison;
	/** Bracketed roll context, e.g. `Adv: Flanking`. */
	context: string[];
	/** Explicit `S` or `F` flag from the outcome. */
	flag?: 'S' | 'F';
}

function findComparison(text: string): { index: number; length: number; op: 'vs' | 'ge' | 'le' } | undefined {
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charAt(i);
		if (ch === '(') {
			depth++;
		} else if (ch === ')') {
			depth = Math.max(0, depth - 1);
		} else if (depth === 0) {
			if (ch === '≥') return { index: i, length: 1, op: 'ge' };
			if (ch === '≤') return { index: i, length: 1, op: 'le' };
			if (text.startsWith('>=', i)) return { index: i, length: 2, op: 'ge' };
			if (text.startsWith('<=', i)) return { index: i, length: 2, op: 'le' };
			if ((i === 0 || /\s/.test(text.charAt(i - 1))) && /^vs(?=\s|$)/i.test(text.slice(i))) {
				return { index: i, length: 2, op: 'vs' };
			}
		}
	}
	return undefined;
}

function parseComparisonTarget(rhs: string): { label?: string; value?: number; raw: string } {
	const labelled = /^([A-Za-z][A-Za-z ]*?)\s*(-?\d+)\b/.exec(rhs);
	if (labelled) return { label: collapseSpaces(labelled[1]), value: Number(labelled[2]), raw: rhs };
	const bare = /^(-?\d+)\b/.exec(rhs);
	if (bare) return { value: Number(bare[1]), raw: rhs };
	return { raw: rhs };
}

/** Derives total, comparison, dice, label, context and S/F flag from a roll's source text. */
export function analyzeRoll(entry: { expression: string; outcome?: string }): RollAnalysis {
	const expression = String(entry.expression ?? '');
	const context: string[] = [];
	const bracket = /\[([^\]]*)\]/g;
	let m = bracket.exec(expression);
	while (m) {
		context.push(collapseSpaces(m[1]));
		m = bracket.exec(expression);
	}
	const stripped = collapseSpaces(expression.replace(/\[[^\]]*\]/g, ' '));
	const analysis: RollAnalysis = { context };

	const outcome = entry.outcome === undefined ? undefined : collapseSpaces(entry.outcome);
	if (outcome === 'S' || outcome === 'F') analysis.flag = outcome;

	const comparison = findComparison(stripped);
	const lhs = comparison ? stripped.slice(0, comparison.index).trim() : stripped;
	if (comparison) {
		const target = parseComparisonTarget(stripped.slice(comparison.index + comparison.length).trim());
		analysis.comparison = { op: comparison.op, target };
	}

	const shorthand = /^(-?\d+)$/.exec(lhs);
	const equals = /=\s*(-?\d+)\s*$/.exec(lhs);
	if (shorthand) analysis.total = Number(shorthand[1]);
	else if (equals) analysis.total = Number(equals[1]);

	const dice = /(\d*d(?:\d+|%|F)(?:[+-]\d+)?)/.exec(lhs);
	if (dice) {
		analysis.dice = dice[1];
		const label = collapseSpaces(lhs.slice(0, dice.index).replace(/[=(]+$/, ''));
		if (label.length > 0) analysis.label = label;
	}
	return analysis;
}

// ---------------------------------------------------------------------------
// Line parser
// ---------------------------------------------------------------------------

function parseAttribution(inner: string | undefined, fallback: 'implicit' | 'none'): { mode: ActorMode; actors: string[] } {
	if (inner === undefined) return { mode: fallback, actors: [] };
	const trimmed = inner.trim();
	if (trimmed === '') return { mode: fallback, actors: [] };
	if (trimmed.indexOf('>') >= 0) {
		const actors = trimmed.split('>').map((part) => collapseSpaces(part)).filter((part) => part.length > 0);
		if (actors.length > 1) return { mode: 'assist', actors };
	}
	if (trimmed.indexOf('+') >= 0) {
		const actors = trimmed.split('+').map((part) => collapseSpaces(part)).filter((part) => part.length > 0);
		if (actors.length > 1) return { mode: 'group', actors };
	}
	return { mode: 'solo', actors: [collapseSpaces(trimmed)] };
}

function splitOutcome(body: string): { expression: string; outcomeRaw?: string } {
	const idx = body.indexOf('->');
	const uni = body.indexOf('→');
	if (idx < 0 && uni < 0) return { expression: collapseSpaces(body) };
	const useAscii = idx >= 0 && (uni < 0 || idx < uni);
	const at = useAscii ? idx : uni;
	const len = useAscii ? 2 : 1;
	return {
		expression: collapseSpaces(body.slice(0, at)),
		outcomeRaw: body.slice(at + len),
	};
}

function parseAdvanceAnalog(text: string): AdvanceTag | undefined {
	const m = ANALOG_ADVANCE_RE.exec(text);
	if (!m) return undefined;
	const rest = m[2];
	const paren = /\(([^)]*)\)/.exec(rest);
	const detail = collapseSpaces(rest.replace(/\(.*$/, ''));
	const gains = paren
		? paren[1].split(',').map((gain) => collapseSpaces(gain.replace(/^\+\s*/, ''))).filter((gain) => gain.length > 0)
		: [];
	const tag: AdvanceTag = { kind: 'Advance', reference: false, name: collapseSpaces(m[1]), fields: [], gains };
	if (detail.length > 0) tag.detail = detail;
	return tag;
}

function parseLine(raw: string): PartylogEntry {
	const s = raw.trim();
	if (s === '') return { kind: 'blank' };
	if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(s)) return { kind: 'blank' };
	if (s === '\\---') return { kind: 'narrative-marker', open: true };
	if (s === '---\\') return { kind: 'narrative-marker', open: false };

	const session = SESSION_RE.exec(s);
	if (session) {
		return session[1] !== undefined ? { kind: 'session-heading', number: Number(session[1]) } : { kind: 'session-heading' };
	}
	const end = END_RE.exec(s);
	if (end) {
		return end[1] !== undefined ? { kind: 'session-end-heading', number: Number(end[1]) } : { kind: 'session-end-heading' };
	}
	const interlude = INTERLUDE_RE.exec(s);
	if (interlude) return { kind: 'interlude-heading', title: collapseSpaces(interlude[1]) };

	const scene = SCENE_LINE_RE.exec(s);
	if (scene) {
		const id = parseSceneId(scene[1]);
		if (id) return { kind: 'scene', id, context: collapseSpaces(scene[2] ?? '') };
	}

	const block = BLOCK_RE.exec(s);
	if (block) return { kind: 'block', marker: block[2].toUpperCase() as 'COMBAT' | 'RESOURCES', open: block[1] === undefined };

	const round = /^R(\d+)$/.exec(s);
	if (round) return { kind: 'round', number: Number(round[1]) };

	const meta = META_RE.exec(s);
	if (meta) {
		return { kind: 'meta', type: meta[1].toLowerCase() as MetaType, text: collapseSpaces(meta[2]) };
	}

	const first = s.charAt(0);
	if (first === '@') {
		const m = ACTION_RE.exec(s);
		const attribution = m ? parseAttribution(m[1], 'implicit') : { mode: 'implicit' as ActorMode, actors: [] };
		const scanned = extractTags(m ? m[2] : s.slice(1));
		return { kind: 'action', mode: attribution.mode, actors: attribution.actors, text: scanned.text, tags: scanned.tags };
	}
	if (first === '!') {
		const scanned = extractTags(s.slice(1));
		return { kind: 'event', text: scanned.text, tags: scanned.tags };
	}
	if (s.startsWith('=>') || s.startsWith('⇒')) {
		const scanned = extractTags(s.replace(/^(=>|⇒)/, ''));
		return { kind: 'consequence', text: scanned.text, tags: scanned.tags };
	}

	const roll = ROLL_RE.exec(s);
	if (roll) {
		const attribution = parseAttribution(roll[1], 'none');
		const split = splitOutcome(roll[2]);
		const entry: RollEntry = {
			kind: 'roll',
			mode: attribution.mode,
			actors: attribution.actors,
			expression: split.expression,
			tags: [],
		};
		if (split.outcomeRaw !== undefined) {
			const scanned = extractTags(split.outcomeRaw);
			entry.outcome = scanned.text;
			entry.tags = scanned.tags;
		}
		return entry;
	}

	const table = TABLE_RE.exec(s);
	if (table) {
		const split = splitOutcome(table[2]);
		const scanned = split.outcomeRaw !== undefined ? extractTags(split.outcomeRaw) : { tags: [] as Tag[], text: '' };
		const entry: TableEntry = {
			kind: 'table',
			source: table[1] as 'tbl' | 'gen',
			expression: split.expression,
			tags: scanned.tags,
		};
		if (split.outcomeRaw !== undefined) entry.outcome = scanned.text;
		return entry;
	}

	const dialogue = DIALOGUE_RE.exec(s);
	if (dialogue) {
		return {
			kind: 'dialogue',
			speaker: dialogue[1] as 'PC' | 'N',
			name: collapseSpaces(dialogue[2]),
			text: collapseSpaces(dialogue[3]),
		};
	}

	if (first === '[') {
		const advance = parseAdvanceAnalog(s);
		if (advance) return { kind: 'tags', tags: [advance], text: '' };
	}

	const scanned = extractTags(s);
	if (first === '[' && scanned.tags.length > 0) {
		return { kind: 'tags', tags: scanned.tags, text: scanned.text };
	}
	return { kind: 'prose', text: scanned.text, tags: scanned.tags };
}

/**
 * Parses one line of Partylog notation. Unknown lines become `prose`. Never throws.
 * Multi-line tags and parentheticals are handled by `parsePartylogLog`; a single line
 * containing an unclosed bracket is parsed as prose.
 */
export function parsePartylogLine(line: string): PartylogEntry {
	try {
		return parseLine(typeof line === 'string' ? line : String(line));
	} catch {
		return { kind: 'prose', text: collapseSpaces(String(line)), tags: [] };
	}
}

// ---------------------------------------------------------------------------
// Log parser
// ---------------------------------------------------------------------------

function needsMoreLines(text: string): boolean {
	if (countChar(text, '[') > countChar(text, ']')) return true;
	return text.charAt(0) === '(' && countChar(text, '(') > countChar(text, ')');
}

/** Joins following lines while a bracket or leading parenthesis is still open. */
function accumulate(lines: string[], index: number): { text: string; next: number } {
	const first = lines[index].trim();
	if (!needsMoreLines(first)) return { text: first, next: index + 1 };
	let joined = first;
	for (let k = index + 1; k < lines.length && k - index <= 40; k++) {
		const part = lines[k].trim();
		if (part === '') break;
		joined += `\n${part}`;
		if (!needsMoreLines(joined)) return { text: joined, next: k + 1 };
	}
	return { text: first, next: index + 1 };
}

function headerPairs(trimmed: string): Array<[string, string]> | undefined {
	const italic = /^\*([^*]+)\*$/.exec(trimmed);
	if (italic && italic[1].indexOf(':') >= 0) {
		const pairs: Array<[string, string]> = [];
		for (const part of italic[1].split(' | ')) {
			const kv = /^\s*([A-Za-z][A-Za-z ]*?):\s*(.*)$/.exec(part);
			if (kv) pairs.push([kv[1].trim(), collapseSpaces(kv[2])]);
		}
		return pairs.length > 0 ? pairs : undefined;
	}
	const bold = /^\*\*([A-Za-z][A-Za-z ]*):\*\*\s*(.*)$/.exec(trimmed);
	if (bold) return [[bold[1].trim(), collapseSpaces(bold[2])]];
	const analog = /^\[([A-Za-z][A-Za-z ]*)\]\s*(.*)$/.exec(trimmed);
	if (analog) return [[analog[1].trim(), collapseSpaces(analog[2])]];
	return undefined;
}

function applySessionField(header: SessionHeader, key: string, value: string): void {
	switch (key.toLowerCase()) {
		case 'date':
			header.date = value;
			break;
		case 'duration':
			header.duration = value;
			break;
		case 'scenes': {
			const range = /^(\S+?)\s*[-‐-―−]\s*(\S+)$/.exec(value);
			if (range) header.scenes = { from: range[1], to: range[2] };
			break;
		}
		case 'players':
			header.players = splitTopLevel(value, ',');
			break;
		case 'scribe':
			header.scribe = value;
			break;
		case 'absent':
			header.absent = splitTopLevel(value, ',');
			break;
		case 'mood':
			header.mood = value;
			break;
		case 'threads':
			header.threads = splitTopLevel(value, ',');
			break;
		case 'recap':
			header.recap = value;
			break;
		case 'goals':
			header.goals = value;
			break;
		case 'notes':
			header.notes = value;
			break;
		default:
			break;
	}
}

function parseFrontMatter(lines: string[]): CampaignHeader {
	const campaign: CampaignHeader = { fields: {}, pcs: [] };
	let listKey: string | undefined;
	for (const line of lines) {
		const item = /^\s*-\s+(.*)$/.exec(line);
		if (item && listKey === 'pcs') {
			const value = collapseSpaces(item[1]);
			if (value) campaign.pcs.push(value);
			continue;
		}
		const kv = /^([A-Za-z_][A-Za-z0-9_ -]*):\s*(.*)$/.exec(line.replace(/\s+$/, ''));
		if (!kv) continue;
		const key = kv[1].trim();
		const value = collapseSpaces(kv[2]);
		listKey = undefined;
		if (key === 'title') {
			if (value) campaign.title = value;
		} else if (key === 'pcs' && value) {
			campaign.pcs.push(...splitTopLevel(value, ','));
		} else if (value === '') {
			listKey = key;
		} else {
			campaign.fields[key] = value;
		}
	}
	return campaign;
}

function applyCampaignField(campaign: CampaignHeader, key: string, value: string): void {
	if (key.toLowerCase() === 'title') campaign.title = value;
	else if (key.toLowerCase() === 'pcs') campaign.pcs = splitTopLevel(value, ',');
	else campaign.fields[key] = value;
}

const TEXT_ENTRY_KINDS: Record<string, boolean> = {
	action: true,
	event: true,
	consequence: true,
	dialogue: true,
	prose: true,
};

interface LogBuilder {
	campaign?: CampaignHeader;
	sessionHeader?: SessionHeader;
	sessionEnd?: SessionEnd;
	scenes: ParsedScene[];
	interludes: Interlude[];
	sequence: LogItem[];
	current?: PartylogEntry[];
}

function parseLog(markdown: string): ParsedLog {
	const source = typeof markdown === 'string' ? markdown : '';
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const builder: LogBuilder = { scenes: [], interludes: [], sequence: [] };
	let mode: 'none' | 'session' | 'campaign' = 'none';
	let header: SessionHeader | undefined;
	let lastKey: string | undefined;
	let lastValue = '';
	let prevBlank = true;
	let narrative: string[] | undefined;

	const startScene = (id: SceneId | undefined, context: string): void => {
		const scene: ParsedScene = { context, entries: [] };
		if (id) scene.id = id;
		builder.scenes.push(scene);
		builder.sequence.push({ kind: 'scene', scene });
		builder.current = scene.entries;
		mode = 'none';
		header = undefined;
	};

	const ensureContainer = (): PartylogEntry[] => {
		if (!builder.current) startScene(undefined, '');
		return builder.current as PartylogEntry[];
	};

	const pushEntry = (entry: PartylogEntry): void => {
		const target = ensureContainer();
		const last = target.length > 0 ? target[target.length - 1] : undefined;
		if (entry.kind === 'prose' && !prevBlank && last && TEXT_ENTRY_KINDS[last.kind]) {
			const merged = { ...last, text: collapseSpaces(`${(last as { text: string }).text} ${entry.text}`) } as PartylogEntry;
			if ('tags' in last) (merged as { tags: Tag[] }).tags = [...last.tags, ...entry.tags];
			target[target.length - 1] = merged;
		} else {
			target.push(entry);
		}
		prevBlank = false;
	};

	let i = 0;
	if (lines.length > 0 && lines[0].trim() === '---') {
		let close = -1;
		for (let k = 1; k < lines.length; k++) {
			if (lines[k].trim() === '---') {
				close = k;
				break;
			}
		}
		if (close > 0) {
			builder.campaign = parseFrontMatter(lines.slice(1, close));
			i = close + 1;
		}
	}
	while (i < lines.length) {
		const raw = lines[i];
		const trimmed = raw.trim();

		if (narrative) {
			if (trimmed === '---\\') {
				pushEntry({ kind: 'narrative', text: narrative.join('\n') });
				narrative = undefined;
			} else {
				narrative.push(trimmed);
			}
			i++;
			continue;
		}
		if (trimmed.startsWith('```')) {
			prevBlank = true;
			i++;
			continue;
		}
		if (trimmed === '') {
			prevBlank = true;
			i++;
			continue;
		}
		if (trimmed === '\\---') {
			narrative = [];
			i++;
			continue;
		}

		if (mode !== 'none') {
			const pairs = headerPairs(trimmed);
			if (pairs) {
				const [key, value] = pairs[pairs.length - 1];
				for (const [k, v] of pairs) {
					if (mode === 'session' && header) applySessionField(header, k, v);
					else if (mode === 'campaign' && builder.campaign) applyCampaignField(builder.campaign, k, v);
				}
				lastKey = key;
				lastValue = value;
				prevBlank = false;
				i++;
				continue;
			}
			const probe = parsePartylogLine(trimmed);
			const structural = probe.kind === 'scene' || probe.kind === 'session-heading' || probe.kind === 'session-end-heading' || probe.kind === 'interlude-heading' || CAMPAIGN_RE.test(trimmed);
			const continues = !structural && (/^\s/.test(raw) || (!prevBlank && probe.kind === 'prose'));
			if (continues && lastKey !== undefined) {
				lastValue = collapseSpaces(`${lastValue} ${trimmed}`);
				if (mode === 'session' && header) applySessionField(header, lastKey, lastValue);
				else if (mode === 'campaign' && builder.campaign) applyCampaignField(builder.campaign, lastKey, lastValue);
				prevBlank = false;
				i++;
				continue;
			}
			mode = 'none';
		}

		const campaign = CAMPAIGN_RE.exec(trimmed);
		if (campaign) {
			builder.campaign = builder.campaign ?? { fields: {}, pcs: [] };
			builder.campaign.title = collapseSpaces(campaign[1]);
			mode = 'campaign';
			lastKey = undefined;
			prevBlank = true;
			i++;
			continue;
		}

		if (/^#\s+/.test(trimmed)) {
			const title = collapseSpaces(trimmed.replace(/^#\s+/, ''));
			builder.campaign = builder.campaign ?? { fields: {}, pcs: [] };
			if (!builder.campaign.title && title) builder.campaign.title = title;
			prevBlank = true;
			i++;
			continue;
		}

		const accumulated = accumulate(lines, i);
		i = accumulated.next;
		const entry = parsePartylogLine(accumulated.text);

		switch (entry.kind) {
			case 'blank':
				prevBlank = true;
				break;
			case 'scene':
				startScene(entry.id, entry.context);
				prevBlank = true;
				break;
			case 'session-heading': {
				header = { players: [], absent: [], threads: [] };
				if (entry.number !== undefined) header.number = entry.number;
				if (!builder.sessionHeader) builder.sessionHeader = header;
				builder.sequence.push({ kind: 'session', header });
				builder.current = undefined;
				mode = 'session';
				lastKey = undefined;
				prevBlank = true;
				break;
			}
			case 'session-end-heading': {
				const end: SessionEnd = { entries: [] };
				if (entry.number !== undefined) end.number = entry.number;
				builder.sessionEnd = end;
				builder.sequence.push({ kind: 'session-end', end });
				builder.current = end.entries;
				mode = 'none';
				header = undefined;
				prevBlank = true;
				break;
			}
			case 'interlude-heading': {
				const interlude: Interlude = { title: entry.title, entries: [] };
				builder.interludes.push(interlude);
				builder.sequence.push({ kind: 'interlude', interlude });
				builder.current = interlude.entries;
				mode = 'none';
				header = undefined;
				prevBlank = true;
				break;
			}
			case 'prose':
				if (accumulated.text.startsWith('#')) {
					prevBlank = true;
					break;
				}
				pushEntry(entry);
				break;
			default:
				pushEntry(entry);
		}
	}
	if (narrative) {
		pushEntry({ kind: 'narrative', text: narrative.join('\n') });
	}

	const log: ParsedLog = {
		scenes: builder.scenes,
		interludes: builder.interludes,
		sequence: builder.sequence,
	};
	if (builder.campaign) log.campaign = builder.campaign;
	if (builder.sessionHeader) log.sessionHeader = builder.sessionHeader;
	if (builder.sessionEnd) log.sessionEnd = builder.sessionEnd;
	return log;
}

/**
 * Parses a Partylog markdown or analog log. Supports YAML front matter, `#` campaign titles,
 * session headers (digital and analog), scenes, flashbacks, split party, montages, session end
 * and interlude blocks, fenced and unfenced notation, multi-line tags and parentheticals,
 * dialogue, and `\---` narrative blocks. Never throws.
 */
export function parsePartylogLog(markdown: string): ParsedLog {
	try {
		return parseLog(markdown);
	} catch {
		return { scenes: [], interludes: [], sequence: [] };
	}
}
