import { describe, it, expect, vi } from 'vitest';
import { TFile } from 'obsidian';
import StorytellerSuitePlugin from '../../src/main';

vi.mock('obsidian', async () => {
  const base: any = await import('../__mocks__/obsidian');
  class Stub { constructor(..._args: unknown[]) {} }
  // Records every Notice message so a test can check what the user was told.
  class Notice { static messages: string[] = []; constructor(message: string) { Notice.messages.push(message); } }
  const overrides: Record<string, unknown> = { Notice };
  return new Proxy(base, {
    get: (target: any, key: any) => (key in overrides ? overrides[key] : key in target ? target[key] : (key === 'then' ? undefined : Stub)),
    has: () => true,
  });
});

/**
 * Saving a group rewrites its note. The note's own frontmatter keys and
 * hand-written sections must survive, and a failed write must be reported.
 */
const ON_DISK = [
  '---',
  'storyteller-type: group',
  'storyteller-id: g1',
  'storyteller-story-id: s1',
  'name: Ash Court',
  'aliases:',
  '  - The Ashen',
  'cssclasses: wide',
  '---',
  '',
  '## Description',
  '',
  'Old description',
  '',
  '## Secret Notes',
  '',
  'Hand-written GM notes that must survive.',
  '',
].join('\n');

function makeThis(existingContent: string | null, opts: { failWrite?: boolean } = {}) {
  const path = 'Stories/S/Groups/Ash Court.md';
  const file = new TFile(path);
  const calls: { modify?: string; create?: string } = {};
  const fake: any = {
    invalidateFrontmatterReferenceIndexes: () => {},
    getCustomFieldDefinitions: () => [],
    getEntityFolder: () => 'Stories/S/Groups',
    ensureFolder: async () => {},
    groupFileName: (name: string) => `${name}.md`,
    stripWikiLinkValue: (v: unknown) => (typeof v === 'string' ? v.replace(/^\[\[|\]\]$/g, '') : undefined),
    resolveFrontmatterReferenceName: async (_t: string, _id: string, name?: string) => name,
    app: {
      vault: {
        getAbstractFileByPath: (p: string) => (p === path && existingContent !== null ? file : null),
        cachedRead: async () => existingContent ?? '',
        modify: async (_f: unknown, content: string) => {
          if (opts.failWrite) throw new Error('disk full');
          calls.modify = content;
        },
        create: async (_p: string, content: string) => {
          if (opts.failWrite) throw new Error('disk full');
          calls.create = content;
        },
      },
    },
  };
  return { fake, calls };
}

const group: any = {
  id: 'g1', storyId: 's1', name: 'Ash Court', description: 'New description', members: [], tags: [],
};

describe('saveGroupToFile keeps what the plugin does not own', () => {
  it('keeps unknown frontmatter keys and hand-written sections', async () => {
    const { fake, calls } = makeThis(ON_DISK);
    await (StorytellerSuitePlugin.prototype as any).saveGroupToFile.call(fake, group);
    const written = calls.modify ?? '';
    expect(written).toContain('Secret Notes');
    expect(written).toContain('Hand-written GM notes that must survive.');
    expect(written).toContain('aliases');
    expect(written).toContain('cssclasses: wide');
    expect(written).toContain('New description');
    expect(written).not.toContain('Old description');
  });

  it('removes an owned section whose value was cleared', async () => {
    const { fake, calls } = makeThis(ON_DISK);
    await (StorytellerSuitePlugin.prototype as any).saveGroupToFile.call(fake, { ...group, description: '' });
    expect(calls.modify).not.toContain('## Description');
    expect(calls.modify).toContain('Secret Notes');
  });

  it('writes a new note when none exists', async () => {
    const { fake, calls } = makeThis(null);
    await (StorytellerSuitePlugin.prototype as any).saveGroupToFile.call(fake, group);
    expect(calls.create).toContain('## Description\n\nNew description');
    expect(calls.create).toContain('storyteller-type: group');
  });

  it('reports a write error instead of swallowing it', async () => {
    const { Notice } = await import('obsidian');
    (Notice as any).messages.length = 0;
    const { fake } = makeThis(ON_DISK, { failWrite: true });
    await (StorytellerSuitePlugin.prototype as any).saveGroupToFile.call(fake, group);
    expect((Notice as any).messages.length).toBeGreaterThan(0);
  });

  it('refuses to overwrite a note whose frontmatter cannot be read', async () => {
    const { Notice } = await import('obsidian');
    (Notice as any).messages.length = 0;
    const broken = '---\nname: [unclosed\n---\n\n## Secret Notes\n\nKeep me.\n';
    const { fake, calls } = makeThis(broken);
    await (StorytellerSuitePlugin.prototype as any).saveGroupToFile.call(fake, group);
    expect(calls.modify).toBeUndefined();
    expect((Notice as any).messages.length).toBeGreaterThan(0);
  });
});
