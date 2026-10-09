/*
 * Party item "Use": a double tap before the first use finishes must apply the item once and
 * write one "Used" line.
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

function makeView(store: { log: string; appended: string[] }) {
    const plugin: any = {
        app: { vault: {} },
        saveSession: async () => {},
        appendToSessionLogEntries: async (_p: string, entries: string[]) => {
            store.appended.push(...entries);
            store.log += entries.map(e => `- ${e}\n`).join('');
        },
        loadSessionLog: async () => store.log,
        updateSessionLog: async (_p: string, update: (b: string) => string) => { store.log = update(store.log); },
        listPlotItems: async () => [{ name: 'Lantern', grantsFlag: 'Lit' }],
        listCharacters: async () => [],
        listScenes: async () => [],
        listLocations: async () => [],
        getGroups: () => [],
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.refreshSidebarParts = async () => {};
    view.session = { name: 'S', storyId: 'x', filePath: 'Sessions/S.md', partyCharacterNames: ['Frodo'], partyItems: ['Lantern'], flags: [] };
    return view;
}

describe('item use double tap', () => {
    it('two quick Use taps apply the item once and write one Used line', async () => {
        const store = { log: '', appended: [] as string[] };
        const view = makeView(store);
        const session = view.session;
        await Promise.all([view.useItem('Lantern', session, () => {}), view.useItem('Lantern', session, () => {})]);
        expect(store.appended.filter(e => e.startsWith('Used')).length).toBe(1);
    });
});
