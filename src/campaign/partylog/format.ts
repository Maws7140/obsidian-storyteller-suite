/*
 * Partylog formatter: canonical digital markdown output for every element.
 *
 * Partylog by Roberto Bisceglie (Loreseed Workshop), a fork of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports. Output parses back to the same model
 * with `parsePartylogLine` / `parsePartylogLog`.
 */
import { parseSceneId } from './parse';
import type {
	ActorMode,
	CampaignHeader,
	Interlude,
	MetaType,
	PartylogEntry,
	SceneId,
	SessionEnd,
	SessionHeader,
	Tag,
	TagField,
} from './types';

export type FormatStyle = 'digital' | 'analog';

function joinParts(parts: Array<string | undefined>): string {
	return parts.filter((part): part is string => part !== undefined && part.length > 0).join(' ');
}

function joinSegments(segments: string[]): string {
	return segments.filter((segment) => segment.length > 0).join('|');
}

function signed(amount: number): string {
	return `${amount < 0 ? '-' : '+'}${Math.abs(amount)}`;
}

function formatChange(field: Extract<TagField, { kind: 'change' }>): string {
	const { from, to } = field;
	if (from.kind === 'keyed' && to.kind === 'keyed' && from.key === to.key && from.values.length === 1 && to.values.length === 1) {
		return `${from.key}:${from.values[0]}→${to.values[0]}`;
	}
	return `${formatTagField(from)}→${formatTagField(to)}`;
}

/** Formats one tag segment (the text between `|` separators). */
export function formatTagField(field: TagField): string {
	switch (field.kind) {
		case 'label':
			return field.text;
		case 'add':
			return `+${field.text}`;
		case 'remove':
			return `-${field.text}`;
		case 'set':
			return `${field.key} ${field.value}`;
		case 'keyed':
			return `${field.key}:${field.values.join(',')}`;
		case 'delta':
			return `${field.key}${signed(field.amount)}${field.suffix ? ` ${field.suffix}` : ''}`;
		case 'change':
			return formatChange(field);
	}
}

function formatProgressValue(value: { current?: number; max?: number; delta?: number } | undefined): string | undefined {
	if (!value) return undefined;
	if (value.delta !== undefined) return signed(value.delta);
	if (value.current !== undefined) {
		return value.max !== undefined ? `${value.current}/${value.max}` : `${value.current}`;
	}
	return undefined;
}

/** Formats a tag in canonical single-line form, e.g. `[PC:Mira|HP-5|wounded]`. */
export function formatTag(tag: Tag): string {
	const ref = tag.reference ? '#' : '';
	const fields = tag.fields.map(formatTagField);
	switch (tag.kind) {
		case 'Party':
		case 'Wealth':
			return `[${ref}${tag.kind}:${joinSegments(fields)}]`;
		case 'N':
		case 'PC':
		case 'F':
		case 'L':
		case 'Faction':
		case 'Thread':
		case 'Goal':
		case 'Quest':
			return `[${ref}${tag.kind}:${joinSegments([tag.name, ...fields])}]`;
		case 'Clock':
		case 'E':
		case 'Track':
		case 'Timer': {
			const value = formatProgressValue(tag.value);
			const head = joinParts([tag.name, value]);
			return `[${ref}${tag.kind}:${joinSegments([head, ...fields])}]`;
		}
		case 'Loot': {
			const prefix = tag.op === 'remove' ? '-' : '';
			const quantity = tag.quantity !== undefined ? ` x${tag.quantity}` : '';
			const assign = tag.op === 'assign' && tag.to !== undefined ? [`to:${tag.to}`] : [];
			return `[${ref}Loot:${joinSegments([`${prefix}${tag.name}${quantity}`, ...fields, ...assign])}]`;
		}
		case 'Advance':
			return `[${ref}Advance:${joinSegments([tag.name, tag.detail ?? '', ...tag.gains.map((gain) => `+${gain}`)])}]`;
		case 'OOC':
			return `[${ref}OOC:${joinSegments([tag.name, tag.note ?? ''])}]`;
		case 'Inv': {
			const delta = tag.delta !== undefined ? signed(tag.delta) : '';
			const quantity = tag.quantity !== undefined ? [String(tag.quantity)] : [];
			return `[${ref}Inv:${joinSegments([`${tag.name}${delta}`, ...quantity, ...fields])}]`;
		}
		case 'unknown': {
			const body = joinSegments([tag.name, ...fields]);
			return body.length > 0 ? `[${ref}${tag.head}:${body}]` : `[${ref}${tag.head}]`;
		}
	}
}

/** Formats a list of tags separated by spaces. */
export function formatTags(tags: Tag[]): string {
	return tags.map(formatTag).join(' ');
}

/**
 * Formats an action. `@(Name)` for solo, `@(A > B)` for assist, `@(A+B)` for group, `@ text`
 * for implicit attribution.
 */
export function formatAction(input: { mode?: ActorMode; actors?: string[]; text?: string; tags?: Tag[] }): string {
	const mode = input.mode ?? 'implicit';
	const actors = input.actors ?? [];
	let prefix = '@';
	if (mode === 'solo' && actors.length > 0) prefix = `@(${actors[0]})`;
	else if (mode === 'assist' && actors.length > 1) prefix = `@(${actors.join(' > ')})`;
	else if (mode === 'group' && actors.length > 1) prefix = `@(${actors.join('+')})`;
	return joinParts([prefix, input.text, formatTags(input.tags ?? [])]);
}

/** Formats an event: `! text`. */
export function formatEvent(input: { text: string; tags?: Tag[] }): string {
	return joinParts([`!${input.text.length > 0 ? ` ${input.text}` : ''}`, formatTags(input.tags ?? [])]);
}

/** Formats a consequence: `=> text`. */
export function formatConsequence(input: { text?: string; tags?: Tag[] }): string {
	return joinParts(['=>', input.text, formatTags(input.tags ?? [])]);
}

function formatOutcome(outcome: string | undefined): string | undefined {
	if (outcome === undefined) return undefined;
	return outcome.length > 0 ? `-> ${outcome}` : '->';
}

/**
 * Formats a roll: `d: expression -> outcome`, or `d(Name): ...` for attributed rolls.
 * Pass the expression text as written, including any `[...]` context and comparison.
 */
export function formatRoll(input: {
	mode?: ActorMode;
	actors?: string[];
	expression: string;
	outcome?: string;
	tags?: Tag[];
}): string {
	const mode = input.mode ?? 'none';
	const actors = input.actors ?? [];
	let head = 'd:';
	if (mode === 'solo' && actors.length > 0) head = `d(${actors[0]}):`;
	else if (mode === 'assist' && actors.length > 1) head = `d(${actors.join(' > ')}):`;
	else if (mode === 'group' && actors.length > 1) head = `d(${actors.join('+')}):`;
	return joinParts([head, input.expression, formatOutcome(input.outcome), formatTags(input.tags ?? [])]);
}

/** Formats `tbl:` or `gen:` single-line lookups. */
export function formatTable(input: { source: 'tbl' | 'gen'; expression: string; outcome?: string; tags?: Tag[] }): string {
	return joinParts([`${input.source}:`, input.expression, formatOutcome(input.outcome), formatTags(input.tags ?? [])]);
}

/** Formats dialogue: `PC(Kael): "..."` or `N(Tomas): "..."`. */
export function formatDialogue(input: { speaker: 'PC' | 'N'; name: string; text: string }): string {
	return joinParts([`${input.speaker}(${input.name}):`, input.text]);
}

/** Formats a meta note: `(note: ...)`, `(rule: ...)`, and so on. */
export function formatMeta(input: { type: MetaType; text: string }): string {
	return `(${input.type}: ${input.text})`;
}

/** Formats a `\---` ... `---\` narrative block. */
export function formatNarrative(text: string): string {
	return `\\---\n${text}\n---\\`;
}

/** Formats `[COMBAT]`, `[/COMBAT]`, `[RESOURCES]` and `[/RESOURCES]`. */
export function formatBlockMarker(input: { marker: 'COMBAT' | 'RESOURCES'; open: boolean }): string {
	return input.open ? `[${input.marker}]` : `[/${input.marker}]`;
}

/** Formats a combat round marker: `R1`. */
export function formatRound(number: number): string {
	return `R${number}`;
}

/** Formats a line made of tags, optionally followed by prose. */
export function formatTagsLine(input: { tags: Tag[]; text?: string }): string {
	return joinParts([formatTags(input.tags), input.text]);
}

/** Formats narrative prose, with its tags moved to the end. */
export function formatProse(input: { text: string; tags?: Tag[] }): string {
	return joinParts([input.text, formatTags(input.tags ?? [])]);
}

/** Formats a scene id. */
export function formatSceneId(id: SceneId | string): string {
	return typeof id === 'string' ? id : id.text;
}

/**
 * Formats a scene header. Digital: `### S18 *context*`. Analog: `S18 *context*`.
 */
export function formatSceneHeader(input: { id: SceneId | string; context?: string }, style: FormatStyle = 'digital'): string {
	const id = formatSceneId(input.id);
	const context = input.context && input.context.length > 0 ? ` *${input.context}*` : '';
	return style === 'digital' ? `### ${id}${context}` : `${id}${context}`;
}

/**
 * Chooses the next scene id given the ids already used. Ids can be strings or parsed ids.
 *
 * - `next`: one past the highest scene number (`S19`).
 * - `flashback`: a letter suffix on the most recent sequential scene (`S20a`, then `S20b`).
 * - `montage`: a decimal part on the most recent sequential scene (`S15.1`, then `S15.2`).
 * - `split`: `T<thread>-S<n>`. Reuses the highest number when a different thread has just
 *   opened it as a split, otherwise uses one past the highest number.
 */
export function nextSceneId(previousIds: ReadonlyArray<string | SceneId>, kind: 'next' | 'flashback' | 'split' | 'montage', thread?: number): string {
	const ids: SceneId[] = [];
	for (const raw of previousIds) {
		const id = typeof raw === 'string' ? parseSceneId(raw) : raw;
		if (id) ids.push(id);
	}
	let maxNumber = 0;
	for (const id of ids) {
		if (id.number > maxNumber) maxNumber = id.number;
	}
	let lastSequential: SceneId | undefined;
	for (let i = ids.length - 1; i >= 0; i--) {
		if (ids[i].kind === 'sequential') {
			lastSequential = ids[i];
			break;
		}
	}
	const base = lastSequential ? lastSequential.number : ids.length > 0 ? ids[ids.length - 1].number : 1;

	if (kind === 'flashback') {
		const used: string[] = [];
		for (const id of ids) {
			if (id.kind === 'flashback' && id.number === base && id.letter) used.push(id.letter);
		}
		for (let c = 0; c < 26; c++) {
			const letter = String.fromCharCode(97 + c);
			if (used.indexOf(letter) < 0) return `S${base}${letter}`;
		}
		return `S${base}z`;
	}
	if (kind === 'montage') {
		let highestPart = 0;
		for (const id of ids) {
			if (id.kind === 'montage' && id.number === base && id.part !== undefined && id.part > highestPart) {
				highestPart = id.part;
			}
		}
		return `S${base}.${highestPart + 1}`;
	}
	if (kind === 'split') {
		const t = thread !== undefined && thread >= 1 ? Math.floor(thread) : 1;
		const splitAtMax = ids.some((id) => id.kind === 'split' && id.number === maxNumber);
		const sequentialAtMax = ids.some((id) => id.kind === 'sequential' && id.number === maxNumber);
		const threadUsedAtMax = ids.some((id) => id.kind === 'split' && id.number === maxNumber && id.thread === t);
		const number = splitAtMax && !sequentialAtMax && !threadUsedAtMax ? maxNumber : maxNumber + 1;
		return `T${t}-S${number}`;
	}
	return `S${maxNumber + 1}`;
}

/** Formats a session header. Digital uses `## Session N` with `*Key: value*` lines. */
export function formatSessionHeader(header: SessionHeader, style: FormatStyle = 'digital'): string {
	const scenes = header.scenes ? `${header.scenes.from}-${header.scenes.to}` : undefined;
	const lines: string[] = [];
	const heading = header.number !== undefined ? `Session ${header.number}` : 'Session';
	if (style === 'analog') {
		lines.push(`=== ${heading} ===`);
		if (header.date) lines.push(`[Date] ${header.date}`);
		if (header.duration) lines.push(`[Duration] ${header.duration}`);
		if (scenes) lines.push(`[Scenes] ${scenes}`);
		if (header.players.length > 0) lines.push(`[Players] ${header.players.join(', ')}`);
		if (header.absent.length > 0) lines.push(`[Absent] ${header.absent.join(', ')}`);
		if (header.scribe) lines.push(`[Scribe] ${header.scribe}`);
		if (header.mood) lines.push(`[Mood] ${header.mood}`);
		if (header.threads.length > 0) lines.push(`[Threads] ${header.threads.join(', ')}`);
		if (header.recap) lines.push(`[Recap] ${header.recap}`);
		if (header.goals) lines.push(`[Goals] ${header.goals}`);
		if (header.notes) lines.push(`[Notes] ${header.notes}`);
		return lines.join('\n');
	}

	lines.push(`## ${heading}`);
	const info: string[] = [];
	if (header.date) info.push(`Date: ${header.date}`);
	if (header.duration) info.push(`Duration: ${header.duration}`);
	if (scenes) info.push(`Scenes: ${scenes}`);
	if (info.length > 0) lines.push(`*${info.join(' | ')}*`);
	if (header.players.length > 0) lines.push(`*Players: ${header.players.join(', ')}*`);
	if (header.absent.length > 0) lines.push(`*Absent: ${header.absent.join(', ')}*`);
	if (header.scribe) lines.push(`*Scribe: ${header.scribe}*`);
	if (header.mood) lines.push(`*Mood: ${header.mood}*`);
	if (header.threads.length > 0) lines.push(`*Threads: ${header.threads.join(', ')}*`);
	const prose: string[] = [];
	if (header.recap) prose.push(`**Recap:** ${header.recap}`);
	if (header.goals) prose.push(`**Goals:** ${header.goals}`);
	if (header.notes) prose.push(`**Notes:** ${header.notes}`);
	if (prose.length > 0) {
		lines.push('');
		lines.push(...prose);
	}
	return lines.join('\n');
}

function formatBody(entries: PartylogEntry[]): string {
	return entries.map(formatEntry).join('\n');
}

/** Formats a session end block. Digital: `### End of Session N` plus a fenced block. */
export function formatSessionEnd(end: SessionEnd, style: FormatStyle = 'digital'): string {
	const suffix = end.number !== undefined ? ` ${end.number}` : '';
	if (style === 'analog') {
		return [`--- End of Session${suffix} ---`, formatBody(end.entries)].join('\n');
	}
	return [`### End of Session${suffix}`, '', '```', formatBody(end.entries), '```'].join('\n');
}

/** Formats an interlude block. Digital: `## Interlude: title` plus a fenced block. */
export function formatInterlude(interlude: Interlude, style: FormatStyle = 'digital'): string {
	if (style === 'analog') {
		return [`=== Interlude: ${interlude.title} ===`, formatBody(interlude.entries)].join('\n');
	}
	return [`## Interlude: ${interlude.title}`, '', '```', formatBody(interlude.entries), '```'].join('\n');
}

/** Formats the campaign header as YAML front matter (digital) or `[Key] value` lines (analog). */
export function formatCampaignHeader(campaign: CampaignHeader, style: FormatStyle = 'digital'): string {
	if (style === 'analog') {
		const lines = [`=== Campaign Log${campaign.title ? `: ${campaign.title}` : ''} ===`];
		if (campaign.title) lines.push(`[Title] ${campaign.title}`);
		for (const key of Object.keys(campaign.fields)) lines.push(`[${key}] ${campaign.fields[key]}`);
		if (campaign.pcs.length > 0) lines.push(`[PCs] ${campaign.pcs.join(', ')}`);
		return lines.join('\n');
	}
	const lines = ['---'];
	if (campaign.title) lines.push(`title: ${campaign.title}`);
	for (const key of Object.keys(campaign.fields)) lines.push(`${key}: ${campaign.fields[key]}`);
	if (campaign.pcs.length > 0) {
		lines.push('pcs:');
		for (const pc of campaign.pcs) lines.push(`  - ${pc}`);
	}
	lines.push('---');
	return lines.join('\n');
}

/** Formats one line-level entry. Narrative blocks span several lines. */
export function formatEntry(entry: PartylogEntry): string {
	switch (entry.kind) {
		case 'blank':
			return '';
		case 'action':
			return formatAction(entry);
		case 'event':
			return formatEvent(entry);
		case 'roll':
			return formatRoll(entry);
		case 'consequence':
			return formatConsequence(entry);
		case 'table':
			return formatTable(entry);
		case 'dialogue':
			return formatDialogue(entry);
		case 'meta':
			return formatMeta(entry);
		case 'narrative':
			return formatNarrative(entry.text);
		case 'narrative-marker':
			return entry.open ? '\\---' : '---\\';
		case 'block':
			return formatBlockMarker(entry);
		case 'round':
			return formatRound(entry.number);
		case 'tags':
			return formatTagsLine(entry);
		case 'prose':
			return formatProse(entry);
		case 'scene':
			return formatSceneHeader(entry, 'digital');
		case 'session-heading':
			return entry.number !== undefined ? `## Session ${entry.number}` : '## Session';
		case 'session-end-heading':
			return entry.number !== undefined ? `### End of Session ${entry.number}` : '### End of Session';
		case 'interlude-heading':
			return `## Interlude: ${entry.title}`;
	}
}

/** Formats entries inside a fenced code block, one entry per line. */
export function formatFence(entries: PartylogEntry[]): string {
	return ['```', formatBody(entries), '```'].join('\n');
}

