/*
 * CampaignView autosave queue: one failed save must not stop later saves from persisting, and the
 * entries that failed stay queued for the next flush.
 */
import { describe, expect, it } from 'vitest';

// The view extends obsidian's ItemView and related UI bases. Unknown names resolve to an inert stub;
// these tests never touch them.
vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => (prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined),
        has: () => true,
    });
});

const { CampaignView } = await import('../../src/views/CampaignView');
const { noticeMessages } = await import('obsidian') as unknown as { noticeMessages: string[] };
(globalThis as any).window = globalThis;

function makeView(plugin: any) {
    const view: any = new (CampaignView as any)({}, plugin);
    view.render = async () => {};
    view.session = { name: 'S', storyId: 'x', filePath: 'Sessions/S.md', partyCharacterNames: [] };
    return view;
}

describe('campaign view flush chain after a failed save', () => {
    it('later autosaves still persist their log entries once a save has failed', async () => {
        const appended: string[] = [];
        let fail = true;
        const plugin: any = {
            app: { vault: {} },
            saveSession: async () => { if (fail) { fail = false; throw new Error('disk busy'); } },
            appendToSessionLogEntries: async (_p: string, entries: string[]) => { appended.push(...entries); },
            loadSessionLog: async () => '',
            updateSessionLog: async () => {},
        };
        const view = makeView(plugin);
        const first = await view.autosave('first entry').then(() => 'ok', (e: Error) => 'rejected: ' + e.message);
        const second = await view.autosave('second entry').then(() => 'ok', (e: Error) => 'rejected: ' + e.message);
        expect(first).toBe('rejected: disk busy');
        expect(second).toBe('ok');
        expect(appended).toContain('second entry');
    });

    it('keeps the failed entries queued for the next flush and tells the user', async () => {
        const appended: string[] = [];
        let fail = true;
        const plugin: any = {
            app: { vault: {} },
            saveSession: async () => { if (fail) { fail = false; throw new Error('disk busy'); } },
            appendToSessionLogEntries: async (_p: string, entries: string[]) => { appended.push(...entries); },
            loadSessionLog: async () => '',
            updateSessionLog: async () => {},
        };
        const view = makeView(plugin);
        noticeMessages.length = 0;
        await view.autosave('first entry').catch(() => undefined);
        expect(noticeMessages.length).toBeGreaterThan(0);
        expect(view.retainedLogEntries.get('Sessions/S.md')).toEqual(['first entry']);
        await view.autosave('second entry');
        expect(appended).toEqual(['first entry', 'second entry']);
        expect(view.pendingLogEntries).toEqual([]);
    });

    it('a failed log write does not block a later scene header write', async () => {
        const store = { log: '' };
        let fail = true;
        const plugin: any = {
            app: { vault: {} },
            saveSession: async () => {},
            appendToSessionLogEntries: async () => {},
            loadSessionLog: async () => store.log,
            updateSessionLog: async (_p: string, update: (b: string) => string) => {
                if (fail) { fail = false; throw new Error('disk busy'); }
                store.log = update(store.log);
            },
        };
        const view = makeView(plugin);
        await view.writeSessionLog((b: string) => b + '- one\n').catch(() => undefined);
        await view.writeSessionLog((b: string) => b + '- two\n');
        expect(store.log).toBe('- two\n');
    });
});
