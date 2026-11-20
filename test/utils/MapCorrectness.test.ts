import { describe, it, expect, vi } from 'vitest';
import { TFile } from 'obsidian';
import { EntityMarkerDiscovery } from '../../src/leaflet/EntityMarkerDiscovery';
import { persistedMapMarkers } from '../../src/leaflet/utils/PersistedMapMarkers';
import { MapHierarchyManager } from '../../src/utils/MapHierarchyManager';

describe('map correctness', () => {
    function discovery() {
        const file = new (TFile as any)('Scenes/Test.md');
        const app = { vault: { getAbstractFileByPath: () => file }, metadataCache: {
            getFileCache: () => ({ frontmatter: { mapId: 'A', mapCoordinates: [10, 20] } })
        } };
        const plugin: any = {};
        for (const method of ['listCharacters', 'listLocations', 'listEvents', 'listPlotItems',
            'listCultures', 'listEconomies', 'listMagicSystems', 'listReferences']) plugin[method] = async () => [];
        plugin.listScenes = async () => [{ name: 'Test', filePath: file.path }];
        return new EntityMarkerDiscovery(app as any, plugin);
    }
    it('does not leak coordinate pins into a different map', async () => {
        expect(await discovery().discoverMarkers('B', [])).toEqual([]);
    });
    it('keeps a matching map pin exactly once', async () => {
        const markers = await discovery().discoverMarkers('A', []);
        expect(markers).toHaveLength(1);
        expect(markers[0].loc).toEqual([10, 20]);
    });
    it('does not implicitly populate unidentified maps', async () => {
        expect(await discovery().discoverMarkers(undefined, [])).toEqual([]);
    });
    it('converts stored pins without losing zero coordinates or punctuation', () => {
        expect(persistedMapMarkers([{ id: 'pin', lat: 0, lng: 0, label: 'A, B', locationName: 'Gate' }]))
            .toEqual([expect.objectContaining({ id: 'pin', loc: [0, 0], description: 'A, B', link: '[[Gate]]' })]);
    });
    it('rejects hidden and invalid persisted pins', () => {
        expect(persistedMapMarkers([{ id: 'hidden', lat: 1, lng: 2, visible: false },
            { id: 'invalid', lat: Infinity, lng: 1 }])).toEqual([]);
    });
    it('reports a parent cycle even though breadcrumbs truncate it', async () => {
        const maps = [{ id: 'A', name: 'A', parentMapId: 'B' }, { id: 'B', name: 'B', parentMapId: 'A' }];
        const manager = new MapHierarchyManager({} as any, {} as any);
        (manager as any).mapManager = { getMapById: vi.fn(async (id) => maps.find(m => m.id === id)) };
        expect(await manager.getMapPath('A')).toHaveLength(2);
        const result = await manager.validateHierarchy('A');
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toContain('Circular reference');
    });
    it('accepts an acyclic parent chain', async () => {
        const maps = [{ id: 'A', name: 'A', parentMapId: 'B' }, { id: 'B', name: 'B' }];
        const manager = new MapHierarchyManager({} as any, {} as any);
        (manager as any).mapManager = { getMapById: async (id: string) => maps.find(m => m.id === id) };
        expect((await manager.validateHierarchy('A')).valid).toBe(true);
    });
});
