/*
 * The session log is one list of plain lines: the plugin's own entries ("Entered *X*", "tbl: ...")
 * are written the same way as quick entry Partylog lines, with no `- ` bullet, so a quick entry
 * line never renders as part of the bullet above it and Partylog reads every line.
 * Closing the Campaign view writes "Session closed." once, however many times it is closed.
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
const { CampaignView, lastLogLine } = await import('../../src/views/CampaignView');
const { parsePartylogLine } = await import('../../src/campaign/partylog/parse');
(globalThis as any).window = globalThis;

const NOTE = ['---', 'name: Session 01', '---', '', '## Session Log', '- Entered *Bree*', '@(Frodo) hides', ''].join('\n');

function makePlugin(content: string) {
    const file = new TFile('Sessions/S.md');
    const store = { content };
    const P: any = StorytellerSuitePlugin.prototype;
    const plugin: any = {
        app: {
            vault: {
                getAbstractFileByPath: (p: string) => (p === file.path ? file : null),
                read: async () => store.content,
                process: async (_f: TFile, fn: (c: string) => string) => { store.content = fn(store.content); },
            },
        },
    };
    plugin.updateSessionLog = P.updateSessionLog.bind(plugin);
    plugin.appendToSessionLogEntries = P.appendToSessionLogEntries.bind(plugin);
    plugin.loadSessionLog = P.loadSessionLog.bind(plugin);
    return { plugin, store };
}

describe('session log lines', () => {
    it('writes the plugin\'s own entries as plain lines, after the quick entry lines', async () => {
        const { plugin, store } = makePlugin(NOTE);
        await plugin.appendToSessionLogEntries('Sessions/S.md', ['Entered *Weathertop*', 'tbl: d6=2 (encounter) -> Wolves']);
        expect(store.content).toBe(['---', 'name: Session 01', '---', '', '## Session Log', '- Entered *Bree*', '@(Frodo) hides',
            'Entered *Weathertop*', 'tbl: d6=2 (encounter) -> Wolves', ''].join('\n'));
        // Without the bullet, Partylog reads a table roll as one.
        expect(parsePartylogLine('tbl: d6=2 (encounter) -> Wolves').kind).toBe('table');
    });

    it('adds a log section to a note without one', async () => {
        const { plugin, store } = makePlugin('---\nname: S\n---\n');
        await plugin.appendToSessionLogEntries('Sessions/S.md', ['Session paused.']);
        expect(store.content).toBe('---\nname: S\n---\n\n## Session Log\nSession paused.\n');
    });
});

describe('closing the Campaign view', () => {
    function makeView(store: { log: string }) {
        const plugin: any = {
            app: { vault: {} },
            saveSession: vi.fn(async () => {}),
            appendToSessionLogEntries: async () => {},
            loadSessionLog: async () => store.log,
            updateSessionLog: async (_p: string, update: (b: string) => string) => { store.log = update(store.log); },
        };
        const view: any = new (CampaignView as any)({}, plugin);
        view.session = { name: 'S', storyId: 'x', filePath: 'Sessions/S.md', partyCharacterNames: [] };
        return { view, plugin };
    }

    it('writes "Session closed." once when closed twice', async () => {
        const store = { log: 'Entered *Bree*' };
        const { view, plugin } = makeView(store);
        await Promise.all([view.onClose(), view.onClose()]);
        await view.onClose();
        expect(store.log).toBe('Entered *Bree*\nSession closed.\n');
        expect(plugin.saveSession).toHaveBeenCalledTimes(1);
    });

    it('does not repeat it when another tab on the session already closed', async () => {
        const store = { log: 'Entered *Bree*\nSession closed.\n' };
        const { view } = makeView(store);
        await view.onClose();
        expect(store.log).toBe('Entered *Bree*\nSession closed.\n');
    });

    it('reads an old bulleted line as the same line', () => {
        expect(lastLogLine('- Entered *Bree*\n- Session closed.\n\n')).toBe('Session closed.');
    });
});
