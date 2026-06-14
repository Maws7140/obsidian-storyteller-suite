/**
 * Template Application Modal
 * Collects variable values from users when applying a template
 * Provides type-appropriate inputs and validation
 */

import { App, Notice, Setting, parseYaml } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import {
    ExistingEntityLinkSelections,
    Template,
    TemplateEntities,
    TemplateEntityType,
    TemplateExistingEntityLink,
    TemplateVariable
} from '../templates/TemplateTypes';
import { VariableSubstitution } from '../templates/VariableSubstitution';
import {
    TEMPLATE_ENTITY_TYPES,
    findTemplateEntityType,
    getTemplateEntityLabel,
    getTemplateEntityPluralKey
} from '../templates/TemplateEntityRegistry';

/** An existing vault entity offered as a link target */
interface LinkTargetOption {
    /** Value written into the field (id or name, per the link's valueKind) */
    value: string;
    /** Display label (always the entity name) */
    label: string;
}

export type TemplateVariableValue = string | number | boolean;

export interface TemplateVariableValues {
    [variableName: string]: TemplateVariableValue;
}

type NameableTemplateEntity = {
    templateId: string;
    name?: string;
    yamlContent?: string;
};

export interface EntityFileName {
    templateId: string;
    entityType: TemplateEntityType;
    fileName: string; // The name that will become the filename (without .md extension)
}

export class TemplateApplicationModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private template: Template;
    private onApply: (
        variableValues: TemplateVariableValues,
        entityFileNames: EntityFileName[],
        existingEntityLinkSelections?: ExistingEntityLinkSelections
    ) => void;
    private onCancel?: () => void;
    private variableValues: TemplateVariableValues = {};
    private entityFileNames: EntityFileName[] = [];
    private previewNames: Map<string, string> = new Map(); // templateId -> preview name
    private linkSelections: ExistingEntityLinkSelections = {};
    private didApply = false;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        template: Template,
        onApply: (
            variableValues: TemplateVariableValues,
            entityFileNames: EntityFileName[],
            existingEntityLinkSelections?: ExistingEntityLinkSelections
        ) => void,
        onCancel?: () => void
    ) {
        super(app);
        this.plugin = plugin;
        this.template = template;
        this.onApply = onApply;
        this.onCancel = onCancel;
        
        // Initialize entity file names from template
        this.initializeEntityFileNames();

        // Initialize with default values
        if (this.template.variables) {
            this.template.variables.forEach(variable => {
                if (variable.defaultValue !== undefined && variable.defaultValue !== '') {
                    this.variableValues[variable.name] = variable.defaultValue;
                } else {
                    // Set appropriate empty defaults based on type
                    switch (variable.type) {
                        case 'boolean':
                            this.variableValues[variable.name] = false;
                            break;
                        case 'number':
                            this.variableValues[variable.name] = 0;
                            break;
                        default:
                            this.variableValues[variable.name] = '';
                    }
                }
            });
        }

        this.modalEl.addClass('storyteller-template-application-modal');
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.empty();
        contentEl.addClass('template-application');

        // Header
        this.renderHeader(contentEl);

        // Template info
        this.renderTemplateInfo(contentEl);

        // Variables form
        if (this.template.variables && this.template.variables.length > 0) {
            this.renderVariablesForm(contentEl);
        } else {
            this.renderNoVariablesMessage(contentEl);
        }

        // Entity naming section
        this.renderEntityNamingSection(contentEl);

        // Existing-entity links section (async: loads vault entities)
        this.renderExistingLinksSection(contentEl);

        // Footer
        this.renderFooter(contentEl);
    }

    /**
     * Render the "Linked existing entities" section. Loads candidate vault entities
     * for each link's target type, then renders a selector per link.
     */
    private renderExistingLinksSection(container: HTMLElement): void {
        const links = this.template.existingEntityLinks;
        if (!links || links.length === 0) return;

        const section = container.createDiv('template-application-links');
        section.createEl('h3', { text: 'Linked existing entities' });
        section.createEl('p', {
            text: 'Attach existing entities from your vault to the notes this template creates.',
            cls: 'template-application-instruction'
        });

        const loading = section.createEl('p', { text: 'Loading vault entities…', cls: 'template-application-message' });

        void (async () => {
            // Cache candidates per target type so each type is loaded only once
            const cache = new Map<TemplateEntityType, LinkTargetOption[]>();
            for (const link of links) {
                if (!cache.has(link.targetType)) {
                    cache.set(link.targetType, await this.loadTargetOptions(link.targetType, link.valueKind));
                }
            }
            loading.remove();
            links.forEach(link => this.renderLinkSelector(section, link, cache.get(link.targetType) ?? []));
        })();
    }

    private renderLinkSelector(
        container: HTMLElement,
        link: TemplateExistingEntityLink,
        options: LinkTargetOption[]
    ): void {
        const targetLabel = getTemplateEntityLabel(link.targetType);
        const setting = new Setting(container)
            .setName(link.label || targetLabel)
            .setDesc(`Choose existing ${targetLabel.toLowerCase()}${link.multiple ? '(s)' : ''}`);

        if (link.required) {
            setting.nameEl.createSpan({ text: ' *', cls: 'template-required-indicator' });
        }

        if (options.length === 0) {
            setting.descEl.setText(`No ${targetLabel.toLowerCase()} entities exist in this story yet.`);
            return;
        }

        if (link.multiple) {
            this.renderMultiLinkSelector(setting, container, link, options);
        } else {
            setting.addDropdown(dropdown => {
                dropdown.addOption('', '-- none --');
                options.forEach(option => dropdown.addOption(option.value, option.label));
                const current = this.linkSelections[link.id];
                dropdown.setValue(typeof current === 'string' ? current : '');
                dropdown.onChange(value => {
                    if (value) {
                        this.linkSelections[link.id] = value;
                    } else {
                        delete this.linkSelections[link.id];
                    }
                });
            });
        }
    }

    private renderMultiLinkSelector(
        setting: Setting,
        container: HTMLElement,
        link: TemplateExistingEntityLink,
        options: LinkTargetOption[]
    ): void {
        const chips = container.createDiv('template-link-chips');

        const getSelected = (): string[] => {
            const current = this.linkSelections[link.id];
            return Array.isArray(current) ? current : [];
        };

        const renderChips = (): void => {
            chips.empty();
            const selected = getSelected();
            selected.forEach(value => {
                const option = options.find(o => o.value === value);
                const chip = chips.createSpan({ cls: 'template-link-chip', text: option?.label ?? value });
                const remove = chip.createSpan({ cls: 'template-link-chip-remove', text: ' ✕' });
                remove.addEventListener('click', () => {
                    this.linkSelections[link.id] = getSelected().filter(v => v !== value);
                    if ((this.linkSelections[link.id] as string[]).length === 0) {
                        delete this.linkSelections[link.id];
                    }
                    renderChips();
                });
            });
        };

        setting.addDropdown(dropdown => {
            dropdown.addOption('', '-- add --');
            options.forEach(option => dropdown.addOption(option.value, option.label));
            dropdown.onChange(value => {
                if (!value) return;
                const selected = getSelected();
                if (!selected.includes(value)) {
                    this.linkSelections[link.id] = [...selected, value];
                    renderChips();
                }
                dropdown.setValue('');
            });
        });

        renderChips();
    }

    /**
     * Load existing vault entities of a target type as selectable options.
     * The stored value is the entity ID or name depending on the link's valueKind.
     */
    private async loadTargetOptions(
        targetType: TemplateEntityType,
        valueKind: TemplateExistingEntityLink['valueKind']
    ): Promise<LinkTargetOption[]> {
        const entities = await this.loadEntitiesForType(targetType);
        return entities
            .filter(entity => typeof entity.name === 'string' && entity.name.trim().length > 0)
            .map(entity => {
                const value = valueKind === 'id' ? (entity.id ?? entity.name!) : entity.name!;
                return { value: String(value), label: entity.name! };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    private async loadEntitiesForType(targetType: TemplateEntityType): Promise<Array<{ id?: string; name?: string }>> {
        switch (targetType) {
            case 'character': return this.plugin.listCharacters();
            case 'location': return this.plugin.listLocations();
            case 'event': return this.plugin.listEvents();
            case 'item': return this.plugin.listPlotItems();
            case 'culture': return this.plugin.listCultures();
            case 'magicSystem': return this.plugin.listMagicSystems();
            case 'scene': return this.plugin.listScenes();
            case 'group': {
                const activeStory = this.plugin.getActiveStory();
                return (this.plugin.settings.groups ?? []).filter(g => !activeStory || g.storyId === activeStory.id);
            }
            default: return [];
        }
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('template-application-header');
        header.createEl('h2', { text: `Apply Template: ${this.template.name}` });
        header.createEl('p', {
            text: this.template.description,
            cls: 'template-application-subtitle'
        });
    }

    private renderTemplateInfo(container: HTMLElement): void {
        const infoBox = container.createDiv('template-application-info');

        const entityCount = this.template.entityTypes?.length || 0;
        const variableCount = this.template.variables?.length || 0;

        const stats = infoBox.createDiv('template-application-stats');
        stats.createEl('span', {
            text: `${entityCount} entity type${entityCount !== 1 ? 's' : ''}`,
            cls: 'template-stat'
        });
        stats.createEl('span', {
            text: `${variableCount} variable${variableCount !== 1 ? 's' : ''}`,
            cls: 'template-stat'
        });
        stats.createEl('span', {
            text: this.template.genre,
            cls: 'template-stat'
        });

        if (variableCount > 0) {
            infoBox.createEl('p', {
                text: 'Please fill in the following variables to customize this template:',
                cls: 'template-application-instruction'
            });
        }
    }

    private renderVariablesForm(container: HTMLElement): void {
        const formContainer = container.createDiv('template-application-form');

        this.template.variables!.forEach(variable => {
            this.renderVariableInput(formContainer, variable);
        });
    }

    private renderVariableInput(container: HTMLElement, variable: TemplateVariable): void {
        const variableContainer = container.createDiv('template-variable-input');

        // Create setting for the variable
        const setting = new Setting(variableContainer)
            .setName(variable.label || variable.name)
            .setDesc(variable.description || `Enter value for {{${variable.name}}}`);

        // Add required indicator if no default value
        if (variable.defaultValue === undefined || variable.defaultValue === '') {
            const nameEl = setting.nameEl;
            nameEl.createSpan({ text: ' *', cls: 'template-required-indicator' });
        }

        // Add appropriate input based on type
        switch (variable.type) {
            case 'text':
                setting.addText(text => text
                    .setPlaceholder(variable.defaultValue?.toString() || `Enter ${variable.label || variable.name}`)
                    .setValue(this.variableValues[variable.name]?.toString() || '')
                    .onChange(value => {
                        this.variableValues[variable.name] = value;
                        // Update preview names when variables change
                        this.updatePreviewNames();
                        // Only update the naming section, not the entire modal
                        this.updateEntityNamingSection();
                    })
                );
                break;

            case 'number':
                setting.addText(text => text
                    .setPlaceholder(variable.defaultValue?.toString() || '0')
                    .setValue(this.variableValues[variable.name]?.toString() || '')
                    .onChange(value => {
                        const num = parseFloat(value);
                        this.variableValues[variable.name] = isNaN(num) ? 0 : num;
                        this.updatePreviewNames();
                        this.updateEntityNamingSection();
                    })
                );
                break;

            case 'boolean':
                setting.addToggle(toggle => toggle
                    .setValue(this.variableValues[variable.name] === true)
                    .onChange(value => {
                        this.variableValues[variable.name] = value;
                        // Boolean changes don't typically affect names, but update just in case
                        this.updatePreviewNames();
                        this.updateEntityNamingSection();
                    })
                );
                break;

            case 'select':
                if (variable.options && variable.options.length > 0) {
                    setting.addDropdown(dropdown => {
                        // Add empty option if no default
                        if (!variable.defaultValue) {
                            dropdown.addOption('', '-- select --');
                        }

                        // Add all options
                        variable.options!.forEach(option => {
                            dropdown.addOption(option, option);
                        });

                        dropdown.setValue(this.variableValues[variable.name]?.toString() || '');
                        dropdown.onChange(value => {
                            this.variableValues[variable.name] = value;
                            this.updatePreviewNames();
                            this.updateEntityNamingSection();
                        });
                    });
                } else {
                    // Fallback to text if no options defined
                    setting.addText(text => text
                        .setPlaceholder('No options defined')
                        .setValue(this.variableValues[variable.name]?.toString() || '')
                    .onChange(value => {
                        this.variableValues[variable.name] = value;
                        this.updatePreviewNames();
                        this.updateEntityNamingSection();
                    })
                    );
                }
                break;

            case 'date':
                setting.addText(text => text
                    .setPlaceholder('Yyyy-mm-dd')
                    .setValue(this.variableValues[variable.name]?.toString() || '')
                    .onChange(value => {
                        this.variableValues[variable.name] = value;
                        this.updatePreviewNames();
                        this.updateEntityNamingSection();
                    })
                );
                break;
        }

        // Add example if variable is used somewhere
        if (variable.usedIn && variable.usedIn.length > 0) {
            const exampleText = variableContainer.createDiv('template-variable-example');
            const firstUsage = variable.usedIn[0];
            exampleText.createEl('small', {
                text: `Used in: ${this.getEntityTypeLabel(firstUsage.entityType)} → ${firstUsage.field}`,
                cls: 'template-variable-usage-hint'
            });
        }
    }

    private renderNoVariablesMessage(container: HTMLElement): void {
        const messageBox = container.createDiv('template-application-no-variables');
        messageBox.createEl('p', {
            text: 'This template has no customizable variables. It will be applied with default values.',
            cls: 'template-application-message'
        });
    }

    /**
     * Initialize entity file names from template
     */
    private initializeEntityFileNames(): void {
        this.entityFileNames = [];
        
        // Extract all entities from template
        const entities = this.template.entities;
        TEMPLATE_ENTITY_TYPES.forEach(entityType => {
            const entityArray = this.getTemplateEntities(entities, entityType);
            if (entityArray.length > 0) {
                entityArray.forEach((entity) => {
                    if (entity.templateId) {
                        // Extract name from yamlContent or entity object
                        let previewName = 'Unnamed';
                        if (entity.name) {
                            previewName = entity.name;
                        } else if (entity.yamlContent) {
                            // Try to extract name from YAML
                            previewName = this.extractNameFromYaml(entity.yamlContent) ?? previewName;
                        }
                        this.previewNames.set(entity.templateId, previewName);
                        this.entityFileNames.push({
                            templateId: entity.templateId,
                            entityType: entityType,
                            fileName: previewName
                        });
                    }
                });
            }
        });
    }

    /**
     * Update preview names when variables change
     */
    private updatePreviewNames(): void {
        // Substitute variables in template entities to get updated names
        const entities = this.template.entities;
        TEMPLATE_ENTITY_TYPES.forEach(entityType => {
            const entityArray = this.getTemplateEntities(entities, entityType);
            if (entityArray.length > 0) {
                entityArray.forEach((entity) => {
                    if (entity.templateId) {
                        let previewName = 'Unnamed';
                        
                        // Try to get name from yamlContent with variable substitution
                        if (entity.yamlContent) {
                            const substituted = VariableSubstitution.substituteString(
                                entity.yamlContent,
                                this.variableValues,
                                false
                            );
                            try {
                                previewName = this.extractNameFromYaml(substituted.value) ?? previewName;
                            } catch {
                                // Ignore parse errors, try to find name: in string
                                const nameMatch = substituted.value.match(/^name:\s*(.+)$/m);
                                if (nameMatch) {
                                    previewName = nameMatch[1].trim().replace(/^["']|["']$/g, '');
                                }
                            }
                        } else if (entity.name) {
                            // Use direct substitution on name field
                            const substituted = VariableSubstitution.substituteString(
                                entity.name,
                                this.variableValues,
                                false
                            );
                            previewName = substituted.value || 'Unnamed';
                        }
                        
                        this.previewNames.set(entity.templateId, previewName);
                        
                    }
                });
            }
        });
    }

    private entityNamingContainer: HTMLElement | null = null;

    /**
     * Render entity naming section - asks user to choose file names
     */
    private renderEntityNamingSection(container: HTMLElement): void {
        // Store container reference for updates
        this.entityNamingContainer = container.createDiv('template-application-entity-naming');
        this.updateEntityNamingSection();
    }

    /**
     * Update entity naming section with current preview names
     */
    private updateEntityNamingSection(): void {
        if (!this.entityNamingContainer) return;

        // Clear and rebuild
        this.entityNamingContainer.empty();
        
        if (this.entityFileNames.length === 0) {
            return;
        }

        this.entityNamingContainer.createEl('h3', { text: 'Choose file names' });
        this.entityNamingContainer.createEl('p', {
            text: 'Enter the file name for each entity note that will be created. This will be the name of the markdown file (without .md extension).',
            cls: 'template-application-instruction'
        });

        // Update preview names based on current variable values
        this.updatePreviewNames();

        // Render input for each entity
        this.entityFileNames.forEach((entityInfo, index) => {
            const entityContainer = this.entityNamingContainer!.createDiv('template-entity-naming-item');
            const entityTypeLabel = this.getEntityTypeLabel(entityInfo.entityType);
            const previewName = this.previewNames.get(entityInfo.templateId) || 'Unnamed';
            
            // If file name hasn't been manually set, update it from preview
            const originalName = this.previewNames.get(entityInfo.templateId + '_original');
            if (!originalName || entityInfo.fileName === originalName || entityInfo.fileName === 'Unnamed') {
                entityInfo.fileName = previewName;
            }

            // File name input (this becomes the entity name and filename)
            new Setting(entityContainer)
                .setName(`${entityTypeLabel} File Name`)
                .setDesc(`File name for the ${entityTypeLabel.toLowerCase()} note (e.g., "${previewName}.md")`)
                .addText(text => text
                    .setPlaceholder(previewName)
                    .setValue(entityInfo.fileName)
                    .onChange(value => {
                        entityInfo.fileName = value || previewName;
                        // Mark as manually changed
                        this.previewNames.set(entityInfo.templateId + '_original', value || previewName);
                    })
                );
        });
    }

    /**
     * Get plural form of entity type
     */
    private getEntityTypePlural(entityType: TemplateEntityType): string {
        return getTemplateEntityPluralKey(entityType);
    }

    private getTemplateEntities(entities: TemplateEntities, entityType: TemplateEntityType): NameableTemplateEntity[] {
        const pluralKey = this.getEntityTypePlural(entityType) as keyof TemplateEntities;
        const entityArray = entities[pluralKey];
        return Array.isArray(entityArray) ? entityArray as NameableTemplateEntity[] : [];
    }

    private extractNameFromYaml(yamlContent: string): string | undefined {
        const parsed: unknown = parseYaml(yamlContent);
        if (!parsed || typeof parsed !== 'object' || !('name' in parsed)) {
            return undefined;
        }
        const name = (parsed as { name?: unknown }).name;
        return typeof name === 'string' && name.trim() ? name : undefined;
    }

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('template-application-footer');

        const cancelBtn = footer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const applyBtn = footer.createEl('button', {
            text: 'Apply template',
            cls: 'mod-cta'
        });
        applyBtn.addEventListener('click', () => this.handleApply());
    }

    private handleApply(): void {
        // Mark that apply was triggered (prevents onCancel from firing in onClose)
        this.didApply = true;

        // Validate all required variables are filled
        if (this.template.variables) {
            const validationErrors: string[] = [];

            this.template.variables.forEach(variable => {
                const value = this.variableValues[variable.name];

                // Check if required (no default value) and empty
                if ((variable.defaultValue === undefined || variable.defaultValue === '') &&
                    (value === undefined || value === '' || value === null)) {
                    validationErrors.push(`${variable.label || variable.name} is required`);
                }

                // Validate date format
                if (variable.type === 'date' && value && value !== '') {
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!dateRegex.test(String(value))) {
                        validationErrors.push(`${variable.label || variable.name} must be in YYYY-MM-DD format`);
                    }
                }

                // Validate number type
                if (variable.type === 'number' && value !== undefined && value !== '') {
                    if (isNaN(parseFloat(String(value)))) {
                        validationErrors.push(`${variable.label || variable.name} must be a valid number`);
                    }
                }

                // Validate select has valid option
                if (variable.type === 'select' && variable.options && variable.options.length > 0) {
                    if (value && !variable.options.includes(String(value))) {
                        validationErrors.push(`${variable.label || variable.name} must be one of the available options`);
                    }
                }
            });

            // Show errors if any
            if (validationErrors.length > 0) {
                new Notice(`Please fix the following errors:\n${validationErrors.join('\n')}`);
                return;
            }
        }

        // Validate entity file names
        const nameErrors: string[] = [];
        this.entityFileNames.forEach(entityInfo => {
            if (!entityInfo.fileName || entityInfo.fileName.trim() === '') {
                nameErrors.push(`${this.getEntityTypeLabel(entityInfo.entityType)} file name is required`);
            }
            // Validate filename doesn't contain invalid characters
            const invalidChars = /[\\/:"*?<>|#^[\]]+/g;
            if (invalidChars.test(entityInfo.fileName)) {
                nameErrors.push(`${this.getEntityTypeLabel(entityInfo.entityType)} file name contains invalid characters`);
            }
        });

        if (nameErrors.length > 0) {
            new Notice(`Please fix the following errors:\n${nameErrors.join('\n')}`);
            return;
        }

        // Validate required existing-entity links
        const linkErrors: string[] = [];
        (this.template.existingEntityLinks ?? []).forEach(link => {
            if (!link.required) return;
            const selection = this.linkSelections[link.id];
            const hasValue = Array.isArray(selection) ? selection.length > 0 : Boolean(selection);
            if (!hasValue) {
                linkErrors.push(`${link.label || getTemplateEntityLabel(link.targetType)} is required`);
            }
        });

        if (linkErrors.length > 0) {
            new Notice(`Please fix the following errors:\n${linkErrors.join('\n')}`);
            return;
        }

        // All validation passed, call the callback
        this.onApply(this.variableValues, this.entityFileNames, this.linkSelections);
        new Notice(`Applying template "${this.template.name}"...`);
        this.close();
    }

    private getEntityTypeLabel(entityType: string): string {
        const templateEntityType = findTemplateEntityType(entityType);
        return templateEntityType ? getTemplateEntityLabel(templateEntityType) : entityType;
    }

    onClose(): void {
        this.contentEl.empty();
        // If the modal was closed without applying, invoke onCancel
        if (!this.didApply && this.onCancel) {
            this.onCancel();
        }
    }
}
