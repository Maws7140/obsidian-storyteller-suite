import { App, FuzzySuggestModal, FuzzyMatch, Notice, prepareFuzzySearch } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { scheduleSuggestRefresh } from './utils/SuggestModalRefresh';

export interface EntitySuggestion {
    kind: 'character' | 'location' | 'event' | 'item' | 'group';
    id?: string;
    name: string;
}

const KIND_LABELS: Record<EntitySuggestion['kind'], string> = {
    character: 'Character',
    location: 'Location',
    event: 'Event',
    item: 'Item',
    group: 'Group',
};

/**
 * Cross-type entity picker for connection targets: characters, locations,
 * events, items, and groups of the active story in one fuzzy list.
 */
export class EntitySuggestModal extends FuzzySuggestModal<EntitySuggestion> {
    plugin: StorytellerSuitePlugin;
    onChoose: (entity: EntitySuggestion) => void;
    private entities: EntitySuggestion[] = [];
    /** Optional name to exclude (e.g. the entity being edited) */
    private excludeName?: string;

    constructor(app: App, plugin: StorytellerSuitePlugin, onChoose: (entity: EntitySuggestion) => void, excludeName?: string) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.excludeName = excludeName;
        this.setPlaceholder('Select an entity to link…');
    }

    async onOpen() {
        void super.onOpen();
        try {
            const [characters, locations, events, items] = await Promise.all([
                this.plugin.listCharacters().catch(() => []),
                this.plugin.listLocations().catch(() => []),
                this.plugin.listEvents().catch(() => []),
                this.plugin.listPlotItems().catch(() => []),
            ]);
            this.entities = [
                ...characters.map(e => ({ kind: 'character' as const, id: e.id, name: e.name })),
                ...locations.map(e => ({ kind: 'location' as const, id: e.id, name: e.name })),
                ...events.map(e => ({ kind: 'event' as const, id: e.id, name: e.name })),
                ...items.map(e => ({ kind: 'item' as const, id: e.id, name: e.name })),
                ...this.plugin.getGroups().map(g => ({ kind: 'group' as const, id: g.id, name: g.name })),
            ].filter(e => e.name && e.name !== this.excludeName);
        } catch {
            this.entities = [];
        }
        if (this.entities.length === 0) {
            new Notice('No entities to link yet — create characters, locations, events, or items first.');
        }
        scheduleSuggestRefresh(this);
    }

    getSuggestions(query: string): FuzzyMatch<EntitySuggestion>[] {
        if (!query) {
            return this.entities.map(e => ({ item: e, match: { score: 0, matches: [] } }));
        }
        const fuzzy = prepareFuzzySearch(query);
        return this.entities
            .map(e => {
                const match = fuzzy(this.getItemText(e));
                return match ? { item: e, match } : null;
            })
            .filter((fm): fm is FuzzyMatch<EntitySuggestion> => !!fm);
    }

    getItems(): EntitySuggestion[] {
        return this.entities;
    }

    getItemText(item: EntitySuggestion): string {
        return `${item.name} (${KIND_LABELS[item.kind]})`;
    }

    onChooseItem(item: EntitySuggestion): void {
        this.onChoose(item);
    }
}
