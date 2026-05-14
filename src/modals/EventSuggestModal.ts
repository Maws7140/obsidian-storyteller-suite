import { App, FuzzySuggestModal, Notice, prepareFuzzySearch, FuzzyMatch } from 'obsidian';
import { Event } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { scheduleSuggestRefresh } from './utils/SuggestModalRefresh';

export class EventSuggestModal extends FuzzySuggestModal<Event> {
    plugin: StorytellerSuitePlugin;
    onChoose: (event: Event) => void;
    events: Event[] = [];

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (event: Event) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder(t('selectEventPh'));
    }

    // Show all items initially; fuzzy-match when there is a query
    getSuggestions(query: string): FuzzyMatch<Event>[] {
        const items = this.getItems();
        if (!query) {
            return items.map((e) => ({ item: e, match: { score: 0, matches: [] } }));
        }
        const fuzzy = prepareFuzzySearch(query);
        return items
            .map((e) => {
                const match = fuzzy(this.getItemText(e));
                return match ? ({ item: e, match }) : null;
            })
            .filter((fm): fm is FuzzyMatch<Event> => !!fm);
    }

    async onOpen() {
        void super.onOpen();
        try {
            this.events = await this.plugin.listEvents();
        } catch (error) {
            console.error('Storyteller Suite: Error fetching events for suggester:', error);
            new Notice(t('errorLoadingEvents'));
            this.events = [];
        }
        // Force-refresh suggestions so initial list shows without typing.
        scheduleSuggestRefresh(this);
    }

    getItems(): Event[] {
        return this.events;
    }

    getItemText(item: Event): string {
        return item.name || 'Unnamed event';
    }

    onChooseItem(item: Event, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
} 
