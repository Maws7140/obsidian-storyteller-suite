import { App, Modal, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Event, GalleryImage } from '../types'; // Added GalleryImage
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
// Placeholder imports for suggesters - these would need to be created
// import { CharacterSuggestModal } from './CharacterSuggestModal'; // Assumed multi-select
// import { LocationSuggestModal } from './LocationSuggestModal'; // Assumed single-select
// import { MultiGalleryImageSuggestModal } from './MultiGalleryImageSuggestModal'; // Assumed multi-select

export type EventModalSubmitCallback = (event: Event) => Promise<void>;
export type EventModalDeleteCallback = (event: Event) => Promise<void>; // Added for delete

export class EventModal extends Modal {
    event: Event;
    plugin: StorytellerSuitePlugin;
    onSubmit: EventModalSubmitCallback;
    onDelete?: EventModalDeleteCallback; // Optional delete callback
    isNew: boolean;

    // Added onDelete parameter
    constructor(app: App, plugin: StorytellerSuitePlugin, event: Event | null, onSubmit: EventModalSubmitCallback, onDelete?: EventModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = event === null;
        // Ensure customFields is initialized as an object
        const initialEvent = event ? { ...event } : { name: '', dateTime: '', description: '', outcome: '', status: undefined, profileImagePath: undefined, characters: [], location: undefined, images: [], customFields: {} };
        if (!initialEvent.customFields) {
            initialEvent.customFields = {};
        }
        this.event = initialEvent;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete; // Store delete callback
        this.modalEl.addClass('storyteller-event-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Create New Event' : `Edit ${this.event.name}` });

        // --- Name ---
        new Setting(contentEl)
            .setName('Name')
            .setDesc('The event\'s name.')
            .addText(text => text
                .setPlaceholder('Enter event name')
                .setValue(this.event.name)
                .onChange(value => { this.event.name = value; })
                .inputEl.addClass('storyteller-modal-input-large'));

        // --- Date/Time ---
        new Setting(contentEl)
            .setName('Date/Time')
            .setDesc('When the event occurred (e.g., YYYY-MM-DD HH:MM or descriptive).')
            .addText(text => text
                .setPlaceholder('Enter date/time')
                .setValue(this.event.dateTime || '')
                .onChange(value => { this.event.dateTime = value || undefined; }));

        // --- Description ---
        new Setting(contentEl)
            .setName('Description')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder('A description of the event...')
                    .setValue(this.event.description || '')
                    .onChange(value => { this.event.description = value || undefined; });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // --- Outcome ---
        new Setting(contentEl)
            .setName('Outcome')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder('The result or consequences of the event...')
                    .setValue(this.event.outcome || '')
                    .onChange(value => { this.event.outcome = value || undefined; });
                text.inputEl.rows = 3;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // --- Status ---
        new Setting(contentEl)
            .setName('Status')
            .setDesc('e.g., Upcoming, Completed, Ongoing, Key Plot Point')
            .addText(text => text
                .setValue(this.event.status || '')
                .onChange(value => { this.event.status = value || undefined; }));

        // --- Representative Image ---
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', { text: `Current: ${this.event.profileImagePath || 'None'}` });
                setting.descEl.style.width = '100%';
                setting.descEl.style.marginBottom = 'var(--size-4-1)';
            })
            .addButton(button => button
                .setButtonText('Select')
                .setTooltip('Select from Gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.event.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.event.profileImagePath || 'None'}`);
                    }).open();
                }))
            .addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear Image')
                .setClass('mod-warning')
                .onClick(() => {
                    this.event.profileImagePath = undefined;
                    imagePathDesc.setText(`Current: ${this.event.profileImagePath || 'None'}`);
                }));

        // --- Links ---
        contentEl.createEl('h3', { text: 'Links' });

        // --- Characters ---
        const charactersSetting = new Setting(contentEl)
            .setName('Characters Involved')
            .setDesc('Manage linked characters.');
        const charactersListEl = charactersSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderList(charactersListEl, this.event.characters || [], 'character');
        charactersSetting.addButton(button => button
            .setButtonText('Add Character')
            .setTooltip('Select character(s) to link')
            .setCta()
            .onClick(async () => {
                // Placeholder - Replace with actual CharacterSuggestModal (multi-select)
                new Notice('Character suggester not yet implemented.');
            }));

        // --- Location ---
        const locationSetting = new Setting(contentEl)
            .setName('Location')
            .setDesc(`Current: ${this.event.location || 'None'}`);
        const selectLocationButton = locationSetting.addButton(button => button
            .setButtonText(this.event.location ? 'Change Location' : 'Select Location')
            .setTooltip('Select location')
            .onClick(async () => {
                // Placeholder - Replace with actual LocationSuggestModal (single-select)
                new Notice('Location suggester not yet implemented.');
            }));
        this.updateLocationClearButton(locationSetting);

        // --- Associated Images ---
        const imagesSetting = new Setting(contentEl)
            .setName('Associated Images')
            .setDesc('Manage linked gallery images.');
        const imagesListEl = imagesSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderList(imagesListEl, this.event.images || [], 'image');
        imagesSetting.addButton(button => button
            .setButtonText('Add Image(s)')
            .setTooltip('Select image(s) from gallery')
            .setCta()
            .onClick(() => {
                // Placeholder - Replace with actual MultiGalleryImageSuggestModal
                new Notice('Multi-image gallery suggester not yet implemented.');
            }));

        // --- Custom Fields ---
        contentEl.createEl('h3', { text: 'Custom Fields' });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        this.renderCustomFields(customFieldsContainer, this.event.customFields || {});

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Add Custom Field')
                .setIcon('plus')
                .onClick(() => {
                    if (!this.event.customFields) {
                        this.event.customFields = {};
                    }
                    const fields = this.event.customFields;
                    const newKey = `field_${Object.keys(fields).length + 1}`;
                    fields[newKey] = '';
                    this.renderCustomFields(customFieldsContainer, fields);
                }));

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');

        // Delete Button (only if editing and onDelete provided)
        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete Event')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (this.onDelete) {
                        try {
                            await this.onDelete(this.event);
                            new Notice(`Event "${this.event.name}" deleted.`);
                            this.close();
                        } catch (error) {
                            console.error("Error deleting event:", error);
                            new Notice("Failed to delete event. Check console for details.");
                        }
                    }
                }));
        }

        // Spacer
        buttonsSetting.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });

        // Cancel Button
        buttonsSetting.addButton(button => button
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            }));

        // Submit Button
        buttonsSetting.addButton(button => button
            .setButtonText(this.isNew ? 'Create Event' : 'Save Changes')
            .setCta()
            .onClick(async () => {
                if (!this.event.name?.trim()) {
                    new Notice("Event name cannot be empty.");
                    return;
                }
                try {
                    await this.onSubmit(this.event);
                    this.close();
                } catch (error) {
                    console.error("Error saving event:", error);
                    new Notice("Failed to save event. Check console for details.");
                }
            }));
    }

    // Helper to add/remove the location clear button dynamically
    updateLocationClearButton(locationSetting: Setting) {
        const existingClearButton = locationSetting.controlEl.querySelector('.storyteller-clear-location-button');

        if (this.event.location && !existingClearButton) {
            locationSetting.addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear Location')
                .setClass('mod-warning')
                .setClass('storyteller-clear-location-button')
                .onClick(() => {
                    this.event.location = undefined;
                    locationSetting.setDesc(`Current: ${this.event.location || 'None'}`);
                    const selectButton = locationSetting.controlEl.querySelector('.button:not(.mod-warning)') as HTMLButtonElement;
                    if (selectButton) selectButton.setText('Select Location');
                    button.buttonEl.remove();
                }));
        } else if (!this.event.location && existingClearButton) {
            existingClearButton.remove();
        }
    }

    // Helper to render lists (Characters, Images)
    renderList(container: HTMLElement, items: string[], type: 'character' | 'image' | 'location' | 'relationship' | 'event' | 'sublocation') {
        container.empty();
        if (!items || items.length === 0) {
            container.createEl('span', { text: 'None', cls: 'storyteller-modal-list-empty' });
            return;
        }
        items.forEach((item, index) => {
            const displayItem = item;
            const itemEl = container.createDiv('storyteller-modal-list-item');
            itemEl.createSpan({ text: displayItem });
            new ButtonComponent(itemEl)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(`Remove ${displayItem}`)
                .setIcon('cross')
                .onClick(() => {
                    if (type === 'character') {
                        this.event.characters?.splice(index, 1);
                    } else if (type === 'image') {
                        this.event.images?.splice(index, 1);
                    }
                    this.renderList(container, items, type);
                });
        });
    }

    // Helper to render custom fields
    renderCustomFields(container: HTMLElement, fields: { [key: string]: any }) {
        container.empty();
        fields = fields || {};
        const keys = Object.keys(fields);

        if (keys.length === 0) {
            container.createEl('p', { text: 'No custom fields defined.', cls: 'storyteller-modal-list-empty' });
            return;
        }

        keys.forEach(key => {
            const fieldSetting = new Setting(container)
                .addText(text => text
                    .setValue(key)
                    .setPlaceholder('Field Name')
                    .onChange(newKey => {
                        if (newKey && newKey !== key && !fields.hasOwnProperty(newKey)) {
                            fields[newKey] = fields[key];
                            delete fields[key];
                        } else if (newKey !== key) {
                            text.setValue(key);
                            new Notice("Custom field name must be unique and not empty.");
                        }
                    }))
                .addText(text => text
                    .setValue(fields[key]?.toString() || '')
                    .setPlaceholder('Field Value')
                    .onChange(value => {
                        fields[key] = value;
                    }))
                .addButton(button => button
                    .setIcon('trash')
                    .setTooltip(`Remove field "${key}"`)
                    .setClass('mod-warning')
                    .onClick(() => {
                        delete fields[key];
                        this.renderCustomFields(container, fields);
                    }));
            fieldSetting.controlEl.addClass('storyteller-custom-field-row');
            fieldSetting.infoEl.addClass('storyteller-custom-field-key');
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
