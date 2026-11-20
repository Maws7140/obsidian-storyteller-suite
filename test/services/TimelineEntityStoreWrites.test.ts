import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineEntityStore } from '../../src/services/TimelineEntityStore';
import type StorytellerSuitePlugin from '../../src/main';
import type { TimelineTrack } from '../../src/types';

/**
 * The era and track managers read the current list, change it, and hand the
 * whole thing back. That round trip has to reach disk.
 *
 * It did not: the store handed out its own cache array, so a caller pushing a
 * new row put it in the cache before replaceAll ever saw it, and replaceAll
 * then compared the row against itself, found it unchanged and wrote nothing.
 * The track was in the UI until the next reload and never in the vault.
 */

interface Written { path: string; content: string }

function createStore(written: Written[]): TimelineEntityStore {
    const files = new Map<string, string>();
    const plugin = {
        settings: { activeStoryId: 'story-1', timelineEntitiesInNotes: true },
        tryGetEntityFolder: () => ({ path: 'Stories/One/Tracks' }),
        getFolderResolverForStory: () => ({ getEntityFolder: () => 'Stories/One/Tracks' }),
        ensureFolder: async () => {},
        saveSettings: async () => {},
        parseFile: async () => null,
        app: {
            vault: {
                getMarkdownFiles: () => [],
                getAbstractFileByPath: (path: string) => (files.has(path) ? { path } : null),
                cachedRead: async () => '',
                create: async (path: string, content: string) => { files.set(path, content); written.push({ path, content }); },
                modify: async () => {}
            },
            fileManager: { renameFile: async () => {}, trashFile: async () => {} },
            metadataCache: { trigger: () => {}, getFileCache: () => null }
        }
    } as unknown as StorytellerSuitePlugin;
    return new TimelineEntityStore(plugin);
}

describe('TimelineEntityStore write paths', () => {
    let written: Written[];
    let store: TimelineEntityStore;

    beforeEach(async () => {
        written = [];
        store = createStore(written);
        await store.save('track', { id: 'track-global', name: 'Global' });
        written.length = 0;
    });

    it('writes a note for a row added to the list it handed out', async () => {
        const tracks = store.getTracks();
        tracks.push({ id: 'track-new', name: 'Kestrel' } as TimelineTrack);

        await store.replaceAll('track', tracks);

        expect(written.map(file => file.path)).toContain('Stories/One/Tracks/Kestrel.md');
    });

    it('leaves the list it handed out unattached to the cache', () => {
        const first = store.getTracks();
        first.push({ id: 'track-scratch', name: 'Scratch' } as TimelineTrack);

        expect(store.getTracks().map(track => track.id)).not.toContain('track-scratch');
    });

    it('writes a row that was edited in place rather than replaced', async () => {
        const tracks = store.getTracks();
        tracks[0].name = 'Global renamed';

        await store.replaceAll('track', tracks);

        expect(written.map(file => file.path)).toContain('Stories/One/Tracks/Global renamed.md');
    });
});
