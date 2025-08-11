/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Setting, Notice, TextAreaComponent } from 'obsidian';
import { PlotItem, Group } from '../types';
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { getWhitelistKeys } from '../yaml/EntitySections';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';

export type PlotItemModalSubmitCallback = (item: PlotItem) => Promise<void>;
export type PlotItemModalDeleteCallback = (item: PlotItem) => Promise<void>;

export class PlotItemModal extends Modal {
    item: PlotItem;
    plugin: StorytellerSuitePlugin;
    onSubmit: PlotItemModalSubmitCallback;
    onDelete?: PlotItemModalDeleteCallback;
    isNew: boolean;
    private _groupRefreshInterval: number | null = null;
    private groupSelectorContainer: HTMLElement | null = null;

    constructor(app: App, plugin: StorytellerSuitePlugin, item: PlotItem | null, onSubmit: PlotItemModalSubmitCallback, onDelete?: PlotItemModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = item === null;
        
        const initialItem: PlotItem = item ? { ...item } : {
            id: '',
            filePath: '',
            name: '',
            isPlotCritical: false,
            pastOwners: [],
            associatedEvents: [],
            customFields: {}
        };

        if (!initialItem.pastOwners) initialItem.pastOwners = [];
        if (!initialItem.associatedEvents) initialItem.associatedEvents = [];
        if (!initialItem.customFields) initialItem.customFields = {};
        if (!initialItem.groups) initialItem.groups = []; // Ensure groups array is initialized

        this.item = initialItem;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-item-modal');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? 'Create new plot item' : `Edit ${this.item.name}` });

        new Setting(contentEl)
            .setName('Name')
            .setDesc("The item's name.")
            .addText(text => text
                .setPlaceholder('Enter item name')
                .setValue(this.item.name)
                .onChange(value => this.item.name = value)
                .inputEl.addClass('storyteller-modal-input-large')
            );

        new Setting(contentEl)
            .setName('Plot Critical')
            .setDesc('Enable to "bookmark" this item as important to the plot.')
            .addToggle(toggle => toggle
                .setValue(this.item.isPlotCritical)
                .onChange(value => this.item.isPlotCritical = value)
            );
        
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName('Item Image')
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', { text: `Current: ${this.item.profileImagePath || 'None'}` });
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            })
            .addButton(button => button
                .setButtonText('Select')
                .setTooltip('Select from gallery')
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : undefined;
                        this.item.profileImagePath = path;
                        imagePathDesc.setText(`Current: ${path || 'None'}`);
                    }).open();
                })
            )
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
                                const uploadFolder = this.plugin.settings.galleryUploadFolder;
                                await this.plugin.ensureFolder(uploadFolder);
                                
                                const timestamp = Date.now();
                                const sanitizedName = file.name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
                                const fileName = `${timestamp}_${sanitizedName}`;
                                const filePath = `${uploadFolder}/${fileName}`;
                                
                                const arrayBuffer = await file.arrayBuffer();
                                await this.app.vault.createBinary(filePath, arrayBuffer);
                                
                                this.item.profileImagePath = filePath;
                                imagePathDesc.setText(`Current: ${filePath}`);
                                
                                new Notice(`Image uploaded: ${fileName}`);
                            } catch (error) {
                                console.error('Error uploading image:', error);
                                new Notice('Error uploading image. Please try again.');
                            }
                        }
                    };
                    fileInput.click();
                })
            )
            .addButton(button => button
                .setIcon('cross')
                .setTooltip('Clear image')
                .setClass('mod-warning')
                .onClick(() => {
                    this.item.profileImagePath = undefined;
                    imagePathDesc.setText(`Current: ${this.item.profileImagePath || 'None'}`);
                })
            );

        new Setting(contentEl)
            .setName('Description')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder('A visual description of the item...')
                    .setValue(this.item.description || '')
                    .onChange(value => this.item.description = value || undefined);
                text.inputEl.rows = 4;
            });
        
        new Setting(contentEl)
            .setName('History / Lore')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder('The item\'s origin, past, and significance...')
                    .setValue(this.item.history || '')
                    .onChange(value => this.item.history = value || undefined);
                text.inputEl.rows = 6;
            });
        
        contentEl.createEl('h3', { text: 'Relationships & Location' });

        new Setting(contentEl)
            .setName('Current Owner')
            .setDesc(`Owner: ${this.item.currentOwner || 'None'}`)
            .addButton(btn => btn
                .setButtonText('Select Owner')
                .onClick(() => {
                    new CharacterSuggestModal(this.app, this.plugin, (char) => {
                        this.item.currentOwner = char.name;
                        this.onOpen(); // Re-render to update the description
                    }).open();
                })
            );
        // --- Groups ---
        contentEl.createEl('h3', { text: 'Groups' });
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);
        // --- Real-time group refresh ---
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);


        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');
        // --- Custom Fields ---
        contentEl.createEl('h3', { text: 'Custom fields' });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        const renderCustomFields = (container: HTMLElement, fields: Record<string, string>) => {
            container.empty();
            const keys = Object.keys(fields || {});
            if (keys.length === 0) {
                container.createEl('p', { text: 'No custom fields defined.', cls: 'storyteller-modal-list-empty' });
                return;
            }
            const reserved = new Set<string>([...getWhitelistKeys('item'), 'customFields', 'filePath', 'id', 'sections']);
            keys.forEach(key => {
                let currentKey = key;
                const setting = new Setting(container)
                    .addText(t => t
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
                                t.setValue(currentKey);
                                new Notice('Custom field name must be unique, non-empty, and not reserved.');
                            }
                        }))
                    .addText(t => t
                        .setValue(fields[currentKey]?.toString() || '')
                        .setPlaceholder('Field value')
                        .onChange(v => { fields[currentKey] = v; }))
                    .addButton(b => b
                        .setIcon('trash')
                        .setClass('mod-warning')
                        .setTooltip(`Remove field "${currentKey}"`)
                        .onClick(() => { delete fields[currentKey]; renderCustomFields(container, fields); }));
                setting.controlEl.addClass('storyteller-custom-field-row');
            });
        };
        if (!this.item.customFields) this.item.customFields = {};
        renderCustomFields(customFieldsContainer, this.item.customFields);
        new Setting(contentEl)
            .addButton(b => b
                .setButtonText('Add custom field')
                .setIcon('plus')
                .onClick(() => {
                    const fields = this.item.customFields!;
                    const newKey = `field_${Object.keys(fields).length + 1}`;
                    fields[newKey] = '';
                    renderCustomFields(customFieldsContainer, fields);
                }));
        new Setting(contentEl)
            .setName('Current Location')
            .setDesc(`Location: ${this.item.currentLocation || 'None'}`)
            .addButton(btn => btn
                .setButtonText('Select Location')
                .onClick(() => {
                    new LocationSuggestModal(this.app, this.plugin, (loc) => {
                        this.item.currentLocation = loc ? loc.name : undefined;
                        this.onOpen(); // Re-render to update the description
                    }).open();
                })
            );
            

        // TODO: Add UI for pastOwners and associatedEvents lists
        
        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText('Delete item')
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(`Are you sure you want to delete "${this.item.name}"?`)) {
                        await this.onDelete!(this.item);
                        this.close();
                    }
                }));
        }

        buttonsSetting.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        
        buttonsSetting.addButton(btn => btn
            .setButtonText('Cancel')
            .onClick(() => this.close()));
            
        buttonsSetting.addButton(btn => btn
            .setButtonText(this.isNew ? 'Create Item' : 'Save Changes')
            .setCta()
            .onClick(async () => {
                if (!this.item.name.trim()) {
                    new Notice("Item name cannot be empty.");
                    return;
                }
                await this.onSubmit(this.item);
                this.close();
            }));
    }
    renderGroupSelector(container: HTMLElement) {
        container.empty();
        const allGroups = this.plugin.getGroups();
        const syncSelection = async (): Promise<Set<string>> => {
            const identifier = this.item.id || this.item.name;
            const freshList = await this.plugin.listPlotItems();
            const fresh = freshList.find(i => (i.id || i.name) === identifier);
            const current = new Set((fresh?.groups || this.item.groups || []) as string[]);
            this.item.groups = Array.from(current);
            return current;
        };
        (async () => {
            const selectedGroupIds = await syncSelection();
            new Setting(container)
                .setName('Groups')
                .setDesc('Assign this item to one or more groups.')
                .addDropdown(dropdown => {
                    dropdown.addOption('', '-- Select group --');
                    allGroups.forEach(group => dropdown.addOption(group.id, group.name));
                    dropdown.setValue('');
                    dropdown.onChange(async (value) => {
                        if (value && !selectedGroupIds.has(value)) {
                            selectedGroupIds.add(value);
                            this.item.groups = Array.from(selectedGroupIds);
                            const itemId = this.item.id || this.item.name;
                            await this.plugin.addMemberToGroup(value, 'item', itemId);
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
                        this.item.groups = Array.from(selectedGroupIds);
                        const itemId = this.item.id || this.item.name;
                        await this.plugin.removeMemberFromGroup(group.id, 'item', itemId);
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