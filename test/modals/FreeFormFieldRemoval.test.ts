import { describe, it, expect, vi } from 'vitest';

// main.ts imports the modal classes, which extend Obsidian classes the shared
// mock does not provide. Fill the gaps with inert stand-ins.
vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  class Stub { constructor(..._args: unknown[]) {} }
  return new Proxy(base, {
    get: (target: any, key: any) => (key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});
import StorytellerSuitePlugin from '../../src/main';
import { removedFreeFormKeys } from '../../src/modals/entity/CustomFieldDefinitions';

/**
 * Deleting or renaming a free-form custom field must persist. buildFrontmatter
 * re-adds every key of the original frontmatter, so the save path has to pass
 * the removed keys as omitOriginalKeys.
 */

function fakePlugin(): any {
  const fake: any = Object.create(StorytellerSuitePlugin.prototype);
  Object.assign(fake, {
    settings: { customFieldsMode: 'flatten', customFieldDefinitions: {}, sectionFieldsInFrontmatter: {} },
    getCustomFieldDefinitions: () => [],
    invalidateFrontmatterReferenceIndexes: () => {},
    resolveFrontmatterReferenceName: async (_type: string, _id: unknown, name?: unknown) => name,
    stripWikiLinkValue: (v: unknown) => (typeof v === 'string' ? v.replace(/^\[\[|\]\]$/g, '') : undefined),
  });
  return fake;
}

const buildLinked = (plugin: any, src: Record<string, unknown>, original: Record<string, unknown>) =>
  (StorytellerSuitePlugin.prototype as any).buildLinkedFrontmatter.call(plugin, 'character', src, original);

describe('free-form custom field removal persists on save', () => {
  it('a row the user deleted does not come back on save', async () => {
    // Note on disk: Mood was promoted to top level by flatten mode.
    const original = { entityType: 'character', id: 'c1', name: 'Aria', Mood: 'happy' };
    // Modal state after the user clicked the trash button on Mood.
    const src = { name: 'Aria', id: 'c1', customFields: {} as Record<string, string> };
    const fm = await buildLinked(fakePlugin(), src, original);
    expect(fm).not.toHaveProperty('Mood');
  });

  it('a renamed row writes the new name and drops the old one', async () => {
    const original = { entityType: 'character', id: 'c1', name: 'Aria', Mood: 'happy' };
    const src = { name: 'Aria', id: 'c1', customFields: { Feeling: 'happy' } as Record<string, string> };
    const fm = await buildLinked(fakePlugin(), src, original);
    expect(fm).not.toHaveProperty('Mood');
    expect(fm.Feeling).toBe('happy');
  });

  it('a save without a customFields map removes nothing', async () => {
    const original = { entityType: 'character', id: 'c1', name: 'Aria', Mood: 'happy' };
    const src = { name: 'Aria', id: 'c1' };
    const fm = await buildLinked(fakePlugin(), src, original);
    expect(fm.Mood).toBe('happy');
  });

  it('removedFreeFormKeys lists loaded free-form keys absent from the new map', () => {
    const original = { entityType: 'character', id: 'c1', name: 'Aria', Mood: 'happy', Rank: 'Captain', aliases: ['A'] };
    expect(removedFreeFormKeys('character', original, { Rank: 'Captain' })).toEqual(['Mood']);
    expect(removedFreeFormKeys('character', original, undefined)).toEqual([]);
  });
});
