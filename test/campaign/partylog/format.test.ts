/*
 * Partylog formatter and round-trip tests. Partylog by Roberto Bisceglie (Loreseed Workshop),
 * a fork of Lonelog. Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 */
import { describe, expect, it } from 'vitest';
import {
	formatAction,
	formatCampaignHeader,
	formatEntry,
	formatInterlude,
	formatRoll,
	formatSceneHeader,
	formatSessionEnd,
	formatSessionHeader,
	formatTag,
	formatNarrative,
	nextSceneId,
	parsePartylogLine,
	parsePartylogLog,
	parseSceneId,
	parseTag,
	type PartylogEntry,
	type Tag,
} from '../../../src/campaign/partylog';

const tags: Tag[] = [
	{ kind: 'N', reference: false, name: 'Baron Holt', fields: [{ kind: 'label', text: 'hostile' }, { kind: 'label', text: 'powerful' }] },
	{ kind: 'N', reference: true, name: 'Baron Holt', fields: [] },
	{ kind: 'PC', reference: false, name: 'Mira', fields: [
		{ kind: 'change', from: { kind: 'delta', key: 'HP', amount: -5 }, to: { kind: 'set', key: 'HP', value: '13/18' } },
		{ kind: 'delta', key: 'HP', amount: 10 },
		{ kind: 'remove', text: 'wounded' },
		{ kind: 'add', text: 'poisoned' },
		{ kind: 'keyed', key: 'trait', values: ['brave', 'reckless'] },
	] },
	{ kind: 'PC', reference: false, name: 'Kael', fields: [{ kind: 'set', key: 'Level', value: '6' }, { kind: 'set', key: 'Supply', value: 'd8' }] },
	{ kind: 'Party', reference: false, fields: [{ kind: 'delta', key: 'Gold', amount: -30 }, { kind: 'keyed', key: 'Wagon', values: ['intact'] }] },
	{ kind: 'Party', reference: false, fields: [{ kind: 'change', from: { kind: 'keyed', key: 'Wagon', values: ['intact'] }, to: { kind: 'keyed', key: 'Wagon', values: ['damaged'] } }] },
	{ kind: 'Wealth', reference: false, fields: [{ kind: 'set', key: 'Gold', value: '45' }] },
	{ kind: 'Faction', reference: false, name: 'City Watch', fields: [
		{ kind: 'keyed', key: 'tier', values: ['2'] },
		{ kind: 'change', from: { kind: 'keyed', key: 'standing', values: ['neutral'] }, to: { kind: 'keyed', key: 'standing', values: ['suspicious'] } },
	] },
	{ kind: 'L', reference: false, name: 'Safe House', fields: [{ kind: 'label', text: 'hidden' }] },
	{ kind: 'F', reference: false, name: 'Bandit×4', fields: [{ kind: 'set', key: 'HP', value: '11 each' }] },
	{ kind: 'Clock', reference: false, name: "Holt's Search", value: { current: 1, max: 6 }, fields: [] },
	{ kind: 'Clock', reference: false, name: "Holt's Search", value: { delta: 2 }, fields: [] },
	{ kind: 'Track', reference: false, name: 'Heist Plan', value: { current: 3, max: 8 }, fields: [] },
	{ kind: 'Timer', reference: false, name: 'Dawn', value: { current: 3 }, fields: [] },
	{ kind: 'E', reference: false, name: 'CultistRitual', value: { current: 3, max: 8 }, fields: [] },
	{ kind: 'Thread', reference: false, name: "Baron Holt's Retaliation", fields: [{ kind: 'label', text: 'Open' }] },
	{ kind: 'Goal', reference: false, name: 'Escort the Prince', fields: [{ kind: 'label', text: 'Active' }] },
	{ kind: 'Quest', reference: false, name: 'The Sunstone Conspiracy', fields: [{ kind: 'label', text: 'Main' }] },
	{ kind: 'Loot', reference: false, name: 'Potion of Healing', op: 'add', quantity: 2, fields: [] },
	{ kind: 'Loot', reference: false, name: 'Ancient Silver Ring', op: 'add', fields: [{ kind: 'label', text: 'unassigned' }] },
	{ kind: 'Loot', reference: false, name: 'Ancient Silver Ring', op: 'remove', fields: [] },
	{ kind: 'Loot', reference: false, name: 'Ring', op: 'assign', to: 'Mira', fields: [] },
	{ kind: 'Advance', reference: false, name: 'Kael', detail: 'Rogue 6', gains: ['Expertise: Thieves Tools, Stealth'], fields: [] },
	{ kind: 'OOC', reference: false, name: 'Break', note: '15 mins', fields: [] },
	{ kind: 'OOC', reference: false, name: 'Mira AFK', fields: [] },
	{ kind: 'Inv', reference: false, name: 'Arrow', delta: -1, fields: [] },
	{ kind: 'Inv', reference: false, name: 'Rope', quantity: 1, fields: [{ kind: 'label', text: '50ft' }] },
	{ kind: 'unknown', reference: false, head: 'Reaction', name: '', fields: [] },
	{ kind: 'unknown', reference: false, head: 'Foo', name: 'bar', fields: [{ kind: 'label', text: 'baz' }] },
];

describe('formatters', () => {
	it('formats actions in each attribution form', () => {
		expect(formatAction({ mode: 'solo', actors: ['Kael'], text: 'Pick the lock' })).toBe('@(Kael) Pick the lock');
		expect(formatAction({ mode: 'assist', actors: ['Mira', 'Kael'], text: 'assists' })).toBe('@(Mira > Kael) assists');
		expect(formatAction({ mode: 'group', actors: ['Kael', 'Mira'], text: 'Force the door' })).toBe('@(Kael+Mira) Force the door');
		expect(formatAction({ mode: 'implicit', actors: [], text: 'Slip inside' })).toBe('@ Slip inside');
	});

	it('formats rolls with attribution and outcome', () => {
		expect(formatRoll({ mode: 'none', expression: 'Stealth d20+5=8 vs DC 14', outcome: 'Fail' })).toBe('d: Stealth d20+5=8 vs DC 14 -> Fail');
		expect(formatRoll({ mode: 'solo', actors: ['Kael'], expression: 'd20+5=18 vs AC 15', outcome: 'Hit' })).toBe('d(Kael): d20+5=18 vs AC 15 -> Hit');
	});

	it('formats tags canonically', () => {
		expect(formatTag({ kind: 'PC', reference: false, name: 'Mira', fields: [{ kind: 'delta', key: 'HP', amount: -5 }, { kind: 'remove', text: 'wounded' }] }))
			.toBe('[PC:Mira|HP-5|-wounded]');
		expect(formatTag({ kind: 'Clock', reference: false, name: 'Alert', value: { current: 3, max: 6 }, fields: [] })).toBe('[Clock:Alert 3/6]');
		expect(formatTag({ kind: 'N', reference: true, name: 'Baron Holt', fields: [] })).toBe('[#N:Baron Holt]');
		expect(formatTag({ kind: 'unknown', reference: false, head: 'Reaction', name: '', fields: [] })).toBe('[Reaction]');
	});

	it('formats scene headers in digital and analog styles', () => {
		expect(formatSceneHeader({ id: 'S18', context: 'Sewer tunnels' })).toBe('### S18 *Sewer tunnels*');
		expect(formatSceneHeader({ id: 'S18', context: 'Sewer tunnels' }, 'analog')).toBe('S18 *Sewer tunnels*');
		expect(formatSceneHeader({ id: 'S18' })).toBe('### S18');
	});
});

describe('nextSceneId', () => {
	it('numbers sequential scenes past the highest used number', () => {
		expect(nextSceneId([], 'next')).toBe('S1');
		expect(nextSceneId(['S18', 'S19'], 'next')).toBe('S20');
		expect(nextSceneId([parseSceneId('S18')!, 'S19'], 'next')).toBe('S20');
	});

	it('adds letters for flashbacks after the latest sequential scene', () => {
		expect(nextSceneId(['S18', 'S19', 'S20'], 'flashback')).toBe('S20a');
		expect(nextSceneId(['S20', 'S20a'], 'flashback')).toBe('S20b');
	});

	it('adds decimal parts for montages', () => {
		expect(nextSceneId(['S15'], 'montage')).toBe('S15.1');
		expect(nextSceneId(['S15', 'S15.1', 'S15.2'], 'montage')).toBe('S15.3');
	});

	it('reuses the scene number for the second thread of a split party', () => {
		expect(nextSceneId(['S21'], 'split', 1)).toBe('T1-S22');
		expect(nextSceneId(['S21', 'T1-S22'], 'split', 2)).toBe('T2-S22');
		expect(nextSceneId(['S21', 'T1-S22', 'T2-S22'], 'split', 1)).toBe('T1-S23');
	});
});

describe('round trip: every line element', () => {
	const entries: PartylogEntry[] = [
		{ kind: 'action', mode: 'solo', actors: ['Kael'], text: 'Pick the lock', tags: [] },
		{ kind: 'action', mode: 'assist', actors: ['Mira', 'Kael'], text: 'Mira assists Kael', tags: [] },
		{ kind: 'action', mode: 'group', actors: ['Kael', 'Mira'], text: 'Force the door', tags: [tags[0]] },
		{ kind: 'action', mode: 'implicit', actors: [], text: 'Slip inside', tags: [] },
		{ kind: 'action', mode: 'solo', actors: ['Kael'], text: '', tags: [] },
		{ kind: 'event', text: 'The ceiling begins to crack', tags: [] },
		{ kind: 'event', text: 'Guards arrive', tags: [tags[10]] },
		{ kind: 'roll', mode: 'none', actors: [], expression: 'Stealth d20+5=8 vs DC 14', outcome: 'Fail', tags: [] },
		{ kind: 'roll', mode: 'solo', actors: ['Kael'], expression: 'd20+6 [Adv: Flanking, -Wounded] = 21 vs AC 16', outcome: 'Hit', tags: [] },
		{ kind: 'roll', mode: 'assist', actors: ['Mira', 'Kael'], expression: 'Athletics d20+2 (Mira) helps Kael', outcome: 'Success', tags: [] },
		{ kind: 'roll', mode: 'group', actors: ['Kael', 'Mira'], expression: 'Force d20+2', outcome: 'S', tags: [tags[10]] },
		{ kind: 'roll', mode: 'none', actors: [], expression: 'd20+1', tags: [] },
		{ kind: 'consequence', text: 'The door creaks open.', tags: [] },
		{ kind: 'consequence', text: '', tags: [tags[2]] },
		{ kind: 'table', source: 'tbl', expression: 'd100=42', outcome: '"A broken sword"', tags: [] },
		{ kind: 'table', source: 'tbl', expression: 'Mood [Tense, Melancholic]', tags: [] },
		{ kind: 'dialogue', speaker: 'PC', name: 'Kael', text: '"I don\'t trust him."' },
		{ kind: 'dialogue', speaker: 'N', name: 'Baron', text: '[stands] "Try us."' },
		{ kind: 'meta', type: 'note', text: 'Sam had to leave early' },
		{ kind: 'meta', type: 'rule', text: 'Flanking provides a +2 bonus' },
		{ kind: 'meta', type: 'post', text: 'reconstructed from memory' },
		{ kind: 'meta', type: 'hook', text: 'the shipment arrives in 3 days' },
		{ kind: 'meta', type: 'reflection', text: 'the heist scene was incredible' },
		{ kind: 'meta', type: 'safety', text: 'X-Card | Scene Ended | Spiders' },
		{ kind: 'block', marker: 'COMBAT', open: true },
		{ kind: 'block', marker: 'COMBAT', open: false },
		{ kind: 'block', marker: 'RESOURCES', open: true },
		{ kind: 'round', number: 2 },
		{ kind: 'tags', tags: [tags[1]], text: '' },
		{ kind: 'tags', tags: [{ kind: 'unknown', reference: false, head: 'Absent', name: '', fields: [] }], text: 'Sam (Mira stays at camp)' },
		{ kind: 'prose', text: 'Cold air hits them as they emerge.', tags: [] },
		{ kind: 'prose', text: 'Tunnel mouth, half flooded.', tags: [tags[10]] },
		{ kind: 'scene', id: parseSceneId('S18')!, context: 'Sewer tunnels beneath the estate' },
		{ kind: 'scene', id: parseSceneId('S20a')!, context: 'Flashback: dinner' },
		{ kind: 'scene', id: parseSceneId('T2-S22')!, context: 'Sable tailing the bartender' },
		{ kind: 'scene', id: parseSceneId('S15.1')!, context: '' },
		{ kind: 'session-heading', number: 7 },
		{ kind: 'session-heading' },
		{ kind: 'session-end-heading', number: 7 },
		{ kind: 'interlude-heading', title: 'One week — coast road' },
	];

	for (const entry of entries) {
		it(`round-trips ${entry.kind} ${JSON.stringify(entry).slice(0, 60)}`, () => {
			const text = formatEntry(entry);
			expect(parsePartylogLine(text)).toEqual(entry);
		});
	}

	it('round-trips every tag form', () => {
		for (const tag of tags) {
			const text = formatTag(tag);
			expect(parseTag(text), text).toEqual(tag);
		}
	});

	it('round-trips a multi-line narrative block through the log parser', () => {
		const block: PartylogEntry = { kind: 'narrative', text: 'The scroll reads:\n"When the moons align."' };
		const log = parsePartylogLog(formatNarrative(block.text ?? ''));
		expect(log.scenes[0].entries).toEqual([block]);
	});
});

describe('round trip: structure blocks', () => {
	it('round-trips a digital session header', () => {
		const header = {
			number: 7,
			date: '2025-11-15',
			duration: '3h30',
			scenes: { from: 'S18', to: 'S22' },
			players: ['Alex (Kael)', 'Jordan (Sable)', 'Sam (Mira)'],
			scribe: 'Jordan',
			absent: ['Sam (Mira stays at camp)'],
			mood: 'tense',
			threads: ['Sunstone Shipment'],
			recap: "Infiltrated Baron Holt's estate. Escaped through the sewers.",
			goals: 'Regroup, heal Mira.',
			notes: 'Strong session.',
		};
		const log = parsePartylogLog(formatSessionHeader(header));
		expect(log.sessionHeader).toEqual(header);
	});

	it('round-trips an analog session header', () => {
		const header = {
			number: 7,
			date: '2025-11-15',
			players: ['Alex (Kael)', 'Jordan (Sable)'],
			scribe: 'Jordan',
			absent: [],
			threads: [],
			recap: 'Escaped via sewers.',
		};
		const log = parsePartylogLog(formatSessionHeader(header, 'analog') + '\n\nS18 *Sewer tunnels*\n');
		expect(log.sessionHeader).toEqual(header);
		expect(log.scenes[0].id?.text).toBe('S18');
	});

	it('round-trips a session end block', () => {
		const end = {
			number: 7,
			entries: [
				parsePartylogLine('[Advance:Kael|Rogue 6|+Expertise]'),
				parsePartylogLine('[Party:XP+1 each]'),
				parsePartylogLine('(hook: the shipment arrives in 3 days)'),
				parsePartylogLine('(note: strong session)'),
			] as PartylogEntry[],
		};
		const log = parsePartylogLog(formatSessionEnd(end));
		expect(log.sessionEnd).toEqual(end);
	});

	it('round-trips an interlude', () => {
		const interlude = {
			title: 'One week — coast road',
			entries: [
				parsePartylogLine('[PC:Mira|HP 34/34|-bandaged]   (fully healed)'),
				parsePartylogLine('[Clock:Holt\'s Search +2]'),
				parsePartylogLine('(note: off-camera — narrated summary)'),
			] as PartylogEntry[],
		};
		const log = parsePartylogLog(formatInterlude(interlude));
		expect(log.interludes).toEqual([interlude]);
	});

	it('round-trips campaign front matter, digital and analog', () => {
		const campaign = {
			title: 'The Sunstone Conspiracy',
			fields: { ruleset: 'D&D 5e', gm: 'Roberto' },
			pcs: ['Kael [PC:Kael|Rogue 5|HP 28]', 'Sable [PC:Sable|Wizard 5|HP 18]'],
		};
		expect(parsePartylogLog(formatCampaignHeader(campaign)).campaign).toEqual(campaign);
		expect(parsePartylogLog(formatCampaignHeader({ title: 'Analog', fields: { ruleset: 'D&D 5e' }, pcs: ['Kael'] }, 'analog')).campaign)
			.toEqual({ title: 'Analog', fields: { ruleset: 'D&D 5e' }, pcs: ['Kael'] });
	});

	it('formats a full session block that parses back to the same sequence', () => {
		const text = [
			formatSessionHeader({ number: 2, players: ['Kael'], absent: [], threads: [] }),
			'',
			formatSceneHeader({ id: 'S5', context: 'Dock' }),
			'',
			'```',
			formatEntry({ kind: 'action', mode: 'solo', actors: ['Kael'], text: 'Hail the ferry', tags: [] }),
			formatEntry({ kind: 'consequence', text: 'It stops.', tags: [tags[10]] }),
			'```',
		].join('\n');
		const log = parsePartylogLog(text);
		expect(log.sequence.map((item) => item.kind)).toEqual(['session', 'scene']);
		expect(log.scenes[0].entries).toHaveLength(2);
	});
});
