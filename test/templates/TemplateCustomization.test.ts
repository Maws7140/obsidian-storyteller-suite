import { describe, expect, it } from 'vitest';
import { buildFieldOverridesFromEntityFileNames } from '../../src/templates/TemplateCustomization';

describe('buildFieldOverridesFromEntityFileNames', () => {
  it('maps each chosen file name to an applicator name override', () => {
    const overrides = buildFieldOverridesFromEntityFileNames([
      { templateId: 'CHAR_001', entityType: 'character', fileName: 'Aldric Stone' },
      { templateId: 'LOC_001', entityType: 'location', fileName: 'Castle' }
    ]);

    expect(overrides.get('CHAR_001')).toEqual({ name: 'Aldric Stone' });
    expect(overrides.get('LOC_001')).toEqual({ name: 'Castle' });
    expect(overrides.size).toBe(2);
  });

  it('leaves out entries with an empty file name', () => {
    const overrides = buildFieldOverridesFromEntityFileNames([
      { templateId: 'CHAR_001', entityType: 'character', fileName: '' }
    ]);
    expect(overrides.has('CHAR_001')).toBe(false);
  });
});
