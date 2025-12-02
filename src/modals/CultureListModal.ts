/* eslint-disable @typescript-eslint/no-unused-vars */

// Core Obsidian imports for modal functionality
import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';

// Import types and related modals
import { Culture } from '../types';
import StorytellerSuitePlugin from '../main';
import { CultureModal } from './CultureModal';

/**
 * Modal dialog for displaying and managing a list of cultures
 * Provides search/filter functionality and quick actions for each culture
 * Integrates with CultureModal for editing individual cultures
 */
export class CultureListModal extends Modal {
    /** Reference to the main plugin instance */
    plugin: StorytellerSuitePlugin;

    /** Array of culture data to display */
    cultures: Culture[];

    /** Container element for the culture list (stored for re-rendering) */
    listContainer: HTMLElement;

    /**
     * Constructor for the culture list modal
     * @param app Obsidian app instance
     * @param plugin Reference to the main plugin instance
     * @param cultures Array of cultures to display in the list
     */
    constructor(app: App, plugin: StorytellerSuitePlugin, cultures: Culture[]) {
        super(app);
        this.plugin = plugin;
        this.cultures = cultures;
        this.modalEl.addClass('storyteller-list-modal');
    }

    /**
     * Initialize and render the modal content
     * Called when the modal is opened
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('cultures') });

        // Create container for the culture list (stored for filtering)
        this.listContainer = contentEl.createDiv('storyteller-list-container');

        // Add search input with real-time filtering
        const searchInput = new Setting(contentEl)
            .setName(t('search'))
            .addText(text => {
                text.setPlaceholder(t('searchCultures'))
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Render initial list (no filter)
        this.renderList('', this.listContainer);

        // Add "Create New Culture" button at bottom
        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText(t('createCulture'))
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new CultureModal(this.app, this.plugin, null, async (cultureData: Culture) => {
                            await this.plugin.saveCulture(cultureData);
                            new Notice(t('cultureCreated', cultureData.name));
                            new Notice(t('noteCreatedWithSections'));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip(t('selectOrCreateStoryFirst'));
                }
            });
    }

    /**
     * Render the filtered culture list
     * @param filter Lowercase search term to filter cultures by
     * @param container The container element to render the list into
     */
    renderList(filter: string, container: HTMLElement) {
        container.empty(); // Clear previous list content

        // Filter cultures based on name, values, religion, and government type
        const filteredCultures = this.cultures.filter(culture =>
            culture.name.toLowerCase().includes(filter) ||
            (culture.values || '').toLowerCase().includes(filter) ||
            (culture.religion || '').toLowerCase().includes(filter) ||
            (culture.governmentType || '').toLowerCase().includes(filter) ||
            (culture.languages || []).join(' ').toLowerCase().includes(filter)
        );

        // Handle empty results
        if (filteredCultures.length === 0) {
            container.createEl('p', { text: t('noCulturesFound') + (filter ? t('matchingFilter') : '') });
            return;
        }

        // Render each culture as a list item
        filteredCultures.forEach(culture => {
            const itemEl = container.createDiv('storyteller-list-item');

            // Culture info section (name and description preview)
            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: culture.name });

            // Show additional info
            const metaInfo: string[] = [];
            if (culture.governmentType) metaInfo.push(`Gov: ${culture.governmentType}`);
            if (culture.techLevel) metaInfo.push(`Tech: ${culture.techLevel}`);
            if (culture.status) metaInfo.push(`Status: ${culture.status}`);
            if (metaInfo.length > 0) {
                infoEl.createEl('p', { text: metaInfo.join(' | '), cls: 'storyteller-list-meta' });
            }

            if (culture.values) {
                // Show values preview (truncated to 100 characters)
                const preview = culture.values.substring(0, 100);
                const displayText = culture.values.length > 100 ? preview + '...' : preview;
                infoEl.createEl('p', { text: displayText });
            }

            // Action buttons section
            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

            // Edit button - opens culture in edit modal
            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip(t('edit'))
                .onClick(() => {
                    this.close(); // Close list modal
                    new CultureModal(this.app, this.plugin, culture, async (updatedData: Culture) => {
                        await this.plugin.saveCulture(updatedData);
                        new Notice(t('cultureUpdated', updatedData.name));
                        // Could optionally reopen list modal
                    }).open();
                });

            // Delete button - removes culture file
            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip(t('delete'))
                .setClass('mod-warning') // Visual warning styling
                .onClick(async () => {
                    // Simple confirmation dialog
                    if (confirm(t('confirmDeleteCulture', culture.name))) {
                        if (culture.filePath) {
                            await this.plugin.deleteCulture(culture.filePath);
                            // Update local culture list and re-render
                            this.cultures = this.cultures.filter(c => c.filePath !== culture.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice(t('cannotDeleteWithoutPath'));
                        }
                    }
                });

            // Open note button - opens culture file directly in Obsidian
             new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip(t('openNote'))
                .onClick(() => {
                    if (!culture.filePath) {
                        new Notice(t('cannotOpenWithoutPath'));
                        return;
                    }

                    // Find and open the culture file
                    const file = this.app.vault.getAbstractFileByPath(culture.filePath!);
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
