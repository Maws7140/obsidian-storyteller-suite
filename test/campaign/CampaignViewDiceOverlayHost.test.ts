/*
 * The dice overlay must be hosted on the non-scrolling campaign body, not the scrolling scene panel,
 * so it stays in reach on long scenes. Escape cancels it and focus moves into the roll dialog.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => (prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined),
        has: () => true,
    });
});

const { CampaignView } = await import('../../src/views/CampaignView');
(globalThis as any).window = globalThis;

interface FakeEl {
    cls: string;
    text?: string;
    parentElement: FakeEl | null;
    children: FakeEl[];
    listeners: Record<string, Array<(event: any) => void>>;
    focused: boolean;
    addEventListener(type: string, fn: (event: any) => void): void;
    dispatch(type: string, event: any): void;
    createDiv(cls?: string): FakeEl;
    createSpan(opts?: { text?: string; cls?: string }): FakeEl;
    createEl(tag: string, opts?: { text?: string; cls?: string }): FakeEl;
    focus(): void;
    remove(): void;
}

function fakeEl(parent: FakeEl | null, opts: { text?: string; cls?: string } = {}): FakeEl {
    const el: FakeEl = {
        cls: opts.cls ?? '',
        text: opts.text,
        parentElement: parent,
        children: [],
        listeners: {},
        focused: false,
        addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
        dispatch(type, event) { for (const fn of el.listeners[type] ?? []) fn(event); },
        createDiv(cls) { return adopt(el, fakeEl(el, { cls })); },
        createSpan(o) { return adopt(el, fakeEl(el, o ?? {})); },
        createEl(_tag, o) { return adopt(el, fakeEl(el, o ?? {})); },
        focus() { el.focused = true; },
        remove() {
            if (el.parentElement) el.parentElement.children = el.parentElement.children.filter(c => c !== el);
        },
    };
    return el;
}

function adopt(parent: FakeEl, child: FakeEl): FakeEl {
    parent.children.push(child);
    return child;
}

function find(root: FakeEl, pred: (el: FakeEl) => boolean): FakeEl | undefined {
    for (const child of root.children) {
        if (pred(child)) return child;
        const nested = find(child, pred);
        if (nested) return nested;
    }
    return undefined;
}

function makeView() {
    const plugin: any = { app: { vault: {} } };
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.session = { name: 'S', storyId: 'x', filePath: 'Sessions/S.md', partyCharacterNames: [], partyItems: [], groupStandings: [] };
    return view;
}

describe('dice overlay host', () => {
    it('mounts over the campaign body, not the scrolling scene panel', () => {
        const view = makeView();
        const main = fakeEl(null, { cls: 'storyteller-campaign-main' });
        const panel = main.createDiv('storyteller-campaign-scene-panel');
        view.showDiceOverlay({ label: 'Try the lock', dice: 'd20', threshold: 12 }, panel);

        expect(find(panel, el => el.cls === 'storyteller-dice-overlay')).toBeUndefined();
        expect(main.children.some(el => el.cls === 'storyteller-dice-overlay')).toBe(true);
    });

    it('moves focus to Roll! and closes on Escape', () => {
        const view = makeView();
        const main = fakeEl(null, { cls: 'storyteller-campaign-main' });
        const panel = main.createDiv('storyteller-campaign-scene-panel');
        view.showDiceOverlay({ label: 'Try the lock', dice: 'd20' }, panel);

        const overlay = main.children.find(el => el.cls === 'storyteller-dice-overlay')!;
        const rollBtn = find(overlay, el => el.text === 'Roll!')!;
        expect(rollBtn.focused).toBe(true);

        overlay.dispatch('keydown', { key: 'Escape', stopPropagation: () => {} });
        expect(main.children.some(el => el.cls === 'storyteller-dice-overlay')).toBe(false);
    });
});
