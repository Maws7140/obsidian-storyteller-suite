import { App, Modal, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Location } from '../types'; // Assumes Location type has charactersPresent?: string[], eventsHere?: string[], subLocations?: string[]
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
// Placeholder imports for suggesters - these would need to be created
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
        const initialLocation = location ? { ...location } : {
            name: '', description: '', history: '', locationType: undefined, region: undefined, status: undefined, profileImagePath: undefined,
            charactersPresent: [], eventsHere: [], subLocations: [], // Initialize link arrays
            customFields: {}
        };
        if (!initialLocation.customFields) initialLocation.customFields = {};
        if (!initialLocation.subLocations) initialLocation.subLocations = [];

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

        // --- Map/Image ---
        new Setting(contentEl)
            .setName('Map/Image')
            .setDesc('Path or URL to the map/image.')
            .addText(text => text
                .setPlaceholder('e.g., Assets/Maps/region.png or https://...')
                .setValue(this.location.mapImage || '')
                .onChange(value => { this.location.mapImage = value || undefined; }));

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

        // --- Links ---
        contentEl.createEl('h3', { text: 'Links' });

        // --- Characters Present ---
        const charactersSetting = new Setting(contentEl)
            .setName('Characters Present')
            .setDesc('Manage linked characters currently at this location.');
        const charactersListEl = charactersSetting.controlEl.createDiv('storyteller-modal-list');
        charactersSetting.addButton(button => button
            .setButtonText('Add Character')
            .setTooltip('Select character(s) present')
            .setCta()
            .onClick(async () => {
                new Notice('Character suggester not yet implemented.');
            }));

        // --- Events Here ---
        const eventsSetting = new Setting(contentEl)
            .setName('Events Here')
            .setDesc('Manage linked events that occurred at this location.');
        const eventsListEl = eventsSetting.controlEl.createDiv('storyteller-modal-list');
        eventsSetting.addButton(button => button
            .setButtonText('Add Event')
            .setTooltip('Select event(s) at this location')
            .setCta()
            .onClick(async () => {
                new Notice('Event suggester not yet implemented.');
            }));

        // --- Sub-Locations ---
        const subLocationsSetting = new Setting(contentEl)
            .setName('Sub-Locations')
            .setDesc('Manage linked locations contained within this one.');
        const subLocationsListEl = subLocationsSetting.controlEl.createDiv('storyteller-modal-list');
        this.renderList(subLocationsListEl, this.location.subLocations || [], 'sublocation');
        subLocationsSetting.addButton(button => button
            .setButtonText('Add Sub-Location')
            .setTooltip('Select sub-location(s)')
            .setCta()
            .onClick(async () => {
                new Notice('Location suggester for sub-locations not yet implemented.');
            }));

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

    renderList(container: HTMLElement, items: string[], type: 'character' | 'event' | 'sublocation' | 'location' | 'relationship' | 'image') {
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
                    if (type === 'character') 
                    this.renderList(container, items, type);
                });
        });
    }

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
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
