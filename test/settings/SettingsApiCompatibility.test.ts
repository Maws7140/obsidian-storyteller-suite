import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { StorytellerSuiteSettingTab } from '../../src/StorytellerSuiteSettingTab';

const sourcePath = resolve(__dirname, '../../src/StorytellerSuiteSettingTab.ts');
const { outputText } = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function loadMobileSettingsTab(hasPageApi: boolean) {
    const tabModule = { exports: {} as { StorytellerSuiteSettingTab: typeof StorytellerSuiteSettingTab } };
    const register = vi.fn();
    const obsidian = {
        Platform: { isMobile: true },
        PluginSettingTab: class {
            containerEl = hasPageApi ? { onWindowMigrated: () => () => {} } : {};
        },
        requireApiVersion: () => hasPageApi,
        ...(hasPageApi && {
            SettingPage: class {
                title = '';
            },
        }),
    };

    runInNewContext(outputText, {
        exports: tabModule.exports,
        require: (id: string) => id === 'obsidian' ? obsidian : {},
    }, { filename: sourcePath });

    const SettingsTab = tabModule.exports.StorytellerSuiteSettingTab;
    type App = ConstructorParameters<typeof SettingsTab>[0];
    type Plugin = ConstructorParameters<typeof SettingsTab>[1];
    return new SettingsTab({} as App, { register } as unknown as Plugin);
}

describe('Settings API compatibility', () => {
    it('can initialize on older mobile Obsidian and use the legacy settings tab', () => {
        expect(loadMobileSettingsTab(false).getSettingDefinitions()).toHaveLength(0);
    });

    it('provides native settings pages on mobile Obsidian that supports them', () => {
        const [stories] = loadMobileSettingsTab(true).getSettingDefinitions();
        expect(stories?.type).toBe('page');
        if (stories?.type !== 'page') throw new Error('Expected a native settings page');
        expect(stories.page?.().title).toBe('Stories');
    });
});
