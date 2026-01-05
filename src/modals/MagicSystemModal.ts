import { App, Setting, Notice, parseYaml } from 'obsidian';
import type { MagicSystem } from '../types';
import type StorytellerSuitePlugin from '../main';
import { ResponsiveModal } from './ResponsiveModal';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { TemplatePickerModal } from './TemplatePickerModal';
import { Template } from '../templates/TemplateTypes';
import { t } from '../i18n/strings';
import { getWhitelistKeys, parseSectionsFromMarkdown } from '../yaml/EntitySections';

export type MagicSystemModalSubmitCallback = (magicSystem: MagicSystem) => Promise<void>;
export type MagicSystemModalDeleteCallback = (magicSystem: MagicSystem) => Promise<void>;

/**
 * Modal for creating and editing magic systems
 */
export class MagicSystemModal extends ResponsiveModal {
    magicSystem: MagicSystem;
    plugin: StorytellerSuitePlugin;
    onSubmit: MagicSystemModalSubmitCallback;
    onDelete?: MagicSystemModalDeleteCallback;
    isNew: boolean;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        magicSystem: MagicSystem | null,
        onSubmit: MagicSystemModalSubmitCallback,
        onDelete?: MagicSystemModalDeleteCallback
    ) {
        super(app);
        this.plugin = plugin;
        this.isNew = magicSystem === null;

        this.magicSystem = magicSystem || {
            name: '',
            systemType: 'arcane',
            rarity: 'common',
            powerLevel: 'moderate',
            status: 'active',
            categories: [],
            abilities: [],
            consistencyRules: [],
            linkedCharacters: [],
            linkedLocations: [],
            linkedCultures: [],
            linkedEvents: [],
            linkedItems: [],
            customFields: {},
            groups: [],
            connections: []
        };

        if (!this.magicSystem.customFields) this.magicSystem.customFields = {};
        if (!this.magicSystem.categories) this.magicSystem.categories = [];
        if (!this.magicSystem.abilities) this.magicSystem.abilities = [];
        if (!this.magicSystem.consistencyRules) this.magicSystem.consistencyRules = [];
        if (!this.magicSystem.linkedCharacters) this.magicSystem.linkedCharacters = [];
        if (!this.magicSystem.linkedLocations) this.magicSystem.linkedLocations = [];
        if (!this.magicSystem.linkedCultures) this.magicSystem.linkedCultures = [];
        if (!this.magicSystem.linkedEvents) this.magicSystem.linkedEvents = [];
        if (!this.magicSystem.linkedItems) this.magicSystem.linkedItems = [];
        if (!this.magicSystem.groups) this.magicSystem.groups = [];
        if (!this.magicSystem.connections) this.magicSystem.connections = [];

        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-magic-system-modal');
    }

    async onOpen(): Promise<void> {
        super.onOpen();

        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.isNew ? t('createNewMagicSystem') : `${t('editMagicSystem')}: ${this.magicSystem.name}`
        });

        // Auto-apply default template for new magic systems
        if (this.isNew && !this.magicSystem.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['magicSystem'];
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
                                            await this.applyTemplateToMagicSystemWithVariables(defaultTemplate, variableValues);
                                            new Notice('Default template applied');
                                            this.refresh();
                                        } catch (error) {
                                            console.error('[MagicSystemModal] Error applying template:', error);
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
                            await this.applyTemplateToMagicSystem(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            console.error('[MagicSystemModal] Error applying template:', error);
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // --- Template Selector (for new magic systems) ---
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
                                                        await this.applyTemplateToMagicSystemWithVariables(template, variableValues);
                                                        new Notice(t('templateApplied', template.name));
                                                        this.refresh();
                                                    } catch (error) {
                                                        console.error('[MagicSystemModal] Error applying template:', error);
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                }
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToMagicSystem(template);
                                    this.refresh();
                                    new Notice(t('templateApplied', template.name));
                                }
                            },
                            'magicSystem'
                        ).open();
                    })
                );
        }

        // Name (Required)
        new Setting(contentEl)
            .setName(t('name'))
            .setDesc(t('magicSystemNameDesc'))
            .addText(text => {
                text.setValue(this.magicSystem.name)
                    .onChange(value => this.magicSystem.name = value);
                text.inputEl.addClass('storyteller-modal-input-large');
            });

        // Profile Image
        const profileImageSetting = new Setting(contentEl)
            .setName(t('representativeImage'))
            .setDesc('');
        const imagePathDesc = profileImageSetting.descEl.createEl('small', {
            text: t('currentValue', this.magicSystem.profileImagePath || t('none'))
        });
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.magicSystem.profileImagePath,
                onSelect: (path) => {
                    this.magicSystem.profileImagePath = path;
                    imagePathDesc.setText(t('currentValue', this.magicSystem.profileImagePath || t('none')));
                },
                descriptionEl: imagePathDesc
            }
        );

        // System Type
        new Setting(contentEl)
            .setName(t('systemType'))
            .setDesc(t('systemTypeDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'arcane': t('arcane'),
                    'divine': t('divine'),
                    'natural': t('natural'),
                    'psionic': t('psionic'),
                    'blood': t('bloodMagic'),
                    'elemental': t('elemental'),
                    'necromancy': t('necromancy'),
                    'alchemy': t('alchemy'),
                    'rune': t('runeMagic'),
                    'custom': t('custom')
                })
                .setValue(this.magicSystem.systemType || 'arcane')
                .onChange(value => this.magicSystem.systemType = value)
            );

        // Rarity
        new Setting(contentEl)
            .setName(t('rarity'))
            .setDesc(t('rarityDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'ubiquitous': t('ubiquitous'),
                    'common': t('common'),
                    'uncommon': t('uncommon'),
                    'rare': t('rare'),
                    'legendary': t('legendary'),
                    'custom': t('custom')
                })
                .setValue(this.magicSystem.rarity || 'common')
                .onChange(value => this.magicSystem.rarity = value)
            );

        // Power Level
        new Setting(contentEl)
            .setName(t('powerLevel'))
            .setDesc(t('powerLevelDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'low': t('low'),
                    'moderate': t('moderate'),
                    'high': t('high'),
                    'godlike': t('godlike'),
                    'custom': t('custom')
                })
                .setValue(this.magicSystem.powerLevel || 'moderate')
                .onChange(value => this.magicSystem.powerLevel = value)
            );

        // Status
        new Setting(contentEl)
            .setName(t('status'))
            .setDesc(t('magicSystemStatusDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'active': t('active'),
                    'forbidden': t('forbidden'),
                    'lost': t('lostKnowledge'),
                    'declining': t('declining'),
                    'resurgent': t('resurgent'),
                    'custom': t('custom')
                })
                .setValue(this.magicSystem.status || 'active')
                .onChange(value => this.magicSystem.status = value)
            );

        // Description (Markdown Section)
        new Setting(contentEl)
            .setName(t('description'))
            .setDesc(t('magicSystemDescriptionDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.description || '')
                    .onChange(value => this.magicSystem.description = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Rules (Markdown Section)
        new Setting(contentEl)
            .setName(t('rulesMechanics'))
            .setDesc(t('rulesMechanicsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.rules || '')
                    .onChange(value => this.magicSystem.rules = value);
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Source (Markdown Section)
        new Setting(contentEl)
            .setName(t('source'))
            .setDesc(t('sourceDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.source || '')
                    .onChange(value => this.magicSystem.source = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Costs (Markdown Section)
        new Setting(contentEl)
            .setName(t('costsConsequences'))
            .setDesc(t('costsConsequencesDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.costs || '')
                    .onChange(value => this.magicSystem.costs = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Limitations (Markdown Section)
        new Setting(contentEl)
            .setName(t('limitations'))
            .setDesc(t('limitationsDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.limitations || '')
                    .onChange(value => this.magicSystem.limitations = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Training (Markdown Section)
        new Setting(contentEl)
            .setName(t('trainingLearning'))
            .setDesc(t('trainingLearningDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.training || '')
                    .onChange(value => this.magicSystem.training = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // History (Markdown Section)
        new Setting(contentEl)
            .setName(t('history'))
            .setDesc(t('magicSystemHistoryDesc'))
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea(text => {
                text.setValue(this.magicSystem.history || '')
                    .onChange(value => this.magicSystem.history = value);
                text.inputEl.rows = 3;
                text.inputEl.style.width = '100%';
            });

        // Buttons
        const buttonsSetting = new Setting(contentEl);

        buttonsSetting.addButton(button => button
            .setButtonText(t('save'))
            .setCta()
            .onClick(async () => {
                if (!this.magicSystem.name) {
                    new Notice(t('magicSystemNameRequired'));
                    return;
                }
                await this.onSubmit(this.magicSystem);
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
                        await this.onDelete(this.magicSystem);
                        this.close();
                    }
                })
            );
        }
    }

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.magicSystems?.length) entityCount += template.entities.magicSystems.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToMagicSystem(template: Template): Promise<void> {
        if (!template.entities.magicSystems || template.entities.magicSystems.length === 0) {
            new Notice('This template does not contain any magic systems');
            return;
        }

        const templateMagic = template.entities.magicSystems[0];
        await this.applyProcessedTemplateToMagicSystem(templateMagic);
    }

    private async applyTemplateToMagicSystemWithVariables(template: Template, variableValues: Record<string, any>): Promise<void> {
        if (!template.entities.magicSystems || template.entities.magicSystems.length === 0) {
            new Notice('This template does not contain any magic systems');
            return;
        }

        // Get the first magic system from the template
        let templateMagic = template.entities.magicSystems[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateMagic,
            variableValues,
            false // non-strict mode
        );
        templateMagic = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            console.warn('[MagicSystemModal] Variable substitution warnings:', substitutionResult.warnings);
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToMagicSystem(templateMagic);
    }

    private async applyProcessedTemplateToMagicSystem(templateMagic: any): Promise<void> {
        const { templateId, yamlContent, markdownContent, sectionContent, customYamlFields, id, filePath, ...rest } = templateMagic as any;

        let fields: any = { ...rest };

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent);
                if (parsed && typeof parsed === 'object') {
                    fields = { ...fields, ...parsed };
                }
                console.log('[MagicSystemModal] Parsed YAML fields:', parsed);
            } catch (error) {
                console.warn('[MagicSystemModal] Failed to parse yamlContent:', error);
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
                if ('Rules' in parsedSections) {
                    fields.rules = parsedSections['Rules'];
                }
                if ('Source' in parsedSections) {
                    fields.source = parsedSections['Source'];
                }
                if ('Costs' in parsedSections) {
                    fields.costs = parsedSections['Costs'];
                }
                if ('Limitations' in parsedSections) {
                    fields.limitations = parsedSections['Limitations'];
                }
                if ('Training' in parsedSections) {
                    fields.training = parsedSections['Training'];
                }
                if ('History' in parsedSections) {
                    fields.history = parsedSections['History'];
                }

                console.log('[MagicSystemModal] Parsed markdown sections:', parsedSections);
            } catch (error) {
                console.warn('[MagicSystemModal] Failed to parse markdownContent:', error);
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                (fields as any)[propName] = content;
            }
        }

        // Apply all fields to the magic system
        Object.assign(this.magicSystem, fields);
        console.log('[MagicSystemModal] Final magic system after template:', this.magicSystem);

        // Clear relationships as they reference template entities
        this.magicSystem.linkedCharacters = [];
        this.magicSystem.linkedLocations = [];
        this.magicSystem.linkedCultures = [];
        this.magicSystem.linkedEvents = [];
        this.magicSystem.linkedItems = [];
        this.magicSystem.groups = [];
        this.magicSystem.connections = [];
    }

    private refresh(): void {
        void this.onOpen();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
