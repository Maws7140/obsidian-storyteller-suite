/*
 * Partylog parser tests. Partylog by Roberto Bisceglie (Loreseed Workshop), a fork of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 */
import { describe, expect, it } from 'vitest';
import {
	analyzeRoll,
	extractTags,
	parsePartylogLine,
	parsePartylogLog,
	parseSceneId,
	parseTag,
} from '../../../src/campaign/partylog';

describe('core lines', () => {
	it('parses solo, assist, group and implicit actions', () => {
		expect(parsePartylogLine('@(Kael) Pick the lock')).toEqual({
			kind: 'action', mode: 'solo', actors: ['Kael'], text: 'Pick the lock', tags: [],
		});
		expect(parsePartylogLine('@(Mira > Kael) Mira assists Kael in climbing the wall')).toEqual({
			kind: 'action', mode: 'assist', actors: ['Mira', 'Kael'], text: 'Mira assists Kael in climbing the wall', tags: [],
		});
		expect(parsePartylogLine('@(Kael+Mira) Force open the heavy door')).toEqual({
			kind: 'action', mode: 'group', actors: ['Kael', 'Mira'], text: 'Force open the heavy door', tags: [],
		});
		expect(parsePartylogLine('@ Pick the lock')).toEqual({
			kind: 'action', mode: 'implicit', actors: [], text: 'Pick the lock', tags: [],
		});
	});

	it('parses world events and consequences', () => {
		expect(parsePartylogLine('! The ceiling begins to crack')).toEqual({ kind: 'event', text: 'The ceiling begins to crack', tags: [] });
		expect(parsePartylogLine('=> The door creaks open.')).toEqual({ kind: 'consequence', text: 'The door creaks open.', tags: [] });
		expect(parsePartylogLine('=> [Clock:Alert 3/6]')).toEqual({
			kind: 'consequence',
			text: '',
			tags: [{ kind: 'Clock', reference: false, name: 'Alert', value: { current: 3, max: 6 }, fields: [] }],
		});
	});

	it('parses rolls with and without attribution', () => {
		expect(parsePartylogLine('d: Stealth d20+5=8 vs DC 14 -> Fail')).toEqual({
			kind: 'roll', mode: 'none', actors: [], expression: 'Stealth d20+5=8 vs DC 14', outcome: 'Fail', tags: [],
		});
		expect(parsePartylogLine('d(Kael): Athletics d20+2=15 -> Success')).toEqual({
			kind: 'roll', mode: 'solo', actors: ['Kael'], expression: 'Athletics d20+2=15', outcome: 'Success', tags: [],
		});
		expect(parsePartylogLine('d(Mira > Kael): Athletics d20+2 -> Success')).toMatchObject({ mode: 'assist', actors: ['Mira', 'Kael'] });
		expect(parsePartylogLine('d(Kael+Mira): Force d20 -> Success')).toMatchObject({ mode: 'group', actors: ['Kael', 'Mira'] });
	});

	it('extracts tags on the outcome side of a roll but keeps roll context in the expression', () => {
		const roll = parsePartylogLine('d: d20+6 [Adv: Flanking, -Wounded] = 21 vs AC 16 -> Hit [Clock:Alert 1/6]');
		expect(roll).toMatchObject({
			kind: 'roll',
			expression: 'd20+6 [Adv: Flanking, -Wounded] = 21 vs AC 16',
			outcome: 'Hit',
			tags: [{ kind: 'Clock', name: 'Alert', value: { current: 1, max: 6 } }],
		});
	});

	it('parses dialogue, meta notes, narrative markers, blocks and rounds', () => {
		expect(parsePartylogLine('PC(Kael): "I don\'t trust him."')).toEqual({
			kind: 'dialogue', speaker: 'PC', name: 'Kael', text: '"I don\'t trust him."',
		});
		expect(parsePartylogLine('N(Baron): [stands, hand on sword] "Try us."')).toEqual({
			kind: 'dialogue', speaker: 'N', name: 'Baron', text: '[stands, hand on sword] "Try us."',
		});
		expect(parsePartylogLine('(note: Sam had to leave early — Mira stays at camp)')).toEqual({
			kind: 'meta', type: 'note', text: 'Sam had to leave early — Mira stays at camp',
		});
		expect(parsePartylogLine('(post: S18-S19 reconstructed from memory)')).toMatchObject({ kind: 'meta', type: 'post' });
		expect(parsePartylogLine('[COMBAT]')).toEqual({ kind: 'block', marker: 'COMBAT', open: true });
		expect(parsePartylogLine('[/COMBAT]')).toEqual({ kind: 'block', marker: 'COMBAT', open: false });
		expect(parsePartylogLine('R2')).toEqual({ kind: 'round', number: 2 });
		expect(parsePartylogLine('\\---')).toEqual({ kind: 'narrative-marker', open: true });
		expect(parsePartylogLine('---\\')).toEqual({ kind: 'narrative-marker', open: false });
	});

	it('parses tbl and gen lookups', () => {
		expect(parsePartylogLine('tbl: d100=42 -> "A broken sword"')).toEqual({
			kind: 'table', source: 'tbl', expression: 'd100=42', outcome: '"A broken sword"', tags: [],
		});
		expect(parsePartylogLine('gen: Random NPC d8=3,d10=7 -> Gruff/Pilot')).toMatchObject({ kind: 'table', source: 'gen', outcome: 'Gruff/Pilot' });
	});

	it('parses scene headers, digital and analog', () => {
		expect(parsePartylogLine('### S18 *Sewer tunnels beneath the estate*')).toEqual({
			kind: 'scene',
			id: { text: 'S18', kind: 'sequential', number: 18 },
			context: 'Sewer tunnels beneath the estate',
		});
		expect(parsePartylogLine('S20a *Flashback: Baron Holt\'s dinner*')).toMatchObject({
			kind: 'scene', id: { text: 'S20a', kind: 'flashback', number: 20, letter: 'a' },
		});
		expect(parsePartylogLine('T2-S22 *Sable tailing the bartender*')).toMatchObject({
			kind: 'scene', id: { text: 'T2-S22', kind: 'split', number: 22, thread: 2 },
		});
		expect(parsePartylogLine('S15.1 *Kael: Casing the estate*')).toMatchObject({
			kind: 'scene', id: { text: 'S15.1', kind: 'montage', number: 15, part: 1 },
		});
		expect(parsePartylogLine('## Session 7')).toEqual({ kind: 'session-heading', number: 7 });
		expect(parsePartylogLine('=== Session 7 ===')).toEqual({ kind: 'session-heading', number: 7 });
		expect(parsePartylogLine('### End of Session 7')).toEqual({ kind: 'session-end-heading', number: 7 });
		expect(parsePartylogLine('--- End of Session 7 ---')).toEqual({ kind: 'session-end-heading', number: 7 });
		expect(parsePartylogLine('## Interlude: One week — coast road')).toEqual({ kind: 'interlude-heading', title: 'One week — coast road' });
	});

	it('keeps tags and prose apart on a tags-only line', () => {
		expect(parsePartylogLine('[N:Tomas|healer|underground|owes Sable]')).toEqual({
			kind: 'tags',
			text: '',
			tags: [{ kind: 'N', reference: false, name: 'Tomas', fields: [
				{ kind: 'label', text: 'healer' }, { kind: 'label', text: 'underground' }, { kind: 'label', text: 'owes Sable' },
			] }],
		});
		expect(parsePartylogLine('Cold air hits them as they emerge.')).toEqual({
			kind: 'prose', text: 'Cold air hits them as they emerge.', tags: [],
		});
	});

	it('returns a blank entry for empty lines', () => {
		expect(parsePartylogLine('   ')).toEqual({ kind: 'blank' });
	});
});

describe('dashes, arrows and spacing', () => {
	it('accepts unicode arrows as the outcome separator', () => {
		expect(parsePartylogLine('d: Survival d20+2=14 vs DC 12 → Success')).toMatchObject({ outcome: 'Success' });
		expect(parsePartylogLine('d: Survival d20+2=14 vs DC 12 -> Success')).toMatchObject({ outcome: 'Success' });
	});

	it('reads both unicode and ASCII change arrows inside tags', () => {
		const unicode = parseTag('[PC:Sable|HP-5→HP 13/18]');
		const ascii = parseTag('[PC:Sable|HP-5->HP 13/18]');
		expect(unicode).toEqual(ascii);
		expect(unicode).toMatchObject({
			fields: [{ kind: 'change', from: { kind: 'delta', key: 'HP', amount: -5 }, to: { kind: 'set', key: 'HP', value: '13/18' } }],
		});
	});

	it('keeps the key of a keyed value across an arrow with a bare target', () => {
		expect(parseTag('[Party:Wagon:intact->damaged]')).toMatchObject({
			fields: [{ kind: 'change', from: { kind: 'keyed', key: 'Wagon', values: ['intact'] }, to: { kind: 'keyed', key: 'Wagon', values: ['damaged'] } }],
		});
		expect(parseTag('[Faction:City Watch|standing:neutral->suspicious]')).toMatchObject({
			fields: [{ kind: 'change', to: { kind: 'keyed', key: 'standing', values: ['suspicious'] } }],
		});
	});

	it('accepts en and em dashes in thread prefixes and minus signs in deltas', () => {
		expect(parseSceneId('T1–S22')).toEqual(parseSceneId('T1-S22'));
		expect(parseTag('[Timer:Dawn −3]')).toMatchObject({ value: { delta: -3 } });
		expect(parseTag('[PC:Kael|HP–5]')).toMatchObject({ fields: [{ kind: 'delta', key: 'HP', amount: -5 }] });
	});

	it('collapses extra spaces and keeps em dashes in prose', () => {
		expect(parsePartylogLine('@(Kael)     Pick    the   lock   ')).toMatchObject({ text: 'Pick the lock' });
		expect(parsePartylogLine('=> Gritting teeth — she keeps pace.')).toMatchObject({ text: 'Gritting teeth — she keeps pace.' });
	});
});

describe('tags', () => {
	it('parses reference, categories and multi-line bodies', () => {
		expect(parseTag('[#N:Baron Holt]')).toEqual({ kind: 'N', reference: true, name: 'Baron Holt', fields: [] });
		expect(parseTag('[PC:Kael|trait:agile,curious|status:wounded|stat:HP 23]')).toMatchObject({
			fields: [
				{ kind: 'keyed', key: 'trait', values: ['agile', 'curious'] },
				{ kind: 'keyed', key: 'status', values: ['wounded'] },
				{ kind: 'keyed', key: 'stat', values: ['HP 23'] },
			],
		});
		expect(parseTag('[PC:Mira\n  | trait: brave, reckless, loyal\n  | status: bandaged\n]')).toEqual(
			parseTag('[PC:Mira|trait: brave, reckless, loyal|status: bandaged]'),
		);
	});

	it('parses updates: restated values, deltas, adds and removes', () => {
		expect(parseTag('[PC:Mira|HP+15|HP 27/34|-wounded|bandaged]')).toMatchObject({
			fields: [
				{ kind: 'delta', key: 'HP', amount: 15 },
				{ kind: 'set', key: 'HP', value: '27/34' },
				{ kind: 'remove', text: 'wounded' },
				{ kind: 'label', text: 'bandaged' },
			],
		});
		expect(parseTag('[Party:XP+1 each]')).toMatchObject({ fields: [{ kind: 'delta', key: 'XP', amount: 1, suffix: 'each' }] });
		expect(parseTag('[Clock:Holt\'s Search +2]')).toMatchObject({ kind: 'Clock', name: "Holt's Search", value: { delta: 2 } });
		expect(parseTag('[Faction:Thieves Guild|+owes us a debt]')).toMatchObject({ fields: [{ kind: 'add', text: 'owes us a debt' }] });
	});

	it('parses loot, advancement, OOC and inventory tags', () => {
		expect(parseTag('[Loot: Potion of Healing x2]')).toMatchObject({ kind: 'Loot', name: 'Potion of Healing', op: 'add', quantity: 2 });
		expect(parseTag('[Loot: -Ancient Silver Ring]')).toMatchObject({ kind: 'Loot', name: 'Ancient Silver Ring', op: 'remove' });
		expect(parseTag('[Loot: Ring | to:Mira]')).toMatchObject({ kind: 'Loot', name: 'Ring', op: 'assign', to: 'Mira', fields: [] });
		expect(parseTag('[Advance:Kael|Rogue 6|+Expertise: Thieves Tools, Stealth]')).toMatchObject({
			kind: 'Advance', name: 'Kael', detail: 'Rogue 6', gains: ['Expertise: Thieves Tools, Stealth'],
		});
		expect(parseTag('[OOC: Break | 15 mins]')).toMatchObject({ kind: 'OOC', name: 'Break', note: '15 mins' });
		expect(parseTag('[Inv:Arrow-1]')).toMatchObject({ kind: 'Inv', name: 'Arrow', delta: -1 });
		expect(parseTag('[Inv:Rope|1|50ft]')).toMatchObject({ kind: 'Inv', name: 'Rope', quantity: 1, fields: [{ kind: 'label', text: '50ft' }] });
	});

	it('keeps unknown tag types generically', () => {
		expect(parseTag('[Reaction]')).toEqual({ kind: 'unknown', reference: false, head: 'Reaction', name: '', fields: [] });
		expect(parseTag('[Foo: bar|baz|+x]')).toEqual({
			kind: 'unknown', reference: false, head: 'Foo', name: 'bar',
			fields: [{ kind: 'label', text: 'baz' }, { kind: 'add', text: 'x' }],
		});
		expect(extractTags('Mira [Reaction] raises her shield')).toEqual({
			tags: [{ kind: 'unknown', reference: false, head: 'Reaction', name: '', fields: [] }],
			text: 'Mira raises her shield',
		});
	});

	it('leaves brackets that are not tags in the prose', () => {
		expect(extractTags('a [1] b [] c [:] d [ e')).toEqual({ tags: [], text: 'a [1] b [] c [:] d [ e' });
	});
});

describe('malformed input never throws', () => {
	it('returns prose for unclosed or stray brackets', () => {
		expect(parsePartylogLine('[PC:Kael|HP-5')).toEqual({ kind: 'prose', text: '[PC:Kael|HP-5', tags: [] });
		expect(parsePartylogLine(']]]')).toEqual({ kind: 'prose', text: ']]]', tags: [] });
		expect(parsePartylogLine('[PC:')).toEqual({ kind: 'prose', text: '[PC:', tags: [] });
		expect(parsePartylogLine('[|]')).toEqual({ kind: 'prose', text: '[|]', tags: [] });
	});

	it('does not throw on odd or non-string input', () => {
		expect(() => parsePartylogLine(undefined as unknown as string)).not.toThrow();
		expect(() => parsePartylogLine('@(Kael')).not.toThrow();
		expect(() => parsePartylogLog(undefined as unknown as string)).not.toThrow();
		expect(parsePartylogLog(null as unknown as string).scenes).toEqual([]);
		expect(parseTag('[PC:Kael')).toBeUndefined();
		expect(parseSceneId('Sable')).toBeUndefined();
	});

	it('parses multi-line tags inside a log', () => {
		const log = parsePartylogLog('```\n[PC:Mira\n  | trait: brave, reckless, loyal\n  | status: bandaged\n]\n```\n');
		expect(log.scenes).toHaveLength(1);
		expect(log.scenes[0].entries).toEqual([
			{
				kind: 'tags',
				text: '',
				tags: [{
					kind: 'PC', reference: false, name: 'Mira', fields: [
						{ kind: 'keyed', key: 'trait', values: ['brave', 'reckless', 'loyal'] },
						{ kind: 'keyed', key: 'status', values: ['bandaged'] },
					],
				}],
			},
		]);
	});

	it('treats an unclosed multi-line tag as prose without consuming the log', () => {
		const log = parsePartylogLog('@(Kael) Pick the lock\n[PC:Kael|HP-5\n=> Done.\n');
		expect(log.scenes[0].entries.map((entry) => entry.kind)).toEqual(['action', 'consequence']);
		expect(log.scenes[0].entries[0]).toMatchObject({ text: 'Pick the lock [PC:Kael|HP-5' });
	});
});

describe('analyzeRoll', () => {
	it('derives dice, total, comparison and flags', () => {
		expect(analyzeRoll({ expression: 'Stealth d20+5=8 vs DC 14', outcome: 'Fail' })).toEqual({
			label: 'Stealth', dice: 'd20+5', total: 8,
			comparison: { op: 'vs', target: { label: 'DC', value: 14, raw: 'DC 14' } },
			context: [],
		});
	});

	it('reads the comparison shorthand and S/F flags', () => {
		expect(analyzeRoll({ expression: '18≥15', outcome: 'S' })).toEqual({
			total: 18, comparison: { op: 'ge', target: { value: 15, raw: '15' } }, context: [], flag: 'S',
		});
		expect(analyzeRoll({ expression: '8<=14', outcome: 'F' })).toMatchObject({
			total: 8, comparison: { op: 'le', target: { value: 14 } }, flag: 'F',
		});
	});

	it('reads roll context in square brackets and leaves contests unsplit', () => {
		const withContext = analyzeRoll({ expression: 'd20+6 [Adv: Flanking, -Wounded] = 21 vs AC 16', outcome: 'Hit' });
		expect(withContext.context).toEqual(['Adv: Flanking, -Wounded']);
		expect(withContext.total).toBe(21);
		expect(withContext.comparison?.target).toMatchObject({ label: 'AC', value: 16 });
		const contest = analyzeRoll({ expression: 'Athletics (Kael d20+2=15 vs Assassin d20+4=12)', outcome: 'Kael wins' });
		expect(contest.comparison).toBeUndefined();
	});
});
