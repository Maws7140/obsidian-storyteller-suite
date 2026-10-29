import { describe, expect, it, vi } from 'vitest';
import { applyImportPlan, buildImportPlan } from '../../src/campaign/PartylogImport';
import type { ImportExistingData, ImportPorts } from '../../src/campaign/PartylogImport';
import type { CampaignSession, Character, Group, Location, PlotItem } from '../../src/types';

let counter = 0;
const createId = (prefix: string): string => `${prefix}-apply-${++counter}`;

const emptyExisting: ImportExistingData = {
	storyId: 'story-1',
	characters: [],
	locations: [],
	groups: [],
	items: [],
	sessionNames: [],
};

const LOG = '## Session 2\n=> [Faction:City Watch|tier:2|standing:neutral->suspicious]';

/** Ports backed by an in-memory list of groups, so a group created by one apply is visible to the next. */
function groupPorts(overrides: Partial<ImportPorts> = {}) {
	const groups: Group[] = [];
	const ports: ImportPorts = {
		saveCharacter: vi.fn(async (_character: Character) => {}),
		saveLocation: vi.fn(async (_location: Location) => {}),
		savePlotItem: vi.fn(async (_item: PlotItem) => {}),
		createGroup: vi.fn(async (name: string) => {
			const group = { id: `group-${groups.length + 1}`, storyId: 'story-1', name, members: [] } as Group;
			groups.push(group);
			return group;
		}),
		findGroupByName: vi.fn(async (name: string) => groups.find((group) => group.name.toLowerCase() === name.toLowerCase())),
		saveGroup: vi.fn(async (_group: Group) => {}),
		saveSession: vi.fn(async (_session: CampaignSession) => {}),
		writeSessionLog: vi.fn(async (_session: CampaignSession, _body: string) => {}),
		...overrides,
	};
	return { ports, groups };
}

describe('applyImportPlan repeated and partial runs', () => {
	it('applying the same plan twice does not create a second copy of a new faction', async () => {
		const plan = buildImportPlan(LOG, emptyExisting, { createId });
		const selected = new Set(plan.items.map((item) => item.id));
		const { ports, groups } = groupPorts();

		await applyImportPlan(plan, selected, ports);
		await applyImportPlan(plan, selected, ports);

		expect(ports.createGroup).toHaveBeenCalledTimes(1);
		expect(groups.filter((group) => group.name === 'City Watch')).toHaveLength(1);
	});

	it('reports the items that succeeded, and a retry does not recreate the faction', async () => {
		const plan = buildImportPlan(LOG, emptyExisting, { createId });
		const groupItem = plan.items.find((item) => item.kind === 'group')!;
		const sessionItem = plan.items.find((item) => item.kind === 'session')!;
		const { ports } = groupPorts({
			saveSession: vi.fn(async () => { throw new Error('disk full'); }),
		});

		const first = await applyImportPlan(plan, new Set(plan.items.map((item) => item.id)), ports);
		expect(first.errors).toEqual([`${sessionItem.name}: disk full`]);
		expect(first.succeeded).toContain(groupItem.id);
		expect(first.succeeded).not.toContain(sessionItem.id);

		// Retry only what failed, as the modal does after a partial failure
		vi.mocked(ports.saveSession).mockResolvedValueOnce(undefined);
		const retry = await applyImportPlan(plan, new Set([sessionItem.id]), ports);
		expect(retry.errors).toEqual([]);
		expect(retry.sessions).toBe(1);
		expect(ports.createGroup).toHaveBeenCalledTimes(1);
	});
});
