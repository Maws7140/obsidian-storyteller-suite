import { App, Modal, Setting, Notice, ButtonComponent, TFile } from 'obsidian';
import { Event } from '../types';
import StorytellerSuitePlugin from '../main';
import { EventModal } from './EventModal';

export class TimelineModal extends Modal {
    plugin: StorytellerSuitePlugin;
    events: Event[];
    listContainer: HTMLElement; // Store container reference

    constructor(app: App, plugin: StorytellerSuitePlugin, events: Event[]) {
        super(app);
        this.plugin = plugin;
        // Ensure events are sorted (main.ts listEvents should handle this)
        this.events = events;
        this.modalEl.addClass('storyteller-list-modal storyteller-timeline-modal'); // Add specific class
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Timeline' });

        // Store the container element
        this.listContainer = contentEl.createDiv('storyteller-list-container storyteller-timeline-container');

        const searchInput = new Setting(contentEl)
            .setName('Search')
            .addText(text => {
                text.setPlaceholder('Filter events...')
                    // Pass the container to renderList
                    .onChange(value => this.renderList(value.toLowerCase(), this.listContainer));
            });

        // Initial render using the stored container
        this.renderList('', this.listContainer);

        // Add New button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Create new event')
                .setCta()
                .onClick(() => {
                    this.close(); // Close list modal
                    new EventModal(this.app, this.plugin, null, async (eventData: Event) => {
                        await this.plugin.saveEvent(eventData);
                        new Notice(`Event "${eventData.name}" created.`);
                        // Optionally reopen list modal or dashboard
                    }).open();
                }));
    }

    renderList(filter: string, container: HTMLElement) {
        container.empty();
        const filtered = this.events.filter(evt =>
            evt.name.toLowerCase().includes(filter) ||
            (evt.description || '').toLowerCase().includes(filter) ||
            (evt.dateTime || '').toLowerCase().includes(filter) ||
            (evt.location || '').toLowerCase().includes(filter)
        );

        if (filtered.length === 0) {
            container.createEl('p', { text: 'No events found.' + (filter ? ' Matching filter.' : '') });
            return;
        }

        // Simple list view for now
        filtered.forEach(event => {
            const itemEl = container.createDiv('storyteller-list-item');
            const infoEl = itemEl.createDiv('storyteller-list-item-info');
            infoEl.createEl('strong', { text: event.name });
            if (event.dateTime) {
                infoEl.createEl('span', { text: ` (${event.dateTime})`, cls: 'storyteller-timeline-date' });
            }
            if (event.description) {
                infoEl.createEl('p', { text: event.description.substring(0, 100) + (event.description.length > 100 ? '...' : '') });
            }

            const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
            new ButtonComponent(actionsEl) // Edit
                .setIcon('pencil')
                .setTooltip('Edit')
                .onClick(() => {
                    // Close this modal and open the edit modal
                    this.close();
                    new EventModal(this.app, this.plugin, event, async (updatedData: Event) => {
                        await this.plugin.saveEvent(updatedData);
                        new Notice(`Event "${updatedData.name}" updated.`);
                        // Optionally reopen list modal
                    }).open();
                });

            new ButtonComponent(actionsEl) // Delete
                .setIcon('trash')
                .setTooltip('Delete')
                .setClass('mod-warning') // Add warning class for visual cue
                .onClick(async () => {
                    // Simple confirmation for now
                    if (confirm(`Are you sure you want to delete "${event.name}"?`)) {
                        if (event.filePath) {
                            await this.plugin.deleteEvent(event.filePath);
                            // Refresh the list in the modal
                            this.events = this.events.filter(e => e.filePath !== event.filePath);
                            this.renderList(filter, container);
                        } else {
                            new Notice('Error: Cannot delete event without file path.');
                        }
                    }
                });

            new ButtonComponent(actionsEl) // Open Note
               .setIcon('go-to-file')
               .setTooltip('Open note')
               .onClick(() => {
                   if (event.filePath) {
                       const file = this.app.vault.getAbstractFileByPath(event.filePath);
                       if (file instanceof TFile) {
                           this.app.workspace.getLeaf(false).openFile(file);
                           this.close();
                       } else {
                           new Notice('Could not find the note file.');
                       }
                   }
               });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
