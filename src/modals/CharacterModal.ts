/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Character, Group } from '../types'; // Assumes Character type has relationships?: string[], associatedLocations?: string[], associatedEvents?: string[]
import { getWhitelistKeys } from '../yaml/EntitySections';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { ResponsiveModal } from './ResponsiveModal';
import { PromptModal } from './ui/PromptModal';
import { PlatformUtils } from '../utils/PlatformUtils';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
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
    private workingCustomFields: Record<string, string> = {};

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
        contentEl.createEl('h2', { text: this.isNew ? t('createNewCharacter') : `${t('edit')} ${this.character.name}` });

        // --- Template Selector (for new characters) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured character template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select a character template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToCharacter(template);
                                this.refresh(); // Refresh the modal to show template values
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'character' // Filter to character templates only
                        ).open();
                    })
                );
        }

        // --- Name ---
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('name'))
            .addText(text => text
                .setPlaceholder(t('enterCharacterName'))
                .setValue(this.character.name)
                .onChange(value => {
                    this.character.name = value;
                })
                .inputEl.addClass('storyteller-modal-input-large')
            );

        // --- Profile Image ---
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName(t('profileImage'))
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', { text: t('currentValue', this.character.profileImagePath || t('none')) });
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(button => button
                .setButtonText(t('select'))
                .setTooltip(t('selectFromGallery'))
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.character.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.character.profileImagePath || 'None'}`);
                    }).open();
                }))
            .addButton(button => button
                .setButtonText(t('upload'))
                .setTooltip(t('uploadImage'))
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
                                
                                new Notice(t('imageUploaded', fileName));
                            } catch (error) {
                                console.error('Error uploading image:', error);
                                new Notice(t('errorUploadingImage'));
                            }
                        }
                    };
                    fileInput.click();
                }))
            .addButton(button => button
                .setIcon('cross')
                .setTooltip(t('clearImage'))
                .setClass('mod-warning')
                .onClick(() => {
                    this.character.profileImagePath = undefined;
                    imagePathDesc.setText(`Current: ${this.character.profileImagePath || 'None'}`);
                }));

        // --- Description ---
        new Setting(contentEl)
            .setName(t('description'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder(t('characterDescriptionPh'))
                    .setValue(this.character.description || '')
                .onChange(value => {
                    this.character.description = value;
                });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // --- Traits ---
        new Setting(contentEl)
            .setName(t('traits'))
            .setDesc(t('traitsPlaceholder'))
            .addText(text => text
                .setPlaceholder(t('traitsPlaceholder'))
                .setValue((this.character.traits || []).join(', '))
                .onChange(value => {
                    this.character.traits = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
                }));

        // --- Backstory ---
        new Setting(contentEl)
            .setName(t('backstory'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder(t('characterHistoryPh'))
                    .setValue(this.character.backstory || '')
                .onChange(value => {
                    this.character.backstory = value;
                });
                text.inputEl.rows = 6;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        // --- Status ---
        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('statusPlaceholderCharacter'))
            .addText(text => text
                .setValue(this.character.status || '')
                .onChange(value => { this.character.status = value || undefined; }));

        // --- Affiliation ---
        new Setting(contentEl)
            .setName(t('affiliation'))
            .setDesc(t('affiliation'))
            .addText(text => text
                .setValue(this.character.affiliation || '')
                .onChange(value => { this.character.affiliation = value || undefined; }));

        // --- Groups ---
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);

        // --- Connections (Typed Relationships) ---
        contentEl.createEl('h3', { text: t('connections') });
        
        // Initialize connections if not present
        if (!this.character.connections) {
            this.character.connections = [];
        }

        const connectionsListContainer = contentEl.createDiv('storyteller-modal-linked-entities');
        this.renderConnectionsList(connectionsListContainer);

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('addConnection'))
                .setIcon('plus')
                .onClick(async () => {
                    const { RelationshipEditorModal } = await import('./RelationshipEditorModal');
                    new RelationshipEditorModal(
                        this.app,
                        this.plugin,
                        null,
                        'any',
                        (relationship) => {
                            if (!this.character.connections) {
                                this.character.connections = [];
                            }
                            this.character.connections.push(relationship);
                            this.renderConnectionsList(connectionsListContainer);
                        }
                    ).open();
                }));

        // --- Custom Fields ---
        this.workingCustomFields = { ...(this.character.customFields || {}) };
        contentEl.createEl('h3', { text: t('customFields') });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        // Render existing custom fields so users can see and edit them
        this.renderCustomFields(customFieldsContainer, this.workingCustomFields);

        // --- Real-time group refresh ---
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    if (!this.workingCustomFields) this.workingCustomFields = {};
                    const fields = this.workingCustomFields;
                    const reserved = new Set<string>([...getWhitelistKeys('character'), 'customFields', 'filePath', 'id', 'sections']);
                    const askValue = (key: string) => {
                        new PromptModal(this.app, {
                            title: t('customFieldValueTitle'),
                            label: t('valueForX', key),
                            defaultValue: '',
                            onSubmit: (val: string) => {
                                fields[key] = val;
                            }
                        }).open();
                    };
                    new PromptModal(this.app, {
                        title: t('newCustomFieldTitle'),
                        label: t('fieldName'),
                        defaultValue: '',
                        validator: (value: string) => {
                            const trimmed = value.trim();
                            if (!trimmed) return t('fieldNameCannotBeEmpty');
                            if (reserved.has(trimmed)) return t('thatNameIsReserved');
                            const exists = Object.keys(fields).some(k => k.toLowerCase() === trimmed.toLowerCase());
                            if (exists) return t('fieldAlreadyExists');
                            return null;
                        },
                        onSubmit: (name: string) => askValue(name.trim())
                    }).open();
                }));

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('deleteCharacter'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteCharacter', this.character.name))) {
                        if (this.onDelete) {
                            try {
                                await this.onDelete(this.character);
                                new Notice(t('characterDeleted', this.character.name));
                                this.close();
                            } catch (error) {
                                console.error("Error deleting character:", error);
                                new Notice(t('failedToDelete', t('character')));
                            }
                        }
                    }
                }));
        }

        buttonsSetting.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });

        buttonsSetting.addButton(button => button
            .setButtonText(t('cancel'))
            .onClick(() => {
                this.close();
            }));

        buttonsSetting.addButton(button => button
            .setButtonText(this.isNew ? t('createCharacter') : t('saveChanges'))
            .setCta()
            .onClick(async () => {
                if (!this.character.name?.trim()) {
                    new Notice(t('characterNameRequired'));
                    return;
                }
                // Note: Allow empty strings to be saved - don't force to empty string if undefined
                // The save logic will handle proper template rendering
                try {
                    this.character.customFields = this.workingCustomFields;
                    await this.onSubmit(this.character);
                    this.close();
                } catch (error) {
                    console.error("Error saving character:", error);
                    new Notice(t('failedToSave', t('character')));
                }
            }));
    }

    // Helper to render connections list
    renderConnectionsList(container: HTMLElement) {
        container.empty();
        const connections = this.character.connections || [];

        if (connections.length === 0) {
            container.createEl('p', { text: t('noConnectionsYet') || 'No connections yet.', cls: 'storyteller-modal-list-empty' });
            return;
        }

        connections.forEach((conn, index) => {
            const item = container.createDiv('storyteller-modal-list-item');
            
            const infoSpan = item.createSpan();
            infoSpan.setText(`${conn.target} (${t(conn.type)})`);
            if (conn.label) {
                infoSpan.appendText(` - ${conn.label}`);
            }

            new ButtonComponent(item)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(t('removeX', conn.target))
                .setIcon('cross')
                .onClick(() => {
                    this.character.connections?.splice(index, 1);
                    this.renderConnectionsList(container);
                });
        });
    }

    // Helper to render lists
    renderList(container: HTMLElement, items: string[], type: 'relationship' | 'location' | 'event' | 'character' | 'image' | 'sublocation') {
        container.empty();
        if (!items || items.length === 0) {
            container.createEl('span', { text: t('none'), cls: 'storyteller-modal-list-empty' });
            return;
        }
        items.forEach((item, index) => {
            const displayItem = item;
            const itemEl = container.createDiv('storyteller-modal-list-item');
            itemEl.createSpan({ text: displayItem });
            new ButtonComponent(itemEl)
                .setClass('storyteller-modal-list-remove')
                .setTooltip(t('removeX', displayItem))
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
            container.createEl('p', { text: t('noCustomFields'), cls: 'storyteller-modal-list-empty' });
            return;
        }

        const reserved = new Set<string>([...getWhitelistKeys('character'), 'customFields', 'filePath', 'id', 'sections']);
        keys.forEach(key => {
            let currentKey = key;
            const fieldSetting = new Setting(container)
                .addText(text => text
                    .setValue(currentKey)
                    .setPlaceholder(t('fieldName'))
                    .onChange(newKey => {
                        const trimmed = newKey.trim();
                        const isUniqueCaseInsensitive = !Object.keys(fields).some(k => k.toLowerCase() === trimmed.toLowerCase());
                        const isReserved = reserved.has(trimmed);
                        if (trimmed && trimmed !== currentKey && isUniqueCaseInsensitive && !isReserved) {
                            fields[trimmed] = fields[currentKey];
                            delete fields[currentKey];
                            currentKey = trimmed;
                        } else if (trimmed !== currentKey) {
                            text.setValue(currentKey);
                            new Notice(t('fieldNameCannotBeEmpty'));
                        }
                    }))
                .addText(text => text
                    .setValue(fields[currentKey]?.toString() || '')
                    .setPlaceholder(t('fieldValue'))
                    .onChange(value => {
                        fields[currentKey] = value;
                    }))
                .addButton(button => button
                    .setIcon('trash')
                    .setTooltip(t('removeFieldX', currentKey))
                    .setClass('mod-warning')
                    .onClick(() => {
                        delete fields[currentKey];
                        this.renderCustomFields(container, fields);
                    }));
            fieldSetting.controlEl.addClass('storyteller-custom-field-row');
        });
    }

    renderGroupSelector(container: HTMLElement) {
        container.empty();
        // Derive current selection by reading the entity's saved groups from disk for truth
        // so that updates made from the Groups tab reflect immediately here.
        const allGroups = this.plugin.getGroups();
        const syncSelection = async (): Promise<Set<string>> => {
            const identifier = this.character.id || this.character.name;
            const freshList = await this.plugin.listCharacters();
            const fresh = freshList.find(c => (c.id || c.name) === identifier);
            const current = new Set((fresh?.groups || this.character.groups || []) as string[]);
            // keep in-memory model in sync so saving the modal preserves selection
            this.character.groups = Array.from(current);
            return current;
        };
        (async () => {
            const selectedGroupIds = await syncSelection();
            new Setting(container)
                .setName(t('groups'))
                .setDesc(t('groupsHelpCharacter'))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('selectGroupPlaceholder'));
                    allGroups.forEach(group => {
                        dropdown.addOption(group.id, group.name);
                    });
                    dropdown.setValue('');
                    dropdown.onChange(async (value) => {
                        if (value && !selectedGroupIds.has(value)) {
                            selectedGroupIds.add(value);
                            this.character.groups = Array.from(selectedGroupIds);
                            await this.plugin.addMemberToGroup(value, 'character', this.character.id || this.character.name);
                            this.renderGroupSelector(container);
                        }
                    });
                });
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
        })();
    }

    private async applyTemplateToCharacter(template: Template): Promise<void> {
        if (!template.entities.characters || template.entities.characters.length === 0) {
            new Notice('This template does not contain any characters');
            return;
        }

        // Get the first character from the template
        const templateChar = template.entities.characters[0];

        // Extract template-specific fields
        const { templateId, sectionContent, customYamlFields, id, filePath, ...charData } = templateChar as any;

        // Apply base character fields
        Object.assign(this.character, charData);

        // Apply custom YAML fields if they exist
        if (customYamlFields) {
            Object.assign(this.character, customYamlFields);
        }

        // Apply section content if it exists (map section names to lowercase properties)
        if (sectionContent) {
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (this.character as any)[propName] = content;
            }
        }

        // Clear relationships as they reference template entities
        this.character.relationships = [];
        this.character.connections = [];
        this.character.groups = [];
    }

    private refresh(): void {
        // Refresh the modal by reopening it
        this.onOpen();
    }

    onClose() {
        this.contentEl.empty();
        if (this._groupRefreshInterval) {
            clearInterval(this._groupRefreshInterval);
        }
    }
}
