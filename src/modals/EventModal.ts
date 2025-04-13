import { App, Modal, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Event, GalleryImage, Character, Location } from '../types'; // Added Character, Location
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
// Import the new suggesters
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
// Remove placeholder import for multi-image
// import { MultiGalleryImageSuggestModal } from './MultiGalleryImageSuggestModal';

export type EventModalSubmitCallback = (event: Event) => Promise<void>;
export type EventModalDeleteCallback = (event: Event) => Promise<void>;

export class EventModal extends Modal {
    event: Event;
    plugin: StorytellerSuitePlugin;
    onSubmit: EventModalSubmitCallback;
    onDelete?: EventModalDeleteCallback;
    isNew: boolean;

    // Elements to update dynamically
    charactersListEl: HTMLElement;
    imagesListEl: HTMLElement;
    locationSetting: Setting; // Store the setting itself
    selectLocationButton: ButtonComponent; // Store the select button

    constructor(app: App, plugin: StorytellerSuitePlugin, event: Event | null, onSubmit: EventModalSubmitCallback, onDelete?: EventModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = event === null;
        const initialEvent = event ? { ...event } : { name: '', dateTime: '', description: '', outcome: '', status: undefined, profileImagePath: undefined, characters: [], location: undefined, images: [], customFields: {} };
        if (!initialEvent.customFields) initialEvent.customFields = {};
        // Ensure link arrays are initialized
        if (!initialEvent.characters) initialEvent.characters = [];
        if (!initialEvent.images) initialEvent.images = [];

        this.event = initialEvent;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-event-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Create New Event' : `Edit ${this.event.name}` });

        // --- Standard Fields (Name, DateTime, Description, etc.) ---
        new Setting(contentEl)
            .setName('Name')
            .setDesc('The event\'s name.')
            .addText(text => text
                .setPlaceholder('Enter event name')
                .setValue(this.event.name)
                .onChange(value => { this.event.name = value; })
                .inputEl.addClass('storyteller-modal-input-large'));

        new Setting(contentEl)
            .setName('Date/Time')
            .setDesc('When the event occurred (e.g., YYYY-MM-DD HH:MM or descriptive).')
            .addText(text => text
                .setPlaceholder('Enter date/time')
                .setValue(this.event.dateTime || '')
                .onChange(value => { this.event.dateTime = value || undefined; }));

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

        new Setting(contentEl)
            .setName('Status')
            .setDesc('e.g., Upcoming, Completed, Ongoing, Key Plot Point')
            .addText(text => text
                .setValue(this.event.status || '')
                .onChange(value => { this.event.status = value || undefined; }));

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
        // Store the list container element
        this.charactersListEl = charactersSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderList(this.charactersListEl, this.event.characters || [], 'character'); // Initial render
        charactersSetting.addButton(button => button
            .setButtonText('Add Character')
            .setTooltip('Select character to link') // Changed tooltip to singular
            .setCta()
            .onClick(() => { // Removed async as suggester handles await internally
                // Use the new CharacterSuggestModal
                new CharacterSuggestModal(this.app, this.plugin, (selectedCharacter) => {
                    if (selectedCharacter && selectedCharacter.name) {
                        // Ensure characters array exists
                        if (!this.event.characters) {
                            this.event.characters = [];
                        }
                        // Add character if not already present (using name as identifier for simplicity)
                        if (!this.event.characters.includes(selectedCharacter.name)) {
                            this.event.characters.push(selectedCharacter.name);
                            // Re-render the list in the modal
                            this.renderList(this.charactersListEl, this.event.characters, 'character');
                        } else {
                            new Notice(`Character "${selectedCharacter.name}" is already linked.`);
                        }
                    }
                }).open();
            }));

        // --- Location ---
        // Store the setting itself for later updates
        this.locationSetting = new Setting(contentEl)
            .setName('Location')
            .setDesc(`Current: ${this.event.location || 'None'}`); // Initial description

        // Assign the button component inside the callback
        this.locationSetting.addButton(button => {
            // Store the button component reference
            this.selectLocationButton = button;

            // Configure the button
            button
                .setTooltip('Select event location')
                .onClick(() => { // Removed async
                    // Use the new LocationSuggestModal
                    new LocationSuggestModal(this.app, this.plugin, (selectedLocation) => {
                        // selectedLocation can be Location object or null
                        const locationName = selectedLocation ? selectedLocation.name : undefined;
                        this.event.location = locationName;

                        // Update the location display
                        this.locationSetting.setDesc(`Current: ${this.event.location || 'None'}`);
                        this.updateLocationClearButton(); // Update location buttons

                        // ADD THIS LINE: Explicitly re-render the character list
                        this.renderList(this.charactersListEl, this.event.characters || [], 'character');

                    }).open();
                });
        }); // End of addButton configuration

        // Call this AFTER the button has been created and assigned
        this.updateLocationClearButton(); // Initial setup/update of buttons

        // --- Associated Images ---
        const imagesSetting = new Setting(contentEl)
            .setName('Associated Images')
            .setDesc('Manage linked gallery images.');
        // Store the list container element
        this.imagesListEl = imagesSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderList(this.imagesListEl, this.event.images || [], 'image'); // Initial render
        imagesSetting.addButton(button => button
            .setButtonText('Add Image') // Changed to singular as we add one by one
            .setTooltip('Select image from gallery') // Changed tooltip
            .setCta()
            .onClick(() => {
                // Use the existing GalleryImageSuggestModal
                new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                    if (selectedImage && selectedImage.filePath) {
                        // Use filePath as the identifier/link
                        const imagePath = selectedImage.filePath;
                        // Ensure images array exists
                        if (!this.event.images) {
                            this.event.images = [];
                        }
                        // Add image path if not already present
                        if (!this.event.images.includes(imagePath)) {
                            this.event.images.push(imagePath);
                            this.renderList(this.imagesListEl, this.event.images, 'image'); // Re-render list
                        } else {
                            new Notice(`Image "${imagePath}" is already linked.`);
                        }
                    }
                    // No action needed if selectedImage is null (Shift+Enter)
                }).open();
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

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete Event')
                .setClass('mod-warning')
                .onClick(async () => {
                    // Added confirmation dialog
                    if (confirm(`Are you sure you want to delete the event "${this.event.name}"? This will move the note to system trash.`)) {
                        if (this.onDelete) {
                            try {
                                await this.onDelete(this.event);
                                // Notice is now handled within the callback if provided, or here if not
                                // new Notice(`Event "${this.event.name}" deleted.`);
                                this.close();
                            } catch (error) {
                                console.error("Error deleting event:", error);
                                new Notice("Failed to delete event. Check console for details.");
                            }
                        }
                    }
                }));
        }

        buttonsSetting.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });

        buttonsSetting.addButton(button => button
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            }));

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
                    // Notice is handled by the onSubmit callback provided by the caller
                    this.close();
                } catch (error) {
                    console.error("Error saving event:", error);
                    new Notice("Failed to save event. Check console for details.");
                }
            }));
    }

    // Updated Helper to add/remove the location clear button dynamically
    updateLocationClearButton() {
        // Ensure the setting container exists
        if (!this.locationSetting || !this.locationSetting.controlEl) return;

        const controlEl = this.locationSetting.controlEl;
        const existingClearButton = controlEl.querySelector('.storyteller-clear-location-button');

        // Update Select/Change button text
        if (this.selectLocationButton) {
            this.selectLocationButton.setButtonText(this.event.location ? 'Change Location' : 'Select Location');
        }

        // Add clear button if location is set and button doesn't exist
        if (this.event.location && !existingClearButton) {
            this.locationSetting.addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear Location (set to None)')
                .setClass('mod-warning')
                .setClass('storyteller-clear-location-button') // Add class for identification
                .onClick(() => {
                    this.event.location = undefined;
                    this.locationSetting.setDesc(`Current: ${this.event.location || 'None'}`);
                    this.updateLocationClearButton(); // Re-run to remove button and update text
                }));
        }
        // Remove clear button if location is not set and button exists
        else if (!this.event.location && existingClearButton) {
            existingClearButton.remove();
        }
    }

    // Helper to render lists (Characters, Images)
    // Using string (name/path) as item identifier for simplicity
    renderList(container: HTMLElement, items: string[], type: 'character' | 'image') {
        container.empty();
        if (!items || items.length === 0) {
            container.createEl('span', { text: 'None', cls: 'storyteller-modal-list-empty' });
            return;
        }
        items.forEach((item, index) => {
            const itemEl = container.createDiv('storyteller-modal-list-item');
            // Display the item (character name or image path)
            itemEl.createSpan({ text: item });
            new ButtonComponent(itemEl)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(`Remove ${item}`)
                .setIcon('cross')
                .onClick(() => {
                    if (type === 'character' && this.event.characters) {
                        this.event.characters.splice(index, 1);
                    } else if (type === 'image' && this.event.images) {
                        this.event.images.splice(index, 1);
                    }
                    // Re-render the specific list that was modified
                    this.renderList(container, items, type);
                });
        });
    }

    // Helper to render custom fields (Unchanged from original)
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
                            // No need to re-render immediately, just update the object
                        } else if (newKey !== key) {
                            // Prevent duplicate or empty keys
                            text.setValue(key); // Revert change
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
                        this.renderCustomFields(container, fields); // Re-render after deletion
                    }));
            fieldSetting.controlEl.addClass('storyteller-custom-field-row');
            fieldSetting.infoEl.addClass('storyteller-custom-field-key'); // Should maybe target nameEl instead
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}