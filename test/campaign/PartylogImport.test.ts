import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	applyImportPlan,
	buildImportPlan,
	mergeStatus,
	withSessionLogBody,
} from '../../src/campaign/PartylogImport';
import type { ImportExistingData, ImportPlan, ImportPorts } from '../../src/campaign/PartylogImport';
import { buildPartylogExport } from '../../src/campaign/PartylogExport';
import { parsePartylogLog, replayPartylogLog } from '../../src/campaign/partylog';
import type { Character, CampaignSession, Group, Location, PlotItem } from '../../src/types';

const sunstone = readFileSync('test/campaign/fixtures/partylog-6-4-sunstone.md', 'utf8');
const solo = readFileSync('test/campaign/fixtures/partylog-solo-crawl.md', 'utf8');

let counter = 0;
const createId = (prefix: string): string => `${prefix}-test-${++counter}`;

function emptyExisting(overrides: Partial<ImportExistingData> = {}): ImportExistingData {
	return { storyId: 'story-1', characters: [], locations: [], groups: [], items: [], sessionNames: [], ...overrides };
}

function itemsOf(plan: ImportPlan, kind: string, action?: 'create' | 'update') {
	return plan.items.filter((item) => item.kind === kind && (action === undefined || item.action === action));
}

function plannedSession(plan: ImportPlan, index = 0): CampaignSession {
	const item = plan.items.filter((entry) => entry.kind === 'session')[index];
	if (!item || item.payload.kind !== 'session') throw new Error('no session item');
	return item.payload.planned.session;
}

describe('spec section 6.4 example', () => {
	const existing = emptyExisting({
		characters: [{ id: 'char-mira', name: 'mira', status: 'Ally' } as Character],
	});
	const plan = buildImportPlan(sunstone, existing, { createId });

	it('proposes new characters from N tags and matches Mira case-insensitively', () => {
		const created = itemsOf(plan, 'character', 'create').map((item) => item.name);
		expect(created).toEqual(['Tomas']);
		expect(itemsOf(plan, 'character', 'create')[0].detail).toBe('New character: healer; underground; owes Sable');
		expect(plan.knownCharacterIds.get('mira')).toBe('char-mira');
		const mira = itemsOf(plan, 'character', 'update')[0];
		expect(mira.name).toBe('mira');
		expect(mira.payload.kind === 'character' && mira.payload.character.status).toBe('Ally; bandaged');
	});

	it('proposes the Safe House as a new location', () => {
		const location = itemsOf(plan, 'location', 'create')[0];
		expect(location.name).toBe('Safe House');
		expect(location.payload.kind === 'location' && location.payload.location.status).toBe('hidden; cramped; secure for now');
	});

	it('builds one session with the header fields and the log body', () => {
		expect(itemsOf(plan, 'session')).toHaveLength(1);
		const session = plannedSession(plan);
		expect(session).toMatchObject({
			name: 'Session 7',
			storyId: 'story-1',
			sessionNumber: 7,
			date: '2025-11-15',
			duration: '3h30',
			scribe: 'Jordan',
			players: ['Alex (Kael)', 'Jordan (Sable)', 'Sam (Mira)'],
		});
		expect(session.recap).toBe("Infiltrated Baron Holt's estate. Discovered in the study. Escaped through the sewers. Mira took a crossbow bolt.");
		const body = plan.items.find((entry) => entry.kind === 'session')!;
		expect(body.payload.kind === 'session' && body.payload.planned.body).toContain('### S18 *Sewer tunnels beneath the estate*');
		expect(body.payload.kind === 'session' && body.payload.planned.body).toContain('@(Kael) Navigate the tunnels toward the docks');
	});

	it('copies trackers, threads, party resources and party state from the replayed state', () => {
		const log = parsePartylogLog(sunstone);
		const replayed = replayPartylogLog(log);
		const session = plannedSession(plan);
		expect(session.partyResources).toEqual({ Gold: replayed.party.gauges.Gold.current });
		expect(session.clocks).toEqual([
			{ id: expect.any(String), name: "Holt's Search", current: 1, segments: 6, kind: 'clock' },
			{ id: expect.any(String), name: 'Shipment Arrives', current: 4, segments: 4, kind: 'timer' },
		]);
		expect(session.threads?.map((thread) => [thread.name, thread.kind, thread.state])).toEqual([
			['Sunstone Shipment', 'thread', 'Open'],
			["Baron Holt's Retaliation", 'thread', 'Open'],
		]);
		const member = itemsOf(plan, 'session')[0].payload;
		expect(member.kind === 'session' && member.planned.partyMembers).toEqual([
			{ name: 'Mira', currentHp: 27, maxHp: 34, conditions: ['bandaged'] },
		]);
		expect(session.loot).toBeUndefined();
	});

	it('leaves the note-style lines in the body and does not invent end data', () => {
		const body = itemsOf(plan, 'session')[0].payload;
		expect(body.kind === 'session' && body.planned.body).toContain('(note: great session');
		expect(session_(plan).hook).toBeUndefined();
		expect(session_(plan).endNotes).toBeUndefined();
	});
});

function session_(plan: ImportPlan): CampaignSession {
	return plannedSession(plan);
}

describe('solo log (no attribution, oracle lines)', () => {
	const plan = buildImportPlan(solo, emptyExisting(), { createId });

	it('imports the oracle line into the body as prose', () => {
		const item = itemsOf(plan, 'session')[0];
		expect(item.name).toBe('Session 1');
		expect(item.payload.kind === 'session' && item.payload.planned.body).toContain('? Is there a guard behind the door? -> Yes, asleep.');
	});

	it('creates the gate, the goblin and the key from loot', () => {
		expect(itemsOf(plan, 'location', 'create').map((item) => item.name)).toEqual(['Dungeon Gate']);
		expect(itemsOf(plan, 'character', 'create').map((item) => item.name)).toEqual(['Goblin']);
		expect(itemsOf(plan, 'item', 'create').map((item) => item.name)).toEqual(['Brass Key']);
		expect(plannedSession(plan).loot).toEqual([{ name: 'Brass Key' }]);
	});
});

describe('matching and naming', () => {
	it('matches existing locations case-insensitively and merges their status', () => {
		const location = { id: 'loc-1', name: 'safe house', status: 'hidden' } as Location;
		const plan = buildImportPlan(sunstone, emptyExisting({ locations: [location] }), { createId });
		expect(itemsOf(plan, 'location', 'create')).toHaveLength(0);
		const update = itemsOf(plan, 'location', 'update')[0];
		expect(update.payload.kind === 'location' && update.payload.location.status).toBe('hidden; cramped; secure for now');
	});

	it('does not propose an update when the status already lists everything', () => {
		const location = { id: 'loc-1', name: 'Safe House', status: 'hidden; cramped; secure for now' } as Location;
		const plan = buildImportPlan(sunstone, emptyExisting({ locations: [location] }), { createId });
		expect(itemsOf(plan, 'location', 'update')).toHaveLength(0);
	});

	it('picks a new session name when the story already has one', () => {
		const plan = buildImportPlan(sunstone, emptyExisting({ sessionNames: ['Session 7'] }), { createId });
		expect(itemsOf(plan, 'session')[0].name).toBe('Session 7 (imported)');
	});

	it('names an unnumbered log after its source', () => {
		const plan = buildImportPlan('@(Kael) Look around\nd: Perception d20+2=12 vs DC 10 -> Success\n=> A map.', emptyExisting(), { createId, sourceName: 'Notes' });
		expect(itemsOf(plan, 'session')[0].name).toBe('Imported Notes');
	});

	it('splits multi-session logs with interludes into separate sessions', () => {
		const text = `## Session 1
### S1 *Start*
! Something happens
=> [PC:Kael|HP 10/10]

## Interlude: One week
[Clock:Ritual 2/6]

## Session 2
### S2 *Later*
=> [Clock:Ritual 3/6]
`;
		const plan = buildImportPlan(text, emptyExisting(), { createId });
		const sessions = itemsOf(plan, 'session');
		expect(sessions.map((item) => item.name)).toEqual(['Session 1', 'Session 2']);
		const second = sessions[1].payload.kind === 'session' ? sessions[1].payload.planned.session : undefined;
		expect(second?.interludes).toEqual([{ title: 'One week', changes: ['[Clock:Ritual 2/6]'] }]);
		expect(second?.clocks?.[0]).toMatchObject({ name: 'Ritual', current: 3, segments: 6 });
	});
});

describe('round trip from an export', () => {
	const session: CampaignSession = {
		name: 'Session 7',
		storyId: 'story-1',
		sessionNumber: 7,
		date: '2025-11-15',
		players: ['Alex (Kael)', 'Sam (Mira)'],
		partyState: [{ characterId: 'c-mira', characterName: 'Mira', currentHp: 12, maxHp: 34, conditions: ['wounded'] }],
		partyResources: { Gold: 150, Rations: 10, Wagon: 'intact' },
		flags: ['bribed-barkeep'],
		groupStandings: [{ groupName: 'City Watch', value: 0, tier: 2, standing: 'suspicious', statusNotes: ['owes us a debt'] }],
		clocks: [{ id: 'k1', name: "Holt's Search", current: 1, segments: 6, kind: 'clock' }],
		threads: [{ id: 't1', name: 'Sunstone Shipment', kind: 'thread', state: 'Open' }],
		loot: [{ name: 'Potion of Healing', qty: 2 }, { name: 'Silver Ring', assignedTo: 'Mira' }],
		advancements: [{ character: 'Kael', summary: 'Rogue 6' }],
		hook: 'the shipment arrives in 3 days',
	};
	const markdown = buildPartylogExport({
		title: 'The Sunstone Conspiracy',
		sessions: [{ session, logBody: '@(Kael) Hold the door\n[PC:Mira|HP 12/34|wounded]' }],
	}).markdown;
	const plan = buildImportPlan(markdown, emptyExisting(), { createId });
	const imported = plannedSession(plan);
	const state = replayPartylogLog(parsePartylogLog(markdown));

	it('keeps the header and the hook', () => {
		expect(imported).toMatchObject({ sessionNumber: 7, date: '2025-11-15', players: ['Alex (Kael)', 'Sam (Mira)'], hook: 'the shipment arrives in 3 days' });
	});

	it('rebuilds resources, trackers, threads, factions, flags and loot from the replayed state', () => {
		expect(imported.partyResources).toEqual({ Gold: 150, Rations: 10, Wagon: 'intact' });
		expect(imported.flags).toEqual(['bribed-barkeep']);
		expect(imported.clocks).toEqual([{ id: expect.any(String), name: "Holt's Search", current: 1, segments: 6, kind: 'clock' }]);
		expect(imported.threads).toEqual([{ id: expect.any(String), name: 'Sunstone Shipment', kind: 'thread', state: 'Open' }]);
		const factions = plan.items.find((item) => item.kind === 'session')?.payload;
		expect(factions?.kind === 'session' && factions.planned.factions).toEqual([{ groupName: 'City Watch', value: 0, tier: 2, standing: 'suspicious', statusNotes: ['owes us a debt'] }]);
		expect(imported.loot).toEqual([{ name: 'Potion of Healing', qty: 2 }, { name: 'Silver Ring', assignedTo: 'Mira' }]);
		expect(imported.advancements).toEqual([{ character: 'Kael', summary: 'Rogue 6' }]);
		expect(state.loot.stash).toEqual([{ name: 'Potion of Healing', quantity: 2 }]);
	});

	it('keeps the log body as Partylog lines', () => {
		const body = plan.items.find((item) => item.kind === 'session');
		expect(body?.payload.kind === 'session' && body.payload.planned.body).toBe('@(Kael) Hold the door\n[PC:Mira|HP 12/34|wounded]');
	});
});

describe('applyImportPlan', () => {
	function fakePorts(overrides: Partial<ImportPorts> = {}): ImportPorts & { saved: string[] } {
		const saved: string[] = [];
		const base: ImportPorts & { saved: string[] } = {
			saved,
			saveCharacter: vi.fn(async (character: Character) => { saved.push(`character:${character.name}`); }),
			saveLocation: vi.fn(async (location: Location) => { saved.push(`location:${location.name}`); }),
			savePlotItem: vi.fn(async (item: PlotItem) => { saved.push(`item:${item.name}`); }),
			createGroup: vi.fn(async (name: string) => { saved.push(`group:${name}`); return { id: `group-${name}`, storyId: 'story-1', name, members: [] } as Group; }),
			saveGroup: vi.fn(async (group: Group) => { saved.push(`saveGroup:${group.name}:${group.status ?? ''}`); }),
			saveSession: vi.fn(async (session: CampaignSession) => { saved.push(`session:${session.name}`); session.filePath = `Sessions/${session.name}.md`; }),
			writeSessionLog: vi.fn(async (session: CampaignSession, body: string) => { saved.push(`log:${session.name}:${body.length > 0}`); }),
			...overrides,
		};
		return base;
	}

	it('creates selected items, links party members and writes the log body', async () => {
		const plan = buildImportPlan(sunstone, emptyExisting({ characters: [{ id: 'char-mira', name: 'Mira' } as Character] }), { createId });
		const ports = fakePorts();
		const result = await applyImportPlan(plan, new Set(plan.items.map((item) => item.id)), ports);
		expect(result.errors).toEqual([]);
		expect(result.sessions).toBe(1);
		expect(ports.saved).toContain('character:Tomas');
		expect(ports.saved).toContain('location:Safe House');
		expect(ports.saved).toContain('session:Session 7');
		expect(ports.saved).toContain('log:Session 7:true');
		const saveSession = vi.mocked(ports.saveSession).mock.calls[0][0];
		expect(saveSession.partyCharacterIds).toEqual(['char-mira']);
		expect(saveSession.partyState).toEqual([{ characterId: 'char-mira', characterName: 'Mira', currentHp: 27, maxHp: 34, conditions: ['bandaged'] }]);
	});

	it('skips unticked items and keeps going after a failure', async () => {
		const plan = buildImportPlan(sunstone, emptyExisting(), { createId });
		const ports = fakePorts({
			saveLocation: vi.fn(async () => { throw new Error('disk full'); }),
		});
		const selected = new Set(plan.items.filter((item) => item.kind !== 'character').map((item) => item.id));
		const result = await applyImportPlan(plan, selected, ports);
		expect(result.errors).toEqual(['Safe House: disk full']);
		expect(result.sessions).toBe(1);
		expect(ports.saveCharacter).not.toHaveBeenCalled();
	});

	it('does not save a session when its item is unticked', async () => {
		const plan = buildImportPlan(sunstone, emptyExisting(), { createId });
		const ports = fakePorts();
		const result = await applyImportPlan(plan, new Set(plan.items.filter((item) => item.kind !== 'session').map((item) => item.id)), ports);
		expect(result.sessions).toBe(0);
		expect(ports.saveSession).not.toHaveBeenCalled();
	});

	it('creates a faction group, sets its status and links the session standing to it', async () => {
		const plan = buildImportPlan('## Session 2\n=> [Faction:City Watch|tier:2|standing:neutral->suspicious]', emptyExisting(), { createId });
		const ports = fakePorts();
		await applyImportPlan(plan, new Set(plan.items.map((item) => item.id)), ports);
		expect(ports.saved).toContain('group:City Watch');
		expect(ports.saved).toContain('saveGroup:City Watch:suspicious');
		const saved = vi.mocked(ports.saveSession).mock.calls[0][0];
		expect(saved.groupStandings).toEqual([{ groupName: 'City Watch', groupId: 'group-City Watch', value: 0, tier: 2, standing: 'suspicious' }]);
	});
});

describe('helpers', () => {
	it('merges only the parts a status does not already list', () => {
		expect(mergeStatus('Ally; bandaged', ['bandaged', 'healer'])).toEqual({ value: 'Ally; bandaged; healer', added: ['healer'] });
		expect(mergeStatus(undefined, [])).toBeUndefined();
	});

	it('replaces the Session Log body and keeps later sections', () => {
		const content = '---\ntitle: x\n---\n\n## Session Log\n\nold\n\n## Notes\nkeep me\n';
		expect(withSessionLogBody(content, '@(Kael) New line')).toBe('---\ntitle: x\n---\n\n## Session Log\n\n@(Kael) New line\n\n## Notes\nkeep me\n');
		expect(withSessionLogBody('---\n---\n', 'x')).toBe('---\n---\n\n## Session Log\n\nx\n');
	});
});
