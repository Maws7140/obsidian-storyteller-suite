import { describe, expect, it } from 'vitest';
import { buildImportPlan, sessionLogBodyOf, withSessionLogBody } from '../../src/campaign/PartylogImport';
import type { ImportExistingData, ImportPlanItem } from '../../src/campaign/PartylogImport';

let counter = 0;
const createId = (prefix: string): string => `${prefix}-rerun-${++counter}`;

const LOG = '## Session 1\n\n### S1 *Hall*\n@(Mira) Speak\n';

function emptyExisting(overrides: Partial<ImportExistingData> = {}): ImportExistingData {
	return { storyId: 'story-1', characters: [], locations: [], groups: [], items: [], sessionNames: [], ...overrides };
}

function sessionItem(items: ImportPlanItem[]): ImportPlanItem {
	const item = items.find((candidate) => candidate.kind === 'session');
	if (!item) throw new Error('no session item');
	return item;
}

/** Stores a session note the way the import does, then reads its log body back. */
function storedLogBody(item: ImportPlanItem): string {
	const note = withSessionLogBody('---\nname: Session 1\n---\n\n# Session 1\n', (item.payload as { planned: { body: string } }).planned.body);
	const body = sessionLogBodyOf(note);
	if (body === undefined) throw new Error('no log section');
	return body;
}

describe('re-importing a session log', () => {
	it('round-trips the session log body through the session note', () => {
		const first = buildImportPlan(LOG, emptyExisting(), { createId });
		const body = (sessionItem(first.items).payload as { planned: { body: string } }).planned.body;
		expect(sessionLogBodyOf(withSessionLogBody('# Session 1\n', body))).toBe(body.trim());
	});

	it('a first import of a log is selected', () => {
		const plan = buildImportPlan(LOG, emptyExisting(), { createId });
		expect(sessionItem(plan.items).selected).toBe(true);
	});

	it('a log whose session is already in the story is not selected again', () => {
		const first = buildImportPlan(LOG, emptyExisting(), { createId });
		const existing = emptyExisting({
			sessionNames: ['Session 1'],
			sessionLogBodies: [storedLogBody(sessionItem(first.items))],
		});

		const second = buildImportPlan(LOG, existing, { createId });

		const item = sessionItem(second.items);
		expect(item.selected).toBe(false);
		expect(item.detail).toMatch(/already imported/i);
	});

	it('a session with the same number but a different log is still selected', () => {
		const first = buildImportPlan(LOG, emptyExisting(), { createId });
		const existing = emptyExisting({
			sessionNames: ['Session 1'],
			sessionLogBodies: ['some other session text'],
		});

		const second = buildImportPlan(LOG, existing, { createId });

		expect(sessionItem(second.items).selected).toBe(true);
		expect(first.items.length).toBeGreaterThan(0);
	});
});
