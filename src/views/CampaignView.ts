/**
 * CampaignView â€” DM-facing play mode for running scenes interactively.
 *
 * Two states:
 *   - session-select: session cards + inline "New Session" form
 *   - play: toolbar | scene panel | sidebar (party HP Â· inventory Â· session log)
 *
 * Navigation uses plugin.saveSession / appendToSessionLog after every move.
 * Dice rolls animate in an overlay; DM override field lets you skip the RNG.
 * Inventory and party membership are updated by applyBranchOutcomes when a
 * branch is taken.
 */

import {
    ItemView,
    WorkspaceLeaf,
    TFile,
    Notice,
    setIcon,
    MarkdownRenderer,
    normalizePath,
} from 'obsidian';
import StorytellerSuitePlugin from '../main';
import {
    CampaignSession,
    CampaignGroupStanding,
    CampaignItemEffect,
    Scene,
    SceneBranch,
    EncounterTable,
    PartyMemberState,
    Character,
    Event,
    Group,
    Location,
    MapBinding,
    EntityRef,
    PlotItem,
    CompendiumEntry,
    StoryMap,
} from '../types';
import {
    extractBranchesFromMarkdown,
    extractEncounterTableFromMarkdown,
} from '../utils/BranchParser';
import {
    roll,
    statModifier,
    resolveBranch,
    rollEncounterTable,
    checkBranchConditions,
    applyBranchOutcomes,
} from '../utils/DiceRoller';
import { renderEncounterWidget } from '../extensions/BranchBlockExtension';

export const VIEW_TYPE_CAMPAIGN = 'storyteller-campaign-view';

type CampaignBoardLocation = {
    location: Location;
    binding: MapBinding;
    scenes: Scene[];
};

export class CampaignView extends ItemView {
    private plugin: StorytellerSuitePlugin;

    // â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private session: CampaignSession | null = null;
    private currentScene: Scene | null = null;
    private branches: SceneBranch[] = [];
    private encounterTable: EncounterTable | null = null;
    private sceneHistory: string[] = []; // scene names, for back-navigation
    private allScenes: Scene[] = [];
    private sceneBody = '';
    private locationData: Location | null = null;
    private selectedBoardLocationId: string | null = null;
    private pendingBoardFocusLocationId: string | null = null;
    private activeActorName: string | null = null;
    private partyCharacterStats = new Map<string, Character>();
    private allCharactersById = new Map<string, Character>();
    private partyStatsCacheKey = '';
    private autosaveTimer: number | null = null;
    private pendingFlushPromise: Promise<void> | null = null;
    private resolvePendingFlush: (() => void) | null = null;
    private rejectPendingFlush: ((error: unknown) => void) | null = null;
    private flushChain: Promise<void> = Promise.resolve();
    private pendingSessionSave = false;
    private pendingLogEntries: string[] = [];
    private readonly autosaveDebounceMs = 450;
    private stripWikiLinkValue(value: string | null | undefined): string {
        const trimmed = String(value ?? '').trim();
        if (!trimmed) return '';
        const wikiMatch = trimmed.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
        return wikiMatch ? wikiMatch[1].trim() : trimmed;
    }

    private readonly normalizeName = (value: string): string => this.stripWikiLinkValue(value).trim().toLowerCase();

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType():    string { return VIEW_TYPE_CAMPAIGN; }
    getDisplayText(): string { return this.session ? `Campaign - ${this.session.name}` : 'Campaign'; }
    getIcon():        string { return 'swords'; }

    async onOpen():  Promise<void> { await this.render(); }
    async onClose(): Promise<void> {
        if (this.session) {
            await this.autosave('Session closed.');
            await this.flushAutosaveNow();
        }
    }

    // â”€â”€ External API (called by main.ts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async loadSession(session: CampaignSession, startingScene?: Scene): Promise<void> {
        this.session = { ...session };
        this.sceneHistory = [];
        this.selectedBoardLocationId = null;
        this.ensureActiveActor(this.session);
        this.partyCharacterStats.clear();
        this.allCharactersById.clear();
        this.partyStatsCacheKey = '';
        try { this.allScenes = await this.plugin.listScenes(); } catch { this.allScenes = []; }

        const startingRef = startingScene?.id ?? startingScene?.name ?? session.currentSceneId ?? session.currentSceneName;
        const resolvedScene = startingRef ? this.resolveSceneReference(startingRef) : null;
        if (resolvedScene) {
            await this.doNavigate(resolvedScene.name, false);
        }
    }

    async render(): Promise<void> {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.className = 'storyteller-campaign-view';
        if (!this.session) {
            await this.renderSessionSelect(root);
        } else {
            await this.renderPlay(root);
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // SESSION SELECT
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private async renderSessionSelect(root: HTMLElement): Promise<void> {
        const wrap = root.createDiv('storyteller-campaign-select');

        const hdr = wrap.createDiv('storyteller-campaign-select-header');
        setIcon(hdr.createSpan(), 'swords');
        hdr.createSpan({ text: ' Campaign Mode' });

        // Existing sessions
        let sessions: CampaignSession[] = [];
        try { sessions = await this.plugin.listSessions(); } catch { /* no active story */ }

        if (sessions.length > 0) {
            wrap.createDiv({ cls: 'storyteller-campaign-section-label', text: 'Sessions' });
            const list = wrap.createDiv('storyteller-campaign-session-list');
            for (const s of sessions) this.renderSessionCard(list, s);
        } else {
            wrap.createDiv({ cls: 'storyteller-campaign-empty', text: 'No sessions yet.' });
        }

        // New session form
        wrap.createDiv({ cls: 'storyteller-campaign-section-label', text: 'New Session' });
        await this.renderNewSessionForm(wrap);
    }

    private renderSessionCard(container: HTMLElement, session: CampaignSession): void {
        const card = container.createDiv('storyteller-campaign-session-card');

        const info = card.createDiv('storyteller-campaign-session-info');
        info.createDiv({ cls: 'storyteller-campaign-session-name', text: session.name });
        const meta = info.createDiv('storyteller-campaign-session-meta');
        if (session.currentSceneName) meta.createSpan({ text: `Scene: ${session.currentSceneName}` });
        if (session.partyCharacterNames?.length) {
            meta.createSpan({ text: ` | ${session.partyCharacterNames.join(', ')}` });
        }

        card.createSpan({
            cls: `storyteller-campaign-status-badge is-${session.status ?? 'active'}`,
            text: session.status ?? 'active',
        });

        const actions = card.createDiv('storyteller-campaign-session-actions');

        const resumeBtn = actions.createEl('button', { cls: 'storyteller-campaign-btn is-primary', text: 'Resume' });
        resumeBtn.addEventListener('click', async () => {
            await this.loadSession(session);
            await this.render();
        });

        const noteBtn = actions.createEl('button', { cls: 'storyteller-campaign-btn' });
        setIcon(noteBtn, 'file-text');
        noteBtn.addEventListener('click', () => {
            if (session.filePath) this.plugin.app.workspace.openLinkText(session.filePath, '', 'tab');
        });

        const delBtn = actions.createEl('button', { cls: 'storyteller-campaign-btn is-danger' });
        setIcon(delBtn, 'trash');
        delBtn.addEventListener('click', async () => {
            if (session.filePath) { await this.plugin.deleteSession(session.filePath); await this.render(); }
        });
    }

    private async renderNewSessionForm(container: HTMLElement): Promise<void> {
        const form = container.createDiv('storyteller-campaign-form');

        // Session name
        const nameWrap = form.createDiv('storyteller-campaign-field');
        nameWrap.createEl('label', { text: 'Session name' });
        const nameInput = nameWrap.createEl('input', {
            cls: 'storyteller-campaign-input',
            attr: { type: 'text', placeholder: 'The Silver Crown - Session 1' },
        });

        // Starting scene
        const sceneWrap = form.createDiv('storyteller-campaign-field');
        sceneWrap.createEl('label', { text: 'Starting scene' });
        const sceneSelect = sceneWrap.createEl('select', { cls: 'storyteller-campaign-input' });
        sceneSelect.createEl('option', { value: '', text: '- none -' });

        // Party
        const partyWrap = form.createDiv('storyteller-campaign-field');
        partyWrap.createEl('label', { text: 'Party members' });
        const picker = partyWrap.createDiv('storyteller-campaign-party-picker');
        const selected = new Set<string>();

        // Populate async
        try {
            const [scenes, chars] = await Promise.all([
                this.plugin.listScenes(),
                this.plugin.listCharacters(),
            ]);
            this.allScenes = scenes;
            for (const s of scenes.sort((a, b) => a.name.localeCompare(b.name))) {
                sceneSelect.createEl('option', { value: s.name, text: s.name });
            }
            for (const ch of chars.sort((a, b) => a.name.localeCompare(b.name))) {
                const chip = picker.createDiv('storyteller-campaign-char-chip');
                chip.textContent = ch.name;
                chip.addEventListener('click', () => {
                    if (selected.has(ch.name)) { selected.delete(ch.name); chip.removeClass('is-selected'); }
                    else { selected.add(ch.name); chip.addClass('is-selected'); }
                });
            }
        } catch { /* no story loaded */ }

        const startBtn = form.createEl('button', { cls: 'storyteller-campaign-btn is-primary', text: 'Start Session' });
        startBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) { new Notice('Session name is required.'); return; }
            const story = this.plugin.getActiveStory();

            // Seed partyItems from each selected character's ownedItems
            const seedItems: string[] = [];
            try {
                const allChars = await this.plugin.listCharacters();
                for (const char of allChars) {
                    if (selected.has(char.name)) {
                        for (const item of char.ownedItems ?? []) {
                            const hasItem = seedItems.some(existing => this.normalizeName(existing) === this.normalizeName(item));
                            if (!hasItem) seedItems.push(item);
                        }
                    }
                }
            } catch { /* ignore â€” no characters loaded */ }

            const newSession: CampaignSession = {
                name,
                storyId: story?.id ?? '',
                partyCharacterNames: [...selected],
                currentSceneName: sceneSelect.value || undefined,
                partyItems: seedItems,
                flags: [],
                revealedCompendiumEntryIds: [],
                groupStandings: [],
                status: 'active',
            };
            await this.plugin.saveSession(newSession);
            await this.loadSession(newSession);
            await this.render();
        });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // PLAY MODE
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private async renderPlay(root: HTMLElement): Promise<void> {
        const session = this.session!;
        this.ensureActiveActor(session);
        await this.ensurePartyCharacterStats(session);

        // â”€â”€ Toolbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const toolbar = root.createDiv('storyteller-campaign-toolbar');

        const backBtn = toolbar.createEl('button', { cls: 'storyteller-campaign-toolbar-btn', attr: { 'aria-label': 'Go back' } });
        setIcon(backBtn, 'arrow-left');
        backBtn.disabled = this.sceneHistory.length === 0;
        backBtn.addEventListener('click', () => this.navigateBack());

        toolbar.createEl('span', {
            cls: 'storyteller-campaign-scene-name',
            text: this.currentScene?.name ?? 'No scene',
        });
        this.renderActorSelector(toolbar, session);
        toolbar.createDiv({ cls: 'storyteller-campaign-toolbar-spacer' });

        if (this.encounterTable?.trigger === 'manual') {
            const encBtn = toolbar.createEl('button', { cls: 'storyteller-campaign-toolbar-btn' });
            setIcon(encBtn.createSpan(), 'dices');
            encBtn.createSpan({ text: ' Encounter' });
            encBtn.addEventListener('click', () => this.showEncounterOverlay(main));
        }

        const graphBtn = toolbar.createEl('button', { cls: 'storyteller-campaign-toolbar-btn', attr: { 'aria-label': 'Scene graph' } });
        setIcon(graphBtn, 'git-fork');
        graphBtn.addEventListener('click', () => this.plugin.activateSceneGraphView());

        const endBtn = toolbar.createEl('button', { cls: 'storyteller-campaign-toolbar-btn mod-warning', text: 'End' });
        endBtn.addEventListener('click', async () => {
            session.status = 'paused';
            await this.autosave('Session paused.');
            this.session = null;
            this.currentScene = null;
            await this.render();
        });

        // â”€â”€ Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const main = root.createDiv('storyteller-campaign-main');

        const scenePanel = main.createDiv('storyteller-campaign-scene-panel');
        await this.renderScenePanel(scenePanel);

        const sidebar = main.createDiv('storyteller-campaign-sidebar');
        this.renderPartySidebar(sidebar, session);
        await this.renderInventorySidebar(sidebar, session);
        await this.renderLoreSidebar(sidebar, session);
        this.renderGroupStandingsSidebar(sidebar, session);
        await this.renderLogSidebar(sidebar, session);
    }

    // â”€â”€ Scene panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private async renderScenePanel(panel: HTMLElement): Promise<void> {
        panel.empty();

        if (!this.currentScene) {
            panel.createEl('p', { cls: 'storyteller-campaign-empty', text: 'No scene loaded.' });
            await this.renderScenePicker(panel);
            return;
        }

        // Header
        panel.createEl('h2', { text: this.currentScene.name });
        if (this.currentScene.synopsis) {
            panel.createEl('p', { cls: 'storyteller-campaign-synopsis', text: this.currentScene.synopsis });
        }

        // Open note button
        const noteBtn = panel.createEl('button', { cls: 'storyteller-campaign-open-note-btn' });
        setIcon(noteBtn.createSpan(), 'file-text');
        noteBtn.createSpan({ text: ' Open note' });
        noteBtn.addEventListener('click', () => {
            if (this.currentScene?.filePath) {
                this.plugin.app.workspace.openLinkText(this.currentScene.filePath, '', 'tab');
            }
        });

        await this.renderCampaignBoard(panel);

        // Markdown scene body (branch/encounter blocks stripped)
        if (this.sceneBody.trim()) {
            const bodyEl = panel.createDiv('storyteller-campaign-scene-body');
            const clean = this.sceneBody
                .replace(/^```branch[\s\S]*?^```\n?/gm, '')
                .replace(/^```encounter[\s\S]*?^```\n?/gm, '')
                .trim();
            if (clean) {
                await MarkdownRenderer.render(
                    this.plugin.app, clean, bodyEl,
                    this.currentScene.filePath ?? '', this,
                );
            }
        }

        // Scene entity context: location badge, NPCs, items at scene
        this.renderSceneEntityContext(panel);

        // Encounter table display
        if (this.encounterTable) {
            renderEncounterWidget(panel.createDiv('storyteller-campaign-encounter-wrap'), this.encounterTable);
        }

        // Choices
        if (this.branches.length > 0) {
            const branchHdr = panel.createDiv('storyteller-campaign-branch-header');
            setIcon(branchHdr.createSpan(), 'git-branch');
            branchHdr.createSpan({ text: ' Choices' });
            const branchList = panel.createDiv('storyteller-campaign-branch-list');
            for (const b of this.branches) {
                if (b.hidden) continue;
                this.renderPlayBranchCard(branchList, b, panel);
            }
        } else {
            const dead = panel.createDiv('storyteller-campaign-dead-end');
            setIcon(dead.createSpan(), 'flag');
            dead.createSpan({ text: ' End of scene.' });
        }
    }

    private renderSceneEntityContext(panel: HTMLElement): void {
        const scene = this.currentScene;
        if (!scene) return;

        const locName = scene.linkedLocations?.[0];
        const npcs    = scene.linkedCharacters ?? [];
        const items   = scene.linkedItems ?? [];
        const sceneGroups = this.resolveGroupRefs(scene.linkedGroups ?? []);
        const locationGroups = this.resolveGroupRefs(this.locationData?.groups ?? []);

        if (!locName && !npcs.length && !items.length && !sceneGroups.length && !locationGroups.length) return;

        const ctx = panel.createDiv('storyteller-campaign-scene-context');

        if (locName) {
            const locBadge = ctx.createDiv('storyteller-campaign-location-badge');
            setIcon(locBadge.createSpan(), 'map-pin');
            locBadge.createSpan({ text: ` ${locName}` });
            if (this.locationData?.dndEncounterBonus) {
                const bonus = this.locationData.dndEncounterBonus;
                locBadge.createSpan({
                    cls: `storyteller-campaign-loc-bonus ${bonus > 0 ? 'is-positive' : 'is-negative'}`,
                    text: ` (${bonus > 0 ? '+' : ''}${bonus} to rolls)`,
                });
            }
        }

        if (npcs.length) {
            ctx.createDiv({ cls: 'storyteller-campaign-context-label', text: 'NPCs present' });
            const row = ctx.createDiv('storyteller-campaign-context-chips');
            for (const name of npcs) {
                const chip = row.createSpan({ cls: 'storyteller-campaign-context-chip' });
                setIcon(chip.createSpan(), 'user');
                chip.createSpan({ text: ` ${name}` });
            }
        }

        if (items.length) {
            ctx.createDiv({ cls: 'storyteller-campaign-context-label', text: 'Items at scene' });
            const row = ctx.createDiv('storyteller-campaign-context-chips');
            for (const name of items) {
                const chip = row.createSpan({ cls: 'storyteller-campaign-context-chip is-item' });
                chip.createSpan({ text: name });
                const takeBtn = chip.createEl('button', { cls: 'storyteller-campaign-take-btn', text: 'Take' });
                takeBtn.addEventListener('click', async () => {
                    await this.takePartyItem(name, `Took *${name}*`);
                });
            }
        }

        if (sceneGroups.length) {
            ctx.createDiv({ cls: 'storyteller-campaign-context-label', text: 'Factions in scene' });
            this.renderCampaignGroupChips(ctx, sceneGroups);
        }

        if (locationGroups.length) {
            ctx.createDiv({ cls: 'storyteller-campaign-context-label', text: 'Local powers' });
            this.renderCampaignGroupChips(ctx, locationGroups);
        }
    }

    private async renderCampaignBoard(panel: HTMLElement): Promise<void> {
        if (!this.session || !this.currentScene) return;

        const maps = await this.plugin.listMaps().catch(() => [] as StoryMap[]);
        const boardMap = await this.resolveCampaignBoardMap(maps);
        if (!boardMap) return;

        const mapId = boardMap.id || boardMap.name;
        const boardEl = panel.createDiv('storyteller-campaign-board');

        const header = boardEl.createDiv('storyteller-campaign-board-header');
        const titleWrap = header.createDiv('storyteller-campaign-board-title-wrap');
        titleWrap.createDiv({ cls: 'storyteller-campaign-board-kicker', text: 'Campaign board' });
        titleWrap.createEl('h3', { cls: 'storyteller-campaign-board-title', text: boardMap.name });
        const sceneOverride = this.mapReferenceMatches(this.currentScene.campaignBoardMapId, boardMap);
        const autoSource = sceneOverride
            ? 'Scene override'
            : this.locationData
                ? `From ${this.locationData.name}`
                : 'Session board';
        titleWrap.createDiv({ cls: 'storyteller-campaign-board-meta', text: autoSource });

        const actions = header.createDiv('storyteller-campaign-board-actions');
        if (boardMap.filePath) {
            const noteBtn = actions.createEl('button', { cls: 'storyteller-campaign-btn', text: 'Open map' });
            setIcon(noteBtn.createSpan(), 'map');
            noteBtn.addEventListener('click', () => {
                if (boardMap.filePath) {
                    this.plugin.app.workspace.openLinkText(boardMap.filePath, '', 'tab');
                }
            });
        }

        const relatedMaps = [
            boardMap.parentMapId,
            ...(boardMap.childMapIds ?? []),
        ]
            .map(id => this.findMapByRef(id, maps))
            .filter((candidate): candidate is StoryMap => Boolean(candidate));
        if (relatedMaps.length > 0) {
            const nav = boardEl.createDiv('storyteller-campaign-board-nav');
            nav.createSpan({ cls: 'storyteller-campaign-board-nav-label', text: 'Boards' });
            for (const relatedMap of relatedMaps) {
                const targetId = relatedMap.id || relatedMap.name;
                const button = nav.createEl('button', {
                    cls: 'storyteller-campaign-board-nav-btn' + (targetId === mapId ? ' is-active' : ''),
                    text: relatedMap.name,
                    attr: { type: 'button' },
                });
                if (relatedMap.parentMapId === boardMap.id || relatedMap.parentMapId === boardMap.name) {
                    button.title = 'Child board';
                } else if (boardMap.parentMapId === targetId) {
                    button.title = 'Parent board';
                }
                button.addEventListener('click', async () => {
                    await this.switchCampaignBoardMap(targetId);
                });
            }
        }

        const imageUrl = this.getMapImageUrl(boardMap);
        if (!imageUrl) {
            boardEl.createDiv({
                cls: 'storyteller-campaign-board-empty',
                text: 'This board has no image yet. Add a background image to the map note to use it in Campaign mode.',
            });
            return;
        }

        const dimensions = await this.getCampaignBoardDimensions(boardMap, imageUrl);
        if (!dimensions) {
            boardEl.createDiv({
                cls: 'storyteller-campaign-board-empty',
                text: 'The board image could not be sized, so markers cannot be rendered yet.',
            });
            return;
        }

        const locations = await this.collectBoardLocations(boardMap);
        const selectedLocationKey = this.ensureBoardLocationSelection(locations);

        const frame = boardEl.createDiv('storyteller-campaign-board-frame');
        const stage = frame.createDiv('storyteller-campaign-board-stage');
        stage.style.aspectRatio = `${dimensions.width} / ${dimensions.height}`;
        const imageEl = stage.createEl('img', {
            cls: 'storyteller-campaign-board-image',
            attr: { src: imageUrl, alt: boardMap.name },
        });
        imageEl.draggable = false;

        if (boardMap.gridEnabled && (boardMap.gridSize ?? 0) > 0) {
            const gridEl = stage.createDiv('storyteller-campaign-board-grid');
            gridEl.style.setProperty('--storyteller-board-grid-x', `${(boardMap.gridSize! / Math.max(dimensions.width, 1)) * 100}%`);
            gridEl.style.setProperty('--storyteller-board-grid-y', `${(boardMap.gridSize! / Math.max(dimensions.height, 1)) * 100}%`);
        }

        for (const entry of locations) {
            const [top, left] = entry.binding.coordinates;
            const topPercent = this.clampBoardPercent((top / Math.max(dimensions.height, 1)) * 100);
            const leftPercent = this.clampBoardPercent((left / Math.max(dimensions.width, 1)) * 100);
            const locationKey = this.getLocationKey(entry.location);
            const button = stage.createEl('button', {
                cls:
                    'storyteller-campaign-board-pin' +
                    (this.isCurrentSceneLocation(entry.location) ? ' is-current' : '') +
                    (selectedLocationKey === locationKey ? ' is-selected' : ''),
                attr: { type: 'button' },
            });
            button.style.top = `${topPercent}%`;
            button.style.left = `${leftPercent}%`;
            button.title = entry.location.name;
            button.createSpan({ cls: 'storyteller-campaign-board-pin-dot' });
            button.createSpan({ cls: 'storyteller-campaign-board-pin-label', text: entry.location.name });
            button.addEventListener('click', async () => {
                const isSameLocation = this.selectedBoardLocationId === locationKey;
                this.selectedBoardLocationId = locationKey;
                if (isSameLocation) {
                    this.focusBoardLocationInspector(locationKey);
                    return;
                }
                this.pendingBoardFocusLocationId = locationKey;
                await this.render();
            });
        }

        const caption = boardEl.createDiv('storyteller-campaign-board-caption');
        caption.setText(
            locations.length > 0
                ? 'Click a mapped location to inspect it, jump scenes, or pull items straight into the party inventory.'
                : 'No locations are bound to this board yet.'
        );

        const selectedLocation = locations.find(entry => this.getLocationKey(entry.location) === selectedLocationKey);
        if (selectedLocation) {
            const inspector = await this.renderBoardLocationInspector(boardEl, selectedLocation);
            if (this.pendingBoardFocusLocationId && this.pendingBoardFocusLocationId === selectedLocationKey) {
                this.pendingBoardFocusLocationId = null;
                this.focusBoardLocationInspector(selectedLocationKey, inspector);
            }
        }
    }

    private async renderBoardLocationInspector(container: HTMLElement, entry: CampaignBoardLocation): Promise<HTMLElement> {
        const inspector = container.createDiv('storyteller-campaign-board-inspector');
        inspector.dataset.locationKey = this.getLocationKey(entry.location);
        const header = inspector.createDiv('storyteller-campaign-board-inspector-header');
        header.createDiv({ cls: 'storyteller-campaign-board-inspector-kicker', text: 'Selected location' });
        header.createEl('h4', { text: entry.location.name });

        const actions = header.createDiv('storyteller-campaign-board-inspector-actions');
        if (entry.location.filePath) {
            const noteBtn = actions.createEl('button', { cls: 'storyteller-campaign-btn', text: 'Open note' });
            noteBtn.addEventListener('click', () => {
                if (entry.location.filePath) {
                    this.plugin.app.workspace.openLinkText(entry.location.filePath, '', 'tab');
                }
            });
        }

        if (entry.location.description) {
            inspector.createDiv({
                cls: 'storyteller-campaign-board-inspector-copy',
                text: entry.location.description,
            });
        }

        const scenes = entry.scenes;
        if (scenes.length > 0) {
            inspector.createDiv({ cls: 'storyteller-campaign-context-label', text: 'Scenes here' });
            const sceneRow = inspector.createDiv('storyteller-campaign-board-pill-row');
            for (const scene of scenes) {
                const isCurrent = this.currentScene?.name === scene.name;
                const button = sceneRow.createEl('button', {
                    cls: 'storyteller-campaign-board-pill' + (isCurrent ? ' is-active' : ''),
                    text: isCurrent ? `${scene.name} (current)` : scene.name,
                    attr: { type: 'button' },
                });
                button.disabled = isCurrent;
                button.addEventListener('click', async () => {
                    await this.doNavigate(scene.name, true);
                });
            }
        }

        const [characters, items] = await Promise.all([
            this.resolveLocationCharacterNames(entry.location),
            this.resolveLocationItemNames(entry.location),
        ]);

        if (characters.length > 0) {
            inspector.createDiv({ cls: 'storyteller-campaign-context-label', text: 'Characters here' });
            const row = inspector.createDiv('storyteller-campaign-board-pill-row');
            for (const name of characters) {
                row.createSpan({ cls: 'storyteller-campaign-board-pill', text: name });
            }
        }

        if (items.length > 0) {
            inspector.createDiv({ cls: 'storyteller-campaign-context-label', text: 'Items here' });
            const row = inspector.createDiv('storyteller-campaign-board-pill-row');
            const inventory = this.session?.partyItems ?? [];
            for (const name of items) {
                const hasItem = inventory.some(item => this.normalizeName(item) === this.normalizeName(name));
                const wasTakenFromBoard = this.wasBoardItemCollected(entry.location, name);
                const itemWrap = row.createDiv('storyteller-campaign-board-item');
                itemWrap.createSpan({ cls: 'storyteller-campaign-board-pill', text: name });
                const takeBtn = itemWrap.createEl('button', {
                    cls: 'storyteller-campaign-take-btn',
                    text: hasItem ? 'Owned' : wasTakenFromBoard ? 'Taken' : 'Take',
                    attr: { type: 'button' },
                });
                takeBtn.disabled = hasItem || wasTakenFromBoard;
                takeBtn.addEventListener('click', async () => {
                    await this.takePartyItem(name, `Took *${name}* from *${entry.location.name}*`, entry.location);
                });
            }
        }

        return inspector;
    }

    private getLocationKey(location: Pick<Location, 'id' | 'name'>): string {
        return location.id || this.normalizeName(location.name);
    }

    private getBoardItemCollectionKey(location: Pick<Location, 'id' | 'name'>, itemName: string): string {
        return `${this.getLocationKey(location)}::${this.normalizeName(itemName)}`;
    }

    private wasBoardItemCollected(location: Pick<Location, 'id' | 'name'>, itemName: string): boolean {
        const collected = this.session?.collectedBoardItemKeys ?? [];
        return collected.includes(this.getBoardItemCollectionKey(location, itemName));
    }

    private markBoardItemCollected(location: Pick<Location, 'id' | 'name'>, itemName: string): void {
        if (!this.session) return;
        const collectionKey = this.getBoardItemCollectionKey(location, itemName);
        const existing = this.session.collectedBoardItemKeys ?? [];
        if (existing.includes(collectionKey)) return;
        this.session.collectedBoardItemKeys = [...existing, collectionKey];
    }

    private focusBoardLocationInspector(locationKey: string, inspector?: HTMLElement | null): void {
        const target = inspector ?? this.containerEl.querySelector<HTMLElement>(
            `.storyteller-campaign-board-inspector[data-location-key="${CSS.escape(locationKey)}"]`
        );
        if (!target) return;

        window.requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            target.addClass('is-highlighted');
            window.setTimeout(() => target.removeClass('is-highlighted'), 900);
        });
    }

    private clampBoardPercent(value: number): number {
        return Math.max(2, Math.min(98, value));
    }

    private ensureBoardLocationSelection(locations: CampaignBoardLocation[]): string | null {
        if (locations.length === 0) {
            this.selectedBoardLocationId = null;
            return null;
        }

        if (this.selectedBoardLocationId) {
            const existing = locations.find(entry => this.getLocationKey(entry.location) === this.selectedBoardLocationId);
            if (existing) return this.selectedBoardLocationId;
        }

        const currentLocation = this.locationData
            ? locations.find(entry => this.getLocationKey(entry.location) === this.getLocationKey(this.locationData!))
            : null;
        if (currentLocation) {
            this.selectedBoardLocationId = this.getLocationKey(currentLocation.location);
            return this.selectedBoardLocationId;
        }

        this.selectedBoardLocationId = this.getLocationKey(locations[0].location);
        return this.selectedBoardLocationId;
    }

    private isCurrentSceneLocation(location: Location): boolean {
        if (!this.locationData) return false;
        return this.getLocationKey(location) === this.getLocationKey(this.locationData);
    }

    private locationMatchesReference(location: Location, locationRef: string | null | undefined): boolean {
        const normalizedRef = this.normalizeName(String(locationRef ?? ''));
        if (!normalizedRef) return false;
        return normalizedRef === this.normalizeName(location.id || '') || normalizedRef === this.normalizeName(location.name);
    }

    private async collectBoardLocations(map: StoryMap): Promise<CampaignBoardLocation[]> {
        const [locations, scenes] = await Promise.all([
            this.plugin.listLocations().catch(() => [] as Location[]),
            this.allScenes.length
                ? Promise.resolve(this.allScenes)
                : this.plugin.listScenes().catch(() => [] as Scene[]),
        ]);

        return locations
            .map(location => {
                const binding = location.mapBindings?.find(candidate => this.mapReferenceMatches(candidate.mapId, map));
                if (!binding) return null;
                const matchingScenes = scenes.filter(scene =>
                    (scene.linkedLocations ?? []).some(name => this.normalizeName(name) === this.normalizeName(location.name))
                );
                return { location, binding, scenes: matchingScenes };
            })
            .filter((entry): entry is CampaignBoardLocation => Boolean(entry))
            .sort((a, b) => a.location.name.localeCompare(b.location.name));
    }

    private async resolveCampaignBoardMap(maps?: StoryMap[]): Promise<StoryMap | null> {
        const availableMaps = maps ?? await this.plugin.listMaps().catch(() => [] as StoryMap[]);
        if (!availableMaps.length) return null;

        const activeMapId = this.session?.activeMapId;
        if (activeMapId) {
            const active = this.findMapByRef(activeMapId, availableMaps);
            if (active) return active;
        }

        const defaultMapId = await this.resolveDefaultCampaignBoardMapId(availableMaps);
        if (!defaultMapId) return null;
        return this.findMapByRef(defaultMapId, availableMaps);
    }

    private async resolveDefaultCampaignBoardMapId(maps?: StoryMap[]): Promise<string | null> {
        const scene = this.currentScene;
        if (!scene) return null;

        const availableMaps = maps ?? await this.plugin.listMaps().catch(() => [] as StoryMap[]);
        const sceneOverride = this.findMapByRef(scene.campaignBoardMapId, availableMaps);
        if (sceneOverride) {
            return sceneOverride.id || sceneOverride.name;
        }

        let location = this.locationData;
        if (!location) {
            const locationName = scene.linkedLocations?.[0];
            if (locationName) {
                const locations = await this.plugin.listLocations().catch(() => [] as Location[]);
                location = locations.find(candidate => this.normalizeName(candidate.name) === this.normalizeName(locationName)) ?? null;
            }
        }
        if (!location) return null;

        const correspondingLocationMap = this.findMapByRef(location.correspondingMapId, availableMaps);
        if (correspondingLocationMap) {
            return correspondingLocationMap.id || correspondingLocationMap.name;
        }

        const locationKeys = new Set(
            [location.id, location.name]
                .filter((value): value is string => Boolean(value))
                .map(value => this.normalizeName(value))
        );
        const correspondingMap = availableMaps.find(map =>
            Boolean(map.correspondingLocationId) &&
            locationKeys.has(this.normalizeName(String(map.correspondingLocationId)))
        );
        if (correspondingMap) {
            return correspondingMap.id || correspondingMap.name;
        }

        const boundMap = (location.mapBindings ?? [])
            .map(binding => this.findMapByRef(binding.mapId, availableMaps))
            .find((candidate): candidate is StoryMap => Boolean(candidate));
        return boundMap ? (boundMap.id || boundMap.name) : null;
    }

    private async syncActiveCampaignBoardForScene(): Promise<void> {
        if (!this.session) return;
        const defaultMapId = await this.resolveDefaultCampaignBoardMapId();
        this.session.activeMapId = defaultMapId ?? undefined;
        this.selectedBoardLocationId = this.locationData ? this.getLocationKey(this.locationData) : null;
    }

    private async switchCampaignBoardMap(mapId: string): Promise<void> {
        if (!this.session) return;
        if (this.session.activeMapId === mapId) return;
        this.session.activeMapId = mapId;
        this.selectedBoardLocationId = this.locationData ? this.getLocationKey(this.locationData) : null;
        await this.autosave();
        await this.render();
    }

    private findMapByRef(mapRef: string | null | undefined, maps: StoryMap[]): StoryMap | null {
        const normalizedRef = String(mapRef ?? '').trim();
        if (!normalizedRef) return null;
        const lowerRef = this.normalizeName(normalizedRef);
        return maps.find(map =>
            (map.id && map.id === normalizedRef) ||
            this.normalizeName(map.name) === lowerRef
        ) ?? null;
    }

    private mapReferenceMatches(mapRef: string | null | undefined, map: StoryMap): boolean {
        const normalizedRef = String(mapRef ?? '').trim();
        if (!normalizedRef) return false;
        return (map.id && map.id === normalizedRef) || this.normalizeName(map.name) === this.normalizeName(normalizedRef);
    }

    private getMapImageUrl(map: StoryMap): string | null {
        const imagePath = map.backgroundImagePath || map.image;
        if (!imagePath) return null;
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;

        const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(imagePath));
        if (file instanceof TFile) {
            return this.plugin.app.vault.getResourcePath(file);
        }

        const fallback = this.plugin.app.vault.getFiles().find(candidate =>
            candidate.path === imagePath ||
            candidate.path.endsWith(`/${imagePath}`) ||
            candidate.name === imagePath
        );
        return fallback ? this.plugin.app.vault.getResourcePath(fallback) : null;
    }

    private async getCampaignBoardDimensions(map: StoryMap, imageUrl: string): Promise<{ width: number; height: number } | null> {
        if (map.width && map.height) {
            return { width: map.width, height: map.height };
        }

        return await new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(
                img.naturalWidth > 0 && img.naturalHeight > 0
                    ? { width: img.naturalWidth, height: img.naturalHeight }
                    : null
            );
            img.onerror = () => resolve(null);
            img.src = imageUrl;
        });
    }

    private async resolveLocationCharacterNames(location: Location): Promise<string[]> {
        const refs = location.entityRefs ?? [];
        const characters = await this.plugin.listCharacters().catch(() => [] as Character[]);
        const resolved = refs
            .filter(ref => this.normalizeName(ref.entityType || '') === 'character')
            .map(ref => this.resolveEntityRefName(ref, characters));

        for (const character of characters) {
            if (!this.locationMatchesReference(location, character.currentLocationId)) continue;
            resolved.push(character.name);
        }

        if (this.isCurrentSceneLocation(location)) {
            resolved.push(...(this.currentScene?.linkedCharacters ?? []));
        }

        return Array.from(new Set(resolved.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
    }

    private async resolveLocationItemNames(location: Location): Promise<string[]> {
        const refs = location.entityRefs ?? [];
        const items = await this.plugin.listPlotItems().catch(() => [] as PlotItem[]);
        const resolved = refs
            .filter(ref => this.normalizeName(ref.entityType || '') === 'item')
            .map(ref => this.resolveEntityRefName(ref, items));

        if (this.isCurrentSceneLocation(location)) {
            resolved.push(...(this.currentScene?.linkedItems ?? []));
        }

        return Array.from(new Set(resolved.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
    }

    private resolveEntityRefName<T extends { id?: string; name: string }>(ref: EntityRef, entities: T[]): string | null {
        if (ref.entityName?.trim()) return ref.entityName.trim();
        const entityId = ref.entityId?.trim();
        if (!entityId) return null;
        const match = entities.find(entity =>
            (entity.id && entity.id === entityId) ||
            this.normalizeName(entity.name) === this.normalizeName(entityId)
        );
        return match?.name ?? entityId;
    }

    private async takePartyItem(name: string, logEntry: string, sourceLocation?: Pick<Location, 'id' | 'name'>): Promise<void> {
        if (!this.session) return;
        const inventory = this.session.partyItems ?? [];
        const hasItem = inventory.some(item => this.normalizeName(item) === this.normalizeName(name));
        if (hasItem) {
            new Notice(`${name} is already in your inventory.`);
            return;
        }

        const previousItems = [...inventory];
        this.session.partyItems = [...inventory, name];
        if (sourceLocation) {
            this.markBoardItemCollected(sourceLocation, name);
        }
        await this.syncPartyInventoryOwnership(this.session, previousItems);
        await this.autosave(logEntry);
        new Notice(`${name} added to inventory.`);
        await this.render();
    }

    private renderPlayBranchCard(container: HTMLElement, branch: SceneBranch, panelEl: HTMLElement): void {
        const resolvedBranch = this.resolveBranchReferences(branch);
        const actorState = this.getBranchActorState(resolvedBranch);
        const check = this.session
            ? checkBranchConditions(resolvedBranch, this.session, actorState)
            : { met: true, unmet: [] };

        const card = container.createDiv('storyteller-campaign-play-branch' + (!check.met ? ' is-blocked' : ''));

        // Label + target
        const labelRow = card.createDiv('storyteller-campaign-play-branch-label');
        labelRow.createSpan({ text: resolvedBranch.label });
        if (resolvedBranch.target) {
            labelRow.createSpan({ cls: 'storyteller-campaign-play-branch-target', text: `-> ${resolvedBranch.target}` });
        }

        // Condition tags
        const tags = card.createDiv('storyteller-campaign-play-branch-tags');
        if (resolvedBranch.dice) {
            const stat = resolvedBranch.stat ? ` ${resolvedBranch.stat.toUpperCase()}` : '';
            const thr  = resolvedBranch.threshold != null ? ` >=${resolvedBranch.threshold}` : '';
            tags.createSpan({ cls: 'storyteller-branch-tag is-dice', text: `Dice ${resolvedBranch.dice}${stat}${thr}` });
        }
        if (resolvedBranch.stat && this.activeActorName) {
            tags.createSpan({ cls: 'storyteller-branch-tag is-character', text: `Actor: ${this.activeActorName}` });
        }
        if (resolvedBranch.requiresStatMin != null && resolvedBranch.stat && !resolvedBranch.dice) {
            tags.createSpan({ cls: 'storyteller-branch-tag is-stat', text: `${resolvedBranch.stat.toUpperCase()} >= ${resolvedBranch.requiresStatMin}` });
        }
        if (resolvedBranch.requiresItem) {
            const has = this.session?.partyItems?.some(i => i.toLowerCase() === resolvedBranch.requiresItem!.toLowerCase());
            tags.createSpan({ cls: `storyteller-branch-tag is-item${has ? '' : ' is-unmet'}`, text: `Item: ${resolvedBranch.requiresItem}` });
        }
        if (resolvedBranch.requiresCharacter) {
            const has = this.session?.partyCharacterNames?.some(n => n.toLowerCase() === resolvedBranch.requiresCharacter!.toLowerCase());
            tags.createSpan({ cls: `storyteller-branch-tag is-character${has ? '' : ' is-unmet'}`, text: `Character: ${resolvedBranch.requiresCharacter}` });
        }
        if (resolvedBranch.requiresFlag) {
            const has = this.session?.flags?.includes(resolvedBranch.requiresFlag);
            tags.createSpan({ cls: `storyteller-branch-tag is-flag${has ? '' : ' is-unmet'}`, text: `Flag: ${resolvedBranch.requiresFlag}` });
        }
        if (resolvedBranch.requiresGroupStanding || resolvedBranch.requiresGroupStandingId) {
            const groupName = this.resolveGroupName(resolvedBranch.requiresGroupStandingId, resolvedBranch.requiresGroupStanding) ?? 'Faction';
            const minStanding = resolvedBranch.requiresGroupStandingMin ?? 1;
            const currentStanding = this.getSessionGroupStandingValue(this.session, resolvedBranch.requiresGroupStandingId, resolvedBranch.requiresGroupStanding);
            const has = currentStanding >= minStanding;
            tags.createSpan({
                cls: `storyteller-branch-tag is-group${has ? '' : ' is-unmet'}`,
                text: `Faction ${groupName} ${currentStanding}/${minStanding}`,
            });
        }
        if (resolvedBranch.requiresCompendiumEntry || resolvedBranch.requiresCompendiumEntryId) {
            const loreName = resolvedBranch.requiresCompendiumEntry ?? resolvedBranch.requiresCompendiumEntryId ?? 'Lore';
            const has = this.isCompendiumEntryRevealed(this.session, resolvedBranch.requiresCompendiumEntryId, resolvedBranch.requiresCompendiumEntry);
            tags.createSpan({
                cls: `storyteller-branch-tag is-note${has ? '' : ' is-unmet'}`,
                text: `Lore ${loreName}`,
            });
        }

        if (!check.met) {
            for (const reason of check.unmet) {
                card.createDiv({ cls: 'storyteller-campaign-play-branch-blocked', text: reason });
            }
        }

        card.addEventListener('click', () => {
            if (!check.met) { new Notice(check.unmet.join(' | ')); return; }
            if (resolvedBranch.dice) { this.showDiceOverlay(resolvedBranch, panelEl); }
            else { this.executeChoice(resolvedBranch, 'success'); }
        });
    }

    // â”€â”€ Dice overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private showDiceOverlay(branch: SceneBranch, panelEl: HTMLElement): void {
        const overlay = panelEl.createDiv('storyteller-dice-overlay');
        const box = overlay.createDiv('storyteller-dice-box');

        box.createEl('h3', { text: branch.label });

        const locBonus = this.locationData?.dndEncounterBonus ?? 0;
        const actorState = this.getBranchActorState(branch);
        const actorName = actorState?.characterName ?? this.activeActorName ?? 'party';
        const statScore = branch.stat && actorState
            ? Number(actorState[this.getStatKey(branch.stat)] ?? 10)
            : undefined;
        const statBonus = branch.stat ? statModifier(statScore ?? 10) : 0;

        const infoEl = box.createDiv('storyteller-dice-info');
        const statLabel = branch.stat ? ` + ${branch.stat.toUpperCase()} mod (${actorName})` : '';
        infoEl.createSpan({ text: `Roll ${branch.dice}${statLabel}` });
        if (locBonus !== 0) {
            infoEl.createSpan({
                cls: `storyteller-dice-loc-bonus ${locBonus > 0 ? 'is-positive' : 'is-negative'}`,
                text: ` ${locBonus > 0 ? '+' : ''}${locBonus} (location)`,
            });
        }
        if (branch.stat) {
            infoEl.createSpan({
                cls: `storyteller-dice-loc-bonus ${statBonus > 0 ? 'is-positive' : statBonus < 0 ? 'is-negative' : ''}`,
                text: ` ${statBonus > 0 ? '+' : ''}${statBonus} (${branch.stat.toUpperCase()})`,
            });
        }
        if (branch.threshold != null) {
            infoEl.createSpan({ cls: 'storyteller-dice-threshold', text: ` - need >= ${branch.threshold}` });
        }

        const face   = box.createDiv({ cls: 'storyteller-dice-face', text: '?' });
        const result = box.createDiv('storyteller-dice-result');

        const overWrap = box.createDiv('storyteller-dice-override-wrap');
        overWrap.createSpan({ cls: 'storyteller-dice-override-label', text: 'Override: ' });
        const overInput = overWrap.createEl('input', {
            cls: 'storyteller-campaign-input is-small',
            attr: { type: 'number', placeholder: 'enter total' },
        });

        const btnRow = box.createDiv('storyteller-dice-btn-row');

        let lastTotal: number | null = null;

        const confirmBtn = btnRow.createEl('button', { cls: 'storyteller-campaign-btn is-confirm', text: 'Confirm' });
        confirmBtn.disabled = true;

        const rollBtn = btnRow.createEl('button', { cls: 'storyteller-campaign-btn is-primary', text: 'Roll!' });
        rollBtn.addEventListener('click', () => {
            const override = overInput.value.trim();
            const rawRoll = override ? null : roll(branch.dice!);
            const total = override ? parseInt(override) : (rawRoll! + statBonus + locBonus);
            lastTotal = total;

            face.addClass('rolling');
            face.textContent = '...';
            setTimeout(() => {
                face.removeClass('rolling');
                face.textContent = String(total);

                const outcome = resolveBranch(branch, total);
                if (outcome === 'success') {
                    result.textContent = 'Success!';
                    result.className = 'storyteller-dice-result is-success';
                    confirmBtn.textContent = `Go -> ${branch.target ?? 'next'}`;
                } else {
                    const dest = branch.failMode === 'loop' ? 'retry' : (branch.fail ?? 'fail');
                    result.textContent = `Fail -> ${dest}`;
                    result.className = 'storyteller-dice-result is-fail';
                    confirmBtn.textContent = branch.failMode === 'loop' ? 'Retry' : `Go -> ${dest}`;
                }
                confirmBtn.disabled = false;

                const stat = branch.stat ? ` ${branch.stat.toUpperCase()}(${actorName})` : '';
                const thr  = branch.threshold != null ? ` >=${branch.threshold}` : '';
                const statStr = branch.stat ? ` ${statBonus > 0 ? '+' : ''}${statBonus} stat` : '';
                const locStr = locBonus !== 0 ? ` ${locBonus > 0 ? '+' : ''}${locBonus} loc` : '';
                const logLine = `Rolled ${branch.dice}${stat}${statStr}${locStr} = **${total}**${thr} -> ${outcome === 'success' ? '[success]' : '[fail]'} *${branch.label}*`;
                void this.autosave(logLine);
            }, 600);
        });

        confirmBtn.addEventListener('click', () => {
            if (lastTotal === null) return;
            overlay.remove();
            this.executeChoice(branch, resolveBranch(branch, lastTotal), lastTotal);
        });

        const cancelBtn = btnRow.createEl('button', { cls: 'storyteller-campaign-btn', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    private showEncounterOverlay(panelEl: HTMLElement): void {
        if (!this.encounterTable) return;
        const overlay = panelEl.createDiv('storyteller-dice-overlay');
        const box = overlay.createDiv('storyteller-dice-box');
        renderEncounterWidget(box, this.encounterTable);
        const closeBtn = box.createEl('button', { cls: 'storyteller-campaign-btn', text: 'Close' });
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    // â”€â”€ Branch execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private async executeChoice(branch: SceneBranch, outcome: 'success' | 'fail', rollTotal?: number): Promise<void> {
        if (!this.session) return;

        // Apply outcomes (inventory, flags, party membership)
        const previousItems = [...(this.session.partyItems ?? [])];
        this.session = applyBranchOutcomes(branch, this.session);
        this.ensureActiveActor(this.session);
        await this.ensurePartyCharacterStats(this.session);
        await this.syncPartyInventoryOwnership(this.session, previousItems);
        const eventLogLine = await this.applyTriggeredEvent(branch.triggersEvent, branch.triggersEventId);

        // Determine target
        let target: string | undefined;
        if (outcome === 'success') {
            target = this.resolveSceneName(branch.targetSceneId, branch.target);
        } else if (branch.failMode === 'loop') {
            new Notice('Failed - try again!');
            await this.autosave(`*${branch.label}* - failed (loop retry)`);
            await this.render();
            return;
        } else if (branch.failMode === 'scene') {
            target = this.resolveSceneName(branch.failSceneId, branch.fail);
        }
        // 'continue' â€” no navigation

        const logEntries = [
            rollTotal != null
            ? `*${branch.label}* - rolled ${rollTotal} -> ${outcome}${target ? ` -> *${target}*` : ''}`
            : `Chose *${branch.label}*${target ? ` -> *${target}*` : ''}`,
        ];
        if (branch.revealsCompendiumEntry) logEntries.push(`Revealed lore: *${branch.revealsCompendiumEntry}*`);
        if (branch.changesGroupStanding) {
            const delta = branch.groupStandingDelta ?? 1;
            logEntries.push(`Changed *${branch.changesGroupStanding}* standing by ${delta > 0 ? '+' : ''}${delta}`);
        }
        if (eventLogLine) logEntries.push(eventLogLine);

        if (target && target !== 'continue') {
            await this.autosave(logEntries);
            await this.doNavigate(target, true);
        } else {
            await this.autosave(logEntries);
            await this.render();
        }
    }

    // â”€â”€ Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private resolveSceneReference(value: string): Scene | null {
        const rawValue = value.trim();
        if (!rawValue) return null;
        const unwrappedValue = rawValue.replace(/^\[\[(.*?)\]\]$/, '$1').trim();
        return this.allScenes.find(scene =>
            scene.id === rawValue ||
            scene.id === unwrappedValue ||
            this.normalizeName(scene.name) === this.normalizeName(unwrappedValue)
        ) ?? null;
    }

    private async doNavigate(sceneName: string, pushHistory: boolean): Promise<void> {
        if (!this.session) return;
        if (!this.allScenes.length) {
            try { this.allScenes = await this.plugin.listScenes(); } catch { return; }
        }
        const scene = this.resolveSceneReference(sceneName);
        if (!scene) { new Notice(`Scene "${sceneName}" not found.`); return; }

        if (pushHistory && this.currentScene) this.sceneHistory.push(this.currentScene.name);

        this.currentScene = scene;
        await this.loadCurrentScene();
        await this.loadSceneLocation();
        await this.syncActiveCampaignBoardForScene();

        this.session.currentSceneName = scene.name;
        this.session.currentSceneId   = scene.id;
        await this.autosave(`Entered *${scene.name}*`);

        // On-enter encounter auto-roll
        if (this.encounterTable?.trigger === 'on-enter') {
            const hit = rollEncounterTable(this.encounterTable);
            const logLine = `*On-enter encounter*: **${hit.label}**${hit.target !== 'continue' ? ` -> *${hit.target}*` : ''}`;
            await this.autosave(logLine);
            if (hit.target && hit.target !== 'continue') {
                await this.doNavigate(hit.target, true);
                return;
            }
        }

        await this.render();
    }

    private async navigateBack(): Promise<void> {
        if (!this.sceneHistory.length || !this.session) return;
        const prev = this.sceneHistory.pop()!;
        const scene = this.allScenes.find(s => s.name === prev);
        if (!scene) return;
        this.currentScene = scene;
        await this.loadCurrentScene();
        await this.loadSceneLocation();
        await this.syncActiveCampaignBoardForScene();
        this.session.currentSceneName = scene.name;
        this.session.currentSceneId = scene.id;
        await this.autosave(`Back to *${scene.name}*`);
        await this.render();
    }

    private async loadCurrentScene(): Promise<void> {
        this.sceneBody = '';
        this.branches = [];
        this.encounterTable = null;
        if (!this.currentScene?.filePath) return;
        const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(this.currentScene.filePath));
        if (!(file instanceof TFile)) return;
        const raw = await this.plugin.app.vault.cachedRead(file);
        const m = raw.match(/^---[\s\S]*?---\n?([\s\S]*)$/);
        this.sceneBody = m ? m[1] : raw;
        this.branches = extractBranchesFromMarkdown(raw);
        this.encounterTable = extractEncounterTableFromMarkdown(raw);
    }

    private async loadSceneLocation(): Promise<void> {
        this.locationData = null;
        const locName = this.currentScene?.linkedLocations?.[0];
        if (!locName) return;
        try {
            const locations = await this.plugin.listLocations();
            this.locationData = locations.find(
                l => l.name.toLowerCase() === locName.toLowerCase()
            ) ?? null;

            // Apply ambient flags from location
            if (this.locationData?.ambientFlags?.length && this.session) {
                const flags = this.session.flags ?? [];
                let changed = false;
                for (const flag of this.locationData.ambientFlags) {
                    if (!flags.includes(flag)) { flags.push(flag); changed = true; }
                }
                if (changed) {
                    this.session.flags = flags;
                    await this.autosave(
                        `Location *${locName}* sets flags: ${this.locationData.ambientFlags.join(', ')}`
                    );
                }
            }
        } catch { /* ignore */ }
    }

    private async renderScenePicker(panel: HTMLElement): Promise<void> {
        const wrap = panel.createDiv('storyteller-campaign-scene-picker');
        wrap.createEl('label', { text: 'Jump to scene:' });
        const sel = wrap.createEl('select', { cls: 'storyteller-campaign-input' });
        sel.createEl('option', { value: '', text: 'Select a scene' });
        if (!this.allScenes.length) {
            try { this.allScenes = await this.plugin.listScenes(); } catch { /* no story */ }
        }
        for (const s of this.allScenes.sort((a, b) => a.name.localeCompare(b.name))) {
            sel.createEl('option', { value: s.name, text: s.name });
        }
        if (this.currentScene) {
            sel.value = this.currentScene.name;
        }
        const goBtn = wrap.createEl('button', { cls: 'storyteller-campaign-btn is-primary', text: 'Go' });
        goBtn.disabled = !this.allScenes.length;
        goBtn.addEventListener('click', () => { if (sel.value) this.doNavigate(sel.value, false); });
    }

    // â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private renderPartySidebar(sidebar: HTMLElement, session: CampaignSession): void {
        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section');
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'users');
        hdr.createSpan({ text: ' Party' });
        const body = sec.createDiv('storyteller-campaign-sidebar-body');

        const names = session.partyCharacterNames ?? [];
        if (names.length === 0) {
            body.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'No party members.' });
            return;
        }

        for (const name of names) {
            const state = (session.partyState ?? []).find(
                s => s.characterName.toLowerCase() === name.toLowerCase()
            );
            const row = body.createDiv('storyteller-campaign-party-member');
            row.createSpan({ cls: 'storyteller-campaign-party-name', text: name });

            if (state) {
                this.renderHpRow(row, name, state, session);
                if (state.conditions?.length) {
                    const conds = row.createDiv('storyteller-campaign-conditions');
                    for (const c of state.conditions) conds.createSpan({ cls: 'storyteller-dnd-condition', text: c });
                }
            } else {
                this.renderSetHpRow(row, name, session, body);
            }
        }
    }

    private renderHpRow(row: HTMLElement, name: string, state: PartyMemberState, session: CampaignSession): void {
        const hpRow = row.createDiv('storyteller-campaign-hp-row');
        const hpText = hpRow.createSpan({ cls: 'storyteller-campaign-hp-text', text: `${state.currentHp}/${state.maxHp}` });
        const bar  = hpRow.createDiv('storyteller-hp-bar');
        const fill = bar.createDiv('storyteller-hp-bar-fill');
        const setPct = () => {
            const pct = Math.max(0, Math.min(1, state.currentHp / Math.max(state.maxHp, 1)));
            fill.style.width = `${pct * 100}%`;
            fill.className = 'storyteller-hp-bar-fill' +
                (pct <= 0.25 ? ' critical' : pct <= 0.5 ? ' wounded' : '');
        };
        setPct();

        const ctrl = row.createDiv('storyteller-campaign-hp-controls');
        const minusBtn = ctrl.createEl('button', { cls: 'storyteller-campaign-hp-btn', text: '-' });
        const hpInput  = ctrl.createEl('input', {
            cls: 'storyteller-campaign-input is-small',
            attr: { type: 'number', placeholder: '1', min: '1', value: '1' },
        });
        const plusBtn = ctrl.createEl('button', { cls: 'storyteller-campaign-hp-btn', text: '+' });

        const mutate = async (delta: number) => {
            const amt = parseInt(hpInput.value) || 1;
            state.currentHp = Math.max(0, Math.min(state.maxHp, state.currentHp + delta * amt));
            hpText.textContent = `${state.currentHp}/${state.maxHp}`;
            setPct();
            if (!session.partyState) session.partyState = [];
            const idx = session.partyState.findIndex(s => s.characterName === name);
            if (idx >= 0) session.partyState[idx] = state; else session.partyState.push(state);
            await this.autosave();
        };
        minusBtn.addEventListener('click', () => mutate(-1));
        plusBtn.addEventListener('click',  () => mutate(1));
    }

    private renderSetHpRow(row: HTMLElement, name: string, session: CampaignSession, body: HTMLElement): void {
        const ctrl = row.createDiv('storyteller-campaign-hp-controls');
        const input = ctrl.createEl('input', {
            cls: 'storyteller-campaign-input is-small',
            attr: { type: 'number', placeholder: 'Max HP' },
        });
        const setBtn = ctrl.createEl('button', { cls: 'storyteller-campaign-hp-btn', text: 'Set HP' });
        setBtn.addEventListener('click', async () => {
            const maxHp = parseInt(input.value);
            if (!maxHp) return;
            if (!session.partyState) session.partyState = [];
            session.partyState.push({ characterId: '', characterName: name, currentHp: maxHp, maxHp });
            await this.autosave();
            body.empty();
            this.renderPartySidebar(body.parentElement!.parentElement!, session);
        });
    }

    private async renderInventorySidebar(sidebar: HTMLElement, session: CampaignSession): Promise<void> {
        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section');
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'backpack');
        hdr.createSpan({ text: ' Inventory' });
        const body = sec.createDiv('storyteller-campaign-sidebar-body');

        let plotItems: PlotItem[] = [];
        try {
            plotItems = await this.plugin.listPlotItems();
        } catch {
            plotItems = [];
        }

        const itemMap = new Map(
            plotItems.map(item => [this.normalizeName(item.name), item] as const)
        );
        const getPlotItem = (itemName: string): PlotItem | undefined => itemMap.get(this.normalizeName(itemName));

        const list = body.createDiv('storyteller-campaign-item-list');
        let syncAddOptions = () => {};
        const rebuild = () => {
            list.empty();
            const items = session.partyItems ?? [];
            if (!items.length) list.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'Empty.' });
            for (const item of items) {
                const itemRow = list.createDiv('storyteller-campaign-item-row');
                itemRow.createSpan({ cls: 'storyteller-campaign-item-name', text: item });

                const ownerSelect = itemRow.createEl('select', {
                    cls: 'storyteller-campaign-input is-small storyteller-campaign-item-owner',
                    attr: { 'aria-label': `Owner for ${item}` },
                });
                ownerSelect.createEl('option', { value: '', text: 'Shared' });
                for (const partyName of session.partyCharacterNames ?? []) {
                    ownerSelect.createEl('option', { value: partyName, text: partyName });
                }

                const plotItem = getPlotItem(item);
                ownerSelect.value = plotItem?.currentOwner ?? '';
                if (!plotItem) {
                    ownerSelect.disabled = true;
                    ownerSelect.title = 'Create a matching Plot Item to track ownership.';
                }
                ownerSelect.addEventListener('change', async () => {
                    const entry = getPlotItem(item);
                    if (!entry) return;
                    const nextOwner = ownerSelect.value.trim() || undefined;
                    if ((entry.currentOwner ?? '') === (nextOwner ?? '')) return;
                    entry.currentOwner = nextOwner;
                    await this.plugin.savePlotItem(entry);
                    await this.autosave(
                        nextOwner
                            ? `Assigned *${item}* to *${nextOwner}*`
                            : `Set *${item}* as shared inventory`
                    );
                });

                const useBtn = itemRow.createEl('button', { cls: 'storyteller-campaign-hp-btn', attr: { 'aria-label': 'Use' } });
                setIcon(useBtn, 'zap');
                useBtn.addEventListener('click', async () => {
                    await this.useItem(item, session, rebuild);
                });
                const del = itemRow.createEl('button', { cls: 'storyteller-campaign-hp-btn', attr: { 'aria-label': 'Remove' } });
                setIcon(del, 'cross');
                del.addEventListener('click', async () => {
                    const previousItems = [...(session.partyItems ?? [])];
                    session.partyItems = (session.partyItems ?? []).filter(i => i !== item);
                    await this.syncPartyInventoryOwnership(session, previousItems);
                    await this.autosave();
                    rebuild();
                });
            }
            syncAddOptions();
        };
        rebuild();

        const addRow = body.createDiv('storyteller-campaign-item-add-row');
        const addSelect = addRow.createEl('select', {
            cls: 'storyteller-campaign-input storyteller-campaign-item-add-select',
            attr: { 'aria-label': 'Add available item to inventory' },
        });
        const addBtn = addRow.createEl('button', { cls: 'storyteller-campaign-btn', text: 'Add' });

        syncAddOptions = () => {
            addSelect.empty();
            const owned = new Set((session.partyItems ?? []).map(item => this.normalizeName(item)));
            const available = plotItems
                .map(item => item.name)
                .filter(Boolean)
                .filter(name => !owned.has(this.normalizeName(name)));

            if (!available.length) {
                addSelect.createEl('option', { value: '', text: 'No available items' });
                addSelect.disabled = true;
                addBtn.disabled = true;
                return;
            }

            addSelect.createEl('option', { value: '', text: 'Select item...' });
            for (const name of available.sort((a, b) => a.localeCompare(b))) {
                addSelect.createEl('option', { value: name, text: name });
            }
            addSelect.disabled = false;
            addBtn.disabled = false;
        };
        syncAddOptions();

        const doAdd = async () => {
            const name = addSelect.value.trim();
            if (!name) return;
            const alreadyHas = (session.partyItems ?? []).some(item => this.normalizeName(item) === this.normalizeName(name));
            if (alreadyHas) {
                new Notice(`${name} is already in your inventory.`);
                return;
            }
            const previousItems = [...(session.partyItems ?? [])];
            session.partyItems = [...(session.partyItems ?? []), name];
            await this.syncPartyInventoryOwnership(session, previousItems);
            await this.autosave();
            addSelect.value = '';
            rebuild();
        };
        addBtn.addEventListener('click', doAdd);
        addSelect.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

        // Active flags display
        if (session.flags?.length) {
            const flagsHdr = body.createDiv({ cls: 'storyteller-campaign-sidebar-sub-hdr', text: 'Flags' });
            const flagList = body.createDiv('storyteller-campaign-flag-list');
            for (const flag of session.flags) {
                flagList.createSpan({ cls: 'storyteller-branch-tag is-flag', text: `Flag: ${flag}` });
            }
        }
    }

    private async renderLogSidebar(sidebar: HTMLElement, session: CampaignSession): Promise<void> {
        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section');
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'scroll');
        hdr.createSpan({ text: ' Session Log' });
        const body = sec.createDiv('storyteller-campaign-sidebar-body');

        if (!session.filePath) {
            body.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'Not yet saved.' });
            return;
        }

        let log = '';
        try { log = await this.plugin.loadSessionLog(session.filePath); } catch { /* ignore */ }

        const logList = body.createDiv('storyteller-campaign-log-list');
        if (!log.trim()) {
            logList.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'No entries yet.' });
        } else {
            const lines = log.split('\n').filter(Boolean).slice(-25);
            for (const line of lines) {
                logList.createDiv({ cls: 'storyteller-campaign-log-entry', text: line.replace(/^- /, '') });
            }
            logList.scrollTop = logList.scrollHeight;
        }
    }

    // â”€â”€ Item use â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private async useItem(itemName: string, session: CampaignSession, _onRebuild: () => void): Promise<void> {
        let allItems: PlotItem[] = [];
        try {
            allItems = await this.plugin.listPlotItems();
        } catch {
            allItems = [];
        }

        const plotItem = allItems.find(i => this.normalizeName(i.name) === this.normalizeName(itemName));
        if (!plotItem) {
            new Notice(`${itemName}: No campaign use effect defined.`);
            return;
        }

        if (plotItem.useRequiresLocation) {
            const locName = this.currentScene?.linkedLocations?.[0] ?? '';
            if (this.normalizeName(locName) !== this.normalizeName(plotItem.useRequiresLocation)) {
                new Notice(`${itemName} can only be used at: ${plotItem.useRequiresLocation}`);
                return;
            }
        }

        if (plotItem.useRequiresFlag) {
            if (!(session.flags ?? []).includes(plotItem.useRequiresFlag)) {
                new Notice(`${itemName} requires flag: ${plotItem.useRequiresFlag}`);
                return;
            }
        }

        const advancedEffects = plotItem.campaignItemEffects ?? [];
        const hasLegacyEffect = Boolean(
            plotItem.campaignEffect ||
            plotItem.grantsFlag ||
            plotItem.navigatesToScene ||
            plotItem.consumedOnUse
        );
        if (!hasLegacyEffect && advancedEffects.length === 0) {
            new Notice(`${itemName}: No campaign use effect defined.`);
            return;
        }

        const previousItems = [...(session.partyItems ?? [])];
        let inventoryChanged = false;
        let navigateTarget = plotItem.navigatesToScene?.trim() || undefined;

        if (plotItem.campaignEffect) {
            new Notice(`${itemName}: ${plotItem.campaignEffect}`);
        }

        if (plotItem.grantsFlag) {
            const flags = session.flags ?? [];
            if (!flags.includes(plotItem.grantsFlag)) {
                session.flags = [...flags, plotItem.grantsFlag];
            }
        }

        if (plotItem.consumedOnUse) {
            const nextItems = (session.partyItems ?? []).filter(i => this.normalizeName(i) !== this.normalizeName(itemName));
            inventoryChanged = nextItems.length !== (session.partyItems ?? []).length;
            session.partyItems = nextItems;
        }

        const advancedResult = await this.applyCampaignItemEffects(advancedEffects, plotItem, session, allItems);
        inventoryChanged = inventoryChanged || advancedResult.inventoryChanged;
        if (advancedResult.navigateToScene) {
            navigateTarget = advancedResult.navigateToScene;
        }

        if (inventoryChanged) {
            await this.syncPartyInventoryOwnership(session, previousItems);
        }

        const noticeSummary = advancedResult.summaries.join('; ');
        if (!plotItem.campaignEffect && noticeSummary) {
            new Notice(`${itemName}: ${noticeSummary}`);
        }

        const logLine = advancedResult.summaries.length > 0
            ? `Used *${itemName}*${plotItem.campaignEffect ? `: ${plotItem.campaignEffect}` : ''}; ${advancedResult.summaries.join('; ')}`
            : `Used *${itemName}*${plotItem.campaignEffect ? `: ${plotItem.campaignEffect}` : ''}`;
        await this.autosave(logLine);

        if (navigateTarget) {
            await this.doNavigate(navigateTarget, true);
            return;
        }

        await this.render();
    }

    private async applyCampaignItemEffects(
        effects: CampaignItemEffect[],
        plotItem: PlotItem,
        session: CampaignSession,
        allItems: PlotItem[],
    ): Promise<{ summaries: string[]; navigateToScene?: string; inventoryChanged: boolean }> {
        const summaries: string[] = [];
        let navigateToScene: string | undefined;
        let inventoryChanged = false;
        let compendiumEntries: CompendiumEntry[] | null = null;
        const groups = this.plugin.getGroups();

        for (const effect of effects) {
            switch (effect.type) {
                case 'setFlag': {
                    const flag = effect.flag?.trim();
                    if (!flag) break;
                    const flags = session.flags ?? [];
                    if (!flags.includes(flag)) {
                        session.flags = [...flags, flag];
                        summaries.push(`set flag ${flag}`);
                    }
                    break;
                }
                case 'clearFlag': {
                    const flag = effect.flag?.trim();
                    if (!flag) break;
                    const nextFlags = (session.flags ?? []).filter(candidate => candidate !== flag);
                    if (nextFlags.length !== (session.flags ?? []).length) {
                        session.flags = nextFlags;
                        summaries.push(`cleared flag ${flag}`);
                    }
                    break;
                }
                case 'addItem': {
                    const effectItemName = this.resolveEffectItemName(effect, allItems);
                    if (!effectItemName) break;
                    const alreadyHas = (session.partyItems ?? []).some(candidate => this.normalizeName(candidate) === this.normalizeName(effectItemName));
                    if (!alreadyHas) {
                        session.partyItems = [...(session.partyItems ?? []), effectItemName];
                        inventoryChanged = true;
                        summaries.push(`added ${effectItemName} to the inventory`);
                    }
                    break;
                }
                case 'removeItem': {
                    const effectItemName = this.resolveEffectItemName(effect, allItems);
                    if (!effectItemName) break;
                    const nextItems = (session.partyItems ?? []).filter(candidate => this.normalizeName(candidate) !== this.normalizeName(effectItemName));
                    if (nextItems.length !== (session.partyItems ?? []).length) {
                        session.partyItems = nextItems;
                        inventoryChanged = true;
                        summaries.push(`removed ${effectItemName} from the inventory`);
                    }
                    break;
                }
                case 'navigateScene': {
                    const sceneName = this.resolveSceneName(effect.sceneId, effect.sceneName);
                    if (sceneName) {
                        navigateToScene = sceneName;
                        summaries.push(`opened ${sceneName}`);
                    }
                    break;
                }
                case 'changeHp': {
                    const targetNames = this.resolveCampaignEffectTargets(effect, session, plotItem);
                    const amount = Number(effect.amount ?? 0);
                    if (!targetNames.length || !Number.isFinite(amount) || amount === 0) break;
                    const verb = effect.hpMode === 'damage'
                        ? 'damaged'
                        : effect.hpMode === 'set'
                            ? 'set HP for'
                            : 'healed';
                    const affected: string[] = [];
                    for (const targetName of targetNames) {
                        const state = this.ensureSessionPartyState(session, targetName);
                        if (!state) continue;
                        if (effect.hpMode === 'damage') {
                            state.currentHp = Math.max(0, state.currentHp - Math.abs(amount));
                        } else if (effect.hpMode === 'set') {
                            state.currentHp = Math.max(0, Math.min(state.maxHp, Math.round(amount)));
                        } else {
                            state.currentHp = Math.max(0, Math.min(state.maxHp, state.currentHp + Math.abs(amount)));
                        }
                        affected.push(state.characterName);
                    }
                    if (affected.length) {
                        if (affected.length === 1) {
                            const suffix = effect.hpMode === 'set' ? `${Math.round(amount)}` : `${Math.abs(Math.round(amount))}`;
                            summaries.push(`${verb} ${affected[0]} (${suffix} HP)`);
                        } else {
                            summaries.push(`${verb} ${affected.length} party members`);
                        }
                    }
                    break;
                }
                case 'applyCondition': {
                    const condition = effect.condition?.trim();
                    const targetNames = this.resolveCampaignEffectTargets(effect, session, plotItem);
                    if (!condition || !targetNames.length) break;
                    const affected: string[] = [];
                    for (const targetName of targetNames) {
                        const state = this.ensureSessionPartyState(session, targetName);
                        if (!state) continue;
                        const conditions = Array.isArray(state.conditions) ? [...state.conditions] : [];
                        const normalizedCondition = this.normalizeName(condition);
                        if (effect.conditionMode === 'remove') {
                            const nextConditions = conditions.filter(entry => this.normalizeName(entry) !== normalizedCondition);
                            if (nextConditions.length !== conditions.length) {
                                state.conditions = nextConditions;
                                affected.push(state.characterName);
                            }
                        } else if (!conditions.some(entry => this.normalizeName(entry) === normalizedCondition)) {
                            conditions.push(condition);
                            state.conditions = conditions;
                            affected.push(state.characterName);
                        }
                    }
                    if (affected.length) {
                        summaries.push(
                            `${effect.conditionMode === 'remove' ? 'removed' : 'applied'} ${condition} ${affected.length === 1 ? `to ${affected[0]}` : `to ${affected.length} party members`}`
                        );
                    }
                    break;
                }
                case 'revealCompendium': {
                    if (!compendiumEntries) {
                        try {
                            compendiumEntries = await this.plugin.listCompendiumEntries();
                        } catch {
                            compendiumEntries = [];
                        }
                    }
                    const entry = this.resolveCompendiumEntryFromEffect(effect, compendiumEntries);
                    if (!entry?.name) break;
                    const nextRevealed = [...(session.revealedCompendiumEntryIds ?? [])];
                    const refKey = entry.id ?? entry.name;
                    const alreadyRevealed = nextRevealed.some(candidate => this.normalizeName(candidate) === this.normalizeName(refKey));
                    if (!alreadyRevealed) {
                        nextRevealed.push(refKey);
                        session.revealedCompendiumEntryIds = nextRevealed;
                        summaries.push(`revealed ${entry.name}`);
                    }
                    break;
                }
                case 'changeGroupStanding': {
                    const group = this.resolveGroupFromEffect(effect, groups);
                    const groupName = group?.name ?? effect.groupName?.trim();
                    if (!groupName) break;
                    const standing = this.upsertGroupStanding(session, group?.id ?? effect.groupId, groupName);
                    const nextValue = Number(effect.standingAmount ?? 0);
                    if (!Number.isFinite(nextValue)) break;
                    if (effect.standingMode === 'set') {
                        standing.value = Math.round(nextValue);
                        summaries.push(`set ${groupName} standing to ${standing.value > 0 ? '+' : ''}${standing.value}`);
                    } else {
                        standing.value += Math.round(nextValue);
                        summaries.push(`changed ${groupName} standing by ${Math.round(nextValue) > 0 ? '+' : ''}${Math.round(nextValue)}`);
                    }
                    break;
                }
            }
        }

        return { summaries, navigateToScene, inventoryChanged };
    }

    private resolveEffectItemName(effect: CampaignItemEffect, allItems: PlotItem[]): string | undefined {
        if (effect.itemId) {
            const byId = allItems.find(item => item.id === effect.itemId);
            if (byId?.name) return byId.name;
        }
        if (effect.itemName) {
            const byName = allItems.find(item => this.normalizeName(item.name) === this.normalizeName(effect.itemName!));
            return byName?.name ?? effect.itemName;
        }
        return undefined;
    }

    private resolveCompendiumEntryFromEffect(effect: CampaignItemEffect, entries: CompendiumEntry[]): CompendiumEntry | undefined {
        if (effect.compendiumEntryId) {
            const byId = entries.find(entry => (entry.id ?? entry.name) === effect.compendiumEntryId);
            if (byId) return byId;
        }
        if (effect.compendiumEntryName) {
            return entries.find(entry => this.normalizeName(entry.name) === this.normalizeName(effect.compendiumEntryName!));
        }
        return undefined;
    }

    private resolveGroupFromEffect(effect: CampaignItemEffect, groups: Group[]): Group | undefined {
        if (effect.groupId) {
            const byId = groups.find(group => group.id === effect.groupId);
            if (byId) return byId;
        }
        if (effect.groupName) {
            return groups.find(group => this.normalizeName(group.name) === this.normalizeName(effect.groupName!));
        }
        return undefined;
    }

    private resolveCampaignEffectTargets(effect: CampaignItemEffect, session: CampaignSession, plotItem: PlotItem): string[] {
        const partyNames = session.partyCharacterNames ?? [];
        const inParty = (name?: string | null): string | undefined => {
            if (!name) return undefined;
            const normalized = this.normalizeName(name);
            return partyNames.find(candidate => this.normalizeName(candidate) === normalized);
        };

        switch (effect.target ?? 'activeActor') {
            case 'allParty':
                return partyNames;
            case 'specificCharacter': {
                const resolved = inParty(this.resolveCharacterName(effect.characterId, effect.characterName));
                return resolved ? [resolved] : [];
            }
            case 'itemOwner': {
                const owner = inParty(plotItem.currentOwner) ?? inParty(this.activeActorName) ?? partyNames[0];
                return owner ? [owner] : [];
            }
            case 'activeActor':
            default: {
                const active = inParty(this.activeActorName) ?? partyNames[0];
                return active ? [active] : [];
            }
        }
    }

    private ensureSessionPartyState(session: CampaignSession, name: string): PartyMemberState | null {
        const normalized = this.normalizeName(name);
        session.partyState ??= [];
        const existing = session.partyState.find(state => this.normalizeName(state.characterName) === normalized);
        if (existing) return existing;

        const character = this.partyCharacterStats.get(normalized);
        if (!character) return null;

        const maxHp = Math.max(1, Number(character.dndMaxHp ?? character.dndCurrentHp ?? 1));
        const currentHp = Math.max(0, Math.min(maxHp, Number(character.dndCurrentHp ?? character.dndMaxHp ?? maxHp)));
        const state: PartyMemberState = {
            characterId: character.id ?? '',
            characterName: character.name,
            currentHp,
            maxHp,
            tempHp: Number(character.dndTempHp ?? 0) || undefined,
            conditions: Array.isArray(character.dndConditions) ? [...character.dndConditions] : [],
        };
        session.partyState.push(state);
        return state;
    }

    private upsertGroupStanding(session: CampaignSession, groupId: string | undefined, groupName: string): CampaignGroupStanding {
        session.groupStandings ??= [];
        const normalized = this.normalizeName(groupName);
        const existing = session.groupStandings.find(entry =>
            (groupId && entry.groupId && entry.groupId === groupId) ||
            (entry.groupName && this.normalizeName(entry.groupName) === normalized)
        );
        if (existing) {
            if (groupId && !existing.groupId) existing.groupId = groupId;
            if (!existing.groupName) existing.groupName = groupName;
            return existing;
        }

        const created: CampaignGroupStanding = { groupId, groupName, value: 0 };
        session.groupStandings.push(created);
        return created;
    }

    private resolveGroupRefs(groupRefs: string[]): Group[] {
        if (!groupRefs.length) return [];
        const groups = this.plugin.getGroups();
        return groupRefs
            .map(ref => groups.find(group => group.id === ref || this.normalizeName(group.name) === this.normalizeName(ref)))
            .filter((group): group is Group => Boolean(group));
    }

    private resolveGroupName(groupId?: string, fallbackName?: string): string | undefined {
        if (groupId) {
            const group = this.plugin.getGroups().find(candidate => candidate.id === groupId);
            if (group?.name) return group.name;
        }
        return fallbackName;
    }

    private getSessionGroupStandingValue(session: CampaignSession | null, groupId?: string, groupName?: string): number {
        if (!session) return 0;
        const standing = (session.groupStandings ?? []).find(entry =>
            (groupId && entry.groupId === groupId) ||
            (groupName && entry.groupName && this.normalizeName(entry.groupName) === this.normalizeName(groupName))
        );
        return standing?.value ?? 0;
    }

    private isCompendiumEntryRevealed(session: CampaignSession | null, entryId?: string, entryName?: string): boolean {
        if (!session) return false;
        const revealed = new Set((session.revealedCompendiumEntryIds ?? []).map(entry => this.normalizeName(entry)));
        return Boolean(
            (entryId && revealed.has(this.normalizeName(entryId))) ||
            (entryName && revealed.has(this.normalizeName(entryName)))
        );
    }

    private renderCampaignGroupChips(container: HTMLElement, groups: Group[]): void {
        const row = container.createDiv('storyteller-campaign-context-chips');
        for (const group of groups) {
            const standing = this.getSessionGroupStandingValue(this.session, group.id, group.name);
            const chip = row.createSpan({ cls: 'storyteller-campaign-context-chip is-group' });
            if (group.color) {
                chip.style.setProperty('--storyteller-group-color', group.color);
            }
            chip.createSpan({ text: group.name });
            chip.createSpan({
                cls: `storyteller-campaign-context-chip-meta is-${standing > 0 ? 'positive' : standing < 0 ? 'negative' : 'neutral'}`,
                text: `${standing > 0 ? '+' : ''}${standing}`,
            });
        }
    }

    private async renderLoreSidebar(sidebar: HTMLElement, session: CampaignSession): Promise<void> {
        const locName = this.currentScene?.linkedLocations?.[0];
        const activeFlags = session.flags ?? [];
        const activeItems = (session.partyItems ?? []).map(i => this.normalizeName(i));
        const revealed = new Set((session.revealedCompendiumEntryIds ?? []).map(entry => this.normalizeName(entry)));

        let entries: CompendiumEntry[] = [];
        try {
            const all = await this.plugin.listCompendiumEntries();
            entries = all.filter(entry => {
                const triggeredByLocation = Boolean(
                    locName && entry.triggeredAtLocations?.some(location => this.normalizeName(location) === this.normalizeName(locName))
                );
                const triggeredByFlag = Boolean(entry.triggeredByFlag && activeFlags.includes(entry.triggeredByFlag));
                const triggeredByItem = Boolean(entry.triggeredByItem && activeItems.includes(this.normalizeName(entry.triggeredByItem)));
                const explicitlyRevealed = revealed.has(this.normalizeName(entry.id ?? entry.name));
                return triggeredByLocation || triggeredByFlag || triggeredByItem || explicitlyRevealed;
            });
        } catch {
            return;
        }

        if (!entries.length) return;

        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section');
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'book-open');
        hdr.createSpan({ text: ' Lore' });
        const body = sec.createDiv('storyteller-campaign-sidebar-body');

        for (const entry of entries) {
            const entryDiv = body.createDiv('storyteller-campaign-lore-entry');
            const nameRow = entryDiv.createDiv('storyteller-campaign-lore-name-row');
            nameRow.createSpan({ cls: 'storyteller-campaign-lore-name', text: entry.name });
            if (revealed.has(this.normalizeName(entry.id ?? entry.name))) {
                nameRow.createSpan({ cls: 'storyteller-campaign-lore-state', text: 'Revealed' });
            }
            if (entry.entryType) {
                nameRow.createSpan({ cls: 'storyteller-campaign-lore-type', text: entry.entryType });
            }
            if (entry.rarity) {
                nameRow.createSpan({ cls: `storyteller-campaign-lore-rarity is-${entry.rarity.replace(' ', '-')}`, text: entry.rarity });
            }
            if (entry.description) {
                const preview = entry.description.length > 120
                    ? entry.description.slice(0, 120) + '...'
                    : entry.description;
                entryDiv.createDiv({ cls: 'storyteller-campaign-lore-desc', text: preview });
            }
            if (entry.dangerRating && entry.dangerRating !== 'none') {
                entryDiv.createDiv({ cls: `storyteller-campaign-lore-danger is-${entry.dangerRating}`, text: `Danger: ${entry.dangerRating}` });
            }
        }
    }

    private renderGroupStandingsSidebar(sidebar: HTMLElement, session: CampaignSession): void {
        const standings = (session.groupStandings ?? []).slice();
        if (!standings.length) return;

        const groupIndex = new Map(this.plugin.getGroups().map(group => [group.id, group] as const));
        standings.sort((left, right) => {
            const leftName = groupIndex.get(left.groupId ?? '')?.name ?? left.groupName ?? '';
            const rightName = groupIndex.get(right.groupId ?? '')?.name ?? right.groupName ?? '';
            return leftName.localeCompare(rightName);
        });

        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section');
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'shield');
        hdr.createSpan({ text: ' Factions' });
        const body = sec.createDiv('storyteller-campaign-sidebar-body');

        for (const standing of standings) {
            const group = standing.groupId ? groupIndex.get(standing.groupId) : undefined;
            const name = group?.name ?? standing.groupName;
            if (!name) continue;

            const row = body.createDiv('storyteller-campaign-standing-row');
            if (group?.color) {
                row.style.setProperty('--storyteller-group-color', group.color);
            }
            row.createSpan({ cls: 'storyteller-campaign-standing-name', text: name });
            row.createSpan({
                cls: `storyteller-campaign-standing-value is-${standing.value > 0 ? 'positive' : standing.value < 0 ? 'negative' : 'neutral'}`,
                text: `${standing.value > 0 ? '+' : ''}${standing.value}`,
            });
            row.createSpan({
                cls: 'storyteller-campaign-standing-label',
                text: this.describeGroupStanding(standing.value),
            });
        }
    }

    private describeGroupStanding(value: number): string {
        if (value >= 4) return 'Allied';
        if (value >= 2) return 'Friendly';
        if (value <= -4) return 'Hostile';
        if (value <= -2) return 'Wary';
        return 'Neutral';
    }
    private renderActorSelector(toolbar: HTMLElement, session: CampaignSession): void {
        const names = session.partyCharacterNames ?? [];
        if (!names.length) return;
        this.ensureActiveActor(session);

        const wrap = toolbar.createDiv('storyteller-campaign-actor-control');
        wrap.createSpan({ cls: 'storyteller-campaign-actor-label', text: 'Actor' });
        const select = wrap.createEl('select', {
            cls: 'storyteller-campaign-actor-select',
            attr: { 'aria-label': 'Active actor for checks' },
        });

        for (const name of names) {
            select.createEl('option', { value: name, text: name });
        }
        select.value = this.activeActorName ?? names[0];
        select.addEventListener('change', () => {
            this.activeActorName = select.value || null;
            void this.render();
        });
    }

    private ensureActiveActor(session: CampaignSession): void {
        const names = session.partyCharacterNames ?? [];
        if (!names.length) {
            this.activeActorName = null;
            return;
        }
        if (!this.activeActorName || !names.some(name => this.normalizeName(name) === this.normalizeName(this.activeActorName!))) {
            this.activeActorName = names[0];
        }
    }

    private async ensurePartyCharacterStats(session: CampaignSession): Promise<void> {
        const names = (session.partyCharacterNames ?? [])
            .map(name => name.trim())
            .filter(Boolean);
        const cacheKey = names.map(name => this.normalizeName(name)).sort().join('|');
        if (cacheKey === this.partyStatsCacheKey && this.partyCharacterStats.size > 0) return;

        this.partyStatsCacheKey = cacheKey;
        this.partyCharacterStats.clear();
        this.allCharactersById.clear();

        let allCharacters: Character[] = [];
        try {
            allCharacters = await this.plugin.listCharacters();
        } catch {
            return;
        }

        const wanted = new Set(names.map(name => this.normalizeName(name)));
        for (const character of allCharacters) {
            if (character.id) this.allCharactersById.set(character.id, character);
            if (!wanted.has(this.normalizeName(character.name))) continue;
            this.partyCharacterStats.set(this.normalizeName(character.name), character);
        }
    }

    private getStatKey(stat: SceneBranch['stat']): string {
        return `dnd${stat!.charAt(0).toUpperCase()}${stat!.slice(1)}`;
    }

    private resolveSceneName(sceneId?: string, sceneName?: string): string | undefined {
        if (sceneId) {
            const byId = this.allScenes.find(scene => scene.id === sceneId);
            if (byId?.name) return byId.name;
        }
        return sceneName;
    }

    private resolveCharacterName(characterId?: string, characterName?: string): string | undefined {
        if (characterId) {
            const byId = this.allCharactersById.get(characterId);
            if (byId?.name) return byId.name;
        }
        return characterName;
    }

    private resolveBranchReferences(branch: SceneBranch): SceneBranch {
        const resolved = { ...branch };
        resolved.target = this.resolveSceneName(branch.targetSceneId, branch.target);
        resolved.fail = this.resolveSceneName(branch.failSceneId, branch.fail);
        resolved.requiresCharacter = this.resolveCharacterName(branch.requiresCharacterId, branch.requiresCharacter);
        return resolved;
    }

    private getCharacterStateByName(name?: string | null): ({ characterName?: string } & Record<string, unknown>) | undefined {
        if (!name || !this.session) return undefined;
        const normalized = this.normalizeName(name);
        const character = this.partyCharacterStats.get(normalized);
        if (!character) return undefined;
        const hp = (this.session.partyState ?? []).find(
            state => this.normalizeName(state.characterName) === normalized
        );
        return {
            characterId: character.id ?? hp?.characterId ?? '',
            characterName: character.name,
            currentHp: hp?.currentHp ?? 0,
            maxHp: hp?.maxHp ?? 1,
            tempHp: hp?.tempHp,
            conditions: hp?.conditions,
            dndStr: Number(character.dndStr ?? 10),
            dndDex: Number(character.dndDex ?? 10),
            dndCon: Number(character.dndCon ?? 10),
            dndInt: Number(character.dndInt ?? 10),
            dndWis: Number(character.dndWis ?? 10),
            dndCha: Number(character.dndCha ?? 10),
        };
    }

    private getBestPartyStatState(stat?: SceneBranch['stat']): ({ characterName?: string } & Record<string, unknown>) | undefined {
        if (!stat) return undefined;
        const statKey = this.getStatKey(stat);
        let pickedName: string | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const [name, character] of this.partyCharacterStats.entries()) {
            const score = Number((character as any)[statKey] ?? 10);
            if (score > bestScore) {
                bestScore = score;
                pickedName = name;
            }
        }
        return pickedName ? this.getCharacterStateByName(pickedName) : undefined;
    }

    private getBranchActorState(branch: SceneBranch): ({ characterName?: string } & Record<string, unknown>) | undefined {
        if (!branch.stat) return undefined;

        if (branch.requiresCharacter) {
            const required = this.getCharacterStateByName(branch.requiresCharacter);
            if (required) return required;
        }

        const active = this.getCharacterStateByName(this.activeActorName);
        if (active) return active;

        return this.getBestPartyStatState(branch.stat);
    }

    private async applyTriggeredEvent(trigger?: string, triggerEventId?: string): Promise<string | null> {
        const eventName = trigger?.trim() ?? '';
        const eventId = triggerEventId?.trim() ?? '';
        if (!eventName && !eventId) return null;

        try {
            const events = await this.plugin.listEvents();
            const event = events.find(candidate => {
                if (eventId && candidate.id === eventId) return true;
                if (eventName && this.normalizeName(candidate.name) === this.normalizeName(eventName)) return true;
                return false;
            });
            if (!event) {
                const fallback = eventName || eventId;
                return `Triggered event: *${fallback}* (missing Event entity)`;
            }

            let changed = false;
            const currentSceneName = this.currentScene?.name;
            if (currentSceneName) {
                const linkedScenes = event.linkedScenes ?? [];
                if (!linkedScenes.some(scene => this.normalizeName(scene) === this.normalizeName(currentSceneName))) {
                    event.linkedScenes = [...linkedScenes, currentSceneName];
                    changed = true;
                }
            }

            const currentLocation = this.currentScene?.linkedLocations?.[0];
            if (currentLocation && !event.location) {
                event.location = currentLocation;
                changed = true;
            }

            if (!event.status) {
                event.status = 'Triggered';
                changed = true;
            }

            if (changed) {
                await this.plugin.saveEvent(event as Event);
            }

            return `Triggered event: *${event.name}*`;
        } catch (error) {
            console.error('[CampaignView] Failed to apply branch triggered event', error);
            const fallback = eventName || eventId;
            return `Triggered event: *${fallback}* (sync failed)`;
        }
    }

    private async syncPartyInventoryOwnership(session: CampaignSession, previousItems: string[] = []): Promise<void> {
        const currentItems = session.partyItems ?? [];
        if (!currentItems.length && !previousItems.length) return;

        const partyNames = (session.partyCharacterNames ?? []).filter(Boolean);
        const defaultOwner = partyNames.length === 1 ? partyNames[0] : undefined;
        const partyNameSet = new Set(partyNames.map(name => this.normalizeName(name)));

        let plotItems: PlotItem[] = [];
        try {
            plotItems = await this.plugin.listPlotItems();
        } catch {
            return;
        }

        const findItem = (name: string): PlotItem | undefined => {
            const normalized = this.normalizeName(name);
            return plotItems.find(item => this.normalizeName(item.name) === normalized);
        };

        const uniqueCurrentItems = Array.from(
            new Map(currentItems.map(itemName => [this.normalizeName(itemName), itemName])).values()
        );

        for (const itemName of uniqueCurrentItems) {
            const plotItem = findItem(itemName);
            if (!plotItem) continue;

            const currentOwner = plotItem.currentOwner ? this.normalizeName(plotItem.currentOwner) : '';
            if (currentOwner && partyNameSet.has(currentOwner)) continue;

            const nextOwner = defaultOwner;
            if ((plotItem.currentOwner ?? '') === (nextOwner ?? '')) continue;

            plotItem.currentOwner = nextOwner;
            await this.plugin.savePlotItem(plotItem);
        }

        const currentNameSet = new Set(uniqueCurrentItems.map(itemName => this.normalizeName(itemName)));
        const uniquePreviousItems = Array.from(
            new Map(previousItems.map(itemName => [this.normalizeName(itemName), itemName])).values()
        );

        for (const itemName of uniquePreviousItems) {
            if (currentNameSet.has(this.normalizeName(itemName))) continue;
            const plotItem = findItem(itemName);
            if (!plotItem || !plotItem.currentOwner) continue;
            if (!partyNameSet.has(this.normalizeName(plotItem.currentOwner))) continue;

            plotItem.currentOwner = undefined;
            await this.plugin.savePlotItem(plotItem);
        }
    }

    private collectPendingLogEntries(logEntry?: string | string[]): void {
        if (!logEntry) return;
        const entries = Array.isArray(logEntry) ? logEntry : [logEntry];
        for (const entry of entries) {
            const trimmed = String(entry ?? '').trim();
            if (trimmed) this.pendingLogEntries.push(trimmed);
        }
    }

    private ensurePendingFlushPromise(): Promise<void> {
        if (this.pendingFlushPromise) return this.pendingFlushPromise;
        this.pendingFlushPromise = new Promise<void>((resolve, reject) => {
            this.resolvePendingFlush = resolve;
            this.rejectPendingFlush = reject;
        });
        return this.pendingFlushPromise;
    }

    private queueAutosaveFlush(): void {
        if (this.autosaveTimer !== null) {
            window.clearTimeout(this.autosaveTimer);
        }
        this.autosaveTimer = window.setTimeout(() => {
            this.autosaveTimer = null;
            void this.flushAutosaveQueue();
        }, this.autosaveDebounceMs);
    }

    private async flushAutosaveQueue(): Promise<void> {
        if (!this.pendingFlushPromise) return;

        const resolve = this.resolvePendingFlush;
        const reject = this.rejectPendingFlush;
        this.pendingFlushPromise = null;
        this.resolvePendingFlush = null;
        this.rejectPendingFlush = null;

        const shouldSaveSession = this.pendingSessionSave;
        const entries = [...this.pendingLogEntries];
        this.pendingSessionSave = false;
        this.pendingLogEntries = [];

        if (!shouldSaveSession && entries.length === 0) {
            resolve?.();
            return;
        }

        this.flushChain = this.flushChain.then(async () => {
            if (!this.session) return;
            await this.plugin.saveSession(this.session);
            if (entries.length && this.session.filePath) {
                await this.plugin.appendToSessionLogEntries(this.session.filePath, entries);
            }
        });

        try {
            await this.flushChain;
            resolve?.();
        } catch (error) {
            console.error('[CampaignView] autosave error', error);
            reject?.(error);
        }
    }

    private async flushAutosaveNow(): Promise<void> {
        if (this.autosaveTimer !== null) {
            window.clearTimeout(this.autosaveTimer);
            this.autosaveTimer = null;
        }
        await this.flushAutosaveQueue();
        await this.flushChain;
    }

    private async autosave(logEntry?: string | string[]): Promise<void> {
        if (!this.session) return;
        this.pendingSessionSave = true;
        this.collectPendingLogEntries(logEntry);
        const pending = this.ensurePendingFlushPromise();
        this.queueAutosaveFlush();
        await pending;
    }
}

