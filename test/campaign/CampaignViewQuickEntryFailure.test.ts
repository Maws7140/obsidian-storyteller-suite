/*
 * Quick entry: when the line cannot be saved, the typed text comes back for a retry, and the
 * party tags are applied once, by the attempt that finally writes the line.
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

function makeView(store: { log: string; failLogWrites: number; failSessionSaves: number }) {
    const plugin: any = {
        app: { vault: {} },
        saveSession: async () => {
            if (store.failSessionSaves > 0) { store.failSessionSaves--; throw new Error('File already exists'); }
        },
        appendToSessionLogEntries: async () => {},
        loadSessionLog: async () => store.log,
        updateSessionLog: async (_p: string, update: (b: string) => string) => {
            if (store.failLogWrites > 0) { store.failLogWrites--; throw new Error('disk full'); }
            store.log = update(store.log);
        },
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

const LINE = 'Pays the toll [Party:Gold-10]';

describe('quick entry failure', () => {
    it('a failed log write restores the typed line and does not apply its tags', async () => {
        const store = { log: '', failLogWrites: 1, failSessionSaves: 0 };
        const view = makeView(store);
        view.quick.draft = LINE;
        await expect(view.submitQuickEntry()).rejects.toThrow('disk full');
        expect(view.quick.draft).toBe(LINE);
        expect(view.session.partyResources.Gold).toBe(110);
        expect(store.log).toBe('');
    });

    it('a failed log write then a successful retry decreases Gold once and writes the line once', async () => {
        const store = { log: '', failLogWrites: 1, failSessionSaves: 0 };
        const view = makeView(store);
        view.quick.draft = LINE;
        await expect(view.submitQuickEntry()).rejects.toThrow('disk full');
        await view.submitQuickEntry();
        expect(view.session.partyResources.Gold).toBe(100);
        expect(view.quick.draft).toBe('');
        expect(store.log.split('Pays the toll').length - 1).toBe(1);
    });

    it('a failed session save restores the typed line for retry', async () => {
        const store = { log: '', failLogWrites: 0, failSessionSaves: 1 };
        const view = makeView(store);
        view.quick.draft = LINE;
        await expect(view.submitQuickEntry()).rejects.toThrow('File already exists');
        expect(view.quick.draft).toBe(LINE);
        expect(view.session.partyResources.Gold).toBe(110);
        expect(store.log).toBe('');
    });

    it('after a failed save, a retry decreases Gold once and writes the line once', async () => {
        const store = { log: '', failLogWrites: 0, failSessionSaves: 1 };
        const view = makeView(store);
        view.quick.draft = LINE;
        await expect(view.submitQuickEntry()).rejects.toThrow('File already exists');
        await view.submitQuickEntry();
        expect(view.session.partyResources.Gold).toBe(100);
        expect(store.log.split('Pays the toll').length - 1).toBe(1);
    });
});
