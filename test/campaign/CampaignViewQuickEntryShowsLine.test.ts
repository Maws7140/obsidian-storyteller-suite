/*
 * Quick entry Add: once the line is in the note, the log on screen is refreshed to show it, even
 * when applying the line's tags fails. A session with no note yet gets one before the write.
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

function makeView(store: { log: string }, session: Record<string, unknown>) {
    const plugin: any = {
        app: { vault: {} },
        saveSession: vi.fn(async (s: any) => { if (!s.filePath) s.filePath = `Sessions/${s.name}.md`; }),
        appendToSessionLogEntries: async () => {},
        loadSessionLog: async () => store.log,
        updateSessionLog: vi.fn(async (_p: string, update: (b: string) => string) => { store.log = update(store.log); }),
        getGroups: () => [],
        listCharacters: async () => [],
        listLocations: async () => [],
        listPlotItems: async () => [],
        listScenes: async () => [],
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.refreshSidebarParts = vi.fn(async () => {});
    view.focusQuickEntry = () => {};
    view.session = { name: 'S', storyId: 'x', sessionNumber: 1, partyCharacterNames: ['Frodo'], ...session };
    return { view, plugin };
}

describe('quick entry Add shows the line', () => {
    it('refreshes the log after writing a plain line', async () => {
        const store = { log: '- Session closed.' };
        const { view } = makeView(store, { filePath: 'Sessions/S.md' });
        view.quick.mode = 'note';
        view.quick.noteKind = 'note';
        view.quick.draft = 'The bridge holds';
        await view.submitQuickEntry();
        expect(store.log).toContain('The bridge holds');
        expect(view.refreshSidebarParts).toHaveBeenCalledWith(['log']);
    });

    it('still refreshes the log when applying the tags fails', async () => {
        const store = { log: '' };
        const { view, plugin } = makeView(store, { filePath: 'Sessions/S.md' });
        plugin.getGroups = () => { throw new Error('groups not loaded'); };
        view.quick.draft = 'Pays the toll [Party:Gold-10]';
        await view.submitQuickEntry();
        expect(store.log).toContain('Pays the toll');
        expect(view.refreshSidebarParts).toHaveBeenCalledWith(['log']);
    });

    it('creates the note of a session that was never saved, then writes the line into it', async () => {
        const store = { log: '' };
        const { view, plugin } = makeView(store, {});
        view.quick.draft = 'Strides arrives';
        await view.submitQuickEntry();
        expect(plugin.saveSession).toHaveBeenCalled();
        expect(plugin.updateSessionLog).toHaveBeenCalledWith('Sessions/S.md', expect.any(Function));
        expect(store.log).toContain('Strides arrives');
    });
});
