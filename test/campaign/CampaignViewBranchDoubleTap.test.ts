/*
 * Branch cards and scene jumps: a double tap before the first action finishes must apply the
 * outcome once, write one scene header and push one history entry.
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

function makeView(store: { log: string; appended?: string[] }, extra: Record<string, unknown> = {}) {
    const plugin: any = {
        app: { vault: {} },
        saveSession: async () => {},
        appendToSessionLogEntries: async (_p: string, entries: string[]) => {
            store.appended?.push(...entries);
            store.log += entries.map(e => `- ${e}\n`).join('');
        },
        loadSessionLog: async () => store.log,
        updateSessionLog: async (_p: string, update: (b: string) => string) => { store.log = update(store.log); },
        listCharacters: async () => [],
        listPlotItems: async () => [],
        listScenes: async () => [],
        listLocations: async () => [],
        getGroups: () => [],
        ...extra,
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.loadCurrentScene = async () => {};
    view.loadSceneLocation = async () => {};
    view.syncActiveCampaignBoardForScene = async () => {};
    view.session = { name: 'S', storyId: 'x', filePath: 'Sessions/S.md', partyCharacterNames: ['Frodo'], partyItems: [], groupStandings: [] };
    return view;
}

describe('branch card double tap', () => {
    it('two quick taps on one branch apply its outcome once', async () => {
        const store = { log: '', appended: [] as string[] };
        const view = makeView(store);
        const branch: any = { label: 'Take the lantern', grantsItem: 'Lantern', changesGroupStanding: 'Rangers', groupStandingDelta: 1, failMode: 'continue' };
        await Promise.all([view.executeChoice(branch, 'success'), view.executeChoice(branch, 'success')]);
        expect(view.session.partyItems).toEqual(['Lantern']);
        expect(view.session.groupStandings).toEqual([expect.objectContaining({ value: 1 })]);
        expect(store.appended.filter(e => e.startsWith('Chose')).length).toBe(1);
    });
});

describe('scene jump double tap', () => {
    const scenes = [{ name: 'A', id: 'a' }, { name: 'B', id: 'b' }];

    it('writes one scene header for one jump', async () => {
        const store = { log: '' };
        const view = makeView(store);
        view.allScenes = scenes.map(s => ({ ...s }));
        view.currentScene = view.allScenes[0];
        await Promise.all([view.doNavigate('B', true), view.doNavigate('B', true)]);
        const headers = store.log.split('\n').filter(l => l.startsWith('###'));
        expect(headers.length).toBe(1);
    });

    it('pushes the previous scene onto history once', async () => {
        const store = { log: '' };
        const view = makeView(store);
        view.allScenes = scenes.map(s => ({ ...s }));
        view.currentScene = view.allScenes[0];
        await Promise.all([view.doNavigate('B', true), view.doNavigate('B', true)]);
        expect(view.sceneHistory).toEqual(['A']);
        expect(view.currentScene.name).toBe('B');
    });
});
