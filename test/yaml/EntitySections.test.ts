import { describe, it, expect } from 'vitest';
import { buildFrontmatter, parseSectionsFromMarkdown, toSafeFileName, parseFrontmatterFromContent } from '../../src/yaml/EntitySections';

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

  describe('Empty Field Preservation', () => {
    it('preserves empty string fields that existed in originalFrontmatter', () => {
      const src = {
        name: 'Test Character',
        customField1: ''
      };
      const originalFrontmatter = {
        name: 'Test Character',
        customField1: '',
        status: ''
      };
      const fm = buildFrontmatter('character', src, undefined, { originalFrontmatter });
      
      // Empty fields from original should be preserved
      expect(fm).toHaveProperty('customField1', '');
      expect(fm).toHaveProperty('status', '');
    });

    it('preserves null fields that existed in originalFrontmatter', () => {
      const src = {
        name: 'Test Character',
        affiliation: null
      };
      const originalFrontmatter = {
        name: 'Test Character',
        affiliation: null,
        status: null
      };
      const fm = buildFrontmatter('character', src, undefined, { originalFrontmatter });
      
      // Null fields from original should be preserved
      expect(fm).toHaveProperty('affiliation');
      expect(fm.affiliation).toBeNull();
      expect(fm).toHaveProperty('status');
      expect(fm.status).toBeNull();
    });

    it('preserves empty arrays that existed in originalFrontmatter', () => {
      const src = {
        name: 'Test Character',
        traits: []
      };
      const originalFrontmatter = {
        name: 'Test Character',
        traits: [],
        events: []
      };
      const fm = buildFrontmatter('character', src, undefined, { originalFrontmatter });
      
      // Empty arrays from original should be preserved
      expect(fm).toHaveProperty('traits');
      expect(fm.traits).toEqual([]);
      expect(fm).toHaveProperty('events');
      expect(fm.events).toEqual([]);
    });

    it('filters out empty values for NEW fields not in originalFrontmatter', () => {
      const src = {
        name: 'Test Character',
        newEmptyField: '',
        newNullField: null,
        newEmptyArray: []
      };
      const originalFrontmatter = {
        name: 'Test Character'
      };
      const fm = buildFrontmatter('character', src, undefined, { originalFrontmatter });
      
      // New empty fields should be filtered out
      expect(fm).not.toHaveProperty('newEmptyField');
      expect(fm).not.toHaveProperty('newNullField');
      expect(fm).not.toHaveProperty('newEmptyArray');
    });

    it('preserves manually added empty custom fields in flatten mode', () => {
      const src = {
        name: 'Test Character',
        customFields: {
          customField1: 'value',
          customField2: ''
        }
      };
      const originalFrontmatter = {
        name: 'Test Character',
        customField1: 'value',
        customField2: ''
      };
      const fm = buildFrontmatter('character', src, undefined, { 
        customFieldsMode: 'flatten', 
        originalFrontmatter 
      });
      
      // Empty custom field should be preserved because it existed in original
      expect(fm).toHaveProperty('customField1', 'value');
      expect(fm).toHaveProperty('customField2', '');
    });
  });

  describe('Field Order Preservation', () => {
    it('maintains field order from originalFrontmatter', () => {
      const src = {
        name: 'Test',
        status: 'active',
        affiliation: 'Guild',
        traits: ['brave']
      };
      const originalFrontmatter = {
        affiliation: 'Guild',
        name: 'Test',
        traits: ['brave'],
        status: 'active'
      };
      const fm = buildFrontmatter('character', src, undefined, { originalFrontmatter });
      
      const keys = Object.keys(fm);
      // Original keys should come first in their original order
      expect(keys.indexOf('affiliation')).toBeLessThan(keys.indexOf('name'));
      expect(keys.indexOf('name')).toBeLessThan(keys.indexOf('traits'));
      expect(keys.indexOf('traits')).toBeLessThan(keys.indexOf('status'));
    });

    it('appends new fields after original fields', () => {
      const src = {
        name: 'Test',
        newField: 'value'
      };
      const originalFrontmatter = {
        name: 'Test'
      };
      // Need to preserve newField since it's not in the whitelist
      const preserveKeys = new Set(['newField']);
      const fm = buildFrontmatter('character', src, preserveKeys, { originalFrontmatter });
      
      const keys = Object.keys(fm);
      // Original field should come before new field
      expect(keys.indexOf('name')).toBeLessThan(keys.indexOf('newField'));
    });
  });

  describe('Mixed Scenarios', () => {
    it('handles combination of filled, empty, and null fields correctly', () => {
      const src = {
        name: 'Test Character',
        status: 'active',
        affiliation: '',
        traits: [],
        relationships: ['friend1']
      };
      const originalFrontmatter = {
        name: 'Old Name',
        affiliation: '',
        traits: [],
        oldField: 'preserved'
      };
      const fm = buildFrontmatter('character', src, undefined, { originalFrontmatter });
      
      // New values should override old values
      expect(fm.name).toBe('Test Character');
      // Empty fields from original should be preserved
      expect(fm).toHaveProperty('affiliation', '');
      expect(fm).toHaveProperty('traits');
      expect(fm.traits).toEqual([]);
      // New non-empty fields should be added
      expect(fm.status).toBe('active');
      expect(fm.relationships).toEqual(['friend1']);
      // Old fields not in src should be preserved
      expect(fm.oldField).toBe('preserved');
    });
  });

  describe('parseFrontmatterFromContent', () => {
    it('parses frontmatter with empty values', () => {
      const content = `---
name: Test Character
customField1:
customField2: 
status: null
---

## Description
Content here`;
      
      const fm = parseFrontmatterFromContent(content);
      expect(fm).toBeDefined();
      expect(fm!.name).toBe('Test Character');
      expect(fm!.customField1).toBeNull();
      expect(fm!.customField2).toBeNull();
      expect(fm!.status).toBeNull();
    });

    it('parses frontmatter with arrays', () => {
      const content = `---
name: Test
traits:
  - brave
  - strong
---`;
      
      const fm = parseFrontmatterFromContent(content);
      expect(fm).toBeDefined();
      expect(fm!.traits).toEqual(['brave', 'strong']);
    });

    it('returns undefined for content without frontmatter', () => {
      const content = `# Just a heading\n\nSome content`;
      const fm = parseFrontmatterFromContent(content);
      expect(fm).toBeUndefined();
    });

    it('parses frontmatter with mixed data types', () => {
      const content = `---
name: Test
age: 25
active: true
retired: false
---`;
      
      const fm = parseFrontmatterFromContent(content);
      expect(fm).toBeDefined();
      expect(fm!.name).toBe('Test');
      expect(fm!.age).toBe(25);
      expect(fm!.active).toBe(true);
      expect(fm!.retired).toBe(false);
    });
  });
});
