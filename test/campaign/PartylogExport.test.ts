import { describe, expect, it } from 'vitest';
import { buildPartylogExport, normalizeLogBody, safeFileBase, sessionSnapshotLines, uniqueExportPath } from '../../src/campaign/PartylogExport';
import type { PartylogExportSession } from '../../src/campaign/PartylogExport';
import { createPartylogState, parsePartylogLog, replayPartylogLog } from '../../src/campaign/partylog';
import type { CampaignSession } from '../../src/types';

const SESSION_7_BODY = `- @(Kael) Navigate the tunnels toward the docks
d: Survival d20+2=14 vs DC 12 -> Success
=> Finds the old drainage route. Moving quickly.

! The tunnel forks, one passage smells of salt
@(Mira) Keep moving despite the wound
d: CON save d20+3=11 vs DC 10 -> Success
=> Gritting teeth, she keeps pace. [PC:Mira|HP 12/34|wounded]

[Loot: Potion of Healing x2]
Plain prose line with no notation.`;

function sessionSeven(): CampaignSession {
	return {
		name: 'Session 7',
		storyId: 'story-1',
		sessionNumber: 7,
		date: '2025-11-15',
		duration: '3h30',
		players: ['Alex (Kael)', 'Jordan (Sable)', 'Sam (Mira)'],
		scribe: 'Jordan',
		mood: 'tense',
		recap: "Infiltrated Baron Holt's estate. Escaped through the sewers.",
		goals: 'Regroup, heal Mira.',
		partyCharacterNames: ['Kael', 'Sable', 'Mira'],
		partyState: [{ characterId: 'c-mira', characterName: 'Mira', currentHp: 12, maxHp: 34, conditions: ['wounded'] }],
		partyResources: { Gold: 150, Rations: 10, Wagon: 'intact' },
		flags: ['bribed-barkeep'],
		groupStandings: [{ groupName: 'City Watch', value: 0, tier: 2, standing: 'suspicious', statusNotes: ['owes us a debt'] }],
		clocks: [
			{ id: 'k1', name: "Holt's Search", current: 1, segments: 6, kind: 'clock' },
			{ id: 'k2', name: 'Shipment Arrives', current: 4, segments: 4, kind: 'timer' },
		],
		threads: [
			{ id: 't1', name: 'Sunstone Shipment', kind: 'thread', state: 'Open' },
			{ id: 't2', name: 'The Sunstone Conspiracy', kind: 'quest', state: 'Main' },
		],
		loot: [
			{ name: 'Potion of Healing', qty: 2 },
			{ name: 'Silver Ring', assignedTo: 'Mira' },
		],
		advancements: [{ character: 'Kael', summary: 'Rogue 6' }],
		hook: 'the shipment arrives in 3 days',
		endNotes: 'strong session',
	};
}

function populated(): PartylogExportSession[] {
	return [{ session: sessionSeven(), logBody: SESSION_7_BODY }];
}

describe('buildPartylogExport: digital layout', () => {
	const result = buildPartylogExport({ title: 'The Sunstone Conspiracy', sessions: populated() });
	const md = result.markdown;

	it('writes the campaign front matter, title and session header', () => {
		expect(md.startsWith('---\ntitle: The Sunstone Conspiracy\n')).toBe(true);
		expect(md).toContain('start_date: 2025-11-15');
		expect(md).toContain('players: Alex (Kael), Jordan (Sable), Sam (Mira)');
		expect(md).toContain('# The Sunstone Conspiracy');
		expect(md).toContain('## Session 7\n*Date: 2025-11-15 | Duration: 3h30*\n*Players: Alex (Kael), Jordan (Sable), Sam (Mira)*\n*Scribe: Jordan*\n*Mood: tense*');
		expect(md).toContain("**Recap:** Infiltrated Baron Holt's estate. Escaped through the sewers.");
		expect(md).toContain('**Goals:** Regroup, heal Mira.');
	});

	it('keeps the log body, strips bullets and keeps prose lines', () => {
		expect(md).toContain('@(Kael) Navigate the tunnels toward the docks');
		expect(md).not.toContain('- @(Kael)');
		expect(md).toContain('Plain prose line with no notation.');
	});

	it('writes the end block with advancements, snapshot tags, hook and note', () => {
		expect(md).toContain('### End of Session 7\n\n```\n');
		expect(md).toContain('[Advance:Kael|Rogue 6]');
		expect(md).toContain('[PC:Mira|HP 12/34|wounded]');
		expect(md).toContain('[Party:Gold 150|Rations 10|Wagon:intact|+bribed-barkeep]');
		expect(md).toContain('[Faction:City Watch|tier:2|standing:suspicious|+owes us a debt]');
		expect(md).toContain("[Clock:Holt's Search 1/6]");
		expect(md).toContain('[Timer:Shipment Arrives 4]');
		expect(md).toContain('[Thread:Sunstone Shipment|Open]');
		expect(md).toContain('[Quest:The Sunstone Conspiracy|Main]');
		expect(md).toContain('[Loot:Silver Ring|to:Mira]');
		expect(md).toContain('(hook: the shipment arrives in 3 days)');
		expect(md).toContain('(note: strong session)');
	});

	it('does not double count loot already added by the log body', () => {
		const endBlock = md.slice(md.indexOf('### End of Session 7'));
		expect(endBlock).not.toContain('Potion of Healing');
		expect(md.split('[Loot: Potion of Healing x2]')).toHaveLength(2);
	});

	it('parses back to the same session fields', () => {
		const log = parsePartylogLog(md);
		expect(log.sessionHeader).toMatchObject({
			number: 7,
			date: '2025-11-15',
			duration: '3h30',
			players: ['Alex (Kael)', 'Jordan (Sable)', 'Sam (Mira)'],
			scribe: 'Jordan',
			mood: 'tense',
			recap: "Infiltrated Baron Holt's estate. Escaped through the sewers.",
			goals: 'Regroup, heal Mira.',
		});
		const endMeta = (log.sessionEnd?.entries ?? []).filter((entry) => entry.kind === 'meta');
		expect(endMeta).toEqual([
			{ kind: 'meta', type: 'hook', text: 'the shipment arrives in 3 days' },
			{ kind: 'meta', type: 'note', text: 'strong session' },
		]);
	});

	it('replays to the same state as the session fields', () => {
		const state = replayPartylogLog(parsePartylogLog(md));
		expect(state.pcs.Mira.gauges.HP).toEqual({ current: 12, max: 34 });
		expect(state.pcs.Mira.labels).toEqual(['wounded']);
		expect(state.pcs.Mira.items).toEqual(['Silver Ring']);
		expect(state.pcs.Kael).toMatchObject({ characterClass: 'Rogue', level: 6 });
		expect(state.party.gauges.Gold).toEqual({ current: 150 });
		expect(state.party.gauges.Rations).toEqual({ current: 10 });
		expect(state.party.props.Wagon).toEqual(['intact']);
		expect(state.party.labels).toEqual(['bribed-barkeep']);
		expect(state.factions['City Watch']).toMatchObject({ tier: 2, standing: 'suspicious', labels: ['owes us a debt'] });
		expect(state.clocks["Holt's Search"]).toEqual({ name: "Holt's Search", current: 1, max: 6 });
		expect(state.timers['Shipment Arrives']).toEqual({ name: 'Shipment Arrives', current: 4 });
		expect(state.threads['Sunstone Shipment'].state).toBe('Open');
		expect(state.quests['The Sunstone Conspiracy'].state).toBe('Main');
		expect(state.loot.stash).toEqual([{ name: 'Potion of Healing', quantity: 2 }]);
		expect(state.advancements).toHaveLength(1);
	});
});

describe('buildPartylogExport: analog layout', () => {
	const md = buildPartylogExport({ title: 'The Sunstone Conspiracy', sessions: populated(), style: 'analog' }).markdown;

	it('uses notebook headers and end blocks', () => {
		expect(md).toContain('=== Campaign Log: The Sunstone Conspiracy ===');
		expect(md).toContain('=== Session 7 ===\n[Date] 2025-11-15');
		expect(md).toContain('--- End of Session 7 ---');
		expect(md).not.toContain('```');
	});

	it('parses back to the same header and state', () => {
		const log = parsePartylogLog(md);
		expect(log.sessionHeader).toMatchObject({ number: 7, date: '2025-11-15', scribe: 'Jordan', mood: 'tense' });
		const state = replayPartylogLog(log);
		expect(state.pcs.Mira.gauges.HP).toEqual({ current: 12, max: 34 });
		expect(state.party.gauges.Gold).toEqual({ current: 150 });
	});
});

describe('buildPartylogExport: carrying state across sessions', () => {
	const second: CampaignSession = {
		name: 'Session 8',
		storyId: 'story-1',
		sessionNumber: 8,
		date: '2025-11-22',
		players: ['Alex (Kael)'],
		partyCharacterNames: ['Kael', 'Mira'],
		partyState: [{ characterId: 'c-mira', characterName: 'Mira', currentHp: 27, maxHp: 34, conditions: ['bandaged'] }],
		partyResources: { Gold: 120 },
		loot: [{ name: 'Potion of Healing' }],
	};
	const md = buildPartylogExport({
		title: 'The Sunstone Conspiracy',
		sessions: [
			{ session: sessionSeven(), logBody: SESSION_7_BODY },
			{ session: second, logBody: '@(Kael) Rest at the safe house' },
		],
	}).markdown;

	it('removes stale labels and corrects loot by difference', () => {
		expect(md).toContain('[PC:Mira|HP 27/34|bandaged|-wounded]');
		expect(md).toContain('[Loot:-Potion of Healing x1]');
	});

	it('ends with the second session state', () => {
		const state = replayPartylogLog(parsePartylogLog(md));
		expect(state.party.gauges.Gold).toEqual({ current: 120 });
		expect(state.pcs.Mira.labels).toEqual(['bandaged']);
		expect(state.pcs.Mira.gauges.HP).toEqual({ current: 27, max: 34 });
		expect(state.loot.stash).toEqual([{ name: 'Potion of Healing', quantity: 1 }]);
		expect(parsePartylogLog(md).sequence.filter((item) => item.kind === 'session')).toHaveLength(2);
	});
});

describe('sessionSnapshotLines', () => {
	it('is empty for a session with no state', () => {
		expect(sessionSnapshotLines({ name: 'Empty', storyId: 's' }, createPartylogState())).toEqual([]);
	});

	it('writes a warning and skips resource keys Partylog cannot spell', () => {
		const warnings: string[] = [];
		const lines = sessionSnapshotLines({ name: 'x', storyId: 's', partyResources: { 'Gold (gp)': 5, Gold: 3 } }, createPartylogState(), warnings);
		expect(lines).toEqual(['[Party:Gold 3]']);
		expect(warnings).toHaveLength(1);
	});
});

describe('helpers', () => {
	it('strips bullets and blank runs from stored log text', () => {
		expect(normalizeLogBody('\n\n- @(Kael) Hi\n\n\n\n  Prose line\n\n')).toBe('@(Kael) Hi\n\n  Prose line');
	});

	it('makes file names safe', () => {
		expect(safeFileBase('Story: Part [1]/2')).toBe('Story Part 1 2');
		expect(safeFileBase('   ')).toBe('Partylog export');
	});

	it('picks the first free export path', () => {
		const taken = new Set(['StorytellerSuite/Exports/Log.md', 'StorytellerSuite/Exports/Log (2).md']);
		expect(uniqueExportPath('StorytellerSuite/Exports', 'Log', (path) => taken.has(path))).toBe('StorytellerSuite/Exports/Log (3).md');
		expect(uniqueExportPath('StorytellerSuite/Exports', 'Other', () => false)).toBe('StorytellerSuite/Exports/Other.md');
	});
});
