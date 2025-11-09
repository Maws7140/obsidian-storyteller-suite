/* eslint-disable @typescript-eslint/no-unused-vars */

// Core Obsidian imports for modal functionality
import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';

// Import types and related modals
import { MagicSystem } from '../types';
import StorytellerSuitePlugin from '../main';
import { MagicSystemModal } from './MagicSystemModal';

/**
 * Modal dialog for displaying and managing a list of magic systems
 * Provides search/filter functionality and quick actions for each magic system
 * Integrates with MagicSystemModal for editing individual magic systems
 */
export class MagicSystemListModal extends Modal {
    /** Reference to the main plugin instance */
    plugin: StorytellerSuitePlugin;

    /** Array of magic system data to display */
    magicSystems: MagicSystem[];

    /** Container element for the magic system list (stored for re-rendering) */
    listContainer: HTMLElement;

    /**
     * Constructor for the magic system list modal
     * @param app Obsidian app instance
     * @param plugin Reference to the main plugin instance
     * @param magicSystems Array of magic systems to display in the list
     */
    constructor(app: App, plugin: StorytellerSuitePlugin, magicSystems: MagicSystem[]) {
        super(app);
        this.plugin = plugin;
        this.magicSystems = magicSystems;
        this.modalEl.addClass('storyteller-list-modal');
    }

    /**
     * Initialize and render the modal content
     * Called when the modal is opened
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Magic Systems' });

        // Create container for the magic system list (stored for filtering)
        this.listContainer = contentEl.createDiv('storyteller-list-container');

        // Add search input with real-time filtering
        const searchInput = new Setting(contentEl)
            .setName(t('search'))
            .addText(text => {
                text.setPlaceholder('Search magic systems...')
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Render initial list (no filter)
        this.renderList('', this.listContainer);

        // Add "Create New Magic System" button at bottom
        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText('Create Magic System')
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new MagicSystemModal(this.app, this.plugin, null, async (magicSystemData: MagicSystem) => {
                            await this.plugin.saveMagicSystem(magicSystemData);
                            new Notice(`Magic System "${magicSystemData.name}" created.`);
                            new Notice(t('noteCreatedWithSections'));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip(t('selectOrCreateStoryFirst'));
                }
            });
    }

    /**
     * Render the filtered magic system list
     * @param filter Lowercase search term to filter magic systems by
     * @param container The container element to render the list into
     */
    renderList(filter: string, container: HTMLElement) {
        container.empty(); // Clear previous list content

        // Filter magic systems based on name, rules, source, and system type
        const filteredMagicSystems = this.magicSystems.filter(magicSystem =>
            magicSystem.name.toLowerCase().includes(filter) ||
            (magicSystem.rules || '').toLowerCase().includes(filter) ||
            (magicSystem.source || '').toLowerCase().includes(filter) ||
            (magicSystem.systemType || '').toLowerCase().includes(filter) ||
            (magicSystem.description || '').toLowerCase().includes(filter)
        );

        // Handle empty results
        if (filteredMagicSystems.length === 0) {
            container.createEl('p', { text: 'No magic systems found' + (filter ? ' matching filter' : '') });
            return;
        }

        // Render each magic system as a list item
        filteredMagicSystems.forEach(magicSystem => {
            const itemEl = container.createDiv('storyteller-list-item');

            // Magic system info section (name and description preview)
            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: magicSystem.name });

            // Show additional info
            const metaInfo: string[] = [];
            if (magicSystem.systemType) metaInfo.push(`Type: ${magicSystem.systemType}`);
            if (magicSystem.rarity) metaInfo.push(`Rarity: ${magicSystem.rarity}`);
            if (magicSystem.powerLevel) metaInfo.push(`Power: ${magicSystem.powerLevel}`);
            if (metaInfo.length > 0) {
                infoEl.createEl('p', { text: metaInfo.join(' | '), cls: 'storyteller-list-meta' });
            }

            if (magicSystem.rules) {
                // Show rules preview (truncated to 100 characters)
                const preview = magicSystem.rules.substring(0, 100);
                const displayText = magicSystem.rules.length > 100 ? preview + '...' : preview;
                infoEl.createEl('p', { text: displayText });
            }

            // Action buttons section
            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

            // Edit button - opens magic system in edit modal
            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip(t('edit'))
                .onClick(() => {
                    this.close(); // Close list modal
                    new MagicSystemModal(this.app, this.plugin, magicSystem, async (updatedData: MagicSystem) => {
                        await this.plugin.saveMagicSystem(updatedData);
                        new Notice(`Magic System "${updatedData.name}" updated.`);
                        // Could optionally reopen list modal
                    }).open();
                });

            // Delete button - removes magic system file
            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip(t('delete'))
                .setClass('mod-warning') // Visual warning styling
                .onClick(async () => {
                    // Simple confirmation dialog
                    if (confirm(`Delete magic system "${magicSystem.name}"? (Moved to trash)`)) {
                        if (magicSystem.filePath) {
                            await this.plugin.deleteMagicSystem(magicSystem.filePath);
                            // Update local magic system list and re-render
                            this.magicSystems = this.magicSystems.filter(m => m.filePath !== magicSystem.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice(`Cannot delete magic system without file path.`);
                        }
                    }
                });

            // Open note button - opens magic system file directly in Obsidian
             new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip(t('openNote'))
                .onClick(() => {
                    if (!magicSystem.filePath) {
                        new Notice(`Cannot open note without file path.`);
                        return;
                    }

                    // Find and open the magic system file
                    const file = this.app.vault.getAbstractFileByPath(magicSystem.filePath!);
                    if (file instanceof TFile) {
                        this.app.workspace.getLeaf(false).openFile(file);
                        this.close(); // Close modal after opening file
                    } else {
                        new Notice(t('workspaceLeafRevealError'));
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
