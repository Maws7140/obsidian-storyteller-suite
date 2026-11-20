import { describe, it, expect, beforeEach } from 'vitest';
import { EntitySyncService } from '../../src/services/EntitySyncService';
import type StorytellerSuitePlugin from '../../src/main';
import type { Character, PlotItem } from '../../src/types';

/**
 * Drives the real sync engine through the item-owner scenario with a mocked
 * plugin surface. This is the exact flow behind "change an item's owner and
 * the character's inventory should follow".
 */

type MockDb = {
    characters: Character[];
    items: PlotItem[];
    savedCharacters: Character[];
    savedItems: PlotItem[];
};

function createMockPlugin(db: MockDb): StorytellerSuitePlugin {
    const empty = async () => [] as never[];
    return {
        listCharacters: async () => db.characters,
        listPlotItems: async () => db.items,
        listLocations: empty,
        listEvents: empty,
        listScenes: empty,
        listCultures: empty,
        listEconomies: empty,
        listMagicSystems: empty,
        listChapters: empty,
        listCompendiumEntries: empty,
        saveCharacter: async (c: Character) => { db.savedCharacters.push(c); },
        savePlotItem: async (i: PlotItem) => { db.savedItems.push(i); },
        saveLocation: async () => {},
        saveEvent: async () => {},
        saveScene: async () => {},
        saveCulture: async () => {},
        saveEconomy: async () => {},
        saveMagicSystem: async () => {},
        saveChapter: async () => {},
        saveCompendiumEntry: async () => {},
    } as unknown as StorytellerSuitePlugin;
}

describe('EntitySyncService — item owners ↔ character inventory', () => {
    let db: MockDb;
    let service: EntitySyncService;

    beforeEach(() => {
        db = {
            characters: [
                { id: 'char-mira', name: 'Mira Vey', ownedItems: [] } as unknown as Character,
                { id: 'char-tollen', name: 'Tollen Brask', ownedItems: ['The Tide Lens'] } as unknown as Character,
            ],
            items: [],
            savedCharacters: [],
            savedItems: [],
        };
        service = new EntitySyncService(createMockPlugin(db));
    });

    const lens = (owners?: string[]): PlotItem =>
        ({ id: 'item-lens', name: 'The Tide Lens', isPlotCritical: false, owners } as unknown as PlotItem);

    it('adds the item to the new owner ownedItems', async () => {
        await service.syncEntity('item', lens(['Mira Vey']), lens([]));

        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
        expect(db.savedCharacters.map(c => c.name)).toContain('Mira Vey');
    });

    it('moves the item between owners when owners changes', async () => {
        await service.syncEntity('item', lens(['Mira Vey']), lens(['Tollen Brask']));

        expect(db.characters[1].ownedItems).not.toContain('The Tide Lens');
        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });

    it('keeps the item in both inventories when a second owner is added', async () => {
        await service.syncEntity('item', lens(['Tollen Brask', 'Mira Vey']), lens(['Tollen Brask']));

        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
        expect(db.characters[1].ownedItems).toContain('The Tide Lens');
    });

    it('removes only the dropped owner when one of several is taken off', async () => {
        db.characters[0].ownedItems = ['The Tide Lens'];
        await service.syncEntity('item', lens(['Mira Vey']), lens(['Mira Vey', 'Tollen Brask']));

        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
        expect(db.characters[1].ownedItems).not.toContain('The Tide Lens');
    });

    it('clears every inventory when the last owner is removed', async () => {
        db.characters[0].ownedItems = ['The Tide Lens'];
        await service.syncEntity('item', lens([]), lens(['Mira Vey', 'Tollen Brask']));

        expect(db.characters[0].ownedItems).not.toContain('The Tide Lens');
        expect(db.characters[1].ownedItems).not.toContain('The Tide Lens');
    });

    it('initializes ownedItems when the character lacks the field', async () => {
        delete (db.characters[0] as unknown as Record<string, unknown>).ownedItems;

        await service.syncEntity('item', lens(['Mira Vey']), undefined);

        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });

    it('syncs when no oldEntity is provided (first save)', async () => {
        await service.syncEntity('item', lens(['Mira Vey']), undefined);
        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });

    it('resolves the owner case-insensitively', async () => {
        await service.syncEntity('item', lens(['mira vey']), undefined);
        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });

    it('reverse direction: character ownedItems change adds the character to item owners', async () => {
        db.items.push(lens([]));
        const oldChar = { id: 'char-mira', name: 'Mira Vey', ownedItems: [] } as unknown as Character;
        const newChar = { id: 'char-mira', name: 'Mira Vey', ownedItems: ['The Tide Lens'] } as unknown as Character;

        await service.syncEntity('character', newChar, oldChar);

        expect(db.items[0].owners).toEqual(['Mira Vey']);
        expect(db.savedItems.map(i => i.name)).toContain('The Tide Lens');
    });

    it('reverse removal takes one owner off without disturbing the others', async () => {
        db.items.push(lens(['Mira Vey', 'Tollen Brask']));
        const oldChar = { id: 'char-mira', name: 'Mira Vey', ownedItems: ['The Tide Lens'] } as unknown as Character;
        const newChar = { id: 'char-mira', name: 'Mira Vey', ownedItems: [] } as unknown as Character;

        await service.syncEntity('character', newChar, oldChar);

        expect(db.items[0].owners).toEqual(['Tollen Brask']);
    });
});

describe('EntitySyncService — item creator ↔ character createdItems', () => {
    let db: MockDb;
    let service: EntitySyncService;

    beforeEach(() => {
        db = {
            characters: [
                { id: 'char-mira', name: 'Mira Vey', ownedItems: [] } as unknown as Character,
                { id: 'char-tollen', name: 'Tollen Brask', ownedItems: [] } as unknown as Character,
            ],
            items: [],
            savedCharacters: [],
            savedItems: [],
        };
        service = new EntitySyncService(createMockPlugin(db));
    });

    const lens = (creator?: string): PlotItem =>
        ({ id: 'item-lens', name: 'The Tide Lens', isPlotCritical: false, creator } as unknown as PlotItem);

    it('adds the item to the creator createdItems', async () => {
        await service.syncEntity('item', lens('Mira Vey'), lens(undefined));

        expect(db.characters[0].createdItems).toContain('The Tide Lens');
    });

    it('moves the credit when the creator changes', async () => {
        db.characters[1].createdItems = ['The Tide Lens'];

        await service.syncEntity('item', lens('Mira Vey'), lens('Tollen Brask'));

        expect(db.characters[1].createdItems).not.toContain('The Tide Lens');
        expect(db.characters[0].createdItems).toContain('The Tide Lens');
    });

    it('keeps creator a scalar on the reverse path', async () => {
        db.items.push(lens(undefined));
        const oldChar = { id: 'char-mira', name: 'Mira Vey', createdItems: [] } as unknown as Character;
        const newChar = { id: 'char-mira', name: 'Mira Vey', createdItems: ['The Tide Lens'] } as unknown as Character;

        await service.syncEntity('character', newChar, oldChar);

        expect(db.items[0].creator).toBe('Mira Vey');
    });
});
