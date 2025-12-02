/* eslint-disable @typescript-eslint/no-unused-vars */

// Core Obsidian imports for modal functionality
import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';

// Import types and related modals
import { Economy } from '../types';
import StorytellerSuitePlugin from '../main';
import { EconomyModal } from './EconomyModal';

/**
 * Modal dialog for displaying and managing a list of economies
 * Provides search/filter functionality and quick actions for each economy
 * Integrates with EconomyModal for editing individual economies
 */
export class EconomyListModal extends Modal {
    /** Reference to the main plugin instance */
    plugin: StorytellerSuitePlugin;

    /** Array of economy data to display */
    economies: Economy[];

    /** Container element for the economy list (stored for re-rendering) */
    listContainer: HTMLElement;

    /**
     * Constructor for the economy list modal
     * @param app Obsidian app instance
     * @param plugin Reference to the main plugin instance
     * @param economies Array of economies to display in the list
     */
    constructor(app: App, plugin: StorytellerSuitePlugin, economies: Economy[]) {
        super(app);
        this.plugin = plugin;
        this.economies = economies;
        this.modalEl.addClass('storyteller-list-modal');
    }

    /**
     * Initialize and render the modal content
     * Called when the modal is opened
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('economies') });

        // Create container for the economy list (stored for filtering)
        this.listContainer = contentEl.createDiv('storyteller-list-container');

        // Add search input with real-time filtering
        const searchInput = new Setting(contentEl)
            .setName(t('search'))
            .addText(text => {
                text.setPlaceholder(t('searchEconomies'))
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Render initial list (no filter)
        this.renderList('', this.listContainer);

        // Add "Create New Economy" button at bottom
        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText(t('createEconomy'))
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new EconomyModal(this.app, this.plugin, null, async (economyData: Economy) => {
                            await this.plugin.saveEconomy(economyData);
                            new Notice(t('economyCreated', economyData.name));
                            new Notice(t('noteCreatedWithSections'));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip(t('selectOrCreateStoryFirst'));
                }
            });
    }

    /**
     * Render the filtered economy list
     * @param filter Lowercase search term to filter economies by
     * @param container The container element to render the list into
     */
    renderList(filter: string, container: HTMLElement) {
        container.empty(); // Clear previous list content

        // Filter economies based on name, industries, taxation, and economic system
        const filteredEconomies = this.economies.filter(economy =>
            economy.name.toLowerCase().includes(filter) ||
            (economy.industries || '').toLowerCase().includes(filter) ||
            (economy.taxation || '').toLowerCase().includes(filter) ||
            (economy.economicSystem || '').toLowerCase().includes(filter) ||
            (economy.description || '').toLowerCase().includes(filter)
        );

        // Handle empty results
        if (filteredEconomies.length === 0) {
            container.createEl('p', { text: t('noEconomiesFound') + (filter ? t('matchingFilter') : '') });
            return;
        }

        // Render each economy as a list item
        filteredEconomies.forEach(economy => {
            const itemEl = container.createDiv('storyteller-list-item');

            // Economy info section (name and description preview)
            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: economy.name });

            // Show additional info
            const metaInfo: string[] = [];
            if (economy.economicSystem) metaInfo.push(`System: ${economy.economicSystem}`);
            if (economy.currencies && economy.currencies.length > 0) {
                metaInfo.push(`Currencies: ${economy.currencies.length}`);
            }
            if (economy.status) metaInfo.push(`Status: ${economy.status}`);
            if (metaInfo.length > 0) {
                infoEl.createEl('p', { text: metaInfo.join(' | '), cls: 'storyteller-list-meta' });
            }

            if (economy.industries) {
                // Show industries preview (truncated to 100 characters)
                const preview = economy.industries.substring(0, 100);
                const displayText = economy.industries.length > 100 ? preview + '...' : preview;
                infoEl.createEl('p', { text: displayText });
            }

            // Action buttons section
            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

            // Edit button - opens economy in edit modal
            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip(t('edit'))
                .onClick(() => {
                    this.close(); // Close list modal
                    new EconomyModal(this.app, this.plugin, economy, async (updatedData: Economy) => {
                        await this.plugin.saveEconomy(updatedData);
                        new Notice(t('economyUpdated', updatedData.name));
                        // Could optionally reopen list modal
                    }).open();
                });

            // Delete button - removes economy file
            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip(t('delete'))
                .setClass('mod-warning') // Visual warning styling
                .onClick(async () => {
                    // Simple confirmation dialog
                    if (confirm(t('confirmDeleteEconomy', economy.name))) {
                        if (economy.filePath) {
                            await this.plugin.deleteEconomy(economy.filePath);
                            // Update local economy list and re-render
                            this.economies = this.economies.filter(e => e.filePath !== economy.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice(t('cannotDeleteWithoutPath'));
                        }
                    }
                });

            // Open note button - opens economy file directly in Obsidian
             new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip(t('openNote'))
                .onClick(() => {
                    if (!economy.filePath) {
                        new Notice(t('cannotOpenWithoutPath'));
                        return;
                    }

                    // Find and open the economy file
                    const file = this.app.vault.getAbstractFileByPath(economy.filePath!);
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
