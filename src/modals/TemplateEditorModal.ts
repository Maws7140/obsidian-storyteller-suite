/**
 * Template Editor Modal
 * Full-featured editor for creating and editing templates from scratch
 * Allows defining YAML fields, section content, custom fields, and variables
 */

import { App, Notice, Setting } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import {
    Template,
    TemplateGenre,
    TemplateCategory,
    TemplateEntityType,
    TemplateEntity,
    TemplateVariable
} from '../templates/TemplateTypes';
import { TemplateEntityDetailModal } from './TemplateEntityDetailModal';
import { TemplateVariableEditorModal } from './TemplateVariableEditorModal';
import { getEntityNotePreview } from '../utils/TemplatePreviewRenderer';

export class TemplateEditorModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private template: Template;
    private isNewTemplate: boolean;
    private onSave: (template: Template) => void;

    // Current editing state
    private currentTab: 'metadata' | 'entities' | 'variables' | 'preview' = 'metadata';
    private selectedEntityType: TemplateEntityType | null = null;
    private selectedEntityIndex: number = -1;

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
            id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        this.renderTabs(contentEl);

        // Content area
        const contentArea = contentEl.createDiv('template-editor-content');
        this.renderCurrentTab(contentArea);

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
            warning.createEl('span', { text: '⚠️ This is a built-in template and cannot be edited. You can duplicate it to create an editable version.' });
        }
    }

    private renderTabs(container: HTMLElement): void {
        const tabContainer = container.createDiv('template-editor-tabs');

        const tabs = [
            { id: 'metadata' as const, label: '📋 Metadata' },
            { id: 'entities' as const, label: '👥 Entities' },
            { id: 'variables' as const, label: '🔧 Variables' },
            { id: 'preview' as const, label: '👁️ Preview' }
        ];

        tabs.forEach(tab => {
            const tabBtn = tabContainer.createEl('button', {
                cls: 'template-editor-tab',
                text: tab.label
            });

            if (this.currentTab === tab.id) {
                tabBtn.addClass('active');
            }

            tabBtn.onclick = () => {
                this.currentTab = tab.id;
                this.onOpen(); // Re-render
            };
        });
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
            .setName('Template Name')
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
                .addOption('scifi', 'Sci-Fi')
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
                .addOption('single-entity', 'Single Entity - One character, location, or item')
                .addOption('entity-set', 'Entity Set - Collection of related entities')
                .addOption('full-world', 'Full World - Complete story world with all entity types')
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
                .setPlaceholder('tag1, tag2, tag3')
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
            .setName('Enable Quick Apply')
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

        section.createEl('h3', { text: 'Entities in Template' });
        section.createEl('p', {
            text: 'Add and configure entities that will be created when this template is applied.',
            cls: 'setting-item-description'
        });

        // Entity type selector and add button
        let selectedType: TemplateEntityType = 'character';

        // Use Obsidian's Setting class for proper dropdown styling
        const entityTypes: TemplateEntityType[] = [
            'character', 'location', 'event', 'item', 'group',
            'culture', 'economy', 'magicSystem', 'chapter', 'scene', 'reference'
        ];

        const setting = new Setting(section)
            .setName('Add New Entity')
            .setDesc('Select the type of entity to add to this template');

        setting.addDropdown(dropdown => {
            entityTypes.forEach(type => {
                dropdown.addOption(type, this.getEntityTypeLabel(type));
            });
            dropdown.setValue(selectedType);
            dropdown.onChange(value => {
                selectedType = value as TemplateEntityType;
            });
        });

        setting.addButton(button => {
            button
                .setButtonText('Add Entity')
                .setCta()
                .onClick(() => {
                    this.addEntity(selectedType);
                    this.onOpen(); // Re-render
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
        const entityTypeOrder: TemplateEntityType[] = [
            'character', 'location', 'event', 'item', 'group',
            'culture', 'economy', 'magicSystem', 'chapter', 'scene', 'reference'
        ];

        entityTypeOrder.forEach(entityType => {
            const pluralKey = this.getEntityTypePlural(entityType);
            const entities = (this.template.entities as any)[pluralKey];

            if (!entities || entities.length === 0) return;

            const typeSection = container.createDiv('template-entity-type-section');
            typeSection.createEl('h4', { text: this.getEntityTypeLabel(entityType) });

            entities.forEach((entity: TemplateEntity<any>, index: number) => {
                this.renderEntityCard(typeSection, entity, entityType, index);
            });
        });
    }

    private renderEntityCard(
        container: HTMLElement,
        entity: TemplateEntity<any>,
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

        const editBtn = actions.createEl('button', { text: '✏️ Edit', cls: 'template-entity-btn' });
        editBtn.addEventListener('click', () => {
            this.editEntity(entityType, index);
        });

        const deleteBtn = actions.createEl('button', { text: '🗑️ Delete', cls: 'template-entity-btn-danger' });
        deleteBtn.addEventListener('click', () => {
            this.deleteEntity(entityType, index);
        });

        // Show preview of key fields
        const preview = card.createDiv('template-entity-preview');
        if (entity.description) {
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

    // ==================== VARIABLES TAB ====================

    private renderVariablesTab(container: HTMLElement): void {
        const section = container.createDiv('template-editor-section');

        section.createEl('h3', { text: 'Template Variables' });
        section.createEl('p', {
            text: 'Define variables that users can customize when applying the template. Use {{variableName}} in entity fields and content.',
            cls: 'setting-item-description'
        });

        // Add variable button
        const addButton = section.createEl('button', {
            text: '+ Add Variable',
            cls: 'mod-cta'
        });
        addButton.addEventListener('click', () => {
            this.addVariable();
            this.onOpen(); // Re-render
        });

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

    private renderVariableCard(container: HTMLElement, variable: TemplateVariable, index: number): void {
        const card = container.createDiv('template-variable-card');

        const header = card.createDiv('template-variable-header');
        header.createEl('strong', { text: variable.label || variable.name });

        const actions = header.createDiv('template-variable-actions');

        const editBtn = actions.createEl('button', { text: '✏️ Edit', cls: 'template-variable-btn' });
        editBtn.addEventListener('click', () => {
            this.editVariable(index);
        });

        const deleteBtn = actions.createEl('button', { text: '🗑️', cls: 'template-variable-btn-danger' });
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

        section.createEl('h3', { text: 'Template Preview' });
        section.createEl('p', {
            text: 'Preview what entities will be created when this template is applied.',
            cls: 'setting-item-description'
        });

        // Template stats
        const stats = section.createDiv('template-preview-stats');
        const entityCount = this.template.entityTypes?.length || 0;
        const variableCount = this.template.variables?.length || 0;

        stats.createEl('p', { text: `📦 ${entityCount} entity types` });
        stats.createEl('p', { text: `🔧 ${variableCount} variables` });
        stats.createEl('p', { text: `🏷️ ${this.template.tags.length} tags` });

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
        const entityTypes: TemplateEntityType[] = [
            'character', 'location', 'event', 'item', 'group',
            'culture', 'economy', 'magicSystem', 'chapter', 'scene', 'reference'
        ];

        entityTypes.forEach(entityType => {
            const pluralKey = this.getEntityTypePlural(entityType);
            const entities = (this.template.entities as any)[pluralKey];

            if (!entities || entities.length === 0) return;

            const typeSection = container.createDiv('template-preview-type-section');
            typeSection.createEl('h5', { text: `${this.getEntityTypeLabel(entityType)} (${entities.length})` });

            entities.forEach((entity: TemplateEntity<any>) => {
                const entityPreview = typeSection.createDiv('template-preview-entity');
                entityPreview.style.marginBottom = '20px';
                entityPreview.style.border = '1px solid var(--background-modifier-border)';
                entityPreview.style.borderRadius = '4px';
                entityPreview.style.padding = '15px';
                entityPreview.style.backgroundColor = 'var(--background-secondary)';

                // Entity header
                const header = entityPreview.createDiv('template-preview-entity-header');
                header.style.marginBottom = '10px';
                header.style.paddingBottom = '10px';
                header.style.borderBottom = '1px solid var(--background-modifier-border)';
                const nameEl = header.createEl('strong', { text: entity.name || 'Unnamed' });
                nameEl.style.fontSize = '16px';

                // Note preview
                const notePreview = getEntityNotePreview(entity);
                const previewCode = entityPreview.createEl('pre', {
                    cls: 'template-preview-note-code'
                });
                previewCode.style.margin = '0';
                previewCode.style.padding = '10px';
                previewCode.style.backgroundColor = 'var(--background-primary)';
                previewCode.style.border = '1px solid var(--background-modifier-border)';
                previewCode.style.borderRadius = '4px';
                previewCode.style.fontSize = '12px';
                previewCode.style.fontFamily = 'monospace';
                previewCode.style.whiteSpace = 'pre-wrap';
                previewCode.style.wordBreak = 'break-word';
                previewCode.style.maxHeight = '300px';
                previewCode.style.overflow = 'auto';
                previewCode.textContent = notePreview;
            });
        });
    }

    // ==================== FOOTER ====================

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv('template-editor-footer');

        const cancelBtn = footer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        if (!this.template.isEditable) {
            const duplicateBtn = footer.createEl('button', { text: 'Duplicate', cls: 'mod-cta' });
            duplicateBtn.addEventListener('click', () => this.handleDuplicate());
        } else {
            const saveBtn = footer.createEl('button', { text: 'Save Template', cls: 'mod-cta' });
            saveBtn.addEventListener('click', () => this.handleSave());
        }
    }

    // ==================== HELPER METHODS ====================

    private addEntity(entityType: TemplateEntityType): void {
        const pluralKey = this.getEntityTypePlural(entityType);

        if (!this.template.entities[pluralKey]) {
            (this.template.entities as any)[pluralKey] = [];
        }

        const newEntity: TemplateEntity<any> = {
            templateId: `${entityType.toUpperCase()}_${Date.now()}`,
            name: '',
            description: ''
        };

        (this.template.entities as any)[pluralKey].push(newEntity);

        if (!this.template.entityTypes) {
            this.template.entityTypes = [];
        }
        if (!this.template.entityTypes.includes(entityType)) {
            this.template.entityTypes.push(entityType);
        }

        this.template.modified = new Date().toISOString();
    }

    private editEntity(entityType: TemplateEntityType, index: number): void {
        const pluralKey = this.getEntityTypePlural(entityType);
        const entities = (this.template.entities as any)[pluralKey];

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

                // Re-render to show changes
                this.onOpen();
            }
        ).open();
    }

    private deleteEntity(entityType: TemplateEntityType, index: number): void {
        const pluralKey = this.getEntityTypePlural(entityType);
        const entities = (this.template.entities as any)[pluralKey];

        if (entities && entities.length > index) {
            entities.splice(index, 1);

            // Remove entity type if no more entities of this type
            if (entities.length === 0) {
                delete (this.template.entities as any)[pluralKey];
                this.template.entityTypes = this.template.entityTypes?.filter(t => t !== entityType);
            }

            this.template.modified = new Date().toISOString();
            this.onOpen(); // Re-render
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

                // Re-render to show the new variable
                this.onOpen();
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

                // Re-render to show changes
                this.onOpen();
            }
        ).open();
    }

    private deleteVariable(index: number): void {
        if (this.template.variables && this.template.variables.length > index) {
            this.template.variables.splice(index, 1);
            this.template.modified = new Date().toISOString();
            this.onOpen(); // Re-render
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
            console.error('Error saving template:', error);
            new Notice(`Failed to save template: ${error.message}`);
        }
    }

    private async handleDuplicate(): Promise<void> {
        // Deep clone
        let duplicate: Template = JSON.parse(JSON.stringify(this.template));
        
        // Migrate to new format if needed
        const { TemplateMigrator } = await import('../templates/TemplateMigrator');
        duplicate = TemplateMigrator.migrateTemplateToNewFormat(duplicate);
        
        duplicate = {
            ...duplicate,
            id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

    private getEntityTypePlural(entityType: TemplateEntityType): string {
        const pluralMap: Record<TemplateEntityType, string> = {
            character: 'characters',
            location: 'locations',
            event: 'events',
            item: 'items',
            group: 'groups',
            culture: 'cultures',
            economy: 'economies',
            magicSystem: 'magicSystems',
            chapter: 'chapters',
            scene: 'scenes',
            reference: 'references'
        };
        return pluralMap[entityType];
    }

    private getEntityTypeLabel(entityType: TemplateEntityType): string {
        const labelMap: Record<TemplateEntityType, string> = {
            character: 'Character',
            location: 'Location',
            event: 'Event',
            item: 'Item',
            group: 'Group',
            culture: 'Culture',
            economy: 'Economy',
            magicSystem: 'Magic System',
            chapter: 'Chapter',
            scene: 'Scene',
            reference: 'Reference'
        };
        return labelMap[entityType];
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
