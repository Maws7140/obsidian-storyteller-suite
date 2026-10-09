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

});
