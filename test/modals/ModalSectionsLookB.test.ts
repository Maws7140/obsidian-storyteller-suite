import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Source-scan checks for the look-b entity modals. Each modal now groups its
 * secondary fields into collapsible sections. The keys below are the
 * visibility keys each modal read before the restyle. A key that disappears
 * from the source would silently stop being hideable.
 */
const MODALS: Array<{ file: string; keys: readonly string[]; sections: readonly string[] }> = [
    {
        file: 'src/modals/CultureModal.ts',
        keys: [
            'balance', 'customFields', 'customs', 'description', 'governmentType', 'history', 'languages',
            'linkedCharacters', 'linkedEconomies', 'linkedLocations', 'namingConventions', 'population',
            'profileImage', 'religion', 'socialStructure', 'status', 'techLevel', 'values',
        ],
        sections: ['Society', 'Belief and language', 'History', 'Connections', 'Finances', 'Your fields', 'Custom fields'],
    },
    {
        file: 'src/modals/EconomyModal.ts',
        keys: [
            'customFields', 'description', 'economicSystem', 'industries', 'linkedCharacters', 'linkedCultures',
            'linkedLocations', 'profileImage', 'status', 'taxation',
        ],
        sections: ['Production', 'Taxation', 'Connections', 'Your fields', 'Custom fields'],
    },
    {
        file: 'src/modals/MagicSystemModal.ts',
        keys: [
            'costs', 'customFields', 'description', 'history', 'limitations', 'powerLevel', 'profileImage',
            'rarity', 'rules', 'source', 'status', 'systemType', 'training',
        ],
        sections: ['How it works', 'Learning', 'History', 'Your fields', 'Custom fields'],
    },
    {
        file: 'src/modals/CompendiumEntryModal.ts',
        keys: [
            'behavior', 'customFields', 'dangerRating', 'description', 'dimorphism', 'entryType', 'groups',
            'history', 'huntingNotes', 'linkedCharacters', 'linkedCultures', 'linkedEvents', 'linkedItems',
            'linkedLocations', 'linkedMagicSystems', 'profileImage', 'properties', 'rarity',
        ],
        sections: ['Field notes', 'History', 'Connections', 'Groups', 'Your fields', 'Custom fields'],
    },
    {
        file: 'src/modals/ReferenceModal.ts',
        keys: ['category', 'content', 'customFields', 'profileImage', 'tags'],
        sections: ['Tags', 'Your fields', 'Custom fields'],
    },
];

/** Keys read through shows('key') or isModalFieldVisible(..., 'key'). */
function visibilityKeys(source: string): Set<string> {
    const keys = new Set<string>();
    for (const match of source.matchAll(/\bshows\('(\w+)'\)/g)) keys.add(match[1]);
    for (const match of source.matchAll(/isModalFieldVisible\([^)]*?'(\w+)'\s*\)/g)) keys.add(match[1]);
    return keys;
}

describe.each(MODALS)('$file section layout', ({ file, keys, sections }) => {
    const source = readFileSync(file, 'utf8');

    it('imports and calls createCollapsibleModalSection', () => {
        expect(source).toMatch(/import \{ createCollapsibleModalSection \} from '\.\/entity\/CollapsibleModalSection';/);
        expect(source).toMatch(/createCollapsibleModalSection\(contentEl, \{/);
    });

    it('keeps every visibility key that the modal read before the restyle', () => {
        const found = visibilityKeys(source);
        for (const key of keys) {
            expect(found.has(key), `${file} lost the '${key}' visibility guard`).toBe(true);
        }
    });

    it('titles its sections with the expected names', () => {
        for (const title of sections) {
            expect(source, `${file} is missing section '${title}'`).toContain(`title: '${title}'`);
        }
    });

    it('renders the free-form and defined parts through the shared editor', () => {
        expect(source).toContain('renderDefinedFields(');
        expect(source).toContain('renderFreeFormSection(');
    });
});

describe('section titles do not repeat as inner headings', () => {
    it('Culture no longer adds a Finances heading inside its Finances section', () => {
        expect(readFileSync('src/modals/CultureModal.ts', 'utf8')).not.toContain("createEl('h3', { text: 'Finances' })");
    });

    it('Compendium no longer adds a Groups heading inside its Groups section', () => {
        expect(readFileSync('src/modals/CompendiumEntryModal.ts', 'utf8')).not.toContain("createEl('h3', { text: t('groups') })");
    });
});
