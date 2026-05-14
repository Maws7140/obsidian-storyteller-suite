import { App, FuzzySuggestModal, Notice, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { Character } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { scheduleSuggestRefresh } from './utils/SuggestModalRefresh';

export class CharacterSuggestModal extends FuzzySuggestModal<Character> {
	plugin: StorytellerSuitePlugin;
	onChoose: (character: Character) => void;
    characters: Character[] = []; // Store characters locally

	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (character: Character) => void) {
		super(app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder(t('selectCharacterPh'));
	}

    // Override onOpen to fetch data asynchronously *before* getItems is needed
    async onOpen() {
        void super.onOpen(); // Important: Call parent onOpen
        try {
            this.characters = await this.plugin.listCharacters();
        } catch (error) {
            
            new Notice(t('errorLoadingCharacters'));
            this.characters = []; // Ensure it's an empty array on error
        }
        // Force-refresh suggestions so initial list shows without typing.
        scheduleSuggestRefresh(this);
    }

	// Override getSuggestions to show all items when query is empty
	getSuggestions(query: string): FuzzyMatch<Character>[] {
		if (!query) {
			// Return all items as FuzzyMatch with a dummy match
			return this.characters.map((c) => ({
				item: c,
				match: { score: 0, matches: [] }
			}));
		}
		const fuzzy = prepareFuzzySearch(query);
		return this.characters
			.map((c) => {
				const match = fuzzy(this.getItemText(c));
				if (match) return { item: c, match };
				return null;
			})
			.filter((fm): fm is FuzzyMatch<Character> => !!fm);
	}

	// getItems is now synchronous and returns the pre-fetched list
	getItems(): Character[] {
		return this.characters;
	}

	getItemText(item: Character): string {
		return item.name || 'Unnamed character';
	}

	onChooseItem(item: Character, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item);
	}
}
