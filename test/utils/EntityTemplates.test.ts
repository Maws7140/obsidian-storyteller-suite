import { describe, it, expect } from 'vitest';
import { getTemplateSections } from '../../src/utils/EntityTemplates';

describe('EntityTemplates', () => {
  it('always includes all standard sections, even if provided is empty', () => {
    const sections = getTemplateSections('character', {});
    expect(sections).toHaveProperty('Description', '');
    expect(sections).toHaveProperty('Backstory', '');
    expect(Object.keys(sections).length).toBe(2);
  });

  it('overrides template with provided non-empty sections', () => {
    const provided = { Description: 'Test desc', Backstory: '' };
    const sections = getTemplateSections('character', provided);
    expect(sections.Description).toBe('Test desc');
    expect(sections.Backstory).toBe('');
  });
});


