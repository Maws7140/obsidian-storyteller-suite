/**
 * CampaignView — DM-facing play mode for running scenes interactively.
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
    MarkdownPostProcessorContext,
    Menu,
    normalizePath,
} from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { stripWikiLinkToString } from '../utils/WikiLinks';
import {
    CampaignClock,
    CampaignSession,
    CampaignGroupStanding,
    CampaignThread,
    CampaignThreadKind,
    CampaignTrackerKind,
    CampaignItemEffect,
    Scene,
    SceneBranch,
    EncounterTable,
    PartyMemberState,
    Character,
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
import { getOwners, getPartyOwner, setPartyOwner } from '../utils/ItemOwnership';
import {
    addCampaignAdvancement,
    addCampaignClock,
    addCampaignInterlude,
    addCampaignLoot,
    addCampaignThread,
    applyCampaignPartyResources,
    assignCampaignLoot,
    buildSessionTimelineEvent,
    cycleCampaignThread,
    removeCampaignLoot,
    setCampaignThreadState,
} from '../utils/CampaignProgress';
import {
    CAMPAIGN_THREAD_STATES,
    removePartyResource,
    setTrackerValue,
    threadKindOf,
    threadLegacyStatus,
    threadStateOf,
    trackerKindOf,
} from '../utils/CampaignModel';
import { PromptModal } from '../modals/ui/PromptModal';
import { EventModal } from '../modals/EventModal';
import { LeafletRenderer } from '../leaflet/renderer';
import type { LeafletRendererOptions, LocationPinHighlight } from '../leaflet/types';
import { mapToBlockParams } from '../leaflet/utils/MapBlockParams';
import { locationPinKey, resolveBoardSelection } from '../utils/CampaignBoardSelection';
import {
    advancementLinesForSession,
    previousSessionEndChangeLines,
    appendBlock,
    appendInterludeBlock,
    applyPartylogTagsToSession,
    appendLogLines,
    lastSceneContext,
    nextSceneHeaderLine,
    parseLogLines,
    sessionEndFromLines,
    upsertSessionEndBlock,
    upsertSessionHeaderBlock,
    type PartylogBridgeContext,
    type SceneKindChoice,
} from '../campaign/PartylogSessionBridge';
import { AddProgressModal, InterludeModal, SessionEndModal, SessionHeaderModal } from '../modals/PartylogSessionModals';
import type { InterludeValues, ProgressAddKind, ProgressAddValues, SessionEndValues, SessionHeaderValues } from '../modals/PartylogSessionModals';
import {
    entryTags,
    extractTags,
    formatAction,
    formatConsequence,
    formatEntry,
    formatEvent,
    formatMeta,
    formatRoll,
    parsePartylogLine,
    type Interlude,
    type SessionHeader,
} from '../campaign/partylog';

export const VIEW_TYPE_CAMPAIGN = 'storyteller-campaign-view';

/** Sidebar sections that can be re-rendered on their own after a Partylog entry. */
type SidebarPart = 'party' | 'progress' | 'standings' | 'log';
type QuickMode = 'action' | 'assist' | 'group' | 'world' | 'roll' | 'consequence' | 'note';
type QuickNoteKind = 'note' | 'rule' | 'ooc' | 'safety';

/** Quick entry bar state. Kept on the view so re-renders keep what was typed. */
interface QuickEntryState {
    mode: QuickMode;
    /** Selected actors in the order they were picked. The first is the leader for assists. */
    actors: string[];
    noteKind: QuickNoteKind;
    draft: string;
    tagKind: string;
    tagName: string;
    rollExpression: string;
    rollVs: string;
    rollOutcome: string;
}

interface TagNameCache {
    characters: string[];
    locations: string[];
    items: string[];
}

const TAG_DATALIST_ID = 'storyteller-campaign-tag-names';

const QUICK_MODES: ReadonlyArray<{ mode: QuickMode; label: string; hint: string }> = [
    { mode: 'action', label: '@ Action', hint: 'Action by the selected actor. Leave none selected for an unattributed action.' },
    { mode: 'assist', label: '@ Assist', hint: 'Assist: select two actors, the leader first.' },
    { mode: 'group', label: '@ Group', hint: 'Group action: select two or more actors.' },
    { mode: 'world', label: '! World', hint: 'World event: the game world acts.' },
    { mode: 'roll', label: 'd: Roll', hint: 'Roll and outcome, attributed to the selected actors.' },
    { mode: 'consequence', label: '=> Result', hint: 'Consequence of the last action or roll.' },
    { mode: 'note', label: '( ) Note', hint: 'Note, rule, out-of-character or safety entry.' },
];

const NOTE_KINDS: ReadonlyArray<{ value: QuickNoteKind; label: string }> = [
    { value: 'note', label: 'Note' },
    { value: 'rule', label: 'Rule' },
    { value: 'ooc', label: 'OOC' },
    { value: 'safety', label: 'Safety' },
];

const TAG_KINDS: ReadonlyArray<{ kind: string; label: string }> = [
    { kind: 'N', label: 'N (NPC)' },
    { kind: 'PC', label: 'PC' },
    { kind: 'F', label: 'F (foe)' },
    { kind: 'L', label: 'L (location)' },
    { kind: 'Faction', label: 'Faction' },
    { kind: 'Loot', label: 'Loot' },
    { kind: 'Party', label: 'Party' },
    { kind: 'Clock', label: 'Clock' },
    { kind: 'Track', label: 'Track' },
    { kind: 'Timer', label: 'Timer' },
    { kind: 'Thread', label: 'Thread' },
    { kind: 'Goal', label: 'Goal' },
    { kind: 'Quest', label: 'Quest' },
];

function createQuickEntryState(): QuickEntryState {
    return {
        mode: 'action',
        actors: [],
        noteKind: 'note',
        draft: '',
        tagKind: 'N',
        tagName: '',
        rollExpression: '',
        rollVs: '',
        rollOutcome: '',
    };
}

function quickPlaceholder(mode: QuickMode): string {
    switch (mode) {
        case 'action': return 'What does the character do?';
        case 'assist': return 'What does the helper do?';
        case 'group': return 'What do they do together?';
        case 'world': return 'What does the world do?';
        case 'roll': return 'Optional tags, for example [Clock:Alarm +1]';
        case 'consequence': return 'What follows?';
        case 'note': return 'Note text';
    }
}

const TRACKER_GROUPS: ReadonlyArray<{ kind: CampaignTrackerKind; label: string }> = [
    { kind: 'clock', label: 'Clocks' },
    { kind: 'track', label: 'Tracks' },
    { kind: 'timer', label: 'Timers' },
];

const THREAD_GROUPS: ReadonlyArray<{ kind: CampaignThreadKind; label: string }> = [
    { kind: 'thread', label: 'Threads' },
    { kind: 'goal', label: 'Goals' },
    { kind: 'quest', label: 'Quests' },
];

/** Which sidebar sections a set of bridge summary lines touches. */
function partsAffectedBy(summary: readonly string[]): SidebarPart[] {
    const parts: SidebarPart[] = ['log'];
    for (const line of summary) {
        if (/^Faction /.test(line)) parts.push('standings');
        else if (/^(clock|track|timer|thread|goal|quest) /.test(line)) parts.push('progress');
        else parts.push('party');
    }
    return parts;
}

type CampaignBoardLocation = {
    location: Location;
    binding: MapBinding;
    scenes: Scene[];
};

type CharacterStatKey = 'dndStr' | 'dndDex' | 'dndCon' | 'dndInt' | 'dndWis' | 'dndCha';

type BranchActorState = {
    characterId: string;
    characterName: string;
    currentHp: number;
    maxHp: number;
    tempHp?: number;
    conditions?: string[];
} & Record<CharacterStatKey, number>;

export class CampaignView extends ItemView {
    private plugin: StorytellerSuitePlugin;

    // â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private session: CampaignSession | null = null;
    /** Read-only access to the currently loaded session (used by plugin to snapshot state). */
    getLoadedSession(): CampaignSession | null { return this.session; }
    private currentScene: Scene | null = null;
    private branches: SceneBranch[] = [];
    private encounterTable: EncounterTable | null = null;
    private sceneHistory: string[] = []; // scene names, for back-navigation
    private allScenes: Scene[] = [];
    private sceneBody = '';
    private locationData: Location | null = null;
    private selectedBoardLocationId: string | null = null;
    private pendingBoardFocusLocationId: string | null = null;
    /** Live Leaflet board map; destroyed before every re-render and on close. */
    private boardRenderer: LeafletRenderer | null = null;
    /** Bumped whenever the board is torn down, so a stale async mount can detect it. */
    private boardRenderToken = 0;
    private boardLocations: CampaignBoardLocation[] = [];
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
    /** Live section elements, so one part can be re-rendered in place. */
    private sidebarPartEls = new Map<SidebarPart, HTMLElement>();
    private quick: QuickEntryState = createQuickEntryState();
    /** True from the first submit until its line is written, so repeat submits are ignored. */
    private quickSubmitInFlight = false;
    /** True while a branch choice is being applied. */
    private choiceInFlight = false;
    /** True while a scene change or Back is running. */
    private navigationInFlight = false;
    /** NPC names typed into the quick entry bar for this view. */
    private quickNpcs: string[] = [];
    /** Last dice result from a branch roll, used to prefill the Roll entry. */
    private lastDiceResult: { expression: string; outcome: string } | null = null;
    private tagNameCache: TagNameCache | null = null;
    /** Kind of the next scene header written to the log. Resets to 'next' after one header. */
    private sceneKindChoice: SceneKindChoice = 'next';
    private sceneKindThread: 1 | 2 = 1;
    private stripWikiLinkValue(value: string | null | undefined): string {
        return stripWikiLinkToString(value);
    }

    private readonly normalizeName = (value: string): string => this.stripWikiLinkValue(value).trim().toLowerCase();

    constructor(leaf: WorkspaceLeaf, plugin: StorytellerSuitePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType():    string { return VIEW_TYPE_CAMPAIGN; }
    getDisplayText(): string { return this.session ? `Campaign - ${this.session.name}` : 'Campaign'; }

    /** Vault path of the session note being run, or undefined. Maplog reads its log for room state. */
    getActiveSessionFilePath(): string | undefined {
        return this.session?.filePath;
    }
    getIcon():        string { return 'swords'; }

    async onOpen():  Promise<void> { await this.render(); }
    async onClose(): Promise<void> {
        this.destroyCampaignBoardRenderer();
        if (this.session) {
            await this.autosave('Session closed.');
            await this.flushAutosaveNow();
        }
    }

    // â”€â”€ External API (called by main.ts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async loadSession(session: CampaignSession, startingScene?: Scene): Promise<void> {
        // Edits still waiting on the debounce belong to the session being left: write them before it is replaced.
        await this.flushAutosaveNow();
        this.session = { ...session };
        this.sceneHistory = [];
        this.tagNameCache = null;
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
        this.destroyCampaignBoardRenderer();
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
        resumeBtn.addEventListener('click', () => { void (async () => {
            await this.loadSession(session);
            await this.render();
        })(); });

        const noteBtn = actions.createEl('button', { cls: 'storyteller-campaign-btn' });
        setIcon(noteBtn, 'file-text');
        noteBtn.addEventListener('click', () => {
            if (session.filePath) void this.plugin.app.workspace.openLinkText(session.filePath, '', 'tab');
        });

        const delBtn = actions.createEl('button', { cls: 'storyteller-campaign-btn is-danger' });
        setIcon(delBtn, 'trash');
        delBtn.addEventListener('click', () => { void (async () => {
            if (session.filePath) { await this.plugin.deleteSession(session.filePath); await this.render(); }
        })(); });
    }

    private async renderNewSessionForm(container: HTMLElement): Promise<void> {
        const form = container.createDiv('storyteller-campaign-form');

        // Session name
        const nameWrap = form.createDiv('storyteller-campaign-field');
        nameWrap.createEl('label', { text: 'Session name' });
        const nameInput = nameWrap.createEl('input', {
            cls: 'storyteller-campaign-input',
            attr: { type: 'text', placeholder: 'The silver crown - session 1' },
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

        const startBtn = form.createEl('button', { cls: 'storyteller-campaign-btn is-primary', text: 'Start session' });
        startBtn.addEventListener('click', () => { void (async () => {
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
            } catch { /* ignore — no characters loaded */ }

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
        })(); });
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
        backBtn.addEventListener('click', () => { void this.navigateBack(); });

        toolbar.createEl('span', {
            cls: 'storyteller-campaign-scene-name',
            text: this.currentScene?.name ?? 'No scene',
        });
        this.renderSceneKindControl(toolbar);
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
        graphBtn.addEventListener('click', () => { void this.plugin.activateSceneGraphView(); });

        const timelineBtn = toolbar.createEl('button', {
            cls: 'storyteller-campaign-toolbar-btn',
            attr: { 'aria-label': 'Record session event on timeline' },
        });
        setIcon(timelineBtn.createSpan(), 'calendar-plus');
        timelineBtn.createSpan({ text: ' Timeline event' });
        timelineBtn.addEventListener('click', () => this.openSessionTimelineEventModal(session));

        const endBtn = toolbar.createEl('button', { cls: 'storyteller-campaign-toolbar-btn mod-warning', text: 'End' });
        endBtn.addEventListener('click', () => { void (async () => {
            session.status = 'paused';
            await this.autosave('Session paused.');
            this.session = null;
            this.currentScene = null;
            await this.render();
        })(); });

        // â”€â”€ Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const main = root.createDiv('storyteller-campaign-main');

        const scenePanel = main.createDiv('storyteller-campaign-scene-panel');
        await this.renderScenePanel(scenePanel);

        const sidebar = main.createDiv('storyteller-campaign-sidebar');
        this.renderPartySidebar(sidebar, session);
        await this.renderInventorySidebar(sidebar, session);
        this.renderProgressSidebar(sidebar, session);
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
                void this.plugin.app.workspace.openLinkText(this.currentScene.filePath, '', 'tab');
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
                takeBtn.addEventListener('click', () => { void (async () => {
                    await this.takePartyItem(name, `Took *${name}*`);
                })(); });
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

        const token = this.boardRenderToken;
        const maps = await this.plugin.listMaps().catch(() => [] as StoryMap[]);
        const boardMap = await this.resolveCampaignBoardMap(maps);
        if (!boardMap) return;
        if (token !== this.boardRenderToken) return;

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
                    void this.plugin.app.workspace.openLinkText(boardMap.filePath, '', 'tab');
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
                button.addEventListener('click', () => { void (async () => {
                    await this.switchCampaignBoardMap(targetId);
                })(); });
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

        const locations = await this.collectBoardLocations(boardMap);
        if (token !== this.boardRenderToken) return;
        this.boardLocations = locations;

        const mountedLeaflet = await this.renderLeafletCampaignBoard(boardEl, boardMap, imageUrl, locations, token);
        if (!mountedLeaflet) {
            await this.renderStaticCampaignBoard(boardEl, boardMap, imageUrl, locations);
        }
    }

    /**
     * Mount the real map stack (LeafletRenderer, the same one MapView uses) for the board.
     * Returns false when the board should use the static image instead.
     */
    private async renderLeafletCampaignBoard(
        boardEl: HTMLElement,
        boardMap: StoryMap,
        imageUrl: string,
        locations: CampaignBoardLocation[],
        token: number,
    ): Promise<boolean> {
        if (boardMap.type === 'real' || /^https?:\/\//i.test(imageUrl)) return false;

        const selectedLocationKey = this.ensureBoardLocationSelection(locations);
        const mapId = boardMap.id || boardMap.name;
        const params = mapToBlockParams(boardMap);
        params.id = mapId;
        params.mapId = mapId;

        const mapEl = boardEl.createDiv('storyteller-campaign-board-map');
        const options: LeafletRendererOptions = {
            readOnly: true,
            persistViewState: false,
            onLocationSelect: (location) => { void this.selectBoardLocationFromPin(location); },
            pinHighlight: this.getBoardPinHighlight(selectedLocationKey),
            gridSize: boardMap.gridEnabled && (boardMap.gridSize ?? 0) > 0 ? boardMap.gridSize : undefined,
        };
        const context = {
            sourcePath: boardMap.filePath || '',
            addChild: () => undefined,
            getSectionInfo: () => null,
        } as unknown as MarkdownPostProcessorContext;

        const renderer = new LeafletRenderer(this.plugin, mapEl, params, context, options);
        try {
            await renderer.initialize();
            if (!renderer.getMap() || !renderer.getImageBounds()) {
                throw new Error('Board map has no image bounds.');
            }
        } catch {
            // Leaflet could not start (missing or unreadable image): the caller shows the static board.
            renderer.unload();
            mapEl.remove();
            return false;
        }

        if (token !== this.boardRenderToken) {
            // The view re-rendered or closed while the map was starting.
            renderer.unload();
            mapEl.remove();
            return true;
        }
        this.boardRenderer = renderer;

        const caption = boardEl.createDiv('storyteller-campaign-board-caption');
        caption.setText(
            locations.length > 0
                ? 'Click a mapped location to inspect it, jump scenes, or pull items straight into the party inventory.'
                : 'No locations are bound to this board yet.'
        );

        const selectedLocation = locations.find(entry => this.getLocationKey(entry.location) === selectedLocationKey);
        if (selectedLocation) {
            await this.renderBoardLocationInspector(boardEl, selectedLocation);
        }
        return true;
    }

    /**
     * Pin click on the Leaflet board: move the selection and swap only the inspector,
     * so the map keeps its pan and zoom.
     */
    private async selectBoardLocationFromPin(location: Location): Promise<void> {
        const key = this.getLocationKey(location);
        if (this.selectedBoardLocationId === key) {
            this.focusBoardLocationInspector(key);
            return;
        }
        this.selectedBoardLocationId = key;
        this.boardRenderer?.setPinHighlight(this.getBoardPinHighlight(key));

        const boardEl = this.containerEl.querySelector<HTMLElement>('.storyteller-campaign-board');
        const entry = this.boardLocations.find(candidate => this.getLocationKey(candidate.location) === key);
        if (!boardEl || !entry) return;

        const previous = boardEl.querySelector<HTMLElement>(':scope > .storyteller-campaign-board-inspector');
        const inspector = await this.renderBoardLocationInspector(boardEl, entry);
        if (this.selectedBoardLocationId !== key) {
            // Another pin was chosen while this inspector was loading.
            inspector.remove();
            return;
        }
        previous?.replaceWith(inspector);
        this.focusBoardLocationInspector(key, inspector);
    }

    private getBoardPinHighlight(selectedKey: string | null): LocationPinHighlight {
        return {
            currentKey: this.locationData ? this.getLocationKey(this.locationData) : null,
            selectedKey,
        };
    }

    /** Tear down the embedded board map. Called before every re-render and on close. */
    private destroyCampaignBoardRenderer(): void {
        this.boardRenderToken++;
        this.boardRenderer?.unload();
        this.boardRenderer = null;
        this.boardLocations = [];
    }

    /** Static image board, used when the map cannot run in Leaflet. */
    private async renderStaticCampaignBoard(
        boardEl: HTMLElement,
        boardMap: StoryMap,
        imageUrl: string,
        locations: CampaignBoardLocation[],
    ): Promise<void> {
        const dimensions = await this.getCampaignBoardDimensions(boardMap, imageUrl);
        if (!dimensions) {
            boardEl.createDiv({
                cls: 'storyteller-campaign-board-empty',
                text: 'The board image could not be sized, so markers cannot be rendered yet.',
            });
            return;
        }

        const selectedLocationKey = this.ensureBoardLocationSelection(locations);

        const frame = boardEl.createDiv('storyteller-campaign-board-frame');
        const stage = frame.createDiv('storyteller-campaign-board-stage');
        stage.setCssStyles({ aspectRatio: `${dimensions.width} / ${dimensions.height}` });
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
            button.setCssStyles({ top: `${topPercent}%` });
            button.setCssStyles({ left: `${leftPercent}%` });
            button.title = entry.location.name;
            button.createSpan({ cls: 'storyteller-campaign-board-pin-dot' });
            button.createSpan({ cls: 'storyteller-campaign-board-pin-label', text: entry.location.name });
            button.addEventListener('click', () => { void (async () => {
                const isSameLocation = this.selectedBoardLocationId === locationKey;
                this.selectedBoardLocationId = locationKey;
                if (isSameLocation) {
                    this.focusBoardLocationInspector(locationKey);
                    return;
                }
                this.pendingBoardFocusLocationId = locationKey;
                await this.render();
            })(); });
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
                    void this.plugin.app.workspace.openLinkText(entry.location.filePath, '', 'tab');
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
                button.addEventListener('click', () => { void (async () => {
                    await this.doNavigate(scene.name, true);
                })(); });
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
                takeBtn.addEventListener('click', () => { void (async () => {
                    await this.takePartyItem(name, `Took *${name}* from *${entry.location.name}*`, entry.location);
                })(); });
            }
        }

        return inspector;
    }

    private getLocationKey(location: Pick<Location, 'id' | 'name'>): string {
        return locationPinKey(location);
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
        this.selectedBoardLocationId = resolveBoardSelection(
            locations.map(entry => this.getLocationKey(entry.location)),
            this.selectedBoardLocationId,
            this.locationData ? this.getLocationKey(this.locationData) : null,
        );
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
            else { void this.executeChoice(resolvedBranch, 'success'); }
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
            attr: { type: 'number', placeholder: 'Enter total' },
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
            window.setTimeout(() => {
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
            const outcome = resolveBranch(branch, lastTotal);
            this.lastDiceResult = {
                expression: `${branch.dice ?? 'roll'}=${lastTotal}`,
                outcome: outcome === 'success' ? 'Success' : 'Fail',
            };
            void this.executeChoice(branch, outcome, lastTotal);
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
        // A second tap on the card while the first is running would apply the outcome again.
        if (this.choiceInFlight) return;
        this.choiceInFlight = true;
        try {
            await this.applyChoice(branch, outcome, rollTotal);
        } finally {
            this.choiceInFlight = false;
        }
    }

    private async applyChoice(branch: SceneBranch, outcome: 'success' | 'fail', rollTotal?: number): Promise<void> {
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
        // 'continue' — no navigation

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

    /**
     * Jumps to a scene. Ignored while another scene change (or Back) is still running, so a double
     * tap does not push history twice or write two scene headers.
     */
    private async doNavigate(sceneName: string, pushHistory: boolean): Promise<void> {
        if (this.navigationInFlight) return;
        this.navigationInFlight = true;
        try {
            await this.enterScene(sceneName, pushHistory);
        } finally {
            this.navigationInFlight = false;
        }
    }

    private async enterScene(sceneName: string, pushHistory: boolean): Promise<void> {
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
        await this.logSceneHeader(scene);
        await this.autosave(`Entered *${scene.name}*`);

        // On-enter encounter auto-roll
        if (this.encounterTable?.trigger === 'on-enter') {
            const hit = rollEncounterTable(this.encounterTable);
            const logLine = `*On-enter encounter*: **${hit.label}**${hit.target !== 'continue' ? ` -> *${hit.target}*` : ''}`;
            await this.autosave(logLine);
            if (hit.target && hit.target !== 'continue') {
                await this.enterScene(hit.target, true);
                return;
            }
        }

        await this.render();
    }

    private async navigateBack(): Promise<void> {
        if (this.navigationInFlight) return;
        if (!this.sceneHistory.length || !this.session) return;
        this.navigationInFlight = true;
        try {
            const prev = this.sceneHistory.pop()!;
            const scene = this.allScenes.find(s => s.name === prev);
            if (!scene) return;
            this.currentScene = scene;
            await this.loadCurrentScene();
            await this.loadSceneLocation();
            await this.syncActiveCampaignBoardForScene();
            this.session.currentSceneName = scene.name;
            this.session.currentSceneId = scene.id;
            await this.logSceneHeader(scene);
            await this.autosave(`Back to *${scene.name}*`);
            await this.render();
        } finally {
            this.navigationInFlight = false;
        }
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
        goBtn.addEventListener('click', () => { if (sel.value) void this.doNavigate(sel.value, false); });
    }

    // â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private renderPartySidebar(sidebar: HTMLElement, session: CampaignSession): void {
        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section');
        this.sidebarPartEls.set('party', sec);
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'users');
        hdr.createSpan({ text: ' Party' });
        const body = sec.createDiv('storyteller-campaign-sidebar-body');

        const names = session.partyCharacterNames ?? [];
        if (names.length === 0) {
            body.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'No party members.' });
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
                this.renderSetHpRow(row, name, session);
            }
        }

        this.renderPartyResources(body, session);
        this.renderLootStash(body, session);
    }

    private renderHpRow(row: HTMLElement, name: string, state: PartyMemberState, session: CampaignSession): void {
        const hpRow = row.createDiv('storyteller-campaign-hp-row');
        const hpText = hpRow.createSpan({ cls: 'storyteller-campaign-hp-text', text: `${state.currentHp}/${state.maxHp}` });
        const bar  = hpRow.createDiv('storyteller-hp-bar');
        const fill = bar.createDiv('storyteller-hp-bar-fill');
        const setPct = () => {
            const pct = Math.max(0, Math.min(1, state.currentHp / Math.max(state.maxHp, 1)));
            fill.setCssStyles({ width: `${pct * 100}%` });
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
        minusBtn.addEventListener('click', () => { void mutate(-1); });
        plusBtn.addEventListener('click',  () => { void mutate(1); });
    }

    private renderSetHpRow(row: HTMLElement, name: string, session: CampaignSession): void {
        const ctrl = row.createDiv('storyteller-campaign-hp-controls');
        const input = ctrl.createEl('input', {
            cls: 'storyteller-campaign-input is-small',
            attr: { type: 'number', placeholder: 'Max hp' },
        });
        const setBtn = ctrl.createEl('button', { cls: 'storyteller-campaign-hp-btn', text: 'Set hp' });
        setBtn.addEventListener('click', () => { void (async () => {
            const maxHp = parseInt(input.value);
            if (!maxHp) return;
            if (!session.partyState) session.partyState = [];
            // Replace the character's record rather than add one, so a double tap cannot leave two.
            const idx = session.partyState.findIndex(s => s.characterName === name);
            const record = { characterId: idx >= 0 ? session.partyState[idx].characterId : '', characterName: name, currentHp: maxHp, maxHp };
            if (idx >= 0) session.partyState[idx] = record; else session.partyState.push(record);
            await this.autosave();
            await this.refreshSidebarPart('party');
        })(); });
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

                const partyNameSet = new Set(
                    (session.partyCharacterNames ?? []).map(name => this.normalizeName(name))
                );
                const plotItem = getPlotItem(item);
                ownerSelect.value = plotItem
                    ? getPartyOwner(plotItem, partyNameSet, this.normalizeName) ?? ''
                    : '';
                if (!plotItem) {
                    ownerSelect.disabled = true;
                    ownerSelect.title = 'Create a matching plot item to track ownership.';
                }
                ownerSelect.addEventListener('change', () => { void (async () => {
                    const entry = getPlotItem(item);
                    if (!entry) return;
                    const nextOwner = ownerSelect.value.trim() || undefined;
                    // Owners outside this party keep their copy either way.
                    if (!setPartyOwner(entry, nextOwner, partyNameSet, this.normalizeName)) return;
                    await this.plugin.savePlotItem(entry);
                    await this.autosave(
                        nextOwner
                            ? `Assigned *${item}* to *${nextOwner}*`
                            : `Set *${item}* as shared inventory`
                    );
                })(); });

                const useBtn = itemRow.createEl('button', { cls: 'storyteller-campaign-hp-btn', attr: { 'aria-label': 'Use' } });
                setIcon(useBtn, 'zap');
                useBtn.addEventListener('click', () => { void (async () => {
                    await this.useItem(item, session, rebuild);
                })(); });
                const del = itemRow.createEl('button', { cls: 'storyteller-campaign-hp-btn', attr: { 'aria-label': 'Remove' } });
                setIcon(del, 'cross');
                del.addEventListener('click', () => { void (async () => {
                    const previousItems = [...(session.partyItems ?? [])];
                    session.partyItems = (session.partyItems ?? []).filter(i => i !== item);
                    await this.syncPartyInventoryOwnership(session, previousItems);
                    await this.autosave();
                    rebuild();
                })(); });
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
        addBtn.addEventListener('click', () => { void doAdd(); });
        addSelect.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void doAdd(); } });

        // Active flags display
        if (session.flags?.length) {
            body.createDiv({ cls: 'storyteller-campaign-sidebar-sub-hdr', text: 'Flags' });
            const flagList = body.createDiv('storyteller-campaign-flag-list');
            for (const flag of session.flags) {
                flagList.createSpan({ cls: 'storyteller-branch-tag is-flag', text: `Flag: ${flag}` });
            }
        }
    }

    private async renderLogSidebar(sidebar: HTMLElement, session: CampaignSession): Promise<void> {
        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section');
        this.sidebarPartEls.set('log', sec);
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'scroll');
        hdr.createSpan({ text: ' Session Log' });
        const logActions = hdr.createDiv('storyteller-campaign-progress-actions');
        this.addLogHeaderButton(logActions, 'file-text', 'Session header', () => { void this.openSessionHeaderModal(); });
        this.addLogHeaderButton(logActions, 'flag', 'End of session', () => { this.openSessionEndModal(); });
        this.addLogHeaderButton(logActions, 'hourglass', 'Interlude', () => { this.openInterludeModal(); });
        const body = sec.createDiv('storyteller-campaign-sidebar-body');
        this.renderQuickEntry(body, session);

        if (!session.filePath) {
            body.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'Not yet saved. The first entry creates the session note.' });
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
                const owned = getOwners(plotItem)
                    .map(name => inParty(name))
                    .find((name): name is string => Boolean(name));
                const owner = owned ?? inParty(this.activeActorName) ?? partyNames[0];
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
        this.sidebarPartEls.set('standings', sec);
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
            if (standing.tier !== undefined) {
                row.createSpan({ cls: 'storyteller-campaign-standing-tier', text: `Tier ${standing.tier}` });
            }
            if (standing.standing) {
                row.createSpan({ cls: 'storyteller-campaign-standing-text', text: standing.standing });
            }
            if (standing.statusNotes?.length) {
                body.createDiv({ cls: 'storyteller-campaign-standing-notes', text: standing.statusNotes.join('; ') });
            }
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

    private getStatKey(stat: SceneBranch['stat']): CharacterStatKey {
        return `dnd${stat!.charAt(0).toUpperCase()}${stat!.slice(1)}` as CharacterStatKey;
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

    private getCharacterStateByName(name?: string | null): BranchActorState | undefined {
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

    private getBestPartyStatState(stat?: SceneBranch['stat']): BranchActorState | undefined {
        if (!stat) return undefined;
        const statKey = this.getStatKey(stat);
        let pickedName: string | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const [name, character] of this.partyCharacterStats.entries()) {
            const score = Number(character[statKey] ?? 10);
            if (score > bestScore) {
                bestScore = score;
                pickedName = name;
            }
        }
        return pickedName ? this.getCharacterStateByName(pickedName) : undefined;
    }

    private getBranchActorState(branch: SceneBranch): BranchActorState | undefined {
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

            if (this.session?.id && event.sessionId !== this.session.id) {
                event.sessionId = this.session.id;
                changed = true;
            }

            if (this.session?.name && event.sessionName !== this.session.name) {
                event.sessionName = this.session.name;
                changed = true;
            }

            if (changed) {
                await this.plugin.saveEvent(event);
            }

            return `Triggered event: *${event.name}*`;
        } catch {
            
            const fallback = eventName || eventId;
            return `Triggered event: *${fallback}* (sync failed)`;
        }
    }

    private openSessionTimelineEventModal(session: CampaignSession): void {
        const seed = buildSessionTimelineEvent(session, this.currentScene);
        new EventModal(
            this.app,
            this.plugin,
            null,
            async event => {
                await this.plugin.saveEvent(event);
                await this.autosave(`Recorded timeline event: *${event.name}*`);
            },
            seed,
        ).open();
    }

    private renderProgressSidebar(sidebar: HTMLElement, session: CampaignSession): void {
        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section storyteller-campaign-progress');
        this.sidebarPartEls.set('progress', sec);
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'gauge');
        hdr.createSpan({ text: ' Clocks and threads' });

        const actions = hdr.createDiv('storyteller-campaign-progress-actions');
        const addBtn = actions.createEl('button', { attr: { 'aria-label': 'Add clock, track, timer, thread, goal or quest' } });
        setIcon(addBtn, 'plus-circle');
        addBtn.addEventListener('click', () => { this.openAddProgressModal('clock'); });

        const body = sec.createDiv('storyteller-campaign-sidebar-body');
        const clocks = session.clocks ?? [];
        const threads = session.threads ?? [];
        if (!clocks.length && !threads.length) {
            body.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'No clocks or threads yet.' });
        }

        for (const group of TRACKER_GROUPS) {
            const members = clocks.filter(clock => trackerKindOf(clock) === group.kind);
            if (!members.length) continue;
            body.createDiv({ cls: 'storyteller-campaign-sidebar-sub-hdr', text: group.label });
            for (const clock of members) this.renderTrackerRow(body, session, clock);
        }

        for (const group of THREAD_GROUPS) {
            const members = threads.filter(thread => threadKindOf(thread) === group.kind);
            if (!members.length) continue;
            body.createDiv({ cls: 'storyteller-campaign-sidebar-sub-hdr', text: group.label });
            for (const thread of members) this.renderThreadRow(body, session, thread);
        }
    }

    private renderTrackerRow(body: HTMLElement, session: CampaignSession, clock: CampaignClock): void {
        const kind = trackerKindOf(clock);
        const valueText = kind === 'timer' ? `${clock.current} left` : `${clock.current}/${clock.segments}`;
        const row = body.createDiv(`storyteller-campaign-clock-row is-${kind}`);
        const info = row.createDiv('storyteller-campaign-clock-info');
        info.createSpan({ cls: 'storyteller-campaign-clock-name', text: clock.name });
        info.createSpan({ cls: 'storyteller-campaign-clock-kind', text: kind });
        info.createSpan({ cls: 'storyteller-campaign-clock-value', text: valueText });

        const segments = row.createDiv('storyteller-campaign-clock-segments');
        for (let index = 0; index < clock.segments; index += 1) {
            const segment = segments.createEl('button', {
                cls: index < clock.current ? 'is-filled' : '',
                attr: { 'aria-label': `Set ${clock.name} to ${index + 1} of ${clock.segments}` },
            });
            segment.addEventListener('click', () => {
                const nextValue = index + 1 === clock.current ? index : index + 1;
                setTrackerValue(clock, nextValue);
                const text = kind === 'timer' ? `${clock.current} left` : `${clock.current}/${clock.segments}`;
                void this.autosave(`${kind} ${clock.name}: ${text}`).then(() => this.refreshSidebarPart('progress'));
            });
        }

        const remove = row.createEl('button', {
            cls: 'storyteller-campaign-progress-remove',
            attr: { 'aria-label': `Remove ${kind} ${clock.name}` },
        });
        setIcon(remove, 'x');
        remove.addEventListener('click', () => {
            session.clocks = (session.clocks ?? []).filter(candidate => candidate.id !== clock.id);
            void this.autosave(`Removed ${kind}: *${clock.name}*`).then(() => this.refreshSidebarPart('progress'));
        });
    }

    /** Click cycles the state for the kind; right-click opens a menu with every state, including Abandoned. */
    private renderThreadRow(body: HTMLElement, session: CampaignSession, thread: CampaignThread): void {
        const kind = threadKindOf(thread);
        const legacyStatus = threadLegacyStatus(thread);
        const row = body.createDiv(`storyteller-campaign-thread-row is-${legacyStatus}`);
        const toggle = row.createEl('button', {
            cls: 'storyteller-campaign-thread-toggle',
            attr: { title: 'Click to cycle the state. Right-click to choose any state.' },
        });
        setIcon(toggle.createSpan(), legacyStatus === 'resolved' ? 'circle-check' : legacyStatus === 'abandoned' ? 'circle-x' : 'circle');
        toggle.createSpan({ text: thread.name });
        toggle.createSpan({ cls: 'storyteller-campaign-thread-state', text: threadStateOf(thread) });
        toggle.addEventListener('click', () => {
            const state = cycleCampaignThread(thread);
            void this.autosave(`${kind} ${thread.name}: ${state}`).then(() => this.refreshSidebarPart('progress'));
        });
        toggle.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.openThreadStateMenu(event, thread);
        });

        const remove = row.createEl('button', {
            cls: 'storyteller-campaign-progress-remove',
            attr: { 'aria-label': `Remove thread ${thread.name}` },
        });
        setIcon(remove, 'x');
        remove.addEventListener('click', () => {
            session.threads = (session.threads ?? []).filter(candidate => candidate.id !== thread.id);
            void this.autosave(`Removed ${kind}: *${thread.name}*`).then(() => this.refreshSidebarPart('progress'));
        });
    }

    private openThreadStateMenu(event: MouseEvent, thread: CampaignThread): void {
        const kind = threadKindOf(thread);
        const current = threadStateOf(thread).toLowerCase();
        const states = Array.from(new Set([...CAMPAIGN_THREAD_STATES[kind], 'Abandoned']));
        const menu = new Menu();
        for (const state of states) {
            menu.addItem(item => item
                .setTitle(state)
                .setChecked(state.toLowerCase() === current)
                .onClick(() => {
                    setCampaignThreadState(thread, state);
                    void this.autosave(`${kind} ${thread.name}: ${state}`).then(() => this.refreshSidebarPart('progress'));
                }));
        }
        menu.showAtMouseEvent(event);
    }

    private openAddProgressModal(initialKind: ProgressAddKind): void {
        if (!this.session) return;
        new AddProgressModal(this.app, {
            initialKind,
            onSubmit: values => { void this.applyAddProgress(values); },
        }).open();
    }

    private async applyAddProgress(values: ProgressAddValues): Promise<void> {
        const session = this.session;
        if (!session) return;
        if (values.kind === 'thread' || values.kind === 'goal' || values.kind === 'quest') {
            if (!addCampaignThread(session, values.name, undefined, values.kind)) return;
            await this.autosave(`Opened ${values.kind}: *${values.name}*`);
        } else {
            if (!addCampaignClock(session, values.name, values.size, undefined, values.kind)) return;
            await this.autosave(`Added ${values.kind}: *${values.name}*`);
        }
        await this.refreshSidebarPart('progress');
    }

    /** Party resources: numeric values get +/- steps, text values are shown as they are. */
    private renderPartyResources(body: HTMLElement, session: CampaignSession): void {
        const group = body.createDiv('storyteller-campaign-party-group');
        const head = group.createDiv('storyteller-campaign-party-group-hdr');
        head.createSpan({ text: 'Resources' });
        const addBtn = head.createDiv('storyteller-campaign-progress-actions').createEl('button', { attr: { 'aria-label': 'Add party resource' } });
        setIcon(addBtn, 'plus');
        addBtn.addEventListener('click', () => {
            new PromptModal(this.app, {
                title: 'Add party resource',
                label: 'Resource and value',
                defaultValue: '',
                validator: value => value.trim() ? null : 'Enter a resource and its value.',
                onSubmit: value => {
                    if (!applyCampaignPartyResources(session, [value]).length) return;
                    void this.autosave(`Party: ${value.trim()}`).then(() => this.refreshSidebarPart('party'));
                },
            }).open();
        });

        const entries = Object.entries(session.partyResources ?? {});
        if (!entries.length) group.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'No resources yet.' });
        for (const [name, value] of entries) {
            const row = group.createDiv('storyteller-campaign-resource-row');
            row.createSpan({ cls: 'storyteller-campaign-resource-name', text: name });
            if (typeof value === 'number') {
                row.createSpan({ cls: 'storyteller-campaign-resource-value', text: String(value) });
                const amount = row.createEl('input', {
                    cls: 'storyteller-campaign-input is-small',
                    attr: { type: 'number', min: '1', value: '1', 'aria-label': `Amount for ${name}` },
                });
                const change = (sign: 1 | -1) => {
                    const step = Math.abs(Number.parseInt(amount.value, 10)) || 1;
                    applyCampaignPartyResources(session, [`${name}${sign > 0 ? '+' : '-'}${step}`]);
                    void this.autosave(`Party ${name} ${sign > 0 ? '+' : '-'}${step}`).then(() => this.refreshSidebarPart('party'));
                };
                row.createEl('button', { cls: 'storyteller-campaign-hp-btn', text: '-' }).addEventListener('click', () => change(-1));
                row.createEl('button', { cls: 'storyteller-campaign-hp-btn', text: '+' }).addEventListener('click', () => change(1));
            } else {
                row.createSpan({ cls: 'storyteller-campaign-resource-value', text: value });
            }
            const remove = row.createEl('button', {
                cls: 'storyteller-campaign-progress-remove',
                attr: { 'aria-label': `Remove ${name}` },
            });
            setIcon(remove, 'x');
            remove.addEventListener('click', () => {
                if (session.partyResources) removePartyResource(session.partyResources, name);
                void this.autosave(`Party: removed *${name}*`).then(() => this.refreshSidebarPart('party'));
            });
        }
    }

    /** Unassigned loot stash with a give-to-character action, plus each character's gear. */
    private renderLootStash(body: HTMLElement, session: CampaignSession): void {
        const group = body.createDiv('storyteller-campaign-party-group');
        const head = group.createDiv('storyteller-campaign-party-group-hdr');
        head.createSpan({ text: 'Loot stash' });
        const addBtn = head.createDiv('storyteller-campaign-progress-actions').createEl('button', { attr: { 'aria-label': 'Add loot to the stash' } });
        setIcon(addBtn, 'plus');
        addBtn.addEventListener('click', () => {
            new PromptModal(this.app, {
                title: 'Add loot to the stash',
                label: 'Item, optionally with xN',
                defaultValue: '',
                validator: value => value.trim() ? null : 'Enter an item name.',
                onSubmit: value => {
                    const match = /^(.*?)\s+x(\d+)$/i.exec(value.trim());
                    const name = (match ? match[1] : value).trim();
                    const quantity = match ? Number(match[2]) : 1;
                    if (!addCampaignLoot(session, name, quantity)) return;
                    void this.autosave(`Loot: +${quantity} ${name}`).then(() => this.refreshSidebarPart('party'));
                },
            }).open();
        });

        const owners = session.partyCharacterNames ?? [];
        const stash = (session.loot ?? []).filter(item => !item.assignedTo?.trim());
        if (!stash.length) group.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'Nothing in the stash.' });
        for (const item of stash) {
            const row = group.createDiv('storyteller-campaign-loot-row');
            const qty = item.qty ?? 1;
            row.createSpan({ cls: 'storyteller-campaign-loot-name', text: qty > 1 ? `${item.name} x${qty}` : item.name });
            if (owners.length) {
                const select = row.createEl('select', {
                    cls: 'storyteller-campaign-input is-small',
                    attr: { 'aria-label': `Give ${item.name} to` },
                });
                for (const owner of owners) select.createEl('option', { value: owner, text: owner });
                row.createEl('button', { cls: 'storyteller-campaign-hp-btn', text: 'Give' }).addEventListener('click', () => {
                    if (!assignCampaignLoot(session, item.name, select.value, 1)) return;
                    void this.autosave(`Loot: ${item.name} to ${select.value}`).then(() => this.refreshSidebarPart('party'));
                });
            }
            const remove = row.createEl('button', {
                cls: 'storyteller-campaign-progress-remove',
                attr: { 'aria-label': `Remove ${item.name} from the stash` },
            });
            setIcon(remove, 'x');
            remove.addEventListener('click', () => {
                removeCampaignLoot(session, item.name);
                void this.autosave(`Loot: removed *${item.name}*`).then(() => this.refreshSidebarPart('party'));
            });
        }

        const gear = (session.loot ?? []).filter(item => item.assignedTo?.trim());
        if (gear.length) {
            group.createDiv({ cls: 'storyteller-campaign-sidebar-sub-hdr', text: 'Gear' });
            for (const item of gear) {
                const owner = item.assignedTo ?? '';
                const qty = item.qty ?? 1;
                const row = group.createDiv('storyteller-campaign-loot-row');
                row.createSpan({
                    cls: 'storyteller-campaign-loot-name',
                    text: `${item.name}${qty > 1 ? ` x${qty}` : ''} (${owner})`,
                });
                const remove = row.createEl('button', {
                    cls: 'storyteller-campaign-progress-remove',
                    attr: { 'aria-label': `Remove ${item.name} from ${owner}` },
                });
                setIcon(remove, 'x');
                remove.addEventListener('click', () => {
                    removeCampaignLoot(session, item.name, undefined, owner);
                    void this.autosave(`Loot: removed *${item.name}* from ${owner}`).then(() => this.refreshSidebarPart('party'));
                });
            }
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

            // Already held by someone in the party — leave that assignment alone.
            if (getPartyOwner(plotItem, partyNameSet, this.normalizeName)) continue;
            if (!setPartyOwner(plotItem, defaultOwner, partyNameSet, this.normalizeName)) continue;

            await this.plugin.savePlotItem(plotItem);
        }

        const currentNameSet = new Set(uniqueCurrentItems.map(itemName => this.normalizeName(itemName)));
        const uniquePreviousItems = Array.from(
            new Map(previousItems.map(itemName => [this.normalizeName(itemName), itemName])).values()
        );

        for (const itemName of uniquePreviousItems) {
            if (currentNameSet.has(this.normalizeName(itemName))) continue;
            const plotItem = findItem(itemName);
            if (!plotItem) continue;
            // The party dropped it; owners outside the party still hold theirs.
            if (!getPartyOwner(plotItem, partyNameSet, this.normalizeName)) continue;
            if (!setPartyOwner(plotItem, undefined, partyNameSet, this.normalizeName)) continue;

            await this.plugin.savePlotItem(plotItem);
        }
    }

    // ── Partylog: session log writes and sidebar refresh ─────────────────────

    /**
     * Rewrites the ## Session Log body through the same queue as autosave, so raw Partylog writes
     * never race a pending session save.
     */
    private async writeSessionLog(update: (body: string) => string): Promise<void> {
        if (!this.session) return;
        await this.flushAutosaveNow();
        const filePath = this.session.filePath;
        if (!filePath) return;
        // A failed link must not poison the chain for later writes, so each one starts after the last settles.
        this.flushChain = this.flushChain.catch(() => undefined).then(() => this.plugin.updateSessionLog(filePath, update));
        try {
            await this.flushChain;
        } catch (error) {
            this.notifySaveFailure(error, 'Could not write to the session log');
            throw error;
        }
    }

    private notifySaveFailure(error: unknown, what: string): void {
        const reason = error instanceof Error ? error.message : String(error);
        new Notice(`${what}: ${reason}`);
    }

    /** Character ids and names for resolving older party records that store only ids. */
    private characterRefs: Array<{ id: string; name: string }> = [];

    private partylogContext(): PartylogBridgeContext {
        return {
            groups: this.plugin.getGroups().map(group => ({ id: group.id, name: group.name })),
            characters: this.characterRefs,
        };
    }

    /** Re-renders one sidebar section in place. Falls back to a full render if it is not on screen. */
    private async refreshSidebarPart(part: SidebarPart): Promise<void> {
        const session = this.session;
        const old = this.sidebarPartEls.get(part);
        if (!session || !old?.parentElement) {
            await this.render();
            return;
        }
        const holder = activeDocument.createElement('div');
        switch (part) {
            case 'party':
                this.renderPartySidebar(holder, session);
                break;
            case 'progress':
                this.renderProgressSidebar(holder, session);
                break;
            case 'standings':
                this.renderGroupStandingsSidebar(holder, session);
                break;
            case 'log':
                await this.renderLogSidebar(holder, session);
                break;
        }
        const fresh = holder.firstElementChild;
        if (!(fresh instanceof HTMLElement)) return;
        old.replaceWith(fresh);
        this.sidebarPartEls.set(part, fresh);
    }

    private async refreshSidebarParts(parts: readonly SidebarPart[]): Promise<void> {
        for (const part of Array.from(new Set(parts))) {
            await this.refreshSidebarPart(part);
        }
    }

    /**
     * Appends `### S<n> *scene*` when the scene changes, using the library's id rules. Reopening a
     * session at the scene it already ends with adds nothing.
     */
    private async logSceneHeader(scene: Scene): Promise<void> {
        const session = this.session;
        if (!session) return;
        const kind = this.sceneKindChoice;
        const thread = this.sceneKindThread;
        this.sceneKindChoice = 'next';
        await this.autosave();
        if (!session.filePath) return;

        // The check and the header id are computed from the body being written, so no other write can land between them.
        await this.writeSessionLog(body => {
            if (kind === 'next' && lastSceneContext(body) === scene.name) return body;
            const { line } = nextSceneHeaderLine(body, kind, scene.name, thread);
            return appendBlock(body, line);
        });
    }

    private renderSceneKindControl(toolbar: HTMLElement): void {
        const select = toolbar.createEl('select', {
            cls: 'storyteller-campaign-input is-small storyteller-campaign-scene-kind',
            attr: { 'aria-label': 'Kind of the next scene header', title: 'Kind of the next scene header in the log' },
        });
        const options: ReadonlyArray<[string, string]> = [
            ['next', 'Next scene'],
            ['flashback', 'Flashback'],
            ['split-1', 'Split thread 1'],
            ['split-2', 'Split thread 2'],
            ['montage', 'Montage'],
        ];
        for (const [value, label] of options) select.createEl('option', { value, text: label });
        select.value = this.sceneKindChoice === 'split' ? `split-${this.sceneKindThread}` : this.sceneKindChoice;
        select.addEventListener('change', () => {
            if (select.value.startsWith('split-')) {
                this.sceneKindChoice = 'split';
                this.sceneKindThread = select.value === 'split-2' ? 2 : 1;
            } else {
                this.sceneKindChoice = select.value as SceneKindChoice;
            }
        });
    }

    private addLogHeaderButton(actions: HTMLElement, icon: string, label: string, onClick: () => void): void {
        const button = actions.createEl('button', { attr: { 'aria-label': label, title: label } });
        setIcon(button, icon);
        button.addEventListener('click', onClick);
    }

    // ── Partylog: session header, end of session and interludes ──────────────

    private async openSessionHeaderModal(): Promise<void> {
        const session = this.session;
        if (!session) return;
        let suggested = session.sessionNumber;
        if (suggested === undefined) {
            try {
                const sessions = await this.plugin.listSessions();
                suggested = sessions.reduce((max, item) => Math.max(max, item.sessionNumber ?? 0), 0) + 1;
            } catch {
                suggested = 1;
            }
        }
        new SessionHeaderModal(this.app, {
            initial: {
                number: session.sessionNumber ?? suggested,
                date: session.date ?? new Date().toISOString().slice(0, 10),
                duration: session.duration ?? '',
                players: session.players?.length ? session.players : (session.partyCharacterNames ?? []).map(name => `Player (${name})`),
                scribe: session.scribe ?? '',
                absent: session.absent ?? [],
                mood: session.mood ?? '',
                recap: session.recap ?? '',
                goals: session.goals ?? '',
            },
            onSubmit: values => { void this.applySessionHeader(values); },
        }).open();
    }

    /** Writes the header fields to the session and replaces the header block at the top of the log. */
    private async applySessionHeader(values: SessionHeaderValues): Promise<void> {
        const session = this.session;
        if (!session) return;
        session.sessionNumber = values.number;
        session.date = values.date || undefined;
        session.duration = values.duration || undefined;
        session.players = values.players;
        session.scribe = values.scribe || undefined;
        session.absent = values.absent;
        session.mood = values.mood || undefined;
        session.recap = values.recap || undefined;
        session.goals = values.goals || undefined;
        await this.autosave();

        const header: SessionHeader = {
            number: values.number,
            date: values.date || undefined,
            duration: values.duration || undefined,
            players: values.players,
            scribe: values.scribe || undefined,
            absent: values.absent,
            mood: values.mood || undefined,
            threads: (session.threads ?? []).filter(thread => threadLegacyStatus(thread) === 'active').map(thread => thread.name),
            recap: values.recap || undefined,
            goals: values.goals || undefined,
        };
        await this.writeSessionLog(body => upsertSessionHeaderBlock(body, header));
        await this.refreshSidebarParts(['log']);
    }

    private openSessionEndModal(): void {
        const session = this.session;
        if (!session) return;
        new SessionEndModal(this.app, {
            partyNames: session.partyCharacterNames ?? [],
            onSubmit: values => { void this.applySessionEnd(values); },
        }).open();
    }

    /**
     * Records advancements on the session, replays the change tags into state, and writes the end
     * block (advancements, changes, hook, notes). Saving again replaces the end block.
     */
    private async applySessionEnd(values: SessionEndValues): Promise<void> {
        const session = this.session;
        if (!session) return;
        const number = session.sessionNumber;
        for (const entry of values.advancements) {
            const summary = [entry.detail, ...entry.gains].filter(part => part.length > 0).join(', ') || 'Advanced';
            addCampaignAdvancement(session, entry.character, summary, { sessionNumber: number });
        }

        // Change lines already in the end block stay there and are not replayed a second time.
        const previous = session.filePath ? previousSessionEndChangeLines(await this.plugin.loadSessionLog(session.filePath)) : [];
        const previousSet = new Set(previous);
        const newChanges = values.changeLines.map(line => line.trim()).filter(line => line.length > 0 && !previousSet.has(line));
        const changeEntries = parseLogLines(newChanges);
        const result = applyPartylogTagsToSession(session, changeEntries.flatMap(entryTags), this.partylogContext());
        // The modal starts empty, so a blank hook or note keeps the one saved before.
        session.hook = values.hook || session.hook;
        session.endNotes = values.notes || session.endNotes;
        if (values.endSession) session.status = 'completed';

        // Every advancement of this session is written, so re-saving the block keeps earlier ones.
        const lines = [
            ...advancementLinesForSession(session, number),
            ...previous,
            ...newChanges,
            ...(session.hook ? [`(hook: ${session.hook})`] : []),
            ...(session.endNotes ? [`(note: ${session.endNotes})`] : []),
        ];
        await this.autosave();
        const end = sessionEndFromLines(number, lines);
        await this.writeSessionLog(body => upsertSessionEndBlock(body, end));
        await this.refreshSidebarParts(partsAffectedBy(result.summary));
    }

    private openInterludeModal(): void {
        if (!this.session) return;
        new InterludeModal(this.app, {
            onSubmit: values => { void this.applyInterlude(values); },
        }).open();
    }

    /** Appends an interlude block, records it on the session and replays its change tags. */
    private async applyInterlude(values: InterludeValues): Promise<void> {
        const session = this.session;
        if (!session) return;
        const entries = parseLogLines([...values.summary.split('\n'), ...values.changeLines]);
        const result = applyPartylogTagsToSession(session, entries.flatMap(entryTags), this.partylogContext());
        addCampaignInterlude(session, values.title, values.summary || undefined, values.changeLines);
        await this.autosave();
        const interlude: Interlude = { title: values.title, entries };
        await this.writeSessionLog(body => appendInterludeBlock(body, interlude));
        await this.refreshSidebarParts(partsAffectedBy(result.summary));
    }

    private focusQuickEntry(): void {
        this.sidebarPartEls.get('log')?.querySelector<HTMLInputElement>('.storyteller-campaign-quick-input')?.focus();
    }

    // ── Partylog: quick entry bar ─────────────────────────────────────────────

    private renderQuickEntry(container: HTMLElement, session: CampaignSession): void {
        const wrap = container.createDiv('storyteller-campaign-quick');
        // Warm the name cache early: tag replay uses it to resolve party records stored by id.
        void this.loadTagNames();
        this.renderQuickEntryBody(wrap, session);
    }

    /** Rebuilds the quick entry bar from `this.quick`. Typed text lives in that state, so rebuilds keep it. */
    private renderQuickEntryBody(wrap: HTMLElement, session: CampaignSession): void {
        wrap.empty();
        const q = this.quick;
        const rerender = () => this.renderQuickEntryBody(wrap, session);

        // Actors: GM/World clears the selection, PCs and added NPCs toggle in order.
        const actorRow = wrap.createDiv('storyteller-campaign-quick-actors');
        const worldChip = actorRow.createEl('button', { cls: 'storyteller-campaign-quick-chip', text: 'World' });
        if (q.actors.length === 0) worldChip.addClass('is-active');
        worldChip.addEventListener('click', () => { q.actors = []; rerender(); });

        for (const name of Array.from(new Set([...(session.partyCharacterNames ?? []), ...this.quickNpcs]))) {
            const order = q.actors.indexOf(name);
            const chip = actorRow.createEl('button', { cls: 'storyteller-campaign-quick-chip', text: name });
            if (order >= 0) {
                chip.addClass('is-active');
                chip.createSpan({ cls: 'storyteller-campaign-quick-order', text: String(order + 1) });
            }
            chip.addEventListener('click', () => {
                q.actors = order >= 0 ? q.actors.filter(actor => actor !== name) : [...q.actors, name];
                rerender();
            });
        }

        const npcRow = wrap.createDiv('storyteller-campaign-quick-npc');
        const npcInput = npcRow.createEl('input', {
            cls: 'storyteller-campaign-input is-small',
            attr: { type: 'text', placeholder: 'Actor not in the party', 'aria-label': 'Add an actor not in the party' },
        });
        const addNpc = () => {
            const name = npcInput.value.trim();
            if (!name) return;
            if (!this.quickNpcs.some(existing => this.normalizeName(existing) === this.normalizeName(name))) {
                this.quickNpcs.push(name);
            }
            if (!q.actors.includes(name)) q.actors = [...q.actors, name];
            rerender();
        };
        npcInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); addNpc(); }
        });
        npcRow.createEl('button', { cls: 'storyteller-campaign-quick-chip', text: 'Add actor' })
            .addEventListener('click', addNpc);

        // Entry modes
        const modes = wrap.createDiv('storyteller-campaign-quick-modes');
        for (const def of QUICK_MODES) {
            const button = modes.createEl('button', {
                cls: 'storyteller-campaign-quick-mode',
                text: def.label,
                attr: { title: def.hint, 'aria-pressed': String(q.mode === def.mode) },
            });
            if (q.mode === def.mode) button.addClass('is-active');
            button.addEventListener('click', () => {
                q.mode = def.mode;
                if (def.mode === 'roll' && this.lastDiceResult) {
                    if (!q.rollExpression) q.rollExpression = this.lastDiceResult.expression;
                    if (!q.rollOutcome) q.rollOutcome = this.lastDiceResult.outcome;
                }
                rerender();
            });
        }

        let updatePreview: () => void = () => undefined;

        if (q.mode === 'note') {
            const select = wrap.createEl('select', {
                cls: 'storyteller-campaign-input is-small',
                attr: { 'aria-label': 'Note type' },
            });
            for (const option of NOTE_KINDS) select.createEl('option', { value: option.value, text: option.label });
            select.value = q.noteKind;
            select.addEventListener('change', () => {
                q.noteKind = select.value as QuickNoteKind;
                updatePreview();
            });
        }

        if (q.mode === 'roll') {
            const rollRow = wrap.createDiv('storyteller-campaign-quick-roll');
            const bindRollField = (placeholder: string, label: string, value: string, store: (next: string) => void) => {
                const field = rollRow.createEl('input', {
                    cls: 'storyteller-campaign-input is-small',
                    attr: { type: 'text', placeholder, 'aria-label': label },
                });
                field.value = value;
                field.addEventListener('input', () => { store(field.value); updatePreview(); });
            };
            bindRollField('d20+3=17', 'Roll expression', q.rollExpression, next => { q.rollExpression = next; });
            bindRollField('DC 15 or AC 14', 'Target', q.rollVs, next => { q.rollVs = next; });
            bindRollField('Success', 'Outcome', q.rollOutcome, next => { q.rollOutcome = next; });
        }

        // Main line and submit
        const line = wrap.createDiv('storyteller-campaign-quick-line');
        const input = line.createEl('input', {
            cls: 'storyteller-campaign-input storyteller-campaign-quick-input',
            attr: { type: 'text', placeholder: quickPlaceholder(q.mode), 'aria-label': 'Partylog entry' },
        });
        input.value = q.draft;
        input.addEventListener('input', () => { q.draft = input.value; updatePreview(); });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                void this.submitQuickEntry();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                q.draft = '';
                input.value = '';
                updatePreview();
            }
        });
        const submit = line.createEl('button', { cls: 'storyteller-campaign-btn is-primary', text: 'Add' });
        submit.addEventListener('click', () => { void this.submitQuickEntry(); });

        // Tag helper: inserts [Kind:Name] at the caret and suggests story names.
        const tagRow = wrap.createDiv('storyteller-campaign-quick-tags');
        tagRow.createSpan({ cls: 'storyteller-campaign-quick-label', text: 'Tag' });
        const kindSelect = tagRow.createEl('select', {
            cls: 'storyteller-campaign-input is-small',
            attr: { 'aria-label': 'Tag type' },
        });
        for (const option of TAG_KINDS) kindSelect.createEl('option', { value: option.kind, text: option.label });
        kindSelect.value = q.tagKind;
        const nameInput = tagRow.createEl('input', {
            cls: 'storyteller-campaign-input is-small',
            attr: { type: 'text', placeholder: 'Name', list: TAG_DATALIST_ID, 'aria-label': 'Tag name' },
        });
        nameInput.value = q.tagName;
        const datalist = tagRow.createEl('datalist', { attr: { id: TAG_DATALIST_ID } });
        const fillSuggestions = () => {
            void this.loadTagNames().then(cache => {
                datalist.empty();
                for (const name of Array.from(new Set(this.tagSuggestions(q.tagKind, session, cache)))) {
                    datalist.createEl('option', { value: name });
                }
            });
        };
        kindSelect.addEventListener('change', () => { q.tagKind = kindSelect.value; fillSuggestions(); });
        nameInput.addEventListener('input', () => { q.tagName = nameInput.value; });
        const insertTag = () => {
            q.tagName = nameInput.value;
            this.insertQuickTag(input);
            updatePreview();
        };
        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); insertTag(); }
        });
        tagRow.createEl('button', { cls: 'storyteller-campaign-quick-chip', text: 'Insert' })
            .addEventListener('click', insertTag);
        fillSuggestions();

        // Live preview of the exact line that will be written.
        const preview = wrap.createDiv('storyteller-campaign-quick-preview');
        updatePreview = () => {
            const built = this.buildQuickLine();
            preview.setText(built.line ?? built.error ?? '');
            preview.toggleClass('is-error', !built.line);
        };
        updatePreview();
    }

    /** Builds the Partylog line for the current quick entry state, or the reason it cannot be built. */
    private buildQuickLine(): { line?: string; error?: string } {
        const q = this.quick;
        const text = q.draft.trim();
        const actors = [...q.actors];
        switch (q.mode) {
            case 'action':
                if (!text) return { error: 'Write what the character does.' };
                return {
                    line: formatAction({
                        mode: actors.length > 1 ? 'group' : actors.length === 1 ? 'solo' : 'implicit',
                        actors,
                        text,
                    }),
                };
            case 'assist':
                if (actors.length !== 2) return { error: 'Assist needs two actors: pick the leader first, then the helper.' };
                if (!text) return { error: 'Write what the assist does.' };
                return { line: formatAction({ mode: 'assist', actors, text }) };
            case 'group':
                if (actors.length < 2) return { error: 'A group action needs at least two actors.' };
                if (!text) return { error: 'Write what the group does.' };
                return { line: formatAction({ mode: 'group', actors, text }) };
            case 'world':
                if (!text) return { error: 'Write the world event.' };
                return { line: formatEvent({ text }) };
            case 'consequence':
                if (!text) return { error: 'Write the consequence.' };
                return { line: formatConsequence({ text }) };
            case 'note':
                if (!text) return { error: 'Write the note.' };
                if (q.noteKind === 'ooc') return { line: formatEntry(parsePartylogLine(`[OOC: ${text}]`)) };
                return { line: formatMeta({ type: q.noteKind, text }) };
            case 'roll': {
                const expression = q.rollExpression.trim();
                if (!expression) return { error: 'Enter the roll, for example d20+3=17.' };
                const target = q.rollVs.trim();
                const outcome = q.rollOutcome.trim();
                const mode = actors.length === 0 ? 'none' : actors.length === 1 ? 'solo' : 'group';
                return {
                    line: formatRoll({
                        mode,
                        actors,
                        expression: target ? `${expression} vs ${target}` : expression,
                        outcome: outcome || undefined,
                        tags: extractTags(text).tags,
                    }),
                };
            }
        }
    }

    /** Writes the line to the log, replays its tags into the session and refreshes what they touched. */
    private async submitQuickEntry(): Promise<void> {
        if (this.quickSubmitInFlight) return;
        const session = this.session;
        if (!session) return;
        const built = this.buildQuickLine();
        if (!built.line) {
            new Notice(built.error ?? 'Nothing to add yet.');
            return;
        }
        const line = built.line;
        // Take the line before the first await: a second submit then sees an empty draft and writes nothing.
        this.quick.draft = '';
        this.quickSubmitInFlight = true;
        try {
            const result = applyPartylogTagsToSession(session, entryTags(parsePartylogLine(line)), this.partylogContext());
            await this.autosave();
            await this.writeSessionLog(body => appendLogLines(body, [line]));
            if (result.changed) new Notice(result.summary.join('\n'));
            await this.refreshSidebarParts(partsAffectedBy(result.summary));
        } finally {
            this.quickSubmitInFlight = false;
        }
        this.focusQuickEntry();
    }

    private insertQuickTag(input: HTMLInputElement): void {
        const q = this.quick;
        const name = q.tagName.trim();
        const tag = `[${q.tagKind}:${name}]`;
        const value = input.value;
        const start = input.selectionStart ?? value.length;
        const end = input.selectionEnd ?? start;
        const before = value.slice(0, start);
        const spacer = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
        const head = `${before}${spacer}`;
        input.value = `${head}${tag}${value.slice(end)}`;
        q.draft = input.value;
        // With no name the caret waits after the colon, ready to type.
        const caret = name ? head.length + tag.length : head.length + q.tagKind.length + 2;
        input.focus();
        input.setSelectionRange(caret, caret);
    }

    private async loadTagNames(): Promise<TagNameCache> {
        if (this.tagNameCache) return this.tagNameCache;
        const cache: TagNameCache = { characters: [], locations: [], items: [] };
        try {
            const characters = await this.plugin.listCharacters();
            cache.characters = characters.map(item => item.name);
            this.characterRefs = characters.map(item => ({ id: item.id || item.name, name: item.name }));
        } catch { /* no story */ }
        try { cache.locations = (await this.plugin.listLocations()).map(item => item.name); } catch { /* no story */ }
        try { cache.items = (await this.plugin.listPlotItems()).map(item => item.name); } catch { /* no story */ }
        this.tagNameCache = cache;
        return cache;
    }

    private tagSuggestions(kind: string, session: CampaignSession, cache: TagNameCache): string[] {
        switch (kind) {
            case 'N':
            case 'F':
                return cache.characters;
            case 'PC':
                return session.partyCharacterNames ?? [];
            case 'L':
                return cache.locations;
            case 'Faction':
                return this.plugin.getGroups().map(group => group.name);
            case 'Loot':
                return cache.items;
            case 'Party':
                return Object.keys(session.partyResources ?? {});
            case 'Clock':
            case 'Track':
            case 'Timer':
                return (session.clocks ?? []).map(clock => clock.name);
            case 'Thread':
            case 'Goal':
            case 'Quest': {
                const wanted = kind.toLowerCase();
                return (session.threads ?? [])
                    .filter(thread => threadKindOf(thread) === wanted)
                    .map(thread => thread.name);
            }
            default:
                return [];
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

        // Captured now, so the write goes to the session these entries were made in even if the view switches session first.
        const session = this.session;
        this.flushChain = this.flushChain.catch(() => undefined).then(async () => {
            if (!session) return;
            await this.plugin.saveSession(session);
            if (entries.length && session.filePath) {
                await this.plugin.appendToSessionLogEntries(session.filePath, entries);
            }
        });

        try {
            await this.flushChain;
            resolve?.();
        } catch (error) {
            // Keep the entries (ahead of anything queued meanwhile) so the next flush retries them.
            this.pendingSessionSave = this.pendingSessionSave || shouldSaveSession;
            this.pendingLogEntries = [...entries, ...this.pendingLogEntries];
            this.notifySaveFailure(error, 'Session not saved; the pending entries will retry on the next save');
            reject?.(error);
        }
    }

    private async flushAutosaveNow(): Promise<void> {
        if (this.autosaveTimer !== null) {
            window.clearTimeout(this.autosaveTimer);
            this.autosaveTimer = null;
        }
        await this.flushAutosaveQueue();
        await this.flushChain.catch(() => undefined);
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
