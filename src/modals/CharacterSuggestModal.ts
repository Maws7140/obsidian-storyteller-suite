import { App, FuzzySuggestModal, Notice } from 'obsidian';
import { Character } from '../types';
import StorytellerSuitePlugin from '../main';

export class CharacterSuggestModal extends FuzzySuggestModal<Character> {
	plugin: StorytellerSuitePlugin;
	onChoose: (character: Character) => void;
    characters: Character[] = []; // Store characters locally

	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (character: Character) => void) {
		super(app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a character to link...");
	}

    // Override onOpen to fetch data asynchronously *before* getItems is needed
    async onOpen() {
        super.onOpen(); // Important: Call parent onOpen
        try {
            this.characters = await this.plugin.listCharacters();
        } catch (error) {
            console.error("Storyteller Suite: Error fetching characters for suggester:", error);
            new Notice("Error loading characters. Check console.");
            this.characters = []; // Ensure it's an empty array on error
        }
        // Note: We don't explicitly refresh the suggestions here,
        // as FuzzySuggestModal typically calls getItems after onOpen/when input changes.
    }

	// getItems is now synchronous and returns the pre-fetched list
	getItems(): Character[] {
		return this.characters;
	}

	getItemText(item: Character): string {
		return item.name || 'Unnamed Character';
	}

	onChooseItem(item: Character, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item);
	}
}