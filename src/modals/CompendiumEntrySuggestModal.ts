import { App, FuzzySuggestModal, Notice, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { CompendiumEntry } from '../types';
import StorytellerSuitePlugin from '../main';

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
                return match ? ({ item: e, match } as FuzzyMatch<CompendiumEntry>) : null;
            })
            .filter((fm): fm is FuzzyMatch<CompendiumEntry> => !!fm);
    }

    async onOpen() {
        super.onOpen();
        try {
            this.entries = await this.plugin.listCompendiumEntries();
        } catch (error) {
            console.error('[CompendiumEntrySuggestModal] Error fetching entries:', error);
            new Notice('Error loading compendium entries.');
            this.entries = [];
        }
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
