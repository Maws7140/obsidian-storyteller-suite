/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable @typescript-eslint/no-unused-vars */

// Import Leaflet CSS and JS so esbuild can bundle it properly
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';

// Note: Global Leaflet exposure is now conditional and happens in onload() after settings are loaded
// This prevents conflicts with the standalone Obsidian Leaflet plugin when disableLeafletGlobalExposure is enabled

// Leaflet plugins disabled - causing marker initialization errors
// import 'leaflet-draw/dist/leaflet.draw.css';
// import 'leaflet-draw/dist/leaflet.draw';
// import 'leaflet.markercluster/dist/MarkerCluster.css';
// import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
// import 'leaflet.markercluster/dist/leaflet.markercluster';

import { App, Notice, Plugin, TFile, TFolder, normalizePath, stringifyYaml, WorkspaceLeaf, debounce } from 'obsidian';
import { parseEventDate, toMillis } from './utils/DateParsing';
import {
    buildFrontmatter,
    getWhitelistKeys,
    isStampedEntityTypeCompatible,
    normalizeEntityType,
    parseSectionsFromMarkdown,
    parseFrontmatterFromContent,
    WIKI_LINK_ARRAY_FIELDS,
    WIKI_LINK_SCALAR_FIELDS,
} from './yaml/EntitySections';
import { stringifyYamlWithLogging, validateFrontmatterPreservation } from './utils/YamlSerializer';
import { setLocale, t } from './i18n/strings';
import { FolderResolver, FolderResolverOptions, EntityFolderType } from './folders/FolderResolver';
import { PromptModal } from './modals/ui/PromptModal';
import { ConfirmModal } from './modals/ui/ConfirmModal';
import { CharacterModal } from './modals/CharacterModal';
import {
    Character, Location, Event, GalleryImage, GalleryData, Story, Group, PlotItem, Reference, Chapter, Scene,
    Culture, Economy, MagicSystem, CompendiumEntry, Book,
    TimelineFork, CausalityLink, TimelineConflict, TimelineEra, TimelineTrack,
    PacingAnalysis, WritingSession, StoryAnalytics, LocationSensoryProfile,
    StoryMap
} from './types';
import { CharacterListModal } from './modals/CharacterListModal';
import { LocationModal } from './modals/LocationModal';
import { LocationListModal } from './modals/LocationListModal';
import { EventModal } from './modals/EventModal';
import { TimelineModal } from './modals/TimelineModal';
import { GalleryModal } from './modals/GalleryModal';
import { ImageDetailModal } from './modals/ImageDetailModal';
import { DashboardView, VIEW_TYPE_DASHBOARD } from './views/DashboardView';
import { NetworkGraphView, VIEW_TYPE_NETWORK_GRAPH } from './views/NetworkGraphView';
import { TimelineView, VIEW_TYPE_TIMELINE } from './views/TimelineView';
import { AnalyticsDashboardView, VIEW_TYPE_ANALYTICS } from './views/AnalyticsDashboardView';
import { MapView, VIEW_TYPE_MAP } from './views/MapView';
import { WritingPanelView, VIEW_TYPE_WRITING_PANEL } from './views/WritingPanelView';
import { CampaignView, VIEW_TYPE_CAMPAIGN } from './views/CampaignView';
import { SceneGraphView, VIEW_TYPE_SCENE_GRAPH } from './views/SceneGraphView';
import { StorytellerGuideModal } from './modals/StorytellerGuideModal';
// DEPRECATED: Map functionality has been deprecated
// import { MapEditorView, VIEW_TYPE_MAP_EDITOR } from './views/MapEditorView';
import { GalleryImageSuggestModal } from './modals/GalleryImageSuggestModal';
import { GroupSuggestModal } from './modals/GroupSuggestModal';
import { StorytellerSuiteSettingTab } from './StorytellerSuiteSettingTab';
import { NewStoryModal } from './modals/NewStoryModal';
import { PlotItemModal } from './modals/PlotItemModal';
import { PlotItemListModal } from './modals/PlotItemListModal';
import { CultureModal } from './modals/CultureModal';
import { CultureListModal } from './modals/CultureListModal';
import { EconomyModal } from './modals/EconomyModal';
import { EconomyListModal } from './modals/EconomyListModal';
import { MagicSystemModal } from './modals/MagicSystemModal';
import { MagicSystemListModal } from './modals/MagicSystemListModal';
import { CompendiumEntryModal } from './modals/CompendiumEntryModal';
import { CompendiumListModal } from './modals/CompendiumListModal';
import { PlatformUtils } from './utils/PlatformUtils';
import { getTemplateSections } from './utils/EntityTemplates';
import { getSvgSourceInfoFromArrayBuffer, isSvgArrayBuffer } from './utils/SvgImageUtils';
// Removed: Codeblock maps no longer supported - use MapView instead
// import { LeafletCodeBlockProcessor } from './leaflet/processor';
import { TemplateStorageManager } from './templates/TemplateStorageManager';
import { TemplateNoteManager } from './templates/TemplateNoteManager';
import { SaveNoteAsTemplateCommand } from './commands/SaveNoteAsTemplateCommand';
import { Template, TemplateApplicationOptions, TemplateApplicationResult } from './templates/TemplateTypes';
import { StoryTemplateGalleryModal } from './templates/modals/StoryTemplateGalleryModal';
import { upgradeLegacyModalLayout } from './modals/utils/LegacyModalLayout';
import { TrackManagerModal } from './modals/TrackManagerModal';
import { ConflictViewModal } from './modals/ConflictViewModal';
import { TagTimelineModal } from './modals/TagTimelineModal';
import { ConflictDetector } from './utils/ConflictDetector';
import { TimelineTrackManager } from './utils/TimelineTrackManager';
import { EraManager } from './utils/EraManager';
import { LocationMigration } from './utils/LocationMigration';
import { WordCountTracker } from './compile';
import type { SessionStats } from './compile';
import { createLedgerViewExtension, registerLedgerBlockProcessor } from './extensions/LedgerEditorExtension';
import { createBranchViewExtension, registerBranchBlockProcessors } from './extensions/BranchBlockExtension';
import { CampaignSession, PartyMemberState } from './types';

type FrontmatterReferenceFieldConfig = {
    field: string;
    kind: 'scalar' | 'array';
    entityType: EntityFolderType;
    mirrorField?: string;
};

type FrontmatterObjectReferenceFieldConfig = {
    field: string;
    idKey: string;
    entityType: EntityFolderType | ((entry: Record<string, any>) => EntityFolderType | null);
    nameKey?: string;
};

type FrontmatterReferenceIndex = {
    idToName: Map<string, string>;
    nameToId: Map<string, string>;
    lowerNameToId: Map<string, string>;
};

const FRONTMATTER_REFERENCE_FIELDS: FrontmatterReferenceFieldConfig[] = [
    { field: 'groups', kind: 'array', entityType: 'group' },
    { field: 'linkedGroups', kind: 'array', entityType: 'group' },
    { field: 'dependencies', kind: 'array', entityType: 'event', mirrorField: 'dependencyNames' },
    { field: 'currentLocationId', kind: 'scalar', entityType: 'location' },
    { field: 'parentLocationId', kind: 'scalar', entityType: 'location' },
    { field: 'correspondingMapId', kind: 'scalar', entityType: 'map' },
    { field: 'childLocationIds', kind: 'array', entityType: 'location' },
    { field: 'bookId', kind: 'scalar', entityType: 'book', mirrorField: 'bookName' },
    { field: 'chapterId', kind: 'scalar', entityType: 'chapter', mirrorField: 'chapterName' },
    { field: 'currentSceneId', kind: 'scalar', entityType: 'scene', mirrorField: 'currentSceneName' },
    { field: 'campaignBoardMapId', kind: 'scalar', entityType: 'map' },
    { field: 'partyCharacterIds', kind: 'array', entityType: 'character', mirrorField: 'partyCharacterNames' },
    { field: 'inventoryItemIds', kind: 'array', entityType: 'item' },
    { field: 'revealedCompendiumEntryIds', kind: 'array', entityType: 'compendiumEntry', mirrorField: 'revealedCompendiumEntryNames' },
    { field: 'chapterIds', kind: 'array', entityType: 'chapter' },
    { field: 'activeSessionId', kind: 'scalar', entityType: 'campaignSession' },
    { field: 'activeMapId', kind: 'scalar', entityType: 'map' },
    { field: 'primaryMapId', kind: 'scalar', entityType: 'map' },
    { field: 'mapId', kind: 'scalar', entityType: 'map' },
    { field: 'parentMapId', kind: 'scalar', entityType: 'map' },
    { field: 'childMapIds', kind: 'array', entityType: 'map' },
    { field: 'correspondingLocationId', kind: 'scalar', entityType: 'location' },
    { field: 'relatedMapIds', kind: 'array', entityType: 'map' },
];

const FRONTMATTER_OBJECT_REFERENCE_FIELDS: FrontmatterObjectReferenceFieldConfig[] = [
    { field: 'locationHistory', idKey: 'locationId', entityType: 'location' },
    { field: 'partyState', idKey: 'characterId', entityType: 'character', nameKey: 'characterName' },
    { field: 'groupStandings', idKey: 'groupId', entityType: 'group', nameKey: 'groupName' },
    { field: 'campaignItemEffects', idKey: 'itemId', entityType: 'item', nameKey: 'itemName' },
    { field: 'campaignItemEffects', idKey: 'sceneId', entityType: 'scene', nameKey: 'sceneName' },
    { field: 'campaignItemEffects', idKey: 'characterId', entityType: 'character', nameKey: 'characterName' },
    { field: 'campaignItemEffects', idKey: 'compendiumEntryId', entityType: 'compendiumEntry', nameKey: 'compendiumEntryName' },
    { field: 'campaignItemEffects', idKey: 'groupId', entityType: 'group', nameKey: 'groupName' },
    {
        field: 'entityRefs',
        idKey: 'entityId',
        nameKey: 'entityName',
        entityType: (entry) => {
            const rawType = String(entry?.entityType ?? '').trim().toLowerCase();
            if (rawType === 'character') return 'character';
            if (rawType === 'location') return 'location';
            if (rawType === 'event') return 'event';
            if (rawType === 'item') return 'item';
            if (rawType === 'scene') return 'scene';
            if (rawType === 'culture') return 'culture';
            if (rawType === 'economy') return 'economy';
            if (rawType === 'group') return 'group';
            if (rawType === 'reference') return 'reference';
            if (rawType === 'magicsystem') return 'magicSystem';
            if (rawType === 'compendiumentry') return 'compendiumEntry';
            return null;
        }
    },
    { field: 'mapBindings', idKey: 'mapId', entityType: 'map', nameKey: 'mapName' },
];

const FRONTMATTER_LINK_ONLY_SCALAR_FIELDS = new Set([
    'location',
    'currentOwner',
    'currentLocation',
    'povCharacter',
    'navigatesToScene',
    'useRequiresLocation',
    'linkedCulture',
    'parentGroup',
    'parentCulture',
    'triggeredByItem',
    'parentLocation',
]);

/**
 * Plugin settings interface defining all configurable options
 * These settings are persisted in Obsidian's data.json file
 */
 interface StorytellerSuiteSettings {
    stories: Story[]; // List of all stories
    activeStoryId: string; // Currently selected story
    galleryUploadFolder: string; // New setting for uploads
    galleryData: GalleryData; // Store gallery metadata here
    galleryWatchFolder?: string; // Folder to auto-scan for images
    /** Array of all user-defined groups (story-specific) */
    groups: Group[];
    /** Whether to show the tutorial section in settings */
    showTutorial: boolean;
    /** Whether the first-run onboarding guide has already been shown */
    hasCompletedOnboarding?: boolean;
    /** Last plugin version whose update notes were shown to the user */
    lastSeenReleaseNotesVersion?: string;
    /** UI language setting */
    language: string;
    /** When true, use user-provided folders instead of generated story folders */
    enableCustomEntityFolders?: boolean;
    /** Optional per-entity custom folders (used when enableCustomEntityFolders is true) */
    /** Optional story root folder template. Supports {storyName}, {storySlug}, {storyId} */
    storyRootFolderTemplate?: string;
    characterFolderPath?: string;
    locationFolderPath?: string;
    eventFolderPath?: string;
    itemFolderPath?: string;
    referenceFolderPath?: string;
    chapterFolderPath?: string;
    sceneFolderPath?: string;
    /** @deprecated Map functionality has been deprecated */
    mapFolderPath?: string;
    /** When true, avoid nested Stories/StoryName structure and use a single base */
    enableOneStoryMode?: boolean;
    /** Base folder used when one-story mode is enabled (defaults to 'StorytellerSuite') */
    oneStoryBaseFolder?: string;
     /** Optional override for "today" used in timeline and relative parsing (ISO string yyyy-MM-dd or full ISO) */
     customTodayISO?: string;
     /** Timeline defaults */
     defaultTimelineGroupMode?: 'none' | 'location' | 'group' | 'character';
     defaultTimelineZoomPreset?: 'none' | 'decade' | 'century' | 'fit';
     defaultTimelineStack?: boolean;
     defaultTimelineDensity?: number; // 0..100
     showTimelineLegend?: boolean;
     /** Gantt mode specific settings */
     ganttShowProgressBars?: boolean; // Show progress bar overlays in Gantt view
     ganttDefaultDuration?: number; // Default duration in days for events without end date in Gantt
     ganttArrowStyle?: 'solid' | 'dashed' | 'dotted'; // Arrow style for dependencies
     /** When false (default), block external http/https images. */
     allowRemoteImages?: boolean;
    /** Internal: set after first-run sanitization to avoid repeating it */
    sanitizedSeedData?: boolean;
    /** How to serialize customFields into frontmatter */
    customFieldsMode?: 'flatten' | 'nested';
    /** Internal: set after relationships migration to avoid repeating it */
    relationshipsMigrated?: boolean;
    /** Internal: set after backfilling bidirectional links (v2.0) */
    bidirectionalLinksBackfilled?: boolean;
    /** Internal: last plugin version that repaired stale location entityRefs */
    staleEntityRefsPrunedVersion?: string;
    /** Internal: last plugin version that backfilled top-level entityType frontmatter */
    entityTypeBackfilledVersion?: string;
    /** Network graph view zoom level (saved per session) */
    networkGraphZoom?: number;
    /** Network graph view pan position (saved per session) */
    networkGraphPan?: { x: number; y: number };

    /** Story board settings */
    storyBoardLayout?: 'chapters' | 'timeline' | 'status';
    storyBoardCardWidth?: number;
    storyBoardCardHeight?: number;
    storyBoardColorBy?: 'status' | 'chapter' | 'none';
    storyBoardShowEdges?: boolean;

    /** Map settings */
    enableFrontmatterMarkers?: boolean;
    /** When enabled, location pins open their corresponding map instead of the location note */
    locationPinsOpenMap?: boolean;
    /** Persisted map view states (zoom/center) per map ID */
    mapViewStates?: Record<string, { zoom: number; center: { lat: number; lng: number } }>;
    /** When true, disables global Leaflet exposure to prevent conflicts with standalone Obsidian Leaflet plugin */
    disableLeafletGlobalExposure?: boolean;

    /** Timeline watch settings for vault note inclusion */
    timelineWatchProperty?: string;
    timelineWatchTag?: string;

    /** Timeline & Causality */
    timelineForks?: TimelineFork[];
    causalityLinks?: CausalityLink[];
    timelineConflicts?: TimelineConflict[];
    timelineEras?: TimelineEra[];
    timelineTracks?: TimelineTrack[];
    enableAdvancedTimeline?: boolean;
    autoDetectConflicts?: boolean;

    /** Analytics */
    analyticsEnabled?: boolean;
    analyticsData?: StoryAnalytics;
    writingSessions?: WritingSession[];
    pacingAnalysis?: PacingAnalysis;
    trackWritingSessions?: boolean;

    /** World-Building */
    enableWorldBuilding?: boolean;
    cultureFolderPath?: string;
    economyFolderPath?: string;
    factionFolderPath?: string;
    magicSystemFolderPath?: string;
    groupFolderPath?: string;
    bookFolderPath?: string;
    sessionsFolderPath?: string;

    /** Sensory Profiles */
    enableSensoryProfiles?: boolean;
    sensoryProfiles?: LocationSensoryProfile[];

    /** Dashboard tab visibility - array of tab IDs to hide */
    hiddenDashboardTabs?: string[];

    /** Dashboard tab order - persisted array of tab IDs in user-defined order */
    dashboardTabOrder?: string[];

    /** Show accent borders and color strips in the dashboard UI */
    dashboardAccentBorders?: boolean;

    /** Template system settings */
    templateStorageFolder?: string;
    showBuiltInTemplates?: boolean;
    showCommunityTemplates?: boolean;

    /** Disable automatic folder creation on startup */
    disableAutoFolderCreation?: boolean;
    
    /** Default templates per entity type - template ID keyed by entity type */
    defaultTemplates?: Record<string, string>;

    /** Image tiling settings */
    tiling?: {
        autoGenerateThreshold: number;      // Default: 2000px
        tileSize: number;                   // Default: 256px
        showProgressNotifications: boolean; // Default: true
    };

    // ============================================================
    // Manuscript & Compile System Settings (Longform-inspired)
    // ============================================================
    
    /** Story drafts for manuscript management */
    storyDrafts?: import('./types').StoryDraft[];
    
    /** Currently active draft ID */
    activeDraftId?: string;
    
    /** Compile workflows */
    compileWorkflows?: import('./types').CompileWorkflow[];
    
    /** Default compile workflow name */
    defaultCompileWorkflow?: string;
    
    /** Daily word count goal */
    dailyWordCountGoal?: number;
    
    /** Whether to show word count in status bar */
    showWordCountInStatusBar?: boolean;
    
    /** Whether to notify when word count goal is reached */
    notifyOnGoalReached?: boolean;
    
    /** Whether to count word deletions toward goal */
    countDeletionsForGoal?: boolean;
    
    /** Daily writing statistics */
    dailyWritingStats?: import('./types').DailyWritingStats[];
    
    /** User compile scripts folder path */
    compileScriptsFolder?: string;
    
    /** Default manuscript output folder */
    manuscriptOutputFolder?: string;

    /** User-defined custom compile steps (JavaScript) */
    customCompileSteps?: import('./types').CustomCompileStepDef[];

    /** Whether to prompt when a new .md file appears in the scene folder */
    promptNewSceneFiles?: boolean;

    /** User-defined custom character sheet HTML templates */
    characterSheetTemplates?: import('./utils/CharacterSheetTemplates').CustomSheetTemplate[];
    /** ID of the default character sheet template ('classic' if unset) */
    defaultCharacterSheetTemplateId?: string;
}

/**
 * Default plugin settings - used on first install or when settings are missing
 */
 const DEFAULT_SETTINGS: StorytellerSuiteSettings = {
    stories: [],
    activeStoryId: '',
    galleryUploadFolder: 'StorytellerSuite/GalleryUploads',
    galleryData: { images: [] },
    galleryWatchFolder: '',
    groups: [],
    showTutorial: true,
    hasCompletedOnboarding: false,
    lastSeenReleaseNotesVersion: '',
    language: 'en',
    enableCustomEntityFolders: false,
    storyRootFolderTemplate: '',
    characterFolderPath: '',
    locationFolderPath: '',
    eventFolderPath: '',
    itemFolderPath: '',
    referenceFolderPath: '',
    chapterFolderPath: '',
    sceneFolderPath: '',
    mapFolderPath: '',
    groupFolderPath: '',
    bookFolderPath: '',
    sessionsFolderPath: '',
    enableOneStoryMode: false,
    oneStoryBaseFolder: 'StorytellerSuite',
    customTodayISO: undefined,
    defaultTimelineGroupMode: 'none',
    defaultTimelineZoomPreset: 'none',
    defaultTimelineStack: true,
    defaultTimelineDensity: 50,
    showTimelineLegend: true,
    ganttShowProgressBars: true,
    ganttDefaultDuration: 1,
    ganttArrowStyle: 'solid',
    allowRemoteImages: true,
    sanitizedSeedData: false,
    enableFrontmatterMarkers: false,
    locationPinsOpenMap: false,
    mapViewStates: {},
    customFieldsMode: 'flatten',
    relationshipsMigrated: false,
    bidirectionalLinksBackfilled: false,
    staleEntityRefsPrunedVersion: '',
    entityTypeBackfilledVersion: '',
    timelineWatchProperty: 'timeline-date',
    timelineWatchTag: 'timeline',
    timelineForks: [],
    causalityLinks: [],
    timelineConflicts: [],
    timelineEras: [],
    timelineTracks: [],
    enableAdvancedTimeline: false,
    autoDetectConflicts: true,
    analyticsEnabled: false,
    writingSessions: [],
    trackWritingSessions: false,
    enableWorldBuilding: true,
    cultureFolderPath: '',
    economyFolderPath: '',
    factionFolderPath: '',
    magicSystemFolderPath: '',
    enableSensoryProfiles: true,
    hiddenDashboardTabs: [],
    templateStorageFolder: 'StorytellerSuite/Templates',
    showBuiltInTemplates: true,
    showCommunityTemplates: false,
    disableAutoFolderCreation: false,
    defaultTemplates: {},
    tiling: {
        autoGenerateThreshold: 2000,  // Generate tiles for images > 2000x2000px
        tileSize: 256,                 // Standard tile size
        showProgressNotifications: true // Show progress during generation
    },
    // Manuscript & Compile defaults
    storyDrafts: [],
    activeDraftId: undefined,
    compileWorkflows: [],
    defaultCompileWorkflow: 'reader-draft-workflow',
    dailyWordCountGoal: 1000,
    showWordCountInStatusBar: true,
    notifyOnGoalReached: true,
    countDeletionsForGoal: false,
    dailyWritingStats: [],
    dashboardAccentBorders: false,
    compileScriptsFolder: 'StorytellerSuite/CompileScripts',
    manuscriptOutputFolder: 'StorytellerSuite/Manuscripts',
    disableLeafletGlobalExposure: false,
    characterSheetTemplates: [],
    defaultCharacterSheetTemplateId: 'classic',
    customCompileSteps: [],
    promptNewSceneFiles: true,
}

/**
 * Main plugin class for Storyteller Suite
 * Manages storytelling entities (characters, locations, events) and provides
 * a unified dashboard interface for story management
 */
export default class StorytellerSuitePlugin extends Plugin {
    /** Quick guard to ensure an active story exists before creation actions. */
    private ensureActiveStoryOrGuide(): boolean {
        if (!this.getActiveStory()) {
            new Notice(t('selectOrCreateStoryFirst'));
            return false;
        }
        return true;
    }
    /** Build a resolver using current settings */
    public getFolderResolver(): FolderResolver {
        const options: FolderResolverOptions = {
            enableCustomEntityFolders: this.settings.enableCustomEntityFolders,
            storyRootFolderTemplate: this.settings.storyRootFolderTemplate,
            characterFolderPath: this.settings.characterFolderPath,
            locationFolderPath: this.settings.locationFolderPath,
            eventFolderPath: this.settings.eventFolderPath,
            itemFolderPath: this.settings.itemFolderPath,
            referenceFolderPath: this.settings.referenceFolderPath,
            chapterFolderPath: this.settings.chapterFolderPath,
            sceneFolderPath: this.settings.sceneFolderPath,
            mapFolderPath: this.settings.mapFolderPath,
            cultureFolderPath: this.settings.cultureFolderPath,
            economyFolderPath: this.settings.economyFolderPath,
            factionFolderPath: this.settings.factionFolderPath,
            magicSystemFolderPath: this.settings.magicSystemFolderPath,
            groupFolderPath: this.settings.groupFolderPath,
            bookFolderPath: this.settings.bookFolderPath,
            sessionsFolderPath: this.settings.sessionsFolderPath,
            enableOneStoryMode: this.settings.enableOneStoryMode,
            oneStoryBaseFolder: this.settings.oneStoryBaseFolder,
        };
        return new FolderResolver(options, () => this.getActiveStory());
    }

    /**
     * Normalize custom fields for a loaded entity so UI works from a single source of truth.
     * - Moves non-whitelisted, scalar string keys into `customFields`
     * - Deduplicates keys in a case-insensitive way
     * - Preserves values without overriding existing `customFields` entries
     */
    private normalizeEntityCustomFields<T extends { customFields?: Record<string, string> }>(
        entityType: 'character' | 'location' | 'event' | 'item' | 'map' | 'culture' | 'economy' | 'magicSystem',
        entity: T
    ): T {
        if (!entity) return entity;
        const whitelist = getWhitelistKeys(entityType);
        const reserved = new Set<string>([...whitelist, 'customFields', 'filePath', 'sections', 'id']);
        // Preserve derived section fields so they are not swept into customFields
        const derivedByType: Record<string, string[]> = {
            character: ['description', 'backstory'],
            location: ['description', 'history'],
            event: ['description', 'outcome'],
            item: ['description', 'history'],
            reference: ['content'],
            chapter: ['summary'],
            scene: ['content'],
            map: ['description'],
            culture: ['description', 'values', 'religion', 'socialStructure', 'history', 'namingConventions', 'customs'],
            economy: ['description', 'industries', 'taxation'],
            magicSystem: ['description', 'rules', 'source', 'costs', 'limitations', 'training', 'history']
        };
        for (const k of (derivedByType[entityType] || [])) reserved.add(k);
        const mode = this.settings.customFieldsMode ?? 'flatten';

        const src: Record<string, unknown> = entity as unknown as Record<string, unknown>;
        const currentCustom: Record<string, string> = { ...(entity.customFields || {}) };

        // Sweep non-whitelisted scalar keys into customFields (including null/empty values)
        // This makes manually-added empty fields visible and editable in the modal
        for (const [key, value] of Object.entries(src)) {
            if (reserved.has(key)) continue;

            // Handle null/undefined values - convert to empty string for editing
            if (value === null || value === undefined) {
                const hasConflict = Object.keys(currentCustom).some(k => k.toLowerCase() === key.toLowerCase());
                if (!hasConflict) {
                    currentCustom[key] = ''; // Convert null to empty string for modal editing
                    delete (src as any)[key];
                }
                continue;
            }

            // Handle string values (including empty strings)
            if (typeof value === 'string' && !value.includes('\n')) {
                // Only move if not conflicting (case-insensitive) with existing customFields
                const hasConflict = Object.keys(currentCustom).some(k => k.toLowerCase() === key.toLowerCase());
                if (!hasConflict) {
                    currentCustom[key] = value as string;
                    delete (src as any)[key];
                }
            }
        }

        // Deduplicate case-insensitively within customFields
        const deduped: Record<string, string> = {};
        const seen: Set<string> = new Set();
        for (const [k, v] of Object.entries(currentCustom)) {
            const lower = k.toLowerCase();
            if (seen.has(lower)) continue; // keep first occurrence
            seen.add(lower);
            deduped[k] = v;
        }

        (entity as any).customFields = deduped;
        return entity;
    }

    /** Resolve all folders; if any error, return a summary message for the user. */
    private resolveAllEntityFoldersOrExplain(): { ok: boolean; results: ReturnType<FolderResolver['resolveAll']>; message?: string } {
        const resolver = this.getFolderResolver();
        const results = resolver.resolveAll();
        const errors: string[] = [];
        for (const [k, v] of Object.entries(results)) {
            if ((v as any).error) errors.push(`${k}: ${(v as any).error}`);
        }
        if (errors.length > 0) {
            const message = errors.some(e => e.includes('No active story'))
                ? 'Custom folders reference {story*}, but no active story is selected. Select or create an active story, then rescan.'
                : `Could not resolve some folders:\n${errors.join('\n')}`;
            return { ok: false, results, message };
        }
        return { ok: true, results };
    }
	settings: StorytellerSuiteSettings;
    private folderResolver: FolderResolver | null = null;
    // Removed: Codeblock maps no longer supported
    // private leafletProcessor: LeafletCodeBlockProcessor;
    templateManager: TemplateStorageManager;
    templateNoteManager: TemplateNoteManager;
    trackManager: TimelineTrackManager;
    eraManager: EraManager;
    private warnedMissingNameFiles: Set<string> = new Set();
    private groupVaultSyncTimer: number | null = null;
    private deferredStartupMaintenanceTimer: number | null = null;
    private frontmatterReferenceIndexCache: Map<string, Promise<FrontmatterReferenceIndex>> = new Map();
    private legacyModalLayoutObserver: MutationObserver | null = null;

    /** Word count tracker — Longform-compatible goal tracking */
    wordTracker: WordCountTracker;

    /** Status bar element showing live word count + daily goal */
    private statusBarWordCountEl: HTMLElement | null = null;
    private activeWritingSessionFilePath: string | null = null;
    private writingSessionTransition: Promise<void> = Promise.resolve();

    // Mobile/tablet orientation and resize handlers
    private orientationChangeHandler: (() => void) | null = null;
    private resizeHandler: (() => void) | null = null;

    private isLikelyGroupMarkdownPath(path?: string): boolean {
        if (!path || !path.toLowerCase().endsWith('.md')) return false;
        try {
            const groupFolder = normalizePath(this.getEntityFolder('group'));
            const normalizedPath = normalizePath(path);
            return normalizedPath.startsWith(`${groupFolder}/`);
        } catch {
            return false;
        }
    }

    private scheduleGroupVaultSync(delayMs = 450): void {
        if (this.groupVaultSyncTimer !== null) {
            window.clearTimeout(this.groupVaultSyncTimer);
        }
        this.groupVaultSyncTimer = window.setTimeout(() => {
            this.groupVaultSyncTimer = null;
            void this.syncGroupsFromVault();
        }, delayMs);
    }

    private inferStoryIdFromPath(path: string): string | null {
        try {
            const normalizedPath = normalizePath(path);
            const marker = '/Stories/';
            const markerIdx = normalizedPath.indexOf(marker);
            if (markerIdx === -1) return null;
            const afterStories = normalizedPath.slice(markerIdx + marker.length);
            const storyFolderName = afterStories.split('/')[0];
            if (!storyFolderName) return null;
            const story = this.settings.stories.find(s => s.name === storyFolderName);
            return story?.id ?? null;
        } catch {
            return null;
        }
    }

    /** Sanitize the one-story base folder so it is vault-relative and never a leading slash. */
    private sanitizeBaseFolderPath(input?: string): string {
        if (!input) return '';
        const raw = input.trim();
        if (raw === '/' || raw === '\\') return '';
        const stripped = raw.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '');
        if (!stripped) return '';
        return normalizePath(stripped);
    }

    /** Get the Date object for the plugin's notion of "today" (custom override or system). */
    getReferenceTodayDate(): Date {
        const iso = this.settings.customTodayISO;
        if (iso) {
            // Handle BCE dates (negative years) in ISO format
            const parsed = new Date(iso);
            if (!isNaN(parsed.getTime())) {
                // Validate that the parsed date matches the input for BCE dates
                if (iso.startsWith('-') && parsed.getFullYear() >= 0) {
                    console.warn(`BCE date parsing issue: Input "${iso}" parsed as CE year ${parsed.getFullYear()}`);
                }
                return parsed;
            } else {
                console.warn(`Invalid custom today date: "${iso}". Using system today.`);
            }
        }
        return new Date();
    }

	/**
	 * Helper: Get the currently active story object
	 */
	getActiveStory(): Story | undefined {
		return this.settings.stories.find(s => s.id === this.settings.activeStoryId);
	}

	/**
	 * Helper: Get the folder path for a given entity type in the active story
	 */
    getEntityFolder(type: EntityFolderType, context?: { bookName?: string }): string {
        const resolver = this.getFolderResolver();
        return resolver.getEntityFolder(type, context);
    }

    /**
     * Helper: Get the active story's root folder for story-relative exports and compile steps.
     */
    getStoryRootFolder(): string {
        const resolver = this.getFolderResolver();
        return resolver.getStoryRootFolder();
    }

    private invalidateFrontmatterReferenceIndexes(): void {
        this.frontmatterReferenceIndexCache.clear();
    }

    private stripWikiLinkValue(value: unknown): string | undefined {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const match = trimmed.match(/^\[\[(.*)\]\]$/);
        return (match ? match[1] : trimmed).trim() || undefined;
    }

    private async getRawFrontmatterForFile(file: TFile): Promise<Record<string, unknown> | undefined> {
        const cache = this.app.metadataCache.getFileCache(file);
        const cachedFrontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (cachedFrontmatter && Object.keys(cachedFrontmatter).length > 0) {
            return cachedFrontmatter;
        }
        try {
            const content = await this.app.vault.cachedRead(file);
            return parseFrontmatterFromContent(content);
        } catch {
            return cachedFrontmatter;
        }
    }

    private async getReferenceScanPaths(entityType: EntityFolderType): Promise<string[]> {
        const resolver = this.getFolderResolver();
        const paths = new Set<string>();
        const addPath = (path?: string) => {
            if (!path) return;
            paths.add(normalizePath(path).replace(/\/+$/, ''));
        };

        if (entityType === 'chapter' && resolver.usesBookName('chapter')) {
            addPath(resolver.getEntityFolder('chapter', { bookName: '' }));
            const books = await this.listBooks().catch(() => [] as Book[]);
            books.forEach(book => addPath(resolver.getEntityFolder('chapter', { bookName: book.name })));
            return Array.from(paths);
        }

        if (entityType === 'scene' && resolver.usesBookName('scene')) {
            addPath(resolver.getEntityFolder('scene', { bookName: '' }));
            const books = await this.listBooks().catch(() => [] as Book[]);
            books.forEach(book => addPath(resolver.getEntityFolder('scene', { bookName: book.name })));
            return Array.from(paths);
        }

        addPath(this.getEntityFolder(entityType));
        return Array.from(paths);
    }

    private upgradeLegacyModalLayouts(root: ParentNode = document.body): void {
        const containers = root instanceof HTMLElement && root.matches('.modal-content')
            ? [root]
            : Array.from(root.querySelectorAll?.('.modal-content') ?? []) as HTMLElement[];

        for (const contentEl of containers) {
            if (!(contentEl instanceof HTMLElement)) continue;
            const modalEl = contentEl.closest('.modal') as HTMLElement | null;
            if (!modalEl) continue;
            upgradeLegacyModalLayout(contentEl, modalEl);
        }
    }

    private startLegacyModalLayoutObserver(): void {
        this.legacyModalLayoutObserver?.disconnect();
        this.legacyModalLayoutObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of Array.from(mutation.addedNodes)) {
                    if (!(node instanceof HTMLElement)) continue;
                    if (node.matches('.modal-content')) {
                        this.upgradeLegacyModalLayouts(node);
                        continue;
                    }
                    this.upgradeLegacyModalLayouts(node);
                }
            }
        });
        this.legacyModalLayoutObserver.observe(document.body, { childList: true, subtree: true });
        this.upgradeLegacyModalLayouts(document.body);
    }

    private async getFrontmatterReferenceIndex(entityType: EntityFolderType): Promise<FrontmatterReferenceIndex> {
        const cacheKey = `${this.getActiveStory()?.id ?? 'no-story'}:${entityType}`;
        const cached = this.frontmatterReferenceIndexCache.get(cacheKey);
        if (cached) return cached;

        const promise = (async (): Promise<FrontmatterReferenceIndex> => {
            const idToName = new Map<string, string>();
            const nameToId = new Map<string, string>();
            const lowerNameToId = new Map<string, string>();

            const addEntry = (nameValue: unknown, idValue?: unknown) => {
                const name = this.stripWikiLinkValue(nameValue);
                if (!name) return;
                const id = this.stripWikiLinkValue(idValue) ?? name;
                if (!idToName.has(id)) idToName.set(id, name);
                if (!nameToId.has(name)) nameToId.set(name, id);
                const lower = name.toLowerCase();
                if (!lowerNameToId.has(lower)) lowerNameToId.set(lower, id);
            };

            if (entityType === 'group') {
                this.getGroups().forEach(group => addEntry(group.name, group.id));
                return { idToName, nameToId, lowerNameToId };
            }

            const scanPaths = await this.getReferenceScanPaths(entityType);
            if (scanPaths.length === 0) return { idToName, nameToId, lowerNameToId };

            const files = this.app.vault.getMarkdownFiles().filter(file => {
                const path = normalizePath(file.path);
                return scanPaths.some(folder => path.startsWith(`${folder}/`));
            });

            for (const file of files) {
                const frontmatter = await this.getRawFrontmatterForFile(file);
                const name = frontmatter?.['name'] ?? file.basename;
                const id = frontmatter?.['id'];
                addEntry(name, id);
            }

            return { idToName, nameToId, lowerNameToId };
        })();

        this.frontmatterReferenceIndexCache.set(cacheKey, promise);
        return promise;
    }

    private async resolveFrontmatterReferenceName(
        entityType: EntityFolderType,
        rawValue: unknown,
        fallbackName?: unknown
    ): Promise<string | undefined> {
        const value = this.stripWikiLinkValue(rawValue);
        const fallback = this.stripWikiLinkValue(fallbackName);
        const index = await this.getFrontmatterReferenceIndex(entityType);

        const fromName = (candidate: string): string | undefined => {
            const resolvedId =
                index.nameToId.get(candidate) ??
                index.lowerNameToId.get(candidate.toLowerCase());
            if (!resolvedId) return undefined;
            return index.idToName.get(resolvedId) ?? candidate;
        };

        if (value) {
            if (index.idToName.has(value)) return index.idToName.get(value);
            const named = fromName(value);
            if (named) return named;
        }
        if (fallback) {
            if (index.idToName.has(fallback)) return index.idToName.get(fallback);
            const named = fromName(fallback);
            if (named) return named;
        }
        return value ?? fallback ?? undefined;
    }

    private async resolveFrontmatterReferenceId(
        entityType: EntityFolderType,
        rawValue: unknown,
        fallbackName?: unknown
    ): Promise<string | undefined> {
        const value = this.stripWikiLinkValue(rawValue);
        const fallback = this.stripWikiLinkValue(fallbackName);
        const index = await this.getFrontmatterReferenceIndex(entityType);

        const fromName = (candidate: string): string | undefined =>
            index.nameToId.get(candidate) ??
            index.lowerNameToId.get(candidate.toLowerCase());

        if (value) {
            if (index.idToName.has(value)) return value;
            const resolved = fromName(value);
            if (resolved) return resolved;
        }
        if (fallback) {
            if (index.idToName.has(fallback)) return fallback;
            const resolved = fromName(fallback);
            if (resolved) return resolved;
        }
        return value ?? fallback ?? undefined;
    }

    private async serializeFrontmatterEntityReferences(
        source: Record<string, unknown>
    ): Promise<{ source: Record<string, unknown>; omitOriginalKeys: Set<string> }> {
        this.invalidateFrontmatterReferenceIndexes();
        const serialized: Record<string, unknown> = { ...source };
        const omitOriginalKeys = new Set<string>();

        for (const config of FRONTMATTER_REFERENCE_FIELDS) {
            if (config.kind === 'scalar') {
                const currentValue = serialized[config.field];
                const mirrorValue = config.mirrorField ? serialized[config.mirrorField] : undefined;
                if (currentValue === undefined && mirrorValue === undefined) continue;
                const resolvedName = await this.resolveFrontmatterReferenceName(
                    config.entityType,
                    currentValue,
                    mirrorValue
                );
                if (resolvedName) {
                    serialized[config.field] = resolvedName;
                    if (config.mirrorField) {
                        delete serialized[config.mirrorField];
                        omitOriginalKeys.add(config.mirrorField);
                    }
                }
                continue;
            }

            const rawArray = Array.isArray(serialized[config.field]) ? serialized[config.field] as unknown[] : [];
            const mirrorArray = config.mirrorField && Array.isArray(serialized[config.mirrorField])
                ? serialized[config.mirrorField] as unknown[]
                : [];
            if (rawArray.length === 0 && mirrorArray.length === 0) continue;

            const resolvedValues: string[] = [];
            const maxLength = Math.max(rawArray.length, mirrorArray.length);
            for (let index = 0; index < maxLength; index++) {
                const resolvedName = await this.resolveFrontmatterReferenceName(
                    config.entityType,
                    rawArray[index],
                    mirrorArray[index]
                );
                if (resolvedName) {
                    resolvedValues.push(resolvedName);
                }
            }

            serialized[config.field] = resolvedValues;
            if (config.mirrorField) {
                delete serialized[config.mirrorField];
                omitOriginalKeys.add(config.mirrorField);
            }
        }

        for (const field of FRONTMATTER_LINK_ONLY_SCALAR_FIELDS) {
            const stripped = this.stripWikiLinkValue(serialized[field]);
            if (stripped) serialized[field] = stripped;
        }

        for (const config of FRONTMATTER_OBJECT_REFERENCE_FIELDS) {
            if (!Array.isArray(serialized[config.field])) continue;
            const entries = serialized[config.field] as unknown[];
            serialized[config.field] = await Promise.all(entries.map(async (entry) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
                const clone = { ...(entry as Record<string, unknown>) };
                const lookupType =
                    typeof config.entityType === 'function'
                        ? config.entityType(clone as Record<string, any>)
                        : config.entityType;
                const currentValue = clone[config.idKey];
                const mirrorValue = config.nameKey ? clone[config.nameKey] : undefined;
                if (!lookupType) {
                    const stripped = this.stripWikiLinkValue(currentValue);
                    if (stripped) clone[config.idKey] = stripped;
                    return clone;
                }

                const resolvedName = await this.resolveFrontmatterReferenceName(
                    lookupType,
                    currentValue,
                    mirrorValue
                );
                if (resolvedName) {
                    clone[config.idKey] = `[[${resolvedName}]]`;
                    if (config.nameKey) delete clone[config.nameKey];
                } else {
                    const stripped = this.stripWikiLinkValue(currentValue);
                    if (stripped) clone[config.idKey] = stripped;
                }
                return clone;
            }));
        }

        return { source: serialized, omitOriginalKeys };
    }

    private async normalizeFrontmatterEntityReferences(data: Record<string, unknown>): Promise<void> {
        for (const field of WIKI_LINK_ARRAY_FIELDS) {
            if (Array.isArray(data[field])) {
                data[field] = (data[field] as unknown[])
                    .map(value => this.stripWikiLinkValue(value))
                    .filter((value): value is string => Boolean(value));
            }
        }

        for (const field of WIKI_LINK_SCALAR_FIELDS) {
            const stripped = this.stripWikiLinkValue(data[field]);
            if (stripped) data[field] = stripped;
        }

        for (const field of FRONTMATTER_LINK_ONLY_SCALAR_FIELDS) {
            const stripped = this.stripWikiLinkValue(data[field]);
            if (stripped) data[field] = stripped;
        }

        for (const config of FRONTMATTER_REFERENCE_FIELDS) {
            if (config.kind === 'scalar') {
                const currentValue = data[config.field];
                const mirrorValue = config.mirrorField ? data[config.mirrorField] : undefined;
                if (currentValue === undefined && mirrorValue === undefined) continue;
                const resolvedId = await this.resolveFrontmatterReferenceId(
                    config.entityType,
                    currentValue,
                    mirrorValue
                );
                const resolvedName = await this.resolveFrontmatterReferenceName(
                    config.entityType,
                    currentValue,
                    mirrorValue
                );
                if (resolvedId) data[config.field] = resolvedId;
                if (config.mirrorField && resolvedName) data[config.mirrorField] = resolvedName;
                continue;
            }

            const rawArray = Array.isArray(data[config.field]) ? data[config.field] as unknown[] : [];
            const mirrorArray = config.mirrorField && Array.isArray(data[config.mirrorField])
                ? data[config.mirrorField] as unknown[]
                : [];
            if (rawArray.length === 0 && mirrorArray.length === 0) continue;

            const resolvedIds: string[] = [];
            const resolvedNames: string[] = [];
            const maxLength = Math.max(rawArray.length, mirrorArray.length);
            for (let index = 0; index < maxLength; index++) {
                const resolvedId = await this.resolveFrontmatterReferenceId(
                    config.entityType,
                    rawArray[index],
                    mirrorArray[index]
                );
                const resolvedName = await this.resolveFrontmatterReferenceName(
                    config.entityType,
                    rawArray[index],
                    mirrorArray[index]
                );
                if (resolvedId) resolvedIds.push(resolvedId);
                if (resolvedName) resolvedNames.push(resolvedName);
            }

            data[config.field] = resolvedIds;
            if (config.mirrorField) data[config.mirrorField] = resolvedNames;
        }

        for (const config of FRONTMATTER_OBJECT_REFERENCE_FIELDS) {
            if (!Array.isArray(data[config.field])) continue;
            const entries = data[config.field] as unknown[];
            data[config.field] = await Promise.all(entries.map(async (entry) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
                const clone = { ...(entry as Record<string, unknown>) };
                const lookupType =
                    typeof config.entityType === 'function'
                        ? config.entityType(clone as Record<string, any>)
                        : config.entityType;
                const currentValue = clone[config.idKey];
                const mirrorValue = config.nameKey ? clone[config.nameKey] : undefined;
                const strippedValue = this.stripWikiLinkValue(currentValue);
                if (strippedValue) clone[config.idKey] = strippedValue;
                if (config.nameKey) {
                    const strippedMirror = this.stripWikiLinkValue(mirrorValue);
                    if (strippedMirror) clone[config.nameKey] = strippedMirror;
                }
                if (!lookupType) return clone;

                const resolvedId = await this.resolveFrontmatterReferenceId(
                    lookupType,
                    clone[config.idKey],
                    config.nameKey ? clone[config.nameKey] : undefined
                );
                const resolvedName = await this.resolveFrontmatterReferenceName(
                    lookupType,
                    clone[config.idKey],
                    config.nameKey ? clone[config.nameKey] : undefined
                );
                if (resolvedId) clone[config.idKey] = resolvedId;
                if (config.nameKey && resolvedName) clone[config.nameKey] = resolvedName;
                return clone;
            }));
        }
    }

    /**
     * Ensure One Story Mode has a seeded story and folders immediately when enabled or base folder changes.
     */
    async initializeOneStoryModeIfNeeded(): Promise<void> {
        if (!this.settings.enableOneStoryMode) return;
        // Seed a default story if none exist
        if ((this.settings.stories?.length ?? 0) === 0) {
            const story = await this.createStory('Single Story', 'Auto-created for One Story Mode');
            this.settings.activeStoryId = story.id;
            await this.saveSettings();
        } else if (!this.getActiveStory()) {
            // If stories exist but none active, pick the first
            const first = this.settings.stories[0];
            if (first) {
                await this.setActiveStory(first.id);
            }
        }

        // Ensure entity folders exist under the current base (unless disabled)
        if (!this.settings.disableAutoFolderCreation) {
            try {
                await this.ensureFolder(this.getEntityFolder('character'));
                await this.ensureFolder(this.getEntityFolder('location'));
                await this.ensureFolder(this.getEntityFolder('event'));
                await this.ensureFolder(this.getEntityFolder('item'));
                await this.ensureFolder(this.getEntityFolder('reference'));
                await this.ensureFolder(this.getEntityFolder('chapter'));
                await this.ensureFolder(this.getEntityFolder('scene'));
                await this.ensureFolder(this.getEntityFolder('group'));
            } catch (e) {
                // Best-effort; errors will surface via Notice in ensureFolder
            }
        }

        // Refresh dashboard if open
        this.refreshDashboardActiveTab();
    }

    /**
     * Produce a filesystem-safe folder name for a story
     */
    private slugifyFolderName(name: string): string {
        if (!name) return '';
        return name
            .replace(/[\\/:"*?<>|#^[\]{}]+/g, '') // remove invalid path chars
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/\s/g, '_');
    }

	/**
	 * Create a new story, add it to settings, and set as active
	 */
    async createStory(name: string, description?: string): Promise<Story> {
		// Generate unique id
		const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
		const created = new Date().toISOString();
		const story: Story = { id, name, created, description };
		this.settings.stories.push(story);
		this.settings.activeStoryId = id;
		await this.saveSettings();
        // Ensure folders using resolver so all modes are respected (custom, one-story, default)
        // Skip if auto folder creation is disabled
        if (!this.settings.disableAutoFolderCreation) {
            await this.ensureFolder(this.getEntityFolder('character'));
            await this.ensureFolder(this.getEntityFolder('location'));
            await this.ensureFolder(this.getEntityFolder('event'));
            await this.ensureFolder(this.getEntityFolder('item'));
            await this.ensureFolder(this.getEntityFolder('reference'));
            await this.ensureFolder(this.getEntityFolder('chapter'));
            await this.ensureFolder(this.getEntityFolder('scene'));
        }
		return story;
	}

	/**
	 * Switch the active story by id
	 */
	async setActiveStory(storyId: string): Promise<void> {
		if (this.settings.stories.find(s => s.id === storyId)) {
			this.settings.activeStoryId = storyId;
			await this.saveSettings();
		} else {
			throw new Error('Story not found');
		}
	}

	/**
	 * Update an existing story's name and description
	 */
	async updateStory(storyId: string, name: string, description?: string): Promise<void> {
		const story = this.settings.stories.find(s => s.id === storyId);
		if (!story) {
			throw new Error('Story not found');
		}

		const oldName = story.name;

		// If the name changed, we need to rename the story folders
		if (oldName !== name) {
			const oldStoryPath = `StorytellerSuite/Stories/${oldName}`;
			const newStoryPath = `StorytellerSuite/Stories/${name}`;

			// Check if the old story folder exists
			const oldFolder = this.app.vault.getAbstractFileByPath(oldStoryPath);
			if (oldFolder && oldFolder instanceof TFolder) {
				try {
					// Rename the story folder
					await this.app.fileManager.renameFile(oldFolder, newStoryPath);
				} catch (error) {
					console.error(`Error renaming story folder from ${oldStoryPath} to ${newStoryPath}:`, error);
					throw new Error(`Failed to rename story folder: ${error}`);
				}
			}
		}

		// Update the story name and description in memory
		story.name = name;
		story.description = description;
		await this.saveSettings();
	}

	/**
	 * Migrate legacy string relationships to typed TypedRelationship format
	 * This runs once per vault on plugin upgrade
	 */
	async migrateRelationshipsToTyped(): Promise<void> {
		console.log('Storyteller Suite: Starting relationships migration to typed format...');
		
		try {
			const characters = await this.listCharacters();
			let migratedCount = 0;

			for (const char of characters) {
				let needsSave = false;

				// Migrate relationships field
				if (char.relationships && Array.isArray(char.relationships) && char.relationships.length > 0) {
					// Check if any relationships are plain strings
					const hasStringRelationships = char.relationships.some(rel => typeof rel === 'string');
					
					if (hasStringRelationships) {
						// Initialize connections if not present
						if (!char.connections) {
							char.connections = [];
						}

						// Convert string relationships to typed connections
						char.relationships.forEach(rel => {
							if (typeof rel === 'string') {
								// Add as neutral connection if not already in connections
								const alreadyExists = char.connections?.some(c => c.target === rel);
								if (!alreadyExists) {
									char.connections?.push({
										target: rel,
										type: 'neutral',
										label: undefined
									});
								}
							} else {
								// Already typed, add to connections if not there
								const alreadyExists = char.connections?.some(c => c.target === rel.target);
								if (!alreadyExists) {
									char.connections?.push(rel);
								}
							}
						});

						needsSave = true;
					}
				}

				if (needsSave) {
					await this.saveCharacter(char);
					migratedCount++;
				}
			}

			if (migratedCount > 0) {
				console.log(`Storyteller Suite: Migrated ${migratedCount} character(s) to typed relationships.`);
			} else {
				console.log('Storyteller Suite: No migration needed for relationships.');
			}
		} catch (error) {
			console.error('Storyteller Suite: Error during relationships migration:', error);
		}
	}

	/**
	 * Backfill bidirectional relationships for all entities
	 * Ensures consistency of links (e.g. Item owner ↔ Character ownedItems)
	 * Runs once on update to v2.0
	 */
	async backfillBidirectionalRelationships(): Promise<void> {
		console.log('Storyteller Suite: Starting bidirectional link backfill...');
		
		const { EntitySyncService } = await import('./services/EntitySyncService');
		const syncService = new EntitySyncService(this);
		let updatedCount = 0;

		try {
			// Sync Characters
			const characters = await this.listCharacters();
			for (const entity of characters) {
				await syncService.syncEntity('character', entity);
				updatedCount++;
			}

			// Sync Locations
			const locations = await this.listLocations();
			for (const entity of locations) {
				await syncService.syncEntity('location', entity);
				updatedCount++;
			}

			// Sync Events
			const events = await this.listEvents();
			for (const entity of events) {
				await syncService.syncEntity('event', entity);
				updatedCount++;
			}

			// Sync Items
			const items = await this.listPlotItems();
			for (const entity of items) {
				await syncService.syncEntity('item', entity);
				updatedCount++;
			}

			// Sync Scenes
			const scenes = await this.listScenes();
			for (const entity of scenes) {
				await syncService.syncEntity('scene', entity);
				updatedCount++;
			}

            // Sync Cultures
            const cultures = await this.listCultures();
            for (const entity of cultures) {
                await syncService.syncEntity('culture', entity);
                updatedCount++;
            }

            // Sync Economies
            const economies = await this.listEconomies();
            for (const entity of economies) {
                await syncService.syncEntity('economy', entity);
                updatedCount++;
            }

            // Sync Magic Systems
            const magicSystems = await this.listMagicSystems();
            for (const entity of magicSystems) {
                await syncService.syncEntity('magicsystem', entity);
                updatedCount++;
            }

			console.log(`Storyteller Suite: Backfill complete. Processed ${updatedCount} entities.`);
            new Notice(`Storyteller: Updated links for ${updatedCount} entities.`);
		} catch (error) {
			console.error('Storyteller Suite: Error during bidirectional backfill:', error);
		}
	}

	/**
	 * Plugin initialization - called when the plugin is loaded
	 * Registers views, commands, UI elements, and mobile adaptations
	 */
	async onload() {
		await this.loadSettings();

		// Initialize word count tracker
        this.wordTracker = new WordCountTracker(this);
        this.startLegacyModalLayoutObserver();
        this.initWritingTracking();

		// Status bar word count (Longform-compatible)
		if (this.settings.showWordCountInStatusBar !== false) {
			this.initStatusBar();
		}

		// Conditionally expose Leaflet to global scope to prevent conflicts with standalone Obsidian Leaflet plugin
		// Only expose if not explicitly disabled in settings (defaults to false for backward compatibility)
		if (!this.settings.disableLeafletGlobalExposure) {
			(window as any).L = L;
		}

		// Initialize locale from settings
		setLocale(this.settings.language);

		// Initialize template manager
		this.templateManager = new TemplateStorageManager(
			this.app,
			this.settings.templateStorageFolder || 'StorytellerSuite/Templates',
			this.settings.disableAutoFolderCreation || false
		);
		await this.templateManager.initialize();

		// Initialize template note manager
		this.templateNoteManager = new TemplateNoteManager(
			this.app,
			this.templateManager,
			`${this.settings.templateStorageFolder || 'StorytellerSuite/Templates'}/Notes`,
			this.settings.disableAutoFolderCreation || false
		);

		// Connect note manager to storage manager
		this.templateManager.setTemplateNoteManager(this.templateNoteManager);

		// Register file watcher to sync note changes to JSON
		this.registerEvent(
			this.app.vault.on('modify', async (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					// Check if this is a template note
					const notesFolder = `${this.settings.templateStorageFolder || 'StorytellerSuite/Templates'}/Notes`;
					if (file.path.startsWith(notesFolder)) {
						// Sync note changes to JSON
						try {
							await this.templateNoteManager.handleNoteChange(file);
						} catch (error) {
							console.error('Error syncing template note:', error);
						}
					}
				}
			})
		);

		// Initialize timeline managers
		this.trackManager = new TimelineTrackManager(this);
		this.eraManager = new EraManager(this);

		// Initialize default tracks if none exist
		await this.trackManager.initializeDefaultTracks();

		// Apply mobile CSS classes to the document body
		this.applyMobilePlatformClasses();

		// Removed: Codeblock maps no longer supported - use MapView instead
		// Initialize and register Leaflet code block processor
		// this.leafletProcessor = new LeafletCodeBlockProcessor(this);
		// this.leafletProcessor.register();

		// Register the main dashboard view with Obsidian's workspace
		this.registerView(
			VIEW_TYPE_DASHBOARD,
			(leaf) => new DashboardView(leaf, this)
		);

		// Register the network graph view for expanded visualization
		this.registerView(
			VIEW_TYPE_NETWORK_GRAPH,
			(leaf) => new NetworkGraphView(leaf, this)
		);

		// Register the timeline panel view for persistent timeline access
		this.registerView(
			VIEW_TYPE_TIMELINE,
			(leaf) => new TimelineView(leaf, this)
		);

		// Register the analytics dashboard view for writing insights
		this.registerView(
			VIEW_TYPE_ANALYTICS,
			(leaf) => new AnalyticsDashboardView(leaf, this)
		);

		// Register the map view for interactive map visualization
		this.registerView(
			VIEW_TYPE_MAP,
			(leaf) => new MapView(leaf, this)
		);

		// Register the writing panel view (Board / Arc / Heatmap / Holes)
		this.registerView(
			VIEW_TYPE_WRITING_PANEL,
			(leaf) => new WritingPanelView(leaf, this)
		);

		// Register campaign play view and scene graph view
		this.registerView(VIEW_TYPE_CAMPAIGN, (leaf) => new CampaignView(leaf, this));
		this.registerView(VIEW_TYPE_SCENE_GRAPH, (leaf) => new SceneGraphView(leaf, this));

		// DEPRECATED: Map functionality has been deprecated
		// Register the map editor view for full-screen map editing
		// this.registerView(
		// 	VIEW_TYPE_MAP_EDITOR,
		// 	(leaf) => new MapEditorView(leaf, this)
		// );

		// Add ribbon icon for quick access to dashboard
		this.addRibbonIcon('book-open', 'Open storyteller dashboard', () => {
			this.activateView();
		}).addClass('storyteller-suite-ribbon-class');

		// Add ribbon icon for campaign view
		this.addRibbonIcon('swords', 'Open campaign view', () => {
			this.activateCampaignView();
		});

		// Add ribbon icon for template library
		this.addRibbonIcon('layers', 'Apply template to story', async () => {
			const { TemplateLibraryModal } = await import('./modals/TemplateLibraryModal');
			new TemplateLibraryModal(this.app, this).open();
		}).addClass('storyteller-suite-template-ribbon');

		// Register command palette commands
		this.registerCommands();

		// Add settings tab for user configuration
		this.addSettingTab(new StorytellerSuiteSettingTab(this.app, this));

		// Register interactive widget for ```ledger fenced blocks
		this.registerEditorExtension(createLedgerViewExtension(this.app));
		registerLedgerBlockProcessor(this.app, this);

		// Register display widgets for ```branch and ```encounter fenced blocks
		this.registerEditorExtension(createBranchViewExtension());
		registerBranchBlockProcessors(this.app, this);

		// Track vault renames to keep gallery filePath references up to date
		this.registerEvent(
			this.app.vault.on('rename', async (file, oldPath) => {
				if (!this.settings.galleryData?.images) return;
				let changed = false;
				for (const img of this.settings.galleryData.images) {
					if (img.filePath === oldPath) {
						img.filePath = file.path;
						changed = true;
					}
				}
				if (changed) await this.saveSettings();
			})
		);

		// Auto-add new images dropped into the watch folder
		this.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.isGalleryManagedImageFile(file)) return;
				await this.syncGalleryImageRecord(file);
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', async (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.isGalleryManagedPath(file.path)) return;
				const before = this.settings.galleryData?.images?.length ?? 0;
				if (!this.settings.galleryData?.images?.length) return;
				this.settings.galleryData.images = this.settings.galleryData.images.filter(img => img.filePath !== file.path);
				if ((this.settings.galleryData.images.length ?? 0) !== before) {
					await this.saveSettings();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on('rename', async (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				if (!this.isGalleryImageExtension(file.extension)) return;
				if (this.isGalleryManagedPath(oldPath) || this.isGalleryManagedPath(file.path)) {
					await this.syncGalleryImageRecord(file);
				}
			})
		);

		// Detect new .md files in the scene folder and offer to add as a scene
		this.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				if (!this.settings.promptNewSceneFiles) return;
				if (!this.getActiveStory()) return;

				const sceneFolder = this.getEntityFolder('scene');
				if (!file.path.startsWith(sceneFolder + '/')) return;

				// Small delay for metadata cache to settle
				await new Promise<void>(resolve => setTimeout(resolve, 600));

				const sceneRefs = (this.settings.storyDrafts ?? []).flatMap(d => d.sceneOrder ?? []);
				const trackedIds = new Set(
					sceneRefs
						.map(ref => String(ref.sceneId ?? '').trim())
						.filter(Boolean)
				);

				const cache = this.app.metadataCache.getFileCache(file);
				const frontmatter = cache?.frontmatter ?? {};
				const sceneId = typeof frontmatter.id === 'string' ? frontmatter.id.trim() : '';
				const sceneName = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : file.basename;
				const normalizedPath = normalizePath(file.path);

				// Skip if already tracked in any draft by id, name, or exact file path.
				const tracked = trackedIds.has(sceneId)
					|| trackedIds.has(sceneName)
					|| trackedIds.has(file.basename)
					|| trackedIds.has(normalizedPath);
				if (tracked) return;

				await this.promptAddAsScene(file);
			})
		);

		// Keep settings.groups in sync when group markdown notes are created/edited outside the plugin UI.
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				if (this.isLikelyGroupMarkdownPath(file.path)) this.scheduleGroupVaultSync();
			})
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				if (this.isLikelyGroupMarkdownPath(file.path)) this.scheduleGroupVaultSync();
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				if (this.isLikelyGroupMarkdownPath(file.path)) this.scheduleGroupVaultSync();
			})
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				const newPath = file instanceof TFile ? file.path : '';
				if (this.isLikelyGroupMarkdownPath(oldPath) || this.isLikelyGroupMarkdownPath(newPath)) {
					this.scheduleGroupVaultSync();
				}
			})
		);

		// Perform story discovery and ensure one-story seeding after workspace is ready
		this.app.workspace.onLayoutReady(async () => {
			await this.discoverExistingStories();
			await this.initializeOneStoryModeIfNeeded();

			// Set up mobile/tablet orientation and resize handlers
			this.setupMobileOrientationHandlers();

            await this.maybeShowStartupGuides();
            this.scheduleDeferredStartupMaintenance();
		});
	}

	/**
	 * Private helper method that contains the core story discovery logic
	 * Scans for story folders, filters new ones, and updates settings
	 * @param options Configuration options for discovery behavior
	 * @returns Object containing discovered stories and operation results
	 */
	private async performStoryDiscovery(options: {
		isInitialDiscovery?: boolean;
		logPrefix?: string;
		showDetailedLogs?: boolean;
	} = {}): Promise<{ newStories: Story[]; totalStories: number; error?: string }> {
        const { isInitialDiscovery = false, logPrefix = 'Storyteller Suite' } = options;
		
		// In one-story mode users may not have a Stories/ folder at all.
		// Keep discovery logic as-is so it remains a no-op in that case.
		const baseStoriesPath = 'StorytellerSuite/Stories';
		const storiesFolder = this.app.vault.getAbstractFileByPath(normalizePath(baseStoriesPath));

		if (storiesFolder instanceof TFolder) {
			const newStories: Story[] = [];
			const subFolders = storiesFolder.children.filter(child => child instanceof TFolder) as TFolder[];

			for (const storyFolder of subFolders) {
				const storyName = storyFolder.name;
				// Only add stories that don't already exist
				if (!this.settings.stories.some(s => s.name === storyName)) {
					const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
					const created = new Date().toISOString();
					const story: Story = { id, name: storyName, created, description: 'Discovered from filesystem' };
					newStories.push(story);
				}
			}

			if (newStories.length > 0) {
				this.settings.stories.push(...newStories);
				
				// Set the first discovered story as active if no active story is set (initial discovery only)
				if (isInitialDiscovery && !this.settings.activeStoryId && this.settings.stories.length > 0) {
					this.settings.activeStoryId = this.settings.stories[0].id;
				}
				
				await this.saveSettings();
			}
			
			return { newStories, totalStories: this.settings.stories.length };
		} else if (storiesFolder === null) {
			const message = `Stories folder does not exist at ${baseStoriesPath}`;
			// Continue to alternate discovery paths below instead of returning immediately
			// return { newStories: [], totalStories: this.settings.stories.length, error: message };
		} else {
			const message = `Path exists but is not a folder: ${baseStoriesPath}`;
			return { newStories: [], totalStories: this.settings.stories.length, error: message };
		}

		// --- Alternate discovery: Custom folder mode with story templates ---
		try {
			if (this.settings.enableCustomEntityFolders && this.settings.storyRootFolderTemplate) {
				const tpl = this.settings.storyRootFolderTemplate;
				const hasPlaceholder = tpl.includes('{storyName}') || tpl.includes('{storySlug}') || tpl.includes('{storyId}');
				if (hasPlaceholder) {
					// Determine parent folder path before the first placeholder
					const idx = Math.min(
						...['{storyName}','{storySlug}','{storyId}']
							.map(tok => {
								const i = tpl.indexOf(tok);
								return i === -1 ? Number.POSITIVE_INFINITY : i;
							})
					);
					const before = idx === Number.POSITIVE_INFINITY ? tpl : tpl.slice(0, idx);
					const parent = before.endsWith('/') ? before.slice(0, -1) : before;
					const parentPath = parent.includes('/') ? parent : parent; // already normalized-ish
					const parentFolder = this.app.vault.getAbstractFileByPath(normalizePath(parentPath));
					if (parentFolder instanceof TFolder) {
						const subFolders = parentFolder.children.filter(c => c instanceof TFolder) as TFolder[];
						const newlyAdded: Story[] = [];
						for (const f of subFolders) {
							// Use folder name as story name; ensure uniqueness by id
							if (!this.settings.stories.some(s => s.name === f.name)) {
								const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
								const story: Story = { id, name: f.name, created: new Date().toISOString() };
								this.settings.stories.push(story);
								newlyAdded.push(story);
							}
						}
						if (newlyAdded.length > 0) {
							// Set first discovered as active if none
							if (isInitialDiscovery && !this.settings.activeStoryId) {
								this.settings.activeStoryId = this.settings.stories[0].id;
							}
							await this.saveSettings();
							return { newStories: newlyAdded, totalStories: this.settings.stories.length };
						}
					}
				}
			}
		} catch (e) {
			console.warn('Storyteller Suite: Custom-folder discovery failed', e);
		}

		// --- Alternate discovery: One-story mode with existing content ---
        try {
            if (this.settings.enableOneStoryMode) {
                const baseSanitized = this.sanitizeBaseFolderPath(this.settings.oneStoryBaseFolder || 'StorytellerSuite');
                // If no stories exist, create the default one regardless of existing files
                if ((this.settings.stories?.length ?? 0) === 0) {
                    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
                    const story: Story = { id, name: 'Single Story', created: new Date().toISOString() };
                    this.settings.stories.push(story);
                    this.settings.activeStoryId = id;
                    await this.saveSettings();
                    // Ensure folders even if base doesn't exist yet (unless disabled)
                    if (!this.settings.disableAutoFolderCreation) {
                        try {
                            await this.ensureFolder(this.getEntityFolder('character'));
                            await this.ensureFolder(this.getEntityFolder('location'));
                            await this.ensureFolder(this.getEntityFolder('event'));
                            await this.ensureFolder(this.getEntityFolder('item'));
                            await this.ensureFolder(this.getEntityFolder('reference'));
                            await this.ensureFolder(this.getEntityFolder('chapter'));
                            await this.ensureFolder(this.getEntityFolder('scene'));
                        } catch {}
                    }
                    return { newStories: [story], totalStories: this.settings.stories.length };
                }
            }
        } catch (e) {
			console.warn('Storyteller Suite: One-story discovery failed', e);
		}

		return { newStories: [], totalStories: this.settings.stories.length };
	}

	/**
	 * Discover and import existing story folders from the vault
	 * Called after workspace is ready to ensure file system is available
	 */
	async discoverExistingStories(): Promise<void> {
		try {
			const result = await this.performStoryDiscovery({
				isInitialDiscovery: true,
				logPrefix: 'Storyteller Suite'
			});
			
			if (result.newStories.length > 0) {
				new Notice(`Storyteller: Auto-detected and imported ${result.newStories.length} new story folder(s).`);
			}
		} catch (error) {
			console.error('Storyteller Suite: Error during story discovery:', error);
			new Notice(`Storyteller Suite: Error discovering stories: ${error.message}`);
		}
	}

	/**
	 * Manually refresh story discovery - can be called by user
	 * This will scan for new story folders and add them to the configuration
	 */
	async refreshStoryDiscovery(): Promise<void> {
		try {
			const result = await this.performStoryDiscovery({
				isInitialDiscovery: false,
				logPrefix: 'Storyteller Suite'
			});
			
			if (result.error) {
				new Notice(`Storyteller: ${result.error}`);
			} else if (result.newStories.length > 0) {
				new Notice(`Storyteller: Found and imported ${result.newStories.length} new story folder(s).`);
			} else {
				new Notice('Storyteller: No new story folders found.');
			}
		} catch (error) {
			console.error('Storyteller Suite: Error during story refresh:', error);
			new Notice(`Storyteller Suite: Error refreshing stories: ${error.message}`);
		}
	}

	/**
	 * Ensure custom entity folders exist and trigger a rescan of entities
	 * Useful after toggling custom-folder mode or changing folder paths
	 */
	async refreshCustomFolderDiscovery(): Promise<void> {
		if (!this.settings.enableCustomEntityFolders) {
			return;
		}
    try {
            // Resolve all entity folders first; abort with guidance if unresolved
            const resolved = this.resolveAllEntityFoldersOrExplain();
            if (!resolved.ok) {
                new Notice(resolved.message || 'Unable to resolve custom folders. Select or create an active story and try again.');
                return;
            }
            for (const v of Object.values(resolved.results)) {
                const path = (v as any).path as string;
                if (path) await this.ensureFolder(path);
            }

			// Count markdown files in each folder to provide feedback
            const countMdResolved = (base?: string): number => {
                if (!base) return 0;
                const files = this.app.vault.getMarkdownFiles();
                const prefix = normalizePath(base) + '/';
                return files.filter(f => f.path.startsWith(prefix)).length;
            };
            const r = resolved.results as any;
            const counts = {
                characters: countMdResolved(r.character.path),
                locations: countMdResolved(r.location.path),
                events: countMdResolved(r.event.path),
                items: countMdResolved(r.item.path),
                references: countMdResolved(r.reference.path),
                chapters: countMdResolved(r.chapter.path),
                scenes: countMdResolved(r.scene.path),
            };

			// Nudge Dataview and our dashboard to update
			this.app.metadataCache.trigger('dataview:refresh-views');
			this.refreshDashboardActiveTab();

			new Notice(
				`Storyteller: Custom folders scanned. ` +
				`Chars ${counts.characters}, Locs ${counts.locations}, Events ${counts.events}, Items ${counts.items}, ` +
				`Refs ${counts.references}, Chaps ${counts.chapters}, Scenes ${counts.scenes}.`
			);
		} catch (error) {
			console.error('Storyteller Suite: Error during custom folder refresh:', error);
			new Notice(`Storyteller Suite: Error scanning custom folders: ${error.message}`);
		}
	}

	/**
	 * Heuristically detect an existing folder structure in the vault and
	 * populate custom entity folder settings accordingly.
	 * Looks for a parent folder that contains typical subfolders like
	 * Characters, Locations, Events, Items, References, Chapters, Scenes.
	 */
	async autoDetectCustomEntityFolders(): Promise<void> {
		// Build a map of folder -> immediate child folder names
		const all = this.app.vault.getAllLoadedFiles();
		const folderChildren: Map<string, Set<string>> = new Map();
		for (const af of all) {
			if (af instanceof TFolder) {
				const parent = af.parent;
				if (parent) {
					const set = folderChildren.get(parent.path) ?? new Set<string>();
					set.add(af.name);
					folderChildren.set(parent.path, set);
				}
			}
		}

		// Candidate names we care about
		const targetNames = ['Characters','Locations','Events','Items','References','Chapters','Scenes'];
		let bestParent: string | null = null;
		let bestScore = 0;
		for (const [parentPath, children] of folderChildren.entries()) {
			let score = 0;
			for (const name of targetNames) {
				if (children.has(name)) score++;
			}
			if (score > bestScore) {
				bestScore = score;
				bestParent = parentPath;
			}
		}

		if (!bestParent || bestScore === 0) {
			new Notice('Storyteller: Could not auto-detect a story root. Please set folders manually.');
			return;
		}

		const maybe = (sub: string): string | undefined => {
			const child = this.app.vault.getFolderByPath(`${bestParent}/${sub}`);
			return child ? `${bestParent}/${sub}` : undefined;
		};

		// Populate settings if folders exist
		const updates: Partial<StorytellerSuiteSettings> = {};
		updates.characterFolderPath = maybe('Characters') ?? this.settings.characterFolderPath;
		updates.locationFolderPath = maybe('Locations') ?? this.settings.locationFolderPath;
		updates.eventFolderPath = maybe('Events') ?? this.settings.eventFolderPath;
		updates.itemFolderPath = maybe('Items') ?? this.settings.itemFolderPath;
		updates.referenceFolderPath = maybe('References') ?? this.settings.referenceFolderPath;
		updates.chapterFolderPath = maybe('Chapters') ?? this.settings.chapterFolderPath;
		updates.sceneFolderPath = maybe('Scenes') ?? this.settings.sceneFolderPath;

		this.settings = { ...this.settings, ...updates } as StorytellerSuiteSettings;
		await this.saveSettings();

		// Provide feedback
		new Notice(`Storyteller: Auto-detected custom folders under "${bestParent}" (matches: ${bestScore}).`);
	}

	/** Refresh the dashboard view's active tab, if open */
	refreshDashboardActiveTab(): void {
		try {
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
			const view: any = leaves[0]?.view;
			if (view && typeof view.refreshActiveTab === 'function') {
				view.refreshActiveTab();
			}
		} catch (_) {
			// no-op
		}
	}

	/**
	 * Plugin cleanup - called when the plugin is unloaded
	 * Obsidian automatically handles view cleanup
	 * Each cleanup operation is wrapped in try-catch to ensure all cleanups run
	 */
	// ─── Status Bar ─────────────────────────────────────────────────────────────

	private initStatusBar(): void {
		this.statusBarWordCountEl = this.addStatusBarItem();
		this.statusBarWordCountEl.addClass('storyteller-wordcount-bar');
		this.statusBarWordCountEl.title = 'Storyteller Suite — click to open Writing Analytics';
		this.statusBarWordCountEl.style.cursor = 'pointer';
		this.statusBarWordCountEl.addEventListener('click', () => this.activateAnalyticsView());

		const debouncedUpdate = debounce(() => this.updateStatusBar(), 800, false);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => debouncedUpdate())
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (this.app.workspace.getActiveFile()?.path === file.path) debouncedUpdate();
			})
		);

		this.app.workspace.onLayoutReady(() => this.updateStatusBar());
	}

    private initWritingTracking(): void {
        const syncActiveFile = (file: TFile | null): void => {
            this.writingSessionTransition = this.writingSessionTransition
                .then(() => this.syncWritingSessionForFile(file))
                .catch(error => console.error('Storyteller Suite: Error syncing writing session:', error));
        };

        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                syncActiveFile(file instanceof TFile ? file : null);
            })
        );

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                const activeFile = this.app.workspace.getActiveFile();
                syncActiveFile(activeFile instanceof TFile ? activeFile : null);
            })
        );

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (!(file instanceof TFile) || this.activeWritingSessionFilePath !== file.path) {
                    return;
                }

                void this.wordTracker.onDocumentChange(file);
                void this.updateStatusBar();
            })
        );

        this.app.workspace.onLayoutReady(() => {
            const activeFile = this.app.workspace.getActiveFile();
            syncActiveFile(activeFile instanceof TFile ? activeFile : null);
        });
    }

    private async syncWritingSessionForFile(file: TFile | null): Promise<void> {
        const nextPath = file && file.extension === 'md' ? file.path : null;
        if (this.activeWritingSessionFilePath === nextPath) {
            return;
        }

        await this.finishActiveWritingSession();

        if (file && file.extension === 'md') {
            this.wordTracker.startSession(file);
            this.activeWritingSessionFilePath = file.path;
        }

        await this.updateStatusBar();
    }

    private async finishActiveWritingSession(): Promise<void> {
        if (!this.activeWritingSessionFilePath) {
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(this.activeWritingSessionFilePath);
        const sessionFile = file instanceof TFile ? file : null;
        const completedSession = await this.wordTracker.endSession(sessionFile);

        this.activeWritingSessionFilePath = null;
        await this.persistWritingSession(completedSession, sessionFile);
        this.refreshDashboardActiveTab();
        await this.updateStatusBar();
    }

    private async persistWritingSession(stats: SessionStats, file: TFile | null): Promise<void> {
        const hasMeaningfulChange = stats.wordsWritten > 0 || stats.netWords !== 0 || stats.wordsDeleted > 0;
        if (!hasMeaningfulChange || stats.startTime <= 0) {
            return;
        }

        const session: WritingSession = {
            id: `writing-${stats.startTime}-${Math.random().toString(36).slice(2, 8)}`,
            startTime: new Date(stats.startTime).toISOString(),
            endTime: new Date(stats.startTime + stats.duration).toISOString(),
            wordsWritten: stats.wordsWritten,
            filesEdited: file ? [file.path] : undefined
        };

        this.settings.writingSessions = this.settings.writingSessions || [];
        this.settings.writingSessions.push(session);
        if (this.settings.writingSessions.length > 500) {
            this.settings.writingSessions = this.settings.writingSessions.slice(-500);
        }

        await this.saveSettings();
    }

	private async updateStatusBar(): Promise<void> {
		if (!this.statusBarWordCountEl) return;

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			this.statusBarWordCountEl.empty();
			return;
		}

		try {
			const content = await this.app.vault.cachedRead(activeFile);
			const wordCount = this.wordTracker.countWords(content);
			const goal = this.settings.dailyWordCountGoal ?? 0;
			const todayWords = this.wordTracker.getTodayStats()?.wordsWritten ?? 0;

			this.statusBarWordCountEl.empty();

			const docSpan = this.statusBarWordCountEl.createSpan({ cls: 'storyteller-bar-doc' });
			docSpan.setText(`${wordCount.toLocaleString()} words`);

			if (goal > 0) {
				this.statusBarWordCountEl.createSpan({ cls: 'storyteller-bar-sep', text: ' · ' });
				const goalSpan = this.statusBarWordCountEl.createSpan({ cls: 'storyteller-bar-goal' });
				const pct = Math.min(100, Math.round((todayWords / goal) * 100));
				goalSpan.setText(`${todayWords.toLocaleString()} / ${goal.toLocaleString()} today (${pct}%)`);
				if (todayWords >= goal) goalSpan.addClass('storyteller-bar-goal--met');
			}
		} catch {
			this.statusBarWordCountEl.empty();
		}
	}

	// ─── New-File Scene Prompt ────────────────────────────────────────────────

	private async promptAddAsScene(file: TFile): Promise<void> {
		const activeDraftId = this.settings.activeDraftId;
		const activeDraft = this.settings.storyDrafts?.find(d => d.id === activeDraftId);
		if (!activeDraft) return;

		new ConfirmModal(this.app, {
			title: `Add "${file.basename}" to draft?`,
			body: `"${file.basename}" was created in your scene folder. Add it to "${activeDraft.name}"?`,
			confirmText: 'Add as scene',
			onConfirm: async () => {
				const { SceneOrderManager } = await import('./compile');
				const manager = new SceneOrderManager(this);
				await manager.addSceneToDraft(activeDraft, file.basename);
				new Notice(`Added "${file.basename}" to ${activeDraft.name}`);
				const leaves = this.app.workspace.getLeavesOfType('storyteller-dashboard-view');
				if (leaves.length > 0) (leaves[0].view as any).refreshActiveTab?.();
			}
		}).open();
	}

	onunload() {
        this.legacyModalLayoutObserver?.disconnect();
        this.legacyModalLayoutObserver = null;
		void this.finishActiveWritingSession();
		// Manual cleanup not needed - Obsidian handles view management
		// Clean up mobile platform classes to prevent class leakage
		try {
			this.removeMobilePlatformClasses();
		} catch (error) {
			console.error('Storyteller Suite: Error removing mobile classes during unload', error);
		}

		// Cleanup orientation and resize handlers
		try {
			this.cleanupMobileOrientationHandlers();
		} catch (error) {
			console.error('Storyteller Suite: Error cleaning up orientation handlers', error);
		}

		// Removed: Codeblock maps no longer supported
		// Cleanup all active maps
		// try {
		// 	if (this.leafletProcessor) {
		// 		this.leafletProcessor.cleanup();
		// 	}
		// } catch (error) {
		// 	console.error('Storyteller Suite: Error cleaning up Leaflet maps', error);
		// }
	}

	/**
	 * Register all command palette commands for the plugin
	 * These provide keyboard shortcut access to plugin functionality
	 */
	private registerCommands() {
		// Dashboard command
		this.addCommand({
			id: 'open-dashboard-view',
			name: 'Open dashboard',
			callback: () => {
				this.activateView();
			}
		});

        this.addCommand({
            id: 'open-getting-started-guide',
            name: 'Open getting started guide',
            callback: () => {
                this.openGettingStartedGuide();
            }
        });

        this.addCommand({
            id: 'show-update-highlights',
            name: 'Show update highlights',
            callback: () => {
                this.openWhatsNewGuide();
            }
        });

		// Campaign commands
		this.addCommand({
			id: 'open-campaign-view',
			name: 'Open campaign view',
			callback: async () => {
				await this.activateCampaignView();
			}
		});

		this.addCommand({
			id: 'open-campaign-session-manager',
			name: 'Open campaign session manager',
			callback: async () => {
				await this.openCampaignSessionManager();
			}
		});

		this.addCommand({
			id: 'resume-latest-campaign-session',
			name: 'Resume latest campaign session',
			callback: async () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				const latestSession = await this.getLatestCampaignSession();
				if (!latestSession) {
					new Notice('No campaign sessions found in the active story.');
					return;
				}
				await this.activateCampaignView(latestSession);
			}
		});

		this.addCommand({
			id: 'open-active-campaign-session-note',
			name: 'Open active campaign session note',
			callback: async () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				await this.openCampaignSessionNote();
			}
		});

		this.addCommand({
			id: 'run-campaign-from-current-scene',
			name: 'Run campaign from current scene',
			callback: async () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				const scene = await this.getActiveSceneForCampaignCommand();
				if (!scene) {
					new Notice('The active note is not a scene.');
					return;
				}

				const loadedSession = this.getLoadedCampaignSession();
				if (loadedSession) {
					await this.activateCampaignView(loadedSession, scene);
					return;
				}

				await this.openCampaignSessionManager(scene);
			}
		});

		this.addCommand({
			id: 'add-campaign-log-entry',
			name: 'Add campaign log entry',
			callback: async () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				const targetSession = this.getLoadedCampaignSession() ?? await this.getLatestCampaignSession();
				if (!targetSession?.filePath) {
					new Notice('No campaign session available for logging.');
					return;
				}

				new PromptModal(this.app, {
					title: 'Campaign Log Entry',
					label: 'Log entry',
					defaultValue: '',
					validator: (value: string) => value.trim() ? null : 'Enter a log entry.',
					onSubmit: (value: string) => {
						void (async () => {
							try {
								targetSession.modified = new Date().toISOString();
								await this.saveSession(targetSession);
								await this.appendToSessionLog(targetSession.filePath!, `- ${value.trim()}`);
								new Notice(`Added log entry to "${targetSession.name}".`);
							} catch (error) {
								console.error('[campaign-log-entry] Error appending log entry:', error);
								new Notice('Failed to add campaign log entry.');
							}
						})();
					}
				}).open();
			}
		});

		// --- Create New Story Command ---
		this.addCommand({
			id: 'create-new-story',
			name: 'Create new story',
			callback: () => {
				new NewStoryModal(
					this.app,
					this,
					this.settings.stories.map(s => s.name),
					async (name, description) => {
						const story = await this.createStory(name, description);
						await this.setActiveStory(story.id);
                        new Notice(`Story "${name}" created and activated.`);
						// Optionally, open dashboard
						this.activateView();
					}
				).open();
			}
		});

		// --- Story Discovery Command ---
		this.addCommand({
			id: 'refresh-story-discovery',
			name: 'Refresh story discovery',
			callback: async () => {
				await this.refreshStoryDiscovery();
			}
		});

		// --- Template Gallery Command ---
		this.addCommand({
			id: 'open-template-gallery',
			name: 'Browse story templates',
			callback: () => {
				new StoryTemplateGalleryModal(this.app, this, this.templateManager).open();
			}
		});

		// --- Template Library Command ---
		this.addCommand({
			id: 'open-template-library',
			name: 'Apply template to story',
			callback: async () => {
				const { TemplateLibraryModal } = await import('./modals/TemplateLibraryModal');
				new TemplateLibraryModal(this.app, this).open();
			}
		});

		// --- Reload Custom Templates Command ---
		this.addCommand({
			id: 'reload-custom-templates',
			name: 'Reload custom templates',
			callback: async () => {
				try {
					if (!this.templateManager || !this.templateNoteManager) {
						new Notice('Template system not initialized');
						return;
					}

					const beforeCount = this.templateManager.getAllTemplates().filter(t => !(t as any).builtIn).length;
					await this.templateManager.loadUserTemplates();
					await this.templateNoteManager.loadNoteTemplates();
					const afterCount = this.templateManager.getAllTemplates().filter(t => !(t as any).builtIn).length;
					this.refreshDashboardActiveTab();
					new Notice('Loaded ' + afterCount + ' custom template' + (afterCount !== 1 ? 's' : ''));

					if (afterCount > beforeCount) {
						console.log(`[StorytellerSuite] Loaded ${afterCount - beforeCount} new templates`);
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice('Failed to reload templates: ' + message);
				}
			}
		});

		// Character management commands
		this.addCommand({
			id: 'create-new-character',
			name: 'Create new character',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
				new CharacterModal(this.app, this, null, async (characterData: Character) => {
					await this.saveCharacter(characterData);
					new Notice(`Character "${characterData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-characters',
			name: 'View characters',
			callback: async () => {
				const characters = await this.listCharacters();
				new CharacterListModal(this.app, this, characters).open();
			}
		});

		this.addCommand({
			id: 'generate-character-sheet',
			name: 'Generate character sheet',
			callback: async () => {
				const characters = await this.listCharacters();
				if (characters.length === 0) {
					new Notice('No characters found in the active story.');
					return;
				}
				const { CharacterSuggestModal } = await import('./modals/CharacterSuggestModal');
				const { CharacterSheetPreviewModal } = await import('./modals/CharacterSheetPreviewModal');
				new CharacterSuggestModal(this.app, this, (character) => {
					new CharacterSheetPreviewModal(this.app, this, character).open();
				}).open();
			}
		});

		// Location management commands
		this.addCommand({
			id: 'create-new-location',
			name: 'Create new location',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
				new LocationModal(this.app, this, null, async (locationData: Location) => {
					await this.saveLocation(locationData);
					new Notice(`Location "${locationData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-locations',
			name: 'View locations',
			callback: async () => {
				const locations = await this.listLocations();
				new LocationListModal(this.app, this, locations).open();
			}
		});

		// Event management commands
		this.addCommand({
			id: 'create-new-event',
			name: 'Create new event',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
				new EventModal(this.app, this, null, async (eventData: Event) => {
					await this.saveEvent(eventData);
					new Notice(`Event "${eventData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-timeline',
			name: t('viewTimeline'),
			callback: async () => {
				const events = await this.listEvents();
				new TimelineModal(this.app, this, events).open();
			}
		});

		// Timeline panel view command
		this.addCommand({
			id: 'open-timeline-panel',
			name: t('openTimelinePanel'),
			callback: async () => {
				await this.activateTimelineView();
			}
		});

		// Timeline era management
		this.addCommand({
			id: 'manage-timeline-eras',
			name: 'Manage timeline eras & periods',
			callback: async () => {
				const { EraListModal } = await import('./modals/EraListModal');
				new EraListModal(this.app, this).open();
			}
		});

		// Timeline track management
		this.addCommand({
			id: 'manage-timeline-tracks',
			name: 'Manage timeline tracks',
			callback: () => {
				const tracks = this.settings.timelineTracks || [];
				new TrackManagerModal(
					this.app,
					this,
					tracks,
					async (updatedTracks) => {
						this.settings.timelineTracks = updatedTracks;
						await this.saveSettings();
					}
				).open();
			}
		});

		// Detect timeline conflicts
		this.addCommand({
			id: 'detect-timeline-conflicts',
			name: 'Detect timeline conflicts',
			callback: async () => {
				const events = await this.listEvents();
				const conflicts = ConflictDetector.detectAllConflicts(events);
				new ConflictViewModal(this.app, this, conflicts).open();

				// Show quick summary
				const errorCount = conflicts.filter(c => c.severity === 'error').length;
				const warningCount = conflicts.filter(c => c.severity === 'warning').length;

				if (conflicts.length === 0) {
					new Notice('✓ No timeline conflicts detected');
				} else {
					new Notice(`Found ${errorCount} error(s), ${warningCount} warning(s)`);
				}
			}
		});

		// Generate events from tags
		this.addCommand({
			id: 'generate-events-from-tags',
			name: 'Generate timeline from tags',
			callback: () => {
				new TagTimelineModal(this.app, this).open();
			}
		});

		// Auto-generate timeline tracks
		this.addCommand({
			id: 'auto-generate-tracks',
			name: 'Auto-generate timeline tracks',
			callback: async () => {
				const count = await this.trackManager.generateEntityTracks({
					characters: true,
					locations: true,
					groups: true,
					hideByDefault: false
				});
				new Notice(`Generated ${count} timeline track(s)`);
			}
		});

		this.addCommand({
			id: 'open-analytics-dashboard',
			name: 'Open writing analytics',
			callback: async () => {
				await this.activateAnalyticsView();
			}
		});

		this.addCommand({
			id: 'open-writing-board',
			name: 'Open Writing Board panel',
			callback: async () => { await this.activateWritingPanelView('board'); }
		});
		this.addCommand({
			id: 'open-writing-arc',
			name: 'Open Writing Arc chart panel',
			callback: async () => { await this.activateWritingPanelView('arc'); }
		});
		this.addCommand({
			id: 'open-writing-heatmap',
			name: 'Open Character Heatmap panel',
			callback: async () => { await this.activateWritingPanelView('heatmap'); }
		});
		this.addCommand({
			id: 'open-writing-holes',
			name: 'Open Plot Hole Detector panel',
			callback: async () => { await this.activateWritingPanelView('holes'); }
		});

		// Plot Item management commands
		this.addCommand({
			id: 'create-new-plot-item',
			name: 'Create new plot item',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
				new PlotItemModal(this.app, this, null, async (itemData: PlotItem) => {
					await this.savePlotItem(itemData);
					new Notice(`Item "${itemData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-plot-items',
			name: 'View plot items',
			callback: async () => {
				const items = await this.listPlotItems();
				new PlotItemListModal(this.app, this, items).open();
			}
		});

		// Culture management commands
		this.addCommand({
			id: 'create-new-culture',
			name: 'Create new culture',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
				new CultureModal(this.app, this, null, async (cultureData: Culture) => {
					await this.saveCulture(cultureData);
					new Notice(`Culture "${cultureData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-cultures',
			name: 'View cultures',
			callback: async () => {
				const cultures = await this.listCultures();
				new CultureListModal(this.app, this, cultures).open();
			}
		});

		// Economy management commands
		this.addCommand({
			id: 'create-new-economy',
			name: 'Create new economy',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
				new EconomyModal(this.app, this, null, async (economyData: Economy) => {
					await this.saveEconomy(economyData);
					new Notice(`Economy "${economyData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-economies',
			name: 'View economies',
			callback: async () => {
				const economies = await this.listEconomies();
				new EconomyListModal(this.app, this, economies).open();
			}
		});

		// Magic System management commands
		this.addCommand({
			id: 'create-new-magic-system',
			name: 'Create new magic system',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
				new MagicSystemModal(this.app, this, null, async (magicSystemData: MagicSystem) => {
					await this.saveMagicSystem(magicSystemData);
					new Notice(`Magic System "${magicSystemData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-magic-systems',
			name: 'View magic systems',
			callback: async () => {
				const magicSystems = await this.listMagicSystems();
				new MagicSystemListModal(this.app, this, magicSystems).open();
			}
		});

		// Compendium management commands
		this.addCommand({
			id: 'create-new-compendium-entry',
			name: 'Create new compendium entry',
			callback: async () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				new CompendiumEntryModal(this.app, this, null, async (entry: CompendiumEntry) => {
					await this.saveCompendiumEntry(entry);
					new Notice(t('compendiumEntryCreated', entry.name));
				}).open();
			}
		});

		this.addCommand({
			id: 'view-compendium',
			name: 'View compendium',
			callback: async () => {
				const entries = await this.listCompendiumEntries();
				new CompendiumListModal(this.app, this, entries).open();
			}
		});

		// Map view command
		this.addCommand({
			id: 'open-map-view',
			name: 'Open map view',
			callback: async () => {
				await this.activateMapView();
			}
		});

		// DEPRECATED: Map functionality has been deprecated
		// Map management commands
		// this.addCommand({
		// 	id: 'create-new-map',
		// 	name: 'Create new map',
		// 	callback: async () => {
		// 		if (!this.ensureActiveStoryOrGuide()) return;
		// 		// Open map editor view for new map
		// 		await this.openMapEditor();
		// 	}
		// });

		// this.addCommand({
		// 	id: 'open-map-editor',
		// 	name: 'Open map editor panel',
		// 	callback: async () => {
		// 		if (!this.ensureActiveStoryOrGuide()) return;
		// 		// Open map editor panel (will create new map if none loaded)
		// 		await this.openMapEditor();
		// 	}
		// });

		// this.addCommand({
		// 	id: 'view-maps',
		// 	name: 'View maps',
		// 	callback: async () => {
		// 		const maps = await this.listMaps();
		// 		import('./modals/MapListModal').then(({ MapListModal }) => {
		// 			new MapListModal(this.app, this, maps).open();
		// 		});
		// 	}
		// });

		// Gallery management command
		this.addCommand({
			id: 'open-gallery',
			name: 'Open gallery',
			callback: () => {
				new GalleryModal(this.app, this).open();
			}
		});

		// Reference management commands
		this.addCommand({
			id: 'create-new-reference',
			name: 'Create new reference',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
                import('./modals/ReferenceModal').then(({ ReferenceModal }) => {
					new ReferenceModal(this.app, this, null, async (ref: Reference) => {
						await this.saveReference(ref);
						new Notice(`Reference "${ref.name}" created.`);
					}).open();
				});
			}
		});
		this.addCommand({
			id: 'view-references',
			name: 'View references',
			callback: async () => {
				await this.activateView();
				setTimeout(() => {
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
					const view = (leaves[0]?.view as any);
					if (view && typeof view === 'object' && 'tabHeaderContainer' in view) {
						const header = view.tabHeaderContainer?.querySelector('[data-tab-id="references"]') as HTMLElement;
						header?.click();
					}
				}, 50);
			}
		});

		// Chapter management commands
		this.addCommand({
			id: 'create-new-chapter',
			name: 'Create new chapter',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
                import('./modals/ChapterModal').then(({ ChapterModal }) => {
					new ChapterModal(this.app, this, null, async (ch: Chapter) => {
						await this.saveChapter(ch);
						new Notice(`Chapter "${ch.name}" created.`);
					}).open();
				});
			}
		});
		this.addCommand({
			id: 'view-chapters',
			name: 'View chapters',
			callback: async () => {
				await this.activateView();
				setTimeout(() => {
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
					const view = (leaves[0]?.view as any);
					if (view && typeof view === 'object' && 'tabHeaderContainer' in view) {
						const header = view.tabHeaderContainer?.querySelector('[data-tab-id="chapters"]') as HTMLElement;
						header?.click();
					}
				}, 50);
			}
		});

		// Import command
		this.addCommand({
			id: 'import-story',
			name: 'Import story/chapters',
			callback: () => {
				import('./modals/ImportConfigModal').then(({ ImportConfigModal }) => {
					new ImportConfigModal(this.app, this).open();
				});
			}
		});

		// Scene management commands
		this.addCommand({
			id: 'create-new-scene',
			name: 'Create new scene',
			callback: () => {
                if (!this.ensureActiveStoryOrGuide()) return;
                import('./modals/SceneModal').then(({ SceneModal }) => {
					new SceneModal(this.app, this, null, async (sc: Scene) => {
						await this.saveScene(sc);
						new Notice(`Scene "${sc.name}" created.`);
					}).open();
				});
			}
		});
		this.addCommand({
			id: 'view-scenes',
			name: 'View scenes',
			callback: async () => {
				await this.activateView();
				setTimeout(() => {
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
					const view = (leaves[0]?.view as any);
					if (view && typeof view === 'object' && 'tabHeaderContainer' in view) {
						const header = view.tabHeaderContainer?.querySelector('[data-tab-id="scenes"]') as HTMLElement;
						header?.click();
					}
				}, 50);
			}
		});

		// --- Group management commands ---
		this.addCommand({
			id: 'create-group',
			name: 'Create group',
			callback: async () => {
                if (!this.ensureActiveStoryOrGuide()) return;
				const name = prompt('Enter group name:');
				if (name && name.trim()) {
                    const trimmed = name.trim();
                    await this.createGroup(trimmed);
                    new Notice(`Group "${trimmed}" created.`);
				}
			}
		});
    this.addCommand({
      id: 'view-groups',
      name: 'View groups',
      callback: async () => {
        await this.activateView();
        setTimeout(() => {
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
          const view = (leaves[0]?.view as any);
          if (view && typeof view === 'object' && 'tabHeaderContainer' in view) {
            const header = view.tabHeaderContainer?.querySelector('[data-tab-id="groups"]') as HTMLElement;
            header?.click();
          }
        }, 50);
      }
    });
		this.addCommand({
			id: 'rename-group',
			name: 'Rename group',
            callback: async () => {
                const groups = this.getGroups();
                if (groups.length === 0) {
                    new Notice('No groups to rename.');
                    return;
                }
                // Use GroupSuggestModal for better reliability
                new GroupSuggestModal(this.app, this, (group) => {
                    if (!group) return;
                    new PromptModal(this.app, {
                        title: 'New name',
                        label: 'Enter new group name',
                        defaultValue: group.name,
                        validator: (v) => !v.trim() ? 'Required' : null,
                        onSubmit: async (newName) => {
                            await this.updateGroup(group.id, { name: newName.trim() });
                            new Notice(`Group renamed to "${newName.trim()}".`);
                        }
                    }).open();
                }).open();
            }
		});
		this.addCommand({
			id: 'delete-group',
			name: 'Delete group',
            callback: async () => {
                const groups = this.getGroups();
                if (groups.length === 0) {
                    new Notice('No groups to delete.');
                    return;
                }
                // Use GroupSuggestModal for better reliability
                new GroupSuggestModal(this.app, this, (group) => {
                    if (!group) return;
                    new ConfirmModal(this.app, {
                        title: 'Confirm delete',
                        body: `Are you sure you want to delete group "${group.name}"?`,
                        onConfirm: async () => {
                            await this.deleteGroup(group.id);
                            new Notice(`Group "${group.name}" deleted.`);
                        }
                    }).open();
                }).open();
            }
		});

		// Story Board command - Create visual canvas of scenes
		this.addCommand({
			id: 'create-story-board',
			name: 'Create Story Board',
			callback: async () => {
				await this.createStoryBoard();
			}
		});

		// Update Story Board command - Update existing story board with changes
		this.addCommand({
			id: 'update-story-board',
			name: 'Update Story Board',
			callback: async () => {
				await this.updateStoryBoard();
			}
		});

		// Open Story Board command - Open the existing story board canvas
		this.addCommand({
			id: 'open-story-board',
			name: 'Open Story Board',
			callback: async () => {
				await this.openStoryBoard();
			}
		});

		// ============================================================
		// World-Building Entity Commands
		// ============================================================

		// Create Culture
		this.addCommand({
			id: 'create-new-culture',
			name: 'Create new culture',
			callback: () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				import('./modals/CultureModal').then(({ CultureModal }) => {
					new CultureModal(this.app, this, null, async (culture) => {
						await this.saveCulture(culture);
						new Notice(`Culture "${culture.name}" created.`);
					}).open();
				});
			}
		});

		// Create Economy
		this.addCommand({
			id: 'create-new-economy',
			name: 'Create new economy',
			callback: () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				import('./modals/EconomyModal').then(({ EconomyModal }) => {
					new EconomyModal(this.app, this, null, async (economy) => {
						await this.saveEconomy(economy);
						new Notice(`Economy "${economy.name}" created.`);
					}).open();
				});
			}
		});

		// Create Magic System
		this.addCommand({
			id: 'create-new-magic-system',
			name: 'Create new magic system',
			callback: () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				import('./modals/MagicSystemModal').then(({ MagicSystemModal }) => {
					new MagicSystemModal(this.app, this, null, async (magicSystem) => {
						await this.saveMagicSystem(magicSystem);
						new Notice(`Magic System "${magicSystem.name}" created.`);
					}).open();
				});
			}
		});

		// ============================================================
		// Timeline Fork Commands
		// ============================================================

		// Create timeline fork
		this.addCommand({
			id: 'create-timeline-fork',
			name: 'Create timeline fork',
			callback: () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				import('./modals/TimelineForkModal').then(({ TimelineForkModal }) => {
					new TimelineForkModal(
						this.app,
						this,
						null,
						async (fork) => {
							this.createTimelineFork(
								fork.name,
								fork.divergenceEvent,
								fork.divergenceDate,
								fork.description || ''
							);
						}
					).open();
				});
			}
		});

		// View timeline forks
		this.addCommand({
			id: 'view-timeline-forks',
			name: 'View timeline forks',
			callback: () => {
				const forks = this.getTimelineForks();
				if (forks.length === 0) {
					new Notice('No timeline forks yet. Create your first fork!');
					return;
				}
				new Notice(`${forks.length} timeline fork(s) found`);
				// TODO: Create TimelineForkListModal for better visualization
			}
		});

		// ============================================================
		// Conflict Detection Commands
		// ============================================================

		// Detect timeline conflicts
		this.addCommand({
			id: 'detect-timeline-conflicts',
			name: 'Detect timeline conflicts',
			callback: async () => {
				new Notice('Scanning timeline for conflicts...');

				const events = await this.listEvents();
				const detectedConflicts = ConflictDetector.detectAllConflicts(events);
				const conflicts = ConflictDetector.toStorageFormat(detectedConflicts);

				this.settings.timelineConflicts = conflicts;
				await this.saveSettings();

				new Notice(`Found ${conflicts.length} timeline conflict(s)`);

				// Open conflicts modal
				const { ConflictListModal } = await import('./modals/ConflictListModal');
				new ConflictListModal(
					this.app,
					this,
					conflicts,
					async () => {
						// Re-scan callback - re-run conflict detection
						new Notice('Re-scanning timeline for conflicts...');
						const events = await this.listEvents();
						const detectedConflicts = ConflictDetector.detectAllConflicts(events);
						const newConflicts = ConflictDetector.toStorageFormat(detectedConflicts);

						this.settings.timelineConflicts = newConflicts;
						await this.saveSettings();
						new Notice(`Found ${newConflicts.length} timeline conflict(s)`);
					}
				).open();
			}
		});

		// View existing conflicts
		this.addCommand({
			id: 'view-timeline-conflicts',
			name: 'View timeline conflicts',
			callback: async () => {
				const conflicts = this.settings.timelineConflicts || [];

				if (conflicts.length === 0) {
					new Notice('No conflicts detected. Run "Detect timeline conflicts" to scan.');
					return;
				}

				const { ConflictListModal } = await import('./modals/ConflictListModal');
				new ConflictListModal(
					this.app,
					this,
					conflicts,
					async () => {
						// Re-scan callback - re-run conflict detection
						new Notice('Re-scanning timeline for conflicts...');
						const events = await this.listEvents();
						const detectedConflicts = ConflictDetector.detectAllConflicts(events);
						const newConflicts = ConflictDetector.toStorageFormat(detectedConflicts);

						this.settings.timelineConflicts = newConflicts;
						await this.saveSettings();
						new Notice(`Found ${newConflicts.length} timeline conflict(s)`);
					}
				).open();
			}
		});

		// --- Entity Template Commands ---
		this.addCommand({
			id: 'open-entity-template-library',
			name: 'Open entity template library',
			callback: () => {
				const { TemplateLibraryModal } = require('./modals/TemplateLibraryModal');
				new TemplateLibraryModal(this.app, this).open();
			}
		});

		// Save current note as template
		this.addCommand({
			id: 'save-note-as-template',
			name: 'Save current note as template',
			callback: () => {
				SaveNoteAsTemplateCommand.execute(this);
			}
		});

		// ============================================================
		// Manuscript & Compile Commands (Longform-inspired)
		// ============================================================

		// Navigate to next scene
		this.addCommand({
			id: 'next-scene',
			name: 'Go to next scene in manuscript',
			callback: async () => {
				const { SceneOrderManager } = await import('./compile');
				const manager = new SceneOrderManager(this);
				const success = await manager.navigateToNextScene();
				if (!success) {
					new Notice('No next scene available');
				}
			}
		});

		// Navigate to previous scene
		this.addCommand({
			id: 'previous-scene',
			name: 'Go to previous scene in manuscript',
			callback: async () => {
				const { SceneOrderManager } = await import('./compile');
				const manager = new SceneOrderManager(this);
				const success = await manager.navigateToPreviousScene();
				if (!success) {
					new Notice('No previous scene available');
				}
			}
		});

		// Compile manuscript
		this.addCommand({
			id: 'compile-manuscript',
			name: 'Compile manuscript',
			callback: async () => {
				const activeStory = this.settings.stories.find(s => s.id === this.settings.activeStoryId);
				if (!activeStory) {
					new Notice('No active story selected');
					return;
				}

				const { CompileEngine, SceneOrderManager } = await import('./compile');
				const sceneManager = new SceneOrderManager(this);
				const draft = sceneManager.getActiveDraft(activeStory);
				
				if (!draft) {
					new Notice('No draft available. Create a draft first.');
					return;
				}

				const engine = new CompileEngine(this.app, this);
				new Notice('Compiling manuscript...');
				
				const workflow = engine.resolveWorkflowForDraft(draft);
				
				try {
					const result = await engine.compile(draft, workflow);
					if (result.success) {
						const wordCount = result.stats?.wordCount ?? 0;
						new Notice(`Manuscript compiled! ${wordCount} words`);
					} else {
						new Notice(`Compile failed: ${result.error || 'Unknown error'}`);
					}
				} catch (error) {
					console.error('Compile error:', error);
					new Notice(`Compile failed: ${error}`);
				}
			}
		});

		// Create new draft
		this.addCommand({
			id: 'create-draft',
			name: 'Create new manuscript draft',
			callback: async () => {
				const activeStory = this.settings.stories.find(s => s.id === this.settings.activeStoryId);
				if (!activeStory) {
					new Notice('No active story selected');
					return;
				}

				const { SceneOrderManager } = await import('./compile');
				const manager = new SceneOrderManager(this);
				const existingDrafts = manager.getDraftsForStory(activeStory.id);
				const draftNumber = existingDrafts.length + 1;
				const draftName = `Draft ${draftNumber}`;
				
				await manager.createDraft(activeStory, draftName);
				new Notice(`Created "${draftName}"`);
			}
		});

		// Indent current scene
		this.addCommand({
			id: 'indent-scene',
			name: 'Indent current scene in draft',
			callback: async () => {
				const { SceneOrderManager } = await import('./compile');
				const manager = new SceneOrderManager(this);
				const currentScene = await manager.getCurrentScene();
				
				if (!currentScene || !currentScene.id) {
					new Notice('No scene file active');
					return;
				}

				const story = manager.getStoryForScene(currentScene);
				if (!story) {
					new Notice('Could not determine story for scene');
					return;
				}

				const draft = manager.getActiveDraft(story);
				if (!draft) {
					new Notice('No draft available');
					return;
				}

				const success = await manager.indentScene(draft, currentScene.id);
				if (success) {
					new Notice('Scene indented');
				} else {
					new Notice('Cannot indent scene further');
				}
			}
		});

		// Unindent current scene
		this.addCommand({
			id: 'unindent-scene',
			name: 'Unindent current scene in draft',
			callback: async () => {
				const { SceneOrderManager } = await import('./compile');
				const manager = new SceneOrderManager(this);
				const currentScene = await manager.getCurrentScene();
				
				if (!currentScene || !currentScene.id) {
					new Notice('No scene file active');
					return;
				}

				const story = manager.getStoryForScene(currentScene);
				if (!story) {
					new Notice('Could not determine story for scene');
					return;
				}

				const draft = manager.getActiveDraft(story);
				if (!draft) {
					new Notice('No draft available');
					return;
				}

				const success = await manager.unindentScene(draft, currentScene.id);
				if (success) {
					new Notice('Scene unindented');
				} else {
					new Notice('Cannot unindent scene further');
				}
			}
		});

		// Toggle scene in compile
		this.addCommand({
			id: 'toggle-scene-compile',
			name: 'Toggle scene include in compile',
			callback: async () => {
				const { SceneOrderManager } = await import('./compile');
				const manager = new SceneOrderManager(this);
				const currentScene = await manager.getCurrentScene();
				
				if (!currentScene || !currentScene.id) {
					new Notice('No scene file active');
					return;
				}

				const story = manager.getStoryForScene(currentScene);
				if (!story) {
					new Notice('Could not determine story for scene');
					return;
				}

				const draft = manager.getActiveDraft(story);
				if (!draft) {
					new Notice('No draft available');
					return;
				}

				await manager.toggleSceneInCompile(draft, currentScene.id);
				const ref = draft.sceneOrder.find(s => s.sceneId === currentScene.id);
				const status = ref?.includeInCompile ? 'included' : 'excluded';
				new Notice(`Scene ${status} from compile`);
			}
		});

		// Show word count
		this.addCommand({
			id: 'show-word-count',
			name: 'Show manuscript word count',
			callback: async () => {
				const activeStory = this.settings.stories.find(s => s.id === this.settings.activeStoryId);
				if (!activeStory) {
					new Notice('No active story selected');
					return;
				}

				const { WordCountTracker, SceneOrderManager } = await import('./compile');
				const sceneManager = new SceneOrderManager(this);
				const wordTracker = new WordCountTracker(this);
				
				const draft = sceneManager.getActiveDraft(activeStory);
				if (draft) {
					const wordCount = await sceneManager.calculateDraftWordCount(draft);
					new Notice(`📖 ${activeStory.name} - ${draft.name}\n${wordTracker.formatWordCount(wordCount)} words`);
				} else {
					const wordCount = await wordTracker.getStoryWordCount(activeStory);
					new Notice(`📖 ${activeStory.name}\n${wordTracker.formatWordCount(wordCount)} words`);
				}
			}
		});

		// Data Migration Command
		this.addCommand({
			id: 'migrate-location-data',
			name: 'Migrate location data (fix map bindings & entity refs)',
			callback: async () => {
				new Notice('Starting location data migration...');
				try {
					const migration = new LocationMigration(this);
					const result = await migration.migrateAllLocations();
					if (result.errors.length > 0) {
						new Notice(`Migration completed with ${result.errors.length} errors. Check console for details.`);
						console.error('Migration errors:', result.errors);
					} else {
						new Notice(`Migration complete! Updated ${result.migrated} location(s).`);
					}
				} catch (error) {
					console.error('Migration failed:', error);
					new Notice(`Migration failed: ${error}`);
				}
			}
		});
	}

	/**
	 * Activate or focus the dashboard view
	 * Creates a new view if none exists, otherwise focuses existing view
	 */
	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);

		if (leaves.length > 0) {
			// Reuse existing dashboard view
			leaf = leaves[0];
		} else {
			// Create new dashboard view in right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
			} else {
				console.error("Storyteller Suite: Could not create workspace leaf.");
				new Notice("Error opening dashboard: Could not create workspace leaf.");
				return;
			}
		}

		// Ensure leaf is valid before revealing
		if (!leaf) {
			console.error("Storyteller Suite: Workspace leaf is null after attempting to find or create it.");
			new Notice("Error revealing dashboard: Workspace leaf not found.");
			return;
		}

		// Show the view (expand sidebar if collapsed)
		workspace.revealLeaf(leaf);
	}

    /** Activate or focus the Campaign view, optionally pre-loading a session. */
    async activateCampaignView(session?: CampaignSession, startingScene?: import('./types').Scene): Promise<void> {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CAMPAIGN);
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getLeaf('tab');
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_CAMPAIGN, active: true });
        }
        if (!leaf) return;
        workspace.revealLeaf(leaf);
        if (session) {
            const view = leaf.view as CampaignView;
            await view.loadSession(session, startingScene);
            await view.render();
        }
    }

    private getCampaignViewInstance(): CampaignView | null {
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CAMPAIGN)[0];
        if (!leaf) return null;
        return leaf.view as CampaignView;
    }

    private getLoadedCampaignSession(): CampaignSession | null {
        const view = this.getCampaignViewInstance() as any;
        const session = view?.session as CampaignSession | null | undefined;
        return session ? { ...session } : null;
    }

    private async getLatestCampaignSession(): Promise<CampaignSession | null> {
        const sessions = await this.listSessions().catch(() => [] as CampaignSession[]);
        return sessions[0] ?? null;
    }

    private async getActiveSceneForCampaignCommand(): Promise<Scene | null> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return null;
        const activePath = normalizePath(activeFile.path);
        const scenes = await this.listScenes().catch(() => [] as Scene[]);
        return scenes.find(scene => normalizePath(scene.filePath || '') === activePath) ?? null;
    }

    private async openCampaignSessionManager(preferredStartingScene?: Scene): Promise<void> {
        if (!this.ensureActiveStoryOrGuide()) return;
        const { CampaignSessionModal } = await import('./modals/CampaignSessionModal');
        new CampaignSessionModal(
            this.app,
            this,
            async (session) => {
                await this.activateCampaignView(session, preferredStartingScene);
            },
            preferredStartingScene
        ).open();
    }

    private async openCampaignSessionNote(session?: CampaignSession | null): Promise<void> {
        const targetSession = session ?? this.getLoadedCampaignSession() ?? await this.getLatestCampaignSession();
        if (!targetSession?.filePath) {
            new Notice('No campaign session note available.');
            return;
        }
        await this.app.workspace.openLinkText(targetSession.filePath, '', 'tab');
    }

    /** Activate or focus the Scene Graph view. */
    async activateSceneGraphView(): Promise<void> {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_SCENE_GRAPH);
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getLeaf('tab');
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_SCENE_GRAPH, active: true });
        }
        if (!leaf) return;
        workspace.revealLeaf(leaf);
    }

	/**
	 * Activate or focus the timeline panel view in the main editor area
	 * Creates a new view as a tab if none exists, otherwise focuses existing view
	 */
	async activateTimelineView() {
		const { workspace } = this.app;

		// Check if a timeline view already exists
		const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);

		if (existingLeaves.length > 0) {
			// Reveal existing timeline view
			workspace.revealLeaf(existingLeaves[0]);
			return;
		}

		// Create new leaf for timeline view in main editor area (as a tab)
		const leaf = workspace.getLeaf('tab');
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_TIMELINE,
				active: true
			});
			workspace.revealLeaf(leaf);
		} else {
			console.error("Storyteller Suite: Could not create workspace leaf for timeline.");
			new Notice("Error opening timeline panel: Could not create workspace leaf.");
		}
	}

	async activateAnalyticsView() {
		const { workspace } = this.app;

		// Check if analytics view already exists
		const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_ANALYTICS);

		if (existingLeaves.length > 0) {
			// Reveal existing analytics view
			workspace.revealLeaf(existingLeaves[0]);
			return;
		}

		// Create new leaf for analytics view in main editor area (as a tab)
		const leaf = workspace.getLeaf('tab');
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_ANALYTICS,
				active: true
			});
			workspace.revealLeaf(leaf);
		} else {
			console.error("Storyteller Suite: Could not create workspace leaf for analytics.");
			new Notice("Error opening analytics dashboard: Could not create workspace leaf.");
		}
	}

	/**
	 * Open (or focus) the writing panel view at a specific mode.
	 * If a panel already exists it is focused and its mode is updated.
	 */
	async activateWritingPanelView(mode: import('./views/WritingViewRenderers').WritingPanelMode = 'board'): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_WRITING_PANEL);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			const view = existing[0].view as unknown as WritingPanelView;
			if (typeof view.setMode === 'function') await view.setMode(mode);
			return;
		}
		const leaf = workspace.getLeaf('tab');
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_WRITING_PANEL, active: true, state: { mode } });
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Open the map editor view
	 * @deprecated Use activateMapView() instead - MapEditorView has been replaced by MapView
	 * @param mapId Optional map ID to load in the editor
	 */
	async openMapEditor(mapId?: string): Promise<void> {
		// Redirect to the new MapView
		await this.activateMapView(mapId);
	}

	/**
	 * Utility Methods - Generic functionality used across the plugin
	 */

	/**
	 * Ensure a folder exists in the vault, creating it if necessary
	 * @param folderPath The path of the folder to ensure exists
	 * @throws Error if the path exists but is not a folder
	 */
    async ensureFolder(folderPath: string): Promise<void> {
        const normalizedPath = normalizePath(folderPath);
        // Create missing parent segments one by one (mkdir -p behavior)
        const segments = normalizedPath.split('/').filter(Boolean);
        let current = '';
        for (const seg of segments) {
            current = current ? `${current}/${seg}` : seg;
            const af = this.app.vault.getAbstractFileByPath(current);
            if (!af) {
                // Older Obsidian builds can lag updating the metadata tree even when the folder
                // already exists on disk. Check the adapter before attempting to create again.
                if (await this.app.vault.adapter.exists(current)) {
                    continue;
                }
                try {
                    await this.app.vault.createFolder(current);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error ?? '');

                    // Handle race condition / stale folder index on older Obsidian versions:
                    // the folder may already exist on disk even if getAbstractFileByPath has not
                    // caught up yet.
                    const existingFolder = this.app.vault.getAbstractFileByPath(current);
                    if (
                        existingFolder instanceof TFolder ||
                        message.toLowerCase().includes('folder already exists') ||
                        await this.app.vault.adapter.exists(current)
                    ) {
                        // Folder was created by another call, continue
                        continue;
                    }
                    // Re-throw if it's a different error
                    throw error;
                }
            } else if (!(af instanceof TFolder)) {
                const errorMsg = `Error: Path ${current} exists but is not a folder. Check Storyteller Suite settings.`;
                new Notice(errorMsg);
                console.error(errorMsg);
                throw new Error(errorMsg);
            }
        }
    }

    /**
     * Check if image needs tiles and trigger generation if needed
     * Called automatically after image upload
     *
     * @param imagePath - Vault path to uploaded image
     * @param imageData - Image ArrayBuffer for dimension checking
     * @param force - If true, generate tiles regardless of threshold (for map images)
     */
    async maybeTriggerTileGeneration(
        imagePath: string,
        imageData: ArrayBuffer,
        force = false
    ): Promise<void> {
        try {
            // Check if tiling is enabled (unless forcing)
            const threshold = this.settings.tiling?.autoGenerateThreshold || -1;
            console.log(`[TileGeneration] Checking tile generation for: ${imagePath}`);
            console.log(`[TileGeneration] Current threshold setting: ${threshold}, force: ${force}`);
            
            if (!force && threshold < 0) {
                // Tiling disabled (unless forcing)
                console.log('[TileGeneration] Tiling is disabled (threshold < 0)');
                new Notice('Tile generation is disabled. Enable it in plugin settings to auto-generate tiles.');
                return;
            }

            // Get image dimensions
            console.log('[TileGeneration] Getting image dimensions...');
            const dimensions = await this.getImageDimensions(imageData);
            console.log(`[TileGeneration] Image dimensions: ${dimensions.width}x${dimensions.height}`);

            // Check if image exceeds threshold (unless forcing)
            if (!force && dimensions.width < threshold && dimensions.height < threshold) {
                console.log(`[TileGeneration] Image below threshold (${threshold}px), skipping. Image is ${dimensions.width}x${dimensions.height}`);
                new Notice(`Image (${dimensions.width}x${dimensions.height}px) is below tiling threshold (${threshold}px). Tiles will not be generated.`);
                return;
            }

            // Show notification
            const forceMsg = force ? ' (forced for map)' : '';
            new Notice(`Generating map tiles for ${dimensions.width}x${dimensions.height}px image${forceMsg}...`);

            // Import and create tile generator
            const { TileGenerator } = await import('./leaflet/TileGenerator');
            const tileGenerator = new TileGenerator(this.app, this);

            // Generate tiles (run in background, don't await)
            tileGenerator.generateTiles(imagePath, {
                onProgress: (progress) => {
                    if (this.settings.tiling?.showProgressNotifications) {
                        this.updateTileProgressNotice(progress);
                    }
                }
            }).then(() => {
                new Notice('Map tiles generated successfully!');
            }).catch((error) => {
                console.error('[TileGeneration] Failed:', error);
                new Notice('Failed to generate map tiles: ' + error.message);
            });

        } catch (error) {
            console.error('[TileGeneration] Error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`Tile generation error: ${errorMessage}. Check console for details.`);
            throw error; // Re-throw so caller can handle it
        }
    }

    /**
     * Force tile generation for a map image and wait for completion
     * Used when initializing a map that requires tiles
     *
     * @param imagePath - Vault path to image
     * @returns Promise that resolves when tiles are generated
     */
    async forceGenerateTilesForMap(imagePath: string): Promise<string> {
        try {
            console.log(`[TileGeneration] Force generating tiles for map image: ${imagePath}`);
            
            // Read image data once
            const imageData = await this.app.vault.adapter.readBinary(imagePath);
            
            // Check if tiles already exist by calculating hash
            const hashBuffer = await crypto.subtle.digest('SHA-256', imageData);
            const hash = Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
                .substring(0, 16);
            
            const metadataPath = `StorytellerSuite/MapTiles/${hash}/metadata.json`;
            const existingMetadata = this.app.vault.getAbstractFileByPath(metadataPath);
            
            if (existingMetadata instanceof TFile) {
                console.log('[TileGeneration] Tiles already exist, skipping generation');
                return hash;
            }

            // Get image dimensions for notification
            const dimensions = await this.getImageDimensions(imageData);
            new Notice(`Generating map tiles for ${dimensions.width}x${dimensions.height}px image...`);

            // Import and create tile generator
            const { TileGenerator } = await import('./leaflet/TileGenerator');
            const tileGenerator = new TileGenerator(this.app, this);

            // Generate tiles and wait for completion
            const tileHash = await tileGenerator.generateTiles(imagePath, {
                onProgress: (progress) => {
                    if (this.settings.tiling?.showProgressNotifications) {
                        this.updateTileProgressNotice(progress);
                    }
                }
            });

            new Notice('Map tiles generated successfully!');
            return tileHash;

        } catch (error) {
            console.error('[TileGeneration] Failed to force generate tiles:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`Failed to generate map tiles: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Generate image grid markdown from array of image paths
     * Creates a responsive grid layout with Obsidian image embeds
     * Uses a div-based CSS grid approach to avoid markdown table pipe conflicts
     *
     * @param images - Array of image file paths
     * @param imageSize - Size of each image in pixels (default: 200)
     * @returns Markdown string with image grid
     */
    private generateImageGridMarkdown(
        images: string[] | undefined,
        imageSize: number = 200
    ): string {
        if (!images || images.length === 0) {
            return '';
        }

        // Use simple image embeds - one per line
        // Obsidian renders these inline, and our CSS will handle grid layout
        // This avoids the markdown table pipe character conflict entirely
        const imageEmbeds = images.map(img => `![[${img}|${imageSize}]]`).join('\n');

        return imageEmbeds;
    }

    /**
     * Get dimensions of image from ArrayBuffer
     * Loads image in memory to read native dimensions
     *
     * @param imageData - Image file data
     * @returns Image width and height
     */
    private async getImageDimensions(
        imageData: ArrayBuffer
    ): Promise<{ width: number; height: number }> {
        if (isSvgArrayBuffer(imageData)) {
            const info = getSvgSourceInfoFromArrayBuffer(imageData);
            return {
                width: info.width,
                height: info.height
            };
        }

        return new Promise((resolve, reject) => {
            const blob = new Blob([imageData]);
            const url = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve({
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height
                });
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image for dimension check'));
            };

            img.src = url;
        });
    }

    /**
     * Update progress notice during tile generation
     * Reuses same notice to avoid spam
     */
    private tileProgressNotice?: Notice;
    private updateTileProgressNotice(progress: {
        percentComplete: number;
        tilesGenerated: number;
        totalTiles: number;
    }): void {
        const message = `Generating tiles: ${progress.percentComplete}% (${progress.tilesGenerated}/${progress.totalTiles})`;

        if (!this.tileProgressNotice) {
            this.tileProgressNotice = new Notice(message, 0); // 0 = don't auto-dismiss
        } else {
            this.tileProgressNotice.setMessage(message);
        }

        // Hide notice when complete
        if (progress.percentComplete >= 100) {
            setTimeout(() => {
                this.tileProgressNotice?.hide();
                this.tileProgressNotice = undefined;
            }, 2000);
        }
    }

	/**
	 * Generic file parser for storytelling entity files
	 * Extracts frontmatter and ALL markdown content sections dynamically
	 * @param file The file to parse
	 * @param typeDefaults Default values for the entity type
	 * @returns Parsed entity data or null if parsing fails
	 */
    async parseFile<T>(
        file: TFile,
        typeDefaults: Partial<T>,
        entityType: 'character' | 'location' | 'event' | 'item' | 'reference' | 'chapter' | 'scene' | 'culture' | 'faction' | 'economy' | 'magicSystem' | 'map' | 'compendiumEntry' | 'book' | 'campaignSession'
	): Promise<T | null> {
		try {
			// External file moves/deletes can leave stale TFile handles briefly; skip safely.
			const fileStillExists = await this.app.vault.adapter.exists(normalizePath(file.path));
			if (!fileStillExists) {
				return null;
			}

			// Read file content for markdown sections
			const content = await this.app.vault.cachedRead(file);
            const allSections = parseSectionsFromMarkdown(content);

			// Get cached frontmatter from Obsidian's metadata cache
			const fileCache = this.app.metadataCache.getFileCache(file);
			const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

			// Also parse frontmatter directly from file content to capture empty values
			// This ensures manually-added empty fields are not lost
			const directFrontmatter = parseFrontmatterFromContent(content);

			// Merge both sources, preferring direct parsing for better empty value handling
			// Direct parsing captures empty values that the cache might miss
			const frontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };

            if (!isStampedEntityTypeCompatible(frontmatter['entityType'], entityType)) {
                return null;
            }

			// Combine frontmatter and defaults with file path
			// IMPORTANT: Do NOT spread allSections into top-level props to avoid leaking into YAML later.
			const data: Record<string, unknown> = {
				...typeDefaults as unknown as Record<string, unknown>,
				...frontmatter,
				filePath: file.path
			};

            // Map well-known sections into lowercase fields used by UI
            // Always map sections if they exist in the file, even if empty (to prevent field bleeding)
            if ('Description' in allSections) data['description'] = allSections['Description'];
            if ('Backstory' in allSections) data['backstory'] = allSections['Backstory'];
            if ('History' in allSections) data['history'] = allSections['History'];
            if ('Outcome' in allSections) data['outcome'] = allSections['Outcome'];

            // Entity-type specific mappings
            if (entityType === 'reference') {
                if ('Content' in allSections) data['content'] = allSections['Content'];
            } else if (entityType === 'chapter') {
                if ('Summary' in allSections) data['summary'] = allSections['Summary'];
            } else if (entityType === 'scene') {
                if ('Content' in allSections) data['content'] = allSections['Content'];
                if (allSections['Beat Sheet']) {
                    const raw = allSections['Beat Sheet'] as string;
                    const beats = raw
                        .split('\n')
                        .map(line => line.replace(/^\-\s*/, '').trim())
                        .filter(Boolean);
                    if (beats.length > 0) data['beats'] = beats;
                }
            } else if (entityType === 'item') {
                // Backward-compatibility: some older notes used "History / Lore" as heading
                if (!data['history'] && allSections['History / Lore']) data['history'] = allSections['History / Lore'];
            } else if (entityType === 'event') {
                // Support parsing Characters Involved from markdown section if present
                if (allSections['Characters Involved']) {
                    const charactersText = allSections['Characters Involved'];
                    const characters = charactersText
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.startsWith('- [[') && line.endsWith(']]'))
                        .map(line => line.replace(/^\- \[\[(.*?)\]\]$/, '$1'));
                    if (characters.length > 0) data['characters'] = characters;
                }
            }

			// Parse relationship-style lists from sections (kept as data fields, not YAML additions)
			if (allSections['Relationships']) {
				const relationshipsText = allSections['Relationships'];
				const relationships = relationshipsText
					.split('\n')
					.map(line => line.trim())
					.filter(line => line.startsWith('- [[') && line.endsWith(']]'))
					.map(line => line.replace(/^- \[\[(.*?)\]\]$/, '$1'));
				data['relationships'] = relationships;
			}

			if (allSections['Locations']) {
				const locationsText = allSections['Locations'];
				const locations = locationsText
					.split('\n')
					.map(line => line.trim())
					.filter(line => line.startsWith('- [[') && line.endsWith(']]'))
					.map(line => line.replace(/^- \[\[(.*?)\]\]$/, '$1'));
				data['locations'] = locations;
			}

			if (allSections['Events']) {
				const eventsText = allSections['Events'];
				const events = eventsText
					.split('\n')
					.map(line => line.trim())
					.filter(line => line.startsWith('- [[') && line.endsWith(']]'))
					.map(line => line.replace(/^- \[\[(.*?)\]\]$/, '$1'));
				data['events'] = events;
			}

            // Parse ```ledger blocks for entities that support balance tracking
            if (entityType === 'character' || entityType === 'location' || entityType === 'culture') {
                const { extractLedgerEntries, computeBalance, formatBalance } = await import('./utils/LedgerParser');
                const entries = extractLedgerEntries(content);
                if (entries.length > 0) {
                    data['ledger'] = entries;
                    // Recompute balance from ledger if no manual balance is set
                    if (!data['balance']) {
                        data['balance'] = formatBalance(computeBalance(entries));
                    }
                }
            }

            // Do not carry forward a raw sections map on the entity; only mapped fields are kept
            if ((data as any).sections) delete (data as any).sections;

            // Strip [[...]] wikilink brackets from linked entity arrays — stored with brackets
            // in YAML for Obsidian Graph/Properties support, but used internally as plain names
            await this.normalizeFrontmatterEntityReferences(data);

			// Validate required name field
			if (!data['name']) {
				// Only warn once per file to avoid console spam
				if (!this.warnedMissingNameFiles.has(file.path)) {
					console.warn(`File ${file.path} is missing a name in frontmatter.`);
					this.warnedMissingNameFiles.add(file.path);
				}
				return null;
			}

			// Clear warning state if file now has a name
			if (this.warnedMissingNameFiles.has(file.path)) {
				this.warnedMissingNameFiles.delete(file.path);
			}

			return data as T;
		} catch (e) {
			const maybeError = e as { code?: string; message?: string };
			if (maybeError?.code === 'ENOENT' || String(maybeError?.message ?? '').includes('ENOENT')) {
				return null;
			}
			console.error(`Error parsing file ${file.path}:`, e);
			new Notice(`Error parsing file: ${file.name}`);
			return null;
		}
	}

    async captureCurrentWritingProgress(): Promise<void> {
        if (!this.activeWritingSessionFilePath) {
            return;
        }

        const currentFile = this.app.vault.getAbstractFileByPath(this.activeWritingSessionFilePath);
        const trackableFile = currentFile instanceof TFile && currentFile.extension === 'md'
            ? currentFile
            : null;

        await this.finishActiveWritingSession();

        if (trackableFile && this.app.workspace.getActiveFile()?.path === trackableFile.path) {
            this.wordTracker.startSession(trackableFile);
            this.activeWritingSessionFilePath = trackableFile.path;
        }
    }

	/**
	 * Character Data Management
	 * Methods for creating, reading, updating, and deleting character entities
	 */

	/**
	 * Ensure the character folder exists for the active story
	 */
	async ensureCharacterFolder(): Promise<void> {
    await this.ensureFolder(this.getEntityFolder('character'));
	}

	/**
	 * Build sanitized YAML frontmatter for each entity type.
	 * Only whitelisted keys are allowed and multi-line strings are excluded.
	 */
    private async buildLinkedFrontmatter(
        entityType: 'character' | 'location' | 'event' | 'item' | 'culture' | 'economy' | 'magicSystem' | 'compendiumEntry' | 'book' | 'map',
        src: Record<string, unknown>,
        originalFrontmatter?: Record<string, unknown>
    ): Promise<Record<string, any>> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const prepared = await this.serializeFrontmatterEntityReferences(src);
        return buildFrontmatter(entityType, prepared.source, preserve, {
            customFieldsMode: mode,
            originalFrontmatter,
            omitOriginalKeys: prepared.omitOriginalKeys,
        }) as Record<string, any>;
    }

    private buildFrontmatterForCharacter(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('character', src, originalFrontmatter);
    }

    private buildFrontmatterForLocation(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('location', src, originalFrontmatter);
    }

    private buildFrontmatterForEvent(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('event', src, originalFrontmatter);
    }

    private buildFrontmatterForItem(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('item', src, originalFrontmatter);
    }

    private buildFrontmatterForCulture(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('culture', src, originalFrontmatter);
    }


    private buildFrontmatterForEconomy(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('economy', src, originalFrontmatter);
    }

    private buildFrontmatterForMagicSystem(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('magicSystem', src, originalFrontmatter);
    }

    private buildFrontmatterForCompendiumEntry(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('compendiumEntry', src, originalFrontmatter);
    }


	/**
	 * Save a character to the vault as a markdown file (in the active story)
	 * Creates frontmatter from character properties and adds markdown sections
	 * @param character The character data to save
	 */
	async saveCharacter(character: Character): Promise<void> {
		await this.ensureCharacterFolder();
		const folderPath = this.getEntityFolder('character');
		
		// Ensure character has a stable id for linking
		if (!character.id) {
			character.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
		}
		
		// Create safe filename from character name
		const fileName = `${character.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Separate content fields from frontmatter fields (do not let sections leak)
        const { filePath: currentFilePath, backstory, description, ledger: _charLedger, ...rest } = character as any;
        if ((rest as any).sections) delete (rest as any).sections;

		// Handle renaming if filePath is present and name changed
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'Location');
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
		let oldCharacter: Character | undefined;
		if (existingFile && existingFile instanceof TFile) {
			try {
				const existingContent = await this.app.vault.cachedRead(existingFile);
				existingSections = parseSectionsFromMarkdown(existingContent);
				
				// Parse frontmatter directly from file content to ensure empty values are captured
				const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
				const directFrontmatter = parseFrontmatterFromContent(existingContent);
				
				// Also get frontmatter from metadata cache
				const fileCache = this.app.metadataCache.getFileCache(existingFile);
				const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;
				
				// Merge both sources, preferring direct parsing for better empty value handling
				// Direct parsing captures empty values that the cache might miss
				if (directFrontmatter || cachedFrontmatter) {
					originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
				}

				// Load old character for sync comparison (only if not skipping sync)
				if (!(character as any)._skipSync) {
					const parsed = await this.parseFile<Character>(existingFile, { name: '' }, 'character');
					if (parsed) {
						oldCharacter = this.normalizeEntityCustomFields('character', parsed);
					}
				}
			} catch (error) {
				console.warn(`Error reading existing character file: ${error}`);
			}
		}

		// Build frontmatter strictly from whitelist, preserving original frontmatter
		const finalFrontmatter = await this.buildFrontmatterForCharacter(rest, originalFrontmatter);

		// Validate that we're not losing any fields before serialization
		if (originalFrontmatter) {
			const validation = validateFrontmatterPreservation(finalFrontmatter, originalFrontmatter);
			if (validation.lostFields.length > 0) {
				console.warn(`[saveCharacter] Warning: Fields will be lost on save:`, validation.lostFields);
			}
		}

		// Use custom serializer that preserves empty string values
		const frontmatterString = Object.keys(finalFrontmatter).length > 0
			? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `Character: ${character.name}`)
			: '';

		// Build sections from templates + provided data + TEMPLATE sections
		const providedSections = {
			Description: description !== undefined ? description : '',
			Backstory: backstory !== undefined ? backstory : ''
		};

		// Check for template-provided sections (from TemplateApplicator)
		const templateOnlySections = (character as any)._templateSections || {};

		const defaultSections = getTemplateSections('character', providedSections);

		// When updating existing files, preserve existing sections but allow overriding with provided data
		// This ensures empty fields can be saved and don't get overwritten by existing content
		// Merge priority: default < template < existing < provided
		let allSections: Record<string, string>;
		if (existingFile && existingFile instanceof TFile) {
			// Start with default sections, apply template sections, then existing, then provided
			allSections = {
				...defaultSections,
				...templateOnlySections,  // Template-provided sections
				...existingSections
			};
			// Explicitly override with provided sections (including empty ones)
			Object.entries(providedSections).forEach(([key, value]) => {
				allSections[key] = value;
			});
		} else {
			// New file: default < template < provided
			allSections = {
				...defaultSections,
				...templateOnlySections,  // Template-provided sections
				...providedSections
			};
		}

		// Generate Markdown
		let mdContent = `---\n${frontmatterString}---\n\n`;
		mdContent += Object.entries(allSections)
			.map(([key, content]) => `## ${key}\n${content || ''}`)
			.join('\n\n');
		if (!mdContent.endsWith('\n')) mdContent += '\n';

		// Save: modify existing or create new
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, mdContent);
		} else {
			await this.app.vault.create(finalFilePath, mdContent);
			new Notice('Note created with standard sections for easy editing.');
		}

		// Update path and refresh
		character.filePath = finalFilePath;
		
		// Sync bidirectional relationships (skip if _skipSync flag is set to prevent recursion)
		if (!(character as any)._skipSync) {
			try {
				const { EntitySyncService } = await import('./services/EntitySyncService');
				const syncService = new EntitySyncService(this);
				await syncService.syncEntity('character', character, oldCharacter);
			} catch (error) {
				console.error('[saveCharacter] Error syncing relationships:', error);
				// Don't throw - sync failures shouldn't prevent saves
			}
		}
		
		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	/**
	 * Load all characters from the character folder
	 * @returns Array of character objects sorted by name
	 */
	async listCharacters(): Promise<Character[]> {
    await this.ensureCharacterFolder();
    const folderPath = this.getEntityFolder('character');
        
        // Use vault.getMarkdownFiles() instead of folder.children for immediate file detection
        const allFiles = this.app.vault.getMarkdownFiles();
        const prefix = normalizePath(folderPath) + '/';
        const files = allFiles.filter(file =>
            file.path.startsWith(prefix) &&
            file.extension === 'md' &&
            !file.path.slice(prefix.length).includes('/')
        );

		// Parse each character file
		const characters: Character[] = [];
        for (const file of files) {
            let charData = await this.parseFile<Character>(file, { name: '' }, 'character');
            if (charData) charData = this.normalizeEntityCustomFields('character', charData);
            const charResult = charData;
            if (charResult) {
                characters.push(charResult);
			}
		}
		
		// Return sorted by name
		return characters.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Delete a character file by moving it to trash
	 * @param filePath Path to the character file to delete
	 */
	async deleteCharacter(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			// Get entity ID before deletion for cleanup
			let characterId: string | undefined;
			let characterName: string | undefined;
			try {
				const character = await this.parseFile<Character>(file, { name: '' }, 'character');
				if (character) {
					characterId = character.id || character.name;
					characterName = character.name;
				}
			} catch (e) {
				console.warn('Could not parse character before deletion:', e);
			}
			
			// Clean up references via EntitySyncService
			if (characterId) {
				try {
					const { EntitySyncService } = await import('./services/EntitySyncService');
					const syncService = new EntitySyncService(this);
					await syncService.handleEntityDeletion('character', characterId, characterName);
				} catch (error) {
					console.error('[deleteCharacter] Error cleaning up references:', error);
				}
			}

			await this.app.vault.trash(file, true);
			
			new Notice(`Character file "${file.basename}" moved to trash.`);
			this.app.metadataCache.trigger("dataview:refresh-views");
		} else {
			new Notice(`Error: Could not find character file to delete at ${filePath}`);
		}
	}

	/**
	 * Location Data Management
	 * Methods for creating, reading, updating, and deleting location entities
	 */

	/**
	 * Ensure the location folder exists for the active story
	 */
	async ensureLocationFolder(): Promise<void> {
    await this.ensureFolder(this.getEntityFolder('location'));
	}

	/**
	 * Save a location to the vault as a markdown file (in the active story)
	 * @param location The location data to save
	 */
	async saveLocation(location: Location): Promise<void> {
		await this.ensureLocationFolder();
		const folderPath = this.getEntityFolder('location');
		
		// Ensure location has a stable id for linking
		if (!location.id) {
			location.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
		}
		
		// Create safe filename from location name
		const fileName = `${location.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Separate content fields from frontmatter fields (do not let sections leak)
        const { filePath: currentFilePath, history, description, ledger: _locLedger, ...rest } = location as any;
        if ((rest as any).sections) delete (rest as any).sections;

		// Handle renaming if filePath is present and name changed
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'Location');
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
		let oldLocation: Location | undefined;
		if (existingFile && existingFile instanceof TFile) {
			try {
				const existingContent = await this.app.vault.cachedRead(existingFile);
				existingSections = parseSectionsFromMarkdown(existingContent);
				
				// Parse frontmatter directly from file content to ensure empty values are captured
				const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
				const directFrontmatter = parseFrontmatterFromContent(existingContent);
				
				// Also get frontmatter from metadata cache
				const fileCache = this.app.metadataCache.getFileCache(existingFile);
				const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;
				
				// Merge both sources, preferring direct parsing for better empty value handling
				if (directFrontmatter || cachedFrontmatter) {
					originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
				}

				// Load old location for sync comparison (only if not skipping sync)
				if (!(location as any)._skipSync) {
					const parsed = await this.parseFile<Location>(existingFile, { name: '' }, 'location');
					if (parsed) {
						oldLocation = this.normalizeEntityCustomFields('location', parsed);
					}
				}
			} catch (error) {
				console.warn(`Error reading existing location file: ${error}`);
			}
		}

		// Build frontmatter strictly from whitelist, preserving original frontmatter
		const finalFrontmatter = await this.buildFrontmatterForLocation(rest, originalFrontmatter);

		// Validate that we're not losing any fields before serialization
		if (originalFrontmatter) {
			const validation = validateFrontmatterPreservation(finalFrontmatter, originalFrontmatter);
			if (validation.lostFields.length > 0) {
				console.warn(`[saveLocation] Warning: Fields will be lost on save:`, validation.lostFields);
			}
		}

		// Use custom serializer that preserves empty string values
		const frontmatterString = Object.keys(finalFrontmatter).length > 0
			? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `Location: ${location.name}`)
			: '';

		// Build sections from templates + provided data + TEMPLATE sections
		const providedSections: Record<string, string> = {
			Description: description || '',
			History: history || ''
		};

		// Check for template-provided sections (from TemplateApplicator)
		const templateOnlySections = (location as any)._templateSections || {};

		const defaultSections = getTemplateSections('location', providedSections);

		// Merge priority: default < template < existing < provided
		let allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
			? { ...defaultSections, ...templateOnlySections, ...existingSections, ...providedSections }
			: { ...defaultSections, ...templateOnlySections, ...providedSections };

		// Handle Gallery section: auto-generate from images array
		if (location.images && location.images.length > 0) {
			allSections.Gallery = this.generateImageGridMarkdown(location.images);
		} else {
			// Remove Gallery section if no images exist
			delete allSections.Gallery;
		}

		// Generate Markdown
		let mdContent = `---\n${frontmatterString}---\n\n`;
		mdContent += Object.entries(allSections)
			.map(([key, content]) => `## ${key}\n${content || ''}`)
			.join('\n\n');
		if (!mdContent.endsWith('\n')) mdContent += '\n';

		// Save or update the file
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, mdContent);
		} else {
			await this.app.vault.create(finalFilePath, mdContent);
			new Notice('Note created with standard sections for easy editing.');
		}
		
		// Update the filePath in the location object
		location.filePath = finalFilePath;
		
		// Sync bidirectional relationships (skip if _skipSync flag is set to prevent recursion)
		if (!(location as any)._skipSync) {
			try {
				const { EntitySyncService } = await import('./services/EntitySyncService');
				const syncService = new EntitySyncService(this);
				await syncService.syncEntity('location', location, oldLocation);
			} catch (error) {
				console.error('[saveLocation] Error syncing relationships:', error);
				// Don't throw - sync failures shouldn't prevent saves
			}
		}
		
		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	/**
	 * Load all locations from the location folder
	 * @returns Array of location objects sorted by name
	 */
	async listLocations(): Promise<Location[]> {
    await this.ensureLocationFolder();
    const folderPath = this.getEntityFolder('location');
        
        // Use vault.getMarkdownFiles() instead of folder.children for immediate file detection
        const allFiles = this.app.vault.getMarkdownFiles();
        const prefix = normalizePath(folderPath) + '/';
        const files = allFiles.filter(file =>
            file.path.startsWith(prefix) &&
            file.extension === 'md' &&
            !file.path.slice(prefix.length).includes('/')
        );

		// Parse each location file
		const locations: Location[] = [];
        for (const file of files) {
            let locData = await this.parseFile<Location>(file, { name: '' }, 'location');
            if (locData) locData = this.normalizeEntityCustomFields('location', locData);
            if (locData) {
                locations.push(locData);
			}
		}
		
		// Return sorted by name
		return locations.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Delete a location file by moving it to trash
	 * @param filePath Path to the location file to delete
	 */
	async deleteLocation(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			// Get entity ID before deletion for cleanup
			let locationId: string | undefined;
			let locationName: string | undefined;
			try {
				const location = await this.parseFile<Location>(file, { name: '' }, 'location');
				if (location) {
					locationId = location.id || location.name;
					locationName = location.name;
				}
			} catch (e) {
				console.warn('Could not parse location before deletion:', e);
			}
			
			// Clean up references via EntitySyncService
			if (locationId) {
				try {
					const { EntitySyncService } = await import('./services/EntitySyncService');
					const syncService = new EntitySyncService(this);
					await syncService.handleEntityDeletion('location', locationId, locationName);
				} catch (error) {
					console.error('[deleteLocation] Error cleaning up references:', error);
				}
			}

			await this.app.vault.trash(file, true);
			
			new Notice(`Location file "${file.basename}" moved to trash.`);
			this.app.metadataCache.trigger("dataview:refresh-views");
		} else {
			new Notice(`Error: Could not find location file to delete at ${filePath}`);
		}
	}

	// Sensory Profile Methods

	async saveSensoryProfile(profile: LocationSensoryProfile): Promise<void> {
		if (!this.settings.sensoryProfiles) {
			this.settings.sensoryProfiles = [];
		}

		const existingIndex = this.settings.sensoryProfiles.findIndex(
			p => p.locationId === profile.locationId
		);

		if (existingIndex >= 0) {
			this.settings.sensoryProfiles[existingIndex] = profile;
		} else {
			this.settings.sensoryProfiles.push(profile);
		}

		await this.saveSettings();
		new Notice(`Sensory profile for ${profile.locationName} saved.`);
	}

	getSensoryProfile(locationId: string): LocationSensoryProfile | null {
		if (!this.settings.sensoryProfiles) return null;
		return this.settings.sensoryProfiles.find(p => p.locationId === locationId) || null;
	}

	async deleteSensoryProfile(locationId: string): Promise<void> {
		if (!this.settings.sensoryProfiles) return;

		this.settings.sensoryProfiles = this.settings.sensoryProfiles.filter(
			p => p.locationId !== locationId
		);

		await this.saveSettings();
		new Notice('Sensory profile deleted.');
	}

	// DEPRECATED: Map functionality has been deprecated
	/**
	 * Map Data Management
	 * Methods for creating, reading, updating, and deleting map entities
	 * @deprecated Map functionality has been deprecated
	 */

	/**
	 * Ensure the map folder exists for the active story
	 * @deprecated Map functionality has been deprecated
	 */
	async ensureMapFolder(): Promise<void> {
		await this.ensureFolder(this.getEntityFolder('map'));
	}

	/**
	 * Build frontmatter for map entity
	 */
	private buildFrontmatterForMap(map: Partial<StoryMap>, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, unknown>> {
		return this.buildLinkedFrontmatter('map', map as Record<string, unknown>, originalFrontmatter);
	}
	/**
	 * Safely rename a file, deleting the destination if it already exists
	 * Prevents "Destination file already exists!" errors during file operations
	 * @param currentFilePath The current path of the file
	 * @param newFilePath The new path for the file
	 * @param entityType The type of entity being renamed (for logging)
	 * @returns The final file path after renaming
	 */
	private async safeRenameFile(currentFilePath: string, newFilePath: string, entityType: string): Promise<string> {
		const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
		if (!existingFile || !(existingFile instanceof TFile)) {
			return newFilePath;
		}

		// Check if destination already exists
		const destinationFile = this.app.vault.getAbstractFileByPath(newFilePath);
		if (destinationFile && destinationFile instanceof TFile) {
			// Destination exists, delete it before renaming (name collision)
			console.log(`safe${entityType}Rename: Deleting existing file at destination: ${newFilePath}`);
			await this.app.vault.delete(destinationFile);
		}

		// Rename the file
		await this.app.fileManager.renameFile(existingFile, newFilePath);
		return newFilePath;
	}

	/**
	 * Save a map to the vault as a markdown file (in the active story)
	 * @param map The map data to save
	 */
	async saveMap(map: StoryMap): Promise<void> {
		await this.ensureMapFolder();
		const folderPath = this.getEntityFolder('map');

		// Ensure map has a stable id for linking
		if (!map.id) {
			map.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
		}

		// Create safe filename from map name
		const fileName = `${map.name.replace(/[\\:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Separate content fields from frontmatter fields
		const { filePath: currentFilePath, description, ...rest } = map as any;
		if ((rest as any).sections) delete (rest as any).sections;

		// Handle renaming if filePath is present and name changed
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'Map');
		}

		// Check if file exists and read existing frontmatter and sections
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
		if (existingFile && existingFile instanceof TFile) {
			try {
				const existingContent = await this.app.vault.cachedRead(existingFile);
				existingSections = parseSectionsFromMarkdown(existingContent);

				const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
				const directFrontmatter = parseFrontmatterFromContent(existingContent);
				const fileCache = this.app.metadataCache.getFileCache(existingFile);
				const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

				if (directFrontmatter || cachedFrontmatter) {
					originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
				}
			} catch (error) {
				console.warn(`Error reading existing map file: ${error}`);
			}
		}

		// Build frontmatter
		const finalFrontmatter = await this.buildFrontmatterForMap(rest, originalFrontmatter);

		// Use custom serializer
		const frontmatterString = Object.keys(finalFrontmatter).length > 0
			? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `Map: ${map.name}`)
			: '';

		// Build sections
		const providedSections = {
			Description: description || ''
		};

		const templateOnlySections = (map as any)._templateSections || {};
		const defaultSections = getTemplateSections('map', providedSections);

		const allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
			? { ...defaultSections, ...templateOnlySections, ...existingSections, ...providedSections }
			: { ...defaultSections, ...templateOnlySections, ...providedSections };

		// Assemble final markdown
		let content = '';
		if (frontmatterString) {
			content += `---\n${frontmatterString}---\n\n`;
		}

		for (const [sectionName, sectionContent] of Object.entries(allSections)) {
			if (sectionContent && sectionContent.trim()) {
				content += `## ${sectionName}\n${sectionContent}\n\n`;
			}
		}

		// Write to vault
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
		} else {
			await this.app.vault.create(finalFilePath, content);
		}

		// Update filePath on the map object
		(map as any).filePath = finalFilePath;
	}

	/**
	 * Load all maps from the map folder
	 * @returns Array of map objects sorted by name
	 * @deprecated Map functionality has been deprecated
	 */
	async listMaps(): Promise<StoryMap[]> {
		await this.ensureMapFolder();
		const folderPath = this.getEntityFolder('map');
		
		// Scan recursively so maps stored in live subfolders are discoverable everywhere.
		const allFiles = this.app.vault.getMarkdownFiles();
		const prefix = normalizePath(folderPath) + '/';
		const files = allFiles.filter(file =>
			file.path.startsWith(prefix) &&
			file.extension === 'md'
		);

		// Parse each map file
		const maps: StoryMap[] = [];
		for (const file of files) {
			let mapData = await this.parseFile<StoryMap>(file, { name: '', markers: [], scale: 'custom' }, 'map');
			if (mapData) {
				mapData = this.normalizeEntityCustomFields('map', mapData);
				if (mapData) {
					maps.push(mapData);
				}
			}
		}
		
		// Return sorted by name
		return maps.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Get a single map by ID
	 * @param mapId The ID of the map to retrieve
	 * @returns The map object or null if not found
	 */
	async getMap(mapId: string): Promise<StoryMap | null> {
		const maps = await this.listMaps();
		return maps.find(m => m.id === mapId || m.name === mapId) || null;
	}

	/**
	 * Get a map by name
	 */
	async getMapByName(name: string): Promise<StoryMap | null> {
		const maps = await this.listMaps();
		return maps.find(m => m.name === name) || null;
	}

	/**
	 * Get a map by ID
	 */
	async getMapById(id: string): Promise<StoryMap | null> {
		const maps = await this.listMaps();
		return maps.find(m => m.id === id) || null;
	}

	/**
	 * Get saved map view state (zoom and center position) for a specific map
	 * Used to restore the user's last position when reopening a map
	 * @param mapId The map ID or name
	 * @returns The saved view state or null if none exists
	 */
	getMapViewState(mapId: string): { zoom: number; center: { lat: number; lng: number } } | null {
		if (!mapId || !this.settings.mapViewStates) return null;
		return this.settings.mapViewStates[mapId] || null;
	}

	/**
	 * Save map view state (zoom and center position) for a specific map
	 * Called when user pans or zooms the map to remember their position
	 * Uses debouncing to avoid excessive writes
	 * @param mapId The map ID or name
	 * @param zoom The current zoom level
	 * @param center The current center coordinates
	 */
	async saveMapViewState(mapId: string, zoom: number, center: { lat: number; lng: number }): Promise<void> {
		if (!mapId) return;

		// Validate zoom: must be a finite number
		// Note: For custom CRS (image maps), zoom can be negative or fractional
		// We allow a wide range but cap at reasonable limits
		const MIN_ZOOM = -10;  // Allow negative zoom for custom CRS
		const MAX_ZOOM = 30;
		if (typeof zoom !== 'number' || !Number.isFinite(zoom)) {
			console.error(`[StorytellerSuite] saveMapViewState: Invalid zoom value "${zoom}" - must be a finite number`);
			return;
		}
		if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
			// Clamp to valid range instead of rejecting
			const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
			console.warn(`[StorytellerSuite] saveMapViewState: Zoom value ${zoom} out of range, clamping to ${clampedZoom}`);
			zoom = clampedZoom;
		}

		// Validate center coordinates
		if (!center || typeof center !== 'object') {
			console.error(`[StorytellerSuite] saveMapViewState: Invalid center - must be an object with lat and lng`);
			return;
		}

		const { lat, lng } = center;

		// Validate coordinates: must be finite numbers
		// Note: For image maps with custom CRS, coordinates can be in pixel space (thousands),
		// not geographic lat/lng (-90 to 90). So we only check for finite numbers.
		if (typeof lat !== 'number' || !Number.isFinite(lat)) {
			console.error(`[StorytellerSuite] saveMapViewState: Invalid latitude "${lat}" - must be a finite number`);
			return;
		}
		if (typeof lng !== 'number' || !Number.isFinite(lng)) {
			console.error(`[StorytellerSuite] saveMapViewState: Invalid longitude "${lng}" - must be a finite number`);
			return;
		}

		// Initialize mapViewStates if not present
		if (!this.settings.mapViewStates) {
			this.settings.mapViewStates = {};
		}

		// Only save if values have actually changed to reduce writes
		const existing = this.settings.mapViewStates[mapId];
		if (existing &&
			Math.abs(existing.zoom - zoom) < 0.01 &&
			Math.abs(existing.center.lat - lat) < 0.0001 &&
			Math.abs(existing.center.lng - lng) < 0.0001) {
			return; // No significant change
		}

		this.settings.mapViewStates[mapId] = { zoom, center: { lat, lng } };
		await this.saveSettings();
	}

	/**
	 * Activate map view (stub for compatibility)
	 */
	async activateMapView(mapId?: string): Promise<void> {
		const { workspace } = this.app;

		// Check if a map view already exists
		const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_MAP);

		if (existingLeaves.length > 0) {
			// Reveal existing map view
			const leaf = existingLeaves[0];
			workspace.revealLeaf(leaf);
			
			// If a specific map ID is provided, load it
			if (mapId && leaf.view instanceof MapView) {
				await leaf.view.loadMap(mapId);
			}
			return;
		}

		// Create new leaf for map view in main editor area (as a tab)
		const leaf = workspace.getLeaf('tab');
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_MAP,
				active: true,
				state: mapId ? { mapId } : undefined
			});
			workspace.revealLeaf(leaf);
		} else {
			console.error("Storyteller Suite: Could not create workspace leaf for map view.");
			new Notice("Error opening map view: Could not create workspace leaf.");
		}
	}

	/**
	 * Delete a map file by moving it to trash
	 * @param filePath Path to the map file to delete
	 */
	async deleteMap(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			// First, get the map data to find its ID
			const mapData = await this.parseFile<StoryMap>(file, { name: '', markers: [], scale: 'custom' }, 'map');
			const mapId = mapData?.id || mapData?.name;

			// Clean up all references to this map if we have an ID
			if (mapId) {
				// Remove map bindings from all locations that reference this map
				const locations = await this.listLocations();
				for (const location of locations) {
					let needsSave = false;

					// Remove from mapBindings
					if (location.mapBindings && location.mapBindings.length > 0) {
						const originalLength = location.mapBindings.length;
						location.mapBindings = location.mapBindings.filter(b => b.mapId !== mapId);
						if (location.mapBindings.length !== originalLength) {
							needsSave = true;
						}
					}

					// Clear correspondingMapId if it points to this map
					if (location.correspondingMapId === mapId) {
						location.correspondingMapId = undefined;
						needsSave = true;
					}

					if (needsSave) {
						await this.saveLocation(location);
					}
				}

				// Update parent/child map references in other maps
				const maps = await this.listMaps();
				for (const otherMap of maps) {
					if (otherMap.filePath === filePath) continue; // Skip the map being deleted
					
					let needsSave = false;

					// Remove from parent reference
					if (otherMap.parentMapId === mapId) {
						otherMap.parentMapId = undefined;
						needsSave = true;
					}

					// Remove from child references
					if (otherMap.childMapIds && otherMap.childMapIds.includes(mapId)) {
						otherMap.childMapIds = otherMap.childMapIds.filter(id => id !== mapId);
						needsSave = true;
					}

					if (needsSave) {
						await this.saveMap(otherMap);
					}
				}

				// Clean up map view state
				if (this.settings.mapViewStates && this.settings.mapViewStates[mapId]) {
					delete this.settings.mapViewStates[mapId];
					await this.saveSettings();
				}

				// Clean up map references from all entity files (characters, events, items, references, scenes, etc.)
				await this.cleanupMapReferencesFromEntities(mapId);
			}

			// Now delete the file
			await this.app.vault.trash(file, true);
			new Notice(`Map "${file.basename}" deleted and references cleaned up.`);
			this.app.metadataCache.trigger("dataview:refresh-views");
		} else {
			new Notice(`Error: Could not find map file to delete at ${filePath}`);
		}
	}

	/**
	 * Link a location to a map
	 * @param locationName Name of the location to link
	 * @param mapId ID of the map to link to
	 * @deprecated Use LocationService.addMapBinding instead
	 */
	async linkLocationToMap(locationName: string, mapId: string): Promise<void> {
		console.warn('DEPRECATED: Use LocationService.addMapBinding instead');
	}

	/**
	 * Unlink a location from a map
	 * @param locationName Name of the location to unlink
	 * @param mapId ID of the map to unlink from
	 * @deprecated Use LocationService.removeMapBinding instead
	 */
	async unlinkLocationFromMap(locationName: string, mapId: string): Promise<void> {
		console.warn('DEPRECATED: Use LocationService.removeMapBinding instead');
	}

	/**
	 * Remove an entity from a map (and update both the location and entity data)
	 * This comprehensive removal:
	 * 1. Removes the entity from the location's entityRefs array
	 * 2. Clears the entity's location reference (currentLocationId, location, currentLocation)
	 * @param entityId ID of the entity to remove
	 * @param entityType Type of entity (character, event, item)
	 * @param locationId ID of the location to remove the entity from
	 * @returns Promise that resolves when removal is complete
	 */
	async removeEntityFromMap(
		entityId: string,
		entityType: 'character' | 'event' | 'item',
		locationId: string
	): Promise<void> {
		try {
			// Step 1: Remove from location's entityRefs
			const locations = await this.listLocations();
			const location = locations.find(l => (l.id || l.name) === locationId);
			
			if (location && location.entityRefs) {
				const originalLength = location.entityRefs.length;
				location.entityRefs = location.entityRefs.filter(
					ref => !(ref.entityId === entityId && ref.entityType === entityType)
				);
				
				if (location.entityRefs.length !== originalLength) {
					await this.saveLocation(location);
				}
			}

			// Step 2: Clear the entity's location reference
			switch (entityType) {
				case 'character': {
					const characters = await this.listCharacters();
					const character = characters.find(c => (c.id || c.name) === entityId);
					if (character && character.currentLocationId === locationId) {
						character.currentLocationId = undefined;
						await this.saveCharacter(character);
					}
					break;
				}
				case 'event': {
					const events = await this.listEvents();
					const event = events.find(e => (e.id || e.name) === entityId);
					if (event) {
						// Events store location as string (name/link), so we need to check if it matches
						const locationName = location?.name;
						if (event.location === locationId || event.location === locationName) {
							event.location = undefined;
							await this.saveEvent(event);
						}
					}
					break;
				}
				case 'item': {
					const items = await this.listPlotItems();
					const item = items.find(i => (i.id || i.name) === entityId);
					if (item) {
						// Items store currentLocation as string (name/link)
						const locationName = location?.name;
						if (item.currentLocation === locationId || item.currentLocation === locationName) {
							item.currentLocation = undefined;
							await this.savePlotItem(item);
						}
					}
					break;
				}
			}

			// Get entity name for notice
			let entityName = entityId;
			switch (entityType) {
				case 'character': {
					const chars = await this.listCharacters();
					const char = chars.find(c => (c.id || c.name) === entityId);
					entityName = char?.name || entityId;
					break;
				}
				case 'event': {
					const events = await this.listEvents();
					const event = events.find(e => (e.id || e.name) === entityId);
					entityName = event?.name || entityId;
					break;
				}
				case 'item': {
					const items = await this.listPlotItems();
					const item = items.find(i => (i.id || i.name) === entityId);
					entityName = item?.name || entityId;
					break;
				}
			}

			new Notice(`Removed ${entityName} from ${location?.name || locationId}`);
			this.app.metadataCache.trigger("dataview:refresh-views");
			
		} catch (error) {
			console.error('Error removing entity from map:', error);
			new Notice(`Error removing entity: ${error}`);
			throw error;
		}
	}

	/**
	 * Clean up map references (mapId, relatedMapIds, mapCoordinates, markerId) from all entity files
	 * This is called when a map is deleted to remove orphaned references
	 * @param mapId The ID of the map being deleted
	 */
	private async cleanupMapReferencesFromEntities(mapId: string): Promise<void> {
		// Entity types that can have map references in their frontmatter
		// Build list safely, skipping any entity types that can't resolve folders
		const entityTypes: Array<{ type: string; folder: string }> = [];
		const typesToCheck: Array<EntityFolderType> = [
			'character', 'event', 'item', 'reference', 'scene',
			'culture', 'economy', 'magicSystem'
		];

		for (const type of typesToCheck) {
			try {
				const folder = this.getEntityFolder(type);
				entityTypes.push({ type, folder });
			} catch (error) {
				// Skip entity types that can't resolve (e.g., no active story and no custom path)
				console.debug(`[StorytellerSuite] Skipping ${type} folder in map cleanup: ${error.message}`);
			}
		}

		let cleanedCount = 0;

		for (const { type, folder } of entityTypes) {
			try {
				const folderPath = normalizePath(folder);
				const allFiles = this.app.vault.getMarkdownFiles();
				const entityFiles = allFiles.filter(file => 
					file.path.startsWith(folderPath + '/') && file.extension === 'md'
				);

				for (const file of entityFiles) {
					let needsUpdate = false;

					await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
						// Check if mapId matches the deleted map
						if (frontmatter.mapId === mapId) {
							delete frontmatter.mapId;
							// Also remove markerId and mapCoordinates if they're for this map
							delete frontmatter.markerId;
							delete frontmatter.mapCoordinates;
							needsUpdate = true;
						}

						// Remove from relatedMapIds array
						if (Array.isArray(frontmatter.relatedMapIds)) {
							const originalLength = frontmatter.relatedMapIds.length;
							frontmatter.relatedMapIds = (frontmatter.relatedMapIds as string[]).filter(id => id !== mapId);
							if (frontmatter.relatedMapIds.length !== originalLength) {
								// Remove the array if it's now empty
								if (frontmatter.relatedMapIds.length === 0) {
									delete frontmatter.relatedMapIds;
								}
								needsUpdate = true;
							}
						}
					});

					if (needsUpdate) {
						cleanedCount++;
					}
				}
			} catch (error) {
				console.error(`Error cleaning up map references from ${type} entities:`, error);
			}
		}

		if (cleanedCount > 0) {
			console.log(`Cleaned up map references from ${cleanedCount} entity file(s)`);
		}
	}

	/**
	 * Event Data Management
	 * Methods for creating, reading, updating, and deleting event entities
	 */

	/**
	 * Ensure the event folder exists for the active story
	 */
	async ensureEventFolder(): Promise<void> {
    await this.ensureFolder(this.getEntityFolder('event'));
	}

	/**
	 * Save an event to the vault as a markdown file (in the active story)
	 * @param event The event data to save
	 */
	async saveEvent(event: Event): Promise<void> {
		await this.ensureEventFolder();
		const folderPath = this.getEntityFolder('event');

		// Ensure events have stable IDs so dependency tracking can survive sorting and grouping changes
		if (!event.id) {
			event.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
		}
		
		// Create safe filename from event name
		const safeName = event.name?.replace(/[\\/:"*?<>|#^[\]]+/g, '') || 'Unnamed Event';
		const fileName = `${safeName}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Separate content fields from frontmatter fields (do not let sections leak)
        const { filePath: currentFilePath, description, outcome, ...rest } = event as any;
        if ((rest as any).sections) delete (rest as any).sections;

		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'Location');
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
		let oldEvent: Event | undefined;
		if (existingFile && existingFile instanceof TFile) {
			try {
				const existingContent = await this.app.vault.cachedRead(existingFile);
				existingSections = parseSectionsFromMarkdown(existingContent);
				
				// Parse frontmatter directly from file content to ensure empty values are captured
				const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
				const directFrontmatter = parseFrontmatterFromContent(existingContent);
				
				// Also get frontmatter from metadata cache
				const fileCache = this.app.metadataCache.getFileCache(existingFile);
				const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;
				
				// Merge both sources, preferring direct parsing for better empty value handling
				if (directFrontmatter || cachedFrontmatter) {
					originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
				}

				// Load old event for sync comparison (only if not skipping sync)
				if (!(event as any)._skipSync) {
					const parsed = await this.parseFile<Event>(existingFile, { name: '' }, 'event');
					if (parsed) {
						oldEvent = this.normalizeEntityCustomFields('event', parsed);
					}
				}
			} catch (error) {
				console.warn(`Error reading existing event file: ${error}`);
			}
		}

		// Build frontmatter strictly from whitelist, preserving original frontmatter
		const finalFrontmatter = await this.buildFrontmatterForEvent(rest, originalFrontmatter);

		// Validate that we're not losing any fields before serialization
		if (originalFrontmatter) {
			const validation = validateFrontmatterPreservation(finalFrontmatter, originalFrontmatter);
			if (validation.lostFields.length > 0) {
				console.warn(`[saveEvent] Warning: Fields will be lost on save:`, validation.lostFields);
			}
		}

		// Use custom serializer that preserves empty string values
		const frontmatterString = Object.keys(finalFrontmatter).length > 0
			? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `Event: ${event.name}`)
			: '';

		// Build sections from templates + provided data
		const providedSections: Record<string, string> = {
			Description: description || '',
			Outcome: outcome || ''
		};

		// Check for template-provided sections (from TemplateApplicator)
		const templateOnlySections = (event as any)._templateSections || {};

		const defaultSections = getTemplateSections('event', providedSections);

		// Merge priority: default < template < existing < provided
		let allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
			? { ...defaultSections, ...templateOnlySections, ...existingSections, ...providedSections }
			: { ...defaultSections, ...templateOnlySections, ...providedSections };

		// Handle Gallery section: auto-generate from images array
		if (event.images && event.images.length > 0) {
			allSections.Gallery = this.generateImageGridMarkdown(event.images);
		} else {
			// Remove Gallery section if no images exist
			delete allSections.Gallery;
		}

		// Generate Markdown
		let mdContent = `---\n${frontmatterString}---\n\n`;
		mdContent += Object.entries(allSections)
			.map(([key, content]) => `## ${key}\n${content || ''}`)
			.join('\n\n');
		if (!mdContent.endsWith('\n')) mdContent += '\n';

		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, mdContent);
		} else {
			await this.app.vault.create(finalFilePath, mdContent);
			new Notice('Note created with standard sections for easy editing.');
		}

		// Set filePath for reference before any follow-up sync work.
		event.filePath = finalFilePath;

		if (!(event as any)._skipDependencySync) {
			try {
				await this.syncEventDependencyReferences(event, oldEvent);
			} catch (error) {
				console.error('[saveEvent] Error syncing event dependency references:', error);
			}
		}

		// Auto-detect conflicts if enabled
		if (!(event as any)._skipConflictDetection && this.settings.autoDetectConflicts !== false) {  // Default to true
			try {
				const allEvents = await this.listEvents();
				const conflicts = ConflictDetector.detectAllConflicts(allEvents);
				const eventConflicts = ConflictDetector.getConflictsForEvent(
					event.name,
					conflicts
				);

				if (eventConflicts.length > 0) {
					const errorCount = eventConflicts.filter(c => c.severity === 'error').length;
					const warningCount = eventConflicts.filter(c => c.severity === 'warning').length;

					if (errorCount > 0) {
						new Notice(
							`⚠️ Event saved with ${errorCount} conflict(s). Use "Detect timeline conflicts" to review.`,
							5000
						);
					} else if (warningCount > 0) {
						new Notice(
							`⚠ Event saved with ${warningCount} warning(s)`,
							3000
						);
					}
				}
			} catch (error) {
				// Don't fail save if conflict detection fails
				console.warn('Conflict detection failed:', error);
			}
		}

		// Sync bidirectional relationships (skip if _skipSync flag is set to prevent recursion)
		if (!(event as any)._skipSync) {
			try {
				const { EntitySyncService } = await import('./services/EntitySyncService');
				const syncService = new EntitySyncService(this);
				await syncService.syncEntity('event', event, oldEvent);
			} catch (error) {
				console.error('[saveEvent] Error syncing relationships:', error);
				// Don't throw - sync failures shouldn't prevent saves
			}
		}

		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	private async syncEventDependencyReferences(event: Event, oldEvent?: Event): Promise<void> {
		const previousId = typeof oldEvent?.id === 'string' ? oldEvent.id.trim() : '';
		const previousName = typeof oldEvent?.name === 'string' ? oldEvent.name.trim() : '';
		const nextId = typeof event.id === 'string' ? event.id.trim() : '';
		const nextName = typeof event.name === 'string' ? event.name.trim() : '';

		if (!nextName) return;
		if (previousId === nextId && previousName === nextName) return;

		const matchers = new Set(
			[previousId, previousName]
				.map(value => value.trim())
				.filter(value => value.length > 0)
		);
		if (matchers.size === 0) return;

		const events = await this.listEvents();
		const updates = events
			.filter(candidate => candidate.filePath && candidate.filePath !== event.filePath)
			.filter(candidate => Array.isArray(candidate.dependencies) && candidate.dependencies.length > 0);

		for (const candidate of updates) {
			const dependencyIds = Array.isArray(candidate.dependencies) ? [...candidate.dependencies] : [];
			const dependencyNames = Array.isArray(candidate.dependencyNames)
				? [...candidate.dependencyNames]
				: [...dependencyIds];
			let changed = false;

			for (let index = 0; index < dependencyIds.length; index++) {
				const depId = String(dependencyIds[index] ?? '').trim();
				const depName = String(dependencyNames[index] ?? depId).trim();
				if (!matchers.has(depId) && !matchers.has(depName)) continue;
				dependencyIds[index] = nextId || nextName;
				dependencyNames[index] = nextName;
				changed = true;
			}

			if (!changed) continue;

			candidate.dependencies = dependencyIds;
			candidate.dependencyNames = dependencyNames;
			await this.saveEvent({
				...candidate,
				_skipSync: true,
				_skipDependencySync: true,
				_skipConflictDetection: true
			} as Event);
		}
	}

	/**
	 * Load all events from the event folder
	 * @returns Array of event objects sorted by date/time, then by name
	 */
    async listEvents(): Promise<Event[]> {
    await this.ensureEventFolder();
    const folderPath = this.getEntityFolder('event');
        
        const allFiles = this.app.vault.getMarkdownFiles();
        const prefix = normalizePath(folderPath) + '/';
        const files = allFiles.filter(file =>
            file.path.startsWith(prefix) &&
            file.extension === 'md' &&
            !file.path.slice(prefix.length).includes('/')
        );

		const events: Event[] = [];
        for (const file of files) {
            let eventData = await this.parseFile<Event>(file, { name: '' }, 'event');
            if (eventData) eventData = this.normalizeEntityCustomFields('event', eventData);
            if (eventData) {
                events.push(eventData);
			}
		}
		
        // Robust chronological sort using parsed times; unresolved go last
        const referenceDate = this.getReferenceTodayDate();
        return events.sort((a, b) => {
            const pa = a.dateTime ? parseEventDate(a.dateTime, { referenceDate }) : { error: 'empty' };
            const pb = b.dateTime ? parseEventDate(b.dateTime, { referenceDate }) : { error: 'empty' };
            const ma = toMillis((pa as any).start);
            const mb = toMillis((pb as any).start);
            if (ma != null && mb != null) return ma - mb;
            if (ma != null) return -1;
            if (mb != null) return 1;
            const nameA = typeof a.name === 'string' ? a.name : String(a.name ?? '');
            const nameB = typeof b.name === 'string' ? b.name : String(b.name ?? '');
            return nameA.localeCompare(nameB);
        });
	}

	/**
	 * Delete an event file by moving it to trash
	 * @param filePath Path to the event file to delete
	 */
	async deleteEvent(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			// Get entity ID before deletion for cleanup
			let eventId: string | undefined;
			let eventName: string | undefined;
			try {
				const event = await this.parseFile<Event>(file, { name: '' }, 'event');
				if (event) {
					eventId = event.id || event.name;
					eventName = event.name;
				}
			} catch (e) {
				console.warn('Could not parse event before deletion:', e);
			}
			
			// Clean up references via EntitySyncService
			if (eventId) {
				try {
					const { EntitySyncService } = await import('./services/EntitySyncService');
					const syncService = new EntitySyncService(this);
					await syncService.handleEntityDeletion('event', eventId, eventName);
				} catch (error) {
					console.error('[deleteEvent] Error cleaning up references:', error);
				}
			}

			await this.app.vault.trash(file, true);
			
			new Notice(`Event file "${file.basename}" moved to trash.`);
			this.app.metadataCache.trigger("dataview:refresh-views");
		} else {
			new Notice(`Error: Could not find event file to delete at ${filePath}`);
		}
	}

	/**
	 * Plot Item Data Management
	 * Methods for creating, reading, updating, and deleting plot item entities
	 */

	/**
	 * Ensure the item folder exists for the active story
	 */
	async ensureItemFolder(): Promise<void> {
    await this.ensureFolder(this.getEntityFolder('item'));
	}

	/** Ensure the reference folder exists for the active story */
	async ensureReferenceFolder(): Promise<void> {
    await this.ensureFolder(this.getEntityFolder('reference'));
	}

	/**
	 * Save a plot item to the vault as a markdown file
	 * @param item The plot item data to save
	 */
	async savePlotItem(item: PlotItem): Promise<void> {
		await this.ensureItemFolder();
		const folderPath = this.getEntityFolder('item');
		
		const fileName = `${item.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

        const { filePath: currentFilePath, description, history, culturalSignificance, magicProperties, ...rest } = item as any;
        if ((rest as any).sections) delete (rest as any).sections;

		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'Location');
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
		let oldItem: PlotItem | undefined;
		if (existingFile && existingFile instanceof TFile) {
			try {
				const existingContent = await this.app.vault.cachedRead(existingFile);
				existingSections = parseSectionsFromMarkdown(existingContent);
				
				// Parse frontmatter directly from file content to ensure empty values are captured
				const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
				const directFrontmatter = parseFrontmatterFromContent(existingContent);
				
				// Also get frontmatter from metadata cache
				const fileCache = this.app.metadataCache.getFileCache(existingFile);
				const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;
				
				// Merge both sources, preferring direct parsing for better empty value handling
				if (directFrontmatter || cachedFrontmatter) {
					originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
				}

				// Load old item for sync comparison (only if not skipping sync)
				if (!(item as any)._skipSync) {
					const parsed = await this.parseFile<PlotItem>(existingFile, { name: '' }, 'item');
					if (parsed) {
						oldItem = this.normalizeEntityCustomFields('item', parsed);
					}
				}
			} catch (error) {
				console.warn(`Error reading existing item file: ${error}`);
			}
		}

		// Build frontmatter strictly from whitelist, preserving original frontmatter
		const finalFrontmatter = await this.buildFrontmatterForItem(rest, originalFrontmatter);

		// Validate that we're not losing any fields before serialization
		if (originalFrontmatter) {
			const validation = validateFrontmatterPreservation(finalFrontmatter, originalFrontmatter);
			if (validation.lostFields.length > 0) {
				console.warn(`[savePlotItem] Warning: Fields will be lost on save:`, validation.lostFields);
			}
		}

		// Use custom serializer that preserves empty string values
		const frontmatterString = Object.keys(finalFrontmatter).length > 0
			? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `PlotItem: ${item.name}`)
			: '';

		// Build sections from templates + provided data
		const providedSections = {
			Description: description || '',
			History: history || '',
			'Cultural Significance': culturalSignificance || '',
			'Magic Properties': magicProperties || '',
		};
		const templateSections = getTemplateSections('item', providedSections);
		const allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
			? { ...templateSections, ...existingSections }
			: templateSections;

		// Generate Markdown
		let mdContent = `---\n${frontmatterString}---\n\n`;
		mdContent += Object.entries(allSections)
			.map(([key, content]) => `## ${key}\n${content || ''}`)
			.join('\n\n');
		if (!mdContent.endsWith('\n')) mdContent += '\n';

		// Save or update the file
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, mdContent);
		} else {
			await this.app.vault.create(finalFilePath, mdContent);
			new Notice('Note created with standard sections for easy editing.');
		}
		
		item.filePath = finalFilePath;
		
		// Sync bidirectional relationships (skip if _skipSync flag is set to prevent recursion)
		if (!(item as any)._skipSync) {
			try {
				const { EntitySyncService } = await import('./services/EntitySyncService');
				const syncService = new EntitySyncService(this);
				await syncService.syncEntity('item', item, oldItem);
			} catch (error) {
				console.error('[savePlotItem] Error syncing relationships:', error);
				// Don't throw - sync failures shouldn't prevent saves
			}
		}
		
		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	/**
	 * Load all plot items from the item folder
	 * @returns Array of plot item objects sorted by name
	 */
	async listPlotItems(): Promise<PlotItem[]> {
    await this.ensureItemFolder();
    const folderPath = this.getEntityFolder('item');
		const allFiles = this.app.vault.getMarkdownFiles();
        const prefix = normalizePath(folderPath) + '/';
        const files = allFiles.filter(file =>
            file.path.startsWith(prefix) &&
            file.extension === 'md' &&
            !file.path.slice(prefix.length).includes('/')
        );

		const items: PlotItem[] = [];
        for (const file of files) {
            let itemData = await this.parseFile<PlotItem>(file, { name: '', isPlotCritical: false }, 'item');
            if (itemData) itemData = this.normalizeEntityCustomFields('item', itemData);
            if (itemData) {
                items.push(itemData);
			}
		}
		return items.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Delete a plot item file by moving it to trash
	 * @param filePath Path to the item file to delete
	 */
	async deletePlotItem(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			// Get entity ID before deletion for cleanup
			let itemId: string | undefined;
			let itemName: string | undefined;
			try {
				const item = await this.parseFile<PlotItem>(file, { name: '' }, 'item');
				if (item) {
					itemId = item.id || item.name;
					itemName = item.name;
				}
			} catch (e) {
				console.warn('Could not parse item before deletion:', e);
			}
			
			// Clean up references via EntitySyncService
			if (itemId) {
				try {
					const { EntitySyncService } = await import('./services/EntitySyncService');
					const syncService = new EntitySyncService(this);
					await syncService.handleEntityDeletion('item', itemId, itemName);
				} catch (error) {
					console.error('[deletePlotItem] Error cleaning up references:', error);
				}
			}

			await this.app.vault.trash(file, true);
			
			new Notice(`Item file "${file.basename}" moved to trash.`);
			this.app.metadataCache.trigger("dataview:refresh-views");
		} else {
			new Notice(`Error: Could not find item file to delete at ${filePath}`);
		}
	}

	/**
	 * Reference Data Management
	 */

	/** Save a reference to the vault as a markdown file */
	async saveReference(reference: Reference): Promise<void> {
		await this.ensureReferenceFolder();
		const folderPath = this.getEntityFolder('reference');

		const fileName = `${(reference.name || 'Untitled').replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

        const { filePath: currentFilePath, content, ...rest } = reference as any;
        if ((rest as any).sections) delete (rest as any).sections;

		// Handle rename
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'File');
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
		if (existingFile && existingFile instanceof TFile) {
			const fileCache = this.app.metadataCache.getFileCache(existingFile);
			originalFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;
			try {
				const existingContent = await this.app.vault.cachedRead(existingFile);
				existingSections = parseSectionsFromMarkdown(existingContent);
			} catch (e) {
				console.warn('Error reading existing reference file', e);
			}
		}

        // Build frontmatter (preserve any custom fields and original frontmatter)
        const preserveRef = new Set<string>(Object.keys(rest || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const preparedRef = await this.serializeFrontmatterEntityReferences(rest as Record<string, unknown>);
        const fm: Record<string, any> = buildFrontmatter('reference', preparedRef.source, preserveRef, {
            customFieldsMode: mode,
            originalFrontmatter,
            omitOriginalKeys: preparedRef.omitOriginalKeys,
        }) as Record<string, any>;

		// Validate that we're not losing any fields before serialization
		if (originalFrontmatter) {
			const validation = validateFrontmatterPreservation(fm, originalFrontmatter);
			if (validation.lostFields.length > 0) {
				console.warn(`[saveReference] Warning: Fields will be lost on save:`, validation.lostFields);
			}
		}

		// Use custom serializer that preserves empty string values
		const frontmatterString = Object.keys(fm).length > 0
			? stringifyYamlWithLogging(fm, originalFrontmatter, `Reference: ${reference.name}`)
			: '';

		// Build sections from templates + provided data
		const providedSections = { Content: (content as string) || '' };
		const templateSections = getTemplateSections('reference', providedSections);
		const allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
			? { ...templateSections, ...existingSections }
			: templateSections;

		let mdContent = `---\n${frontmatterString}---\n\n`;
		mdContent += Object.entries(allSections)
			.map(([key, val]) => `## ${key}\n${val || ''}`)
			.join('\n\n');
		if (!mdContent.endsWith('\n')) mdContent += '\n';

		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, mdContent);
		} else {
			await this.app.vault.create(finalFilePath, mdContent);
			new Notice('Note created with standard sections for easy editing.');
		}
		reference.filePath = finalFilePath;
		this.app.metadataCache.trigger('dataview:refresh-views');
	}

	/** List all references */
	async listReferences(): Promise<Reference[]> {
    await this.ensureReferenceFolder();
    const folderPath = this.getEntityFolder('reference');
        const allFiles = this.app.vault.getMarkdownFiles();
        const prefix = normalizePath(folderPath) + '/';
        const files = allFiles.filter(f => f.path.startsWith(prefix) && f.extension === 'md');
		const refs: Reference[] = [];
        for (const file of files) {
            const data = await this.parseFile<Reference>(file, { name: '' }, 'reference');
            if (data) refs.push(data);
        }
		return refs.sort((a, b) => a.name.localeCompare(b.name));
	}

	/** Delete a reference file */
	async deleteReference(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			await this.app.vault.trash(file, true);
			new Notice(`Reference file "${file.basename}" moved to trash.`);
			this.app.metadataCache.trigger('dataview:refresh-views');
		} else {
			new Notice(`Error: Could not find reference file to delete at ${filePath}`);
		}
	}

    /**
     * Chapter Data Management
     */

    async ensureChapterFolder(bookName?: string): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('chapter', { bookName }));
    }

    /** Save a chapter to the vault as a markdown file */
    async saveChapter(chapter: Chapter): Promise<void> {
        await this.ensureChapterFolder(chapter.bookName);
        const folderPath = this.getEntityFolder('chapter', { bookName: chapter.bookName });
        const safeName = (chapter.name || 'Untitled').replace(/[\\/:"*?<>|]+/g, '');
        const fileName = `${safeName}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        // Ensure chapter has a stable id for linking
        if (!chapter.id) {
            chapter.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
        }

        const { filePath: currentFilePath, summary, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups, ...rest } = chapter as any;
        if ((rest as any).sections) delete (rest as any).sections;

        // Rename if needed
        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'File');
        }

        // Check if file exists and read existing frontmatter and sections for preservation
        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        let existingSections: Record<string, string> = {};
        let originalFrontmatter: Record<string, unknown> | undefined;
        let oldChapter: Chapter | undefined;
        if (existingFile && existingFile instanceof TFile) {
            const fileCache = this.app.metadataCache.getFileCache(existingFile);
            originalFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                existingSections = parseSectionsFromMarkdown(existingContent);
            } catch (e) {
                console.warn('Error reading existing chapter file', e);
            }
            // Load old chapter for sync diff (only when not already inside a sync operation)
            if (!(chapter as any)._skipSync) {
                try {
                    const parsed = await this.parseFile<Chapter>(existingFile, { name: '' }, 'chapter');
                    if (parsed) oldChapter = parsed;
                } catch (e) {
                    console.warn('[saveChapter] Could not load old chapter for sync', e);
                }
            }
        }

        // Build frontmatter (preserve any custom fields and original frontmatter)
        const chapterSrc = { ...rest, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups } as Record<string, unknown>;
        const preserveChap = new Set<string>(Object.keys(chapterSrc));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const preparedChapter = await this.serializeFrontmatterEntityReferences(chapterSrc);
        const fm: Record<string, any> = buildFrontmatter('chapter', preparedChapter.source, preserveChap, {
            customFieldsMode: mode,
            originalFrontmatter,
            omitOriginalKeys: preparedChapter.omitOriginalKeys,
        }) as Record<string, any>;

		// Validate that we're not losing any fields before serialization
		if (originalFrontmatter) {
			const validation = validateFrontmatterPreservation(fm, originalFrontmatter);
			if (validation.lostFields.length > 0) {
				console.warn(`[saveChapter] Warning: Fields will be lost on save:`, validation.lostFields);
			}
		}

		// Use custom serializer that preserves empty string values
        const frontmatterString = Object.keys(fm).length > 0
			? stringifyYamlWithLogging(fm, originalFrontmatter, `Chapter: ${chapter.name}`)
			: '';

        const providedSections = { Summary: summary || '' };
        const templateSections = getTemplateSections('chapter', providedSections);
        const allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
            ? { ...templateSections, ...existingSections }
            : templateSections;

        let mdContent = `---\n${frontmatterString}---\n\n`;
        mdContent += Object.entries(allSections)
            .map(([key, val]) => `## ${key}\n${val || ''}`)
            .join('\n\n');
        if (!mdContent.endsWith('\n')) mdContent += '\n';

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, mdContent);
        } else {
            await this.app.vault.create(finalFilePath, mdContent);
            new Notice('Note created with standard sections for easy editing.');
        }
        chapter.filePath = finalFilePath;
        this.app.metadataCache.trigger('dataview:refresh-views');

        if (!(chapter as any)._skipSync) {
            // Sync chapter into parent book's linkedChapters
            try {
                const newBid = chapter.bookId;
                const oldBid = oldChapter?.bookId;
                if (oldBid && oldBid !== newBid) {
                    await this._removeChapterFromBook(chapter.name, oldBid);
                }
                if (newBid) {
                    await this._addChapterToBook(chapter.name, newBid);
                }
            } catch (e) {
                console.error('[saveChapter] Error syncing book linkedChapters:', e);
            }

            try {
                const { EntitySyncService } = await import('./services/EntitySyncService');
                const syncService = new EntitySyncService(this);
                await syncService.syncEntity('chapter', chapter, oldChapter);
            } catch (error) {
                console.error('[saveChapter] Error syncing relationships:', error);
            }
        }
    }

    /** List all chapters (sorted by number then name) */
    async listChapters(): Promise<Chapter[]> {
        const resolver = this.getFolderResolver();
        let scanPaths: string[];

        if (resolver.usesBookName('chapter')) {
            // Scan one folder per book + the unassigned folder (empty bookName → normalizePath collapses double-slash)
            const books = await this.listBooks();
            const seenFolders = new Set<string>();
            scanPaths = [];
            for (const bookName of [...books.map(b => b.name), '']) {
                try {
                    const p = normalizePath(resolver.getEntityFolder('chapter', { bookName }));
                    if (!seenFolders.has(p)) {
                        seenFolders.add(p);
                        scanPaths.push(p);
                        await this.ensureFolder(p);
                    }
                } catch { /* skip if resolution fails (e.g. no active story) */ }
            }
        } else {
            await this.ensureChapterFolder();
            scanPaths = [normalizePath(this.getEntityFolder('chapter'))];
        }

        const allFiles = this.app.vault.getMarkdownFiles();
        const chapters: Chapter[] = [];
        const seenPaths = new Set<string>();
        for (const folderPath of scanPaths) {
            const prefix = folderPath + '/';
            const files = allFiles.filter(f => f.path.startsWith(prefix) && f.extension === 'md' && !seenPaths.has(f.path));
            for (const file of files) {
                seenPaths.add(file.path);
                const data = await this.parseFile<Chapter>(file, { name: '' }, 'chapter');
                if (data) chapters.push(data);
            }
        }
        return chapters.sort((a, b) => {
            const na = a.number ?? Number.MAX_SAFE_INTEGER;
            const nb = b.number ?? Number.MAX_SAFE_INTEGER;
            if (na !== nb) return na - nb;
            return a.name.localeCompare(b.name);
        });
    }

    /** Delete a chapter file */
    async deleteChapter(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (file instanceof TFile) {
            // Remove from parent book's linkedChapters before trashing
            try {
                const chapter = await this.parseFile<Chapter>(file, { name: '' }, 'chapter');
                if (chapter?.bookId) {
                    await this._removeChapterFromBook(chapter.name, chapter.bookId);
                }
            } catch (e) {
                console.warn('[deleteChapter] Could not sync linkedChapters before delete:', e);
            }
            await this.app.vault.trash(file, true);
            new Notice(`Chapter file "${file.basename}" moved to trash.`);
            this.app.metadataCache.trigger('dataview:refresh-views');
        } else {
            new Notice(`Error: Could not find chapter file to delete at ${filePath}`);
        }
    }

    /**
     * Scene Data Management
     */

    async ensureSceneFolder(bookName?: string): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('scene', { bookName }));
    }

    async ensureCultureFolder(): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('culture'));
    }

    async ensureEconomyFolder(): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('economy'));
    }

    async ensureMagicSystemFolder(): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('magicSystem'));
    }

    async ensureCompendiumFolder(): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('compendiumEntry'));
    }

    async ensureBookFolder(): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('book'));
    }

    // ─── Scalar parent-ID sync helpers ───────────────────────────────────────

    /** Add sceneName to the linkedScenes array of the chapter with the given id. */
    private async _addSceneToChapter(sceneName: string, chapterId: string): Promise<void> {
        const chapters = await this.listChapters();
        const chapter = chapters.find(c => c.id === chapterId);
        if (!chapter || !chapter.filePath) return;
        if (!Array.isArray(chapter.linkedScenes)) chapter.linkedScenes = [];
        if (!chapter.linkedScenes.includes(sceneName)) {
            chapter.linkedScenes = [...chapter.linkedScenes, sceneName];
            (chapter as any)._skipSync = true;
            await this.saveChapter(chapter);
        }
    }

    /** Remove sceneName from the linkedScenes array of the chapter with the given id. */
    private async _removeSceneFromChapter(sceneName: string, chapterId: string): Promise<void> {
        const chapters = await this.listChapters();
        const chapter = chapters.find(c => c.id === chapterId);
        if (!chapter || !chapter.filePath) return;
        if (!Array.isArray(chapter.linkedScenes)) return;
        const filtered = chapter.linkedScenes.filter(n => n !== sceneName);
        if (filtered.length !== chapter.linkedScenes.length) {
            chapter.linkedScenes = filtered;
            (chapter as any)._skipSync = true;
            await this.saveChapter(chapter);
        }
    }

    /** Add chapterName to the linkedChapters array of the book with the given id. */
    private async _addChapterToBook(chapterName: string, bookId: string): Promise<void> {
        const books = await this.listBooks();
        const book = books.find(b => b.id === bookId);
        if (!book || !book.filePath) return;
        if (!Array.isArray(book.linkedChapters)) book.linkedChapters = [];
        if (!book.linkedChapters.includes(chapterName)) {
            book.linkedChapters = [...book.linkedChapters, chapterName];
            (book as any)._skipSync = true;
            await this.saveBook(book);
        }
    }

    /** Remove chapterName from the linkedChapters array of the book with the given id. */
    private async _removeChapterFromBook(chapterName: string, bookId: string): Promise<void> {
        const books = await this.listBooks();
        const book = books.find(b => b.id === bookId);
        if (!book || !book.filePath) return;
        if (!Array.isArray(book.linkedChapters)) return;
        const filtered = book.linkedChapters.filter(n => n !== chapterName);
        if (filtered.length !== book.linkedChapters.length) {
            book.linkedChapters = filtered;
            (book as any)._skipSync = true;
            await this.saveBook(book);
        }
    }

    // ─── Book CRUD ────────────────────────────────────────────────────────────

    private buildFrontmatterForBook(src: any, originalFrontmatter?: Record<string, unknown>): Promise<Record<string, any>> {
        return this.buildLinkedFrontmatter('book', src, originalFrontmatter);
    }

    async saveBook(book: Book): Promise<void> {
        await this.ensureBookFolder();
        const folderPath = this.getEntityFolder('book');
        const safeName = (book.name || 'Untitled').replace(/[\\/:"*?<>|]+/g, '');
        const fileName = `${safeName}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        if (!book.id) {
            book.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
        }

        const { filePath: currentFilePath, description, synopsis, linkedChapters, ...rest } = book as any;
        if ((rest as any).sections) delete (rest as any).sections;

        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'File');
        }

        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        let existingSections: Record<string, string> = {};
        let originalFrontmatter: Record<string, unknown> | undefined;
        if (existingFile && existingFile instanceof TFile) {
            const fileCache = this.app.metadataCache.getFileCache(existingFile);
            originalFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                existingSections = parseSectionsFromMarkdown(existingContent);
            } catch (e) {
                console.warn('[saveBook] Error reading existing book file', e);
            }
        }

        const bookSrc = { ...rest, linkedChapters } as Record<string, unknown>;
        const fm = await this.buildFrontmatterForBook(bookSrc, originalFrontmatter);

        const frontmatterString = Object.keys(fm).length > 0
            ? stringifyYamlWithLogging(fm, originalFrontmatter, `Book: ${book.name}`)
            : '';

        const providedSections = { Description: description || '', Synopsis: synopsis || '' };
        const templateSections = getTemplateSections('book', providedSections);
        const allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
            ? { ...templateSections, ...existingSections }
            : templateSections;

        let mdContent = `---\n${frontmatterString}---\n\n`;
        mdContent += Object.entries(allSections)
            .map(([key, val]) => `## ${key}\n${val || ''}`)
            .join('\n\n');
        if (!mdContent.endsWith('\n')) mdContent += '\n';

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, mdContent);
        } else {
            await this.app.vault.create(finalFilePath, mdContent);
            new Notice('Note created for book.');
        }
        book.filePath = finalFilePath;
        this.app.metadataCache.trigger('dataview:refresh-views');
    }

    async listBooks(): Promise<Book[]> {
        await this.ensureBookFolder();
        const folderPath = this.getEntityFolder('book');
        const allFiles = this.app.vault.getMarkdownFiles();
        const prefix = normalizePath(folderPath) + '/';
        const files = allFiles.filter(f => f.path.startsWith(prefix) && f.extension === 'md');
        const books: Book[] = [];
        for (const file of files) {
            const data = await this.parseFile<Book>(file, { name: '' }, 'book');
            if (data) books.push(data);
        }
        return books.sort((a, b) => {
            const na = a.bookNumber ?? Number.MAX_SAFE_INTEGER;
            const nb = b.bookNumber ?? Number.MAX_SAFE_INTEGER;
            if (na !== nb) return na - nb;
            return a.name.localeCompare(b.name);
        });
    }

    async deleteBook(filePath: string): Promise<void> {
        // Clear bookId/bookName from all chapters that belong to this book before trashing
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (file instanceof TFile) {
            const book = await this.parseFile<Book>(file, { name: '' }, 'book');
            if (book) {
                const chapters = await this.listChapters();
                for (const ch of chapters) {
                    if (ch.bookId === book.id && ch.filePath) {
                        ch.bookId = undefined;
                        ch.bookName = undefined;
                        (ch as any)._skipSync = true;
                        await this.saveChapter(ch);
                    }
                }
            }
            await this.app.vault.trash(file, true);
            new Notice(`Book "${file.basename}" moved to trash.`);
            this.app.metadataCache.trigger('dataview:refresh-views');
        } else {
            new Notice(`Error: Could not find book file at ${filePath}`);
        }
    }

    // ─── Campaign Session CRUD ───────────────────────────────────────────────

    async ensureSessionsFolder(): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('campaignSession'));
    }

    /**
     * Save a CampaignSession as a markdown file (frontmatter + ## Session Log body).
     * Preserves any existing ## Session Log content — only updates frontmatter.
     */
    async saveSession(session: CampaignSession): Promise<void> {
        await this.ensureSessionsFolder();
        const folderPath = this.getEntityFolder('campaignSession');
        const safeName = (session.name || 'Untitled Session').replace(/[\\/:"*?<>|]+/g, '');
        const fileName = `${safeName}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        const now = new Date().toISOString();
        session.modified = now;
        if (!session.created) session.created = now;
        if (!session.id) session.id = `sess-${Date.now()}`;

        const preparedSession = await this.serializeFrontmatterEntityReferences(session as any);
        const frontmatter = buildFrontmatter('campaignSession', preparedSession.source, undefined, {
            omitOriginalKeys: preparedSession.omitOriginalKeys,
        });
        const fm = stringifyYaml(frontmatter);

        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            // Preserve existing log body
            await (this.app.vault as any).process(existingFile, (content: string) => {
                const bodyStart = content.indexOf('\n---', 3);
                const existingBody = bodyStart !== -1 ? content.slice(bodyStart + 4).trim() : '';
                const logSection = existingBody || '## Session Log\n';
                return `---\n${fm}---\n\n${logSection}`;
            });
        } else {
            const content = `---\n${fm}---\n\n## Session Log\n`;
            await this.app.vault.create(filePath, content);
        }
        session.filePath = filePath;
    }

    /** List all campaign sessions for the active story. */
    async listSessions(): Promise<CampaignSession[]> {
        await this.ensureSessionsFolder();
        const folderPath = this.getEntityFolder('campaignSession');
        const prefix = normalizePath(folderPath) + '/';
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = allFiles.filter(f => f.path.startsWith(prefix));
        const sessions: CampaignSession[] = [];
        for (const file of files) {
            const data = await this.parseFile<CampaignSession>(file, { name: '', storyId: '' }, 'campaignSession');
            if (data) sessions.push(data);
        }
        return sessions.sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''));
    }

    async deleteSession(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (file instanceof TFile) {
            await this.app.vault.trash(file, true);
            new Notice(`Session "${file.basename}" moved to trash.`);
        } else {
            new Notice(`Error: Could not find session file at ${filePath}`);
        }
    }

    /** Returns the raw content of the ## Session Log section of a session file. */
    async loadSessionLog(filePath: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (!(file instanceof TFile)) return '';
        const content = await this.app.vault.cachedRead(file);
        const { parseSectionsFromMarkdown } = await import('./yaml/EntitySections');
        const bodyStart = content.indexOf('\n---', 3);
        const body = bodyStart !== -1 ? content.slice(bodyStart + 4) : content;
        const sections = parseSectionsFromMarkdown(body);
        return sections['Session Log'] ?? '';
    }

    /** Atomically appends log entries to the ## Session Log section of a session file. */
    async appendToSessionLogEntries(filePath: string, entries: string[]): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (!(file instanceof TFile)) return;
        const cleaned = entries
            .map(entry => String(entry ?? '').trim())
            .filter(Boolean);
        if (!cleaned.length) return;

        await (this.app.vault as any).process(file, (content: string) => {
            const logHeader = '## Session Log';
            const idx = content.indexOf(logHeader);
            const rendered = cleaned.map(entry => `- ${entry}`).join('\n');
            if (idx === -1) {
                return `${content.trimEnd()}\n\n${logHeader}\n${rendered}\n`;
            }

            const afterHeader = content.indexOf('\n', idx);
            const sectionStart = afterHeader !== -1 ? afterHeader + 1 : content.length;
            let nextSection = content.length;
            const sectionRegex = /^##\s+/gm;
            sectionRegex.lastIndex = sectionStart;
            let match: RegExpExecArray | null;
            while ((match = sectionRegex.exec(content)) !== null) {
                if (match.index > idx) {
                    nextSection = match.index;
                    break;
                }
            }

            const existingBody = content.slice(sectionStart, nextSection).replace(/\s+$/, '');
            const mergedBody = existingBody ? `${existingBody}\n${rendered}\n` : `${rendered}\n`;
            return content.slice(0, sectionStart) + mergedBody + content.slice(nextSection);
        });
    }

    /** Atomically appends a single log entry to the ## Session Log section of a session file. */
    async appendToSessionLog(filePath: string, entry: string): Promise<void> {
        await this.appendToSessionLogEntries(filePath, [entry]);
    }

    // ─── End Campaign Session CRUD ───────────────────────────────────────────

    async saveScene(scene: Scene): Promise<void> {
        // Resolve chapter info (name + bookName) for folder placement and display
        let sceneBookName: string | undefined;
        if (scene.chapterId) {
            const chapters = await this.listChapters();
            const picked = chapters.find(c => c.id === scene.chapterId);
            if (picked) {
                if (!scene.chapterName) scene.chapterName = picked.name;
                sceneBookName = picked.bookName;
            }
        }
        await this.ensureSceneFolder(sceneBookName);
        const folderPath = this.getEntityFolder('scene', { bookName: sceneBookName });
        const fileName = `${(scene.name || 'Untitled').replace(/[\\/:"*?<>|]+/g, '')}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        const { filePath: currentFilePath, content, beats, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups, ...rest } = scene as any;
        if ((rest as any).sections) delete (rest as any).sections;

        // Rename if needed
        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'File');
        }

        // Check if file exists and read existing frontmatter and sections for preservation
        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        let existingSections: Record<string, string> = {};
        let originalFrontmatter: Record<string, unknown> | undefined;
        let oldSceneChapterId: string | undefined;
        let oldScene: Scene | undefined;
        if (existingFile && existingFile instanceof TFile) {
            const fileCache = this.app.metadataCache.getFileCache(existingFile);
            originalFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;
            // Capture old chapterId before overwriting for linkedScenes sync
            oldSceneChapterId = (originalFrontmatter?.chapterId as string | undefined) ?? undefined;
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                existingSections = parseSectionsFromMarkdown(existingContent);
                if (!(scene as any)._skipSync) {
                    oldScene = (await this.parseFile<Scene>(existingFile, { name: '' }, 'scene')) || undefined;
                }
            } catch (e) {
                console.warn('Error reading existing scene file', e);
            }
        }

        // Build frontmatter (preserve any custom fields and original frontmatter)
        const sceneSrc = { ...rest, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups } as Record<string, unknown>;
        const preserveScene = new Set<string>(Object.keys(sceneSrc));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const preparedScene = await this.serializeFrontmatterEntityReferences(sceneSrc);
        const fm: Record<string, any> = buildFrontmatter('scene', preparedScene.source, preserveScene, {
            customFieldsMode: mode,
            originalFrontmatter,
            omitOriginalKeys: preparedScene.omitOriginalKeys,
        }) as Record<string, any>;

		// Validate that we're not losing any fields before serialization
		if (originalFrontmatter) {
			const validation = validateFrontmatterPreservation(fm, originalFrontmatter);
			if (validation.lostFields.length > 0) {
				console.warn(`[saveScene] Warning: Fields will be lost on save:`, validation.lostFields);
			}
		}

		// Use custom serializer that preserves empty string values
        const frontmatterString = Object.keys(fm).length > 0
			? stringifyYamlWithLogging(fm, originalFrontmatter, `Scene: ${scene.name}`)
			: '';

        const beatsBlock = (beats && Array.isArray(beats) ? beats as string[] : undefined);
        const providedSections = {
            Content: (content as string) || '',
            Beats: (beatsBlock && beatsBlock.length > 0) ? beatsBlock.join('\n') : ''
        };
        const templateSections = getTemplateSections('scene', providedSections);
        const allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
            ? { ...templateSections, ...existingSections }
            : templateSections;

        let mdContent = `---\n${frontmatterString}---\n\n`;
        mdContent += Object.entries(allSections)
            .map(([key, val]) => `## ${key}\n${val || ''}`)
            .join('\n\n');
        if (!mdContent.endsWith('\n')) mdContent += '\n';

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, mdContent);
        } else {
            await this.app.vault.create(finalFilePath, mdContent);
            new Notice('Note created with standard sections for easy editing.');
        }
        scene.filePath = finalFilePath;
        // Keep display name in sync post-save when chapterId is set
        if (scene.chapterId && !scene.chapterName) {
            const chapters = await this.listChapters();
            const picked = chapters.find(c => c.id === scene.chapterId);
            if (picked) scene.chapterName = picked.name;
        }
        
        // Sync scene into parent chapter's linkedScenes
        if (!(scene as any)._skipSync) {
            try {
                const newCid = scene.chapterId;
                const oldSceneName = oldScene?.name;
                if (oldSceneChapterId && (oldSceneChapterId !== newCid || (oldSceneName && oldSceneName !== scene.name))) {
                    await this._removeSceneFromChapter(oldSceneName || scene.name, oldSceneChapterId);
                }
                if (newCid) {
                    await this._addSceneToChapter(scene.name, newCid);
                }
            } catch (e) {
                console.error('[saveScene] Error syncing chapter linkedScenes:', e);
            }
        }

        // Sync bidirectional relationships (skip if _skipSync flag is set to prevent recursion)
        if (!(scene as any)._skipSync) {
            try {
                const { EntitySyncService } = await import('./services/EntitySyncService');
                const syncService = new EntitySyncService(this);
                await syncService.syncEntity('scene', scene, oldScene);
            } catch (error) {
                console.error('[saveScene] Error syncing relationships:', error);
                // Don't throw - sync failures shouldn't prevent saves
            }
        }
        
        this.app.metadataCache.trigger('dataview:refresh-views');
    }

    async listScenes(): Promise<Scene[]> {
        const resolver = this.getFolderResolver();
        let scanPaths: string[];

        if (resolver.usesBookName('scene')) {
            const books = await this.listBooks();
            const seenFolders = new Set<string>();
            scanPaths = [];
            for (const bookName of [...books.map(b => b.name), '']) {
                try {
                    const p = normalizePath(resolver.getEntityFolder('scene', { bookName }));
                    if (!seenFolders.has(p)) {
                        seenFolders.add(p);
                        scanPaths.push(p);
                        await this.ensureFolder(p);
                    }
                } catch { /* skip */ }
            }
        } else {
            await this.ensureSceneFolder();
            scanPaths = [normalizePath(this.getEntityFolder('scene'))];
        }

        const allFiles = this.app.vault.getMarkdownFiles();
        const scenes: Scene[] = [];
        const seenPaths = new Set<string>();
        for (const folderPath of scanPaths) {
            const prefix = folderPath + '/';
            const files = allFiles.filter(f => f.path.startsWith(prefix) && f.extension === 'md' && !seenPaths.has(f.path));
            for (const file of files) {
                seenPaths.add(file.path);
                const data = await this.parseFile<Scene>(file, { name: '' }, 'scene');
                if (data) scenes.push(data);
            }
        }
        // Sort: chapter -> priority -> name
        return scenes.sort((a, b) => {
            const ca = a.chapterId ? 0 : 1;
            const cb = b.chapterId ? 0 : 1;
            if (ca !== cb) return ca - cb;
            const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
            const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
            if (pa !== pb) return pa - pb;
            return a.name.localeCompare(b.name);
        });
    }

    async deleteScene(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (file instanceof TFile) {
            let sceneToDelete: Scene | null = null;
            // Remove from parent chapter's linkedScenes before trashing
            try {
                sceneToDelete = await this.parseFile<Scene>(file, { name: '' }, 'scene');
                if (sceneToDelete?.chapterId) {
                    await this._removeSceneFromChapter(sceneToDelete.name, sceneToDelete.chapterId);
                }
            } catch (e) {
                console.warn('[deleteScene] Could not sync linkedScenes before delete:', e);
            }

            if (sceneToDelete?.id || sceneToDelete?.name) {
                try {
                    const { EntitySyncService } = await import('./services/EntitySyncService');
                    const syncService = new EntitySyncService(this);
                    await syncService.handleEntityDeletion('scene', sceneToDelete.id || sceneToDelete.name);
                } catch (e) {
                    console.warn('[deleteScene] Could not remove scene relationship references before delete:', e);
                }
            }

            await this.app.vault.trash(file, true);
            new Notice(`Scene file "${file.basename}" moved to trash.`);
            this.app.metadataCache.trigger('dataview:refresh-views');
        } else {
            new Notice(`Error: Could not find scene file to delete at ${filePath}`);
        }
    }

    /**
     * Culture Data Management
     * Methods for creating, reading, updating, and deleting culture entities
     */

    async saveCulture(culture: Culture): Promise<void> {
        await this.ensureCultureFolder();
        const folderPath = this.getEntityFolder('culture');

        const fileName = `${culture.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        const { filePath: currentFilePath, description, values, religion, socialStructure, history, namingConventions, customs, ledger: _cultLedger, ...rest } = culture as any;
        if ((rest as any).sections) delete (rest as any).sections;

        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'File');
        }

        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        let existingSections: Record<string, string> = {};
        let originalFrontmatter: Record<string, unknown> | undefined;
        let oldCulture: Culture | undefined;
        if (existingFile && existingFile instanceof TFile) {
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                existingSections = parseSectionsFromMarkdown(existingContent);

                const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
                const directFrontmatter = parseFrontmatterFromContent(existingContent);
                const fileCache = this.app.metadataCache.getFileCache(existingFile);
                const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

                if (directFrontmatter || cachedFrontmatter) {
                    originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
                }

                // Load old culture for sync comparison (only if not skipping sync)
                if (!(culture as any)._skipSync) {
                    const parsed = await this.parseFile<Culture>(existingFile, { name: '' }, 'culture');
                    if (parsed) {
                        oldCulture = this.normalizeEntityCustomFields('culture', parsed);
                    }
                }
            } catch (error) {
                console.warn(`Error reading existing culture file: ${error}`);
            }
        }

        const finalFrontmatter = await this.buildFrontmatterForCulture(rest, originalFrontmatter);

        if (originalFrontmatter) {
            const validation = validateFrontmatterPreservation(finalFrontmatter, originalFrontmatter);
            if (validation.lostFields.length > 0) {
                console.warn(`[saveCulture] Warning: Fields will be lost on save:`, validation.lostFields);
            }
        }

        const frontmatterString = Object.keys(finalFrontmatter).length > 0
            ? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `Culture: ${culture.name}`)
            : '';

        const providedSections = {
            Description: description !== undefined ? description : '',
            Values: values !== undefined ? values : '',
            Religion: religion !== undefined ? religion : '',
            'Social Structure': socialStructure !== undefined ? socialStructure : '',
            History: history !== undefined ? history : '',
            'Naming Conventions': namingConventions !== undefined ? namingConventions : '',
            Customs: customs !== undefined ? customs : ''
        };
        const templateSections = getTemplateSections('culture', providedSections);

        let allSections: Record<string, string>;
        if (existingFile && existingFile instanceof TFile) {
            allSections = { ...existingSections, ...templateSections };
            Object.entries(providedSections).forEach(([key, value]) => {
                allSections[key] = value;
            });
        } else {
            allSections = templateSections;
        }

        let mdContent = `---\n${frontmatterString}---\n\n`;
        mdContent += Object.entries(allSections)
            .map(([key, content]) => `## ${key}\n${content || ''}`)
            .join('\n\n');
        if (!mdContent.endsWith('\n')) mdContent += '\n';

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, mdContent);
        } else {
            await this.app.vault.create(finalFilePath, mdContent);
            new Notice('Note created with standard sections for easy editing.');
        }

        culture.filePath = finalFilePath;

        // Sync relationships (unless this save was triggered by a sync)
        if (!(culture as any)._skipSync) {
            try {
                const { EntitySyncService } = await import('./services/EntitySyncService');
                const syncService = new EntitySyncService(this);
                await syncService.syncEntity('culture', culture, oldCulture);
            } catch (error) {
                console.error('[saveCulture] Error syncing relationships:', error);
            }
        }

        this.app.metadataCache.trigger("dataview:refresh-views");
    }

    async listCultures(): Promise<Culture[]> {
        await this.ensureCultureFolder();
        const folderPath = this.getEntityFolder('culture');
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = allFiles.filter(f => f.path.startsWith(folderPath + '/') && f.extension === 'md');
        const cultures: Culture[] = [];
        for (const file of files) {
            const data = await this.parseFile<Culture>(file, { name: '' }, 'culture');
            if (data) cultures.push(data);
        }
        return cultures.sort((a, b) => a.name.localeCompare(b.name));
    }

    async deleteCulture(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (file instanceof TFile) {
            await this.app.vault.trash(file, true);
            new Notice(`Culture file "${file.basename}" moved to trash.`);
            this.app.metadataCache.trigger('dataview:refresh-views');
        } else {
            new Notice(`Error: Could not find culture file to delete at ${filePath}`);
        }
    }

    /**
     * Economy Data Management
     */

    async saveEconomy(economy: Economy): Promise<void> {
        await this.ensureEconomyFolder();
        const folderPath = this.getEntityFolder('economy');

        const fileName = `${economy.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        const { filePath: currentFilePath, description, industries, taxation, ...rest } = economy as any;
        if ((rest as any).sections) delete (rest as any).sections;

        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'File');
        }

        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        let existingSections: Record<string, string> = {};
        let originalFrontmatter: Record<string, unknown> | undefined;
        let oldEconomy: Economy | undefined;
        if (existingFile && existingFile instanceof TFile) {
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                existingSections = parseSectionsFromMarkdown(existingContent);

                const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
                const directFrontmatter = parseFrontmatterFromContent(existingContent);
                const fileCache = this.app.metadataCache.getFileCache(existingFile);
                const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

                if (directFrontmatter || cachedFrontmatter) {
                    originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
                }

                // Load old economy for sync comparison (only if not skipping sync)
                if (!(economy as any)._skipSync) {
                    const parsed = await this.parseFile<Economy>(existingFile, { name: '' }, 'economy');
                    if (parsed) {
                        oldEconomy = this.normalizeEntityCustomFields('economy', parsed);
                    }
                }
            } catch (error) {
                console.warn(`Error reading existing economy file: ${error}`);
            }
        }

        const finalFrontmatter = await this.buildFrontmatterForEconomy(rest, originalFrontmatter);

        if (originalFrontmatter) {
            const validation = validateFrontmatterPreservation(finalFrontmatter, originalFrontmatter);
            if (validation.lostFields.length > 0) {
                console.warn(`[saveEconomy] Warning: Fields will be lost on save:`, validation.lostFields);
            }
        }

        const frontmatterString = Object.keys(finalFrontmatter).length > 0
            ? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `Economy: ${economy.name}`)
            : '';

        const providedSections = {
            Description: description !== undefined ? description : '',
            Industries: industries !== undefined ? industries : '',
            Taxation: taxation !== undefined ? taxation : ''
        };
        const templateSections = getTemplateSections('economy', providedSections);

        let allSections: Record<string, string>;
        if (existingFile && existingFile instanceof TFile) {
            allSections = { ...existingSections, ...templateSections };
            Object.entries(providedSections).forEach(([key, value]) => {
                allSections[key] = value;
            });
        } else {
            allSections = templateSections;
        }

        let mdContent = `---\n${frontmatterString}---\n\n`;
        mdContent += Object.entries(allSections)
            .map(([key, content]) => `## ${key}\n${content || ''}`)
            .join('\n\n');
        if (!mdContent.endsWith('\n')) mdContent += '\n';

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, mdContent);
        } else {
            await this.app.vault.create(finalFilePath, mdContent);
            new Notice('Note created with standard sections for easy editing.');
        }

        economy.filePath = finalFilePath;

        // Sync relationships (unless this save was triggered by a sync)
        if (!(economy as any)._skipSync) {
            const { EntitySyncService } = await import('./services/EntitySyncService');
            const syncService = new EntitySyncService(this);
            await syncService.syncEntity('economy', economy, oldEconomy);
        }

        this.app.metadataCache.trigger("dataview:refresh-views");
    }

    async listEconomies(): Promise<Economy[]> {
        await this.ensureEconomyFolder();
        const folderPath = this.getEntityFolder('economy');
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = allFiles.filter(f => f.path.startsWith(folderPath + '/') && f.extension === 'md');
        const economies: Economy[] = [];
        for (const file of files) {
            const data = await this.parseFile<Economy>(file, { name: '' }, 'economy');
            if (data) economies.push(data);
        }
        return economies.sort((a, b) => a.name.localeCompare(b.name));
    }

    async deleteEconomy(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (file instanceof TFile) {
            await this.app.vault.trash(file, true);
            new Notice(`Economy file "${file.basename}" moved to trash.`);
            this.app.metadataCache.trigger('dataview:refresh-views');
        } else {
            new Notice(`Error: Could not find economy file to delete at ${filePath}`);
        }
    }

    /**
     * CompendiumEntry Data Management
     */

    async saveCompendiumEntry(entry: CompendiumEntry): Promise<void> {
        await this.ensureCompendiumFolder();
        const folderPath = this.getEntityFolder('compendiumEntry');

        const fileName = `${entry.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        const { filePath: currentFilePath, description, behavior, properties, history, dimorphism, huntingNotes, ...rest } = entry as any;
        if ((rest as any).sections) delete (rest as any).sections;

        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'File');
        }

        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        let existingSections: Record<string, string> = {};
        let originalFrontmatter: Record<string, unknown> | undefined;
        let oldEntry: CompendiumEntry | undefined;
        if (existingFile && existingFile instanceof TFile) {
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                existingSections = parseSectionsFromMarkdown(existingContent);

                const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
                const directFrontmatter = parseFrontmatterFromContent(existingContent);
                const fileCache = this.app.metadataCache.getFileCache(existingFile);
                const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

                if (directFrontmatter || cachedFrontmatter) {
                    originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
                }

                if (!(entry as any)._skipSync) {
                    const parsed = await this.parseFile<CompendiumEntry>(existingFile, { name: '' }, 'compendiumEntry');
                    if (parsed) oldEntry = parsed;
                }
            } catch (error) {
                console.warn(`[saveCompendiumEntry] Error reading existing file: ${error}`);
            }
        }

        const finalFrontmatter = await this.buildFrontmatterForCompendiumEntry(rest, originalFrontmatter);

        const frontmatterString = Object.keys(finalFrontmatter).length > 0
            ? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `CompendiumEntry: ${entry.name}`)
            : '';

        const providedSections = {
            Description: description !== undefined ? description : '',
            'Behavior & Ecology': behavior !== undefined ? behavior : '',
            Properties: properties !== undefined ? properties : '',
            'History & Lore': history !== undefined ? history : '',
            Dimorphism: dimorphism !== undefined ? dimorphism : '',
            'Hunting Notes': huntingNotes !== undefined ? huntingNotes : ''
        };
        const templateSections = getTemplateSections('compendiumEntry', providedSections);

        let allSections: Record<string, string>;
        if (existingFile && existingFile instanceof TFile) {
            allSections = { ...existingSections, ...templateSections };
            Object.entries(providedSections).forEach(([key, value]) => {
                allSections[key] = value;
            });
        } else {
            allSections = templateSections;
        }

        let mdContent = `---\n${frontmatterString}---\n\n`;
        mdContent += Object.entries(allSections)
            .map(([key, content]) => `## ${key}\n${content || ''}`)
            .join('\n\n');
        if (!mdContent.endsWith('\n')) mdContent += '\n';

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, mdContent);
        } else {
            await this.app.vault.create(finalFilePath, mdContent);
            new Notice('Note created with standard sections for easy editing.');
        }

        entry.filePath = finalFilePath;

        if (!(entry as any)._skipSync) {
            const { EntitySyncService } = await import('./services/EntitySyncService');
            const syncService = new EntitySyncService(this);
            await syncService.syncEntity('compendiumentry', entry, oldEntry);
        }

        this.app.metadataCache.trigger('dataview:refresh-views');
    }

    async listCompendiumEntries(): Promise<CompendiumEntry[]> {
        await this.ensureCompendiumFolder();
        const folderPath = this.getEntityFolder('compendiumEntry');
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = allFiles.filter(f => f.path.startsWith(folderPath + '/') && f.extension === 'md');
        const entries: CompendiumEntry[] = [];
        for (const file of files) {
            const data = await this.parseFile<CompendiumEntry>(file, { name: '' }, 'compendiumEntry');
            if (data) entries.push(data);
        }
        return entries.sort((a, b) => a.name.localeCompare(b.name));
    }

    async deleteCompendiumEntry(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (file instanceof TFile) {
            await this.app.vault.trash(file, true);
            new Notice(`Compendium entry "${file.basename}" moved to trash.`);
            this.app.metadataCache.trigger('dataview:refresh-views');
        } else {
            new Notice(`Error: Could not find compendium entry file to delete at ${filePath}`);
        }
    }

    /**
     * MagicSystem Data Management
     */

    async saveMagicSystem(magicSystem: MagicSystem): Promise<void> {
        await this.ensureMagicSystemFolder();
        const folderPath = this.getEntityFolder('magicSystem');

        const fileName = `${magicSystem.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        const { filePath: currentFilePath, description, rules, source, costs, limitations, training, history, ...rest } = magicSystem as any;
        if ((rest as any).sections) delete (rest as any).sections;

        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            finalFilePath = await this.safeRenameFile(currentFilePath, filePath, 'File');
        }

        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        let existingSections: Record<string, string> = {};
        let originalFrontmatter: Record<string, unknown> | undefined;
        let oldMagicSystem: MagicSystem | undefined;
        if (existingFile && existingFile instanceof TFile) {
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                existingSections = parseSectionsFromMarkdown(existingContent);

                const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
                const directFrontmatter = parseFrontmatterFromContent(existingContent);
                const fileCache = this.app.metadataCache.getFileCache(existingFile);
                const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

                if (directFrontmatter || cachedFrontmatter) {
                    originalFrontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };
                }

                // Load old magic system for sync comparison (only if not skipping sync)
                if (!(magicSystem as any)._skipSync) {
                    const parsed = await this.parseFile<MagicSystem>(existingFile, { name: '' }, 'magicSystem');
                    if (parsed) {
                        oldMagicSystem = this.normalizeEntityCustomFields('magicSystem', parsed);
                    }
                }
            } catch (error) {
                console.warn(`Error reading existing magic system file: ${error}`);
            }
        }

        const finalFrontmatter = await this.buildFrontmatterForMagicSystem(rest, originalFrontmatter);

        if (originalFrontmatter) {
            const validation = validateFrontmatterPreservation(finalFrontmatter, originalFrontmatter);
            if (validation.lostFields.length > 0) {
                console.warn(`[saveMagicSystem] Warning: Fields will be lost on save:`, validation.lostFields);
            }
        }

        const frontmatterString = Object.keys(finalFrontmatter).length > 0
            ? stringifyYamlWithLogging(finalFrontmatter, originalFrontmatter, `MagicSystem: ${magicSystem.name}`)
            : '';

        const providedSections = {
            Description: description !== undefined ? description : '',
            Rules: rules !== undefined ? rules : '',
            Source: source !== undefined ? source : '',
            Costs: costs !== undefined ? costs : '',
            Limitations: limitations !== undefined ? limitations : '',
            Training: training !== undefined ? training : '',
            History: history !== undefined ? history : ''
        };
        const templateSections = getTemplateSections('magicSystem', providedSections);

        let allSections: Record<string, string>;
        if (existingFile && existingFile instanceof TFile) {
            allSections = { ...existingSections, ...templateSections };
            Object.entries(providedSections).forEach(([key, value]) => {
                allSections[key] = value;
            });
        } else {
            allSections = templateSections;
        }

        let mdContent = `---\n${frontmatterString}---\n\n`;
        mdContent += Object.entries(allSections)
            .map(([key, content]) => `## ${key}\n${content || ''}`)
            .join('\n\n');
        if (!mdContent.endsWith('\n')) mdContent += '\n';

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, mdContent);
        } else {
            await this.app.vault.create(finalFilePath, mdContent);
            new Notice('Note created with standard sections for easy editing.');
        }

        magicSystem.filePath = finalFilePath;
        this.app.metadataCache.trigger("dataview:refresh-views");

        if (!(magicSystem as any)._skipSync) {
            try {
                const { EntitySyncService } = await import('./services/EntitySyncService');
                const syncService = new EntitySyncService(this);
                await syncService.syncEntity('magicsystem', magicSystem, oldMagicSystem);
            } catch (error) {
                console.error('[saveMagicSystem] Error syncing relationships:', error);
            }
        }
    }

    async listMagicSystems(): Promise<MagicSystem[]> {
        await this.ensureMagicSystemFolder();
        const folderPath = this.getEntityFolder('magicSystem');
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = allFiles.filter(f => f.path.startsWith(folderPath + '/') && f.extension === 'md');
        const magicSystems: MagicSystem[] = [];
        for (const file of files) {
            const data = await this.parseFile<MagicSystem>(file, { name: '' }, 'magicSystem');
            if (data) magicSystems.push(data);
        }
        return magicSystems.sort((a, b) => a.name.localeCompare(b.name));
    }

    async deleteMagicSystem(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
        if (file instanceof TFile) {
            await this.app.vault.trash(file, true);
            new Notice(`Magic System file "${file.basename}" moved to trash.`);
            this.app.metadataCache.trigger('dataview:refresh-views');
        } else {
            new Notice(`Error: Could not find magic system file to delete at ${filePath}`);
        }
    }

    // ============================================================
    // Timeline Fork Management
    // ============================================================

    /**
     * Create a new timeline fork (alternate timeline)
     * @param name - Name of the fork
     * @param divergenceEvent - Event where timeline diverges
     * @param divergenceDate - Date of divergence
     * @param description - Description of how this timeline differs
     * @returns The created TimelineFork object
     */
    createTimelineFork(
        name: string,
        divergenceEvent: string,
        divergenceDate: string,
        description: string
    ): TimelineFork {
        const fork: TimelineFork = {
            id: Date.now().toString(),
            name,
            parentTimelineId: undefined, // Main timeline
            divergenceEvent,
            divergenceDate,
            description,
            status: 'exploring',
            forkEvents: [],
            alteredCharacters: [],
            alteredLocations: [],
            color: this.generateRandomColor(),
            created: new Date().toISOString(),
            notes: ''
        };

        this.settings.timelineForks = this.settings.timelineForks || [];
        this.settings.timelineForks.push(fork);
        this.saveSettings();

        new Notice(`Timeline fork "${name}" created`);
        return fork;
    }

    /**
     * Get all timeline forks
     * @returns Array of all timeline forks
     */
    getTimelineForks(): TimelineFork[] {
        return this.settings.timelineForks || [];
    }

    /**
     * Get a specific timeline fork by ID
     * @param forkId - ID of the fork to retrieve
     * @returns The timeline fork or undefined if not found
     */
    getTimelineFork(forkId: string): TimelineFork | undefined {
        return this.settings.timelineForks?.find(f => f.id === forkId);
    }

    /**
     * Update an existing timeline fork
     * @param fork - Updated fork object
     */
    async updateTimelineFork(fork: TimelineFork): Promise<void> {
        const index = this.settings.timelineForks?.findIndex(f => f.id === fork.id);
        if (index !== undefined && index >= 0) {
            this.settings.timelineForks![index] = fork;
            await this.saveSettings();
            new Notice(`Timeline fork "${fork.name}" updated`);
        } else {
            new Notice(`Error: Timeline fork not found`);
        }
    }

    /**
     * Delete a timeline fork
     * @param forkId - ID of the fork to delete
     */
    async deleteTimelineFork(forkId: string): Promise<void> {
        const fork = this.getTimelineFork(forkId);
        if (fork) {
            this.settings.timelineForks = this.settings.timelineForks?.filter(f => f.id !== forkId);
            await this.saveSettings();
            new Notice(`Timeline fork "${fork.name}" deleted`);
        } else {
            new Notice(`Error: Timeline fork not found`);
        }
    }

    /**
     * Add an event to a timeline fork
     * @param forkId - ID of the fork
     * @param eventId - ID or name of the event to add
     */
    async addEventToFork(forkId: string, eventId: string): Promise<void> {
        const fork = this.getTimelineFork(forkId);
        if (!fork) {
            new Notice(`Error: Timeline fork not found`);
            return;
        }

        if (!fork.forkEvents) {
            fork.forkEvents = [];
        }

        if (!fork.forkEvents.includes(eventId)) {
            fork.forkEvents.push(eventId);
            await this.updateTimelineFork(fork);
        }
    }

    /**
     * Remove an event from a timeline fork
     * @param forkId - ID of the fork
     * @param eventId - ID or name of the event to remove
     */
    async removeEventFromFork(forkId: string, eventId: string): Promise<void> {
        const fork = this.getTimelineFork(forkId);
        if (!fork) {
            new Notice(`Error: Timeline fork not found`);
            return;
        }

        if (fork.forkEvents) {
            fork.forkEvents = fork.forkEvents.filter(id => id !== eventId);
            await this.updateTimelineFork(fork);
        }
    }

    /**
     * Get all forks that contain a specific event
     * @param eventId - ID or name of the event
     * @returns Array of forks containing the event
     */
    getForksForEvent(eventId: string): TimelineFork[] {
        const forks = this.getTimelineForks();
        return forks.filter(fork => fork.forkEvents?.includes(eventId));
    }

    /**
     * Generate a random color for timeline fork visualization
     * @returns Hex color string
     */
    generateRandomColor(): string {
        const colors = [
            '#FF6B6B', // Red
            '#4ECDC4', // Teal
            '#45B7D1', // Blue
            '#FFA07A', // Light Salmon
            '#98D8C8', // Mint
            '#F7DC6F', // Yellow
            '#BB8FCE', // Purple
            '#85C1E2', // Sky Blue
            '#F8B195', // Peach
            '#95E1D3'  // Aqua
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // ============================================================
    // Timeline Era Management
    // ============================================================

    /**
     * Create a new timeline era
     * @param era - Era object to create
     */
    async createTimelineEra(era: TimelineEra): Promise<void> {
        this.settings.timelineEras = this.settings.timelineEras || [];
        this.settings.timelineEras.push(era);
        await this.saveSettings();
        new Notice(`Era "${era.name}" created`);
    }

    /**
     * Get all timeline eras
     * @returns Array of all eras
     */
    getTimelineEras(): TimelineEra[] {
        return this.settings.timelineEras || [];
    }

    /**
     * Get a specific era by ID
     * @param eraId - ID of the era to retrieve
     * @returns The era or undefined if not found
     */
    getTimelineEra(eraId: string): TimelineEra | undefined {
        return this.settings.timelineEras?.find(e => e.id === eraId);
    }

    /**
     * Update an existing era
     * @param era - Updated era object
     */
    async updateTimelineEra(era: TimelineEra): Promise<void> {
        const index = this.settings.timelineEras?.findIndex(e => e.id === era.id);
        if (index !== undefined && index >= 0) {
            this.settings.timelineEras![index] = era;
            await this.saveSettings();
            new Notice(`Era "${era.name}" updated`);
        } else {
            new Notice(`Error: Era not found`);
        }
    }

    /**
     * Delete an era
     * @param eraId - ID of the era to delete
     */
    async deleteTimelineEra(eraId: string): Promise<void> {
        const era = this.getTimelineEra(eraId);
        if (era) {
            this.settings.timelineEras = this.settings.timelineEras?.filter(e => e.id !== eraId);
            await this.saveSettings();
            new Notice(`Era "${era.name}" deleted`);
        } else {
            new Notice(`Error: Era not found`);
        }
    }

    // ============================================================
    // Timeline Track Management
    // ============================================================

    /**
     * Create a new timeline track
     * @param track - Track object to create
     */
    async createTimelineTrack(track: TimelineTrack): Promise<void> {
        this.settings.timelineTracks = this.settings.timelineTracks || [];
        this.settings.timelineTracks.push(track);
        await this.saveSettings();
        new Notice(`Track "${track.name}" created`);
    }

    /**
     * Get all timeline tracks
     * @returns Array of all tracks
     */
    getTimelineTracks(): TimelineTrack[] {
        return this.settings.timelineTracks || [];
    }

    /**
     * Get a specific track by ID
     * @param trackId - ID of the track to retrieve
     * @returns The track or undefined if not found
     */
    getTimelineTrack(trackId: string): TimelineTrack | undefined {
        return this.settings.timelineTracks?.find(t => t.id === trackId);
    }

    /**
     * Update an existing track
     * @param track - Updated track object
     */
    async updateTimelineTrack(track: TimelineTrack): Promise<void> {
        const index = this.settings.timelineTracks?.findIndex(t => t.id === track.id);
        if (index !== undefined && index >= 0) {
            this.settings.timelineTracks![index] = track;
            await this.saveSettings();
            new Notice(`Track "${track.name}" updated`);
        } else {
            new Notice(`Error: Track not found`);
        }
    }

    /**
     * Delete a track
     * @param trackId - ID of the track to delete
     */
    async deleteTimelineTrack(trackId: string): Promise<void> {
        const track = this.getTimelineTrack(trackId);
        if (track) {
            this.settings.timelineTracks = this.settings.timelineTracks?.filter(t => t.id !== trackId);
            await this.saveSettings();
            new Notice(`Track "${track.name}" deleted`);
        } else {
            new Notice(`Error: Track not found`);
        }
    }

    // ============================================================
    // Causality Link Management
    // ============================================================

    /**
     * Create a causality link between two events
     * @param causeEvent - ID or name of the cause event
     * @param effectEvent - ID or name of the effect event
     * @param linkType - Type of causality (direct, indirect, conditional, catalyst)
     * @param description - Description of the causal relationship
     * @param strength - Strength of the link (weak, moderate, strong, absolute)
     * @returns The created CausalityLink object
     */
    createCausalityLink(
        causeEvent: string,
        effectEvent: string,
        linkType: 'direct' | 'indirect' | 'conditional' | 'catalyst',
        description: string,
        strength?: 'weak' | 'moderate' | 'strong' | 'absolute'
    ): CausalityLink {
        const link: CausalityLink = {
            id: `${causeEvent}-${effectEvent}-${Date.now()}`,
            causeEvent,
            effectEvent,
            linkType,
            strength: strength || 'strong',
            description
        };

        this.settings.causalityLinks = this.settings.causalityLinks || [];
        this.settings.causalityLinks.push(link);
        this.saveSettings();

        new Notice(`Causality link created: ${causeEvent} → ${effectEvent}`);
        return link;
    }

    /**
     * Get all causality links
     * @returns Array of all causality links
     */
    getCausalityLinks(): CausalityLink[] {
        return this.settings.causalityLinks || [];
    }

    /**
     * Get causality links for a specific event
     * @param eventId - ID or name of the event
     * @returns Object containing causes and effects for the event
     */
    getCausalityLinksForEvent(eventId: string): { causes: CausalityLink[], effects: CausalityLink[] } {
        const links = this.settings.causalityLinks || [];

        return {
            causes: links.filter(l => l.effectEvent === eventId),
            effects: links.filter(l => l.causeEvent === eventId)
        };
    }

    /**
     * Update a causality link
     * @param link - Updated link object
     */
    async updateCausalityLink(link: CausalityLink): Promise<void> {
        const index = this.settings.causalityLinks?.findIndex(l => l.id === link.id);
        if (index !== undefined && index >= 0) {
            this.settings.causalityLinks![index] = link;
            await this.saveSettings();
            new Notice(`Causality link updated`);
        } else {
            new Notice(`Error: Causality link not found`);
        }
    }

    /**
     * Delete a causality link
     * @param linkId - ID of the link to delete
     */
    async deleteCausalityLink(linkId: string): Promise<void> {
        const linksBefore = this.settings.causalityLinks?.length || 0;
        this.settings.causalityLinks = this.settings.causalityLinks?.filter(l => l.id !== linkId);
        const linksAfter = this.settings.causalityLinks?.length || 0;

        if (linksBefore > linksAfter) {
            await this.saveSettings();
            new Notice(`Causality link deleted`);
        } else {
            new Notice(`Error: Causality link not found`);
        }
    }


	/**
	 * Story Board Management
	 * Methods for creating and managing visual story boards on canvas
	 */

	/**
	 * Create a visual story board on an Obsidian Canvas
	 * Organizes scenes visually by chapter, status, or timeline
	 */
	async createStoryBoard(): Promise<void> {
		try {
			// Get all scenes
			const scenes = await this.listScenes();

			if (scenes.length === 0) {
				new Notice('No scenes found. Create some scenes first!');
				return;
			}

			// Get all chapters
			const chapters = await this.listChapters();

			// Import the generator
			const { StoryBoardGenerator } = await import('./utils/StoryBoardGenerator');

			// Get settings or use defaults
			const layout = this.settings.storyBoardLayout || 'chapters';
			const cardWidth = this.settings.storyBoardCardWidth || 400;
			const cardHeight = this.settings.storyBoardCardHeight || 300;
			const colorBy = this.settings.storyBoardColorBy || 'status';
			const showEdges = this.settings.storyBoardShowEdges !== undefined ? this.settings.storyBoardShowEdges : false;

			// Generate canvas data
			const generator = new StoryBoardGenerator({ cardWidth, cardHeight });
			const canvasData = generator.generateCanvas(scenes, chapters, {
				layout: layout,
				colorBy: colorBy,
				showChapterHeaders: true,
				showEdges: showEdges
			});

			// Determine canvas file path
			const canvasPath = this.getStoryBoardPath();

			// Check if canvas already exists
			const existingFile = this.app.vault.getAbstractFileByPath(canvasPath);
			if (existingFile instanceof TFile) {
				// Ask user if they want to overwrite
				const { ConfirmModal } = await import('./modals/ui/ConfirmModal');
				let userConfirmed = false;
				await new Promise<void>((resolve) => {
					new ConfirmModal(this.app, {
						title: 'Overwrite Story Board?',
						body: 'A story board already exists. Do you want to overwrite it?',
						onConfirm: () => {
							userConfirmed = true;
							resolve();
						}
					}).open();
					// If modal is closed without confirming, resolve after a short delay
					setTimeout(() => resolve(), 100);
				});

				if (userConfirmed) {
					// Overwrite existing canvas
					const canvasContent = JSON.stringify(canvasData, null, 2);
					await this.app.vault.modify(existingFile, canvasContent);
					new Notice('Story board updated!');
				} else {
					// User cancelled
					return;
				}
			} else {
				// Create new canvas file
				const canvasContent = JSON.stringify(canvasData, null, 2);
				await this.app.vault.create(canvasPath, canvasContent);
				new Notice('Story board created!');
			}

			// Open the canvas file
			const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
			if (canvasFile instanceof TFile) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(canvasFile);
			}

		} catch (error) {
			if (error instanceof Error && error.message === 'User cancelled') {
				// User chose not to overwrite, silently return
				return;
			}
			console.error('Error creating story board:', error);
			new Notice('Error creating story board. See console for details.');
		}
	}

	/**
	 * Update existing story board with current scenes
	 * Preserves manual user edits while adding/removing/updating scenes
	 */
	async updateStoryBoard(): Promise<void> {
		try {
			// Check if story board exists
			const canvasPath = this.getStoryBoardPath();
			const existingFile = this.app.vault.getAbstractFileByPath(canvasPath);

			if (!(existingFile instanceof TFile)) {
				new Notice('No story board found. Create one first using "Create Story Board".');
				return;
			}

			// Get all scenes
			const scenes = await this.listScenes();

			if (scenes.length === 0) {
				new Notice('No scenes found. Create some scenes first!');
				return;
			}
			// Get all chapters
			const chapters = await this.listChapters();

			// Read existing canvas
			const existingContent = await this.app.vault.read(existingFile);
			let existingCanvas: any;
			try {
				existingCanvas = JSON.parse(existingContent);
			} catch (error) {
				new Notice('Error reading existing story board. It may be corrupted.');
				console.error('Error parsing canvas:', error);
				return;
			}

			// Import the generator
			const { StoryBoardGenerator } = await import('./utils/StoryBoardGenerator');

			// Get settings or use defaults
			const layout = this.settings.storyBoardLayout || 'chapters';
			const cardWidth = this.settings.storyBoardCardWidth || 400;
			const cardHeight = this.settings.storyBoardCardHeight || 300;
			const colorBy = this.settings.storyBoardColorBy || 'status';
			const showEdges = this.settings.storyBoardShowEdges !== undefined ? this.settings.storyBoardShowEdges : false;

			// Update canvas data (preserves manual edits)
			const generator = new StoryBoardGenerator({ cardWidth, cardHeight });
			const updatedCanvas = generator.updateCanvas(existingCanvas, scenes, chapters, {
				layout: layout,
				colorBy: colorBy,
				showChapterHeaders: true,
				showEdges: showEdges
			});

			// Save updated canvas
			const canvasContent = JSON.stringify(updatedCanvas, null, 2);
			await this.app.vault.modify(existingFile, canvasContent);
			new Notice('Story board updated! Manual edits preserved.');

			// Open the canvas file
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(existingFile);

		} catch (error) {
			console.error('Error updating story board:', error);
			new Notice('Error updating story board. See console for details.');
		}
	}

	/**
	 * Open the existing story board canvas
	 * Creates the story board if it doesn't exist
	 */
	async openStoryBoard(): Promise<void> {
		try {
			const canvasPath = this.getStoryBoardPath();
			const existingFile = this.app.vault.getAbstractFileByPath(canvasPath);

			if (!(existingFile instanceof TFile)) {
				// Story board doesn't exist - ask if user wants to create it
				const { ConfirmModal } = await import('./modals/ui/ConfirmModal');
				let userConfirmed = false;
				await new Promise<void>((resolve) => {
					new ConfirmModal(this.app, {
						title: 'Create Story Board?',
						body: 'No story board found. Would you like to create one?',
						onConfirm: () => {
							userConfirmed = true;
							resolve();
						}
					}).open();
					setTimeout(() => resolve(), 100);
				});

				if (userConfirmed) {
					await this.createStoryBoard();
				}
				return;
			}

			// Open the canvas file
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(existingFile);

		} catch (error) {
			console.error('Error opening story board:', error);
			new Notice('Error opening story board. See console for details.');
		}
	}

	/**
	 * Get the file path for the story board canvas
	 */
	private getStoryBoardPath(): string {
		const activeStory = this.getActiveStory();
		const storyName = activeStory ? activeStory.name : 'Default';

		// Create a safe filename from story name
		const safeName = storyName.replace(/[\\/:*?"<>|]/g, '-');

		// Use story's base folder if in one-story mode, otherwise use Stories folder
		if (this.settings.enableOneStoryMode) {
			const baseFolder = this.sanitizeBaseFolderPath(this.settings.oneStoryBaseFolder);
			return normalizePath(`${baseFolder}/Story Board - ${safeName}.canvas`);
		} else {
			// Use Stories/StoryName folder structure
			const baseStoriesPath = 'StorytellerSuite/Stories';
			return normalizePath(`${baseStoriesPath}/${storyName}/Story Board - ${safeName}.canvas`);
		}
	}

	/**
	 * Gallery Data Management
	 * Methods for managing gallery images stored in plugin settings
	 * Gallery images are metadata-only - actual image files are stored in vault
	 */

	private isGalleryImageExtension(ext?: string): boolean {
		const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
		return IMAGE_EXTS.has((ext || '').toLowerCase());
	}

	private normalizeGalleryFolderPath(path: string | undefined | null): string {
		return normalizePath((path || '').trim()).replace(/\/+$/, '');
	}

	private isGalleryManagedPath(filePath: string): boolean {
		const normalizedPath = normalizePath(filePath);
		return this.getGalleryManagedFolders().some(folder =>
			normalizedPath === folder || normalizedPath.startsWith(`${folder}/`)
		);
	}

	private isGalleryManagedImageFile(file: TFile): boolean {
		return this.isGalleryImageExtension(file.extension) && this.isGalleryManagedPath(file.path);
	}

	private getGalleryManagedFolders(): string[] {
		const folders = new Set<string>();
		const uploadFolder = this.normalizeGalleryFolderPath(this.settings.galleryUploadFolder || DEFAULT_SETTINGS.galleryUploadFolder);
		if (uploadFolder) folders.add(uploadFolder);
		const watchFolder = this.normalizeGalleryFolderPath(this.settings.galleryWatchFolder);
		if (watchFolder) folders.add(watchFolder);
		return Array.from(folders);
	}

	private async syncGalleryImageRecord(file: TFile): Promise<boolean> {
		if (!this.isGalleryManagedImageFile(file)) return false;
		if (!this.settings.galleryData) this.settings.galleryData = { images: [] };
		if (!this.settings.galleryData.images) this.settings.galleryData.images = [];

		const exists = this.settings.galleryData.images.some(img => img.filePath === file.path);
		if (exists) return false;

		this.settings.galleryData.images.unshift({
			id: `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			filePath: file.path,
			title: file.basename,
			caption: '',
			description: '',
			tags: []
		});
		await this.saveSettings();
		return true;
	}

	/**
	 * Get all gallery images from plugin settings
	 * @returns Array of gallery image metadata
	 */
	getGalleryImages(): GalleryImage[] {
		return this.settings.galleryData.images || [];
	}

	/**
	 * Scan the gallery-managed folders and add any images not yet in the gallery.
	 * Uses the filename (without extension) as the default title.
	 */
	async syncGalleryWatchFolder(): Promise<void> {
		const folders = this.getGalleryManagedFolders();
		if (folders.length === 0) return;

		const files = this.app.vault.getFiles().filter(f => this.isGalleryManagedImageFile(f));

		if (!this.settings.galleryData) this.settings.galleryData = { images: [] };
		if (!this.settings.galleryData.images) this.settings.galleryData.images = [];

		const validPaths = new Set(files.map(file => file.path));
		let added = 0;
		for (const file of files) {
			const alreadyExists = this.settings.galleryData.images.some(
				img => img.filePath === file.path
			);
			if (!alreadyExists) {
				const id = `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
				this.settings.galleryData.images.push({
					id,
					filePath: file.path,
					title: file.basename,
					caption: '',
					description: '',
					tags: []
				});
				added++;
			}
		}

		const beforeLength = this.settings.galleryData.images.length;
		this.settings.galleryData.images = this.settings.galleryData.images.filter(img => {
			if (!this.isGalleryManagedPath(img.filePath)) return true;
			return validPaths.has(img.filePath);
		});
		const removed = beforeLength - this.settings.galleryData.images.length;

		if (added > 0 || removed > 0) await this.saveSettings();
	}

	/**
	 * Add a new image to the gallery
	 * Generates a unique ID and saves to plugin settings
	 * @param imageData Image metadata without ID
	 * @returns Complete gallery image object with generated ID
	 */
	async addGalleryImage(imageData: Omit<GalleryImage, 'id'>): Promise<GalleryImage> {
		const newImage = this.createGalleryImageRecord(imageData);
		
		// Add to gallery and save settings
		if (!this.settings.galleryData) this.settings.galleryData = { images: [] };
		if (!this.settings.galleryData.images) this.settings.galleryData.images = [];
		this.settings.galleryData.images.push(newImage);
		await this.saveSettings();
		
		return newImage;
	}

	private createGalleryImageRecord(imageData: Omit<GalleryImage, 'id'>): GalleryImage {
		const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
		return { ...imageData, id };
	}

	private sanitizeGalleryUploadName(fileName: string): string {
		const lastDot = fileName.lastIndexOf('.');
		const rawBase = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
		const rawExt = lastDot > 0 ? fileName.slice(lastDot + 1) : '';
		const safeBase = rawBase.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').trim() || 'image';
		const safeExt = rawExt.replace(/[^\w]/g, '').toLowerCase();
		return safeExt ? `${safeBase}.${safeExt}` : safeBase;
	}

	private async getUniqueGalleryUploadPath(fileName: string): Promise<string> {
		const uploadFolderPath = normalizePath(this.settings.galleryUploadFolder || DEFAULT_SETTINGS.galleryUploadFolder);
		const sanitizedName = this.sanitizeGalleryUploadName(fileName);
		const lastDot = sanitizedName.lastIndexOf('.');
		const baseName = lastDot > 0 ? sanitizedName.slice(0, lastDot) : sanitizedName;
		const extension = lastDot > 0 ? sanitizedName.slice(lastDot) : '';

		let counter = 0;
		let candidateName = sanitizedName;
		let candidatePath = normalizePath(`${uploadFolderPath}/${candidateName}`);
		while (this.app.vault.getAbstractFileByPath(candidatePath)) {
			counter++;
			candidateName = `${baseName}_${counter}${extension}`;
			candidatePath = normalizePath(`${uploadFolderPath}/${candidateName}`);
		}

		return candidatePath;
	}

	async importGalleryUploads(files: Iterable<File>): Promise<{ imported: GalleryImage[]; failed: Array<{ name: string; error: unknown }> }> {
		const imported: GalleryImage[] = [];
		const failed: Array<{ name: string; error: unknown }> = [];
		const pendingRecords: GalleryImage[] = [];
		const fileList = Array.from(files || []);
		if (fileList.length === 0) {
			return { imported, failed };
		}

		const uploadFolderPath = normalizePath(this.settings.galleryUploadFolder || DEFAULT_SETTINGS.galleryUploadFolder);
		await this.ensureFolder(uploadFolderPath);

		for (const file of fileList) {
			if (!file) continue;
			try {
				const filePath = await this.getUniqueGalleryUploadPath(file.name);
				const arrayBuffer = await file.arrayBuffer();
				const createdFile = await this.app.vault.createBinary(filePath, arrayBuffer);
				const newImage = this.createGalleryImageRecord({
					filePath,
					title: createdFile.basename
				});
				pendingRecords.push(newImage);
				imported.push(newImage);
			} catch (error) {
				console.error(`Error importing gallery upload "${file?.name ?? 'unknown'}":`, error);
				failed.push({ name: file?.name ?? 'unknown', error });
			}
		}

		if (pendingRecords.length > 0) {
			if (!this.settings.galleryData) this.settings.galleryData = { images: [] };
			if (!this.settings.galleryData.images) this.settings.galleryData.images = [];
			this.settings.galleryData.images.push(...pendingRecords);
			await this.saveSettings();
		}

		return { imported, failed };
	}

	/**
	 * Update an existing gallery image
	 * @param updatedImage Complete image object with updates
	 */
	async updateGalleryImage(updatedImage: GalleryImage): Promise<void> {
		const images = this.settings.galleryData.images;
		const index = images.findIndex(img => img.id === updatedImage.id);
		
		if (index !== -1) {
			// Replace existing image data
			images[index] = updatedImage;
			await this.saveSettings();
		} else {
			console.error(`Gallery image with id ${updatedImage.id} not found for update`);
			new Notice(`Error: Gallery image not found for update`);
		}
	}

	/**
	 * Delete a gallery image by ID
	 * @param imageId Unique identifier of the image to delete
	 */
	async deleteGalleryImage(imageId: string): Promise<void> {
		const images = this.settings.galleryData.images;
		const initialLength = images.length;
		
		// Filter out the image with matching ID
		this.settings.galleryData.images = images.filter(img => img.id !== imageId);
		
		if (this.settings.galleryData.images.length < initialLength) {
			// Image was found and removed
			await this.saveSettings();
			new Notice('Image removed from gallery');
		} else {
			// Image not found
			console.error(`Gallery image with id ${imageId} not found for deletion`);
			new Notice(`Error: Gallery image not found`);
		}
	}

	/**
	 * GROUP MANAGEMENT LOGIC
	 * Backend methods for creating, updating, deleting groups and managing members
	 */

	/**
	 * Create a new group and persist it
	 */
	async createGroup(name: string, description?: string, color?: string): Promise<Group> {
		const activeStory = this.getActiveStory();
		if (!activeStory) throw new Error('No active story selected');
		
		const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
		const group: Group = { id, storyId: activeStory.id, name, description, color, members: [] };
		this.settings.groups.push(group);
		await this.saveSettings();
		await this.saveGroupToFile(group);
		this.emitGroupsChanged();
		return group;
	}

	/**
	 * Update an existing group (name, description, color)
	 */
	async updateGroup(id: string, updates: Partial<Omit<Group, 'id' | 'members'>>): Promise<void> {
		const activeStory = this.getActiveStory();
		if (!activeStory) throw new Error('No active story selected');
		
		const group = this.settings.groups.find(g => g.id === id && g.storyId === activeStory.id);
		if (!group) throw new Error('Group not found');
		if (updates.name !== undefined) group.name = updates.name;
		if (updates.description !== undefined) group.description = updates.description;
		if (updates.color !== undefined) group.color = updates.color;
		await this.saveSettings();
		await this.saveGroupToFile(group);
		this.emitGroupsChanged();
	}

	/**
	 * Delete a group and remove its id from all member entities
	 */
	async deleteGroup(id: string): Promise<void> {
		const activeStory = this.getActiveStory();
		if (!activeStory) throw new Error('No active story selected');
		
		// Verify the group belongs to the active story before deleting
		const group = this.settings.groups.find(g => g.id === id && g.storyId === activeStory.id);
		if (!group) throw new Error('Group not found');
		
		const groupName = group.name;
		// Remove group from settings
		this.settings.groups = this.settings.groups.filter(g => g.id !== id);
		// Remove group id from all member entities
		await this.removeGroupIdFromAllEntities(id);
		await this.saveSettings();
		await this.deleteGroupFile(groupName);
		this.invalidateFrontmatterReferenceIndexes();
		this.emitGroupsChanged();
	}

	/**
	 * Get all groups for the active story
	 */
	getGroups(): Group[] {
		const activeStory = this.getActiveStory();
		if (!activeStory) return [];
		return this.settings.groups.filter(group => group.storyId === activeStory.id);
	}

	/**
	 * Add a member (character, event, or location) to a group
	 */
	async addMemberToGroup(groupId: string, memberType: 'character' | 'event' | 'location' | 'item' | 'compendiumEntry', memberId: string): Promise<void> {
		const activeStory = this.getActiveStory();
		if (!activeStory) throw new Error('No active story selected');
		
		const group = this.settings.groups.find(g => g.id === groupId && g.storyId === activeStory.id);
		if (!group) throw new Error('Group not found');
		// Prevent duplicate
		if (!group.members.some(m => m.type === memberType && m.id === memberId)) {
			group.members.push({ type: memberType, id: memberId });
		}
		// Update the entity's groups array
		await this.addGroupIdToEntity(memberType, memberId, groupId);
		await this.saveSettings();
		await this.saveGroupToFile(group);
		this.emitGroupsChanged();
	}

	/**
	 * Remove a member from a group
	 */
	async removeMemberFromGroup(groupId: string, memberType: 'character' | 'event' | 'location' | 'item' | 'compendiumEntry', memberId: string): Promise<void> {
		const activeStory = this.getActiveStory();
		if (!activeStory) throw new Error('No active story selected');
		
		const group = this.settings.groups.find(g => g.id === groupId && g.storyId === activeStory.id);
		if (!group) throw new Error('Group not found');
		group.members = group.members.filter(m => !(m.type === memberType && m.id === memberId));
		// Update the entity's groups array
		await this.removeGroupIdFromEntity(memberType, memberId, groupId);
		await this.saveSettings();
		await this.saveGroupToFile(group);
		this.emitGroupsChanged();
	}

	// ─── Group Vault File Helpers ──────────────────────────────────────────

	/**
	 * Build the safe filename for a group's vault note.
	 */
	private groupFileName(name: string): string {
		return `${name.replace(/[\\/:"*?<>|]+/g, '').trim()}.md`;
	}

	/** Returns the vault path for a group's note, or null if no active story. */
	getGroupFilePath(groupName: string): string | null {
		try {
			const folderPath = this.getEntityFolder('group');
			return normalizePath(`${folderPath}/${this.groupFileName(groupName)}`);
		} catch {
			return null;
		}
	}

	/**
	 * Serialize a group to a vault markdown file (frontmatter + sections).
	 * Creates or overwrites the file.
	 */
	async saveGroupToFile(group: Group): Promise<void> {
		try {
			this.invalidateFrontmatterReferenceIndexes();
			const folderPath = this.getEntityFolder('group');
			await this.ensureFolder(folderPath);
			const fileName = this.groupFileName(group.name);
			const filePath = normalizePath(`${folderPath}/${fileName}`);
			const toWikiLink = (value: unknown): string | undefined => {
				const stripped = this.stripWikiLinkValue(value);
				return stripped ? `[[${stripped}]]` : undefined;
			};

			// Build frontmatter object (scalar / array fields only)
			const fm: Record<string, unknown> = {
				'storyteller-type': 'group',
				'storyteller-id': group.id,
				'storyteller-story-id': group.storyId,
				name: group.name,
			};
			if (group.color)             fm['color']              = group.color;
			if (group.groupType)         fm['group-type']         = group.groupType;
			if (group.tags?.length)      fm['tags']               = group.tags;
			if (group.profileImagePath)  fm['profile-image']      = group.profileImagePath;
			if (group.strength)          fm['strength']           = group.strength;
			if (group.status)            fm['status']             = group.status;
			if (group.emblem)            fm['emblem']             = group.emblem;
			if (group.motto)             fm['motto']              = group.motto;
			if (group.militaryPower !== undefined) fm['military-power']   = group.militaryPower;
			if (group.economicPower !== undefined) fm['economic-power']   = group.economicPower;
			if (group.politicalInfluence !== undefined) fm['political-influence'] = group.politicalInfluence;
			if (group.colors?.length)    fm['colors']             = group.colors;
			if (group.territories?.length) fm['territories']      = await Promise.all(group.territories.map(async territory => {
				const name = await this.resolveFrontmatterReferenceName('location', territory);
				return toWikiLink(name ?? territory) ?? territory;
			}));
			if (group.linkedEvents?.length) fm['linked-events']   = await Promise.all(group.linkedEvents.map(async eventRef => {
				const name = await this.resolveFrontmatterReferenceName('event', eventRef);
				return toWikiLink(name ?? eventRef) ?? eventRef;
			}));
			if (group.linkedCulture) {
				const linkedCultureName = await this.resolveFrontmatterReferenceName('culture', group.linkedCulture);
				fm['linked-culture'] = toWikiLink(linkedCultureName ?? group.linkedCulture) ?? group.linkedCulture;
			}
			if (group.parentGroup) {
				const parentGroupName = await this.resolveFrontmatterReferenceName('group', group.parentGroup);
				fm['parent-group'] = toWikiLink(parentGroupName ?? group.parentGroup) ?? group.parentGroup;
			}
			if (group.subgroups?.length) fm['subgroups']          = await Promise.all(group.subgroups.map(async subgroup => {
				const name = await this.resolveFrontmatterReferenceName('group', subgroup);
				return toWikiLink(name ?? subgroup) ?? subgroup;
			}));
			if (group.members?.length)   fm['members']            = await Promise.all(group.members.map(async m => {
				const obj: Record<string, unknown> = { ...m, type: m.type };
				const memberType: EntityFolderType =
					m.type === 'compendiumEntry' ? 'compendiumEntry' : m.type;
				const memberName = await this.resolveFrontmatterReferenceName(memberType, m.id, m.name);
				obj['id'] = memberName ? `[[${memberName}]]` : (this.stripWikiLinkValue(m.id) ?? m.id);
				delete obj['name'];
				return obj;
			}));
			if (group.groupRelationships?.length) fm['group-relationships'] = await Promise.all(group.groupRelationships.map(async rel => {
				const groupName = await this.resolveFrontmatterReferenceName('group', rel.groupName);
				return {
					...rel,
					groupName: toWikiLink(groupName ?? rel.groupName) ?? rel.groupName,
				};
			}));
			if (group.connections?.length) fm['connections']      = group.connections;
			if (group.customFields && Object.keys(group.customFields).length) {
				fm['custom-fields'] = group.customFields;
			}

			// Serialize frontmatter

			const fmStr = stringifyYaml(fm).trim();

			// Build markdown body sections
			const sections: string[] = [];
			if (group.description) sections.push(`## Description\n\n${group.description}`);
			if (group.history)     sections.push(`## History\n\n${group.history}`);
			if (group.structure)   sections.push(`## Structure\n\n${group.structure}`);
			if (group.goals)       sections.push(`## Goals\n\n${group.goals}`);
			if (group.resources)   sections.push(`## Resources\n\n${group.resources}`);

			const content = `---\n${fmStr}\n---\n\n${sections.join('\n\n')}\n`.trimEnd() + '\n';

			const existing = this.app.vault.getAbstractFileByPath(filePath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, content);
			} else {
				await this.app.vault.create(filePath, content);
			}
		} catch (err) {
			console.error('[saveGroupToFile] Failed to write group file:', err);
		}
	}

	/**
	 * Delete the vault file for a group (by name). No-ops if file is missing.
	 */
	async deleteGroupFile(groupName: string): Promise<void> {
		try {
			const folderPath = this.getEntityFolder('group');
			const filePath = normalizePath(`${folderPath}/${this.groupFileName(groupName)}`);
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.app.vault.trash(file, true);
			}
		} catch (err) {
			console.error('[deleteGroupFile] Failed to delete group file:', err);
		}
	}

	/**
	 * Persist all fields of a group (including faction-enhanced ones) to both
	 * settings.groups and the vault markdown file.
	 * Use this from GroupModal instead of the Object.assign + saveSettings() pattern.
	 */
	async saveGroupFull(group: Group): Promise<void> {
		const idx = this.settings.groups.findIndex(g => g.id === group.id);
		if (idx !== -1) {
			Object.assign(this.settings.groups[idx], group);
		} else {
			this.settings.groups.push({ ...group });
		}
		await this.saveSettings();
		await this.saveGroupToFile(group);
		this.emitGroupsChanged?.();
	}

	/**
	 * Scan the vault's Groups folder for group files and rebuild the in-memory cache.
	 * Handles external edits to group files made outside of the plugin.
	 */
	async syncGroupsFromVault(): Promise<void> {
		try {
			const groupFolder = normalizePath(this.getEntityFolder('group'));
			const groupFiles = this.app.vault
				.getMarkdownFiles()
				.filter(f => normalizePath(f.path).startsWith(`${groupFolder}/`));
			if (groupFiles.length === 0) return;

			let changed = false;
			const seenIds = new Set<string>();
			for (const file of groupFiles) {
				const cache = this.app.metadataCache.getFileCache(file);
				let fm = cache?.frontmatter as Record<string, any> | undefined;
				if (!fm) {
					try {
						const content = await this.app.vault.cachedRead(file);
						const parsed = parseFrontmatterFromContent(content) as Record<string, any> | undefined;
						if (parsed) {
							fm = parsed;
						}
					} catch (_) {
						// Ignore parse/read errors and continue scanning.
					}
				}
				if (!fm) continue;

				// Legacy compatibility:
				// - storyteller-type may be missing in older notes
				// - id/story-id may be stored under older keys
				const typeValue = String(fm['storyteller-type'] ?? fm['type'] ?? '').toLowerCase().trim();
				const looksLikeGroup =
					typeValue === 'group' ||
					fm['group-type'] !== undefined ||
					Array.isArray(fm['members']) ||
					fm['storyteller-id'] !== undefined ||
					fm['storyteller-story-id'] !== undefined;
				if (!looksLikeGroup) continue;

				let id: string = String(fm['storyteller-id'] ?? fm['id'] ?? '').trim();
				const storyId: string = String(
					fm['storyteller-story-id'] ??
					fm['storyId'] ??
					fm['story-id'] ??
					this.inferStoryIdFromPath(file.path) ??
					this.getActiveStory()?.id ??
					''
				).trim();

				if (!id) {
					id = `group-${file.basename.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
				}
				if (seenIds.has(id)) {
					const suffix = file.basename.toLowerCase().replace(/[^a-z0-9]+/g, '-');
					id = `${id}__${suffix || Date.now().toString(36)}`;
				}
				seenIds.add(id);

				if (!id || !storyId) continue;

				// Parse description/history/etc from markdown sections
				let description = '', history = '', structure = '', goals = '', resources = '';
				try {
					const content = await this.app.vault.cachedRead(file);
					
					const sections = parseSectionsFromMarkdown(content);
					description = sections['Description'] ?? '';
					history     = sections['History']     ?? '';
					structure   = sections['Structure']   ?? '';
					goals       = sections['Goals']       ?? '';
					resources   = sections['Resources']   ?? '';
				} catch (_) {}

				const stripScalar = (value: unknown): string | undefined => this.stripWikiLinkValue(value);
				const stripArray = (value: unknown): string[] | undefined => {
					if (!Array.isArray(value)) return undefined;
					return value
						.map(item => this.stripWikiLinkValue(item))
						.filter((item): item is string => Boolean(item));
				};
				const rawMembers = Array.isArray(fm['members']) ? fm['members'] as Record<string, unknown>[] : [];
				const members = await Promise.all(rawMembers.map(async member => {
					const typeValue = String(member?.['type'] ?? '').trim();
					const memberType: EntityFolderType | null =
						typeValue === 'compendiumEntry'
							? 'compendiumEntry'
							: ['character', 'event', 'location', 'item'].includes(typeValue)
								? typeValue as EntityFolderType
								: null;
					const memberName = stripScalar(member?.['name']);
					const memberId = memberType
						? await this.resolveFrontmatterReferenceId(memberType, member?.['id'], memberName)
						: stripScalar(member?.['id']);
					const resolvedName = memberType
						? await this.resolveFrontmatterReferenceName(memberType, member?.['id'], memberName)
						: memberName;
					const cleanedMember: Record<string, unknown> = { ...member };
					if (memberId) cleanedMember['id'] = memberId;
					if (resolvedName) cleanedMember['name'] = resolvedName;
					return cleanedMember;
				}));
				const groupRelationships = Array.isArray(fm['group-relationships'])
					? (fm['group-relationships'] as Record<string, unknown>[]).map(rel => ({
						...rel,
						groupName: stripScalar(rel?.['groupName']) ?? rel?.['groupName'],
					}))
					: undefined;

				const fromFile: Group = {
					id,
					storyId,
					name:               stripScalar(fm['name']) ?? file.basename,
					color:              fm['color'],
					groupType:          fm['group-type'],
					tags:               fm['tags']               ?? [],
					profileImagePath:   fm['profile-image'],
					strength:           fm['strength'],
					status:             fm['status'],
					emblem:             fm['emblem'],
					motto:              fm['motto'],
					militaryPower:      fm['military-power'],
					economicPower:      fm['economic-power'],
					politicalInfluence: fm['political-influence'],
					colors:             fm['colors'],
					territories:        stripArray(fm['territories']),
					linkedEvents:       stripArray(fm['linked-events']),
					linkedCulture:      stripScalar(fm['linked-culture']),
					parentGroup:        stripScalar(fm['parent-group']),
					subgroups:          stripArray(fm['subgroups']),
					members:            members as any,
					groupRelationships: groupRelationships as any,
					connections:        fm['connections'],
					customFields:       fm['custom-fields'],
					description,
					history,
					structure,
					goals,
					resources,
				};

				const idx = this.settings.groups.findIndex(g => g.id === id);
				if (idx !== -1) {
					Object.assign(this.settings.groups[idx], fromFile);
					changed = true;
				} else {
					this.settings.groups.push(fromFile);
					changed = true;
				}
			}

			if (changed) {
				this.invalidateFrontmatterReferenceIndexes();
				await this.saveSettings();
				this.emitGroupsChanged?.();
			}
		} catch (err) {
			console.error('[syncGroupsFromVault] Error syncing groups from vault:', err);
		}
	}

	/**
	 * Migrate all existing settings.groups to vault markdown files (one-time, idempotent).
	 */
	async migrateGroupsToVault(): Promise<void> {
		if (!this.settings.groups || this.settings.groups.length === 0) return;
		for (const group of this.settings.groups) {
			await this.saveGroupToFile(group);
		}
	}

	/**
	 * Remove a group id from all entities (used when deleting a group)
	 */
	private async removeGroupIdFromAllEntities(groupId: string): Promise<void> {
		// Remove from characters
		const characters = await this.listCharacters();
		for (const character of characters) {
			if (character.groups && character.groups.includes(groupId)) {
				character.groups = character.groups.filter(gid => gid !== groupId);
				await this.saveCharacter(character);
			}
		}
		// Remove from locations
		const locations = await this.listLocations();
		for (const location of locations) {
			if (location.groups && location.groups.includes(groupId)) {
				location.groups = location.groups.filter(gid => gid !== groupId);
				await this.saveLocation(location);
			}
		}
		// Remove from events
		const events = await this.listEvents();
		for (const event of events) {
			if (event.groups && event.groups.includes(groupId)) {
				event.groups = event.groups.filter(gid => gid !== groupId);
				await this.saveEvent(event);
			}
		}
		// Remove from items
		const items = await this.listPlotItems();
		for (const item of items) {
			if (item.groups && item.groups.includes(groupId)) {
				item.groups = item.groups.filter(gid => gid !== groupId);
				await this.savePlotItem(item);
			}
		}
	}

	/**
	 * Add a group id to an entity's groups array
	 */
    async addGroupIdToEntity(type: 'character' | 'event' | 'location' | 'item' | 'compendiumEntry', id: string, groupId: string): Promise<void> {
        if (type === 'character') {
            const characters = await this.listCharacters();
            const character = characters.find(c => (c.id || c.name) === id);
            if (character) {
                if (!character.groups) character.groups = [];
                if (!character.groups.includes(groupId)) {
                    character.groups.push(groupId);
                    await this.saveCharacter(character);
                }
            }
        } else if (type === 'location') {
            const locations = await this.listLocations();
            const location = locations.find(l => (l.id || l.name) === id);
            if (location) {
                if (!location.groups) location.groups = [];
                if (!location.groups.includes(groupId)) {
                    location.groups.push(groupId);
                    await this.saveLocation(location);
                }
            }
        } else if (type === 'event') {
            const events = await this.listEvents();
            const event = events.find(e => (e.id || e.name) === id);
            if (event) {
                if (!event.groups) event.groups = [];
                if (!event.groups.includes(groupId)) {
                    event.groups.push(groupId);
                    await this.saveEvent(event);
                }
            }
        }
        else if (type === 'item') {
            const items = await this.listPlotItems();
            const item = items.find(i => (i.id || i.name) === id);
            if (item) {
                if (!item.groups) item.groups = [];
                if (!item.groups.includes(groupId)) {
                    item.groups.push(groupId);
                    await this.savePlotItem(item);
                }
            }
        } else if (type === 'compendiumEntry') {
            const entries = await this.listCompendiumEntries();
            const entry = entries.find(e => (e.id || e.name) === id);
            if (entry) {
                if (!entry.groups) entry.groups = [];
                if (!entry.groups.includes(groupId)) {
                    entry.groups.push(groupId);
                    await this.saveCompendiumEntry(entry);
                }
            }
        }
    }

	/**
	 * Remove a group id from an entity's groups array
	 */
    private async removeGroupIdFromEntity(type: 'character' | 'event' | 'location' | 'item' | 'compendiumEntry', id: string, groupId: string): Promise<void> {
        if (type === 'character') {
            const characters = await this.listCharacters();
            const character = characters.find(c => (c.id || c.name) === id);
            if (character && character.groups && character.groups.includes(groupId)) {
                character.groups = character.groups.filter(gid => gid !== groupId);
                await this.saveCharacter(character);
            }
        } else if (type === 'location') {
            const locations = await this.listLocations();
            const location = locations.find(l => (l.id || l.name) === id);
            if (location && location.groups && location.groups.includes(groupId)) {
                location.groups = location.groups.filter(gid => gid !== groupId);
                await this.saveLocation(location);
            }
        } else if (type === 'event') {
            const events = await this.listEvents();
            const event = events.find(e => (e.id || e.name) === id);
            if (event && event.groups && event.groups.includes(groupId)) {
                event.groups = event.groups.filter(gid => gid !== groupId);
                await this.saveEvent(event);
            }
        }
         else if (type === 'item') {
            const items = await this.listPlotItems();
            const item = items.find(i => (i.id || i.name) === id);
            if (item && item.groups && item.groups.includes(groupId)) {
                item.groups = item.groups.filter(gid => gid !== groupId);
                await this.savePlotItem(item);
            }
        } else if (type === 'compendiumEntry') {
            const entries = await this.listCompendiumEntries();
            const entry = entries.find(e => (e.id || e.name) === id);
            if (entry && entry.groups && entry.groups.includes(groupId)) {
                entry.groups = entry.groups.filter(gid => gid !== groupId);
                await this.saveCompendiumEntry(entry);
            }
        }
    }

	/**
	 * Settings Management
	 * Methods for loading and saving plugin configuration
	 */

	/**
	 * Load plugin settings from Obsidian's data store
	 * Merges with defaults for missing settings (backward compatibility)
	 * Adds migration logic for multi-story support
	 */
    private isRelevantFile(filePath: string): boolean {
        try {
            const charFolder = this.getEntityFolder('character');
            const locFolder = this.getEntityFolder('location');
            const evtFolder = this.getEntityFolder('event');
            const itemFolder = this.getEntityFolder('item'); // Add this
            const refFolder = this.getEntityFolder('reference');
            const chapterFolder = this.getEntityFolder('chapter');
            const sceneFolder = this.getEntityFolder('scene');
            return filePath.startsWith(charFolder + '/') ||
                filePath.startsWith(locFolder + '/') ||
                filePath.startsWith(evtFolder + '/') ||
                filePath.startsWith(itemFolder + '/') || // Add this
                filePath.startsWith(refFolder + '/') ||
                filePath.startsWith(chapterFolder + '/') ||
                filePath.startsWith(sceneFolder + '/') ||
                filePath.startsWith(this.settings.galleryUploadFolder + '/');
        } catch {
            return false;
        }
    }
    private normalizeEntityRefLookupValue(value: unknown): string {
        if (typeof value !== 'string') return '';
        return value.replace(/^\[\[|\]\]$/g, '').trim().toLowerCase();
    }

    private normalizeEntityRefType(value: unknown): string {
        const raw = this.normalizeEntityRefLookupValue(value);
        if (raw === 'magicsystem') return 'magicsystem';
        if (raw === 'compendiumentry') return 'compendiumentry';
        return raw;
    }

    private async buildEntityRefLookup(): Promise<Map<string, Map<string, { id?: string; name?: string }>>> {
        const lookup = new Map<string, Map<string, { id?: string; name?: string }>>();
        const register = (type: string, entities: Array<{ id?: string; name?: string }>) => {
            const bucket = new Map<string, { id?: string; name?: string }>();
            for (const entity of entities) {
                const idKey = this.normalizeEntityRefLookupValue(entity.id);
                const nameKey = this.normalizeEntityRefLookupValue(entity.name);
                if (idKey) bucket.set(idKey, entity);
                if (nameKey) bucket.set(nameKey, entity);
            }
            lookup.set(type, bucket);
        };

        register('character', await this.listCharacters());
        register('location', await this.listLocations());
        register('event', await this.listEvents());
        register('item', await this.listPlotItems());
        register('scene', await this.listScenes());
        register('culture', await this.listCultures());
        register('economy', await this.listEconomies());
        register('group', this.getGroups());
        register('reference', await this.listReferences());
        register('magicsystem', await this.listMagicSystems());
        register('compendiumentry', await this.listCompendiumEntries());

        return lookup;
    }

    async repairLocationEntityRefs(): Promise<number> {
        try {
            const locations = await this.listLocations();
            if (locations.length === 0) return 0;

            const lookup = await this.buildEntityRefLookup();
            let updatedCount = 0;

            for (const location of locations) {
                const refs = Array.isArray(location.entityRefs) ? location.entityRefs : [];
                if (refs.length === 0) continue;

                let changed = false;
                const seenRefs = new Set<string>();
                const repairedRefs = refs.flatMap((ref: any) => {
                    const typeKey = this.normalizeEntityRefType(ref?.entityType);
                    const bucket = lookup.get(typeKey);
                    if (!bucket) return [ref];

                    const resolved = bucket.get(this.normalizeEntityRefLookupValue(ref?.entityId))
                        || bucket.get(this.normalizeEntityRefLookupValue(ref?.entityName));

                    if (!resolved) {
                        changed = true;
                        return [];
                    }

                    const nextId = resolved.id || ref.entityId || resolved.name;
                    const nextName = resolved.name || ref.entityName || ref.entityId;
                    const dedupeKey = `${typeKey}:${this.normalizeEntityRefLookupValue(nextId || nextName)}`;

                    if (seenRefs.has(dedupeKey)) {
                        changed = true;
                        return [];
                    }
                    seenRefs.add(dedupeKey);

                    if (ref.entityId !== nextId || ref.entityName !== nextName) {
                        changed = true;
                        return [{ ...ref, entityId: nextId, entityName: nextName }];
                    }

                    return [ref];
                });

                if (changed) {
                    location.entityRefs = repairedRefs as any;
                    await this.saveLocation(location);
                    updatedCount += 1;
                }
            }

            return updatedCount;
        } catch (error) {
            console.error('[repairLocationEntityRefs] Error repairing location entityRefs:', error);
            return 0;
        }
    }

    async backfillEntityTypeFrontmatter(): Promise<number> {
        const entityTypes: EntityFolderType[] = [
            'character',
            'location',
            'event',
            'item',
            'reference',
            'chapter',
            'scene',
            'map',
            'culture',
            'faction',
            'economy',
            'magicSystem',
            'compendiumEntry',
            'book',
            'campaignSession',
        ];

        const updatedPaths = new Set<string>();
        let updatedCount = 0;

        for (const entityType of entityTypes) {
            let scanPaths: string[] = [];
            try {
                scanPaths = await this.getReferenceScanPaths(entityType);
            } catch {
                continue;
            }

            const normalizedPrefixes = scanPaths
                .map(path => normalizePath(path))
                .filter(Boolean)
                .map(path => `${path}/`);

            const files = this.app.vault.getMarkdownFiles().filter(file =>
                normalizedPrefixes.some(prefix => file.path.startsWith(prefix))
            );

            for (const file of files) {
                if (updatedPaths.has(file.path)) continue;

                let content: string;
                try {
                    content = await this.app.vault.cachedRead(file);
                } catch {
                    continue;
                }

                const existingFrontmatter = parseFrontmatterFromContent(content) || {};
                if (normalizeEntityType(existingFrontmatter['entityType'])) continue;

                const stampedFrontmatter = { ...existingFrontmatter, entityType };
                const frontmatterString = stringifyYamlWithLogging(
                    stampedFrontmatter,
                    existingFrontmatter,
                    `Entity type backfill: ${file.path}`
                );

                const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
                const nextContent = `---\n${frontmatterString}---\n\n${body.replace(/^\r?\n+/, '')}`;

                await this.app.vault.modify(file, nextContent);
                updatedPaths.add(file.path);
                updatedCount += 1;
            }
        }

        return updatedCount;
    }
	async loadSettings() {
		// Load old settings if present
		const loaded = await this.loadData();
        const isFreshInstall = !loaded || Object.keys(loaded).length === 0;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		let settingsUpdated = false;

        // First-run sanitization: if dev/test stories leaked in but the vault has no content, clear them
        try {
            if (!this.settings.sanitizedSeedData) {
                const lowerNames = (this.settings.stories || []).map(s => (s.name || '').toLowerCase());
                const hasSeedNames = lowerNames.some(n => n.includes('test') || /\bmy\s*story\s*1\b/i.test(n));
                if ((this.settings.stories?.length || 0) > 0 && hasSeedNames) {
                    // Determine if there are any entity markdown files under resolved folders
                    const allMd = this.app.vault.getMarkdownFiles();
                    const resolved = this.getFolderResolver().resolveAll();
                    const prefixes: string[] = Object.values(resolved)
                        .map(v => (v as any).path as string | undefined)
                        .filter((p): p is string => !!p)
                        .map(p => normalizePath(p) + '/');
                    const anyEntityFiles = allMd.some(f => prefixes.some(pref => f.path.startsWith(pref)));
                    if (!anyEntityFiles) {
                        // Clear leaked stories and reset active story
                        this.settings.stories = [];
                        this.settings.activeStoryId = '';
                        this.settings.sanitizedSeedData = true;
                        settingsUpdated = true;
                    } else {
                        // Mark checked to avoid repeated work
                        this.settings.sanitizedSeedData = true;
                        settingsUpdated = true;
                    }
                } else if (!this.settings.sanitizedSeedData) {
                    // Mark sanitized flag to avoid re-check overhead if nothing to sanitize
                    this.settings.sanitizedSeedData = true;
                    settingsUpdated = true;
                }
            }
        } catch (e) {
            // Best-effort sanitization; ignore errors
            console.warn('Storyteller Suite: Seed data sanitization skipped due to error', e);
        }

		// MIGRATION: If no stories exist but old folders/data exist, migrate
		if ((!this.settings.stories || this.settings.stories.length === 0)) {
			// Try to detect old folders with data
			const vault = this.app.vault;
			const oldCharacterFolder = loaded?.characterFolder || 'StorytellerSuite/Characters';
			const oldLocationFolder = loaded?.locationFolder || 'StorytellerSuite/Locations';
			const oldEventFolder = loaded?.eventFolder || 'StorytellerSuite/Events';
			// Check if any files exist in these folders
			const hasOldData = vault.getMarkdownFiles().some(f =>
				f.path.startsWith(oldCharacterFolder + '/') ||
				f.path.startsWith(oldLocationFolder + '/') ||
				f.path.startsWith(oldEventFolder + '/')
			);
			if (hasOldData) {
				// Create default story
				const defaultName = 'My First Story';
				const story = await this.createStory(defaultName, 'Migrated from previous version');
				// Move files from old folders to new story folders
				const moveFiles = async (oldFolder: string, type: 'character'|'location'|'event') => {
					const files = vault.getMarkdownFiles().filter(f => f.path.startsWith(oldFolder + '/'));
					for (const file of files) {
						const newFolder = this.getEntityFolder(type);
						const newPath = `${newFolder}/${file.name}`;
						await this.ensureFolder(newFolder);
						await this.app.fileManager.renameFile(file, newPath);
					}
				};
				await moveFiles(oldCharacterFolder, 'character');
				await moveFiles(oldLocationFolder, 'location');
				await moveFiles(oldEventFolder, 'event');
				this.settings.activeStoryId = story.id;
				settingsUpdated = true;
			}
		}

		// Note: Story discovery now happens after workspace is ready (see discoverExistingStories method)
		// This ensures the vault file system is fully available before scanning for folders
		
		// MIGRATION: Handle existing groups that don't have storyId
		if (this.settings.groups && this.settings.groups.length > 0) {
			const groupsWithoutStoryId = this.settings.groups.filter(group => !('storyId' in group));
			if (groupsWithoutStoryId.length > 0) {
				// Assign existing groups to the active story or first available story
				const targetStoryId = this.settings.activeStoryId || 
					(this.settings.stories.length > 0 ? this.settings.stories[0].id : null);
				
				if (targetStoryId) {
					for (const group of groupsWithoutStoryId) {
						(group as any).storyId = targetStoryId;
					}
					settingsUpdated = true;
				}
			}
		}
		
		// Ensure backward compatibility for new settings
        if (!this.settings.galleryUploadFolder) {
			this.settings.galleryUploadFolder = DEFAULT_SETTINGS.galleryUploadFolder;
			settingsUpdated = true;
		}
		if (!this.settings.galleryData) {
			this.settings.galleryData = DEFAULT_SETTINGS.galleryData;
			settingsUpdated = true;
		}
        // Defaults for newly added settings (backward-compatible)
        if (this.settings.enableCustomEntityFolders === undefined) {
            this.settings.enableCustomEntityFolders = DEFAULT_SETTINGS.enableCustomEntityFolders;
            settingsUpdated = true;
        }
        if (this.settings.enableOneStoryMode === undefined) {
            this.settings.enableOneStoryMode = DEFAULT_SETTINGS.enableOneStoryMode;
            settingsUpdated = true;
        }
        if (!('oneStoryBaseFolder' in this.settings) || !this.settings.oneStoryBaseFolder) {
            this.settings.oneStoryBaseFolder = DEFAULT_SETTINGS.oneStoryBaseFolder;
            settingsUpdated = true;
        }
        if (!('characterFolderPath' in this.settings)) { this.settings.characterFolderPath = DEFAULT_SETTINGS.characterFolderPath; settingsUpdated = true; }
        if (!('locationFolderPath' in this.settings)) { this.settings.locationFolderPath = DEFAULT_SETTINGS.locationFolderPath; settingsUpdated = true; }
        if (!('eventFolderPath' in this.settings)) { this.settings.eventFolderPath = DEFAULT_SETTINGS.eventFolderPath; settingsUpdated = true; }
        if (!('itemFolderPath' in this.settings)) { this.settings.itemFolderPath = DEFAULT_SETTINGS.itemFolderPath; settingsUpdated = true; }
        if (!('referenceFolderPath' in this.settings)) { (this.settings as any).referenceFolderPath = DEFAULT_SETTINGS.referenceFolderPath as any; settingsUpdated = true; }
        if (!('chapterFolderPath' in this.settings)) { (this.settings as any).chapterFolderPath = DEFAULT_SETTINGS.chapterFolderPath as any; settingsUpdated = true; }
        if (!('sceneFolderPath' in this.settings)) { (this.settings as any).sceneFolderPath = DEFAULT_SETTINGS.sceneFolderPath as any; settingsUpdated = true; }
        if (!('groupFolderPath' in this.settings)) { this.settings.groupFolderPath = DEFAULT_SETTINGS.groupFolderPath; settingsUpdated = true; }
        if (!('bookFolderPath' in this.settings)) { this.settings.bookFolderPath = DEFAULT_SETTINGS.bookFolderPath; settingsUpdated = true; }
        if (!('sessionsFolderPath' in this.settings)) { this.settings.sessionsFolderPath = DEFAULT_SETTINGS.sessionsFolderPath; settingsUpdated = true; }
        if (!('compileWorkflows' in this.settings) || !Array.isArray(this.settings.compileWorkflows)) {
            this.settings.compileWorkflows = [];
            settingsUpdated = true;
        }
        if (!('customCompileSteps' in this.settings) || !Array.isArray(this.settings.customCompileSteps)) {
            this.settings.customCompileSteps = [];
            settingsUpdated = true;
        }
        if (!this.settings.defaultCompileWorkflow || this.settings.defaultCompileWorkflow === 'Default Workflow') {
            this.settings.defaultCompileWorkflow = DEFAULT_SETTINGS.defaultCompileWorkflow;
            settingsUpdated = true;
        }
        if (Array.isArray(this.settings.storyDrafts)) {
            for (const draft of this.settings.storyDrafts) {
                if (draft.workflow === 'Default Workflow') {
                    draft.workflow = DEFAULT_SETTINGS.defaultCompileWorkflow;
                    settingsUpdated = true;
                }
            }
        }
        if (!this.settings.groups) {
            this.settings.groups = [];
            settingsUpdated = true;
        }
        // Ensure language setting exists for backward compatibility
        if (!this.settings.language) {
            this.settings.language = DEFAULT_SETTINGS.language;
            settingsUpdated = true;
        }
        if (!('hasCompletedOnboarding' in this.settings)) {
            this.settings.hasCompletedOnboarding = !isFreshInstall;
            settingsUpdated = true;
        }
        if (!('lastSeenReleaseNotesVersion' in this.settings) || typeof this.settings.lastSeenReleaseNotesVersion !== 'string') {
            this.settings.lastSeenReleaseNotesVersion = isFreshInstall ? this.manifest.version : '';
            settingsUpdated = true;
        }
        if (!('staleEntityRefsPrunedVersion' in this.settings) || typeof this.settings.staleEntityRefsPrunedVersion !== 'string') {
            this.settings.staleEntityRefsPrunedVersion = '';
            settingsUpdated = true;
        }
        if (!('entityTypeBackfilledVersion' in this.settings) || typeof this.settings.entityTypeBackfilledVersion !== 'string') {
            this.settings.entityTypeBackfilledVersion = '';
            settingsUpdated = true;
        }
        // Ensure new optional fields exist on groups for backward compatibility
        if (this.settings.groups.length > 0) {
            for (const g of this.settings.groups) {
                if (!('tags' in (g as any))) (g as any).tags = [];
                // profileImagePath may be undefined; leave as-is if missing
            }
        }

		if(settingsUpdated){
			await this.saveSettings();
		}

	}

    openGettingStartedGuide(): void {
        new StorytellerGuideModal(this.app, this, 'getting-started').open();
    }

    openWhatsNewGuide(): void {
        new StorytellerGuideModal(this.app, this, 'whats-new').open();
    }

    private scheduleDeferredStartupMaintenance(delayMs = 1200): void {
        if (this.deferredStartupMaintenanceTimer !== null) {
            window.clearTimeout(this.deferredStartupMaintenanceTimer);
        }

        this.deferredStartupMaintenanceTimer = window.setTimeout(() => {
            this.deferredStartupMaintenanceTimer = null;
            void this.runDeferredStartupMaintenance();
        }, delayMs);
    }

    private async runDeferredStartupMaintenance(): Promise<void> {
        try {
            const beforeCount = this.templateManager.getAllTemplates().filter(t => (t as any).isNoteBased).length;
            await this.templateNoteManager.initialize();
            const afterCount = this.templateManager.getAllTemplates().filter(t => (t as any).isNoteBased).length;
            if (afterCount > beforeCount) {
                console.log(`[StorytellerSuite] Loaded ${afterCount - beforeCount} custom templates after startup`);
            }
        } catch (error) {
            console.error('[StorytellerSuite] Error loading custom templates:', error);
        }

        try {
            await this.syncGalleryWatchFolder();
        } catch (error) {
            console.error('[StorytellerSuite] Error syncing gallery folder during deferred startup:', error);
        }

        try {
            await this.migrateGroupsToVault();
            await this.syncGroupsFromVault();
        } catch (error) {
            console.error('[StorytellerSuite] Error syncing groups during deferred startup:', error);
        }

        try {
            if (!this.settings.relationshipsMigrated) {
                await this.migrateRelationshipsToTyped();
                this.settings.relationshipsMigrated = true;
                await this.saveSettings();
            }
        } catch (error) {
            console.error('[StorytellerSuite] Error migrating relationships during deferred startup:', error);
        }

        try {
            if (!this.settings.bidirectionalLinksBackfilled) {
                await this.backfillBidirectionalRelationships();
                this.settings.bidirectionalLinksBackfilled = true;
                await this.saveSettings();
            }
        } catch (error) {
            console.error('[StorytellerSuite] Error backfilling bidirectional links during deferred startup:', error);
        }

        try {
            if (this.settings.staleEntityRefsPrunedVersion !== this.manifest.version) {
                await this.repairLocationEntityRefs();
                this.settings.staleEntityRefsPrunedVersion = this.manifest.version;
                await this.saveSettings();
            }
        } catch (error) {
            console.error('[StorytellerSuite] Error repairing stale entity refs during deferred startup:', error);
        }

        try {
            if (this.settings.entityTypeBackfilledVersion !== this.manifest.version) {
                await this.backfillEntityTypeFrontmatter();
                this.settings.entityTypeBackfilledVersion = this.manifest.version;
                await this.saveSettings();
            }
        } catch (error) {
            console.error('[StorytellerSuite] Error backfilling entity type frontmatter during deferred startup:', error);
        }
    }

    private async maybeShowStartupGuides(): Promise<void> {
        if (!this.settings.hasCompletedOnboarding) {
            this.settings.hasCompletedOnboarding = true;
            this.settings.lastSeenReleaseNotesVersion = this.manifest.version;
            await this.saveSettings();

            window.setTimeout(() => {
                this.openGettingStartedGuide();
            }, 350);
            return;
        }

        if (this.settings.lastSeenReleaseNotesVersion === this.manifest.version) {
            return;
        }

        this.settings.lastSeenReleaseNotesVersion = this.manifest.version;
        await this.saveSettings();

        window.setTimeout(() => {
            this.openWhatsNewGuide();
        }, 450);
    }

  /**
   * Lightweight event to notify views when groups have changed without relying on vault events
   */
  emitGroupsChanged(): void {
    try {
      this.app.workspace.trigger('storyteller:groups-changed');
      // Ping the dashboard view to refresh if the groups tab is active
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
      const view: any = leaves[0]?.view;
      if (view && view.activeTabId === 'groups' && typeof view.refreshActiveTab === 'function') {
        view.refreshActiveTab();
      }
    } catch (e) {
      // no-op
    }
  }

	/**
	 * Apply template with variable collection
	 * Opens modal to collect variable values if template has variables,
	 * then applies the template to the current story
	 */
	async applyTemplateWithPrompt(
		template: Template,
		options?: Partial<TemplateApplicationOptions>
	): Promise<void> {
		console.log('applyTemplateWithPrompt called with template:', template.name);

		// Ensure we have an active story
		const activeStory = this.getActiveStory();
		console.log('Active story:', activeStory);

		if (!activeStory) {
			new Notice('Please select or create a story first');
			return;
		}

		// Always show modal for entity naming (and variable collection if needed)
		const { TemplateApplicationModal } = await import('./modals/TemplateApplicationModal');

			new TemplateApplicationModal(
				this.app,
				this,
				template,
				async (variableValues: any, entityFileNames: any[]) => {
					console.log('Variable values collected:', variableValues);
					console.log('Entity file names:', entityFileNames);
					
					// Build field overrides from entity file names (file name becomes entity name)
					const fieldOverrides = new Map<string, Partial<any>>();
					entityFileNames.forEach(entityInfo => {
						const override: Partial<any> = {};
						if (entityInfo.fileName) {
							override.name = entityInfo.fileName;
						}
						if (Object.keys(override).length > 0) {
							fieldOverrides.set(entityInfo.templateId, override);
						}
					});

				// Apply template with variable values and field overrides
				await this.applyTemplateInternal(
					template,
					activeStory.id,
					variableValues,
					{ ...options, fieldOverrides }
				);
			}
		).open();
	}

	/**
	 * Internal method to apply template with variable values
	 */
	private async applyTemplateInternal(
		template: Template,
		storyId: string,
		variableValues: Record<string, any>,
		additionalOptions?: Partial<TemplateApplicationOptions>
	): Promise<void> {
		console.log('applyTemplateInternal called:', { templateName: template.name, storyId, variableValues });

		try {
			const { TemplateApplicator } = await import('./templates/TemplateApplicator');

			const applicator = new TemplateApplicator(this);

			const options: TemplateApplicationOptions = {
				storyId,
				mode: 'merge',
				variableValues,
				...additionalOptions
			};

			console.log('Applying template with options:', options);
			const result = await applicator.applyTemplate(template, options);
			console.log('Template application result:', result);

			if (result.success) {
				const entityCount = this.countCreatedEntities(result.created);
				console.log('Template applied successfully, created entities:', entityCount);
				new Notice(`Template "${template.name}" applied successfully! Created ${entityCount} entities.`);

				// Refresh views if needed
				this.app.workspace.trigger('storyteller:entities-changed');
			} else {
				console.error('Template application failed:', result.error);
				new Notice(`Failed to apply template: ${result.error || 'Unknown error'}`);
			}
		} catch (error) {
			console.error('Error applying template:', error);
			new Notice(`Error applying template: ${error.message}`);
		}
	}

	/**
	 * Count total entities created from template application
	 */
	private countCreatedEntities(created: TemplateApplicationResult['created']): number {
		let count = 0;
		count += created.characters.length;
		count += created.locations.length;
		count += created.events.length;
		count += created.items.length;
		count += created.groups.length;
		count += created.cultures.length;
		count += created.economies.length;
		count += created.magicSystems.length;
		count += created.chapters.length;
		count += created.scenes.length;
		count += created.references.length;
		return count;
	}

	/**
	 * Save current plugin settings to Obsidian's data store
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Applies mobile-specific CSS classes to the document body
	 * This allows for platform-specific styling throughout the app
	 */
	private applyMobilePlatformClasses(): void {
		const body = document.body;
		if (!body) {
			console.warn('Storyteller Suite: document.body is null, cannot apply mobile platform classes');
			return;
		}

		const mobileClasses = PlatformUtils.getMobileCssClasses();
		
		// Remove any existing platform classes first
		body.classList.remove('is-mobile', 'is-ios', 'is-android', 'is-desktop');
		
		// Add current platform classes
		mobileClasses.forEach(className => {
			body.classList.add(className);
		});

		// Add Storyteller Suite specific mobile class
		if (PlatformUtils.isMobile()) {
			body.classList.add('storyteller-mobile-enabled');
		}
	}

	/**
	 * Removes mobile-specific CSS classes from the document body
	 * Used during plugin cleanup to prevent class leakage
	 */
	private removeMobilePlatformClasses(): void {
		const body = document.body;
		if (!body) {
			console.warn('Storyteller Suite: document.body is null, cannot remove mobile platform classes');
			return;
		}

		try {
			// Only remove Storyteller Suite specific class
			// Leave platform classes (is-mobile, is-ios, etc.) as they may be used by Obsidian core or other plugins
			if (body.classList.contains('storyteller-mobile-enabled')) {
				body.classList.remove('storyteller-mobile-enabled');
			}
		} catch (error) {
			// Silently fail to prevent plugin unload from being blocked
			console.error('Storyteller Suite: Error removing mobile classes', error);
		}
	}

	/**
	 * Sets up orientation change and resize event listeners for mobile/tablet devices
	 * This ensures maps and modals properly resize when device orientation changes
	 */
	private setupMobileOrientationHandlers(): void {
		// Only set up handlers on mobile/tablet devices
		if (!PlatformUtils.isMobile()) {
			return;
		}

		// Create handler for orientation changes and window resize
		const handleOrientationChange = () => {
			// Removed: Codeblock maps no longer supported
			// Invalidate all Leaflet map sizes to force recalculation
			// if (this.leafletProcessor) {
			// 	this.leafletProcessor.invalidateAllMapSizes();
			// }

			// Trigger a layout recalculation for open views
			this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE).forEach(leaf => {
				if (leaf.view instanceof TimelineView) {
					// Timeline view may need to redraw after orientation change
					leaf.view.refresh();
				}
			});

			// Force reflow to apply new CSS media query styles
			document.body.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
		};

		// Debounced resize handler to avoid excessive recalculations
		let resizeTimeout: NodeJS.Timeout | null = null;
		const handleResize = () => {
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}
			resizeTimeout = setTimeout(() => {
				handleOrientationChange();
			}, 150); // 150ms debounce
		};

		// Store handlers for cleanup
		this.orientationChangeHandler = handleOrientationChange;
		this.resizeHandler = handleResize;

		// Listen for orientation changes (mobile/tablet specific)
		window.addEventListener('orientationchange', this.orientationChangeHandler);

		// Also listen for window resize (works on all devices, including tablets in split-screen)
		window.addEventListener('resize', this.resizeHandler);
	}

	/**
	 * Removes orientation change and resize event listeners
	 * Called during plugin cleanup
	 */
	private cleanupMobileOrientationHandlers(): void {
		if (this.orientationChangeHandler) {
			window.removeEventListener('orientationchange', this.orientationChangeHandler);
			this.orientationChangeHandler = null;
		}

		if (this.resizeHandler) {
			window.removeEventListener('resize', this.resizeHandler);
			this.resizeHandler = null;
		}
	}
}

// Ensure this is the very last line of the file
export {};

