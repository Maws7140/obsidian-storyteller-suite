import { describe, expect, it, vi } from 'vitest';
import { TemplateStorageManager } from '../../src/templates/TemplateStorageManager';
import type { Template } from '../../src/templates/TemplateTypes';
import {
  MockTemplateVault,
  createMockTemplateApp,
  createUserTemplate,
} from './support/MockTemplateVault';

const TEMPLATE_FILE = 'StorytellerSuite/Templates/Maps/user-tpl.json';

async function setup(): Promise<{ vault: MockTemplateVault; manager: TemplateStorageManager }> {
  const vault = new MockTemplateVault();
  await vault.createFolder('StorytellerSuite/Templates');
  const manager = new TemplateStorageManager(createMockTemplateApp(vault) as any);
  vi.spyOn(manager, 'validateTemplate').mockReturnValue({
    isValid: true,
    errors: [],
    warnings: [],
    brokenReferences: [],
  });
  return { vault, manager };
}

describe('template usage count does not persist unsaved in-memory edits', () => {
  it('incrementUsageCount writes only usage fields, not edits made to the cached object', async () => {
    const { vault, manager } = await setup();
    await manager.saveTemplate(createUserTemplate('user-tpl', 'Original name'));

    // The library/dashboard edit flow mutates the object returned by the cache.
    const cached = manager.getAllTemplates().find((t: Template) => t.id === 'user-tpl')!;
    cached.name = 'Edited but cancelled';
    cached.entities.maps!.push({ templateId: 'map-x', name: 'Cancelled map' } as any);

    // Cancel saves nothing; applying the template records usage.
    await manager.incrementUsageCount('user-tpl');

    const onDisk = JSON.parse(vault.contentOf(TEMPLATE_FILE) ?? '{}') as Template;
    expect(onDisk.name).toBe('Original name');
    expect(onDisk.entities.maps?.map(m => m.name)).toEqual(['Map one']);
    expect(onDisk.usageCount).toBe(1);
    expect(onDisk.lastUsed).toBeTruthy();
  });

  it('keeps the usage count increasing across repeated applies', async () => {
    const { vault, manager } = await setup();
    await manager.saveTemplate(createUserTemplate('user-tpl', 'Original name'));

    await manager.incrementUsageCount('user-tpl');
    await manager.incrementUsageCount('user-tpl');

    const onDisk = JSON.parse(vault.contentOf(TEMPLATE_FILE) ?? '{}') as Template;
    expect(onDisk.usageCount).toBe(2);
    expect(manager.getTemplate('user-tpl')?.usageCount).toBe(2);
  });
});
