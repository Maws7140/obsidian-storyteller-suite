/*
 * Quick entry: text typed while a submitted line is saving starts the next entry. The box is
 * cleared when the line is submitted, so the submitted line is never merged with new text.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => {
            if (prop === 'setIcon') return () => {};
            return prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined;
        },
        has: () => true,
    });
});

const { CampaignView } = await import('../../src/views/CampaignView');
(globalThis as any).window = globalThis;

// Minimal stand-in for an Obsidian element: enough DOM for the quick entry bar to render and fire events.
function fakeEl(opts?: any): any {
    const el: any = { value: '', text: opts?.text, attr: opts?.attr, children: [] as any[], listeners: {} as Record<string, any[]> };
    el.addEventListener = (t: string, f: any) => { (el.listeners[t] ??= []).push(f); };
    const make = (o?: any) => { const c = fakeEl(o); el.children.push(c); return c; };
    el.createDiv = (_c?: string) => make();
    el.createSpan = (o?: any) => make(o);
    el.createEl = (_t: string, o?: any) => make(o);
    el.empty = () => { el.children = []; };
    el.addClass = () => {}; el.toggleClass = () => {}; el.hide = () => {}; el.show = () => {};
    el.setValue = () => {}; el.removeClass = () => {}; el.setText = () => {}; el.setAttr = () => {};
    return el;
}
function find(root: any, pred: (e: any) => boolean): any {
    for (const c of root.children) { if (pred(c)) return c; const n = find(c, pred); if (n) return n; }
    return undefined;
}
const fire = (el: any, type: string, ev: any = {}) => { for (const f of el.listeners[type] ?? []) f({ preventDefault() {}, isComposing: false, ...ev }); };

describe('quick entry stale input', () => {
    it('text typed while the submit is saving is not merged into the submitted line', async () => {
        const store = { log: '' };
        const plugin: any = {
            app: { vault: {} }, saveSession: async () => {}, appendToSessionLogEntries: async () => {},
            loadSessionLog: async () => store.log,
            updateSessionLog: async (_p: string, u: (b: string) => string) => { store.log = u(store.log); },
            getGroups: () => [], listCharacters: async () => [], listLocations: async () => [], listPlotItems: async () => [], listScenes: async () => [],
        };
        const view: any = new (CampaignView as any)({}, plugin);
        view.render = async () => {};
        view.refreshSidebarParts = async () => {};
        view.session = { name: 'S', storyId: 'x', sessionNumber: 1, filePath: 'Sessions/S.md', partyCharacterNames: ['Frodo'], partyResources: { Gold: 110 } };
        const wrap = fakeEl();
        view.renderQuickEntryBody(wrap, view.session);
        const input = find(wrap, e => e.attr?.['aria-label'] === 'Partylog entry')!;
        input.value = 'Pays the toll [Party:Gold-10]';
        fire(input, 'input');
        fire(input, 'keydown', { key: 'Enter' });
        await new Promise(r => setTimeout(r, 50));
        // The box is already empty when the next text is typed, while the submitted line is still saving.
        expect(input.value).toBe('');
        input.value = 'Next line';
        fire(input, 'input');
        await new Promise(r => setTimeout(r, 1200));

        expect(store.log).toContain('Pays the toll');
        expect(store.log).not.toContain('Next line');
        expect(view.quick.draft).toBe('Next line');
        expect(view.session.partyResources.Gold).toBe(100);
    });
});
