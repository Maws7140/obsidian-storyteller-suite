import { App, FuzzySuggestModal, Notice, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { Location } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { scheduleSuggestRefresh } from './utils/SuggestModalRefresh';

export class LocationSuggestModal extends FuzzySuggestModal<Location> {
	plugin: StorytellerSuitePlugin;
	onChoose: (location: Location | null) => void;
    locations: Location[] = []; // Store locations locally

	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (location: Location | null) => void) {
		super(app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder(t('selectEventLocationPh'));
        this.setInstructions([{ command: 'Shift + Enter', purpose: 'Clear selection (No Location)' }]);
	}

    // Override onOpen to fetch data asynchronously *before* getItems is needed
    async onOpen() {
        void super.onOpen(); // Important: Call parent onOpen
        try {
            this.locations = await this.plugin.listLocations();
        } catch (error) {
            
            new Notice(t('errorLoadingLocations'));
            this.locations = []; // Ensure it's an empty array on error
        }
        // Force-refresh suggestions so initial list shows without typing.
        scheduleSuggestRefresh(this);
    }

    // Show all items initially; fuzzy-match when there is a query
    getSuggestions(query: string): FuzzyMatch<Location>[] {
        const items = this.getItems();
        if (!query) {
            return items.map((loc) => ({ item: loc, match: { score: 0, matches: [] } }));
        }
        const fuzzy = prepareFuzzySearch(query);
        return items
            .map((loc) => {
                const match = fuzzy(this.getItemText(loc));
                return match ? ({ item: loc, match }) : null;
            })
            .filter((fm): fm is FuzzyMatch<Location> => !!fm);
    }

	// getItems is now synchronous and returns the pre-fetched list
	getItems(): Location[] {
		return this.locations;
	}

	getItemText(item: Location): string {
        return item.name || 'Unnamed location';
	}

	onChooseItem(item: Location, evt: MouseEvent | KeyboardEvent): void {
        if (evt.shiftKey) {
            this.onChoose(null);
        } else {
		    this.onChoose(item);
        }
	}
}
