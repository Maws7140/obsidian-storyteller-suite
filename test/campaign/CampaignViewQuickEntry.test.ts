/*
 * Quick entry: a second Add (double tap or held Enter) before the first submit finishes must not
 * write the line again or apply its tags again.
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

function makeView(store: { log: string }) {
    const plugin: any = {
        app: { vault: {} },
        saveSession: async () => {},
        appendToSessionLogEntries: async () => {},
        loadSessionLog: async () => store.log,
        updateSessionLog: async (_p: string, update: (b: string) => string) => { store.log = update(store.log); },
        getGroups: () => [],
        listCharacters: async () => [],
        listLocations: async () => [],
        listPlotItems: async () => [],
        listScenes: async () => [],
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.refreshSidebarParts = async () => {};
    view.session = {
        name: 'S', storyId: 'x', sessionNumber: 1, filePath: 'Sessions/S.md',
        partyCharacterNames: ['Frodo'], partyResources: { Gold: 110 },
    };
    return view;
}

describe('quick entry double submit', () => {
    it('a second Add while the first is saving applies the tags and writes the line once', async () => {
        const store = { log: '' };
        const view = makeView(store);
        view.quick.draft = 'Pays the toll [Party:Gold-10]';
        await Promise.all([view.submitQuickEntry(), view.submitQuickEntry()]);
        expect(view.session.partyResources.Gold).toBe(100);
        expect(store.log.split('Pays the toll').length - 1).toBe(1);
    });

    it('a second Add with the same draft after the first returns does not write it again', async () => {
        const store = { log: '' };
        const view = makeView(store);
        view.quick.draft = 'Pays the toll [Party:Gold-10]';
        await view.submitQuickEntry();
        view.quick.draft = 'Pays the toll [Party:Gold-10]';
        await view.submitQuickEntry();
        expect(store.log.split('Pays the toll').length - 1).toBe(2);
        expect(view.session.partyResources.Gold).toBe(90);
    });
});
