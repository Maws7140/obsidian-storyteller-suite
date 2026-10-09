/*
 * Tests against the Partylog spec's own examples (Partylog by Roberto Bisceglie, Loreseed
 * Workshop, CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/). Fixtures live in
 * ./fixtures and are copied from partylog.md sections 6.4 and 4.1-5.5.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	analyzeRoll,
	parsePartylogLog,
	replayPartylogLog,
	type PartylogEntry,
	type ParsedLog,
} from '../../../src/campaign/partylog';

const sunstone = readFileSync('test/campaign/partylog/fixtures/sunstone-session-7.md', 'utf8');
const tagExamples = readFileSync('test/campaign/partylog/fixtures/spec-tag-examples.md', 'utf8');

function allEntries(log: ParsedLog): PartylogEntry[] {
	return log.scenes.flatMap((scene) => scene.entries);
}

function countKind(entries: PartylogEntry[], kind: PartylogEntry['kind']): number {
	return entries.filter((entry) => entry.kind === kind).length;
}

describe('spec section 6.4: complete session log', () => {
	const log = parsePartylogLog(sunstone);

	it('reads the campaign front matter and session header', () => {
		expect(log.campaign).toEqual({
			title: 'The Sunstone Conspiracy',
			fields: { ruleset: 'D&D 5e', gm: 'Roberto', players: 'Alex (Kael), Jordan (Sable), Sam (Mira)' },
			pcs: [],
		});
		expect(log.sessionHeader).toMatchObject({
			number: 7,
			date: '2025-11-15',
			duration: '3h30',
			scribe: 'Jordan',
			players: ['Alex (Kael)', 'Jordan (Sable)', 'Sam (Mira)'],
		});
		expect(log.sessionHeader?.recap).toBe(
			"Infiltrated Baron Holt's estate. Discovered in the study. Escaped through the sewers. Mira took a crossbow bolt.",
		);
		expect(log.sessionHeader?.goals).toBe('Regroup, heal Mira, follow up on the Sunstone lead.');
		expect(log.sessionEnd).toBeUndefined();
		expect(log.interludes).toEqual([]);
	});

	it('finds scenes S18, S19 and S20 with their contexts', () => {
		expect(log.scenes.map((scene) => [scene.id?.text, scene.context])).toEqual([
			['S18', 'Sewer tunnels beneath the estate'],
			['S19', "Docks District — Sable's contact"],
			['S20', 'Safe house in the Docks District, dawn'],
		]);
		expect(log.sequence.map((item) => item.kind)).toEqual(['session', 'scene', 'scene', 'scene']);
	});

	it('counts each element type across the session', () => {
		const entries = allEntries(log);
		expect(countKind(entries, 'action')).toBe(7);
		expect(countKind(entries, 'event')).toBe(2);
		expect(countKind(entries, 'roll')).toBe(5);
		expect(countKind(entries, 'consequence')).toBe(8);
		expect(countKind(entries, 'dialogue')).toBe(8);
		expect(countKind(entries, 'tags')).toBe(6);
		expect(countKind(entries, 'meta')).toBe(1);
		expect(countKind(entries, 'prose')).toBe(1);
	});

	it('attributes every action to the named character', () => {
		const actors = allEntries(log)
			.filter((entry): entry is Extract<PartylogEntry, { kind: 'action' }> => entry.kind === 'action')
			.map((entry) => `${entry.mode}:${entry.actors.join('+')}`);
		expect(actors.filter((actor) => actor === 'solo:Kael')).toHaveLength(3);
		expect(actors.filter((actor) => actor === 'solo:Sable')).toHaveLength(3);
		expect(actors.filter((actor) => actor === 'solo:Mira')).toHaveLength(1);
	});

	it('keeps dialogue speakers and text verbatim', () => {
		const dialogue = allEntries(log).filter((entry) => entry.kind === 'dialogue');
		expect(dialogue[0]).toEqual({ kind: 'dialogue', speaker: 'N', name: 'Tomas', text: '"You look terrible. All of you."' });
		expect(dialogue[dialogue.length - 1]).toEqual({ kind: 'dialogue', speaker: 'PC', name: 'Kael', text: '"Then we get there first."' });
		const merged = dialogue.find((entry) => entry.kind === 'dialogue' && entry.text.indexOf('immense power') >= 0);
		expect(merged).toBeDefined();
	});

	it('reads roll outcomes and comparison results', () => {
		const rolls = allEntries(log).filter((entry): entry is Extract<PartylogEntry, { kind: 'roll' }> => entry.kind === 'roll');
		expect(rolls.map((roll) => roll.outcome)).toEqual(['Success', 'Success', 'Success', 'Fail', 'Success']);
		const persuasion = rolls.find((roll) => roll.expression.indexOf('Persuasion') === 0);
		expect(persuasion).toBeDefined();
		expect(analyzeRoll(persuasion!)).toMatchObject({
			label: 'Persuasion', dice: 'd20+3', total: 9,
			comparison: { op: 'vs', target: { label: 'DC', value: 14 } },
		});
	});

	it('joins a consequence that wraps onto an indented line', () => {
		const consequence = allEntries(log).find((entry) => entry.kind === 'consequence' && entry.text.indexOf('abandoned temple') >= 0);
		expect(consequence).toEqual({
			kind: 'consequence',
			text: 'The documents reference a "Sunstone shipment" arriving by sea in four days. Destination: an abandoned temple north of the city.',
			tags: [],
		});
	});

	it('reduces the session to the expected state', () => {
		const state = replayPartylogLog(log);
		expect(state.pcs.Mira.gauges.HP).toEqual({ current: 27, max: 34 });
		expect(state.pcs.Mira.labels).toEqual(['bandaged']);
		expect(state.npcs.Tomas.labels).toEqual(['healer', 'underground', 'owes Sable']);
		expect(state.locations['Safe House'].labels).toEqual(['hidden', 'cramped', 'secure for now']);
		expect(state.party.gauges.Gold).toEqual({ current: -25 });
		expect(state.clocks["Holt's Search"]).toEqual({ name: "Holt's Search", current: 1, max: 6 });
		expect(state.timers['Shipment Arrives']).toEqual({ name: 'Shipment Arrives', current: 4 });
		expect(state.threads['Sunstone Shipment'].state).toBe('Open');
		expect(state.threads["Baron Holt's Retaliation"].state).toBe('Open');
		expect(state.loot.stash).toEqual([]);
		expect(state.factions).toEqual({});
	});
});

describe('spec tag examples: state semantics', () => {
	const log = parsePartylogLog(tagExamples);
	const state = replayPartylogLog(log);

	it('parses the session, scene, end block and interlude', () => {
		expect(log.campaign?.title).toBe('Tag Examples');
		expect(log.sessionHeader).toMatchObject({ number: 3, scribe: 'Sam' });
		expect(log.sequence.map((item) => item.kind)).toEqual(['session', 'scene', 'session-end', 'interlude']);
		expect(log.sessionEnd?.number).toBe(3);
		expect(log.interludes.map((interlude) => interlude.title)).toEqual(['One week — coast road']);
	});

	it('tracks factions through gains, losses and standing transitions (4.1.4, 5.5)', () => {
		expect(state.factions['City Watch']).toMatchObject({ tier: 2, standing: 'suspicious' });
		expect(state.factions['Thieves Guild']).toMatchObject({ tier: 3, standing: 'allied', labels: ['owes us a debt'] });
		expect(state.factions["Baron Holt's House"]).toMatchObject({ tier: 4, labels: ['hunting us'] });
		expect(state.factions["Baron Holt's House"].standing).toBeUndefined();
		expect(state.factions["Baron Holt's House"].props).toEqual({ tier: ['4'] });
	});

	it('moves loot from the stash to a character (4.1.8)', () => {
		expect(state.loot.stash).toEqual([{ name: 'Potion of Healing', quantity: 2 }]);
		expect(state.loot.pending).toEqual([]);
		expect(state.pcs.Mira.items).toEqual(['Silver Ring']);
		expect(state.pcs.Mira.labels).toEqual([]);
	});

	it('applies party gains, losses and keyed transitions (4.1.3)', () => {
		expect(state.party.gauges.Gold).toEqual({ current: 120 });
		expect(state.party.gauges.Rations).toEqual({ current: 0 });
		expect(state.party.gauges.XP).toEqual({ current: 1 });
		expect(state.party.props.Wagon).toEqual(['damaged']);
		expect(state.party.props.Reputation).toEqual(['feared in Northport']);
		expect(state.quests['Retrieve the Sunstone']).toEqual({ name: 'Retrieve the Sunstone' });
		expect(state.quests['The Sunstone Conspiracy']).toEqual({ name: 'The Sunstone Conspiracy', state: 'Main' });
	});

	it('tracks clocks, tracks and timers (4.2, 5.5)', () => {
		expect(state.clocks.Ritual).toEqual({ name: 'Ritual', current: 5, max: 12 });
		expect(state.clocks.CultistRitual).toEqual({ name: 'CultistRitual', current: 3, max: 8 });
		expect(state.clocks["Holt's Search"]).toEqual({ name: "Holt's Search", current: 2 });
		expect(state.tracks['Heist Plan']).toEqual({ name: 'Heist Plan', current: 3, max: 8 });
		expect(state.timers.Dawn).toEqual({ name: 'Dawn', current: 3 });
	});

	it('applies PC updates, levels and advancements (4.1.2, 5.4)', () => {
		expect(state.pcs.Kael).toMatchObject({ characterClass: 'Rogue', level: 6, props: { Player: ['Alex'] } });
		expect(state.pcs.Kael.gauges.HP).toEqual({ current: 34 });
		expect(state.pcs.Sable.labels).toEqual(['poisoned']);
		expect(state.pcs.Mira.gauges.HP).toEqual({ current: 34, max: 34 });
		expect(state.advancements.map((record) => record.gains)).toEqual([
			['Expertise: Thieves Tools, Stealth'],
			['Expertise'],
		]);
	});

	it('reads npc, thread and goal states, and multi-line tags (4.1.10, 4.1.11)', () => {
		expect(state.npcs['Baron Holt'].labels).toEqual(['hostile', 'powerful']);
		expect(state.npcs['Baron Holt'].props).toEqual({ status: ['captured', 'angry'], info: ['knows about the cult'] });
		expect(state.threads['Find the Missing Merchant'].state).toBe('Open');
		expect(state.goals['Escort the Prince to Northport'].state).toBe('Active');
		expect(state.pcs.Mira.props.trait).toEqual(['brave', 'reckless', 'loyal']);
		expect(state.pcs.Mira.props.gear).toEqual(['Greatsword', 'Shield']);
	});

	it('keeps end-block hooks and notes as meta entries', () => {
		expect(log.sessionEnd?.entries.filter((entry) => entry.kind === 'meta').map((entry) => entry.kind === 'meta' && entry.type)).toEqual(['hook', 'note']);
	});
});
