import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Source scan for the look-c entity modals (Scene, Chapter, Book, Map).
 *
 * These modals now group their secondary fields into collapsible sections built
 * by createCollapsibleModalSection. The key lists below are the this.shows('...')
 * guards each modal used before the restyle. Every one must still be present, so
 * that no field silently drops out of the modal when it is moved into a section.
 */

const MODALS: Array<{ file: string; keys: string[] }> = [
    {
        file: 'src/modals/SceneModal.ts',
        keys: [
            'chapterId', 'date', 'campaignBoardMapId', 'status', 'priority', 'povCharacter',
            'emotion', 'intensity', 'synopsis', 'tags', 'profileImage', 'content', 'beats',
            'linkedCharacters', 'linkedLocations', 'linkedEvents', 'linkedItems', 'linkedGroups',
            'setupScenes', 'payoffScenes', 'branches',
        ],
    },
    {
        file: 'src/modals/ChapterModal.ts',
        keys: [
            'number', 'tags', 'profileImage', 'summary', 'customFields', 'bookId',
            'linkedCharacters', 'linkedLocations', 'linkedEvents', 'linkedItems', 'linkedGroups',
        ],
    },
    {
        file: 'src/modals/BookModal.ts',
        keys: [
            'series', 'bookNumber', 'genre', 'status', 'coverImagePath', 'description',
            'synopsis', 'linkedChapters', 'customFields',
        ],
    },
    {
        file: 'src/modals/MapModal.ts',
        keys: [
            'description', 'scale', 'correspondingLocationId', 'imageMapSettings',
            'realWorldSettings', 'zoomLimits', 'profileImage', 'customFields', 'groups',
        ],
    },
];

describe('look-c entity modals use collapsible sections', () => {
    for (const { file, keys } of MODALS) {
        describe(file, () => {
            const source = readFileSync(file, 'utf8');

            it('imports and calls createCollapsibleModalSection', () => {
                expect(source).toContain("import { createCollapsibleModalSection } from './entity/CollapsibleModalSection';");
                expect(source).toMatch(/createCollapsibleModalSection\(/);
            });

            it('keeps every field guard that existed before the restyle', () => {
                for (const key of keys) {
                    expect(source, `${file} guard for "${key}"`).toMatch(new RegExp(`\\bshows\\('${key}'\\)`));
                }
            });

            it('has no leftover h3 headings (sections carry the titles now)', () => {
                expect(source).not.toMatch(/createEl\('h3'/);
            });
        });
    }
});
