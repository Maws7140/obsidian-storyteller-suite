/*
 * A session whose linked note moved keeps its log in that note. A session whose linked note is gone
 * must fail loudly instead of creating a new note under its name, which would split the log.
 */
import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => (prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined),
        has: () => true,
    });
});

const { default: StorytellerSuitePlugin } = await import('../../src/main');

const NOTE = [
    '---',
    'entityType: campaignSession',
    'name: Session 01',
    'storyId: story-lotr',
    '---',
    '',
    '## Session Log',
    '- old line',
    '',
].join('\n');

function makeVault(initial: Record<string, string>) {
    const files = new Map<string, { file: TFile; content: string }>();
    for (const [p, c] of Object.entries(initial)) files.set(p, { file: new TFile(p), content: c });
    const vault: any = {
        getAbstractFileByPath: (p: string) => files.get(p)?.file ?? null,
        getMarkdownFiles: () => [...files.values()].map(e => e.file),
        cachedRead: async (f: TFile) => files.get(f.path)!.content,
        create: async (p: string, c: string) => { files.set(p, { file: new TFile(p), content: c }); },
        process: async (f: TFile, fn: (c: string) => string) => {
            const e = files.get(f.path)!; e.content = fn(e.content);
        },
    };
    return { files, vault };
}

const P: any = StorytellerSuitePlugin.prototype;

function fakeThisFor(vault: unknown): any {
    return {
        app: { vault },
        ensureSessionsFolder: async () => {},
        getEntityFolder: () => 'Sessions',
        serializeFrontmatterEntityReferences: async (s: any) => ({ source: s, omitOriginalKeys: [] }),
        findSessionNoteByIdentity: P.findSessionNoteByIdentity,
    };
}

describe('saveSession with a linked note that moved', () => {
    it('writes to the renamed note when the session still holds the old path', async () => {
        const { files, vault } = makeVault({ 'Sessions/Session 01 renamed.md': NOTE });
        const session: any = { name: 'Session 01', storyId: 'story-lotr', filePath: 'Sessions/Session 01.md' };
        await P.saveSession.call(fakeThisFor(vault), session);
        expect(session.filePath).toBe('Sessions/Session 01 renamed.md');
        expect([...files.keys()]).toEqual(['Sessions/Session 01 renamed.md']);
        expect(files.get('Sessions/Session 01 renamed.md')!.content).toContain('- old line');
    });

    it('finds the moved note by its id before falling back to the name', async () => {
        const withId = NOTE.replace('name: Session 01', 'name: Session 01\nid: sess-42');
        const { files, vault } = makeVault({
            'Sessions/Other.md': NOTE.replace('name: Session 01', 'name: Session 01 copy'),
            'Sessions/Moved.md': withId,
        });
        const session: any = { id: 'sess-42', name: 'Session 01', storyId: 'story-lotr', filePath: 'Sessions/Gone.md' };
        await P.saveSession.call(fakeThisFor(vault), session);
        expect(session.filePath).toBe('Sessions/Moved.md');
        expect([...files.keys()]).toEqual(['Sessions/Other.md', 'Sessions/Moved.md']);
    });

    it('throws instead of creating a new note when the linked note is gone', async () => {
        const { files, vault } = makeVault({});
        const session: any = { name: 'Session 01', storyId: 'story-lotr', filePath: 'Sessions/Session 01.md' };
        await expect(P.saveSession.call(fakeThisFor(vault), session)).rejects.toThrow(/Sessions\/Session 01\.md/);
        expect([...files.keys()]).toEqual([]);
    });

    it('still derives the name-based path for a session that has no note yet', async () => {
        const { files, vault } = makeVault({});
        const session: any = { name: 'Session 02', storyId: 'story-lotr' };
        await P.saveSession.call(fakeThisFor(vault), session);
        expect(session.filePath).toBe('Sessions/Session 02.md');
        expect(files.has('Sessions/Session 02.md')).toBe(true);
    });
});
