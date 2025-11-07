import { App, Modal, Setting, Notice, TextAreaComponent, DropdownComponent } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { TimelineFork, Event } from '../types';
import { EventSuggestModal } from './EventSuggestModal';

export type TimelineForkModalSubmitCallback = (fork: TimelineFork) => Promise<void>;
export type TimelineForkModalDeleteCallback = (fork: TimelineFork) => Promise<void>;

/**
 * Modal for creating and editing timeline forks (alternate timelines)
 */
export class TimelineForkModal extends Modal {
    fork: TimelineFork;
    plugin: StorytellerSuitePlugin;
    onSubmit: TimelineForkModalSubmitCallback;
    onDelete?: TimelineForkModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        fork: TimelineFork | null,
        onSubmit: TimelineForkModalSubmitCallback,
        onDelete?: TimelineForkModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.isNew = fork === null;

        this.fork = fork || {
            id: Date.now().toString(),
            name: '',
            parentTimelineId: undefined,
            divergenceEvent: '',
            divergenceDate: '',
            description: '',
            status: 'exploring',
            forkEvents: [],
            alteredCharacters: [],
            alteredLocations: [],
            color: this.plugin.generateRandomColor(),
            created: new Date().toISOString(),
            notes: ''
        };

        this.modalEl.addClass('storyteller-timeline-fork-modal');
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? 'Create Timeline Fork' : `Edit Timeline Fork: ${this.fork.name}`
        });

        // Name
        new Setting(contentEl)
            .setName('Fork Name')
            .setDesc('Descriptive name for this alternate timeline')
            .addText(text => text
                .setPlaceholder('e.g., "What if the hero died?"')
                .setValue(this.fork.name)
                .onChange(value => this.fork.name = value)
            );

        // Divergence Event (with suggester)
        const divergenceEventSetting = new Setting(contentEl)
            .setName('Divergence Event')
            .setDesc('The event where this timeline branches from the main timeline');

        divergenceEventSetting.addText(text => text
            .setPlaceholder('Select or enter event name...')
            .setValue(this.fork.divergenceEvent)
            .onChange(value => this.fork.divergenceEvent = value)
        );

        divergenceEventSetting.addButton(button => button
            .setButtonText('Select Event')
            .onClick(async () => {
                new EventSuggestModal(
                    this.app,
                    this.plugin,
                    (selectedEvent: Event) => {
                        this.fork.divergenceEvent = selectedEvent.name;
                        // Update the text input to show selected event
                        const textInput = divergenceEventSetting.components.find(c => c instanceof TextAreaComponent || 'inputEl' in c) as any;
                        if (textInput && textInput.setValue) {
                            textInput.setValue(selectedEvent.name);
                        }
                    }
                ).open();
            })
        );

        // Divergence Date
        new Setting(contentEl)
            .setName('Divergence Date')
            .setDesc('When this timeline diverges (YYYY-MM-DD format)')
            .addText(text => text
                .setPlaceholder('e.g., 1985-02-15')
                .setValue(this.fork.divergenceDate)
                .onChange(value => this.fork.divergenceDate = value)
            );

        // Status
        new Setting(contentEl)
            .setName('Status')
            .setDesc('Current status of this timeline fork')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'exploring': 'Exploring',
                    'canon': 'Canon (This is the main timeline)',
                    'abandoned': 'Abandoned',
                    'merged': 'Merged back to main timeline'
                })
                .setValue(this.fork.status || 'exploring')
                .onChange(value => this.fork.status = value as 'exploring' | 'canon' | 'abandoned' | 'merged')
            );

        // Color Picker
        const colorSetting = new Setting(contentEl)
            .setName('Timeline Color')
            .setDesc('Color for visualizing this fork in the timeline view');

        colorSetting.addText(text => {
            text.setValue(this.fork.color || '#FF6B6B')
                .onChange(value => this.fork.color = value);
            text.inputEl.setAttribute('type', 'color');
            text.inputEl.style.width = '100px';
            text.inputEl.style.height = '40px';
        });

        colorSetting.addButton(button => button
            .setButtonText('Random')
            .onClick(() => {
                this.fork.color = this.plugin.generateRandomColor();
                const colorInput = colorSetting.components.find(c => 'inputEl' in c) as any;
                if (colorInput && colorInput.setValue) {
                    colorInput.setValue(this.fork.color);
                }
            })
        );

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('How does this timeline differ from the main timeline?')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.fork.description || '')
                    .onChange(value => this.fork.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Notes
        new Setting(contentEl)
            .setName('Notes')
            .setDesc('Additional notes about this timeline fork')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.fork.notes || '')
                    .onChange(value => this.fork.notes = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Display altered entities if editing existing fork
        if (!this.isNew) {
            const alteredSection = contentEl.createDiv('storyteller-fork-altered-entities');
            alteredSection.createEl('h3', { text: 'Altered Entities' });

            if (this.fork.alteredCharacters && this.fork.alteredCharacters.length > 0) {
                alteredSection.createEl('h4', { text: 'Characters:' });
                const charList = alteredSection.createEl('ul');
                this.fork.alteredCharacters.forEach(char => {
                    charList.createEl('li', { text: `${char.entityId}: ${char.changes}` });
                });
            }

            if (this.fork.alteredLocations && this.fork.alteredLocations.length > 0) {
                alteredSection.createEl('h4', { text: 'Locations:' });
                const locList = alteredSection.createEl('ul');
                this.fork.alteredLocations.forEach(loc => {
                    locList.createEl('li', { text: `${loc.entityId}: ${loc.changes}` });
                });
            }

            if (this.fork.forkEvents && this.fork.forkEvents.length > 0) {
                alteredSection.createEl('h4', { text: 'Fork-specific Events:' });
                const eventList = alteredSection.createEl('ul');
                this.fork.forkEvents.forEach(eventId => {
                    eventList.createEl('li', { text: eventId });
                });
            }
        }

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                if (!this.fork.name) {
                    new Notice('Fork name is required');
                    return;
                }
                if (!this.fork.divergenceEvent) {
                    new Notice('Divergence event is required');
                    return;
                }
                await this.onSubmit(this.fork);
                this.close();
            })
        );

        buttonsSetting.addButton(button => button
            .setButtonText('Cancel')
            .onClick(() => this.close())
        );

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete')
                .setWarning()
                .onClick(async () => {
                    if (this.onDelete) {
                        await this.onDelete(this.fork);
                        this.close();
                    }
                })
            );
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
