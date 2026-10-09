/*
 * Thread, goal and quest rows: the full state menu (including Abandoned and custom states) must open
 * from a visible per-row button on tap, not only from right-click. Driven through the real row
 * renderer with a minimal element stand-in, since the test environment has no DOM.
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

interface FakeEl {
    value: string;
    text?: string;
    attr?: Record<string, string>;
    children: FakeEl[];
    listeners: Record<string, Array<(event: any) => void>>;
    addEventListener(type: string, fn: (event: any) => void): void;
    click(event?: any): void;
    createDiv(cls?: string): FakeEl;
    createSpan(opts?: { text?: string }): FakeEl;
    createEl(tag: string, opts?: { text?: string; attr?: Record<string, string> }): FakeEl;
}

function fakeEl(opts?: { text?: string; attr?: Record<string, string> }): FakeEl {
    const el: FakeEl = {
        value: '',
        text: opts?.text,
        attr: opts?.attr,
        children: [],
        listeners: {},
        addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
        click(event = {}) { for (const fn of el.listeners.click ?? []) fn(event); },
        createDiv() { const child = fakeEl(); el.children.push(child); return child; },
        createSpan(o) { const child = fakeEl(o); el.children.push(child); return child; },
        createEl(_tag, o) { const child = fakeEl(o); el.children.push(child); return child; },
    };
    return el;
}

function findButton(root: FakeEl, pred: (el: FakeEl) => boolean): FakeEl | undefined {
    for (const child of root.children) {
        if (pred(child)) return child;
        const nested = findButton(child, pred);
        if (nested) return nested;
    }
    return undefined;
}

describe('thread row state menu on tap', () => {
    it('a visible row button opens the state menu with the event', () => {
        const view: any = new (CampaignView as any)({}, { app: { vault: {} } });
        view.autosave = vi.fn(async () => {});
        view.refreshSidebarPart = vi.fn(async () => {});
        view.openThreadStateMenu = vi.fn();
        const session: any = { name: 'S', storyId: 'x', threads: [] };
        const thread: any = { id: 't1', name: 'Find the ring', kind: 'thread', state: 'Open' };
        const body = fakeEl();
        view.renderThreadRow(body, session, thread);
        const menuButton = findButton(body, el => el.attr?.['aria-label'] === 'Set state of Find the ring');
        expect(menuButton).toBeDefined();
        const tapEvent = { type: 'click' };
        menuButton!.click(tapEvent);
        expect(view.openThreadStateMenu).toHaveBeenCalledWith(tapEvent, thread);
    });

    it('the cycle toggle still cycles the state on click', () => {
        const view: any = new (CampaignView as any)({}, { app: { vault: {} } });
        view.autosave = vi.fn(async () => {});
        view.refreshSidebarPart = vi.fn(async () => {});
        view.openThreadStateMenu = vi.fn();
        const session: any = { name: 'S', storyId: 'x', threads: [] };
        const thread: any = { id: 't1', name: 'Find the ring', kind: 'thread', state: 'Open' };
        const body = fakeEl();
        view.renderThreadRow(body, session, thread);
        const toggle = findButton(body, el => el.attr?.title?.startsWith('Click to cycle') ?? false);
        toggle!.click({});
        expect(view.openThreadStateMenu).not.toHaveBeenCalled();
        expect(view.autosave).toHaveBeenCalled();
    });
});
