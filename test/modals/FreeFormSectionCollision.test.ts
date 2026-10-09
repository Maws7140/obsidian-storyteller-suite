import { describe, it, expect, vi } from 'vitest';
import { EntityCustomFieldsEditor } from '../../src/modals/entity/EntityCustomFieldsEditor';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  class Stub { constructor(..._args: unknown[]) {} }
  return new Proxy(base, {
    get: (target: any, key: any) => (key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});

/**
 * A free-form row named like a body section must be refused. Otherwise the row
 * is written as frontmatter, the frontmatter value wins over the body section
 * on read, and the next save writes it into the section.
 */
describe('free-form rows named like body section fields', () => {
  it('a free-form row named "description" is refused', () => {
    const editor = new EntityCustomFieldsEditor({} as any, 'character', { description: 'Short summary' });
    expect(editor.getFields()).toBeNull();
  });

  it('a free-form row named after a section field stored as frontmatter is refused', () => {
    const configured = { Notes: 'x' };
    const editor = new EntityCustomFieldsEditor({} as any, 'character', configured, {
      sectionFields: ['Notes'],
    });
    expect(editor.getFields()).toBeNull();
    const unconfigured = new EntityCustomFieldsEditor({} as any, 'character', configured);
    expect(unconfigured.getFields()).toEqual(configured);
  });

  it('a free-form row named like a built-in key is refused', () => {
    const editor = new EntityCustomFieldsEditor({} as any, 'character', { status: 'x' });
    expect(editor.getFields()).toBeNull();
  });

  it('an ordinary free-form row is still accepted', () => {
    const editor = new EntityCustomFieldsEditor({} as any, 'character', { Mood: 'happy' });
    expect(editor.getFields()).toEqual({ Mood: 'happy' });
  });
});
