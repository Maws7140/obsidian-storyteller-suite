import { describe, it, expect, vi } from 'vitest';
import { EntityCustomFieldsEditor } from '../../src/modals/entity/EntityCustomFieldsEditor';
import { seedDefaultCustomFields } from '../../src/modals/entity/ModalFieldVisibility';
import { checkDefaultCustomFieldNames } from '../../src/modals/entity/CustomFieldDefinitions';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  class Stub { constructor(..._args: unknown[]) {} }
  return new Proxy(base, {
    get: (target: any, key: any) => (key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});

/**
 * A default custom field named like a built-in key used to be seeded into every
 * new entity, where the editor refused it, so Save did nothing.
 */
describe('default custom field names', () => {
  it('a seeded built-in name does not block Save on a new entity', () => {
    const names = checkDefaultCustomFieldNames('character', ['status', 'intent']).accepted;
    const seeded = seedDefaultCustomFields({}, names);
    const editor = new EntityCustomFieldsEditor({} as any, 'character', seeded);
    expect(editor.getFields()).toEqual({ intent: '' });
  });

  it('names that collide with body sections or defined fields are not seeded', () => {
    const check = checkDefaultCustomFieldNames(
      'character',
      ['description', 'parents', 'mood'],
      [{ key: 'parents', type: 'links', target: 'character' }],
      []
    );
    expect(check.accepted).toEqual(['mood']);
    expect(check.rejected.map(entry => entry.name)).toEqual(['description', 'parents']);
  });

  it('the settings check reports each refused name with a reason', () => {
    const check = checkDefaultCustomFieldNames('character', ['  status ', 'status', '', 'Quest Log']);
    expect(check.accepted).toEqual(['Quest Log']);
    expect(check.rejected).toHaveLength(1);
    expect(check.rejected[0].name).toBe('status');
    expect(check.rejected[0].problem).toMatch(/built-in/);
  });
});
