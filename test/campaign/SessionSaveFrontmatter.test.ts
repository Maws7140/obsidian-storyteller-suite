/*
 * saveSession must keep frontmatter keys that the campaign session whitelist does not own
 * (title, summary, summary_hash) across autosaves, the same way other entity saves do.
 */
import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import * as yaml from 'js-yaml';

// main.ts pulls in UI classes (modals, settings tab, views) that extend obsidian bases the shared
// mock does not define. Unknown names resolve to an inert stub class; saveSession never touches them.
vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => (prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined),
        has: () => true,
    });
});

const { default: StorytellerSuitePlugin } = await import('../../src/main');

const PATH = 'Sessions/Session 02 - The Council and the Mines.md';
const ORIGINAL = [
    '---',
    'entityType: campaignSession',
    'name: Session 02 - The Council and the Mines',
    'storyId: story-lotr',
    'id: sess-lotr-02',
    'title: The Council and the Mines',
    'summary: Frodo and company reach Moria.',
    'summary_hash: "abc123"',
    'partyCharacterNames:',
    '  - Frodo Baggins',
    '---',
    '',
    '## Session Log',
    '- Frodo finds the door',
    '',
].join('\n');

function frontmatterOf(content: string): Record<string, unknown> {
    const end = content.indexOf('\n---', 3);
    return (yaml.load(content.slice(4, end)) ?? {}) as Record<string, unknown>;
}

function makeVault(initial: string) {
    const files = new Map<string, { file: TFile; content: string }>();
    files.set(PATH, { file: new TFile(PATH), content: initial });
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

describe('saveSession keeps foreign frontmatter', () => {
    it('does not drop title, summary or summary_hash on autosave', async () => {
        const { files, vault } = makeVault(ORIGINAL);
        const fakeThis: any = {
            app: { vault, metadataCache: { getFileCache: () => null } },
            ensureSessionsFolder: async () => {},
            getEntityFolder: () => 'Sessions',
            serializeFrontmatterEntityReferences: async (s: any) => ({ source: s, omitOriginalKeys: [] }),
        };
        const session: any = {
            name: 'Session 02 - The Council and the Mines',
            storyId: 'story-lotr',
            id: 'sess-lotr-02',
            partyCharacterNames: ['Frodo Baggins'],
            filePath: PATH,
        };
        await (StorytellerSuitePlugin.prototype as any).saveSession.call(fakeThis, session);
        const after = files.get(PATH)!.content;
        const fm = frontmatterOf(after);
        expect(fm.title).toBe('The Council and the Mines');
        expect(fm.summary).toBe('Frodo and company reach Moria.');
        expect(fm.summary_hash).toBe('abc123');
        expect(after.slice(after.indexOf('## Session Log')).trimEnd()).toBe(ORIGINAL.slice(ORIGINAL.indexOf('## Session Log')).trimEnd());
    });
});
