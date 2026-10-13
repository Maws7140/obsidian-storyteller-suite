/*
 * Campaign time and the campaign fork: choices move the in-world date, each scene the party
 * enters becomes a dated event on the campaign's fork, and leaving it records the end date and
 * the choices not taken.
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

function makeView(sessionExtras: Record<string, unknown> = {}) {
    const events: any[] = [];
    const plugin: any = {
        app: { vault: {} }, settings: {}, getActiveStory: () => undefined,
        saveSession: async () => {}, appendToSessionLogEntries: async () => {},
        loadSessionLog: async () => '', updateSessionLog: async () => {},
        getGroups: () => [], listCharacters: async () => [], listLocations: async () => [], listPlotItems: async () => [],
        listScenes: async () => [],
        listEvents: async () => events.map(event => ({ ...event })),
        saveEvent: vi.fn(async (event: any) => {
            const index = events.findIndex(existing => existing.id === event.id);
            if (index >= 0) events[index] = { ...event }; else events.push({ ...event });
        }),
        addEventToFork: vi.fn(async () => {}),
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.refreshSidebarParts = async () => {};
    view.session = {
        id: 's2', name: 'Session 2', storyId: 'x', filePath: 'Sessions/S2.md',
        partyCharacterNames: ['Aragorn', 'Gimli'], partyItems: [], flags: [],
        campaignForkId: 'f1', campaignForkName: 'Fellowship campaign',
        inWorldDate: 'January 13, 3019 CE', timeMoves: true,
        ...sessionExtras,
    };
    view.allScenes = [{ name: 'Moria' }, { name: 'Bridge' }];
    view.currentScene = { name: 'Moria', linkedLocations: ['Moria'], playDuration: '1 day' };
    view.branches = [
        { id: 'a', label: 'Hold the bridge', target: 'Bridge', advances: '2 hours' },
        { id: 'b', label: 'Run for the gate', target: 'Bridge' },
        { id: 'c', label: 'Secret way', target: 'Bridge', hidden: true },
    ];
    view.encounterTable = null;
    const logged: string[] = [];
    view.autosave = async (entries?: string | string[]) => { if (entries) logged.push(...(Array.isArray(entries) ? entries : [entries])); };
    view.doNavigate = async (name: string) => {
        view.currentScene = { name, linkedLocations: [name] };
        await view.recordSceneOnTimeline(view.currentScene);
    };
    return { view, plugin, events, logged };
}

describe('campaign time', () => {
    it('moves the date by the choice, or else by the scene length, and logs it', async () => {
        const { view, logged } = makeView();
        await view.applyChoice(view.branches[0], 'success');
        expect(view.session.inWorldDate).toBe('January 13, 3019 CE 02:00');
        expect(logged).toContain('(note: Time passes: 2 hours. Now January 13, 3019 CE 02:00)');
    });

    it('uses the scene length when the choice has no time of its own', async () => {
        const { view } = makeView();
        await view.applyChoice(view.branches[1], 'success');
        expect(view.session.inWorldDate).toBe('January 14, 3019 CE');
    });

    it('leaves the date alone when the campaign\'s time does not move', async () => {
        const { view } = makeView({ timeMoves: undefined });
        await view.applyChoice(view.branches[1], 'success');
        expect(view.session.inWorldDate).toBe('January 13, 3019 CE');
    });
});

describe('recording scenes on the campaign fork', () => {
    it('opens a dated event for the scene entered and closes the one left, with the paths not taken', async () => {
        const { view, plugin, events } = makeView();
        await view.recordSceneOnTimeline(view.currentScene);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            name: 'Session 2: Moria',
            dateTime: 'January 13, 3019 CE',
            location: 'Moria',
            characters: ['Aragorn', 'Gimli'],
            sessionId: 's2',
            branches: ['Fellowship campaign'],
        });
        expect(plugin.addEventToFork).toHaveBeenCalledWith('f1', events[0].id, { quiet: true });

        await view.applyChoice(view.branches[1], 'success');
        const moria = events.find(event => event.name === 'Session 2: Moria');
        expect(moria.dateTime).toBe('January 13, 3019 CE to January 14, 3019 CE');
        expect(moria.pathsNotTaken).toEqual(['Hold the bridge']);
        const bridge = events.find(event => event.name === 'Session 2: Bridge');
        expect(bridge.dateTime).toBe('January 14, 3019 CE');
        expect(view.session.sceneEventId).toBe(bridge.id);
    });

    it('does not record the same scene twice when a session resumes in it', async () => {
        const { view, events } = makeView();
        await view.recordSceneOnTimeline(view.currentScene);
        await view.recordSceneOnTimeline(view.currentScene);
        expect(events).toHaveLength(1);
    });

    it('names a second visit apart from the first', async () => {
        const { view, events } = makeView();
        await view.recordSceneOnTimeline({ name: 'Moria' });
        await view.recordSceneOnTimeline({ name: 'Bridge' });
        await view.recordSceneOnTimeline({ name: 'Moria' });
        expect(events.map(event => event.name)).toEqual(['Session 2: Moria', 'Session 2: Bridge', 'Session 2: Moria (2)']);
    });

    it('records nothing for a campaign that is not on the timeline', async () => {
        const { view, events } = makeView({ campaignForkId: undefined, campaignForkName: undefined });
        await view.recordSceneOnTimeline(view.currentScene);
        expect(events).toHaveLength(0);
    });
});

describe('triggered events', () => {
    it('dates an undated event now and puts it on the campaign fork; a dated one keeps its date', async () => {
        const { view, plugin, events } = makeView();
        events.push({ id: 'e1', name: 'The Balrog awakens' }, { id: 'e2', name: 'Fall of Durin', dateTime: '1980' });
        await view.applyTriggeredEvent('The Balrog awakens');
        await view.applyTriggeredEvent('Fall of Durin');
        expect(events[0]).toMatchObject({ dateTime: 'January 13, 3019 CE', branches: ['Fellowship campaign'] });
        expect(events[1].dateTime).toBe('1980');
        expect(events[1].branches).toBeUndefined();
        expect(plugin.addEventToFork).toHaveBeenCalledTimes(1);
    });
});
