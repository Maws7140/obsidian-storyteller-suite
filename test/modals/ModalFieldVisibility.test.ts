import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
    isModalFieldVisible,
    setModalFieldHidden,
    seedDefaultCustomFields,
    CHARACTER_MODAL_FIELDS,
    EVENT_MODAL_FIELDS,
    ITEM_MODAL_FIELDS,
    MODAL_FIELD_SETS,
} from '../../src/modals/entity/ModalFieldVisibility';

/**
 * Property names each entity type actually has, hand-copied from the
 * interfaces in src/types.ts. A hideable field must govern at least one of
 * these, so a renamed property shows up here rather than as a dead toggle.
 * Custom fields are not on the Chapter and Reference interfaces: the modals
 * add them through ChapterWithCustomFields and ReferenceWithCustomFields.
 */
const ENTITY_PROPERTIES: Record<string, readonly string[]> = {
    character: [
        'profileImagePath', 'description', 'traits', 'backstory', 'status', 'affiliation', 'gender', 'race',
        'age', 'height', 'quirks', 'currentLocationId', 'locationHistory', 'cultures', 'ownedItems', 'balance',
        'linkedEconomies', 'groups', 'connections', 'customFields', 'dndClass', 'dndLevel', 'dndStr', 'dndMaxHp', 'dndAc',
    ],
    item: [
        'profileImagePath', 'description', 'history', 'whereToFind', 'owners', 'currentOwner', 'creator', 'quantity',
        'pastOwners', 'currentLocation', 'associatedEvents', 'linkedCharacters', 'groups', 'customFields',
        'campaignEffect', 'campaignItemEffects',
    ],
    event: [
        'dateTime', 'description', 'outcome', 'status', 'characters', 'location', 'narrativeMarkers',
        'narrativeSequence', 'isMilestone', 'dependencies', 'progress', 'sources', 'certainty', 'claimedBy',
        'disputedBy', 'images', 'tags', 'groups', 'branches', 'customFields',
    ],
    location: [
        'profileImagePath', 'description', 'history', 'locationType', 'type', 'region', 'status', 'images',
        'parentLocationId', 'childLocationIds', 'mapBindings', 'entityRefs', 'cultures', 'balance', 'ledger',
        'linkedEconomies', 'groups', 'customFields',
    ],
    faction: [
        'profileImagePath', 'description', 'color', 'tags', 'members', 'history', 'structure', 'goals',
        'resources', 'strength', 'status', 'militaryPower', 'economicPower', 'politicalInfluence', 'colors',
        'emblem', 'motto', 'territories', 'groupRelationships', 'linkedCulture', 'parentGroup', 'subgroups',
        'customFields',
    ],
    culture: [
        'profileImagePath', 'description', 'values', 'religion', 'socialStructure', 'history', 'namingConventions',
        'customs', 'languages', 'techLevel', 'governmentType', 'status', 'population', 'linkedCharacters',
        'linkedLocations', 'balance', 'ledger', 'linkedEconomies', 'customFields',
    ],
    economy: [
        'profileImagePath', 'description', 'industries', 'taxation', 'economicSystem', 'status',
        'linkedCharacters', 'linkedLocations', 'linkedCultures', 'customFields',
    ],
    magicSystem: [
        'profileImagePath', 'description', 'rules', 'source', 'costs', 'limitations', 'training', 'history',
        'systemType', 'rarity', 'powerLevel', 'status', 'customFields',
    ],
    compendiumEntry: [
        'entryType', 'rarity', 'dangerRating', 'profileImagePath', 'description', 'behavior', 'properties',
        'history', 'dimorphism', 'huntingNotes', 'linkedLocations', 'linkedCharacters', 'linkedItems',
        'linkedMagicSystems', 'linkedCultures', 'linkedEvents', 'groups', 'customFields',
    ],
    reference: ['category', 'tags', 'profileImagePath', 'content', 'customFields'],
    scene: [
        'chapterId', 'date', 'campaignBoardMapId', 'status', 'priority', 'povCharacter', 'emotion', 'intensity',
        'synopsis', 'tags', 'profileImagePath', 'content', 'beats', 'linkedCharacters', 'linkedLocations',
        'linkedEvents', 'linkedItems', 'linkedGroups', 'setupScenes', 'payoffScenes', 'filePath',
    ],
    chapter: [
        'number', 'tags', 'profileImagePath', 'summary', 'bookId', 'linkedCharacters', 'linkedLocations',
        'linkedEvents', 'linkedItems', 'linkedGroups', 'customFields',
    ],
    book: [
        'series', 'bookNumber', 'genre', 'status', 'coverImagePath', 'description', 'synopsis', 'linkedChapters',
        'customFields',
    ],
    map: [
        'description', 'scale', 'profileImagePath', 'correspondingLocationId', 'backgroundImagePath', 'width',
        'height', 'lat', 'long', 'defaultZoom', 'tileServer', 'darkMode', 'minZoom', 'maxZoom', 'groups',
        'customFields',
    ],
};

/**
 * The property or properties each hideable key governs. Every registered key
 * must appear here, and nothing else may, so the registry and this map cannot
 * drift apart. Section keys list every property the section renders.
 */
const FIELD_COVERAGE: Record<string, Record<string, readonly string[]>> = {
    character: {
        profileImage: ['profileImagePath'], description: ['description'], traits: ['traits'],
        backstory: ['backstory'], status: ['status'], affiliation: ['affiliation'],
        physicalAttributes: ['gender', 'race', 'age', 'height'], quirks: ['quirks'],
        location: ['currentLocationId', 'locationHistory'], cultures: ['cultures'],
        inventory: ['ownedItems', 'balance'], economies: ['linkedEconomies'], groups: ['groups'],
        connections: ['connections'], customFields: ['customFields'],
        dndStats: ['dndClass', 'dndLevel', 'dndStr', 'dndMaxHp', 'dndAc'],
    },
    item: {
        profileImage: ['profileImagePath'], description: ['description'], history: ['history'],
        whereToFind: ['whereToFind'], owners: ['owners', 'currentOwner'], creator: ['creator'],
        quantity: ['quantity'], pastOwners: ['pastOwners'], location: ['currentLocation'],
        associatedEvents: ['associatedEvents'], associatedCharacters: ['linkedCharacters'],
        groups: ['groups'], customFields: ['customFields'],
        campaignUse: ['campaignEffect', 'campaignItemEffects'],
    },
    event: {
        dateTime: ['dateTime'], status: ['status'], description: ['description'], outcome: ['outcome'],
        characters: ['characters'], location: ['location'],
        narrative: ['narrativeMarkers', 'narrativeSequence'],
        timeline: ['isMilestone', 'dependencies', 'progress'],
        provenance: ['sources', 'certainty', 'claimedBy', 'disputedBy'], media: ['images'],
        organization: ['tags', 'groups', 'branches'], customFields: ['customFields'],
    },
    location: {
        profileImage: ['profileImagePath'], description: ['description'], history: ['history'],
        locationType: ['locationType'], type: ['type'], region: ['region'], status: ['status'],
        parentLocationId: ['parentLocationId'], childLocationIds: ['childLocationIds'],
        images: ['images'], mapBindings: ['mapBindings'], entityRefs: ['entityRefs'],
        cultures: ['cultures'], balance: ['balance', 'ledger'], linkedEconomies: ['linkedEconomies'],
        groups: ['groups'], customFields: ['customFields'],
    },
    faction: {
        profileImage: ['profileImagePath'], description: ['description'], color: ['color'], tags: ['tags'],
        memberCharacters: ['members'], memberLocations: ['members'], memberEvents: ['members'],
        memberItems: ['members'], history: ['history'], structure: ['structure'], goals: ['goals'],
        resources: ['resources'], strength: ['strength'], status: ['status'],
        powerInfluence: ['militaryPower', 'economicPower', 'politicalInfluence'],
        identity: ['colors', 'emblem', 'motto', 'territories'],
        groupRelationships: ['groupRelationships'], linkedCulture: ['linkedCulture'],
        parentGroup: ['parentGroup'], subgroups: ['subgroups'], customFields: ['customFields'],
    },
    culture: {
        profileImage: ['profileImagePath'], techLevel: ['techLevel'], governmentType: ['governmentType'],
        status: ['status'], languages: ['languages'], population: ['population'],
        description: ['description'], values: ['values'], religion: ['religion'],
        socialStructure: ['socialStructure'], history: ['history'],
        namingConventions: ['namingConventions'], customs: ['customs'],
        linkedCharacters: ['linkedCharacters'], linkedLocations: ['linkedLocations'],
        balance: ['balance', 'ledger'], linkedEconomies: ['linkedEconomies'], customFields: ['customFields'],
    },
    economy: {
        profileImage: ['profileImagePath'], economicSystem: ['economicSystem'], status: ['status'],
        description: ['description'], industries: ['industries'], taxation: ['taxation'],
        linkedCharacters: ['linkedCharacters'], linkedLocations: ['linkedLocations'],
        linkedCultures: ['linkedCultures'], customFields: ['customFields'],
    },
    magicSystem: {
        profileImage: ['profileImagePath'], systemType: ['systemType'], rarity: ['rarity'],
        powerLevel: ['powerLevel'], status: ['status'], description: ['description'], rules: ['rules'],
        source: ['source'], costs: ['costs'], limitations: ['limitations'], training: ['training'],
        history: ['history'], customFields: ['customFields'],
    },
    compendiumEntry: {
        entryType: ['entryType'], rarity: ['rarity'], dangerRating: ['dangerRating'],
        profileImage: ['profileImagePath'], description: ['description'], behavior: ['behavior'],
        properties: ['properties'], history: ['history'], dimorphism: ['dimorphism'],
        huntingNotes: ['huntingNotes'], linkedLocations: ['linkedLocations'],
        linkedCharacters: ['linkedCharacters'], linkedItems: ['linkedItems'],
        linkedMagicSystems: ['linkedMagicSystems'], linkedCultures: ['linkedCultures'],
        linkedEvents: ['linkedEvents'], groups: ['groups'], customFields: ['customFields'],
    },
    reference: {
        category: ['category'], tags: ['tags'], profileImage: ['profileImagePath'], content: ['content'],
        customFields: ['customFields'],
    },
    scene: {
        chapterId: ['chapterId'], date: ['date'], campaignBoardMapId: ['campaignBoardMapId'],
        status: ['status'], priority: ['priority'], povCharacter: ['povCharacter'], emotion: ['emotion'],
        intensity: ['intensity'], synopsis: ['synopsis'], tags: ['tags'],
        profileImage: ['profileImagePath'], content: ['content'], beats: ['beats'],
        linkedCharacters: ['linkedCharacters'], linkedLocations: ['linkedLocations'],
        linkedEvents: ['linkedEvents'], linkedItems: ['linkedItems'], linkedGroups: ['linkedGroups'],
        setupScenes: ['setupScenes'], payoffScenes: ['payoffScenes'],
        // Branches are read from the scene's own file, which filePath locates.
        branches: ['filePath'],
    },
    chapter: {
        number: ['number'], tags: ['tags'], profileImage: ['profileImagePath'], summary: ['summary'],
        bookId: ['bookId'], linkedCharacters: ['linkedCharacters'], linkedLocations: ['linkedLocations'],
        linkedEvents: ['linkedEvents'], linkedItems: ['linkedItems'], linkedGroups: ['linkedGroups'],
        customFields: ['customFields'],
    },
    book: {
        series: ['series'], bookNumber: ['bookNumber'], genre: ['genre'], status: ['status'],
        coverImagePath: ['coverImagePath'], description: ['description'], synopsis: ['synopsis'],
        linkedChapters: ['linkedChapters'], customFields: ['customFields'],
    },
    map: {
        description: ['description'], scale: ['scale'], profileImage: ['profileImagePath'],
        correspondingLocationId: ['correspondingLocationId'],
        imageMapSettings: ['backgroundImagePath', 'width', 'height'],
        realWorldSettings: ['lat', 'long', 'defaultZoom', 'tileServer', 'darkMode'],
        zoomLimits: ['minZoom', 'maxZoom'], groups: ['groups'], customFields: ['customFields'],
    },
};

/** Modal source file for each entity type, and the helper its guards call. */
const MODAL_GUARDS: Array<{ type: string; file: string; pattern: RegExp }> = [
    { type: 'character', file: 'src/modals/CharacterModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'item', file: 'src/modals/PlotItemModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'event', file: 'src/modals/EventModal.ts', pattern: /isVisible\('(\w+)'\)/g },
    { type: 'location', file: 'src/modals/LocationModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'faction', file: 'src/modals/GroupModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'culture', file: 'src/modals/CultureModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'economy', file: 'src/modals/EconomyModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'magicSystem', file: 'src/modals/MagicSystemModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'compendiumEntry', file: 'src/modals/CompendiumEntryModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'reference', file: 'src/modals/ReferenceModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'scene', file: 'src/modals/SceneModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'chapter', file: 'src/modals/ChapterModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'book', file: 'src/modals/BookModal.ts', pattern: /\bshows\('(\w+)'\)/g },
    { type: 'map', file: 'src/modals/MapModal.ts', pattern: /\bshows\('(\w+)'\)/g },
];

const NEW_TYPES = [
    'location', 'faction', 'culture', 'economy', 'magicSystem', 'compendiumEntry',
    'reference', 'scene', 'chapter', 'book', 'map',
];

describe('isModalFieldVisible', () => {
    it('shows everything when nothing is configured', () => {
        expect(isModalFieldVisible(undefined, 'character', 'quirks')).toBe(true);
        expect(isModalFieldVisible({}, 'character', 'quirks')).toBe(true);
    });

    it('hides only the listed field', () => {
        const hidden = { character: ['quirks'] };
        expect(isModalFieldVisible(hidden, 'character', 'quirks')).toBe(false);
        expect(isModalFieldVisible(hidden, 'character', 'description')).toBe(true);
    });

    it('does not leak a hidden field across entity types', () => {
        const hidden = { character: ['description'] };
        expect(isModalFieldVisible(hidden, 'location', 'description')).toBe(true);
    });

    it('an empty hidden list shows everything', () => {
        expect(isModalFieldVisible({ character: [] }, 'character', 'quirks')).toBe(true);
    });

    it('falls back to visible when the stored value is malformed', () => {
        // A settings file edited by hand, or written by an older version, must
        // never blank out the modal.
        const malformed = { character: 'quirks' } as unknown as Record<string, string[]>;
        expect(isModalFieldVisible(malformed, 'character', 'quirks')).toBe(true);
    });

    it('ignores a key the registry no longer knows', () => {
        // A stale entry left by a renamed field must not silently remove
        // something settings no longer offers a toggle for.
        expect(isModalFieldVisible({ character: ['retiredField'] }, 'character', 'retiredField')).toBe(true);
    });

    it('hides an item field', () => {
        expect(isModalFieldVisible({ item: ['quantity'] }, 'item', 'quantity')).toBe(false);
        expect(isModalFieldVisible({ item: ['quantity'] }, 'item', 'creator')).toBe(true);
    });
});

describe('setModalFieldHidden', () => {
    it('adds a key when hiding', () => {
        expect(setModalFieldHidden({}, 'character', 'quirks', true)).toEqual({ character: ['quirks'] });
    });

    it('removes a key when showing', () => {
        expect(setModalFieldHidden({ character: ['quirks'] }, 'character', 'quirks', false)).toEqual({});
    });

    it('drops the entity key once nothing is hidden for it', () => {
        const next = setModalFieldHidden({ character: ['quirks'], item: ['creator'] }, 'character', 'quirks', false);
        expect(next).toEqual({ item: ['creator'] });
        expect('character' in next).toBe(false);
    });

    it('does not duplicate an already-hidden key', () => {
        expect(setModalFieldHidden({ character: ['quirks'] }, 'character', 'quirks', true).character).toEqual(['quirks']);
    });

    it('does not mutate the input', () => {
        const original = { character: ['quirks'] };
        setModalFieldHidden(original, 'character', 'backstory', true);
        expect(original).toEqual({ character: ['quirks'] });
    });

    it('survives a malformed stored value', () => {
        const malformed = { character: 'quirks' } as unknown as Record<string, string[]>;
        expect(setModalFieldHidden(malformed, 'character', 'backstory', true).character).toEqual(['backstory']);
    });

    it('round-trips through isModalFieldVisible', () => {
        let map = setModalFieldHidden(undefined, 'character', 'dndStats', true);
        expect(isModalFieldVisible(map, 'character', 'dndStats')).toBe(false);
        map = setModalFieldHidden(map, 'character', 'dndStats', false);
        expect(isModalFieldVisible(map, 'character', 'dndStats')).toBe(true);
    });
});

describe('seedDefaultCustomFields', () => {
    it('adds each configured field with an empty value', () => {
        expect(seedDefaultCustomFields({}, ['intent', 'parents'])).toEqual({ intent: '', parents: '' });
    });

    it('never overwrites a value that is already there', () => {
        expect(seedDefaultCustomFields({ intent: 'revenge' }, ['intent'])).toEqual({ intent: 'revenge' });
    });

    it('keeps fields that are not in the defaults', () => {
        expect(seedDefaultCustomFields({ mood: 'grim' }, ['intent'])).toEqual({ mood: 'grim', intent: '' });
    });

    it('ignores blank entries and trims names', () => {
        expect(seedDefaultCustomFields({}, ['', '   ', '  intent  '])).toEqual({ intent: '' });
    });

    it('returns a copy rather than the original object', () => {
        const existing = { mood: 'grim' };
        const result = seedDefaultCustomFields(existing, ['intent']);
        expect(result).not.toBe(existing);
        expect(existing).toEqual({ mood: 'grim' });
    });

    it('handles both arguments being absent', () => {
        expect(seedDefaultCustomFields(undefined, undefined)).toEqual({});
    });
});

describe('field definitions', () => {
    it('name is not hideable, since saving requires it', () => {
        expect(CHARACTER_MODAL_FIELDS.some(f => f.key === 'name')).toBe(false);
        expect(ITEM_MODAL_FIELDS.some(f => f.key === 'name')).toBe(false);
        expect(EVENT_MODAL_FIELDS.some(f => f.key === 'name')).toBe(false);
    });

    it('keys are unique', () => {
        for (const fields of Object.values(MODAL_FIELD_SETS)) {
            const keys = fields.map(f => f.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    it('every field has a label', () => {
        for (const fields of Object.values(MODAL_FIELD_SETS)) {
            for (const field of fields) {
                expect(field.label.trim().length).toBeGreaterThan(0);
            }
        }
    });
});

describe('registry coverage', () => {
    it('registers every entity type that has a modal', () => {
        expect(Object.keys(MODAL_FIELD_SETS).sort()).toEqual([
            'book', 'chapter', 'character', 'compendiumEntry', 'culture', 'economy', 'event', 'faction',
            'item', 'location', 'magicSystem', 'map', 'reference', 'scene',
        ]);
    });

    it('never offers to hide the required name or title', () => {
        for (const fields of Object.values(MODAL_FIELD_SETS)) {
            for (const field of fields) {
                expect(['name', 'title']).not.toContain(field.key);
            }
        }
    });

    it('every registered key is covered, and every covered key is registered', () => {
        for (const [type, fields] of Object.entries(MODAL_FIELD_SETS)) {
            const registered = fields.map(field => field.key).sort();
            const covered = Object.keys(FIELD_COVERAGE[type] ?? {}).sort();
            expect(covered, type).toEqual(registered);
        }
    });

    it('every key governs at least one real property of its entity', () => {
        for (const [type, coverage] of Object.entries(FIELD_COVERAGE)) {
            const properties = new Set(ENTITY_PROPERTIES[type] ?? []);
            for (const [key, props] of Object.entries(coverage)) {
                expect(props.length, `${type}.${key} governs nothing`).toBeGreaterThan(0);
                for (const prop of props) {
                    expect(properties.has(prop), `${type}.${key} -> ${prop} is not a property of ${type}`).toBe(true);
                }
            }
        }
    });

    it('every registered key has a matching guard in its modal', () => {
        for (const { type, file, pattern } of MODAL_GUARDS) {
            const source = readFileSync(file, 'utf8');
            const guarded = new Set(Array.from(source.matchAll(pattern), match => match[1]));
            const registered = new Set((MODAL_FIELD_SETS[type] ?? []).map(field => field.key));
            expect([...guarded].sort(), `${file} guards`).toEqual([...registered].sort());
        }
    });
});

describe('new modal field sets', () => {
    it('shows every field by default for each new entity type', () => {
        for (const type of NEW_TYPES) {
            for (const field of MODAL_FIELD_SETS[type]) {
                expect(isModalFieldVisible(undefined, type, field.key)).toBe(true);
                expect(isModalFieldVisible({}, type, field.key)).toBe(true);
            }
        }
    });

    it('hides a single new field without touching the others', () => {
        const hidden = { culture: ['religion'], map: ['zoomLimits'] };
        expect(isModalFieldVisible(hidden, 'culture', 'religion')).toBe(false);
        expect(isModalFieldVisible(hidden, 'culture', 'customs')).toBe(true);
        expect(isModalFieldVisible(hidden, 'map', 'zoomLimits')).toBe(false);
        expect(isModalFieldVisible(hidden, 'map', 'scale')).toBe(true);
    });

    it('does not leak a group hide into culture', () => {
        expect(isModalFieldVisible({ faction: ['history'] }, 'culture', 'history')).toBe(true);
        expect(isModalFieldVisible({ faction: ['history'] }, 'faction', 'history')).toBe(false);
    });

    it('treats a stale key on a new type as visible', () => {
        expect(isModalFieldVisible({ scene: ['retiredField'] }, 'scene', 'retiredField')).toBe(true);
    });

    it('keeps the map type out of the switches, since it decides which sections exist', () => {
        expect(MODAL_FIELD_SETS.map.some(field => field.key === 'type')).toBe(false);
    });

    it('round-trips a new field through set and get', () => {
        let map = setModalFieldHidden(undefined, 'book', 'synopsis', true);
        expect(isModalFieldVisible(map, 'book', 'synopsis')).toBe(false);
        map = setModalFieldHidden(map, 'book', 'synopsis', false);
        expect(map).toEqual({});
    });
});
