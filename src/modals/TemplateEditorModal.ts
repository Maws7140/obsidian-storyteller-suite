/**
 * Template Editor Modal
 * Create and edit templates (basic version - can be enhanced later)
 */

import { App, Notice, Setting } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import {
    Template,
    TemplateGenre,
    TemplateCategory,
    TemplateEntities
} from '../templates/TemplateTypes';

export class TemplateEditorModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private template: Template | null;
    private onSubmit: (template: Template) => void;
    private isEditMode: boolean;

    // Form values
    private name: string = '';
    private description: string = '';
    private genre: TemplateGenre = 'fantasy';
    private category: TemplateCategory = 'single-entity';
    private tags: string = '';

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        onSubmit: (template: Template) => void,
        existingTemplate?: Template
    ) {
        super(app);
        this.plugin = plugin;
        this.template = existingTemplate || null;
        this.onSubmit = onSubmit;
        this.isEditMode = !!existingTemplate;

        if (existingTemplate) {
            this.loadTemplateData(existingTemplate);
        }
    }

    private loadTemplateData(template: Template): void {
        this.name = template.name;
        this.description = template.description;
        this.genre = template.genre;
        this.category = template.category;
        this.tags = template.tags.join(', ');
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.empty();
        contentEl.createEl('h2', {
            text: this.isEditMode ? 'Edit Template' : 'Create New Template'
        });

        // Template name
        new Setting(contentEl)
            .setName('Template Name')
            .setDesc('Name for this template')
            .addText(text => text
                .setPlaceholder('Enter template name')
                .setValue(this.name)
                .onChange(value => this.name = value)
            );

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Describe what this template provides')
            .addTextArea(text => {
                text
                    .setPlaceholder('Enter description')
                    .setValue(this.description)
                    .onChange(value => this.description = value);
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
            });

        // Genre
        new Setting(contentEl)
            .setName('Genre')
            .setDesc('Genre classification')
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
                .setValue(this.genre)
                .onChange(value => this.genre = value as TemplateGenre)
            );

        // Category
        new Setting(contentEl)
            .setName('Category')
            .setDesc('Template scope')
            .addDropdown(dropdown => dropdown
                .addOption('single-entity', 'Single Entity')
                .addOption('entity-set', 'Entity Set')
                .addOption('full-world', 'Full World')
                .setValue(this.category)
                .onChange(value => this.category = value as TemplateCategory)
            );

        // Tags
        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Comma-separated tags for searching')
            .addText(text => text
                .setPlaceholder('tag1, tag2, tag3')
                .setValue(this.tags)
                .onChange(value => this.tags = value)
            );

        // Info message for entity content
        if (!this.isEditMode) {
            contentEl.createDiv({ cls: 'setting-item-description' }, div => {
                div.createEl('p', {
                    text: 'Note: To add entities to this template, use "Create Template from Entity" on existing entities, or edit this template later.'
                });
            });
        }

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => this.close());

        const saveButton = buttonContainer.createEl('button', {
            text: this.isEditMode ? 'Save Changes' : 'Create Template',
            cls: 'mod-cta'
        });
        saveButton.addEventListener('click', () => this.handleSave());
    }

    private async handleSave(): Promise<void> {
        // Validate
        if (!this.name || this.name.trim() === '') {
            new Notice('Please enter a template name');
            return;
        }

        if (!this.description || this.description.trim() === '') {
            new Notice('Please enter a description');
            return;
        }

        try {
            // Parse tags
            const tagArray = this.tags
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);

            let template: Template;

            if (this.isEditMode && this.template) {
                // Update existing template
                template = {
                    ...this.template,
                    name: this.name.trim(),
                    description: this.description.trim(),
                    genre: this.genre,
                    category: this.category,
                    tags: tagArray,
                    modified: new Date().toISOString()
                };
            } else {
                // Create new template
                const entities: TemplateEntities = {};

                template = {
                    id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: this.name.trim(),
                    description: this.description.trim(),
                    genre: this.genre,
                    category: this.category,
                    version: '1.0.0',
                    author: 'User',
                    isBuiltIn: false,
                    isEditable: true,
                    created: new Date().toISOString(),
                    modified: new Date().toISOString(),
                    tags: tagArray,
                    entities,
                    entityTypes: [],
                    usageCount: 0,
                    quickApplyEnabled: true
                };
            }

            // Save template
            await this.plugin.templateStorageManager.saveTemplate(template);

            // Call onSubmit callback
            this.onSubmit(template);

            new Notice(`Template "${template.name}" ${this.isEditMode ? 'updated' : 'created'} successfully!`);
            this.close();
        } catch (error) {
            console.error('Error saving template:', error);
            new Notice(`Failed to save template: ${error.message}`);
        }
    }
}
