import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Obsidian 1.13+ calls these members of a SettingTab itself. A method of the same
 * name on our tab replaces Obsidian's: a private `renderTab(tabId, container)`
 * used to do exactly that, so Obsidian's `renderTab()` call drew nothing and the
 * settings opened blank on mobile (issue #146).
 */
const OBSIDIAN_SETTING_TAB_MEMBERS = [
    'renderTab', 'update', 'refreshDomState', 'getControlValue', 'setControlValue', 'getControlBinding',
    'getElementForDefinition', 'getDefinitionForElement', 'settingItems', 'renderedItems', 'navEl', 'setting',
];

describe('StorytellerSuiteSettingTab member names', () => {
    const source = readFileSync(resolve(__dirname, '../../src/StorytellerSuiteSettingTab.ts'), 'utf8');
    const classBody = source.slice(source.indexOf('export class StorytellerSuiteSettingTab'));
    const declared = new Set(
        [...classBody.matchAll(/^ {4}(?:(?:private|public|protected|readonly|async|static)\s+)*([A-Za-z_]\w*)\s*[(:=<]/gm)].map(match => match[1])
    );

    it.each(OBSIDIAN_SETTING_TAB_MEMBERS)('does not replace Obsidian\'s SettingTab.%s', name => {
        expect(declared.has(name)).toBe(false);
    });

    it('still sees the methods it is meant to find', () => {
        expect(declared.has('display')).toBe(true);
        expect(declared.has('renderSection')).toBe(true);
    });
});
