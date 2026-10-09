import { expect, it } from 'vitest';
import { parseFrontmatterFromContent } from '../../src/yaml/EntitySections';

it('recognizes entity frontmatter after a UTF-8 BOM', () => {
    expect(parseFrontmatterFromContent('\uFEFF---\r\nname: Frodo\r\nentityType: character\r\n---\r\nBody'))
        .toEqual({ name: 'Frodo', entityType: 'character' });
});
