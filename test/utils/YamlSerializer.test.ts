import { describe, it, expect } from 'vitest';
import { stringifyYamlWithEmptyFields, validateFrontmatterPreservation } from '../../src/utils/YamlSerializer';

describe('YamlSerializer', () => {
  describe('stringifyYamlWithEmptyFields', () => {
    it('preserves empty string fields', () => {
      const obj = {
        name: 'Test',
        emptyField: '',
        normalField: 'value'
      };

      const yaml = stringifyYamlWithEmptyFields(obj);

      // Empty field should be represented as ""
      expect(yaml).toContain('emptyField: ""');
      expect(yaml).toContain('name: Test');
      expect(yaml).toContain('normalField: value');
    });

    it('handles multiple empty fields', () => {
      const obj = {
        field1: '',
        field2: 'value',
        field3: '',
        field4: '',
        field5: 'another'
      };

      const yaml = stringifyYamlWithEmptyFields(obj);

      expect(yaml).toContain('field1: ""');
      expect(yaml).toContain('field3: ""');
      expect(yaml).toContain('field4: ""');
      expect(yaml).toContain('field2: value');
      expect(yaml).toContain('field5: another');
    });

    it('handles object with no empty fields', () => {
      const obj = {
        name: 'Test',
        value: 'something'
      };

      const yaml = stringifyYamlWithEmptyFields(obj);

      expect(yaml).toContain('name: Test');
      expect(yaml).toContain('value: something');
    });

    it('handles empty object', () => {
      const obj = {};

      const yaml = stringifyYamlWithEmptyFields(obj);

      expect(yaml).toBe('');
    });

    it('handles null and undefined values (non-empty)', () => {
      const obj = {
        name: 'Test',
        nullField: null,
        undefinedField: undefined
      };

      const yaml = stringifyYamlWithEmptyFields(obj);

      // null and undefined are not empty strings, so they're handled by Obsidian's stringifyYaml
      expect(yaml).toContain('name: Test');
    });

    it('handles arrays', () => {
      const obj = {
        name: 'Test',
        emptyField: '',
        traits: ['brave', 'smart']
      };

      const yaml = stringifyYamlWithEmptyFields(obj);

      expect(yaml).toContain('emptyField: ""');
      expect(yaml).toContain('name: Test');
      expect(yaml).toContain('traits:');
    });

    it('handles nested objects', () => {
      const obj = {
        name: 'Test',
        emptyField: '',
        customFields: {
          nested: 'value'
        }
      };

      const yaml = stringifyYamlWithEmptyFields(obj);

      expect(yaml).toContain('emptyField: ""');
      expect(yaml).toContain('name: Test');
    });

    it('escapes field names with special characters correctly', () => {
      const obj = {
        'normal-field': '',
        'field.with.dots': '',
        'field_with_underscores': ''
      };

      const yaml = stringifyYamlWithEmptyFields(obj);

      // All fields should be present with empty string representation
      expect(yaml).toMatch(/normal-field:\s*""/);
      expect(yaml).toMatch(/field\.with\.dots:\s*""/);
      expect(yaml).toMatch(/field_with_underscores:\s*""/);
    });
  });

  describe('validateFrontmatterPreservation', () => {
    it('detects lost fields', () => {
      const original = {
        name: 'Test',
        field1: 'value',
        field2: '',
        field3: 'another'
      };

      const newFm = {
        name: 'Test',
        field1: 'value'
        // field2 and field3 missing
      };

      const result = validateFrontmatterPreservation(newFm, original);

      expect(result.valid).toBe(false);
      expect(result.lostFields).toContain('field2');
      expect(result.lostFields).toContain('field3');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('passes when all fields preserved', () => {
      const original = {
        name: 'Test',
        field1: 'value'
      };

      const newFm = {
        name: 'Test Updated',
        field1: 'value changed',
        newField: 'added'
      };

      const result = validateFrontmatterPreservation(newFm, original);

      expect(result.valid).toBe(true);
      expect(result.lostFields.length).toBe(0);
    });

    it('ignores internal Obsidian fields', () => {
      const original = {
        name: 'Test',
        position: { start: 0, end: 10 }
      };

      const newFm = {
        name: 'Test'
        // position missing, but should be ignored
      };

      const result = validateFrontmatterPreservation(newFm, original);

      expect(result.valid).toBe(true);
      expect(result.lostFields).not.toContain('position');
    });

    it('warns about new empty fields', () => {
      const original = {
        name: 'Test'
      };

      const newFm = {
        name: 'Test',
        newEmptyField: '',
        newNullField: null
      };

      const result = validateFrontmatterPreservation(newFm, original);

      // Should have warnings about risky empty values
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('handles missing original frontmatter', () => {
      const newFm = {
        name: 'Test',
        field1: ''
      };

      const result = validateFrontmatterPreservation(newFm);

      expect(result.valid).toBe(true);
      expect(result.lostFields.length).toBe(0);
    });

    it('detects when only empty fields are lost', () => {
      const original = {
        name: 'Test',
        emptyField1: '',
        emptyField2: null
      };

      const newFm = {
        name: 'Test'
      };

      const result = validateFrontmatterPreservation(newFm, original);

      expect(result.valid).toBe(false);
      expect(result.lostFields).toContain('emptyField1');
      expect(result.lostFields).toContain('emptyField2');
    });
  });
});
