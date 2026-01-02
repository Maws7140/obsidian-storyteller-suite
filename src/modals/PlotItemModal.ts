/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, Modal, Setting, Notice, TextAreaComponent, parseYaml } from 'obsidian';
import { PlotItem, Group } from '../types';
import StorytellerSuitePlugin from '../main';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { getWhitelistKeys, parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { t } from '../i18n/strings';
import { CharacterSuggestModal } from './CharacterSuggestModal';
import { LocationSuggestModal } from './LocationSuggestModal';
import { EventSuggestModal } from './EventSuggestModal';
import { PromptModal } from './ui/PromptModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';

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

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.isNew ? t('createItem') : `${t('edit')} ${this.item.name}` });

        // Auto-apply default template for new items
        if (this.isNew && !this.item.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['item'];
            if (defaultTemplateId) {
                const defaultTemplate = this.plugin.templateManager?.getTemplate(defaultTemplateId);
                if (defaultTemplate) {
                    // If template has variables or multiple entities, use TemplateApplicationModal
                    if ((defaultTemplate.variables && defaultTemplate.variables.length > 0) ||
                        this.hasMultipleEntities(defaultTemplate)) {
                        await new Promise<void>((resolve) => {
                            import('./TemplateApplicationModal').then(({ TemplateApplicationModal }) => {
                                new TemplateApplicationModal(
                                    this.app,
                                    this.plugin,
                                    defaultTemplate,
                                    async (variableValues, entityFileNames) => {
                                        try {
                                            await this.applyTemplateToItemWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[PlotItemModal] Error applying template:', error);
                                            new Notice('Error applying default template');
                                        }
                                        resolve();
                                    }
                                ).open();
                            });
                        });
                    } else {
                        // No variables, apply directly
                        try {
                            await this.applyTemplateToItem(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            console.error('[PlotItemModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // --- Template Selector (for new items) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from Template')
                .setDesc('Optionally start with a pre-configured item template')
                .addButton(button => button
                    .setButtonText('Choose Template')
                    .setTooltip('Select an item template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                await this.applyTemplateToItem(template);
                                this.refresh();
                                new Notice(`Template "${template.name}" applied`);
                            },
                            'item'
                        ).open();
                    })
                );
        }

        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('name'))
            .addText(text => text
                .setPlaceholder(t('enterItemName'))
                .setValue(this.item.name)
                .onChange(value => this.item.name = value)
                .inputEl.addClass('storyteller-modal-input-large')
            );

        new Setting(contentEl)
            .setName(t('plotCritical'))
            .setDesc(t('plotCritical'))
            .addToggle(toggle => toggle
                .setValue(this.item.isPlotCritical)
                .onChange(value => this.item.isPlotCritical = value)
            );
        
        const profileImageSetting = new Setting(contentEl)
            .setName(t('itemImage'))
            .setDesc('')
            .then(setting => {
                setting.descEl.addClass('storyteller-modal-setting-vertical');
            });
        
        const imagePathDesc = profileImageSetting.descEl.createEl('small', { 
            text: t('currentValue', this.item.profileImagePath || t('none')) 
        });
        
        // Add image selection buttons (Gallery, Upload, Vault, Clear)
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.item.profileImagePath,
                onSelect: (path) => {
                    this.item.profileImagePath = path;
                },
                descriptionEl: imagePathDesc
            }
        );

        new Setting(contentEl)
            .setName(t('description'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder(t('itemDescriptionPh'))
                    .setValue(this.item.description || '')
                    .onChange(value => this.item.description = value || undefined);
                text.inputEl.rows = 4;
            });
        
        new Setting(contentEl)
            .setName(t('history'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setPlaceholder(t('itemHistoryPh'))
                    .setValue(this.item.history || '')
                    .onChange(value => this.item.history = value || undefined);
                text.inputEl.rows = 6;
            });
        
        contentEl.createEl('h3', { text: t('relationships') });

        new Setting(contentEl)
            .setName(t('currentOwner'))
            .setDesc(`${t('currentOwner')}: ${this.item.currentOwner || t('none')}`)
            .addButton(btn => btn
                .setButtonText(t('selectOwner'))
                .onClick(() => {
                    new CharacterSuggestModal(this.app, this.plugin, (char) => {
                        this.item.currentOwner = char.name;
                        this.onOpen(); // Re-render to update the description
                    }).open();
                })
            );
        // --- Groups ---
        contentEl.createEl('h3', { text: t('groups') });
        this.groupSelectorContainer = contentEl.createDiv('storyteller-group-selector-container');
        this.renderGroupSelector(this.groupSelectorContainer);
        // --- Real-time group refresh ---
        this._groupRefreshInterval = window.setInterval(() => {
            if (this.modalEl.isShown() && this.groupSelectorContainer) {
                this.renderGroupSelector(this.groupSelectorContainer);
            }
        }, 2000);


        // --- Custom Fields ---
        contentEl.createEl('h3', { text: t('customFields') });
        const customFieldsContainer = contentEl.createDiv('storyteller-custom-fields-container');
        // Do not render existing custom fields in the modal to avoid duplication with note page
        if (!this.item.customFields) this.item.customFields = {};
        new Setting(contentEl)
            .addButton(b => b
                .setButtonText(t('addCustomField'))
                .setIcon('plus')
                .onClick(() => {
                    const fields = this.item.customFields!;
                    const reserved = new Set<string>([...getWhitelistKeys('item'), 'customFields', 'filePath', 'id', 'sections']);
                    const askValue = (key: string) => {
                        new PromptModal(this.app, {
                            title: t('customFieldValueTitle'),
                            label: t('valueForX', key),
                            defaultValue: '',
                            onSubmit: (val: string) => { fields[key] = val; }
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
        new Setting(contentEl)
            .setName(t('currentLocation'))
            .setDesc(`${t('currentLocation')}: ${this.item.currentLocation || t('none')}`)
            .addButton(btn => btn
                .setButtonText(t('selectLocation'))
                .onClick(() => {
                    new LocationSuggestModal(this.app, this.plugin, (loc) => {
                        this.item.currentLocation = loc ? loc.name : undefined;
                        this.onOpen(); // Re-render to update the description
                    }).open();
                })
            );
            

        // TODO: Add UI for pastOwners and associatedEvents lists
        
        // --- Action Buttons at bottom ---
        const buttonsSetting = new Setting(contentEl).setClass('storyteller-modal-buttons');
        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('deleteItem'))
                .setClass('mod-warning')
                .onClick(async () => {
                    if (confirm(t('confirmDeleteItem', this.item.name))) {
                        await this.onDelete!(this.item);
                        this.close();
                    }
                }));
        }

        buttonsSetting.controlEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        
        buttonsSetting.addButton(btn => btn
            .setButtonText(t('cancel'))
            .onClick(() => this.close()));
            
        buttonsSetting.addButton(btn => btn
            .setButtonText(this.isNew ? t('createItem') : t('saveChanges'))
            .setCta()
            .onClick(async () => {
                if (!this.item.name.trim()) {
                    new Notice(t('itemNameRequired'));
                    return;
                }
                // Ensure empty section fields are set so templates can render headings
                this.item.description = this.item.description || '';
                this.item.history = this.item.history || '';
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
                .setName(t('groups'))
                .setDesc(t('assignItemToGroupsDesc'))
                .addDropdown(dropdown => {
                    dropdown.addOption('', t('selectGroupPlaceholder'));
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

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToItem(template: Template): Promise<void> {
        if (!template.entities.items || template.entities.items.length === 0) {
            new Notice('This template does not contain any items');
            return;
        }

        const templateItem = template.entities.items[0];
        await this.applyProcessedTemplateToItem(templateItem);
    }

    private async applyTemplateToItemWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.items || template.entities.items.length === 0) {
            new Notice('This template does not contain any items');
            return;
        }

        // Get the first item from the template
        let templateItem = template.entities.items[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateItem,
            variableValues,
            false // non-strict mode
        );
        templateItem = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[PlotItemModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToItem(templateItem);
    }

    private async applyProcessedTemplateToItem(templateItem: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, ...rest } = templateItem as any;

        let fields: any = { ...rest };

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[PlotItemModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[PlotItemModal] Failed to parse yamlContent:', error);
            }
        } else if (customYamlFields) {
            // Old format: merge custom YAML fields
            fields = { ...fields, ...customYamlFields };
        }

        // Handle new format: markdownContent (parse sections)
        if (markdownContent && typeof markdownContent === 'string') {
            try {
                const parsedSections = parseSectionsFromMarkdown(`---\n---\n\n${markdownContent}`);

                // Map well-known sections to entity properties
                if ('Description' in parsedSections) {
                    fields.description = parsedSections['Description'];
                }
                if ('History' in parsedSections) {
                    fields.history = parsedSections['History'];
                }

                console.log('[PlotItemModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[PlotItemModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the item
        Object.assign(this.item, fields);
        console.log('[PlotItemModal] Final item after template:', this.item);

        // Clear relationships as they reference template entities
        this.item.currentOwner = undefined;
        this.item.pastOwners = [];
        this.item.currentLocation = undefined;
        this.item.associatedEvents = [];
        this.item.groups = [];
        this.item.connections = [];
    }

    private refresh(): void {
        void this.onOpen();
    }

    onClose() {
        this.contentEl.empty();
        if (this._groupRefreshInterval) {
            clearInterval(this._groupRefreshInterval);
        }
    }
}