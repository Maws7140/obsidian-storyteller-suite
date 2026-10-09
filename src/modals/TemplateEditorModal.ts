/**
 * Template Editor Modal
 * Full-featured editor for creating and editing templates from scratch
 * Allows defining YAML fields, section content, custom fields, and variables
 */

import { App, Notice, Setting, setIcon } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import {
    Template,
    TemplateGenre,
    TemplateCategory,
    TemplateEntityType,
    TemplateEntity,
    TemplateExistingEntityLink,
    TemplateVariable
} from '../templates/TemplateTypes';
import { TemplateEntityDetailModal } from './TemplateEntityDetailModal';
import { TemplateVariableEditorModal } from './TemplateVariableEditorModal';
import {
    parseBulkVariables,
    serializeVariables,
    BulkParseResult
} from '../templates/VariableBulkParser';
import { getEntityNotePreview } from '../utils/TemplatePreviewRenderer';
import {
    TEMPLATE_ENTITY_TYPES,
    getTemplateEntityLabel,
    getTemplateEntityPluralKey
} from '../templates/TemplateEntityRegistry';
import {
    TEMPLATE_LINK_SOURCE_TYPES,
    getLinkFieldsForSourceType,
    getLinkFieldDefinition
} from '../templates/TemplateLinkFields';

type TemplateEntityCollectionKey = keyof Template['entities'];
type EditableTemplateEntity = TemplateEntity<Record<string, unknown>> & {
    name?: string;
    description?: string;
};

export class TemplateEditorModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private template: Template;
    private isNewTemplate: boolean;
    private onSave: (template: Template) => void;

    // Current editing state
    private currentTab: 'metadata' | 'entities' | 'links' | 'variables' | 'preview' = 'metadata';
    private selectedEntityType: TemplateEntityType | null = null;
    private selectedEntityIndex: number = -1;
    private tabsHostEl: HTMLElement | null = null;
    private contentAreaEl: HTMLElement | null = null;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        template: Template | null,
        onSave: (template: Template) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
        this.isNewTemplate = template === null;

        // Initialize template
        this.template = template || this.createEmptyTemplate();

        this.modalEl.addClass('storyteller-template-editor-modal');
    }

    /**
     * Create an empty template with defaults
     */
    private createEmptyTemplate(): Template {
        return {
            id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            name: 'New Template',
            description: '',
            genre: 'fantasy',
            category: 'single-entity',
            version: '1.0.0',
            author: 'User',
            isBuiltIn: false,
            isEditable: true,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            tags: [],
            entities: {},
            entityTypes: [],
            usageCount: 0,
            quickApplyEnabled: true,
            variables: []
        };
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.empty();
        contentEl.addClass('storyteller-template-editor');

        // Header
        this.renderHeader(contentEl);

        // Tab navigation
        this.tabsHostEl = contentEl.createDiv('template-editor-tabs-host');
        this.renderTabs(this.tabsHostEl);

        // Content area
        this.contentAreaEl = contentEl.createDiv('template-editor-content');
        this.renderCurrentTab(this.contentAreaEl);

        // Footer with actions
        this.renderFooter(contentEl);
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('template-editor-header');
        header.createEl('h2', {
            text: this.isNewTemplate ? 'Create New Template' : `Edit Template: ${this.template.name}`
        });

        if (!this.template.isEditable) {
            const warning = header.createDiv('template-editor-warning');
            warning.createEl('span', { text: '⚠️ this is a built-in template and cannot be edited. You can duplicate it to create an editable version.' });
        }
    }

    private renderTabs(container: HTMLElement): void {
        const tabContainer = container.createDiv('template-editor-tabs');

        const tabs: Array<{ id: 'metadata' | 'entities' | 'links' | 'variables' | 'preview', label: string, icon: string }> = [
            { id: 'metadata', label: 'Metadata', icon: 'clipboard-list' },
            { id: 'entities', label: 'Entities', icon: 'users' },
            { id: 'links', label: 'Links', icon: 'link' },
            { id: 'variables', label: 'Variables', icon: 'settings-2' },
            { id: 'preview', label: 'Preview', icon: 'eye' }
        ];

        tabs.forEach(tab => {
            const tabBtn = tabContainer.createEl('button', {
                cls: 'template-editor-tab'
            });
            const tabIcon = tabBtn.createSpan('template-editor-tab-icon');
            setIcon(tabIcon, tab.icon);
            tabBtn.createSpan().setText(tab.label);

            if (this.currentTab === tab.id) {
                tabBtn.addClass('active');
            }

            tabBtn.onclick = () => {
                this.currentTab = tab.id;
                this.refreshTabs();
                this.refreshCurrentTab();
            };
        });
    }

    private refreshTabs(): void {
        if (!this.tabsHostEl) {
            return;
        }

        this.tabsHostEl.empty();
        this.renderTabs(this.tabsHostEl);
    }

    private refreshCurrentTab(): void {
        if (!this.contentAreaEl) {
            return;
        }

        this.renderCurrentTab(this.contentAreaEl);
    }

    private renderCurrentTab(container: HTMLElement): void {
        container.empty();

        switch (this.currentTab) {
            case 'metadata':
                this.renderMetadataTab(container);
                break;
            case 'entities':
                this.renderEntitiesTab(container);
                break;
            case 'links':
                this.renderLinksTab(container);
                break;
            case 'variables':
                this.renderVariablesTab(container);
                break;
            case 'preview':
                this.renderPreviewTab(container);
                break;
        }
    }

    // ==================== METADATA TAB ====================

    private renderMetadataTab(container: HTMLElement): void {
        const section = container.createDiv('template-editor-section');

        // Template Name
        new Setting(section)
            .setName('Template name')
            .setDesc('A descriptive name for this template')
            .addText(text => text
                .setPlaceholder('Enter template name')
                .setValue(this.template.name)
                .onChange(value => {
                    this.template.name = value;
                    this.template.modified = new Date().toISOString();
                })
            );

        // Description
        new Setting(section)
            .setName('Description')
            .setDesc('Describe what this template provides and when to use it')
            .addTextArea(text => {
                text
                    .setPlaceholder('Enter description')
                    .setValue(this.template.description)
                    .onChange(value => {
                        this.template.description = value;
                        this.template.modified = new Date().toISOString();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
            });

        // Genre
        new Setting(section)
            .setName('Genre')
            .setDesc('Genre classification for this template')
            .addDropdown(dropdown => dropdown
                .addOption('fantasy', 'Fantasy')
                .addOption('scifi', 'Sci-fi')
                .addOption('mystery', 'Mystery')
                .addOption('horror', 'Horror')
                .addOption('romance', 'Romance')
                .addOption('historical', 'Historical')
                .addOption('western', 'Western')
                .addOption('thriller', 'Thriller')
                .addOption('custom', 'Custom')
                .setValue(this.template.genre)
                .onChange(value => {
                    this.template.genre = value as TemplateGenre;
                    this.template.modified = new Date().toISOString();
                })
            );

        // Category
        new Setting(section)
            .setName('Category')
            .setDesc('Template scope and complexity')
            .addDropdown(dropdown => dropdown
                .addOption('single-entity', 'Single entity - one character, location, or item')
                .addOption('entity-set', 'Entity set - collection of related entities')
                .addOption('full-world', 'Full world - complete story world with all entity types')
                .setValue(this.template.category)
                .onChange(value => {
                    this.template.category = value as TemplateCategory;
                    this.template.modified = new Date().toISOString();
                })
            );

        // Tags
        new Setting(section)
            .setName('Tags')
            .setDesc('Comma-separated tags for searching (e.g., king, ruler, noble)')
            .addText(text => text
                .setPlaceholder('Tag1, tag2, tag3')
                .setValue(this.template.tags.join(', '))
                .onChange(value => {
                    this.template.tags = value
                        .split(',')
                        .map(tag => tag.trim())
                        .filter(tag => tag.length > 0);
                    this.template.modified = new Date().toISOString();
                })
            );

        // Version
        new Setting(section)
            .setName('Version')
            .setDesc('Template version (semantic versioning)')
            .addText(text => text
                .setPlaceholder('1.0.0')
                .setValue(this.template.version)
                .onChange(value => {
                    this.template.version = value;
                    this.template.modified = new Date().toISOString();
                })
            );

        // Quick Apply
        new Setting(section)
            .setName('Enable quick apply')
            .setDesc('Show this template in quick-apply menus')
            .addToggle(toggle => toggle
                .setValue(this.template.quickApplyEnabled || false)
                .onChange(value => {
                    this.template.quickApplyEnabled = value;
                    this.template.modified = new Date().toISOString();
                })
            );
    }

    // ==================== ENTITIES TAB ====================

    private renderEntitiesTab(container: HTMLElement): void {
        const section = container.createDiv('template-editor-section');

        section.createEl('h3', { text: 'Entities in template' });
        section.createEl('p', {
            text: 'Add and configure entities that will be created when this template is applied.',
            cls: 'setting-item-description'
        });

        // Entity type selector and add button
        let selectedType: TemplateEntityType = 'character';

        // Use Obsidian's Setting class for proper dropdown styling
        const setting = new Setting(section)
            .setName('Add new entity')
            .setDesc('Select the type of entity to add to this template');

        setting.addDropdown(dropdown => {
            TEMPLATE_ENTITY_TYPES.forEach(type => {
                dropdown.addOption(type, this.getEntityTypeLabel(type));
            });
            dropdown.setValue(selectedType);
            dropdown.onChange(value => {
                selectedType = value as TemplateEntityType;
            });
        });

        setting.addButton(button => {
            button
                .setButtonText('Add entity')
                .setCta()
                .onClick(() => {
                    this.addEntity(selectedType);
                    this.refreshCurrentTab();
                });
        });

        // List existing entities
        const entitiesList = section.createDiv('template-entities-list');
        this.renderEntitiesList(entitiesList);
    }

    private renderEntitiesList(container: HTMLElement): void {
        const hasEntities = this.template.entityTypes && this.template.entityTypes.length > 0;

        if (!hasEntities) {
            container.createEl('p', {
                text: 'No entities added yet. Add your first entity above.',
                cls: 'template-empty-state'
            });
            return;
        }

        // Group entities by type
        TEMPLATE_ENTITY_TYPES.forEach(entityType => {
            const entities = this.getEditableEntities(entityType);

            if (!entities || entities.length === 0) return;

            const typeSection = container.createDiv('template-entity-type-section');
            typeSection.createEl('h4', { text: this.getEntityTypeLabel(entityType) });

            entities.forEach((entity, index: number) => {
                this.renderEntityCard(typeSection, entity, entityType, index);
            });
        });
    }

    private renderEntityCard(
        container: HTMLElement,
        entity: EditableTemplateEntity,
        entityType: TemplateEntityType,
        index: number
    ): void {
        const card = container.createDiv('template-entity-card');

        // Header with name and actions
        const header = card.createDiv('template-entity-card-header');

        header.createEl('span', {
            text: entity.name || `${this.getEntityTypeLabel(entityType)} ${index + 1}`,
            cls: 'template-entity-name'
        });

        const actions = header.createDiv('template-entity-actions');

        const editBtn = actions.createEl('button', { cls: 'template-entity-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.createSpan().setText('Edit');
        editBtn.addEventListener('click', () => {
            this.editEntity(entityType, index);
        });

        const deleteBtn = actions.createEl('button', { cls: 'template-entity-btn-danger' });
        setIcon(deleteBtn, 'trash');
        deleteBtn.createSpan().setText('Delete');
        deleteBtn.addEventListener('click', () => {
            this.deleteEntity(entityType, index);
        });

        // Show preview of key fields
        const preview = card.createDiv('template-entity-preview');
        if (typeof entity.description === 'string') {
            preview.createEl('p', {
                text: entity.description.substring(0, 100) + (entity.description.length > 100 ? '...' : ''),
                cls: 'template-entity-description'
            });
        }

        // Show field count
        const fieldCount = Object.keys(entity).filter(k => k !== 'templateId').length;
        preview.createEl('small', {
            text: `${fieldCount} fields defined`,
            cls: 'template-entity-meta'
        });
    }

    // ==================== LINKS TAB ====================

    /** All template entities whose type supports existing-entity links */
    private getLinkSourceEntities(): Array<{ templateId: string; type: TemplateEntityType; name: string }> {
        const sources: Array<{ templateId: string; type: TemplateEntityType; name: string }> = [];
        TEMPLATE_LINK_SOURCE_TYPES.forEach(type => {
            const entities = this.getEditableEntities(type);
            entities?.forEach((entity, index) => {
                if (!entity.templateId) return;
                sources.push({
                    templateId: entity.templateId,
                    type,
                    name: entity.name || `${this.getEntityTypeLabel(type)} ${index + 1}`
                });
            });
        });
        return sources;
    }

    private renderLinksTab(container: HTMLElement): void {
        const section = container.createDiv('template-editor-section');

        section.createEl('h3', { text: 'Existing entity links' });
        section.createEl('p', {
            text: 'Prompt the user to attach existing vault entities (a location, magic system, group, etc.) to the notes this template creates. No new entities are created from these links.',
            cls: 'setting-item-description'
        });

        const sources = this.getLinkSourceEntities();
        if (sources.length === 0) {
            section.createEl('p', {
                text: 'Add a character, item, event, scene, or magic system entity first — those types can link to existing entities.',
                cls: 'template-empty-state'
            });
            return;
        }

        const addButton = section.createEl('button', { text: '+ add link', cls: 'mod-cta' });
        addButton.addEventListener('click', () => {
            this.addLink(sources[0]);
            this.refreshCurrentTab();
        });

        const list = section.createDiv('template-links-list');
        const links = this.template.existingEntityLinks ?? [];
        if (links.length === 0) {
            list.createEl('p', { text: 'No links defined yet.', cls: 'template-empty-state' });
            return;
        }

        links.forEach((link, index) => this.renderLinkCard(list, link, index, sources));
    }

    private addLink(source: { templateId: string; type: TemplateEntityType }): void {
        const fields = getLinkFieldsForSourceType(source.type);
        const field = fields[0];
        if (!field) return;

        if (!this.template.existingEntityLinks) {
            this.template.existingEntityLinks = [];
        }
        this.template.existingEntityLinks.push({
            id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sourceTemplateId: source.templateId,
            sourceType: source.type,
            targetType: field.targetType,
            targetField: field.field,
            label: field.label,
            required: false,
            multiple: field.multiple,
            valueKind: field.valueKind
        });
        this.template.modified = new Date().toISOString();
    }

    private applyLinkFieldDefinition(link: TemplateExistingEntityLink, field: string): void {
        const definition = getLinkFieldDefinition(link.sourceType, field);
        if (!definition) return;
        link.targetField = definition.field;
        link.targetType = definition.targetType;
        link.multiple = definition.multiple;
        link.valueKind = definition.valueKind;
    }

    private renderLinkCard(
        container: HTMLElement,
        link: TemplateExistingEntityLink,
        index: number,
        sources: Array<{ templateId: string; type: TemplateEntityType; name: string }>
    ): void {
        const card = container.createDiv('template-link-card');

        // Source entity
        new Setting(card)
            .setName('Source entity')
            .setDesc('The entity this template creates that receives the link')
            .addDropdown(dropdown => {
                sources.forEach(source => {
                    dropdown.addOption(source.templateId, `${source.name} (${this.getEntityTypeLabel(source.type)})`);
                });
                dropdown.setValue(link.sourceTemplateId);
                dropdown.onChange(value => {
                    const source = sources.find(s => s.templateId === value);
                    if (!source) return;
                    link.sourceTemplateId = source.templateId;
                    if (source.type !== link.sourceType) {
                        link.sourceType = source.type;
                        // Reset field to a valid one for the new source type
                        const field = getLinkFieldsForSourceType(source.type)[0];
                        if (field) {
                            this.applyLinkFieldDefinition(link, field.field);
                            link.label = field.label;
                        }
                    }
                    this.template.modified = new Date().toISOString();
                    this.refreshCurrentTab();
                });
            });

        // Target field
        new Setting(card)
            .setName('Field to fill')
            .setDesc('Which field on the created entity receives the existing entity')
            .addDropdown(dropdown => {
                getLinkFieldsForSourceType(link.sourceType).forEach(field => {
                    dropdown.addOption(field.field, `${field.label} → ${this.getEntityTypeLabel(field.targetType)}`);
                });
                dropdown.setValue(link.targetField);
                dropdown.onChange(value => {
                    this.applyLinkFieldDefinition(link, value);
                    this.template.modified = new Date().toISOString();
                    this.refreshCurrentTab();
                });
            });

        // Label
        new Setting(card)
            .setName('Prompt label')
            .setDesc('Shown to the user when applying the template')
            .addText(text => text
                .setPlaceholder('E.g. Home magic system')
                .setValue(link.label)
                .onChange(value => {
                    link.label = value;
                    this.template.modified = new Date().toISOString();
                })
            );

        // Required + delete
        new Setting(card)
            .setName('Required')
            .setDesc(`Allows ${link.multiple ? 'multiple selections' : 'a single selection'}. Required links must be filled before applying.`)
            .addToggle(toggle => toggle
                .setValue(link.required)
                .onChange(value => {
                    link.required = value;
                    this.template.modified = new Date().toISOString();
                })
            )
            .addExtraButton(button => button
                .setIcon('trash')
                .setTooltip('Delete link')
                .onClick(() => {
                    this.deleteLink(index);
                })
            );
    }

    private deleteLink(index: number): void {
        if (!this.template.existingEntityLinks) return;
        this.template.existingEntityLinks.splice(index, 1);
        if (this.template.existingEntityLinks.length === 0) {
            delete this.template.existingEntityLinks;
        }
        this.template.modified = new Date().toISOString();
        this.refreshCurrentTab();
    }

    // ==================== VARIABLES TAB ====================

    private renderVariablesTab(container: HTMLElement): void {
        const section = container.createDiv('template-editor-section');

        section.createEl('h3', { text: 'Template variables' });
        section.createEl('p', {
            text: 'Define variables that users can customize when applying the template. Use {{variableName}} in entity fields and content.',
            cls: 'setting-item-description'
        });

        // Add variable button
        const addButton = section.createEl('button', {
            text: '+ add variable',
            cls: 'mod-cta'
        });
        addButton.addEventListener('click', () => {
            this.addVariable();
        });

        this.renderBulkVariablePanel(section);

        // List existing variables
        const variablesList = section.createDiv('template-variables-list');

        if (!this.template.variables || this.template.variables.length === 0) {
            variablesList.createEl('p', {
                text: 'No variables defined yet. Variables allow template customization.',
                cls: 'template-empty-state'
            });
        } else {
            this.template.variables.forEach((variable, index) => {
                this.renderVariableCard(variablesList, variable, index);
            });
        }
    }

    /**
     * Bulk add/import panel. Nothing is written to the template until the user
     * has seen the parsed preview and pressed the commit button, so a bad paste
     * costs a re-edit rather than a pile of half-formed variables.
     */
    private renderBulkVariablePanel(section: HTMLElement): void {
        const bulkToggle = section.createEl('button', {
            text: 'Bulk add variables',
            cls: 'template-bulk-toggle'
        });
        const bulkPanel = section.createDiv('template-bulk-panel');
        bulkPanel.hide();

        bulkToggle.addEventListener('click', () => {
            if (bulkPanel.isShown()) {
                bulkPanel.hide();
                bulkToggle.setText('Bulk add variables');
            } else {
                bulkPanel.show();
                bulkToggle.setText('Hide bulk add');
            }
        });

        bulkPanel.createEl('p', {
            text: 'Paste one variable per line, or a JSON array, or a YAML list. Columns can be separated by a tab, |, : or a comma.',
            cls: 'setting-item-description'
        });
        bulkPanel.createEl('p', {
            text: 'Columns: name, type, default, label, description. For select, options come third and are separated by ; — name, select, options, default, label, description.',
            cls: 'setting-item-description'
        });
        bulkPanel.createEl('p', {
            text: 'Types: text, number, boolean, select, date. Type defaults to text. Lines starting with # are ignored.',
            cls: 'setting-item-description'
        });

        const bulkTextarea = bulkPanel.createEl('textarea', { cls: 'template-bulk-textarea' });
        bulkTextarea.placeholder = [
            'characterName',
            'characterAge | number | 25',
            'isVillain | boolean | false | Is a villain',
            'faction | select | rebels;empire;neutral | neutral',
            'foundingDate | date | 1247-03-02',
        ].join('\n');
        bulkTextarea.rows = 8;

        const modeRow = bulkPanel.createDiv('template-bulk-mode-row');
        let overwriteExisting = false;
        new Setting(modeRow)
            .setName('When a variable already exists')
            .setDesc('Append only keeps the variable you already have. Overwrite replaces it with the pasted definition.')
            .addDropdown(dropdown => dropdown
                .addOption('append', 'Append only — skip duplicates')
                .addOption('overwrite', 'Overwrite existing')
                .setValue('append')
                .onChange(value => {
                    overwriteExisting = value === 'overwrite';
                    renderPreview();
                })
            );

        const previewContainer = bulkPanel.createDiv('template-bulk-preview');
        const actionsRow = bulkPanel.createDiv('template-bulk-actions');
        const commitBtn = actionsRow.createEl('button', { text: 'Add variables', cls: 'mod-cta' });
        const exportBtn = actionsRow.createEl('button', { text: 'Export existing variables' });

        let lastResult: BulkParseResult = { format: 'delimited', rows: [] };

        const renderPreview = () => {
            lastResult = parseBulkVariables(bulkTextarea.value);
            previewContainer.empty();

            if (lastResult.fatalError) {
                previewContainer.createEl('p', {
                    text: lastResult.fatalError,
                    cls: 'template-bulk-warning'
                });
                commitBtn.disabled = true;
                return;
            }
            if (lastResult.rows.length === 0) {
                commitBtn.disabled = true;
                return;
            }

            const existingNames = new Set((this.template.variables || []).map(v => v.name));
            let committable = 0;

            previewContainer.createEl('h4', {
                text: `Preview — read as ${lastResult.format.toUpperCase()}`
            });

            const table = previewContainer.createDiv('template-bulk-preview-table');
            for (const row of lastResult.rows) {
                const rowEl = table.createDiv('template-bulk-preview-row');

                if (row.error || !row.variable) {
                    rowEl.addClass('is-error');
                    rowEl.createSpan({ cls: 'template-bulk-preview-name', text: row.source });
                    rowEl.createSpan({ cls: 'template-bulk-preview-note', text: row.error || 'could not be read' });
                    continue;
                }

                const variable = row.variable;
                const isDuplicate = existingNames.has(variable.name);
                const willCommit = !isDuplicate || overwriteExisting;
                if (willCommit) committable++;
                else rowEl.addClass('is-skipped');

                rowEl.createSpan({
                    cls: 'template-bulk-preview-name',
                    text: `{{${variable.name}}}`
                });

                const detail: string[] = [variable.type];
                if (variable.options) detail.push(`options: ${variable.options.join(', ')}`);
                if (variable.defaultValue !== undefined) detail.push(`default: ${String(variable.defaultValue)}`);
                if (variable.label !== variable.name) detail.push(`label: ${variable.label}`);
                rowEl.createSpan({ cls: 'template-bulk-preview-detail', text: detail.join('  ·  ') });

                if (isDuplicate) {
                    rowEl.createSpan({
                        cls: 'template-bulk-preview-note',
                        text: overwriteExisting ? 'replaces existing' : 'already exists — skipped'
                    });
                }
            }

            const errorCount = lastResult.rows.filter(r => r.error).length;
            const summary = previewContainer.createEl('p', { cls: 'setting-item-description' });
            summary.setText(
                `${committable} variable${committable !== 1 ? 's' : ''} will be added` +
                (errorCount > 0 ? `, ${errorCount} line${errorCount !== 1 ? 's' : ''} cannot be read` : '') + '.'
            );

            commitBtn.disabled = committable === 0;
        };

        bulkTextarea.addEventListener('input', renderPreview);

        commitBtn.addEventListener('click', () => {
            if (!this.template.variables) this.template.variables = [];

            let added = 0;
            let replaced = 0;
            for (const row of lastResult.rows) {
                if (!row.variable) continue;
                const existingIndex = this.template.variables.findIndex(v => v.name === row.variable!.name);
                if (existingIndex >= 0) {
                    if (!overwriteExisting) continue;
                    // Keep the usage map — it is derived from the template body,
                    // not from anything the pasted definition can know about.
                    const usedIn = this.template.variables[existingIndex].usedIn;
                    this.template.variables[existingIndex] = usedIn
                        ? { ...row.variable, usedIn }
                        : row.variable;
                    replaced++;
                } else {
                    this.template.variables.push(row.variable);
                    added++;
                }
            }

            if (added === 0 && replaced === 0) {
                new Notice('No variables were added.');
                return;
            }
            const parts: string[] = [];
            if (added > 0) parts.push(`added ${added}`);
            if (replaced > 0) parts.push(`replaced ${replaced}`);
            new Notice(`Variables: ${parts.join(', ')}.`);
            bulkTextarea.value = '';
            this.refreshCurrentTab();
        });

        exportBtn.addEventListener('click', () => {
            const variables = this.template.variables || [];
            if (variables.length === 0) {
                new Notice('This template has no variables to export.');
                return;
            }
            bulkTextarea.value = serializeVariables(variables);
            renderPreview();
            new Notice(`Exported ${variables.length} variable${variables.length !== 1 ? 's' : ''} into the box above.`);
        });

        renderPreview();
    }

    private renderVariableCard(container: HTMLElement, variable: TemplateVariable, index: number): void {
        const card = container.createDiv('template-variable-card');

        const header = card.createDiv('template-variable-header');
        header.createEl('strong', { text: variable.label || variable.name });

        const actions = header.createDiv('template-variable-actions');

        const editBtn = actions.createEl('button', { cls: 'template-variable-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', () => {
            this.editVariable(index);
        });

        const deleteBtn = actions.createEl('button', { cls: 'template-variable-btn-danger' });
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', () => {
            this.deleteVariable(index);
        });

        card.createEl('p', { text: `Variable: {{${variable.name}}}`, cls: 'template-variable-syntax' });
        card.createEl('p', { text: `Type: ${variable.type}`, cls: 'template-variable-type' });

        if (variable.description) {
            card.createEl('p', { text: variable.description, cls: 'template-variable-desc' });
        }

        // Show default value if set
        if (variable.defaultValue !== undefined && variable.defaultValue !== '') {
            card.createEl('p', {
                text: `Default: ${variable.defaultValue}`,
                cls: 'template-variable-default'
            });
        }

        // Show options count for select type
        if (variable.type === 'select' && variable.options && variable.options.length > 0) {
            card.createEl('p', {
                text: `${variable.options.length} option(s): ${variable.options.slice(0, 3).join(', ')}${variable.options.length > 3 ? '...' : ''}`,
                cls: 'template-variable-options'
            });
        }
    }

    // ==================== PREVIEW TAB ====================

    private renderPreviewTab(container: HTMLElement): void {
        const section = container.createDiv('template-editor-section');

        section.createEl('h3', { text: 'Template preview' });
        section.createEl('p', {
            text: 'Preview what entities will be created when this template is applied.',
            cls: 'setting-item-description'
        });

        // Template stats
        const stats = section.createDiv('template-preview-stats');
        const entityCount = this.template.entityTypes?.length || 0;
        const variableCount = this.template.variables?.length || 0;

        stats.createEl('p', { text: `${entityCount} entity types` });
        stats.createEl('p', { text: `${variableCount} variables` });
        stats.createEl('p', { text: `${this.template.tags.length} tags` });

        // Entity preview
        const preview = section.createDiv('template-preview-entities');
        preview.createEl('h4', { text: 'Entities' });

        if (entityCount === 0) {
            preview.createEl('p', { text: 'No entities configured yet.', cls: 'template-empty-state' });
        } else {
            this.renderEntitiesPreview(preview);
        }
    }

    private renderEntitiesPreview(container: HTMLElement): void {
        TEMPLATE_ENTITY_TYPES.forEach(entityType => {
            const entities = this.getEditableEntities(entityType);

            if (!entities || entities.length === 0) return;

            const typeSection = container.createDiv('template-preview-type-section');
            typeSection.createEl('h5', { text: `${this.getEntityTypeLabel(entityType)} (${entities.length})` });

            entities.forEach((entity) => {
                const entityPreview = typeSection.createDiv('template-preview-entity');
                entityPreview.setCssStyles({ marginBottom: '20px' });
                entityPreview.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
                entityPreview.setCssStyles({ borderRadius: '4px' });
                entityPreview.setCssStyles({ padding: '15px' });
                entityPreview.setCssStyles({ backgroundColor: 'var(--background-secondary)' });

                // Entity header
                const header = entityPreview.createDiv('template-preview-entity-header');
                header.setCssStyles({ marginBottom: '10px' });
                header.setCssStyles({ paddingBottom: '10px' });
                header.setCssStyles({ borderBottom: '1px solid var(--background-modifier-border)' });
                const nameEl = header.createEl('strong', { text: entity.name || 'Unnamed' });
                nameEl.setCssStyles({ fontSize: '16px' });

                // Note preview
                const notePreview = getEntityNotePreview(entity);
                const previewCode = entityPreview.createEl('pre', {
                    cls: 'template-preview-note-code'
                });
                previewCode.setCssStyles({ margin: '0' });
                previewCode.setCssStyles({ padding: '10px' });
                previewCode.setCssStyles({ backgroundColor: 'var(--background-primary)' });
                previewCode.setCssStyles({ border: '1px solid var(--background-modifier-border)' });
                previewCode.setCssStyles({ borderRadius: '4px' });
                previewCode.setCssStyles({ fontSize: '12px' });
                previewCode.setCssStyles({ fontFamily: 'monospace' });
                previewCode.setCssStyles({ whiteSpace: 'pre-wrap' });
                previewCode.setCssStyles({ wordBreak: 'break-word' });
                previewCode.setCssStyles({ maxHeight: '300px' });
                previewCode.setCssStyles({ overflow: 'auto' });
                previewCode.textContent = notePreview;
            });
        });
    }

    // ==================== FOOTER ====================

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('storyteller-modal-footer template-editor-footer');

        footer.createDiv({ cls: 'storyteller-modal-button-spacer' });
        this.createFooterButton(footer, 'Cancel', () => this.close());

        if (!this.template.isEditable) {
            this.createFooterButton(footer, 'Duplicate', () => this.handleDuplicate(), { cta: true });
        } else {
            this.createFooterButton(footer, 'Save Template', () => this.handleSave(), { cta: true });
        }
    }

    // ==================== HELPER METHODS ====================

    private addEntity(entityType: TemplateEntityType): void {
        const entities = this.ensureEditableEntities(entityType);

        const newEntity: EditableTemplateEntity = {
            templateId: `${entityType.toUpperCase()}_${Date.now()}`,
            name: '',
            description: ''
        };

        entities.push(newEntity);

        if (!this.template.entityTypes) {
            this.template.entityTypes = [];
        }
        if (!this.template.entityTypes.includes(entityType)) {
            this.template.entityTypes.push(entityType);
        }

        this.template.modified = new Date().toISOString();
    }

    private editEntity(entityType: TemplateEntityType, index: number): void {
        const entities = this.getEditableEntities(entityType);

        if (!entities || entities.length <= index) {
            new Notice('Entity not found');
            return;
        }

        const entity = entities[index];

        // Open entity detail editor
        new TemplateEntityDetailModal(
            this.app,
            this.plugin,
            entity,
            entityType,
            (updatedEntity) => {
                // Update the entity in the template
                entities[index] = updatedEntity;
                this.template.modified = new Date().toISOString();

                this.refreshCurrentTab();
            }
        ).open();
    }

    private deleteEntity(entityType: TemplateEntityType, index: number): void {
        const entities = this.getEditableEntities(entityType);

        if (entities && entities.length > index) {
            entities.splice(index, 1);

            // Remove entity type if no more entities of this type
            if (entities.length === 0) {
                this.deleteEditableEntities(entityType);
                this.template.entityTypes = this.template.entityTypes?.filter(t => t !== entityType);
            }

            this.template.modified = new Date().toISOString();
            this.refreshCurrentTab();
        }
    }

    private addVariable(): void {
        if (!this.template.variables) {
            this.template.variables = [];
        }

        // Open variable editor for new variable
        new TemplateVariableEditorModal(
            this.app,
            this.plugin,
            null, // null = new variable
            (newVariable) => {
                // Check for duplicate variable names
                if (this.template.variables?.some(v => v.name === newVariable.name)) {
                    new Notice(`Variable name "{{${newVariable.name}}}" already exists. Please choose a different name.`);
                    return;
                }

                // Add the new variable
                this.template.variables!.push(newVariable);
                this.template.modified = new Date().toISOString();

                this.refreshCurrentTab();
            }
        ).open();
    }

    private editVariable(index: number): void {
        if (!this.template.variables || this.template.variables.length <= index) {
            new Notice('Variable not found');
            return;
        }

        const variable = this.template.variables[index];
        const originalName = variable.name;

        // Open variable editor
        new TemplateVariableEditorModal(
            this.app,
            this.plugin,
            variable,
            (updatedVariable) => {
                // Check for duplicate variable names (excluding current variable)
                if (updatedVariable.name !== originalName &&
                    this.template.variables?.some(v => v.name === updatedVariable.name)) {
                    new Notice(`Variable name "{{${updatedVariable.name}}}" already exists. Please choose a different name.`);
                    return;
                }

                // Update the variable
                this.template.variables![index] = updatedVariable;
                this.template.modified = new Date().toISOString();

                this.refreshCurrentTab();
            }
        ).open();
    }

    private deleteVariable(index: number): void {
        if (this.template.variables && this.template.variables.length > index) {
            this.template.variables.splice(index, 1);
            this.template.modified = new Date().toISOString();
            this.refreshCurrentTab();
        }
    }

    private async handleSave(): Promise<void> {
        try {
            // Validate template
            if (!this.template.name || this.template.name.trim() === '') {
                new Notice('Please enter a template name');
                return;
            }

            if (!this.template.description || this.template.description.trim() === '') {
                new Notice('Please enter a description');
                return;
            }

            // Update modified timestamp
            this.template.modified = new Date().toISOString();

            // Save via templateManager
            await this.plugin.templateManager.saveTemplate(this.template);

            // Call onSave callback
            this.onSave(this.template);

            new Notice(`Template "${this.template.name}" saved successfully!`);
            this.close();
        } catch (error) {
            
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Failed to save template: ${message}`);
        }
    }

    private async handleDuplicate(): Promise<void> {
        // Deep clone
        let duplicate = JSON.parse(JSON.stringify(this.template)) as Template;
        
        // Migrate to new format if needed
        const { TemplateMigrator } = await import('../templates/TemplateMigrator');
        duplicate = TemplateMigrator.migrateTemplateToNewFormat(duplicate);
        
        duplicate = {
            ...duplicate,
            id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            name: `${this.template.name} (Copy)`,
            author: 'User',
            isBuiltIn: false,
            isEditable: true,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            usageCount: 0
        };

        this.template = duplicate;
        this.isNewTemplate = true;
        await this.handleSave();
    }

    private getEditableEntityCollections(): Record<TemplateEntityCollectionKey, EditableTemplateEntity[] | undefined> {
        return this.template.entities as unknown as Record<TemplateEntityCollectionKey, EditableTemplateEntity[] | undefined>;
    }

    private getEditableEntities(entityType: TemplateEntityType): EditableTemplateEntity[] | undefined {
        return this.getEditableEntityCollections()[this.getEntityTypePlural(entityType)];
    }

    private ensureEditableEntities(entityType: TemplateEntityType): EditableTemplateEntity[] {
        const collections = this.getEditableEntityCollections();
        const pluralKey = this.getEntityTypePlural(entityType);
        const entities = collections[pluralKey] ?? [];
        collections[pluralKey] = entities;
        return entities;
    }

    private deleteEditableEntities(entityType: TemplateEntityType): void {
        delete this.getEditableEntityCollections()[this.getEntityTypePlural(entityType)];
    }

    private getEntityTypePlural(entityType: TemplateEntityType): TemplateEntityCollectionKey {
        return getTemplateEntityPluralKey(entityType);
    }

    private getEntityTypeLabel(entityType: TemplateEntityType): string {
        return getTemplateEntityLabel(entityType);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
