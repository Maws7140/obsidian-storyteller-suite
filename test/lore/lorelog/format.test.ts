/*
 * Lorelog formatter round trips: format, parse, and compare with the model. Examples come
 * from the spec (CC BY-SA 4.0, Roberto Bisceglie, Loreseed Workshop):
 * https://creativecommons.org/licenses/by-sa/4.0/
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	emptyLorelogCycle,
	formatBuildHeader,
	formatCycle,
	formatFact,
	formatRipple,
	formatTrigger,
	formatWorldHeader,
	formatPhase,
	parseLorelogLog,
	parseLorelogLine,
	formatTag,
	parseTag,
} from '../../../src/lore/lorelog';
import type { LorelogCycle } from '../../../src/lore/lorelog';

const digital = readFileSync('test/lore/lorelog/fixtures/spec-9-2-digital-log.md', 'utf8');

/** Model without line numbers, for comparing a cycle before and after a round trip. */
function shape(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(shape);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, inner] of Object.entries(value)) {
			if (key === 'line' || key === 'build' || key === 'phase') continue;
			if (inner === undefined) continue;
			out[key] = shape(inner);
		}
		return out;
	}
	return value;
}

function roundTrip(cycle: LorelogCycle, style: 'digital' | 'analog' = 'digital'): LorelogCycle {
	const log = parseLorelogLog(formatCycle(cycle, style));
	expect(log.cycles).toHaveLength(1);
	return log.cycles[0];
}

describe('round trip of spec cycles', () => {
	const log = parseLorelogLog(digital);
	for (const cycle of log.cycles) {
		it(`keeps cycle ${cycle.id ?? `at line ${cycle.line}`} through format and parse`, () => {
			// Implicit cycles have no heading, so the fence alone reads back as one cycle.
			const back = roundTrip(cycle);
			expect(shape(back)).toEqual(shape(cycle));
		});
	}
});

describe('round trip of a full hand-built cycle', () => {
	const cycle = emptyLorelogCycle({
		id: 'C9',
		title: 'Harbor walls',
		section: 'Geography',
		kept: true,
		triggers: [
			{ kind: 'need', text: 'a reason the harbor is walled', unit: 'Ch4', line: 0 },
			{ kind: 'question', text: 'Who pays for the walls?', section: 'Economy', author: 'Anna', line: 0 },
		],
		vias: ['decide', 'tbl Landmark d8=6'],
		tables: [{ source: 'tbl', expression: 'Landmark (d8)', details: ['1-2: Shrine', '3-4: Well'], line: 0 }],
		tests: [{ name: 'Pitch', subject: '60 seconds', result: 'Gap: too many factions', status: 'gap', details: ['Wakes: = tenement'], line: 0 }],
		facts: [
			{ kind: 'provisional', text: 'The harbor is walled', tags: [], retracted: false, line: 0 },
			{ kind: 'fact', text: 'Guild wardens man the gate', tags: [parseTag('[F:Guild|+wardens]')!], author: 'Roberto', retracted: false, line: 0 },
			{ kind: 'retraction', text: 'The harbor is open', tags: [], reason: 'Ch4 needs a blockade', retracted: false, line: 0 },
		],
		frictions: [{ text: 'Dock tolls rise every season.', tags: [], line: 0 }],
		ripples: [
			{ text: '', tags: [parseTag('[L:Harbor|walled]')!, parseTag('[Tension:Toll riots|seasonal]')!], line: 0 },
			{ text: 'dockworkers resent the wall', tags: [], section: 'Society', line: 0 },
		],
		followUps: [{ kind: 'question', text: 'Who opens the gate at night?', line: 0 }],
		notes: [
			{ type: 'why', text: 'Ch4 needs a blockade', line: 0 },
			{ type: 'parked', text: 'a lighthouse', line: 0 },
		],
		tags: [{ tags: [parseTag('[Q:Gate hours|open|p2]')!], line: 0 }],
	});

	it('formats in digital style and reads back to the same model', () => {
		expect(shape(roundTrip(cycle))).toEqual(shape(cycle));
	});

	it('formats in analog style and reads back to the same model', () => {
		expect(shape(roundTrip(cycle, 'analog'))).toEqual(shape(cycle));
	});

	it('does not repeat a retraction reason as a separate note', () => {
		const text = formatCycle(cycle);
		expect(text.split('(why: Ch4 needs a blockade)')).toHaveLength(2);
	});
});

describe('single element formatters', () => {
	it('formats triggers with unit, attribution and section', () => {
		expect(formatTrigger({ kind: 'need', text: 'a reason to stop the hero', unit: 'Ch3' })).toBe('! Ch3 needs a reason to stop the hero');
		expect(formatTrigger({ kind: 'question', text: 'Who guards the gates?', section: 'Politics', author: 'Anna' })).toBe('?(Anna) Who guards the gates? (§Politics)');
	});

	it('formats facts by kind', () => {
		expect(formatFact({ kind: 'provisional', text: 'Magic is rare', tags: [] })).toBe('=? Magic is rare');
		expect(formatFact({ kind: 'retraction', text: 'Magic is free', tags: [] })).toBe('x= Magic is free');
		expect(formatFact({ kind: 'fact', text: 'Guild wells', tags: [parseTag('[F:Guild]')!], author: 'Roberto' })).toBe('=(Roberto) Guild wells [F:Guild]');
	});

	it('formats ripples with a section', () => {
		expect(formatRipple({ section: '2.3', text: 'add the warden ranks' })).toBe('>> §2.3: add the warden ranks');
	});

	it('formats headers that read back', () => {
		const front = formatWorldHeader({ title: 'The Cistern Cities', fields: { method: 'bottom-up', start_date: '2026-09-25' } }).join('\n');
		const parsed = parseLorelogLog(`${front}\n`);
		expect(parsed.header).toMatchObject({ title: 'The Cistern Cities', fields: { method: 'bottom-up', start_date: '2026-09-25' } });

		const analogHeader = formatWorldHeader({ title: 'Cistern', fields: { method: 'top-down' } }, 'analog').join('\n');
		expect(parseLorelogLog(analogHeader).header).toMatchObject({ title: 'Cistern', fields: { method: 'top-down' } });

		const build = formatBuildHeader({ number: 4, meta: { date: '2026-10-01', phase: 'Structure', focus: 'Harbor' } }).join('\n');
		const parsedBuild = parseLorelogLog(build).builds[0];
		expect(parsedBuild).toMatchObject({ number: 4, meta: { date: '2026-10-01', phase: 'Structure', focus: 'Harbor' } });

		const analogBuild = formatBuildHeader({ number: 5, meta: { date: '2026-10-02' } }, 'analog').join('\n');
		expect(parseLorelogLog(analogBuild).builds[0]).toMatchObject({ number: 5, meta: { date: '2026-10-02' } });
	});

	it('formats phase markers that read back', () => {
		expect(parseLorelogLine(formatPhase('Structure', 2))).toMatchObject({ kind: 'phase', number: 2, name: 'Structure' });
	});

	it('keeps tags stable through the shared tag formatter', () => {
		const raw = '[Tension:False arrests|open]';
		expect(formatTag(parseTag(raw)!)).toBe(raw);
	});
});
