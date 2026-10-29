import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Source-scan checks for the entity modals restyled into collapsible sections
 * (wave4 look-a). The key lists were read from the sources before the restyle,
 * so a field guard dropped during a later move fails here instead of silently
 * hiding a field that the user had not turned off.
 */

interface ModalSectionSpec {
    file: string;
    /** Every shows('key') guard the modal had before it was restyled. */
    keys: readonly string[];
    /** Section titles that must exist as collapsible sections. */
    titles: readonly string[];
}

const SPECS: ModalSectionSpec[] = [
    {
        file: 'src/modals/CharacterModal.ts',
        keys: [
            'profileImage', 'description', 'traits', 'backstory', 'status', 'affiliation', 'physicalAttributes',
            'quirks', 'location', 'cultures', 'inventory', 'economies', 'groups', 'connections', 'customFields',
            'dndStats',
        ],
        titles: [
            'Your fields', 'Appearance and traits', 'Backstory', 'Whereabouts', 'World-building',
            'Relationships', 'Custom fields', 'D&D stats',
        ],
    },
    {
        file: 'src/modals/LocationModal.ts',
        keys: [
            'description', 'history', 'locationType', 'type', 'region', 'status', 'parentLocationId', 'profileImage',
            'images', 'mapBindings', 'entityRefs', 'childLocationIds', 'cultures', 'balance', 'linkedEconomies',
            'customFields', 'groups',
        ],
        titles: [
            'Your fields', 'Place details', 'History', 'Hierarchy and maps', 'Associated images', 'Who is here',
            'World-building', 'Custom fields',
        ],
    },
    {
        file: 'src/modals/PlotItemModal.ts',
        keys: [
            'profileImage', 'description', 'history', 'whereToFind', 'owners', 'creator', 'quantity', 'groups',
            'customFields', 'location', 'pastOwners', 'associatedEvents', 'associatedCharacters', 'campaignUse',
        ],
        titles: [
            'Your fields', 'History', 'Ownership and location', 'Story links', 'Magic and value', 'World-building',
            'Campaign use', 'Custom fields',
        ],
    },
    {
        file: 'src/modals/GroupModal.ts',
        keys: [
            'description', 'color', 'tags', 'profileImage', 'history', 'structure', 'goals', 'resources', 'strength',
            'status', 'powerInfluence', 'identity', 'groupRelationships', 'linkedCulture', 'parentGroup', 'subgroups',
            'customFields', 'memberCharacters', 'memberLocations', 'memberEvents', 'memberItems',
        ],
        titles: [
            'Your fields', 'Color and tags', 'Members', 'Faction details', 'Power and influence',
            'Identity and symbols', 'Relationships', 'Custom fields',
        ],
    },
];

describe.each(SPECS)('$file sections', ({ file, keys, titles }) => {
    const source = readFileSync(file, 'utf8');

    it('imports and calls createCollapsibleModalSection', () => {
        expect(source).toMatch(/import \{ createCollapsibleModalSection \} from '\.\/entity\/CollapsibleModalSection';/);
        expect(source.match(/createCollapsibleModalSection\(/g)?.length ?? 0).toBeGreaterThanOrEqual(titles.length);
    });

    it('creates every expected section title', () => {
        for (const title of titles) {
            expect(source, `${file} title "${title}"`).toContain(`title: '${title}'`);
        }
    });

    it('keeps every field guard that existed before the restyle', () => {
        const guarded = new Set(Array.from(source.matchAll(/\bshows\('(\w+)'\)/g), match => match[1]));
        for (const key of keys) {
            expect(guarded.has(key), `${file} guard shows('${key}')`).toBe(true);
        }
    });

    it('renders defined fields through the editor', () => {
        expect(source).toContain('renderDefinedFields(');
    });
});
