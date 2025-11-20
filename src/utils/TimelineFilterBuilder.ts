// Timeline Filter Builder - Shared filter panel creation for Timeline UI components
// Provides methods for creating filter dropdowns, chips, and controls

import { Setting } from 'obsidian';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { TimelineRenderer } from './TimelineRenderer';
import { TimelineUIState, TimelineUIFilters, Event } from '../types';

/**
 * Callbacks for filter operations
 */
export interface TimelineFilterCallbacks {
    /** Called when filters change */
    onFilterChange: () => void;
    /** Get the current renderer instance */
    getRenderer: () => TimelineRenderer | null;
}

/**
 * TimelineFilterBuilder provides methods for creating timeline filter UI components
 * Used by both TimelineView and TimelineModal to reduce code duplication
 */
export class TimelineFilterBuilder {
    private plugin: StorytellerSuitePlugin;
    private state: TimelineUIState;
    private callbacks: TimelineFilterCallbacks;

    constructor(
        plugin: StorytellerSuitePlugin,
        state: TimelineUIState,
        callbacks: TimelineFilterCallbacks
    ) {
        this.plugin = plugin;
        this.state = state;
        this.callbacks = callbacks;
    }

    /**
     * Build character filter dropdown
     */
    createCharacterFilter(container: HTMLElement, events: Event[]): void {
        new Setting(container)
            .setName(t('filterByCharacter'))
            .addDropdown(dropdown => {
                dropdown.addOption('', t('selectCharacterFilter') || 'Select character...');

                // Populate with characters from events
                const allCharacters = new Set<string>();
                events.forEach(e => {
                    if (e.characters) e.characters.forEach(c => allCharacters.add(c));
                });
                Array.from(allCharacters).sort().forEach(char => {
                    dropdown.addOption(char, char);
                });

                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value) {
                        if (!this.state.filters.characters) {
                            this.state.filters.characters = new Set();
                        }
                        this.state.filters.characters.add(value);
                        this.applyFilters();
                        dropdown.setValue('');
                    }
                });
            });
    }

    /**
     * Build location filter dropdown
     */
    createLocationFilter(container: HTMLElement, events: Event[]): void {
        new Setting(container)
            .setName(t('filterByLocation'))
            .addDropdown(dropdown => {
                dropdown.addOption('', t('selectLocationFilter') || 'Select location...');

                const allLocations = new Set<string>();
                events.forEach(e => {
                    if (e.location) allLocations.add(e.location);
                });
                Array.from(allLocations).sort().forEach(loc => {
                    dropdown.addOption(loc, loc);
                });

                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value) {
                        if (!this.state.filters.locations) {
                            this.state.filters.locations = new Set();
                        }
                        this.state.filters.locations.add(value);
                        this.applyFilters();
                        dropdown.setValue('');
                    }
                });
            });
    }

    /**
     * Build group filter dropdown
     */
    createGroupFilter(container: HTMLElement): void {
        new Setting(container)
            .setName(t('filterByGroup'))
            .addDropdown(dropdown => {
                dropdown.addOption('', t('selectGroupFilter') || 'Select group...');

                const groups = this.plugin.getGroups();
                groups.forEach(g => {
                    dropdown.addOption(g.id, g.name);
                });

                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value) {
                        if (!this.state.filters.groups) {
                            this.state.filters.groups = new Set();
                        }
                        this.state.filters.groups.add(value);
                        this.applyFilters();
                        dropdown.setValue('');
                    }
                });
            });
    }

    /**
     * Build tag filter dropdown
     */
    createTagFilter(container: HTMLElement, events: Event[]): void {
        new Setting(container)
            .setName('Filter by Tag')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Select tag...');

                const allTags = new Set<string>();
                events.forEach(e => {
                    if (e.tags) e.tags.forEach(tag => allTags.add(tag));
                });
                Array.from(allTags).sort().forEach(tag => {
                    dropdown.addOption(tag, tag);
                });

                dropdown.setValue('');
                dropdown.onChange(value => {
                    if (value) {
                        if (!this.state.filters.tags) {
                            this.state.filters.tags = new Set();
                        }
                        this.state.filters.tags.add(value);
                        this.applyFilters();
                        dropdown.setValue('');
                    }
                });
            });
    }

    /**
     * Build milestones only toggle
     */
    createMilestonesToggle(container: HTMLElement): void {
        new Setting(container)
            .setName(t('milestonesOnly') || 'Milestones Only')
            .setDesc('Show only milestone events')
            .addToggle(toggle => {
                toggle.setValue(this.state.filters.milestonesOnly || false)
                    .onChange(value => {
                        this.state.filters.milestonesOnly = value;
                        this.applyFilters();
                    });
            });
    }

    /**
     * Build clear all filters button
     */
    createClearFiltersButton(container: HTMLElement): void {
        new Setting(container)
            .addButton(button => button
                .setButtonText(t('clearAllFilters') || 'Clear All Filters')
                .onClick(() => {
                    this.clearAllFilters();
                }));
    }

    /**
     * Build complete filter panel with all filters
     */
    buildFilterPanel(container: HTMLElement, events: Event[]): void {
        this.createMilestonesToggle(container);
        this.createCharacterFilter(container, events);
        this.createLocationFilter(container, events);
        this.createGroupFilter(container);
        this.createTagFilter(container, events);
        this.createClearFiltersButton(container);
    }

    /**
     * Render filter chips showing active filters
     */
    renderFilterChips(container: HTMLElement): void {
        container.empty();

        if (!this.hasActiveFilters()) return;

        // Character chips
        this.state.filters.characters?.forEach(char => {
            this.createFilterChip(container, `Character: ${char}`, () => {
                this.state.filters.characters?.delete(char);
                this.renderFilterChips(container);
                this.applyFilters();
            });
        });

        // Location chips
        this.state.filters.locations?.forEach(loc => {
            this.createFilterChip(container, `Location: ${loc}`, () => {
                this.state.filters.locations?.delete(loc);
                this.renderFilterChips(container);
                this.applyFilters();
            });
        });

        // Group chips
        this.state.filters.groups?.forEach(groupId => {
            const group = this.plugin.getGroups().find(g => g.id === groupId);
            const groupName = group ? group.name : groupId;
            this.createFilterChip(container, `Group: ${groupName}`, () => {
                this.state.filters.groups?.delete(groupId);
                this.renderFilterChips(container);
                this.applyFilters();
            });
        });

        // Tag chips
        this.state.filters.tags?.forEach(tag => {
            this.createFilterChip(container, `Tag: ${tag}`, () => {
                this.state.filters.tags?.delete(tag);
                this.renderFilterChips(container);
                this.applyFilters();
            });
        });

        // Milestones chip
        if (this.state.filters.milestonesOnly) {
            this.createFilterChip(container, 'Milestones Only', () => {
                this.state.filters.milestonesOnly = false;
                this.renderFilterChips(container);
                this.applyFilters();
            });
        }
    }

    /**
     * Create a single filter chip element
     */
    private createFilterChip(container: HTMLElement, label: string, onRemove: () => void): void {
        const chip = container.createDiv('filter-chip');
        chip.createSpan({ text: label });
        const removeBtn = chip.createSpan({ text: 'x', cls: 'filter-chip-remove' });
        removeBtn.onclick = onRemove;
    }

    /**
     * Check if there are active filters
     */
    hasActiveFilters(): boolean {
        const f = this.state.filters;
        return (f.characters && f.characters.size > 0) ||
            (f.locations && f.locations.size > 0) ||
            (f.groups && f.groups.size > 0) ||
            (f.tags && f.tags.size > 0) ||
            f.milestonesOnly === true;
    }

    /**
     * Clear all filters
     */
    clearAllFilters(): void {
        if (this.state.filters.characters) this.state.filters.characters.clear();
        if (this.state.filters.locations) this.state.filters.locations.clear();
        if (this.state.filters.groups) this.state.filters.groups.clear();
        if (this.state.filters.tags) this.state.filters.tags.clear();
        this.state.filters.milestonesOnly = false;
        this.applyFilters();
    }

    /**
     * Apply current filters to renderer
     */
    private applyFilters(): void {
        this.callbacks.getRenderer()?.applyFilters(this.state.filters);
        this.callbacks.onFilterChange();
    }

    /**
     * Get the current state
     */
    getState(): TimelineUIState {
        return this.state;
    }
}
