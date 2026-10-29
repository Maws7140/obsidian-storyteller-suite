/*
 * Lorelog summary: open questions and needs, tensions by state, facts by element, and the
 * elements touched by tags. Retracted facts are left out of the fact lists; provisional facts
 * are flagged, not removed.
 *
 * Lorelog by Roberto Bisceglie (Loreseed Workshop), a sibling of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { backlogState, elementOf, normalizeStatement, tagPriority, tensionState } from './tags';
import type { Tag } from './tags';
import type { LorelogCycle, LorelogLog } from './types';

export const TENSION_GROUPS = ['latent', 'open', 'seasonal', 'cyclic', 'resolved', 'unstated'] as const;
export type TensionGroup = (typeof TENSION_GROUPS)[number];

export interface LorelogOpenItem {
	text: string;
	/** Question or need text. For needs, the story unit is in `unit`. */
	origin: 'question' | 'need' | 'backlog';
	unit?: string;
	cycleId?: string;
	line: number;
	priority?: number;
}

export interface LorelogTensionItem {
	name: string;
	state: TensionGroup;
	cycleId?: string;
	line: number;
}

export interface LorelogFactItem {
	text: string;
	provisional: boolean;
	cycleId?: string;
	line: number;
	/** Element keys (`F:cistern guild`) of the tags on this fact. */
	elementKeys: string[];
}

export interface LorelogRetractionItem {
	text: string;
	reason?: string;
	cycleId?: string;
	line: number;
}

export interface LorelogElementUse {
	type: string;
	name: string;
	key: string;
	/** True for the spec's Lorelog types (section 5.2). */
	standard: boolean;
	/** Number of tag occurrences in the log, retracted facts included. */
	count: number;
	firstLine: number;
	lastLine: number;
	/** Latest state of a stateful tag (tension, question, need), if any. */
	state?: string;
	/** Active facts (not retracted) that carry this element. */
	facts: LorelogFactItem[];
}

export interface LorelogSummary {
	title?: string;
	counts: {
		cycles: number;
		builds: number;
		facts: number;
		provisional: number;
		retracted: number;
		frictions: number;
		ripples: number;
		questions: number;
		needs: number;
		testsPassed: number;
		testsGap: number;
		testsFailed: number;
	};
	openQuestions: LorelogOpenItem[];
	openNeeds: LorelogOpenItem[];
	tensions: Record<TensionGroup, LorelogTensionItem[]>;
	/** Active facts in document order. Provisional facts are included and flagged. */
	facts: LorelogFactItem[];
	provisional: LorelogFactItem[];
	retractions: LorelogRetractionItem[];
	parked: Array<{ text: string; cycleId?: string; line: number }>;
	elements: LorelogElementUse[];
}

interface Occurrence {
	tag: Tag;
	line: number;
}

function tagsOfCycle(cycle: LorelogCycle): Occurrence[] {
	const out: Occurrence[] = [];
	for (const fact of cycle.facts) for (const tag of fact.tags) out.push({ tag, line: fact.line });
	for (const friction of cycle.frictions) for (const tag of friction.tags) out.push({ tag, line: friction.line });
	for (const ripple of cycle.ripples) for (const tag of ripple.tags) out.push({ tag, line: ripple.line });
	for (const tagLine of cycle.tags) for (const tag of tagLine.tags) out.push({ tag, line: tagLine.line });
	return out;
}

/** Summarizes a parsed Lorelog log. Pure and deterministic: the same log gives the same summary. */
export function summarizeLorelog(log: LorelogLog): LorelogSummary {
	const cycles = log.cycles;
	const allFacts = cycles.flatMap((c) => c.facts.map((fact) => ({ fact, cycle: c })));
	const activeFacts = allFacts.filter(({ fact }) => fact.kind !== 'retraction' && !fact.retracted);

	const elementUse = new Map<string, LorelogElementUse>();
	const latestTensionState = new Map<string, LorelogTensionItem>();
	const latestBacklog = new Map<string, { item: LorelogOpenItem; state: string }>();

	// Tags: elements, states and backlog entries, in document order.
	const occurrences = cycles.flatMap((cycle) => tagsOfCycle(cycle).map((o) => ({ ...o, cycleId: cycle.id })));
	for (const { tag, line, cycleId } of occurrences) {
		const element = elementOf(tag);
		if (!element) continue;
		let use = elementUse.get(element.key);
		if (!use) {
			use = {
				type: element.type,
				name: element.name,
				key: element.key,
				standard: element.standard,
				count: 0,
				firstLine: line,
				lastLine: line,
				facts: [],
			};
			elementUse.set(element.key, use);
		}
		use.count++;
		use.lastLine = line;
		use.name = element.name;
		if (element.type === 'Tension') {
			const state = tensionState(tag) ?? 'unstated';
			use.state = state;
			latestTensionState.set(element.key, { name: element.name, state: state as TensionGroup, cycleId, line });
		} else if (element.type === 'Q' || element.type === 'Need') {
			const state = backlogState(tag) ?? 'open';
			use.state = state;
			const origin = element.type === 'Q' ? 'backlog' : 'need';
			latestBacklog.set(element.key, {
				state,
				item: { text: element.name, origin: origin === 'need' ? 'need' : 'backlog', cycleId, line, priority: tagPriority(tag) },
			});
		}
	}

	// Active facts and their elements.
	const factItems: LorelogFactItem[] = [];
	for (const { fact, cycle } of activeFacts) {
		const elementKeys: string[] = [];
		for (const tag of fact.tags) {
			const element = elementOf(tag);
			if (element) elementKeys.push(element.key);
		}
		const item: LorelogFactItem = {
			text: fact.text,
			provisional: fact.kind === 'provisional',
			cycleId: cycle.id,
			line: fact.line,
			elementKeys,
		};
		factItems.push(item);
		for (const key of elementKeys) elementUse.get(key)?.facts.push(item);
	}
	const provisional = factItems.filter((item) => item.provisional && !isConfirmed(allFacts, item.line));

	// Open questions and needs. A trigger is answered when its cycle has a fact. A follow-up
	// question (written after a ripple) is open until a later trigger repeats its text.
	const openQuestions: LorelogOpenItem[] = [];
	const openNeeds: LorelogOpenItem[] = [];
	let questionCount = 0;
	let needCount = 0;
	const triggerRows = cycles
		.flatMap((cycle) => [
			...cycle.triggers.map((trigger) => ({ trigger, cycle, followUp: false, answered: cycle.facts.length > 0 })),
			...cycle.followUps.map((trigger) => ({ trigger, cycle, followUp: true, answered: false })),
		])
		.sort((a, b) => a.trigger.line - b.trigger.line);
	for (const row of triggerRows) {
		if (row.trigger.kind === 'question') questionCount++;
		else needCount++;
		let answered = row.answered;
		if (row.followUp) {
			const key = normalizeStatement(row.trigger.text);
			answered = triggerRows.some((other) => other.trigger.line > row.trigger.line && normalizeStatement(other.trigger.text) === key);
		}
		if (answered) continue;
		const item: LorelogOpenItem = {
			text: row.trigger.text,
			origin: row.trigger.kind === 'need' ? 'need' : 'question',
			unit: row.trigger.unit,
			cycleId: row.cycle.id,
			line: row.trigger.line,
		};
		if (row.trigger.kind === 'need') openNeeds.push(item);
		else openQuestions.push(item);
	}
	for (const { state, item } of latestBacklog.values()) {
		if (state !== 'open') continue;
		if (item.origin === 'need') openNeeds.push(item);
		else openQuestions.push(item);
	}
	const byPriority = (a: LorelogOpenItem, b: LorelogOpenItem) => (a.priority ?? 9) - (b.priority ?? 9) || a.line - b.line;
	openQuestions.sort(byPriority);
	openNeeds.sort(byPriority);

	const tensions = Object.fromEntries(TENSION_GROUPS.map((group) => [group, [] as LorelogTensionItem[]])) as Record<TensionGroup, LorelogTensionItem[]>;
	for (const item of latestTensionState.values()) tensions[item.state].push(item);

	const retractions: LorelogRetractionItem[] = allFacts
		.filter(({ fact }) => fact.kind === 'retraction')
		.map(({ fact, cycle }) => ({ text: fact.text, reason: fact.reason, cycleId: cycle.id, line: fact.line }));

	const parked = cycles.flatMap((cycle) =>
		cycle.notes.filter((note) => note.type === 'parked').map((note) => ({ text: note.text, cycleId: cycle.id, line: note.line })),
	);

	const elements = [...elementUse.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	const tests = cycles.flatMap((c) => c.tests);

	return {
		title: log.header.title,
		counts: {
			cycles: cycles.length,
			builds: log.builds.length,
			facts: activeFacts.length,
			provisional: provisional.length,
			retracted: allFacts.filter(({ fact }) => fact.retracted).length,
			frictions: cycles.reduce((n, c) => n + c.frictions.length, 0),
			ripples: cycles.reduce((n, c) => n + c.ripples.length, 0),
			questions: questionCount,
			needs: needCount,
			testsPassed: tests.filter((t) => t.status === 'pass').length,
			testsGap: tests.filter((t) => t.status === 'gap').length,
			testsFailed: tests.filter((t) => t.status === 'fail').length,
		},
		openQuestions,
		openNeeds,
		tensions,
		facts: factItems,
		provisional,
		retractions,
		parked,
		elements,
	};
}

/** True when a later `=` line confirmed the provisional fact on `line`. */
function isConfirmed(allFacts: Array<{ fact: { line: number; confirmedBy?: number } }>, line: number): boolean {
	return allFacts.some(({ fact }) => fact.line === line && fact.confirmedBy !== undefined);
}
