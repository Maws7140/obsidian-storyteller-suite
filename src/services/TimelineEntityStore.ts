import { Notice, TFile, normalizePath, stringifyYaml } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import { TimelineEra, TimelineFork, TimelineTrack } from '../types';
import { buildFrontmatter, parseSectionsFromMarkdown, EntityType } from '../yaml/EntitySections';
import { getTemplateSections } from '../utils/EntityTemplates';
import { planMigration } from '../utils/TimelineMigrationPlan';

/** The three timeline entities that live in vault notes. */
export type TimelineEntityKind = 'era' | 'track' | 'branch';

/** A timeline entity as stored: everything has a name, an id and a home on disk. */
export interface TimelineNoteEntity {
    id: string;
    name: string;
    storyId?: string;
    filePath?: string;
    description?: string;
}

interface KindConfig {
    entityType: EntityType;
    folder: 'timelineEra' | 'timelineTrack' | 'timelineBranch';
    label: string;
    /** Body sections this kind writes, in order. */
    sections: Array<{ heading: string; field: string }>;
}

const KINDS: Record<TimelineEntityKind, KindConfig> = {
    era: {
        entityType: 'timelineEra',
        folder: 'timelineEra',
        label: 'Era',
        sections: [{ heading: 'Description', field: 'description' }]
    },
    track: {
        entityType: 'timelineTrack',
        folder: 'timelineTrack',
        label: 'Track',
        sections: [{ heading: 'Description', field: 'description' }]
    },
    branch: {
        entityType: 'timelineBranch',
        folder: 'timelineBranch',
        label: 'Branch',
        sections: [
            { heading: 'Description', field: 'description' },
            { heading: 'Notes', field: 'notes' }
        ]
    }
};

/**
 * JSON with keys in a fixed order, so two objects holding the same data compare
 * equal even though one was parsed back from a note and the other built in the UI.
 */
function stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, val: unknown) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const source = val as Record<string, unknown>;
            const sorted: Record<string, unknown> = {};
            for (const key of Object.keys(source).sort()) {
                if (source[key] !== undefined) sorted[key] = source[key];
            }
            return sorted;
        }
        return val;
    });
}

/**
 * Eras, tracks and branches as vault notes.
 *
 * They used to be rows in data.json, which meant they could not be shared,
 * linked, searched or opened. A note can be all four, and a folder of notes is
 * a story someone can hand to someone else.
 *
 * The renderer reads these inside its draw loop and cannot await a folder scan
 * per frame, so the store keeps a synchronous in-memory copy. Notes are the
 * source of truth; the cache is only ever refilled from them, never written
 * back to from anything but a save that has already reached disk.
 */
export class TimelineEntityStore {
    private cache: Record<TimelineEntityKind, TimelineNoteEntity[]> = { era: [], track: [], branch: [] };
    private loaded = false;

    constructor(private plugin: StorytellerSuitePlugin) {}

    /** Whether the vault has moved off the settings arrays. */
    get migrated(): boolean {
        return this.plugin.settings.timelineEntitiesInNotes === true;
    }

    /**
     * Readers get their own array, never the cache's.
     *
     * Callers treat these lists as working copies: the era and track managers
     * push a new row onto what they read and hand the whole list back. Handing
     * out the cache made that push land in the cache first, so replaceAll then
     * compared the new row against itself, found no change, and skipped writing
     * the note. The row showed in the UI until the next reload and never
     * existed on disk.
     */
    getEras(): TimelineEra[] { return [...this.cache.era] as TimelineEra[]; }
    getTracks(): TimelineTrack[] { return [...this.cache.track] as TimelineTrack[]; }
    getBranches(): TimelineFork[] { return [...this.cache.branch] as TimelineFork[]; }

    get(kind: TimelineEntityKind): TimelineNoteEntity[] { return [...this.cache[kind]]; }

    /** Drop the cache so the next refresh re-reads from disk. Used on story switch. */
    invalidate(): void {
        this.loaded = false;
        this.cache = { era: [], track: [], branch: [] };
    }

    /** Fill the cache from the vault. Safe to call repeatedly. */
    async refresh(): Promise<void> {
        if (!this.migrated) { this.loaded = true; return; }
        for (const kind of Object.keys(KINDS) as TimelineEntityKind[]) {
            this.cache[kind] = await this.readFolder(kind);
        }
        this.loaded = true;
    }

    /** Refresh only if nothing has been read yet. */
    async ensureLoaded(): Promise<void> {
        if (!this.loaded) await this.refresh();
    }

    private async readFolder(kind: TimelineEntityKind): Promise<TimelineNoteEntity[]> {
        const config = KINDS[kind];
        const resolved = this.plugin.tryGetEntityFolder(config.folder);
        // No active story means no folder to resolve. An empty list is the
        // honest answer; throwing here would take the whole timeline down.
        if (!resolved.path) return [];
        const prefix = normalizePath(resolved.path) + '/';
        const files = this.plugin.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(prefix));

        const out: TimelineNoteEntity[] = [];
        for (const file of files) {
            const parsed = await this.plugin.parseFile<TimelineNoteEntity>(file, { id: '', name: '' }, config.entityType);
            if (!parsed) continue;
            // A note created by hand has no id yet. Fall back to the filename so
            // it still selects, filters and links like any other.
            if (!parsed.id) parsed.id = file.basename;
            if (!parsed.name) parsed.name = file.basename;
            out.push(parsed);
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Write one entity to its note and update the cache.
     *
     * The cache is updated from the object that was actually written, so a
     * failed write leaves the cache showing what is still on disk rather than
     * what the caller hoped to put there.
     */
    async save(kind: TimelineEntityKind, entity: TimelineNoteEntity, storyId?: string): Promise<void> {
        const config = KINDS[kind];
        const owner = storyId ?? entity.storyId ?? this.plugin.settings.activeStoryId;
        const folderPath = this.plugin.getFolderResolverForStory(owner).getEntityFolder(config.folder);
        await this.plugin.ensureFolder(folderPath);

        if (!entity.id) entity.id = `${kind}-${Date.now()}`;
        if (!entity.storyId) entity.storyId = owner;

        const safeName = (entity.name || `Untitled ${config.label}`).replace(/[\\/:"*?<>|]+/g, '').trim();
        const targetPath = normalizePath(`${folderPath}/${safeName}.md`);

        let finalPath = targetPath;
        const existingPath = entity.filePath ? normalizePath(entity.filePath) : undefined;
        if (existingPath && existingPath !== targetPath) {
            const current = this.plugin.app.vault.getAbstractFileByPath(existingPath);
            if (current instanceof TFile) {
                // renameFile rather than a raw vault rename: it rewrites every
                // link pointing at this note, which is the whole reason these
                // are notes in the first place.
                await this.plugin.app.fileManager.renameFile(current, targetPath);
            } else {
                finalPath = targetPath;
            }
        }

        finalPath = this.freePathFor(finalPath, entity.id);

        const existing = this.plugin.app.vault.getAbstractFileByPath(finalPath);
        let existingSections: Record<string, string> = {};
        if (existing instanceof TFile) {
            existingSections = parseSectionsFromMarkdown(await this.plugin.app.vault.cachedRead(existing));
        }

        const record = entity as unknown as Record<string, unknown>;
        const source: Record<string, unknown> = { ...record };
        delete source.filePath;
        for (const section of config.sections) delete source[section.field];

        const frontmatter = buildFrontmatter(config.entityType, source);
        const provided: Record<string, string> = {};
        for (const section of config.sections) {
            const value = record[section.field];
            provided[section.heading] = typeof value === 'string' ? value : '';
        }
        const sections = { ...existingSections, ...getTemplateSections(config.entityType, provided) };
        for (const [heading, value] of Object.entries(provided)) sections[heading] = value;

        let content = `---\n${stringifyYaml(frontmatter)}---\n\n`;
        content += Object.entries(sections).map(([heading, body]) => `## ${heading}\n${body || ''}`).join('\n\n');
        if (!content.endsWith('\n')) content += '\n';

        if (existing instanceof TFile) {
            await this.plugin.app.vault.modify(existing, content);
        } else {
            await this.plugin.app.vault.create(finalPath, content);
        }

        entity.filePath = finalPath;
        // The cache holds the active story only. A migration writing another
        // story's rows must not leave them showing on this story's timeline.
        if (!owner || owner === this.plugin.settings.activeStoryId) this.replaceInCache(kind, entity);
        this.plugin.app.metadataCache.trigger('dataview:refresh-views');
    }

    /**
     * A path this entity may write to without overwriting somebody else's note.
     *
     * Two stories can share one folder, either by pointing their overrides at
     * the same place or by configuring a path with no story placeholder in it.
     * Two eras named the same then resolve to one file, and the migration,
     * which is the only thing that writes other stories' rows, would silently
     * replace the first story's era with the second's.
     */
    private freePathFor(path: string, id: string): string {
        const taken = (candidate: string): boolean => {
            const file = this.plugin.app.vault.getAbstractFileByPath(candidate);
            if (!(file instanceof TFile)) return false;
            const existingId = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.id as string | undefined;
            // No id at all means a note someone wrote by hand, which the store
            // adopts by filename. Claiming it is the intended behaviour.
            return Boolean(existingId) && existingId !== id;
        };
        if (!taken(path)) return path;
        const base = path.replace(/\.md$/, '');
        for (let suffix = 2; suffix < 100; suffix++) {
            const candidate = `${base} ${suffix}.md`;
            if (!taken(candidate)) return candidate;
        }
        return `${base} ${id}.md`;
    }

    /** Trash the note and drop it from the cache. */
    async delete(kind: TimelineEntityKind, id: string): Promise<boolean> {
        const entity = this.cache[kind].find(item => item.id === id);
        if (!entity) return false;
        if (entity.filePath) {
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(entity.filePath));
            if (file instanceof TFile) {
                await this.plugin.app.fileManager.trashFile(file);
            } else {
                new Notice(`Could not find the ${KINDS[kind].label.toLowerCase()} note at ${entity.filePath}`);
            }
        }
        this.cache[kind] = this.cache[kind].filter(item => item.id !== id);
        this.plugin.app.metadataCache.trigger('dataview:refresh-views');
        return true;
    }

    /** Replace the whole set for the active story, adding, updating and removing as needed. */
    async replaceAll(kind: TimelineEntityKind, next: TimelineNoteEntity[]): Promise<void> {
        const keep = new Set(next.map(entity => entity.id).filter(Boolean));
        const removed = this.cache[kind].filter(entity => !keep.has(entity.id));
        for (const entity of removed) await this.delete(kind, entity.id);
        for (const entity of next) {
            // Callers hand back the whole list after changing one row. Rewriting
            // every note would churn the vault and fire a modify event per file
            // for no change at all.
            const current = this.cache[kind].find(item => item.id === entity.id);
            // An entity edited in place is the same object the cache holds, so
            // comparing them can only ever report "unchanged". Write it.
            if (current && current !== entity
                && stableJson(current) === stableJson({ ...entity, filePath: current.filePath })) continue;
            await this.save(kind, entity);
        }
    }

    private replaceInCache(kind: TimelineEntityKind, entity: TimelineNoteEntity): void {
        const list = this.cache[kind];
        const index = list.findIndex(item => item.id === entity.id);
        if (index >= 0) list[index] = entity;
        else list.push(entity);
        list.sort((a, b) => a.name.localeCompare(b.name));
    }

    /** Re-read a single note after an external edit, without rescanning the folder. */
    async syncFile(file: TFile): Promise<boolean> {
        if (!this.migrated) return false;
        for (const kind of Object.keys(KINDS) as TimelineEntityKind[]) {
            const resolved = this.plugin.tryGetEntityFolder(KINDS[kind].folder);
            if (!resolved.path) continue;
            if (!file.path.startsWith(normalizePath(resolved.path) + '/')) continue;
            const parsed = await this.plugin.parseFile<TimelineNoteEntity>(file, { id: '', name: '' }, KINDS[kind].entityType);
            if (!parsed) return false;
            if (!parsed.id) parsed.id = file.basename;
            if (!parsed.name) parsed.name = file.basename;
            this.replaceInCache(kind, parsed);
            return true;
        }
        return false;
    }

    /**
     * Move the settings arrays into notes, once.
     *
     * A row can only become a note by being filed somewhere, and a folder is a
     * story, so ownership stops being optional here. Rows already stamped with
     * a story go to that story. Unstamped rows go to `defaultStoryId`, which
     * the caller resolves: automatically when the vault has exactly one story,
     * and by asking otherwise.
     *
     * The arrays are copied into a backup before anything is written. Stamping
     * an id was reversible; turning rows into notes is not.
     */
    async migrateFromSettings(defaultStoryId: string | undefined): Promise<{ eras: number; tracks: number; branches: number; skipped: number }> {
        const settings = this.plugin.settings;
        const eras = settings.timelineEras || [];
        const tracks = settings.timelineTracks || [];
        const branches = settings.timelineForks || [];

        settings.timelineEntityBackup = {
            migratedAt: new Date().toISOString(),
            eras: JSON.parse(JSON.stringify(eras)) as TimelineEra[],
            tracks: JSON.parse(JSON.stringify(tracks)) as TimelineTrack[],
            forks: JSON.parse(JSON.stringify(branches)) as TimelineFork[]
        };
        await this.plugin.saveSettings();

        const counts = { eras: 0, tracks: 0, branches: 0, skipped: 0 };
        const write = async (kind: TimelineEntityKind, list: TimelineNoteEntity[], key: 'eras' | 'tracks' | 'branches') => {
            const plan = planMigration(list, defaultStoryId);
            counts.skipped += plan.unassignable.length;
            for (const { entry, storyId } of plan.assigned) {
                try {
                    await this.save(kind, { ...entry, storyId }, storyId);
                    counts[key]++;
                } catch {
                    // A row that cannot be filed stays in the backup rather than
                    // taking the whole migration down with it.
                    counts.skipped++;
                }
            }
        };

        await write('era', eras, 'eras');
        await write('track', tracks, 'tracks');
        await write('branch', branches, 'branches');

        settings.timelineEntitiesInNotes = true;
        await this.plugin.saveSettings();
        this.invalidate();
        await this.refresh();
        return counts;
    }

    /**
     * Put the settings arrays back and stop reading notes.
     *
     * The notes themselves are left alone. Trashing a folder of notes to undo a
     * migration is a bigger promise than this needs to make, and anything the
     * user wrote in them after migrating would go with it.
     */
    async rollbackMigration(): Promise<boolean> {
        const backup = this.plugin.settings.timelineEntityBackup;
        if (!backup) return false;
        this.plugin.settings.timelineEras = backup.eras;
        this.plugin.settings.timelineTracks = backup.tracks;
        this.plugin.settings.timelineForks = backup.forks;
        this.plugin.settings.timelineEntitiesInNotes = false;
        await this.plugin.saveSettings();
        this.invalidate();
        return true;
    }

    /** Drop a deleted note from the cache. */
    forgetPath(path: string): boolean {
        const normalized = normalizePath(path);
        let changed = false;
        for (const kind of Object.keys(KINDS) as TimelineEntityKind[]) {
            const before = this.cache[kind].length;
            this.cache[kind] = this.cache[kind].filter(entity => normalizePath(entity.filePath || '') !== normalized);
            if (this.cache[kind].length !== before) changed = true;
        }
        return changed;
    }
}
