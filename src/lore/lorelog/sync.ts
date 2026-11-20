/*
 * Lorelog entity sync planner. Turns the ripples of a log into dated bullet lines for the
 * matching entity notes. Pure: it reads entity descriptions and returns the next descriptions.
 * It never deletes text, and a bullet already present is not written twice.
 *
 * Element to entity: N to character, L to location, F to group, Hist to event (only when the
 * tag has a `year:` value, per the spec's timeline use). Other types have no entity.
 *
 * Lorelog by Roberto Bisceglie (Loreseed Workshop), a sibling of Lonelog.
 * Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
import { elementOf, formatTag, tagYear } from './tags';
import type { Tag } from './tags';
import type { LorelogLog } from './types';

export const LORELOG_CHANGES_HEADING = '## Lorelog changes';

export type LorelogSyncKind = 'character' | 'location' | 'group' | 'event';

export interface LorelogSyncEntity {
	kind: LorelogSyncKind;
	name: string;
	description?: string;
}

export interface LorelogSyncChange {
	/** The bullet written to the entity, e.g. `- C7: [F:Guild|+wardens]`. */
	bullet: string;
	tag: string;
	cycleId?: string;
	line: number;
}

export interface LorelogSyncItem {
	/** Stable id for selection: `kind:name` in lower case. */
	id: string;
	kind: LorelogSyncKind;
	name: string;
	changes: LorelogSyncChange[];
	/** The description after the changes are written. Never shorter than the current one. */
	nextDescription: string;
}

export interface LorelogSyncPlan {
	/** Existing entities that gain bullets. Selected by default. */
	updates: LorelogSyncItem[];
	/** Elements with no matching entity. Not selected by default. */
	creates: LorelogSyncItem[];
	/** Bullets skipped because the entity already records them. */
	alreadyRecorded: number;
}

const KIND_BY_TYPE: Record<string, LorelogSyncKind | undefined> = {
	N: 'character',
	L: 'location',
	F: 'group',
	Hist: 'event',
};

function normalizeName(name: string): string {
	return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function bulletFor(cycleLabel: string, tag: Tag): string {
	return `- ${cycleLabel}: ${formatTag(tag)}`;
}

/** Appends bullets to a description, adding the changes heading once. */
export function appendLorelogBullets(description: string, bullets: string[]): string {
	if (bullets.length === 0) return description;
	const base = description.replace(/\s+$/, '');
	const hasHeading = base.split(/\r?\n/).some((line) => line.trim() === LORELOG_CHANGES_HEADING);
	const head = hasHeading ? '' : `${base.length > 0 ? '\n\n' : ''}${LORELOG_CHANGES_HEADING}`;
	return `${base}${head}\n${bullets.join('\n')}\n`;
}

/**
 * Plans the sync for one log against the entities of the active story. Ripple tags whose
 * element matches an existing entity become updates. Unmatched elements become creates.
 */
export function planEntitySync(log: LorelogLog, entities: LorelogSyncEntity[]): LorelogSyncPlan {
	const existing = new Map<string, LorelogSyncEntity>();
	for (const entity of entities) existing.set(`${entity.kind}:${normalizeName(entity.name)}`, entity);

	const items = new Map<string, LorelogSyncItem>();
	const creates = new Map<string, LorelogSyncItem>();
	let alreadyRecorded = 0;
	const seenBullets = new Set<string>();

	for (const cycle of log.cycles) {
		const cycleLabel = cycle.id ?? `line ${cycle.line}`;
		for (const ripple of cycle.ripples) {
			for (const tag of ripple.tags) {
				const element = elementOf(tag);
				if (!element) continue;
				let kind = KIND_BY_TYPE[element.type];
				if (element.type === 'Hist' && tagYear(tag) === undefined) kind = undefined;
				if (!kind) continue;
				const bullet = bulletFor(cycleLabel, tag);
				const match = existing.get(`${kind}:${normalizeName(element.name)}`);
				const id = `${kind}:${normalizeName(element.name)}`;
				const bucket = match ? items : creates;
				let item = bucket.get(id);
				if (!item) {
					const base = match?.description ?? '';
					item = { id, kind, name: match?.name ?? element.name, changes: [], nextDescription: base };
					bucket.set(id, item);
				}
				const alreadyInEntity = match ? (match.description ?? '').split(/\r?\n/).some((line) => line.trim() === bullet) : false;
				const dedupeKey = `${id}|${bullet}`;
				if (alreadyInEntity || seenBullets.has(dedupeKey)) {
					if (alreadyInEntity) alreadyRecorded++;
					continue;
				}
				seenBullets.add(dedupeKey);
				item.changes.push({ bullet, tag: formatTag(tag), cycleId: cycle.id, line: ripple.line });
			}
		}
	}

	const finish = (map: Map<string, LorelogSyncItem>): LorelogSyncItem[] => {
		const out: LorelogSyncItem[] = [];
		for (const item of map.values()) {
			if (item.changes.length === 0) continue;
			item.nextDescription = appendLorelogBullets(item.nextDescription, item.changes.map((c) => c.bullet));
			out.push(item);
		}
		return out.sort((a, b) => a.name.localeCompare(b.name));
	};

	return { updates: finish(items), creates: finish(creates), alreadyRecorded };
}
