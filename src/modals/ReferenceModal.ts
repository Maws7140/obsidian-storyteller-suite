 
import { App, Notice, Setting, TextAreaComponent, parseYaml } from 'obsidian';
import { t } from '../i18n/strings';
import StorytellerSuitePlugin from '../main';
import { Reference } from '../types';
import { addImageSelectionButtons } from '../utils/ImageSelectionHelper';
import { parseSectionsFromMarkdown } from '../yaml/EntitySections';
import { TemplatePickerModal } from './TemplatePickerModal';
import type { Template, TemplateEntity, TemplateVariableValue } from '../templates/TemplateTypes';
import { EntityCustomFieldsEditor } from './entity/EntityCustomFieldsEditor';
import { ResponsiveModal } from './ResponsiveModal';
import { confirmWithModal } from './ui/ConfirmModal';

export type ReferenceModalSubmitCallback = (ref: Reference) => Promise<void>;
export type ReferenceModalDeleteCallback = (ref: Reference) => Promise<void>;

type ReferenceWithCustomFields = Reference & {
    customFields?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ReferenceModal extends ResponsiveModal {
    plugin: StorytellerSuitePlugin;
    refData: Reference;
    onSubmit: ReferenceModalSubmitCallback;
    onDelete?: ReferenceModalDeleteCallback;
    isNew: boolean;
    private readonly customFieldsEditor: EntityCustomFieldsEditor;

    constructor(app: App, plugin: StorytellerSuitePlugin, ref: Reference | null, onSubmit: ReferenceModalSubmitCallback, onDelete?: ReferenceModalDeleteCallback) {
        super(app);
        this.plugin = plugin;
        this.isNew = ref == null;
        this.refData = ref ? { ...ref } : { name: '', category: 'Misc', tags: [] };
        if (!this.refData.tags) this.refData.tags = [];
        const referenceFields = this.refData as ReferenceWithCustomFields;
        this.customFieldsEditor = new EntityCustomFieldsEditor(this.app, 'reference', referenceFields.customFields || {});
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;
        this.modalEl.addClass('storyteller-reference-modal');
    }

    onOpen(): void { void (async () => {
        super.onOpen();
        const { contentEl, footerEl } = this.createStructuredModalLayout();
        contentEl.createEl('h2', { text: this.isNew ? t('createReference') : `${t('editReference')} ${this.refData.name}` });

        // Auto-apply default template for new references
        if (this.isNew && !this.refData.name) {
            const defaultTemplateId = this.plugin.settings.defaultTemplates?.['reference'];
            if (defaultTemplateId) {
                const defaultTemplate = this.plugin.templateManager?.getTemplate(defaultTemplateId);
                if (defaultTemplate) {
                    // If template has variables or multiple entities, use TemplateApplicationModal
                    if ((defaultTemplate.variables && defaultTemplate.variables.length > 0) ||
                        this.hasMultipleEntities(defaultTemplate)) {
                        const { TemplateApplicationModal } = await import('./TemplateApplicationModal');
                        await new Promise<void>((resolve) => {
                            new TemplateApplicationModal(
                                this.app,
                                this.plugin,
                                defaultTemplate,
                                (variableValues, entityFileNames) => { void (async () => {
                                    try {
                                        await this.applyTemplateToReferenceWithVariables(defaultTemplate, variableValues);
                                        new Notice('Default template applied');
                                    } catch (error) {
                                        
                                        new Notice('Error applying default template');
                                    } finally {
                                        resolve();
                                        this.refresh();
                                    }
                                })(); }
                            ).open();
                        });
                    } else {
                        // No variables, apply directly
                        try {
                            await this.applyTemplateToReference(defaultTemplate);
                            new Notice('Default template applied');
                        } catch (error) {
                            
                            new Notice('Error applying default template');
                        }
                    }
                }
            }
        }

        // --- Template Selector (for new references) ---
        if (this.isNew) {
            new Setting(contentEl)
                .setName('Start from template')
                .setDesc('Optionally start with a pre-configured reference template')
                .addButton(button => button
                    .setButtonText('Choose template')
                    .setTooltip('Select a reference template')
                    .onClick(() => {
                        new TemplatePickerModal(
                            this.app,
                            this.plugin,
                            (template: Template) => { void (async () => {
                                // Check if template has variables or multiple entities
                                if ((template.variables && template.variables.length > 0) ||
                                    this.hasMultipleEntities(template)) {
                                    // Use TemplateApplicationModal for variable collection
                                    await new Promise<void>((resolve) => {
                                        void import('./TemplateApplicationModal').then(({ TemplateApplicationModal }) => {
                                            new TemplateApplicationModal(
                                                this.app,
                                                this.plugin,
                                                template,
                                                (variableValues, entityFileNames) => { void (async () => {
                                                    try {
                                                        await this.applyTemplateToReferenceWithVariables(template, variableValues);
                                                        new Notice(`Template "${template.name}" applied`);
                                                        this.refresh();
                                                    } catch (error) {
                                                        
                                                        new Notice('Error applying template');
                                                    }
                                                    resolve();
                                                })(); }
                                            ).open();
                                        });
                                    });
                                } else {
                                    // No variables, apply directly
                                    await this.applyTemplateToReference(template);
                                    this.refresh();
                                    new Notice(`Template "${template.name}" applied`);
                                }
                            })(); },
                            'reference'
                        ).open();
                    })
                );
        }

        new Setting(contentEl)
            .setName(t('name'))
            .addText(text => text
                .setPlaceholder(t('title'))
                .setValue(this.refData.name || '')
                .onChange(v => this.refData.name = v)
            );

        new Setting(contentEl)
            .setName(t('category') || 'Category')
            .addText(text => text
                .setPlaceholder(t('categoryPh'))
                .setValue(this.refData.category || '')
                .onChange(v => this.refData.category = v || undefined)
            );

        new Setting(contentEl)
            .setName(t('tags') || 'Tags')
            .setDesc(t('traitsPlaceholder'))
            .addText(text => text
                .setPlaceholder(t('tagsPh'))
                .setValue((this.refData.tags || []).join(', '))
                .onChange(v => {
                    const arr = v.split(',').map(s => s.trim()).filter(Boolean);
                    this.refData.tags = arr.length ? arr : undefined;
                })
            );

        let imageDescEl: HTMLElement | null = null;
        const profileImageSetting = new Setting(contentEl)
            .setName(t('profileImage'))
            .then(s => {
                imageDescEl = s.descEl.createEl('small', { text: t('currentValue', this.refData.profileImagePath || t('none')) });
                s.descEl.addClass('storyteller-modal-setting-vertical');
            });
        
        // Add image selection buttons (Gallery, Upload, Vault, Clear)
        addImageSelectionButtons(
            profileImageSetting,
            this.app,
            this.plugin,
            {
                currentPath: this.refData.profileImagePath,
                onSelect: (path) => {
                    this.refData.profileImagePath = path;
                },
                descriptionEl: imageDescEl || undefined
            }
        );

        new Setting(contentEl)
            .setName(t('content') || 'Content')
            .setClass('storyteller-modal-setting-vertical')
            .addTextArea((ta: TextAreaComponent) => {
                ta.setPlaceholder(t('content'))
                  .setValue(this.refData.content || '')
                  .onChange(v => this.refData.content = v || undefined);
                ta.inputEl.rows = 12;
            });

        // Custom fields (add only)
        this.customFieldsEditor.setFields((this.refData as ReferenceWithCustomFields).customFields || {});
        this.customFieldsEditor.renderSection(contentEl);

        if (!this.isNew && this.onDelete) {
            this.createFooterButton(footerEl, t('delete'), async () => {
                if (await confirmWithModal(this.app, {
                    title: t('confirm') || 'Confirm',
                    body: t('confirmDeleteReference', this.refData.name),
                    confirmText: t('delete') || 'Delete',
                })) {
                    await this.onDelete!(this.refData);
                    this.close();
                }
            }, { warning: true });
        }
        footerEl.createDiv({ cls: 'storyteller-modal-button-spacer' });
        this.createFooterButton(footerEl, t('cancel'), () => this.close());
        this.createFooterButton(footerEl, this.isNew ? t('createReferenceBtn') : t('saveChanges'), async () => {
            if (!this.refData.name || !this.refData.name.trim()) {
                new Notice(t('title'));
                return;
            }
            this.refData.content = this.refData.content || '';
            const customFields = this.customFieldsEditor.getFields();
            if (!customFields) {
                return;
            }
            (this.refData as ReferenceWithCustomFields).customFields = customFields;
            await this.onSubmit(this.refData);
            this.close();
        }, { cta: true });
    })(); }

    private hasMultipleEntities(template: Template): boolean {
        let entityCount = 0;
        if (template.entities.references?.length) entityCount += template.entities.references.length;
        if (template.entities.characters?.length) entityCount += template.entities.characters.length;
        if (template.entities.locations?.length) entityCount += template.entities.locations.length;
        if (template.entities.events?.length) entityCount += template.entities.events.length;
        if (template.entities.items?.length) entityCount += template.entities.items.length;
        if (template.entities.groups?.length) entityCount += template.entities.groups.length;
        return entityCount > 1;
    }

    private async applyTemplateToReference(template: Template): Promise<void> {
        if (!template.entities.references || template.entities.references.length === 0) {
            new Notice('This template does not contain any references');
            return;
        }

        const templateRef = template.entities.references[0];
        await this.applyProcessedTemplateToReference(templateRef);
    }

    private async applyTemplateToReferenceWithVariables(template: Template, variableValues: Record<string, TemplateVariableValue>): Promise<void> {
        if (!template.entities.references || template.entities.references.length === 0) {
            new Notice('This template does not contain any references');
            return;
        }

        // Get the first reference from the template
        let templateRef = template.entities.references[0];

        // Substitute variables with user-provided values
        const { VariableSubstitution } = await import('../templates/VariableSubstitution');
        const substitutionResult = VariableSubstitution.substituteEntity(
            templateRef,
            variableValues,
            false // non-strict mode
        );
        templateRef = substitutionResult.value;

        if (substitutionResult.warnings.length > 0) {
            
        }

        // Apply the substituted template
        await this.applyProcessedTemplateToReference(templateRef);
    }

    private async applyProcessedTemplateToReference(templateRef: TemplateEntity<Reference>): Promise<void> {
        const { yamlContent, markdownContent, sectionContent, customYamlFields } = templateRef;

        let fields: Record<string, unknown> = { ...templateRef };
        delete fields.templateId;
        delete fields.yamlContent;
        delete fields.markdownContent;
        delete fields.sectionContent;
        delete fields.customYamlFields;
        delete fields.id;
        delete fields.filePath;
        let allTemplateSections: Record<string, string> = {};

        // Handle new format: yamlContent (parse YAML string)
        if (yamlContent && typeof yamlContent === 'string') {
            try {
                const parsed = parseYaml(yamlContent) as unknown;
                if (isRecord(parsed)) {
                    fields = { ...fields, ...parsed };
                }
                
            } catch (error) {
                
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

                // Map well-known section names to entity property names
                const sectionToFieldMap: Record<string, string> = {
                    'Content': 'content',
                    'Description': 'description',
                    'Notes': 'notes',
                    'Background': 'background',
                    'History': 'history',
                    'Appearance': 'appearance',
                    'Personality': 'personality',
                    'Relationships': 'relationships',
                    'Abilities': 'abilities',
                    'Goals': 'goals',
                    'Motivations': 'motivations',
                    'Secrets': 'secrets',
                    'Quotes': 'quotes',
                    'Trivia': 'trivia',
                    'Geography': 'geography',
                    'Culture': 'culture',
                    'Economy': 'economy',
                    'Government': 'government',
                    'Demographics': 'demographics',
                    'Climate': 'climate',
                    'Flora': 'flora',
                    'Fauna': 'fauna',
                    'Resources': 'resources',
                    'Landmarks': 'landmarks',
                    'Events': 'events',
                    'Factions': 'factions',
                    'Conflicts': 'conflicts',
                    'Timeline': 'timeline',
                    'Summary': 'summary',
                };

                // Initialize customFields to collect unmapped sections
                const customFields: Record<string, string> = {};

                // Loop over all parsed sections
                for (const [sectionName, sectionContent] of Object.entries(parsedSections)) {
                    if (sectionName in sectionToFieldMap) {
                        // Map known section to its entity property
                        fields[sectionToFieldMap[sectionName]] = sectionContent;
                    } else {
                        // Collect unmapped sections into customFields
                        customFields[sectionName] = sectionContent;
                    }
                }

                // Merge customFields into fields if there are any unmapped sections
                if (Object.keys(customFields).length > 0) {
                    const existingCustomFields =
                        isRecord(fields.customFields)
                            ? fields.customFields
                            : {};
                    fields.customFields = { ...existingCustomFields, ...customFields };
                }

                
            } catch (error) {
                
            }
        } else if (sectionContent) {
            // Old format: apply section content
            for (const [k, v] of Object.entries(sectionContent)) { allTemplateSections[k] = v; }
            for (const [sectionName, content] of Object.entries(sectionContent)) {
                const propName = sectionName.toLowerCase().replace(/\s+/g, '');
                fields[propName] = content;
            }
        }

        // Apply all fields to the reference
        Object.assign(this.refData, fields);
        if (Object.keys(allTemplateSections).length > 0) {
            Object.defineProperty(this.refData, '_templateSections', {
                value: allTemplateSections,
                enumerable: false,
                writable: true,
                configurable: true
            });
        }
        
    }

    private refresh(): void {
        void this.onOpen();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}


