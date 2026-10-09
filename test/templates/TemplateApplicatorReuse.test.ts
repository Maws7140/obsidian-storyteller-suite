import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { TemplateApplicator } from '../../src/templates/TemplateApplicator';
import type { Template } from '../../src/templates/TemplateTypes';

type SavedNote = { type: string; path: string; id: string };

/**
 * Minimal plugin double: notes live in memory by path, saves replace the note at that path
 * (as the real save methods do), and parseFile reads it back.
 */
function createFakePlugin(existingNotes: Array<{ type: string; object: Record<string, unknown> & { name: string } }>) {
  const notes = new Map<string, { file: TFile; object: Record<string, unknown> }>();
  const saves: SavedNote[] = [];
  const groups: Array<{ id: string; name: string; storyId: string }> = [];
  const folderOf = (type: string) => `SS/${type}`;
  const pathOf = (type: string, name: string) => `${folderOf(type)}/${name}.md`;

  for (const note of existingNotes) {
    const path = pathOf(note.type, note.object.name);
    notes.set(path, { file: new TFile(path), object: { ...note.object } });
  }

  const save = (type: string) => async (entity: { id?: string; name: string }) => {
    const path = pathOf(type, entity.name);
    if (!entity.id) entity.id = `generated-${saves.length + 1}`;
    saves.push({ type, path, id: entity.id });
    notes.set(path, { file: new TFile(path), object: { ...entity } });
  };

  const plugin = {
    settings: { groups },
    app: { vault: { getAbstractFileByPath: (path: string) => notes.get(path)?.file ?? null } },
    getEntityFolder: folderOf,
    saveSettings: async () => {},
    parseFile: async (file: TFile) => {
      const stored = notes.get(file.path);
      return stored ? { ...stored.object } : null;
    },
    saveCharacter: save('character'),
    saveLocation: save('location'),
    saveEvent: save('event'),
    savePlotItem: save('item'),
    saveGroupFull: async () => {},
    templateManager: { incrementUsageCount: async () => {} },
  };

  return { plugin, notes, saves, groups };
}

function createTemplate(entities: Record<string, unknown[]>): Template {
  const now = new Date().toISOString();
  return {
    id: 'village-template',
    name: 'Village template',
    description: 'test template',
    genre: 'fantasy',
    category: 'single-entity',
    version: '1.0.0',
    author: 'User',
    isBuiltIn: false,
    isEditable: true,
    created: now,
    modified: now,
    tags: [],
    entityTypes: Object.keys(entities),
    entities,
  } as unknown as Template;
}

const options = { storyId: 'story-1', mode: 'merge' as const, mergeRelationships: true };

describe('TemplateApplicator reuses existing notes safely', () => {
  it('applying the same group template twice keeps a single group', async () => {
    const { plugin, groups } = createFakePlugin([]);
    const applicator = new TemplateApplicator(plugin as never);
    const template = createTemplate({ groups: [{ templateId: 'GROUP_1', name: 'Shire Council' }] });

    const first = await applicator.applyTemplate(template, { ...options });
    const second = await applicator.applyTemplate(template, { ...options });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(groups.filter(g => g.name === 'Shire Council')).toHaveLength(1);
    expect(second.idMap.get('GROUP_1')).toBe(first.idMap.get('GROUP_1'));
  });

  it('a group with the same name in another story is not reused', async () => {
    const { plugin, groups } = createFakePlugin([]);
    groups.push({ id: 'other-story-group', name: 'Shire Council', storyId: 'story-2' });
    const applicator = new TemplateApplicator(plugin as never);

    const result = await applicator.applyTemplate(
      createTemplate({ groups: [{ templateId: 'GROUP_1', name: 'Shire Council' }] }),
      { ...options }
    );

    expect(result.success).toBe(true);
    expect(groups).toHaveLength(2);
    expect(result.idMap.get('GROUP_1')).not.toBe('other-story-group');
  });
});
