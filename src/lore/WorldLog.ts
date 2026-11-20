/*
 * Lorelog world log notes: the `World Log.md` file in the active story folder, and the
 * entity lookups the dashboard and quick capture need. Obsidian-facing; the notation itself
 * lives in ./lorelog (pure).
 *
 * Lorelog by Roberto Bisceglie (Loreseed Workshop), a sibling of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 */
import { TFile, normalizePath } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { Character, Event, Group, Location } from '../types';
import {
	emptyLorelogCycle,
	formatBuildHeader,
	formatCycle,
	formatWorldHeader,
	parseLorelogLog,
	summarizeLorelog,
} from './lorelog';
import type { LorelogCycle, LorelogLog, LorelogSummary, LorelogSyncEntity, LorelogSyncKind } from './lorelog';

export const LORELOG_NAME = 'Lorelog';
export const WORLD_LOG_FILE_NAME = 'World Log.md';

export interface LoreEntityRef {
	kind: LorelogSyncKind;
	name: string;
	description: string;
	/** Vault path of the entity note. Groups live in settings and have none. */
	filePath?: string;
	source: Character | Location | Event | Group;
}

export interface WorldLogState {
	file: TFile;
	content: string;
	log: LorelogLog;
	summary: LorelogSummary;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Path of the active story's world log, or undefined when no story is active. */
export function worldLogPath(plugin: StorytellerSuitePlugin): string | undefined {
	if (!plugin.getActiveStory()) return undefined;
	return normalizePath(`${plugin.getStoryRootFolder()}/${WORLD_LOG_FILE_NAME}`);
}

export function findWorldLogFile(plugin: StorytellerSuitePlugin): TFile | undefined {
	const path = worldLogPath(plugin);
	if (!path) return undefined;
	const file = plugin.app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : undefined;
}

/** Creates the world log with a world header and `## Build 1`. Returns the existing file if there is one. */
export async function createWorldLog(plugin: StorytellerSuitePlugin): Promise<TFile> {
	const story = plugin.getActiveStory();
	const path = worldLogPath(plugin);
	if (!story || !path) throw new Error('No active story selected.');
	const existing = findWorldLogFile(plugin);
	if (existing) return existing;

	const folder = normalizePath(plugin.getStoryRootFolder());
	await plugin.ensureFolder(folder);
	const date = today();
	const lines = [
		...formatWorldHeader({ title: story.name, fields: { start_date: date, last_update: date } }),
		'',
		`# ${story.name}`,
		'',
		...formatBuildHeader({ number: 1, meta: { date, phase: 'Sketch' } }),
		'',
	];
	return plugin.app.vault.create(path, lines.join('\n'));
}

/** Appends `## Build N` at the end of the log, continuing the phase of the previous build. */
export async function addBuildSession(plugin: StorytellerSuitePlugin): Promise<number> {
	const file = findWorldLogFile(plugin) ?? (await createWorldLog(plugin));
	let number = 1;
	await plugin.app.vault.process(file, (content: string) => {
		const log = parseLorelogLog(content);
		number = log.builds.reduce((max, build) => Math.max(max, build.number), 0) + 1;
		const previous = log.builds[log.builds.length - 1]?.meta.phase ?? log.phases[log.phases.length - 1]?.name;
		const block = formatBuildHeader({ number, meta: { date: today(), phase: previous } }).join('\n');
		return `${content.trimEnd()}\n\n${block}\n`;
	});
	return number;
}

/** The next cycle number: one more than the highest `C#` in the log. */
export function nextCycleId(log: LorelogLog): string {
	let max = 0;
	for (const cycle of log.cycles) {
		const m = /^C(\d+)$/.exec(cycle.id ?? '');
		if (m) max = Math.max(max, Number(m[1]));
	}
	return `C${max + 1}`;
}

/**
 * Appends one cycle to the end of the log, which is the end of the current build session.
 * `build` receives the cycle id that the log assigns (`C{n}`) and returns the cycle to write.
 * Returns the id written.
 */
export async function appendCycleToWorldLog(
	plugin: StorytellerSuitePlugin,
	build: (id: string) => LorelogCycle,
): Promise<string> {
	const file = findWorldLogFile(plugin) ?? (await createWorldLog(plugin));
	let written = '';
	await plugin.app.vault.process(file, (content: string) => {
		const log = parseLorelogLog(content);
		const id = nextCycleId(log);
		written = id;
		const cycle = build(id);
		let base = content.trimEnd();
		if (log.builds.length === 0) {
			base += `\n\n${formatBuildHeader({ number: 1, meta: { date: today() } }).join('\n')}`;
		}
		return `${base}\n\n${formatCycle({ ...cycle, id }, 'digital')}\n`;
	});
	return written;
}

/** Reads and parses the world log of the active story. */
export async function loadWorldLogState(plugin: StorytellerSuitePlugin): Promise<WorldLogState | undefined> {
	const file = findWorldLogFile(plugin);
	if (!file) return undefined;
	const content = await plugin.app.vault.cachedRead(file);
	const log = parseLorelogLog(content);
	return { file, content, log, summary: summarizeLorelog(log) };
}

/** Characters, locations, events and groups of the active story, for matching and linking. */
export async function listLoreEntities(plugin: StorytellerSuitePlugin): Promise<LoreEntityRef[]> {
	const [characters, locations, events] = await Promise.all([
		plugin.listCharacters().catch(() => [] as Character[]),
		plugin.listLocations().catch(() => [] as Location[]),
		plugin.listEvents().catch(() => [] as Event[]),
	]);
	const refs: LoreEntityRef[] = [];
	for (const character of characters) {
		refs.push({ kind: 'character', name: character.name, description: character.description ?? '', filePath: character.filePath, source: character });
	}
	for (const location of locations) {
		refs.push({ kind: 'location', name: location.name, description: location.description ?? '', filePath: location.filePath, source: location });
	}
	for (const event of events) {
		refs.push({ kind: 'event', name: event.name, description: event.description ?? '', filePath: event.filePath, source: event });
	}
	for (const group of plugin.getGroups()) {
		refs.push({ kind: 'group', name: group.name, description: group.description ?? '', source: group });
	}
	return refs;
}

export function toSyncEntities(refs: LoreEntityRef[]): LorelogSyncEntity[] {
	return refs.map((ref) => ({ kind: ref.kind, name: ref.name, description: ref.description }));
}

/** Writes a new description to one entity, through the plugin's own save for its type. */
export async function saveLoreEntityDescription(
	plugin: StorytellerSuitePlugin,
	ref: LoreEntityRef,
	description: string,
): Promise<void> {
	switch (ref.kind) {
		case 'character':
			await plugin.saveCharacter({ ...(ref.source as Character), description });
			return;
		case 'location':
			await plugin.saveLocation({ ...(ref.source as Location), description });
			return;
		case 'event':
			await plugin.saveEvent({ ...(ref.source as Event), description });
			return;
		case 'group':
			await plugin.saveGroupFull({ ...(ref.source as Group), description });
			return;
	}
}

function newEntityId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Creates a new entity note or group with the given description. */
export async function createLoreEntity(
	plugin: StorytellerSuitePlugin,
	kind: LorelogSyncKind,
	name: string,
	description: string,
): Promise<void> {
	switch (kind) {
		case 'character':
			await plugin.saveCharacter({ name, description });
			return;
		case 'location':
			await plugin.saveLocation({ name, description });
			return;
		case 'event':
			await plugin.saveEvent({ name, description });
			return;
		case 'group': {
			const story = plugin.getActiveStory();
			if (!story) throw new Error('No active story selected.');
			await plugin.saveGroupFull({
				id: newEntityId(),
				storyId: story.id,
				name,
				description,
				groupType: 'faction',
				members: [],
			});
			return;
		}
	}
}

/** Opens the world log at a 1-based line, reusing an open leaf for the same file when there is one. */
export async function openWorldLogAtLine(plugin: StorytellerSuitePlugin, file: TFile, line: number): Promise<void> {
	const { workspace } = plugin.app;
	const existing = workspace.getLeavesOfType('markdown').find((leaf) => leaf.view.getViewType() === 'markdown' && (leaf.view as { file?: TFile }).file?.path === file.path);
	const leaf = existing ?? workspace.getLeaf('tab');
	await leaf.openFile(file, { active: true, eState: { line: Math.max(0, line - 1) } });
}

export type { LorelogCycle, LorelogLog, LorelogSummary };
export { emptyLorelogCycle };
