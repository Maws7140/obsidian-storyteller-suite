/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable @typescript-eslint/no-unused-vars */

// Import Leaflet CSS and JS so esbuild can bundle it properly
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';

// Expose Leaflet to the global scope so plugins can use it
(window as any).L = L;

// Now import Leaflet plugins (they expect window.L to exist)
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw/dist/leaflet.draw';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { App, Notice, Plugin, TFile, TFolder, normalizePath, stringifyYaml, WorkspaceLeaf } from 'obsidian';
import { parseEventDate, toMillis } from './utils/DateParsing';
import { buildFrontmatter, getWhitelistKeys, parseSectionsFromMarkdown } from './yaml/EntitySections';
import { stringifyYamlWithLogging, validateFrontmatterPreservation } from './utils/YamlSerializer';
import { setLocale, t } from './i18n/strings';
import { FolderResolver, FolderResolverOptions } from './folders/FolderResolver';
import { PromptModal } from './modals/ui/PromptModal';
import { ConfirmModal } from './modals/ui/ConfirmModal';
import { CharacterModal } from './modals/CharacterModal';
import {
    Character, Location, Event, GalleryImage, GalleryData, Story, Group, PlotItem, Reference, Chapter, Scene,
    Culture, Economy, MagicSystem,
    TimelineFork, CausalityLink, TimelineConflict, TimelineEra, TimelineTrack,
    PacingAnalysis, WritingSession, StoryAnalytics, LocationSensoryProfile
    /* DEPRECATED: Map as StoryMap */
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
import { PlatformUtils } from './utils/PlatformUtils';
import { getTemplateSections } from './utils/EntityTemplates';
import { LeafletCodeBlockProcessor } from './leaflet/processor';
import { TemplateStorageManager } from './templates/TemplateStorageManager';
import { StoryTemplateGalleryModal } from './templates/modals/StoryTemplateGalleryModal';
import { TrackManagerModal } from './modals/TrackManagerModal';
import { EraManagerModal } from './modals/EraManagerModal';
import { ConflictViewModal } from './modals/ConflictViewModal';
import { TagTimelineModal } from './modals/TagTimelineModal';
import { ConflictDetector } from './utils/ConflictDetector';
import { TimelineTrackManager } from './utils/TimelineTrackManager';
import { EraManager } from './utils/EraManager';

/**
 * Plugin settings interface defining all configurable options
 * These settings are persisted in Obsidian's data.json file
 */
 interface StorytellerSuiteSettings {
    stories: Story[]; // List of all stories
    activeStoryId: string; // Currently selected story
    galleryUploadFolder: string; // New setting for uploads
    galleryData: GalleryData; // Store gallery metadata here
    /** Array of all user-defined groups (story-specific) */
    groups: Group[];
    /** Whether to show the tutorial section in settings */
    showTutorial: boolean;
    /** UI language setting */
    language: 'en' | 'zh';
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
     defaultTimelineGroupMode?: 'none' | 'location' | 'group';
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

    /** Timeline tracks for multi-track visualization */
    timelineTracks?: TimelineTrack[];
    /** Timeline eras/periods for grouping events */
    timelineEras?: TimelineEra[];
    /** Auto-detect conflicts when saving events (default: true) */
    autoDetectConflicts?: boolean;

    /** Map settings */
    enableFrontmatterMarkers?: boolean;
    enableDataViewMarkers?: boolean;

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

    /** Sensory Profiles */
    enableSensoryProfiles?: boolean;
    sensoryProfiles?: LocationSensoryProfile[];

    /** Dashboard tab visibility - array of tab IDs to hide */
    hiddenDashboardTabs?: string[];

    /** Template system settings */
    templateStorageFolder?: string;
    showBuiltInTemplates?: boolean;
    showCommunityTemplates?: boolean;
}

/**
 * Default plugin settings - used on first install or when settings are missing
 */
 const DEFAULT_SETTINGS: StorytellerSuiteSettings = {
    stories: [],
    activeStoryId: '',
    galleryUploadFolder: 'StorytellerSuite/GalleryUploads',
    galleryData: { images: [] },
    groups: [],
    showTutorial: true,
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
    enableDataViewMarkers: false,
    customFieldsMode: 'flatten',
    relationshipsMigrated: false,
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
    enableSensoryProfiles: true,
    hiddenDashboardTabs: [],
    templateStorageFolder: 'StorytellerSuite/Templates',
    showBuiltInTemplates: true,
    showCommunityTemplates: false
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
    private buildResolver(): FolderResolver {
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
        entityType: 'character' | 'location' | 'event' | 'item',
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
            scene: ['content']
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
        const resolver = this.buildResolver();
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
    private leafletProcessor: LeafletCodeBlockProcessor;
    templateManager: TemplateStorageManager;
    trackManager: TimelineTrackManager;
    eraManager: EraManager;

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
    getEntityFolder(type: 'character' | 'location' | 'event' | 'item' | 'reference' | 'chapter' | 'scene' | 'map' | 'culture' | 'faction' | 'economy' | 'magicSystem' | 'calendar'): string {
        const resolver = this.buildResolver();
        return resolver.getEntityFolder(type);
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

        // Ensure entity folders exist under the current base
        try {
            await this.ensureFolder(this.getEntityFolder('character'));
            await this.ensureFolder(this.getEntityFolder('location'));
            await this.ensureFolder(this.getEntityFolder('event'));
            await this.ensureFolder(this.getEntityFolder('item'));
            await this.ensureFolder(this.getEntityFolder('reference'));
            await this.ensureFolder(this.getEntityFolder('chapter'));
            await this.ensureFolder(this.getEntityFolder('scene'));
        } catch (e) {
            // Best-effort; errors will surface via Notice in ensureFolder
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
        await this.ensureFolder(this.getEntityFolder('character'));
        await this.ensureFolder(this.getEntityFolder('location'));
        await this.ensureFolder(this.getEntityFolder('event'));
        await this.ensureFolder(this.getEntityFolder('item'));
        await this.ensureFolder(this.getEntityFolder('reference'));
        await this.ensureFolder(this.getEntityFolder('chapter'));
        await this.ensureFolder(this.getEntityFolder('scene'));
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
	 * Plugin initialization - called when the plugin is loaded
	 * Registers views, commands, UI elements, and mobile adaptations
	 */
	async onload() {
		await this.loadSettings();

		// Initialize locale from settings
		setLocale(this.settings.language);

		// Initialize template manager
		this.templateManager = new TemplateStorageManager(
			this.app,
			this.settings.templateStorageFolder || 'StorytellerSuite/Templates'
		);
		await this.templateManager.initialize();

		// Initialize timeline managers
		this.trackManager = new TimelineTrackManager(this);
		this.eraManager = new EraManager(this);

		// Initialize default tracks if none exist
		await this.trackManager.initializeDefaultTracks();

		// Apply mobile CSS classes to the document body
		this.applyMobilePlatformClasses();

		// Initialize and register Leaflet code block processor
		this.leafletProcessor = new LeafletCodeBlockProcessor(this);
		this.leafletProcessor.register();

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

		// Register command palette commands
		this.registerCommands();

		// Add settings tab for user configuration
		this.addSettingTab(new StorytellerSuiteSettingTab(this.app, this));


		// Perform story discovery and ensure one-story seeding after workspace is ready
		this.app.workspace.onLayoutReady(async () => {
			await this.discoverExistingStories();
			await this.initializeOneStoryModeIfNeeded();
			
			// Run migration for typed relationships (only runs once)
			if (!this.settings.relationshipsMigrated) {
				await this.migrateRelationshipsToTyped();
				this.settings.relationshipsMigrated = true;
				await this.saveSettings();
			}
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
                    // Ensure folders even if base doesn't exist yet
                    try {
                        await this.ensureFolder(this.getEntityFolder('character'));
                        await this.ensureFolder(this.getEntityFolder('location'));
                        await this.ensureFolder(this.getEntityFolder('event'));
                        await this.ensureFolder(this.getEntityFolder('item'));
                        await this.ensureFolder(this.getEntityFolder('reference'));
                        await this.ensureFolder(this.getEntityFolder('chapter'));
                        await this.ensureFolder(this.getEntityFolder('scene'));
                    } catch {}
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
	 */
	onunload() {
		// Manual cleanup not needed - Obsidian handles view management
		// Clean up mobile platform classes to prevent class leakage
		this.removeMobilePlatformClasses();

		// Cleanup all active maps
		if (this.leafletProcessor) {
			this.leafletProcessor.cleanup();
		}
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
			callback: () => {
				const eras = this.settings.timelineEras || [];
				new EraManagerModal(
					this.app,
					this,
					eras,
					async (updatedEras) => {
						this.settings.timelineEras = updatedEras;
						await this.saveSettings();
					}
				).open();
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
					hideByDefault: true
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

		// View Cultures
		this.addCommand({
			id: 'view-cultures',
			name: 'View cultures',
			callback: async () => {
				const cultures = await this.listCultures();
				new Notice(`${cultures.length} culture(s) found`);
				// TODO: Create CultureListModal for better visualization
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

		// View Economies
		this.addCommand({
			id: 'view-economies',
			name: 'View economies',
			callback: async () => {
				const economies = await this.listEconomies();
				new Notice(`${economies.length} economy/economies found`);
				// TODO: Create EconomyListModal for better visualization
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

		// View Magic Systems
		this.addCommand({
			id: 'view-magic-systems',
			name: 'View magic systems',
			callback: async () => {
				const magicSystems = await this.listMagicSystems();
				new Notice(`${magicSystems.length} magic system(s) found`);
				// TODO: Create MagicSystemListModal for better visualization
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
		// Causality Link Commands
		// ============================================================

		// Create causality link
		this.addCommand({
			id: 'create-causality-link',
			name: 'Add causality link',
			callback: () => {
				if (!this.ensureActiveStoryOrGuide()) return;
				import('./modals/CausalityLinkModal').then(({ CausalityLinkModal }) => {
					new CausalityLinkModal(
						this.app,
						this,
						null,
						async (link) => {
							this.createCausalityLink(
								link.causeEvent,
								link.effectEvent,
								link.linkType as 'direct' | 'indirect' | 'conditional' | 'catalyst',
								link.description || '',
								link.strength
							);
						}
					).open();
				});
			}
		});

		// View causality links
		this.addCommand({
			id: 'view-causality-links',
			name: 'View causality links',
			callback: () => {
				const links = this.getCausalityLinks();
				if (links.length === 0) {
					new Notice('No causality links yet. Create your first link!');
					return;
				}
				new Notice(`${links.length} causality link(s) found`);
				// TODO: Create CausalityLinkListModal for better visualization
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
				const characters = await this.listCharacters();
				const locations = await this.listLocations();
				const causalityLinks = this.getCausalityLinks();

				const { ConflictDetector } = await import('./utils/ConflictDetection');
				const conflicts = ConflictDetector.detectConflicts(
					events,
					characters,
					locations,
					causalityLinks
				);

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
						const characters = await this.listCharacters();
						const locations = await this.listLocations();
						const causalityLinks = this.getCausalityLinks();

						const { ConflictDetector } = await import('./utils/ConflictDetection');
						const newConflicts = ConflictDetector.detectConflicts(
							events,
							characters,
							locations,
							causalityLinks
						);

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
						const characters = await this.listCharacters();
						const locations = await this.listLocations();
						const causalityLinks = this.getCausalityLinks();

						const { ConflictDetector } = await import('./utils/ConflictDetection');
						const newConflicts = ConflictDetector.detectConflicts(
							events,
							characters,
							locations,
							causalityLinks
						);

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

	// DEPRECATED: Map functionality has been deprecated
	/**
	 * Open the map editor view
	 * If a map editor already exists, focuses it and optionally loads a specific map
	 * Otherwise, creates a new map editor view in a panel
	 * @param mapId Optional map ID to load in the editor
	 * @deprecated Map functionality has been deprecated
	 */
	async openMapEditor(mapId?: string): Promise<void> {
		console.warn('DEPRECATED: Map functionality has been deprecated');
		new Notice('Map functionality has been deprecated');
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
                try {
                    await this.app.vault.createFolder(current);
                } catch (error) {
                    // Handle race condition: folder may have been created by another call
                    // Check if folder now exists (created by concurrent call)
                    const existingFolder = this.app.vault.getAbstractFileByPath(current);
                    if (existingFolder instanceof TFolder) {
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
	 * Generic file parser for storytelling entity files
	 * Extracts frontmatter and ALL markdown content sections dynamically
	 * @param file The file to parse
	 * @param typeDefaults Default values for the entity type
	 * @returns Parsed entity data or null if parsing fails
	 */
    async parseFile<T>(
        file: TFile,
        typeDefaults: Partial<T>,
        entityType: 'character' | 'location' | 'event' | 'item' | 'reference' | 'chapter' | 'scene' | 'culture' | 'faction' | 'economy' | 'magicSystem' | 'calendar'
    ): Promise<T | null> {
		try {
			// Read file content for markdown sections
			const content = await this.app.vault.cachedRead(file);
            const allSections = (await import('./yaml/EntitySections')).parseSectionsFromMarkdown(content);

			// Get cached frontmatter from Obsidian's metadata cache
			const fileCache = this.app.metadataCache.getFileCache(file);
			const cachedFrontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

			// Also parse frontmatter directly from file content to capture empty values
			// This ensures manually-added empty fields are not lost
			const { parseFrontmatterFromContent } = await import('./yaml/EntitySections');
			const directFrontmatter = parseFrontmatterFromContent(content);

			// Merge both sources, preferring direct parsing for better empty value handling
			// Direct parsing captures empty values that the cache might miss
			const frontmatter = { ...(cachedFrontmatter || {}), ...(directFrontmatter || {}) };

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

            // Do not carry forward a raw sections map on the entity; only mapped fields are kept
            if ((data as any).sections) delete (data as any).sections;

			// Validate required name field
			if (!data['name']) {
				console.warn(`File ${file.path} is missing a name in frontmatter.`);
				return null;
			}

			return data as T;
		} catch (e) {
			console.error(`Error parsing file ${file.path}:`, e);
			new Notice(`Error parsing file: ${file.name}`);
			return null;
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
    private buildFrontmatterForCharacter(src: any, originalFrontmatter?: Record<string, unknown>): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('character', src, preserve, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;
    }

    private buildFrontmatterForLocation(src: any, originalFrontmatter?: Record<string, unknown>): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('location', src, preserve, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;
    }

    private buildFrontmatterForEvent(src: any, originalFrontmatter?: Record<string, unknown>): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('event', src, preserve, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;
    }

    private buildFrontmatterForItem(src: any, originalFrontmatter?: Record<string, unknown>): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('item', src, preserve, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;
    }

    private buildFrontmatterForCulture(src: any, originalFrontmatter?: Record<string, unknown>): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('culture', src, preserve, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;
    }


    private buildFrontmatterForEconomy(src: any, originalFrontmatter?: Record<string, unknown>): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('economy', src, preserve, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;
    }

    private buildFrontmatterForMagicSystem(src: any, originalFrontmatter?: Record<string, unknown>): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('magicSystem', src, preserve, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;
    }


	/**
	 * Save a character to the vault as a markdown file (in the active story)
	 * Creates frontmatter from character properties and adds markdown sections
	 * @param character The character data to save
	 */
	async saveCharacter(character: Character): Promise<void> {
		await this.ensureCharacterFolder();
		const folderPath = this.getEntityFolder('character');
		
		// Create safe filename from character name
		const fileName = `${character.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Separate content fields from frontmatter fields (do not let sections leak)
        const { filePath: currentFilePath, backstory, description, ...rest } = character as any;
        if ((rest as any).sections) delete (rest as any).sections;

		// Handle renaming if filePath is present and name changed
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.fileManager.renameFile(existingFile, filePath);
				finalFilePath = filePath;
			}
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
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
			} catch (error) {
				console.warn(`Error reading existing character file: ${error}`);
			}
		}

		// Build frontmatter strictly from whitelist, preserving original frontmatter
		const finalFrontmatter = this.buildFrontmatterForCharacter(rest, originalFrontmatter);

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

		// Build sections from templates + provided data
		const providedSections = {
			Description: description !== undefined ? description : '',
			Backstory: backstory !== undefined ? backstory : ''
		};
		const templateSections = getTemplateSections('character', providedSections);
		
		// When updating existing files, preserve existing sections but allow overriding with provided data
		// This ensures empty fields can be saved and don't get overwritten by existing content
		let allSections: Record<string, string>;
		if (existingFile && existingFile instanceof TFile) {
			// Start with existing sections, then apply template sections, then apply provided sections
			allSections = { ...existingSections, ...templateSections };
			// Explicitly override with provided sections (including empty ones)
			Object.entries(providedSections).forEach(([key, value]) => {
				allSections[key] = value;
			});
		} else {
			allSections = templateSections;
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
            file.extension === 'md'
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
		
		// Create safe filename from location name
		const fileName = `${location.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Separate content fields from frontmatter fields (do not let sections leak)
        const { filePath: currentFilePath, history, description, ...rest } = location as any;
        if ((rest as any).sections) delete (rest as any).sections;

		// Handle renaming if filePath is present and name changed
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.fileManager.renameFile(existingFile, filePath);
				finalFilePath = filePath;
			}
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
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
			} catch (error) {
				console.warn(`Error reading existing location file: ${error}`);
			}
		}

		// Build frontmatter strictly from whitelist, preserving original frontmatter
		const finalFrontmatter = this.buildFrontmatterForLocation(rest, originalFrontmatter);

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

		// Build sections from templates + provided data
		const providedSections = {
			Description: description || '',
			History: history || ''
		};
		const templateSections = getTemplateSections('location', providedSections);
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
		
		// Update the filePath in the location object
		location.filePath = finalFilePath;
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
            file.extension === 'md'
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
		console.warn('DEPRECATED: Map functionality has been deprecated');
		// Stub implementation for backward compatibility
	}

	/**
	 * Build frontmatter for map entity
	 * @deprecated Map functionality has been deprecated
	 */
	private buildFrontmatterForMap(map: Partial<any>, originalFrontmatter?: Record<string, unknown>): Record<string, unknown> {
		console.warn('DEPRECATED: Map functionality has been deprecated');
		return {};
	}

	/**
	 * Save a map to the vault as a markdown file (in the active story)
	 * @param map The map data to save
	 * @deprecated Map functionality has been deprecated
	 */
	async saveMap(map: any): Promise<void> {
		console.warn('DEPRECATED: Map functionality has been deprecated');
		new Notice('Map functionality has been deprecated');
	}

	/**
	 * Load all maps from the map folder
	 * @returns Array of map objects sorted by name
	 * @deprecated Map functionality has been deprecated
	 */
	async listMaps(): Promise<any[]> {
		console.warn('DEPRECATED: Map functionality has been deprecated');
		return [];
	}

	/**
	 * Get a single map by ID
	 * @param mapId The ID of the map to retrieve
	 * @returns The map object or null if not found
	 * @deprecated Map functionality has been deprecated
	 */
	async getMap(mapId: string): Promise<any | null> {
		console.warn('DEPRECATED: Map functionality has been deprecated');
		return null;
	}

	/**
	 * Delete a map file by moving it to trash
	 * @param filePath Path to the map file to delete
	 * @deprecated Map functionality has been deprecated
	 */
	async deleteMap(filePath: string): Promise<void> {
		console.warn('DEPRECATED: Map functionality has been deprecated');
		new Notice('Map functionality has been deprecated');
	}

	/**
	 * Link a location to a map
	 * @param locationName Name of the location to link
	 * @param mapId ID of the map to link to
	 * @deprecated Map functionality has been deprecated
	 */
	async linkLocationToMap(locationName: string, mapId: string): Promise<void> {
		console.warn('DEPRECATED: Map functionality has been deprecated');
	}

	/**
	 * Unlink a location from a map
	 * @param locationName Name of the location to unlink
	 * @param mapId ID of the map to unlink from
	 * @deprecated Map functionality has been deprecated
	 */
	async unlinkLocationFromMap(locationName: string, mapId: string): Promise<void> {
		console.warn('DEPRECATED: Map functionality has been deprecated');
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
		
		// Create safe filename from event name
		const safeName = event.name?.replace(/[\\/:"*?<>|#^[\]]+/g, '') || 'Unnamed Event';
		const fileName = `${safeName}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Separate content fields from frontmatter fields (do not let sections leak)
        const { filePath: currentFilePath, description, outcome, images, ...rest } = event as any;
        if ((rest as any).sections) delete (rest as any).sections;

		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.fileManager.renameFile(existingFile, filePath);
				finalFilePath = filePath;
			}
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
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
			} catch (error) {
				console.warn(`Error reading existing event file: ${error}`);
			}
		}

		// Build frontmatter strictly from whitelist, preserving original frontmatter
		const finalFrontmatter = this.buildFrontmatterForEvent(rest, originalFrontmatter);

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
		const providedSections = {
			Description: description || '',
			Outcome: outcome || ''
		};
		const templateSections = getTemplateSections('event', providedSections);
		const allSections: Record<string, string> = (existingFile && existingFile instanceof TFile)
			? { ...templateSections, ...existingSections }
			: templateSections;

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

		// Auto-detect conflicts if enabled
		if (this.settings.autoDetectConflicts !== false) {  // Default to true
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

		this.app.metadataCache.trigger("dataview:refresh-views");
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
            file.extension === 'md'
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
            return a.name.localeCompare(b.name);
        });
	}

	/**
	 * Delete an event file by moving it to trash
	 * @param filePath Path to the event file to delete
	 */
	async deleteEvent(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
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

        const { filePath: currentFilePath, description, history, ...rest } = item as any;
        if ((rest as any).sections) delete (rest as any).sections;

		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existingFile instanceof TFile) {
				await this.app.fileManager.renameFile(existingFile, filePath);
				finalFilePath = filePath;
			}
		}

		// Check if file exists and read existing frontmatter and sections for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingSections: Record<string, string> = {};
		let originalFrontmatter: Record<string, unknown> | undefined;
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
			} catch (error) {
				console.warn(`Error reading existing item file: ${error}`);
			}
		}

		// Build frontmatter strictly from whitelist, preserving original frontmatter
		const finalFrontmatter = this.buildFrontmatterForItem(rest, originalFrontmatter);

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
			History: history || ''
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
			file.extension === 'md'
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
			const existing = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existing && existing instanceof TFile) {
				await this.app.fileManager.renameFile(existing, filePath);
				finalFilePath = filePath;
			}
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
        const fm: Record<string, any> = buildFrontmatter('reference', rest as any, preserveRef, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;

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

    async ensureChapterFolder(): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('chapter'));
    }

    /** Save a chapter to the vault as a markdown file */
    async saveChapter(chapter: Chapter): Promise<void> {
        await this.ensureChapterFolder();
        const folderPath = this.getEntityFolder('chapter');
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
            const existing = this.app.vault.getAbstractFileByPath(currentFilePath);
            if (existing && existing instanceof TFile) {
                await this.app.fileManager.renameFile(existing, filePath);
                finalFilePath = filePath;
            }
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
                console.warn('Error reading existing chapter file', e);
            }
        }

        // Build frontmatter (preserve any custom fields and original frontmatter)
        const chapterSrc = { ...rest, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups } as Record<string, unknown>;
        const preserveChap = new Set<string>(Object.keys(chapterSrc));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const fm: Record<string, any> = buildFrontmatter('chapter', chapterSrc, preserveChap, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;

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
    }

    /** List all chapters (sorted by number then name) */
    async listChapters(): Promise<Chapter[]> {
        await this.ensureChapterFolder();
        const folderPath = this.getEntityFolder('chapter');
        const allFiles = this.app.vault.getMarkdownFiles();
        const prefix = normalizePath(folderPath) + '/';
        const files = allFiles.filter(f => f.path.startsWith(prefix) && f.extension === 'md');
        const chapters: Chapter[] = [];
        for (const file of files) {
            const data = await this.parseFile<Chapter>(file, { name: '' }, 'chapter');
            if (data) chapters.push(data);
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

    async ensureSceneFolder(): Promise<void> {
        await this.ensureFolder(this.getEntityFolder('scene'));
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


    async saveScene(scene: Scene): Promise<void> {
        // Normalize chapterName for display if id is present
        if (scene.chapterId && !scene.chapterName) {
            const chapters = await this.listChapters();
            const picked = chapters.find(c => c.id === scene.chapterId);
            if (picked) scene.chapterName = picked.name;
        }
        await this.ensureSceneFolder();
        const folderPath = this.getEntityFolder('scene');
        const fileName = `${(scene.name || 'Untitled').replace(/[\\/:"*?<>|]+/g, '')}.md`;
        const filePath = normalizePath(`${folderPath}/${fileName}`);

        const { filePath: currentFilePath, content, beats, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups, ...rest } = scene as any;
        if ((rest as any).sections) delete (rest as any).sections;

        // Rename if needed
        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            const existing = this.app.vault.getAbstractFileByPath(currentFilePath);
            if (existing && existing instanceof TFile) {
                await this.app.fileManager.renameFile(existing, filePath);
                finalFilePath = filePath;
            }
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
                console.warn('Error reading existing scene file', e);
            }
        }

        // Build frontmatter (preserve any custom fields and original frontmatter)
        const sceneSrc = { ...rest, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups } as Record<string, unknown>;
        const preserveScene = new Set<string>(Object.keys(sceneSrc));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const fm: Record<string, any> = buildFrontmatter('scene', sceneSrc, preserveScene, { customFieldsMode: mode, originalFrontmatter }) as Record<string, any>;

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
        this.app.metadataCache.trigger('dataview:refresh-views');
    }

    async listScenes(): Promise<Scene[]> {
        await this.ensureSceneFolder();
        const folderPath = this.getEntityFolder('scene');
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = allFiles.filter(f => f.path.startsWith(folderPath + '/') && f.extension === 'md');
        const scenes: Scene[] = [];
        for (const file of files) {
            const data = await this.parseFile<Scene>(file, { name: '' }, 'scene');
            if (data) scenes.push(data);
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

        const { filePath: currentFilePath, description, values, religion, socialStructure, history, namingConventions, customs, ...rest } = culture as any;
        if ((rest as any).sections) delete (rest as any).sections;

        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
            if (existingFile && existingFile instanceof TFile) {
                await this.app.fileManager.renameFile(existingFile, filePath);
                finalFilePath = filePath;
            }
        }

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
                console.warn(`Error reading existing culture file: ${error}`);
            }
        }

        const finalFrontmatter = this.buildFrontmatterForCulture(rest, originalFrontmatter);

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
            const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
            if (existingFile && existingFile instanceof TFile) {
                await this.app.fileManager.renameFile(existingFile, filePath);
                finalFilePath = filePath;
            }
        }

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
                console.warn(`Error reading existing economy file: ${error}`);
            }
        }

        const finalFrontmatter = this.buildFrontmatterForEconomy(rest, originalFrontmatter);

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
            const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
            if (existingFile && existingFile instanceof TFile) {
                await this.app.fileManager.renameFile(existingFile, filePath);
                finalFilePath = filePath;
            }
        }

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
                console.warn(`Error reading existing magic system file: ${error}`);
            }
        }

        const finalFrontmatter = this.buildFrontmatterForMagicSystem(rest, originalFrontmatter);

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

	/**
	 * Get all gallery images from plugin settings
	 * @returns Array of gallery image metadata
	 */
	getGalleryImages(): GalleryImage[] {
		return this.settings.galleryData.images || [];
	}

	/**
	 * Add a new image to the gallery
	 * Generates a unique ID and saves to plugin settings
	 * @param imageData Image metadata without ID
	 * @returns Complete gallery image object with generated ID
	 */
	async addGalleryImage(imageData: Omit<GalleryImage, 'id'>): Promise<GalleryImage> {
		// Generate unique ID for the image
		const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
		const newImage: GalleryImage = { ...imageData, id };
		
		// Add to gallery and save settings
		this.settings.galleryData.images.push(newImage);
		await this.saveSettings();
		
		return newImage;
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
		
		// Remove group from settings
		this.settings.groups = this.settings.groups.filter(g => g.id !== id);
		// Remove group id from all member entities
		await this.removeGroupIdFromAllEntities(id);
		await this.saveSettings();
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
	async addMemberToGroup(groupId: string, memberType: 'character' | 'event' | 'location' | 'item', memberId: string): Promise<void> {
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
		this.emitGroupsChanged();
	}

	/**
	 * Remove a member from a group
	 */
	async removeMemberFromGroup(groupId: string, memberType: 'character' | 'event' | 'location' | 'item', memberId: string): Promise<void> {
		const activeStory = this.getActiveStory();
		if (!activeStory) throw new Error('No active story selected');
		
		const group = this.settings.groups.find(g => g.id === groupId && g.storyId === activeStory.id);
		if (!group) throw new Error('Group not found');
		group.members = group.members.filter(m => !(m.type === memberType && m.id === memberId));
		// Update the entity's groups array
		await this.removeGroupIdFromEntity(memberType, memberId, groupId);
		await this.saveSettings();
		this.emitGroupsChanged();
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
    async addGroupIdToEntity(type: 'character' | 'event' | 'location' | 'item', id: string, groupId: string): Promise<void> {
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
        }
    }

	/**
	 * Remove a group id from an entity's groups array
	 */
    private async removeGroupIdFromEntity(type: 'character' | 'event' | 'location' | 'item', id: string, groupId: string): Promise<void> {
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
	async loadSettings() {
		// Load old settings if present
		const loaded = await this.loadData();
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
                    const resolved = this.buildResolver().resolveAll();
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
        if (!this.settings.groups) {
            this.settings.groups = [];
            settingsUpdated = true;
        }
        // Ensure language setting exists for backward compatibility
        if (!this.settings.language) {
            this.settings.language = DEFAULT_SETTINGS.language;
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

  /**
   * Lightweight event to notify views when groups have changed without relying on vault events
   */
  emitGroupsChanged(): void {
    try {
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

		// Remove all platform-specific classes
		body.classList.remove('is-mobile', 'is-ios', 'is-android', 'is-desktop', 'storyteller-mobile-enabled');
	}
}

// Ensure this is the very last line of the file
export {};