/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Character } from '../types'; // Assumes Character type has relationships?: string[], associatedLocations?: string[], associatedEvents?: string[]
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
// Placeholder imports for suggesters - these would need to be created
// import { CharacterSuggestModal } from './CharacterSuggestModal';
// import { LocationSuggestModal } from './LocationSuggestModal';
// import { EventSuggestModal } from './EventSuggestModal';

export type CharacterModalSubmitCallback = (character: Character) => Promise<void>;
export type CharacterModalDeleteCallback = (character: Character) => Promise<void>;

export class CharacterModal extends Modal {
    character: Character;
    plugin: StorytellerSuitePlugin;
    onSubmit: CharacterModalSubmitCallback;
    onDelete?: CharacterModalDeleteCallback;
    isNew: boolean;

    constructor(app: App, plugin: StorytellerSuitePlugin, character: Character | null, onSubmit: CharacterModalSubmitCallback, onDelete?: CharacterModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = character === null;
        // Ensure link arrays and customFields are initialized
        const initialCharacter = character ? { ...character } : {
            name: '', description: '', backstory: '', profileImagePath: undefined,
            relationships: [], associatedLocations: [], associatedEvents: [], // Initialize link arrays
            customFields: {}
        };
        if (!initialCharacter.customFields) initialCharacter.customFields = {};
        if (!initialCharacter.relationships) initialCharacter.relationships = [];
        
        

        this.character = initialCharacter;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-character-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Create new character' : `Edit ${this.character.name}` });

        // --- Name ---
        new Setting(contentEl)
            .setName('Name')
            .setDesc('The character\'s full name.')
            .addText(text => text
                .setPlaceholder('Enter character name')
                .setValue(this.character.name)
                .onChange(value => {
                    this.character.name = value;
                })
                .inputEl.addClass('storyteller-modal-input-large')
            );

        // --- Profile Image ---
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Profile image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', { text: `Current: ${this.character.profileImagePath || 'None'}` });
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(button => button
                .setButtonText('Select')
                .setTooltip('Select from gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.character.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.character.profileImagePath || 'None'}`);
                    }).open();
                }))
            .addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear image')
                .setClass('mod-warning')
                .onClick(() => {
                    this.character.profileImagePath = undefined;
                    imagePathDesc.setText(`Current: ${this.character.profileImagePath || 'None'}`);
                }));

        // --- Description ---
        new Setting(contentEl)
            .setName('Description')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder('A brief description of the character...')
                    .setValue(this.character.description || '')
                    .onChange(value => {
                        this.character.description = value || undefined;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // --- Traits ---
        new Setting(contentEl)
            .setName('Traits')
            .setDesc('Comma-separated list of character traits.')
            .addText(text => text
                .setPlaceholder('e.g., Brave, Curious, Stubborn')
                .setValue((this.character.traits || []).join(', '))
                .onChange(value => {
                    this.character.traits = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
                }));

        // --- Backstory ---
        new Setting(contentEl)
            .setName('Backstory')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder('The character\'s history...')
                    .setValue(this.character.backstory || '')
                    .onChange(value => {
                        this.character.backstory = value || undefined;
                    });
                text.inputEl.rows = 6;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // --- Status ---
        new Setting(contentEl)
            .setName('Status')
            .setDesc('e.g., Alive, Deceased, Missing')
            .addText(text => text
                .setValue(this.character.status || '')
                .onChange(value => { this.character.status = value || undefined; }));

        // --- Affiliation ---
        new Setting(contentEl)
            .setName('Affiliation')
            .setDesc('Primary group, faction, or kingdom.')
            .addText(text => text
                .setValue(this.character.affiliation || '')
                .onChange(value => { this.character.affiliation = value || undefined; }));


        // --- Custom Fields ---
        contentEl.createEl('h3', { text: 'Custom fields' });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        this.renderCustomFields(customFieldsContainer, this.character.customFields || {});

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Add custom field')
                .setIcon('plus')
                .onClick(() => {
                    if (!this.character.customFields) {
                        this.character.customFields = {};
                    }
                    const fields = this.character.customFields;
                    const newKey = `field_${Object.keys(fields).length + 1}`;
                    fields[newKey] = '';
                    this.renderCustomFields(customFieldsContainer, fields);
                }));

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete character')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Are you sure you want to delete "${this.character.name}"?`)) {
                        if (this.onDelete) {
                            try {
                                await this.onDelete(this.character);
                                new Notice(`Character "${this.character.name}" deleted.`);
                                this.close();
                            } catch (error) {
                                console.error("Error deleting character:", error);
                                new Notice("Failed to delete character.");
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
            .setButtonText(this.isNew ? 'Create character' : 'Save changes')
            .setCta()
            .onClick(async () => {
                if (!this.character.name?.trim()) {
                    new Notice("Character name cannot be empty.");
                    return;
                }
                try {
                    await this.onSubmit(this.character);
                    this.close();
                } catch (error) {
                    console.error("Error saving character:", error);
                    new Notice("Failed to save character.");
                }
            }));
    }

    // Helper to render lists
    renderList(container: HTMLElement, items: string[], type: 'relationship' | 'location' | 'event' | 'character' | 'image' | 'sublocation') {
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
                    if (type === 'relationship') {
                        this.character.relationships?.splice(index, 1);
                    }
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
