/*
 * Lorelog summary tests: open questions and needs, tensions, facts, provisional flags and
 * retractions. Spec example figures come from sections 9.2 and 4.2 (CC BY-SA 4.0, Roberto
 * Bisceglie, Loreseed Workshop).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLorelogLog, summarizeLorelog } from '../../../src/lore/lorelog';

const digital = readFileSync('test/lore/lorelog/fixtures/spec-9-2-digital-log.md', 'utf8');

describe('summary of spec section 9.2', () => {
	const summary = summarizeLorelog(parseLorelogLog(digital));

	it('counts cycles, builds and facts', () => {
		expect(summary.title).toBe('The Cistern Cities');
		expect(summary.counts.builds).toBe(2);
		// C1, its three inline sub-cycles, C2, C3, C4 and C5.
		expect(summary.counts.cycles).toBe(8);
		// C1.1, C1.2, C1.3 are provisional, C2 and C5 are firm.
		expect(summary.counts.facts).toBe(5);
		expect(summary.counts.provisional).toBe(3);
	});

	it('lists open questions: follow-ups and unanswered backlog entries', () => {
		const texts = summary.openQuestions.map((q) => q.text);
		expect(texts).toEqual(expect.arrayContaining([
			'Who protects people from the wardens?',
			'What does an arrest cost a family?',
			'Why don\'t the fishers simply stop coming?',
			'Warden oversight',
			'Arrest cost',
		]));
		expect(texts).not.toContain('Outer district food');
		expect(texts).not.toContain('How does the Guild police unlicensed practitioners?');
	});

	it('orders backlog questions by priority', () => {
		const backlog = summary.openQuestions.filter((q) => q.origin === 'backlog');
		expect(backlog.map((q) => q.text)).toEqual(['Warden oversight', 'Arrest cost']);
		expect(backlog[0].priority).toBe(1);
	});

	it('groups tensions by state', () => {
		expect(summary.tensions.open.map((t) => t.name)).toEqual(['False arrests']);
		expect(summary.tensions.latent).toHaveLength(0);
	});

	it('flags provisional facts and keeps them in the fact list', () => {
		expect(summary.provisional.map((f) => f.text)).toEqual(['The Cistern Guild', 'Water pricing', 'Temple of the Rain']);
		expect(summary.facts.some((f) => f.provisional)).toBe(true);
	});

	it('counts test results', () => {
		expect(summary.counts.testsGap).toBe(1);
		expect(summary.counts.testsPassed).toBe(1);
	});

	it('lists elements touched, with their backlog state', () => {
		const guild = summary.elements.find((e) => e.key === 'F:guild');
		expect(guild?.count).toBeGreaterThanOrEqual(1);
		const food = summary.elements.find((e) => e.key === 'Q:outer district food');
		expect(food?.state).toBe('answered');
	});
});

describe('retractions, confirmations and tension states', () => {
	const log = [
		'---',
		'title: Magic',
		'---',
		'',
		'## Build 1',
		'',
		'### C1 *Magic*',
		'```',
		'= Magic is free to practice',
		'=? The capital sits on a river delta',
		'>> [Rule:Magic|free] [Tension:Dam|latent] [Tension:Riots|open]',
		'```',
		'',
		'### C2 *Licensing*',
		'```',
		'x= Magic is free to practice',
		'(why: Ch7 needs a black market for spells)',
		'= Magic requires a Guild license, renewed yearly',
		'~ Unlicensed casters trade services at night markets',
		'>> [Rule:Magic|free→licensed] [L:Night Market|new]',
		'! Ch5 needs a flood that isolates the lower city',
		'= The capital sits on a river delta (confirmed)',
		'>> [Tension:Dam|latent→open] [Tension:Riots|open→resolved]',
		'```',
	].join('\n');
	const parsed = parseLorelogLog(log);
	const summary = summarizeLorelog(parsed);

	it('removes the retracted fact from the fact list and keeps the replacement', () => {
		const texts = summary.facts.map((f) => f.text);
		expect(texts).not.toContain('Magic is free to practice');
		expect(texts).toContain('Magic requires a Guild license, renewed yearly');
		expect(summary.counts.retracted).toBe(1);
	});

	it('keeps the retraction with its reason', () => {
		expect(summary.retractions).toEqual([
			expect.objectContaining({ text: 'Magic is free to practice', reason: 'Ch7 needs a black market for spells' }),
		]);
	});

	it('drops a provisional fact once a later line confirms it', () => {
		expect(summary.provisional).toHaveLength(0);
		expect(summary.counts.provisional).toBe(0);
	});

	it('reads the latest tension state for each tension', () => {
		expect(summary.tensions.open.map((t) => t.name)).toEqual(['Dam']);
		expect(summary.tensions.resolved.map((t) => t.name)).toEqual(['Riots']);
	});

	it('reads a need trigger with a cycle that has no fact as an open need', () => {
		const onlyNeed = summarizeLorelog(parseLorelogLog('! Ch9 needs a bridge\n'));
		expect(onlyNeed.openNeeds).toEqual([expect.objectContaining({ unit: 'Ch9', text: 'a bridge', origin: 'need' })]);
	});

	it('does not count a retracted fact in the element facts', () => {
		const rule = summary.elements.find((e) => e.key === 'Rule:magic');
		expect(rule?.facts.map((f) => f.text)).toEqual([]);
	});
});
