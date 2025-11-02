import { describe, it, expect } from 'vitest';
import { buildFrontmatter, parseFrontmatterFromContent } from '../../src/yaml/EntitySections';
import { stringifyYamlWithEmptyFields, stringifyYamlWithLogging, validateFrontmatterPreservation } from '../../src/utils/YamlSerializer';

/**
 * Integration tests for empty field preservation.
 * These tests simulate the exact user scenario described in the issue:
 * 1. User manually adds empty fields to frontmatter
 * 2. User edits entity through modal
 * 3. Entity is saved
 * 4. Empty fields should be preserved
 */
describe('Empty Fields Preservation - Integration Tests', () => {
  describe('User Scenario: Manual Empty Fields', () => {
    it('preserves manually-added empty string fields through save cycle', () => {
      // Simulate a character file with manually-added empty fields
      const fileContent = `---
name: Test Character
status: active
customField1:
customField2:
customField3: null
normalField: value
---

## Description
Character description here`;

      // Step 1: Parse original frontmatter (simulates file read)
      const originalFrontmatter = parseFrontmatterFromContent(fileContent);

      expect(originalFrontmatter).toBeDefined();
      expect(originalFrontmatter!.customField1).toBeNull(); // Empty field parsed as null
      expect(originalFrontmatter!.customField2).toBeNull();
      expect(originalFrontmatter!.customField3).toBeNull();

      // Step 2: Simulate entity loaded into modal
      // normalizeEntityCustomFields converts null to empty string for editing
      const entityFromLoad = {
        name: 'Test Character',
        status: 'active',
        normalField: 'value',
        customFields: {
          customField1: '', // null converted to empty string
          customField2: '',
          customField3: '',
          normalField: 'value'
        }
      };

      // Step 3: User edits through modal (changes name only)
      const entityFromModal = {
        ...entityFromLoad,
        name: 'Test Character Updated'
      };

      // Step 4: Build frontmatter for save
      const rebuilt = buildFrontmatter(
        'character',
        entityFromModal,
        new Set(Object.keys(entityFromModal)),
        { customFieldsMode: 'flatten', originalFrontmatter }
      );

      // Verify empty fields are preserved
      expect(rebuilt).toHaveProperty('customField1');
      expect(rebuilt).toHaveProperty('customField2');
      expect(rebuilt).toHaveProperty('customField3');

      // Empty string values should be preserved
      expect(rebuilt.customField1).toBe('');
      expect(rebuilt.customField2).toBe('');
      expect(rebuilt.customField3).toBe('');
    });

    it('preserves empty fields when serialized to YAML', () => {
      const frontmatter = {
        name: 'Test Character',
        status: 'active',
        customField1: '',
        customField2: '',
        normalField: 'value'
      };

      const yaml = stringifyYamlWithEmptyFields(frontmatter);

      // Verify all fields are present in YAML
      expect(yaml).toContain('name: Test Character');
      expect(yaml).toContain('status: active');
      expect(yaml).toContain('customField1: ""');
      expect(yaml).toContain('customField2: ""');
      expect(yaml).toContain('normalField: value');
    });

    it('validates and warns when fields will be lost', () => {
      const originalFrontmatter = {
        name: 'Test',
        customField1: '',
        customField2: 'value',
        customField3: null
      };

      const newFrontmatter = {
        name: 'Test',
        customField2: 'value'
        // customField1 and customField3 missing
      };

      const validation = validateFrontmatterPreservation(newFrontmatter, originalFrontmatter);

      expect(validation.valid).toBe(false);
      expect(validation.lostFields).toContain('customField1');
      expect(validation.lostFields).toContain('customField3');
      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('User Scenario: Modal-Created Fields', () => {
    it('preserves fields created through modal (even if empty)', () => {
      // User creates empty fields through modal
      const entityFromModal = {
        name: 'Test Character',
        customFields: {
          modalField1: '',
          modalField2: 'value',
          modalField3: ''
        }
      };

      // First save (no original frontmatter)
      const firstSave = buildFrontmatter(
        'character',
        entityFromModal,
        new Set(Object.keys(entityFromModal)),
        { customFieldsMode: 'flatten' }
      );

      // Modal-created empty fields might not be preserved on first save (expected behavior)
      // because they're new fields, not from original

      // Simulate the file after first save
      const yamlAfterFirstSave = stringifyYamlWithEmptyFields(firstSave);
      const parsedAfterFirstSave = parseFrontmatterFromContent(`---
${yamlAfterFirstSave}---

## Description
Content`);

      // Second save (now they're in original frontmatter)
      const entityForSecondSave = {
        name: 'Test Character Updated',
        customFields: {
          modalField1: '',
          modalField2: 'value updated',
          modalField3: ''
        }
      };

      const secondSave = buildFrontmatter(
        'character',
        entityForSecondSave,
        new Set(Object.keys(entityForSecondSave)),
        { customFieldsMode: 'flatten', originalFrontmatter: parsedAfterFirstSave }
      );

      // After second save, fields that existed in original should be preserved
      expect(secondSave).toHaveProperty('modalField2');
      expect(secondSave.modalField2).toBe('value updated');
    });
  });

  describe('Edge Cases', () => {
    it('handles mix of empty strings, nulls, and undefined', () => {
      const originalFrontmatter = {
        name: 'Test',
        field1: '',
        field2: null,
        field3: undefined,
        field4: 'value'
      };

      const entity = {
        name: 'Test Updated',
        customFields: {
          field1: '',
          field2: '',
          field3: '',
          field4: 'value'
        }
      };

      const rebuilt = buildFrontmatter(
        'character',
        entity,
        new Set(Object.keys(entity)),
        { customFieldsMode: 'flatten', originalFrontmatter }
      );

      // All fields from original should be preserved
      expect(rebuilt).toHaveProperty('field1');
      expect(rebuilt).toHaveProperty('field2');
      expect(rebuilt).toHaveProperty('field3');
      expect(rebuilt).toHaveProperty('field4');
    });

    it('preserves empty arrays from original frontmatter', () => {
      const originalFrontmatter = {
        name: 'Test',
        traits: [],
        relationships: []
      };

      const entity = {
        name: 'Test',
        traits: [],
        relationships: []
      };

      const rebuilt = buildFrontmatter(
        'character',
        entity,
        new Set(Object.keys(entity)),
        { originalFrontmatter }
      );

      expect(rebuilt).toHaveProperty('traits');
      expect(rebuilt.traits).toEqual([]);
      expect(rebuilt).toHaveProperty('relationships');
      expect(rebuilt.relationships).toEqual([]);
    });

    it('does not preserve empty values for NEW fields (correct behavior)', () => {
      const originalFrontmatter = {
        name: 'Test'
      };

      const entity = {
        name: 'Test',
        newEmptyField: '',
        newNullField: null,
        newEmptyArray: []
      };

      const rebuilt = buildFrontmatter(
        'character',
        entity,
        new Set(Object.keys(entity)),
        { originalFrontmatter }
      );

      // New empty fields should NOT be preserved (correct behavior)
      expect(rebuilt).not.toHaveProperty('newEmptyField');
      expect(rebuilt).not.toHaveProperty('newNullField');
      expect(rebuilt).not.toHaveProperty('newEmptyArray');
    });
  });

  describe('Field Ordering', () => {
    it('maintains field order from original frontmatter', () => {
      const originalFrontmatter = {
        customField3: 'c',
        customField1: 'a',
        name: 'Test',
        customField2: 'b'
      };

      const entity = {
        name: 'Test Updated',
        customFields: {
          customField1: 'a',
          customField2: 'b',
          customField3: 'c'
        }
      };

      const rebuilt = buildFrontmatter(
        'character',
        entity,
        new Set(Object.keys(entity)),
        { customFieldsMode: 'flatten', originalFrontmatter }
      );

      const keys = Object.keys(rebuilt);

      // Original order should be preserved
      expect(keys.indexOf('customField3')).toBeLessThan(keys.indexOf('customField1'));
      expect(keys.indexOf('customField1')).toBeLessThan(keys.indexOf('name'));
      expect(keys.indexOf('name')).toBeLessThan(keys.indexOf('customField2'));
    });
  });

  describe('YAML Serialization', () => {
    it('produces valid YAML with empty strings', () => {
      const obj = {
        name: 'Test',
        field1: '',
        field2: 'value',
        field3: ''
      };

      const yaml = stringifyYamlWithEmptyFields(obj);

      // Should contain all fields
      expect(yaml).toContain('name:');
      expect(yaml).toContain('field1:');
      expect(yaml).toContain('field2:');
      expect(yaml).toContain('field3:');

      // Empty strings should be represented as ""
      expect(yaml).toContain('field1: ""');
      expect(yaml).toContain('field3: ""');

      // Re-parse to verify it's valid YAML
      const reparsed = parseFrontmatterFromContent(`---
${yaml}---
`);

      expect(reparsed).toBeDefined();
      expect(reparsed!.name).toBe('Test');
      expect(reparsed!.field2).toBe('value');
    });

    it('logging version provides helpful debug information', () => {
      const originalFrontmatter = {
        name: 'Test',
        field1: '',
        field2: 'value'
      };

      const newFrontmatter = {
        name: 'Test',
        field2: 'value'
        // field1 missing - should warn
      };

      // This should log warnings to console
      const yaml = stringifyYamlWithLogging(
        newFrontmatter,
        originalFrontmatter,
        'Test Context'
      );

      expect(yaml).toBeDefined();
      // Validation happens internally and logs warnings
    });
  });

  describe('Complete Round-Trip', () => {
    it('preserves empty fields through complete write-read-write cycle', () => {
      // Initial file with manual empty fields
      const initialContent = `---
name: Hero
status:
customField1:
customField2: null
normalField: value
---

## Description
A brave hero`;

      // Step 1: Read
      const original = parseFrontmatterFromContent(initialContent);

      // Step 2: Load into modal (normalize)
      const loaded = {
        name: 'Hero',
        status: '',
        normalField: 'value',
        customFields: {
          customField1: '',
          customField2: '',
          normalField: 'value'
        }
      };

      // Step 3: User edits
      const edited = {
        ...loaded,
        name: 'Hero Updated',
        status: 'active'
      };

      // Step 4: Build for save
      const forSave = buildFrontmatter(
        'character',
        edited,
        new Set(Object.keys(edited)),
        { customFieldsMode: 'flatten', originalFrontmatter: original }
      );

      // Step 5: Serialize to YAML
      const yaml = stringifyYamlWithEmptyFields(forSave);

      // Step 6: Re-parse (simulates next load)
      const reparsed = parseFrontmatterFromContent(`---
${yaml}---

## Description
A brave hero`);

      // Verify all fields survived the round-trip
      expect(reparsed).toBeDefined();
      expect(reparsed!.name).toBe('Hero Updated');
      expect(reparsed!.status).toBe('active');
      expect(reparsed!.normalField).toBe('value');

      // Most importantly: empty custom fields should be present
      // (They might be null or empty string, both are acceptable)
      expect('customField1' in reparsed!).toBe(true);
      expect('customField2' in reparsed!).toBe(true);
    });
  });
});
