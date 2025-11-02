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

    it('handles empty string values at end of line', () => {
      const content = `---
name: Test Character
emptyField1:
emptyField2:
status: active
---`;

      const fm = parseFrontmatterFromContent(content);
      expect(fm).toBeDefined();
      expect(fm!.name).toBe('Test Character');
      expect(fm!.emptyField1).toBeNull();
      expect(fm!.emptyField2).toBeNull();
      expect(fm!.status).toBe('active');
    });
  });

  describe('Round-trip Empty Field Preservation', () => {
    it('preserves empty custom fields through write-read cycle', () => {
      const src = {
        name: 'Test Character',
        status: 'active',
        customFields: {
          customField1: 'value',
          customField2: '',
          customField3: 'another value'
        }
      };

      const originalFrontmatter = {
        name: 'Old Name',
        status: 'inactive',
        customField1: 'old value',
        customField2: '',
        customField3: 'old another value'
      };

      // Simulate write
      const fm = buildFrontmatter('character', src, undefined, {
        customFieldsMode: 'flatten',
        originalFrontmatter
      });

      // Verify all custom fields are present, including empty one
      expect(fm.customField1).toBe('value');
      expect(fm.customField2).toBe(''); // Empty field should be preserved
      expect(fm.customField3).toBe('another value');
    });

    it('preserves null fields when they existed in original', () => {
      const src = {
        name: 'Test Character',
        customFields: {
          nullField: ''
        }
      };

      const originalFrontmatter = {
        name: 'Test Character',
        nullField: null
      };

      const fm = buildFrontmatter('character', src, undefined, {
        customFieldsMode: 'flatten',
        originalFrontmatter
      });

      // Null field should be preserved with the new value (empty string)
      expect(fm).toHaveProperty('nullField');
      expect(fm.nullField).toBe('');
    });

    it('preserves fields that were added manually (not through modal)', () => {
      const src = {
        name: 'Test Character',
        status: 'active'
      };

      const originalFrontmatter = {
        name: 'Test Character',
        status: 'active',
        manualField1: '',
        manualField2: null,
        manualField3: 'value'
      };

      const fm = buildFrontmatter('character', src, undefined, {
        originalFrontmatter
      });

      // All manual fields should be preserved
      expect(fm).toHaveProperty('manualField1', '');
      expect(fm).toHaveProperty('manualField2', null);
      expect(fm).toHaveProperty('manualField3', 'value');
    });

    it('does not filter out empty arrays that existed in original', () => {
      const src = {
        name: 'Test Character',
        traits: []
      };

      const originalFrontmatter = {
        name: 'Test Character',
        traits: []
      };

      const fm = buildFrontmatter('character', src, undefined, {
        originalFrontmatter
      });

      // Empty array should be preserved
      expect(fm).toHaveProperty('traits');
      expect(fm.traits).toEqual([]);
    });

    it('handles update scenario: modify non-empty field without removing empty fields', () => {
      const src = {
        name: 'Updated Character Name',
        status: 'active',
        customFields: {
          field1: '',
          field2: 'updated value',
          field3: ''
        }
      };

      const originalFrontmatter = {
        name: 'Old Character Name',
        status: 'active',
        field1: '',
        field2: 'old value',
        field3: '',
        field4: 'preserved'
      };

      const fm = buildFrontmatter('character', src, undefined, {
        customFieldsMode: 'flatten',
        originalFrontmatter
      });

      // Updated field should have new value
      expect(fm.name).toBe('Updated Character Name');
      expect(fm.field2).toBe('updated value');

      // Empty fields should be preserved
      expect(fm.field1).toBe('');
      expect(fm.field3).toBe('');

      // Field that wasn't in src but was in original should be preserved
      expect(fm.field4).toBe('preserved');
    });
  });
});
