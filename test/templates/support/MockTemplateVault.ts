import { TFile, TFolder } from 'obsidian';
import type { Template } from '../../../src/templates/TemplateTypes';

/**
 * In-memory vault used by the template storage tests. Mirrors only the vault
 * calls TemplateStorageManager makes (create/modify/read/delete and folder lookup).
 */
export class MockTemplateVault {
  private folders = new Map<string, TFolder>();
  private files = new Map<string, TFile>();
  private fileContents = new Map<string, string>();

  constructor() {
    this.folders.set('', new TFolder(''));
  }

  getAbstractFileByPath(path: string) {
    const normalized = normalizeVaultPath(path);
    return this.files.get(normalized) ?? this.folders.get(normalized) ?? null;
  }

  async createFolder(path: string): Promise<TFolder> {
    const normalized = normalizeVaultPath(path);
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
    const normalized = normalizeVaultPath(path);
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
    this.fileContents.set(normalizeVaultPath(file.path), content);
  }

  async read(file: TFile): Promise<string> {
    return this.fileContents.get(normalizeVaultPath(file.path)) ?? '';
  }

  async delete(file: TFile): Promise<void> {
    const normalized = normalizeVaultPath(file.path);
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

  /** Returns the stored text for a path, or undefined when no file exists. */
  contentOf(path: string): string | undefined {
    return this.fileContents.get(normalizeVaultPath(path));
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

export function createMockTemplateApp(vault: MockTemplateVault) {
  return {
    vault,
    fileManager: {
      trashFile: async (file: TFile) => vault.delete(file),
    },
  };
}

export function createUserTemplate(id: string, name: string, overrides: Partial<Template> = {}): Template {
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
      maps: [{ templateId: 'map-1', name: 'Map one' }],
    },
    ...overrides,
  } as Template;
}

export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentOf(path: string): string | null {
  const normalized = normalizeVaultPath(path);
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) {
    return '';
  }
  return normalized.slice(0, slashIndex);
}
