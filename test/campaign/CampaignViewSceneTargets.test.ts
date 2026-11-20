/*
 * Scene targets that no longer exist: Back keeps its history, and a branch choice aimed at a
 * missing scene logs nothing and does not navigate.
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

function makeView(log: { text: string }) {
    const plugin: any = {
        app: { vault: {} }, saveSession: async () => {}, appendToSessionLogEntries: async () => {},
        loadSessionLog: async () => log.text,
        updateSessionLog: async (_p: string, u: (b: string) => string) => { log.text = u(log.text); },
        getGroups: () => [], listCharacters: async () => [], listLocations: async () => [], listPlotItems: async () => [],
        listScenes: async () => [],
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.refreshSidebarParts = async () => {};
    view.session = { name: 'S', storyId: 'x', sessionNumber: 1, filePath: 'Sessions/S.md', partyCharacterNames: [], partyResources: {} };
    view.allScenes = [];
    return view;
}

describe('scene targets that are missing', () => {
    it('Back to a scene that no longer exists keeps the history', async () => {
        const view = makeView({ text: '' });
        view.sceneHistory = ['Gone Scene'];
        await view.navigateBack();
        expect(view.sceneHistory).toEqual(['Gone Scene']);
    });

    it('a branch choice whose target scene is missing logs nothing and does not navigate', async () => {
        const log = { text: '' };
        const view = makeView(log);
        let navigated: string | null = null;
        view.doNavigate = async (name: string) => { navigated = name; };
        const branch: any = { id: 'b1', label: 'Take the road', target: 'Missing Scene', failMode: 'continue' };
        await view.applyChoice(branch, 'success');
        expect(navigated).toBeNull();
        expect(log.text).not.toContain('Take the road');
        expect(log.text).not.toContain('Missing Scene');
    });
});
