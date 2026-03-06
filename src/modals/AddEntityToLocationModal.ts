/**
 * AddEntityToLocationModal - Modal for adding entities to locations
 * Supports: characters, events, items, cultures, economies, magic systems, groups, scenes, references
 */

import { App, Modal, Notice, getIcon } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type {
    Location,
    EntityRef,
    Character,
    Event,
    PlotItem,
    Culture,
    Economy,
    MagicSystem,
    Group,
    Scene,
    Reference
} from '../types';
import { LocationService } from '../services/LocationService';
import { getTrackedItemOwner, isSameName } from '../utils/ItemOwnership';

// Union type for all loadable entities
type LoadableEntity = Character | Event | PlotItem | Culture | Economy | MagicSystem | Group | Scene | Reference;

export class AddEntityToLocationModal extends Modal {
    private location: Location;
    private entityType: string;
    private plugin: StorytellerSuitePlugin;
    private locationService: LocationService;
    private onSelect: (entityId: string, relationship: string) => void;
    private searchInput: HTMLInputElement | null = null;
    private resultsContainer: HTMLElement | null = null;
    private relSelect: HTMLSelectElement | null = null;
    private itemOwnerByName: Map<string, string> = new Map();

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        location: Location,
        entityType: string,
        onSelect: (entityId: string, relationship: string) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.location = location;
        this.entityType = entityType;
        this.onSelect = onSelect;
        this.locationService = new LocationService(plugin);
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('storyteller-add-entity-modal');

        contentEl.createEl('h2', { text: `Add ${this.entityType} to ${this.location.name}` });

        // Search input
        const searchContainer = contentEl.createDiv('search-container');
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: `Search ${this.entityType}s...`,
            cls: 'storyteller-search-input'
        });

        // Relationship selector
        const relContainer = contentEl.createDiv('relationship-container');
        relContainer.createEl('label', { text: 'Relationship:' });
        this.relSelect = relContainer.createEl('select', { cls: 'storyteller-select' });

        const relationships = this.getRelationshipsForType(this.entityType);
        relationships.forEach(rel => {
            this.relSelect!.createEl('option', { value: rel, text: rel });
        });

        // Results list
        this.resultsContainer = contentEl.createDiv('results-container');

        // Load entities
        const entities = await this.loadEntities();
        await this.cacheItemOwners(entities);
        this.renderResults(entities);

        // Search handler
        this.searchInput.addEventListener('input', () => {
            const query = this.searchInput!.value.toLowerCase();
            const filtered = entities.filter(e =>
                e.name.toLowerCase().includes(query)
            );
            this.renderResults(filtered);
        });

        this.searchInput.focus();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    /**
     * Get semantically appropriate relationships for each entity type
     */
    private getRelationshipsForType(type: string): string[] {
        const relationships: Record<string, string[]> = {
            character: ['lives here', 'works here', 'born here', 'died here', 'visited', 'imprisoned', 'rules'],
            event: ['occurred here', 'started here', 'ended here'],
            item: ['located here', 'created here', 'hidden here', 'sold here', 'discovered here'],
            culture: ['originates here', 'dominant here', 'minority here', 'practiced here', 'influences here'],
            economy: ['based here', 'operates here', 'controls trade here', 'markets here'],
            magicsystem: ['practiced here', 'originated here', 'forbidden here', 'taught here', 'strongest here'],
            group: ['headquartered here', 'operates here', 'founded here', 'controls here', 'meets here'],
            scene: ['set here', 'takes place here', 'filmed here'],
            reference: ['documented here', 'stored here', 'mentioned here', 'researched here'],
            custom: ['located here']
        };
        return relationships[type] || ['located here'];
    }

    /**
     * Load entities of the specified type uniformly
     */
    private async loadEntities(): Promise<LoadableEntity[]> {
        switch (this.entityType) {
            case 'character':
                return await this.plugin.listCharacters();
            case 'event':
                return await this.plugin.listEvents();
            case 'item':
                return await this.plugin.listPlotItems();
            case 'culture':
                return await this.plugin.listCultures();
            case 'economy':
                return await this.plugin.listEconomies();
            case 'magicsystem':
                return await this.plugin.listMagicSystems();
            case 'group':
                return this.plugin.getGroups(); // Note: getGroups, not listGroups
            case 'scene':
                return await this.plugin.listScenes();
            case 'reference':
                return await this.plugin.listReferences();
            default:
                return [];
        }
    }

    private renderResults(entities: LoadableEntity[]): void {
        if (!this.resultsContainer) return;
        this.resultsContainer.empty();

        // Filter out entities already at this location
        const existingIds = new Set((this.location.entityRefs || []).map(e => e.entityId));
        const available = entities.filter(e => !existingIds.has(e.id || e.name));

        if (available.length === 0) {
            this.resultsContainer.createDiv({ text: 'No available entities', cls: 'no-results' });
            return;
        }

        for (const entity of available) {
            const item = this.resultsContainer.createDiv({ cls: 'entity-result-item' });
            const iconEl = item.createSpan({ cls: 'entity-icon' });
            const svgEl = getIcon(this.getEntityIcon());
            if (svgEl) iconEl.appendChild(svgEl);
            const textWrap = item.createDiv({ cls: 'entity-result-text' });
            textWrap.createSpan({ cls: 'entity-name', text: entity.name });
            const metaText = this.getEntityMetaText(entity);
            if (metaText) {
                textWrap.createSpan({ cls: 'entity-meta', text: metaText });
            }

            item.addEventListener('click', () => {
                if (this.relSelect) {
                    this.showEntityAssignmentWarnings(entity);
                    this.onSelect(entity.id || entity.name, this.relSelect.value);
                    this.close();
                }
            });
        }
    }

    private getEntityMetaText(entity: LoadableEntity): string {
        if (this.entityType !== 'item') return '';
        const item = entity as PlotItem;
        const details: string[] = [];
        if (item.currentOwner) details.push(`Owner: ${item.currentOwner}`);
        const trackedOwner = this.itemOwnerByName.get(this.normalizeName(item.name));
        if (trackedOwner && !isSameName(trackedOwner, item.currentOwner)) {
            details.push(`Carried by: ${trackedOwner}`);
        }
        if (item.currentLocation) details.push(`Current location: ${item.currentLocation}`);
        return details.join(' | ');
    }

    private showEntityAssignmentWarnings(entity: LoadableEntity): void {
        if (this.entityType !== 'item') return;
        const item = entity as PlotItem;
        const warnings: string[] = [];
        const trackedOwner = this.itemOwnerByName.get(this.normalizeName(item.name));
        if (item.currentOwner) {
            warnings.push(`${item.name} is currently owned by ${item.currentOwner}.`);
        } else if (trackedOwner) {
            warnings.push(`${item.name} is currently in ${trackedOwner}'s inventory.`);
        }
        if (
            item.currentLocation &&
            item.currentLocation.toLowerCase() !== this.location.name.toLowerCase() &&
            item.currentLocation.toLowerCase() !== (this.location.id || '').toLowerCase()
        ) {
            warnings.push(`${item.name} is currently at ${item.currentLocation}.`);
        }
        if (!warnings.length) return;
        warnings.push(`Adding it here will set its current location to ${this.location.name}.`);
        new Notice(warnings.join(' '), 7000);
    }

    private normalizeName(value: unknown): string {
        return typeof value === 'string' ? value.trim().toLowerCase() : '';
    }

    private async cacheItemOwners(entities: LoadableEntity[]): Promise<void> {
        this.itemOwnerByName.clear();
        if (this.entityType !== 'item') return;

        const characters = await this.plugin.listCharacters().catch(() => [] as Character[]);
        for (const entity of entities) {
            const item = entity as PlotItem;
            const trackedOwner = getTrackedItemOwner(item, characters);
            const normalizedItemName = this.normalizeName(item.name);
            if (!normalizedItemName || !trackedOwner) continue;
            this.itemOwnerByName.set(normalizedItemName, trackedOwner);
        }
    }

    /**
     * Get Lucide icon name for entity type
     */
    private getEntityIcon(): string {
        const icons: Record<string, string> = {
            character: 'user',
            event: 'calendar',
            item: 'box',
            culture: 'landmark',
            economy: 'coins',
            magicsystem: 'wand',
            group: 'users',
            scene: 'film',
            reference: 'book-open'
        };
        return icons[this.entityType] || 'map-pin';
    }
}
