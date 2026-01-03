import { App, Setting, Notice, TextAreaComponent, parseYaml } from 'obsidian';
import type { Culture } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { GalleryImageSuggestModal } from './GalleryImageSuggestModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { t } from '../i18n/strings';
import { getWhitelistKeys, parseSectionsFromMarkdown } from '../yaml/EntitySections';

export type CultureModalSubmitCallback = (culture: Culture) => Promise<void>;
export type CultureModalDeleteCallback = (culture: Culture) => Promise<void>;

/**
 * Modal for creating and editing cultures/societies
 */
export class CultureModal extends ResponsiveModal {
    culture: Culture;
    plugin: StorytellerSuitePlugin;
    onSubmit: CultureModalSubmitCallback;
    onDelete?: CultureModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        culture: Culture | null,
        onSubmit: CultureModalSubmitCallback,
        onDelete?: CultureModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = culture === null;

        this.culture = culture || {
            name: '',
            languages: [],
            techLevel: 'medieval',
            governmentType: 'monarchy',
            status: 'thriving',
            linkedLocations: [],
            linkedCharacters: [],
            linkedEvents: [],
            relatedCultures: [],
            customFields: {},
            groups: [],
            connections: []
        };

        if (!this.culture.customFields) this.culture.customFields = {};
        if (!this.culture.languages) this.culture.languages = [];
        if (!this.culture.linkedLocations) this.culture.linkedLocations = [];
        if (!this.culture.linkedCharacters) this.culture.linkedCharacters = [];
        if (!this.culture.linkedEvents) this.culture.linkedEvents = [];
        if (!this.culture.relatedCultures) this.culture.relatedCultures = [];
        if (!this.culture.groups) this.culture.groups = [];
        if (!this.culture.connections) this.culture.connections = [];

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-culture-modal');
    }

    async onOpen(): Promise<void> {
        // Auto-apply default template for new cultures
        if (this.isNew && !this.culture.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['culture'];
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
                                            await this.applyTemplateToCultureWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[CultureModal] Error applying template:', error);
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
                            await this.applyTemplateToCulture(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            console.error('[CultureModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? t('createNewCulture') : `${t('editCulture')}: ${this.culture.name}`
        });

        // --- Template Selector (for new cultures) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName(t('startFromTemplate'))
                .setDesc(t('startFromTemplateDesc'))
                .addButton(button => button
                    .setButtonText(t('chooseTemplate'))
                    .setTooltip(t('selectTemplate'))
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            async (template: Template) => {
                                // Check if template has variables or multiple entities
                                if ((template.variables && template.variables.length > 0) ||
                                    this.hasMultipleEntities(template)) {
                                    // Use TemplateApplicationModal for variable collection
                                    await new Promise<void>((resolve) => {
                                        import('./TemplateApplicationModal').then(({ TemplateApplicationModal }) => {
                                            new TemplateApplicationModal(
                                                this.app,
                                                this.plugin,
                                                template,
                                                async (variableValues, entityFileNames) => {
                                                    try {
                                                        await this.applyTemplateToCultureWithVariables(template, variableValues);
                                                        new Notice(t('templateApplied', template.name));
                                                        this.refresh();
                                                    } catch (error) {
                                                        console.error('[CultureModal] Error applying template:', error);
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                }
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    try {
                                        await this.applyTemplateToCulture(template);
                                        this.refresh();
                                        new Notice(t('templateApplied', template.name));
                                    } catch (error) {
                                        console.error('Failed to apply template to culture:', error);
                                        new Notice(t('templateApplyFailed', template.name));
                                    }
                                }
                            },
                            'culture'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('cultureNameDesc'))
            .addText(text => {
                text.setValue(this.culture.name)
                    .onChange(value => this.culture.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        let imagePathDesc: HTMLElement;
        new Setting(contentEl)
            .setName(t('profileImage'))
            .setDesc('')
            .then(setting => {
                imagePathDesc = setting.descEl.createEl('small', {
                    text: t('currentValue', this.culture.profileImagePath || t('none'))
                });
            })
            .addButton(button => button
                .setButtonText(t('select'))
                .onClick(() => {
                    new GalleryImageSuggestModal(this.app, this.plugin, (selectedImage) => {
                        const path = selectedImage ? selectedImage.filePath : '';
                        this.culture.profileImagePath = path || undefined;
                        imagePathDesc.setText(t('currentValue', this.culture.profileImagePath || t('none')));
                    }).open();
                })
            )
            .addButton(button => button
                .setButtonText(t('clear'))
                .onClick(() => {
                    this.culture.profileImagePath = undefined;
                    imagePathDesc.setText(t('currentValue', t('none')));
                })
            );

        // Technology Level
        new Setting(contentEl)
            .setName(t('techLevel'))
            .setDesc(t('techLevelDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'stone-age': t('stoneAge'),
                    'bronze-age': t('bronzeAge'),
                    'iron-age': t('ironAge'),
                    'medieval': t('medieval'),
                    'renaissance': t('renaissance'),
                    'industrial': t('industrial'),
                    'modern': t('modern'),
                    'futuristic': t('futuristic'),
                    'custom': t('custom')
                })
                .setValue(this.culture.techLevel || 'medieval')
                .onChange(value => this.culture.techLevel = value)
            );

        // Government Type
        new Setting(contentEl)
            .setName(t('governmentType'))
            .setDesc(t('governmentTypeDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'monarchy': t('monarchy'),
                    'democracy': t('democracy'),
                    'republic': t('republic'),
                    'theocracy': t('theocracy'),
                    'tribal': t('tribal'),
                    'empire': t('empire'),
                    'feudal': t('feudal'),
                    'oligarchy': t('oligarchy'),
                    'anarchy': t('anarchy'),
                    'custom': t('custom')
                })
                .setValue(this.culture.governmentType || 'monarchy')
                .onChange(value => this.culture.governmentType = value)
            );

        // Status
        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('cultureStatusDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'thriving': t('thriving'),
                    'stable': t('stable'),
                    'declining': t('declining'),
                    'extinct': t('extinct'),
                    'emerging': t('emerging'),
                    'custom': t('custom')
                })
                .setValue(this.culture.status || 'thriving')
                .onChange(value => this.culture.status = value)
            );

        // Languages (comma-separated)
        new Setting(contentEl)
            .setName(t('languages'))
            .setDesc(t('languagesDesc'))
            .addText(text => text
                .setValue(this.culture.languages?.join(', ') || '')
                .onChange(value => {
                    this.culture.languages = value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s);
                })
            );

        // Population
        new Setting(contentEl)
            .setName(t('population'))
            .setDesc(t('populationDesc'))
            .addText(text => text
                .setValue(this.culture.population || '')
                .onChange(value => this.culture.population = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName(t('description'))
            .setDesc(t('cultureDescriptionDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.description || '')
                    .onChange(value => this.culture.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Values & Beliefs (Markdown Section)
        new Setting(contentEl)
            .setName(t('valuesBeliefs'))
            .setDesc(t('valuesBeliefsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.values || '')
                    .onChange(value => this.culture.values = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Religion (Markdown Section)
        new Setting(contentEl)
            .setName(t('religion'))
            .setDesc(t('religionDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.religion || '')
                    .onChange(value => this.culture.religion = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Social Structure (Markdown Section)
        new Setting(contentEl)
            .setName(t('socialStructure'))
            .setDesc(t('socialStructureDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.socialStructure || '')
                    .onChange(value => this.culture.socialStructure = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // History (Markdown Section)
        new Setting(contentEl)
            .setName(t('history'))
            .setDesc(t('cultureHistoryDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.history || '')
                    .onChange(value => this.culture.history = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Naming Conventions (Markdown Section)
        new Setting(contentEl)
            .setName(t('namingConventions'))
            .setDesc(t('namingConventionsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.namingConventions || '')
                    .onChange(value => this.culture.namingConventions = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Customs (Markdown Section)
        new Setting(contentEl)
            .setName(t('customsTraditions'))
            .setDesc(t('customsTraditionsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.culture.customs || '')
                    .onChange(value => this.culture.customs = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText(t('save'))
            .setCta()
            .onClick(async () => {
                if (!this.culture.name) {
                    new Notice(t('cultureNameRequired'));
                    return;
                }
                await this.onSubmit(this.culture);
                this.close();
            })
        );

        buttonsSetting.addButton(button => button
            .setButtonText(t('cancel'))
            .onClick(() => this.close())
        );

        if (!this.isNew && this.onDelete) {
            buttonsSetting.addButton(button => button
                .setButtonText(t('delete'))
                .setWarning()
                .onClick(async () => {
                    if (this.onDelete) {
                        await this.onDelete(this.culture);
                        this.close();
                    }
                })
            );
        }
    }

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.cultures?.length) entityCount += template.entities.cultures.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToCulture(template: Template): Promise<void> {
        if (!template.entities.cultures || template.entities.cultures.length === 0) {
            new Notice('This template does not contain any cultures');
            return;
        }

        const templateCulture = template.entities.cultures[0];
        await this.applyProcessedTemplateToCulture(templateCulture);
    }

    private async applyTemplateToCultureWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.cultures || template.entities.cultures.length === 0) {
            new Notice('This template does not contain any cultures');
            return;
        }

        // Get the first culture from the template
        let templateCulture = template.entities.cultures[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateCulture,
            variableValues,
            false // non-strict mode
        );
        templateCulture = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[CultureModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToCulture(templateCulture);
    }

    private async applyProcessedTemplateToCulture(templateCulture: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, ...rest } = templateCulture as any;

        let fields: any = { ...rest };

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[CultureModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[CultureModal] Failed to parse yamlContent:', error);
            }
        } else if (customYamlFields) {
            // Old format: merge custom YAML fields
            fields = { ...fields, ...customYamlFields };
        }

        // Handle new format: markdownContent (parse sections)
        if (markdownContent && typeof markdownContent === 'string') {
            try {
                const parsedSections = parseSectionsFromMarkdown(markdownContent);

                // Map well-known sections to entity properties
                if ('Description' in parsedSections) {
                    fields.description = parsedSections['Description'];
                }
                if ('Values & Beliefs' in parsedSections) {
                    fields.values = parsedSections['Values & Beliefs'];
                }
                if ('Religion' in parsedSections) {
                    fields.religion = parsedSections['Religion'];
                }
                if ('Social Structure' in parsedSections) {
                    fields.socialStructure = parsedSections['Social Structure'];
                }
                if ('History' in parsedSections) {
                    fields.history = parsedSections['History'];
                }
                if ('Customs' in parsedSections) {
                    fields.customs = parsedSections['Customs'];
                }

                console.log('[CultureModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[CultureModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the culture
        Object.assign(this.culture, fields);
        console.log('[CultureModal] Final culture after template:', this.culture);

        // Clear relationships as they reference template entities
        this.culture.linkedLocations = [];
        this.culture.linkedCharacters = [];
        this.culture.linkedEvents = [];
        this.culture.relatedCultures = [];
        this.culture.parentCulture = undefined;
        this.culture.groups = [];
        this.culture.connections = [];
    }

    private refresh(): void {
        void this.onOpen();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
