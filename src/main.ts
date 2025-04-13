import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath, stringifyYaml, parseYaml, FrontMatterCache, WorkspaceLeaf } from 'obsidian'; // Added WorkspaceLeaf
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

interface StorytellerSuiteSettings {
	characterFolder: string;
	locationFolder: string;
	eventFolder: string;
	galleryUploadFolder: string; // New setting for uploads
	galleryData: GalleryData; // Store gallery metadata here
}

const DEFAULT_SETTINGS: StorytellerSuiteSettings = {
	characterFolder: 'StorytellerSuite/Characters',
	locationFolder: 'StorytellerSuite/Locations',
	eventFolder: 'StorytellerSuite/Events',
	galleryUploadFolder: 'StorytellerSuite/GalleryUploads', // Default upload path
	galleryData: { images: [] }
}

export default class StorytellerSuitePlugin extends Plugin {
	settings: StorytellerSuiteSettings;

	async onload() {
		await this.loadSettings();

		// --- Register View ---
		this.registerView(
			VIEW_TYPE_DASHBOARD,
			(leaf) => new DashboardView(leaf, this)
		);

		// --- Ribbon Icon to Activate View ---
		this.addRibbonIcon('book-open', 'Open Storyteller Dashboard', () => {
			this.activateView();
		}).addClass('storyteller-suite-ribbon-class');

		// --- Dashboard Command ---
		this.addCommand({
			id: 'open-storyteller-suite-dashboard',
			name: 'Open Storyteller Suite Dashboard',
			callback: () => {
				this.activateView(); // Activate view instead of opening modal
			}
		});

		// --- Character Commands ---
		this.addCommand({
			id: 'create-new-character',
			name: 'Create New Character',
			callback: () => {
				// Pass 'this' (plugin instance) as the second argument
				// Add Character type to characterData
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

		// --- Location Commands ---
		this.addCommand({
			id: 'create-new-location',
			name: 'Create New Location',
			callback: () => {
				// Pass 'this' and add Location type
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

		// --- Event Commands ---
		this.addCommand({
			id: 'create-new-event',
			name: 'Create New Event',
			callback: () => {
				// Pass 'this' and add Event type
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

		// --- Gallery Commands ---
		this.addCommand({
			id: 'open-gallery',
			name: 'Open Gallery',
			callback: () => {
				new GalleryModal(this.app, this).open();
			}
		});

		// --- Settings Tab ---
		// this.addSettingTab(new StorytellerSuiteSettingTab(this.app, this)); // Future: Add settings tab
	}

	onunload() {
		console.log('Unloading Storyteller Suite Plugin');
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_DASHBOARD); // Clean up view on unload
	}

	// --- Helper to Activate View ---
	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar
			leaf = workspace.getRightLeaf(false);
			// Check if leaf creation was successful before setting state
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
			} else {
                console.error("Storyteller Suite: Could not create workspace leaf.");
                new Notice("Error opening dashboard: Could not create workspace leaf.");
                return; // Exit if leaf is null
            }
		}

		// Check if leaf is valid before revealing
        if (!leaf) {
             console.error("Storyteller Suite: Workspace leaf is null after attempting to find or create it.");
             new Notice("Error revealing dashboard: Workspace leaf not found.");
             return; // Exit if leaf is null
        }

		// "Reveal" the leaf in case it is in a collapsed sidebar
		workspace.revealLeaf(leaf);
	}

	// --- Generic Folder Ensure ---
	async ensureFolder(folderPath: string): Promise<void> {
		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!folder) {
			await this.app.vault.createFolder(normalizedPath);
			console.log(`Created folder: ${normalizedPath}`);
		} else if (!(folder instanceof TFolder)) {
			const errorMsg = `Error: Path ${normalizedPath} exists but is not a folder. Check Storyteller Suite settings.`;
			new Notice(errorMsg);
			console.error(errorMsg);
			throw new Error(errorMsg);
		}
	}

	// --- Generic File Parsing ---
	async parseFile<T>(file: TFile, typeDefaults: Partial<T>): Promise<T | null> {
		try {
			const fileCache = this.app.metadataCache.getFileCache(file);
			const frontmatter = fileCache?.frontmatter;
			const content = await this.app.vault.cachedRead(file);

			const descriptionMatch = content.match(/## Description\n([\s\S]*?)\n##/);
			const backstoryMatch = content.match(/## Backstory\n([\s\S]*?)\n##/);
			const historyMatch = content.match(/## History\n([\s\S]*?)\n##/);

			const data: Partial<T> = {
				...typeDefaults,
				...(frontmatter as Partial<T>), // This should now include profileImagePath if present
				filePath: file.path,
			};

			if ('description' in typeDefaults && descriptionMatch?.[1]) {
				(data as any).description = descriptionMatch[1].trim();
			}
			if ('backstory' in typeDefaults && backstoryMatch?.[1]) {
				(data as any).backstory = backstoryMatch[1].trim();
			}
			if ('history' in typeDefaults && historyMatch?.[1]) {
				(data as any).history = historyMatch[1].trim();
			}

			if (!(data as any).name) {
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

	// --- Character Data Management ---
	async ensureCharacterFolder(): Promise<void> {
		await this.ensureFolder(this.settings.characterFolder);
	}

	async saveCharacter(character: Character): Promise<void> {
		await this.ensureCharacterFolder();
		const folderPath = this.settings.characterFolder;
		const fileName = `${character.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		const { filePath: currentFilePath, backstory, description, profileImagePath, status, affiliation, ...frontmatterData } = character;

		const finalFrontmatter: Record<string, any> = { ...frontmatterData };
		if (profileImagePath) {
			finalFrontmatter.profileImagePath = profileImagePath;
		}
		if (status) finalFrontmatter.status = status;
		if (affiliation) finalFrontmatter.affiliation = affiliation;

		Object.keys(finalFrontmatter).forEach(key => {
			const k = key as keyof typeof finalFrontmatter;
			if (finalFrontmatter[k] === null || finalFrontmatter[k] === undefined || (Array.isArray(finalFrontmatter[k]) && (finalFrontmatter[k] as any[]).length === 0)) {
				delete finalFrontmatter[k];
			}
		});
		if (finalFrontmatter.customFields && Object.keys(finalFrontmatter.customFields).length === 0) {
			delete finalFrontmatter.customFields;
		}

		const frontmatterString = Object.keys(finalFrontmatter).length > 0 ? stringifyYaml(finalFrontmatter) : '';

		let fileContent = `---\n${frontmatterString}---\n\n`;
		if (description) fileContent += `## Description\n${description.trim()}\n\n`;
		if (backstory) fileContent += `## Backstory\n${backstory.trim()}\n\n`;
		fileContent += `## Relationships\n${(character.relationships || []).map(r => `- [[${r}]]`).join('\n')}\n\n`;
		fileContent += `## Locations\n${(character.locations || []).map(l => `- [[${l}]]`).join('\n')}\n\n`;
		fileContent += `## Events\n${(character.events || []).map(e => `- [[${e}]]`).join('\n')}\n\n`;

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
			console.log(`Updated character file: ${filePath}`);
		} else {
			const newFile = await this.app.vault.create(filePath, fileContent);
			console.log(`Created character file: ${filePath}`);
		}
		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	async listCharacters(): Promise<Character[]> {
		await this.ensureCharacterFolder();
		const folderPath = this.settings.characterFolder;
		const folder = this.app.vault.getAbstractFileByPath(folderPath) as TFolder;
		const files = folder.children.filter(file => file instanceof TFile && file.extension === 'md') as TFile[];

		const characters: Character[] = [];
		for (const file of files) {
			const charData = await this.parseFile<Character>(file, { name: '' });
			if (charData) {
				characters.push(charData);
			}
		}
		return characters.sort((a, b) => a.name.localeCompare(b.name));
	}

	async deleteCharacter(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			await this.app.vault.trash(file, true);
			new Notice(`Character file "${file.basename}" moved to trash.`);
			console.log(`Deleted character file: ${filePath}`);
			this.app.metadataCache.trigger("dataview:refresh-views");
		} else {
			new Notice(`Error: Could not find character file to delete at ${filePath}`);
			console.error(`Error deleting character file: ${filePath} not found or not a file.`);
		}
	}

	// --- Location Data Management ---
	async ensureLocationFolder(): Promise<void> {
		await this.ensureFolder(this.settings.locationFolder);
	}

	async saveLocation(location: Location): Promise<void> {
		await this.ensureLocationFolder();
		const folderPath = this.settings.locationFolder;
		const fileName = `${location.name.replace(/[\\/:"*?<>|]+/g, '')}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

        // REMOVED: characters, events, subLocations from destructuring
		const { filePath: currentFilePath, history, description, locationType, region, status, profileImagePath, ...frontmatterData } = location;
		const finalFrontmatter: Record<string, any> = { ...frontmatterData };
		if (locationType) finalFrontmatter.locationType = locationType;
		if (region) finalFrontmatter.region = region;
		if (status) finalFrontmatter.status = status;
		if (profileImagePath) finalFrontmatter.profileImagePath = profileImagePath;

		Object.keys(finalFrontmatter).forEach(key => {
			const k = key as keyof typeof frontmatterData; // Corrected type reference
            // Check if k exists in finalFrontmatter before accessing
			if (finalFrontmatter.hasOwnProperty(k)) {
                const value = finalFrontmatter[k];
                if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
				    delete finalFrontmatter[k];
			    }
            }
		});
		if (finalFrontmatter.customFields && Object.keys(finalFrontmatter.customFields).length === 0) {
			delete finalFrontmatter.customFields;
		}

		const frontmatterString = Object.keys(finalFrontmatter).length > 0 ? stringifyYaml(finalFrontmatter) : '';

		let fileContent = `---\n${frontmatterString}---\n\n`;
		if (description) fileContent += `## Description\n${description.trim()}\n\n`;
		if (history) fileContent += `## History\n${history.trim()}\n\n`;
		// REMOVED: Lines adding Characters Present, Events Here, Sub-Locations
		// fileContent += `## Characters Present\n${(location.characters || []).map(c => `- [[${c}]]`).join('\n')}\n\n`;
		// fileContent += `## Events Here\n${(location.events || []).map(e => `- [[${e}]]`).join('\n')}\n\n`;
		// fileContent += `## Sub-Locations\n${(location.subLocations || []).map(s => `- [[${s}]]`).join('\n')}\n\n`;

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile && existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, fileContent);
			console.log(`Updated location file: ${filePath}`);
		} else {
			await this.app.vault.create(filePath, fileContent);
			console.log(`Created location file: ${filePath}`);
		}
		this.app.metadataCache.trigger("dataview:refresh-views");
	}

	async listLocations(): Promise<Location[]> {
		await this.ensureLocationFolder();
		const folderPath = this.settings.locationFolder;
		const folder = this.app.vault.getAbstractFileByPath(folderPath) as TFolder;
		const files = folder.children.filter(file => file instanceof TFile && file.extension === 'md') as TFile[];

		const locations: Location[] = [];
		for (const file of files) {
			const locData = await this.parseFile<Location>(file, { name: '' });
			if (locData) {
				locations.push(locData);
			}
		}
		return locations.sort((a, b) => a.name.localeCompare(b.name));
	}

	async deleteLocation(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			await this.app.vault.trash(file, true);
			new Notice(`Location file "${file.basename}" moved to trash.`);
			console.log(`Deleted location file: ${filePath}`);
			this.app.metadataCache.trigger("dataview:refresh-views");
		} else {
			new Notice(`Error: Could not find location file to delete at ${filePath}`);
		}
	}

	// --- Event Data Management ---
	async ensureEventFolder(): Promise<void> {
		await this.ensureFolder(this.settings.eventFolder);
	}

	async saveEvent(event: Event): Promise<void> {
		await this.ensureEventFolder();
		const folderPath = this.settings.eventFolder;
		// Ensure event name is valid for filename
		const safeName = event.name?.replace(/[\\/:"*?<>|#^\[\]]+/g, '') || 'Unnamed Event'; // Added fallback and expanded invalid chars
        const fileName = `${safeName}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);

		// *** MODIFICATION START ***
        // Destructure fields that should NOT be in frontmatter:
        // - filePath: Internal reference
        // - description, outcome: Handled in body content
        // - profileImagePath, images: Explicitly excluded by user request
		const {
            filePath: currentFilePath,
            description,
            outcome,
            profileImagePath, // Destructure to exclude from frontmatterData
            images,          // Destructure to exclude from frontmatterData
            ...frontmatterData // Keep the rest (name, dateTime, location, characters, status, customFields)
        } = event;

        // Create the final frontmatter object from the remaining data
		const finalFrontmatter: Record<string, any> = { ...frontmatterData };

        // Clean up empty/null values from finalFrontmatter
        // Note: profileImagePath and images are already excluded
		Object.keys(finalFrontmatter).forEach(key => {
			const k = key as keyof typeof finalFrontmatter;
            const value = finalFrontmatter[k];
			if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
				delete finalFrontmatter[k];
			}
            // Ensure location field is kept even if empty string, but removed if null/undefined
			if (k === 'location' && value === undefined) delete finalFrontmatter[k];
		});
        // Remove empty customFields object
		if (finalFrontmatter.customFields && Object.keys(finalFrontmatter.customFields).length === 0) {
			delete finalFrontmatter.customFields;
		}
        // *** MODIFICATION END ***

		const frontmatterString = Object.keys(finalFrontmatter).length > 0 ? stringifyYaml(finalFrontmatter) : '';

        // --- Construct Body Content (KEEPING original sections) ---
		let fileContent = `---\n${frontmatterString}---\n\n`;
		if (description) fileContent += `## Description\n${description.trim()}\n\n`;
		if (outcome) fileContent += `## Outcome\n${outcome.trim()}\n\n`;
        // Keep Characters section - uses data from frontmatterData
		fileContent += `## Characters Involved\n${(finalFrontmatter.characters || []).map((c: string) => `- [[${c}]]`).join('\n')}\n\n`;
        // Keep Location section - uses data from frontmatterData
		if (finalFrontmatter.location) fileContent += `## Location\n- [[${finalFrontmatter.location}]]\n\n`;
        // Keep Associated Images section - uses the 'images' variable we destructured earlier
		fileContent += `## Associated Images\n${(images || []).map(i => `- [[${i}]]`).join('\n')}\n\n`;

		// --- Save File ---
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile && existingFile instanceof TFile) {
			// Handle potential file rename if name changed
            if (existingFile.path !== filePath) {
                console.log(`Renaming event file from ${existingFile.path} to ${filePath}`);
                await this.app.fileManager.renameFile(existingFile, filePath);
                // Need to re-get the file reference after rename
                const renamedFile = this.app.vault.getAbstractFileByPath(filePath);
                if (renamedFile instanceof TFile) {
                    await this.app.vault.modify(renamedFile, fileContent);
                } else {
                     console.error(`Error finding event file after rename: ${filePath}`);
                     new Notice(`Error saving renamed event file: ${fileName}`);
                     return; // Avoid further errors
                }
            } else {
			    await this.app.vault.modify(existingFile, fileContent);
            }
			console.log(`Updated event file: ${filePath}`);
		} else {
			const newFile = await this.app.vault.create(filePath, fileContent);
			console.log(`Created event file: ${filePath}`);
		}
		this.app.metadataCache.trigger("dataview:refresh-views"); // Refresh Dataview if used
	}

	async listEvents(): Promise<Event[]> {
		await this.ensureEventFolder();
		const folderPath = this.settings.eventFolder;
		const folder = this.app.vault.getAbstractFileByPath(folderPath) as TFolder;
		const files = folder.children.filter(file => file instanceof TFile && file.extension === 'md') as TFile[];

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

	async deleteEvent(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (file instanceof TFile) {
			await this.app.vault.trash(file, true);
			new Notice(`Event file "${file.basename}" moved to trash.`);
			console.log(`Deleted event file: ${filePath}`);
			this.app.metadataCache.trigger("dataview:refresh-views");
		} else {
			new Notice(`Error: Could not find event file to delete at ${filePath}`);
		}
	}

	// --- Gallery Data Management ---
	getGalleryImages(): GalleryImage[] {
		if (!this.settings.galleryData) {
			this.settings.galleryData = { images: [] };
		}
		if (!this.settings.galleryData.images) {
			this.settings.galleryData.images = [];
		}
		return this.settings.galleryData.images;
	}

	async addGalleryImage(imageData: Omit<GalleryImage, 'id'>): Promise<GalleryImage> {
		const newImage: GalleryImage = {
			...imageData,
			id: Date.now().toString() + Math.random().toString(36).substring(2, 15)
		};
		this.getGalleryImages().push(newImage);
		await this.saveSettings();
		new Notice(`Image "${newImage.filePath}" added to gallery.`);
		return newImage;
	}

	async updateGalleryImage(updatedImage: GalleryImage): Promise<void> {
		const images = this.getGalleryImages();
		const index = images.findIndex(img => img.id === updatedImage.id);
		if (index !== -1) {
			images[index] = updatedImage;
			await this.saveSettings();
			new Notice(`Image "${updatedImage.filePath}" updated.`);
		} else {
			console.error(`Gallery image with ID ${updatedImage.id} not found for update.`);
			new Notice(`Error updating image.`);
		}
	}

	async deleteGalleryImage(imageId: string): Promise<void> {
		const images = this.getGalleryImages();
		const index = images.findIndex(img => img.id === imageId);
		if (index !== -1) {
			const deletedImage = images.splice(index, 1)[0];
			await this.saveSettings();
			new Notice(`Image "${deletedImage.filePath}" removed from gallery.`);
		} else {
			console.error(`Gallery image with ID ${imageId} not found for deletion.`);
			new Notice(`Error removing image.`);
		}
	}

	// --- Settings ---
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Ensure galleryUploadFolder exists if loading older data
		if (!this.settings.galleryUploadFolder) {
			this.settings.galleryUploadFolder = DEFAULT_SETTINGS.galleryUploadFolder;
		}
		if (!this.settings.galleryData) this.settings.galleryData = { images: [] };
		if (!this.settings.galleryData.images) this.settings.galleryData.images = [];
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// Ensure this is the very last line of the file
export {};
