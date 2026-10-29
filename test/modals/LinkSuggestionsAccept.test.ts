import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => {
    class Modal {
        app: unknown; modalEl = { addClass: () => {} }; contentEl = { empty: () => {}, createEl: () => ({}), createDiv: () => ({}) };
        constructor(app: unknown) { this.app = app; }
        open() {} close() {}
    }
    class Setting { constructor() {} setName() { return this; } setDesc() { return this; } addButton() { return this; } }
    class Notice { constructor(_m: string) {} }
    return { Modal, Setting, Notice, App: class {} };
});

import { LinkSuggestionsModal } from '../../src/modals/LinkSuggestionsModal';
import type { LinkSuggestion } from '../../src/utils/RelationshipSuggestions';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Stored = { name: string; connections: unknown[] };

function makePlugin(store: Record<string, Stored>) {
    return {
        settings: { dismissedLinkSuggestions: [] as string[] },
        // Reads snapshot the store when they start, then take 10ms (vault read)
        listCharacters: async () => {
            const snap = JSON.parse(JSON.stringify(Object.values(store)));
            await sleep(10);
            return snap;
        },
        // Write lands 10ms in (vault.modify); the save resolves 40ms later (EntitySyncService)
        saveCharacter: async (c: Stored) => {
            await sleep(10);
            store[c.name] = { name: c.name, connections: JSON.parse(JSON.stringify(c.connections)) };
            await sleep(40);
        },
        saveSettings: async () => {},
        getGroups: () => [],
    };
}

function suggestion(target: string, kind: LinkSuggestion['kind'], direction: LinkSuggestion['direction']): LinkSuggestion {
    return { key: `${kind}|aria>${target}`, reason: 'co-presence', source: 'Aria', kind, target, direction, detail: 'test' };
}

function makeModal(plugin: unknown) {
    const modal = new LinkSuggestionsModal({} as never, plugin as never, () => {});
    const accept = (modal as unknown as { accept: (s: LinkSuggestion) => Promise<void> }).accept.bind(modal);
    return { modal, accept };
}

describe('LinkSuggestionsModal accept', () => {
    it('two different suggestions accepted in quick succession keep both connections', async () => {
        const store: Record<string, Stored> = { Aria: { name: 'Aria', connections: [] } };
        const { accept } = makeModal(makePlugin(store));
        const p1 = accept(suggestion('Bran', 'acquaintance', 'mutual'));
        await sleep(5);
        const p2 = accept(suggestion('Cora', 'ally', 'mutual'));
        await Promise.all([p1, p2]);
        expect(store.Aria.connections).toHaveLength(2);
    });

    it('double-clicking the same suggestion while the save is in flight stores it once', async () => {
        const store: Record<string, Stored> = { Aria: { name: 'Aria', connections: [] } };
        const { modal, accept } = makeModal(makePlugin(store));
        const a = suggestion('Bran', 'acquaintance', 'mutual');
        (modal as unknown as { suggestions: LinkSuggestion[] }).suggestions = [a];
        const p1 = accept(a);
        await sleep(25);
        const p2 = accept(a);
        await Promise.all([p1, p2]);
        expect(store.Aria.connections).toHaveLength(1);
    });

    it('accepting a suggestion whose connection already exists on the note does not write it again', async () => {
        const store: Record<string, Stored> = {
            Aria: { name: 'Aria', connections: [{ target: 'Bran', type: 'acquaintance', direction: 'mutual' }] },
        };
        const { accept } = makeModal(makePlugin(store));
        await accept(suggestion('Bran', 'acquaintance', 'mutual'));
        expect(store.Aria.connections).toHaveLength(1);
    });
});
