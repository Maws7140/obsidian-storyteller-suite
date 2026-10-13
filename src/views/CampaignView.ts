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
    SceneOutcomeFields,
    EncounterTable,
    EncounterTableRow,
    PartyMemberState,
    Character,
    Group,
    Location,
    MapBinding,
    EntityRef,
    PlotItem,
    CompendiumEntry,
    StoryMap,
    Event as StoryEvent,
} from '../types';
import {
    extractBranchesFromMarkdown,
    extractEncounterTableFromMarkdown,
} from '../utils/BranchParser';
import {
    roll,
    statModifier,
    resolveBranch,
    rollOnEncounterTable,
    encounterRowFor,
    encounterLeadsToScene,
    checkBranchConditions,
    applyBranchOutcomes,
    applyEncounterResult,
} from '../utils/DiceRoller';
import { getOwners, getPartyOwner, setPartyOwner } from '../utils/ItemOwnership';
import { renderOutcomeChips } from '../extensions/BranchBlockExtension';
import { CalendarRegistry } from '../calendar/CalendarRegistry';
import type { CalendarSystem } from '../calendar/types';
import { parseInCalendar } from '../calendar/CalendarDateText';
import {
    advanceCampaignDate,
    calendarKeepsTime,
    campaignDateRange,
    durationProblem,
    formatCampaignDuration,
    isZeroDuration,
    parseCampaignDuration,
} from '../campaign/CampaignTime';
import {
    applyCampaignSetup,
    campaignSetupProblem,
    defaultCampaignSetup,
    knownCampaigns,
    renderCampaignSetupFields,
} from '../campaign/CampaignSetup';
import { outcomeChips } from '../utils/SceneOutcomeSummary';
import { splitNoteSections, VIEW_TYPE_PLAYER_SCREEN } from '../campaign/PlayerPush';
import type { NoteSection, PlayerChoice, PlayerPushMode, PlayerScreenControls, PlayerScreenMode, PlayerView } from '../campaign/PlayerPush';
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
import {
    addCombatants,
    damageCombatant,
    initiativeOrder,
    nextTurn,
    parseCombatantInput,
    previousTurn,
    removeCombatant,
    startCombat,
    updateCombatant,
    healthWord,
} from '../campaign/Combat';
import type { CombatState, NewCombatant } from '../campaign/Combat';
import { EventModal } from '../modals/EventModal';
import * as L from 'leaflet';
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
    formatTable,
    parsePartylogLine,
    type Interlude,
    type SessionHeader,
} from '../campaign/partylog';

export const VIEW_TYPE_CAMPAIGN = 'storyteller-campaign-view';

/** Sidebar sections that can be re-rendered on their own after a Partylog entry. */
type SidebarPart = 'read' | 'party' | 'progress' | 'standings' | 'log';
type RailTab = 'read' | 'party' | 'progress' | 'world' | 'log';
type BoardTool = 'inspect' | 'move' | 'reveal' | 'ping';
type FloatingPanelId = 'play' | 'combat';
interface PanelLayout {
    play?: { x?: number; y?: number; collapsed?: boolean };
    combat?: { x?: number; y?: number; collapsed?: boolean };
    railCollapsed?: boolean;
    railTab?: RailTab;
}
const PANEL_LAYOUT_KEY = 'storyteller-campaign-panel-layout';

const RAIL_TABS: ReadonlyArray<{ id: RailTab; label: string; icon: string }> = [
    { id: 'read', label: 'Read', icon: 'book-open' },
    { id: 'party', label: 'Party', icon: 'users' },
    { id: 'progress', label: 'Progress', icon: 'gauge' },
    { id: 'world', label: 'World', icon: 'globe' },
    { id: 'log', label: 'Log', icon: 'scroll' },
];

/** Which rail tab shows each sidebar part. The log is not in the rail: it is docked under the board. */
const PART_TAB: Partial<Record<SidebarPart, RailTab>> = {
    read: 'read',
    party: 'party',
    progress: 'progress',
    standings: 'world',
};

/** Leaflet pane for the choice paths on the board. */
const BOARD_PATH_PANE = 'storyteller-choice-paths';

/** Headers that hold the text read out when a scene starts: "Read-aloud", "Read aloud", "Boxed text". */
const READ_ALOUD_HEADING = /\bread\b|read-aloud|boxed text/i;
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
    /** The "Actor not in the party" name being typed. */
    npcDraft: string;
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
        npcDraft: '',
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

/**
 * Where a pin sits on an image board, in percent from the left and from the top. Image maps store
 * pins as Leaflet [lat, lng] in image pixels with lat counted up from the bottom edge (see the
 * tiled CRS in leaflet/renderer.ts), so the top offset is the image height minus lat.
 */
export function boardPinPercent(coordinates: [number, number], width: number, height: number): { x: number; y: number } {
    const clamp = (value: number) => Math.max(2, Math.min(98, value));
    return {
        x: clamp((coordinates[1] / Math.max(width, 1)) * 100),
        y: clamp(((height - coordinates[0]) / Math.max(height, 1)) * 100),
    };
}

/** A scene's text without its branch and encounter blocks, which the play screen draws itself. */
export function stripPlayBlocks(markdown: string): string {
    return (markdown ?? '')
        .replace(/^```branch[\s\S]*?^```\n?/gm, '')
        .replace(/^```encounter[\s\S]*?^```\n?/gm, '')
        .trim();
}

/**
 * The scene note as sections for the Read tab. Text before the first header becomes an
 * "Opening" section, branch and encounter blocks are dropped, and empty sections are left out.
 */
export function readSectionsFor(content: string): NoteSection[] {
    const sections = splitNoteSections(content)
        .map(section => ({ ...section, markdown: stripPlayBlocks(section.markdown) }));
    const body = (content ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const firstHeader = body.search(/^#{1,6}\s+\S/m);
    const opening = stripPlayBlocks(firstHeader >= 0 ? body.slice(0, firstHeader) : body);
    const all = opening ? [{ heading: 'Opening', level: 1, markdown: opening }, ...sections] : sections;
    return all.filter(section => section.markdown.length > 0);
}

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
    /** Log entries whose write failed, by session file path. They are retried only against that file. */
    private retainedLogEntries = new Map<string, string[]>();
    private readonly autosaveDebounceMs = 450;
    /** Live section elements, so one part can be re-rendered in place. */
    private sidebarPartEls = new Map<SidebarPart, HTMLElement>();
    /** Per scene: index of the selected header in the Read panel, or null when collapsed on it. */
    private readSelection = new Map<string, number | null>();
    /** The board drawn for this scene, kept so the player screen can draw the same map. */
    private boardInfo: { map: StoryMap; imageUrl: string } | null = null;
    /** Board image sizes, by image URL, so the player view does not load the image on every publish. */
    private boardSizeCache = new Map<string, { width: number; height: number } | null>();
    /** The latest roll to show on the player screen when the DM lets players see rolls. */
    private lastPlayerRoll: { title: string; total: number; result: string; at: number } | null = null;
    /** Counts renders, so a slow render that a newer one overtook throws its copy away. */
    private renderGeneration = 0;
    /** The view root on screen, and the hidden one being drawn (see render). */
    private viewRoot: HTMLElement | null = null;
    private buildingRoot: HTMLElement | null = null;
    /** The rail tab showing on the right of the play screen. */
    private railTab: RailTab = 'read';
    /** The current scene note split by header, for the Read tab and the players menu. */
    private readSections: NoteSection[] = [];
    /** Whether the location inspector is open over the board. Opens when the DM clicks a pin. */
    private boardInspectorOpen = false;
    /** Whether the right rail is folded down to its icons. */
    private railCollapsed = false;
    private railEl: HTMLElement | null = null;
    /** Where the floating panels sit, remembered on this device. */
    private panelLayout: PanelLayout = {};
    /** The map tool in use: inspect a place, move the party, reveal places, or ping. */
    private boardTool: BoardTool = 'inspect';
    /** The DM's latest ping, shown on both screens for a few seconds. */
    private lastPing: { x: number; y: number; at: number } | null = null;
    private quick: QuickEntryState = createQuickEntryState();
    /** The main quick entry input currently shown, so a submit can clear and restore its text. */
    private quickInputEl: HTMLInputElement | null = null;
    /** True from the first submit until its line is written, so repeat submits are ignored. */
    private quickSubmitInFlight = false;
    /** True while a branch choice is being applied. */
    private choiceInFlight = false;
    /** True while a party item is being used, so a repeat tap does not apply it again. */
    private itemUseInFlight = false;
    /** True while a scene change or Back is running. */
    private navigationInFlight = false;
    /** NPC names typed into the quick entry bar for this view. */
    private quickNpcs: string[] = [];
    /** Amounts typed into the party resource +/- boxes, by resource name. Kept so re-renders keep them. */
    private partyAmountDrafts = new Map<string, string>();
    /** Last dice result from a branch roll, used to prefill the Roll entry. */
    private lastDiceResult: { expression: string; outcome: string } | null = null;
    /** Choices the party passed over when it left the last scene, written onto that scene's event. */
    private pendingPathsNotTaken: string[] = [];
    /** Latest encounter roll, shown on the scene until the party moves on. */
    private lastEncounter: { sceneName: string; total: number; row: EncounterTableRow } | null = null;
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
        // Unsubmitted quick entry text and per-session UI state belong to the session being left.
        this.quick = createQuickEntryState();
        this.quickInputEl = null;
        this.quickNpcs = [];
        this.partyAmountDrafts.clear();
        this.lastDiceResult = null;
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

    /**
     * Draws the view into a hidden copy and swaps it in once everything, the board map included,
     * has loaded. Until then the previous screen stays up, so the DM never sees a half-drawn view
     * and the map does not blank on every choice. A newer render makes an older one throw its copy away.
     */
    async render(): Promise<void> {
        const generation = ++this.renderGeneration;
        const host = this.containerEl.children[1] as HTMLElement;
        host.addClass('storyteller-campaign-host');

        // Keep the live map on screen while the new one starts; it is unloaded after the swap.
        const previousRenderer = this.boardRenderer;
        this.boardRenderer = null;
        this.boardRenderToken++;
        this.boardLocations = [];

        const next = host.createDiv('storyteller-campaign-view is-building');
        this.buildingRoot = next;
        try {
            if (!this.session) {
                await this.renderSessionSelect(next);
            } else {
                await this.renderPlay(next);
            }
        } catch (error) {
            console.error('Storyteller Suite: campaign view failed to draw', error);
            next.empty();
            next.createDiv({ cls: 'storyteller-campaign-empty', text: 'The campaign view could not draw. See the developer console for details.' });
        }

        if (generation !== this.renderGeneration) {
            // A newer render started while this one loaded; it owns the screen.
            next.remove();
            previousRenderer?.unload();
            return;
        }
        for (const child of Array.from(host.children)) {
            if (child !== next) child.remove();
        }
        next.removeClass('is-building');
        this.viewRoot = next;
        this.buildingRoot = null;
        previousRenderer?.unload();
        // The board started while hidden; now that it is on screen, size it and fit the map to the stage.
        const renderer = this.boardRenderer as LeafletRenderer | null;
        if (renderer) {
            renderer.invalidateSize();
            window.requestAnimationFrame(() => renderer.fitToImage());
        }
        this.publishPlayerView();
    }

    /** The root being drawn, or the one on screen: where lookups for this render's elements go. */
    private currentRoot(): HTMLElement | null {
        return this.buildingRoot ?? this.viewRoot;
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

        // Campaign: which timeline fork play records into, the in-world date, and whether time moves.
        const calendar = new CalendarRegistry(this.plugin).getActiveCalendar();
        const existingSessions = await this.plugin.listSessions().catch(() => [] as CampaignSession[]);
        const campaigns = knownCampaigns(existingSessions, this.plugin.getTimelineForks(), this.plugin.getTimelineTracks());
        const setup = defaultCampaignSetup(campaigns, this.plugin.getActiveStory()?.name);
        renderCampaignSetupFields(form, setup, campaigns, calendar);

        const startBtn = form.createEl('button', { cls: 'storyteller-campaign-btn is-primary', text: 'Start session' });
        startBtn.addEventListener('click', () => { void (async () => {
            const name = nameInput.value.trim();
            if (!name) { new Notice('Session name is required.'); return; }
            const setupProblem = campaignSetupProblem(setup, calendar);
            if (setupProblem) { new Notice(setupProblem); return; }
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
            await applyCampaignSetup(this.plugin, setup, newSession, calendar);
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
        this.sidebarPartEls.clear();
        this.boardInfo = null;
        this.loadPanelLayout();

        // The board fills the stage; the scene title, tools, choices, combat and quick entry float
        // over it, as on a virtual tabletop. The rail on the right folds down to icons.
        const table = root.createDiv('storyteller-campaign-table');
        const stage = table.createDiv('storyteller-campaign-stage-col');
        stage.setAttribute('data-sts-part', 'table');
        const scenePanel = stage.createDiv('storyteller-campaign-scene-panel');
        await this.renderScenePanel(scenePanel);
        const hasBoard = scenePanel.hasClass('has-board');
        stage.toggleClass('has-board', hasBoard);

        this.renderHud(stage, session);
        if (hasBoard) this.renderToolStrip(stage);
        if (this.currentScene) this.renderPlayPanel(stage, scenePanel);
        if (session.combat) this.renderCombatPanel(stage, session);
        await this.renderQuickBar(stage, session);

        const rail = table.createDiv('storyteller-campaign-sidebar storyteller-campaign-rail' + (this.railCollapsed ? ' is-collapsed' : ''));
        rail.setAttribute('data-sts-part', 'rail');
        this.railEl = rail;
        await this.renderRail(rail, session);
    }

    /**
     * The heads-up display floating over the board: where the party is and has been, the date and
     * who rolls on the left; the player screen, more and End on the right.
     */
    private renderHud(stage: HTMLElement, session: CampaignSession): void {
        const left = stage.createDiv('storyteller-campaign-hud is-left');
        left.setAttribute('data-sts-part', 'hud');
        const titleRow = left.createDiv('storyteller-campaign-hud-row');
        const backBtn = titleRow.createEl('button', { cls: 'storyteller-campaign-hud-btn', attr: { 'aria-label': 'Go back' } });
        setIcon(backBtn, 'arrow-left');
        backBtn.disabled = this.sceneHistory.length === 0;
        backBtn.addEventListener('click', () => { void this.navigateBack(); });

        const trail = titleRow.createDiv('storyteller-campaign-trail');
        for (const name of this.sceneHistory.slice(-2)) {
            const step = trail.createEl('button', { cls: 'storyteller-campaign-trail-step', text: name, attr: { type: 'button' } });
            step.addEventListener('click', () => { void this.doNavigate(name, true); });
            trail.createSpan({ cls: 'storyteller-campaign-trail-sep', text: '›' });
        }
        trail.createSpan({ cls: 'storyteller-campaign-scene-name', text: this.currentScene?.name ?? 'No scene' });
        if (this.currentScene?.filePath) {
            const noteBtn = titleRow.createEl('button', {
                cls: 'storyteller-campaign-hud-btn is-quiet',
                attr: { type: 'button', 'aria-label': 'Open scene note' },
            });
            setIcon(noteBtn, 'file-text');
            noteBtn.addEventListener('click', () => this.openSceneNote());
        }

        const metaRow = left.createDiv('storyteller-campaign-hud-row is-meta');
        this.renderCampaignClock(metaRow, session);
        this.renderActorSelector(metaRow, session);
        if (this.currentScene?.synopsis) {
            left.createDiv({ cls: 'storyteller-campaign-hud-synopsis', text: this.currentScene.synopsis });
        }

        const right = stage.createDiv('storyteller-campaign-hud is-right');
        const playersBtn = right.createEl('button', {
            cls: 'storyteller-campaign-hud-btn storyteller-campaign-players-btn',
            attr: { 'aria-label': 'Player screen' },
        });
        setIcon(playersBtn.createSpan(), 'monitor');
        playersBtn.createSpan({ text: 'Players' });
        playersBtn.addEventListener('click', event => this.openPlayersMenu(event));
        this.decoratePlayersButton(playersBtn);

        const moreBtn = right.createEl('button', { cls: 'storyteller-campaign-hud-btn', attr: { 'aria-label': 'More' } });
        setIcon(moreBtn, 'more-horizontal');
        moreBtn.addEventListener('click', event => {
            const menu = new Menu();
            if (this.currentScene?.filePath) {
                menu.addItem(item => item.setTitle('Open scene note').setIcon('file-text').onClick(() => this.openSceneNote()));
            }
            menu.addItem(item => item.setTitle('Scene graph').setIcon('git-fork').onClick(() => {
                void this.plugin.activateSceneGraphView();
            }));
            menu.addItem(item => item.setTitle('Record a timeline event').setIcon('calendar-plus').onClick(() => {
                this.openSessionTimelineEventModal(session);
            }));
            if (session.filePath) {
                menu.addItem(item => item.setTitle('Open session note').setIcon('scroll').onClick(() => {
                    void this.plugin.app.workspace.openLinkText(session.filePath!, '', 'tab');
                }));
            }
            menu.addSeparator();
            menu.addItem(item => item.setTitle('Reset panel positions').setIcon('layout').onClick(() => {
                this.panelLayout = {};
                this.savePanelLayout();
                void this.render();
            }));
            menu.showAtMouseEvent(event);
        });

        const endBtn = right.createEl('button', { cls: 'storyteller-campaign-hud-btn mod-warning', text: 'End' });
        endBtn.addEventListener('click', () => { void (async () => {
            session.status = 'paused';
            await this.autosave('Session paused.');
            this.session = null;
            this.currentScene = null;
            await this.render();
        })(); });
    }

    // ── Player screen ─────────────────────────────────────────────────────

    /** Sends the players' cut of the game to the player screen. Safe to call often: unchanged views are dropped. */
    private publishPlayerView(): void {
        void this.buildPlayerView()
            .then(view => this.plugin.playerScreen.setView(view))
            .catch(error => console.error('Storyteller Suite: player screen update failed', error));
    }

    /** Board place keys the players have seen: those revealed by the DM or visited, and where the party is now. */
    private seenPlaceKeys(session: CampaignSession): Set<string> {
        const seen = new Set(session.revealedLocations ?? []);
        const here = this.partyPlaceKey();
        if (here) seen.add(here);
        return seen;
    }

    private async buildPlayerView(): Promise<PlayerView | null> {
        const session = this.session;
        if (!session) return null;
        const controls = this.plugin.playerScreen.getState().controls;

        // Arriving somewhere reveals it for good, so the fog stays lifted when the party moves on.
        const here = this.partyPlaceKey();
        if (here) {
            if (!(session.revealedLocations ?? []).includes(here)) {
                session.revealedLocations = [...(session.revealedLocations ?? []), here];
                void this.autosave();
            }
        }
        const seen = this.seenPlaceKeys(session);

        let board: PlayerView['board'];
        let choices: PlayerChoice[] | undefined;
        const info = this.boardInfo;
        if (info) {
            let size = this.boardSizeCache.get(info.imageUrl);
            if (size === undefined) {
                size = await this.getCampaignBoardDimensions(info.map, info.imageUrl);
                this.boardSizeCache.set(info.imageUrl, size);
            }
            if (size) {
                const { width, height } = size;
                const percent = (entry: CampaignBoardLocation) => boardPinPercent(entry.binding.coordinates, width, height);
                board = {
                    name: info.map.name,
                    imageUrl: info.imageUrl,
                    width,
                    height,
                    places: this.boardLocations
                        .filter(entry => seen.has(this.getLocationKey(entry.location)))
                        .map(entry => ({
                            key: this.getLocationKey(entry.location),
                            name: entry.location.name,
                            ...percent(entry),
                            current: this.isCurrentSceneLocation(entry.location),
                        })),
                };
                if (controls.voteOpen) {
                    const here = this.currentBoardLocation();
                    const from = here ? percent(here) : null;
                    choices = this.playerChoices().map(({ branch, number }) => {
                        const there = this.boardLocationForScene(branch.target);
                        if (!there || there === here || !from) return { number, label: branch.label };
                        const key = this.getLocationKey(there.location);
                        if (seen.has(key)) return { number, label: branch.label, toKey: key };
                        // Unseen place: the path heads its way and stops in the fog.
                        const to = percent(there);
                        return { number, label: branch.label, intoFog: { x: from.x + (to.x - from.x) * 0.55, y: from.y + (to.y - from.y) * 0.55 } };
                    });
                }
            }
        }
        if (controls.voteOpen && !choices) {
            choices = this.playerChoices().map(({ branch, number }) => ({ number, label: branch.label }));
        }

        const names = session.partyCharacterNames ?? [];
        const party = names.map(name => {
            const state = (session.partyState ?? []).find(member => this.normalizeName(member.characterName) === this.normalizeName(name));
            return {
                name,
                hp: state?.currentHp,
                maxHp: state?.maxHp,
                conditions: state?.conditions ?? [],
            };
        });

        return {
            sessionName: session.name,
            sceneName: this.currentScene?.name,
            date: session.inWorldDate,
            board,
            party,
            clocks: (session.clocks ?? [])
                .filter(clock => clock.shown)
                .map(clock => ({ name: clock.name, filled: clock.current, segments: clock.segments })),
            choices,
            roll: controls.showRolls && this.lastPlayerRoll ? this.lastPlayerRoll : undefined,
            initiative: session.combat ? this.playerInitiative(session) : undefined,
            ping: this.lastPing ?? undefined,
        };
    }

    /** Turn order as the players see it: hidden combatants left out, monster health in words only. */
    private playerInitiative(session: CampaignSession): PlayerView['initiative'] {
        const combat = session.combat!;
        const order = initiativeOrder(combat);
        return {
            round: combat.round,
            order: order
                .map((c, index) => ({ c, acting: index === combat.turn }))
                .filter(({ c }) => !c.hidden)
                .map(({ c, acting }) => ({
                    name: c.name,
                    isPlayer: c.isPlayer,
                    acting,
                    out: Boolean(c.out),
                    health: c.isPlayer ? undefined : healthWord(c.hp, c.maxHp),
                })),
        };
    }

    /** The choices players may vote on: not hidden, and open right now. Numbered as on the DM's cards. */
    private playerChoices(): Array<{ branch: SceneBranch; number: number }> {
        return this.visibleBranches()
            .map((branch, i) => ({ branch: this.resolveBranchReferences(branch), number: i + 1 }))
            .filter(({ branch }) => this.branchCheck(branch).met);
    }

    /** Shows a roll on the player screen, if the DM lets players see rolls. */
    private showRollToPlayers(title: string, total: number, result: string): void {
        this.lastPlayerRoll = { title, total, result, at: Date.now() };
        this.publishPlayerView();
    }

    private setPlayerControls(controls: Partial<PlayerScreenControls>): void {
        this.plugin.playerScreen.setControls(controls);
        this.publishPlayerView();
        this.refreshPlayersButton();
    }

    /** Reveals a board place to the players, or hides it again. */
    private toggleRevealedPlace(location: Location): void {
        const session = this.session;
        if (!session) return;
        const key = this.getLocationKey(location);
        const revealed = new Set(session.revealedLocations ?? []);
        if (revealed.has(key)) revealed.delete(key);
        else revealed.add(key);
        session.revealedLocations = Array.from(revealed);
        void this.autosave(revealed.has(key) ? `Revealed to players: ${location.name}` : `Hidden from players: ${location.name}`);
        this.publishPlayerView();
    }

    private openSceneNote(): void {
        if (this.currentScene?.filePath) {
            void this.plugin.app.workspace.openLinkText(this.currentScene.filePath, '', 'tab');
        }
    }

    private openPlayersMenu(event: MouseEvent): void {
        const { controls } = this.plugin.playerScreen.getState();
        const menu = new Menu();
        menu.addItem(item => item.setTitle('Open player screen').setIcon('monitor').onClick(() => {
            void this.plugin.openPlayerScreen();
        }));
        menu.addSeparator();
        const modes: Array<[PlayerScreenMode, string, string]> = [
            ['board', 'Show the board', 'map'],
            ['scene', 'Show the scene only', 'image'],
            ['blank', 'Blank the screen', 'eye-off'],
        ];
        for (const [mode, title, icon] of modes) {
            menu.addItem(item => item.setTitle(title).setIcon(icon).setChecked(controls.mode === mode).onClick(() => {
                this.setPlayerControls({ mode });
            }));
        }
        menu.addSeparator();
        menu.addItem(item => item
            .setTitle(controls.voteOpen ? 'Close the vote' : 'Open a vote on the choices')
            .setIcon('vote')
            .onClick(() => {
                this.setPlayerControls({ voteOpen: !controls.voteOpen });
                void this.autosave(controls.voteOpen ? 'Vote closed.' : 'Vote opened on the choices.');
            }));
        menu.addItem(item => item.setTitle('Show rolls to players').setIcon('dices').setChecked(controls.showRolls).onClick(() => {
            this.setPlayerControls({ showRolls: !controls.showRolls });
        }));
        const first = this.readSections.find(section => READ_ALOUD_HEADING.test(section.heading)) ?? this.readSections[0];
        if (first) {
            menu.addItem(item => item.setTitle(`Show "${first.heading}"`).setIcon('send').onClick(() => {
                this.pushReadSection(first, 'popup');
            }));
        }
        menu.addSeparator();
        menu.addItem(item => item.setTitle('Clear pushed text').setIcon('eraser').onClick(() => {
            this.plugin.playerScreen.clear();
            new Notice('Pushed text cleared');
            this.refreshPlayersButton();
            void this.refreshSidebarPart('read');
        }));
        menu.showAtMouseEvent(event);
    }

    // ── Floating panels ───────────────────────────────────────────────────

    private loadPanelLayout(): void {
        try {
            const saved = this.app.loadLocalStorage(PANEL_LAYOUT_KEY) as PanelLayout | null;
            this.panelLayout = saved && typeof saved === 'object' ? saved : {};
        } catch {
            this.panelLayout = {};
        }
        this.railCollapsed = Boolean(this.panelLayout.railCollapsed);
        if (this.panelLayout.railTab && RAIL_TABS.some(tab => tab.id === this.panelLayout.railTab)) {
            this.railTab = this.panelLayout.railTab;
        }
    }

    private savePanelLayout(): void {
        this.panelLayout = { ...this.panelLayout, railCollapsed: this.railCollapsed, railTab: this.railTab };
        try { this.app.saveLocalStorage(PANEL_LAYOUT_KEY, this.panelLayout); } catch { /* not saved: positions reset next time */ }
    }

    /**
     * A panel floating over the board, dragged by its header and folded by its button, like the
     * tool bubbles on Owlbear Rodeo. Where it was left and whether it was folded are remembered.
     */
    private createFloatingPanel(
        stage: HTMLElement,
        id: FloatingPanelId,
        title: string,
        icon: string,
        extraHeader?: (header: HTMLElement) => void,
    ): HTMLElement {
        const saved = this.panelLayout[id];
        const panel = stage.createDiv(`storyteller-campaign-float is-${id}` + (saved?.collapsed ? ' is-collapsed' : ''));
        panel.setAttribute('data-sts-part', `${id}-panel`);
        if (saved?.x !== undefined && saved.y !== undefined) {
            panel.addClass('is-placed');
            panel.setCssStyles({ left: `${saved.x}px`, top: `${saved.y}px` });
        }
        const header = panel.createDiv('storyteller-campaign-float-header');
        setIcon(header.createSpan({ cls: 'storyteller-campaign-float-grip' }), 'grip-vertical');
        setIcon(header.createSpan({ cls: 'storyteller-campaign-float-icon' }), icon);
        header.createSpan({ cls: 'storyteller-campaign-float-title', text: title });
        extraHeader?.(header);
        const fold = header.createEl('button', {
            cls: 'storyteller-campaign-float-fold',
            attr: { type: 'button', 'aria-label': saved?.collapsed ? `Open ${title}` : `Fold ${title}` },
        });
        setIcon(fold, saved?.collapsed ? 'chevron-up' : 'chevron-down');
        fold.addEventListener('click', event => {
            event.stopPropagation();
            const collapsed = !panel.hasClass('is-collapsed');
            panel.toggleClass('is-collapsed', collapsed);
            setIcon(fold, collapsed ? 'chevron-up' : 'chevron-down');
            this.panelLayout[id] = { ...(this.panelLayout[id] ?? {}), collapsed: collapsed || undefined };
            this.savePanelLayout();
        });

        header.addEventListener('pointerdown', event => {
            if ((event.target as HTMLElement).closest('button, input, select')) return;
            event.preventDefault();
            const stageRect = stage.getBoundingClientRect();
            const rect = panel.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            const win = stage.ownerDocument.defaultView ?? window;
            const move = (e: PointerEvent) => {
                const x = Math.max(0, Math.min(stageRect.width - rect.width, e.clientX - stageRect.left - offsetX));
                const y = Math.max(0, Math.min(stageRect.height - 40, e.clientY - stageRect.top - offsetY));
                panel.addClass('is-placed');
                panel.setCssStyles({ left: `${x}px`, top: `${y}px` });
            };
            const up = () => {
                win.removeEventListener('pointermove', move);
                win.removeEventListener('pointerup', up);
                if (!panel.hasClass('is-placed')) return;
                this.panelLayout[id] = {
                    x: Math.round(parseFloat(panel.style.left) || 0),
                    y: Math.round(parseFloat(panel.style.top) || 0),
                    collapsed: panel.hasClass('is-collapsed') || undefined,
                };
                this.savePanelLayout();
            };
            win.addEventListener('pointermove', move);
            win.addEventListener('pointerup', up);
        });
        return panel.createDiv('storyteller-campaign-float-body');
    }

    /** Choices and the encounter in one floating panel over the board, numbered as on the map. */
    private renderPlayPanel(stage: HTMLElement, scenePanel: HTMLElement): void {
        const choices = this.visibleBranches();
        const table = this.rollableEncounterTable();
        const body = this.createFloatingPanel(stage, 'play', 'Choices', 'git-branch', header => {
            if (choices.length > 0) header.createSpan({ cls: 'storyteller-campaign-float-count', text: String(choices.length) });
            if (table) header.createSpan({ cls: 'storyteller-campaign-float-tag', text: `Encounter ${table.dice}` });
        });
        this.renderPlayChoices(body, scenePanel);
        this.renderPlayEncounter(body);
    }

    // ── Map tools ─────────────────────────────────────────────────────────

    /** The tool strip on the left of the board: inspect, move the party, reveal, ping, roll, combat. */
    private renderToolStrip(stage: HTMLElement): void {
        const strip = stage.createDiv('storyteller-campaign-tools');
        strip.setAttribute('data-sts-part', 'tools');
        const tools: Array<[BoardTool, string, string]> = [
            ['inspect', 'mouse-pointer-2', 'Inspect places'],
            ['move', 'footprints', 'Move the party: click a place'],
            ['reveal', 'eye', 'Reveal or hide places for the players'],
            ['ping', 'locate', 'Ping the map for everyone'],
        ];
        for (const [tool, icon, label] of tools) {
            const button = strip.createEl('button', {
                cls: 'storyteller-campaign-tool' + (this.boardTool === tool ? ' is-active' : ''),
                attr: { type: 'button', 'aria-label': label, 'aria-pressed': String(this.boardTool === tool) },
            });
            setIcon(button, icon);
            button.addEventListener('click', () => this.setBoardTool(tool));
        }
        strip.createDiv('storyteller-campaign-tools-sep');
        if (this.rollableEncounterTable()) {
            const rollBtn = strip.createEl('button', { cls: 'storyteller-campaign-tool', attr: { type: 'button', 'aria-label': 'Roll the encounter' } });
            setIcon(rollBtn, 'dices');
            rollBtn.addEventListener('click', () => { void this.rollManualEncounter(); });
        }
        const combatBtn = strip.createEl('button', {
            cls: 'storyteller-campaign-tool' + (this.session?.combat ? ' is-active' : ''),
            attr: { type: 'button', 'aria-label': this.session?.combat ? 'Combat is on' : 'Start combat' },
        });
        setIcon(combatBtn, 'swords');
        combatBtn.addEventListener('click', () => {
            if (this.session?.combat) new Notice('Combat is on: use the turn order panel.');
            else void this.beginCombat();
        });
    }

    private setBoardTool(tool: BoardTool): void {
        this.boardTool = tool;
        const root = this.currentRoot();
        root?.querySelectorAll<HTMLElement>('.storyteller-campaign-tools .storyteller-campaign-tool').forEach((button, index) => {
            if (index > 3) return;
            const active = ['inspect', 'move', 'reveal', 'ping'][index] === tool;
            button.toggleClass('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        root?.querySelectorAll<HTMLElement>('.storyteller-campaign-board-map, .storyteller-campaign-board-stage')
            .forEach(el => el.toggleClass('is-ping-tool', tool === 'ping'));
        const hints: Record<BoardTool, string | null> = {
            inspect: null,
            move: 'Click a place to move the party there.',
            reveal: 'Click places to reveal or hide them for the players.',
            ping: 'Click the map to ping it on every screen.',
        };
        if (hints[tool]) new Notice(hints[tool]!);
    }

    /** A pin click while a map tool is active. Returns true when the tool used the click. */
    private handlePinWithTool(location: Location): boolean {
        switch (this.boardTool) {
            case 'move':
                this.moveParty(location);
                return true;
            case 'reveal':
                this.toggleRevealedPlace(location);
                new Notice(this.seenPlaceKeys(this.session!).has(this.getLocationKey(location)) ? `Revealed: ${location.name}` : `Hidden: ${location.name}`);
                return true;
            case 'ping': {
                const entry = this.boardLocations.find(candidate => this.getLocationKey(candidate.location) === this.getLocationKey(location));
                const size = this.boardInfo ? this.boardSizeCache.get(this.boardInfo.imageUrl) : null;
                if (entry && size) {
                    const { x, y } = boardPinPercent(entry.binding.coordinates, size.width, size.height);
                    this.sendPing(x, y);
                }
                return true;
            }
            default:
                return false;
        }
    }

    /**
     * Moves the party token. A place with one scene enters it; with several, the DM picks one or
     * just moves the token; with none, the token moves and the scene stays as it is.
     */
    private moveParty(location: Location): void {
        const session = this.session;
        if (!session) return;
        const key = this.getLocationKey(location);
        const entry = this.boardLocations.find(candidate => this.getLocationKey(candidate.location) === key);
        const scenes = (entry?.scenes ?? []).filter(scene => scene.name !== this.currentScene?.name);
        const justMove = () => {
            session.partyLocation = key === (this.locationData ? this.getLocationKey(this.locationData) : null) ? undefined : key;
            void (async () => {
                await this.autosave(`Party moved to *${location.name}*`);
                await this.render();
            })();
        };
        if (scenes.length === 1) {
            void this.doNavigate(scenes[0].name, true);
            return;
        }
        if (scenes.length > 1) {
            const menu = new Menu();
            for (const scene of scenes) {
                menu.addItem(item => item.setTitle(`Enter ${scene.name}`).setIcon('log-in').onClick(() => { void this.doNavigate(scene.name, true); }));
            }
            menu.addSeparator();
            menu.addItem(item => item.setTitle('Just move the party here').setIcon('footprints').onClick(justMove));
            const anchor = this.currentRoot()?.querySelector<HTMLElement>('.storyteller-campaign-tools');
            const rect = anchor?.getBoundingClientRect();
            menu.showAtPosition({ x: (rect?.right ?? 200) + 8, y: rect?.top ?? 200 });
            return;
        }
        justMove();
    }

    /** Pings a spot on the board: a pulse on the DM's map and on the player screen. */
    private sendPing(x: number, y: number): void {
        this.lastPing = { x, y, at: Date.now() };
        this.publishPlayerView();
        const root = this.currentRoot();
        const canvas = root?.querySelector<HTMLElement>('.storyteller-campaign-board-canvas');
        if (!canvas) return;
        const map = this.boardRenderer?.getMap();
        if (map) {
            const bounds = this.boardRenderer?.getImageBounds();
            if (!bounds) return;
            const height = bounds.getNorth();
            const width = bounds.getEast();
            const marker = L.marker([height - (y / 100) * height, (x / 100) * width], {
                icon: L.divIcon({ className: 'storyteller-campaign-ping', html: '<span></span><span></span>', iconSize: [60, 60], iconAnchor: [30, 30] }),
                interactive: false,
                keyboard: false,
                zIndexOffset: 2000,
            }).addTo(map);
            window.setTimeout(() => marker.remove(), 3200);
            return;
        }
        const stage = canvas.querySelector<HTMLElement>('.storyteller-campaign-board-stage');
        if (!stage) return;
        const pulse = stage.createDiv({ cls: 'storyteller-campaign-ping is-static' });
        pulse.createSpan();
        pulse.createSpan();
        pulse.setCssStyles({ left: `${x}%`, top: `${y}%` });
        window.setTimeout(() => pulse.remove(), 3200);
    }

    /** The party token's menu: each member's HP, the Party tab, and moving the party. */
    private openPartyMenu(event: MouseEvent): void {
        const session = this.session;
        if (!session) return;
        const menu = new Menu();
        for (const name of session.partyCharacterNames ?? []) {
            const state = (session.partyState ?? []).find(member => this.normalizeName(member.characterName) === this.normalizeName(name));
            const hp = state ? ` ${state.currentHp}/${state.maxHp}` : '';
            menu.addItem(item => item.setTitle(`${name}${hp}: damage or heal…`).setIcon('heart').onClick(() => {
                new PromptModal(this.app, {
                    title: `${name}: damage or heal`,
                    label: 'Damage (use a minus sign to heal, like -5)',
                    defaultValue: '',
                    validator: value => (/^-?\d+$/.test(value.trim()) ? null : 'Type a number, like 7 or -5.'),
                    onSubmit: value => { void this.changePartyHp(name, -parseInt(value.trim(), 10)); },
                }).open();
            }));
        }
        menu.addSeparator();
        menu.addItem(item => item.setTitle('Move the party…').setIcon('footprints').onClick(() => this.setBoardTool('move')));
        menu.addItem(item => item.setTitle('Show party details').setIcon('users').onClick(() => {
            this.railTab = 'party';
            this.railCollapsed = false;
            this.savePanelLayout();
            if (this.railEl) void this.renderRail(this.railEl, session);
        }));
        menu.showAtMouseEvent(event);
    }

    /** Changes a party member's HP from anywhere (party token, combat panel), logs it and updates every screen. */
    private async changePartyHp(name: string, delta: number): Promise<void> {
        const session = this.session;
        if (!session || !delta) return;
        const state = this.ensureSessionPartyState(session, name);
        if (!state) return;
        const before = state.currentHp;
        state.currentHp = Math.max(0, Math.min(state.maxHp, state.currentHp + delta));
        if (state.currentHp === before) return;
        const change = state.currentHp - before;
        await this.autosave(`${name} ${change < 0 ? 'takes' : 'heals'} ${Math.abs(change)} (${state.currentHp}/${state.maxHp})`);
        await this.refreshSidebarPart('party');
        this.refreshCombatPanel();
        this.publishPlayerView();
    }

    // ── Combat ────────────────────────────────────────────────────────────

    /** Starts a fight: the party rolls initiative (d20 + DEX), and the encounter just rolled joins. */
    private async beginCombat(): Promise<void> {
        const session = this.session;
        if (!session || session.combat) return;
        const entries: NewCombatant[] = (session.partyCharacterNames ?? []).map(name => {
            const stats = this.getCharacterStateByName(name);
            const dex = statModifier(Number(stats?.dndDex ?? 10));
            return { name, initiative: roll('d20') + dex, isPlayer: true };
        });
        const encounter = this.lastEncounter && this.lastEncounter.sceneName === this.currentScene?.name ? this.lastEncounter : null;
        if (encounter) entries.push({ name: encounter.row.label, initiative: roll('d20'), isPlayer: false });
        session.combat = startCombat(entries);
        const order = initiativeOrder(session.combat).map(c => `${c.name} ${c.initiative}`).join(', ');
        await this.autosave(`Combat started (round 1): ${order}`);
        await this.render();
    }

    private async endCombat(): Promise<void> {
        const session = this.session;
        if (!session?.combat) return;
        const rounds = session.combat.round;
        session.combat = undefined;
        await this.autosave(`Combat ended after ${rounds} round${rounds === 1 ? '' : 's'}.`);
        await this.render();
    }

    /** Saves a change to the fight and redraws the combat panel and the player screen. */
    private async updateCombat(next: CombatState, logLine?: string): Promise<void> {
        const session = this.session;
        if (!session) return;
        session.combat = next;
        await this.autosave(logLine);
        this.refreshCombatPanel();
        this.publishPlayerView();
    }

    private refreshCombatPanel(): void {
        const session = this.session;
        const panel = this.currentRoot()?.querySelector<HTMLElement>('.storyteller-campaign-float.is-combat .storyteller-campaign-float-body');
        if (!session?.combat || !panel) return;
        panel.empty();
        this.fillCombatPanel(panel, session);
        const title = panel.parentElement?.querySelector('.storyteller-campaign-float-title');
        if (title) title.setText(`Round ${session.combat.round}`);
    }

    private renderCombatPanel(stage: HTMLElement, session: CampaignSession): void {
        const body = this.createFloatingPanel(stage, 'combat', `Round ${session.combat!.round}`, 'swords');
        this.fillCombatPanel(body, session);
    }

    /** The turn order: who acts, initiative, HP, and controls for turns, damage and joining the fight. */
    private fillCombatPanel(body: HTMLElement, session: CampaignSession): void {
        const combat = session.combat!;
        const order = initiativeOrder(combat);
        const turnBar = body.createDiv('storyteller-campaign-combat-turns');
        const prev = turnBar.createEl('button', { attr: { type: 'button', 'aria-label': 'Previous turn' } });
        setIcon(prev, 'chevron-left');
        prev.addEventListener('click', () => { void this.updateCombat(previousTurn(combat)); });
        const acting = order[combat.turn];
        turnBar.createSpan({ cls: 'storyteller-campaign-combat-acting', text: acting ? `${acting.name}'s turn` : 'No one' });
        const next = turnBar.createEl('button', { cls: 'mod-cta', attr: { type: 'button', 'aria-label': 'Next turn' } });
        next.createSpan({ text: 'Next' });
        setIcon(next.createSpan(), 'chevron-right');
        next.addEventListener('click', () => {
            const after = nextTurn(combat);
            void this.updateCombat(after, after.round !== combat.round ? `Round ${after.round}` : undefined);
        });

        const list = body.createDiv('storyteller-campaign-combat-list');
        order.forEach((c, index) => {
            const row = list.createDiv('storyteller-campaign-combat-row'
                + (index === combat.turn ? ' is-acting' : '')
                + (c.isPlayer ? ' is-player' : '')
                + (c.out ? ' is-out' : '')
                + (c.hidden ? ' is-hidden' : ''));
            const init = row.createEl('input', {
                cls: 'storyteller-campaign-combat-init',
                attr: { type: 'number', value: String(c.initiative), 'aria-label': `${c.name} initiative` },
            });
            init.addEventListener('change', () => {
                const value = parseInt(init.value, 10);
                if (Number.isFinite(value)) void this.updateCombat(updateCombatant(combat, c.id, { initiative: value }));
            });
            const main = row.createDiv('storyteller-campaign-combat-main');
            main.createSpan({ cls: 'storyteller-campaign-combat-name', text: c.name });
            const partyState = c.isPlayer
                ? (session.partyState ?? []).find(member => this.normalizeName(member.characterName) === this.normalizeName(c.name))
                : undefined;
            const hp = c.isPlayer ? partyState?.currentHp : c.hp;
            const maxHp = c.isPlayer ? partyState?.maxHp : c.maxHp;
            const conditions = c.isPlayer ? partyState?.conditions ?? [] : c.conditions ?? [];
            if (conditions.length) main.createSpan({ cls: 'storyteller-campaign-combat-conditions', text: conditions.join(', ') });

            const hpBox = row.createDiv('storyteller-campaign-combat-hp');
            if (hp !== undefined && maxHp) {
                hpBox.createSpan({ cls: 'storyteller-campaign-combat-hp-text', text: `${hp}/${maxHp}` });
            } else if (!c.isPlayer) {
                const setHp = hpBox.createEl('button', { cls: 'storyteller-campaign-combat-mini', text: 'HP', attr: { type: 'button', 'aria-label': `Set ${c.name} HP` } });
                setHp.addEventListener('click', () => {
                    new PromptModal(this.app, {
                        title: `${c.name}: hit points`,
                        label: 'Hit points',
                        defaultValue: '',
                        validator: value => (/^\d+$/.test(value.trim()) ? null : 'Type a number.'),
                        onSubmit: value => {
                            const n = parseInt(value.trim(), 10);
                            void this.updateCombat(updateCombatant(combat, c.id, { hp: n, maxHp: n }));
                        },
                    }).open();
                });
            }
            if (hp !== undefined) {
                const amount = hpBox.createEl('input', {
                    cls: 'storyteller-campaign-combat-amount',
                    attr: { type: 'number', min: '1', placeholder: '5', 'aria-label': `Amount for ${c.name}` },
                });
                const apply = (sign: number) => {
                    const n = parseInt(amount.value, 10) || 1;
                    if (c.isPlayer) void this.changePartyHp(c.name, -sign * n);
                    else void this.updateCombat(damageCombatant(combat, c.id, sign * n), `${c.name} ${sign > 0 ? 'takes' : 'heals'} ${n}`);
                };
                const hit = hpBox.createEl('button', { cls: 'storyteller-campaign-combat-mini is-damage', text: '−', attr: { type: 'button', 'aria-label': `Damage ${c.name}` } });
                hit.addEventListener('click', () => apply(1));
                const heal = hpBox.createEl('button', { cls: 'storyteller-campaign-combat-mini is-heal', text: '+', attr: { type: 'button', 'aria-label': `Heal ${c.name}` } });
                heal.addEventListener('click', () => apply(-1));
            }

            const more = row.createEl('button', { cls: 'storyteller-campaign-combat-mini', attr: { type: 'button', 'aria-label': `More for ${c.name}` } });
            setIcon(more, 'more-vertical');
            more.addEventListener('click', event => {
                const menu = new Menu();
                menu.addItem(item => item.setTitle(c.out ? 'Back in the fight' : 'Out of the fight').setIcon(c.out ? 'heart-pulse' : 'skull').onClick(() => {
                    void this.updateCombat(updateCombatant(combat, c.id, { out: c.out ? undefined : true }), `${c.name} ${c.out ? 'is back in the fight' : 'is out of the fight'}`);
                }));
                if (!c.isPlayer) {
                    menu.addItem(item => item.setTitle(c.hidden ? 'Show to players' : 'Hide from players').setIcon(c.hidden ? 'eye' : 'eye-off').onClick(() => {
                        void this.updateCombat(updateCombatant(combat, c.id, { hidden: c.hidden ? undefined : true }));
                    }));
                    menu.addItem(item => item.setTitle('Add a condition…').setIcon('sparkles').onClick(() => {
                        new PromptModal(this.app, {
                            title: `${c.name}: condition`,
                            label: 'Condition',
                            defaultValue: '',
                            onSubmit: value => {
                                const condition = value.trim();
                                if (condition) void this.updateCombat(updateCombatant(combat, c.id, { conditions: [...(c.conditions ?? []), condition] }), `${c.name} is ${condition}`);
                            },
                        }).open();
                    }));
                    if ((c.conditions ?? []).length) {
                        menu.addItem(item => item.setTitle('Clear conditions').setIcon('eraser').onClick(() => {
                            void this.updateCombat(updateCombatant(combat, c.id, { conditions: [] }));
                        }));
                    }
                }
                menu.addSeparator();
                menu.addItem(item => item.setTitle('Remove from the fight').setIcon('x').onClick(() => {
                    void this.updateCombat(removeCombatant(combat, c.id), `${c.name} leaves the fight`);
                }));
                menu.showAtMouseEvent(event);
            });
        });

        const add = body.createDiv('storyteller-campaign-combat-add');
        const input = add.createEl('input', {
            cls: 'storyteller-campaign-input is-small',
            attr: { type: 'text', placeholder: 'Goblin x3 hp 7', 'aria-label': 'Add to the fight, like goblin x3 hp 7' },
        });
        const addBtn = add.createEl('button', { text: 'Add', attr: { type: 'button' } });
        const submit = () => {
            const parsed = parseCombatantInput(input.value);
            if (!parsed) return;
            const entries: NewCombatant[] = Array.from({ length: parsed.count }, () => ({
                name: parsed.name,
                initiative: parsed.initiative ?? roll('d20'),
                isPlayer: false,
                hp: parsed.hp,
            }));
            void this.updateCombat(addCombatants(combat, entries), `${parsed.count > 1 ? `${parsed.count} × ` : ''}${parsed.name} join${parsed.count > 1 ? '' : 's'} the fight`);
        };
        addBtn.addEventListener('click', submit);
        input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
        const end = add.createEl('button', { cls: 'mod-warning', text: 'End', attr: { type: 'button', 'aria-label': 'End combat' } });
        end.addEventListener('click', () => { void this.endCombat(); });
    }

    // ── Rail: Read, Party, Progress and World tabs ───────────────────────

    private async renderRail(rail: HTMLElement, session: CampaignSession): Promise<void> {
        rail.empty();
        rail.toggleClass('is-collapsed', this.railCollapsed);
        const tabs = rail.createDiv('storyteller-campaign-rail-tabs');
        tabs.setAttribute('role', 'tablist');
        for (const tab of RAIL_TABS) {
            const active = tab.id === this.railTab && !this.railCollapsed;
            const button = tabs.createEl('button', {
                cls: 'storyteller-campaign-rail-tab' + (active ? ' is-active' : ''),
                attr: { type: 'button', role: 'tab', 'aria-selected': String(active), 'aria-label': tab.label },
            });
            setIcon(button.createSpan(), tab.icon);
            button.createSpan({ cls: 'storyteller-campaign-rail-tab-label', text: tab.label });
            button.addEventListener('click', () => {
                if (this.railTab === tab.id && !this.railCollapsed) return;
                this.railTab = tab.id;
                this.railCollapsed = false;
                this.savePanelLayout();
                void this.renderRail(rail, session);
            });
        }
        const fold = tabs.createEl('button', {
            cls: 'storyteller-campaign-rail-fold',
            attr: { type: 'button', 'aria-label': this.railCollapsed ? 'Open the side panel' : 'Fold the side panel' },
        });
        setIcon(fold, this.railCollapsed ? 'panel-right-open' : 'panel-right-close');
        fold.addEventListener('click', () => {
            this.railCollapsed = !this.railCollapsed;
            this.savePanelLayout();
            void this.renderRail(rail, session);
        });

        for (const part of ['read', 'party', 'progress', 'standings'] as const) this.sidebarPartEls.delete(part);
        if (this.railCollapsed) return;
        const body = rail.createDiv('storyteller-campaign-rail-body');
        switch (this.railTab) {
            case 'read':
                await this.renderReadSidebar(body, session);
                break;
            case 'party':
                this.renderPartySidebar(body, session);
                await this.renderInventorySidebar(body, session);
                break;
            case 'progress':
                this.renderProgressSidebar(body, session);
                break;
            case 'world':
                this.renderGroupStandingsSidebar(body, session);
                await this.renderLoreSidebar(body, session);
                break;
            case 'log':
                await this.renderLogTab(body, session);
                break;
        }
        if (!body.hasChildNodes()) {
            body.createDiv({
                cls: 'storyteller-campaign-empty-text storyteller-campaign-rail-empty',
                text: this.railTab === 'world'
                    ? 'No faction standings or lore yet. They appear here once a choice or item changes them.'
                    : 'Nothing here yet.',
            });
        }
    }

    // â”€â”€ Scene panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private async renderScenePanel(panel: HTMLElement): Promise<void> {
        panel.empty();
        panel.setAttribute('data-sts-part', 'stage');

        if (!this.currentScene) {
            this.readSections = [];
            panel.createEl('p', { cls: 'storyteller-campaign-empty', text: 'No scene loaded.' });
            await this.renderScenePicker(panel);
            return;
        }
        this.readSections = await this.loadReadSections(this.currentScene);

        // The map is the board. Without one, the scene's own text takes its place.
        const hasBoard = await this.renderCampaignBoard(panel);
        panel.toggleClass('has-board', hasBoard);
        if (!hasBoard) {
            const clean = stripPlayBlocks(this.sceneBody);
            if (clean) {
                const bodyEl = panel.createDiv('storyteller-campaign-scene-body');
                if (this.currentScene.synopsis) bodyEl.createEl('p', { cls: 'storyteller-campaign-synopsis', text: this.currentScene.synopsis });
                await MarkdownRenderer.render(this.plugin.app, clean, bodyEl, this.currentScene.filePath ?? '', this);
            }
        }

    }

    /** The choices that are not hidden, in the order they are numbered on the board and in the list. */
    private visibleBranches(): SceneBranch[] {
        return this.branches.filter(branch => !branch.hidden);
    }

    private renderPlayChoices(row: HTMLElement, panel: HTMLElement): void {
        const box = row.createDiv('storyteller-campaign-choices');
        box.setAttribute('data-sts-part', 'choices');
        const header = box.createDiv('storyteller-campaign-branch-header');
        setIcon(header.createSpan(), 'git-branch');
        header.createSpan({ text: 'Choices' });
        const branches = this.visibleBranches();
        if (branches.length === 0) {
            const dead = box.createDiv('storyteller-campaign-dead-end');
            setIcon(dead.createSpan(), 'flag');
            dead.createSpan({ text: 'End of scene.' });
            return;
        }
        const list = box.createDiv('storyteller-campaign-branch-list');
        branches.forEach((branch, i) => this.renderPlayBranchCard(list, branch, panel, i + 1));
    }

    /** The quick entry bar along the bottom of the board, with the latest log line. */
    private async renderQuickBar(stage: HTMLElement, session: CampaignSession): Promise<void> {
        const bar = stage.createDiv('storyteller-campaign-quickbar');
        bar.setAttribute('data-sts-part', 'quick-bar');
        await this.fillQuickBar(bar, session);
        this.sidebarPartEls.set('log', bar);
    }

    private async fillQuickBar(bar: HTMLElement, session: CampaignSession): Promise<void> {
        bar.empty();
        this.renderQuickEntry(bar, session);
        const last = bar.createDiv('storyteller-campaign-quickbar-last');
        const lines = await this.recentLogLines(session, 1);
        last.setText(lines[0] ?? (session.filePath ? 'No entries yet.' : 'Not yet saved. The first entry creates the session note.'));
        last.addEventListener('click', () => {
            this.railTab = 'log';
            this.railCollapsed = false;
            this.savePanelLayout();
            if (this.railEl && this.session) {
                this.railEl.removeClass('is-collapsed');
                void this.renderRail(this.railEl, this.session);
            }
        });
    }

    private async recentLogLines(session: CampaignSession, count: number): Promise<string[]> {
        if (!session.filePath) return [];
        let log = '';
        try { log = await this.plugin.loadSessionLog(session.filePath); } catch { /* ignore */ }
        return log.split('\n').filter(Boolean).slice(-count).map(line => line.replace(/^- /, ''));
    }

    /** The Log tab: session header, end and interlude, the next scene's kind, and the recent log. */
    private async renderLogTab(body: HTMLElement, session: CampaignSession): Promise<void> {
        const sec = body.createDiv('storyteller-campaign-sidebar-section storyteller-campaign-log-tab');
        const hdr = sec.createDiv('storyteller-campaign-sidebar-hdr');
        setIcon(hdr.createSpan(), 'scroll');
        hdr.createSpan({ text: ' Session log' });
        const actions = hdr.createDiv('storyteller-campaign-progress-actions');
        this.addLogHeaderButton(actions, 'file-text', 'Session header', () => { void this.openSessionHeaderModal(); });
        this.addLogHeaderButton(actions, 'flag', 'End of session', () => { this.openSessionEndModal(); });
        this.addLogHeaderButton(actions, 'hourglass', 'Interlude', () => { this.openInterludeModal(); });
        const kind = sec.createDiv('storyteller-campaign-log-kind');
        kind.createSpan({ text: 'Next scene header' });
        this.renderSceneKindControl(kind);
        const list = sec.createDiv('storyteller-campaign-log-list is-expanded');
        const lines = await this.recentLogLines(session, 60);
        if (lines.length === 0) {
            list.createDiv({ cls: 'storyteller-campaign-empty-text', text: session.filePath ? 'No entries yet.' : 'Not yet saved. The first entry creates the session note.' });
            return;
        }
        for (const line of lines) list.createDiv({ cls: 'storyteller-campaign-log-entry', text: line });
        window.requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
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

    /** Draws the campaign board. Returns false when this scene has no board to show. */
    private async renderCampaignBoard(panel: HTMLElement): Promise<boolean> {
        if (!this.session || !this.currentScene) return false;

        const token = this.boardRenderToken;
        const maps = await this.plugin.listMaps().catch(() => [] as StoryMap[]);
        const boardMap = await this.resolveCampaignBoardMap(maps);
        if (!boardMap) return false;
        if (token !== this.boardRenderToken) return true;

        const mapId = boardMap.id || boardMap.name;
        const boardEl = panel.createDiv('storyteller-campaign-board');
        boardEl.setAttribute('data-sts-part', 'board');

        const header = boardEl.createDiv('storyteller-campaign-board-header');
        setIcon(header.createSpan({ cls: 'storyteller-campaign-board-icon' }), 'map');
        header.createSpan({ cls: 'storyteller-campaign-board-title', text: boardMap.name });
        const sceneOverride = this.mapReferenceMatches(this.currentScene.campaignBoardMapId, boardMap);
        header.createSpan({
            cls: 'storyteller-campaign-board-meta',
            text: sceneOverride ? 'Scene board' : this.locationData ? `At ${this.locationData.name}` : 'Session board',
        });

        const relatedMaps = [
            boardMap.parentMapId,
            ...(boardMap.childMapIds ?? []),
        ]
            .map(id => this.findMapByRef(id, maps))
            .filter((candidate): candidate is StoryMap => Boolean(candidate));
        if (relatedMaps.length > 0) {
            const nav = header.createDiv('storyteller-campaign-board-nav');
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

        if (boardMap.filePath) {
            const mapBtn = header.createEl('button', {
                cls: 'clickable-icon storyteller-campaign-board-open',
                attr: { type: 'button', 'aria-label': 'Open map note' },
            });
            setIcon(mapBtn, 'external-link');
            mapBtn.addEventListener('click', () => {
                if (boardMap.filePath) {
                    void this.plugin.app.workspace.openLinkText(boardMap.filePath, '', 'tab');
                }
            });
        }

        const imageUrl = this.getMapImageUrl(boardMap);
        if (!imageUrl) {
            boardEl.createDiv({
                cls: 'storyteller-campaign-board-empty',
                text: 'This board has no image yet. Add a background image to the map note to use it in Campaign mode.',
            });
            return false;
        }

        const locations = await this.collectBoardLocations(boardMap);
        if (token !== this.boardRenderToken) return true;
        this.boardLocations = locations;
        this.boardInfo = { map: boardMap, imageUrl };

        const canvas = boardEl.createDiv('storyteller-campaign-board-canvas');
        const mountedLeaflet = await this.renderLeafletCampaignBoard(canvas, boardMap, imageUrl, locations, token);
        if (!mountedLeaflet) {
            await this.renderStaticCampaignBoard(canvas, boardMap, imageUrl, locations);
        }
        if (locations.length === 0) {
            boardEl.createDiv({
                cls: 'storyteller-campaign-board-caption',
                text: 'No locations are placed on this board yet. Place them in the map view to move the party on it.',
            });
        }
        return true;
    }

    /** Where a choice leads on the board: the location of its target scene, if that is on this board. */
    private boardLocationForScene(sceneRef: string | undefined): CampaignBoardLocation | null {
        if (!sceneRef) return null;
        const scene = this.resolveSceneReference(sceneRef);
        const name = this.normalizeName(scene?.name ?? sceneRef);
        const byScene = this.boardLocations.find(entry => entry.scenes.some(candidate => this.normalizeName(candidate.name) === name));
        if (byScene) return byScene;
        const locationRef = scene?.linkedLocations?.[0];
        return locationRef
            ? this.boardLocations.find(entry => this.locationMatchesReference(entry.location, locationRef)) ?? null
            : null;
    }

    /** The party's place: where the DM moved the token, else the current scene's location. */
    private partyPlaceKey(): string | null {
        if (this.session?.partyLocation) return this.session.partyLocation;
        return this.locationData ? this.getLocationKey(this.locationData) : null;
    }

    /** The party's place on the board. */
    private currentBoardLocation(): CampaignBoardLocation | null {
        const key = this.partyPlaceKey();
        if (!key) return null;
        return this.boardLocations.find(entry => this.getLocationKey(entry.location) === key) ?? null;
    }

    /** Short party initials for the token on the board. */
    private partyTokenInitials(): string[] {
        return (this.session?.partyCharacterNames ?? []).slice(0, 4).map(name => name.trim().charAt(0).toUpperCase() || '?');
    }

    /**
     * Draws the party token and the choices on the Leaflet board: each choice that leads to a scene
     * at another place on this board is a numbered dashed path from the party, matching its card.
     */
    private drawBoardPlay(map: L.Map): void {
        const here = this.currentBoardLocation();
        const panelEl = map.getContainer().closest<HTMLElement>('.storyteller-campaign-scene-panel');
        if (here) {
            const [y, x] = here.binding.coordinates;
            // Own pane (styled as .leaflet-storyteller-choice-paths-pane), so the paths sit above the
            // map image and its tiles whatever pane those use.
            if (!map.getPane(BOARD_PATH_PANE)) map.createPane(BOARD_PATH_PANE);
            this.visibleBranches().forEach((branch, i) => {
                const resolved = this.resolveBranchReferences(branch);
                const there = this.boardLocationForScene(resolved.target);
                if (!there || there === here) return;
                const blocked = !this.branchCheck(resolved).met;
                const [ty, tx] = there.binding.coordinates;
                L.polyline([[y, x], [ty, tx]], {
                    className: 'storyteller-campaign-board-path' + (blocked ? ' is-blocked' : ''),
                    pane: BOARD_PATH_PANE,
                    dashArray: '10 8',
                    weight: 4,
                    opacity: 0.9,
                    interactive: false,
                }).addTo(map);
                const badge = L.marker([y + (ty - y) * 0.6, x + (tx - x) * 0.6], {
                    icon: L.divIcon({
                        className: 'storyteller-campaign-board-choice' + (blocked ? ' is-blocked' : ''),
                        html: `<span>${i + 1}</span>`,
                        iconSize: [26, 26],
                        iconAnchor: [13, 13],
                    }),
                    title: resolved.label,
                    keyboard: false,
                }).addTo(map);
                badge.on('click', () => { if (panelEl) this.activateChoice(branch, panelEl); });
            });

            const initials = this.partyTokenInitials();
            if (initials.length > 0) {
                const html = initials.map(letter => `<span>${letter}</span>`).join('');
                L.marker([y, x], {
                    icon: L.divIcon({
                        className: 'storyteller-campaign-board-party',
                        html,
                        iconSize: [initials.length * 22 + 6, 28],
                        iconAnchor: [(initials.length * 22 + 6) / 2, 38],
                    }),
                    title: (this.session?.partyCharacterNames ?? []).join(', '),
                    keyboard: false,
                    zIndexOffset: 1000,
                }).addTo(map).on('click', event => {
                    const original = event.originalEvent;
                    if (original) this.openPartyMenu(original);
                });
            }
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
        const map = renderer.getMap();
        if (map) {
            this.drawBoardPlay(map);
            const bounds = renderer.getImageBounds();
            map.on('click', event => {
                if (this.boardTool !== 'ping' || !bounds) return;
                const height = bounds.getNorth();
                const width = bounds.getEast();
                const { x, y } = boardPinPercent([event.latlng.lat, event.latlng.lng], width, height);
                this.sendPing(x, y);
            });
            mapEl.toggleClass('is-ping-tool', this.boardTool === 'ping');
        }

        const selectedLocation = locations.find(entry => this.getLocationKey(entry.location) === selectedLocationKey);
        if (selectedLocation && this.boardInspectorOpen) {
            await this.renderBoardLocationInspector(boardEl, selectedLocation);
        }
        return true;
    }

    /**
     * Pin click on the Leaflet board: move the selection and swap only the inspector,
     * so the map keeps its pan and zoom.
     */
    private async selectBoardLocationFromPin(location: Location): Promise<void> {
        if (this.handlePinWithTool(location)) return;
        const key = this.getLocationKey(location);
        if (this.selectedBoardLocationId === key && this.boardInspectorOpen) {
            this.focusBoardLocationInspector(key);
            return;
        }
        this.selectedBoardLocationId = key;
        this.boardRenderer?.setPinHighlight(this.getBoardPinHighlight(key));

        this.boardInspectorOpen = true;
        const boardEl = this.currentRoot()?.querySelector<HTMLElement>('.storyteller-campaign-board-canvas') ?? null;
        const entry = this.boardLocations.find(candidate => this.getLocationKey(candidate.location) === key);
        if (!boardEl || !entry) return;

        const previous = boardEl.querySelector<HTMLElement>(':scope > .storyteller-campaign-board-inspector');
        const inspector = await this.renderBoardLocationInspector(boardEl, entry);
        if (this.selectedBoardLocationId !== key) {
            // Another pin was chosen while this inspector was loading.
            inspector.remove();
            return;
        }
        if (previous) previous.replaceWith(inspector);
        this.focusBoardLocationInspector(key, inspector);
    }

    private getBoardPinHighlight(selectedKey: string | null): LocationPinHighlight {
        return {
            currentKey: this.partyPlaceKey(),
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

        // Static boards cannot draw paths, so each pin lists the numbers of the choices that lead there.
        const choiceNumbersByLocation = new Map<string, number[]>();
        const here = this.currentBoardLocation();
        this.visibleBranches().forEach((branch, i) => {
            const there = this.boardLocationForScene(this.resolveBranchReferences(branch).target);
            if (!there || there === here) return;
            const key = this.getLocationKey(there.location);
            choiceNumbersByLocation.set(key, [...(choiceNumbersByLocation.get(key) ?? []), i + 1]);
        });
        const partyInitials = this.partyTokenInitials();

        stage.addEventListener('click', event => {
            if (this.boardTool !== 'ping') return;
            const rect = stage.getBoundingClientRect();
            this.sendPing(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
        });
        stage.toggleClass('is-ping-tool', this.boardTool === 'ping');

        for (const entry of locations) {
            const { x: leftPercent, y: topPercent } = boardPinPercent(entry.binding.coordinates, dimensions.width, dimensions.height);
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
            const choiceNumbers = choiceNumbersByLocation.get(locationKey);
            if (choiceNumbers) {
                button.createSpan({ cls: 'storyteller-campaign-board-pin-choices', text: choiceNumbers.join(' ') });
            }
            if (this.isCurrentSceneLocation(entry.location) && partyInitials.length > 0) {
                const party = button.createSpan({ cls: 'storyteller-campaign-board-party is-static' });
                for (const letter of partyInitials) party.createSpan({ text: letter });
            }
            button.addEventListener('click', event => { void (async () => {
                event.stopPropagation();
                if (this.handlePinWithTool(entry.location)) return;
                const isSameLocation = this.selectedBoardLocationId === locationKey && this.boardInspectorOpen;
                this.selectedBoardLocationId = locationKey;
                this.boardInspectorOpen = true;
                if (isSameLocation) {
                    this.focusBoardLocationInspector(locationKey);
                    return;
                }
                this.pendingBoardFocusLocationId = locationKey;
                await this.render();
            })(); });
        }

        const selectedLocation = locations.find(entry => this.getLocationKey(entry.location) === selectedLocationKey);
        if (selectedLocation && this.boardInspectorOpen) {
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
        header.createDiv({
            cls: 'storyteller-campaign-board-inspector-kicker',
            text: this.isCurrentSceneLocation(entry.location) ? 'Party is here' : 'Location',
        });
        header.createEl('h4', { text: entry.location.name });

        const actions = header.createDiv('storyteller-campaign-board-inspector-actions');
        if (entry.location.filePath) {
            const noteBtn = actions.createEl('button', {
                cls: 'clickable-icon',
                attr: { type: 'button', 'aria-label': 'Open location note' },
            });
            setIcon(noteBtn, 'file-text');
            noteBtn.addEventListener('click', () => {
                if (entry.location.filePath) {
                    void this.plugin.app.workspace.openLinkText(entry.location.filePath, '', 'tab');
                }
            });
        }
        if (this.session && !this.isCurrentSceneLocation(entry.location)) {
            const seen = this.seenPlaceKeys(this.session).has(this.getLocationKey(entry.location));
            const revealBtn = actions.createEl('button', {
                cls: 'clickable-icon' + (seen ? ' is-active' : ''),
                attr: { type: 'button', 'aria-label': seen ? 'Hide from players' : 'Reveal to players' },
            });
            setIcon(revealBtn, seen ? 'eye' : 'eye-off');
            revealBtn.addEventListener('click', () => {
                this.toggleRevealedPlace(entry.location);
                const nowSeen = this.seenPlaceKeys(this.session!).has(this.getLocationKey(entry.location));
                setIcon(revealBtn, nowSeen ? 'eye' : 'eye-off');
                revealBtn.setAttribute('aria-label', nowSeen ? 'Hide from players' : 'Reveal to players');
                revealBtn.toggleClass('is-active', nowSeen);
            });
        }
        const closeBtn = actions.createEl('button', {
            cls: 'clickable-icon',
            attr: { type: 'button', 'aria-label': 'Close' },
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => {
            this.boardInspectorOpen = false;
            inspector.remove();
        });

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
        const target = inspector ?? this.currentRoot()?.querySelector<HTMLElement>(
            `.storyteller-campaign-board-inspector[data-location-key="${CSS.escape(locationKey)}"]`
        );
        if (!target) return;

        window.requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            target.addClass('is-highlighted');
            window.setTimeout(() => target.removeClass('is-highlighted'), 900);
        });
    }

    private ensureBoardLocationSelection(locations: CampaignBoardLocation[]): string | null {
        this.selectedBoardLocationId = resolveBoardSelection(
            locations.map(entry => this.getLocationKey(entry.location)),
            this.selectedBoardLocationId,
            this.locationData ? this.getLocationKey(this.locationData) : null,
        );
        return this.selectedBoardLocationId;
    }

    /** Whether the party token stands at this location. */
    private isCurrentSceneLocation(location: Location): boolean {
        const key = this.partyPlaceKey();
        return key !== null && this.getLocationKey(location) === key;
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

    /** Whether a choice can be taken now, and why not. */
    private branchCheck(branch: SceneBranch): { met: boolean; unmet: string[] } {
        return this.session
            ? checkBranchConditions(branch, this.session, this.getBranchActorState(branch))
            : { met: true, unmet: [] };
    }

    /** Takes a choice from its card or its number on the board. */
    private activateChoice(branch: SceneBranch, panelEl: HTMLElement): void {
        const resolved = this.resolveBranchReferences(branch);
        const check = this.branchCheck(resolved);
        if (!check.met) { new Notice(check.unmet.join(' | ')); return; }
        if (resolved.dice) this.showDiceOverlay(resolved, panelEl);
        else void this.executeChoice(resolved, 'success');
    }

    private renderPlayBranchCard(container: HTMLElement, branch: SceneBranch, panelEl: HTMLElement, number?: number): void {
        const resolvedBranch = this.resolveBranchReferences(branch);
        const actorState = this.getBranchActorState(resolvedBranch);
        const check = this.session
            ? checkBranchConditions(resolvedBranch, this.session, actorState)
            : { met: true, unmet: [] };

        const card = container.createDiv('storyteller-campaign-play-branch' + (!check.met ? ' is-blocked' : ''));
        card.setAttribute('data-sts-part', 'choice-card');

        // Label + target
        const labelRow = card.createDiv('storyteller-campaign-play-branch-label');
        if (number !== undefined) {
            labelRow.createSpan({ cls: 'storyteller-campaign-choice-number', text: String(number) });
        }
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

        if (resolvedBranch.requiresNoFlag) {
            const isSet = this.session?.flags?.includes(resolvedBranch.requiresNoFlag);
            tags.createSpan({ cls: `storyteller-branch-tag is-flag${isSet ? ' is-unmet' : ''}`, text: `Not: ${resolvedBranch.requiresNoFlag}` });
        }

        renderOutcomeChips(card, outcomeChips(resolvedBranch));

        if (!check.met) {
            for (const reason of check.unmet) {
                card.createDiv({ cls: 'storyteller-campaign-play-branch-blocked', text: reason });
            }
        }

        card.addEventListener('click', () => this.activateChoice(branch, panelEl));
    }

    // â”€â”€ Dice overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Pass the non-scrolling campaign body (.storyteller-campaign-main), never the scene panel: the
     * panel scrolls, so an absolute overlay inside it sits at the top of the content and is out of
     * reach on long scenes.
     */
    private createDiceOverlay(host: HTMLElement): HTMLElement {
        const overlay = host.createDiv('storyteller-dice-overlay');
        overlay.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            overlay.remove();
        });
        return overlay;
    }

    private showDiceOverlay(branch: SceneBranch, panelEl: HTMLElement): void {
        const overlay = this.createDiceOverlay(panelEl.parentElement ?? panelEl);
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
                this.showRollToPlayers(branch.label, total, outcome === 'success' ? 'Success' : 'Fail');
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
        rollBtn.focus();
    }

    /**
     * The scene's encounter table in play: the rows with their effects, a Roll button (with an
     * optional typed result for physical dice), and the latest result with a way to its scene.
     */
    private renderPlayEncounter(panel: HTMLElement): void {
        const table = this.rollableEncounterTable();
        if (!table) return;
        const box = panel.createDiv('storyteller-campaign-encounter');
        const header = box.createDiv('storyteller-campaign-encounter-header');
        setIcon(header.createSpan(), 'dices');
        header.createSpan({ cls: 'storyteller-campaign-encounter-title', text: `Encounter (${table.dice})` });
        header.createSpan({
            cls: 'storyteller-encounter-trigger',
            text: table.trigger === 'on-enter' ? 'rolls on enter' : 'roll when it fits',
        });

        const latest = this.lastEncounter && this.lastEncounter.sceneName === this.currentScene?.name
            ? this.lastEncounter
            : null;

        const list = box.createDiv('storyteller-campaign-encounter-rows');
        for (const row of table.rows) {
            // Compared by content: the table is parsed again whenever the scene is entered.
            const isHit = Boolean(latest && latest.row.min === row.min && latest.row.max === row.max && latest.row.label === row.label);
            const rowEl = list.createDiv('storyteller-campaign-encounter-row' + (isHit ? ' is-active' : ''));
            rowEl.createSpan({
                cls: 'storyteller-campaign-encounter-range',
                text: row.min === row.max ? String(row.min) : `${row.min}-${row.max}`,
            });
            const main = rowEl.createDiv('storyteller-campaign-encounter-main');
            const labelRow = main.createDiv('storyteller-campaign-encounter-label');
            labelRow.createSpan({ text: row.label });
            if (encounterLeadsToScene(row)) {
                labelRow.createSpan({ cls: 'storyteller-campaign-play-branch-target', text: `-> ${row.target}` });
            }
            renderOutcomeChips(main, outcomeChips(row));
        }

        if (latest) {
            const result = box.createDiv('storyteller-campaign-encounter-result');
            result.createSpan({ cls: 'storyteller-campaign-encounter-result-roll', text: String(latest.total) });
            result.createSpan({ cls: 'storyteller-campaign-encounter-result-label', text: latest.row.label });
            if (encounterLeadsToScene(latest.row) && this.resolveSceneReference(latest.row.target)) {
                const goBtn = result.createEl('button', {
                    cls: 'storyteller-campaign-btn is-primary',
                    text: `Go -> ${latest.row.target}`,
                });
                goBtn.addEventListener('click', () => { void this.doNavigate(latest.row.target, true); });
            }
            if (!this.session?.combat) {
                const fightBtn = result.createEl('button', { cls: 'storyteller-campaign-btn' });
                setIcon(fightBtn.createSpan(), 'swords');
                fightBtn.createSpan({ text: ' Start combat' });
                fightBtn.addEventListener('click', () => { void this.beginCombat(); });
            }
        }

        const actions = box.createDiv('storyteller-campaign-encounter-actions');
        const overrideInput = actions.createEl('input', {
            cls: 'storyteller-campaign-input is-small',
            attr: { type: 'number', placeholder: 'Rolled', 'aria-label': 'Typed die result' },
        });
        const rollBtn = actions.createEl('button', { cls: 'storyteller-campaign-btn is-primary' });
        setIcon(rollBtn.createSpan(), 'dices');
        rollBtn.createSpan({ text: latest ? ' Roll again' : ' Roll' });
        rollBtn.addEventListener('click', () => {
            const typed = overrideInput.value.trim();
            const override = typed ? parseInt(typed, 10) : undefined;
            void this.rollManualEncounter(Number.isFinite(override) ? override : undefined);
        });
    }

    /** Rolls the scene's table from the Roll button: applies and logs the row, then stays on the scene. */
    private async rollManualEncounter(override?: number): Promise<void> {
        if (this.choiceInFlight) return;
        this.choiceInFlight = true;
        try {
            const encounter = await this.rollSceneEncounter('manual', override);
            if (!encounter) return;
            new Notice(`Encounter: ${encounter.row.label}`);
            await this.autosave(encounter.logLines);
            await this.render();
        } finally {
            this.choiceInFlight = false;
        }
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

        if (outcome === 'fail' && branch.failMode === 'loop') {
            new Notice('Failed - try again!');
            await this.autosave(`*${branch.label}* - failed (loop retry)`);
            await this.render();
            return;
        }

        // Apply outcomes (inventory, flags, party membership, tags)
        const effectLines = await this.applySceneOutcomes(branch, previous => applyBranchOutcomes(branch, previous));

        // Determine target
        let target: string | undefined;
        if (outcome === 'success') {
            target = this.resolveSceneName(branch.targetSceneId, branch.target);
        } else if (branch.failMode === 'scene') {
            target = this.resolveSceneName(branch.failSceneId, branch.fail);
        }
        // 'continue' — no navigation

        const logEntries = [
            rollTotal != null
            ? `*${branch.label}* - rolled ${rollTotal} -> ${outcome}${target ? ` -> *${target}*` : ''}`
            : `Chose *${branch.label}*${target ? ` -> *${target}*` : ''}`,
            ...effectLines,
        ];

        // The choice's own time, or else the time this scene takes.
        const timeLine = this.passCampaignTime(branch.advances ?? this.currentScene?.playDuration);
        if (timeLine) logEntries.push(timeLine);

        // A choice that rolls the encounter table: a row with its own scene wins over the choice's target.
        if (branch.rollsEncounter && outcome === 'success') {
            const encounter = await this.rollSceneEncounter('choice');
            if (encounter) {
                logEntries.push(...encounter.logLines);
                if (encounterLeadsToScene(encounter.row)) target = encounter.row.target;
            }
        }

        if (target && target !== 'continue' && !this.resolveSceneReference(target)) {
            // Nothing is logged or navigated for a missing target; the outcomes already applied are still saved.
            new Notice(`Scene "${target}" not found.`);
            await this.autosave();
            await this.render();
            return;
        }

        await this.autosave(logEntries);
        if (target && target !== 'continue') {
            // The scene's other choices are kept on its timeline event as the paths not taken.
            this.pendingPathsNotTaken = this.branches
                .filter(candidate => !candidate.hidden && candidate.id !== branch.id)
                .map(candidate => candidate.label)
                .filter(label => label.trim().length > 0);
            await this.doNavigate(target, true);
        } else {
            await this.render();
        }
    }

    // ── Campaign time and timeline ────────────────────────────────────────────

    private campaignCalendar(): CalendarSystem {
        return new CalendarRegistry(this.plugin).getActiveCalendar();
    }

    /**
     * Move the in-world date forward by a duration when the campaign's time moves. Returns the
     * log line saying so, or null when nothing moved.
     */
    private passCampaignTime(durationText: string | undefined, forced = false): string | null {
        const session = this.session;
        if (!session?.inWorldDate || (!session.timeMoves && !forced)) return null;
        const duration = parseCampaignDuration(durationText);
        if (!duration || isZeroDuration(duration)) return null;
        const next = advanceCampaignDate(session.inWorldDate, duration, this.campaignCalendar());
        if (!next || next === session.inWorldDate) return null;
        session.inWorldDate = next;
        return formatMeta({ type: 'note', text: `Time passes: ${formatCampaignDuration(duration)}. Now ${next}` });
    }

    /**
     * When the campaign records to its fork or track: close the event of the scene the party is leaving
     * (its end date, and the choices not taken), then open a dated event for the scene entered.
     * Re-entering the scene that is already open, as a resumed session does, records nothing.
     */
    private async recordSceneOnTimeline(scene: Scene): Promise<void> {
        const session = this.session;
        const pathsNotTaken = this.pendingPathsNotTaken;
        this.pendingPathsNotTaken = [];
        if ((!session?.campaignForkId && !session?.campaignTag) || !session.inWorldDate) return;
        try {
            const events = await this.plugin.listEvents();
            const open = session.sceneEventId ? events.find(event => event.id === session.sceneEventId) : undefined;
            if (open && (open.linkedScenes ?? []).some(name => this.normalizeName(name) === this.normalizeName(scene.name))) return;
            if (open) {
                open.dateTime = campaignDateRange(session.sceneEventStart ?? open.dateTime ?? session.inWorldDate, session.inWorldDate);
                if (pathsNotTaken.length) open.pathsNotTaken = pathsNotTaken;
                await this.plugin.saveEvent(open);
            }

            const taken = new Set(events.map(event => this.normalizeName(event.name)));
            const base = `${session.name}: ${scene.name}`;
            let name = base;
            for (let count = 2; taken.has(this.normalizeName(name)); count++) name = `${base} (${count})`;
            const event: StoryEvent = {
                id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
                name,
                dateTime: session.inWorldDate,
                description: `Played in ${session.name}.`,
                status: 'Occurred',
                characters: [...(session.partyCharacterNames ?? [])],
                location: scene.linkedLocations?.[0],
                linkedScenes: [scene.name],
                sessionId: session.id,
                sessionName: session.name,
                branches: session.campaignForkName ? [session.campaignForkName] : [],
                // On the main timeline, the campaign's tag is what puts the event on its track.
                tags: session.campaignTag ? [session.campaignTag] : undefined,
            };
            await this.plugin.saveEvent(event);
            if (session.campaignForkId) await this.plugin.addEventToFork(session.campaignForkId, event.id!, { quiet: true });
            session.sceneEventId = event.id;
            session.sceneEventStart = session.inWorldDate;
        } catch (error) {
            this.notifySaveFailure(error, 'The scene was not recorded on the timeline');
        }
    }

    /** The in-world date and the ways to move it, in the toolbar. */
    private renderCampaignClock(toolbar: HTMLElement, session: CampaignSession): void {
        if (!session.inWorldDate) return;
        const clock = toolbar.createEl('button', {
            cls: 'storyteller-campaign-toolbar-btn storyteller-campaign-clock',
            attr: { 'aria-label': 'In-world date. Click to pass time or change it.' },
        });
        setIcon(clock.createSpan(), session.timeMoves ? 'calendar-clock' : 'calendar');
        clock.createSpan({ text: ` ${session.inWorldDate}` });
        clock.addEventListener('click', event => {
            const menu = new Menu();
            const pass = (duration: string) => {
                const line = this.passCampaignTime(duration, true);
                if (!line) return;
                void (async () => { await this.autosave(line); await this.render(); })();
            };
            if (calendarKeepsTime(this.campaignCalendar())) {
                menu.addItem(item => item.setTitle('Pass 1 hour').setIcon('clock').onClick(() => pass('1 hour')));
            }
            menu.addItem(item => item.setTitle('Pass 1 day').setIcon('sun').onClick(() => pass('1 day')));
            menu.addItem(item => item.setTitle('Pass 1 week').setIcon('calendar-range').onClick(() => pass('1 week')));
            menu.addItem(item => item.setTitle('Pass time...').setIcon('hourglass').onClick(() => {
                new PromptModal(this.app, {
                    title: 'Pass time',
                    label: 'How long',
                    defaultValue: '8 hours',
                    validator: value => durationProblem(value, this.campaignCalendar()) ?? (value.trim() ? null : 'Type how long, like 3 days.'),
                    onSubmit: value => pass(value),
                }).open();
            }));
            menu.addSeparator();
            menu.addItem(item => item.setTitle('Set the date...').setIcon('pencil').onClick(() => {
                new PromptModal(this.app, {
                    title: 'Set the in-world date',
                    label: 'Date',
                    defaultValue: session.inWorldDate ?? '',
                    validator: value => parseInCalendar(value, this.campaignCalendar()) ? null : 'That is not a date in this story\'s calendar.',
                    onSubmit: value => {
                        session.inWorldDate = value.trim();
                        void (async () => {
                            await this.autosave(formatMeta({ type: 'note', text: `Date set to ${session.inWorldDate}` }));
                            await this.render();
                        })();
                    },
                }).open();
            }));
            menu.addItem(item => item
                .setTitle(session.timeMoves ? 'Stop choices moving time' : 'Let choices move time')
                .setIcon(session.timeMoves ? 'pause' : 'play')
                .onClick(() => {
                    session.timeMoves = !session.timeMoves || undefined;
                    void (async () => { await this.autosave(); await this.render(); })();
                }));
            menu.showAtMouseEvent(event);
        });
    }

    /**
     * Applies the effects shared by choices and encounter rows: the session update, item ownership,
     * Partylog tags and the linked timeline event. Returns the log lines describing them.
     */
    private async applySceneOutcomes(
        fields: SceneOutcomeFields,
        apply: (session: CampaignSession) => CampaignSession,
    ): Promise<string[]> {
        if (!this.session) return [];
        const previousItems = [...(this.session.partyItems ?? [])];
        this.session = apply(this.session);
        this.ensureActiveActor(this.session);
        await this.ensurePartyCharacterStats(this.session);
        await this.syncPartyInventoryOwnership(this.session, previousItems);

        const lines: string[] = [];
        if (fields.revealsCompendiumEntry) lines.push(`Revealed lore: *${fields.revealsCompendiumEntry}*`);
        if (fields.changesGroupStanding) {
            const delta = fields.groupStandingDelta ?? 1;
            lines.push(`Changed *${fields.changesGroupStanding}* standing by ${delta > 0 ? '+' : ''}${delta}`);
        }
        const tags = fields.tags ? extractTags(fields.tags).tags : [];
        if (tags.length) {
            const result = applyPartylogTagsToSession(this.session, tags, this.partylogContext());
            if (result.changed) new Notice(result.summary.join('\n'));
        }
        const eventLogLine = await this.applyTriggeredEvent(fields.triggersEvent, fields.triggersEventId);
        if (eventLogLine) lines.push(eventLogLine);
        return lines;
    }

    /** The current scene's encounter table, when it has at least one row to roll on. */
    private rollableEncounterTable(): EncounterTable | null {
        return this.encounterTable && this.encounterTable.rows.length > 0 ? this.encounterTable : null;
    }

    /**
     * Rolls the current scene's encounter table (or takes the DM's typed result), applies the row and
     * returns it with its log lines. Does not log or navigate: the caller decides both.
     */
    private async rollSceneEncounter(
        source: 'on-enter' | 'manual' | 'choice',
        override?: number,
    ): Promise<{ total: number; row: EncounterTableRow; logLines: string[] } | null> {
        const table = this.rollableEncounterTable();
        if (!table || !this.session) return null;
        const { total, row } = override != null
            ? { total: override, row: encounterRowFor(table, override) }
            : rollOnEncounterTable(table);
        const effectLines = await this.applySceneOutcomes(row, previous => applyEncounterResult(row, previous));
        const sourceText = source === 'on-enter' ? 'on enter' : source === 'choice' ? 'from choice' : 'encounter';
        const tags = row.tags ? extractTags(row.tags).tags : [];
        const line = formatTable({
            source: 'tbl',
            expression: `${table.dice}=${total} (${sourceText})`,
            outcome: `${row.label}${encounterLeadsToScene(row) ? ` -> ${row.target}` : ''}`,
            tags,
        });
        this.lastEncounter = { sceneName: this.currentScene?.name ?? '', total, row };
        this.showRollToPlayers(`Encounter (${table.dice})`, total, row.label);
        const timeLine = this.passCampaignTime(row.advances);
        return { total, row, logLines: [line, ...effectLines, ...(timeLine ? [timeLine] : [])] };
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

        this.boardInspectorOpen = false;
        this.session.partyLocation = undefined;
        if (pushHistory && this.currentScene) this.sceneHistory.push(this.currentScene.name);

        this.currentScene = scene;
        await this.loadCurrentScene();
        await this.loadSceneLocation();
        await this.syncActiveCampaignBoardForScene();

        this.session.currentSceneName = scene.name;
        this.session.currentSceneId   = scene.id;
        await this.logSceneHeader(scene);
        await this.recordSceneOnTimeline(scene);
        await this.autosave(`Entered *${scene.name}*`);

        // On-enter encounter auto-roll
        if (this.rollableEncounterTable()?.trigger === 'on-enter') {
            const encounter = await this.rollSceneEncounter('on-enter');
            if (encounter) {
                await this.autosave(encounter.logLines);
                if (encounterLeadsToScene(encounter.row)) {
                    await this.enterScene(encounter.row.target, true);
                    return;
                }
            }
        }

        await this.render();
    }

    private async navigateBack(): Promise<void> {
        if (this.navigationInFlight) return;
        if (!this.sceneHistory.length || !this.session) return;
        this.navigationInFlight = true;
        try {
            const prev = this.sceneHistory[this.sceneHistory.length - 1];
            const scene = this.allScenes.find(s => s.name === prev);
            if (!scene) { new Notice(`Scene "${prev}" not found.`); return; }
            this.sceneHistory.pop();
            this.currentScene = scene;
            await this.loadCurrentScene();
            await this.loadSceneLocation();
            await this.syncActiveCampaignBoardForScene();
            this.session.currentSceneName = scene.name;
            this.session.currentSceneId = scene.id;
            await this.logSceneHeader(scene);
            await this.recordSceneOnTimeline(scene);
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

    // ── Read panel ───────────────────────────────────────────────────────

    private readSceneKey(scene: Scene): string {
        return scene.filePath ?? scene.name;
    }

    /** The scene note's sections, minus the ones with no text under them. */
    /** The scene note's sections for the Read tab. */
    private async loadReadSections(scene: Scene | null): Promise<NoteSection[]> {
        if (!scene?.filePath) return [];
        const file = this.app.vault.getAbstractFileByPath(normalizePath(scene.filePath));
        if (!(file instanceof TFile)) return [];
        try {
            return readSectionsFor(await this.app.vault.cachedRead(file));
        } catch {
            return [];
        }
    }

    /**
     * The Read tab: who and what is in the scene, then the scene note by header. Clicking a
     * header shows its text; each one can be shown to the players, pinned, or sent to one player.
     */
    private async renderReadSidebar(sidebar: HTMLElement, session: CampaignSession): Promise<void> {
        const sec = sidebar.createDiv('storyteller-campaign-sidebar-section storyteller-campaign-read');
        sec.setAttribute('data-sts-part', 'read-panel');
        this.sidebarPartEls.set('read', sec);

        const scene = this.currentScene;
        if (!scene) {
            sec.createDiv({ cls: 'storyteller-campaign-empty-text', text: 'No scene loaded.' });
            return;
        }
        this.renderSceneEntityContext(sec);

        const sections = this.readSections.length ? this.readSections : await this.loadReadSections(scene);
        if (sections.length === 0) {
            sec.createDiv({
                cls: 'storyteller-campaign-empty-text',
                text: 'Nothing to read yet. Add headers like "Read aloud" to the scene note.',
            });
            return;
        }

        // A new scene opens on its read-aloud text, else the first section.
        const key = this.readSceneKey(scene);
        if (!this.readSelection.has(key)) {
            const firstRead = sections.findIndex(section => READ_ALOUD_HEADING.test(section.heading));
            this.readSelection.set(key, firstRead >= 0 ? firstRead : 0);
        }
        const stored = this.readSelection.get(key) ?? null;
        const selected = stored !== null && stored < sections.length ? stored : null;
        const onScreen = new Set(
            this.plugin.playerScreen.getState().pinned
                .filter(push => push.sourceName === scene.name)
                .map(push => push.heading),
        );

        const list = sec.createDiv('storyteller-campaign-read-list');
        sections.forEach((section, i) => {
            const row = list.createDiv('storyteller-campaign-read-heading' + (i === selected ? ' is-selected' : ''));
            row.setAttribute('data-sts-part', 'read-heading');
            row.setCssStyles({ paddingLeft: `${0.4 + Math.max(0, section.level - 2) * 0.75}rem` });

            const title = row.createEl('button', {
                cls: 'storyteller-campaign-read-title',
                attr: { type: 'button', 'aria-expanded': String(i === selected) },
            });
            setIcon(title.createSpan(), i === selected ? 'chevron-down' : 'chevron-right');
            title.createSpan({ text: section.heading });
            title.addEventListener('click', () => {
                this.readSelection.set(key, i === selected ? null : i);
                void this.refreshSidebarPart('read');
            });
            if (onScreen.has(section.heading)) {
                row.createSpan({ cls: 'storyteller-campaign-read-on-screen', text: 'Pinned' });
            }

            const push = row.createEl('button', {
                cls: 'storyteller-campaign-read-push',
                attr: { type: 'button', 'aria-label': `Show "${section.heading}" to players` },
            });
            setIcon(push.createSpan(), 'send');
            push.createSpan({ text: 'Show' });
            push.addEventListener('click', event => {
                this.openReadPushMenu(event, section, session);
            });

            if (i !== selected) return;
            const detail = list.createDiv('storyteller-campaign-read-detail');
            void MarkdownRenderer.render(this.app, section.markdown, detail.createDiv(), scene.filePath ?? '', this);
            const bar = detail.createDiv('storyteller-campaign-read-push-bar');
            const show = bar.createEl('button', { cls: 'mod-cta', attr: { type: 'button' } });
            setIcon(show.createSpan(), 'send');
            show.createSpan({ text: 'Show players' });
            show.addEventListener('click', () => this.pushReadSection(section, 'popup'));
            const pin = bar.createEl('button', { attr: { type: 'button' } });
            setIcon(pin.createSpan(), 'pin');
            pin.createSpan({ text: 'Pin' });
            pin.addEventListener('click', () => this.pushReadSection(section, 'pinned'));
            if ((session.partyCharacterNames ?? []).length > 0) {
                const one = bar.createEl('button', { attr: { type: 'button', 'aria-label': 'Send to one player' } });
                setIcon(one.createSpan(), 'user');
                one.createSpan({ text: 'One player' });
                one.addEventListener('click', event => this.openOnePlayerMenu(event, section, session));
            }
        });
    }

    private openReadPushMenu(event: MouseEvent, section: NoteSection, session: CampaignSession): void {
        const menu = new Menu();
        menu.addItem(item => item
            .setTitle('Show as popup')
            .setIcon('message-square')
            .onClick(() => { this.pushReadSection(section, 'popup'); }));
        menu.addItem(item => item
            .setTitle('Pin for players')
            .setIcon('pin')
            .onClick(() => { this.pushReadSection(section, 'pinned'); }));
        this.addOnePlayerItems(menu, section, session);
        menu.showAtMouseEvent(event);
    }

    private openOnePlayerMenu(event: MouseEvent, section: NoteSection, session: CampaignSession): void {
        const menu = new Menu();
        this.addOnePlayerItems(menu, section, session);
        menu.showAtMouseEvent(event);
    }

    private addOnePlayerItems(menu: Menu, section: NoteSection, session: CampaignSession): void {
        const names = session.partyCharacterNames ?? [];
        if (names.length === 0) return;
        menu.addSeparator();
        for (const name of names) {
            menu.addItem(item => item
                .setTitle(`Send to ${name}`)
                .setIcon('user')
                .onClick(() => { this.pushReadSection(section, 'popup', name); }));
        }
    }

    private pushReadSection(section: NoteSection, mode: PlayerPushMode, target?: string): void {
        const scene = this.currentScene;
        if (!scene) return;
        this.plugin.playerScreen.push({
            sourceName: scene.name,
            heading: section.heading,
            markdown: section.markdown,
            mode,
            ...(target ? { target } : {}),
        });
        const opened = this.app.workspace.getLeavesOfType(VIEW_TYPE_PLAYER_SCREEN).length > 0;
        new Notice(
            (target ? `Sent to ${target}` : mode === 'pinned' ? 'Pinned for players' : 'Shown to players') +
            (opened ? '' : '. Open the player screen from the Players button to see it.'),
        );
        void this.autosave(`${target ? `Shown to ${target}` : 'Shown to players'}: ${section.heading}`);
        void this.refreshSidebarPart('read');
        this.refreshPlayersButton();
    }

    /** Updates the Players button without redrawing the board. */
    private refreshPlayersButton(): void {
        const button = this.currentRoot()?.querySelector<HTMLElement>('.storyteller-campaign-players-btn');
        if (button) this.decoratePlayersButton(button);
    }

    /** The Players button shows what the player screen is doing: a vote, a blank screen, pushed text. */
    private decoratePlayersButton(button: HTMLElement): void {
        const state = this.plugin.playerScreen.getState();
        button.querySelectorAll('.storyteller-campaign-players-count, .storyteller-campaign-players-flag').forEach(el => el.remove());
        if (state.controls.voteOpen) button.createSpan({ cls: 'storyteller-campaign-players-flag is-vote', text: 'Vote' });
        if (state.controls.mode !== 'board') {
            button.createSpan({ cls: 'storyteller-campaign-players-flag', text: state.controls.mode === 'blank' ? 'Blank' : 'Scene' });
        }
        const showing = state.pinned.length + state.popups.length;
        if (showing > 0) button.createSpan({ cls: 'storyteller-campaign-players-count', text: String(showing) });
    }

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
            this.refreshCombatPanel();
            this.publishPlayerView();
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

    // â”€â”€ Item use â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private async useItem(itemName: string, session: CampaignSession, onRebuild: () => void): Promise<void> {
        // A second tap while the first use is running would apply the item again.
        if (this.itemUseInFlight) return;
        this.itemUseInFlight = true;
        try {
            await this.applyItemUse(itemName, session, onRebuild);
        } finally {
            this.itemUseInFlight = false;
        }
    }

    private async applyItemUse(itemName: string, session: CampaignSession, _onRebuild: () => void): Promise<void> {
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

            // An event prepared for the campaign, with no date yet, happens now and on the campaign's fork.
            // A dated event is part of the story already and keeps its date and branches.
            const datedNow = !event.dateTime && Boolean(this.session?.inWorldDate);
            if (datedNow) {
                event.dateTime = this.session!.inWorldDate;
                if (this.session?.campaignForkName && !(event.branches ?? []).includes(this.session.campaignForkName)) {
                    event.branches = [...(event.branches ?? []), this.session.campaignForkName];
                }
                if (this.session?.campaignTag && !(event.tags ?? []).includes(this.session.campaignTag)) {
                    event.tags = [...(event.tags ?? []), this.session.campaignTag];
                }
                changed = true;
            }

            if (changed) {
                await this.plugin.saveEvent(event);
            }
            if (datedNow && this.session?.campaignForkId && event.id) {
                await this.plugin.addEventToFork(this.session.campaignForkId, event.id, { quiet: true });
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

        const share = row.createEl('button', {
            cls: 'storyteller-campaign-progress-remove storyteller-campaign-clock-share' + (clock.shown ? ' is-shown' : ''),
            attr: { 'aria-label': clock.shown ? `Hide ${clock.name} from players` : `Show ${clock.name} to players` },
        });
        setIcon(share, clock.shown ? 'eye' : 'eye-off');
        share.addEventListener('click', () => {
            clock.shown = !clock.shown || undefined;
            void this.autosave().then(async () => {
                await this.refreshSidebarPart('progress');
                this.publishPlayerView();
            });
        });

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

    /** Click cycles the state for the kind; the "..." button and right-click open a menu with every state, including Abandoned. */
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
        // Touch has no right-click: this button opens the same menu on tap.
        const stateMenu = row.createEl('button', {
            cls: 'storyteller-campaign-thread-more',
            text: '...',
            attr: { 'aria-label': `Set state of ${thread.name}`, title: 'Set any state' },
        });
        stateMenu.addEventListener('click', (event) => this.openThreadStateMenu(event, thread));

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
                    attr: { type: 'number', min: '1', 'aria-label': `Amount for ${name}` },
                });
                amount.value = this.partyAmountDrafts.get(name) ?? '1';
                amount.addEventListener('input', () => { this.partyAmountDrafts.set(name, amount.value); });
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
    private async writeSessionLog(update: (body: string) => string, session: CampaignSession | null = this.session): Promise<void> {
        if (!session) return;
        await this.flushAutosaveNow();
        const filePath = session.filePath;
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
        if (!session) {
            await this.render();
            return;
        }
        // A part on a rail tab that is not showing is drawn fresh when its tab opens.
        const tab = PART_TAB[part];
        if (tab && tab !== this.railTab) return;
        const old = this.sidebarPartEls.get(part);
        if (!old?.parentElement) {
            await this.render();
            return;
        }
        if (part === 'log') {
            await this.fillQuickBar(old, session);
            if (this.railTab === 'log' && this.railEl && !this.railCollapsed) await this.renderRail(this.railEl, session);
            return;
        }
        const holder = activeDocument.createElement('div');
        switch (part) {
            case 'read':
                await this.renderReadSidebar(holder, session);
                break;
            case 'party':
                this.renderPartySidebar(holder, session);
                break;
            case 'progress':
                this.renderProgressSidebar(holder, session);
                break;
            case 'standings':
                this.renderGroupStandingsSidebar(holder, session);
                break;
        }
        const fresh = holder.firstElementChild;
        if (!(fresh instanceof HTMLElement)) return;
        old.replaceWith(fresh);
        this.sidebarPartEls.set(part, fresh);
        if (part === 'party' || part === 'progress') this.publishPlayerView();
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
        npcInput.value = q.npcDraft;
        npcInput.addEventListener('input', () => { q.npcDraft = npcInput.value; });
        const addNpc = () => {
            const name = npcInput.value.trim();
            if (!name) return;
            if (!this.quickNpcs.some(existing => this.normalizeName(existing) === this.normalizeName(name))) {
                this.quickNpcs.push(name);
            }
            if (!q.actors.includes(name)) q.actors = [...q.actors, name];
            q.npcDraft = '';
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
        this.quickInputEl = input;
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
        // Take the text before the first await: a second submit then sees an empty draft and writes nothing,
        // and text typed while the line saves starts the next entry instead of extending this one.
        const typed = this.quick.draft;
        this.quick.draft = '';
        if (this.quickInputEl) this.quickInputEl.value = '';
        this.quickSubmitInFlight = true;
        try {
            // The line is written before its tags touch the session, so a failed write never leaves tags applied.
            await this.autosave();
            await this.writeSessionLog(body => appendLogLines(body, [line]), session);
        } catch (error) {
            // Nothing was written: give the text back for a retry, unless the view has moved to another session.
            if (this.session?.filePath === session.filePath) {
                this.quick.draft = this.quick.draft ? `${typed} ${this.quick.draft}` : typed;
                if (this.quickInputEl) this.quickInputEl.value = this.quick.draft;
            }
            throw error;
        } finally {
            this.quickSubmitInFlight = false;
        }
        const result = applyPartylogTagsToSession(session, entryTags(parsePartylogLine(line)), this.partylogContext());
        this.flushChain = this.flushChain.catch(() => undefined).then(() => this.plugin.saveSession(session));
        try {
            await this.flushChain;
        } catch (error) {
            this.notifySaveFailure(error, 'Session not saved');
        }
        if (result.changed) new Notice(result.summary.join('\n'));
        await this.refreshSidebarParts(partsAffectedBy(result.summary));
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
        // Captured now, so the write goes to the session these entries were made in even if the view switches session first.
        const session = this.session;
        const filePath = session?.filePath;
        // Entries kept from a failed write go back to the file they were made for, and only to that file.
        const retained = filePath ? this.retainedLogEntries.get(filePath) ?? [] : [];
        if (filePath) this.retainedLogEntries.delete(filePath);
        const entries = [...retained, ...this.pendingLogEntries];
        this.pendingSessionSave = false;
        this.pendingLogEntries = [];

        if (!shouldSaveSession && entries.length === 0) {
            resolve?.();
            return;
        }

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
            // Keep the entries with their own session so the next flush of that session retries them.
            this.pendingSessionSave = this.pendingSessionSave || shouldSaveSession;
            if (filePath && entries.length) this.retainedLogEntries.set(filePath, entries);
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
