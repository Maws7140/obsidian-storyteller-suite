import { App, Modal, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Location } from '../types'; // Assumes Location type no longer has charactersPresent, eventsHere, subLocations
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
// Placeholder imports for suggesters - these would need to be removed or updated if used elsewhere
// import { CharacterSuggestModal } from './CharacterSuggestModal';
// import { EventSuggestModal } from './EventSuggestModal';
// import { LocationSuggestModal } from './LocationSuggestModal';

export type LocationModalSubmitCallback = (location: Location) => Promise<void>;
export type LocationModalDeleteCallback = (location: Location) => Promise<void>;

export class LocationModal extends Modal {
    location: Location;
    plugin: StorytellerSuitePlugin;
    onSubmit: LocationModalSubmitCallback;
    onDelete?: LocationModalDeleteCallback;
    isNew: boolean;

    constructor(app: App, plugin: StorytellerSuitePlugin, location: Location | null, onSubmit: LocationModalSubmitCallback, onDelete?: LocationModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = location === null;
        // Remove charactersPresent, eventsHere, subLocations from initialization
        const initialLocation = location ? { ...location } : {
            name: '', description: '', history: '', locationType: undefined, region: undefined, status: undefined, profileImagePath: undefined,
            // REMOVED: charactersPresent: [], eventsHere: [], subLocations: [], // Initialize link arrays
            customFields: {}
        };
        if (!initialLocation.customFields) initialLocation.customFields = {};
        // REMOVED: Check for subLocations removed
        // if (!initialLocation.subLocations) initialLocation.subLocations = [];

        this.location = initialLocation;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-location-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Create New Location' : `Edit ${this.location.name}` });

        // --- Name ---
        new Setting(contentEl)
            .setName('Name')
            .setDesc('The location\'s name.')
            .addText(text => text
                .setPlaceholder('Enter location name')
                .setValue(this.location.name)
                .onChange(value => { this.location.name = value; })
                .inputEl.addClass('storyteller-modal-input-large'));

        // --- Description ---
        new Setting(contentEl)
            .setName('Description')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder('A brief description of the location...')
                    .setValue(this.location.description || '')
                    .onChange(value => { this.location.description = value || undefined; });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // --- History ---
        new Setting(contentEl)
            .setName('History')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder('The location\'s history...')
                    .setValue(this.location.history || '')
                    .onChange(value => { this.location.history = value || undefined; });
                text.inputEl.rows = 6;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // --- Location Type ---
        new Setting(contentEl)
            .setName('Type')
            .setDesc('e.g., City, Forest, Tavern, Ruin')
            .addText(text => text
                .setValue(this.location.locationType || '')
                .onChange(value => { this.location.locationType = value || undefined; }));

        // --- Region ---
        new Setting(contentEl)
            .setName('Region')
            .setDesc('The parent region or area this location belongs to.')
            .addText(text => text
                .setValue(this.location.region || '')
                .onChange(value => { this.location.region = value || undefined; }));

        // --- Status ---
        new Setting(contentEl)
            .setName('Status')
            .setDesc('e.g., Populated, Abandoned, Contested')
            .addText(text => text
                .setValue(this.location.status || '')
                .onChange(value => { this.location.status = value || undefined; }));

        // --- Representative Image ---
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', { text: `Current: ${this.location.profileImagePath || 'None'}` });
                setting.descEl.style.width = '100%';
                setting.descEl.style.marginBottom = 'var(--size-4-1)';
            })
            .addButton(button => button
                .setButtonText('Select')
                .setTooltip('Select from Gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.location.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.location.profileImagePath || 'None'}`);
                    }).open();
                }))
            .addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear Image')
                .setClass('mod-warning')
                .onClick(() => {
                    this.location.profileImagePath = undefined;
                    imagePathDesc.setText(`Current: ${this.location.profileImagePath || 'None'}`);
                }));

        // REMOVED: Links Header
        // contentEl.createEl('h3', { text: 'Links' });

        // REMOVED: Characters Present Section
        // const charactersSetting = new Setting(contentEl)
        //     .setName('Characters Present')
        //     .setDesc('Manage linked characters currently at this location.');
        // const charactersListEl = charactersSetting.controlEl.createDiv('storyteller-modal-list');
        // this.renderList(charactersListEl, this.location.charactersPresent || [], 'character'); // REMOVED: 'character' type might be invalid now
        // charactersSetting.addButton(button => button
        //     .setButtonText('Add Character')
        //     .setTooltip('Select character(s) present')
        //     .setCta()
        //     .onClick(async () => {
        //         new Notice('Character suggester not yet implemented.');
        //     }));

        // REMOVED: Events Here Section
        // const eventsSetting = new Setting(contentEl)
        //     .setName('Events Here')
        //     .setDesc('Manage linked events that occurred at this location.');
        // const eventsListEl = eventsSetting.controlEl.createDiv('storyteller-modal-list');
        // this.renderList(eventsListEl, this.location.eventsHere || [], 'event'); // REMOVED: 'event' type might be invalid now
        // eventsSetting.addButton(button => button
        //     .setButtonText('Add Event')
        //     .setTooltip('Select event(s) at this location')
        //     .setCta()
        //     .onClick(async () => {
        //         new Notice('Event suggester not yet implemented.');
        //     }));

        // REMOVED: Sub-Locations Section
        // const subLocationsSetting = new Setting(contentEl)
        //     .setName('Sub-Locations')
        //     .setDesc('Manage linked locations contained within this one.');
        // const subLocationsListEl = subLocationsSetting.controlEl.createDiv('storyteller-modal-list');
        // this.renderList(subLocationsListEl, this.location.subLocations || [], 'sublocation'); // REMOVED: 'sublocation' type might be invalid now
        // subLocationsSetting.addButton(button => button
        //     .setButtonText('Add Sub-Location')
        //     .setTooltip('Select sub-location(s)')
        //     .setCta()
        //     .onClick(async () => {
        //         new Notice('Location suggester for sub-locations not yet implemented.');
        //     }));

        // --- Custom Fields ---
        contentEl.createEl('h3', { text: 'Custom Fields' });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        this.renderCustomFields(customFieldsContainer, this.location.customFields || {});

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Add Custom Field')
                .setIcon('plus')
                .onClick(() => {
                    if (!this.location.customFields) {
                        this.location.customFields = {};
                    }
                    const fields = this.location.customFields;
                    const newKey = `field_${Object.keys(fields).length + 1}`;
                    fields[newKey] = '';
                    this.renderCustomFields(customFieldsContainer, fields);
                }));

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete Location')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Are you sure you want to delete "${this.location.name}"?`)) {
                        if (this.onDelete) {
                            try {
                                await this.onDelete(this.location);
                                new Notice(`Location "${this.location.name}" deleted.`);
                                this.close();
                            } catch (error) {
                                console.error("Error deleting location:", error);
                                new Notice("Failed to delete location.");
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
            .setButtonText(this.isNew ? 'Create Location' : 'Save Changes')
            .setCta()
            .onClick(async () => {
                if (!this.location.name?.trim()) {
                    new Notice("Location name cannot be empty.");
                    return;
                }
                try {
                    await this.onSubmit(this.location);
                    this.close();
                } catch (error) {
                    console.error("Error saving location:", error);
                    new Notice("Failed to save location.");
                }
            }));
    }

    // REMOVED: renderList function as it's no longer used for locations
    // renderList(container: HTMLElement, items: string[]) { // REMOVED type parameter
    //     container.empty();
    //     if (!items || items.length === 0) {
    //         container.createEl('span', { text: 'None', cls: 'storyteller-modal-list-empty' });
    //         return;
    //     }
    //     items.forEach((item, index) => {
    //         const displayItem = item;
    //         const itemEl = container.createDiv('storyteller-modal-list-item');
    //         itemEl.createSpan({ text: displayItem });
    //         new ButtonComponent(itemEl)
    //             .setClass('storyteller-modal-list-remove')
    //             .setTooltip(`Remove ${displayItem}`)
    //             .setIcon('cross')
    //             .onClick(() => {
    //                 // REMOVED: Logic for removing items based on type
    //                 // Find the correct array and splice
    //                 // e.g., if (type === 'sublocation') this.location.subLocations?.splice(index, 1);
    //                 // this.renderList(container, items); // Refresh list (using potentially updated items array)
    //             });
    //     });
    // }


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
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}