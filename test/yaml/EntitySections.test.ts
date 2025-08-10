import { describe, it, expect } from 'vitest';
import { buildFrontmatter, parseSectionsFromMarkdown, toSafeFileName } from '../../src/yaml/EntitySections';

describe('EntitySections', () => {
  it('buildFrontmatter filters disallowed keys and multiline strings', () => {
    const src = {
      id: '1',
      name: 'Name',
      description: 'line1\nline2',
      traits: ['brave'],
      customFields: {},
      extra: 'nope'
    } as any;
    const fm = buildFrontmatter('character', src);
    expect(fm).toHaveProperty('id', '1');
    expect(fm).toHaveProperty('name', 'Name');
    expect(fm).toHaveProperty('traits');
    expect(fm).not.toHaveProperty('description');
    expect(fm).not.toHaveProperty('customFields');
    expect(fm).not.toHaveProperty('extra');
  });

  it('parseSectionsFromMarkdown extracts all ## sections', () => {
    const body = `---\n---\n\n## Description\nText here\n\n## Backstory\nStory`; 
    const sections = parseSectionsFromMarkdown(body);
    expect(sections.Description).toBe('Text here');
    expect(sections.Backstory).toBe('Story');
  });

  it('toSafeFileName removes illegal characters', () => {
    expect(toSafeFileName('A:/B*C?')).toBe('ABC');
  });
});
