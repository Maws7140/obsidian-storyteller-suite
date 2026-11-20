import { describe, it, expect } from 'vitest';
import {
    getOwners,
    getPrimaryOwner,
    getTrackedItemOwner,
    getPartyOwner,
    setPartyOwner,
} from '../../src/utils/ItemOwnership';
import type { Character, PlotItem } from '../../src/types';

const item = (over: Partial<PlotItem> = {}): PlotItem => ({
    id: 'i1',
    filePath: 'Items/Stone.md',
    name: "Alchemist's Stone",
    isPlotCritical: false,
    ...over,
} as PlotItem);

const character = (name: string, ownedItems: string[] = []): Character =>
    ({ id: name, name, ownedItems } as Character);

const party = (...names: string[]) => new Set(names.map(n => n.trim().toLowerCase()));

describe('getOwners', () => {
    it('returns the owners array', () => {
        expect(getOwners(item({ owners: ['Ava', 'Bo'] }))).toEqual(['Ava', 'Bo']);
    });

    it('falls back to a legacy scalar currentOwner', () => {
        expect(getOwners(item({ currentOwner: 'Ava' }))).toEqual(['Ava']);
    });

    it('prefers owners over the legacy scalar', () => {
        expect(getOwners(item({ owners: ['Bo'], currentOwner: 'Ava' }))).toEqual(['Bo']);
    });

    it('treats an explicit empty owners array as no owners, not as a fallback', () => {
        expect(getOwners(item({ owners: [], currentOwner: 'Ava' }))).toEqual([]);
    });

    it('drops blank and non-string entries', () => {
        expect(getOwners(item({ owners: ['Ava', '', '  ', null as never] }))).toEqual(['Ava']);
    });

    it('returns an empty array when nothing is set', () => {
        expect(getOwners(item())).toEqual([]);
    });
});

describe('getPrimaryOwner', () => {
    it('returns the first owner', () => {
        expect(getPrimaryOwner(item({ owners: ['Ava', 'Bo'] }))).toBe('Ava');
    });

    it('returns undefined when unowned', () => {
        expect(getPrimaryOwner(item())).toBeUndefined();
    });
});

describe('getTrackedItemOwner', () => {
    it('prefers the item\'s own owners', () => {
        const owner = getTrackedItemOwner(item({ owners: ['Ava'] }), [character('Bo', ["Alchemist's Stone"])]);
        expect(owner).toBe('Ava');
    });

    it('falls back to a character whose inventory lists the item', () => {
        const owner = getTrackedItemOwner(item(), [character('Bo', ["alchemist's stone"])]);
        expect(owner).toBe('Bo');
    });

    it('returns undefined when nobody holds it', () => {
        expect(getTrackedItemOwner(item(), [character('Bo')])).toBeUndefined();
    });
});

describe('getPartyOwner', () => {
    it('finds the owner who is in the party', () => {
        expect(getPartyOwner(item({ owners: ['Npc', 'Ava'] }), party('Ava', 'Bo'))).toBe('Ava');
    });

    it('returns undefined when no owner is in the party', () => {
        expect(getPartyOwner(item({ owners: ['Npc'] }), party('Ava'))).toBeUndefined();
    });
});

describe('setPartyOwner', () => {
    it('assigns an owner within the party', () => {
        const it0 = item({ owners: [] });
        expect(setPartyOwner(it0, 'Ava', party('Ava', 'Bo'))).toBe(true);
        expect(it0.owners).toEqual(['Ava']);
    });

    it('replaces the previous party holder', () => {
        const it0 = item({ owners: ['Ava'] });
        setPartyOwner(it0, 'Bo', party('Ava', 'Bo'));
        expect(it0.owners).toEqual(['Bo']);
    });

    it('leaves owners outside the party alone', () => {
        const it0 = item({ owners: ['Npc', 'Ava'] });
        setPartyOwner(it0, 'Bo', party('Ava', 'Bo'));
        expect(it0.owners).toEqual(['Npc', 'Bo']);
    });

    it('clears only the party holder when handed undefined', () => {
        const it0 = item({ owners: ['Npc', 'Ava'] });
        setPartyOwner(it0, undefined, party('Ava'));
        expect(it0.owners).toEqual(['Npc']);
    });

    it('reports no change when the same party owner is reassigned', () => {
        const it0 = item({ owners: ['Ava'] });
        expect(setPartyOwner(it0, 'Ava', party('Ava'))).toBe(false);
    });

    it('reports no change when clearing an item no party member holds', () => {
        const it0 = item({ owners: ['Npc'] });
        expect(setPartyOwner(it0, undefined, party('Ava'))).toBe(false);
        expect(it0.owners).toEqual(['Npc']);
    });

    it('migrates a legacy scalar owner on first write', () => {
        const it0 = item({ currentOwner: 'Ava' });
        expect(setPartyOwner(it0, 'Bo', party('Ava', 'Bo'))).toBe(true);
        expect(it0.owners).toEqual(['Bo']);
    });
});
