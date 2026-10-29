/*
 * Switching session clears unsubmitted quick entry text and per-session UI state, and a submit
 * still in flight writes its line to the session it was made in.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => {
            if (prop === 'setIcon') return () => {};
            return prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined;
        },
        has: () => true,
    });
});

const { CampaignView } = await import('../../src/views/CampaignView');
(globalThis as any).window = globalThis;

function makeView(logs: Record<string, string>) {
    const plugin: any = {
        app: { vault: {} }, saveSession: async () => {}, appendToSessionLogEntries: async () => {},
        loadSessionLog: async (p: string) => logs[p],
        updateSessionLog: async (p: string, u: (b: string) => string) => { logs[p] = u(logs[p]); },
        getGroups: () => [], listCharacters: async () => [], listLocations: async () => [], listPlotItems: async () => [], listScenes: async () => [],
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.refreshSidebarParts = async () => {};
    return view;
}
const A = { name: 'A', storyId: 'x', sessionNumber: 1, filePath: 'Sessions/A.md', partyCharacterNames: ['Frodo'], partyResources: { Gold: 110 } };
const B = { name: 'B', storyId: 'x', sessionNumber: 2, filePath: 'Sessions/B.md', partyCharacterNames: ['Sam'], partyResources: { Gold: 50 } };

describe('draft across sessions', () => {
    it('a line typed for session A is not submitted into session B', async () => {
        const logs: Record<string, string> = { 'Sessions/A.md': '', 'Sessions/B.md': '' };
        const view = makeView(logs);
        await view.loadSession(A);
        view.quick.draft = 'Pays the toll [Party:Gold-10]';
        view.partyAmountDrafts.set('Gold', '5');
        view.quickNpcs.push('Gollum');
        view.quick.actors = ['Frodo'];
        await view.loadSession(B);
        expect(view.quick.draft).toBe('');
        expect(view.quick.actors).toEqual([]);
        expect(view.partyAmountDrafts.size).toBe(0);
        expect(view.quickNpcs).toEqual([]);
        await view.submitQuickEntry();
        expect(logs['Sessions/B.md']).toBe('');
        expect(view.session.partyResources.Gold).toBe(50);
    });

    it('a quick submit in flight when the user resumes another session is written to the session it was made in', async () => {
        const logs: Record<string, string> = { 'Sessions/A.md': '', 'Sessions/B.md': '' };
        const view = makeView(logs);
        await view.loadSession(A);
        view.quick.draft = 'Found a map';
        const sub = view.submitQuickEntry();
        await new Promise(r => setTimeout(r, 20));
        const load = view.loadSession(B);
        await Promise.all([sub, load]);
        expect(logs['Sessions/A.md']).toContain('Found a map');
        expect(logs['Sessions/B.md']).toBe('');
    });
});
