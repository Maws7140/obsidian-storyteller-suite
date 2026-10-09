/*
 * Lorelog parser: tolerant line classifier and log parser. Never throws.
 *
 * Lorelog by Roberto Bisceglie (Loreseed Workshop), a sibling of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { extractTags, normalizeStatement } from './tags';
import type {
	LorelogBuild,
	LorelogBuildMeta,
	LorelogCycle,
	LorelogFact,
	LorelogLine,
	LorelogLog,
	LorelogNote,
	LorelogNoteType,
	LorelogTest,
	LorelogTable,
	LorelogTrigger,
} from './types';

const CYCLE_HEADING_RE = /^(?:#{1,6}\s+)?((?:M\d+-)?C\d+(?:\.\d+|[a-z])?)(?:\s+\*([^*]*)\*)?(?:\s+\(§([^)]*)\))?(?:\s+\((kept)\))?\s*$/;
const INLINE_CYCLE_RE = /^((?:M\d+-)?C\d+(?:\.\d+|[a-z])?)\s+(.+)$/;
const BUILD_RE = /^(?:#{1,6}\s*Build\s+(\d+)|={2,}\s*Build\s+(\d+)\s*={2,})$/i;
const PHASE_RE = /^={2,}\s*Phase\s+(\d+)?\s*:?\s*(.*?)\s*={2,}$/i;
const WORLD_RE = /^={2,}\s*World Log:?\s*(.*?)\s*={2,}$/i;
const TRIGGER_Q_RE = /^\?(?:\(([^()]+)\))?\s*(.*)$/;
const TRIGGER_N_RE = /^!(?:\(([^()]+)\))?\s*(.*)$/;
const FACT_RE = /^(=\?|x=|=(?!>))(?:\(([^()]+)\))?\s*(.*)$/;
const FRICTION_RE = /^~(?:\(([^()]+)\))?\s*(.*)$/;
const RIPPLE_RE = /^>>\s*(.*)$/;
const VIA_RE = /^via:\s*(.+)$/i;
const TEST_RE = /^t:\s*(.*)$/;
const RESULT_RE = /^->\s*(.*)$/;
const TABLE_RE = /^(tbl|gen)\s*:\s*(.*)$/;
const NOTE_RE = /^\((why|note|parked)\s*:\s*(.*)\)$/i;
const ANALOG_FIELD_RE = /^\[([A-Za-z][A-Za-z ]*)\]\s+(.+)$/;
const ITALIC_META_RE = /^\*([^*]+)\*$/;
const BOLD_FIELD_RE = /^\*\*([A-Za-z][A-Za-z ]*):\*\*\s*(.*)$/;
const SECTION_TAIL_RE = /\s*\(§([^)]*)\)\s*$/;
const NEEDS_RE = /^(.+?)\s+needs\s+(.+)$/i;
const SYMBOLS = ['>>', 'x=', '=?', '=', '?', '!', '~'] as const;

function sectionOf(text: string): { text: string; section?: string } {
	const m = SECTION_TAIL_RE.exec(text);
	if (!m) return { text: text.trim() };
	return { text: text.slice(0, m.index).trim(), section: m[1].trim() };
}

function startsWithSymbol(text: string, i: number): boolean {
	for (const sym of SYMBOLS) {
		if (!text.startsWith(sym, i)) continue;
		if (sym === '=' && text.charAt(i + 1) === '>') return false;
		return true;
	}
	return false;
}

/**
 * Splits `text` at symbols that start a word (`?water`, ` = Guild`, ` >> [F:Guild]`). Symbols
 * inside brackets or parentheses are ignored. Returns the text before the first symbol and the
 * segments that start at each symbol.
 */
function splitSymbols(text: string): { lead: string; segments: string[] } {
	const starts: number[] = [];
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charAt(i);
		if (ch === '[' || ch === '(') {
			depth++;
			continue;
		}
		if ((ch === ']' || ch === ')') && depth > 0) {
			depth--;
			continue;
		}
		if (depth > 0) continue;
		if (i !== 0 && !/\s/.test(text.charAt(i - 1))) continue;
		if (startsWithSymbol(text, i)) starts.push(i);
	}
	if (starts.length === 0) return { lead: text.trim(), segments: [] };
	const lead = text.slice(0, starts[0]).trim();
	const segments = starts.map((start, index) => text.slice(start, index + 1 < starts.length ? starts[index + 1] : text.length).trim());
	return { lead, segments };
}

/** Classifies one line that is not a cycle heading or inline cycle. */
function parseSingle(raw: string): LorelogLine {
	const line = raw.trim();
	if (line.length === 0) return { kind: 'blank' };

	const trigger = TRIGGER_Q_RE.exec(line);
	if (line.startsWith('?')) {
		const body = sectionOf(trigger ? trigger[2] : line.slice(1));
		return {
			kind: 'trigger',
			trigger: {
				kind: 'question',
				text: body.text,
				section: body.section,
				author: trigger?.[1]?.trim() || undefined,
				line: 0,
			},
		};
	}
	if (line.startsWith('!')) {
		const m = TRIGGER_N_RE.exec(line);
		const body = sectionOf(m ? m[2] : line.slice(1));
		const needs = NEEDS_RE.exec(body.text);
		return {
			kind: 'trigger',
			trigger: {
				kind: 'need',
				text: needs ? needs[2].trim() : body.text,
				unit: needs ? needs[1].trim() : undefined,
				section: body.section,
				author: m?.[1]?.trim() || undefined,
				line: 0,
			},
		};
	}

	const fact = FACT_RE.exec(line);
	if (fact) {
		const op = fact[1];
		const extracted = extractTags(fact[3]);
		const kind = op === 'x=' ? 'retraction' : op === '=?' ? 'provisional' : 'fact';
		return {
			kind: 'fact',
			fact: {
				kind,
				text: extracted.text,
				tags: extracted.tags,
				author: fact[2]?.trim() || undefined,
			},
		};
	}

	const friction = FRICTION_RE.exec(line);
	if (friction) {
		const extracted = extractTags(friction[2]);
		return {
			kind: 'friction',
			friction: { text: extracted.text, tags: extracted.tags, author: friction[1]?.trim() || undefined },
		};
	}

	const ripple = RIPPLE_RE.exec(line);
	if (ripple) {
		let body = ripple[1].trim();
		let section: string | undefined;
		const sec = /^§([^:\s[]+)\s*(?::\s*)?(.*)$/.exec(body);
		if (sec) {
			section = sec[1].trim();
			body = sec[2].trim();
		}
		const extracted = extractTags(body);
		return { kind: 'ripple', ripple: { text: extracted.text, tags: extracted.tags, section } };
	}

	const via = VIA_RE.exec(line);
	if (via) return { kind: 'via', method: via[1].trim() };

	const test = TEST_RE.exec(line);
	if (test) {
		const { namePart, result } = splitResult(test[1]);
		const bracket = /\[([^\]]*)\]/.exec(namePart);
		const name = (bracket ? namePart.slice(0, bracket.index) : namePart).trim();
		return {
			kind: 'test',
			name,
			subject: bracket ? bracket[1].trim() : undefined,
			result,
		};
	}

	const result = RESULT_RE.exec(line);
	if (result) return { kind: 'test-result', result: result[1].trim() };

	const table = TABLE_RE.exec(line);
	if (table) return { kind: 'table', source: table[1] as 'tbl' | 'gen', expression: table[2].trim() };

	const note = NOTE_RE.exec(line);
	if (note) return { kind: 'note', type: note[1].toLowerCase() as LorelogNoteType, text: note[2].trim() };

	const bold = BOLD_FIELD_RE.exec(line);
	if (bold) return { kind: 'header-field', key: bold[1].trim().toLowerCase(), value: bold[2].trim() };

	const italic = ITALIC_META_RE.exec(line);
	if (italic && italic[1].includes(':')) {
		const pairs = parseMetaPairs(italic[1]);
		if (pairs.length > 0) return { kind: 'header-meta', pairs };
	}

	const analog = ANALOG_FIELD_RE.exec(line);
	if (analog) return { kind: 'header-field', key: analog[1].trim().toLowerCase().replace(/\s+/g, '_'), value: analog[2].trim() };

	if (line.startsWith('[')) {
		const extracted = extractTags(line);
		if (extracted.tags.length > 0 && extracted.text.length === 0) return { kind: 'tags', tags: extracted.tags };
	}

	return { kind: 'prose', text: line };
}

/** Splits a test body at its last top-level `->` into the name part and the result. */
function splitResult(body: string): { namePart: string; result?: string } {
	let depth = 0;
	let arrow = -1;
	for (let i = 0; i < body.length; i++) {
		const ch = body.charAt(i);
		if (ch === '[' || ch === '(') depth++;
		else if ((ch === ']' || ch === ')') && depth > 0) depth--;
		else if (depth === 0 && body.startsWith('->', i)) arrow = i;
	}
	if (arrow < 0) return { namePart: body.trim() };
	return { namePart: body.slice(0, arrow).trim(), result: body.slice(arrow + 2).trim() };
}

/** `Key: value | Key: value` pairs, keys lower-cased. */
export function parseMetaPairs(text: string): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	for (const part of text.split('|')) {
		const m = /^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.*?)\s*$/.exec(part);
		if (m) pairs.push([m[1].trim().toLowerCase(), m[2]]);
	}
	return pairs;
}

/**
 * Classifies one line of Lorelog notation. Lines that are not notation come back as `prose`,
 * and tolerant parsing never throws. Inline cycles such as `C1 ?water = Guild wells >> [F:Guild]`
 * come back as `inline-cycle` with one part per symbol.
 */
export function parseLorelogLine(raw: string): LorelogLine {
	try {
		const line = String(raw ?? '').trim();
		if (line.length === 0) return { kind: 'blank' };

		const heading = CYCLE_HEADING_RE.exec(line);
		if (heading) {
			const section = heading[3]?.trim();
			return {
				kind: 'cycle-heading',
				id: heading[1],
				title: heading[2]?.trim() || undefined,
				section: section || undefined,
				kept: heading[4] !== undefined ? true : undefined,
			};
		}

		const inline = INLINE_CYCLE_RE.exec(line);
		if (inline && !inline[2].startsWith('*')) {
			const split = splitSymbols(inline[2]);
			if (split.segments.length > 0) {
				const parts = split.segments.map(parseSingle);
				if (split.lead.length > 0) {
					parts.unshift({ kind: 'prose', text: split.lead });
				}
				return { kind: 'inline-cycle', id: inline[1], parts };
			}
			const body = sectionOf(inline[2]);
			return {
				kind: 'cycle-heading',
				id: inline[1],
				title: body.text || undefined,
				section: body.section,
			};
		}

		const build = BUILD_RE.exec(line);
		if (build) {
			const number = Number(build[1] ?? build[2]);
			return { kind: 'build-heading', number, meta: {}, fields: {} };
		}

		const phase = PHASE_RE.exec(line);
		if (phase) {
			const number = phase[1] !== undefined ? Number(phase[1]) : undefined;
			const name = phase[2].trim() || (number !== undefined ? `Phase ${number}` : 'Phase');
			return { kind: 'phase', number, name };
		}

		const world = WORLD_RE.exec(line);
		if (world) return { kind: 'world-heading', title: world[1].trim() };

		return parseSingle(line);
	} catch {
		return { kind: 'prose', text: String(raw ?? '') };
	}
}

// ---------------------------------------------------------------------------
// Log parser
// ---------------------------------------------------------------------------

const BUILD_META_KEYS: Record<string, keyof LorelogBuildMeta> = {
	date: 'date',
	duration: 'duration',
	phase: 'phase',
	cycles: 'cycles',
	focus: 'focus',
};

function applyBuildField(build: LorelogBuild, key: string, value: string): void {
	const metaKey = BUILD_META_KEYS[key];
	if (metaKey) build.meta[metaKey] = value;
	else build.fields[key] = value;
}

function testStatus(result: string | undefined): LorelogTest['status'] {
	if (result === undefined || result.length === 0) return 'none';
	if (/^pass\b/i.test(result)) return 'pass';
	if (/^gap\b/i.test(result)) return 'gap';
	if (/^fail\b/i.test(result)) return 'fail';
	return 'other';
}

function newCycle(line: number, id: string | undefined, build: number | undefined, phase: string | undefined): LorelogCycle {
	return {
		id,
		line,
		build,
		phase,
		triggers: [],
		vias: [],
		facts: [],
		frictions: [],
		ripples: [],
		followUps: [],
		tests: [],
		tables: [],
		notes: [],
		tags: [],
	};
}

/** Bracket depth of a line, counting `[` and `]` only. */
function openBrackets(text: string): number {
	let depth = 0;
	for (const ch of text) {
		if (ch === '[') depth++;
		else if (ch === ']') depth--;
	}
	return depth;
}

/**
 * Parses a whole Lorelog document: front matter or analog header, build sessions, phase
 * markers, cycles (headed, inline, or implicit), and retraction and confirmation links.
 * Notation inside code fences and outside them is read the same way. Prose is ignored.
 */
export function parseLorelogLog(markdown: string): LorelogLog {
	const log: LorelogLog = { header: { fields: {} }, builds: [], phases: [], cycles: [] };
	const rawLines = String(markdown ?? '').split(/\r?\n/);
	let index = 0;

	// Front matter: a `---` block at the very top, holding `key: value` lines.
	let first = 0;
	while (first < rawLines.length && rawLines[first].trim() === '') first++;
	if (rawLines[first]?.trim() === '---') {
		let close = first + 1;
		while (close < rawLines.length && rawLines[close].trim() !== '---') close++;
		if (close < rawLines.length) {
			for (let j = first + 1; j < close; j++) {
				const m = /^([A-Za-z_][\w -]*):\s*(.*)$/.exec(rawLines[j]);
				if (m) setHeaderField(log, m[1], m[2]);
			}
			index = close + 1;
		}
	}

	let current: LorelogCycle | undefined;
	let build: LorelogBuild | undefined;
	let phase: string | undefined;
	let block: { kind: 'test'; test: LorelogTest } | { kind: 'table'; table: LorelogTable } | undefined;
	let lastFact: LorelogFact | undefined;
	const allFacts: LorelogFact[] = [];

	const startCycle = (line: number, id: string | undefined): LorelogCycle => {
		const cycle = newCycle(line, id, build?.number, phase);
		log.cycles.push(cycle);
		current = cycle;
		return cycle;
	};
	const cycleFor = (line: number): LorelogCycle => current ?? startCycle(line, undefined);

	const addFact = (cycle: LorelogCycle, entry: LorelogFact, line: number): void => {
		entry.line = line;
		entry.retracted = false;
		if (entry.kind === 'fact') {
			const key = normalizeStatement(entry.text);
			for (const earlier of allFacts) {
				if (earlier.kind === 'provisional' && earlier.confirmedBy === undefined && !earlier.retracted && normalizeStatement(earlier.text) === key) {
					earlier.confirmedBy = line;
					break;
				}
			}
		}
		cycle.facts.push(entry);
		allFacts.push(entry);
		lastFact = entry;
	};

	const addTrigger = (trigger: LorelogTrigger, line: number): void => {
		trigger.line = line;
		let cycle = current ?? startCycle(line, undefined);
		if (cycle.ripples.length > 0) {
			cycle.followUps.push(trigger);
		} else if (cycle.facts.length > 0 || cycle.frictions.length > 0) {
			cycle = startCycle(line, undefined);
			cycle.triggers.push(trigger);
		} else {
			cycle.triggers.push(trigger);
		}
	};

	const applyLine = (parsed: LorelogLine, line: number): void => {
		switch (parsed.kind) {
			case 'blank':
			case 'prose':
				return;
			case 'cycle-heading': {
				const cycle = startCycle(line, parsed.id);
				cycle.title = parsed.title;
				cycle.section = parsed.section;
				if (parsed.kept) cycle.kept = true;
				return;
			}
			case 'inline-cycle': {
				startCycle(line, parsed.id);
				for (const part of parsed.parts) applyLine(part, line);
				return;
			}
			case 'build-heading': {
				build = { number: parsed.number, line, meta: {}, fields: {} };
				log.builds.push(build);
				current = undefined;
				return;
			}
			case 'phase': {
				log.phases.push({ number: parsed.number, name: parsed.name, line });
				phase = parsed.name;
				current = undefined;
				return;
			}
			case 'world-heading': {
				if (!log.header.title && parsed.title) log.header.title = parsed.title;
				return;
			}
			case 'header-field': {
				if (log.cycles.length === 0 && log.builds.length === 0) {
					setHeaderField(log, parsed.key, parsed.value);
				} else if (build && current === undefined) {
					applyBuildField(build, parsed.key, parsed.value);
				}
				return;
			}
			case 'header-meta': {
				for (const [key, value] of parsed.pairs) {
					if (build && current === undefined) applyBuildField(build, key, value);
				}
				return;
			}
			case 'trigger': {
				addTrigger({ ...parsed.trigger }, line);
				return;
			}
			case 'fact': {
				const cycle = cycleFor(line);
				addFact(cycle, { ...parsed.fact, retracted: false, line }, line);
				return;
			}
			case 'friction': {
				const cycle = cycleFor(line);
				cycle.frictions.push({ ...parsed.friction, line });
				return;
			}
			case 'ripple': {
				const cycle = cycleFor(line);
				cycle.ripples.push({ ...parsed.ripple, line });
				return;
			}
			case 'via': {
				cycleFor(line).vias.push(parsed.method);
				return;
			}
			case 'test': {
				const cycle = cycleFor(line);
				const test: LorelogTest = {
					name: parsed.name,
					subject: parsed.subject,
					result: parsed.result,
					status: testStatus(parsed.result),
					details: [],
					line,
				};
				cycle.tests.push(test);
				block = { kind: 'test', test };
				return;
			}
			case 'test-result': {
				const cycle = current;
				const test = cycle?.tests[cycle.tests.length - 1];
				if (test && test.result === undefined) {
					test.result = parsed.result;
					test.status = testStatus(parsed.result);
				}
				return;
			}
			case 'table': {
				const cycle = cycleFor(line);
				const table: LorelogTable = { source: parsed.source, expression: parsed.expression, details: [], line };
				cycle.tables.push(table);
				block = { kind: 'table', table };
				return;
			}
			case 'note': {
				const cycle = cycleFor(line);
				const note: LorelogNote = { type: parsed.type, text: parsed.text, line };
				cycle.notes.push(note);
				if (parsed.type === 'why' && lastFact?.kind === 'retraction' && lastFact.reason === undefined) {
					lastFact.reason = parsed.text;
				}
				return;
			}
			case 'tags': {
				cycleFor(line).tags.push({ tags: parsed.tags, line });
				return;
			}
		}
	};

	const finishFacts = (): void => {
		// Retractions remove the latest earlier fact with the same statement.
		for (const retraction of log.cycles.flatMap((c) => c.facts).filter((f) => f.kind === 'retraction')) {
			const key = normalizeStatement(retraction.text);
			for (let i = allFacts.length - 1; i >= 0; i--) {
				const candidate = allFacts[i];
				if (candidate.kind === 'retraction' || candidate.retracted) continue;
				if (candidate.line >= retraction.line) continue;
				if (normalizeStatement(candidate.text) !== key) continue;
				candidate.retracted = true;
				candidate.retractedBy = retraction.line;
				break;
			}
		}
	};

	for (; index < rawLines.length; index++) {
		const raw = rawLines[index];
		const trimmed = raw.trim();
		if (trimmed.startsWith('```')) continue;
		if (trimmed.length === 0) {
			block = undefined;
			continue;
		}

		// Multi-line tags: join lines until the brackets balance.
		let text = trimmed;
		let consumedTo = index;
		if (openBrackets(text) > 0) {
			let depth = openBrackets(text);
			for (let j = index + 1; j < rawLines.length && j - index < 30 && depth > 0; j++) {
				const part = rawLines[j].trim();
				text = `${text} ${part}`;
				depth += openBrackets(part);
				consumedTo = j;
			}
			if (depth > 0) {
				text = trimmed;
				consumedTo = index;
			}
		}

		const indented = /^\s/.test(raw);
		if (block && indented && consumedTo === index) {
			if (block.kind === 'test') block.test.details.push(text);
			else block.table.details.push(text);
			continue;
		}
		if (block?.kind === 'test' && RESULT_RE.test(text) && block.test.result === undefined) {
			const result = RESULT_RE.exec(text)?.[1].trim() ?? '';
			block.test.result = result;
			block.test.status = testStatus(result);
			continue;
		}
		if (block && !indented) block = undefined;
		if (block && indented && consumedTo !== index) {
			// A multi-line tag inside a block belongs to the block's details.
			if (block.kind === 'test') block.test.details.push(text);
			else block.table.details.push(text);
			index = consumedTo;
			continue;
		}

		const parsed = parseLorelogLine(text);
		// A markdown heading that is not notation closes the cycle above it.
		if (parsed.kind === 'prose' && /^#{1,6}\s/.test(text)) {
			current = undefined;
			block = undefined;
		} else {
			applyLine(parsed, index + 1);
		}
		index = consumedTo;
	}

	finishFacts();
	return log;
}

function setHeaderField(log: LorelogLog, rawKey: string, rawValue: string): void {
	const key = rawKey.trim().toLowerCase().replace(/\s+/g, '_');
	const value = rawValue.trim().replace(/^["']|["']$/g, '');
	if (key === 'title') {
		if (!log.header.title) log.header.title = value;
		return;
	}
	log.header.fields[key] = value;
}
