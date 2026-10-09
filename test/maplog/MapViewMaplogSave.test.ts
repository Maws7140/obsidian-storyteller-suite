import { describe, expect, it, vi } from 'vitest';

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

import { MapView } from '../../src/views/MapView';
import { TFile } from 'obsidian';
import { emptyMaplogData, normalizeMaplogData } from '../../src/leaflet/maplog/model';

type FrontMatterWriter = (file: unknown, fn: (fm: Record<string, unknown>) => void) => Promise<void>;

function harness(processFrontMatter: FrontMatterWriter) {
    const view: any = Object.create(MapView.prototype);
    const file = new TFile('maps/Test.md');
    const layer = { setData: vi.fn() };
    view.app = { vault: { getAbstractFileByPath: () => file }, fileManager: { processFrontMatter } };
    view.leafletRenderer = { getMaplogLayer: () => layer };
    view.currentMap = { id: 'map', filePath: 'maps/Test.md', maplogMarks: [], maplogLines: [], maplogAreas: [] };
    view.maplogSaveQueue = Promise.resolve();
    view.maplogWritesPending = 0;
    return { view, layer, file };
}

// Maplog data as the editor passes it to save(): { marks, lines, areas }.
const markOf = (x: number) => ({ ...emptyMaplogData(), marks: [{ id: `door-${x}`, mark: 'door', latlng: [1, x] as [number, number] }] } as any);
// A full Maplog state holding one door per number, as the editor passes it after several placements.
const marksOf = (...xs: number[]) => ({
    ...emptyMaplogData(),
    marks: xs.map(x => ({ id: `door-${x}`, mark: 'door', latlng: [1, x] as [number, number] })),
} as any);
const tick = () => new Promise(r => setTimeout(r, 0));

describe('MapView.saveMaplog', () => {
    it('persists the marks it is given (editor passes { marks, lines, areas })', async () => {
        const writes: Record<string, unknown>[] = [];
        const { view, layer } = harness(async (_f, fn) => { const fm = {}; fn(fm); writes.push(fm); });
        await view.saveMaplog(markOf(5));
        expect(writes[0].maplogMarks).toEqual([{ id: 'door-5', mark: 'door', latlng: [1, 5] }]);
        expect(view.currentMap.maplogMarks).toHaveLength(1);
        expect(layer.setData).toHaveBeenLastCalledWith(expect.objectContaining({ marks: expect.any(Array) }));
        expect(layer.setData.mock.lastCall![0].marks).toHaveLength(1);
    });

    it('restores the previous state and layer when the note write is rejected', async () => {
        const { view, layer } = harness(async () => { throw new Error('note locked'); });
        const before = view.currentMap;
        await expect(view.saveMaplog(markOf(5))).rejects.toThrow('note locked');
        expect(view.currentMap).toBe(before);
        expect(view.currentMap.maplogMarks).toEqual([]);
        expect(layer.setData).toHaveBeenLastCalledWith(normalizeMaplogData({}));
        expect(view.maplogWritesPending).toBe(0);
    });

    it('does not roll back over a later successful edit', async () => {
        let reject!: (e: Error) => void;
        let call = 0;
        const { view } = harness(() => (++call === 1 ? new Promise<void>((_, r) => { reject = r; }) : Promise.resolve()));
        const failing = view.saveMaplog(markOf(1));
        const ok = view.saveMaplog(markOf(2));
        await tick();
        reject(new Error('locked'));
        await expect(failing).rejects.toThrow('locked');
        await ok;
        expect(view.currentMap.maplogMarks.map((m: any) => m.id)).toEqual(['door-2']);
    });

    it('a write queued behind a rejected one does not write the rejected mark', async () => {
        let reject!: (e: Error) => void;
        const written: Record<string, unknown>[] = [];
        let call = 0;
        const { view, layer } = harness(async (_f, fn) => {
            if (++call === 1) await new Promise<void>((_, r) => { reject = r; });
            const fm = {};
            fn(fm);
            written.push(fm);
        });
        // Write A (door-1) is in flight; the editor builds B on top of it (door-1 and door-2).
        const failing = view.saveMaplog(marksOf(1));
        await tick();
        const later = view.saveMaplog(marksOf(1, 2));
        reject(new Error('locked'));
        await expect(failing).rejects.toThrow('locked');
        await later;
        expect(written).toHaveLength(1);
        expect(written[0].maplogMarks).toEqual([{ id: 'door-2', mark: 'door', latlng: [1, 2] }]);
        expect(view.currentMap.maplogMarks.map((m: any) => m.id)).toEqual(['door-2']);
        expect(layer.setData.mock.lastCall![0].marks.map((m: any) => m.id)).toEqual(['door-2']);
    });
});
