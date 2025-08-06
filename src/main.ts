/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Notice, Plugin, TFile, TFolder, normalizePath, stringifyYaml, WorkspaceLeaf } from 'obsidian';
import { CharacterModal } from './modals/CharacterModal';
import { Character, Location, Event, GalleryImage, GalleryData, Story, Group, PlotItem } from './types';
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
}

/**
 * Default plugin settings - used on first install or when settings are missing
 */
const DEFAULT_SETTINGS: StorytellerSuiteSettings = {
    stories: [],
    activeStoryId: '',
    galleryUploadFolder: 'StorytellerSuite/GalleryUploads',
    galleryData: { images: [] },
    groups: []
}

/**
 * Main plugin class for Storyteller Suite
 * Manages storytelling entities (characters, locations, events) and provides
 * a unified dashboard interface for story management
 */
export default class StorytellerSuitePlugin extends Plugin {
	settings: StorytellerSuiteSettings;

	/**
	 * Helper: Get the currently active story object
	 */
	getActiveStory(): Story | undefined {
		return this.settings.stories.find(s => s.id === this.settings.activeStoryId);
	}

	/**
	 * Helper: Get the folder path for a given entity type in the active story
	 */
	getEntityFolder(type: 'character' | 'location' | 'event' | 'item'): string { // Add 'item'
		const story = this.getActiveStory();
		if (!story) throw new Error('No active story selected.');
		const base = `StorytellerSuite/Stories/${story.name}`;
		if (type === 'character') return `${base}/Characters`;
		if (type === 'location') return `${base}/Locations`;
		if (type === 'event') return `${base}/Events`;
        if (type === 'item') return `${base}/Items`; // New case
		throw new Error('Unknown entity type');
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
		// Ensure folders for this story exist
		await this.ensureFolder(`StorytellerSuite/Stories/${name}/Characters`);
		await this.ensureFolder(`StorytellerSuite/Stories/${name}/Locations`);
		await this.ensureFolder(`StorytellerSuite/Stories/${name}/Events`);
        await this.ensureFolder(`StorytellerSuite/Stories/${name}/Items`); // Add this line
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
	 * Registers views, commands, and UI elements
	 */
	async onload() {
		await this.loadSettings();

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
			return { newStories: [], totalStories: this.settings.stories.length, error: message };
		} else {
			const message = `Path exists but is not a folder: ${baseStoriesPath}`;
			return { newStories: [], totalStories: this.settings.stories.length, error: message };
		}
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
	 * Plugin cleanup - called when the plugin is unloaded
	 * Obsidian automatically handles view cleanup
	 */
	onunload() {
		// Manual cleanup not needed - Obsidian handles view management
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
			name: 'Create New Story',
			callback: () => {
				new NewStoryModal(
					this.app,
					this.settings.stories.map(s => s.name),
					async (name, description) => {
						const story = await this.createStory(name, description);
						await this.setActiveStory(story.id);
						// @ts-ignore
						new window.Notice(`Story "${name}" created and activated.`);
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

		// --- Group management commands ---
		this.addCommand({
			id: 'create-group',
			name: 'Create group',
			callback: async () => {
				const name = prompt('Enter group name:');
				if (name && name.trim()) {
					await this.createGroup(name.trim());
					new Notice(`Group "${name.trim()}" created.`);
				}
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
				const groupName = prompt('Enter the name of the group to rename:');
				const group = groups.find(g => g.name === groupName);
				if (!group) {
					new Notice('Group not found.');
					return;
				}
				const newName = prompt('Enter new group name:', group.name);
				if (newName && newName.trim()) {
					await this.updateGroup(group.id, { name: newName.trim() });
					new Notice(`Group renamed to "${newName.trim()}".`);
				}
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
				const groupName = prompt('Enter the name of the group to delete:');
				const group = groups.find(g => g.name === groupName);
				if (!group) {
					new Notice('Group not found.');
					return;
				}
				if (confirm(`Are you sure you want to delete group "${group.name}"?`)) {
					await this.deleteGroup(group.id);
					new Notice(`Group "${group.name}" deleted.`);
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
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!folder) {
			// Create the folder if it doesn't exist
			await this.app.vault.createFolder(normalizedPath);
		} else if (!(folder instanceof TFolder)) {
			// Path exists but is a file, not a folder - this is an error
			const errorMsg = `Error: Path ${normalizedPath} exists but is not a folder. Check Storyteller Suite settings.`;
			new Notice(errorMsg);
			console.error(errorMsg);
			throw new Error(errorMsg);
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
			
			// Parse ALL sections dynamically using improved regex pattern
			const allSections: Record<string, string> = {};
			const sectionMatches = content.matchAll(/## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g);
			
			for (const match of sectionMatches) {
				const sectionName = match[1].trim();
				const sectionContent = match[2].trim();
				if (sectionContent) {
					allSections[sectionName] = sectionContent;
				}
			}

			// Combine frontmatter and defaults with file path and ALL sections
			const data: Record<string, unknown> = {
				...typeDefaults as unknown as Record<string, unknown>,
				...frontmatter,
				filePath: file.path,
				// Include all parsed sections
				...allSections
			};

			// Ensure specific fields are available for backward compatibility and UI
			if (allSections['Description']) data['description'] = allSections['Description'];
			if (allSections['Backstory']) data['backstory'] = allSections['Backstory'];
			if (allSections['History']) data['history'] = allSections['History'];
			
			// Parse relationship arrays from sections if they exist
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

		// Separate content fields from frontmatter fields
		const { filePath: currentFilePath, backstory, description, profileImagePath, status, affiliation, ...frontmatterData } = character;

		// Build frontmatter with optional fields
		const finalFrontmatter: Record<string, any> = { ...frontmatterData };
		if (profileImagePath) finalFrontmatter.profileImagePath = profileImagePath;
		if (status) finalFrontmatter.status = status;
		if (affiliation) finalFrontmatter.affiliation = affiliation;

		// Clean up empty values from frontmatter
		Object.keys(finalFrontmatter).forEach(key => {
			const k = key as keyof typeof finalFrontmatter;
			if (finalFrontmatter[k] === null || finalFrontmatter[k] === undefined || (Array.isArray(finalFrontmatter[k]) && (finalFrontmatter[k] as any[]).length === 0)) {
				delete finalFrontmatter[k];
			}
		});
		
		// Remove empty customFields object
		if (finalFrontmatter.customFields && Object.keys(finalFrontmatter.customFields).length === 0) {
			delete finalFrontmatter.customFields;
		}

		// Generate YAML frontmatter string
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
				// Use corrected regex pattern that captures all sections including final ones
				const allSectionMatches = existingContent.matchAll(/## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g);
				for (const match of allSectionMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionContent) {
						customSections[sectionName] = sectionContent;
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
		const files = allFiles.filter(file => 
			file.path.startsWith(folderPath + '/') && 
			file.extension === 'md'
		);
		
		// Parse each character file
		const characters: Character[] = [];
		for (const file of files) {
			const charData = await this.parseFile<Character>(file, { name: '' });
			if (charData) {
				characters.push(charData);
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

		// Separate content fields from frontmatter fields
		const { filePath: currentFilePath, history, description, locationType, region, status, profileImagePath, ...frontmatterData } = location;
		
		// Build frontmatter with optional fields
		const finalFrontmatter: Record<string, any> = { ...frontmatterData };
		if (locationType) finalFrontmatter.locationType = locationType;
		if (region) finalFrontmatter.region = region;
		if (status) finalFrontmatter.status = status;
		if (profileImagePath) finalFrontmatter.profileImagePath = profileImagePath;

		// Clean up empty values from frontmatter
		Object.keys(finalFrontmatter).forEach(key => {
			const k = key as keyof typeof frontmatterData;
			if (finalFrontmatter.hasOwnProperty(k)) {
				const value = finalFrontmatter[k];
				if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
					delete finalFrontmatter[k];
				}
			}
		});
		
		// Remove empty customFields object
		if (finalFrontmatter.customFields && Object.keys(finalFrontmatter.customFields).length === 0) {
			delete finalFrontmatter.customFields;
		}

		// Generate YAML frontmatter string
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
				// Use corrected regex pattern that captures all sections including final ones
				const allSectionMatches = existingContent.matchAll(/## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g);
				for (const match of allSectionMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionContent) {
						customSections[sectionName] = sectionContent;
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
		const files = allFiles.filter(file => 
			file.path.startsWith(folderPath + '/') && 
			file.extension === 'md'
		);
		
		// Parse each location file
		const locations: Location[] = [];
		for (const file of files) {
			const locData = await this.parseFile<Location>(file, { name: '' });
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

		// Separate content fields from frontmatter fields
		const {
			filePath: currentFilePath,
			description,
			outcome,
			profileImagePath,
			images,
			...frontmatterData
		} = event;

		// Build frontmatter object
		const finalFrontmatter: Record<string, any> = { ...frontmatterData };
		if (profileImagePath) finalFrontmatter.profileImagePath = profileImagePath;

		// Clean up empty values from frontmatter
		Object.keys(finalFrontmatter).forEach(key => {
			const k = key as keyof typeof finalFrontmatter;
			const value = finalFrontmatter[k];
			if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
				delete finalFrontmatter[k];
			}
			if (k === 'location' && value === undefined) delete finalFrontmatter[k];
		});
		
		if (finalFrontmatter.customFields && Object.keys(finalFrontmatter.customFields).length === 0) {
			delete finalFrontmatter.customFields;
		}

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
				// Use corrected regex pattern that captures all sections including final ones
				const allSectionMatches = existingContent.matchAll(/## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g);
				for (const match of allSectionMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionContent) {
						customSections[sectionName] = sectionContent;
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
		const files = allFiles.filter(file => 
			file.path.startsWith(folderPath + '/') && 
			file.extension === 'md'
		);
		
		const events: Event[] = [];
		for (const file of files) {
			const eventData = await this.parseFile<Event>(file, { name: '' });
			if (eventData) {
				events.push(eventData);
			}
		}
		
		return events.sort((a, b) => {
			if (a.dateTime && b.dateTime) {
				return a.dateTime.localeCompare(b.dateTime);
			} else if (a.dateTime) {
				return -1;
			} else if (b.dateTime) {
				return 1;
			} else {
				return a.name.localeCompare(b.name);
			}
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

	/**
	 * Save a plot item to the vault as a markdown file
	 * @param item The plot item data to save
	 */
	async savePlotItem(item: PlotItem): Promise<void> {
		await this.ensureItemFolder();
		const folderPath = this.getEntityFolder('item');
		
		const fileName = `${item.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		const { filePath: currentFilePath, description, history, ...frontmatterData } = item;

		const finalFrontmatter: Record<string, any> = { ...frontmatterData };

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
				// Use corrected regex pattern that captures all sections including final ones
				const allSectionMatches = existingContent.matchAll(/## ([^\n]+)\n([\s\S]*?)(?=\n## |$)/g);
				for (const match of allSectionMatches) {
					const sectionName = match[1].trim();
					const sectionContent = match[2].trim();
					if (sectionContent) {
						customSections[sectionName] = sectionContent;
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
		const files = allFiles.filter(file => 
			file.path.startsWith(folderPath + '/') && 
			file.extension === 'md'
		);

		const items: PlotItem[] = [];
		for (const file of files) {
			const itemData = await this.parseFile<PlotItem>(file, { name: '', isPlotCritical: false });
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
	private async addGroupIdToEntity(type: 'character' | 'event' | 'location' | 'item', id: string, groupId: string): Promise<void> {
		if (type === 'character') {
			const characters = await this.listCharacters();
			const character = characters.find(c => c.id === id);
			if (character) {
				if (!character.groups) character.groups = [];
				if (!character.groups.includes(groupId)) {
					character.groups.push(groupId);
					await this.saveCharacter(character);
				}
			}
		} else if (type === 'location') {
			const locations = await this.listLocations();
			const location = locations.find(l => l.id === id);
			if (location) {
				if (!location.groups) location.groups = [];
				if (!location.groups.includes(groupId)) {
					location.groups.push(groupId);
					await this.saveLocation(location);
				}
			}
		} else if (type === 'event') {
			const events = await this.listEvents();
			const event = events.find(e => e.id === id);
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
			const character = characters.find(c => c.id === id);
			if (character && character.groups && character.groups.includes(groupId)) {
				character.groups = character.groups.filter(gid => gid !== groupId);
				await this.saveCharacter(character);
			}
		} else if (type === 'location') {
			const locations = await this.listLocations();
			const location = locations.find(l => l.id === id);
			if (location && location.groups && location.groups.includes(groupId)) {
				location.groups = location.groups.filter(gid => gid !== groupId);
				await this.saveLocation(location);
			}
		} else if (type === 'event') {
			const events = await this.listEvents();
			const event = events.find(e => e.id === id);
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
            return filePath.startsWith(charFolder + '/') ||
                filePath.startsWith(locFolder + '/') ||
                filePath.startsWith(evtFolder + '/') ||
                filePath.startsWith(itemFolder + '/') || // Add this
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
		if (!this.settings.groups) {
			this.settings.groups = [];
			settingsUpdated = true;
		}

		if(settingsUpdated){
			await this.saveSettings();
		}
	}

	/**
	 * Save current plugin settings to Obsidian's data store
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// Ensure this is the very last line of the file
export {};