/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Notice, Plugin, TFile, TFolder, normalizePath, stringifyYaml, WorkspaceLeaf } from 'obsidian';
import { parseEventDate, toMillis } from './utils/DateParsing';
import { buildFrontmatter, getWhitelistKeys } from './yaml/EntitySections';
import { FolderResolver, FolderResolverOptions } from './folders/FolderResolver';
import { PromptModal } from './modals/ui/PromptModal';
import { ConfirmModal } from './modals/ui/ConfirmModal';
import { CharacterModal } from './modals/CharacterModal';
import { Character, Location, Event, GalleryImage, GalleryData, Story, Group, PlotItem, Reference, Chapter, Scene } from './types';
import { CharacterListModal } from './modals/CharacterListModal';
import { LocationModal } from './modals/LocationModal';
import { LocationListModal } from './modals/LocationListModal';
import { EventModal } from './modals/EventModal';
import { TimelineModal } from './modals/TimelineModal';
import { GalleryModal } from './modals/GalleryModal';
import { ImageDetailModal } from './modals/ImageDetailModal';
import { DashboardView, VIEW_TYPE_DASHBOARD } from './views/DashboardView';
import { GalleryImageSuggestModal } from './modals/GalleryImageSuggestModal';
import { StorytellerSuiteSettingTab } from './StorytellerSuiteSettingTab';
import { NewStoryModal } from './modals/NewStoryModal';
import { PlotItemModal } from './modals/PlotItemModal';
import { PlotItemListModal } from './modals/PlotItemListModal';
import { PlatformUtils } from './utils/PlatformUtils';

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
     /** When false (default), block external http/https images. */
     allowRemoteImages?: boolean;
    /** Internal: set after first-run sanitization to avoid repeating it */
    sanitizedSeedData?: boolean;
    /** How to serialize customFields into frontmatter */
    customFieldsMode?: 'flatten' | 'nested';
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
    enableCustomEntityFolders: false,
    storyRootFolderTemplate: '',
    characterFolderPath: '',
    locationFolderPath: '',
    eventFolderPath: '',
    itemFolderPath: '',
    referenceFolderPath: '',
    chapterFolderPath: '',
    sceneFolderPath: '',
    enableOneStoryMode: false,
    oneStoryBaseFolder: 'StorytellerSuite',
    customTodayISO: undefined,
    defaultTimelineGroupMode: 'none',
    defaultTimelineZoomPreset: 'none',
    defaultTimelineStack: true,
    defaultTimelineDensity: 50,
    showTimelineLegend: true,
    allowRemoteImages: true,
    sanitizedSeedData: false,
    customFieldsMode: 'flatten'
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
            new Notice('Select or create a story first.');
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
        const mode = this.settings.customFieldsMode ?? 'flatten';

        const src: Record<string, unknown> = entity as unknown as Record<string, unknown>;
        const currentCustom: Record<string, string> = { ...(entity.customFields || {}) };

        // Sweep non-whitelisted scalar string keys into customFields
        for (const [key, value] of Object.entries(src)) {
            if (reserved.has(key)) continue;
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

    /** Get the Date object for the plugin's notion of "today" (custom override or system). */
    getReferenceTodayDate(): Date {
        const iso = this.settings.customTodayISO;
        if (iso) {
            const parsed = new Date(iso);
            if (!isNaN(parsed.getTime())) return parsed;
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
    getEntityFolder(type: 'character' | 'location' | 'event' | 'item' | 'reference' | 'chapter' | 'scene'): string { // include 'scene'
        const resolver = this.buildResolver();
        return resolver.getEntityFolder(type);
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
        // Ensure folders for this story exist. Respect custom folders / one-story mode.
        if (this.settings.enableCustomEntityFolders) {
            // Use getEntityFolder so placeholders and root fallback are applied
            await this.ensureFolder(this.getEntityFolder('character'));
            await this.ensureFolder(this.getEntityFolder('location'));
            await this.ensureFolder(this.getEntityFolder('event'));
            await this.ensureFolder(this.getEntityFolder('item'));
            await this.ensureFolder(this.getEntityFolder('reference'));
            await this.ensureFolder(this.getEntityFolder('chapter'));
            await this.ensureFolder(this.getEntityFolder('scene'));
        } else if (this.settings.enableOneStoryMode) {
            const base = this.settings.oneStoryBaseFolder || 'StorytellerSuite';
            await this.ensureFolder(`${base}/Characters`);
            await this.ensureFolder(`${base}/Locations`);
            await this.ensureFolder(`${base}/Events`);
            await this.ensureFolder(`${base}/Items`);
            await this.ensureFolder(`${base}/References`);
            await this.ensureFolder(`${base}/Chapters`);
            await this.ensureFolder(`${base}/Scenes`);
        } else {
            await this.ensureFolder(`StorytellerSuite/Stories/${name}/Characters`);
            await this.ensureFolder(`StorytellerSuite/Stories/${name}/Locations`);
            await this.ensureFolder(`StorytellerSuite/Stories/${name}/Events`);
            await this.ensureFolder(`StorytellerSuite/Stories/${name}/Items`);
            await this.ensureFolder(`StorytellerSuite/Stories/${name}/References`);
            await this.ensureFolder(`StorytellerSuite/Stories/${name}/Chapters`);
            await this.ensureFolder(`StorytellerSuite/Stories/${name}/Scenes`);
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
	 * Plugin initialization - called when the plugin is loaded
	 * Registers views, commands, UI elements, and mobile adaptations
	 */
	async onload() {
		await this.loadSettings();

		// Apply mobile CSS classes to the document body
		this.applyMobilePlatformClasses();

		// Register the main dashboard view with Obsidian's workspace
		this.registerView(
			VIEW_TYPE_DASHBOARD,
			(leaf) => new DashboardView(leaf, this)
		);

		// Add ribbon icon for quick access to dashboard
		this.addRibbonIcon('book-open', 'Open storyteller dashboard', () => {
			this.activateView();
		}).addClass('storyteller-suite-ribbon-class');

		// Register command palette commands
		this.registerCommands();

		// Add settings tab for user configuration
		this.addSettingTab(new StorytellerSuiteSettingTab(this.app, this));


		// Perform story discovery after workspace is ready
		this.app.workspace.onLayoutReady(() => {
			this.discoverExistingStories();
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
				const base = this.settings.oneStoryBaseFolder || 'StorytellerSuite';
				const baseFolder = this.app.vault.getAbstractFileByPath(normalizePath(base));
				if (baseFolder instanceof TFolder) {
					const md = this.app.vault.getMarkdownFiles();
					const hasAny = md.some(f => f.path.startsWith(normalizePath(base) + '/'));
					if (hasAny && this.settings.stories.length === 0) {
						const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
						const story: Story = { id, name: 'Single Story', created: new Date().toISOString() };
						this.settings.stories.push(story);
						this.settings.activeStoryId = id;
						await this.saveSettings();
						return { newStories: [story], totalStories: this.settings.stories.length };
					}
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
			name: 'View timeline',
			callback: async () => {
				const events = await this.listEvents();
				new TimelineModal(this.app, this, events).open();
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
                new PromptModal(this.app, {
                    title: 'Rename group',
                    label: 'Enter the name of the group to rename',
                    validator: (val) => !val.trim() ? 'Required' : null,
                    onSubmit: async (groupName) => {
                        const group = groups.find(g => g.name === groupName.trim());
                        if (!group) { new Notice('Group not found.'); return; }
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
                    }
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
                new PromptModal(this.app, {
                    title: 'Delete group',
                    label: 'Enter the name of the group to delete',
                    validator: (v) => !v.trim() ? 'Required' : null,
                    onSubmit: (groupName) => {
                        const group = groups.find(g => g.name === groupName.trim());
                        if (!group) { new Notice('Group not found.'); return; }
                        new ConfirmModal(this.app, {
                            title: 'Confirm delete',
                            body: `Are you sure you want to delete group "${group.name}"?`,
                            onConfirm: async () => {
                                await this.deleteGroup(group.id);
                                new Notice(`Group "${group.name}" deleted.`);
                            }
                        }).open();
                    }
                }).open();
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
                await this.app.vault.createFolder(current);
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
    async parseFile<T>(file: TFile, typeDefaults: Partial<T>): Promise<T | null> {
		try {
			// Get cached frontmatter from Obsidian's metadata cache
			const fileCache = this.app.metadataCache.getFileCache(file);
			const frontmatter = fileCache?.frontmatter as Record<string, unknown> | undefined;

			// Read file content for markdown sections
			const content = await this.app.vault.cachedRead(file);
            const allSections = (await import('./yaml/EntitySections')).parseSectionsFromMarkdown(content);

			// Combine frontmatter and defaults with file path
			// IMPORTANT: Do NOT spread allSections into top-level props to avoid leaking into YAML later.
			const data: Record<string, unknown> = {
				...typeDefaults as unknown as Record<string, unknown>,
				...frontmatter,
				filePath: file.path
			};

			// Map well-known sections into lowercase fields used by UI
			if (allSections['Description']) data['description'] = allSections['Description'];
			if (allSections['Backstory']) data['backstory'] = allSections['Backstory'];
			if (allSections['History']) data['history'] = allSections['History'];
			if (allSections['Outcome']) data['outcome'] = allSections['Outcome'];

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

			// Preserve arbitrary user-defined sections in a dedicated 'sections' map
			// This MUST NOT be merged into YAML on save.
			(data as any).sections = allSections;

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
    private buildFrontmatterForCharacter(src: any): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('character', src, preserve, { customFieldsMode: mode }) as Record<string, any>;
    }

    private buildFrontmatterForLocation(src: any): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('location', src, preserve, { customFieldsMode: mode }) as Record<string, any>;
    }

    private buildFrontmatterForEvent(src: any): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('event', src, preserve, { customFieldsMode: mode }) as Record<string, any>;
    }

    private buildFrontmatterForItem(src: any): Record<string, any> {
        const preserve = new Set<string>(Object.keys(src || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        return buildFrontmatter('item', src, preserve, { customFieldsMode: mode }) as Record<string, any>;
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
		const { filePath: currentFilePath, backstory, description, ...rest } = character;

		// Build frontmatter strictly from whitelist
		const finalFrontmatter = this.buildFrontmatterForCharacter(rest);
		const frontmatterString = Object.keys(finalFrontmatter).length > 0 ? stringifyYaml(finalFrontmatter) : '';

		// Handle renaming if filePath is present and name changed
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.fileManager.renameFile(existingFile, filePath);
				finalFilePath = filePath;
			}
		}

		// Check if file exists and read existing content for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingContent = '';
		const existingSections: Record<string, string> = {};
		let customSections: Record<string, string> = {};
		
		if (existingFile && existingFile instanceof TFile) {
			try {
				existingContent = await this.app.vault.cachedRead(existingFile);
				
				// Parse ALL existing markdown sections dynamically to preserve user content
				// Use robust regex pattern for backward compatibility with older file formats
				const primaryMatches = existingContent.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
				
				for (const match of primaryMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionName && sectionContent) {
						customSections[sectionName] = sectionContent;
					}
				}
				
				// Fallback parsing for edge cases where primary regex might miss sections
				if (Object.keys(customSections).length === 0 && existingContent.includes('##')) {
					console.warn(`Primary regex failed for character file ${finalFilePath}, attempting fallback parsing`);
					// Fallback: Split by ## and try to reconstruct sections
					const lines = existingContent.split('\n');
					let currentSection = '';
					let currentContent: string[] = [];
					
					for (const line of lines) {
						if (line.startsWith('##')) {
							// Save previous section if exists
							if (currentSection && currentContent.length > 0) {
								const content = currentContent.join('\n').trim();
								if (content) {
									customSections[currentSection] = content;
								}
							}
							// Start new section
							currentSection = line.replace(/^##\s*/, '').trim();
							currentContent = [];
						} else if (currentSection) {
							currentContent.push(line);
						}
					}
					// Save final section
					if (currentSection && currentContent.length > 0) {
						const content = currentContent.join('\n').trim();
						if (content) {
							customSections[currentSection] = content;
						}
					}
				}
			} catch (error) {
				console.warn(`Error reading existing character file: ${error}`);
			}
		}

		// Build file content with frontmatter and markdown sections
		let fileContent = `---\n${frontmatterString}---\n\n`;
		
		// Handle sections dynamically - preserve ALL user sections
		// Priority order: new content from character object, then existing content, then generate from arrays
		
		// Description section
		if (description) {
			fileContent += `## Description\n${description.trim()}\n\n`;
		} else if (customSections['Description']) {
			fileContent += `## Description\n${customSections['Description']}\n\n`;
		}
		
		// Backstory section
		if (backstory) {
			fileContent += `## Backstory\n${backstory.trim()}\n\n`;
		} else if (customSections['Backstory']) {
			fileContent += `## Backstory\n${customSections['Backstory']}\n\n`;
		}
		
		// Relationships section
		const relationshipsContent = (character.relationships || []).map(r => `- [[${r}]]`).join('\n');
		if (relationshipsContent) {
			fileContent += `## Relationships\n${relationshipsContent}\n\n`;
		} else if (customSections['Relationships']) {
			fileContent += `## Relationships\n${customSections['Relationships']}\n\n`;
		}
		
		// Locations section
		const locationsContent = (character.locations || []).map(l => `- [[${l}]]`).join('\n');
		if (locationsContent) {
			fileContent += `## Locations\n${locationsContent}\n\n`;
		} else if (customSections['Locations']) {
			fileContent += `## Locations\n${customSections['Locations']}\n\n`;
		}
		
		// Events section
		const eventsContent = (character.events || []).map(e => `- [[${e}]]`).join('\n');
		if (eventsContent) {
			fileContent += `## Events\n${eventsContent}\n\n`;
		} else if (customSections['Events']) {
			fileContent += `## Events\n${customSections['Events']}\n\n`;
		}

		// Add ALL other sections that users have created (unlimited sections support!)
		const handledSections = ['Description', 'Backstory', 'Relationships', 'Locations', 'Events'];
		for (const [sectionName, sectionContent] of Object.entries(customSections)) {
			if (!handledSections.includes(sectionName) && sectionContent.trim()) {
				fileContent += `## ${sectionName}\n${sectionContent}\n\n`;
			}
		}

		// Save or update the file
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
		} else {
			await this.app.vault.create(finalFilePath, fileContent);
		}
		
		// Update the filePath in the character object
		character.filePath = finalFilePath;
		// Trigger dataview refresh for plugins that depend on this data
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
            let charData = await this.parseFile<Character>(file, { name: '' });
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
		const { filePath: currentFilePath, history, description, ...rest } = location;

		// Build frontmatter strictly from whitelist
		const finalFrontmatter = this.buildFrontmatterForLocation(rest);
		const frontmatterString = Object.keys(finalFrontmatter).length > 0 ? stringifyYaml(finalFrontmatter) : '';

		// Handle renaming if filePath is present and name changed
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.fileManager.renameFile(existingFile, filePath);
				finalFilePath = filePath;
			}
		}

		// Check if file exists and read existing content for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingContent = '';
		const existingSections: Record<string, string> = {};
		const customSections: Record<string, string> = {};
		
		if (existingFile && existingFile instanceof TFile) {
			try {
				existingContent = await this.app.vault.cachedRead(existingFile);
				
				// Parse ALL existing markdown sections dynamically to preserve user content
				// Use robust regex pattern for backward compatibility with older file formats
				const primaryMatches = existingContent.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
				
				for (const match of primaryMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionName && sectionContent) {
						customSections[sectionName] = sectionContent;
					}
				}
				
				// Fallback parsing for edge cases where primary regex might miss sections
				if (Object.keys(customSections).length === 0 && existingContent.includes('##')) {
					console.warn(`Primary regex failed for location file ${finalFilePath}, attempting fallback parsing`);
					// Fallback: Split by ## and try to reconstruct sections
					const lines = existingContent.split('\n');
					let currentSection = '';
					let currentContent: string[] = [];
					
					for (const line of lines) {
						if (line.startsWith('##')) {
							// Save previous section if exists
							if (currentSection && currentContent.length > 0) {
								const content = currentContent.join('\n').trim();
								if (content) {
									customSections[currentSection] = content;
								}
							}
							// Start new section
							currentSection = line.replace(/^##\s*/, '').trim();
							currentContent = [];
						} else if (currentSection) {
							currentContent.push(line);
						}
					}
					// Save final section
					if (currentSection && currentContent.length > 0) {
						const content = currentContent.join('\n').trim();
						if (content) {
							customSections[currentSection] = content;
						}
					}
				}
			} catch (error) {
				console.warn(`Error reading existing location file: ${error}`);
			}
		}

		// Build file content with frontmatter and markdown sections
		let fileContent = `---\n${frontmatterString}---\n\n`;
		
		// Handle sections dynamically - preserve ALL user sections
		// Priority order: new content from location object, then existing content, then generate from arrays
		
		// Description section
		if (description) {
			fileContent += `## Description\n${description.trim()}\n\n`;
		} else if (customSections['Description']) {
			fileContent += `## Description\n${customSections['Description']}\n\n`;
		}
		
		// History section
		if (history) {
			fileContent += `## History\n${history.trim()}\n\n`;
		} else if (customSections['History']) {
			fileContent += `## History\n${customSections['History']}\n\n`;
		}

		// Add ALL other sections that users have created (unlimited sections support!)
		const handledSections = ['Description', 'History'];
		for (const [sectionName, sectionContent] of Object.entries(customSections)) {
			if (!handledSections.includes(sectionName) && sectionContent.trim()) {
				fileContent += `## ${sectionName}\n${sectionContent}\n\n`;
			}
		}

		// Save or update the file
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
		} else {
			await this.app.vault.create(finalFilePath, fileContent);
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
            let locData = await this.parseFile<Location>(file, { name: '' });
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
		const { filePath: currentFilePath, description, outcome, images, ...rest } = event;

		// Build frontmatter strictly from whitelist
		const finalFrontmatter = this.buildFrontmatterForEvent(rest);
		const frontmatterString = Object.keys(finalFrontmatter).length > 0 ? stringifyYaml(finalFrontmatter) : '';

		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.fileManager.renameFile(existingFile, filePath);
				finalFilePath = filePath;
			}
		}

		// Check if file exists and read existing content for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingContent = '';
		const customSections: Record<string, string> = {};
		
		if (existingFile && existingFile instanceof TFile) {
			try {
				existingContent = await this.app.vault.cachedRead(existingFile);
				
				// Parse ALL existing markdown sections dynamically to preserve user content
				// Use robust regex pattern for backward compatibility with older file formats
				const primaryMatches = existingContent.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
				
				for (const match of primaryMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionName && sectionContent) {
						customSections[sectionName] = sectionContent;
					}
				}
				
				// Fallback parsing for edge cases where primary regex might miss sections
				if (Object.keys(customSections).length === 0 && existingContent.includes('##')) {
					console.warn(`Primary regex failed for event file ${finalFilePath}, attempting fallback parsing`);
					// Fallback: Split by ## and try to reconstruct sections
					const lines = existingContent.split('\n');
					let currentSection = '';
					let currentContent: string[] = [];
					
					for (const line of lines) {
						if (line.startsWith('##')) {
							// Save previous section if exists
							if (currentSection && currentContent.length > 0) {
								const content = currentContent.join('\n').trim();
								if (content) {
									customSections[currentSection] = content;
								}
							}
							// Start new section
							currentSection = line.replace(/^##\s*/, '').trim();
							currentContent = [];
						} else if (currentSection) {
							currentContent.push(line);
						}
					}
					// Save final section
					if (currentSection && currentContent.length > 0) {
						const content = currentContent.join('\n').trim();
						if (content) {
							customSections[currentSection] = content;
						}
					}
				}
			} catch (error) {
				console.warn(`Error reading existing event file: ${error}`);
			}
		}

		// Build file content with frontmatter and markdown sections
		let fileContent = `---\n${frontmatterString}---\n\n`;
		
		// Handle sections dynamically - preserve ALL user sections
		// Priority order: new content from event object, then existing content, then generate from arrays
		
		// Description section
		if (description) {
			fileContent += `## Description\n${description.trim()}\n\n`;
		} else if (customSections['Description']) {
			fileContent += `## Description\n${customSections['Description']}\n\n`;
		}
		
		// Outcome section
		if (outcome) {
			fileContent += `## Outcome\n${outcome.trim()}\n\n`;
		} else if (customSections['Outcome']) {
			fileContent += `## Outcome\n${customSections['Outcome']}\n\n`;
		}
		
		// Characters Involved section
		const charactersContent = (finalFrontmatter.characters || []).map((c: string) => `- [[${c}]]`).join('\n');
		if (charactersContent) {
			fileContent += `## Characters Involved\n${charactersContent}\n\n`;
		} else if (customSections['Characters Involved']) {
			fileContent += `## Characters Involved\n${customSections['Characters Involved']}\n\n`;
		}

		// Add ALL other sections that users have created (unlimited sections support!)
		const handledSections = ['Description', 'Outcome', 'Characters Involved'];
		for (const [sectionName, sectionContent] of Object.entries(customSections)) {
			if (!handledSections.includes(sectionName) && sectionContent.trim()) {
				fileContent += `## ${sectionName}\n${sectionContent}\n\n`;
			}
		}

		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
		} else {
			await this.app.vault.create(finalFilePath, fileContent);
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
            let eventData = await this.parseFile<Event>(file, { name: '' });
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

		const { filePath: currentFilePath, description, history, ...rest } = item;

		const finalFrontmatter = this.buildFrontmatterForItem(rest);
		const frontmatterString = Object.keys(finalFrontmatter).length > 0 ? stringifyYaml(finalFrontmatter) : '';

		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existingFile = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existingFile instanceof TFile) {
				await this.app.fileManager.renameFile(existingFile, filePath);
				finalFilePath = filePath;
			}
		}

		// Check if file exists and read existing content for preservation
		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		let existingContent = '';
		const customSections: Record<string, string> = {};
		
		if (existingFile && existingFile instanceof TFile) {
			try {
				existingContent = await this.app.vault.cachedRead(existingFile);
				
				// Parse ALL existing markdown sections dynamically to preserve user content
				// Use robust regex pattern for backward compatibility with older file formats
				const primaryMatches = existingContent.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
				
				for (const match of primaryMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionName && sectionContent) {
						customSections[sectionName] = sectionContent;
					}
				}
				
				// Fallback parsing for edge cases where primary regex might miss sections
				if (Object.keys(customSections).length === 0 && existingContent.includes('##')) {
					console.warn(`Primary regex failed for item file ${finalFilePath}, attempting fallback parsing`);
					// Fallback: Split by ## and try to reconstruct sections
					const lines = existingContent.split('\n');
					let currentSection = '';
					let currentContent: string[] = [];
					
					for (const line of lines) {
						if (line.startsWith('##')) {
							// Save previous section if exists
							if (currentSection && currentContent.length > 0) {
								const content = currentContent.join('\n').trim();
								if (content) {
									customSections[currentSection] = content;
								}
							}
							// Start new section
							currentSection = line.replace(/^##\s*/, '').trim();
							currentContent = [];
						} else if (currentSection) {
							currentContent.push(line);
						}
					}
					// Save final section
					if (currentSection && currentContent.length > 0) {
						const content = currentContent.join('\n').trim();
						if (content) {
							customSections[currentSection] = content;
						}
					}
				}
			} catch (error) {
				console.warn(`Error reading existing item file: ${error}`);
			}
		}

		// Build file content with frontmatter and markdown sections
		let fileContent = `---\n${frontmatterString}---\n\n`;
		
		// Handle sections dynamically - preserve ALL user sections
		// Priority order: new content from item object, then existing content, then generate from arrays
		
		// Description section
		if (description) {
			fileContent += `## Description\n${description.trim()}\n\n`;
		} else if (customSections['Description']) {
			fileContent += `## Description\n${customSections['Description']}\n\n`;
		}
		
		// History section
		if (history) {
			fileContent += `## History\n${history.trim()}\n\n`;
		} else if (customSections['History']) {
			fileContent += `## History\n${customSections['History']}\n\n`;
		}

		// Add ALL other sections that users have created (unlimited sections support!)
		const handledSections = ['Description', 'History'];
		for (const [sectionName, sectionContent] of Object.entries(customSections)) {
			if (!handledSections.includes(sectionName) && sectionContent.trim()) {
				fileContent += `## ${sectionName}\n${sectionContent}\n\n`;
			}
		}

		// Save or update the file
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
		} else {
			await this.app.vault.create(finalFilePath, fileContent);
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
            let itemData = await this.parseFile<PlotItem>(file, { name: '', isPlotCritical: false });
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

        // Build frontmatter (preserve any custom fields)
        const preserveRef = new Set<string>(Object.keys(rest || {}));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const fm: Record<string, any> = buildFrontmatter('reference', rest as any, preserveRef, { customFieldsMode: mode }) as Record<string, any>;
		const frontmatterString = Object.keys(fm).length > 0 ? stringifyYaml(fm) : '';

		// Handle rename
		let finalFilePath = filePath;
		if (currentFilePath && currentFilePath !== filePath) {
			const existing = this.app.vault.getAbstractFileByPath(currentFilePath);
			if (existing && existing instanceof TFile) {
				await this.app.fileManager.renameFile(existing, filePath);
				finalFilePath = filePath;
			}
		}

		const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
		const customSections: Record<string, string> = {};
		if (existingFile && existingFile instanceof TFile) {
			try {
				const existingContent = await this.app.vault.cachedRead(existingFile);
				const primaryMatches = existingContent.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
				for (const match of primaryMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionName && sectionContent) customSections[sectionName] = sectionContent;
				}
			} catch (e) {
				console.warn('Error reading existing reference file', e);
			}
		}

		// Build body
		let fileContent = `---\n${frontmatterString}---\n\n`;

		if (content) {
			fileContent += `## Content\n${(content as string).trim()}\n\n`;
		} else if (customSections['Content']) {
			fileContent += `## Content\n${customSections['Content']}\n\n`;
		}

		const handled = ['Content'];
		for (const [sectionName, sectionContent] of Object.entries(customSections)) {
			if (!handled.includes(sectionName) && sectionContent.trim()) {
				fileContent += `## ${sectionName}\n${sectionContent}\n\n`;
			}
		}

		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
		} else {
			await this.app.vault.create(finalFilePath, fileContent);
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
			const data = await this.parseFile<Reference>(file, { name: '' });
			if (data) {
				const anyData = data as any;
				if (anyData.sections && anyData.sections['Content']) {
					data.content = anyData.sections['Content'];
				}
				refs.push(data);
			}
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

        // Build frontmatter (preserve any custom fields)
        const chapterSrc = { ...rest, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups } as Record<string, unknown>;
        const preserveChap = new Set<string>(Object.keys(chapterSrc));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const fm: Record<string, any> = buildFrontmatter('chapter', chapterSrc, preserveChap, { customFieldsMode: mode }) as Record<string, any>;
        const frontmatterString = Object.keys(fm).length > 0 ? stringifyYaml(fm) : '';

        // Rename if needed
        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            const existing = this.app.vault.getAbstractFileByPath(currentFilePath);
            if (existing && existing instanceof TFile) {
                await this.app.fileManager.renameFile(existing, filePath);
                finalFilePath = filePath;
            }
        }

        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        const customSections: Record<string, string> = {};
        if (existingFile && existingFile instanceof TFile) {
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                const primaryMatches = existingContent.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
                for (const match of primaryMatches) {
                    const sectionName = match[1].trim();
                    const sectionContent = match[2].trim();
                    if (sectionName && sectionContent) customSections[sectionName] = sectionContent;
                }
            } catch (e) {
                console.warn('Error reading existing chapter file', e);
            }
        }

        let fileContent = `---\n${frontmatterString}---\n\n`;
        if (summary) {
            fileContent += `## Summary\n${(summary as string).trim()}\n\n`;
        } else if (customSections['Summary']) {
            fileContent += `## Summary\n${customSections['Summary']}\n\n`;
        }
        const handled = ['Summary'];
        for (const [sectionName, sectionContent] of Object.entries(customSections)) {
            if (!handled.includes(sectionName) && sectionContent.trim()) {
                fileContent += `## ${sectionName}\n${sectionContent}\n\n`;
            }
        }

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, fileContent);
        } else {
            await this.app.vault.create(finalFilePath, fileContent);
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
            const data = await this.parseFile<Chapter>(file, { name: '' });
            if (data) {
                const anyData = data as any;
                if (anyData.sections && anyData.sections['Summary']) data.summary = anyData.sections['Summary'];
                chapters.push(data);
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
        const sceneSrc = { ...rest, linkedCharacters, linkedLocations, linkedEvents, linkedItems, linkedGroups } as Record<string, unknown>;
        const preserveScene = new Set<string>(Object.keys(sceneSrc));
        const mode = this.settings.customFieldsMode ?? 'flatten';
        const fm: Record<string, any> = buildFrontmatter('scene', sceneSrc, preserveScene, { customFieldsMode: mode }) as Record<string, any>;
        const frontmatterString = Object.keys(fm).length > 0 ? stringifyYaml(fm) : '';

        // Rename if needed
        let finalFilePath = filePath;
        if (currentFilePath && currentFilePath !== filePath) {
            const existing = this.app.vault.getAbstractFileByPath(currentFilePath);
            if (existing && existing instanceof TFile) {
                await this.app.fileManager.renameFile(existing, filePath);
                finalFilePath = filePath;
            }
        }

        const existingFile = this.app.vault.getAbstractFileByPath(finalFilePath);
        const customSections: Record<string, string> = {};
        if (existingFile && existingFile instanceof TFile) {
            try {
                const existingContent = await this.app.vault.cachedRead(existingFile);
                const primaryMatches = existingContent.matchAll(/^##\s*([^\n\r]+?)\s*[\n\r]+([\s\S]*?)(?=\n\s*##\s|$)/gm);
                for (const match of primaryMatches) {
                    const sectionName = match[1].trim();
                    const sectionContent = match[2].trim();
                    if (sectionName && sectionContent) customSections[sectionName] = sectionContent;
                }
            } catch (e) {
                console.warn('Error reading existing scene file', e);
            }
        }

        let fileContent = `---\n${frontmatterString}---\n\n`;
        if (content) fileContent += `## Content\n${(content as string).trim()}\n\n`;
        else if (customSections['Content']) fileContent += `## Content\n${customSections['Content']}\n\n`;

        const beatsBlock = (beats && Array.isArray(beats) ? beats as string[] : undefined);
        if (beatsBlock && beatsBlock.length > 0) {
            fileContent += `## Beat Sheet\n` + beatsBlock.map(b => `- ${b}`).join('\n') + `\n\n`;
        } else if (customSections['Beat Sheet']) {
            fileContent += `## Beat Sheet\n${customSections['Beat Sheet']}\n\n`;
        }

        const handled = ['Content','Beat Sheet'];
        for (const [sectionName, sectionContent] of Object.entries(customSections)) {
            if (!handled.includes(sectionName) && sectionContent.trim()) {
                fileContent += `## ${sectionName}\n${sectionContent}\n\n`;
            }
        }

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, fileContent);
        } else {
            await this.app.vault.create(finalFilePath, fileContent);
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
            const data = await this.parseFile<Scene>(file, { name: '' });
            if (data) {
                const anyData = data as any;
                if (anyData.sections && anyData.sections['Content']) data.content = anyData.sections['Content'];
                if (anyData.sections && anyData.sections['Beat Sheet']) {
                    const raw = anyData.sections['Beat Sheet'] as string;
                    const beats = raw.split('\n').map(l => l.replace(/^\-\s*/, '').trim()).filter(Boolean);
                    data.beats = beats.length ? beats : undefined;
                }
                scenes.push(data);
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
            await this.app.vault.trash(file, true);
            new Notice(`Scene file "${file.basename}" moved to trash.`);
            this.app.metadataCache.trigger('dataview:refresh-views');
        } else {
            new Notice(`Error: Could not find scene file to delete at ${filePath}`);
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