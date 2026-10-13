/*
 * The Read panel's data path: sections come from the scene note with empty ones dropped, and a
 * push sends the picked header's markdown to the player screen and logs it for the DM.
 */
import { describe, expect, it, vi } from 'vitest';
import { PlayerScreenBus } from '../src/campaign/PlayerPush';

vi.mock('obsidian', async (importOriginal) => {
    const mod = await importOriginal<Record<string, unknown>>();
    class Stub { constructor(..._args: unknown[]) {} open() {} close() {} }
    return new Proxy(mod, {
        get: (target, prop) => (prop in target ? Reflect.get(target, prop) : typeof prop === 'string' && prop !== 'then' ? Stub : undefined),
        has: () => true,
    });
});

const { CampaignView, readSectionsFor, stripPlayBlocks } = await import('../src/views/CampaignView');
const { TFile } = await import('obsidian');
(globalThis as any).window = globalThis;

const NOTE = [
    '---',
    'type: scene',
    '---',
    '## Intro',
    '',
    '## Read-aloud',
    'The door creaks open.',
    '### Detail',
    'Dust hangs in the air.',
    '## Empty',
    '## Secrets',
    'DM only.',
].join('\n');

function makeView(content: string | null = NOTE) {
    const file = new (TFile as any)('Scenes/Hall.md');
    const plugin: any = {
        app: { vault: { getAbstractFileByPath: () => (content === null ? null : file) } },
        playerScreen: new PlayerScreenBus(),
    };
    const view: any = new (CampaignView as any)({}, plugin);
    view.app = {
        vault: { getAbstractFileByPath: plugin.app.vault.getAbstractFileByPath, cachedRead: async () => content ?? '' },
        workspace: { getLeavesOfType: () => [] },
    };
    view.containerEl = { querySelector: () => null };
    view.refreshSidebarPart = async () => {};
    view.session = { name: 'S', filePath: 'Sessions/S.md', partyCharacterNames: ['Mira', 'Tomas'] };
    view.currentScene = { name: 'Hall', filePath: 'Scenes/Hall.md' };
    const logged: string[] = [];
    view.autosave = async (entries?: string | string[]) => {
        if (entries) logged.push(...(Array.isArray(entries) ? entries : [entries]));
    };
    return { view, plugin, logged };
}

describe('Read panel sections', () => {
    it('lists only the headers that have text under them', async () => {
        const { view } = makeView();
        const sections = await view.loadReadSections(view.currentScene);
        expect(sections.map((s: { heading: string }) => s.heading)).toEqual(['Read-aloud', 'Detail', 'Secrets']);
        expect(sections[0].markdown).toBe('The door creaks open.\n### Detail\nDust hangs in the air.');
    });

    it('returns nothing when the scene has no file', async () => {
        const { view } = makeView();
        expect(await view.loadReadSections({ name: 'Loose' })).toEqual([]);
    });

    it('returns nothing when the file cannot be found', async () => {
        const { view } = makeView(null);
        expect(await view.loadReadSections(view.currentScene)).toEqual([]);
    });
});

describe('pushing a Read section', () => {
    it('pushes a popup for everyone and logs it for the DM', () => {
        const { view, plugin, logged } = makeView();
        view.pushReadSection({ heading: 'Read-aloud', level: 2, markdown: 'The door creaks open.' }, 'popup');
        const state = plugin.playerScreen.getState();
        expect(state.popups).toHaveLength(1);
        expect(state.popups[0]).toMatchObject({
            sourceName: 'Hall', heading: 'Read-aloud', markdown: 'The door creaks open.', mode: 'popup',
        });
        expect(state.popups[0].target).toBeUndefined();
        expect(logged).toEqual(['Shown to players: Read-aloud']);
    });

    it('pins a section when asked', () => {
        const { view, plugin } = makeView();
        view.pushReadSection({ heading: 'Read-aloud', level: 2, markdown: 'Text.' }, 'pinned');
        expect(plugin.playerScreen.getState().pinned).toHaveLength(1);
        expect(plugin.playerScreen.getState().popups).toHaveLength(0);
    });

    it('sends a popup to one character when given a target', () => {
        const { view, plugin } = makeView();
        view.pushReadSection({ heading: 'Read-aloud', level: 2, markdown: 'Text.' }, 'popup', 'Mira');
        expect(plugin.playerScreen.getState().popups[0].target).toBe('Mira');
    });
});

describe('readSectionsFor', () => {
    it('keeps text before the first header as an Opening section', () => {
        const sections = readSectionsFor('---\ntype: scene\n---\nThe hall is dark.\n## Read aloud\nDoom, doom.');
        expect(sections.map(s => s.heading)).toEqual(['Opening', 'Read aloud']);
        expect(sections[0].markdown).toBe('The hall is dark.');
    });

    it('drops branch and encounter blocks, and sections left empty by that', () => {
        const note = [
            '## Choices',
            '```branch',
            'label: Run',
            '```',
            '## Read aloud',
            'Doom.',
            '```encounter',
            'dice: d6',
            '```',
        ].join('\n');
        const sections = readSectionsFor(note);
        expect(sections.map(s => s.heading)).toEqual(['Read aloud']);
        expect(sections[0].markdown).toBe('Doom.');
    });

    it('strips play blocks from a whole scene body', () => {
        expect(stripPlayBlocks('Hi\n```branch\nlabel: x\n```\nThere')).toBe('Hi\nThere');
    });
});
