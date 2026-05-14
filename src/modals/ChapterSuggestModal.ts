import { App, FuzzySuggestModal, Notice, FuzzyMatch, prepareFuzzySearch } from 'obsidian';
import { Chapter } from '../types';
import StorytellerSuitePlugin from '../main';

interface InputRefreshableSuggestModal {
    onInputChanged?: () => void;
}

export class ChapterSuggestModal extends FuzzySuggestModal<Chapter | 'new'> {
    plugin: StorytellerSuitePlugin;
    onChoose: (ch: Chapter | 'new') => void;
    private chapters: Chapter[] = [];

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (ch: Chapter | 'new') => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder('Select a chapter to edit, or type to filter…');
    }

    async onOpen() {
        void super.onOpen();
        try {
            this.chapters = (await this.plugin.listChapters())
                .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
        } catch {
            new Notice('Error loading chapters');
            this.chapters = [];
        }
        window.setTimeout(() => {
            try { this.inputEl?.dispatchEvent(new window.Event('input')); } catch { /* Ignore best-effort refresh errors. */ }
            try { (this as unknown as InputRefreshableSuggestModal).onInputChanged?.(); } catch { /* Ignore best-effort refresh errors. */ }
        }, 0);
    }

    getSuggestions(query: string): FuzzyMatch<Chapter | 'new'>[] {
        const newItem: FuzzyMatch<Chapter | 'new'> = {
            item: 'new' as const,
            match: { score: query ? -1 : 1, matches: [] },
        };
        if (!query) {
            return [newItem, ...this.chapters.map(ch => ({ item: ch, match: { score: 0, matches: [] } }))];
        }
        const fuzzy = prepareFuzzySearch(query);
        const results = this.chapters
            .map(ch => {
                const m = fuzzy(this.getItemText(ch));
                if (!m) return null;
                const result: FuzzyMatch<Chapter | 'new'> = { item: ch, match: m };
                return result;
            })
            .filter((r): r is FuzzyMatch<Chapter | 'new'> => !!r);
        return [newItem, ...results];
    }

    getItems(): (Chapter | 'new')[] { return ['new' as const, ...this.chapters]; }
    getItemText(item: Chapter | 'new'): string {
        if (item === 'new') return '+ New chapter';
        return `${item.number != null ? `${item.number}. ` : ''}${item.name || 'Unnamed chapter'}`;
    }
    onChooseItem(item: Chapter | 'new'): void { this.onChoose(item); }
}
