/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Location } from '../types'; // Assumes Location type no longer has charactersPresent, eventsHere, subLocations
import { getWhitelistKeys } from '../yaml/EntitySections';
import { Group } from '../types';
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { ResponsiveModal } from './ResponsiveModal';
// Placeholder imports for suggesters -
// import { CharacterSuggestModal } from './CharacterSuggestModal';
// import { EventSuggestModal } from './EventSuggestModal';
// import { LocationSuggestModal } from './LocationSuggestModal';

export type LocationModalSubmitCallback = (location: Location) => Promise<void>;
export type LocationModalDeleteCallback = (location: Location) => Promise<void>;

export class LocationModal extends ResponsiveModal {
    location: Location;
    plugin: StorytellerSuitePlugin;
    onSubmit: LocationModalSubmitCallback;
    onDelete?: LocationModalDeleteCallback;
    isNew: boolean;
    private _groupRefreshInterval: number | null = null;
    private groupSelectorContainer: HTMLElement | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin, location: Location | null, onSubmit: LocationModalSubmitCallback, onDelete?: LocationModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = location === null;
        // Remove charactersPresent, eventsHere, subLocations from initialization
        const initialLocation = location ? { ...location } : {
            name: '', description: '', history: '', locationType: undefined, region: undefined, status: undefined, profileImagePath: undefined,
            customFields: {},
            filePath: undefined
        };
        if (!initialLocation.customFields) initialLocation.customFields = {};
        // Preserve filePath if editing
        if (location && location.filePath) initialLocation.filePath = location.filePath;
        // REMOVED: Check for subLocations removed
        // if (!initialLocation.subLocations) initialLocation.subLocations = [];

        this.location = initialLocation;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-location-modal');
    }

    onOpen() {
        super.onOpen(); // Call ResponsiveModal's mobile optimizations
        
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Create new location' : `Edit ${this.location.name}` });

        // --- Basic Fields ---
        new Setting(contentEl)
            .setName('Name')
            .setDesc('The location\'s name.')
            .addText(text => text
                .setPlaceholder('Enter location name')
                .setValue(this.location.name)
                .onChange(value => {
                    this.location.name = value;
                })
                .inputEl.addClass('storyteller-modal-input-large')
            );

        new Setting(contentEl)
            .setName('Description')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder('A brief description of the location...')
                    .setValue(this.location.description || '')
                    .onChange(value => {
                        this.location.description = value || undefined;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(contentEl)
            .setName('History')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder('The location\'s history and past events...')
                    .setValue(this.location.history || '')
                    .onChange(value => {
                        this.location.history = value || undefined;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(contentEl)
            .setName('Type')
            .setDesc('e.g., City, Forest, Castle, Tavern')
            .addText(text => text
                .setValue(this.location.locationType || '')
                .onChange(value => { this.location.locationType = value || undefined; }));

        new Setting(contentEl)
            .setName('Region')
            .setDesc('Broader geographic area.')
            .addText(text => text
                .setValue(this.location.region || '')
                .onChange(value => { this.location.region = value || undefined; }));

        new Setting(contentEl)
            .setName('Status')
            .setDesc('e.g., Active, Ruins, Abandoned')
            .addText(text => text
                .setValue(this.location.status || '')
                .onChange(value => { this.location.status = value || undefined; }));

        // --- Profile Image ---
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', { text: `Current: ${this.location.profileImagePath || 'None'}` });
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(button => button
                .setButtonText('Select')
                .setTooltip('Select from gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.location.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.location.profileImagePath || 'None'}`);
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
                                
                                // Update location and UI
                                this.location.profileImagePath = filePath;
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
                    this.location.profileImagePath = undefined;
                    imagePathDesc.setText(`Current: ${this.location.profileImagePath || 'None'}`);
                }));

        

        // --- Custom Fields ---
        contentEl.createEl('h3', { text: 'Custom fields' });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        this.renderCustomFields(customFieldsContainer, this.location.customFields || {});

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Add custom field')
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

        // --- Groups ---
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);
        // --- Real-time group refresh ---
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);

        // --- Action Buttons ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete location')
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
            .setButtonText(this.isNew ? 'Create location' : 'Save changes')
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

    


    renderCustomFields(container: HTMLElement, fields: Record<string, string>) {
        container.empty();
        fields = fields || {};
        const keys = Object.keys(fields);

        if (keys.length === 0) {
            container.createEl('p', { text: 'No custom fields defined.', cls: 'storyteller-modal-list-empty' });
            return;
        }

        const reserved = new Set<string>([...getWhitelistKeys('location'), 'customFields', 'filePath', 'id', 'sections']);
        keys.forEach(key => {
            let currentKey = key;
            const fieldSetting = new Setting(container)
                .addText(text => text
                    .setValue(currentKey)
                    .setPlaceholder('Field name')
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
                            new Notice("Custom field name must be unique, non-empty, and not reserved.");
                        }
                    }))
                .addText(text => text
                    .setValue(fields[currentKey]?.toString() || '')
                    .setPlaceholder('Field value')
                    .onChange(value => {
                        fields[currentKey] = value;
                    }))
                .addButton(button => button
                    .setIcon('trash')
                    .setTooltip(`Remove field "${currentKey}"`)
                    .setClass('mod-warning')
                    .onClick(() => {
                        delete fields[currentKey];
                        this.renderCustomFields(container, fields); // Re-render after deletion
                    }));
            fieldSetting.controlEl.addClass('storyteller-custom-field-row');
        });
    }

    renderGroupSelector(container: HTMLElement) {
        container.empty();
        const allGroups = this.plugin.getGroups();
        const syncSelection = async (): Promise<Set<string>> => {
            const identifier = this.location.id || this.location.name;
            const freshList = await this.plugin.listLocations();
            const fresh = freshList.find(l => (l.id || l.name) === identifier);
            const current = new Set((fresh?.groups || this.location.groups || []) as string[]);
            this.location.groups = Array.from(current);
            return current;
        };
        (async () => {
            const selectedGroupIds = await syncSelection();
            new Setting(container)
                .setName('Groups')
                .setDesc('Assign this location to one or more groups.')
                .addDropdown(dropdown => {
                    dropdown.addOption('', '-- Select group --');
                    allGroups.forEach(group => {
                        dropdown.addOption(group.id, group.name);
                    });
                    dropdown.setValue('');
                    dropdown.onChange(async (value) => {
                        if (value && !selectedGroupIds.has(value)) {
                            selectedGroupIds.add(value);
                            this.location.groups = Array.from(selectedGroupIds);
                            await this.plugin.addMemberToGroup(value, 'location', this.location.id || this.location.name);
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
                        this.location.groups = Array.from(selectedGroupIds);
                        await this.plugin.removeMemberFromGroup(group.id, 'location', this.location.id || this.location.name);
                        this.renderGroupSelector(container);
                    };
                });
            }
        })();
    }

    onClose() {
        this.contentEl.empty();
        if (this._groupRefreshInterval) {
            clearInterval(this._groupRefreshInterval);
        }
    }
}