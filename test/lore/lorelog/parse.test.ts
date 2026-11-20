/*
 * Lorelog parser tests against the spec's own examples. Fixtures in ./fixtures are copied from
 * lorelog.md (sections 3 to 9) by Roberto Bisceglie, Loreseed Workshop, CC BY-SA 4.0:
 * https://creativecommons.org/licenses/by-sa/4.0/
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLorelogLine, parseLorelogLog } from '../../../src/lore/lorelog';
import type { LorelogCycle } from '../../../src/lore/lorelog';

const digital = readFileSync('test/lore/lorelog/fixtures/spec-9-2-digital-log.md', 'utf8');
const analog = readFileSync('test/lore/lorelog/fixtures/spec-9-3-analog-build.md', 'utf8');
const minimal = readFileSync('test/lore/lorelog/fixtures/spec-9-1-minimal.md', 'utf8');
const sections = readFileSync('test/lore/lorelog/fixtures/spec-sections-3-to-8.md', 'utf8');

function cycleById(cycles: LorelogCycle[], id: string): LorelogCycle {
	const found = cycles.find((c) => c.id === id);
	if (!found) throw new Error(`no cycle ${id}`);
	return found;
}

describe('classifying single lines', () => {
	it('reads the five core symbols', () => {
		expect(parseLorelogLine('? How does the Guild police?')).toMatchObject({ kind: 'trigger', trigger: { kind: 'question', text: 'How does the Guild police?' } });
		expect(parseLorelogLine('= District wardens, paid per arrest')).toMatchObject({ kind: 'fact', fact: { kind: 'fact', text: 'District wardens, paid per arrest' } });
		expect(parseLorelogLine('~ Wardens profit from arrests.')).toMatchObject({ kind: 'friction', friction: { text: 'Wardens profit from arrests.' } });
		expect(parseLorelogLine('>> [F:Guild|+wardens]')).toMatchObject({ kind: 'ripple', ripple: { text: '' } });
	});

	it('reads story needs with their unit', () => {
		expect(parseLorelogLine('! Ch3 needs a reason for the hero to be stopped at the city gate')).toMatchObject({
			kind: 'trigger',
			trigger: { kind: 'need', unit: 'Ch3', text: 'a reason for the hero to be stopped at the city gate' },
		});
	});

	it('reads provisional and retracted facts', () => {
		expect(parseLorelogLine('=? Magic is rare')).toMatchObject({ kind: 'fact', fact: { kind: 'provisional', text: 'Magic is rare' } });
		expect(parseLorelogLine('x= Magic is free to practice')).toMatchObject({ kind: 'fact', fact: { kind: 'retraction', text: 'Magic is free to practice' } });
	});

	it('does not read the Lonelog consequence arrow as a fact', () => {
		expect(parseLorelogLine('=> Only a bribed warden')).toMatchObject({ kind: 'prose' });
	});

	it('reads attribution and section references', () => {
		expect(parseLorelogLine('?(Anna) Is there a religion that opposes the Guild?')).toMatchObject({ kind: 'trigger', trigger: { author: 'Anna' } });
		expect(parseLorelogLine('=(Roberto) The Temple of the Rain teaches that water is a gift')).toMatchObject({ kind: 'fact', fact: { author: 'Roberto' } });
		expect(parseLorelogLine('? Who guards the gates? (§Politics)')).toMatchObject({ kind: 'trigger', trigger: { section: 'Politics', text: 'Who guards the gates?' } });
		expect(parseLorelogLine('>> §2.3: add the warden ranks')).toMatchObject({ kind: 'ripple', ripple: { section: '2.3', text: 'add the warden ranks' } });
	});

	it('reads cycle headings with titles, sections and branch markers', () => {
		expect(parseLorelogLine('### C7 *Guild enforcement* (§Politics)')).toMatchObject({ kind: 'cycle-heading', id: 'C7', title: 'Guild enforcement', section: 'Politics' });
		expect(parseLorelogLine('C7b *Guild enforcement, option B* (kept)')).toMatchObject({ kind: 'cycle-heading', id: 'C7b', kept: true });
		expect(parseLorelogLine('M2-C1 *Marsh survey*')).toMatchObject({ kind: 'cycle-heading', id: 'M2-C1', title: 'Marsh survey' });
	});

	it('reads build, phase and world headings', () => {
		expect(parseLorelogLine('## Build 3')).toMatchObject({ kind: 'build-heading', number: 3 });
		expect(parseLorelogLine('=== Build 3 ===')).toMatchObject({ kind: 'build-heading', number: 3 });
		expect(parseLorelogLine('=== Phase 2: Structure ===')).toMatchObject({ kind: 'phase', number: 2, name: 'Structure' });
		expect(parseLorelogLine('=== World Log: The Cistern Cities ===')).toMatchObject({ kind: 'world-heading', title: 'The Cistern Cities' });
	});

	it('reads inline shorthand cycles with one part per symbol', () => {
		const line = parseLorelogLine('C1 ?water = Guild wells ~ dry-season riots >> [F:Guild] ?enforcers');
		expect(line.kind).toBe('inline-cycle');
		if (line.kind !== 'inline-cycle') return;
		expect(line.id).toBe('C1');
		expect(line.parts.map((p) => p.kind)).toEqual(['trigger', 'fact', 'friction', 'ripple', 'trigger']);
	});

	it('keeps a question mark inside prose as prose', () => {
		const line = parseLorelogLine('C2 *Enforcement* Who rules? (not a symbol)');
		expect(line.kind).not.toBe('inline-cycle');
	});

	it('never throws on odd input', () => {
		expect(() => parseLorelogLine('[F:Unclosed')).not.toThrow();
		expect(() => parseLorelogLine('')).not.toThrow();
		expect(parseLorelogLine('   ')).toEqual({ kind: 'blank' });
	});
});

describe('spec section 9.2: digital log', () => {
	const log = parseLorelogLog(digital);

	it('reads the world header from front matter', () => {
		expect(log.header.title).toBe('The Cistern Cities');
		expect(log.header.fields.method).toBe('bottom-up, curiosity-first');
		expect(log.header.fields.start_date).toBe('2026-09-25');
		expect(log.header.fields.genre).toBe('Low fantasy, urban');
	});

	it('reads build sessions with their meta', () => {
		expect(log.builds.map((b) => b.number)).toEqual([1, 2]);
		expect(log.builds[0].meta).toMatchObject({ date: '2026-09-25', duration: '45m', phase: 'Sketch', cycles: 'C1-C3' });
		expect(log.builds[1].meta).toMatchObject({ date: '2026-09-27', duration: '1h', phase: 'Structure', cycles: 'C4-C5' });
	});

	it('reads the phase marker', () => {
		expect(log.phases).toEqual([expect.objectContaining({ number: 2, name: 'Structure' })]);
	});

	it('reads headed cycles, sub-cycles, and the section of C2', () => {
		const c2 = cycleById(log.cycles, 'C2');
		expect(c2.section).toBe('Politics');
		expect(c2.build).toBe(1);
		expect(c2.triggers).toHaveLength(1);
		expect(c2.vias).toEqual(['decide']);
		expect(c2.facts.map((f) => f.text)).toEqual(['District wardens, paid per arrest']);
		expect(c2.frictions).toHaveLength(2);
		expect(c2.ripples).toHaveLength(1);
		expect(c2.ripples[0].tags.map((t) => t.kind === 'unknown' ? t.head : t.kind)).toEqual(['F', 'Tension']);
	});

	it('reads follow-up questions after the ripple as part of the same cycle', () => {
		const c2 = cycleById(log.cycles, 'C2');
		expect(c2.followUps.map((t) => t.text)).toEqual(['Who protects people from the wardens?', 'What does an arrest cost a family?']);
	});

	it('reads the inline sub-cycles of C1 with provisional facts', () => {
		const c11 = cycleById(log.cycles, 'C1.1');
		expect(c11.triggers[0].text).toBe('Who rules?');
		expect(c11.facts[0]).toMatchObject({ kind: 'provisional', text: 'The Cistern Guild' });
	});

	it('reads a multi-line test with its details and result', () => {
		const c4 = cycleById(log.cycles, 'C4');
		expect(c4.tests).toHaveLength(1);
		expect(c4.tests[0]).toMatchObject({ name: 'Day in the life', subject: 'dockworker, outer district', result: 'Gap', status: 'gap' });
		expect(c4.tests[0].details).toHaveLength(5);
	});

	it('reads the backlog tag line in the cycle', () => {
		const c5 = cycleById(log.cycles, 'C5');
		expect(c5.tags[0].line).toBeGreaterThan(0);
		expect(c5.tags[0].tags.length).toBe(1);
	});

	it('reads the table and the answered backlog pointer', () => {
		const c5 = cycleById(log.cycles, 'C5');
		expect(c5.vias).toEqual(['tbl Food Source d4=3']);
		expect(c5.followUps.map((t) => t.text)).toEqual(["Why don't the fishers simply stop coming?"]);
	});

	it('gives every cycle a line number in the source', () => {
		const lines = digital.split('\n');
		for (const cycle of log.cycles.filter((c) => c.id)) {
			expect(lines[cycle.line - 1]).toMatch(/C\d/);
		}
	});
});

describe('spec section 9.3: analog build', () => {
	const log = parseLorelogLog(analog);

	it('reads the analog build header and its fields', () => {
		// The spec's analog example is the Build 2 block of section 9.2, written on paper.
		expect(log.builds).toHaveLength(1);
		expect(log.builds[0]).toMatchObject({ number: 2 });
		expect(log.builds[0].meta).toMatchObject({ date: '2026-09-27', phase: 'Structure' });
		expect(log.cycles.map((c) => c.id)).toEqual(['C4', 'C5']);
	});
});

describe('spec section 9.1: minimal shorthand', () => {
	const log = parseLorelogLog(minimal);

	it('reads one cycle per inline line with its id', () => {
		expect(log.cycles.map((c) => c.id)).toEqual(['C1', 'C2', 'C3']);
		const c1 = cycleById(log.cycles, 'C1');
		expect(c1.triggers.map((t) => t.text)).toEqual(['water']);
		expect(c1.facts.map((f) => f.text)).toEqual(['Guild wells']);
		expect(c1.followUps.map((t) => t.text)).toEqual(['enforcers']);
	});
});

describe('spec sections 3 to 8: examples', () => {
	const log = parseLorelogLog(sections);

	it('reads the curiosity and story cycles of section 3.5', () => {
		const withTension = log.cycles.find((c) => c.ripples.some((r) => r.tags.length === 2));
		expect(withTension).toBeDefined();
		const story = log.cycles.find((c) => c.triggers.some((t) => t.kind === 'need' && t.unit === 'Ch3'));
		expect(story?.facts[0].text).toBe('Every traveler must show a Guild license or a warden\'s pass');
	});

	it('reads the second attempt note and its fact', () => {
		const attempt = log.cycles.find((c) => c.notes.some((n) => n.type === 'note'));
		expect(attempt?.notes[0].text).toBe('I want the temples involved. Try again.');
	});

	it('reads the provisional facts of section 4.1', () => {
		const provisional = log.cycles.flatMap((c) => c.facts).filter((f) => f.kind === 'provisional');
		expect(provisional.map((f) => f.text)).toContain('The capital sits on a river delta');
	});

	it('reads the retraction of section 4.2 with its reason', () => {
		const retraction = log.cycles.flatMap((c) => c.facts).find((f) => f.kind === 'retraction');
		expect(retraction).toMatchObject({ text: 'Magic is free to practice', reason: 'Ch7 needs a black market for spells' });
	});

	it('reads method lines and random tables of section 4.3', () => {
		const landmark = log.cycles.find((c) => c.vias.includes('tbl Landmark d8=6'));
		expect(landmark?.facts[0].text).toBe('A ruined toll tower, half-swallowed by ivy');
		const tables = log.cycles.flatMap((c) => c.tables);
		expect(tables.map((t) => `${t.source}:${t.expression}`)).toEqual(['tbl:Landmark (d8)', 'gen:Faction']);
		expect(tables[0].details).toHaveLength(5);
	});

	it('reads the tests of section 4.4 and 7.4', () => {
		const tests = log.cycles.flatMap((c) => c.tests);
		expect(tests.find((t) => t.name === 'Day in the life' && t.subject === 'guild practitioner, capital')?.status).toBe('pass');
		expect(tests.some((t) => t.status === 'gap')).toBe(true);
		const multi = tests.find((t) => t.subject === 'dockworker, outer district' && t.details.length > 0);
		expect(multi?.result).toBe('Gap');
	});

	it('reads the section reference lines of section 5.4', () => {
		const sectionRipple = log.cycles.flatMap((c) => c.ripples).find((r) => r.section === 'Society');
		expect(sectionRipple?.text).toBe('common people fear the wardens more than bandits');
	});

	it('reads the multi-line tag of section 5.1', () => {
		const multi = log.cycles.flatMap((c) => c.tags).find((t) => t.tags.some((tag) => tag.kind === 'F'));
		expect(multi?.tags[0]).toMatchObject({ kind: 'F', name: 'Cistern Guild' });
		expect((multi?.tags[0] as { fields: unknown[] }).fields).toHaveLength(3);
	});

	it('reads headed cycles, sub-cycles and branches of section 6.3', () => {
		const ids = log.cycles.map((c) => c.id).filter(Boolean);
		expect(ids).toEqual(expect.arrayContaining(['C7', 'C1', 'C1.1', 'C1.2', 'C1.3', 'C7a', 'C7b', 'C21']));
		expect(cycleById(log.cycles, 'C7b').kept).toBe(true);
		expect(cycleById(log.cycles, 'C21').section).toBe('Politics, §Magic');
	});

	it('reads the phase marker of section 6.5 with the note before it', () => {
		expect(log.phases.map((p) => p.name)).toContain('Structure');
	});

	it('reads the backlog snapshot, pruning and its reason', () => {
		const snapshot = log.cycles.flatMap((c) => c.tags).filter((t) => t.tags.some((tag) => tag.kind === 'unknown' && tag.head === 'Q'));
		expect(snapshot.length).toBeGreaterThanOrEqual(5);
		const pruned = log.cycles.flatMap((c) => c.notes).find((n) => n.text === 'open for 3 months, nothing depends on it');
		expect(pruned?.type).toBe('why');
		const pruning = log.cycles.flatMap((c) => c.tags).flatMap((t) => t.tags).find((tag) => tag.kind === 'unknown' && tag.head === 'Q' && tag.fields.length > 0);
		expect(pruning).toBeDefined();
	});

	it('reads collaborative attribution of section 8.2', () => {
		const authors = log.cycles.flatMap((c) => [...c.triggers, ...c.followUps].map((t) => t.author)).filter(Boolean);
		expect(authors).toEqual(expect.arrayContaining(['Anna']));
		const roberto = log.cycles.flatMap((c) => c.facts).find((f) => f.author === 'Roberto');
		expect(roberto).toBeDefined();
	});
});
