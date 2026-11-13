import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { DashboardRenderOwnership } from '../../src/views/dashboard/DashboardRenderOwnership';

// Exercise the actual navigation methods, extracted to avoid loading Obsidian's
// application runtime. This is a method-level regression, not an Obsidian E2E.
const source = ts.createSourceFile('DashboardView.ts', readFileSync(new URL('../../src/views/DashboardView.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'DashboardView') as ts.ClassDeclaration;
const names = ['setActiveTab', 'syncActiveTabStyles'];
const methods = names.map(name => {
    const member = declaration.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(source) === name);
    if (!member) throw new Error(`Missing native method: ${name}`);
    return member.getText(source);
}).join('\n');
const compiled = ts.transpileModule(`class NativeNavigation { ${methods} }`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const NativeNavigation = new Function(`${compiled}; return NativeNavigation;`)();

function fixture() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    const view = new NativeNavigation();
    view.controllerRenderOwnership = new DashboardRenderOwnership();
    view.activeTabId = 'characters';
    view.currentFilter = 'old';
    view.currentSearchInput = {};
    view.captureTabScrollState = vi.fn();
    view.restoreTabScroll = vi.fn(async () => {});
    view.tabContentContainer = { setAttr: vi.fn() };
    view.tabHeaderRibbonEl = {};
    const headers = ['characters', 'locations'].map(id => ({
        dataset: { tabId: id }, classList: { toggle: vi.fn() }, setAttribute: vi.fn(), setCssStyles: vi.fn(),
    }));
    view.tabHeaderContainer = { querySelectorAll: () => headers };
    view.tabs = [{ id: 'locations', renderFn: () => { view.controllerRenderOwnership.begin(); return pending; } }];
    return { view, headers, resolve, reject };
}
function expectLocationsSelected(headers: ReturnType<typeof fixture>['headers']) {
    expect(headers[0].setAttribute).toHaveBeenCalledWith('aria-selected', 'false');
    expect(headers[1].setAttribute).toHaveBeenCalledWith('aria-selected', 'true');
    expect(headers[1].classList.toggle).toHaveBeenCalledWith('active', true);
}

describe('native dashboard navigation ownership', () => {
    it('updates selection before render completes, even when a refresh supersedes navigation', async () => {
        const f = fixture();
        const navigation = f.view.setActiveTab('locations');
        expectLocationsSelected(f.headers);
        expect(f.view.currentFilter).toBe('');
        f.view.controllerRenderOwnership.begin(); // newer same-tab automatic refresh
        f.resolve(); await navigation;
        expectLocationsSelected(f.headers);
        expect(f.view.restoreTabScroll).not.toHaveBeenCalled();
    });
    it('keeps the selected tab styling if its asynchronous read rejects', async () => {
        const f = fixture();
        const navigation = f.view.setActiveTab('locations');
        expectLocationsSelected(f.headers);
        f.reject(new Error('synthetic read failure'));
        await expect(navigation).rejects.toThrow('synthetic read failure');
        expectLocationsSelected(f.headers);
        expect(f.view._suppressScrollCapture).toBe(false);
    });
});
