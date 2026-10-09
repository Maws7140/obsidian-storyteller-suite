/*
 * Switching sessions while an autosave is still debounced: the pending edit belongs to the session
 * it was made in, so it must be written to that session's note and never to the one opened next.
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

describe('autosave pending when the session is switched', () => {
    it('writes the pending edit to the session it was made in', async () => {
        const saved: Array<{ name: string; filePath?: string }> = [];
        const appended: Array<{ path: string; entries: string[] }> = [];
        const plugin: any = {
            app: { vault: {} },
            saveSession: async (s: any) => { saved.push({ name: s.name, filePath: s.filePath }); },
            appendToSessionLogEntries: async (path: string, entries: string[]) => { appended.push({ path, entries }); },
            loadSessionLog: async () => '',
            updateSessionLog: async () => {},
            listScenes: async () => [],
        };
        const view: any = new (CampaignView as any)({}, plugin);
        view.render = async () => {};
        view.session = { name: 'Session 01', storyId: 'x', filePath: 'Sessions/Session 01.md', partyCharacterNames: [] };

        // Edit in Session 01, then open Session 02 before the debounce fires.
        const pending = view.autosave('Frodo rests at the inn');
        await view.loadSession({ name: 'Session 02', storyId: 'x', filePath: 'Sessions/Session 02.md', partyCharacterNames: [] });
        await pending;

        expect(appended).toEqual([{ path: 'Sessions/Session 01.md', entries: ['Frodo rests at the inn'] }]);
        expect(saved.map(s => s.name)).toEqual(['Session 01']);
        expect(view.session.name).toBe('Session 02');
    });
});
