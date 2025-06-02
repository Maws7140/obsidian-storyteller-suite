/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Notice, Plugin, TFile, TFolder, normalizePath, stringifyYaml, WorkspaceLeaf } from 'obsidian'; // Added WorkspaceLeaf
import { CharacterModal } from './modals/CharacterModal';
import { Character, Location, Event, GalleryImage, GalleryData } from './types';
import { CharacterListModal } from './modals/CharacterListModal';
import { LocationModal } from './modals/LocationModal';
import { LocationListModal } from './modals/LocationListModal';
import { EventModal } from './modals/EventModal';
import { TimelineModal } from './modals/TimelineModal';
import { GalleryModal } from './modals/GalleryModal';
import { ImageDetailModal } from './modals/ImageDetailModal';
import { DashboardView, VIEW_TYPE_DASHBOARD } from './views/DashboardView'; // New Import
import { GalleryImageSuggestModal } from './modals/GalleryImageSuggestModal'; // Added

/**
 * Plugin settings interface defining all configurable options
 * These settings are persisted in Obsidian's data.json file
 */
interface StorytellerSuiteSettings {
	characterFolder: string;
	locationFolder: string;
	eventFolder: string;
	galleryUploadFolder: string; // New setting for uploads
	galleryData: GalleryData; // Store gallery metadata here
}

/**
 * Default plugin settings - used on first install or when settings are missing
 */
const DEFAULT_SETTINGS: StorytellerSuiteSettings = {
	characterFolder: 'StorytellerSuite/Characters',
	locationFolder: 'StorytellerSuite/Locations',
	eventFolder: 'StorytellerSuite/Events',
	galleryUploadFolder: 'StorytellerSuite/GalleryUploads',
	galleryData: { images: [] }
}

/**
 * Main plugin class for Storyteller Suite
 * Manages storytelling entities (characters, locations, events) and provides
 * a unified dashboard interface for story management
 */
export default class StorytellerSuitePlugin extends Plugin {
	settings: StorytellerSuiteSettings;

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
		this.addRibbonIcon('book-open', 'Open Storyteller Dashboard', () => {
			this.activateView();
		}).addClass('storyteller-suite-ribbon-class');

		// Register command palette commands
		this.registerCommands();

		// TODO: Add settings tab for user configuration
		// this.addSettingTab(new StorytellerSuiteSettingTab(this.app, this));
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
			name: 'Open Dashboard',
			callback: () => {
				this.activateView();
			}
		});

		// Character management commands
		this.addCommand({
			id: 'create-new-character',
			name: 'Create New Character',
			callback: () => {
				new CharacterModal(this.app, this, null, async (characterData: Character) => {
					await this.saveCharacter(characterData);
					new Notice(`Character "${characterData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-characters',
			name: 'View Characters',
			callback: async () => {
				const characters = await this.listCharacters();
				new CharacterListModal(this.app, this, characters).open();
			}
		});

		// Location management commands
		this.addCommand({
			id: 'create-new-location',
			name: 'Create New Location',
			callback: () => {
				new LocationModal(this.app, this, null, async (locationData: Location) => {
					await this.saveLocation(locationData);
					new Notice(`Location "${locationData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-locations',
			name: 'View Locations',
			callback: async () => {
				const locations = await this.listLocations();
				new LocationListModal(this.app, this, locations).open();
			}
		});

		// Event management commands
		this.addCommand({
			id: 'create-new-event',
			name: 'Create New Event',
			callback: () => {
				new EventModal(this.app, this, null, async (eventData: Event) => {
					await this.saveEvent(eventData);
					new Notice(`Event "${eventData.name}" created.`);
				}).open();
			}
		});

		this.addCommand({
			id: 'view-timeline',
			name: 'View Timeline',
			callback: async () => {
				const events = await this.listEvents();
				new TimelineModal(this.app, this, events).open();
			}
		});

		// Gallery management command
		this.addCommand({
			id: 'open-gallery',
			name: 'Open Gallery',
			callback: () => {
				new GalleryModal(this.app, this).open();
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
	 * Extracts frontmatter and markdown content sections
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
			
			// Extract common markdown sections using regex
			const descriptionMatch = content.match(/## Description\n([\s\S]*?)\n##/);
			const backstoryMatch = content.match(/## Backstory\n([\s\S]*?)\n##/);
			const historyMatch = content.match(/## History\n([\s\S]*?)\n##/);

			// Combine frontmatter and defaults with file path
			const data: Record<string, unknown> = {
				...typeDefaults as unknown as Record<string, unknown>,
				...frontmatter,
				filePath: file.path,
			};

			// Add extracted markdown content to data
			if ('description' in typeDefaults && descriptionMatch?.[1]) {
				data['description'] = descriptionMatch[1].trim();
			}
			if ('backstory' in typeDefaults && backstoryMatch?.[1]) {
				data['backstory'] = backstoryMatch[1].trim();
			}
			if ('history' in typeDefaults && historyMatch?.[1]) {
				data['history'] = historyMatch[1].trim();
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
	 * Ensure the character folder exists
	 */
	async ensureCharacterFolder(): Promise<void> {
		await this.ensureFolder(this.settings.characterFolder);
	}

	/**
	 * Save a character to the vault as a markdown file
	 * Creates frontmatter from character properties and adds markdown sections
	 * @param character The character data to save
	 */
	async saveCharacter(character: Character): Promise<void> {
		await this.ensureCharacterFolder();
		const folderPath = this.settings.characterFolder;
		
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

		// Build file content with frontmatter and markdown sections
		let fileContent = `---\n${frontmatterString}---\n\n`;
		if (description) fileContent += `## Description\n${description.trim()}\n\n`;
		if (backstory) fileContent += `## Backstory\n${backstory.trim()}\n\n`;
		
		// Add relationship and connection sections
		fileContent += `## Relationships\n${(character.relationships || []).map(r => `- [[${r}]]`).join('\n')}\n\n`;
		fileContent += `## Locations\n${(character.locations || []).map(l => `- [[${l}]]`).join('\n')}\n\n`;
		fileContent += `## Events\n${(character.events || []).map(e => `- [[${e}]]`).join('\n')}\n\n`;

		// Save or update the file
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
		} else {
			await this.app.vault.create(filePath, fileContent);
		}
		
		// Trigger dataview refresh for plugins that depend on this data
		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	/**
	 * Load all characters from the character folder
	 * @returns Array of character objects sorted by name
	 */
	async listCharacters(): Promise<Character[]> {
		await this.ensureCharacterFolder();
		const folderPath = this.settings.characterFolder;
		
		// Get the character folder
		const f = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(f instanceof TFolder)) {
			new Notice(`Character folder not found: ${folderPath}`);
			return [];
		}
		
		// Filter for markdown files only
		const files = f.children.filter((file): file is TFile => file instanceof TFile && file.extension === 'md');

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
	 * Ensure the location folder exists
	 */
	async ensureLocationFolder(): Promise<void> {
		await this.ensureFolder(this.settings.locationFolder);
	}

	/**
	 * Save a location to the vault as a markdown file
	 * @param location The location data to save
	 */
	async saveLocation(location: Location): Promise<void> {
		await this.ensureLocationFolder();
		const folderPath = this.settings.locationFolder;
		
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

		// Build file content with frontmatter and markdown sections
		let fileContent = `---\n${frontmatterString}---\n\n`;
		if (description) fileContent += `## Description\n${description.trim()}\n\n`;
		if (history) fileContent += `## History\n${history.trim()}\n\n`;

		// Save or update the file
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
		} else {
			await this.app.vault.create(filePath, fileContent);
		}
		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	/**
	 * Load all locations from the location folder
	 * @returns Array of location objects sorted by name
	 */
	async listLocations(): Promise<Location[]> {
		await this.ensureLocationFolder();
		const folderPath = this.settings.locationFolder;
		
		// Get the location folder
		const f = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(f instanceof TFolder)) {
			new Notice(`Location folder not found: ${folderPath}`);
			return [];
		}
		
		// Filter for markdown files only
		const files = f.children.filter((file): file is TFile => file instanceof TFile && file.extension === 'md');

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
	 * Ensure the event folder exists
	 */
	async ensureEventFolder(): Promise<void> {
		await this.ensureFolder(this.settings.eventFolder);
	}

	/**
	 * Save an event to the vault as a markdown file
	 * @param event The event data to save
	 */
	async saveEvent(event: Event): Promise<void> {
		await this.ensureEventFolder();
		const folderPath = this.settings.eventFolder;
		
		// Create safe filename from event name
		const safeName = event.name?.replace(/[\\/:"*?<>|#^\[\]]+/g, '') || 'Unnamed Event';
		const fileName = `${safeName}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// Separate content fields from frontmatter fields
		// Profile images and associated images are excluded from frontmatter
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

		// Clean up empty values from frontmatter
		Object.keys(finalFrontmatter).forEach(key => {
			const k = key as keyof typeof finalFrontmatter;
			const value = finalFrontmatter[k];
			if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
				delete finalFrontmatter[k];
			}
			// Special handling for location field
			if (k === 'location' && value === undefined) delete finalFrontmatter[k];
		});
		
		// Remove empty customFields object
		if (finalFrontmatter.customFields && Object.keys(finalFrontmatter.customFields).length === 0) {
			delete finalFrontmatter.customFields;
		}

		// Generate YAML frontmatter string
		const frontmatterString = Object.keys(finalFrontmatter).length > 0 ? stringifyYaml(finalFrontmatter) : '';

		// Build file content with frontmatter and markdown sections
		let fileContent = `---\n${frontmatterString}---\n\n`;
		if (description) fileContent += `## Description\n${description.trim()}\n\n`;
		if (outcome) fileContent += `## Outcome\n${outcome.trim()}\n\n`;
		
		// Add relationship and connection sections
		fileContent += `## Characters Involved\n${(finalFrontmatter.characters || []).map((c: string) => `- [[${c}]]`).join('\n')}\n\n`;
		if (finalFrontmatter.location) fileContent += `## Location\n- [[${finalFrontmatter.location}]]\n\n`;
		fileContent += `## Associated Images\n${(images || []).map(i => `- [[${i}]]`).join('\n')}\n\n`;

		// Save or update the file (handle potential renames)
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile && existingFile instanceof TFile) {
			// Check if file needs to be renamed (name changed)
			if (existingFile.path !== filePath) {
				console.log(`Renaming event file from ${existingFile.path} to ${filePath}`);
				await this.app.fileManager.renameFile(existingFile, filePath);
				
				// Get renamed file reference and update content
				const renamedFile = this.app.vault.getAbstractFileByPath(filePath);
				if (renamedFile instanceof TFile) {
					await this.app.vault.modify(renamedFile, fileContent);
				} else {
					console.error(`Error finding event file after rename: ${filePath}`);
					new Notice(`Error saving renamed event file: ${fileName}`);
					return;
				}
			} else {
				// File name unchanged, just update content
				await this.app.vault.modify(existingFile, fileContent);
			}
		} else {
			// Create new file
			await this.app.vault.create(filePath, fileContent);
		}
		
		// Trigger dataview refresh for plugins that depend on this data
		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	/**
	 * Load all events from the event folder
	 * @returns Array of event objects sorted by date/time, then by name
	 */
	async listEvents(): Promise<Event[]> {
		await this.ensureEventFolder();
		const folderPath = this.settings.eventFolder;
		
		// Get the event folder
		const f = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(f instanceof TFolder)) {
			new Notice(`Event folder not found: ${folderPath}`);
			return [];
		}
		
		// Filter for markdown files only
		const files = f.children.filter((file): file is TFile => file instanceof TFile && file.extension === 'md');

		// Parse each event file
		const events: Event[] = [];
		for (const file of files) {
			const eventData = await this.parseFile<Event>(file, { name: '' });
			if (eventData) {
				events.push(eventData);
			}
		}
		
		// Sort by date/time first, then by name for events without dates
		return events.sort((a, b) => {
			if (a.dateTime && b.dateTime) {
				return a.dateTime.localeCompare(b.dateTime);
			} else if (a.dateTime) {
				return -1; // Events with dates come first
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
	 * Settings Management
	 * Methods for loading and saving plugin configuration
	 */

	/**
	 * Load plugin settings from Obsidian's data store
	 * Merges with defaults for missing settings (backward compatibility)
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// Ensure backward compatibility for new settings
		if (!this.settings.galleryUploadFolder) {
			this.settings.galleryUploadFolder = DEFAULT_SETTINGS.galleryUploadFolder;
		}
		if (!this.settings.galleryData) {
			this.settings.galleryData = DEFAULT_SETTINGS.galleryData;
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
