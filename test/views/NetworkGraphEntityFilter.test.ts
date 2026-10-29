import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => {
    class ItemView { containerEl = {}; constructor(public leaf: unknown) {} }
    class Menu { addItem() { return this; } addSeparator() { return this; } showAtMouseEvent() {} }
    class Notice { constructor(_m: string) {} }
    class Modal { modalEl = { addClass: () => {} }; contentEl = {}; constructor(public app: unknown) {} open() {} close() {} }
    class Setting { constructor() {} setName() { return this; } setDesc() { return this; } addButton() { return this; } }
    return { ItemView, Menu, Notice, Modal, Setting, WorkspaceLeaf: class {}, setIcon: () => {}, App: class {} };
});

import { NetworkGraphView } from '../../src/views/NetworkGraphView';

// getActiveEntityTypes only reads the filter toolbar, so a stub toolbar with the
// given active buttons is enough to exercise it.
function activeTypes(active: string[] | null) {
    const buttons = (active ?? []).map(type => ({ getAttribute: (name: string) => (name === 'data-entity-type' ? type : null) }));
    const fakeThis = { entityFilterEl: active === null ? null : { querySelectorAll: () => buttons } };
    const method = (NetworkGraphView.prototype as unknown as { getActiveEntityTypes: () => string[] }).getActiveEntityTypes;
    return method.call(fakeThis);
}

describe('R-Map entity type filter', () => {
    it('returns only the types whose buttons are active', () => {
        expect(activeTypes(['character', 'event'])).toEqual(['character', 'event']);
    });

    it('returns an empty list when every type is switched off, so the graph shows nothing', () => {
        expect(activeTypes([])).toEqual([]);
    });

    it('shows every type before the toolbar exists', () => {
        expect(activeTypes(null)).toEqual(['character', 'location', 'event', 'item', 'culture', 'economy', 'magicsystem', 'group']);
    });
});
