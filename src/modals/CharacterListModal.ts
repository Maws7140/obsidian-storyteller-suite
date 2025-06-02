/* eslint-disable @typescript-eslint/no-unused-vars */

// Core Obsidian imports for modal functionality
import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';

// Import types and related modals
import { Character } from '../types';
import StorytellerSuitePlugin from '../main';
import { CharacterModal } from './CharacterModal';

/**
 * Modal dialog for displaying and managing a list of characters
 * Provides search/filter functionality and quick actions for each character
 * Integrates with CharacterModal for editing individual characters
 */
export class CharacterListModal extends Modal {
    /** Reference to the main plugin instance */
    plugin: StorytellerSuitePlugin;
    
    /** Array of character data to display */
    characters: Character[];
    
    /** Container element for the character list (stored for re-rendering) */
    listContainer: HTMLElement;

    /**
     * Constructor for the character list modal
     * @param app Obsidian app instance
     * @param plugin Reference to the main plugin instance
     * @param characters Array of characters to display in the list
     */
    constructor(app: App, plugin: StorytellerSuitePlugin, characters: Character[]) {
        super(app);
        this.plugin = plugin;
        this.characters = characters;
        this.modalEl.addClass('storyteller-list-modal');
    }

    /**
     * Initialize and render the modal content
     * Called when the modal is opened
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Characters' });

        // Create container for the character list (stored for filtering)
        this.listContainer = contentEl.createDiv('storyteller-list-container');

        // Add search input with real-time filtering
        const searchInput = new Setting(contentEl)
            .setName('Search')
            .addText(text => {
                text.setPlaceholder('Filter characters...')
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Render initial list (no filter)
        this.renderList('', this.listContainer);

        // Add "Create New Character" button at bottom
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Create new character')
                .setCta()
                .onClick(() => {
                    this.close(); // Close list modal
                    new CharacterModal(this.app, this.plugin, null, async (characterData: Character) => {
                        await this.plugin.saveCharacter(characterData);
                        new Notice(`Character "${characterData.name}" created.`);
                        // Could optionally reopen list modal or return to dashboard
                    }).open();
                }));
    }

    /**
     * Render the filtered character list
     * @param filter Lowercase search term to filter characters by
     * @param container The container element to render the list into
     */
    renderList(filter: string, container: HTMLElement) {
        container.empty(); // Clear previous list content

        // Filter characters based on name, description, and traits
        const filteredCharacters = this.characters.filter(char =>
            char.name.toLowerCase().includes(filter) ||
            (char.description || '').toLowerCase().includes(filter) ||
            (char.traits || []).join(' ').toLowerCase().includes(filter)
        );

        // Handle empty results
        if (filteredCharacters.length === 0) {
            container.createEl('p', { text: 'No characters found.' + (filter ? ' Matching filter.' : '') });
            return;
        }

        // Render each character as a list item
        filteredCharacters.forEach(character => {
            const itemEl = container.createDiv('storyteller-list-item');

            // Character info section (name and description preview)
            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: character.name });
            if (character.description) {
                // Show description preview (truncated to 100 characters)
                const preview = character.description.substring(0, 100);
                const displayText = character.description.length > 100 ? preview + '...' : preview;
                infoEl.createEl('p', { text: displayText });
            }

            // Action buttons section
            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            
            // Edit button - opens character in edit modal
            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip('Edit')
                .onClick(() => {
                    this.close(); // Close list modal
                    new CharacterModal(this.app, this.plugin, character, async (updatedData: Character) => {
                        await this.plugin.saveCharacter(updatedData);
                        new Notice(`Character "${updatedData.name}" updated.`);
                        // Could optionally reopen list modal
                    }).open();
                });

            // Delete button - removes character file
            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip('Delete')
                .setClass('mod-warning') // Visual warning styling
                .onClick(async () => {
                    // Simple confirmation dialog
                    if (confirm(`Are you sure you want to delete "${character.name}"? This will move the file to system trash.`)) {
                        if (character.filePath) {
                            await this.plugin.deleteCharacter(character.filePath);
                            // Update local character list and re-render
                            this.characters = this.characters.filter(c => c.filePath !== character.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice('Error: Cannot delete character without file path.');
                        }
                    }
                });

            // Open note button - opens character file directly in Obsidian
             new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip('Open note')
                .onClick(() => {
                    if (!character.filePath) {
                        new Notice('Error: Cannot open character note without file path.');
                        return;
                    }
                    
                    // Find and open the character file
                    const file = this.app.vault.getAbstractFileByPath(character.filePath!);
                    if (file instanceof TFile) {
                        this.app.workspace.getLeaf(false).openFile(file);
                        this.close(); // Close modal after opening file
                    } else {
                        new Notice('Could not find the note file.');
                    }
                });
        });
    }

    /**
     * Clean up when modal is closed
     * Called automatically by Obsidian when modal closes
     */
    onClose() {
        this.contentEl.empty();
    }
}
