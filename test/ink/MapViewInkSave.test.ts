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
import { defaultInkDoc, inkFrontmatter, normalizeInk } from '../../src/leaflet/ink/model';
import type { InkDoc, InkStamp } from '../../src/leaflet/ink/model';

type FrontMatterWriter = (file: unknown, fn: (fm: Record<string, unknown>) => void) => Promise<void>;

function harness(processFrontMatter: FrontMatterWriter) {
    const view: any = Object.create(MapView.prototype);
    const file = new TFile('maps/Test.md');
    view.app = {
        vault: { getAbstractFileByPath: (path: string) => (path === 'maps/Test.md' ? file : new TFile(path)) },
        fileManager: { processFrontMatter },
    };
    view.currentMap = { id: 'map', filePath: 'maps/Test.md' };
    view.inkSaveQueue = Promise.resolve();
    view.inkWritesPending = 0;
    return { view, file };
}

/** A drawing holding one stamp per id, as the editor passes it to save(). */
function drawingOf(...ids: string[]): InkDoc {
    const items: InkStamp[] = ids.map((id, i) => ({
        id, kind: 'stamp', layer: 'features', scaleWithMap: true, at: [1, i + 1], symbol: 'door', size: 32, rotation: 0, color: '#2b2b2b', opacity: 1,
    }));
    return normalizeInk({ ...defaultInkDoc(), items });
}

const itemIds = (drawing: unknown): string[] => (drawing as { items: { id: string }[] }).items.map(item => item.id);
const tick = () => new Promise(r => setTimeout(r, 0));

describe('MapView.saveInk', () => {
    it('persists the drawing it is given under mapInk', async () => {
        const writes: Record<string, unknown>[] = [];
        const { view } = harness(async (_f, fn) => { const fm = {}; fn(fm); writes.push(fm); });
        await view.saveInk(drawingOf('d5'), 'maps/Test.md');
        expect(itemIds(writes[0].mapInk)).toEqual(['d5']);
        expect(writes[0].mapInk).toEqual(inkFrontmatter(normalizeInk(drawingOf('d5'))));
        expect(itemIds(view.currentMap.mapInk)).toEqual(['d5']);
        expect(view.inkWritesPending).toBe(0);
    });

    it('restores the previous state when the note write is rejected', async () => {
        const { view } = harness(async () => { throw new Error('note locked'); });
        const before = view.currentMap;
        await expect(view.saveInk(drawingOf('d5'), 'maps/Test.md')).rejects.toThrow('note locked');
        expect(view.currentMap).toBe(before);
        expect(view.currentMap.mapInk).toBeUndefined();
        expect(view.inkWritesPending).toBe(0);
    });

    it('does not roll back over a later successful edit', async () => {
        let reject!: (e: Error) => void;
        let call = 0;
        const { view } = harness(() => (++call === 1 ? new Promise<void>((_, r) => { reject = r; }) : Promise.resolve()));
        const failing = view.saveInk(drawingOf('d1'), 'maps/Test.md');
        const ok = view.saveInk(drawingOf('d2'), 'maps/Test.md');
        await tick();
        reject(new Error('locked'));
        await expect(failing).rejects.toThrow('locked');
        await ok;
        expect(itemIds(view.currentMap.mapInk)).toEqual(['d2']);
    });

    it('a write queued behind a rejected one does not write the rejected change', async () => {
        let reject!: (e: Error) => void;
        const written: Record<string, unknown>[] = [];
        let call = 0;
        const { view } = harness(async (_f, fn) => {
            if (++call === 1) await new Promise<void>((_, r) => { reject = r; });
            const fm = {};
            fn(fm);
            written.push(fm);
        });
        // Write A (d1) is in flight; the editor builds B on top of it (d1 and d2).
        const failing = view.saveInk(drawingOf('d1'), 'maps/Test.md');
        await tick();
        const later = view.saveInk(drawingOf('d1', 'd2'), 'maps/Test.md');
        reject(new Error('locked'));
        await expect(failing).rejects.toThrow('locked');
        await later;
        expect(written).toHaveLength(1);
        expect(itemIds(written[0].mapInk)).toEqual(['d2']);
        expect(itemIds(view.currentMap.mapInk)).toEqual(['d2']);
    });

    it('removes the Maplog keys in the same write that writes mapInk', async () => {
        let calls = 0;
        const note: Record<string, unknown> = {
            title: 'Middle Earth',
            maplogMarks: [{ id: 'door-1', mark: 'door', latlng: [1, 2] }],
            maplogLines: [],
            maplogAreas: [{ id: 'water-1', kind: 'water', points: [[1, 1]] }],
        };
        const { view } = harness(async (_f, fn) => { calls++; fn(note); });
        await view.saveInk(drawingOf('d1'), 'maps/Test.md');
        expect(calls).toBe(1);
        expect(note.maplogMarks).toBeUndefined();
        expect(note.maplogLines).toBeUndefined();
        expect(note.maplogAreas).toBeUndefined();
        expect(itemIds(note.mapInk)).toEqual(['d1']);
        expect(note.title).toBe('Middle Earth');
    });

    it('leaves the Maplog keys alone when the write is rejected', async () => {
        const note: Record<string, unknown> = { maplogMarks: [{ id: 'door-1' }] };
        const { view } = harness(async () => { throw new Error('locked'); });
        await expect(view.saveInk(drawingOf('d1'), 'maps/Test.md')).rejects.toThrow('locked');
        expect(note.maplogMarks).toEqual([{ id: 'door-1' }]);
        expect(note.mapInk).toBeUndefined();
    });

    it('writes to the note it was made for after the open map has changed, and leaves the open map alone', async () => {
        const written: string[] = [];
        const { view } = harness(async (f, fn) => { written.push((f as TFile).path); fn({}); });
        view.currentMap = { id: 'other', filePath: 'maps/Other.md' };
        const before = view.currentMap;
        await view.saveInk(drawingOf('d1'), 'maps/Test.md');
        expect(written).toEqual(['maps/Test.md']);
        expect(view.currentMap).toBe(before);
    });

    it('rejects when the note is not a file in the vault', async () => {
        const { view } = harness(async () => undefined);
        view.app.vault.getAbstractFileByPath = () => null;
        await expect(view.saveInk(drawingOf('d1'), 'maps/Gone.md')).rejects.toThrow('Save the map note');
    });
});
