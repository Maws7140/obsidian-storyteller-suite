import { App, FuzzySuggestModal, Notice, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import StorytellerSuitePlugin from '../main';

/**
 * Generic base class for entity suggestion modals
 * Eliminates duplicate code across CharacterSuggestModal, LocationSuggestModal, etc.
 */
export abstract class BaseEntitySuggestModal<T> extends FuzzySuggestModal<T> {
	plugin: StorytellerSuitePlugin;
	onChoose: (item: T | null) => void;
	items: T[] = []; // Store items locally

	constructor(
		app: App,
		plugin: StorytellerSuitePlugin,
		onChoose: (item: T | null) => void,
		placeholder: string,
		instructions?: Array<{ command: string; purpose: string }>
	) {
		super(app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder(placeholder);
		if (instructions) {
			this.setInstructions(instructions);
		}
	}

	/**
	 * Override to specify how to load items from the plugin
	 */
	abstract loadItems(): Promise<T[]>;

	/**
	 * Override to specify error message key
	 */
	abstract getErrorMessage(): string;

	/**
	 * Override to specify how to display the item text
	 */
	abstract getItemText(item: T): string;

	/**
	 * Override to handle special key combinations (e.g., shift-enter for clearing)
	 * Default: just call onChoose with the item
	 */
	handleChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item);
	}

	// Override onOpen to fetch data asynchronously *before* getItems is needed
	async onOpen() {
		super.onOpen(); // Important: Call parent onOpen
		try {
			this.items = await this.loadItems();
		} catch (error) {
			console.error(`Storyteller Suite: Error fetching items for suggester:`, error);
			new Notice(this.getErrorMessage());
			this.items = []; // Ensure it's an empty array on error
		}
		// Force-refresh suggestions so initial list shows without typing
		this.refreshSuggestions();
		// Safety: run a second refresh shortly after in case layout wasn't ready
		setTimeout(() => this.refreshSuggestions(), 50);
	}

	/**
	 * Force refresh the suggestions list
	 */
	private refreshSuggestions() {
		if (this.inputEl) {
			try { (this as any).setQuery?.(''); } catch {}
			try { this.inputEl.dispatchEvent(new window.Event('input')); } catch {}
		}
		try { (this as any).onInputChanged?.(); } catch {}
	}

	// Override getSuggestions to show all items when query is empty
	getSuggestions(query: string): FuzzyMatch<T>[] {
		if (!query) {
			// Return all items as FuzzyMatch with a dummy match
			return this.items.map((item) => ({
				item,
				match: { score: 0, matches: [] }
			}));
		}
		const fuzzy = prepareFuzzySearch(query);
		return this.items
			.map((item) => {
				const match = fuzzy(this.getItemText(item));
				if (match) return { item, match } as FuzzyMatch<T>;
				return null;
			})
			.filter((fm): fm is FuzzyMatch<T> => !!fm);
	}

	// getItems is now synchronous and returns the pre-fetched list
	getItems(): T[] {
		return this.items;
	}

	onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void {
		this.handleChooseItem(item, evt);
	}
}
