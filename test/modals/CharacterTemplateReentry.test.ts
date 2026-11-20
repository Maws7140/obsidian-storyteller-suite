import { describe, it, expect, vi } from 'vitest';

// A DOM stand-in: every property is callable and returns another node, and
// every createEl/createDiv/createSpan call is recorded so a test can count
// what a render put on screen.
const recorded = vi.hoisted(() => ({ elements: [] as Array<{ tag: string; opts: any }> }));

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  function makeNode(): any {
    const fn: any = function () { return makeNode(); };
    const node: any = new Proxy(fn, {
      apply: () => makeNode(),
      get: (_t, key) => {
        if (key === 'then') return undefined;
        if (key === 'createEl') return (tag: string, opts?: any) => { recorded.elements.push({ tag, opts }); return makeNode(); };
        if (key === 'createDiv') return (opts?: any) => { recorded.elements.push({ tag: 'div', opts }); return makeNode(); };
        if (key === 'createSpan') return (opts?: any) => { recorded.elements.push({ tag: 'span', opts }); return makeNode(); };
        if (key === Symbol.toPrimitive) return () => '';
        return makeNode();
      },
      set: () => true,
    });
    return node;
  }
  class Stub { constructor(..._args: unknown[]) {} }
  class Notice { constructor(_message: string) {} }
  class Modal {
    app: unknown;
    modalEl: any = makeNode();
    contentEl: any = makeNode();
    constructor(app: unknown) { this.app = app; }
    open() {}
    close() {}
    onOpen() {}
  }
  // Chainable like Obsidian's Setting: builder calls return the setting, and
  // then() runs its callback with the setting, as CharacterModal uses it.
  class Setting {
    settingEl: any = makeNode();
    descEl: any = makeNode();
    constructor(_el: unknown) {}
    setName() { return this; }
    setDesc() { return this; }
    setHeading() { return this; }
    setClass() { return this; }
    addText(cb?: (c: any) => void) { cb?.(makeNode()); return this; }
    addTextArea(cb?: (c: any) => void) { cb?.(makeNode()); return this; }
    addDropdown(cb?: (c: any) => void) { cb?.(makeNode()); return this; }
    addToggle(cb?: (c: any) => void) { cb?.(makeNode()); return this; }
    addButton(cb?: (c: any) => void) { cb?.(makeNode()); return this; }
    addExtraButton(cb?: (c: any) => void) { cb?.(makeNode()); return this; }
    then(cb?: (s: unknown) => void) { cb?.(this); return this; }
  }
  class ButtonComponent { constructor(_el: unknown) { return makeNode(); } }
  const overrides: Record<string, unknown> = { Notice, Modal, Setting, ButtonComponent, setIcon: () => {} };
  return new Proxy(base, {
    get: (target: any, key: any) => (key in overrides ? overrides[key] : key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});

// The template application dialog "submits" once, the way a user would.
vi.mock('../../src/modals/TemplateApplicationModal', () => ({
  TemplateApplicationModal: class {
    onSubmit: (values: unknown, names: unknown) => void;
    constructor(_app: unknown, _plugin: unknown, _template: unknown, onSubmit: (values: unknown, names: unknown) => void) {
      this.onSubmit = onSubmit;
    }
    open() { setTimeout(() => this.onSubmit({}, []), 0); }
  },
}));

/**
 * A new character with a default template that has variables. Applying the
 * template re-renders the modal while the first render is still awaiting, so
 * the old render used to finish too and draw a second footer and a second
 * free-form section.
 */
describe('default template on a new character renders once', () => {
  it('draws one footer and one free-form section', async () => {
    const { CharacterModal } = await import('../../src/modals/CharacterModal');
    recorded.elements.length = 0;
    const template = { id: 'tpl', name: 'Hero', variables: [{ name: 'x' }], entities: [] };
    const plugin: any = {
      app: { workspace: { on: () => ({}), offref: () => {}, onLayoutReady: () => {} }, vault: {}, metadataCache: {} },
      settings: { defaultTemplates: { character: 'tpl' }, customFieldsMode: 'flatten', sectionFieldsInFrontmatter: {} },
      templateManager: { getTemplate: () => template },
      getSeedableDefaultCustomFields: () => [],
      getCustomFieldDefinitions: () => [],
      getGroups: () => [],
      listCharacters: async () => [],
      listCultures: async () => [],
      listPlotItems: async () => [],
      listEconomies: async () => [],
      listLocations: async () => [],
      listEvents: async () => [],
      listChapters: async () => [],
      listScenes: async () => [],
      listItems: async () => [],
    };
    const modal: any = new CharacterModal({} as any, plugin, null, async () => {});
    modal.applyTemplateToCharacterWithVariables = async () => { modal.character.name = 'Aria'; };
    const renderSpy = vi.spyOn(modal.customFieldsEditor, 'renderFreeFormSection');

    await modal.onOpen();
    await new Promise(resolve => setTimeout(resolve, 20));

    const footers = recorded.elements.filter(e => e.opts?.text === 'Create character');
    expect(footers).toHaveLength(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
