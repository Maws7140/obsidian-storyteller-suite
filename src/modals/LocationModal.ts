/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Setting, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import { Location } from '../types'; // Assumes Location type no longer has charactersPresent, eventsHere, subLocations
import { getWhitelistKeys } from '../yaml/EntitySections';
import { Group } from '../types';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { ResponsiveModal } from './ResponsiveModal';
import { PromptModal } from './ui/PromptModal';
// Placeholder imports for suggesters -
// import { CharacterSuggestModal } from './CharacterSuggestModal';
// import { EventSuggestModal } from './EventSuggestModal';

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
            parentLocation: undefined,
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
        contentEl.createEl('h2', { text: this.isNew ? t('createNewLocation') : `${t('edit')} ${this.location.name}` });

        // --- Basic Fields ---
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('locationNameDesc'))
            .addText(text => text
                .setPlaceholder(t('enterLocationName'))
                .setValue(this.location.name)
                .onChange(value => {
                    this.location.name = value;
                })
                .inputEl.addClass('storyteller-modal-input-large')
            );

        new Setting(contentEl)
            .setName(t('description'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder(t('locationDescriptionPh'))
                    .setValue(this.location.description || '')
                    .onChange(value => {
                        this.location.description = value || undefined;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(contentEl)
            .setName(t('history'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text
                    .setPlaceholder(t('locationHistoryPh'))
                    .setValue(this.location.history || '')
                    .onChange(value => {
                        this.location.history = value || undefined;
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass('storyteller-modal-textarea');
            });

        new Setting(contentEl)
            .setName(t('type'))
            .setDesc(t('locationTypeDesc'))
            .addText(text => text
                .setValue(this.location.locationType || '')
                .onChange(value => { this.location.locationType = value || undefined; }));

        new Setting(contentEl)
            .setName(t('region'))
            .setDesc(t('locationRegionDesc'))
            .addText(text => text
                .setValue(this.location.region || '')
                .onChange(value => { this.location.region = value || undefined; }));

        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('locationStatusDesc'))
            .addText(text => text
                .setValue(this.location.status || '')
                .onChange(value => { this.location.status = value || undefined; }));

        // --- Parent Location ---
        let parentLocationDesc: HTMLElement;
        new Setting(contentEl)
            .setName(t('parentLocation'))
            .setDesc('')
            .then(setting => {
                parentLocationDesc = setting.descEl.createEl('small', { text: t('currentValue', this.location.parentLocation || t('none')) });
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(button => button
                .setButtonText(t('selectParentLocation'))
                .setTooltip(t('parentLocationDesc'))
                .onClick(() => {
                    new LocationSuggestModal(this.app, this.plugin, async (selectedLocation) => {
                        if (selectedLocation) {
                            // Check for circular reference
                            if (await this.wouldCreateCircularReference(selectedLocation.name)) {
                                new Notice(t('circularLocationError'));
                                return;
                            }
                            this.location.parentLocation = selectedLocation.name;
                        } else {
                            this.location.parentLocation = undefined;
                        }
                        parentLocationDesc.setText(`Current: ${this.location.parentLocation || 'None'}`);
                    }).open();
                }))
            .addButton(button => button
                .setIcon('cross')
                .setTooltip(t('clearParentLocation'))
                .setClass('mod-warning')
                .onClick(() => {
                    this.location.parentLocation = undefined;
                    parentLocationDesc.setText(`Current: ${this.location.parentLocation || 'None'}`);
                }));

        // --- Profile Image ---
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName(t('image'))
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', { text: t('currentValue', this.location.profileImagePath || t('none')) });
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(button => button
                .setButtonText(t('selectBtn'))
                .setTooltip('Select from gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.location.profileImagePath = path || undefined;
                        imagePathDesc.setText(`Current: ${this.location.profileImagePath || 'None'}`);
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
                                
                                // Update location and UI
                                this.location.profileImagePath = filePath;
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
                .setTooltip('Clear image')
                .setClass('mod-warning')
                .onClick(() => {
                    this.location.profileImagePath = undefined;
                    imagePathDesc.setText(`Current: ${this.location.profileImagePath || 'None'}`);
                }));

        

        // --- Custom Fields ---
        contentEl.createEl('h3', { text: t('customFields') });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        // Render existing custom fields so users can see and edit them
        if (!this.location.customFields) this.location.customFields = {};
        this.renderCustomFields(customFieldsContainer, this.location.customFields);

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    if (!this.location.customFields) this.location.customFields = {};
                    const fields = this.location.customFields;
                    const reserved = new Set<string>([...getWhitelistKeys('location'), 'customFields', 'filePath', 'id', 'sections']);
                    const askValue = (key: string) => {
                        new PromptModal(this.app, {
                            title: 'Custom field value',
                            label: `Value for "${key}"`,
                            defaultValue: '',
                            onSubmit: (val: string) => { fields[key] = val; }
                        }).open();
                    };
                    new PromptModal(this.app, {
                        title: 'New custom field',
                        label: 'Field name',
                        defaultValue: '',
                        validator: (value: string) => {
                            const trimmed = value.trim();
                            if (!trimmed) return 'Field name cannot be empty';
                            if (reserved.has(trimmed)) return 'That name is reserved';
                            const exists = Object.keys(fields).some(k => k.toLowerCase() === trimmed.toLowerCase());
                            if (exists) return 'A field with that name already exists';
                            return null;
                        },
                        onSubmit: (name: string) => askValue(name.trim())
                    }).open();
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
                .setButtonText(t('deleteLocation'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteLocation', this.location.name))) {
                        if (this.onDelete) {
                            try {
                                await this.onDelete(this.location);
                                new Notice(t('locationDeleted', this.location.name));
                                this.close();
                            } catch (error) {
                                console.error("Error deleting location:", error);
                                new Notice(t('failedToDelete', t('location')));
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
            .setButtonText(this.isNew ? 'Create location' : 'Save changes')
            .setCta()
            .onClick(async () => {
                if (!this.location.name?.trim()) {
                    new Notice(t('locationNameRequired'));
                    return;
                }
                // Ensure empty section fields are set so templates can render headings
                this.location.description = this.location.description || '';
                this.location.history = this.location.history || '';
                try {
                    await this.onSubmit(this.location);
                    this.close();
                } catch (error) {
                    console.error("Error saving location:", error);
                    new Notice(t('failedToSave', t('location')));
                }
            }));
    }

    


    renderCustomFields(container: HTMLElement, fields: Record<string, string>) {
        container.empty();
        fields = fields || {};
        const keys = Object.keys(fields);

        if (keys.length === 0) {
            container.createEl('p', { text: t('noCustomFields'), cls: 'storyteller-modal-list-empty' });
            return;
        }

        const reserved = new Set<string>([...getWhitelistKeys('location'), 'customFields', 'filePath', 'id', 'sections']);
        keys.forEach(key => {
            let currentKey = key;
            const fieldSetting = new Setting(container)
                .addText(text => text
                    .setValue(currentKey)
                    .setPlaceholder(t('fieldNamePh'))
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
                            new Notice(t('customFieldError'));
                        }
                    }))
                .addText(text => text
                    .setValue(fields[currentKey]?.toString() || '')
                    .setPlaceholder(t('fieldValuePh'))
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
                .setName(t('groups'))
                .setDesc(t('assignToGroupsDesc'))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('selectGroupPlaceholder'));
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

    /**
     * Check if setting the given location as parent would create a circular reference
     */
    private async wouldCreateCircularReference(parentLocationName: string): Promise<boolean> {
        // If trying to set self as parent, that's circular
        if (parentLocationName === this.location.name) {
            return true;
        }

        // Get all locations to check the hierarchy
        const allLocations = await this.plugin.listLocations();
        const locationMap = new Map<string, Location>();
        
        // Create a map for quick lookup
        allLocations.forEach(loc => {
            locationMap.set(loc.name, loc);
        });

        // Check if the proposed parent has this location as an ancestor
        let currentLocation = locationMap.get(parentLocationName);
        const visited = new Set<string>();
        
        while (currentLocation && currentLocation.parentLocation) {
            // If we've seen this location before, there's already a cycle
            if (visited.has(currentLocation.name)) {
                return true;
            }
            visited.add(currentLocation.name);
            
            // If the parent's ancestor is this location, it would create a cycle
            if (currentLocation.parentLocation === this.location.name) {
                return true;
            }
            
            // Move up the hierarchy
            currentLocation = locationMap.get(currentLocation.parentLocation);
        }

        return false;
    }

    onClose() {
        this.contentEl.empty();
        if (this._groupRefreshInterval) {
            clearInterval(this._groupRefreshInterval);
        }
    }
}