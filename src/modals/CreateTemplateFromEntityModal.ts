/**
 * Create Template From Entity Modal
 * Allows users to save an existing entity as a reusable template
 */

import { App, Notice, Setting } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import {
    Template,
    TemplateGenre,
    TemplateCategory,
    TemplateEntityType
} from '../templates/TemplateTypes';
import { EntityToTemplateConverter, ConversionOptions } from '../templates/EntityToTemplateConverter';

export class CreateTemplateFromEntityModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private entity: any;
    private entityType: TemplateEntityType;
    private onSubmit: (template: Template) => void;

    // Form values
    private templateName: string = '';
    private description: string = '';
    private genre: TemplateGenre = 'fantasy';
    private category: TemplateCategory = 'single-entity';
    private tags: string = '';
    private includeRelationships: boolean = false;
    private genericizeRelationships: boolean = false;
    private includeCustomFields: boolean = true;
    private includeProfileImages: boolean = false;

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        entity: any,
        entityType: TemplateEntityType,
        onSubmit: (template: Template) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.entity = entity;
        this.entityType = entityType;
        this.onSubmit = onSubmit;

        // Set default template name from entity name
        this.templateName = entity.name ? `${entity.name} Template` : 'New Template';
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.empty();
        contentEl.createEl('h2', { text: `Create Template from ${this.entity.name || 'Entity'}` });

        // Template name
        new Setting(contentEl)
            .setName('Template Name')
            .setDesc('Name for this template')
            .addText(text => text
                .setPlaceholder('Enter template name')
                .setValue(this.templateName)
                .onChange(value => this.templateName = value)
            );

        // Description
        new Setting(contentEl)
            .setName('Description')
            .setDesc('Describe what this template is for')
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
            .setDesc('Comma-separated tags for searching (e.g., king, ruler, noble)')
            .addText(text => text
                .setPlaceholder('tag1, tag2, tag3')
                .setValue(this.tags)
                .onChange(value => this.tags = value)
            );

        // Section header
        contentEl.createEl('h3', { text: 'Include Options' });

        // Include relationships
        new Setting(contentEl)
            .setName('Include Relationships')
            .setDesc('Include entity relationships in the template')
            .addToggle(toggle => toggle
                .setValue(this.includeRelationships)
                .onChange(value => {
                    this.includeRelationships = value;
                    this.displayContent();
                })
            );

        // Genericize relationships (only show if including relationships)
        if (this.includeRelationships) {
            new Setting(contentEl)
                .setName('Make Relationships Generic')
                .setDesc('Make relationships optional/generic (recommended for reusable templates)')
                .addToggle(toggle => toggle
                    .setValue(this.genericizeRelationships)
                    .onChange(value => this.genericizeRelationships = value)
                );
        }

        // Include custom fields
        new Setting(contentEl)
            .setName('Include Custom Fields')
            .setDesc('Include custom fields defined on this entity')
            .addToggle(toggle => toggle
                .setValue(this.includeCustomFields)
                .onChange(value => this.includeCustomFields = value)
            );

        // Include profile images
        new Setting(contentEl)
            .setName('Include Profile Image')
            .setDesc('Include the entity\'s profile image in the template')
            .addToggle(toggle => toggle
                .setValue(this.includeProfileImages)
                .onChange(value => this.includeProfileImages = value)
            );

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => this.close());

        const createButton = buttonContainer.createEl('button', {
            text: 'Create Template',
            cls: 'mod-cta'
        });
        createButton.addEventListener('click', () => this.handleCreate());
    }

    /**
     * Refresh the content display
     */
    private displayContent(): void {
        this.onOpen();
    }

    /**
     * Handle template creation
     */
    private async handleCreate(): Promise<void> {
        // Validate inputs
        if (!this.templateName || this.templateName.trim() === '') {
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

            // Add entity type as a tag
            tagArray.push(this.entityType);

            // Create conversion options
            const options: ConversionOptions = {
                name: this.templateName.trim(),
                description: this.description.trim(),
                genre: this.genre,
                category: this.category,
                tags: tagArray,
                includeRelationships: this.includeRelationships,
                genericizeRelationships: this.genericizeRelationships,
                includeCustomFields: this.includeCustomFields,
                includeProfileImages: this.includeProfileImages
            };

            // Convert entity to template
            const template = EntityToTemplateConverter.convertEntityToTemplate(
                this.entity,
                this.entityType,
                options
            );

            // Auto-populate entity types
            this.plugin.templateManager.autoPopulateEntityTypes(template);

            // Save template
            await this.plugin.templateManager.saveTemplate(template);

            // Call onSubmit callback
            this.onSubmit(template);

            new Notice(`Template "${template.name}" created successfully!`);
            this.close();
        } catch (error) {
            console.error('Error creating template:', error);
            new Notice(`Failed to create template: ${error.message}`);
        }
    }
}
