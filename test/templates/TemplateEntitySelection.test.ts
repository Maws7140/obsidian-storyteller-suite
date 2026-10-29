import { describe, expect, it } from 'vitest';
import type { Template } from '../../src/templates/TemplateTypes';
import {
  buildIncludeSelection,
  describeExcludedReferences,
  findExcludedReferences,
  getTemplateEntityName,
  listTemplateEntities
} from '../../src/templates/TemplateEntitySelection';

function createTemplate(entities: Record<string, unknown[]>): Template {
  return {
    id: 'tpl',
    name: 'Test template',
    entities,
    variables: [],
    entityTypes: []
  } as unknown as Template;
}

const sampleTemplate = createTemplate({
  characters: [
    { templateId: 'CHAR_001', name: 'Aldric', locations: ['LOC_001'] },
    { templateId: 'CHAR_002', yamlContent: 'name: "Mira"\nlocations:\n  - LOC_002\n' }
  ],
  locations: [
    { templateId: 'LOC_001', name: 'Castle' },
    { templateId: 'LOC_002', name: 'Tower' }
  ],
  events: [
    { templateId: 'EVT_001', name: 'Coronation', location: 'Castle', characters: ['CHAR_001'] }
  ]
});

describe('getTemplateEntityName', () => {
  it('prefers the name field and falls back to YAML content', () => {
    expect(getTemplateEntityName({ name: ' Aldric ' })).toBe('Aldric');
    expect(getTemplateEntityName({ yamlContent: 'name: "Mira"\nrole: guard' })).toBe('Mira');
    expect(getTemplateEntityName({})).toBe('');
  });
});

describe('listTemplateEntities', () => {
  it('lists every entity with a templateId in registry order', () => {
    expect(listTemplateEntities(sampleTemplate)).toEqual([
      { templateId: 'CHAR_001', entityType: 'character', name: 'Aldric' },
      { templateId: 'CHAR_002', entityType: 'character', name: 'Mira' },
      { templateId: 'LOC_001', entityType: 'location', name: 'Castle' },
      { templateId: 'LOC_002', entityType: 'location', name: 'Tower' },
      { templateId: 'EVT_001', entityType: 'event', name: 'Coronation' }
    ]);
  });

  it('skips entities without a templateId', () => {
    const template = createTemplate({ characters: [{ name: 'Nobody' }] });
    expect(listTemplateEntities(template)).toEqual([]);
  });
});

describe('buildIncludeSelection', () => {
  it('keeps every entity when nothing is excluded', () => {
    const selection = buildIncludeSelection(listTemplateEntities(sampleTemplate), new Set());
    expect(selection.characters).toEqual(['CHAR_001', 'CHAR_002']);
    expect(selection.locations).toEqual(['LOC_001', 'LOC_002']);
    expect(selection.events).toEqual(['EVT_001']);
  });

  it('lists only kept templateIds, and keeps an empty list for a fully excluded type', () => {
    const selection = buildIncludeSelection(
      listTemplateEntities(sampleTemplate),
      new Set(['CHAR_002', 'LOC_001', 'LOC_002', 'EVT_001'])
    );
    expect(selection.characters).toEqual(['CHAR_001']);
    expect(selection.locations).toEqual([]);
    expect(selection.events).toEqual([]);
  });
});

describe('findExcludedReferences', () => {
  it('returns nothing when no entity is excluded', () => {
    expect(findExcludedReferences(sampleTemplate, new Set())).toEqual([]);
  });

  it('flags a kept entity that references an excluded one by templateId', () => {
    const refs = findExcludedReferences(sampleTemplate, new Set(['LOC_001']));
    expect(refs).toEqual([
      {
        sourceTemplateId: 'CHAR_001',
        sourceName: 'Aldric',
        sourceType: 'character',
        targetTemplateId: 'LOC_001',
        targetName: 'Castle',
        targetType: 'location'
      },
      {
        sourceTemplateId: 'EVT_001',
        sourceName: 'Coronation',
        sourceType: 'event',
        targetTemplateId: 'LOC_001',
        targetName: 'Castle',
        targetType: 'location'
      }
    ]);
  });

  it('matches excluded entities by name and by YAML list items', () => {
    const refs = findExcludedReferences(sampleTemplate, new Set(['CHAR_001']));
    expect(refs.map(ref => `${ref.sourceTemplateId}->${ref.targetTemplateId}`)).toEqual([
      'EVT_001->CHAR_001'
    ]);

    const yamlRefs = findExcludedReferences(sampleTemplate, new Set(['LOC_002']));
    expect(yamlRefs.map(ref => ref.sourceTemplateId)).toEqual(['CHAR_002']);
  });

  it('does not flag excluded entities that refer to kept ones', () => {
    expect(findExcludedReferences(sampleTemplate, new Set(['CHAR_001']))
      .some(ref => ref.sourceTemplateId === 'CHAR_001')).toBe(false);
  });

  it('does not flag a substring mention inside free text', () => {
    const template = createTemplate({
      characters: [{ templateId: 'CHAR_001', name: 'Aldric', description: 'Lives near Castle Hill' }],
      locations: [{ templateId: 'LOC_001', name: 'Castle' }]
    });
    expect(findExcludedReferences(template, new Set(['LOC_001']))).toEqual([]);
  });

  it('uses display names when provided', () => {
    const refs = findExcludedReferences(
      sampleTemplate,
      new Set(['LOC_001']),
      new Map([['LOC_001', 'Old Castle']])
    );
    expect(refs[0].targetName).toBe('Old Castle');
  });
});

describe('describeExcludedReferences', () => {
  it('formats one plain sentence per reference', () => {
    const refs = findExcludedReferences(sampleTemplate, new Set(['LOC_001']));
    expect(describeExcludedReferences(refs)).toEqual([
      'Aldric (Character) refers to Castle (Location), which will not be created.',
      'Coronation (Event) refers to Castle (Location), which will not be created.'
    ]);
  });
});
