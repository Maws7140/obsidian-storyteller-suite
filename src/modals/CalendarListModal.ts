/* eslint-disable @typescript-eslint/no-unused-vars */

// Core Obsidian imports for modal functionality
import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { t } from '../i18n/strings';

// Import types and related modals
import { Calendar } from '../types';
import StorytellerSuitePlugin from '../main';
import { CalendarModal } from './CalendarModal';

/**
 * Modal dialog for displaying and managing a list of calendars
 * Provides search/filter functionality and quick actions for each calendar
 * Integrates with CalendarModal for editing individual calendars
 */
export class CalendarListModal extends Modal {
    /** Reference to the main plugin instance */
    plugin: StorytellerSuitePlugin;

    /** Array of calendar data to display */
    calendars: Calendar[];

    /** Container element for the calendar list (stored for re-rendering) */
    listContainer: HTMLElement;

    /**
     * Constructor for the calendar list modal
     * @param app Obsidian app instance
     * @param plugin Reference to the main plugin instance
     * @param calendars Array of calendars to display in the list
     */
    constructor(app: App, plugin: StorytellerSuitePlugin, calendars: Calendar[]) {
        super(app);
        this.plugin = plugin;
        this.calendars = calendars;
        this.modalEl.addClass('storyteller-list-modal');
    }

    /**
     * Initialize and render the modal content
     * Called when the modal is opened
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Calendars' });

        // Create container for the calendar list (stored for filtering)
        this.listContainer = contentEl.createDiv('storyteller-list-container');

        // Add search input with real-time filtering
        const searchInput = new Setting(contentEl)
            .setName(t('search'))
            .addText(text => {
                text.setPlaceholder('Search calendars...')
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Render initial list (no filter)
        this.renderList('', this.listContainer);

        // Add "Create New Calendar" button at bottom
        new Setting(contentEl)
            .addButton(button => {
                const hasActiveStory = !!this.plugin.getActiveStory();
                button
                    .setButtonText('Create Calendar')
                    .setCta()
                    .onClick(() => {
                        if (!this.plugin.getActiveStory()) {
                            new Notice(t('selectOrCreateStoryFirst'));
                            return;
                        }
                        this.close();
                        new CalendarModal(this.app, this.plugin, null, async (calendarData: Calendar) => {
                            await this.plugin.saveCalendar(calendarData);
                            new Notice(`Calendar "${calendarData.name}" created.`);
                            new Notice(t('noteCreatedWithSections'));
                        }).open();
                    });
                if (!hasActiveStory) {
                    button.setDisabled(true).setTooltip(t('selectOrCreateStoryFirst'));
                }
            });
    }

    /**
     * Render the filtered calendar list
     * @param filter Lowercase search term to filter calendars by
     * @param container The container element to render the list into
     */
    renderList(filter: string, container: HTMLElement) {
        container.empty(); // Clear previous list content

        // Filter calendars based on name, type, and description
        const filteredCalendars = this.calendars.filter(calendar =>
            calendar.name.toLowerCase().includes(filter) ||
            (calendar.calendarType || '').toLowerCase().includes(filter) ||
            (calendar.description || '').toLowerCase().includes(filter)
        );

        // Handle empty results
        if (filteredCalendars.length === 0) {
            container.createEl('p', { text: 'No calendars found' + (filter ? ' matching filter' : '') });
            return;
        }

        // Render each calendar as a list item
        filteredCalendars.forEach(calendar => {
            const itemEl = container.createDiv('storyteller-list-item');

            // Calendar info section (name and description preview)
            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: calendar.name });

            // Show additional info
            const metaInfo: string[] = [];
            if (calendar.calendarType) metaInfo.push(`Type: ${calendar.calendarType}`);
            if (calendar.daysPerYear) metaInfo.push(`${calendar.daysPerYear} days/year`);
            if (calendar.months && calendar.months.length > 0) {
                metaInfo.push(`${calendar.months.length} months`);
            }
            if (metaInfo.length > 0) {
                infoEl.createEl('p', { text: metaInfo.join(' | '), cls: 'storyteller-list-meta' });
            }

            if (calendar.description) {
                // Show description preview (truncated to 100 characters)
                const preview = calendar.description.substring(0, 100);
                const displayText = calendar.description.length > 100 ? preview + '...' : preview;
                infoEl.createEl('p', { text: displayText });
            }

            // Action buttons section
            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');

            // Edit button - opens calendar in edit modal
            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip(t('edit'))
                .onClick(() => {
                    this.close(); // Close list modal
                    new CalendarModal(this.app, this.plugin, calendar, async (updatedData: Calendar) => {
                        await this.plugin.saveCalendar(updatedData);
                        new Notice(`Calendar "${updatedData.name}" updated.`);
                        // Could optionally reopen list modal
                    }).open();
                });

            // Delete button - removes calendar file
            new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip(t('delete'))
                .setClass('mod-warning') // Visual warning styling
                .onClick(async () => {
                    // Simple confirmation dialog
                    if (confirm(`Delete calendar "${calendar.name}"? (Moved to trash)`)) {
                        if (calendar.filePath) {
                            await this.plugin.deleteCalendar(calendar.filePath);
                            // Update local calendar list and re-render
                            this.calendars = this.calendars.filter(c => c.filePath !== calendar.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice(`Cannot delete calendar without file path.`);
                        }
                    }
                });

            // Open note button - opens calendar file directly in Obsidian
             new ButtonComponent(actionsEl)
                .setIcon('go-to-file')
                .setTooltip(t('openNote'))
                .onClick(() => {
                    if (!calendar.filePath) {
                        new Notice(`Cannot open note without file path.`);
                        return;
                    }

                    // Find and open the calendar file
                    const file = this.app.vault.getAbstractFileByPath(calendar.filePath!);
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
