import { App, FuzzySuggestModal, Notice, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { PlotItem } from '../types';
import StorytellerSuitePlugin from '../main';

export class PlotItemSuggestModal extends FuzzySuggestModal<PlotItem> {
	plugin: StorytellerSuitePlugin;
	onChoose: (item: PlotItem) => void;
    items: PlotItem[] = [];

	constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (item: PlotItem) => void) {
		super(app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder("Select an item to link...");
	}

    async onOpen() {
        super.onOpen();
        try {
            this.items = await this.plugin.listPlotItems();
        } catch (error) {
            console.error('Storyteller Suite: Error fetching items for suggester:', error);
            new Notice('Error loading items. Check console.');
            this.items = [];
        }
        // Force-refresh suggestions so initial list shows without typing
        setTimeout(() => {
            if (this.inputEl) {
                try { (this as any).setQuery?.(''); } catch {}
                try { this.inputEl.dispatchEvent(new window.Event('input')); } catch {}
            }
            try { (this as any).onInputChanged?.(); } catch {}
        }, 0);
        setTimeout(() => {
            if (this.inputEl) {
                try { (this as any).setQuery?.(''); } catch {}
                try { this.inputEl.dispatchEvent(new window.Event('input')); } catch {}
            }
            try { (this as any).onInputChanged?.(); } catch {}
        }, 50);
    }

    // Show all items initially; fuzzy-match when there is a query
    getSuggestions(query: string): FuzzyMatch<PlotItem>[] {
        const items = this.getItems();
        if (!query) {
            return items.map((it) => ({ item: it, match: { score: 0, matches: [] } }));
        }
        const fuzzy = prepareFuzzySearch(query);
        return items
            .map((it) => {
                const match = fuzzy(this.getItemText(it));
                return match ? ({ item: it, match } as FuzzyMatch<PlotItem>) : null;
            })
            .filter((fm): fm is FuzzyMatch<PlotItem> => !!fm);
    }

	getItems(): PlotItem[] {
		return this.items;
	}

	getItemText(item: PlotItem): string {
		return item.name || 'Unnamed item';
	}

	onChooseItem(item: PlotItem, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item);
	}
}