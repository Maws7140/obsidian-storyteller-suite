/**
 * Template Library Modal
 * Browse, filter, and manage templates
 */

import { App, Notice, Setting } from 'obsidian';
import { ResponsiveModal } from './ResponsiveModal';
import type StorytellerSuitePlugin from '../main';
import {
    Template,
    TemplateFilter,
    TemplateGenre,
    TemplateCategory,
    TemplateEntityType
} from '../templates/TemplateTypes';
import { TemplateEditorModal } from './TemplateEditorModal';

export class TemplateLibraryModal extends ResponsiveModal {
    private plugin: StorytellerSuitePlugin;
    private onTemplateSelected?: (template: Template) => void;

    // Filter state
    private filter: TemplateFilter = {
        showBuiltIn: true,
        showCustom: true
    };

    private templates: Template[] = [];

    constructor(
        app: App,
        plugin: StorytellerSuitePlugin,
        onTemplateSelected?: (template: Template) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onTemplateSelected = onTemplateSelected;
    }

    onOpen(): void {
        super.onOpen();
        this.refreshTemplates();
        this.displayContent();
    }

    private refreshTemplates(): void {
        this.templates = this.plugin.templateManager.getFilteredTemplates(this.filter);
    }

    private displayContent(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Template Library' });

        // Create filter section
        this.createFilterSection(contentEl);

        // Create template list
        this.createTemplateList(contentEl);

        // Create new template button
        const createButton = contentEl.createEl('button', {
            text: 'Create New Template',
            cls: 'mod-cta'
        });
        createButton.style.marginTop = '1em';
        createButton.addEventListener('click', () => this.handleCreateNew());
    }

    private createFilterSection(container: HTMLElement): void {
        const filterContainer = container.createDiv({ cls: 'template-library-filters' });

        // Search text
        new Setting(filterContainer)
            .setName('Search')
            .setDesc('Search templates by name, description, or tags')
            .addText(text => text
                .setPlaceholder('Search...')
                .setValue(this.filter.searchText || '')
                .onChange(value => {
                    this.filter.searchText = value || undefined;
                    this.refreshAndDisplay();
                })
            );

        // Genre filter
        new Setting(filterContainer)
            .setName('Genre')
            .setDesc('Filter by genre')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'All Genres');
                dropdown.addOption('fantasy', 'Fantasy');
                dropdown.addOption('scifi', 'Sci-Fi');
                dropdown.addOption('mystery', 'Mystery');
                dropdown.addOption('horror', 'Horror');
                dropdown.addOption('romance', 'Romance');
                dropdown.addOption('historical', 'Historical');
                dropdown.addOption('western', 'Western');
                dropdown.addOption('thriller', 'Thriller');
                dropdown.addOption('custom', 'Custom');
                dropdown.setValue('');
                dropdown.onChange(value => {
                    this.filter.genre = value ? [value as TemplateGenre] : undefined;
                    this.refreshAndDisplay();
                });
            });

        // Category filter
        new Setting(filterContainer)
            .setName('Category')
            .setDesc('Filter by category')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'All Categories');
                dropdown.addOption('single-entity', 'Single Entity');
                dropdown.addOption('entity-set', 'Entity Set');
                dropdown.addOption('full-world', 'Full World');
                dropdown.setValue('');
                dropdown.onChange(value => {
                    this.filter.category = value ? [value as TemplateCategory] : undefined;
                    this.refreshAndDisplay();
                });
            });

        // Show built-in / custom toggles
        new Setting(filterContainer)
            .setName('Show Built-in Templates')
            .addToggle(toggle => toggle
                .setValue(this.filter.showBuiltIn !== false)
                .onChange(value => {
                    this.filter.showBuiltIn = value;
                    this.refreshAndDisplay();
                })
            );

        new Setting(filterContainer)
            .setName('Show Custom Templates')
            .addToggle(toggle => toggle
                .setValue(this.filter.showCustom !== false)
                .onChange(value => {
                    this.filter.showCustom = value;
                    this.refreshAndDisplay();
                })
            );

        // Sort options
        new Setting(filterContainer)
            .setName('Sort By')
            .setDesc('Sort templates')
            .addDropdown(dropdown => {
                dropdown.addOption('name', 'Name');
                dropdown.addOption('usage', 'Usage Count');
                dropdown.addOption('recent', 'Recently Used');
                dropdown.setValue('name');
                dropdown.onChange(value => {
                    this.filter.sortByUsage = value === 'usage';
                    this.filter.sortByRecent = value === 'recent';
                    this.refreshAndDisplay();
                });
            });
    }

    private createTemplateList(container: HTMLElement): void {
        const listContainer = container.createDiv({ cls: 'template-library-list' });

        if (this.templates.length === 0) {
            listContainer.createEl('p', {
                text: 'No templates found. Try adjusting your filters or create a new template.',
                cls: 'template-library-empty'
            });
            return;
        }

        // Display template count
        listContainer.createEl('p', {
            text: `Found ${this.templates.length} template${this.templates.length !== 1 ? 's' : ''}`,
            cls: 'template-library-count'
        });

        // Create template cards
        this.templates.forEach(template => {
            this.createTemplateCard(listContainer, template);
        });
    }

    private createTemplateCard(container: HTMLElement, template: Template): void {
        const card = container.createDiv({ cls: 'template-card' });

        // Header
        const header = card.createDiv({ cls: 'template-card-header' });
        header.createEl('h3', { text: template.name });

        if (template.isBuiltIn) {
            header.createEl('span', { text: 'Built-in', cls: 'template-badge template-badge-builtin' });
        }

        // Description
        card.createEl('p', { text: template.description, cls: 'template-card-description' });

        // Metadata
        const meta = card.createDiv({ cls: 'template-card-meta' });
        meta.createEl('span', { text: `Genre: ${template.genre}` });
        meta.createEl('span', { text: `Category: ${template.category}` });

        if (template.usageCount && template.usageCount > 0) {
            meta.createEl('span', { text: `Used: ${template.usageCount} times` });
        }

        // Entity types
        if (template.entityTypes && template.entityTypes.length > 0) {
            const entityTypesEl = card.createDiv({ cls: 'template-card-entity-types' });
            entityTypesEl.createEl('span', { text: 'Contains: ' });
            template.entityTypes.forEach(type => {
                entityTypesEl.createEl('span', {
                    text: type,
                    cls: 'template-entity-type-badge'
                });
            });
        }

        // Tags
        if (template.tags && template.tags.length > 0) {
            const tagsEl = card.createDiv({ cls: 'template-card-tags' });
            template.tags.forEach(tag => {
                tagsEl.createEl('span', { text: tag, cls: 'template-tag' });
            });
        }

        // Actions
        const actions = card.createDiv({ cls: 'template-card-actions' });

        const useButton = actions.createEl('button', { text: 'Use Template', cls: 'mod-cta' });
        useButton.addEventListener('click', () => this.handleUseTemplate(template));

        if (template.isEditable) {
            const editButton = actions.createEl('button', { text: 'Edit' });
            editButton.addEventListener('click', () => this.handleEditTemplate(template));

            const deleteButton = actions.createEl('button', { text: 'Delete', cls: 'mod-warning' });
            deleteButton.addEventListener('click', () => this.handleDeleteTemplate(template));
        }

        const duplicateButton = actions.createEl('button', { text: 'Duplicate' });
        duplicateButton.addEventListener('click', () => this.handleDuplicateTemplate(template));
    }

    private refreshAndDisplay(): void {
        this.refreshTemplates();
        this.displayContent();
    }

    private handleUseTemplate(template: Template): void {
        if (this.onTemplateSelected) {
            this.onTemplateSelected(template);
            this.close();
        } else {
            new Notice('Template selected. Apply this template from the entity creation modal.');
            this.close();
        }
    }

    private handleEditTemplate(template: Template): void {
        new TemplateEditorModal(
            this.app,
            this.plugin,
            async (updatedTemplate) => {
                this.refreshAndDisplay();
            },
            template
        ).open();
    }

    private async handleDeleteTemplate(template: Template): Promise<void> {
        const confirmed = await this.confirmDelete(template.name);
        if (confirmed) {
            try {
                await this.plugin.templateManager.deleteTemplate(template.id);
                this.refreshAndDisplay();
            } catch (error) {
                console.error('Error deleting template:', error);
                new Notice(`Failed to delete template: ${error.message}`);
            }
        }
    }

    private async handleDuplicateTemplate(template: Template): Promise<void> {
        try {
            const newName = `${template.name} (Copy)`;
            const duplicate = await this.plugin.templateManager.copyTemplate(
                template.id,
                newName
            );
            new Notice(`Template duplicated as "${newName}"`);
            this.refreshAndDisplay();
        } catch (error) {
            console.error('Error duplicating template:', error);
            new Notice(`Failed to duplicate template: ${error.message}`);
        }
    }

    private handleCreateNew(): void {
        new TemplateEditorModal(
            this.app,
            this.plugin,
            async (newTemplate) => {
                this.refreshAndDisplay();
            }
        ).open();
    }

    private async confirmDelete(templateName: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new ConfirmDeleteModal(this.app, templateName, resolve);
            modal.open();
        });
    }
}

/**
 * Confirmation modal for template deletion
 */
class ConfirmDeleteModal extends ResponsiveModal {
    private templateName: string;
    private onConfirm: (confirmed: boolean) => void;

    constructor(app: App, templateName: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.templateName = templateName;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        super.onOpen();
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Delete Template?' });
        contentEl.createEl('p', {
            text: `Are you sure you want to delete the template "${this.templateName}"? This action cannot be undone.`
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => {
            this.onConfirm(false);
            this.close();
        });

        const deleteButton = buttonContainer.createEl('button', {
            text: 'Delete',
            cls: 'mod-warning'
        });
        deleteButton.addEventListener('click', () => {
            this.onConfirm(true);
            this.close();
        });
    }
}
