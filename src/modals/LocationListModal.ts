import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
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
        contentEl.createEl('h2', { text: 'Locations' });

        // Store the container element
        this.listContainer = contentEl.createDiv('storyteller-list-container');

        const searchInput = new Setting(contentEl)
            .setName('Search')
            .addText(text => {
                text.setPlaceholder('Filter locations...')
                    // Pass the container to renderList
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Initial render using the stored container
        this.renderList('', this.listContainer);

        // Add New button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Create new location')
                .setCta()
                .onClick(() => {
                    this.close(); // Close list modal
                    new LocationModal(this.app, this.plugin, null, async (locationData: Location) => {
                        await this.plugin.saveLocation(locationData);
                        new Notice(`Location "${locationData.name}" created.`);
                        // Optionally reopen list modal or dashboard
                    }).open();
                }));
    }

    renderList(filter: string, container: HTMLElement) {
        container.empty();
        const filtered = this.locations.filter(loc =>
            loc.name.toLowerCase().includes(filter) ||
            (loc.description || '').toLowerCase().includes(filter)
        );

        if (filtered.length === 0) {
            container.createEl('p', { text: 'No locations found.' + (filter ? ' Matching filter.' : '') });
            return;
        }

        filtered.forEach(location => {
            const itemEl = container.createDiv('storyteller-list-item');
            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: location.name });
            if (location.description) {
                infoEl.createEl('p', { text: location.description.substring(0, 100) + (location.description.length > 100 ? '...' : '') });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            new ButtonComponent(actionsEl) // Edit
                .setIcon('pencil')
                .setTooltip('Edit')
                .onClick(() => {
                    // Close this modal and open the edit modal
                    this.close();
                    new LocationModal(this.app, this.plugin, location, async (updatedData: Location) => {
                        await this.plugin.saveLocation(updatedData);
                        new Notice(`Location "${updatedData.name}" updated.`);
                        // Optionally reopen list modal
                    }).open();
                });

            new ButtonComponent(actionsEl) // Delete
                .setIcon('trash')
                .setTooltip('Delete')
                .setClass('mod-warning') // Add warning class for visual cue
                .onClick(async () => {
                    // Simple confirmation for now
                    if (confirm(`Are you sure you want to delete "${location.name}"?`)) {
                        if (location.filePath) {
                            await this.plugin.deleteLocation(location.filePath);
                            // Refresh the list in the modal
                            this.locations = this.locations.filter(l => l.filePath !== location.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice('Error: Cannot delete location without file path.');
                        }
                    }
                });

            new ButtonComponent(actionsEl) // Open Note
               .setIcon('go-to-file')
               .setTooltip('Open note')
               .onClick(() => {
                if (!location.filePath) {
                  new Notice('Error: Cannot open location note without file path.');
                  return;
                }
                const file = this.app.vault.getAbstractFileByPath(location.filePath!);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf(false).openFile(file);
                    this.close();
                } else {
                    new Notice('Could not find the note file.');
                }
            });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
