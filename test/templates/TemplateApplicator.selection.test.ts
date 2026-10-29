import { describe, expect, it } from 'vitest';
import { TemplateApplicator } from '../../src/templates/TemplateApplicator';
import type { Template, TemplateEntitySelection } from '../../src/templates/TemplateTypes';

type ApplicatorInternals = {
  filterEntities: (entities: Record<string, unknown[]>, selection?: TemplateEntitySelection) => Record<string, unknown[]>;
  applyExistingEntityLinks: (
    template: Template,
    created: Record<string, unknown[]>,
    selections?: Record<string, string | string[]>,
    includeEntities?: TemplateEntitySelection
  ) => void;
};

function createApplicator(): ApplicatorInternals {
  return new TemplateApplicator({} as never) as unknown as ApplicatorInternals;
}

const entities = {
  characters: [{ templateId: 'CHAR_001' }, { templateId: 'CHAR_002' }],
  locations: [{ templateId: 'LOC_001' }]
};

describe('TemplateApplicator entity selection', () => {
  it('keeps every entity when no selection is given', () => {
    const filtered = createApplicator().filterEntities(entities);
    expect(filtered.characters).toHaveLength(2);
    expect(filtered.locations).toHaveLength(1);
  });

  it('keeps only the selected templateIds per collection', () => {
    const filtered = createApplicator().filterEntities(entities, {
      characters: ['CHAR_002'],
      locations: []
    });
    expect(filtered.characters).toEqual([{ templateId: 'CHAR_002' }]);
    expect(filtered.locations).toEqual([]);
  });

  it('does not create an excluded source entity from an existing-entity link', () => {
    const template = {
      id: 'tpl',
      existingEntityLinks: [{
        id: 'link-1',
        sourceTemplateId: 'CHAR_001',
        sourceType: 'character',
        targetType: 'location',
        targetField: 'currentLocationId',
        label: 'Current location',
        required: false,
        multiple: false,
        valueKind: 'id'
      }]
    } as unknown as Template;
    const created = { characters: [{ id: 'real-2', name: 'Mira' }] };
    const selections = { 'link-1': 'vault-loc-9' };

    createApplicator().applyExistingEntityLinks(template, created, selections, {
      characters: ['CHAR_002']
    });
    expect(created.characters[0]).not.toHaveProperty('currentLocationId');

    createApplicator().applyExistingEntityLinks(template, created, selections);
    expect(created.characters[0]).toHaveProperty('currentLocationId', 'vault-loc-9');
  });
});
