import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';
import { Location } from '../types';
import StorytellerSuitePlugin from '../main';
import { LocationModal } from './LocationModal';

export class LocationListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    locations: Location[];
    listContainer: HTMLElement; // Store container reference

    constructor(app: App, plugin: StorytellerSuitePlugin, locations: Location[]) {
        super(app);
        this.plugin = plugin;
        this.locations = locations;
        this.modalEl.addClass('storyteller-list-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('locations') });

        // Store the container element
        this.listContainer = contentEl.createDiv('storyteller-list-container');

        const searchInput = new Setting(contentEl)
            .setName(t('search'))
            .addText(text => {
                text.setPlaceholder(t('searchX', t('locations')))
                    // Pass the container to renderList
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Initial render using the stored container
        this.renderList('', this.listContainer);

        // Add New button
        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText(t('createLocation'))
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new LocationModal(this.app, this.plugin, null, async (locationData: Location) => {
                            await this.plugin.saveLocation(locationData);
                            new Notice(t('created', t('location'), locationData.name));
                            new Notice(t('noteCreatedWithSections'));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip(t('selectOrCreateStoryFirst'));
                }
            });
    }

    renderList(filter: string, container: HTMLElement) {
        container.empty();
        const filtered = this.locations.filter(loc =>
            loc.name.toLowerCase().includes(filter) ||
            (loc.description || '').toLowerCase().includes(filter)
        );

        if (filtered.length === 0) {
            container.createEl('p', { text: t('noLocationsFound') + (filter ? t('matchingFilter') : '') });
            return;
        }

        // Organize locations hierarchically
        const hierarchyMap = this.buildLocationHierarchy(filtered);
        
        // Render root locations and their children
        const rootLocations = filtered.filter(loc => !loc.parentLocation);
        const renderedLocations = new Set<string>();
        
        rootLocations.forEach(location => {
            this.renderLocationWithChildren(location, container, filter, hierarchyMap, renderedLocations, 0);
        });
        
        // Render orphaned locations (those whose parents aren't in the filtered list)
        filtered.forEach(location => {
            if (!renderedLocations.has(location.name)) {
                this.renderLocationWithChildren(location, container, filter, hierarchyMap, renderedLocations, 0);
            }
        });
    }

    /**
     * Build a hierarchy map of locations to their children
     */
    private buildLocationHierarchy(locations: Location[]): Map<string, Location[]> {
        const hierarchyMap = new Map<string, Location[]>();
        
        locations.forEach(location => {
            if (location.parentLocation) {
                if (!hierarchyMap.has(location.parentLocation)) {
                    hierarchyMap.set(location.parentLocation, []);
                }
                hierarchyMap.get(location.parentLocation)!.push(location);
            }
        });
        
        return hierarchyMap;
    }

    /**
     * Render a location and its children recursively
     */
    private renderLocationWithChildren(
        location: Location, 
        container: HTMLElement, 
        filter: string, 
        hierarchyMap: Map<string, Location[]>, 
        renderedLocations: Set<string>, 
        depth: number
    ) {
        if (renderedLocations.has(location.name)) {
            return;
        }
        
        renderedLocations.add(location.name);
        
        const itemEl = container.createDiv('storyteller-list-item');
        
        // Add indentation for nested locations
        if (depth > 0) {
            itemEl.style.marginLeft = `${depth * 20}px`;
            itemEl.style.borderLeft = '2px solid var(--background-modifier-border)';
            itemEl.style.paddingLeft = '10px';
        }
        
        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        const nameEl = infoEl.createEl('strong', { text: location.name });
        
        // Add parent indicator if applicable
        if (location.parentLocation) {
            nameEl.createSpan({ 
                text: ` (within ${location.parentLocation})`, 
                cls: 'storyteller-parent-indicator' 
            });
        }
        
        if (location.description) {
            infoEl.createEl('p', { text: location.description.substring(0, 100) + (location.description.length > 100 ? '...' : '') });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        new ButtonComponent(actionsEl) // Edit
            .setIcon('pencil')
            .setTooltip(t('edit'))
            .onClick(() => {
                // Close this modal and open the edit modal
                this.close();
                new LocationModal(this.app, this.plugin, location, async (updatedData: Location) => {
                    await this.plugin.saveLocation(updatedData);
                    new Notice(t('updated', t('location'), updatedData.name));
                    // Optionally reopen list modal
                }).open();
            });

        new ButtonComponent(actionsEl) // Delete
            .setIcon('trash')
            .setTooltip(t('delete'))
            .setClass('mod-warning') // Add warning class for visual cue
            .onClick(async () => {
                // Simple confirmation for now
                if (confirm(t('confirmDeleteLocation', location.name))) {
                    if (location.filePath) {
                        await this.plugin.deleteLocation(location.filePath);
                        // Refresh the list in the modal
                        this.locations = this.locations.filter(l => l.filePath !== location.filePath);
                        this.renderList(filter, container);
                    } else {
                        new Notice(t('errorCannotDeleteWithoutFilePath', t('location')));
                    }
                }
            });

        new ButtonComponent(actionsEl) // Open Note
           .setIcon('go-to-file')
           .setTooltip(t('openNote'))
           .onClick(() => {
            if (!location.filePath) {
              new Notice(t('errorCannotOpenNoteWithoutFilePath', t('location')));
              return;
            }
            const file = this.app.vault.getAbstractFileByPath(location.filePath!);
            if (file instanceof TFile) {
                this.app.workspace.getLeaf(false).openFile(file);
                this.close();
            } else {
                new Notice(t('workspaceLeafRevealError'));
            }
        });

        // Recursively render children
        const children = hierarchyMap.get(location.name) || [];
        children.forEach(child => {
            this.renderLocationWithChildren(child, container, filter, hierarchyMap, renderedLocations, depth + 1);
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
