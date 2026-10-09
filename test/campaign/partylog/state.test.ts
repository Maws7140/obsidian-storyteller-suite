/*
 * Partylog state reducer tests. Partylog by Roberto Bisceglie (Loreseed Workshop), a fork of
 * Lonelog. Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 */
import { describe, expect, it } from 'vitest';
import { applyTagUpdates, createPartylogState, parseTag, type PartylogState, type Tag } from '../../../src/campaign/partylog';

function run(tags: string[], start: PartylogState = createPartylogState()): PartylogState {
	return applyTagUpdates(start, tags.map((text) => {
		const tag = parseTag(text);
		if (!tag) throw new Error(`not a tag: ${text}`);
		return tag;
	}));
}

describe('applyTagUpdates', () => {
	it('does not mutate the input state', () => {
		const before = createPartylogState();
		const snapshot = JSON.stringify(before);
		const after = run(['[PC:Mira|HP 12/34|wounded]', '[Party:Gold 10]', '[Clock:Alert 1/6]'], before);
		expect(JSON.stringify(before)).toBe(snapshot);
		expect(after).not.toBe(before);
		expect(after.pcs.Mira.gauges.HP).toEqual({ current: 12, max: 34 });
	});

	it('clamps HP deltas at the known maximum and keeps a known maximum on restated values', () => {
		const state = run(['[PC:Mira|HP 30/34]', '[PC:Mira|HP+10]', '[PC:Mira|HP-5]', '[PC:Mira|HP 12]']);
		expect(state.pcs.Mira.gauges.HP).toEqual({ current: 12, max: 34 });
		expect(run(['[PC:Kael|HP 28/28]', '[PC:Kael|HP full]']).pcs.Kael.gauges.HP).toEqual({ current: 28, max: 28 });
	});

	it('adds, removes and transitions labels', () => {
		const state = run([
			'[N:Baron Holt|hostile|powerful]',
			'[N:Baron Holt|hostile→cooperative]',
			'[N:Baron Holt|-powerful|+captured]',
		]);
		expect(state.npcs['Baron Holt'].labels).toEqual(['cooperative', 'captured']);
	});

	it('moves named states through transitions', () => {
		expect(run(['[Thread:Holt|Open]', '[Thread:Holt|Open->Resolved]']).threads.Holt.state).toBe('Resolved');
		expect(run(['[Goal:Escort|Active]', '[Goal:Escort|Done]']).goals.Escort.state).toBe('Done');
	});

	it('keeps clocks within [0, max] and timers at zero or above', () => {
		const clock = run(['[Clock:Alert 5/6]', '[Clock:Alert +3]']).clocks.Alert;
		expect(clock).toEqual({ name: 'Alert', current: 6, max: 6 });
		const timer = run(['[Timer:Dawn 1]', '[Timer:Dawn -3]']).timers.Dawn;
		expect(timer).toEqual({ name: 'Dawn', current: 0 });
	});

	it('records quantities for loot and merges repeated items', () => {
		const state = run([
			'[Loot: Potion of Healing x2]',
			'[Loot: Potion of Healing]',
			'[Loot: -Potion of Healing x1]',
		]);
		expect(state.loot.stash).toEqual([{ name: 'Potion of Healing', quantity: 2 }]);
		expect(state.loot.pending).toEqual([]);
	});

	it('assigns loot directly to a character with to:', () => {
		const state = run(['[Loot: Ring|unassigned]', '[Loot: Ring|to:Mira]']);
		expect(state.loot.stash).toEqual([]);
		expect(state.pcs.Mira.items).toEqual(['Ring']);
	});

	it('treats a +item as a condition when no loot matches', () => {
		const state = run(['[PC:Mira|+Silver Ring]']);
		expect(state.pcs.Mira.labels).toEqual(['Silver Ring']);
		expect(state.pcs.Mira.items).toEqual([]);
	});

	it('tracks wealth and inventory from the resource addon tags', () => {
		const state = run([
			'[Wealth:Gold 45|Silver 12]',
			'[Wealth:Gold+15]',
			'[Inv:Torch|3]',
			'[Inv:Torch-1]',
			'[Inv:Oil Flask|1]',
			'[Inv:Oil Flask|depleted]',
		]);
		expect(state.party.gauges.Gold).toEqual({ current: 60 });
		expect(state.party.gauges.Silver).toEqual({ current: 12 });
		expect(state.inventory).toEqual({ Torch: 2 });
	});

	it('reads level and class from [PC:] and [Advance:]', () => {
		const state = run(['[PC:Kael|Class:Rogue|Level 5]', '[Advance:Kael|Rogue 6|+Expertise]']);
		expect(state.pcs.Kael).toMatchObject({ characterClass: 'Rogue', level: 6 });
		expect(state.advancements).toEqual([{ pc: 'Kael', detail: 'Rogue 6', gains: ['Expertise'] }]);
	});

	it('updates faction tier and standing, and clears standing on -value', () => {
		const state = run([
			'[Faction:Baron Holt\'s House|tier:4|standing:hostile]',
			'[Faction:Baron Holt\'s House|-hostile|+hunting us]',
		]);
		expect(state.factions["Baron Holt's House"]).toEqual({
			name: "Baron Holt's House",
			labels: ['hunting us'],
			props: { tier: ['4'] },
			gauges: {},
			stats: {},
			tier: 4,
		});
	});

	it('ignores OOC, absent and unknown tags without changing state', () => {
		const start = run(['[PC:Kael|HP 10/10]']);
		const unknown: Tag = { kind: 'unknown', reference: false, head: 'Reaction', name: '', fields: [] };
		const ooc = parseTag('[OOC: X-Card | spiders]') as Tag;
		const after = applyTagUpdates(start, [unknown, ooc]);
		expect(after).toEqual(start);
	});

	it('applies a quest carried by a party tag', () => {
		expect(run(['[Party:Quest:Retrieve the Sunstone]']).quests).toEqual({ 'Retrieve the Sunstone': { name: 'Retrieve the Sunstone' } });
	});
});
