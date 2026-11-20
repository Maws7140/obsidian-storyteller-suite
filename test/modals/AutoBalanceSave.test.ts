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
 * A balance computed from a ```ledger block is derived data. Saving the note
 * must not freeze it into frontmatter, or later ledger lines stop counting.
 * A balance the user typed in the modal is kept.
 */
const PATH = 'Stories/S/Characters/Aria.md';

function noteWith(ledgerLines: string[]): string {
  return [
    '---',
    'storyteller-type: character',
    'storyteller-id: c1',
    'storyteller-story-id: s1',
    'name: Aria',
    '---',
    '',
    '## Description',
    '',
    'A bard.',
    '',
    '```ledger',
    ...ledgerLines,
    '```',
    '',
  ].join('\n');
}

function makePlugin(initial: string) {
  const file = new TFile(PATH);
  const state = { content: initial };
  const plugin: any = Object.create((StorytellerSuitePlugin as any).prototype);
  Object.assign(plugin, {
    settings: { customFieldsMode: 'flatten', sectionFieldsInFrontmatter: {}, sectionFieldsReleasedToBody: {}, groups: [] },
    warnedMalformedFiles: new Set<string>(),
    warnedMissingNameFiles: new Set<string>(),
    ensureFolder: async () => {},
    getEntityFolder: () => 'Stories/S/Characters',
    getCustomFieldDefinitions: () => [],
    invalidateFrontmatterReferenceIndexes: () => {},
    app: {
      vault: {
        adapter: { exists: async () => true },
        getAbstractFileByPath: (p: string) => (p === PATH ? file : null),
        cachedRead: async () => state.content,
        modify: async (_f: unknown, content: string) => { state.content = content; },
        create: async (_p: string, content: string) => { state.content = content; },
      },
      metadataCache: { getFileCache: () => null, resolvedLinks: {}, trigger: () => {} },
    },
  });
  return { plugin, file, state };
}

async function load(plugin: any, file: TFile) {
  return plugin.parseFile(file, { name: '' }, 'character');
}

describe('ledger-derived balance follows the ledger', () => {
  it('recomputes the balance after a save when ledger lines are added later', async () => {
    const { plugin, file, state } = makePlugin(noteWith(['+100gp | Found gold']));
    const first = await load(plugin, file);
    expect(first.balance).toBe('10pp');
    await plugin.saveCharacter(first);
    expect(state.content).not.toMatch(/^balance:/m);
    expect(state.content).not.toMatch(/balanceAuto/);

    state.content = state.content.replace('+100gp | Found gold', '+100gp | Found gold\n+50gp | Sold rope');
    const second = await load(plugin, file);
    expect(second.balance).toBe('15pp');
  });

  it('keeps a balance the user typed in the modal', async () => {
    const { plugin, file, state } = makePlugin(noteWith(['+100gp | Found gold']));
    const parsed = await load(plugin, file);
    parsed.balance = '5gp';
    parsed.balanceAuto = false;
    await plugin.saveCharacter(parsed);
    expect(state.content).toMatch(/^balance: "?5gp"?$/m);
    const reread = await load(plugin, file);
    expect(reread.balance).toBe('5gp');
  });

  it('keeps a typed balance on a note without a ledger', async () => {
    const { plugin, file } = makePlugin(['---', 'storyteller-type: character', 'storyteller-id: c1', 'storyteller-story-id: s1', 'name: Aria', 'balance: 20gp', '---', '', '## Description', '', 'A bard.', ''].join('\n'));
    const parsed = await load(plugin, file);
    expect(parsed.balance).toBe('20gp');
    await plugin.saveCharacter(parsed);
    const reread = await load(plugin, file);
    expect(reread.balance).toBe('20gp');
  });
});
