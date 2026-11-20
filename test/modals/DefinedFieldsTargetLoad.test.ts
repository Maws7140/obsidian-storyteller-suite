import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  // Any member of a node returns another node, so the editor's builder chains run.
  function makeNode(): any {
    const fn: any = function () { return makeNode(); };
    return new Proxy(fn, {
      apply: () => makeNode(),
      get: (_t, key) => (key === 'then' ? undefined : makeNode()),
      set: () => true,
    });
  }
  const counts = { addText: 0 };
  class Setting {
    static addTextCalls = () => counts.addText;
    settingEl: any = makeNode();
    controlEl: any = makeNode();
    constructor(_parent: unknown) {}
    setName() { return this; }
    setDesc() { return this; }
    addText(cb: (text: any) => void) { counts.addText++; cb(makeNode()); return this; }
    addTextArea(cb: (text: any) => void) { cb(makeNode()); return this; }
    addButton(cb: (button: any) => void) { cb(makeNode()); return this; }
    addExtraButton(cb: (button: any) => void) { cb(makeNode()); return this; }
  }
  class Notice { constructor(_message: string) {} }
  const overrides: Record<string, unknown> = { Setting, Notice };
  return new Proxy(base, {
    get: (target: any, key: any) => (key in overrides ? overrides[key] : key in target ? target[key] : undefined),
    has: () => true,
  });
});

/**
 * When a link field's note list finishes loading, only the link picker is
 * updated. Rebuilding every defined field used to recreate the text inputs,
 * which dropped focus and the caret from a field the user was typing in.
 */
describe('loading link targets leaves other defined fields in place', () => {
  it('does not rebuild the typed text inputs when the note list arrives', async () => {
    const { EntityCustomFieldsEditor } = await import('../../src/modals/entity/EntityCustomFieldsEditor');
    const { Setting } = await import('obsidian');
    const addTextCalls = (Setting as any).addTextCalls as () => number;

    let resolveTargets!: (names: string[]) => void;
    const listTargetNames = vi.fn(() => new Promise<string[]>(resolve => { resolveTargets = resolve; }));
    const entity: Record<string, unknown> = {};
    const editor = new EntityCustomFieldsEditor({} as any, 'character', {}, {
      definitions: [
        { key: 'nickname', label: 'Nickname', type: 'text' },
        { key: 'mentor', label: 'Mentor', type: 'link', target: 'character' },
      ] as any,
      getEntity: () => entity,
      listTargetNames,
    });

    const makeParent = (): any => new Proxy(function () {} as any, {
      apply: () => makeParent(),
      get: (_t, key) => (key === 'then' ? undefined : makeParent()),
      set: () => true,
    });
    editor.renderDefinedFields(makeParent());
    const beforeLoad = addTextCalls();
    expect(beforeLoad).toBe(1);

    resolveTargets(['Aria', 'Bran']);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(listTargetNames).toHaveBeenCalledWith('character');
    expect(addTextCalls()).toBe(beforeLoad);
  });
});
