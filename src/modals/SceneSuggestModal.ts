import { App, FuzzySuggestModal, Notice, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { Scene } from '../types';
import StorytellerSuitePlugin from '../main';

interface InputRefreshableSuggestModal {
    onInputChanged?: () => void;
}

export class SceneSuggestModal extends FuzzySuggestModal<Scene> {
    plugin: StorytellerSuitePlugin;
    onChoose: (scene: Scene) => void;
    scenes: Scene[] = [];

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (scene: Scene) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder('Search scenes…');
    }

    async onOpen() {
        void super.onOpen();
        try {
            this.scenes = await this.plugin.listScenes();
        } catch {
            new Notice('Error loading scenes');
            this.scenes = [];
        }
        window.setTimeout(() => {
            if (this.inputEl) {
                try { this.inputEl.dispatchEvent(new window.Event('input')); } catch { /* Ignore best-effort refresh errors. */ }
            }
            try { (this as unknown as InputRefreshableSuggestModal).onInputChanged?.(); } catch { /* Ignore best-effort refresh errors. */ }
        }, 0);
    }

    getSuggestions(query: string): FuzzyMatch<Scene>[] {
        if (!query) {
            return this.scenes.map(s => ({ item: s, match: { score: 0, matches: [] } }));
        }
        const fuzzy = prepareFuzzySearch(query);
        return this.scenes
            .map(s => {
                const match = fuzzy(this.getItemText(s));
                if (match) return { item: s, match };
                return null;
            })
            .filter((fm): fm is FuzzyMatch<Scene> => !!fm);
    }

    getItems(): Scene[] { return this.scenes; }
    getItemText(item: Scene): string { return item.name || 'Unnamed scene'; }
    onChooseItem(item: Scene): void { this.onChoose(item); }
}
