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

describe('EntitySyncService — item owner ↔ character inventory', () => {
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

    it('adds the item to the new owner ownedItems', async () => {
        const oldItem = { id: 'item-lens', name: 'The Tide Lens', currentOwner: undefined } as unknown as PlotItem;
        const newItem = { id: 'item-lens', name: 'The Tide Lens', currentOwner: 'Mira Vey' } as unknown as PlotItem;

        await service.syncEntity('item', newItem, oldItem);

        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
        expect(db.savedCharacters.map(c => c.name)).toContain('Mira Vey');
    });

    it('moves the item between owners when currentOwner changes', async () => {
        const oldItem = { id: 'item-lens', name: 'The Tide Lens', currentOwner: 'Tollen Brask' } as unknown as PlotItem;
        const newItem = { id: 'item-lens', name: 'The Tide Lens', currentOwner: 'Mira Vey' } as unknown as PlotItem;

        await service.syncEntity('item', newItem, oldItem);

        expect(db.characters[1].ownedItems).not.toContain('The Tide Lens');
        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });

    it('initializes ownedItems when the character lacks the field', async () => {
        delete (db.characters[0] as unknown as Record<string, unknown>).ownedItems;
        const newItem = { id: 'item-lens', name: 'The Tide Lens', currentOwner: 'Mira Vey' } as unknown as PlotItem;

        await service.syncEntity('item', newItem, undefined);

        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });

    it('syncs when no oldEntity is provided (first save)', async () => {
        const newItem = { id: 'item-lens', name: 'The Tide Lens', currentOwner: 'Mira Vey' } as unknown as PlotItem;
        await service.syncEntity('item', newItem, undefined);
        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });

    it('resolves the owner case-insensitively', async () => {
        const newItem = { id: 'item-lens', name: 'The Tide Lens', currentOwner: 'mira vey' } as unknown as PlotItem;
        await service.syncEntity('item', newItem, undefined);
        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });

    it('reverse direction: character ownedItems change updates item currentOwner as a SCALAR', async () => {
        db.items.push({ id: 'item-lens', name: 'The Tide Lens', currentOwner: undefined, isPlotCritical: false } as unknown as PlotItem);
        const oldChar = { id: 'char-mira', name: 'Mira Vey', ownedItems: [] } as unknown as Character;
        const newChar = { id: 'char-mira', name: 'Mira Vey', ownedItems: ['The Tide Lens'] } as unknown as Character;

        await service.syncEntity('character', newChar, oldChar);

        // Regression: the old reverse path array-wrapped scalar source fields,
        // writing currentOwner: [name] into item notes.
        expect(db.items[0].currentOwner).toBe('Mira Vey');
        expect(db.savedItems.map(i => i.name)).toContain('The Tide Lens');
    });

    it('reverse removal collapses an array-corrupted currentOwner back to scalar shape', async () => {
        db.items.push({
            id: 'item-lens', name: 'The Tide Lens', isPlotCritical: false,
            currentOwner: ['Mira Vey', 'Tollen Brask'] as unknown as string,
        } as unknown as PlotItem);
        const oldChar = { id: 'char-mira', name: 'Mira Vey', ownedItems: ['The Tide Lens'] } as unknown as Character;
        const newChar = { id: 'char-mira', name: 'Mira Vey', ownedItems: [] } as unknown as Character;

        await service.syncEntity('character', newChar, oldChar);

        expect(db.items[0].currentOwner).toBe('Tollen Brask');
    });

    it('forward sync removes every former owner when the old value was array-corrupted', async () => {
        db.characters[0].ownedItems = ['The Tide Lens'];
        db.characters[1].ownedItems = ['The Tide Lens'];
        const oldItem = {
            id: 'item-lens', name: 'The Tide Lens',
            currentOwner: ['Mira Vey', 'Tollen Brask'] as unknown as string,
        } as unknown as PlotItem;
        const newItem = { id: 'item-lens', name: 'The Tide Lens', currentOwner: 'Mira Vey' } as unknown as PlotItem;

        await service.syncEntity('item', newItem, oldItem);

        expect(db.characters[1].ownedItems).not.toContain('The Tide Lens');
        expect(db.characters[0].ownedItems).toContain('The Tide Lens');
    });
});
