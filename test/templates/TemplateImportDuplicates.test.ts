import { describe, expect, it, vi } from 'vitest';
import { TemplateStorageManager } from '../../src/templates/TemplateStorageManager';
import type { Template, TemplateExportData } from '../../src/templates/TemplateTypes';
import {
  MockTemplateVault,
  createMockTemplateApp,
  createUserTemplate,
} from './support/MockTemplateVault';

function exportOf(template: Template): TemplateExportData {
  return {
    template,
    exportVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
  };
}

async function setup(): Promise<{ manager: TemplateStorageManager; vault: MockTemplateVault }> {
  const vault = new MockTemplateVault();
  await vault.createFolder('StorytellerSuite/Templates');
  const manager = new TemplateStorageManager(createMockTemplateApp(vault) as any);
  vi.spyOn(manager, 'validateTemplate').mockReturnValue({
    isValid: true,
    errors: [],
    warnings: [],
    brokenReferences: [],
  });
  return { manager, vault };
}

const userCopies = (manager: TemplateStorageManager, name: string) =>
  manager.getAllTemplates().filter(t => !t.isBuiltIn && t.name === name);

describe('importing the same template file again', () => {
  it('does not add a second copy of a template that is already in the library', async () => {
    const { manager } = await setup();
    const source = createUserTemplate('shire-village', 'Shire Village (Test)', { version: '1.0.0' });

    await manager.importTemplate(exportOf(source), true);
    await expect(manager.importTemplate(exportOf(source), true)).rejects.toThrow(/already in your library/);

    expect(userCopies(manager, 'Shire Village (Test)')).toHaveLength(1);
  });

  it('records the source template id so later imports can be matched', async () => {
    const { manager } = await setup();
    const source = createUserTemplate('shire-village', 'Shire Village (Test)');

    const imported = await manager.importTemplate(exportOf(source), true);

    expect(imported.id).not.toBe('shire-village');
    expect(imported.parentTemplateId).toBe('shire-village');
  });

  it('still imports a template whose name matches but whose version differs', async () => {
    const { manager } = await setup();
    await manager.importTemplate(exportOf(createUserTemplate('v1', 'Shire Village', { version: '1.0.0' })), true);

    await manager.importTemplate(exportOf(createUserTemplate('v2', 'Shire Village', { version: '2.0.0' })), true);

    expect(userCopies(manager, 'Shire Village')).toHaveLength(2);
  });
});
