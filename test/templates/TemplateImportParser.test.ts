import { describe, expect, it } from 'vitest';
import { parseTemplateImportContent } from '../../src/templates/TemplateImportParser';
import { createCustomizedTemplateCopy } from '../../src/templates/TemplateCustomization';
import type { Template } from '../../src/templates/TemplateTypes';

function createTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'source-template',
    name: 'Source template',
    description: 'A template for tests',
    genre: 'fantasy',
    category: 'full-world',
    version: '1.0.0',
    author: 'Tester',
    isBuiltIn: false,
    isEditable: true,
    created: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    tags: [],
    entities: {
      characters: [{ templateId: 'hero', name: 'Hero' }],
    },
    ...overrides,
  } as Template;
}

describe('parseTemplateImportContent', () => {
  it('rejects empty content without throwing', () => {
    const result = parseTemplateImportContent('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed JSON with a clear message', () => {
    const result = parseTemplateImportContent('{ not json');
    expect(result).toEqual({ ok: false, error: 'the file is not valid JSON' });
  });

  it('rejects JSON that is not an object', () => {
    expect(parseTemplateImportContent('[1, 2, 3]').ok).toBe(false);
    expect(parseTemplateImportContent('"text"').ok).toBe(false);
    expect(parseTemplateImportContent('null').ok).toBe(false);
  });

  it('rejects a file with neither a template nor a package', () => {
    const result = parseTemplateImportContent(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
  });

  it('accepts a single-template export', () => {
    const content = JSON.stringify({
      template: createTemplate(),
      exportVersion: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
    });

    const result = parseTemplateImportContent(content);

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'export') {
      expect(result.data.template.name).toBe('Source template');
      expect(result.data.template.entities.characters?.[0].templateId).toBe('hero');
    } else {
      throw new Error('expected an export result');
    }
  });

  it('rejects an export whose template has no name', () => {
    const content = JSON.stringify({
      template: createTemplate({ name: '' }),
      exportVersion: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
    });

    const result = parseTemplateImportContent(content);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Template name is required');
    }
  });

  it('rejects an export whose template is missing entities', () => {
    const template = { ...createTemplate(), entities: undefined };
    const result = parseTemplateImportContent(
      JSON.stringify({ template, exportVersion: '1.0.0', exportedAt: 'now' })
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a shared template package with a supported version', () => {
    const content = JSON.stringify({
      packageVersion: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      manifest: { name: 'Pack', author: 'Tester' },
      templates: [createTemplate()],
    });

    const result = parseTemplateImportContent(content);

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'package') {
      expect(result.sharedPackage.templates).toHaveLength(1);
    } else {
      throw new Error('expected a package result');
    }
  });

  it('rejects a package with an unsupported version', () => {
    const content = JSON.stringify({
      packageVersion: '9.9.9',
      templates: [createTemplate()],
    });
    const result = parseTemplateImportContent(content);
    expect(result).toEqual({ ok: false, error: 'unsupported template package version' });
  });

  it('rejects an empty package', () => {
    const content = JSON.stringify({ packageVersion: '1.0.0', templates: [] });
    expect(parseTemplateImportContent(content).ok).toBe(false);
  });

  it('rejects a package containing an invalid template', () => {
    const content = JSON.stringify({
      packageVersion: '1.0.0',
      templates: [createTemplate(), createTemplate({ name: '' })],
    });
    const result = parseTemplateImportContent(content);
    expect(result.ok).toBe(false);
  });
});

describe('createCustomizedTemplateCopy', () => {
  const variables: Template['variables'] = [
    { name: 'kingdom', label: 'Kingdom', type: 'text', defaultValue: 'Eldor' },
    { name: 'age', label: 'Age', type: 'number', defaultValue: 10 },
  ];

  it('applies supplied variable values as new defaults', () => {
    const template = createTemplate({ variables });

    const copy = createCustomizedTemplateCopy(template, { kingdom: 'Varn' });

    expect(copy.variables?.[0].defaultValue).toBe('Varn');
    expect(copy.variables?.[1].defaultValue).toBe(10);
  });

  it('does not mutate the stored template', () => {
    const template = createTemplate({ variables: structuredClone(variables) });
    const before = JSON.stringify(template);

    const copy = createCustomizedTemplateCopy(template, { kingdom: 'Varn', age: 42 });

    expect(JSON.stringify(template)).toBe(before);
    expect(copy).not.toBe(template);
    expect(copy.entities).not.toBe(template.entities);
  });

  it('returns an equivalent copy when no variables exist', () => {
    const template = createTemplate();
    const copy = createCustomizedTemplateCopy(template, {});
    expect(copy).toEqual(template);
    expect(copy).not.toBe(template);
  });

  it('ignores values for variables the template does not declare', () => {
    const template = createTemplate({ variables: structuredClone(variables) });
    const copy = createCustomizedTemplateCopy(template, { unknown: 'x' });
    expect(copy.variables).toEqual(variables);
  });
});
