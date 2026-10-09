/*
 * Entity sync planner tests (pure). The planner turns ripples into bullets for matching
 * entity notes, skips bullets already present, and never deletes description text.
 */
import { describe, expect, it } from 'vitest';
import { parseLorelogLog, planEntitySync, LORELOG_CHANGES_HEADING } from '../../../src/lore/lorelog';

const log = parseLorelogLog([
	'## Build 2',
	'### C7 *Guild enforcement*',
	'```',
	'? How does the Guild police unlicensed practitioners?',
	'= District wardens, paid per arrest',
	'>> [F:Cistern Guild|+wardens] [N:Warden Ossa|corrupt] [L:North Gate|checkpoint]',
	'>> [Tension:False arrests|open] [Hist:Fall of the Roads|year:-212] [Hist:Undated Feud]',
	'```',
	'### C8 *Gate*',
	'```',
	'= The gate is closed at night',
	'>> [L:North Gate|night]',
	'```',
].join('\n'));

describe('planEntitySync', () => {
	it('plans bullets for matching entities and selects them by default', () => {
		const plan = planEntitySync(log, [
			{ kind: 'group', name: 'cistern guild', description: 'The water monopoly.' },
			{ kind: 'character', name: 'Warden Ossa', description: '' },
		]);
		const guild = plan.updates.find((u) => u.kind === 'group');
		expect(guild?.name).toBe('cistern guild');
		expect(guild?.changes.map((c) => c.bullet)).toEqual(['- C7: [F:Cistern Guild|+wardens]']);
		expect(guild?.nextDescription).toBe(`The water monopoly.\n\n${LORELOG_CHANGES_HEADING}\n- C7: [F:Cistern Guild|+wardens]\n`);
		const ossa = plan.updates.find((u) => u.kind === 'character');
		expect(ossa?.changes.map((c) => c.bullet)).toEqual(['- C7: [N:Warden Ossa|corrupt]']);
	});

	it('never plans tags for elements with no entity type', () => {
		const plan = planEntitySync(log, []);
		const all = [...plan.updates, ...plan.creates].flatMap((i) => i.changes.map((c) => c.tag));
		expect(all.some((tag) => tag.startsWith('[Tension:'))).toBe(false);
	});

	it('offers unmatched elements as creates, unselected by plan', () => {
		const plan = planEntitySync(log, []);
		expect(plan.updates).toHaveLength(0);
		const names = plan.creates.map((c) => `${c.kind}:${c.name}`);
		expect(names).toEqual(expect.arrayContaining(['group:Cistern Guild', 'character:Warden Ossa', 'location:North Gate', 'event:Fall of the Roads']));
		expect(names).not.toContain('event:Undated Feud');
	});

	it('groups repeated ripples on one entity and writes each bullet once', () => {
		const plan = planEntitySync(log, []);
		const gate = plan.creates.find((c) => c.name === 'North Gate');
		expect(gate?.changes.map((c) => c.bullet)).toEqual(['- C7: [L:North Gate|checkpoint]', '- C8: [L:North Gate|night]']);
	});

	it('skips a bullet the entity already records', () => {
		const plan = planEntitySync(log, [
			{ kind: 'group', name: 'Cistern Guild', description: `${LORELOG_CHANGES_HEADING}\n- C7: [F:Cistern Guild|+wardens]\n` },
		]);
		expect(plan.alreadyRecorded).toBe(1);
		expect(plan.updates.find((u) => u.kind === 'group')).toBeUndefined();
	});

	it('keeps all existing description text when it appends', () => {
		const existing = 'Line one.\n\nLine two with detail.';
		const plan = planEntitySync(log, [{ kind: 'group', name: 'Cistern Guild', description: existing }]);
		const next = plan.updates[0].nextDescription;
		expect(next.startsWith(existing)).toBe(true);
	});
});
