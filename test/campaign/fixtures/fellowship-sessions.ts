/*
 * Session fields from the "Fellowship of the Ring - Test Campaign" vault data, as the
 * plugin reads them from frontmatter. The log bodies are copied verbatim into the sibling
 * `fellowship-session-0N-log.md` files (the text under `## Session Log`).
 */
import { readFileSync } from 'node:fs';
import type { CampaignSession } from '../../../src/types';

const fixtureDir = 'test/campaign/fixtures';

/** Session 01 is a legacy record: no characterName, no partyCharacterNames, wikilink group ids. */
export const FELLOWSHIP_SESSION_01: CampaignSession = {
	id: 'sess-lotr-01',
	name: 'Session 01 - Shadows in the Shire',
	storyId: 'murcwmu6gopare',
	currentSceneId: '[[01 - A Shadow in the Shire]]',
	partyCharacterIds: ['[[Frodo Baggins]]', '[[Samwise Gamgee]]', '[[Aragorn]]', '[[Gandalf]]', '[[Legolas]]', '[[Gimli]]', '[[Boromir]]'],
	partyState: [
		{ characterId: '[[Frodo Baggins]]', currentHp: 38, maxHp: 38, conditions: [] },
		{ characterId: '[[Samwise Gamgee]]', currentHp: 44, maxHp: 44, conditions: [] },
		{ characterId: '[[Aragorn]]', currentHp: 76, maxHp: 76, conditions: [] },
		{ characterId: '[[Gandalf]]', currentHp: 62, maxHp: 62, conditions: [] },
		{ characterId: '[[Legolas]]', currentHp: 60, maxHp: 60, conditions: [] },
		{ characterId: '[[Gimli]]', currentHp: 74, maxHp: 74, conditions: [] },
		{ characterId: '[[Boromir]]', currentHp: 84, maxHp: 84, conditions: ['Tempted by the Ring'] },
	],
	partyItems: ['The One Ring', 'Sting', 'Elven Rope'],
	flags: ['quest-begun', 'left-home', 'ring-used'],
	groupStandings: [
		{ groupId: '[[The Free Peoples]]', value: 1 },
		{ groupId: '[[Forces of Sauron]]', value: -5 },
	],
	clocks: [
		{ id: 'clock-nazgul', name: 'The Nine Find the Ring', current: 1, segments: 4 },
		{ id: 'clock-corruption', name: 'Ring Corruption', current: 0, segments: 4 },
		{ id: 'clock-mordor', name: 'Mordor Goes to War', current: 1, segments: 4 },
		{ id: 'clock-ford', name: 'The Nine Close on the Ford', current: 2, segments: 6 },
	],
	threads: [
		{ id: 'thread-destroy-ring', name: 'Destroy the One Ring', status: 'resolved' },
		{ id: 'thread-heir-gondor', name: 'Aragorn Claims His Name', status: 'resolved' },
		{ id: 'thread-gollum', name: 'The Creature Following Us', status: 'active' },
		{ id: 'thread-find-the-way', name: 'Find the Way Past Bree', status: 'active' },
	],
	status: 'paused',
};

/** Session 02 keeps its interlude, header and end block inside the stored log body. */
export const FELLOWSHIP_SESSION_02: CampaignSession = {
	id: 'sess-lotr-02',
	name: 'Session 02 - The Council and the Mines',
	storyId: 'murcwmu6gopare',
	currentSceneId: '[[04 - The Mines of Moria]]',
	partyCharacterIds: ['char-frodo', 'char-sam', 'char-aragorn', 'char-legolas', 'char-gimli', 'char-boromir'],
	partyCharacterNames: ['Frodo Baggins', 'Samwise Gamgee', 'Aragorn', 'Legolas', 'Gimli', 'Boromir'],
	partyState: [
		{ characterId: 'char-frodo', characterName: 'Frodo Baggins', currentHp: 34, maxHp: 38, conditions: [] },
		{ characterId: 'char-sam', characterName: 'Samwise Gamgee', currentHp: 44, maxHp: 44, conditions: [] },
		{ characterId: 'char-aragorn', characterName: 'Aragorn', currentHp: 70, maxHp: 76, conditions: [] },
		{ characterId: 'char-legolas', characterName: 'Legolas', currentHp: 60, maxHp: 60, conditions: [] },
		{ characterId: 'char-gimli', characterName: 'Gimli', currentHp: 65, maxHp: 74, conditions: [] },
		{ characterId: 'char-boromir', characterName: 'Boromir', currentHp: 73, maxHp: 84, conditions: ['Tempted by the Ring', 'Wounded'] },
	],
	partyItems: ['The One Ring', 'Sting', 'Elven Rope', 'Mithril Shirt'],
	flags: ['entered-moria', 'gandalf-missing'],
	groupStandings: [
		{ groupId: 'group-sauron', groupName: 'Forces of Sauron', value: -5, tier: 5, standing: 'hunting us' },
		{ groupId: 'group-free-peoples', groupName: 'The Free Peoples', value: 1 },
	],
	clocks: [
		{ id: 'clock-watcher-wakes', name: 'The Watcher Wakes', current: 3, segments: 6, kind: 'clock' },
		{ id: 'track-path-through-moria', name: 'Path Through Moria', current: 3, segments: 6, kind: 'track' },
		{ id: 'timer-torches', name: 'Torches', current: 2, segments: 6, kind: 'timer' },
	],
	threads: [
		{ id: 'thread-gandalf-fate', name: "Gandalf's Fate", kind: 'thread', state: 'Open', status: 'active' },
		{ id: 'quest-cross-moria', name: 'Cross Moria', kind: 'quest', state: 'Active', status: 'active' },
		{ id: 'goal-find-the-eastgate', name: 'Find the Eastgate', kind: 'goal', state: 'Active', status: 'active' },
	],
	partyResources: { Gold: 110, Rations: 9 },
	loot: [
		{ name: 'Orc Arrows', qty: 20 },
		{ name: 'Dwarven Lantern' },
		{ name: 'Mithril Shirt', assignedTo: 'Frodo Baggins' },
	],
	advancements: [{ character: 'Aragorn', summary: 'Ranger 9', sessionNumber: 2 }],
	interludes: [
		{
			title: 'Ten days on the Greenway',
			summary: 'Ten days of rain on the Greenway. The company reaches Bree and finds the gate watched.',
			changes: [
				'[Party:Gold 120|Rations 14]',
				'[Party:Rations-3]',
				'[Clock:The Watcher Wakes 1/6]',
				'[Faction:Forces of Sauron|tier:5|standing:hostile]',
				'[Timer:Torches 6]',
			],
		},
	],
	sessionNumber: 2,
	date: '2026-10-08',
	duration: '3h10',
	players: ['Sam (Aragorn)', 'Alex (Gimli)', 'Jordan (Legolas)', 'Priya (Frodo Baggins)', 'Ren (Boromir)', 'Lee (Samwise Gamgee)'],
	scribe: 'Jordan',
	absent: ['Kit (Gandalf)'],
	mood: 'wet, tense, quiet',
	recap: 'The company left Bree by night after the gate was watched. Gandalf has not been seen since the bridge in the mountains, and the company went on without him.',
	goals: 'Find the West-gate of Moria, cross the Dimrill Dale without being tracked, and decide what to do about Gandalf.',
	hook: 'The riders of Sauron are on the road to Moria, and the company must leave the mines before the drums come closer.',
	endNotes: 'Strong session, the split worked and the rope scene was tense.',
	status: 'active',
};

/** Stored log body of Session 01 (the `## Session Log` section, bullets included). */
export const FELLOWSHIP_SESSION_01_LOG = readFileSync(`${fixtureDir}/fellowship-session-01-log.md`, 'utf8');

/** Stored log body of Session 02: interlude, session header, scenes and end block. */
export const FELLOWSHIP_SESSION_02_LOG = readFileSync(`${fixtureDir}/fellowship-session-02-log.md`, 'utf8');
