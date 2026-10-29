/*
 * Lorelog tag helpers. The tag grammar is Partylog's (and Lonelog's), so parsing and
 * formatting delegate to the shared partylog tag code. This module adds Lorelog's element
 * names, states and keys on top.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { extractTags, formatTag, formatTagField, parseTag, parseTagField } from '../../campaign/partylog';
import type { Tag, TagField } from '../../campaign/partylog';
import { BACKLOG_STATES, LORELOG_TAG_TYPES, TENSION_STATES } from './types';

export { extractTags, formatTag, formatTagField, parseTag, parseTagField };
export type { Tag, TagField };

/** Lowercase head to canonical Lorelog type. Heads not listed keep their written spelling. */
const CANONICAL_TYPE: Record<string, string> = {
	f: 'F',
	faction: 'F',
	n: 'N',
	l: 'L',
	rule: 'Rule',
	tension: 'Tension',
	hist: 'Hist',
	term: 'Term',
	q: 'Q',
	need: 'Need',
};

/** A tag's element: the canonical type, the name, and a stable key for matching. */
export interface LorelogElement {
	type: string;
	name: string;
	key: string;
	/** True when the type is one of the spec's Lorelog types (section 5.2). */
	standard: boolean;
}

export function canonicalTagType(tag: Tag): string {
	if (tag.kind === 'unknown') {
		const canon = CANONICAL_TYPE[tag.head.toLowerCase()];
		return canon ?? tag.head;
	}
	if (tag.kind === 'Faction') return 'F';
	if (tag.kind === 'PC') return 'N';
	return tag.kind;
}

/** Name of the element a tag refers to. Tags without a name (`[Party:...]`) return ''. */
export function tagName(tag: Tag): string {
	if ('name' in tag && typeof tag.name === 'string') return tag.name.trim();
	return '';
}

export function elementOf(tag: Tag): LorelogElement | undefined {
	const name = tagName(tag);
	if (name.length === 0) return undefined;
	const type = canonicalTagType(tag);
	return {
		type,
		name,
		key: elementKey(type, name),
		standard: (LORELOG_TAG_TYPES as readonly string[]).includes(type),
	};
}

export function elementKey(type: string, name: string): string {
	return `${type}:${name.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/**
 * The state a tag carries (`open`, `seasonal`, `answered`, ...), or undefined. For a change
 * `from→to`, the state is `to` when it is a known state and otherwise `from`, so `answered→C9`
 * reads as `answered` and `open→dropped` reads as `dropped`.
 */
export function tagState(tag: Tag, states: readonly string[]): string | undefined {
	const known = (text: string): boolean => states.includes(text.toLowerCase());
	for (const field of tag.fields) {
		if (field.kind === 'label' && known(field.text)) return field.text.toLowerCase();
		if (field.kind === 'change') {
			if (field.to.kind === 'label' && known(field.to.text)) return field.to.text.toLowerCase();
			if (field.from.kind === 'label' && known(field.from.text)) return field.from.text.toLowerCase();
		}
	}
	return undefined;
}

export function tensionState(tag: Tag): string | undefined {
	return tagState(tag, TENSION_STATES);
}

export function backlogState(tag: Tag): string | undefined {
	return tagState(tag, BACKLOG_STATES);
}

/** Priority from a `p1`, `p2`, `p3` label, if the tag has one. */
export function tagPriority(tag: Tag): number | undefined {
	for (const field of tag.fields) {
		if (field.kind === 'label') {
			const m = /^p([1-9])$/i.exec(field.text);
			if (m) return Number(m[1]);
		}
	}
	return undefined;
}

/** The numeric `year:` value of a `[Hist:...]` tag, for timeline sorting. */
export function tagYear(tag: Tag): number | undefined {
	for (const field of tag.fields) {
		if (field.kind === 'keyed' && field.key.toLowerCase() === 'year' && field.values.length > 0) {
			const n = Number(field.values[0]);
			if (Number.isFinite(n)) return n;
		}
	}
	return undefined;
}

/** Normalizes text for comparisons: whitespace collapsed, case folded, trailing `(confirmed)` removed. */
export function normalizeStatement(text: string): string {
	return text
		.replace(/\(confirmed\)\s*$/i, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.\s]+$/, '')
		.toLowerCase();
}
