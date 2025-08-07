/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Character, Group } from '../types'; // Assumes Character type has relationships?: string[], associatedLocations?: string[], associatedEvents?: string[]
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { ResponsiveModal } from './ResponsiveModal';
import { PlatformUtils } from '../utils/PlatformUtils';
// Placeholder imports for suggesters - these would need to be created
// import { CharacterSuggestModal } from './CharacterSuggestModal';
// import { LocationSuggestModal } from './LocationSuggestModal';
// import { EventSuggestModal } from './EventSuggestModal';

export type CharacterModalSubmitCallback = (character: Character) => Promise<void>;
export type CharacterModalDeleteCallback = (character: Character) => Promise<void>;

export class CharacterModal extends ResponsiveModal {
    character: Character;
    plugin: StorytellerSuitePlugin;
    onSubmit: CharacterModalSubmitCallback;
    onDelete?: CharacterModalDeleteCallback;
    isNew: boolean;
    private _groupRefreshInterval: number | null = null;
    private groupSelectorContainer: HTMLElement | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin, character: Character | null, onSubmit: CharacterModalSubmitCallback, onDelete?: CharacterModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = character === null;
        // Ensure link arrays and customFields are initialized
        const initialCharacter = character ? { ...character } : {
            name: '', description: '', backstory: '', profileImagePath: undefined,
            relationships: [], associatedLocations: [], associatedEvents: [], // Initialize link arrays
            customFields: {},
            filePath: undefined
        };
        if (!initialCharacter.customFields) initialCharacter.customFields = {};
        if (!initialCharacter.relationships) initialCharacter.relationships = [];
        // Preserve filePath if editing
        if (character && character.filePath) initialCharacter.filePath = character.filePath;
        this.character = initialCharacter;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-character-modal');
    }

    onOpen() {
        super.onOpen(); // Call the parent's mobile optimizations
        
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
                .setButtonText('Upload')
                .setTooltip('Upload new image')
                .onClick(async () => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.onchange = async () => {
                        const file = fileInput.files?.[0];
                        if (file) {
                            try {
                                // Ensure upload folder exists
                                await this.plugin.ensureFolder(this.plugin.settings.galleryUploadFolder);
                                
                                // Create unique filename
                                const timestamp = Date.now();
                                const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                                const fileName = `${timestamp}_${sanitizedName}`;
                                const filePath = `${this.plugin.settings.galleryUploadFolder}/${fileName}`;
                                
                                // Read file as array buffer
                                const arrayBuffer = await file.arrayBuffer();
                                
                                // Save to vault
                                await this.app.vault.createBinary(filePath, arrayBuffer);
                                
                                // Update character and UI
                                this.character.profileImagePath = filePath;
                                imagePathDesc.setText(`Current: ${filePath}`);
                                
                                new Notice(`Image uploaded: ${fileName}`);
                            } catch (error) {
                                console.error('Error uploading image:', error);
                                new Notice('Error uploading image. Please try again.');
                            }
                        }
                    };
                    fileInput.click();
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

        // --- Groups ---
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);

        // --- Custom Fields ---
        contentEl.createEl('h3', { text: 'Custom fields' });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        this.renderCustomFields(customFieldsContainer, this.character.customFields || {});

        // --- Real-time group refresh ---
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);

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

    renderCustomFields(container: HTMLElement, fields: Record<string, string>) {
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
                    .setPlaceholder('Field name')
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
                    .setPlaceholder('Field value')
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

    renderGroupSelector(container: HTMLElement) {
        container.empty();
        // Add a multi-select for groups
        const allGroups = this.plugin.getGroups();
        const selectedGroupIds = new Set(this.character.groups || []);
        new Setting(container)
            .setName('Groups')
            .setDesc('Assign this character to one or more groups.')
            .addDropdown(dropdown => {
                dropdown.addOption('', '-- Select group --');
                allGroups.forEach(group => {
                    dropdown.addOption(group.id, group.name);
                });
                dropdown.setValue('');
                dropdown.onChange(async (value) => {
                    if (value && !selectedGroupIds.has(value)) {
                        selectedGroupIds.add(value);
                        this.character.groups = Array.from(selectedGroupIds);
                        await this.plugin.addMemberToGroup(value, 'character', this.character.id || this.character.name);
                        this.renderGroupSelector(container); // Re-render to update UI
                    }
                });
            });
        // Show selected groups with remove buttons
        if (selectedGroupIds.size > 0) {
            const selectedDiv = container.createDiv('selected-groups');
            allGroups.filter(g => selectedGroupIds.has(g.id)).forEach(group => {
                const tag = selectedDiv.createSpan({ text: group.name, cls: 'group-tag' });
                const removeBtn = tag.createSpan({ text: ' ×', cls: 'remove-group-btn' });
                removeBtn.onclick = async () => {
                    selectedGroupIds.delete(group.id);
                    this.character.groups = Array.from(selectedGroupIds);
                    await this.plugin.removeMemberFromGroup(group.id, 'character', this.character.id || this.character.name);
                    this.renderGroupSelector(container);
                };
            });
        }
    }

    onClose() {
        this.contentEl.empty();
        if (this._groupRefreshInterval) {
            clearInterval(this._groupRefreshInterval);
        }
    }
}
