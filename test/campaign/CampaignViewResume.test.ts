/*
 * Resuming a session from the sidebar: the Campaign tab goes straight to play without drawing the
 * session list first, draws once, and picks up in the scene the session was left in without
 * entering it again (no new log header, timeline event or encounter roll; party token stays put).
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

const scenes = [{ id: 'moria', name: 'Moria' }, { id: 'bridge', name: 'Bridge' }];

function makeView(pending: unknown = null) {
    const plugin: any = {
        app: { vault: { getAbstractFileByPath: () => null } }, settings: {},
        saveSession: async () => {}, appendToSessionLogEntries: async () => {},
        loadSessionLog: async () => '', updateSessionLog: async () => {},
        listScenes: vi.fn(async () => scenes),
        listMaps: async () => [], listLocations: async () => [],
        listSessions: vi.fn(async () => []),
        takePendingCampaignOpen: vi.fn(() => pending),
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.containerEl = { children: [null, null] };
    view.registerDomEvent = () => {};
    const calls: string[] = [];
    view.render = vi.fn(async () => { calls.push(view.session ? 'render play' : 'render session list'); });
    view.enterScene = vi.fn(async (name: string, _push: boolean, options: { render?: boolean }) => {
        calls.push(`enter ${name} render=${String(options.render)}`);
    });
    view.logSceneHeader = vi.fn(async () => {});
    view.recordSceneOnTimeline = vi.fn(async () => {});
    view.autosave = vi.fn(async () => {});
    return { view, plugin, calls };
}

const saved = () => ({
    name: 'Session 3', storyId: 'x', filePath: 'Sessions/S3.md', partyCharacterNames: [],
    currentSceneId: 'moria', currentSceneName: 'Moria', partyLocation: 'gate', activeMapId: 'dwarrowdelf',
});

describe('resuming a campaign session', () => {
    it('picks up in the saved scene without entering it again', async () => {
        const { view, calls } = makeView();
        await view.loadSession(saved());

        expect(view.currentScene?.name).toBe('Moria');
        expect(view.enterScene).not.toHaveBeenCalled();
        expect(view.logSceneHeader).not.toHaveBeenCalled();
        expect(view.recordSceneOnTimeline).not.toHaveBeenCalled();
        expect(view.autosave).not.toHaveBeenCalled();
        expect(view.session.partyLocation).toBe('gate');
        expect(view.session.activeMapId).toBe('dwarrowdelf');
        // The caller draws once; loading does not draw.
        expect(calls).toEqual([]);
    });

    it('enters the starting scene of a new session, leaving the draw to the caller', async () => {
        const { view, calls } = makeView();
        await view.loadSession(saved(), undefined, { isNew: true });
        expect(calls).toEqual(['enter Moria render=false']);
    });

    it('enters a scene it was asked to start from', async () => {
        const { view, calls } = makeView();
        await view.loadSession(saved(), scenes[1]);
        expect(calls).toEqual(['enter Bridge render=false']);
    });

    it('opens a new tab straight into play, drawing once and never the session list', async () => {
        const { view, plugin, calls } = makeView({ session: saved() });
        await view.onOpen();
        expect(plugin.takePendingCampaignOpen).toHaveBeenCalledTimes(1);
        expect(plugin.listSessions).not.toHaveBeenCalled();
        expect(calls).toEqual(['render play']);
        expect(view.currentScene?.name).toBe('Moria');
    });

    it('shows the session list when opened with nothing to resume', async () => {
        const { view, calls } = makeView(null);
        await view.onOpen();
        expect(calls).toEqual(['render session list']);
    });
});
