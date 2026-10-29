/*
 * A session note renamed in Obsidian mid-session must keep receiving the session's log. saveSession
 * writes to the note the session already points at, and derives the name-based path only when the
 * note does not exist yet.
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
        cachedRead: async (f: TFile) => files.get(f.path)!.content,
        create: async (p: string, c: string) => { files.set(p, { file: new TFile(p), content: c }); },
        process: async (f: TFile, fn: (c: string) => string) => {
            const e = files.get(f.path)!; e.content = fn(e.content);
        },
    };
    return { files, vault };
}

function fakeThisFor(vault: unknown): any {
    return {
        app: { vault },
        ensureSessionsFolder: async () => {},
        getEntityFolder: () => 'Sessions',
        serializeFrontmatterEntityReferences: async (s: any) => ({ source: s, omitOriginalKeys: [] }),
    };
}

describe('saveSession after the session note is renamed', () => {
    it('keeps writing to the renamed note instead of creating one under the old name', async () => {
        const { files, vault } = makeVault({ 'Sessions/Session 01 renamed.md': NOTE });
        const session: any = { name: 'Session 01', storyId: 'story-lotr', filePath: 'Sessions/Session 01 renamed.md' };
        await (StorytellerSuitePlugin.prototype as any).saveSession.call(fakeThisFor(vault), session);
        expect(session.filePath).toBe('Sessions/Session 01 renamed.md');
        expect([...files.keys()]).toEqual(['Sessions/Session 01 renamed.md']);
        expect(files.get('Sessions/Session 01 renamed.md')!.content).toContain('- old line');
    });

    it('derives the name-based path when the session has no note yet', async () => {
        const { files, vault } = makeVault({});
        const session: any = { name: 'Session 02', storyId: 'story-lotr' };
        await (StorytellerSuitePlugin.prototype as any).saveSession.call(fakeThisFor(vault), session);
        expect(session.filePath).toBe('Sessions/Session 02.md');
        expect(files.has('Sessions/Session 02.md')).toBe(true);
    });
});
