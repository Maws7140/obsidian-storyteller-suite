import { describe, expect, it, vi } from 'vitest';
import { charactersController } from '../../src/views/dashboard/controllers/CharactersController';
import { locationsController } from '../../src/views/dashboard/controllers/LocationsController';
import { writingController } from '../../src/views/dashboard/controllers/WritingController';
import type { DashboardControllerContext } from '../../src/views/dashboard/controllers/types';

vi.mock('../../src/modals/CharacterModal', () => ({ CharacterModal: class {} }));
vi.mock('../../src/modals/LocationModal', () => ({ LocationModal: class {} }));
vi.mock('../../src/i18n/strings', () => ({ t: (key: string) => key }));
vi.mock('obsidian', () => ({ setIcon: () => {} }));

class Element {
    readonly children: Element[] = [];
    readonly ownerDocument = { createElement: () => new Element() };
    parentElement: Element | null = null;
    className = '';

    append(...children: Element[]) {
        for (const child of children) {
            child.remove();
            child.parentElement = this;
            this.children.push(child);
        }
    }
    createDiv(cls?: string | { cls?: string }) {
        const child = this.ownerDocument.createElement();
        child.className = (typeof cls === 'string' ? cls : cls?.cls) ?? '';
        this.append(child);
        return child;
    }
    createEl(_tag: string, options?: { cls?: string }) { return this.createDiv(options); }
    createSpan(options?: { cls?: string }) { return this.createDiv(options); }
    querySelector(selector: string) { return this.children.find(child => child.className === selector.slice(1)); }
    empty() { for (const child of [...this.children]) child.remove(); }
    remove() {
        if (!this.parentElement) return;
        const siblings = this.parentElement.children;
        siblings.splice(siblings.indexOf(this), 1);
        this.parentElement = null;
    }
    replaceWith(next: Element) {
        const parent = this.parentElement!;
        const index = parent.children.indexOf(this);
        this.remove();
        parent.children.splice(index, 0, next);
        next.parentElement = parent;
    }
    setText() {}
    setCssStyles() {}
}

function delayedRender() {
    let finish!: () => void;
    let fail!: (reason: Error) => void;
    const read = new Promise<[]>((resolve, reject) => {
        finish = () => resolve([]);
        fail = reject;
    });
    const state = { current: true };
    const context = {
        plugin: { listCharacters: () => read, listLocations: () => read },
        isCurrentRender: () => state.current,
        getCurrentFilter: () => '',
        renderHeaderControls: () => {},
        renderWritingGoalBanner: () => {},
        isSimplifiedMobileDashboard: () => false,
        getWritingViewMode: () => 'list',
        renderWritingMode: async (_mode: string, body: Element) => {
            await read;
            body.createDiv('replacement-writing-content');
        },
    } as unknown as DashboardControllerContext;
    const panel = new Element();
    const previous = panel.createDiv('previous-content');
    return { panel, previous, host: panel as unknown as HTMLElement, context, finish, fail, state };
}

describe.each([charactersController, locationsController, writingController])('$id refresh', controller => {
    it('retains mounted content until the replacement is ready', async () => {
        const { panel, previous, host, context, finish } = delayedRender();
        const render = controller.render(host, context);
        const visibleDuringRead = panel.children.includes(previous);
        finish();
        await render;
        expect(visibleDuringRead).toBe(true);
        expect(panel.children).not.toContain(previous);
        expect(panel.children.length).toBeGreaterThan(0);
    });

    it('keeps mounted content when the read fails', async () => {
        const { panel, previous, host, context, fail } = delayedRender();
        const render = controller.render(host, context);
        fail(new Error('read failed'));
        await expect(render).rejects.toThrow('read failed');
        expect(panel.children).toContain(previous);
    });

    it('discards a replacement superseded by navigation', async () => {
        const { panel, previous, host, context, finish, state } = delayedRender();
        const render = controller.render(host, context);
        state.current = false;
        previous.remove();
        const nextTab = panel.createDiv('next-tab-content');
        finish();
        await render;
        expect(panel.children).toEqual([nextTab]);
        expect(nextTab.children).toEqual([]);
    });
});

it('refreshes Writing using the filter selected while the first read was pending', async () => {
    const { panel, previous, host, context, finish } = delayedRender();
    let filter = 'old-filter';
    context.getCurrentFilter = () => filter;
    const build = context.renderWritingMode;
    context.renderWritingMode = async (mode, body) => {
        const value = context.getCurrentFilter();
        await build(mode, body);
        body.createDiv(value);
    };
    const refresh = writingController.render(host, context);
    filter = 'current-filter';
    finish();
    await refresh;
    expect(panel.children).not.toContain(previous);
    const body = panel.querySelector('.storyteller-writing-view-body');
    expect(body?.querySelector('.old-filter')).toBeUndefined();
    expect(body?.querySelector('.current-filter')).toBeDefined();
});
