import { describe, expect, it } from 'vitest';
import { buildPartylogExport, normalizeLogBody, safeFileBase, sessionSnapshotLines, uniqueExportPath } from '../../src/campaign/PartylogExport';
import type { PartylogExportSession } from '../../src/campaign/PartylogExport';
import { createPartylogState, parsePartylogLog, replayPartylogLog } from '../../src/campaign/partylog';
import type { CampaignSession } from '../../src/types';
import { FELLOWSHIP_SESSION_01, FELLOWSHIP_SESSION_01_LOG, FELLOWSHIP_SESSION_02, FELLOWSHIP_SESSION_02_LOG } from './fixtures/fellowship-sessions';

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
		expect(md).toContain('[Timer:Shipment Arrives 4/4]');
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
		expect(state.timers['Shipment Arrives']).toEqual({ name: 'Shipment Arrives', current: 4, max: 4 });
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

// ─── Fellowship test campaign: real session data ─────────────────────────────

const fellowshipCount = (md: string, needle: string): number => md.split(needle).length - 1;

describe('buildPartylogExport: blocks already in the stored log are not written twice', () => {
	const s2 = { session: FELLOWSHIP_SESSION_02, logBody: FELLOWSHIP_SESSION_02_LOG };
	const md = buildPartylogExport({ title: 'The Fellowship of the Ring', sessions: [s2] }).markdown;

	it('writes the interlude, the session header and the end block exactly once', () => {
		expect(fellowshipCount(md, '## Interlude: Ten days on the Greenway')).toBe(1);
		expect(fellowshipCount(md, '\n## Session 2\n')).toBe(1);
		expect(fellowshipCount(md, '### End of Session 2')).toBe(1);
		expect(fellowshipCount(md, '*Date: 2026-10-08 | Duration: 3h10')).toBe(1);
	});

	it('writes each interlude change once', () => {
		expect(fellowshipCount(md, '[Clock:The Watcher Wakes 1/6]')).toBe(1);
		expect(fellowshipCount(md, '[Timer:Torches 6]')).toBe(1);
	});

	it('never emits the same advancement twice', () => {
		expect(fellowshipCount(md, '[Advance:Aragorn|Ranger 9]')).toBe(1);
		expect(parsePartylogLog(md).sequence.filter((item) => item.kind === 'session-end')).toHaveLength(1);
	});

	it('writes the hook and note once, even though the stored note differs only by case and a full stop', () => {
		expect(fellowshipCount(md, '(hook: the riders of Sauron')).toBe(1);
		expect(fellowshipCount(md, '(note: strong session, the split worked')).toBe(1);
		expect(fellowshipCount(md, 'Strong session, the split worked')).toBe(0);
	});

	it('adds the snapshot lines the stored end block lacked, inside that same end block', () => {
		const endBlock = md.slice(md.indexOf('### End of Session 2'));
		expect(endBlock).toContain('[PC:Frodo Baggins|HP 34/38]');
		expect(endBlock).toContain('[Party:Gold 110|Rations 9');
		expect(endBlock.indexOf('[Advance:Aragorn|Ranger 9]')).toBeLessThan(endBlock.indexOf('[PC:Frodo Baggins'));
	});

	it('replays the same session counts as the stored log, with no double count', () => {
		const state = replayPartylogLog(parsePartylogLog(md));
		expect(state.advancements).toHaveLength(1);
		expect(state.clocks['The Watcher Wakes']).toEqual({ name: 'The Watcher Wakes', current: 3, max: 6 });
		expect(state.party.gauges.Gold).toEqual({ current: 110 });
	});

	it('exports the same single copy of each block when Session 02 follows Session 01', () => {
		const both = buildPartylogExport({
			title: 'The Fellowship of the Ring',
			sessions: [{ session: FELLOWSHIP_SESSION_01, logBody: FELLOWSHIP_SESSION_01_LOG }, s2],
		}).markdown;
		expect(fellowshipCount(both, '## Interlude: Ten days on the Greenway')).toBe(1);
		expect(fellowshipCount(both, '[Advance:Aragorn|Ranger 9]')).toBe(1);
		expect(fellowshipCount(both, '### End of Session 2')).toBe(1);
		expect(fellowshipCount(both, '\n## Session 2\n')).toBe(1);
	});
});

describe('buildPartylogExport: analog style converts the stored log headings', () => {
	const s2 = { session: FELLOWSHIP_SESSION_02, logBody: FELLOWSHIP_SESSION_02_LOG };
	const md = buildPartylogExport({ title: 'The Fellowship of the Ring', sessions: [s2], style: 'analog' }).markdown;

	it('has no digital headings or fences left', () => {
		expect(md).not.toMatch(/^###? /m);
		expect(md).not.toContain('```');
	});

	it('writes analog session, interlude and end headings', () => {
		expect(md).toContain('=== Interlude: Ten days on the Greenway ===');
		expect(md).toContain('=== Session 2 ===\n[Date] 2026-10-08');
		expect(md).toContain('--- End of Session 2 ---');
		expect(fellowshipCount(md, '=== Session 2 ===')).toBe(1);
		expect(fellowshipCount(md, '--- End of Session 2 ---')).toBe(1);
	});

	it('writes analog scene headings for sequential, flashback, split and montage scenes', () => {
		expect(md).toContain('S1 *Bree, the Prancing Pony, evening*');
		expect(md).toContain('S2a *Flashback: Gandalf\'s warning, months before the mines*');
		expect(md).toContain('T1-S3 *Aragorn and Legolas climb the broken stair*');
		expect(md).toContain('S4.1 *Gimli: the tomb of the dwarves*');
		expect(md).not.toContain('### S');
	});

	it('parses back to the same session, scenes and advancement', () => {
		const log = parsePartylogLog(md);
		expect(log.sessionHeader).toMatchObject({ number: 2, date: '2026-10-08', duration: '3h10', scribe: 'Jordan' });
		expect(log.scenes.map((scene) => scene.id?.text)).toContain('T1-S3');
		expect(log.interludes.map((interlude) => interlude.title)).toEqual(['Ten days on the Greenway']);
		expect(replayPartylogLog(log).advancements).toHaveLength(1);
	});
});

describe('buildPartylogExport: legacy Session 01 data', () => {
	const md = buildPartylogExport({ title: 'The Fellowship of the Ring', sessions: [{ session: FELLOWSHIP_SESSION_01, logBody: FELLOWSHIP_SESSION_01_LOG }] }).markdown;

	it('names party members from their character ids when characterName is missing', () => {
		expect(md).toContain('[PC:Frodo Baggins|HP 38/38]');
		expect(md).toContain('[PC:Boromir|HP 84/84|Tempted by the Ring]');
		expect(md).not.toContain('[PC:[[');
	});

	it('writes faction standings with the group name, not the wikilink', () => {
		expect(md).toContain('[Faction:The Free Peoples]');
		expect(md).toContain('[Faction:Forces of Sauron]');
		expect(md).not.toContain('[Faction:[[');
	});

	it('replays the party, factions and trackers from the legacy records', () => {
		const state = replayPartylogLog(parsePartylogLog(md));
		expect(state.pcs['Frodo Baggins'].gauges.HP).toEqual({ current: 38, max: 38 });
		expect(state.pcs.Boromir.labels).toEqual(['Tempted by the Ring']);
		expect(state.factions['The Free Peoples']).toBeDefined();
		expect(state.factions['Forces of Sauron']).toBeDefined();
		expect(state.party.labels).toEqual(expect.arrayContaining(['quest-begun', 'left-home', 'ring-used']));
		expect(state.clocks['The Nine Close on the Ford']).toEqual({ name: 'The Nine Close on the Ford', current: 2, max: 6 });
	});

	it('uses the context to resolve character and group names from ids', () => {
		const withContext = buildPartylogExport({
			title: 'The Fellowship of the Ring',
			sessions: [{ session: { ...FELLOWSHIP_SESSION_01, partyState: [{ characterId: 'char-frodo', currentHp: 30, maxHp: 38 }], groupStandings: [{ groupId: 'group-free', value: 1 }] }, logBody: '' }],
			context: {
				characters: [{ id: 'char-frodo', name: 'Frodo Baggins' }],
				groups: [{ id: 'group-free', name: 'The Free Peoples' }],
			},
		}).markdown;
		expect(withContext).toContain('[PC:Frodo Baggins|HP 30/38]');
		expect(withContext).toContain('[Faction:The Free Peoples]');
	});
});
