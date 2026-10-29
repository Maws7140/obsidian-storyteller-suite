/*
 * Encounters in play: a roll applies the row's effects, logs a tbl: line and sets the
 * encounter flag; a choice can roll the table and a row with a scene overrides its target.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => (prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined),
        has: () => true,
    });
});

const { CampaignView } = await import('../../src/views/CampaignView');
(globalThis as any).window = globalThis;

const TABLE = {
    dice: 'd6',
    trigger: 'manual',
    rows: [
        { min: 1, max: 3, label: 'Quiet night', target: 'continue' },
        { min: 4, max: 5, id: 'wolves', label: 'Wolves circle the camp', target: 'continue', setsFlag: 'met-wolves', grantsItem: 'Wolf Pelt' },
        { min: 6, max: 6, label: 'Ambush', target: 'Wolf Attack', tags: '[Clock:Hunted +1]' },
    ],
};

function makeView() {
    const plugin: any = {
        app: { vault: {} }, saveSession: async () => {}, appendToSessionLogEntries: async () => {},
        loadSessionLog: async () => '', updateSessionLog: async () => {},
        getGroups: () => [], listCharacters: async () => [], listLocations: async () => [], listPlotItems: async () => [],
        listScenes: async () => [], listEvents: async () => [],
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.refreshSidebarParts = async () => {};
    view.session = {
        name: 'S', storyId: 'x', sessionNumber: 1, filePath: 'Sessions/S.md',
        partyCharacterNames: [], partyItems: [], flags: ['encounter:quiet-night'],
        partyResources: {}, clocks: [{ id: 'hunted', name: 'Hunted', kind: 'clock', current: 0, segments: 4 }],
    };
    view.allScenes = [{ name: 'Camp' }, { name: 'Morning' }, { name: 'Wolf Attack' }];
    view.currentScene = { name: 'Camp' };
    view.encounterTable = structuredClone(TABLE);
    const logged: string[] = [];
    view.autosave = async (entries?: string | string[]) => {
        if (entries) logged.push(...(Array.isArray(entries) ? entries : [entries]));
    };
    const navigated: string[] = [];
    view.doNavigate = async (name: string) => { navigated.push(name); };
    return { view, logged, navigated };
}

describe('manual encounter rolls', () => {
    it('apply the row, replace the encounter flag and log a tbl: line', async () => {
        const { view, logged, navigated } = makeView();
        await view.rollManualEncounter(4);
        expect(view.session.flags).toEqual(['encounter:wolves', 'met-wolves']);
        expect(view.session.partyItems).toEqual(['Wolf Pelt']);
        expect(logged[0]).toMatch(/^tbl: d6=4 \(encounter\) -> Wolves circle the camp$/);
        expect(navigated).toEqual([]);
        expect(view.lastEncounter.row.label).toBe('Wolves circle the camp');
    });

    it('apply the row Partylog tags to the session', async () => {
        const { view, logged } = makeView();
        await view.rollManualEncounter(6);
        expect(view.session.clocks[0].current).toBe(1);
        expect(logged[0]).toContain('-> Ambush -> Wolf Attack');
        expect(logged[0]).toContain('[Clock:Hunted +1]');
    });

    it('do nothing for a table with no rows', async () => {
        const { view, logged } = makeView();
        view.encounterTable = { dice: 'd6', trigger: 'manual', rows: [] };
        await view.rollManualEncounter(3);
        expect(logged).toEqual([]);
        expect(view.session.flags).toEqual(['encounter:quiet-night']);
    });
});

describe('choices that roll the encounter table', () => {
    const makeCamp = { id: 'c', label: 'Make camp', target: 'Morning', rollsEncounter: true };

    it('go to the row scene instead of the choice target', async () => {
        const { view, logged, navigated } = makeView();
        const original = view.rollSceneEncounter.bind(view);
        view.rollSceneEncounter = (source: string) => original(source, 6);
        await view.applyChoice(makeCamp, 'success');
        expect(navigated).toEqual(['Wolf Attack']);
        expect(logged[0]).toBe('Chose *Make camp* -> *Morning*');
        expect(logged.some((line: string) => line.startsWith('tbl: d6=6 (from choice) -> Ambush'))).toBe(true);
    });

    it('keep the choice target when the row continues', async () => {
        const { view, navigated } = makeView();
        const original = view.rollSceneEncounter.bind(view);
        view.rollSceneEncounter = (source: string) => original(source, 2);
        await view.applyChoice(makeCamp, 'success');
        expect(navigated).toEqual(['Morning']);
        expect(view.session.flags).toContain('encounter:quiet-night');
    });

    it('do not roll when the choice fails', async () => {
        const { view, logged } = makeView();
        await view.applyChoice({ ...makeCamp, failMode: 'continue' }, 'fail');
        expect(logged.some((line: string) => line.startsWith('tbl:'))).toBe(false);
    });
});

describe('a failed choice that loops', () => {
    it('applies none of its outcomes', async () => {
        const { view, logged } = makeView();
        await view.applyChoice({ id: 'p', label: 'Pick the lock', failMode: 'loop', grantsItem: 'Key', setsFlag: 'opened' }, 'fail');
        expect(view.session.partyItems).toEqual([]);
        expect(view.session.flags).toEqual(['encounter:quiet-night']);
        expect(logged).toEqual(['*Pick the lock* - failed (loop retry)']);
    });
});
