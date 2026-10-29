import { describe, it, expect, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const debounce = (fn: (...args: any[]) => void, wait: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: any[]) => { if (timer) clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  };
  const merged: any = { ...actual, debounce };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

import StorytellerSuitePlugin from '../../src/main';
import { parseFrontmatterFromContent } from '../../src/yaml/EntitySections';

/**
 * Round trips through the real saveEvent / saveScene and parseFile, against an
 * in-memory vault. Only the vault, the folder helpers and the custom-field lookup are stubbed.
 */
function makePlugin(iconSettings: { timelineIconProperty?: string; timelineIconColorProperty?: string }) {
  const files = new Map<string, string>();
  // A real instance, so class field initialisers (caches, sets) exist.
  const plugin: any = new (StorytellerSuitePlugin as any)({ vault: {}, metadataCache: {}, workspace: {} }, { id: 'x', version: '0' });
  plugin.settings = {
    customFieldsMode: 'flatten',
    sectionFieldsInFrontmatter: {},
    sectionFieldsReleasedToBody: {},
    autoDetectConflicts: false,
    ...iconSettings,
  };
  plugin.ensureEventFolder = async () => {};
  plugin.ensureSceneFolder = async () => {};
  plugin.getEntityFolder = (type: string) => (type === 'event' ? 'Story/Events' : 'Story/Scenes');
  plugin.getCustomFieldDefinitions = () => [];
  plugin.listChapters = async () => [];
  plugin.app = {
    vault: {
      adapter: { exists: async (path: string) => files.has(path) },
      cachedRead: async (file: TFile) => files.get(file.path) ?? '',
      getAbstractFileByPath: (path: string) => (files.has(path) ? new TFile(path) : null),
      create: async (path: string, content: string) => { files.set(path, content); },
      modify: async (file: TFile, content: string) => { files.set(file.path, content); },
      getMarkdownFiles: () => [...files.keys()].map(path => new TFile(path)),
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        const content = files.get(file.path);
        const frontmatter = content === undefined ? undefined : parseFrontmatterFromContent(content);
        return frontmatter ? { frontmatter } : null;
      },
      trigger: () => {},
    },
  };
  return { plugin, files };
}

const SKIP = { _skipSync: true, _skipDependencySync: true, _skipConflictDetection: true };

function frontmatterOf(files: Map<string, string>, path: string): Record<string, unknown> {
  return parseFrontmatterFromContent(files.get(path) ?? '') ?? {};
}

describe('timeline icon persistence: events', () => {
  it('writes and reads the default icon and colour keys', async () => {
    const { plugin, files } = makePlugin({});
    await plugin.saveEvent({ name: 'Siege', dateTime: '1200', icon: 'sword', iconColor: '#c9a227', ...SKIP });

    expect(frontmatterOf(files, 'Story/Events/Siege.md')).toMatchObject({ icon: 'sword', iconColor: '#c9a227' });

    const loaded = await plugin.parseFile(new TFile('Story/Events/Siege.md'), { name: '' }, 'event');
    expect(loaded.icon).toBe('sword');
    expect(loaded.iconColor).toBe('#c9a227');
  });

  it('reads a note that already has icon: book-open without any change', async () => {
    const { plugin, files } = makePlugin({});
    files.set('Story/Events/Dawn.md', '---\nentityType: event\nname: Dawn\nicon: book-open\n---\n\n## Description\nText\n');

    const loaded = await plugin.parseFile(new TFile('Story/Events/Dawn.md'), { name: '' }, 'event');
    expect(loaded.icon).toBe('book-open');
    expect(loaded.iconColor).toBeUndefined();
  });

  it('writes and reads a custom icon key and derives the colour key from it', async () => {
    const { plugin, files } = makePlugin({ timelineIconProperty: 'timelineIcon' });
    await plugin.saveEvent({ name: 'Siege', icon: '🐉', iconColor: '#fff', ...SKIP });

    const fm = frontmatterOf(files, 'Story/Events/Siege.md');
    expect(fm).toMatchObject({ timelineIcon: '🐉', timelineIconColor: '#fff' });
    expect(fm).not.toHaveProperty('icon');
    expect(fm).not.toHaveProperty('iconColor');

    const loaded = await plugin.parseFile(new TFile('Story/Events/Siege.md'), { name: '' }, 'event');
    expect(loaded.icon).toBe('🐉');
    expect(loaded.iconColor).toBe('#fff');
  });

  it('uses an explicit colour key when one is set', async () => {
    const { plugin, files } = makePlugin({ timelineIconProperty: 'timelineIcon', timelineIconColorProperty: 'tint' });
    await plugin.saveEvent({ name: 'Siege', icon: 'sword', iconColor: '#fff', ...SKIP });

    expect(frontmatterOf(files, 'Story/Events/Siege.md')).toMatchObject({ timelineIcon: 'sword', tint: '#fff' });
  });

  it('does not read a foreign icon key as the entity icon when a custom key is set', async () => {
    const { plugin, files } = makePlugin({ timelineIconProperty: 'timelineIcon' });
    files.set('Story/Events/Dawn.md', '---\nentityType: event\nname: Dawn\nicon: book-open\n---\n\n## Description\nText\n');

    const loaded = await plugin.parseFile(new TFile('Story/Events/Dawn.md'), { name: '' }, 'event');
    expect(loaded.icon).toBeUndefined();
  });

  it('removes the configured key when the icon is cleared, and leaves other keys alone', async () => {
    const { plugin, files } = makePlugin({ timelineIconProperty: 'timelineIcon' });
    files.set('Story/Events/Siege.md', '---\nentityType: event\nname: Siege\ntimelineIcon: sword\ntimelineIconColor: "#fff"\nicon: book-open\nmood: tense\n---\n\n## Description\nText\n');

    const loaded = await plugin.parseFile(new TFile('Story/Events/Siege.md'), { name: '' }, 'event');
    expect(loaded.icon).toBe('sword');
    await plugin.saveEvent({ ...loaded, icon: '', iconColor: '', ...SKIP });

    const fm = frontmatterOf(files, 'Story/Events/Siege.md');
    expect(fm).not.toHaveProperty('timelineIcon');
    expect(fm).not.toHaveProperty('timelineIconColor');
    expect(fm).toMatchObject({ icon: 'book-open', mood: 'tense' });
  });

  it('keeps a stale default icon key untouched when the setting points elsewhere', async () => {
    const { plugin, files } = makePlugin({ timelineIconProperty: 'timelineIcon' });
    files.set('Story/Events/Dawn.md', '---\nentityType: event\nname: Dawn\nicon: book-open\n---\n\n## Description\nText\n');

    const loaded = await plugin.parseFile(new TFile('Story/Events/Dawn.md'), { name: '' }, 'event');
    await plugin.saveEvent({ ...loaded, icon: 'sword', ...SKIP });

    expect(frontmatterOf(files, 'Story/Events/Dawn.md')).toMatchObject({ icon: 'book-open', timelineIcon: 'sword' });
  });
});

describe('timeline icon persistence: scenes', () => {
  it('writes and reads the default icon and colour keys', async () => {
    const { plugin, files } = makePlugin({});
    await plugin.saveScene({ name: 'Ambush', icon: 'swords', iconColor: 'rgb(10, 20, 30)', ...SKIP });

    expect(frontmatterOf(files, 'Story/Scenes/Ambush.md')).toMatchObject({ icon: 'swords', iconColor: 'rgb(10, 20, 30)' });

    const loaded = await plugin.parseFile(new TFile('Story/Scenes/Ambush.md'), { name: '' }, 'scene');
    expect(loaded.icon).toBe('swords');
    expect(loaded.iconColor).toBe('rgb(10, 20, 30)');
  });

  it('writes and reads a custom icon key', async () => {
    const { plugin, files } = makePlugin({ timelineIconProperty: 'scene-icon' });
    await plugin.saveScene({ name: 'Ambush', icon: '[[dragon.png]]', iconColor: '#abcdef', ...SKIP });

    const fm = frontmatterOf(files, 'Story/Scenes/Ambush.md');
    expect(fm).toMatchObject({ 'scene-icon': '[[dragon.png]]', 'scene-iconColor': '#abcdef' });
    expect(fm).not.toHaveProperty('icon');

    const loaded = await plugin.parseFile(new TFile('Story/Scenes/Ambush.md'), { name: '' }, 'scene');
    expect(loaded.icon).toBe('[[dragon.png]]');
    expect(loaded.iconColor).toBe('#abcdef');
  });

  it('removes the icon keys when cleared and keeps the other keys', async () => {
    const { plugin, files } = makePlugin({});
    await plugin.saveScene({ name: 'Ambush', icon: 'swords', iconColor: '#abcdef', status: 'Draft', ...SKIP });

    const loaded = await plugin.parseFile(new TFile('Story/Scenes/Ambush.md'), { name: '' }, 'scene');
    await plugin.saveScene({ ...loaded, icon: undefined, iconColor: undefined, ...SKIP });

    const fm = frontmatterOf(files, 'Story/Scenes/Ambush.md');
    expect(fm).not.toHaveProperty('icon');
    expect(fm).not.toHaveProperty('iconColor');
    expect(fm).toMatchObject({ status: 'Draft' });
  });
});
