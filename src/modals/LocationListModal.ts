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
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
