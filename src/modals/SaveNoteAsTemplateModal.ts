/**
 * Save Note as Template Modal
 * Simple modal to collect template metadata when saving a note as template
 */

import { App, Notice, Setting } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import {
    TemplateGenre,
    TemplateCategory,
    TemplateEntityType
} from '../templates/TemplateTypes';
import { TEMPLATE_ENTITY_TYPES, getTemplateEntityLabel } from '../templates/TemplateEntityRegistry';

export interface SaveNoteAsTemplateResult {
    name: string;
    description: string;
    genre: TemplateGenre;
    category: TemplateCategory;
    tags: string[];
    entityType: TemplateEntityType;
}

export class SaveNoteAsTemplateModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private onSubmit: (result: SaveNoteAsTemplateResult) => void;
    private onCancel: () => void;

    // Form values
    private templateName: string = '';
    private description: string = '';
    private genre: TemplateGenre = 'custom';
    private category: TemplateCategory = 'single-entity';
    private tags: string = '';
    private entityType: TemplateEntityType = 'character';

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        defaultEntityType: TemplateEntityType | null,
        defaultName: string = '',
        onSubmit: (result: SaveNoteAsTemplateResult) => void,
        onCancel?: () => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.onCancel = onCancel || (() => {});

        // Set defaults
        this.templateName = defaultName || 'New Template';
        if (defaultEntityType) {
            this.entityType = defaultEntityType;
        }
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.empty();
        contentEl.createEl('h2', { text: 'Save note as template' });

        // Template Name
        new Setting(contentEl)
            .setName('Template name')
            .setDesc('A descriptive name for this template')
            .addText(text => text
                .setPlaceholder('Enter template name')
                .setValue(this.templateName)
                .onChange(value => this.templateName = value)
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
                text.inputEl.rows = 3;
            });

        // Entity Type
        new Setting(contentEl)
            .setName('Entity type')
            .setDesc('What type of entity is this template for?')
            .addDropdown(dropdown => {
                TEMPLATE_ENTITY_TYPES.forEach(entityType => {
                    dropdown.addOption(entityType, getTemplateEntityLabel(entityType));
                });
                dropdown
                    .setValue(this.entityType)
                    .onChange(value => this.entityType = value as TemplateEntityType);
            });

        // Genre
        new Setting(contentEl)
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
                .setValue(this.genre)
                .onChange(value => this.genre = value as TemplateGenre)
            );

        // Category
        new Setting(contentEl)
            .setName('Category')
            .setDesc('Template scope')
            .addDropdown(dropdown => dropdown
                .addOption('single-entity', 'Single entity')
                .addOption('entity-set', 'Entity set')
                .addOption('full-world', 'Full world')
                .setValue(this.category)
                .onChange(value => this.category = value as TemplateCategory)
            );

        // Tags
        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Comma-separated tags for searching (e.g., hero, brave, protagonist)')
            .addText(text => text
                .setPlaceholder('Tag1, tag2, tag3')
                .setValue(this.tags)
                .onChange(value => this.tags = value)
            );

        // Info text
        contentEl.createEl('p', {
            text: 'Tip: Use {{variableName}} in your note to create customizable fields.',
            cls: 'setting-item-description',
            attr: { style: 'margin-top: 1em; font-style: italic;' }
        });

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.setCssStyles({ marginTop: '1em' });
        buttonContainer.setCssStyles({ display: 'flex' });
        buttonContainer.setCssStyles({ gap: '0.5em' });
        buttonContainer.setCssStyles({ justifyContent: 'flex-end' });

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => {
            this.onCancel();
            this.close();
        });

        const saveButton = buttonContainer.createEl('button', {
            text: 'Save template',
            cls: 'mod-cta'
        });
        saveButton.addEventListener('click', () => this.handleSave());
    }

    private handleSave(): void {
        // Validate
        if (!this.templateName || this.templateName.trim() === '') {
            new Notice('Please enter a template name');
            return;
        }

        if (!this.description || this.description.trim() === '') {
            new Notice('Please enter a description');
            return;
        }

        // Parse tags
        const tagArray = this.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);

        // Submit
        this.onSubmit({
            name: this.templateName.trim(),
            description: this.description.trim(),
            genre: this.genre,
            category: this.category,
            tags: tagArray,
            entityType: this.entityType
        });

        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

