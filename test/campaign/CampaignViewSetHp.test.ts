/*
 * "Set hp" on a party member: a double tap must leave one party-state record for that character.
 * The row is driven through its real click handler with a minimal element stand-in (no DOM in tests).
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
    value: string;
    text?: string;
    children: FakeEl[];
    listeners: Record<string, Array<() => void>>;
    addEventListener(type: string, fn: () => void): void;
    click(): void;
    createDiv(): FakeEl;
    createEl(tag: string, opts?: { text?: string }): FakeEl;
}

function fakeEl(text?: string): FakeEl {
    const el: FakeEl = {
        value: '',
        text,
        children: [],
        listeners: {},
        addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
        click() { for (const fn of el.listeners.click ?? []) fn(); },
        createDiv() { const child = fakeEl(); el.children.push(child); return child; },
        createEl(_tag, opts) { const child = fakeEl(opts?.text); el.children.push(child); return child; },
    };
    return el;
}

describe('Set hp double tap', () => {
    it('leaves one party-state record for the character', async () => {
        const plugin: any = { app: { vault: {} } };
        const view: any = new (CampaignView as any)({}, plugin);
        view.autosave = vi.fn(async () => {});
        view.refreshSidebarPart = vi.fn(async () => {});
        const session: any = { name: 'S', storyId: 'x', partyState: [] };
        const row = fakeEl();
        view.renderSetHpRow(row, 'Frodo Baggins', session);
        const controls = row.children[0];
        const input = controls.children[0];
        const setBtn = controls.children[1];
        expect(setBtn.text).toBe('Set hp');
        input.value = '38';
        setBtn.click();
        setBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(session.partyState).toHaveLength(1);
        expect(session.partyState[0]).toMatchObject({ characterName: 'Frodo Baggins', currentHp: 38, maxHp: 38 });
    });

    it('updates the existing record for the character when set again later', async () => {
        const plugin: any = { app: { vault: {} } };
        const view: any = new (CampaignView as any)({}, plugin);
        view.autosave = vi.fn(async () => {});
        view.refreshSidebarPart = vi.fn(async () => {});
        const session: any = { name: 'S', storyId: 'x', partyState: [{ characterId: 'char-frodo', characterName: 'Frodo Baggins', currentHp: 5, maxHp: 10 }] };
        const row = fakeEl();
        view.renderSetHpRow(row, 'Frodo Baggins', session);
        const controls = row.children[0];
        controls.children[0].value = '40';
        controls.children[1].click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(session.partyState).toEqual([{ characterId: 'char-frodo', characterName: 'Frodo Baggins', currentHp: 40, maxHp: 40 }]);
    });
});
