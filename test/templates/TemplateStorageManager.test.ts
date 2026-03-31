import { describe, expect, it, vi } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { TemplateStorageManager } from '../../src/templates/TemplateStorageManager';
import type { Template } from '../../src/templates/TemplateTypes';

describe('TemplateStorageManager', () => {
  it('loads map templates from the Maps folder', async () => {
    const vault = new MockVault();
    await vault.createFolder('StorytellerSuite/Templates');
    await vault.createFolder('StorytellerSuite/Templates/Maps');
    await vault.create(
      'StorytellerSuite/Templates/Maps/map-template.json',
      JSON.stringify(createTemplate('map-template', 'Map template'))
    );

    const manager = new TemplateStorageManager({ vault } as any);
    vi.spyOn(manager, 'validateTemplate').mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      brokenReferences: [],
    });
    await manager.loadUserTemplates();

    expect(manager.getTemplate('map-template')).toMatchObject({
      id: 'map-template',
      entityTypes: ['map'],
    });
  });

  it('removes stale copies and reloads the saved template from disk', async () => {
    const vault = new MockVault();
    await vault.createFolder('StorytellerSuite/Templates');
    await vault.createFolder('StorytellerSuite/Templates/Maps');
    await vault.create(
      'StorytellerSuite/Templates/map-template.json',
      JSON.stringify({ stale: true })
    );

    const manager = new TemplateStorageManager({ vault } as any);
    vi.spyOn(manager, 'validateTemplate').mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      brokenReferences: [],
    });
    await manager.saveTemplate(createTemplate('map-template', 'Updated map template'));

    const saved = manager.getTemplate('map-template');
    const mapFile = vault.getAbstractFileByPath('StorytellerSuite/Templates/Maps/map-template.json');
    const rootFile = vault.getAbstractFileByPath('StorytellerSuite/Templates/map-template.json');

    expect(saved).toMatchObject({
      id: 'map-template',
      name: 'Updated map template',
      entityTypes: ['map'],
    });
    expect(mapFile).toBeInstanceOf(TFile);
    expect(rootFile).toBeNull();
  });
});

class MockVault {
  private folders = new Map<string, TFolder>();
  private files = new Map<string, TFile>();
  private fileContents = new Map<string, string>();

  constructor() {
    this.folders.set('', new TFolder(''));
  }

  getAbstractFileByPath(path: string) {
    const normalized = normalize(path);
    return this.files.get(normalized) ?? this.folders.get(normalized) ?? null;
  }

  async createFolder(path: string): Promise<TFolder> {
    const normalized = normalize(path);
    if (this.folders.has(normalized)) {
      return this.folders.get(normalized)!;
    }

    const parentPath = parentOf(normalized);
    if (parentPath !== null && !this.folders.has(parentPath)) {
      await this.createFolder(parentPath);
    }

    const folder = new TFolder(normalized);
    this.folders.set(normalized, folder);
    this.attachChild(parentPath, folder);
    return folder;
  }

  async create(path: string, content: string): Promise<TFile> {
    const normalized = normalize(path);
    const parentPath = parentOf(normalized);
    if (parentPath !== null && !this.folders.has(parentPath)) {
      await this.createFolder(parentPath);
    }

    const file = new TFile(normalized);
    this.files.set(normalized, file);
    this.fileContents.set(normalized, content);
    this.attachChild(parentPath, file);
    return file;
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.fileContents.set(normalize(file.path), content);
  }

  async read(file: TFile): Promise<string> {
    return this.fileContents.get(normalize(file.path)) ?? '';
  }

  async delete(file: TFile): Promise<void> {
    const normalized = normalize(file.path);
    this.files.delete(normalized);
    this.fileContents.delete(normalized);

    const parentPath = parentOf(normalized);
    const parent = parentPath === null ? null : this.folders.get(parentPath);
    if (parent) {
      parent.children = parent.children.filter(child => child.path !== normalized);
    }
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  private attachChild(parentPath: string | null, child: TFolder | TFile): void {
    if (parentPath === null) {
      return;
    }

    const parent = this.folders.get(parentPath);
    if (!parent) {
      return;
    }

    if (!parent.children.some(existing => existing.path === child.path)) {
      parent.children.push(child);
    }
  }
}

function createTemplate(id: string, name: string): Template {
  const now = new Date().toISOString();
  return {
    id,
    name,
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
    entityTypes: ['map'],
    entities: {
      maps: [
        {
          templateId: 'map-1',
          name: 'Map one',
        },
      ],
    },
  };
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentOf(path: string): string | null {
  const normalized = normalize(path);
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) {
    return '';
  }
  return normalized.slice(0, slashIndex);
}
