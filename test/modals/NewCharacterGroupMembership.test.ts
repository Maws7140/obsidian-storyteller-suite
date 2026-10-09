import { describe, it, expect, vi } from 'vitest';
import StorytellerSuitePlugin from '../../src/main';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  function makeNode(): any {
    const fn: any = function () { return makeNode(); };
    return new Proxy(fn, {
      apply: () => makeNode(),
      get: (_t, key) => (key === 'then' ? undefined : makeNode()),
      set: () => true,
    });
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
  const overrides: Record<string, unknown> = { Notice, Modal };
  return new Proxy(base, {
    get: (target: any, key: any) => (key in overrides ? overrides[key] : key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});

/**
 * Group membership is keyed by the character's id. A new character used to be
 * keyed by its name until its first save, so removing it from the group after
 * the save matched nothing and the membership stayed.
 */
describe('a new character can leave a group after it is saved', () => {
  it('removes the membership recorded before the first save', async () => {
    const { CharacterModal } = await import('../../src/modals/CharacterModal');
    const group: any = { id: 'g1', storyId: 's1', name: 'Fellowship', members: [], tags: [] };
    const plugin: any = Object.create((StorytellerSuitePlugin as any).prototype);
    Object.assign(plugin, {
      app: { workspace: { on: () => ({}), offref: () => {} }, vault: {}, metadataCache: {} },
      settings: { groups: [group], customFieldsMode: 'flatten', sectionFieldsInFrontmatter: {} },
      getActiveStory: () => ({ id: 's1' }),
      getSeedableDefaultCustomFields: () => [],
      getCustomFieldDefinitions: () => [],
      addGroupIdToEntity: async () => {},
      removeGroupIdFromEntity: async () => {},
      saveSettings: async () => {},
      saveGroupToFile: async () => {},
      emitGroupsChanged: () => {},
    });

    const modal: any = new CharacterModal({} as any, plugin, null, async () => {});
    modal.character.name = 'Aria';
    await (modal.groupSelector as any).persistAdd('g1');

    // The first save assigns the id (saveCharacter keeps an id that is already set).
    if (!modal.character.id) modal.character.id = 'saved-id';

    const reopened: any = new CharacterModal({} as any, plugin, { ...modal.character }, async () => {});
    await (reopened.groupSelector as any).persistRemove('g1');

    expect(group.members).toEqual([]);
  });
});
