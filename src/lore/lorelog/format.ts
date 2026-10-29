/*
 * Lorelog formatter: canonical markdown output for every element. Output parses back to the
 * same model with `parseLorelogLine` and `parseLorelogLog`.
 *
 * Lorelog by Roberto Bisceglie (Loreseed Workshop), a sibling of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { formatTag } from './tags';
import type { Tag } from './tags';
import type {
	LorelogBuild,
	LorelogBuildMeta,
	LorelogCycle,
	LorelogFact,
	LorelogNote,
	LorelogTable,
	LorelogTest,
	LorelogTrigger,
} from './types';

export type LorelogStyle = 'digital' | 'analog';

function joinParts(parts: Array<string | undefined>): string {
	return parts.filter((part): part is string => part !== undefined && part.length > 0).join(' ');
}

export function formatTags(tags: Tag[]): string {
	return tags.map(formatTag).join(' ');
}

/** `(§Section)` suffix, or '' when there is no section. */
function sectionSuffix(section: string | undefined): string | undefined {
	return section && section.trim().length > 0 ? `(§${section.trim()})` : undefined;
}

/** `(Name)` attribution directly after the symbol, or ''. */
function attribution(author: string | undefined): string {
	return author && author.trim().length > 0 ? `(${author.trim()})` : '';
}

/** Front matter (digital) or the analog header block for a world. */
export function formatWorldHeader(header: { title?: string; fields?: Record<string, string> }, style: LorelogStyle = 'digital'): string[] {
	const fields = Object.entries(header.fields ?? {}).filter(([, value]) => value.length > 0);
	if (style === 'analog') {
		const lines = [`=== World Log${header.title ? `: ${header.title}` : ''} ===`];
		const width = Math.max(10, ...fields.map(([key]) => key.length + 2));
		for (const [key, value] of fields) {
			const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
			lines.push(`[${label}]`.padEnd(width) + value);
		}
		return lines;
	}
	const lines = ['---'];
	if (header.title) lines.push(`title: ${header.title}`);
	for (const [key, value] of fields) lines.push(`${key}: ${value}`);
	lines.push('---');
	return lines;
}

/** Digital: `## Build N` plus an italic meta line. Analog: `=== Build N ===` plus `[Key]` lines. */
export function formatBuildHeader(input: { number: number; meta?: LorelogBuildMeta }, style: LorelogStyle = 'digital'): string[] {
	const meta = input.meta ?? {};
	const pairs: Array<[string, string]> = [];
	if (meta.date) pairs.push(['Date', meta.date]);
	if (meta.duration) pairs.push(['Duration', meta.duration]);
	if (meta.phase) pairs.push(['Phase', meta.phase]);
	if (meta.cycles) pairs.push(['Cycles', meta.cycles]);
	if (style === 'analog') {
		const lines = [`=== Build ${input.number} ===`];
		const width = Math.max(12, ...pairs.map(([key]) => key.length + 3));
		for (const [key, value] of pairs) lines.push(`[${key}]`.padEnd(width) + value);
		if (meta.focus) lines.push(`[Focus]`.padEnd(width) + meta.focus);
		return lines;
	}
	const lines = [`## Build ${input.number}`];
	if (pairs.length > 0) lines.push(`*${pairs.map(([key, value]) => `${key}: ${value}`).join(' | ')}*`);
	if (meta.focus) lines.push('', `**Focus:** ${meta.focus}`);
	return lines;
}

export function formatPhase(name: string, number?: number): string {
	return `=== ${number !== undefined ? `Phase ${number}: ` : ''}${name} ===`;
}

/** `C7 *Title* (§Section) (kept)`. Digital output adds the `###` heading marker. */
export function formatCycleHeading(input: { id: string; title?: string; section?: string; kept?: boolean }, style: LorelogStyle = 'digital'): string {
	const title = input.title && input.title.trim().length > 0 ? ` *${input.title.trim()}*` : '';
	const section = sectionSuffix(input.section);
	const kept = input.kept ? ' (kept)' : '';
	const head = `${input.id}${title}${section ? ` ${section}` : ''}${kept}`;
	return style === 'digital' ? `### ${head}` : head;
}

/** `? question` or `! Unit needs text`. */
export function formatTrigger(trigger: Pick<LorelogTrigger, 'kind' | 'text' | 'unit' | 'section' | 'author'>): string {
	if (trigger.kind === 'need') {
		const body = trigger.unit ? `${trigger.unit} needs ${trigger.text}` : trigger.text;
		return joinParts([`!${attribution(trigger.author)}`, body, sectionSuffix(trigger.section)]);
	}
	return joinParts([`?${attribution(trigger.author)}`, trigger.text, sectionSuffix(trigger.section)]);
}

/** `=`, `=?` (provisional), or `x=` (retraction). */
export function formatFact(input: Pick<LorelogFact, 'kind' | 'text' | 'tags' | 'author'>): string {
	const op = input.kind === 'retraction' ? 'x=' : input.kind === 'provisional' ? '=?' : '=';
	const who = input.kind === 'retraction' ? '' : attribution(input.author);
	return joinParts([`${op}${who}`, input.text, formatTags(input.tags)]);
}

export function formatFriction(input: { text: string; tags?: Tag[]; author?: string }): string {
	return joinParts([`~${attribution(input.author)}`, input.text, formatTags(input.tags ?? [])]);
}

/** `>> §Section: text tags`, or `>> tags`. */
export function formatRipple(input: { text?: string; tags?: Tag[]; section?: string }): string {
	const section = input.section && input.section.trim().length > 0 ? `§${input.section.trim()}:` : undefined;
	return joinParts(['>>', section, input.text, formatTags(input.tags ?? [])]);
}

export function formatVia(method: string): string {
	return `via: ${method}`;
}

export function formatNote(input: { type: LorelogNote['type']; text: string }): string {
	return `(${input.type}: ${input.text})`;
}

export function formatTest(test: Pick<LorelogTest, 'name' | 'subject' | 'result'>): string {
	const subject = test.subject && test.subject.length > 0 ? ` [${test.subject}]` : '';
	const result = test.result && test.result.length > 0 ? ` -> ${test.result}` : '';
	return `t: ${test.name}${subject}${result}`;
}

export function formatTable(table: Pick<LorelogTable, 'source' | 'expression'>): string {
	return `${table.source}: ${table.expression}`;
}

/**
 * Lines of notation for one cycle, without heading or fence. The order is fixed: triggers,
 * methods, tables and tests, facts (with their reasons), frictions, ripples, follow-up
 * questions, notes, and tag lines. The parser reads this order back to the same model.
 */
export function formatCycleLines(cycle: LorelogCycle): string[] {
	const lines: string[] = [];
	for (const trigger of cycle.triggers) lines.push(formatTrigger(trigger));
	for (const via of cycle.vias) lines.push(formatVia(via));
	for (const table of cycle.tables) {
		lines.push(formatTable(table));
		for (const detail of table.details) lines.push(`  ${detail}`);
	}
	for (const test of cycle.tests) {
		lines.push(formatTest(test));
		for (const detail of test.details) lines.push(`  ${detail}`);
	}
	const reasons = new Set<string>();
	for (const fact of cycle.facts) {
		lines.push(formatFact(fact));
		if (fact.kind === 'retraction' && fact.reason) {
			lines.push(formatNote({ type: 'why', text: fact.reason }));
			reasons.add(fact.reason);
		}
	}
	for (const friction of cycle.frictions) lines.push(formatFriction(friction));
	for (const ripple of cycle.ripples) lines.push(formatRipple(ripple));
	if (cycle.followUps.length > 0 && cycle.ripples.length === 0) {
		// Follow-ups only read as belonging to this cycle after a ripple.
		lines.push(formatRipple({}));
	}
	for (const trigger of cycle.followUps) lines.push(formatTrigger(trigger));
	for (const note of cycle.notes) {
		if (note.type === 'why' && reasons.has(note.text)) continue;
		lines.push(formatNote(note));
	}
	for (const tagLine of cycle.tags) lines.push(formatTags(tagLine.tags));
	return lines;
}

/**
 * A cycle as a markdown block: heading, then the notation in a code fence (digital), or the
 * heading and notation lines without a fence (analog). A cycle without an id has no heading.
 */
export function formatCycle(cycle: LorelogCycle, style: LorelogStyle = 'digital'): string {
	const body = formatCycleLines(cycle);
	const head = cycle.id ? formatCycleHeading({ id: cycle.id, title: cycle.title, section: cycle.section, kept: cycle.kept }, style) : undefined;
	if (style === 'analog') return [head, ...body].filter((l): l is string => l !== undefined).join('\n');
	const parts: string[] = [];
	if (head) parts.push(head, '');
	parts.push('```', ...body, '```');
	return parts.join('\n');
}

/** A new cycle with empty lists. Pass `id` and the other fields the cycle needs. */
export function emptyLorelogCycle(init: Partial<LorelogCycle> = {}): LorelogCycle {
	return {
		line: 0,
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
		...init,
	};
}

/** A build session block: its header, plus an optional focus line. */
export function formatBuild(build: Pick<LorelogBuild, 'number' | 'meta'>, style: LorelogStyle = 'digital'): string {
	return formatBuildHeader({ number: build.number, meta: build.meta }, style).join('\n');
}
