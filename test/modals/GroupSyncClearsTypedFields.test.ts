import { describe, it, expect, vi } from 'vitest';
import { TFile } from 'obsidian';
import StorytellerSuitePlugin from '../../src/main';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  class Stub { constructor(..._args: unknown[]) {} }
  class Notice { constructor(_message: string) {} }
  const overrides: Record<string, unknown> = { Notice };
  return new Proxy(base, {
    get: (target: any, key: any) => (key in overrides ? overrides[key] : key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});

/**
 * A typed group field that is removed from the note must be cleared in memory
 * when the vault sync runs. Object.assign copies only the keys the note has,
 * so the old value used to survive and Save wrote it back.
 */
describe('vault sync clears typed group fields the note no longer has', () => {
  it('sets a typed field absent from the note to undefined', async () => {
    const path = 'Stories/S/Groups/Ash Court.md';
    const file = new TFile(path);
    const content = [
      '---',
      'storyteller-type: group',
      'storyteller-id: g1',
      'storyteller-story-id: s1',
      'name: Ash Court',
      '---',
      '',
      '## Description',
      '',
      'Old',
      '',
    ].join('\n');
    const group: any = { id: 'g1', storyId: 's1', name: 'Ash Court', members: [], tags: [], strength_note: 'x' };
    const plugin: any = Object.create((StorytellerSuitePlugin as any).prototype);
    Object.assign(plugin, {
      settings: { groups: [group] },
      getEntityFolder: () => 'Stories/S/Groups',
      getActiveStory: () => ({ id: 's1' }),
      getCustomFieldDefinitions: (type: string) => (type === 'faction' ? [{ key: 'strength_note', type: 'text' }] : []),
      invalidateFrontmatterReferenceIndexes: () => {},
      saveSettings: async () => {},
      emitGroupsChanged: () => {},
      stripWikiLinkValue: (v: unknown) => (typeof v === 'string' ? v : undefined),
      app: {
        vault: {
          getMarkdownFiles: () => [file],
          cachedRead: async () => content,
        },
        metadataCache: { getFileCache: () => ({ frontmatter: { 'storyteller-type': 'group', 'storyteller-id': 'g1', 'storyteller-story-id': 's1', name: 'Ash Court' } }) },
      },
    });

    await plugin.syncGroupsFromVault();

    expect(group.strength_note).toBeUndefined();
  });
});
