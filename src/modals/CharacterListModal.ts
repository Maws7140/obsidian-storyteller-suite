/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { Character } from '../types';
import StorytellerSuitePlugin from '../main';
import { CharacterModal } from './CharacterModal'; // Import edit modal

export class CharacterListModal extends Modal {
    plugin: StorytellerSuitePlugin;
    characters: Character[];
    listContainer: HTMLElement; // Store container reference

    constructor(app: App, plugin: StorytellerSuitePlugin, characters: Character[]) {
        super(app);
        this.plugin = plugin;
        this.characters = characters;
        this.modalEl.addClass('storyteller-list-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Characters' });

        // Store the container element
        this.listContainer = contentEl.createDiv('storyteller-list-container');

        const searchInput = new Setting(contentEl)
            .setName('Search')
            .addText(text => {
                text.setPlaceholder('Filter characters...')
                    // Pass the container to renderList
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Initial render using the stored container
        this.renderList('', this.listContainer);

        // Add New button at the bottom
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Create New Character')
                .setCta()
                .onClick(() => {
                    this.close(); // Close list modal
                    new CharacterModal(this.app, this.plugin, null, async (characterData: Character) => {
                        await this.plugin.saveCharacter(characterData);
                        new Notice(`Character "${characterData.name}" created.`);
                        // Optionally reopen list modal or dashboard
                    }).open();
                }));
    }

    renderList(filter: string, container: HTMLElement) {
        container.empty(); // Clear previous list

        const filteredCharacters = this.characters.filter(char =>
            char.name.toLowerCase().includes(filter) ||
            (char.description || '').toLowerCase().includes(filter) ||
            (char.traits || []).join(' ').toLowerCase().includes(filter)
        );

        if (filteredCharacters.length === 0) {
            container.createEl('p', { text: 'No characters found.' + (filter ? ' Matching filter.' : '') });
            return;
        }

        filteredCharacters.forEach(character => {
            const itemEl = container.createDiv('storyteller-list-item');

            // Basic Info (Name, maybe description snippet)
            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: character.name });
            if (character.description) {
                infoEl.createEl('p', { text: character.description.substring(0, 100) + (character.description.length > 100 ? '...' : '') });
            }

            // Action Buttons
            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip('Edit')
                .onClick(() => {
                    // Close this modal and open the edit modal
                    this.close();
                    new CharacterModal(this.app, this.plugin, character, async (updatedData: Character) => {
                        await this.plugin.saveCharacter(updatedData);
                        new Notice(`Character "${updatedData.name}" updated.`);
                        // Optionally reopen list modal
                    }).open();
                });

            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip('Delete')
                .setClass('mod-warning') // Add warning class for visual cue
                .onClick(async () => {
                    // Simple confirmation for now
                    if (confirm(`Are you sure you want to delete "${character.name}"? This will move the file to system trash.`)) {
                        if (character.filePath) {
                            await this.plugin.deleteCharacter(character.filePath);
                            // Refresh the list in the modal
                            this.characters = this.characters.filter(c => c.filePath !== character.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice('Error: Cannot delete character without file path.');
                        }
                    }
                });

             // Optional: Button to open the note directly
             new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip('Open Note')
                .onClick(() => {
                if (!character.filePath) {
                  new Notice('Error: Cannot open character note without file path.');
                  return;
                }
                const file = this.app.vault.getAbstractFileByPath(character.filePath!);
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
