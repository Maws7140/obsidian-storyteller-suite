import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
    const base: Record<string, any> = await import('../__mocks__/obsidian');
    function Stub() {}
    const names = ['App', 'ButtonComponent', 'ColorComponent', 'Component', 'DropdownComponent', 'EventRef',
        'FuzzyMatch', 'FuzzySuggestModal', 'ItemView', 'MarkdownPostProcessorContext', 'MarkdownRenderChild',
        'MarkdownRenderer', 'Menu', 'Platform', 'Plugin', 'Setting', 'SuggestModal', 'TextAreaComponent',
        'TextComponent', 'ToggleComponent', 'WorkspaceLeaf', 'debounce', 'editorLivePreviewField', 'getAllTags',
        'getIcon', 'loadPdfJs', 'prepareFuzzySearch', 'requestUrl', 'setIcon'];
    const stubs = Object.fromEntries(names.filter(n => !(n in base)).map(n => [n, Stub]));
    return { ...base, ...stubs };
});


// Live listeners on the fake document, keyed by event type.
const live = vi.hoisted(() => ({ listeners: new Map<string, Set<unknown>>(), renderers: [] as any[] }));
const openModal = vi.hoisted(() => vi.fn());

vi.mock('../../src/leaflet/renderer', () => ({
    LeafletRenderer: class {
        onunload = vi.fn(() => { this.unloaded = true; });
        unload = vi.fn(() => { this.unloaded = true; });
        unloaded = false;
        map: any;
        constructor() {
            this.map = makeMap();
            live.renderers.push(this);
        }
        async initialize() { await Promise.resolve(); }
        getImageBounds() { return null; }
        getMap() { return this.map; }
        getMaplogLayer() { return null; }
        async refreshEntities() { /* no-op */ }
    },
}));
vi.mock('../../src/utils/MapModalHelper', () => ({ openMapModal: openModal }));

function makeMap() {
    return { on: vi.fn(), off: vi.fn(), invalidateSize: vi.fn(), eachLayer: vi.fn(), setView: vi.fn() };
}

function makeEl(): any {
    const el: any = {
        className: '', id: '', tabIndex: -1, style: {}, children: [] as any[],
        empty: vi.fn(), remove: vi.fn(), setText: vi.fn(),
        setCssStyles: vi.fn((s: Record<string, string>) => Object.assign(el.style, s)),
        getBoundingClientRect: () => ({ width: 800, height: 500 }),
        contains: () => false,
        createDiv: (_o?: unknown) => { const c = makeEl(); el.children.push(c); return c; },
        createEl: (_t?: string, _o?: unknown) => { const c = makeEl(); el.children.push(c); return c; },
        querySelector: () => null,
        addEventListener: vi.fn(),
        setAttribute: vi.fn(),
        appendChild: (c: any) => { el.children.push(c); return c; },
        textContent: '',
        ownerDocument: { createElement: () => makeEl() },
    };
    return el;
}

const fakeDocument = {
    addEventListener(type: string, fn: unknown) {
        if (!live.listeners.has(type)) live.listeners.set(type, new Set());
        live.listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: unknown) {
        live.listeners.get(type)?.delete(fn);
    },
};
const liveCount = (type: string) => live.listeners.get(type)?.size ?? 0;

async function freshView() {
    const { MapView } = await import('../../src/views/MapView');
    const view: any = Object.create(MapView.prototype);
    view.mapContainer = makeEl();
    view.currentMap = { id: 'map-a', name: 'Map A', filePath: 'maps/a.md', type: 'image', image: 'a.png' };
    view.placementMode = { type: null };
    view.mapRenderToken = 0;
    view.waitForContainerDimensions = vi.fn(async () => undefined);
    return view;
}

beforeEach(() => {
    live.listeners.clear();
    live.renderers.length = 0;
    openModal.mockReset();
    (globalThis as any).window = globalThis;
    (globalThis as any).activeDocument = fakeDocument;
    (globalThis as any).requestAnimationFrame = (cb: () => void) => { cb(); return 0; };
    (globalThis as any).setTimeout = vi.fn(() => 0);
    (globalThis as any).clearTimeout = vi.fn();
});

describe('MapView.renderMap document listeners', () => {
    it('keeps one wheel and one touchmove listener after several renders', async () => {
        const view = await freshView();
        await view.renderMap();
        await view.renderMap();
        await view.renderMap();
        expect(liveCount('wheel')).toBe(1);
        expect(liveCount('touchmove')).toBe(1);
    });

    it('removes the document listeners on close after several renders', async () => {
        const view = await freshView();
        await view.renderMap();
        await view.renderMap();
        view.app = { workspace: {} };
        await view.onClose();
        expect(liveCount('wheel')).toBe(0);
        expect(liveCount('touchmove')).toBe(0);
    });
});

describe('MapView.renderMap placement and palette state', () => {
    it('leaves placement mode when another map is rendered', async () => {
        const view = await freshView();
        await view.renderMap();
        await view.enablePlacementMode('location', () => undefined);
        expect(view.placementMode.type).toBe('location');
        expect(liveCount('keydown')).toBe(1);
        await view.renderMap();
        expect(view.placementMode.type).toBeNull();
        expect(view.placementOverlay).toBeNull();
        expect(liveCount('keydown')).toBe(0);
        expect(view.mapContainer.style.cursor).toBe('');
    });

    it('destroys the grid, Maplog editor and palette when the map is deleted', async () => {
        const view = await freshView();
        await view.renderMap();
        const grid = { destroy: vi.fn(), setPlacement: vi.fn() };
        const editor = { destroy: vi.fn(), setTool: vi.fn() };
        const palette = { destroy: vi.fn(), open: vi.fn() };
        view.gridController = grid;
        view.maplogEditor = editor;
        view.maplogPalette = palette;
        view.buildMapSelector = vi.fn(async () => undefined);
        view.buildEntityBar = vi.fn();
        view.updateFooterStatus = vi.fn();
        view.showEditMapModal();
        const options = openModal.mock.calls[0][3];
        await options.onDelete();
        expect(grid.destroy).toHaveBeenCalled();
        expect(view.gridController).toBeNull();
        expect(editor.destroy).toHaveBeenCalled();
        expect(view.maplogEditor).toBeNull();
        expect(palette.destroy).toHaveBeenCalled();
        expect(view.maplogPalette).toBeNull();
    });
});

describe('MapView.renderMap overlapping loads', () => {
    it('does not leave a second renderer alive when an older render finishes its wait late', async () => {
        const view = await freshView();
        let releaseFirst!: () => void;
        const gate = new Promise<void>(r => { releaseFirst = r; });
        view.waitForContainerDimensions = vi.fn()
            .mockImplementationOnce(() => gate)
            .mockImplementation(async () => undefined);
        const first = view.renderMap();
        const second = view.renderMap();
        await second;
        releaseFirst();
        await first;
        const alive = live.renderers.filter(r => !r.unloaded);
        expect(alive).toHaveLength(1);
        expect(view.leafletRenderer).toBe(alive[0]);
    });
});
