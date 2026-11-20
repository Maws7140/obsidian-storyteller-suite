/*
 * Autosave: entries kept after a failed save stay with the session they were made in. They are
 * retried against that file only, never written into whichever session is open later.
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

describe('retained entries after a failed flush', () => {
    function makeView(logs: Record<string, string>, failNext: { value: boolean }) {
        const plugin: any = {
            app: { vault: {} },
            saveSession: async () => { if (failNext.value) { failNext.value = false; throw new Error('boom'); } },
            appendToSessionLogEntries: async (p: string, entries: string[]) => { logs[p] += entries.map(e => `- ${e}\n`).join(''); },
            loadSessionLog: async (p: string) => logs[p],
            updateSessionLog: async (p: string, u: (b: string) => string) => { logs[p] = u(logs[p]); },
            getGroups: () => [], listCharacters: async () => [], listLocations: async () => [], listPlotItems: async () => [], listScenes: async () => [],
        };
        const view: any = new (CampaignView as any)({}, plugin);
        view.render = async () => {};
        view.refreshSidebarParts = async () => {};
        view.notifySaveFailure = () => {};
        return view;
    }
    const A = { name: 'A', storyId: 'x', sessionNumber: 1, filePath: 'Sessions/A.md', partyCharacterNames: [], partyResources: {} };
    const B = { name: 'B', storyId: 'x', sessionNumber: 2, filePath: 'Sessions/B.md', partyCharacterNames: [], partyResources: {} };

    it('entries that failed to save stay with session A and are not written into session B', async () => {
        const logs: Record<string, string> = { 'Sessions/A.md': '', 'Sessions/B.md': '' };
        const failNext = { value: true };
        const view = makeView(logs, failNext);
        await view.loadSession(A);
        await view.autosave('Session A line').catch(() => {});
        await view.loadSession(B);
        await view.autosave('Session B line');
        expect(logs['Sessions/B.md']).toContain('Session B line');
        expect(logs['Sessions/B.md']).not.toContain('Session A line');
        expect(logs['Sessions/A.md']).toBe('');
    });

    it('the retained entries are written to session A on the next flush for A', async () => {
        const logs: Record<string, string> = { 'Sessions/A.md': '', 'Sessions/B.md': '' };
        const failNext = { value: true };
        const view = makeView(logs, failNext);
        await view.loadSession(A);
        await view.autosave('Session A line').catch(() => {});
        await view.loadSession(B);
        await view.loadSession(A);
        await view.autosave('Session A again');
        expect(logs['Sessions/A.md']).toContain('Session A line');
        expect(logs['Sessions/A.md']).toContain('Session A again');
        expect(logs['Sessions/B.md']).toBe('');
    });
});
