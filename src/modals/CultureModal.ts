import { App, Setting, Notice, TextAreaComponent, parseYaml, setIcon } from 'obsidian';
import type { Culture } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { t } from '../i18n/strings';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { EntityCustomFieldsEditor } from './entity/EntityCustomFieldsEditor';

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
    private readonly customFieldsEditor: EntityCustomFieldsEditor;

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
        // Normalize: bad sync data may have stored scalar strings instead of arrays —
        // reset any non-array value so the chip renderer doesn't iterate over characters
        if (!Array.isArray(this.culture.linkedLocations)) this.culture.linkedLocations = [];
        if (!Array.isArray(this.culture.linkedCharacters)) this.culture.linkedCharacters = [];
        if (!Array.isArray(this.culture.linkedEvents)) this.culture.linkedEvents = [];
        if (!Array.isArray(this.culture.linkedEconomies)) this.culture.linkedEconomies = [];
        if (!Array.isArray(this.culture.relatedCultures)) this.culture.relatedCultures = [];
        if (!Array.isArray(this.culture.linkedMagicSystems)) this.culture.linkedMagicSystems = [];
        if (!Array.isArray(this.culture.linkedItems)) this.culture.linkedItems = [];
        if (!this.culture.groups) this.culture.groups = [];
        if (!this.culture.connections) this.culture.connections = [];
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'culture', this.culture.customFields);

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
        const profileImageSetting = new Setting(contentEl)
            .setName(t('profileImage'))
            .setDesc('');
        const imagePathDesc = profileImageSetting.descEl.createEl('small', {
            text: t('currentValue', this.culture.profileImagePath || t('none'))
        });
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.culture.profileImagePath,
                onSelect: (path) => {
                    this.culture.profileImagePath = path;
                    imagePathDesc.setText(t('currentValue', this.culture.profileImagePath || t('none')));
                },
                descriptionEl: imagePathDesc
            }
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

        // --- Linked Characters ---
        contentEl.createEl('h3', { text: 'Characters' });
        const charChips = contentEl.createDiv('storyteller-linked-chips');
        const renderCharChips = () => {
            charChips.empty();
            for (const name of (this.culture.linkedCharacters ?? [])) {
                const chip = charChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.culture.linkedCharacters = this.culture.linkedCharacters!.filter(n => n !== name);
                    renderCharChips();
                });
            }
        };
        renderCharChips();
        const allCharacters = await this.plugin.listCharacters();
        new Setting(contentEl)
            .setName('Add character')
            .addDropdown(dd => {
                dd.addOption('', '— select character —');
                allCharacters.forEach(c => dd.addOption(c.name, c.name));
                dd.onChange(val => {
                    if (val && !(this.culture.linkedCharacters ?? []).includes(val)) {
                        if (!this.culture.linkedCharacters) this.culture.linkedCharacters = [];
                        this.culture.linkedCharacters.push(val);
                        renderCharChips();
                    }
                    dd.setValue('');
                });
            });

        // --- Linked Locations ---
        contentEl.createEl('h3', { text: 'Locations' });
        const locChips = contentEl.createDiv('storyteller-linked-chips');
        const renderLocChips = () => {
            locChips.empty();
            for (const name of (this.culture.linkedLocations ?? [])) {
                const chip = locChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.culture.linkedLocations = this.culture.linkedLocations!.filter(n => n !== name);
                    renderLocChips();
                });
            }
        };
        renderLocChips();
        const allLocations = await this.plugin.listLocations();
        new Setting(contentEl)
            .setName('Add location')
            .addDropdown(dd => {
                dd.addOption('', '— select location —');
                allLocations.forEach(l => dd.addOption(l.name, l.name));
                dd.onChange(val => {
                    if (val && !(this.culture.linkedLocations ?? []).includes(val)) {
                        if (!this.culture.linkedLocations) this.culture.linkedLocations = [];
                        this.culture.linkedLocations.push(val);
                        renderLocChips();
                    }
                    dd.setValue('');
                });
            });

        // --- Finances ---
        contentEl.createEl('h3', { text: 'Finances' });
        new Setting(contentEl)
            .setName('Collective Wealth')
            .setDesc('Economic wealth of this culture (e.g. "10000gp"). Auto-computed from ledger blocks if present.')
            .addText(text => text
                .setValue(this.culture.balance || '')
                .onChange(val => { this.culture.balance = val.trim() || undefined; })
            );
        if (this.culture.ledger && this.culture.ledger.length > 0) {
            contentEl.createDiv('storyteller-ledger-preview').createEl('p', {
                cls: 'storyteller-ledger-note',
                text: `${this.culture.ledger.length} transaction(s) in note`
            });
        }

        // --- Linked Economies ---
        contentEl.createEl('h3', { text: 'Economies' });
        if (!this.culture.linkedEconomies) this.culture.linkedEconomies = [];
        const cultEconChips = contentEl.createDiv('storyteller-linked-chips');
        const renderCultEconChips = () => {
            cultEconChips.empty();
            for (const name of (this.culture.linkedEconomies ?? [])) {
                const chip = cultEconChips.createSpan({ cls: 'storyteller-linked-chip' });
                chip.createSpan({ text: name });
                const rm = chip.createEl('button', { cls: 'storyteller-chip-remove', attr: { 'aria-label': 'Remove' } });
                setIcon(rm, 'x');
                rm.addEventListener('click', () => {
                    this.culture.linkedEconomies = this.culture.linkedEconomies!.filter(n => n !== name);
                    renderCultEconChips();
                });
            }
        };
        renderCultEconChips();
        const allEconomiesForCult = await this.plugin.listEconomies();
        new Setting(contentEl)
            .setName('Add economy')
            .addDropdown(dd => {
                dd.addOption('', '— select economy —');
                allEconomiesForCult.forEach(e => dd.addOption(e.name, e.name));
                dd.onChange(val => {
                    if (val && !(this.culture.linkedEconomies ?? []).includes(val)) {
                        if (!this.culture.linkedEconomies) this.culture.linkedEconomies = [];
                        this.culture.linkedEconomies.push(val);
                        renderCultEconChips();
                    }
                    dd.setValue('');
                });
            });

        this.customFieldsEditor.setFields(this.culture.customFields);
        this.customFieldsEditor.renderSection(contentEl);

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
                const customFields = this.customFieldsEditor.getFields();
                if (!customFields) {
                    return;
                }
                this.culture.customFields = customFields;
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
        let allTemplateSections: Record<string, string> = {};

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
                allTemplateSections = parsedSections;

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
            for (const [k, v] of Object.entries(sectionContent)) { allTemplateSections[k as string] = v as string; }
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the culture
        Object.assign(this.culture, fields);
        if (Object.keys(allTemplateSections).length > 0) {
            Object.defineProperty(this.culture, '_templateSections', {
                value: allTemplateSections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
        console.log('[CultureModal] Final culture after template:', this.culture);

        // Clear relationships as they reference template entities
        this.culture.linkedLocations = [];
        this.culture.linkedCharacters = [];
        this.culture.linkedEvents = [];
        this.culture.linkedEconomies = [];
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
