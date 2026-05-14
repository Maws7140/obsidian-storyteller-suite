import { App, FuzzySuggestModal, Notice, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { CompendiumEntry } from '../types';
import StorytellerSuitePlugin from '../main';
import { scheduleSuggestRefresh } from './utils/SuggestModalRefresh';

export class CompendiumEntrySuggestModal extends FuzzySuggestModal<CompendiumEntry> {
    plugin: StorytellerSuitePlugin;
    onChoose: (entry: CompendiumEntry) => void;
    entries: CompendiumEntry[] = [];

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (entry: CompendiumEntry) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder('Select compendium entry…');
    }

    getSuggestions(query: string): FuzzyMatch<CompendiumEntry>[] {
        const items = this.getItems();
        if (!query) {
            return items.map(e => ({ item: e, match: { score: 0, matches: [] } }));
        }
        const fuzzy = prepareFuzzySearch(query);
        return items
            .map(e => {
                const match = fuzzy(this.getItemText(e));
                return match ? ({ item: e, match }) : null;
            })
            .filter((fm): fm is FuzzyMatch<CompendiumEntry> => !!fm);
    }

    async onOpen() {
        void super.onOpen();
        try {
            this.entries = await this.plugin.listCompendiumEntries();
        } catch (error) {
            
            new Notice('Error loading compendium entries.');
            this.entries = [];
        }
        scheduleSuggestRefresh(this);
    }

    getItems(): CompendiumEntry[] {
        return this.entries;
    }

    getItemText(item: CompendiumEntry): string {
        return item.name || 'Unnamed entry';
    }

    onChooseItem(item: CompendiumEntry, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}
