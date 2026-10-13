/*
 * The player screen snapshot: only seen places, choices only while a vote is open,
 * paths into the fog for unseen places, shared clocks only, and pins flipped to top-left.
 */
import { describe, expect, it, vi } from 'vitest';
import { PlayerScreenBus } from '../../src/campaign/PlayerPush';

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => (prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined),
        has: () => true,
    });
});

const { CampaignView, boardPinPercent } = await import('../../src/views/CampaignView');

const loc = (name: string, lat: number, lng: number) => ({
    location: { id: name, name, mapBindings: [] },
    binding: { mapId: 'm', coordinates: [lat, lng] as [number, number] },
    scenes: [{ name: `At ${name}`, linkedLocations: [name] }],
});

function makeView() {
    const bus = new PlayerScreenBus();
    const plugin: any = { app: {}, playerScreen: bus };
    const view: any = new (CampaignView as any)({}, plugin);
    view.autosave = async () => {};
    const here = loc('Gate', 500, 500);
    const seen = loc('Bridge', 500, 800);
    const unseen = loc('Chamber', 100, 100);
    view.boardLocations = [here, seen, unseen];
    view.boardInfo = { map: { name: 'Board' }, imageUrl: 'img.png' };
    view.boardSizeCache.set('img.png', { width: 1000, height: 1000 });
    view.locationData = here.location;
    view.allScenes = [...here.scenes, ...seen.scenes, ...unseen.scenes];
    view.session = {
        name: 'S', partyCharacterNames: ['Mira'], revealedLocations: ['Bridge'],
        partyState: [{ characterId: 'Mira', characterName: 'Mira', currentHp: 5, maxHp: 10, conditions: ['Prone'] }],
        clocks: [{ id: 'a', name: 'Open', current: 1, segments: 4, shown: true }, { id: 'b', name: 'Secret', current: 2, segments: 4 }],
        flags: [],
    };
    view.branches = [
        { label: 'Cross', target: 'At Bridge' },
        { label: 'Delve', target: 'At Chamber' },
        { label: 'Locked', target: 'At Bridge', requiresFlag: 'never' },
        { label: 'Secret way', target: 'At Chamber', hidden: true },
    ];
    return { view, bus };
}

describe('player screen snapshot', () => {
    it('shows seen places only and marks where the party is', async () => {
        const { view } = makeView();
        const snapshot = await view.buildPlayerView();
        expect(snapshot.board.places.map((p: { name: string }) => p.name).sort()).toEqual(['Bridge', 'Gate']);
        expect(snapshot.board.places.find((p: { name: string }) => p.name === 'Gate').current).toBe(true);
    });

    it('remembers the current place as seen', async () => {
        const { view } = makeView();
        await view.buildPlayerView();
        expect(view.session.revealedLocations).toContain('Gate');
    });

    it('lists no choices until the DM opens a vote', async () => {
        const { view } = makeView();
        expect((await view.buildPlayerView()).choices).toBeUndefined();
    });

    it('during a vote, shows open choices only, with a path into the fog for unseen places', async () => {
        const { view, bus } = makeView();
        bus.setControls({ voteOpen: true });
        const { choices } = await view.buildPlayerView();
        expect(choices.map((c: { label: string }) => c.label)).toEqual(['Cross', 'Delve']);
        expect(choices[0]).toMatchObject({ number: 1, toKey: 'Bridge' });
        expect(choices[1].toKey).toBeUndefined();
        expect(choices[1].intoFog).toBeDefined();
    });

    it('shares only clocks the DM marked as shown, and the party HP', async () => {
        const { view } = makeView();
        const snapshot = await view.buildPlayerView();
        expect(snapshot.clocks).toEqual([{ name: 'Open', filled: 1, segments: 4 }]);
        expect(snapshot.party).toEqual([{ name: 'Mira', hp: 5, maxHp: 10, conditions: ['Prone'] }]);
    });

    it('leaves rolls off the screen when the DM hides them', async () => {
        const { view, bus } = makeView();
        view.lastPlayerRoll = { title: 'Encounter', total: 4, result: 'Troll', at: 1 };
        expect((await view.buildPlayerView()).roll).toMatchObject({ total: 4 });
        bus.setControls({ showRolls: false });
        expect((await view.buildPlayerView()).roll).toBeUndefined();
    });
});

describe('boardPinPercent', () => {
    it('counts the stored height up from the bottom of the image', () => {
        expect(boardPinPercent([900, 100], 1000, 1000)).toEqual({ x: 10, y: 10 });
        expect(boardPinPercent([100, 500], 1000, 1000)).toEqual({ x: 50, y: 90 });
    });
});
