/*
 * Typed values in the party sidebar survive re-renders: the resource amount after a +/- tap, and the
 * "Actor not in the party" name after a party chip is tapped. The elements are driven through their
 * real handlers with a minimal element stand-in (no DOM in tests).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    const base = new Proxy(mod, {
        get: (target, prop) => (prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined),
        has: () => true,
    });
    return new Proxy(base, {
        get: (target, prop) => (prop === 'setIcon' ? () => {} : Reflect.get(target, prop)),
    });
});

const { CampaignView } = await import('../../src/views/CampaignView');
(globalThis as any).window = globalThis;

interface FakeEl {
    tag: string;
    value: string;
    text?: string;
    attr: Record<string, string>;
    children: FakeEl[];
    listeners: Record<string, Array<(event?: unknown) => void>>;
    addEventListener(type: string, fn: (event?: unknown) => void): void;
    fire(type: string): void;
    click(): void;
    addClass(cls: string): void;
    setText(text: string): void;
    toggleClass(cls: string, on: boolean): void;
    empty(): void;
    createDiv(cls?: string): FakeEl;
    createSpan(opts?: string | { cls?: string; text?: string }): FakeEl;
    createEl(tag: string, opts?: { cls?: string; text?: string; attr?: Record<string, string> }): FakeEl;
}

function fakeEl(tag = 'div', opts: { text?: string; attr?: Record<string, string> } = {}): FakeEl {
    const el: FakeEl = {
        tag,
        value: opts.attr?.value ?? '',
        text: opts.text,
        attr: opts.attr ?? {},
        children: [],
        listeners: {},
        addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
        fire(type) { for (const fn of el.listeners[type] ?? []) fn({ key: '' }); },
        click() { el.fire('click'); },
        addClass() {},
        setText(text) { el.text = text; },
        toggleClass() {},
        empty() { el.children = []; },
        createDiv() { const child = fakeEl('div'); el.children.push(child); return child; },
        createSpan(opts) { const child = fakeEl('span', { text: typeof opts === 'string' ? undefined : opts?.text }); el.children.push(child); return child; },
        createEl(tag, opts) { const child = fakeEl(tag, opts); el.children.push(child); return child; },
    };
    return el;
}

function findIn(root: FakeEl, pred: (el: FakeEl) => boolean): FakeEl | undefined {
    for (const child of root.children) {
        if (pred(child)) return child;
        const hit = findIn(child, pred);
        if (hit) return hit;
    }
    return undefined;
}

function find(root: FakeEl, pred: (el: FakeEl) => boolean): FakeEl {
    const hit = findIn(root, pred);
    if (!hit) throw new Error('element not found');
    return hit;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function makeView() {
    const plugin: any = { app: { vault: {} } };
    const view: any = new (CampaignView as any)({}, plugin);
    view.autosave = vi.fn(async () => {});
    view.refreshSidebarPart = vi.fn(async () => {});
    return view;
}

describe('party sidebar typed values', () => {
    it('keeps a typed resource amount when a +/- tap rebuilds the row', async () => {
        const view = makeView();
        const session: any = { name: 'S', storyId: 'x', partyResources: { Gold: 110 } };
        const body = fakeEl();
        view.renderPartyResources(body, session);
        const amount = find(body, el => el.tag === 'input');
        amount.value = '5';
        amount.fire('input');
        find(body, el => el.tag === 'button' && el.text === '+').click();
        await flush();
        expect(session.partyResources.Gold).toBe(115);

        // The refresh rebuilds the row from the session.
        const rebuilt = fakeEl();
        view.renderPartyResources(rebuilt, session);
        expect(find(rebuilt, el => el.tag === 'input').value).toBe('5');
    });

    it('keeps the typed "Actor not in the party" name when a party chip is tapped', () => {
        const view = makeView();
        const session: any = { name: 'S', storyId: 'x', partyCharacterNames: ['Frodo'], partyResources: {} };
        const wrap = fakeEl();
        view.renderQuickEntryBody(wrap, session);
        const npcLabel = 'Add an actor not in the party';
        const npc = find(wrap, el => el.attr['aria-label'] === npcLabel);
        npc.value = 'Gandalf';
        npc.fire('input');
        find(wrap, el => el.tag === 'button' && el.text === 'Frodo').click();
        expect(find(wrap, el => el.attr['aria-label'] === npcLabel).value).toBe('Gandalf');
    });
});
