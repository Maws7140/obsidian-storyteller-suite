import { App, Setting, Notice, parseYaml } from 'obsidian';
import type { Economy } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { t } from '../i18n/strings';
import { getWhitelistKeys, parseSectionsFromMarkdown } from '../yaml/EntitySections';

export type EconomyModalSubmitCallback = (economy: Economy) => Promise<void>;
export type EconomyModalDeleteCallback = (economy: Economy) => Promise<void>;

/**
 * Modal for creating and editing economic systems
 */
export class EconomyModal extends ResponsiveModal {
    economy: Economy;
    plugin: StorytellerSuitePlugin;
    onSubmit: EconomyModalSubmitCallback;
    onDelete?: EconomyModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        economy: Economy | null,
        onSubmit: EconomyModalSubmitCallback,
        onDelete?: EconomyModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = economy === null;

        this.economy = economy || {
            name: '',
            economicSystem: 'market',
            status: 'stable',
            currencies: [],
            resources: [],
            tradeRoutes: [],
            linkedLocations: [],
            linkedFactions: [],
            linkedCultures: [],
            linkedEvents: [],
            customFields: {},
            groups: [],
            connections: []
        };

        if (!this.economy.customFields) this.economy.customFields = {};
        if (!this.economy.currencies) this.economy.currencies = [];
        if (!this.economy.resources) this.economy.resources = [];
        if (!this.economy.tradeRoutes) this.economy.tradeRoutes = [];
        if (!this.economy.linkedLocations) this.economy.linkedLocations = [];
        if (!this.economy.linkedFactions) this.economy.linkedFactions = [];
        if (!this.economy.linkedCultures) this.economy.linkedCultures = [];
        if (!this.economy.linkedEvents) this.economy.linkedEvents = [];
        if (!this.economy.groups) this.economy.groups = [];
        if (!this.economy.connections) this.economy.connections = [];

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-economy-modal');
    }

    async onOpen(): Promise<void> {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? t('createNewEconomy') : `${t('editEconomy')}: ${this.economy.name}`
        });

        // Auto-apply default template for new economies
        if (this.isNew && !this.economy.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['economy'];
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
                                            await this.applyTemplateToEconomyWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[EconomyModal] Error applying template:', error);
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
                            await this.applyTemplateToEconomy(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            console.error('[EconomyModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // --- Template Selector (for new economies) ---
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
                                                        await this.applyTemplateToEconomyWithVariables(template, variableValues);
                                                        new Notice(t('templateApplied', template.name));
                                                        this.refresh();
                                                    } catch (error) {
                                                        console.error('[EconomyModal] Error applying template:', error);
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                }
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToEconomy(template);
                                    this.refresh();
                                    new Notice(t('templateApplied', template.name));
                                }
                            },
                            'economy'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('economyNameDesc'))
            .addText(text => {
                text.setValue(this.economy.name)
                    .onChange(value => this.economy.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        const profileImageSetting = new Setting(contentEl)
            .setName(t('representativeImage'))
            .setDesc('');
        const imagePathDesc = profileImageSetting.descEl.createEl('small', {
            text: t('currentValue', this.economy.profileImagePath || t('none'))
        });
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.economy.profileImagePath,
                onSelect: (path) => {
                    this.economy.profileImagePath = path;
                    imagePathDesc.setText(t('currentValue', this.economy.profileImagePath || t('none')));
                },
                descriptionEl: imagePathDesc
            }
        );

        // Economic System
        new Setting(contentEl)
            .setName(t('economicSystem'))
            .setDesc(t('economicSystemDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'barter': t('barterEconomy'),
                    'market': t('marketEconomy'),
                    'command': t('commandEconomy'),
                    'mixed': t('mixedEconomy'),
                    'feudal': t('feudalEconomy'),
                    'gift': t('giftEconomy'),
                    'custom': t('custom')
                })
                .setValue(this.economy.economicSystem || 'market')
                .onChange(value => this.economy.economicSystem = value)
            );

        // Status
        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('economyStatusDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'booming': t('booming'),
                    'growing': t('growing'),
                    'stable': t('stable'),
                    'recession': t('recession'),
                    'depression': t('depression'),
                    'recovering': t('recovering'),
                    'custom': t('custom')
                })
                .setValue(this.economy.status || 'stable')
                .onChange(value => this.economy.status = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName(t('description'))
            .setDesc(t('economyDescriptionDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.economy.description || '')
                    .onChange(value => this.economy.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Industries (Markdown Section)
        new Setting(contentEl)
            .setName(t('industries'))
            .setDesc(t('industriesDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.economy.industries || '')
                    .onChange(value => this.economy.industries = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Taxation (Markdown Section)
        new Setting(contentEl)
            .setName(t('taxation'))
            .setDesc(t('taxationDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.economy.taxation || '')
                    .onChange(value => this.economy.taxation = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText(t('save'))
            .setCta()
            .onClick(async () => {
                if (!this.economy.name) {
                    new Notice(t('economyNameRequired'));
                    return;
                }
                await this.onSubmit(this.economy);
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
                        await this.onDelete(this.economy);
                        this.close();
                    }
                })
            );
        }
    }

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.economies?.length) entityCount += template.entities.economies.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToEconomy(template: Template): Promise<void> {
        if (!template.entities.economies || template.entities.economies.length === 0) {
            new Notice('This template does not contain any economies');
            return;
        }

        const templateEconomy = template.entities.economies[0];
        await this.applyProcessedTemplateToEconomy(templateEconomy);
    }

    private async applyTemplateToEconomyWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.economies || template.entities.economies.length === 0) {
            new Notice('This template does not contain any economies');
            return;
        }

        // Get the first economy from the template
        let templateEconomy = template.entities.economies[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateEconomy,
            variableValues,
            false // non-strict mode
        );
        templateEconomy = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[EconomyModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToEconomy(templateEconomy);
    }

    private async applyProcessedTemplateToEconomy(templateEconomy: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, ...rest } = templateEconomy as any;

        let fields: any = { ...rest };

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[EconomyModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[EconomyModal] Failed to parse yamlContent:', error);
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
                if ('Industries' in parsedSections) {
                    fields.industries = parsedSections['Industries'];
                }
                if ('Taxation' in parsedSections) {
                    fields.taxation = parsedSections['Taxation'];
                }

                console.log('[EconomyModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[EconomyModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the economy
        Object.assign(this.economy, fields);
        console.log('[EconomyModal] Final economy after template:', this.economy);

        // Clear relationships as they reference template entities
        this.economy.linkedLocations = [];
        this.economy.linkedFactions = [];
        this.economy.linkedCultures = [];
        this.economy.linkedEvents = [];
        this.economy.groups = [];
        this.economy.connections = [];
    }

    private refresh(): void {
        void this.onOpen();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
